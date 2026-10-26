// Exhibition architecture. Every project gets a pavilion in its own architectural language, all
// sharing one layout so the camera and the images work the same way at each stop:
//   01 Thendral Marabu      coastal vernacular: laterite plinth, lime plaster, timber posts, clay-tile hip roof, brass diyas
//   02 Banglar Shilpo Ghar  Bengal terracotta: exposed brick, folded skyline, perforated brick jaali, white lattice canopy
//   03 Sanskriti Milon K.   brutalist: board-formed concrete, deep waffle slab, cantilever, curved shell, timber louvres
//   04 Selected Works       modern residential: white stucco, thin flat roof on steel posts, timber slat screen
// The images are Vishakha's own work, shown in true colour. Pavilions drop onto the sand as the
// buggy approaches, scrubbed by the scroll position.
import * as THREE from 'three';
import { heightAt, shoreZ } from './terrain.js';
import { STOP_X } from './path.js';
import { pbr, metricBox } from './assets.js';
import { TRUE_COLOR_GLSL } from './grade.js';
import { instancesFromModel } from './models.js';
import { jaaliTexture, latticeTexture, glowTexture, labelTexture, rectGlowTexture } from './textures.js';

const FLOOR = 0.6;
const PAVILION_SCALE = 1.28;
const HERO = { w: 10.4, h: 6.7 };
const SIDE = { w: 5.6, h: 3.8 };

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent?.add(m);
  return m;
}

// Fit an image into a panel by cropping its centre (like object-fit: cover).
function coverTexture(tex, w, h) {
  const ia = tex.image.width / tex.image.height;
  const fa = w / h;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  if (ia > fa) { tex.repeat.x = fa / ia; tex.offset.x = (1 - tex.repeat.x) / 2; }
  else { tex.repeat.y = ia / fa; tex.offset.y = (1 - tex.repeat.y) / 2; }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
}

// One of her images: shown in true colour (pre-corrected for tone mapping and the grade), in a thin
// glowing frame with a soft halo on the wall; a band of light can sweep across it.
let haloTex = null;
function imagePanel(tex, w, h, ctx) {
  const g = new THREE.Group();
  const glow = ctx.glow ?? 1;
  const uniforms = { uSheen: { value: -1 }, uBright: { value: Math.pow(ctx.bright ?? 1, 2.2) }, ...ctx.display };
  const mat = new THREE.MeshBasicMaterial({ color: '#d8cbb8', toneMapped: false, fog: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPanelUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vPanelUv = uv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPanelUv;
        uniform float uSheen;
        uniform float uBright;
        ${TRUE_COLOR_GLSL}`)
      .replace('#include <opaque_fragment>', `
        float diag = vPanelUv.x * 0.8 + vPanelUv.y * 0.45;
        float band = exp(-pow((diag - uSheen) * 9.0, 2.0));
        outgoingLight = gTrueColor(outgoingLight * uBright, vec3(1.0, 0.93, 0.82) * band * 0.45);
        #include <opaque_fragment>`);
  };
  const img = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  img.position.z = 0.06;
  g.add(img);
  haloTex ??= rectGlowTexture();
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: '#ffb877', transparent: true, opacity: 0.2 * glow, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, h * 1.5), haloMat);
  halo.position.z = 0.02;
  g.add(halo);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#f6eadb', emissive: '#ffb36b', emissiveIntensity: 1 });
  const t = 0.08;
  for (const [fw, fh, x, y] of [[w + t * 2, t, 0, h / 2 + t / 2], [w + t * 2, t, 0, -h / 2 - t / 2], [t, h, -w / 2 - t / 2, 0], [t, h, w / 2 + t / 2, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.08), frameMat);
    f.position.set(x, y, 0.07);
    g.add(f);
  }
  if (tex) {
    const c = tex.clone();
    coverTexture(c, w, h);
    mat.map = c;
    mat.color.set('#ffffff');
  }
  ctx.panels.push({ uniforms, haloMat, frameMat, glow });
  ctx.picks.push(img);
  return g;
}

function lectern(M, tex, x, z, parent) {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), M.darkTimber, 0, 0.5, 0, g);
  const plate = new THREE.Group();
  plate.position.set(0, 1.08, 0);
  plate.rotation.x = -0.75;
  mesh(new THREE.BoxGeometry(2.5, 1.3, 0.08), M.darkTimber, 0, 0, 0, plate);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  face.position.z = 0.05;
  plate.add(face);
  g.add(plate);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

