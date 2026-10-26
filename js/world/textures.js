// Procedural textures, generated at start-up so the 3D scene needs no texture downloads
// beyond the portfolio images themselves.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Tileable normal map built from a sum of plane waves with integer frequencies.
function waveNormalMap(size, waves, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos(2 * Math.PI * (w.fx * u + w.fy * v) + w.ph) * w.a * 2 * Math.PI;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function waterNormals() {
  const r = rng(11);
  const waves = [];
  while (waves.length < 34) {
    const fx = Math.round((r() * 2 - 1) * 14);
    const fy = Math.round((r() * 2 - 1) * 14);
    if (!fx && !fy) continue;
    const f = Math.hypot(fx, fy);
    waves.push({ fx, fy, a: 0.9 / Math.pow(f, 1.6), ph: r() * Math.PI * 2 });
  }
  return waveNormalMap(256, waves, 0.55);
}

export function sandNormals() {
  const r = rng(5);
  const waves = [];
  // wind ripples: mostly one direction
  for (let i = 0; i < 10; i++) {
    const fx = Math.round(5 + r() * 9) * (r() > 0.5 ? 1 : -1);
    const fy = Math.round((r() * 2 - 1) * 3);
    waves.push({ fx, fy, a: 0.05 / Math.hypot(fx, fy), ph: r() * 6.28 });
  }
  // grain
  for (let i = 0; i < 40; i++) {
    const fx = Math.round((r() * 2 - 1) * 60);
    const fy = Math.round((r() * 2 - 1) * 60);
    if (!fx && !fy) continue;
    waves.push({ fx, fy, a: 0.0035 / Math.pow(Math.hypot(fx, fy), 0.9), ph: r() * 6.28 });
  }
  return waveNormalMap(256, waves, 2.2);
}

export function sandColor() {
  const [c, g] = canvas(512, 512);
  const img = g.createImageData(512, 512);
  const r = rng(3);
  for (let i = 0; i < 512 * 512; i++) {
    const n = r();
    const speck = r() < 0.015 ? -60 * r() : r() < 0.02 ? 25 : 0;
    const v = 228 + n * 27 + speck;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v - 4 - n * 4;
    img.data[i * 4 + 2] = v - 10 - n * 6;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

export function woodTexture(base = '#6a4a33') {
  const [c, g] = canvas(256, 512);
  const r = rng(21);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256;
    g.strokeStyle = `rgba(${r() > 0.5 ? '30,18,10' : '160,120,90'},${0.05 + r() * 0.12})`;
    g.lineWidth = 0.5 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 3 + (r() - 0.5) * 2, y);
    g.stroke();
  }
  return canvasTexture(c);
}

export function plankTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(8);
  for (let i = 0; i < 8; i++) {
    const tone = 95 + r() * 40;
    g.fillStyle = `rgb(${tone + 25},${tone},${tone - 22})`;
    g.fillRect(0, i * 64, 512, 62);
    for (let k = 0; k < 18; k++) {
      g.fillStyle = `rgba(40,25,15,${0.05 + r() * 0.08})`;
      g.fillRect(0, i * 64 + r() * 60, 512, 1 + r() * 2);
    }
    g.fillStyle = 'rgba(25,15,8,0.55)';
    g.fillRect(0, i * 64 + 62, 512, 2);
  }
  return canvasTexture(c);
}

export function brickTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(14);
  g.fillStyle = '#8c5a44';
  g.fillRect(0, 0, 512, 512);
  const bh = 32, bw = 96;
  for (let row = 0; row < 512 / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 512 + bw; x += bw) {
      const t = r();
      g.fillStyle = `rgb(${165 + t * 35},${84 + t * 22},${52 + t * 14})`;
      g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  return canvasTexture(c);
}

export function stoneTexture(base = [190, 176, 156], seed = 4) {
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = rng(seed);
  for (let i = 0; i < 256 * 256; i++) {
    const n = (r() - 0.5) * 22;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

// Perforated screen pattern (alpha). Used with alphaTest so shadows fall through it.
export function jaaliTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#c9a27a';
  g.fillRect(0, 0, 256, 512);
  g.globalCompositeOperation = 'destination-out';
  const s = 32;
  for (let y = 0; y < 512; y += s) {
    for (let x = 0; x < 256; x += s) {
      g.beginPath();
      g.arc(x + s / 2, y + s / 2, 11, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvasTexture(c, { repeat: false });
}

// Diagonal lattice like the museum's entrance screen (page 20).
export function latticeTexture() {
  const [c, g] = canvas(512, 512);
  g.strokeStyle = '#ece6dc';
  g.lineWidth = 16;
  g.lineCap = 'square';
  for (let k = -512; k <= 1024; k += 104) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 512, 512); g.stroke();
    g.beginPath(); g.moveTo(k, 512); g.lineTo(k + 512, 0); g.stroke();
  }
  g.lineWidth = 28;
  g.strokeRect(0, 0, 512, 512);
  return canvasTexture(c, { repeat: false });
}

export function leafTexture() {
  const [c, g] = canvas(128, 512);
  const r = rng(31);
  g.clearRect(0, 0, 128, 512);
  // rachis along the centre, leaflets angled outward
  for (let y = 10; y < 500; y += 7) {
    const t = y / 512;
    const len = 58 * Math.sin(Math.PI * (0.08 + 0.92 * t)) * (0.85 + r() * 0.3);
    const tone = 52 + r() * 34;
    g.strokeStyle = `rgb(${tone + 18},${tone + 40},${tone - 12})`;
    g.lineWidth = 3.2;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + dir * len * 0.5, y + 6, 64 + dir * len, y + 22 + r() * 8);
      g.stroke();
    }
  }
  g.strokeStyle = '#5c5236';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  return canvasTexture(c, { repeat: false });
}

