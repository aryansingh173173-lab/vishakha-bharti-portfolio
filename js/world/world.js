// The 3D cove. Scrolling moves the buggy along a fixed path; pavilions drop in as it approaches
// and the camera eases into each one. It only provides navigation: arriving calls back into the
// app, which shows the HTML overview. Loaded lazily by app.js; never needed by portfolio mode.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { shoreZ, heightAt, addPad, createGround, createFoam } from './terrain.js';
import { createOcean } from './ocean.js';
import { createPath, STOP_X } from './path.js';
import { createBuggy, createCar, Rider } from './buggy.js';
import { createNature } from './nature.js';
import { createExhibits } from './exhibits.js';
import { createFireworks } from './fireworks.js';
import { loadModels } from './models.js';
import { loadKit, loadSky, loadBuildings, pbr, KIT_SIZE } from './assets.js';
import { GRADE_SHADER } from './grade.js';
import { NO_REFLECTION } from './nature.js';
import { img } from '../data.js';

const SUN_ELEVATION = 2.2;
const SUN_AZIMUTH = 48;          // degrees from -z towards +x
const SHADOW_ELEVATION = 17;     // shadows use a higher sun so they stay readable

const UP = new THREE.Vector3(0, 1, 0);
const SCROLL_METRES = 0.05;      // metres travelled per pixel of wheel (a notch is ~5 m)
const TOUCH_METRES = 0.12;       // per pixel of swipe
const NEAR = 9;                  // within this many metres of a stop, its overview shows
const BLEND = 30;                // the camera starts easing into a stop this far out
const MAGNET = 30;               // backing up and pausing this close to a stop settles on it
const SETTLE = 2.5;              // pausing this close to any stop settles on it
const ARRIVE = 7;                // pausing this short of the next stop rolls on to it
const REVERSE = 0.5;             // going back takes twice the scrolling of going forward
const CRUISE = 4;                // m/s: that last little roll
const VMAX = 16;                 // m/s: speed cap, so long scrolls still read as driving