// A warm uplight strip at the foot of a wall; returns its material so the stop can brighten it.
function strip(width, x, y, z, parent, rotY = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffe6c4', emissive: '#ffb064', emissiveIntensity: 1 });
  const m = mesh(new THREE.BoxGeometry(width, 0.05, 0.1), mat, x, y, z, parent);
  m.rotation.y = rotY;
  m.castShadow = false;
  return mat;
}

// ---------- Shared layout: hero image(s) on the back wall, one image on each splayed side wall
function layout(ctx, { backWall, sideWall, heroes, sides }) {
  const { g } = ctx;
  backWall?.(g);
  if (heroes.length === 1) {
    const hp = imagePanel(heroes[0], HERO.w, HERO.h, ctx);
    hp.position.set(0, FLOOR + 0.8 + HERO.h / 2, -5.28);
    g.add(hp);
  } else {
    heroes.forEach((t, i) => {
      const hp = imagePanel(t, 6.1, 4.6, ctx);
      hp.position.set(i ? 3.25 : -3.25, FLOOR + 1.5 + 2.3, -5.28);
      g.add(hp);
    });
  }
  ctx.lights.push(strip(12.6, 0, FLOOR + 0.06, -5.2, g));
  [-1, 1].forEach((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 6.5, 0, -5.6);
    pivot.rotation.y = side * 0.38;
    sideWall(pivot, side);
    if (sides[i]) {
      const sp = imagePanel(sides[i], SIDE.w, SIDE.h, ctx);
      sp.position.set(-side * 0.27, FLOOR + 1.1 + SIDE.h / 2, 3.9);
      sp.rotation.y = -side * Math.PI / 2;
      pivot.add(sp);
    }
    ctx.lights.push(strip(7.2, -side * 0.32, FLOOR + 0.06, 3.8, pivot, Math.PI / 2));
    g.add(pivot);
  });
}

function deck(g, base, top, w = 16.4, d = 12.2) {
  mesh(metricBox(w + 0.6, FLOOR - 0.06, d + 0.6), base, 0, (FLOOR - 0.06) / 2, -1, g);
  mesh(metricBox(w, 0.06, d), top, 0, FLOOR - 0.03, -1, g);
  for (let i = 0; i < 2; i++) mesh(metricBox(7 - i * 0.6, FLOOR / 3, 0.45), base, 0, FLOOR / 6 + (FLOOR / 3) * i, 5.8 - i * 0.45, g);
}

// Square-based hip roof (a stretched four-sided pyramid), tiles projected from above in metres.
function hipRoof(w, d, h, mat) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, h, d);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i) + pos.getY(i) * 0.6);
  return new THREE.Mesh(geo, mat);
}

// ---------- 01 Coastal vernacular
function vernacular(M, ctx, { heroes, sides }) {
  const { g } = ctx;
  deck(g, M.laterite, M.deck);
  layout(ctx, {
    heroes, sides,
    backWall: (p) => {
      mesh(metricBox(13.6, 8.4, 0.6), M.plaster, 0, FLOOR + 4.2, -5.6, p);
      mesh(metricBox(13.7, 0.9, 0.66), M.laterite, 0, FLOOR + 0.45, -5.6, p);
    },
    sideWall: (pivot) => {
      mesh(metricBox(0.5, 6.4, 7.6), M.plaster, 0, FLOOR + 3.2, 3.8, pivot);
      mesh(metricBox(0.56, 0.9, 7.66), M.laterite, 0, FLOOR + 0.45, 3.8, pivot);
    },
  });
  // timber posts on stone bases, with capitals
  for (const [x, z] of [[-7.7, 4.7], [7.7, 4.7], [-7.7, -0.4], [7.7, -0.4], [-7.7, -6.3], [7.7, -6.3]]) {
    mesh(metricBox(0.62, 0.5, 0.62), M.laterite, x, FLOOR + 0.25, z, g);
    mesh(new THREE.CylinderGeometry(0.19, 0.22, 8.1, 14), M.timber, x, FLOOR + 0.5 + 4.05, z, g);
    mesh(metricBox(0.7, 0.25, 0.7), M.timber, x, FLOOR + 8.7, z, g);
  }
  // beams, timber ceiling, clay-tile hip roof with a small crown
  for (const z of [4.7, -6.3]) mesh(metricBox(16.2, 0.45, 0.4), M.timber, 0, FLOOR + 9.0, z, g);
  for (const x of [-7.7, 7.7]) mesh(metricBox(0.4, 0.45, 11.4), M.timber, x, FLOOR + 9.0, -0.8, g);
  const ceiling = mesh(metricBox(17, 0.12, 13), M.ceiling, 0, FLOOR + 9.28, -0.8, g);
  ceiling.castShadow = false;
  const roof = hipRoof(20.5, 16.5, 4.4, M.roof);
  roof.position.set(0, FLOOR + 9.34 + 2.2, -0.8);
  roof.castShadow = true;
  g.add(roof);
  const crown = hipRoof(3, 2.4, 1.6, M.roof);
  crown.position.set(0, FLOOR + 9.34 + 4.4 - 0.4, -0.8);
  g.add(crown);
  // perforated jaali screens beyond the side walls
  const tex = jaaliTexture();
  const screen = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, color: '#e6d3b8' });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  [-1, 1].forEach((side) => {
    const s = mesh(new THREE.PlaneGeometry(3, 6.4), screen, side * 9.8, FLOOR + 3.4, 0.6, g);
    s.rotation.y = side * 1.2;
    s.customDepthMaterial = depth;
  });
  // brass diyas hanging from the front beam
  if (ctx.kit.diya) {
    const mats = [-7, -3.6, 3.6, 7].map((x) => new THREE.Matrix4().compose(new THREE.Vector3(x, FLOOR + 7.8, 4.7), new THREE.Quaternion(), new THREE.Vector3(3.2, 3.2, 3.2)));
    g.add(instancesFromModel(ctx.kit.diya[0], mats));
    [-7, -3.6, 3.6, 7].forEach((x) => mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4), M.dark, x, FLOOR + 9.1 - 0.4, 4.7, g));
  }
}

