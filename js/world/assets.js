// Realistic assets, all CC0 from Poly Haven (see assets/CREDITS.md): a sunset sky (HDR for light,
// a JPG panorama for the backdrop), PBR texture sets, and a kit of optimised models.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const TEX = 'assets/textures/';
const MODELS = 'assets/models/';

// Models that ship with the site. "split" models hold several plant variations side by side;
// each becomes its own variant. Sizes are real-world metres from the scans.
const KIT = {
  boulder: { file: 'kit/boulder.glb' },
  coastRocks: { file: 'kit/coast-rocks.glb' },
  cliff: { file: 'kit/cliff.glb' },
  shrubA: { file: 'kit/shrub-a.glb', split: true },
  shrubB: { file: 'kit/shrub-b.glb', split: true },
  shrubC: { file: 'kit/shrub-c.glb', split: true },
  calathea: { file: 'kit/calathea.glb', split: true },
  anthurium: { file: 'kit/anthurium.glb', split: true },
  fern: { file: 'kit/fern.glb', split: true },
  sorrel: { file: 'kit/sorrel.glb', split: true },
  pachira: { file: 'kit/pachira.glb', split: 'pairs' },
  lantern: { file: 'kit/lantern.glb' },
  diya: { file: 'kit/diya.glb' },
  planter: { file: 'kit/planter.glb' },
  ship: { file: 'kit/ship.glb' },
  buoy: { file: 'kit/buoy.glb' },
  marker: { file: 'kit/marker.glb' },
  lifebuoy: { file: 'kit/lifebuoy.glb' },
  driftwood: { file: 'kit/driftwood.glb' },
  // Sketchfab, CC BY (credited in assets/CREDITS.md and on the site)
  palm: { file: 'kit/palm.glb' },
  palmSmall: { file: 'kit/palm-small.glb' },
  car: { file: 'kit/car.glb' },
};

let gltf = null;
function loader() {
  if (gltf) return gltf;
  gltf = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  gltf.setDRACOLoader(draco);
  return gltf;
}

// Stand a model on y = 0 and centre it on x/z, keeping real-world scale.
function ground(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const wrap = new THREE.Group();
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.y -= box.min.y;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  wrap.userData.size = box.getSize(new THREE.Vector3());
  return wrap;
}

function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (m.alphaTest > 0 || m.transparent) m.side = THREE.DoubleSide;
    if (m.map) m.map.anisotropy = 8;
  });
}

// "split": every mesh node is its own variation. "pairs": bark + leaves nodes share a suffix (_a, _b...).
function variants(scene, mode) {
  const nodes = [];
  scene.traverse((o) => { if (o.isMesh) nodes.push(o); });
  const groups = new Map();
  for (const n of nodes) {
    const key = mode === 'pairs' ? (n.name.match(/_([a-z])$/)?.[1] ?? n.name) : n.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  return [...groups.values()].map((list) => {
    const g = new THREE.Group();
    for (const n of list) {
      n.updateMatrixWorld(true);
      const m = new THREE.Mesh(n.geometry, n.material);
      m.applyMatrix4(n.matrixWorld);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return ground(g);
  });
}

export async function loadKit(onEach = () => {}) {
  const out = {};
  await Promise.all(Object.entries(KIT).map(async ([key, cfg]) => {
    try {
      const res = await loader().loadAsync(MODELS + cfg.file);
      prepare(res.scene);
      out[key] = cfg.split ? variants(res.scene, cfg.split) : [ground(res.scene)];
    } catch (err) {
      console.warn(`[kit] ${key}`, err);
    }
    onEach();
  }));
  return out;
}
export const KIT_SIZE = Object.keys(KIT).length;

// Her own buildings, converted from SketchUp (tools/skp2gltf.py). They have no normals, so the
// loader shades them flat, like SketchUp. Returns { name: model standing on y = 0 }.
export async function loadBuildings(names, onEach = () => {}) {
  const out = {};
  await Promise.all(names.map(async (name) => {
    try {
      const res = await loader().loadAsync(`${MODELS}buildings/${name}.glb`);
      prepare(res.scene);
      out[name] = ground(res.scene);
    } catch (err) {
      console.warn(`[building] ${name}`, err);
    }
    onEach();
  }));
  return out;
}

// PBR texture set: colour, normal and roughness, tiled every `tile` metres (UVs are in metres).
const texLoader = new THREE.TextureLoader();
const cache = new Map();
export function pbr(name, { tile = 2, color = '#ffffff', roughness = 1, normalScale = 1, ...rest } = {}) {
  const load = (map, srgb) => {
    const key = `${name}/${map}`;
    if (!cache.has(key)) {
      const t = texLoader.load(`${TEX}${name}/${map}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      cache.set(key, t);
    }
    const t = cache.get(key).clone();
    t.repeat.set(1 / tile, 1 / tile);
    t.needsUpdate = true;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('color', true),
    normalMap: load('normal', false),
    roughnessMap: load('rough', false),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color,
    roughness,
    ...rest,
  });
}

// Box with UVs measured in metres on every face, so textures keep their real scale.
export function metricBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return geo;
}

// Sky: the HDR lights the scene, the 8K-derived JPG is what you see. Returns the direction of the
// brightest point (the sun behind the clouds) in the panorama's own space.
export async function loadSky(renderer, tier) {
  const rgbe = new RGBELoader().setDataType(THREE.FloatType);
  const [hdr, back] = await Promise.all([
    rgbe.loadAsync('assets/sky/sky_1k.hdr'),
    texLoader.loadAsync(tier === 'high' ? 'assets/sky/sky_4k.jpg' : 'assets/sky/sky_2k.jpg'),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  back.mapping = THREE.EquirectangularReflectionMapping;
  back.colorSpace = THREE.SRGBColorSpace;
  back.anisotropy = 4;

  // find the sun: brightest texel above the horizon
  const { data, width, height } = hdr.image;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const u = (bx + 0.5) / width, v = 1 - (by + 0.5) / height;
  const phi = (u - 0.5) * Math.PI * 2;            // three's equirect: u = atan2(z, x) / 2π + 0.5
  const theta = (v - 0.5) * Math.PI;              //                   v = asin(y) / π + 0.5
  const sun = new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(theta), Math.sin(phi) * Math.cos(theta));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  pmrem.dispose();
  hdr.dispose();
  return { env, background: back, sun };
}
