// The cove: one height function shared by the ground, the path, the buggy and every prop.
// World axes: +x runs along the beach from the start towards the pier, -z is the sea.
// The beach is a strip between the water and a green hillside, closed by headlands at both ends.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Shoreline with headlands curling round at both ends of the cove.
export function shoreZ(x) {
  return 5 * Math.sin(x * 0.014) + 2.5 * Math.sin(x * 0.037 + 1.3)
    - smooth(370, 540, x) * 130 - smooth(-50, -220, x) * 120;
}

export const inland = (x, z) => z - shoreZ(x);

// Distance of the hill foot from the waterline: it swings in and out so the cove feels shaped.
const hillFoot = (x) => 34 + 6 * Math.sin(x * 0.021 + 0.7) + 3 * Math.sin(x * 0.063);

// Level sites cut into the foot of the hill for her buildings. Added before the ground is built;
// each is a square of side 2 * half at the height of its seaward edge, blended into the slope
// over `blend` metres. The beach along the path (inland < 27 m) is never touched.
const PADS = [];
export function addPad(x, z, half, blend = 10) {
  const h = landHeight(x, z - half);
  PADS.push({ x, z, half, blend, h });
  return h;
}

export function heightAt(x, z) {
  let h = landHeight(x, z);
  if (!PADS.length) return h;
  const keep = smooth(22, 27, inland(x, z));
  for (const p of PADS) {
    const dx = Math.max(0, Math.abs(x - p.x) - p.half), dz = Math.max(0, Math.abs(z - p.z) - p.half);
    h += (p.h - h) * (1 - smooth(0, p.blend, Math.hypot(dx, dz))) * keep;
  }
  return h;
}

function landHeight(x, z) {
  const d = inland(x, z);
  if (d < 0) return Math.max(-7, d * 0.05);
  let h = Math.min(d, 30) * 0.04;
  h += 0.12 * Math.sin(x * 0.13 + z * 0.07) * smooth(5, 14, d);
  // green hillside: a steep rise behind the beach, then rolling ground
  const foot = hillFoot(x);
  const rise = smooth(foot - 4, foot + 26, d);
  h += rise * (13 + 6 * noise2(x * 0.03, z * 0.03));
  h += smooth(foot + 20, foot + 90, d) * 14 * noise2(x * 0.012 + 3, z * 0.02);
  // headland hills
  h += smooth(380, 540, x) * smooth(-60, 20, d) * (22 + 10 * noise2(x * 0.02, z * 0.02));
  h += smooth(-60, -220, x) * smooth(-60, 20, d) * (20 + 10 * noise2(x * 0.02 + 7, z * 0.02));
  return h;
}

// How green a point is (0 = sand, 1 = lush). Used by the ground colours and to place plants.
export function greenness(x, z) {
  const d = inland(x, z);
  const edge = hillFoot(x) - 6 + 5 * (noise2(x * 0.09, z * 0.09) - 0.5);
  const hill = smooth(edge, edge + 7, d);
  const head = Math.max(smooth(380, 470, x), smooth(-60, -150, x)) * smooth(-10, 20, d);
  return Math.max(hill, head);
}

const C = {
  dry: new THREE.Color('#ffffff'),
  wet: new THREE.Color('#8f7a66'),
  sea: new THREE.Color('#5e5446'),
};

// Ground: real sand (aerial_beach_01) blending into leafy grass up the hillside, darker where wet.
// UVs are in metres; `splat` (0 = sand, 1 = grass) drives the blend in the shader.
export function createGround(tier, { sand, grass }) {
  const X0 = -280, X1 = 640, Z0 = -190, Z1 = 210;
  const segX = tier === 'high' ? 360 : 230;
  const segZ = tier === 'high' ? 150 : 96;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const splat = new Float32Array(pos.count);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = inland(x, z);
    pos.setY(i, heightAt(x, z));
    uv.setXY(i, x, z);
    col.copy(C.dry);
    col.lerp(C.wet, (1 - smooth(-0.5, 6, d)) * 0.85);
    col.lerp(C.sea, 1 - smooth(-6, -1, d));
    const j = (noise2(x * 0.06, z * 0.06) - 0.5) * 0.12;
    colors.set([col.r + j, col.g + j, col.b + j * 1.2], i * 3);
    splat[i] = greenness(x, z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 1));
  geo.computeVertexNormals();

  const mat = sand;
  mat.vertexColors = true;
  const uniforms = {
    grassMap: { value: grass.map },
    grassNormal: { value: grass.normalMap },
    grassRough: { value: grass.roughnessMap },
    grassScale: { value: sand.map.repeat.x > 0 ? grass.map.repeat.x / sand.map.repeat.x : 1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float splat;
        varying float vSplat;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = splat;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D grassMap;
        uniform sampler2D grassNormal;
        uniform sampler2D grassRough;
        uniform float grassScale;
        varying float vSplat;`)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
        'vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( grassMap, vMapUv * grassScale ) * vec4( 0.62, 0.95, 0.5, 1.0 ), vSplat );'))
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace(
        'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );',
        'vec4 texelRoughness = mix( texture2D( roughnessMap, vRoughnessMapUv ), texture2D( grassRough, vRoughnessMapUv * grassScale ), vSplat );'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = mix( texture2D( normalMap, vNormalMapUv ).xyz, texture2D( grassNormal, vNormalMapUv * grassScale ).xyz, vSplat ) * 2.0 - 1.0;'));
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Foam along the waterline. A wash line climbs the sand and slides back, a softer crest
// rolls in from the sea, and the very edge glows a little so it catches the bloom.
export function createFoam() {
  const X0 = -120, X1 = 470, step = 2;
  const D0 = -16, D1 = 3.2, rows = 14;
  const cols = Math.round((X1 - X0) / step) + 1;
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i < cols; i++) {
    const x = X0 + i * step;
    const sz = shoreZ(x);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const z = sz + D0 + (D1 - D0) * v;
      pos.push(x, Math.max(heightAt(x, z), 0) + 0.035, z);
      uvs.push(x, v);
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#f4efe8') },
      ...THREE.UniformsLib.fog,
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float x = vUv.x;
        float v = vUv.y;
        float wash = 0.5 + 0.5 * sin(uTime * 0.5 + x * 0.035 + 0.6 * sin(x * 0.011));
        float front = mix(0.76, 0.93, wash);
        float grain = n(vec2(x * 0.9, v * 30.0 - uTime * 0.25)) * 0.6 + n(vec2(x * 2.7, v * 70.0 + uTime * 0.4)) * 0.4;
        float edge = smoothstep(front - 0.012, front, v) * (1.0 - smoothstep(front, front + 0.008, v));
        float sheet = smoothstep(front - 0.12, front, v) * (1.0 - step(front, v));
        float a = edge * (0.75 + 0.25 * grain) + sheet * 0.28 * grain;
        float cyc = fract(uTime * 0.075 + x * 0.002);
        float crestPos = cyc * 0.78;
        float crest = smoothstep(crestPos - 0.035, crestPos, v) * (1.0 - smoothstep(crestPos, crestPos + 0.012, v));
        a += crest * smoothstep(0.0, 0.25, cyc) * (1.0 - smoothstep(0.7, 1.0, cyc)) * (0.35 + 0.4 * grain);
        a *= smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.96, 1.0, v));
        vec3 col = uColor * (1.0 + edge * 0.6);
        gl_FragColor = vec4(col, clamp(a * 0.85, 0.0, 0.85));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}