// ---------- 02 Bengal terracotta
function extrudeWall(points, depth, mat) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  return new THREE.Mesh(geo, mat);
}

function brickJaali(M, w, h, parent) {
  const brick = metricBox(0.24, 0.075, 0.12);
  const rows = Math.floor(h / 0.15);
  const cols = Math.floor(w / 0.36);
  const mats = [];
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + c * 0.36 + (r % 2 ? 0.18 : 0);
      mats.push(new THREE.Matrix4().compose(v.set(x, r * 0.15 + 0.04, 0), q, s));
    }
  }
  const im = new THREE.InstancedMesh(brick, M.brick, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true;
  im.receiveShadow = true;
  parent.add(im);
  return im;
}

function terracotta(M, ctx, { heroes, sides }) {
  const { g } = ctx;
  deck(g, M.laterite, M.brickFloor);
  layout(ctx, {
    heroes, sides,
    backWall: (p) => {
      const w = extrudeWall([[-6.8, 0], [6.8, 0], [6.8, 8.0], [3.2, 10.2], [-0.8, 8.6], [-6.8, 9.4]], 0.6, M.brick);
      w.position.set(0, FLOOR, -5.9);
      w.castShadow = w.receiveShadow = true;
      p.add(w);
    },
    sideWall: (pivot) => {
      const w = extrudeWall([[0, 0], [-7.6, 0], [-7.6, 5.4], [0, 9.0]], 0.5, M.brick);
      w.geometry.rotateY(Math.PI / 2);
      w.position.set(-0.25, FLOOR, 0);
      w.castShadow = w.receiveShadow = true;
      pivot.add(w);
    },
  });
  // perforated brick jaali screens, freestanding beside the walls
  [-1, 1].forEach((side) => {
    const j = new THREE.Group();
    brickJaali(M, 4.2, 6.4, j);
    mesh(metricBox(4.6, 0.3, 0.5), M.brick, 0, -0.15, 0, j);
    j.position.set(side * 10.6, FLOOR, -1.4);
    j.rotation.y = side * 1.05;
    g.add(j);
  });
  // white diagonal lattice canopy over the front, on slim white posts (from the entrance court)
  for (const x of [-7.8, 7.8]) mesh(new THREE.CylinderGeometry(0.11, 0.11, 8.8, 10), M.steel, x, FLOOR + 4.4, 4.9, g);
  const tex = latticeTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.2);
  const lat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2, color: '#f4efe6' });
  const roof = mesh(new THREE.PlaneGeometry(16.6, 6.5), lat, 0, FLOOR + 8.8, 2.3, g);
  roof.rotation.x = -Math.PI / 2 + 0.06;
  roof.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  mesh(metricBox(16.6, 0.3, 0.25), M.steel, 0, FLOOR + 8.8, 5.5, g);
}

