// The vehicle on the path: a Mercedes G-Class (kit model) with spinning, steering wheels, or a
// built-in beach buggy if the model can't load. It rides the path: scrolling sets how far along
// it is; this file turns that into a pose.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heightAt } from './terrain.js';

const WHEEL_R = 0.42;

// A downloaded car: scaled to a real length, turned to face +x, and its wheels found (small
// round parts low at the corners) and hung on pivots so they spin and the front ones steer.
// `model` stands on y = 0 with its front towards +z.
export function createCar(model, { length = 4.7 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const car = model.clone(true);
  car.scale.setScalar(length / model.userData.size.z);
  car.rotation.y = Math.PI / 2;
  body.add(car);
  body.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
  const parts = new Map();
  car.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const wheelish = s.x < size.x * 0.2 && s.y < size.y * 0.5 && c.y < size.y * 0.45 && Math.abs(c.z) > size.z * 0.25;
    if (!wheelish) return;
    const key = `${Math.round(c.x * 2)},${Math.round(c.z * 2)}`;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key).push({ mesh: o, c });
  });
  const wheels = [];
  for (const list of parts.values()) {
    const c = list.reduce((a, p) => a.add(p.c), new THREE.Vector3()).divideScalar(list.length);
    const pivot = new THREE.Group();
    pivot.position.copy(c);
    body.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    pivot.updateMatrixWorld(true);
    for (const p of list) spin.attach(p.mesh);
    wheels.push({ pivot, spin, front: c.x > 0 });
  }

  // headlights glow at dusk
  const glow = new THREE.SpriteMaterial({ map: headlightTexture(), color: '#ffe2b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const z of [-0.36, 0.36]) {
    const s = new THREE.Sprite(glow);
    s.position.set(size.x / 2 + 0.05, size.y * 0.48, z * size.z);
    s.scale.setScalar(0.55);
    body.add(s);
  }
  return { group, body, wheels };
}

let lampTex = null;
function headlightTexture() {
  if (lampTex) return lampTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,210,0.7)');
  grd.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  lampTex = new THREE.CanvasTexture(c);
  lampTex.colorSpace = THREE.SRGBColorSpace;
  return lampTex;
}

// `model` (optional): a downloaded buggy from models.js, used instead of the built-in one.
export function createBuggy(model) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  if (model) {
    body.add(model);
    return { group, body, wheels: [] };
  }

  const paint = new THREE.MeshStandardMaterial({ color: '#2f5f5b', roughness: 0.38, metalness: 0.15 });
  const cream = new THREE.MeshStandardMaterial({ color: '#efe3cf', roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.45, metalness: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: '#a8673f', roughness: 0.7 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1d1a18', roughness: 0.92 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd79a', emissiveIntensity: 2.2 });

  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // tub and nose (model faces +x)
  add(new RoundedBoxGeometry(2.5, 0.42, 1.36, 4, 0.16), paint, 0, 0.62, 0);
  add(new RoundedBoxGeometry(0.9, 0.34, 1.2, 4, 0.14), paint, 1.3, 0.66, 0).rotation.z = -0.22;
  add(new RoundedBoxGeometry(2.3, 0.06, 1.1, 2, 0.03), cream, -0.05, 0.86, 0);
  // seats
  for (const z of [-0.3, 0.3]) {
    add(new RoundedBoxGeometry(0.5, 0.16, 0.46, 3, 0.06), leather, -0.35, 0.96, z);
    add(new RoundedBoxGeometry(0.14, 0.62, 0.46, 3, 0.06), leather, -0.66, 1.2, z).rotation.z = 0.18;
  }
  // roll cage
  const tube = (pts, r = 0.045) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8, false);
    add(g, steel, 0, 0, 0);
  };
  for (const z of [-0.58, 0.58]) {
    tube([[-1.05, 0.8, z], [-0.95, 1.75, z * 0.92], [-0.2, 1.88, z * 0.9], [0.35, 1.55, z * 0.92], [0.55, 0.85, z]]);
  }
  tube([[-0.95, 1.75, -0.54], [-0.95, 1.8, 0], [-0.95, 1.75, 0.54]]);
  tube([[0.3, 1.58, -0.53], [0.3, 1.62, 0], [0.3, 1.58, 0.53]]);
  // steering wheel
  const wheel = add(new THREE.TorusGeometry(0.17, 0.025, 8, 24), steel, 0.12, 1.2, -0.3);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.5;
  // lamps
  for (const z of [-0.42, 0.42]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16), lamp, 1.72, 0.78, z).rotation.z = Math.PI / 2;
  // spare tyre on the back
  add(new THREE.TorusGeometry(0.3, 0.12, 10, 20), rubber, -1.35, 0.95, 0).rotation.y = Math.PI / 2;

  // wheels
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.36, 22, 1);
  tyreGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.38, 14, 1);
  rimGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [x, z, front] of [[0.95, -0.78, true], [0.95, 0.78, true], [-0.88, -0.8, false], [-0.88, 0.8, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, z);
    group.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(tyreGeo, rubber, 0, 0, 0, spin);
    add(rimGeo, cream, 0, 0, 0, spin);
    // tread blocks so the spin reads
    for (let i = 0; i < 8; i++) {
      const b = add(new THREE.BoxGeometry(0.1, 0.06, 0.37), rubber, 0, 0, 0, spin);
      const a = (i / 8) * Math.PI * 2;
      b.position.set(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 0);
      b.rotation.z = a;
    }
    wheels.push({ pivot, spin, front });
  }

  return { group, body, wheels };
}

