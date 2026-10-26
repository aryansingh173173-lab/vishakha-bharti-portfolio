// The sea: real rolling waves (Gerstner) on a mesh that is fine in the cove and coarse far out,
// with the planar sky reflection of three's Water. A top-down height map of the land and rocks,
// rendered once at start-up, tells the water how deep it is everywhere: waves build up in the
// shallows and die on the sand, foam gathers wherever water meets land or rock, the shallows are
// clear over the sand, and spray bursts off the rocks and cliffs as each wave arrives.
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { waterNormals } from './textures.js';
import { heightAt } from './terrain.js';

// dir.x, dir.z (towards the shore is +z), steepness, wavelength (m). The first four move the
// surface; the last two are too fine for the mesh and only shape the lighting.
const WAVES = [
  [0.12, 1, 0.07, 32],
  [-0.35, 1, 0.075, 19],
  [0.45, 1, 0.07, 11.5],
  [-0.55, 1, 0.06, 7],
  [0.8, 0.7, 0.05, 3.6],
  [-0.3, 1, 0.045, 2.2],
].map(([x, z, s, l]) => { const n = Math.hypot(x, z); return [x / n, z / n, s, l]; });
const WAVE_SCALE = 1;
const G = 9.8;

// height map of the land and rocks around the cove (metres; encoded as (h + 30) / 60)
const BOX = { x0: -420, x1: 820, z0: -420, z1: 80 };

const GLSL_COMMON = /* glsl */`
  uniform float uTime;
  uniform float uWaveScale;
  uniform vec4 uWaves[6];
  uniform sampler2D uHeight;
  uniform vec4 uHeightBox;      // x0, z1, 1 / width, 1 / depth
  float landAt(vec2 p) {
    vec2 uv = vec2((p.x - uHeightBox.x) * uHeightBox.z, (uHeightBox.y - p.y) * uHeightBox.w);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -30.0;
    return texture2D(uHeight, uv).r * 60.0 - 30.0;
  }
  // one Gerstner wave: returns the displacement and accumulates the surface tangents
  vec3 gerstner(vec4 w, vec2 p, float amp, inout vec3 T, inout vec3 B) {
    float k = 6.2831853 / w.w;
    float c = sqrt(${G.toFixed(1)} / k);
    vec2 d = w.xy;
    float s = w.z * amp;
    float f = k * (dot(d, p) - c * uTime);
    float a = s / k;
    float sf = sin(f), cf = cos(f);
    T += vec3(-d.x * d.x * s * sf, d.x * s * cf, -d.x * d.y * s * sf);
    B += vec3(-d.x * d.y * s * sf, d.y * s * cf, -d.y * d.y * s * sf);
    return vec3(d.x * a * cf, a * sf, d.y * a * cf);
  }
`;

