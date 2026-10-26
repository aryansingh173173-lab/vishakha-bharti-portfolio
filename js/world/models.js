// Optional 3D models. Put .glb files in assets/models/ and list them in assets/models/models.json;
// they replace the built-in palms, bushes, rocks or buggy. Missing or broken files are skipped,
// so the scene always falls back to the procedural versions.
//
// models.json example:
//   {
//     "palm":  { "file": "palm.glb" },
//     "bush":  { "file": "bush.glb", "height": 1.4 },
//     "rock":  { "file": "rock.glb" },
//     "buggy": { "file": "buggy.glb", "rotateY": 90 }
//   }
// Each model is scaled to a sensible size (override with "height", "length" or "scale"),
// stood on the ground and centred. "rotateY" (degrees) turns it; the buggy must face +x.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SLOTS = {
  palm: { height: 9 },
  bush: { height: 1.4 },   // then scaled 0.7–2.2× across the hillside
  rock: { height: 1.2 },   // then scaled with each boulder
  buggy: { length: 2.6 },
};

export async function loadModels(base = 'assets/models/') {
  let manifest;
  try {
    const res = await fetch(`${base}models.json`, { cache: 'no-cache' });
    if (!res.ok) return {};
    manifest = await res.json();
  } catch {
    return {};
  }
  const entries = Object.entries(manifest).filter(([slot, cfg]) => SLOTS[slot] && cfg?.file);
  if (!entries.length) return {};

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/');
  loader.setDRACOLoader(draco);
  const out = {};
  await Promise.all(entries.map(async ([slot, cfg]) => {
    try {
      const gltf = await loader.loadAsync(base + cfg.file);
      out[slot] = normalise(gltf.scene, SLOTS[slot], cfg);
    } catch (err) {
      console.warn(`[models] couldn't load ${slot} (${cfg.file})`, err);
    }
  }));
  draco.dispose();
  return out;
}

// Scale to the target size, stand on y = 0, centre on x/z.
function normalise(root, target, cfg) {
  root.rotation.y += THREE.MathUtils.degToRad(cfg.rotateY || 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const k = cfg.scale ?? (target.height
    ? (cfg.height ?? target.height) / Math.max(size.y, 1e-6)
    : (cfg.length ?? target.length) / Math.max(size.x, size.z, 1e-6));
  root.position.x -= (box.min.x + box.max.x) / 2;
  root.position.y -= box.min.y;
  root.position.z -= (box.min.z + box.max.z) / 2;
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.scale.setScalar(k);
  wrap.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  wrap.updateMatrixWorld(true);
  return wrap;
}

// One InstancedMesh per mesh in the model, placed at every matrix.
export function instancesFromModel(model, matrices) {
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((place, i) => im.setMatrixAt(i, m.multiplyMatrices(place, o.matrixWorld)));
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  });
  return group;
}