// ---------- 03 Brutalist
function brutalist(M, ctx, { heroes, sides }) {
  const { g } = ctx;
  deck(g, M.concrete, M.polished);
  layout(ctx, {
    heroes, sides,
    backWall: (p) => mesh(metricBox(14.4, 9.4, 1.1), M.concrete, 0, FLOOR + 4.7, -5.85, p),
    sideWall: (pivot, side) => {
      mesh(metricBox(1.0, 7.4, 7.6), M.concrete, 0, FLOOR + 3.7, 3.8, pivot);
      // timber louvre fins on the outer face
      for (let i = 0; i < 10; i++) mesh(metricBox(0.55, 6, 0.07), M.timber, side * 0.78, FLOOR + 3.4, 0.6 + i * 0.75, pivot);
    },
  });
  // deep waffle slab, cantilevered over the front, one bay left open as a skylight
  const y = FLOOR + 9.6;
  mesh(metricBox(18.4, 0.5, 15.8), M.concrete, 0, y + 0.95, 0.2, g);
  for (let i = 0; i <= 7; i++) {
    const x = -9 + i * (18 / 7);
    mesh(metricBox(0.32, 0.9, 15.6), M.concrete, x, y + 0.25, 0.2, g);
  }
  for (let i = 0; i <= 6; i++) {
    const z = -7.4 + i * (15.2 / 6);
    mesh(metricBox(18.2, 0.9, 0.32), M.concrete, 0, y + 0.25, z, g);
  }
  // one massive pier at the open corner
  mesh(metricBox(1.5, 9.6, 1.5), M.concrete, 7.4, FLOOR + 4.8, 3.6, g);
  // curved shell rising behind, like the sloping curved roof
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 15, 40, 1, true, 0, Math.PI / 2.4), M.concrete);
  shell.geometry.rotateZ(Math.PI / 2);
  shell.material = M.concrete;
  shell.position.set(0, y + 1.2, -2.5);
  shell.rotation.y = 0;
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);
}

// ---------- 04 Modern residential
function modern(M, ctx, { heroes, sides }) {
  const { g } = ctx;
  deck(g, M.stucco, M.oak);
  layout(ctx, {
    heroes, sides,
    backWall: (p) => mesh(metricBox(13.6, 8.2, 0.5), M.stucco, 0, FLOOR + 4.1, -5.6, p),
    sideWall: (pivot) => mesh(metricBox(0.4, 6.0, 7.6), M.stucco, 0, FLOOR + 3.0, 3.8, pivot),
  });
  // thin flat roof plate on slender black posts, deep overhang
  mesh(metricBox(19.5, 0.32, 15.5), M.stucco, 0, FLOOR + 8.9, -0.6, g);
  mesh(metricBox(19.6, 0.1, 15.6), M.dark, 0, FLOOR + 8.7, -0.6, g);
  for (const [x, z] of [[-8.6, 6.2], [8.6, 6.2], [-8.6, -6.6], [8.6, -6.6]]) mesh(metricBox(0.14, 8.6, 0.14), M.dark, x, FLOOR + 4.3, z, g);
  // timber slat screen on one side
  const slats = new THREE.Group();
  for (let i = 0; i < 34; i++) mesh(metricBox(0.06, 7.6, 0.14), M.oak, i * 0.17, 3.8, 0, slats);
  slats.position.set(9.4, FLOOR, 4.4);
  slats.rotation.y = Math.PI / 2;
  g.add(slats);
  // a line of pendant lights, dark shades with a soft glow underneath
  for (const x of [-4.5, 0, 4.5]) {
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), M.dark, x, FLOOR + 7.9, 1.2, g);
    mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.36, 20, 1, true), M.dark, x, FLOOR + 7.0, 1.2, g).castShadow = false;
    const l = mesh(new THREE.CircleGeometry(0.29, 20), M.softLamp, x, FLOOR + 6.83, 1.2, g);
    l.rotation.x = Math.PI / 2;
    l.castShadow = false;
  }
}

// Glowing ring on the path where the buggy stops. Conforms to the sand.
function ring(cx, cz, r0, r1, color = '#ffc27a') {
  const seg = 96;
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (const r of [r0, r1]) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pos.push(x, heightAt(x, z) + 0.06, z);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
}

function glowDisc(cx, cz, r, tex, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, (y ?? heightAt(cx, cz)) + 0.05, cz);
  return m;
}

