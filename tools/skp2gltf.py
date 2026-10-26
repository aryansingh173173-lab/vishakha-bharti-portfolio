"""Convert a SketchUp model (.skp) to glTF, using the SketchUp C API that ships with SketchUp.

Usage:  python -I tools/skp2gltf.py "model.skp" out_dir/name

No SketchUp window is opened. Walks every visible face (through groups and components, applying
their transforms and inherited materials), triangulates it, keeps materials and textures, and
writes name.gltf + name.bin + textures. Units become metres, Z-up becomes Y-up. Hidden objects and
hidden tags are skipped; edges (SketchUp's drawn lines) are not exported.
Then optimise with gltf-transform (see README).
"""
import ctypes as C
import json
import math
import os
import re
import struct
import sys
from pathlib import Path

SU_DIR = r"C:\Program Files\SketchUp\SketchUp 2026\SketchUp"
INCH = 0.0254
# 3D Warehouse entourage (named components): left out, the website has its own planting
ENTOURAGE = re.compile(r"tree|palm|plant|bush|flower|creeper|shrub|hedge|grass|fern|person|people|\bman\b|woman|child|car\b|vehicle", re.I)


class Ref(C.Structure):
    _fields_ = [("ptr", C.c_void_p)]


class P3(C.Structure):
    _fields_ = [("x", C.c_double), ("y", C.c_double), ("z", C.c_double)]


class Xf(C.Structure):
    _fields_ = [("v", C.c_double * 16)]


class Color(C.Structure):
    _fields_ = [("r", C.c_ubyte), ("g", C.c_ubyte), ("b", C.c_ubyte), ("a", C.c_ubyte)]


os.add_dll_directory(SU_DIR)
api = C.CDLL(os.path.join(SU_DIR, "SketchUpAPI.dll"))
for fn in ["SUFaceToDrawingElement", "SUGroupToDrawingElement", "SUComponentInstanceToDrawingElement",
           "SUFaceToEntity", "SUMaterialToEntity"]:
    getattr(api, fn).restype = Ref
    getattr(api, fn).argtypes = [Ref]


def ok(r, what):
    if r != 0:
        raise RuntimeError(f"{what} failed ({r})")


def su_string(getter, ref):
    s = Ref()
    api.SUStringCreate(C.byref(s))
    getter(ref, C.byref(s))
    n = C.c_size_t()
    api.SUStringGetUTF8Length(s, C.byref(n))
    buf = C.create_string_buffer(n.value + 1)
    out = C.c_size_t()
    api.SUStringGetUTF8(s, n.value + 1, buf, C.byref(out))
    api.SUStringRelease(C.byref(s))
    return buf.value.decode("utf-8", "replace")


def items(count_fn, get_fn, parent):
    n = C.c_size_t()
    count_fn(parent, C.byref(n))
    if not n.value:
        return []
    arr = (Ref * n.value)()
    got = C.c_size_t()
    get_fn(parent, n.value, arr, C.byref(got))
    return list(arr[: got.value])


def mul(a, b):  # 4x4 column-major
    r = [0.0] * 16
    for c in range(4):
        for row in range(4):
            r[c * 4 + row] = sum(a[k * 4 + row] * b[c * 4 + k] for k in range(4))
    return r


IDENT = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def visible(de):
    hidden = C.c_bool(False)
    api.SUDrawingElementGetHidden(de, C.byref(hidden))
    if hidden.value:
        return False
    layer = Ref()
    if api.SUDrawingElementGetLayer(de, C.byref(layer)) == 0 and layer.ptr:
        vis = C.c_bool(True)
        api.SULayerGetVisibility(layer, C.byref(vis))
        if not vis.value:
            return False
    return True


def material_of(de):
    m = Ref()
    if api.SUDrawingElementGetMaterial(de, C.byref(m)) == 0 and m.ptr:
        return m
    return None


