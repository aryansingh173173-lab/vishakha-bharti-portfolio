// The cove's planting and rock: realistic scanned models from Poly Haven (shrubs, tropical plants,
// pachira trees, boulders, rocky shelves, cliffs), instanced so hundreds cost a few draw calls.
// Palms are procedural unless a palm model is supplied (assets/models/models.json).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, inland, shoreZ, greenness } from './terrain.js';
import { leafTexture, glowTexture, rng } from './textures.js';
import { instancesFromModel } from './models.js';

const UP = new THREE.Vector3(0, 1, 0);
export const NO_REFLECTION = 1; // layer for things the water mirror skips (dense planting)

function palmParts(seed) {
  const r = rng(seed);
  const H = 8 + r() * 4;
  const lean = 0.8 + r() * 1.8;
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(lean * t * t * 1.4, t * H, 0));
  }
  const trunk = [];
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = b.clone().sub(a);
    const len = dir.length();
    const rBot = 0.26 - 0.1 * (i / N);
    const g = new THREE.CylinderGeometry(rBot * 0.92, rBot, len * 1.01, 10, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    trunk.push(g);
  }
  const top = pts[N];
  const fronds = [];
  const count = 14 + Math.floor(r() * 4);
  for (let i = 0; i < count; i++) {
    const L = 4 + r() * 1.6;
    const g = new THREE.PlaneGeometry(1.5, L, 1, 10);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, L / 2);
    const p = g.attributes.position;
    const droop = 0.5 + r() * 0.35;
    const lift = 0.25 + r() * 0.5;
    for (let k = 0; k < p.count; k++) {
      const s = p.getZ(k) / L;
      p.setY(k, lift * s * L * 0.5 - droop * s * s * L);
      p.setX(k, p.getX(k) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, s * 1.05))));
      p.setY(k, p.getY(k) - Math.abs(p.getX(k)) * 0.45);
    }
    g.computeVertexNormals();
    g.rotateY((i / count) * Math.PI * 2 + r() * 0.35);
    g.translate(top.x, top.y - 0.1, top.z);
    fronds.push(g);
  }
  return { trunk: mergeGeometries(trunk), fronds: mergeGeometries(fronds) };
}