// Soft additive glow around every lamp, so they glow even without bloom.
function halos(points, tex, size, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.PointsMaterial({ map: tex, size, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

function makeMaterials() {
  return {
    plaster: pbr('clay_plaster', { tile: 3, color: '#f3e7d6' }),
    laterite: pbr('red_laterite_soil_stones', { tile: 1.6, color: '#d9b49a' }),
    deck: pbr('wood_floor_deck', { tile: 2.4 }),
    timber: pbr('wood_floor_deck', { tile: 1.2, color: '#a0806a' }),
    ceiling: pbr('weathered_brown_planks', { tile: 2.2, color: '#b49a84' }),
    roof: pbr('clay_roof_tiles_02', { tile: 1.6, side: THREE.DoubleSide }),
    brick: pbr('brick_wall_02', { tile: 2.2 }),
    brickFloor: pbr('brick_wall_02', { tile: 1.6, color: '#d9b7a4' }),
    concrete: pbr('concrete_layers', { tile: 3, side: THREE.DoubleSide }),
    polished: pbr('concrete_wall_008', { tile: 3, roughness: 0.55 }),
    stucco: pbr('white_stucco', { tile: 2.5 }),
    oak: pbr('wood_floor_deck', { tile: 2.4, color: '#e7cdb2' }),
    pierPlank: pbr('weathered_brown_planks', { tile: 2 }),
    darkTimber: new THREE.MeshStandardMaterial({ color: '#4e3a2c', roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.4, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: '#23201d', roughness: 0.5, metalness: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffe7c2', emissive: '#ffae5c', emissiveIntensity: 7 }),
    softLamp: new THREE.MeshStandardMaterial({ color: '#ffe7c2', emissive: '#ffae5c', emissiveIntensity: 1.6, side: THREE.DoubleSide }),
  };
}

// lanterns from the kit glow from inside
function lightUp(model, intensity = 9) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material.name || '').toLowerCase();
    if (name.includes('glass') || name.includes('flame')) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color('#ffb15e');
      o.material.emissiveIntensity = intensity;
      o.castShadow = false;
    }
  });
}

// Her own building (converted from SketchUp) on its terrace in the hillside, on a low stone
// podium, scaled so its longer side is site.span metres and turned to face the sea (SketchUp's
// front view looks at the model's -Y side, which arrives here facing +z). Returns what the
// stop needs: the object, a footprint planting keeps clear of, and a camera shot that frames it.
function placeBuilding(M, site) {
  const model = site.object;
  const size = model.userData.size;
  const k = site.span / Math.max(size.x, size.z);
  const w = size.x * k, d = size.z * k, h = size.y * k;
  const g = new THREE.Group();
  mesh(metricBox(w + 3, 2, d + 3), M.polished, 0, -0.75, 0, g);
  mesh(metricBox(w + 3.2, 0.1, d + 3.2), M.dark, 0, 0.27, 0, g).castShadow = false;
  const m = model.clone();
  m.scale.setScalar(k);
  m.position.y = 0.32;
  m.rotation.y = Math.PI;
  g.add(m);
  g.position.set(site.x, site.y, site.z);
  const look = new THREE.Vector3(site.x, site.y + h * 0.35, site.z);
  return {
    object: g,
    y: site.y,
    footprint: { x: site.x, z: site.z, r: Math.hypot(w, d) / 2 + 4 },
    // from the beach below, a little to the side, high enough to see over the terrace edge
    shot: { look, pos: new THREE.Vector3(site.x - 14, site.y + h * 0.5 + 8, site.z - Math.max(w, d) * 0.95 - 6), radius: Math.max(w, d) },
  };
}

