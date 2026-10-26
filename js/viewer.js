// Full-screen image viewer: wheel / pinch zoom, drag to pan, arrows between images.
// Shows the light preview at once, then swaps in the HD file when it has loaded.
import { img, imgHd } from './data.js';

const MAX_ZOOM = 6;

export class Viewer {
  constructor(root, { onOpen, onClose } = {}) {
    this.root = root;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.items = [];
    this.index = 0;
    this.s = 1;
    this.tx = 0;
    this.ty = 0;
    this.pointers = new Map();
    this.lastFocus = null;

    root.innerHTML = `
      <div class="v-top">
        <div class="v-cap"><small class="v-count"></small><span class="v-title"></span></div>
        <div class="v-tools">
          <button class="v-btn" data-act="out" type="button" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>
          <button class="v-btn" data-act="fit" type="button" aria-label="Fit to screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          <button class="v-btn" data-act="in" type="button" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M6 12h12M12 6v12"/></svg></button>
          <button class="v-btn" data-act="close" type="button" aria-label="Close viewer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      </div>
      <div class="v-stage"><img alt=""></div>
      <button class="v-btn v-arrow v-prev" data-act="prev" type="button" aria-label="Previous image"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button class="v-btn v-arrow v-next" data-act="next" type="button" aria-label="Next image"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
      <div class="v-bottom">Scroll or pinch to zoom · drag to move · ← → for next</div>
      <div class="v-loading" hidden>Loading full resolution…</div>`;

    this.stage = root.querySelector('.v-stage');
    this.imgEl = root.querySelector('.v-stage img');
    this.title = root.querySelector('.v-title');
    this.count = root.querySelector('.v-count');
    this.loading = root.querySelector('.v-loading');

    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') this.close();
      else if (act === 'prev') this.show(this.index - 1);
      else if (act === 'next') this.show(this.index + 1);
      else if (act === 'in') this.zoomAt(1.6);
      else if (act === 'out') this.zoomAt(1 / 1.6);
      else if (act === 'fit') this.reset();
    });

    this.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    }, { passive: false });
    this.stage.addEventListener('dblclick', (e) => {
      if (this.s > 1.05) this.reset();
      else this.zoomAt(2.6, e.clientX, e.clientY);
    });
    this.stage.addEventListener('pointerdown', (e) => this.down(e));
    this.stage.addEventListener('pointermove', (e) => this.move(e));
    this.stage.addEventListener('pointerup', (e) => this.up(e));
    this.stage.addEventListener('pointercancel', (e) => this.up(e));

    this.onKey = (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.show(this.index - 1);
      else if (e.key === 'ArrowRight') this.show(this.index + 1);
      else if (e.key === '+' || e.key === '=') this.zoomAt(1.4);
      else if (e.key === '-') this.zoomAt(1 / 1.4);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', () => !this.root.hidden && this.apply());
  }

  get isOpen() { return !this.root.hidden; }

  open(items, index = 0) {
    this.items = items;
    this.lastFocus = document.activeElement;
    this.root.hidden = false;
    this.onOpen?.();
    this.show(index);
    this.root.querySelector('[data-act="close"]').focus();
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.imgEl.removeAttribute('src');
    this.onClose?.();
    this.lastFocus?.focus?.();
  }

  show(i) {
    const n = this.items.length;
    this.index = (i + n) % n;
    const item = this.items[this.index];
    this.title.textContent = item.caption;
    this.count.textContent = `${this.index + 1} / ${n}`;
    this.root.querySelector('.v-prev').hidden = n < 2;
    this.root.querySelector('.v-next').hidden = n < 2;
    this.imgEl.alt = item.caption;
    this.imgEl.src = img(item.id);
    this.reset();

    const want = this.index;
    const hd = new Image();
    this.loading.hidden = false;
    hd.onload = () => {
      if (want !== this.index || this.root.hidden) return;
      this.imgEl.src = hd.src;
      this.loading.hidden = true;
    };
    hd.onerror = () => { this.loading.hidden = true; };
    hd.src = imgHd(item.id);
  }

  reset() {
    this.s = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  zoomAt(factor, cx, cy) {
    const r = this.stage.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const s1 = Math.min(MAX_ZOOM, Math.max(1, this.s * factor));
    const k = s1 / this.s;
    this.tx = px - (px - this.tx) * k;
    this.ty = py - (py - this.ty) * k;
    this.s = s1;
    this.apply();
  }

  apply() {
    const r = this.stage.getBoundingClientRect();
    const w = this.imgEl.offsetWidth * this.s;
    const h = this.imgEl.offsetHeight * this.s;
    const mx = Math.max(0, (w - r.width) / 2);
    const my = Math.max(0, (h - r.height) / 2);
    this.tx = Math.min(mx, Math.max(-mx, this.tx));
    this.ty = Math.min(my, Math.max(-my, this.ty));
    this.imgEl.style.transform = `translate(-50%, -50%) translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
  }

  down(e) {
    this.stage.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.stage.classList.add('dragging');
    if (this.pointers.size === 2) this.pinch = this.pinchState();
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2 && this.pinch) {
      const now = this.pinchState();
      this.zoomAt(now.d / this.pinch.d, now.cx, now.cy);
      this.tx += now.cx - this.pinch.cx;
      this.ty += now.cy - this.pinch.cy;
      this.apply();
      this.pinch = now;
    } else if (this.pointers.size === 1) {
      this.tx += dx;
      this.ty += dy;
      this.apply();
    }
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.stage.classList.remove('dragging');
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
}