const VERT = /* glsl */`
  uniform mat4 textureMatrix;
  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec3 vWaveNormal;
  varying float vFoam;
  varying float vBreak;
  varying float vAmp;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${GLSL_COMMON}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    mirrorCoord = textureMatrix * wp;
    float depth = -landAt(wp.xz);
    float fade = 1.0 - smoothstep(280.0, 900.0, length(wp.xz - cameraPosition.xz));
    // waves build up in the shallows, then die on the sand
    float shoal = smoothstep(-0.2, 0.9, depth) * (1.0 + 0.55 * (1.0 - smoothstep(0.8, 4.0, depth)));
    float amp = uWaveScale * fade * shoal;
    vAmp = amp;
    // the big swell breaks into lines of white water as it rolls through the surf zone
    float k0 = 6.2831853 / uWaves[0].w;
    float f0 = k0 * (dot(uWaves[0].xy, wp.xz) - sqrt(${G.toFixed(1)} / k0) * uTime);
    float surf = smoothstep(0.2, 0.7, depth) * (1.0 - smoothstep(1.8, 3.4, depth)) * fade;
    vBreak = surf * smoothstep(0.35, 0.95, sin(f0 + 0.5));
    vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0), disp = vec3(0.0);
    for (int i = 0; i < 4; i++) disp += gerstner(uWaves[i], wp.xz, amp, T, B);
    wp.xyz += disp;
    worldPosition = wp;
    vWaveNormal = normalize(cross(B, T));
    // where the surface bunches up (the crests) it breaks into foam, more so in the shallows
    float J = T.x * B.z - T.z * B.x;
    vFoam = (1.0 - smoothstep(0.6, 0.86, J)) * (0.45 + 0.55 * (1.0 - smoothstep(1.0, 5.0, depth)));
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D mirrorSampler;
  uniform float alpha;
  uniform float time;
  uniform float size;
  uniform float distortionScale;
  uniform sampler2D normalSampler;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 eye;
  uniform vec3 waterColor;
  uniform vec3 uShallow;
  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec3 vWaveNormal;
  varying float vFoam;
  varying float vBreak;
  varying float vAmp;
  vec4 getNoise(vec2 uv) {
    vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
    vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
    vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
    vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
    vec4 noise = texture2D(normalSampler, uv0) + texture2D(normalSampler, uv1) + texture2D(normalSampler, uv2) + texture2D(normalSampler, uv3);
    return noise * 0.5 - 1.0;
  }
  void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor) {
    vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
    float direction = max(0.0, dot(eyeDirection, reflection));
    specularColor += pow(direction, shiny) * sunColor * spec;
    diffuseColor += max(dot(sunDirection, surfaceNormal), 0.0) * sunColor * diffuse;
  }
  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  ${GLSL_COMMON}
  void main() {
    #include <logdepthbuf_fragment>
    vec4 noise = getNoise(worldPosition.xz * size);
    vec3 detail = normalize(noise.xzy * vec3(1.5, 1.0, 1.5));
    // the two finest waves, as lighting only
    vec3 T = vec3(1.0, 0.0, 0.0), B = vec3(0.0, 0.0, 1.0);
    gerstner(uWaves[4], worldPosition.xz, vAmp, T, B);
    gerstner(uWaves[5], worldPosition.xz, vAmp, T, B);
    vec3 n = normalize(vWaveNormal + cross(B, T) - vec3(0.0, 1.0, 0.0) + vec3(detail.x, 0.0, detail.z) * 0.4);

    vec3 diffuseLight = vec3(0.0);
    vec3 specularLight = vec3(0.0);
    vec3 worldToEye = eye - worldPosition.xyz;
    vec3 eyeDirection = normalize(worldToEye);
    sunLight(n, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight);
    float distance = length(worldToEye);
    // slopes facing you mirror the higher, darker sky; slopes facing away the bright horizon
    vec2 distortion = n.xz * (0.006 + 1.0 / distance) * distortionScale;
    vec3 reflectionSample = vec3(texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion));
    float theta = max(dot(eyeDirection, n), 0.0);
    float reflectance = 0.3 + 0.7 * pow(1.0 - theta, 5.0);
    vec3 scatter = max(0.0, dot(n, eyeDirection)) * waterColor;
    // the low sun shines through the thin tops of the waves
    float glow = pow(max(0.0, dot(-eyeDirection, sunDirection)), 3.0) * smoothstep(0.0, 0.5, worldPosition.y) * 0.9;
    scatter += glow * vec3(0.12, 0.5, 0.42) * sunColor;

    float land = landAt(worldPosition.xz);
    float depth = worldPosition.y - land;
    // shallow water is clear and turns turquoise over the sand
    scatter = mix(uShallow, scatter, smoothstep(0.0, 2.5, depth));
    vec3 albedo = mix((sunColor * diffuseLight * 0.3 + scatter) * getShadowMask(), (vec3(0.1) + reflectionSample * 0.9 + reflectionSample * specularLight), reflectance);

    // foam: breaking crests, and a frothy line wherever the water touches land or rock
    vec2 fp = worldPosition.xz;
    float fn = texture2D(normalSampler, fp * 0.085 + vec2(uTime * 0.012, -uTime * 0.021)).r * 0.5
             + texture2D(normalSampler, fp * 0.26 - vec2(uTime * 0.03, uTime * 0.008)).g * 0.3
             + texture2D(normalSampler, fp * vec2(0.7, 0.35) + vec2(0.0, uTime * 0.05)).r * 0.2;
    // measured in depth, so it stays a thin line on the flat beach and hugs steep rock
    float contact = 1.0 - smoothstep(0.0, 0.05 + 0.12 * fn, depth);
    float foam = clamp(max(max(vFoam, contact), vBreak * (0.35 + 0.65 * fn)), 0.0, 1.0);
    foam *= smoothstep(0.3, 0.62, fn + foam * 0.45);
    vec3 foamColor = vec3(1.0, 0.97, 0.94) * (sunColor * max(dot(sunDirection, n), 0.0) * 1.1 + vec3(0.95, 0.9, 0.98));
    albedo = mix(albedo, foamColor, foam * 0.92);

    float a = mix(0.12, 1.0, smoothstep(0.0, 1.5, depth));
    a = max(a, foam * 0.95);
    gl_FragColor = vec4(albedo, a * alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

// A grid that is fine in the cove and grows coarser towards the horizon (local x, y; the mesh
// is laid flat like three's Water, so local y is world -z).
function oceanGeometry(tier) {
  const step = tier === 'high' ? 1.7 : 2.8;
  const axis = (c0, c1, far0, far1) => {
    const mid = [];
    for (let v = c0; v <= c1 + 1e-6; v += step) mid.push(v);
    const lo = [], hi = [];
    for (let s = step, v = mid[0]; v > far0;) { s *= 1.2; v = Math.max(far0, v - s); lo.push(v); }
    for (let s = step, v = mid[mid.length - 1]; v < far1;) { s *= 1.2; v = Math.min(far1, v + s); hi.push(v); }
    return [...lo.reverse(), ...mid, ...hi];
  };
  const xs = axis(-260, 620, -4500, 4500);
  const zs = axis(-330, 40, -4500, 300);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = xs[i];
      pos[k + 1] = -zs[j];
      nor[k + 2] = 1;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = (j + 1) * nx + i, c = b + 1, d = a + 1;
      idx.set([a, b, d, b, c, d], o);
      o += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 7000);
  return geo;
}

// The height of the waves (without the shallows) at a point, as the shader computes it.
function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const [dx, dz, s, l] = WAVES[i];
    const k = (Math.PI * 2) / l;
    h += (s * WAVE_SCALE / k) * Math.sin(k * (dx * x + dz * z - Math.sqrt(G / k) * t));
  }
  return h;
}
const WAVE_MAX = WAVES.slice(0, 4).reduce((a, [, , s, l]) => a + (s * WAVE_SCALE * l) / (Math.PI * 2), 0);

// Spray off rocks and cliffs: droplets thrown up and seawards, and a softer mist.
function createSpray() {
  const MAX = 4000;
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX), age = new Float32Array(MAX), size0 = new Float32Array(MAX);
  const size = new Float32Array(MAX), fade = new Float32Array(MAX), mist = new Uint8Array(MAX);
  let head = 0, alive = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.8) } },
    vertexShader: /* glsl */`
      attribute float size;
      attribute float fade;
      uniform float uScale;
      varying float vFade;
      void main() {
        vFade = fade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size > 0.0 ? max(size * uScale / -mv.z, 1.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vFade;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(uColor, exp(-r * r * 3.0) * vFade);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;

  const spawn = (x, y, z, vx, vy, vz, l, s, m) => {
    const i = head;
    head = (head + 1) % MAX;
    if (life[i] <= 0) alive++;
    pos.set([x, y, z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    life[i] = l; age[i] = 0; size0[i] = s; mist[i] = m;
  };
  return {
    points,
    // a wave hits the rock: a sheet of water shoots up the face and falls back, leaving mist
    burst(x, z, nx, nz, power) {
      const tx = -nz, tz = nx;
      for (let k = 0; k < 160 * power; k++) {
        const along = (Math.random() - 0.5) * 12;
        const up = (6 + Math.random() * 10) * power * (1 - Math.abs(along) / 12);
        const out = 0.5 + Math.random() * 4;
        spawn(x + tx * along, 0.2, z + tz * along, nx * out + tx * (Math.random() - 0.5) * 3, up, nz * out + tz * (Math.random() - 0.5) * 3, 3, 0.35 + Math.random() * 0.55, 0);
      }
      for (let k = 0; k < 40 * power; k++) {
        const along = (Math.random() - 0.5) * 12;
        spawn(x + tx * along, 0.5 + Math.random() * 4 * power, z + tz * along, nx * 1.5 + (Math.random() - 0.5), 1 + Math.random() * 3 * power, nz * 1.5 + (Math.random() - 0.5), 1.8 + Math.random() * 1.4, 1.2 + Math.random() * 1.8, 1);
      }
    },
    resize(scale) { mat.uniforms.uScale.value = scale; },
    update(dt) {
      if (!alive) { points.visible = false; return; }
      points.visible = true;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        age[i] += dt;
        const i3 = i * 3;
        const t = age[i] / life[i];
        if (t >= 1 || (!mist[i] && pos[i3 + 1] < -0.2 && vel[i3 + 1] < 0)) {
          life[i] = 0; size[i] = 0; fade[i] = 0; alive--;
          continue;
        }
        const g = mist[i] ? 0.6 : G;
        const d = mist[i] ? Math.exp(-1.6 * dt) : Math.exp(-0.35 * dt);
        vel[i3] *= d; vel[i3 + 2] *= d;
        vel[i3 + 1] = vel[i3 + 1] * d - g * dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        size[i] = size0[i] * (mist[i] ? 1 + t * 1.6 : 1);
        fade[i] = mist[i] ? 0.14 * Math.sin(Math.PI * t) : 0.9 * (1 - t * t);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.fade.needsUpdate = true;
    },
  };
}

export function createOcean(sunDir, tier) {
  const size = tier === 'high' ? 512 : 256;
  const water = new Water(oceanGeometry(tier), {
    textureWidth: size,
    textureHeight: size,
    waterNormals: waterNormals(),
    sunDirection: sunDir.clone(),
    sunColor: 0xffb98a,
    waterColor: 0x0b3a48,
    distortionScale: 3.6,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  const m = water.material;
  m.uniforms.size.value = 4;
  // until the shore is baked: flat ground at -30 m (open sea everywhere)
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  Object.assign(m.uniforms, {
    uTime: { value: 0 },
    uWaveScale: { value: WAVE_SCALE },
    uWaves: { value: WAVES.map(([x, z, s, l]) => new THREE.Vector4(x, z, s, l)) },
    uHeight: { value: blank },
    uHeightBox: { value: new THREE.Vector4(BOX.x0, BOX.z1, 1 / (BOX.x1 - BOX.x0), 1 / (BOX.z1 - BOX.z0)) },
    uShallow: { value: new THREE.Color('#2f7f78') },
  });
  m.vertexShader = VERT;
  m.fragmentShader = FRAG;
  m.transparent = true;
  m.needsUpdate = true;

  const spray = createSpray();
  let spots = [];
  let t = 0;
  const floaters = [];

  // Render the land and rocks from above into a height map (once). Spots where deep water meets
  // a steep rise (rocks, cliffs, headlands) become places where waves burst into spray.
  function bake(renderer, objects) {
    const heightMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying float vY;
        void main() {
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 wp = modelMatrix * p;
          vY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        varying float vY;
        void main() { gl_FragColor = vec4(clamp((vY + 30.0) / 60.0, 0.0, 1.0), 0.0, 0.0, 1.0); }`,
      side: THREE.DoubleSide,
    });
    const W = BOX.x1 - BOX.x0, D = BOX.z1 - BOX.z0;
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 1, 1200);
    cam.position.set((BOX.x0 + BOX.x1) / 2, 600, (BOX.z0 + BOX.z1) / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt((BOX.x0 + BOX.x1) / 2, 0, (BOX.z0 + BOX.z1) / 2);
    cam.layers.enableAll();
    const bakeScene = new THREE.Scene();
    bakeScene.overrideMaterial = heightMat;
    const parents = objects.map((o) => o.parent);
    objects.forEach((o) => bakeScene.add(o));

    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    // fine, filterable map for the shader
    const rt = new THREE.WebGLRenderTarget(2048, 826, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    renderer.setRenderTarget(rt);
    renderer.render(bakeScene, cam);
    // coarse 8-bit copy read back here to find the rocky spots
    const small = new THREE.WebGLRenderTarget(620, 250);
    renderer.setRenderTarget(small);
    renderer.render(bakeScene, cam);
    const px = new Uint8Array(620 * 250 * 4);
    renderer.readRenderTargetPixels(small, 0, 0, 620, 250, px);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadow;
    objects.forEach((o, i) => parents[i].add(o));
    small.dispose();
    heightMat.dispose();
    m.uniforms.uHeight.value = rt.texture;

    // rows come back bottom-up: row 0 is the shore side (z1)
    const hAt = (i, j) => (px[(j * 620 + i) * 4] / 255) * 60 - 30;
    const cell = W / 620;
    const found = [];
    for (let j = 2; j < 248; j++) {
      for (let i = 2; i < 618; i++) {
        const h = hAt(i, j);
        if (h > -0.5 || h < -12) continue;
        let best = -99, bi = 0, bj = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const v = hAt(i + di, j + dj);
          if (v > best) { best = v; bi = di; bj = dj; }
        }
        if (best < 0.35) continue;
        const x = BOX.x0 + (i + 0.5) * cell;
        const z = BOX.z1 - (j + 0.5) * cell;
        if (x < -230 || x > 600) continue;
        // seawards: away from the high neighbour (world z grows as j shrinks)
        const nl = Math.hypot(bi, bj) || 1;
        found.push({ x, z, nx: -bi / nl, nz: bj / nl, rise: best - h });
      }
    }
    found.sort((a, b) => b.rise - a.rise);
    spots = [];
    for (const f of found) {
      if (spots.length >= 36) break;
      if (spots.some((s) => (s.x - f.x) ** 2 + (s.z - f.z) ** 2 < 24 * 24)) continue;
      spots.push({ ...f, last: waveHeight(f.x, f.z, 0), cool: Math.random() * 2 });
    }
  }

  return {
    water,
    spray: spray.points,
    bake,
    get spots() { return spots; },
    // Something afloat at (x, z): it rides the waves, rolling and pitching with the surface under
    // it. `span` is roughly its length, so a ship doesn't jitter on the small waves.
    float(obj, x, z, { yaw = 0, sink = 0, span = 2, roll = 1 } = {}) {
      const depth = -heightAt(x, z);
      const amp = Math.min(1, Math.max(0, (depth + 0.2) / 1.1));
      floaters.push({ obj, x, z, yaw, sink, span, roll: roll * amp, amp });
    },
    resize(camera, heightPx) {
      spray.resize(heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    },
    update(dt, time) {
      t = time;
      m.uniforms.time.value += dt * 0.45;
      m.uniforms.uTime.value = t;
      // a wave cresting at a rock throws spray
      for (const s of spots) {
        const h = waveHeight(s.x + s.nx * 3, s.z + s.nz * 3, t);
        s.cool -= dt;
        if (s.last < WAVE_MAX * 0.42 && h >= WAVE_MAX * 0.42 && s.cool <= 0) {
          // low rocks get a slap of white water, cliffs a tall plume
          const size = Math.min(1, Math.max(0.3, s.rise / 5));
          spray.burst(s.x, s.z, s.nx, s.nz, size * Math.min(1.3, 0.6 + h / WAVE_MAX));
          s.cool = 1.4;
        }
        s.last = h;
      }
      for (const f of floaters) {
        const d = f.span / 2;
        const h = waveHeight(f.x, f.z, t) * f.amp;
        // surface slope, turned into the object's own axes
        const gx = (waveHeight(f.x + d, f.z, t) - waveHeight(f.x - d, f.z, t)) / f.span;
        const gz = (waveHeight(f.x, f.z + d, t) - waveHeight(f.x, f.z - d, t)) / f.span;
        const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
        f.obj.position.set(f.x, h - f.sink, f.z);
        f.obj.rotation.set(-Math.atan(gx * s + gz * c) * f.roll, f.yaw, Math.atan(gx * c - gz * s) * f.roll, 'YXZ');
      }
      spray.update(dt);
    },
  };
}