export function createExhibits({ projects, textures, path, kit = {}, display, sites = [] }) {
  const M = makeMaterials();
  const group = new THREE.Group();
  const stops = [];
  const pickables = [];
  const glow = glowTexture();
  const reveals = [];
  if (kit.lantern) lightUp(kit.lantern[0]);
  if (kit.diya) lightUp(kit.diya[0], 12);

  const placeStop = (id) => {
    const s = path.sAtX(STOP_X[id]);
    const P = path.pointAt(s);
    const T = path.tangentAt(s);
    const N = path.inwardAt(s);
    const normal = N.clone().sub(T).normalize();    // faces the land and the approaching buggy
    return { s, P, T, N, normal };
  };

  // ---------- Pavilions
  for (const p of projects) {
    const { s, P, normal } = placeStop(p.id);
    // 22 m out: the pavilion's nearest corner (post, deck, screen) stays 2 m+ off the path
    const center = P.clone().addScaledVector(normal, -22);
    center.y = heightAt(center.x, center.z);
    const holder = new THREE.Group();
    holder.position.copy(center);
    holder.position.y -= 0.15;
    holder.rotation.y = Math.atan2(normal.x, normal.z);
    group.add(holder);

    // glow: halos, frames and uplights; bright: the images themselves. The white drawings at 04
    // glare against the dusk, so that pavilion is quieter.
    const quiet = p.detail === 'pair';
    const ctx = { g: new THREE.Group(), lights: [], panels: [], picks: [], kit, display, glow: quiet ? 0.3 : 1, bright: quiet ? 0.8 : 1 };
    const sides = (p.walls || []).map((id) => textures[id]);
    if (p.detail === 'pergola') vernacular(M, ctx, { heroes: [textures[p.hero]], sides });
    else if (p.detail === 'lattice') terracotta(M, ctx, { heroes: [textures[p.hero]], sides });
    else if (p.detail === 'monolith') brutalist(M, ctx, { heroes: [textures[p.hero]], sides });
    else modern(M, ctx, { heroes: [textures[p.hero], textures[p.heroSecond]], sides });
    // clay pots at the front corners, each with a small curly palm (~2.4 m)
    const potPalm = kit.palmSmall?.[0];
    if (kit.planter && potPalm) {
      const k = 2.4 / PAVILION_SCALE / potPalm.userData.size.y;
      for (const x of [-6.4, 6.4]) {
        const pot = kit.planter[0].clone();
        pot.scale.setScalar(4.2);
        pot.position.set(x, FLOOR, 4.4);
        ctx.g.add(pot);
        const plant = potPalm.clone();
        plant.scale.setScalar(k);
        plant.rotation.y = x * 0.7;
        plant.position.set(x, FLOOR + 0.8, 4.4);
        ctx.g.add(plant);
      }
    }
    lectern(M, labelTexture({ number: p.number, title: p.title, sub: `${p.type} · ${p.location.split(',')[0]}` }), -4.6, 7.4, ctx.g);
    const site = sites.find((x) => x.id === p.id && x.object);
    const building = site ? placeBuilding(M, site) : null;
    if (building) group.add(building.object);
    ctx.g.scale.setScalar(PAVILION_SCALE);
    holder.add(ctx.g);
    ctx.picks.forEach((m) => { m.userData.stopId = p.id; pickables.push(m); });

    // where the buggy stops: a glowing ring on the path
    const r = ring(P.x, P.z, 3.0, 3.35);
    const disc = glowDisc(P.x, P.z, 4.4, glow);
    group.add(r, disc);
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd29a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    wave.position.set(center.x, center.y + 0.15, center.z);
    wave.visible = false;
    group.add(wave);

    const stop = {
      id: p.id, kind: 'project', s, center, normal, ring: P, ringMesh: r, disc,
      lights: ctx.lights, lightScale: ctx.glow, panels: ctx.panels,
      active: 0, holder: ctx.g, wave, landed: false, waveT: 1, sheenT: 1, arrived: false,
      building, footprint: building?.footprint,
    };
    stops.push(stop);
    reveals.push(stop);

    // her 3D building is its own stop, just past the pavilion, with its own ring on the path
    if (building) {
      const ms = path.sAtX(site.x);
      const MP = path.pointAt(ms);
      const mr = ring(MP.x, MP.z, 3.0, 3.35);
      const md = glowDisc(MP.x, MP.z, 4.4, glow);
      group.add(mr, md);
      stops.push({
        id: `${p.id}--model`, kind: 'model', project: p.id, s: ms, center: building.shot.look, normal,
        ring: MP, ringMesh: mr, disc: md, lights: [], active: 0, building,
      });
    }
  }

  // ---------- Pier: About & Contact
  {
    const { s, P } = placeStop('pier');
    const px = P.x;
    const pz = shoreZ(px);
    const pier = new THREE.Group();
    const deckY = 1.15;
    const L = 66;
    mesh(metricBox(3.6, 0.22, L), M.pierPlank, 0, deckY, -L / 2 + 2, pier);
    const lanternSpots = [];
    for (let z = 2; z > -L + 2; z -= 4) {
      for (const sx of [-1.6, 1.6]) {
        mesh(new THREE.CylinderGeometry(0.17, 0.2, 6, 10), M.timber, sx, deckY - 3, z, pier);
        mesh(metricBox(0.1, 1.0, 0.1), M.timber, sx * 1.08, deckY + 0.55, z, pier);
      }
      if (Math.abs(z) % 12 === 2) for (const sx of [-1.75, 1.75]) lanternSpots.push([sx, z]);
    }
    for (const sx of [-1, 1]) mesh(metricBox(0.1, 0.1, L - 2), M.timber, sx * 1.73, deckY + 1.05, -L / 2 + 2, pier);
    mesh(metricBox(9, 0.24, 9), M.pierPlank, 0, deckY, -L - 2, pier);
    for (let k = -4; k <= 4; k += 2) for (const [sx, sz] of [[k, -L - 6.4], [-4.4, -L - 2 + k], [4.4, -L - 2 + k]]) mesh(new THREE.CylinderGeometry(0.2, 0.22, 6, 10), M.timber, sx, deckY - 3, sz, pier);
    const ramp = mesh(metricBox(3.6, 0.2, 8), M.pierPlank, 0, deckY / 2 + 0.1, 6, pier);
    ramp.rotation.x = Math.atan2(deckY, 8);
    const lampPts = [];
    if (kit.lantern) {
      const mats = lanternSpots.map(([sx, z]) => new THREE.Matrix4().compose(new THREE.Vector3(sx, deckY + 1.08, z), new THREE.Quaternion(), new THREE.Vector3(1.6, 1.6, 1.6)));
      pier.add(instancesFromModel(kit.lantern[0], mats));
      lanternSpots.forEach(([sx, z]) => lampPts.push(new THREE.Vector3(px + sx, deckY + 1.5, pz + 3 + z)));
    }
    // life rings hung on the rail, facing out to either side
    if (kit.lifebuoy) {
      for (const [sx, z] of [[1, -14], [-1, -38], [1, -58]]) {
        const ring = kit.lifebuoy[0].clone();
        ring.position.set(sx * 1.86, deckY + 0.28, z);
        ring.rotation.y = Math.PI / 2;
        pier.add(ring);
      }
    }
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 10), M.dark, 3.8, deckY + 1.8, -L + 1.5, pier);
    const bulb = mesh(new THREE.SphereGeometry(0.3, 16, 12), M.lamp, 3.8, deckY + 3.7, -L + 1.5, pier);
    bulb.castShadow = false;
    lampPts.push(new THREE.Vector3(px + 3.8, deckY + 3.7, pz + 3 - L + 1.5));
    const lampLight = new THREE.PointLight('#ffb366', 30, 28, 1.6);
    lampLight.position.set(3.8, deckY + 3.4, -L + 1.5);
    pier.add(lampLight);
    pier.position.set(px, 0, pz + 3);
    group.add(pier);
    group.add(halos(lampPts, glow, 1.8, '#ffc27a'));
    const sign = lectern(M, labelTexture({ title: 'About & Contact', sub: 'Vishakha Bharti' }), 4.4, 6.5, pier);
    sign.position.y = heightAt(px + 4.4, pz + 9.5);

    const r = ring(P.x, P.z, 3.0, 3.35);
    const disc = glowDisc(P.x, P.z, 4.4, glow);
    group.add(r, disc);
    stops.push({ id: 'pier', kind: 'pier', s, center: new THREE.Vector3(px, deckY, pz + 3), normal: new THREE.Vector3(0, 0, 1), ring: P, ringMesh: r, disc, lights: [], active: 0 });
  }

  // ---------- Lanterns on timber posts along the path, with string lights between them
  const posts = [];
  for (let s = 6; s < path.length - 4; s += 9) {
    if (stops.some((st) => Math.abs(st.s - s) < 7)) continue;
    const P = path.pointAt(s);
    const N = path.inwardAt(s);
    const x = P.x + N.x * 6.2, z = P.z + N.z * 6.2;
    posts.push(new THREE.Vector3(x, heightAt(x, z), z));
  }
  const postGeo = metricBox(0.14, 2.9, 0.14);
  const armGeo = metricBox(0.5, 0.08, 0.08);
  const postMesh = new THREE.InstancedMesh(postGeo, M.timber, posts.length);
  const armMesh = new THREE.InstancedMesh(armGeo, M.timber, posts.length);
  const m4 = new THREE.Matrix4();
  const tops = [];
  posts.forEach((pt, i) => {
    postMesh.setMatrixAt(i, m4.makeTranslation(pt.x, pt.y + 1.45, pt.z));
    armMesh.setMatrixAt(i, m4.makeTranslation(pt.x - 0.2, pt.y + 2.85, pt.z));
    tops.push(new THREE.Vector3(pt.x - 0.38, pt.y + 2.45, pt.z));
  });
  postMesh.castShadow = true;
  group.add(postMesh, armMesh);
  if (kit.lantern) {
    group.add(instancesFromModel(kit.lantern[0], tops.map((t) => new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y - 0.42, t.z), new THREE.Quaternion(), new THREE.Vector3(1.5, 1.5, 1.5)))));
  } else {
    const heads = new THREE.InstancedMesh(metricBox(0.3, 0.42, 0.3), M.lamp, tops.length);
    tops.forEach((t, i) => heads.setMatrixAt(i, m4.makeTranslation(t.x, t.y, t.z)));
    group.add(heads);
  }
  group.add(halos(tops, glow, 2.2, '#ffbf73'));

  const bulbs = [];
  const bulbColors = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i].clone().setY(posts[i].y + 2.85), b = posts[i + 1].clone().setY(posts[i + 1].y + 2.85);
    if (a.distanceTo(b) > 14) continue;
    const n = Math.round(a.distanceTo(b) / 0.9);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const v = a.clone().lerp(b, t);
      v.y -= Math.sin(Math.PI * t) * 0.8 + 0.1;
      bulbs.push(v);
      bulbColors.push(4.6, 3.3, 1.9);
    }
  }
  const bulbGeo = new THREE.BufferGeometry().setFromPoints(bulbs);
  bulbGeo.setAttribute('color', new THREE.Float32BufferAttribute(bulbColors, 3));
  const stringLights = new THREE.Points(bulbGeo, new THREE.PointsMaterial({ map: glow, size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  stringLights.frustumCulled = false;
  group.add(stringLights);

  // ---------- Landing dust
  const DUST = 160;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ map: glow, size: 1.1, color: '#e9d2b4', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);
  let dustT = 1;
  const burst = (c) => {
    for (let i = 0; i < DUST; i++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 5;
      dustPos.set([c.x + Math.cos(a) * r, c.y + 0.3, c.z + Math.sin(a) * r], i * 3);
      const sp = 3 + Math.random() * 6;
      dustVel.set([Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp], i * 3);
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustT = 0;
  };

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  // falls like a dropped object (accelerating), then one small bounce
  const fall = (t) => {
    if (t < 0.72) { const u = t / 0.72; return 1 - u * u; }
    const u = (t - 0.72) / 0.28;
    return Math.sin(u * Math.PI) * 0.07;
  };

  return {
    group,
    stops,
    pickables,
    // s: where the buggy is along the path. Pavilions fall into place as it approaches.
    update(t, dt, s, activeId, reducedMotion) {
      for (const st of reveals) {
        // starts falling ~50 m out and lands ~31 m out, just before the camera turns to it
        const a = reducedMotion ? 1 : Math.min(1, Math.max(0, (s - (st.s - 50)) / 26));
        st.holder.visible = a > 0;
        st.holder.position.y = fall(a) * 30;
        st.holder.rotation.y = (1 - ease(Math.min(1, a / 0.72))) * 0.6;
        if (st.building) {
          // heavy: only drawn around its own stop
          st.building.object.visible = a > 0 && s < st.s + 120;
          st.building.object.position.y = st.building.y + fall(a) * 30;
        }
        const landedNow = a > 0.72;
        if (landedNow && !st.landed && !reducedMotion) {
          burst(st.center);
          st.waveT = 0;
          st.wave.visible = true;
        }
        st.landed = landedNow;
        if (st.waveT < 1) {
          st.waveT = Math.min(1, st.waveT + dt / 1.1);
          const k = ease(st.waveT);
          st.wave.scale.setScalar(2 + k * 18);
          st.wave.material.opacity = (1 - st.waveT) * 0.8;
          if (st.waveT >= 1) st.wave.visible = false;
        }
      }
      if (dustT < 1) {
        dustT = Math.min(1, dustT + dt / 1.6);
        for (let i = 0; i < DUST; i++) {
          dustPos[i * 3] += dustVel[i * 3] * dt;
          dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
          dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
          dustVel[i * 3 + 1] -= 3 * dt;
          dustVel[i * 3] *= 0.97;
          dustVel[i * 3 + 2] *= 0.97;
        }
        dustGeo.attributes.position.needsUpdate = true;
        dustMat.opacity = (1 - dustT) * 0.6;
      }
      for (const st of stops) {
        const target = st.id === activeId ? 1 : 0;
        st.active += (target - st.active) * Math.min(1, dt * 4);
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
        st.ringMesh.material.opacity = 0.3 + 0.2 * pulse + st.active * 0.45;
        st.disc.material.opacity = 0.18 + 0.1 * pulse + st.active * 0.4;
        const k = st.lightScale ?? 1;
        for (const l of st.lights) l.emissiveIntensity = (1 + st.active * 2.2 + pulse * 0.3) * k;
        if (!st.panels) continue;
        // arriving: a band of light sweeps across the images
        if (st.active > 0.5 && !st.arrived) { st.arrived = true; st.sheenT = 0; }
        if (st.active < 0.2) st.arrived = false;
        if (st.sheenT < 1) st.sheenT = Math.min(1, st.sheenT + dt / 1.5);
        st.panels.forEach((pn, i) => {
          const local = Math.min(1, Math.max(0, st.sheenT * 1.3 - i * 0.15));
          pn.uniforms.uSheen.value = st.sheenT < 1 ? -0.4 + local * 1.9 : -1;
          pn.haloMat.opacity = (0.12 + st.active * 0.22 + pulse * 0.03) * pn.glow;
          pn.frameMat.emissiveIntensity = (0.9 + st.active * 1.4) * pn.glow;
        });
      }
    },
  };
}
