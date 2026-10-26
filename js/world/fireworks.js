// Fireworks over the sea at the pier. Each shell leaps out of the water with a splash, climbs
// trailing embers and bursts; some crackle as they fade. The particles are additive points in
// HDR, so their first flash blooms and the whole show reflects in the water.
import * as THREE from 'three';

const MAX = 12000;
const G = 9.8;
const DEAD = 0, SHELL = 1, SPARK = 2, EMBER = 3, DROP = 4;

// [main colour, colour it fades towards]
const PALETTES = [
  [[1, 0.52, 0.16], [1, 0.82, 0.5]],     // gold
  [[1, 0.2, 0.16], [1, 0.62, 0.4]],      // red
  [[1, 0.32, 0.62], [1, 0.78, 0.88]],    // rose
  [[0.5, 0.72, 1], [1, 1, 1]],           // silver blue
  [[0.42, 1, 0.55], [1, 0.95, 0.55]],    // green to gold
  [[0.82, 0.45, 1], [1, 0.8, 1]],        // violet
];
const TYPES = ['peony', 'peony', 'crackle', 'willow', 'ring', 'crackle'];

const VERT = /* glsl */`
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size > 0.0 ? max(size * uScale / -mv.z, 1.6) : 0.0;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float a = 0.55 * exp(-r * r * 6.0) + exp(-r * r * 38.0);
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

export function createFireworks({ center }) {
  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const base = new Float32Array(MAX * 3);
  const tint = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const age = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const kind = new Uint8Array(MAX);
  const crackle = new Uint8Array(MAX);
  const shellType = new Uint8Array(MAX);
  const shellPal = new Uint8Array(MAX);
  let head = 0;
  let alive = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;

  // the flash of each burst lights the water and the pier
  const flash = new THREE.PointLight('#ffc89a', 0, 0, 2);
  // rings spreading on the water where a shell leaves it
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#ffe2c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const ripples = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), rippleMat.clone());
    m.visible = false;
    m.userData.t = 1;
    return m;
  });
  const group = new THREE.Group();
  group.add(points, flash, ...ripples);

  function spawn(k, x, y, z, vx, vy, vz, l, s, c, c2, dr = 0, gr = 1) {
    const i = head;
    head = (head + 1) % MAX;
    if (kind[i] === DEAD) alive++;
    kind[i] = k;
    pos.set([x, y, z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    base.set(c, i * 3);
    tint.set(c2 ?? c, i * 3);
    age[i] = 0;
    life[i] = l;
    size[i] = s;
    drag[i] = dr;
    grav[i] = gr;
    crackle[i] = 0;
    return i;
  }

  let nextRipple = 0;
  function launch(sound) {
    const x = center.x + 20 + (Math.random() - 0.5) * 190;
    const z = center.z - 100 - Math.random() * 80;
    const height = 30 + Math.random() * 18;
    const vy = Math.sqrt(2 * G * 1.6 * height);
    const i = spawn(SHELL, x, 0, z, (Math.random() - 0.5) * 3, vy, (Math.random() - 0.5) * 3, vy / (G * 1.6), 0.7, [3, 2, 1.2], null, 0, 1.6);
    shellType[i] = Math.floor(Math.random() * TYPES.length);
    shellPal[i] = Math.floor(Math.random() * PALETTES.length);
    // splash: spray thrown up where it leaves the water, and a ring spreading out
    for (let k = 0; k < 90; k++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
      spawn(DROP, x + Math.cos(a) * 0.4, 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * r, 3 + Math.random() * 9, Math.sin(a) * r, 1.6, 0.32 + Math.random() * 0.25, [0.9, 0.85, 0.82]);
    }
    const rp = ripples[nextRipple++ % ripples.length];
    rp.position.set(x, 0.15, z);
    rp.userData.t = 0;
    rp.visible = true;
    sound?.('launch', x, z, vy / (G * 1.6));
  }

  function burst(i, sound) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const type = TYPES[shellType[i]];
    const [c1, c2] = PALETTES[shellPal[i]];
    const n = type === 'willow' ? 200 : type === 'ring' ? 150 : 280;
    const speed = type === 'willow' ? 15 : 21 + Math.random() * 5;
    // a ring faces the shore (roughly), so it reads as a circle rather than a line
    const ax = new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, 1).normalize();
    const u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(ax, u);
    for (let k = 0; k < n; k++) {
      let dx, dy, dz;
      if (type === 'ring') {
        const a = (k / n) * Math.PI * 2;
        dx = u.x * Math.cos(a) + w.x * Math.sin(a);
        dy = u.y * Math.cos(a) + w.y * Math.sin(a);
        dz = u.z * Math.cos(a) + w.z * Math.sin(a);
      } else {
        // even directions on a sphere (golden spiral) with a little jitter
        const t = (k + 0.5) / n, phi = Math.acos(1 - 2 * t), th = k * 2.39996 + Math.random() * 0.2;
        dx = Math.sin(phi) * Math.cos(th);
        dy = Math.cos(phi);
        dz = Math.sin(phi) * Math.sin(th);
      }
      const sp = speed * (0.88 + Math.random() * 0.12);
      const willow = type === 'willow';
      const j = spawn(SPARK, x, y, z, dx * sp, dy * sp, dz * sp,
        (willow ? 3.4 : 1.9) + Math.random() * 0.6, willow ? 1.3 : 1.6,
        willow ? [1, 0.6, 0.22] : c1, willow ? [0.9, 0.5, 0.2] : c2,
        willow ? 1.5 : 1.15, willow ? 0.5 : 0.28);
      crackle[j] = type === 'crackle' ? 1 : 0;
    }
    flash.position.set(x, y, z);
    flash.color.setRGB(...c2);
    flash.userData.t = 0;
    sound?.('burst', x, z);
  }

  let showing = false;
  let clock = 0;
  let queue = [];
  let next = Infinity;

  return {
    group,
    start() {
      if (showing) return;
      showing = true;
      clock = 0;
      queue = [0.1, 0.5, 0.85, 1.35, 1.9];   // the opening volley
      next = 3;
    },
    stop() { showing = false; queue = []; },
    resize(camera, heightPx) {
      mat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    update(dt, onSound) {
      clock += dt;
      if (showing) {
        while (queue.length && clock >= queue[0]) { queue.shift(); launch(onSound); }
        if (!queue.length && clock >= next) {
          launch(onSound);
          if (Math.random() < 0.35) queue.push(clock + 0.3);
          next = clock + 1.1 + Math.random() * 1.6;
        }
      }
      // ripples and flash
      for (const rp of ripples) {
        if (rp.userData.t >= 1) continue;
        rp.userData.t = Math.min(1, rp.userData.t + dt / 1.8);
        const e = 1 - Math.pow(1 - rp.userData.t, 2);
        rp.scale.setScalar(1 + e * 14);
        rp.material.opacity = (1 - rp.userData.t) * 0.55;
        if (rp.userData.t >= 1) rp.visible = false;
      }
      if (flash.userData.t !== undefined && flash.userData.t < 1) {
        flash.userData.t = Math.min(1, flash.userData.t + dt / 0.7);
        flash.intensity = 26000 * Math.exp(-flash.userData.t * 7);
      } else flash.intensity = 0;

      if (!alive) { points.visible = false; return; }
      points.visible = true;
      for (let i = 0; i < MAX; i++) {
        const k = kind[i];
        if (k === DEAD) continue;
        age[i] += dt;
        const t = age[i] / life[i];
        const i3 = i * 3;
        if (t >= 1 || (k === DROP && pos[i3 + 1] < 0 && vel[i3 + 1] < 0)) {
          if (k === SHELL) burst(i, onSound);
          kind[i] = DEAD;
          size[i] = 0;
          alive--;
          continue;
        }
        const d = Math.exp(-drag[i] * dt);
        vel[i3] *= d;
        vel[i3 + 1] = vel[i3 + 1] * d - G * grav[i] * dt;
        vel[i3 + 2] *= d;
        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;

        let lum;
        if (k === SHELL) {
          lum = 2.4;
          // embers left behind as it climbs
          spawn(EMBER, pos[i3], pos[i3 + 1], pos[i3 + 2], (Math.random() - 0.5) * 1.2, -1 - Math.random(), (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.3, 0.42, [1, 0.62, 0.3]);
        } else if (k === SPARK) {
          // a white-hot flash, then the colour (kept moderate so tone mapping doesn't bleach it)
          lum = (age[i] < 0.1 ? 6 : 2.1) * Math.pow(1 - t, 1.2);
          if (crackle[i] && t > 0.55) lum = Math.random() < 0.35 ? 5 * (1 - t) + 1.2 : 0.04;
          if (Math.random() < 0.2 && t < 0.8) spawn(EMBER, pos[i3], pos[i3 + 1], pos[i3 + 2], 0, -0.6, 0, 0.35 + Math.random() * 0.45, size[i] * 0.5, crackle[i] ? [1, 0.9, 0.7] : [base[i3], base[i3 + 1], base[i3 + 2]]);
        } else if (k === EMBER) {
          lum = 1.2 * (1 - t);
        } else {
          lum = 0.9 * (1 - t * t);
        }
        // colour drifts from the main colour towards the fade colour (and white when crackling)
        const m = k === SPARK ? Math.min(1, t * 1.4) : 0;
        const white = crackle[i] && t > 0.55 ? 0.7 : 0;
        for (let c = 0; c < 3; c++) {
          const v = base[i3 + c] + (tint[i3 + c] - base[i3 + c]) * m;
          col[i3 + c] = (v + (1 - v) * white) * lum;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}