// Hand-placed stop camera, relative to the pavilion: distance out along its facing direction,
// sideways (+ = viewer's right), height; and where it looks. On arrival it moves in close so
// the main image fills the left half of the screen ("wide" leaves room for the card).
const VIEW = {
  wide: { dist: 19, side: 0, up: 6.2, lookSide: 3.4, lookUp: 6.3 },     // card on the right
  narrow: { dist: 24, side: 0, up: 6.6, lookSide: 0, lookUp: 1.2 },    // card along the bottom
  tall: { dist: 24, side: 0, up: 9, lookSide: 0, lookUp: 1.5 },        // phones
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sunVector(elevation, azimuth) {
  const el = THREE.MathUtils.degToRad(elevation);
  const az = THREE.MathUtils.degToRad(azimuth);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

function pickTier(isTouch) {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (isTouch || cores <= 4 || mem <= 4 || Math.min(screen.width, screen.height) < 600) return 'low';
  return 'high';
}

export async function createWorld(opts) {
  const {
    canvas, projects, reducedMotion = false, isTouch = false,
    onProgress = () => {}, onNear = () => {}, onDrive = () => {}, onFail = () => {}, onFirstScroll = () => {}, onPick = () => {},
    onFirework = () => {},
  } = opts;

  const tier = pickTier(isTouch);
  onProgress(0.05);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high', powerPreference: 'high-performance' });
  let prCap = tier === 'high' ? 1.75 : 1.25;
  renderer.setPixelRatio(Math.min(devicePixelRatio, prCap));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    onFail(new Error('WebGL context lost'));
  });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#9c8392', 260, 2600);
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 40000);
  camera.layers.enable(NO_REFLECTION);

  // ---------- Sky: a real sunset panorama (Poly Haven, CC0), rotated so its sun sits over the sea
  const sunDir = sunVector(SUN_ELEVATION, SUN_AZIMUTH);
  const sky = await loadSky(renderer, tier);
  const angle = (v) => Math.atan2(v.z, v.x);
  // three negates background/environment rotations internally, hence panorama minus world
  const rot = angle(sky.sun) - angle(sunDir);
  sunDir.y = Math.max(0.03, sky.sun.y);
  sunDir.normalize();
  scene.background = sky.background;
  scene.backgroundIntensity = 1.35;
  scene.backgroundRotation.set(0, rot, 0);
  scene.environment = sky.env;
  scene.environmentRotation.set(0, rot, 0);
  scene.environmentIntensity = 0.9;
  onProgress(0.12);

  const hemi = new THREE.HemisphereLight('#c9b4c8', '#5b5340', 0.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb27a', 2.6);
  const shadowDir = sunVector(SHADOW_ELEVATION, SUN_AZIMUTH);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 420 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const ocean = createOcean(sunDir, tier);
  const water = ocean.water;
  scene.add(water, ocean.spray);
  onProgress(0.16);
  await new Promise((r) => setTimeout(r, 0));

  // ---------- Her own buildings (from SketchUp) stand on terraces at the foot of the hill, just
  // past each pavilion, so they're in view as the buggy drives up (pavilion left, building right).
  // They are heavy, so phones and small machines show the pavilions only.
  // `span`: the model's longer side in metres (a whole campus gets more room than one building)
  const SPAN = { resort: 40 };
  const sites = tier === 'high' ? projects.filter((p) => p.model && STOP_X[p.id] !== undefined).map((p) => {
    const span = SPAN[p.model] ?? 30;
    const half = span / 2 + 3;
    const x = STOP_X[p.id] + 32, z = shoreZ(x) + 27 + half;       // front edge just behind the path
    return { id: p.id, model: p.model, span, x, z, y: addPad(x, z, half) };
  }) : [];

  // ---------- Ground: real sand and grass textures
  const ground = createGround(tier, {
    sand: pbr('aerial_beach_01', { tile: 9, normalScale: 0.8, color: '#ffdcb8' }),
    grass: pbr('leafy_grass', { tile: 5 }),
  });
  scene.add(ground);
  const foam = createFoam();
  scene.add(foam);
  const path = createPath();
  onProgress(0.24);
  await new Promise((r) => setTimeout(r, 0));

  // her images on the pavilions are corrected for tone mapping and the grade (see grade.js)
  const display = { uExposure: { value: renderer.toneMappingExposure }, uResolution: { value: new THREE.Vector2() } };

  // ---------- Images (hero first, wall images too) + fonts for the labels
  const loader = new THREE.TextureLoader();
  const ids = [...new Set(projects.flatMap((p) => [p.hero, p.heroSecond, ...(p.walls || [])].filter(Boolean)))];
  const textures = {};
  let models = {};
  let loaded = 0;
  // One flaky request must not take the whole scene down: retry, then fall back to a plain panel.
  const loadTexture = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await loader.loadAsync(attempt ? `${url}?r=${attempt}` : url); } catch { /* retry */ }
    }
    const c = document.createElement('canvas');
    c.width = 16; c.height = 10;
    const g = c.getContext('2d');
    g.fillStyle = '#d8c7b0';
    g.fillRect(0, 0, 16, 10);
    return new THREE.CanvasTexture(c);
  };
  let kit = {};
  let kitDone = 0;
  const buildingNames = sites.map((s) => s.model);
  let buildings = {};
  const total = ids.length + KIT_SIZE + buildingNames.length;
  await Promise.all([
    loadModels().then((m) => { models = m; }),
    loadKit(() => onProgress(0.24 + 0.6 * ((loaded + ++kitDone) / total))).then((k) => { kit = k; }),
    loadBuildings(buildingNames, () => onProgress(0.24 + 0.6 * ((loaded + ++kitDone) / total))).then((b) => { buildings = b; }),
    ...ids.map((id) => loadTexture(img(id)).then((t) => {
      textures[id] = t;
      onProgress(0.24 + 0.6 * ((++loaded + kitDone) / total));
    })),
    Promise.race([
      Promise.all(['700 60px Montserrat', '600 46px Montserrat', 'italic 500 56px "Cormorant Garamond"', '400 56px "Instrument Serif"'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 3000)),
    ]).catch(() => {}),
  ]);

  const exhibits = createExhibits({ projects, textures, path, kit, display, sites: sites.map((s) => ({ ...s, object: buildings[s.model] })) });
  scene.add(exhibits.group);
  const stops = exhibits.stops;
  const stopIndex = Object.fromEntries(stops.map((s) => [s.id, s]));

  // fireworks over the sea in front of the pier; dusk falls while they're on
  const fireworks = createFireworks({ center: stopIndex.pier.center });
  scene.add(fireworks.group);
  const fireworkSound = (kind, x, z, flight) => onFirework(kind, Math.hypot(x - camera.position.x, z - camera.position.z), flight);
  const day = { bg: scene.backgroundIntensity, env: scene.environmentIntensity, sun: sun.intensity, hemi: hemi.intensity };
  let dusk = 0;

  // keep plants off the path, the pavilions and each stop's camera shot
  const shots = stops.map((s) => s.center.clone().addScaledVector(s.normal, 26));
  const pathPts = [];
  for (let s = 0; s <= path.length; s += 3) pathPts.push(path.pointAt(s));
  const nearPath = (x, z, r) => pathPts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  const avoid = (x, z) => {
    if (nearPath(x, z, 9)) return true;
    if (stops.some((s) => s.footprint && (s.footprint.x - x) ** 2 + (s.footprint.z - z) ** 2 < s.footprint.r ** 2)) return true;
    return stops.some((s, i) => (s.center.x - x) ** 2 + (s.center.z - z) ** 2 < 16 * 16
      || (shots[i].x - x) ** 2 + (shots[i].z - z) ** 2 < 15 * 15);
  };
  // little palm groves beside and behind each pavilion
  const palmSpots = stops.filter((s) => s.kind === 'project').flatMap((st, i) => {
    const side = new THREE.Vector3(st.normal.z, 0, -st.normal.x);
    return [[14, -3], [18, 3], [-15, -4], [-13, -11], [5, -13]].filter((_, k) => (k + i) % 5 !== 4).map(([a, b]) => {
      const p = st.center.clone().addScaledVector(side, a).addScaledVector(st.normal, b);
      return { x: p.x, z: p.z, y: heightAt(p.x, p.z) };
    }).filter((p) => !nearPath(p.x, p.z, 10) && !(st.footprint && (st.footprint.x - p.x) ** 2 + (st.footprint.z - p.z) ** 2 < st.footprint.r ** 2));
  });
  const nature = createNature({ tier, avoid, palmSpots, kit, models });
  scene.add(nature.group);
  // the sea learns where the land and rocks are (depth, foam lines, where waves burst into spray)
  ocean.bake(renderer, [ground, nature.rocks]);
  // afloat: a ship at anchor out in the bay, mooring buoys and a channel marker
  const afloat = (model, x, z, opts) => {
    if (!model) return;
    const o = model.clone();
    scene.add(o);
    ocean.float(o, x, z, opts);
  };
  afloat(kit.ship?.[0], 250, -430, { yaw: 0.25, sink: 2.1, span: 20, roll: 0.6 });
  afloat(kit.buoy?.[0], 92, -62, { sink: 0.85 });
  afloat(kit.buoy?.[0], 205, -78, { sink: 0.85, yaw: 1.3 });
  afloat(kit.buoy?.[0], 300, -66, { sink: 0.85, yaw: 2.2 });
  afloat(kit.marker?.[0], 395, -175, { sink: 1.3, span: 3 });

  // the vehicle: a models.json "buggy" if given, else the Mercedes G-Class, else the built-in buggy
  const buggy = models.buggy ? createBuggy(models.buggy) : kit.car ? createCar(kit.car[0]) : createBuggy();
  scene.add(buggy.group);
  const rider = new Rider();
  onProgress(0.9);

  // ---------- Post-processing: the grade everywhere, bloom on capable machines
  let composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // high threshold: the sun, its glints, lamps, string lights and fireflies bloom; the sky doesn't
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 3.4);
  bloom.enabled = tier === 'high';
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE_SHADER));

  // ---------- Journey state
  let s = 0;                 // where the buggy is (metres along the path)
  let sTarget = 0;           // where scrolling wants it
  let vel = 0;
  let lastInput = -1;
  let lastDir = 1;           // direction of the last scroll
  let cruise = null;         // stop the buggy is rolling on to by itself
  let mode = 'idle';        // idle (not started) | intro | drive | paused
  let inputEnabled = true;
  let near = null;
  let time = 0;
  let swoop = null;          // intro fly-in { t, dur, from }
  let scrolled = false;
  const END = path.length;
  const LAST = Math.max(...stops.map((st) => st.s)); // the journey ends at the pier

  const nextStop = (dir) => {
    const list = [0, ...stops.map((st) => st.s)];
    if (dir > 0) return list.find((v) => v > sTarget + 1) ?? LAST;
    return [...list].reverse().find((v) => v < sTarget - 1) ?? 0;
  };
  const push = (metres) => {
    if (metres < 0) metres *= REVERSE;
    sTarget = Math.min(LAST, Math.max(0, sTarget + metres));
    lastInput = time;
    lastDir = Math.sign(metres) || lastDir;
    cruise = null;
    if (!scrolled && Math.abs(metres) > 0.5) { scrolled = true; onFirstScroll(); }
  };
  const uiTarget = (e) => e.target instanceof Element && e.target.closest('#panel, #projects-overlay, #viewer, #portfolio, #intro');

  const onWheel = (e) => {
    if (mode !== 'drive' || !inputEnabled || uiTarget(e)) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
    push(Math.max(-20, Math.min(20, d * SCROLL_METRES)));
  };
  let touchY = null;
  const onTouchStart = (e) => { if (mode === 'drive' && !uiTarget(e)) touchY = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (touchY === null || mode !== 'drive' || !inputEnabled) return;
    const y = e.touches[0].clientY;
    push((touchY - y) * TOUCH_METRES);
    touchY = y;
    e.preventDefault();
  };
  const onTouchEnd = () => { touchY = null; };
  const onKey = (e) => {
    if (mode !== 'drive' || !inputEnabled || e.target.closest?.('input, textarea')) return;
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { sTarget = nextStop(1); lastInput = time; cruise = null; e.preventDefault(); }
    else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { sTarget = nextStop(-1); lastInput = time; cruise = null; e.preventDefault(); }
    else return;
    if (!scrolled) { scrolled = true; onFirstScroll(); }
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('keydown', onKey);

  // click (or tap) an image to open that project; pointer cursor on hover
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll();
  const ndc = new THREE.Vector2();
  const pickAt = (x, y) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(exhibits.pickables, false)[0];
    return hit?.object.userData.stopId ?? null;
  };
  canvas.addEventListener('click', (e) => {
    if (mode !== 'drive' || !inputEnabled) return;
    const id = pickAt(e.clientX, e.clientY);
    if (id) onPick(id);
  });
  let hoverT = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'drive' || e.pointerType === 'touch' || time - hoverT < 0.08) return;
    hoverT = time;
    canvas.style.cursor = pickAt(e.clientX, e.clientY) ? 'pointer' : '';
  });

  // ---------- Camera
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const A = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const B = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

  // following shot: behind and a little inland, looking ahead along the shore
  function chaseShot(out, at = s) {
    const tall = camera.aspect < 0.8;
    const back = tall ? 15.5 : 12.5;
    path.pointAt(at - back, v1);
    path.inwardAt(at, v2);
    out.pos.copy(v1).addScaledVector(v2, tall ? 1 : 1.5).add(new THREE.Vector3(0, tall ? 6.6 : 5.2, 0));
    out.pos.y = Math.max(out.pos.y, heightAt(out.pos.x, out.pos.z) + 1.5);
    path.pointAt(at + 14, v1);
    out.look.copy(v1).addScaledVector(v2, -3).add(new THREE.Vector3(0, 1.4, 0));
    return out;
  }

  function stopShot(stop, out) {
    const wide = camera.aspect > 1.05;
    // her 3D building: framed from the beach, drifting slowly round it
    if (stop.kind === 'model') {
      const { pos, look, radius } = stop.building.shot;
      const a = reducedMotion ? 0 : Math.sin(time * 0.11) * 0.55;
      const dx = pos.x - look.x, dz = pos.z - look.z;
      const back = camera.aspect < 0.8 ? 1.5 : 1;
      out.look.copy(look);
      out.pos.set(look.x + (dx * Math.cos(a) - dz * Math.sin(a)) * back, pos.y + (back - 1) * radius * 0.4, look.z + (dx * Math.sin(a) + dz * Math.cos(a)) * back);
      // on wide screens the card sits on the right, so the building moves into the left half
      if (innerWidth > 900) {
        v2.subVectors(out.look, out.pos).cross(UP).normalize();
        out.look.addScaledVector(v2, radius * 0.32);
      }
      return out;
    }
    if (stop.kind === 'pier') {
      out.pos.set(stop.center.x - (wide ? 7 : 2), stop.center.y + 3.4, stop.center.z + (wide ? 17 : 22));
      out.look.set(stop.center.x + (wide ? 9 : 2), 1.6, stop.center.z - 50);
      return out;
    }
    const n = stop.normal;
    const right = v2.crossVectors(n, UP).negate().normalize();
    const v = innerWidth > 900 ? VIEW.wide : wide ? VIEW.narrow : VIEW.tall;
    out.pos.copy(stop.center).addScaledVector(n, v.dist).addScaledVector(right, v.side).addScaledVector(UP, v.up);
    out.look.copy(stop.center).addScaledVector(right, v.lookSide).addScaledVector(UP, v.lookUp);
    if (!reducedMotion) {
      out.pos.addScaledVector(right, Math.sin(time * 0.25) * 0.4);
      out.pos.y += Math.sin(time * 0.31) * 0.15;
    }
    return out;
  }

  // aerial over the water, looking into the cove
  function aerialShot(out) {
    const x = 60 + Math.sin(time * 0.05) * 10;
    out.pos.set(x - 30, 34, shoreZ(x) - 95);
    out.look.set(x + 40, 2, shoreZ(x + 40) + 25);
    return out;
  }

  // the shot for the current position: the follow shot, eased into the nearest stop's view
  function journeyShot(out) {
    chaseShot(out);
    let best = null, bestD = Infinity;
    for (const st of stops) {
      const d = Math.abs(s - st.s);
      if (d < bestD) { bestD = d; best = st; }
    }
    const w = ease(1 - smooth(BLEND * 0.22, BLEND, bestD));
    if (w > 0) {
      stopShot(best, B);
      out.pos.lerp(B.pos, w);
      out.look.lerp(B.look, w);
    }
    return { stop: best, dist: bestD };
  }

  // ---------- Quality watchdog
  let level = 0;
  let fpsT = 0, fpsN = 0, warm = 0;
  function watchdog(dt) {
    warm += dt;
    if (warm < 3) return;
    fpsT += dt; fpsN++;
    if (fpsT < 3) return;
    const fps = fpsN / fpsT;
    fpsT = 0; fpsN = 0;
    if (fps < 40 && level === 0) {
      level = 1;
      prCap = 1;
      bloom.enabled = false;
      resize();
    } else if (fps < 26 && level === 1) {
      level = 2;
      composer = null;
      renderer.shadowMap.enabled = false;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
  }

  // ---------- Loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (devicePixelRatio !== dpr) resize(); // zoom or moving to another screen

    // when scrolling pauses the buggy stays where the scroll put it, except: right by a stop, it
    // settles on it; just short of the next stop, it rolls on to it (never back); after backing
    // up, it settles on a stop behind if that is close
    if (mode === 'drive' && time - lastInput > 0.35 && lastInput >= 0) {
      const marks = [0, ...stops.map((st) => st.s)];
      const closest = marks.reduce((a, b) => (Math.abs(b - sTarget) < Math.abs(a - sTarget) ? b : a));
      const ahead = marks.find((v) => v > sTarget);
      if (Math.abs(closest - sTarget) < SETTLE) sTarget = closest;
      else if (lastDir > 0) { if (ahead !== undefined && ahead - sTarget < ARRIVE) cruise = ahead; }
      else {
        const behind = [...marks].reverse().find((v) => v <= sTarget);
        if (behind !== undefined && sTarget - behind < MAGNET) sTarget = behind;
      }
      lastInput = -1;
    }
    if (cruise !== null) {
      sTarget = Math.min(cruise, Math.max(sTarget, s) + CRUISE * dt);
      if (sTarget >= cruise) cruise = null;
    }
    // critically damped follow (no overshoot, so it never rolls back), with a speed cap
    const targetVel = Math.max(-VMAX, Math.min(VMAX, (sTarget - s) * 2.6));
    vel += (targetVel - vel) * Math.min(1, dt * 10.4);
    s += vel * dt;
    if ((vel > 0 && s > sTarget) || (vel < 0 && s < sTarget) || (Math.abs(sTarget - s) < 0.01 && Math.abs(vel) < 0.05)) { s = sTarget; vel = 0; }

    rider.update(path, s, vel, dt);
    rider.apply(buggy, time);

    // camera
    let info = { stop: null, dist: Infinity };
    if (mode === 'intro') {
      aerialShot(A);
      cam.pos.lerp(A.pos, 1 - Math.exp(-dt * 2));
      cam.look.lerp(A.look, 1 - Math.exp(-dt * 2));
    } else {
      info = journeyShot(A);
      if (swoop) {
        swoop.t = Math.min(1, swoop.t + dt / swoop.dur);
        const e = ease(swoop.t);
        cam.pos.lerpVectors(swoop.from.pos, A.pos, e);
        cam.look.lerpVectors(swoop.from.look, A.look, e);
        cam.pos.y += Math.sin(e * Math.PI) * 6;
        if (swoop.t >= 1) swoop = null;
      } else {
        cam.pos.lerp(A.pos, 1 - Math.exp(-dt * 7));
        cam.look.lerp(A.look, 1 - Math.exp(-dt * 9));
      }
    }
    camera.position.copy(debugCam?.pos ?? cam.pos);
    camera.lookAt(debugCam?.look ?? cam.look);

    // which stop is close enough to show its overview
    const nowNear = mode === 'drive' && !swoop && info.stop && info.dist < (near === info.stop.id ? NEAR + 3 : NEAR) ? info.stop.id : null;
    if (nowNear !== near) {
      near = nowNear;
      onNear(near);
      if (near === 'pier' && !reducedMotion) fireworks.start();
      else fireworks.stop();
    }
    dusk += ((near === 'pier' && !reducedMotion ? 1 : 0) - dusk) * Math.min(1, dt * 0.8);
    scene.backgroundIntensity = day.bg * (1 - 0.68 * dusk);
    scene.environmentIntensity = day.env * (1 - 0.5 * dusk);
    sun.intensity = day.sun * (1 - 0.65 * dusk);
    hemi.intensity = day.hemi * (1 - 0.5 * dusk);
    fireworks.update(dt, fireworkSound);

    const focus = info.stop && info.dist < BLEND ? info.stop.center : buggy.group.position;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(shadowDir, 200);

    ocean.update(dt, time);
    foam.material.uniforms.uTime.value = time;
    nature.update(time);
    exhibits.update(time, dt, mode === 'intro' && !swoop ? -100 : s, near, reducedMotion);

    onDrive({ t: s / END, speed: Math.min(1, Math.abs(vel) / 20) * (mode === 'drive' ? 1 : 0) });

    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (mode === 'drive') watchdog(dt);
  }

  let debugCam = null;       // ?debug only: a fixed camera for checking the scene
  let dpr = 0;
  function resize() {
    const w = innerWidth, h = innerHeight;
    dpr = devicePixelRatio;
    const pr = Math.min(dpr, prCap);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 60 : 46;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(pr);
    composer?.setSize(w, h);
    renderer.getDrawingBufferSize(display.uResolution.value);
    fireworks.resize(camera, display.uResolution.value.y);
    ocean.resize(camera, display.uResolution.value.y);
    bloom.resolution.set(w, h);
    nature.resize();
  }
  window.addEventListener('resize', resize);
  resize();

  rider.update(path, 0, 0, 0, true);
  rider.apply(buggy, 0);
  aerialShot(cam);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  try { await renderer.compileAsync(scene, camera); } catch { /* optional */ }
  onProgress(1);
  if (new URLSearchParams(location.search).has('debug')) {
    window.__vb = { THREE, scene, kit, water, ocean, renderer, camera, bloom, sun, hemi, stops, cam, VIEW, path, fireworks, frame,
      look(pos, look) { debugCam = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null; }, get s() { return s; }, set s(v) { s = sTarget = v; }, get composer() { return composer; } };
  }

  // ---------- API used by app.js
  return {
    length: END,
    stops: stops.map((st) => ({ id: st.id, s: st.s, kind: st.kind })),
    setMode(next) {
      if (next === mode) return;
      const prev = mode;
      mode = next;
      if (next === 'paused') {
        renderer.setAnimationLoop(null);
        return;
      }
      last = performance.now();
      renderer.setAnimationLoop(frame);
      if (next === 'drive' && prev === 'intro') {
        swoop = reducedMotion ? null : { t: 0, dur: 2.6, from: { pos: cam.pos.clone(), look: cam.look.clone() } };
      }
    },
    distanceTo(id) {
      const st = id === 'start' ? { s: 0 } : stopIndex[id];
      return st ? Math.abs(st.s - s) : 0;
    },
    goTo(id, instant = false) {
      const st = id === 'start' ? { s: 0 } : stopIndex[id];
      if (!st) return;
      sTarget = st.s;
      lastInput = -1;
      cruise = null;
      if (instant) {
        s = st.s;
        vel = 0;
        rider.update(path, s, 0, 0, true);
        journeyShot(cam);
      }
    },
    setInputEnabled(v) { inputEnabled = v; },
  };
}