// A lumpy rock shape (UVs from the sphere, so the scanned rock texture wraps it).
function rockGeometry(seed) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(0.7, 4);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const ox = r() * 10, oy = r() * 10;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + ox) * Math.sin(v.y * 2.7 + oy) * Math.sin(v.z * 3.3 + ox) * 0.18
      + Math.sin(v.x * 9 + oy) * Math.sin(v.z * 8 + ox) * 0.04;
    v.multiplyScalar(1 + n);
    v.y = v.y > 0 ? v.y * 0.85 : v.y * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function grassTuft(seed) {
  const r = rng(seed);
  const pos = [], col = [];
  const base = new THREE.Color('#3f5a26'), tip = new THREE.Color('#9fae68');
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2;
    const h = 0.35 + r() * 0.5;
    const lean = 0.15 + r() * 0.35;
    const w = 0.025;
    const cx = Math.cos(a), cz = Math.sin(a);
    const bx = -cz * w, bz = cx * w;
    pos.push(bx, 0, bz, -bx, 0, -bz, cx * lean * h, h, cz * lean * h);
    col.push(...base.toArray(), ...base.toArray(), ...tip.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Sway for fronds and grass: bend vertices above a height threshold with the wind.
function addSway(mat, uniforms, { from, amount }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        #else
          float ph = 0.0;
        #endif
        float k = max(position.y - ${from.toFixed(2)}, 0.0) * ${amount.toFixed(3)};
        transformed.x += sin(uTime * 1.3 + ph) * k;
        transformed.z += cos(uTime * 1.05 + ph * 1.3) * k * 0.6;`);
  };
}

function scatter(r, { count, x0, x1, d0, d1, accept, minGap = 0 }) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const x = x0 + r() * (x1 - x0);
    const d = d0 + r() * (d1 - d0);
    const z = shoreZ(x) + d;
    if (accept && !accept(x, z)) continue;
    if (minGap && out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minGap * minGap)) continue;
    out.push({ x, z, y: heightAt(x, z) });
  }
  return out;
}

// Spread placements over a set of model variants and add them as instanced meshes.
function plant(group, variants, spots, r, { scale = [0.8, 1.3], sink = 0.05, shadows = false, layer = 0, tilt = 0 } = {}) {
  if (!variants?.length || !spots.length) return;
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const buckets = variants.map(() => []);
  spots.forEach((pt, i) => {
    e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
    q.setFromEuler(e);
    const k = pt.k ?? scale[0] + r() * (scale[1] - scale[0]);
    buckets[i % variants.length].push(new THREE.Matrix4().compose(p.set(pt.x, pt.y - sink * k, pt.z), q, s.setScalar(k)));
  });
  variants.forEach((v, i) => {
    if (!buckets[i].length) return;
    const g = instancesFromModel(v, buckets[i]);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = shadows;
      o.receiveShadow = true;
      if (layer) o.layers.set(layer);
    });
    group.add(g);
  });
}

export function createNature({ tier, avoid, palmSpots = [], kit = {}, models = {} }) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 } };
  const r = rng(42);
  const hi = tier === 'high';
  const ok = (x, z) => !avoid(x, z);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  // ---------- Palms: along the back of the beach and up the hillside
  const palms = [
    ...palmSpots,
    ...scatter(r, { count: hi ? 60 : 36, x0: -90, x1: 420, d0: 24, d1: 44, accept: ok, minGap: 6 }),
    ...scatter(r, { count: hi ? 45 : 22, x0: -120, x1: 460, d0: 44, d1: 110, accept: ok, minGap: 8 }),
  ];
  const palmModel = models.palm ?? kit.palm?.[0];
  if (palmModel) {
    // real palms: scaled to 8–11.5 m (models.json palms are already 9 m; the kit palm is 6.3 m)
    const base = models.palm ? 9 : palmModel.userData.size?.y || 6.3;
    const g = instancesFromModel(palmModel, palms.map((pt) => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.12, r() * Math.PI * 2, (r() - 0.5) * 0.12));
      return new THREE.Matrix4().compose(p.set(pt.x, pt.y - 0.1, pt.z), q, s.setScalar((8 + r() * 3.5) / base));
    }));
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(g);
  } else {
    const variants = [palmParts(3), palmParts(9), palmParts(17), palmParts(23)];
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6f6152', roughness: 0.95 });
    const leaf = leafTexture();
    const frondMat = new THREE.MeshStandardMaterial({ map: leaf, color: '#8fa36c', alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
    addSway(frondMat, uniforms, { from: 6, amount: 0.04 });
    const frondDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.45 });
    const buckets = variants.map(() => []);
    palms.forEach((pt, i) => buckets[i % variants.length].push(pt));
    buckets.forEach((pts, vi) => {
      if (!pts.length) return;
      const v = variants[vi];
      const trunks = new THREE.InstancedMesh(v.trunk, trunkMat, pts.length);
      const fronds = new THREE.InstancedMesh(v.fronds, frondMat, pts.length);
      pts.forEach((pt, i) => {
        q.setFromAxisAngle(UP, r() * Math.PI * 2);
        m4.compose(p.set(pt.x, pt.y - 0.2, pt.z), q, s.setScalar(0.85 + r() * 0.35));
        trunks.setMatrixAt(i, m4);
        fronds.setMatrixAt(i, m4);
      });
      for (const m of [trunks, fronds]) { m.castShadow = true; m.receiveShadow = true; }
      fronds.customDepthMaterial = frondDepth;
      group.add(trunks, fronds);
    });
  }

  // ---------- Shrubs over the hillside, tropical understorey at the back of the beach
  const hillShrubs = scatter(r, { count: hi ? 190 : 90, x0: -110, x1: 450, d0: 30, d1: 105, accept: (x, z) => ok(x, z) && greenness(x, z) > 0.4, minGap: 2.2 });
  plant(group, [...(kit.shrubA || []), ...(kit.shrubB || []), ...(kit.shrubC || [])], hillShrubs, r, { scale: [1.1, 2.2], layer: NO_REFLECTION });
  const edge = scatter(r, { count: hi ? 150 : 70, x0: -80, x1: 420, d0: 22, d1: 34, accept: ok, minGap: 1.6 });
  plant(group, [...(kit.fern || []), ...(kit.calathea || []), ...(kit.sorrel || [])], edge, r, { scale: [1.6, 3.2], layer: NO_REFLECTION });
  // small curly palms along the back of the beach
  const smallPalms = scatter(r, { count: hi ? 70 : 36, x0: -70, x1: 420, d0: 21, d1: 36, accept: ok, minGap: 4 });
  plant(group, kit.palmSmall, smallPalms, r, { scale: [1.3, 2.1], shadows: true, sink: 0 });
  // (the pachira model is a short row of trees, ~7 m long, so its canopy reaches far)
  const trees = scatter(r, { count: hi ? 26 : 14, x0: -70, x1: 410, d0: 36, d1: 64, accept: ok, minGap: 12 });
  plant(group, kit.pachira, trees, r, { scale: [1.6, 2.2], shadows: true });

  // ---------- Rock: boulders at the hill foot, shelves in the surf, cliffs where the hills meet the sea
  // (their own group: the sea's height map is baked from the ground and these, not the foliage)
  const rocks = new THREE.Group();
  group.add(rocks);
  const boulders = [];
  for (let x = -60; x < 420; x += 18 + r() * 16) {
    for (let k = 0; k < 3; k++) {
      const bx = x + (r() - 0.5) * 10;
      const bz = shoreZ(bx) + 29 + r() * 9;
      if (!avoid(bx, bz)) boulders.push({ x: bx, z: bz, y: heightAt(bx, bz), k: 0.8 + r() * 2.2 });
    }
  }
  // the scanned boulder is too dense to repeat, so its real rock material goes on light rock shapes
  let rockMat = null;
  kit.boulder?.[0].traverse((o) => { if (o.isMesh && !rockMat) rockMat = o.material; });
  rockMat ??= new THREE.MeshStandardMaterial({ color: '#7a6656', roughness: 0.9 });
  const rockGeos = [rockGeometry(2), rockGeometry(5), rockGeometry(13)];
  rockGeos.forEach((geo, vi) => {
    const list = boulders.filter((_, i) => i % rockGeos.length === vi);
    const im = new THREE.InstancedMesh(geo, rockMat, list.length);
    list.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5));
      s.set(b.k * (0.9 + r() * 0.5), b.k * (0.6 + r() * 0.4), b.k * (0.9 + r() * 0.5));
      m4.compose(p.set(b.x, b.y - b.k * 0.15, b.z), q, s);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    rocks.add(im);
  });
  const shelves = [[78, -9], [152, -11], [222, -8], [290, -10]].map(([x, d]) => ({ x, z: shoreZ(x) + d, y: -0.6, k: 0.35 + r() * 0.15 }));
  plant(rocks, kit.coastRocks, shelves, r, { sink: 0, shadows: false });
  // driftwood washed up on the wet sand
  const logs = scatter(r, { count: hi ? 9 : 5, x0: -40, x1: 400, d0: 1.5, d1: 6, accept: ok, minGap: 28 });
  plant(rocks, kit.driftwood, logs, r, { scale: [1.4, 2.1], sink: 0.04, shadows: true });
  // cliffs rise out of the sea where the headlands close the cove
  const cliffs = [
    { x: -150, d: -4, k: 2.4, ry: 1.2 }, { x: -118, d: 2, k: 2.0, ry: 0.5 },
    { x: 470, d: -4, k: 2.4, ry: -1.1 }, { x: 438, d: 3, k: 2.0, ry: -0.4 },
  ];
  if (kit.cliff) {
    const mats = cliffs.map((c) => {
      const z = shoreZ(c.x) + c.d;
      return new THREE.Matrix4().compose(p.set(c.x, Math.min(heightAt(c.x, z), 0) - 4, z), q.setFromAxisAngle(UP, c.ry), s.setScalar(c.k));
    });
    rocks.add(instancesFromModel(kit.cliff[0], mats));
  }

  // ---------- Grass tufts where the sand meets the green
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  addSway(grassMat, uniforms, { from: 0.15, amount: 0.1 });
  const tufts = scatter(r, { count: hi ? 1600 : 700, x0: -100, x1: 440, d0: 20, d1: 70, accept: (x, z) => ok(x, z) && greenness(x, z) > 0.05 });
  const grass = new THREE.InstancedMesh(grassTuft(4), grassMat, tufts.length);
  tufts.forEach((pt, i) => {
    q.setFromAxisAngle(UP, r() * 6.28);
    m4.compose(p.set(pt.x, pt.y - 0.05, pt.z), q, s.setScalar(0.8 + r() * 1.1));
    grass.setMatrixAt(i, m4);
  });
  grass.receiveShadow = true;
  grass.layers.set(NO_REFLECTION);
  group.add(grass);

  // ---------- A few fireflies drifting over the greenery at dusk
  const ffCount = hi ? 160 : 80;
  const ffPos = new Float32Array(ffCount * 3);
  const ffSeed = new Float32Array(ffCount);
  for (let i = 0; i < ffCount; i++) {
    const x = -60 + r() * 460;
    const z = shoreZ(x) + 20 + r() * 34;
    ffPos.set([x, heightAt(x, z) + 0.6 + r() * 2.5, z], i * 3);
    ffSeed[i] = r() * 100;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('seed', new THREE.BufferAttribute(ffSeed, 1));
  const ffMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: uniforms.uTime, uMap: { value: glowTexture() }, uScale: { value: innerHeight * 0.5 } },
    vertexShader: /* glsl */`
      attribute float seed;
      uniform float uTime;
      uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.35 + seed) * 1.6;
        p.y += sin(uTime * 0.7 + seed * 1.7) * 0.6;
        p.z += cos(uTime * 0.3 + seed * 0.7) * 1.6;
        vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * 2.2 + seed * 3.1), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.4 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.55) * 4.5, t.a * vA);
      }`,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  fireflies.layers.set(NO_REFLECTION);
  group.add(fireflies);

  return {
    group,
    rocks,
    update(t) { uniforms.uTime.value = t; },
    resize() { ffMat.uniforms.uScale.value = innerHeight * 0.5; },
  };
}

export { inland };