def main():
    src, out = sys.argv[1], Path(sys.argv[2])
    out.parent.mkdir(parents=True, exist_ok=True)
    api.SUInitialize()
    model = Ref()
    status = C.c_int()
    ok(api.SUModelCreateFromFileWithStatus(C.byref(model), src.encode("utf-8"), C.byref(status)), "open")
    writer = Ref()
    ok(api.SUTextureWriterCreate(C.byref(writer)), "texture writer")

    groups = {}            # key -> {pos, nor, uv, idx, mat, tex}
    mats = {}              # material ptr -> info
    stats = {}             # top-level definition/group name -> triangles
    boxes = {}             # top-level name -> [minx, miny, minz, maxx, maxy, maxz] (metres, Y-up)
    current = [None]

    def mat_info(m):
        if m is None:
            return None
        if m.ptr in mats:
            return mats[m.ptr]
        name = su_string(api.SUMaterialGetName, m)
        col = Color()
        api.SUMaterialGetColor(m, C.byref(col))
        use_op = C.c_bool(False)
        api.SUMaterialGetUseOpacity(m, C.byref(use_op))
        op = C.c_double(1.0)
        api.SUMaterialGetOpacity(m, C.byref(op))
        tex = Ref()
        has_tex = api.SUMaterialGetTexture(m, C.byref(tex)) == 0 and bool(tex.ptr)
        info = {"name": name, "color": (col.r, col.g, col.b), "opacity": op.value if use_op.value else 1.0,
                "tex": tex if has_tex else None, "ref": m}
        if has_tex:
            w, h, ss, ts = C.c_size_t(), C.c_size_t(), C.c_double(), C.c_double()
            api.SUTextureGetDimensions(tex, C.byref(w), C.byref(h), C.byref(ss), C.byref(ts))
            info["scale"] = (ss.value, ts.value)
        mats[m.ptr] = info
        return info

    def bucket(info, tex_id):
        key = (info["ref"].ptr if info else None, tex_id)
        if key not in groups:
            groups[key] = {"pos": [], "nor": [], "uv": [], "idx": [], "mat": info, "tex": tex_id}
        return groups[key]

    def add_face(face, xf, inherited, tag):
        de = api.SUFaceToDrawingElement(face)
        if not visible(de):
            return 0
        front, back = Ref(), Ref()
        api.SUFaceGetFrontMaterial(face, C.byref(front))
        api.SUFaceGetBackMaterial(face, C.byref(back))
        use_back = not front.ptr and bool(back.ptr)
        own = front if front.ptr else (back if back.ptr else None)
        info = mat_info(own) if own is not None else inherited
        tex_id = None
        mesh = Ref()
        if own is not None and info and info["tex"] is not None:
            fid, bid = C.c_long(0), C.c_long(0)
            api.SUTextureWriterLoadFace(writer, face, C.byref(fid), C.byref(bid))
            tex_id = bid.value if use_back else fid.value
            ok(api.SUMeshHelperCreateWithTextureWriter(C.byref(mesh), face, writer), "mesh")
        else:
            ok(api.SUMeshHelperCreate(C.byref(mesh), face), "mesh")
            if info and info["tex"] is not None:
                tex_id = ("inherit", info["ref"].ptr)
        nv, nt = C.c_size_t(), C.c_size_t()
        api.SUMeshHelperGetNumVertices(mesh, C.byref(nv))
        api.SUMeshHelperGetNumTriangles(mesh, C.byref(nt))
        if not nv.value or not nt.value:
            api.SUMeshHelperRelease(C.byref(mesh))
            return 0
        pts, nors, stq = (P3 * nv.value)(), (P3 * nv.value)(), (P3 * nv.value)()
        got = C.c_size_t()
        api.SUMeshHelperGetVertices(mesh, nv.value, pts, C.byref(got))
        api.SUMeshHelperGetNormals(mesh, nv.value, nors, C.byref(got))
        (api.SUMeshHelperGetBackSTQCoords if use_back else api.SUMeshHelperGetFrontSTQCoords)(mesh, nv.value, stq, C.byref(got))
        idx = (C.c_size_t * (nt.value * 3))()
        api.SUMeshHelperGetVertexIndices(mesh, nt.value * 3, idx, C.byref(got))
        api.SUMeshHelperRelease(C.byref(mesh))

        g = bucket(info, tex_id)
        base = len(g["pos"]) // 3
        a = xf
        flip = (a[0] * (a[5] * a[10] - a[9] * a[6]) - a[4] * (a[1] * a[10] - a[9] * a[2]) + a[8] * (a[1] * a[6] - a[5] * a[2])) < 0
        sgn = -1.0 if use_back else 1.0
        for i in range(nv.value):
            p, n, t = pts[i], nors[i], stq[i]
            x = a[0] * p.x + a[4] * p.y + a[8] * p.z + a[12]
            y = a[1] * p.x + a[5] * p.y + a[9] * p.z + a[13]
            z = a[2] * p.x + a[6] * p.y + a[10] * p.z + a[14]
            nx = (a[0] * n.x + a[4] * n.y + a[8] * n.z) * sgn
            ny = (a[1] * n.x + a[5] * n.y + a[9] * n.z) * sgn
            nz = (a[2] * n.x + a[6] * n.y + a[10] * n.z) * sgn
            ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            # SketchUp Z-up inches -> glTF Y-up metres
            g["pos"] += [x * INCH, z * INCH, -y * INCH]
            b = boxes.setdefault(current[0], [1e9, 1e9, 1e9, -1e9, -1e9, -1e9])
            for k, val in enumerate((x * INCH, z * INCH, -y * INCH)):
                b[k] = min(b[k], val)
                b[k + 3] = max(b[k + 3], val)
            g["nor"] += [nx / ln, nz / ln, -ny / ln]
            q = t.z if t.z else 1.0
            u, v = t.x / q, t.y / q
            if isinstance(tex_id, tuple):
                ss, ts = info["scale"]
                u, v = u * ss, v * ts
            g["uv"] += [u, 1.0 - v]
        tris = list(idx[: nt.value * 3])
        for k in range(0, len(tris), 3):
            i0, i1, i2 = tris[k], tris[k + 1], tris[k + 2]
            if flip ^ use_back:
                i1, i2 = i2, i1
            g["idx"] += [base + i0, base + i1, base + i2]
        return nt.value

    def walk(ents, xf, inherited, tag, depth):
        tris = 0
        for f in items(api.SUEntitiesGetNumFaces, api.SUEntitiesGetFaces, ents):
            if depth == 0:
                current[0] = "[loose faces]"
            tris += add_face(f, xf, inherited, tag)
        for grp in items(api.SUEntitiesGetNumGroups, api.SUEntitiesGetGroups, ents):
            de = api.SUGroupToDrawingElement(grp)
            if not visible(de):
                continue
            t = Xf()
            api.SUGroupGetTransform(grp, C.byref(t))
            sub = Ref()
            api.SUGroupGetEntities(grp, C.byref(sub))
            m = material_of(de)
            name = su_string(api.SUGroupGetName, grp) or "group"
            if depth == 0:
                current[0] = f"[group] {name}"
            n = walk(sub, mul(xf, list(t.v)), mat_info(m) if m else inherited, tag or name, depth + 1)
            tris += n
            if depth == 0:
                stats[f"[group] {name}"] = stats.get(f"[group] {name}", 0) + n
        for inst in items(api.SUEntitiesGetNumInstances, api.SUEntitiesGetInstances, ents):
            de = api.SUComponentInstanceToDrawingElement(inst)
            if not visible(de):
                continue
            t = Xf()
            api.SUComponentInstanceGetTransform(inst, C.byref(t))
            d = Ref()
            api.SUComponentInstanceGetDefinition(inst, C.byref(d))
            sub = Ref()
            api.SUComponentDefinitionGetEntities(d, C.byref(sub))
            m = material_of(de)
            name = su_string(api.SUComponentDefinitionGetName, d)
            if ENTOURAGE.search(name):
                continue
            if depth == 0:
                current[0] = name
            n = walk(sub, mul(xf, list(t.v)), mat_info(m) if m else inherited, tag or name, depth + 1)
            tris += n
            if depth == 0:
                stats[name] = stats.get(name, 0) + n
        return tris

    ents = Ref()
    api.SUModelGetEntities(model, C.byref(ents))
    total = walk(ents, IDENT, None, None, 0)
    if "--all" not in sys.argv:
        total = keep_largest(groups)
    if "--collapse" in sys.argv:
        collapse_gaps(groups)
    if "--below-gap" in sys.argv:
        total = below_first_gap(groups)

    # ---------- textures
    tex_dir = out.parent / (out.name + "_tex")
    tex_dir.mkdir(exist_ok=True)
    images, tex_index = [], {}
    for key, g in groups.items():
        tid = g["tex"]
        if tid is None or tid in tex_index or not g["idx"]:
            continue
        fname = f"t{len(images)}.png"
        path = str(tex_dir / fname).encode("utf-8")
        if isinstance(tid, tuple):
            r = api.SUTextureWriteToFile(g["mat"]["tex"], path)
        else:
            r = api.SUTextureWriterWriteTexture(writer, C.c_long(tid), path, C.c_bool(False))
        if r == 0 and (tex_dir / fname).exists():
            tex_index[tid] = len(images)
            images.append(f"{out.name}_tex/{fname}")

    # ---------- glTF
    bin_parts, views, accessors, meshes, materials, nodes = [], [], [], [], [], []
    offset = 0
    mat_index = {}

    def add_view(data, target):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        offset += len(data) + pad
        return len(views) - 1

    textures, samplers = [], [{"wrapS": 10497, "wrapT": 10497}]
    for key, g in groups.items():
        if not g["idx"]:
            continue
        info, tid = g["mat"], g["tex"]
        mkey = (info["ref"].ptr if info else None, tid)
        if mkey not in mat_index:
            if info:
                r, gg, b = (c / 255 for c in info["color"])
                textured = tid in tex_index
                mat = {"name": info["name"], "doubleSided": True,
                       "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, info["opacity"]] if textured else [srgb(r), srgb(gg), srgb(b), info["opacity"]],
                                                "metallicFactor": 0, "roughnessFactor": 0.85}}
                if textured:
                    textures.append({"source": tex_index[tid], "sampler": 0})
                    mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(textures) - 1}
                if info["opacity"] < 0.99:
                    mat["alphaMode"] = "BLEND"
            else:
                mat = {"name": "default", "doubleSided": True,
                       "pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.78, 0.74, 1], "metallicFactor": 0, "roughnessFactor": 0.9}}
            materials.append(mat)
            mat_index[mkey] = len(materials) - 1
        # Join corners shared between faces (same position, and same UV when textured) so the mesh
        # is connected and can be simplified. No normals: three.js shades it flat, as SketchUp does.
        textured = tid in tex_index
        weld, pos, uv, idx = {}, [], [], []
        for i in g["idx"]:
            p = g["pos"][i * 3:i * 3 + 3]
            t = g["uv"][i * 2:i * 2 + 2] if textured else []
            key = (round(p[0], 3), round(p[1], 3), round(p[2], 3), *(round(c, 4) for c in t))
            if key not in weld:
                weld[key] = len(pos) // 3
                pos += p
                uv += t
            idx.append(weld[key])
        nv = len(pos) // 3
        mins = [min(pos[i::3]) for i in range(3)]
        maxs = [max(pos[i::3]) for i in range(3)]
        attrs = {"POSITION": len(accessors)}
        accessors.append({"bufferView": add_view(struct.pack(f"{len(pos)}f", *pos), 34962), "componentType": 5126, "count": nv, "type": "VEC3", "min": mins, "max": maxs})
        if textured:
            attrs["TEXCOORD_0"] = len(accessors)
            accessors.append({"bufferView": add_view(struct.pack(f"{len(uv)}f", *uv), 34962), "componentType": 5126, "count": nv, "type": "VEC2"})
        accessors.append({"bufferView": add_view(struct.pack(f"{len(idx)}I", *idx), 34963), "componentType": 5125, "count": len(idx), "type": "SCALAR"})
        meshes.append({"primitives": [{"attributes": attrs, "indices": len(accessors) - 1, "material": mat_index[mkey]}]})
        nodes.append({"mesh": len(meshes) - 1, "name": (info["name"] if info else "default")})

    bin_name = out.name + ".bin"
    (out.parent / bin_name).write_bytes(b"".join(bin_parts))
    gltf = {"asset": {"version": "2.0", "generator": "skp2gltf"}, "scene": 0,
            "scenes": [{"nodes": [len(nodes)]}],
            "nodes": nodes + [{"name": Path(src).stem, "children": list(range(len(nodes)))}],
            "meshes": meshes, "materials": materials, "accessors": accessors, "bufferViews": views,
            "buffers": [{"uri": bin_name, "byteLength": offset}]}
    if images:
        gltf["images"] = [{"uri": u} for u in images]
        gltf["textures"] = textures
        gltf["samplers"] = samplers
    (out.parent / (out.name + ".gltf")).write_text(json.dumps(gltf))

    allpos = [g["pos"] for g in groups.values() if g["pos"]]
    lo = [min(min(p[i::3]) for p in allpos) for i in range(3)]
    hi = [max(max(p[i::3]) for p in allpos) for i in range(3)]
    print(f"{Path(src).name}: {total} triangles, {len(materials)} materials, {len(images)} textures")
    print("  size (m) x/y/z:", [round(hi[i] - lo[i], 1) for i in range(3)], "min:", [round(v, 1) for v in lo])
    for name, b in sorted(boxes.items(), key=lambda kv: -stats.get(kv[0], 0))[:22]:
        print(f"  {stats.get(name, 0):>8} tris  x {b[0]:7.1f}..{b[3]:7.1f}  z {b[2]:7.1f}..{b[5]:7.1f}  y {b[1]:5.1f}..{b[4]:5.1f}  {name}")
    api.SUTextureWriterRelease(C.byref(writer))
    api.SUModelRelease(C.byref(model))
    api.SUTerminate()


def keep_largest(groups, cell=4.0):
    """Models often hold several copies or versions side by side. Keep the biggest connected
    cluster of geometry (in plan, on a 4 m grid) and move it to the origin, standing on y = 0."""
    count = {}
    for g in groups.values():
        p, idx = g["pos"], g["idx"]
        for k in range(0, len(idx), 3):
            i = idx[k] * 3
            c = (int(p[i] // cell), int(p[i + 2] // cell))
            count[c] = count.get(c, 0) + 1
    seen, best = set(), set()
    for start in count:
        if start in seen:
            continue
        stack, cells = [start], []
        seen.add(start)
        while stack:
            c = stack.pop()
            cells.append(c)
            for dx in (-2, -1, 0, 1, 2):
                for dz in (-2, -1, 0, 1, 2):
                    n = (c[0] + dx, c[1] + dz)
                    if n in count and n not in seen:
                        seen.add(n)
                        stack.append(n)
        if sum(count[c] for c in cells) > sum(count[c] for c in best):
            best = set(cells)
    lo, hi = [1e9] * 3, [-1e9] * 3
    total = 0
    for g in groups.values():
        p, idx = g["pos"], g["idx"]
        keep = []
        for k in range(0, len(idx), 3):
            i = idx[k] * 3
            if (int(p[i] // cell), int(p[i + 2] // cell)) in best:
                keep += idx[k:k + 3]
        used = sorted(set(keep))
        remap = {old: new for new, old in enumerate(used)}
        g["idx"] = [remap[i] for i in keep]
        for key, n in (("pos", 3), ("nor", 3), ("uv", 2)):
            g[key] = [v for i in used for v in g[key][i * n:i * n + n]]
        for i in range(0, len(g["pos"]), 3):
            for a in range(3):
                lo[a] = min(lo[a], g["pos"][i + a])
                hi[a] = max(hi[a], g["pos"][i + a])
        total += len(g["idx"]) // 3
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    for g in groups.values():
        p = g["pos"]
        for i in range(0, len(p), 3):
            p[i] -= cx
            p[i + 1] -= lo[1]
            p[i + 2] -= cz
    return total


def find_gaps(groups, bin_m=1.0, min_gap=2):
    """Empty horizontal bands (2 m or more with almost no triangles) above ground level."""
    hist = {}
    for g in groups.values():
        p, idx = g["pos"], g["idx"]
        for k in range(0, len(idx), 3):
            y = (p[idx[k] * 3 + 1] + p[idx[k + 1] * 3 + 1] + p[idx[k + 2] * 3 + 1]) / 3
            hist[int(y // bin_m)] = hist.get(int(y // bin_m), 0) + 1
    limit = max(60, sum(hist.values()) * 0.0004)
    gaps, run = [], []
    for b in range(2, max(hist) + 2):
        if hist.get(b, 0) < limit:
            run.append(b)
        else:
            if len(run) >= min_gap:
                gaps.append((run[0] * bin_m, (run[-1] + 1) * bin_m))
            run = []
    return gaps


def below_first_gap(groups):
    """An exploded view with lifted layers: keep only the building below the first empty band."""
    gaps = find_gaps(groups)
    if not gaps:
        return sum(len(g["idx"]) // 3 for g in groups.values())
    cut = gaps[0][0]
    print(f"  keeping everything below {cut:.1f} m (lifted layers above are left out)")
    total = 0
    for g in groups.values():
        p, idx = g["pos"], g["idx"]
        g["idx"] = [i for k in range(0, len(idx), 3)
                    if (p[idx[k] * 3 + 1] + p[idx[k + 1] * 3 + 1] + p[idx[k + 2] * 3 + 1]) / 3 < cut
                    for i in idx[k:k + 3]]
        total += len(g["idx"]) // 3
    return total


def collapse_gaps(groups):
    """Reassemble an exploded view: lower everything above each empty band by the band's
    height, so the lifted layers sit back down (works when the layers were only moved up)."""
    gaps = find_gaps(groups)
    print("  closing gaps (m):", [(round(a, 1), round(b, 1)) for a, b in gaps])
    for g in groups.values():
        p = g["pos"]
        for i in range(1, len(p), 3):
            y = p[i]
            p[i] = y - sum((b - a) if y >= b else max(0.0, y - a) for a, b in gaps)


def srgb(c):  # SketchUp colours are sRGB; glTF factors are linear
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


if __name__ == "__main__":
    main()