// Rides the path. `s` is the distance along it and `v` the current speed (m/s, negative when
// scrolling back). Heading follows the path; pitch and roll follow the sand.
export class Rider {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.speed = 0;
  }

  update(path, s, v, dt, snap = false) {
    const p = path.pointAt(s);
    const t = path.tangentAt(s);
    const ahead = path.tangentAt(s + 4);
    const heading = Math.atan2(t.z, t.x);
    const k = snap ? 1 : Math.min(1, dt * 10);
    this.x = p.x;
    this.z = p.z;
    this.heading = snap ? heading : this.heading + (heading - this.heading) * k;
    // front wheels turn into the coming curve
    const curve = Math.atan2(ahead.z, ahead.x) - heading;
    this.steer += (Math.max(-0.5, Math.min(0.5, curve * 3)) - this.steer) * Math.min(1, dt * 6);
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    const hf = heightAt(this.x + fx, this.z + fz);
    const hb = heightAt(this.x - fx, this.z - fz);
    const hl = heightAt(this.x + fz * 0.8, this.z - fx * 0.8);
    const hr = heightAt(this.x - fz * 0.8, this.z + fx * 0.8);
    this.pitch += (Math.atan2(hf - hb, 2.0) - this.pitch) * k;
    this.roll += (Math.atan2(hl - hr, 1.6) - this.roll) * k;
    const y = (hf + hb + hl + hr) / 4;
    this.y = snap ? y : this.y + (y - this.y) * Math.min(1, dt * 14);
    this.speed = v;
    this.wheelSpin += (v / WHEEL_R) * dt;
  }

  apply(buggy, time) {
    buggy.group.position.set(this.x, this.y, this.z);
    buggy.group.rotation.set(this.roll, -this.heading, this.pitch, 'YZX');
    // a little suspension life
    const bump = Math.min(1, Math.abs(this.speed) / 10);
    buggy.body.position.y = Math.sin(time * 17) * 0.012 * bump + Math.sin(time * 6.3) * 0.01 * bump;
    buggy.body.rotation.x = Math.sin(time * 9.1) * 0.006 * bump;
    for (const w of buggy.wheels) {
      w.spin.rotation.z = -this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steer;
    }
  }
}