export function glowTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,214,150,0.9)');
  grad.addColorStop(0.45, 'rgba(255,170,90,0.35)');
  grad.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return canvasTexture(c, { repeat: false });
}

// Soft rectangular halo, used behind images so they glow on their walls.
export function rectGlowTexture() {
  const [c, g] = canvas(256, 256);
  g.shadowColor = 'rgba(255,255,255,1)';
  g.shadowBlur = 46;
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 3; i++) g.fillRect(56, 56, 144, 144);
  return canvasTexture(c, { repeat: false });
}

// Soft sunset cloud: overlapping puffs, gold on top fading to violet underneath.
export function cloudTexture(seed = 1) {
  const [c, g] = canvas(512, 256);
  const r = rng(seed);
  const grad = g.createLinearGradient(0, 40, 0, 220);
  grad.addColorStop(0, 'rgba(255,214,160,1)');
  grad.addColorStop(0.5, 'rgba(255,150,140,1)');
  grad.addColorStop(1, 'rgba(150,90,150,1)');
  for (let i = 0; i < 26; i++) {
    const x = 70 + r() * 372, y = 110 + (r() - 0.5) * 70;
    const rad = 26 + r() * 60;
    const p = g.createRadialGradient(x, y, 0, x, y, rad);
    p.addColorStop(0, 'rgba(255,255,255,0.55)');
    p.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = p;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  return canvasTexture(c, { repeat: false });
}

// Exhibition label: number, title, subtitle. Drawn after web fonts have loaded.
export function labelTexture({ number, title, sub, width = 1024, height = 512, dark = false }) {
  const [c, g] = canvas(width, height);
  g.fillStyle = dark ? '#2a221c' : '#f3ebdf';
  g.fillRect(0, 0, width, height);
  g.fillStyle = dark ? 'rgba(242,166,90,0.9)' : '#b5653a';
  g.fillRect(64, 70, 70, 6);
  g.fillStyle = dark ? '#f3ebdf' : '#1e1b18';
  g.textBaseline = 'alphabetic';
  if (number) {
    g.font = '600 46px Montserrat, Arial, sans-serif';
    g.fillStyle = dark ? '#f2a65a' : '#b5653a';
    g.fillText(number, 64, 160);
  }
  g.fillStyle = dark ? '#f3ebdf' : '#1e1b18';
  let size = 92;
  g.font = `700 ${size}px Montserrat, Arial, sans-serif`;
  while (g.measureText(title.toUpperCase()).width > width - 128 && size > 40) {
    size -= 4;
    g.font = `700 ${size}px Montserrat, Arial, sans-serif`;
  }
  g.fillText(title.toUpperCase(), 64, number ? 280 : 230);
  if (sub) {
    g.font = 'italic 500 56px "Cormorant Garamond", Georgia, serif';
    g.fillStyle = dark ? 'rgba(243,235,223,0.8)' : '#4a4239';
    g.fillText(sub, 64, number ? 380 : 330);
  }
  return canvasTexture(c, { repeat: false });
}

export function signTexture(text, arrow = '→') {
  const [c, g] = canvas(1024, 256);
  const wood = g.createLinearGradient(0, 0, 0, 256);
  wood.addColorStop(0, '#8a6446');
  wood.addColorStop(1, '#6d4c34');
  g.fillStyle = wood;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(30,18,10,0.25)';
  for (let y = 18; y < 256; y += 40) g.fillRect(0, y, 1024, 2);
  g.fillStyle = '#f6ecdc';
  let size = 84;
  g.font = `600 ${size}px Montserrat, Arial, sans-serif`;
  const full = `${text.toUpperCase()}  ${arrow}`;
  while (g.measureText(full).width > 960 && size > 40) {
    size -= 4;
    g.font = `600 ${size}px Montserrat, Arial, sans-serif`;
  }
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(full, 512, 134);
  return canvasTexture(c, { repeat: false });
}
