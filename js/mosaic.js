// Loading-screen mosaic: hundreds of small tiles cut from the portfolio (tools/mosaic.py builds
// the atlas) fill the screen as the beach loads, brighten around the pointer and now and then flip
// to another piece of work. When the journey begins they fall away from the centre.
const ATLAS = 'assets/img/mosaic.webp';
const META = 'assets/img/mosaic.json';
const BG = '#0e0a0b';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

export function createMosaic(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let atlas = null, meta = null;
  let tiles = [];
  let W = 0, H = 0, dpr = 1, cw = 0, ch = 0;
  let progress = 0;          // 0..1, how much of the beach has loaded
  let readyAt = -1;          // time the beach finished loading (a wave of light runs out)
  let leaveAt = -1;          // time the journey began (tiles fall away)
  let running = false;
  let t = 0, last = 0, nextFlip = 0;
  let px = -1e4, py = -1e4, pointerT = -10;
  let sx = 0, sy = 0;        // spotlight, eased towards the pointer (or wandering on its own)
  let ox = 0, oy = 0;        // slight parallax drift of the whole wall

  Promise.all([
    fetch(META).then((r) => r.json()),
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = ATLAS; }),
  ]).then(([m, im]) => { meta = m; atlas = im; layout(); }).catch((err) => console.warn('[mosaic]', err));

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!meta) return;
    cw = Math.max(54, Math.min(92, W / 22));
    ch = cw * (meta.tileH / meta.tileW);
    const cols = Math.ceil(W / cw) + 2, rows = Math.ceil(H / ch) + 2;
    const x0 = (W - cols * cw) / 2, y0 = (H - rows * ch) / 2;
    const maxD = Math.hypot(W / 2, H / 2);
    const old = tiles;
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * cw, y = y0 + r * ch;
        const d = Math.hypot(x + cw / 2 - W / 2, y + ch / 2 - H / 2) / maxD;
        // never the same piece as the tile to the left or above
        let img;
        do img = Math.floor(Math.random() * meta.count);
        while ((c && tiles[tiles.length - 1].img === img) || (r && tiles[tiles.length - cols].img === img));
        const prev = old[tiles.length];
        tiles.push({
          x, y, d, img,
          at: d * 0.55 + Math.random() * 0.45,          // reveal from the centre out, loosely
          a: prev ? prev.a : 0,                         // reveal animation 0..1
          flip: -1, next: -1,
          out: d * 0.45 + Math.random() * 0.25,         // delay before falling away
          spin: (Math.random() - 0.5) * 0.9,
        });
      }
    }
  }
  window.addEventListener('resize', () => { if (running) layout(); });
  window.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; pointerT = t; });

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (!atlas || !meta) { requestAnimationFrame(frame); return; }

    // spotlight follows the pointer; with no pointer (phones, or idle) it drifts across the wall
    const idle = t - pointerT > 2.5;
    const tx = idle ? W * (0.5 + 0.32 * Math.sin(t * 0.23)) : px;
    const ty = idle ? H * (0.5 + 0.3 * Math.sin(t * 0.31 + 1)) : py;
    const k = 1 - Math.exp(-dt * (idle ? 1.5 : 9));
    sx += (tx - sx) * k; sy += (ty - sy) * k;
    if (!reducedMotion) {
      ox += ((W / 2 - (idle ? W / 2 : px)) * 0.025 - ox) * k;
      oy += ((H / 2 - (idle ? H / 2 : py)) * 0.025 - oy) * k;
    }

    // every so often a tile flips over to another piece of work
    if (!reducedMotion && t > nextFlip && leaveAt < 0) {
      nextFlip = t + 0.09;
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      if (tile.a >= 1 && tile.flip < 0) { tile.flip = 0; tile.next = Math.floor(Math.random() * meta.count); }
    }

    const shown = progress;
    const wave = readyAt >= 0 ? (t - readyAt) * Math.hypot(W, H) * 0.9 : -1e4;
    const gap = Math.max(1.5, cw * 0.035);
    const R = Math.max(170, Math.min(W, H) * 0.34);
    let alive = 0;
    for (const tile of tiles) {
      if (shown >= tile.at * 0.97 && tile.a < 1) tile.a = Math.min(1, tile.a + dt / (reducedMotion ? 0.3 : 0.7));
      if (tile.a <= 0) continue;
      let scale = reducedMotion ? 1 : 0.55 + 0.45 * easeOut(tile.a);
      let alpha = tile.a;
      let rot = 0, drop = 0, scaleX = 1;
      if (tile.flip >= 0) {
        tile.flip += dt / 0.55;
        if (tile.flip >= 0.5 && tile.next >= 0) { tile.img = tile.next; tile.next = -1; }
        if (tile.flip >= 1) tile.flip = -1;
        else scaleX = Math.abs(Math.cos(tile.flip * Math.PI));
      }
      if (leaveAt >= 0) {
        const u = Math.min(1, Math.max(0, (t - leaveAt - tile.out) / 0.55));
        if (u >= 1) continue;
        const e = easeIn(u);
        alpha *= 1 - u;
        scale *= 1 - e * 0.6;
        rot = tile.spin * e;
        drop = e * 140;
      }
      alive++;
      const cx = tile.x + cw / 2 + ox, cy = tile.y + ch / 2 + oy + drop;
      const dist = Math.hypot(cx - sx, cy - sy);
      const lit = Math.exp(-((dist / R) ** 2));
      const ring = Math.exp(-(((tile.d * Math.hypot(W / 2, H / 2) - wave) / 140) ** 2));
      const bright = Math.min(1, 0.3 + 0.7 * lit + 0.5 * ring);
      if (!reducedMotion) scale *= 1 + 0.07 * lit;
      ctx.globalAlpha = alpha * bright;
      const w = (cw - gap) * scale, h = (ch - gap) * scale;
      const col = tile.img % meta.cols, row = Math.floor(tile.img / meta.cols);
      if (rot || scaleX !== 1) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.scale(scaleX, 1);
        ctx.drawImage(atlas, col * meta.tileW, row * meta.tileH, meta.tileW, meta.tileH, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(atlas, col * meta.tileW, row * meta.tileH, meta.tileW, meta.tileH, cx - w / 2, cy - h / 2, w, h);
      }
    }
    ctx.globalAlpha = 1;
    // keep the name readable: a soft dark band through the middle, darker edges
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(14,10,11,0.3)');
    g.addColorStop(0.55, 'rgba(14,10,11,0.12)');
    g.addColorStop(1, 'rgba(14,10,11,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (leaveAt >= 0 && !alive) { running = false; return; }
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      leaveAt = -1;
      tiles.forEach((tile) => { tile.a = progress >= 1 ? 1 : tile.a; });
      layout();
      last = performance.now();
      requestAnimationFrame(frame);
    },
    setProgress(f) { progress = Math.max(progress, f); },
    ready() { if (readyAt < 0) readyAt = t; },
    leave() { if (running) leaveAt = t; },
    stop() { running = false; },
  };
}
