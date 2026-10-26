// App controller. Owns the three modes (intro, 3D world, portfolio) and every piece
// of HTML UI. The 3D world is loaded lazily and only drives navigation; all content
// comes from data.js, so portfolio mode works without Three.js ever loading.
import { person, projects, img, imgThumb } from './data.js';
import { Viewer } from './viewer.js';
import { createMosaic } from './mosaic.js';

const $ = (s, r = document) => r.querySelector(s);
const body = document.body;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) body.classList.add('touch');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const items = (p) => p.sections.flatMap((s) => s.items);
const projectById = (id) => projects.find((p) => p.id === id);

const state = {
  mode: 'intro',
  world: null,
  worldPromise: null,
  worldError: null,
  audio: null,
  panel: null,        // { kind: 'project' | 'about', id }
  near: null,         // the stop whose overview is showing
  wantsExplore: false,
};

const viewer = new Viewer($('#viewer'), {
  onOpen: () => state.world?.setInputEnabled(false),
  onClose: () => { if (!state.panel && overlay.hidden) state.world?.setInputEnabled(true); },
});

/* ------------------------------------------------------------------ */
/* Portfolio mode                                                       */
/* ------------------------------------------------------------------ */

function figure(item, cls = 'pf-item') {
  return `<figure class="${cls} ${item.kind}">
    <button type="button" data-open="${item.id}" aria-label="Open ${esc(item.caption)} full screen">
      <div class="frame"><img src="${img(item.id)}" alt="${esc(item.caption)}" loading="lazy" decoding="async"></div>
    </button>
    <figcaption>${esc(item.caption)}</figcaption>
  </figure>`;
}

function projectArticle(p) {
  const all = items(p);
  const hero = all.find((i) => i.id === p.hero);
  const heroBlock = p.heroSecond
    ? `<div class="pf-pair">
        ${[p.hero, p.heroSecond].map((id) => {
          const it = all.find((i) => i.id === id);
          return `<figure class="pf-hero-img ${it.kind}"><button type="button" data-open="${id}"><img src="${img(id)}" alt="${esc(it.caption)}" loading="lazy"></button></figure>`;
        }).join('')}
      </div>`
    : `<figure class="pf-hero-img"><button type="button" data-open="${hero.id}"><img src="${img(hero.id)}" alt="${esc(hero.caption)}" loading="lazy"></button></figure>`;

  return `<article class="pf-project" id="${p.id}" data-project="${p.id}">
    <div class="pf-head">
      <div>
        <p class="eyebrow">${p.number} / 0${projects.length} — ${esc(p.category)}</p>
        <h2 class="project-title">${esc(p.title)}</h2>
        <p class="meta">${esc(p.type)} · ${esc(p.location)}</p>
      </div>
      <div class="intro">${p.intro.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
    </div>
    ${heroBlock}
    ${p.sections.map((s) => `
      ${s.title ? `<h3 class="eyebrow pf-section-title">${esc(s.title)}</h3>` : ''}
      <div class="pf-grid">${s.items.filter((i) => !s.title && i.id === p.hero ? false : true).map((i) => figure(i)).join('')}</div>
    `).join('')}
  </article>`;
}

function aboutFacts() {
  const list = (rows) => `<ul class="about-list">${rows.map((r) => `<li><span class="yr">${esc(r.years)}</span>${esc(r.title)}<br><span style="color:var(--muted)">${esc(r.place)}${r.note ? ` · ${esc(r.note)}` : ''}</span></li>`).join('')}</ul>`;
  return `
    <div><h3 class="eyebrow">Education</h3>${list(person.education)}</div>
    <div><h3 class="eyebrow">Experience</h3>${list(person.experience)}</div>
    <div><h3 class="eyebrow">Recognition</h3><ul class="about-list">${person.awards.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
    <div><h3 class="eyebrow">Software</h3><div class="tags">${person.software.map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>`;
}

function contactLinks(cls) {
  const c = person.contact;
  const rows = [
    ['Email', c.email, `mailto:${c.email}`],
    ['LinkedIn', 'Vishakha Bharti', c.linkedin],
    ['Instagram', `@${c.instagramHandle}`, c.instagram],
    ['Portfolio PDF', `Download · ${person.pdf.size}`, person.pdf.href, true],
  ];
  return rows.map(([k, v, href, dl]) => cls === 'grid'
    ? `<a href="${href}" ${dl ? 'download' : 'target="_blank" rel="noopener"'}><span class="k">${k}</span><span class="v">${esc(v)}</span></a>`
    : `<a href="${href}" ${dl ? 'download' : 'target="_blank" rel="noopener"'}><span>${k}</span><span>${esc(v)}</span></a>`).join('');
}

function renderPortfolio() {
  const main = $('#portfolio');
  main.innerHTML = `
    <header class="pf-header">
      <button class="wordmark" type="button" data-go="intro">${esc(person.name)}</button>
      <nav class="pf-nav" aria-label="Portfolio">
        <a href="#/projects/${projects[0].id}">Projects</a>
        <a href="#/projects/about">About</a>
        <a href="#/projects/contact">Contact</a>
        <a href="${person.pdf.href}" download>PDF</a>
        <button class="btn btn-primary" type="button" data-go="explore" ${state.worldError ? 'hidden' : ''}>Explore in 3D</button>
      </nav>
    </header>
    <div class="pf-wrap">
      <section class="pf-hero">
        <p class="eyebrow">${esc(person.title)} · ${esc(person.years)}</p>
        <h1>${esc(person.name)}</h1>
        <p class="tagline">${esc(person.tagline)}</p>
        <ol class="pf-index">
          ${projects.map((p) => `<li><a href="#/projects/${p.id}"><span class="n">${p.number}</span><span class="t">${esc(p.title)}</span><span class="s">${esc(p.type)}</span></a></li>`).join('')}
        </ol>
      </section>
      ${projects.map(projectArticle).join('')}
      <section class="pf-about" id="about">
        <div class="pf-about-grid">
          <img src="${img(person.portrait)}" alt="Portrait of ${esc(person.name)}" loading="lazy">
          <div>
            <p class="eyebrow">About</p>
            <h2>${esc(person.name)}</h2>
            <div class="lead">${person.about.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
            <div class="pf-facts">${aboutFacts()}</div>
          </div>
        </div>
      </section>
    </div>
    <footer class="pf-contact" id="contact">
      <div class="pf-wrap">
        <p class="eyebrow">Contact</p>
        <h2>${esc(person.signoff)}</h2>
        <div class="pf-contact-grid">${contactLinks('grid')}</div>
        <div class="pf-foot"><span>© ${esc(person.name)} · ${esc(person.role)}</span>${state.worldError ? '' : '<button type="button" data-go="explore">Explore the beach in 3D</button>'}</div>
        <p class="pf-credits">3D scene: sky, textures, rocks, plants, lanterns, the ship and buoys from <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0).
          <a href="https://sketchfab.com/3d-models/coconut-palm-26e787f2ff2e4c0fb004c3b0210805a3" target="_blank" rel="noopener">Coconut Palm</a> and
          <a href="https://sketchfab.com/3d-models/curly-palm-00f2b57dd0e844edbeb116034fa471ec" target="_blank" rel="noopener">Curly Palm</a> by evolveduk,
          <a href="https://sketchfab.com/3d-models/mercedes-benz-g-class-w263-1a2a52b16cad4e618af347461817895c" target="_blank" rel="noopener">Mercedes Benz G-class W263</a> by Lexyc16,
          all <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, optimised for the web.</p>
      </div>
    </footer>`;
}

$('#portfolio').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const art = open.closest('[data-project]');
    const p = projectById(art.dataset.project);
    const list = items(p);
    viewer.open(list, Math.max(0, list.findIndex((i) => i.id === open.dataset.open)));
    return;
  }
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (go === 'intro') location.hash = '';
  if (go === 'explore') location.hash = '#/explore';
});

/* ------------------------------------------------------------------ */
/* Panel (3D mode)                                                      */
/* ------------------------------------------------------------------ */

const panel = $('#panel');

function projectPanel(p) {
  const i = projects.indexOf(p);
  const prev = projects[i - 1];
  const next = projects[i + 1];
  const [first, ...rest] = p.intro;
  return `
    <button class="panel-close" type="button" aria-label="Close">×</button>
    <p class="eyebrow">${p.number} / 0${projects.length} — ${esc(p.category)}</p>
    <h2 class="project-title" id="panel-title">${esc(p.title)}</h2>
    <p class="meta">${esc(p.type)} · ${esc(p.location)}</p>
    <div class="intro">
      <p>${esc(first)}</p>
      ${rest.length ? `<div class="more" hidden>${rest.map((t) => `<p>${esc(t)}</p>`).join('')}</div><button class="more-btn" type="button">Read more</button>` : ''}
    </div>
    ${p.sections.map((s) => `
      <h3 class="eyebrow panel-section-title">${esc(s.title || 'Drawings & renders')}</h3>
      <div class="thumbs">${s.items.map((it) => `
        <button class="thumb ${it.kind}" type="button" data-open="${it.id}">
          <span class="frame"><img src="${img(it.id)}" alt="" loading="lazy">${it.kind !== 'render' ? `<span class="badge">${it.kind === 'board' ? 'Board' : 'Drawing'}</span>` : ''}</span>
          <span class="cap">${esc(it.caption)}</span>
        </button>`).join('')}
      </div>`).join('')}
    <div class="panel-nav">
      ${prev ? `<button type="button" data-goto="${prev.id}">← Previous<small>${esc(prev.title)}</small></button>` : '<span></span>'}
      ${next ? `<button type="button" data-goto="${next.id}">Next →<small>${esc(next.title)}</small></button>` : `<button type="button" data-goto="pier">Next →<small>About & contact</small></button>`}
    </div>`;
}

function aboutPanel() {
  const [first, ...rest] = person.about;
  return `
    <button class="panel-close" type="button" aria-label="Close">×</button>
    <p class="eyebrow">The pier — About</p>
    <h2 class="project-title" id="panel-title">${esc(person.name)}</h2>
    <p class="meta">${esc(person.role)}</p>
    <div class="intro">
      <img class="about-portrait" src="${img(person.portrait)}" alt="Portrait of ${esc(person.name)}">
      <p>${esc(first)}</p>
      <div class="more" hidden>${rest.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
      <button class="more-btn" type="button">Read more</button>
    </div>
    <h3 class="eyebrow panel-section-title" style="clear:both">Education & experience</h3>
    <ul class="about-list">
      ${[...person.education.slice(0, 1), ...person.experience].map((r) => `<li><span class="yr">${esc(r.years)}</span>${esc(r.title)} — ${esc(r.place)}</li>`).join('')}
    </ul>
    <h3 class="eyebrow panel-section-title">Contact</h3>
    <div class="contact-links">${contactLinks('list')}</div>
    <p class="signoff">${esc(person.signoff)}</p>
    <div class="panel-nav">
      <button type="button" data-goto="${projects[projects.length - 1].id}">← Previous<small>${esc(projects[projects.length - 1].title)}</small></button>
      <button type="button" data-go="portfolio">Full portfolio →<small>All projects on one page</small></button>
    </div>`;
}

function openPanel(kind, id) {
  state.panel = { kind, id };
  panel.innerHTML = kind === 'project' ? projectPanel(projectById(id)) : aboutPanel();
  panel.hidden = false;
  panel.scrollTop = 0;
  overview.classList.remove('show');
  hideFinale();
  state.world?.setInputEnabled(false); // the wheel scrolls the sheet, not the journey
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
  panel.querySelector('.panel-close').focus({ preventScroll: true });
}

function closePanel() {
  if (!state.panel) return;
  state.panel = null;
  panel.classList.remove('open');
  setTimeout(() => { if (!state.panel) panel.hidden = true; }, 560);
  state.world?.setInputEnabled(true);
  if (state.near) onNear(state.near);
}

panel.addEventListener('click', (e) => {
  if (e.target.closest('.panel-close')) return closePanel();
  const more = e.target.closest('.more-btn');
  if (more) {
    const box = more.previousElementSibling;
    box.hidden = !box.hidden;
    more.textContent = box.hidden ? 'Read more' : 'Read less';
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open && state.panel?.kind === 'project') {
    const list = items(projectById(state.panel.id));
    viewer.open(list, list.findIndex((i) => i.id === open.dataset.open));
    return;
  }
  const to = e.target.closest('[data-goto]')?.dataset.goto;
  if (to) { closePanel(); return travelTo(to); }
  if (e.target.closest('[data-go="portfolio"]')) location.hash = '#/projects';
});

/* ------------------------------------------------------------------ */
/* Overview card: appears as the buggy arrives at a stop                */
/* ------------------------------------------------------------------ */

const overview = $('#overview');

const MODEL_STOP = '--model';  // a project's 3D building stop is "<project id>--model"

function overviewHtml(id) {
  if (id.endsWith(MODEL_STOP)) return modelHtml(projectById(id.slice(0, -MODEL_STOP.length)));
  const p = projectById(id);
  const all = items(p);
  const strip = [p.hero, ...(p.walls || [])].slice(0, 3);
  return `
    <p class="eyebrow">${p.number} / 0${projects.length} — ${esc(p.category)}</p>
    <h2 class="project-title">${esc(p.title)}</h2>
    <p class="meta">${esc(p.type)} · ${esc(p.location)}</p>
    <p class="summary">${esc(p.summary)}</p>
    <div class="ov-strip">${strip.map((sid) => `<button type="button" data-open="${sid}" aria-label="Open ${esc(all.find((i) => i.id === sid)?.caption || '')}"><img src="${imgThumb(sid)}" alt=""></button>`).join('')}</div>
    <div class="ov-actions"><button class="btn btn-primary btn-pulse" type="button" data-detail="${p.id}"><i class="live-dot" aria-hidden="true"></i>View project</button><span class="ov-count">${all.length} drawings & renders · or click the image</span></div>`;
}

// Her SketchUp building, as its own stop: the original file opens in SketchUp. A local file
// downloads (then opens in SketchUp); a link elsewhere (Google Drive) opens in a new tab.
function modelHtml(p) {
  const external = /^https?:/.test(p.skp.href);
  return `
    <p class="eyebrow">${p.number} — 3D model</p>
    <h2 class="project-title">${esc(p.title)}</h2>
    <p class="meta">${esc(p.type)} · modelled in SketchUp</p>
    <p class="summary">The building as Vishakha modelled it. Open the original SketchUp file to walk through every space.</p>
    <div class="ov-actions">
      <a class="btn btn-primary btn-pulse" href="${esc(p.skp.href)}" ${external ? 'target="_blank" rel="noopener"' : 'download'}>Open SketchUp file · .skp ${esc(p.skp.size)}</a>
      <button class="btn btn-ghost" type="button" data-detail="${p.id}">Photos & drawings</button>
    </div>`;
}

let overviewTimer = 0;
// The overview waits for the image's light sweep to pass, then fades in.
function showOverview(id, delay = 650) {
  clearTimeout(overviewTimer);
  if (state.panel) return;
  overviewTimer = setTimeout(() => {
    if (state.near !== id || state.panel) return;
    overview.innerHTML = overviewHtml(id);
    overview.hidden = false;
    overview.classList.remove('show');
    void overview.offsetWidth; // restart the entrance
    overview.classList.add('show');
  }, reducedMotion ? 0 : delay);
}

function hideOverview() {
  clearTimeout(overviewTimer);
  overview.classList.remove('show');
}

overview.addEventListener('click', (e) => {
  const d = e.target.closest('[data-detail]')?.dataset.detail;
  if (d) return openPanel('project', d);
  const open = e.target.closest('[data-open]');
  if (open && state.near && state.near !== 'pier') {
    const list = items(projectById(state.near));
    viewer.open(list, Math.max(0, list.findIndex((i) => i.id === open.dataset.open)));
  }
});

/* ------------------------------------------------------------------ */
/* Finale at the pier: who this is, front and centre                    */
/* ------------------------------------------------------------------ */

const finale = $('#finale');
const firstSentences = (text, n) => text.split(/(?<=\.)\s+/).slice(0, n).join(' ');

function finaleHtml() {
  const c = person.contact;
  return `
    <div class="finale-card">
      <div class="finale-bg"></div>
      <div class="finale-edge" aria-hidden="true"></div>
      <div class="finale-glare" aria-hidden="true"></div>
      <div class="finale-content">
      <img class="finale-portrait" src="${img(person.portrait)}" alt="Portrait of ${esc(person.name)}">
      <p class="eyebrow">The pier · About & contact</p>
      <h2 id="finale-title">${esc(person.name)}</h2>
      <p class="meta">${esc(person.role)}</p>
      <p class="about">${esc(firstSentences(person.about[0], 2))}</p>
      <div class="finale-contact">
        <a href="mailto:${c.email}">✉ ${esc(c.email)}</a>
        <a href="${c.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a>
        <a href="${c.instagram}" target="_blank" rel="noopener">@${esc(c.instagramHandle)} ↗</a>
      </div>
      <div class="finale-actions">
        <a class="btn btn-primary" href="${person.pdf.href}" download>Download portfolio · ${person.pdf.size}</a>
        <button class="btn btn-ghost" type="button" data-finale="about">More about Vishakha</button>
        <button class="btn btn-ghost" type="button" data-finale="projects">All projects</button>
      </div>
      <p class="signoff">${esc(person.signoff)}</p>
      </div>
    </div>`;
}

// The card leans towards the pointer; the glare follows it.
let tiltRaf = 0;
finale.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || reducedMotion) return;
  const card = finale.querySelector('.finale-card');
  if (!card) return;
  cancelAnimationFrame(tiltRaf);
  tiltRaf = requestAnimationFrame(() => {
    const r = card.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const cx = Math.max(-1.4, Math.min(1.4, dx)), cy = Math.max(-1.4, Math.min(1.4, dy));
    finale.style.setProperty('--ry', (cx * 11).toFixed(2));
    finale.style.setProperty('--rx', (-cy * 8).toFixed(2));
    card.style.setProperty('--gx', `${((dx + 1) / 2) * 100}%`);
    card.style.setProperty('--gy', `${((dy + 1) / 2) * 100}%`);
  });
});
finale.addEventListener('pointerleave', () => {
  finale.style.setProperty('--ry', '0');
  finale.style.setProperty('--rx', '0');
});

// The opening volley of fireworks goes up over the sea first; then the card.
let finaleTimer = 0;
function showFinale() {
  clearTimeout(finaleTimer);
  if (state.panel) return;
  if (!finale.innerHTML) finale.innerHTML = finaleHtml();
  finale.hidden = false;
  finaleTimer = setTimeout(() => finale.classList.add('show'), reducedMotion ? 0 : 2900);
}
function hideFinale() {
  clearTimeout(finaleTimer);
  finale.classList.remove('show');
}
finale.addEventListener('click', (e) => {
  const act = e.target.closest('[data-finale]')?.dataset.finale;
  if (act === 'about') openPanel('about', 'pier');
  if (act === 'projects') location.hash = '#/projects';
});

function onNear(id) {
  state.near = id;
  railTicks.forEach((b) => b.classList.toggle('active', b.dataset.stop === id));
  if (id === 'pier') { hideOverview(); showFinale(); }
  else if (id) { hideFinale(); showOverview(id); }
  else { hideOverview(); hideFinale(); }
}

/* ------------------------------------------------------------------ */
/* Projects overlay + journey rail (3D mode)                            */
/* ------------------------------------------------------------------ */

const overlay = $('#projects-overlay');
overlay.innerHTML = `
  <div class="glass overlay-card">
    <div class="overlay-head"><h2>Projects along the shore</h2><button class="panel-close" type="button" aria-label="Close" style="float:none;margin:0;position:static">×</button></div>
    <div class="overlay-grid">
      ${projects.map((p) => `<button class="overlay-item" type="button" data-goto="${p.id}"><img src="${imgThumb(p.hero)}" alt="" loading="lazy"><span><span class="eyebrow">${p.number}</span><span class="project-title" style="display:block">${esc(p.title)}</span><span class="t">${esc(p.type)} · ${esc(p.location)}</span></span></button>`).join('')}
      <button class="overlay-item wide" type="button" data-goto="pier"><span><span class="eyebrow">The pier</span><span class="project-title" style="display:block">About & Contact</span></span></button>
    </div>
  </div>`;
const openOverlay = () => { overlay.hidden = false; state.world?.setInputEnabled(false); overlay.querySelector('[data-goto]').focus(); };
const closeOverlay = () => { overlay.hidden = true; if (!state.panel) state.world?.setInputEnabled(true); };
overlay.addEventListener('click', (e) => {
  const to = e.target.closest('[data-goto]')?.dataset.goto;
  if (to) { closeOverlay(); return travelTo(to); }
  if (e.target === overlay || e.target.closest('.panel-close')) closeOverlay();
});

// The rail is a slim scroll track: stops are ticks at their real distance, the red dot is the buggy.
const rail = $('#rail');
const railTrack = rail.querySelector('.rail-track');
const railDot = rail.querySelector('.rail-dot');
const railFill = rail.querySelector('.rail-fill');
const stopsList = [['start', '—', 'Start'], ...projects.map((p) => [p.id, p.number, p.title]), ['pier', '∞', 'About & contact']];
railTrack.insertAdjacentHTML('beforeend', stopsList.map(([id, num, title]) => `<button class="rail-tick" type="button" data-stop="${id}" aria-label="${esc(title)}"><span class="num">${num}</span><span class="lbl">${esc(title)}</span></button>`).join(''));
let railTicks = [...rail.querySelectorAll('.rail-tick')];
rail.addEventListener('click', (e) => {
  const id = e.target.closest('[data-stop]')?.dataset.stop;
  if (id) travelTo(id);
});

// Ticks sit at each stop's real distance. Her 3D buildings (only on capable machines) get a
// smaller tick of their own, added once the beach knows where they are.
function placeRailTicks() {
  const w = state.world;
  if (!w) return;
  for (const st of w.stops.filter((x) => x.kind === 'model')) {
    if (rail.querySelector(`[data-stop="${st.id}"]`)) continue;
    const p = projectById(st.id.slice(0, -MODEL_STOP.length));
    railTrack.insertAdjacentHTML('beforeend', `<button class="rail-tick minor" type="button" data-stop="${st.id}" aria-label="${esc(p.title)}: 3D model"><span class="lbl">3D model</span></button>`);
  }
  railTicks = [...rail.querySelectorAll('.rail-tick')];
  const at = Object.fromEntries([['start', 0], ...w.stops.map((st) => [st.id, st.s / w.length])]);
  railTicks.forEach((b) => { const t = at[b.dataset.stop] ?? 0; b.style.top = `${t * 100}%`; b.dataset.t = t; });
}

function setRouteProgress(t) {
  const p = Math.min(1, Math.max(0, t)) * 100;
  railDot.style.top = `${p}%`;
  railFill.style.height = `${p}%`;
  railTicks.forEach((b) => b.classList.toggle('passed', Number(b.dataset.t) <= t + 0.002));
}

async function travelTo(id) {
  const w = state.world;
  if (!w) return;
  hideOverview();
  hideFinale();
  body.classList.add('hint-done');
  if (w.distanceTo(id) < 160 || reducedMotion) {
    w.goTo(id, reducedMotion);
    return;
  }
  const fade = $('#fade');
  fade.classList.add('on');
  await new Promise((r) => setTimeout(r, 320));
  w.goTo(id, true);
  setTimeout(() => fade.classList.remove('on'), 80);
}

/* ------------------------------------------------------------------ */
/* Loading screen                                                       */
/* ------------------------------------------------------------------ */

// A wall of hundreds of small pieces of her work fills in as the beach loads (see mosaic.js).
const mosaic = createMosaic($('#pl-mosaic'), { reducedMotion });
mosaic.start();

// a ring cursor; the enter button leans towards the pointer
const cursor = $('#pl-cursor');
const enterBtn = $('#btn-explore');
let px = innerWidth / 2, py = innerHeight / 2, cx = px, cy = py;
window.addEventListener('pointermove', (e) => {
  px = e.clientX;
  py = e.clientY;
  if (state.mode === 'intro') cursor.style.setProperty('--dx', '0px');
});
(function loop() {
  if (state.mode === 'intro') {
    const k = reducedMotion ? 1 : 0.18;
    cx += (px - cx) * k;
    cy += (py - cy) * k;
    cursor.style.setProperty('--cx', `${cx}px`);
    cursor.style.setProperty('--cy', `${cy}px`);
    cursor.style.setProperty('--dx', `${px - cx}px`);
    cursor.style.setProperty('--dy', `${py - cy}px`);
    if (!reducedMotion && !body.classList.contains('leaving')) {
      const r = enterBtn.getBoundingClientRect();
      const bx = px - (r.left + r.width / 2) + Number.parseFloat(enterBtn.style.getPropertyValue('--bx') || 0);
      const by = py - (r.top + r.height / 2) + Number.parseFloat(enterBtn.style.getPropertyValue('--by') || 0);
      const near = Math.hypot(bx * 0.6, by) < 110 && !enterBtn.disabled;
      enterBtn.style.setProperty('--bx', `${near ? bx * 0.16 : 0}px`);
      enterBtn.style.setProperty('--by', `${near ? by * 0.22 : 0}px`);
      cursor.classList.toggle('big', near);
    }
  }
  requestAnimationFrame(loop);
})();

// progress: the big counter eases towards the real value; status lines rotate while it loads
const loadNum = $('#load-num');
const loadLabel = $('#loader-label');
let shown = 0, actual = 0;
(function count() {
  shown += (actual - shown) * 0.06;
  if (actual >= 1 && shown > 0.995) shown = 1;
  loadNum.textContent = Math.round(shown * 100);
  if (shown < 1 && !state.worldError) requestAnimationFrame(count);
  else if (shown >= 1) readyToBegin();
})();

function readyToBegin() {
  if (!state.world) return setTimeout(readyToBegin, 100);
  exploreBtn.disabled = false;
  loadLabel.textContent = 'Ready · click anywhere';
  loadLabel.style.opacity = 1;
  mosaic.ready();
  placeRailTicks();
  body.classList.add('world-ready');
}

/* ------------------------------------------------------------------ */
/* World + audio                                                        */
/* ------------------------------------------------------------------ */

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

const exploreBtn = $('#btn-explore');

function worldFailed(err, message = '3D isn’t available on this device — showing the portfolio instead.') {
  console.warn('[world]', err);
  state.worldError = err || new Error('unavailable');
  body.classList.add('no-world');
  exploreBtn.hidden = true;
  $('#intro-hint').textContent = '3D isn’t supported here';
  loadLabel.textContent = 'The full portfolio is one click away';
  if (state.mode === 'world' || state.wantsExplore) {
    notice(message);
    location.hash = '#/projects';
  }
  if (!$('#portfolio').hidden) renderPortfolio();
}

function loadWorld() {
  if (state.worldPromise) return state.worldPromise;
  if (!hasWebGL()) {
    worldFailed(new Error('no WebGL2'));
    return (state.worldPromise = Promise.reject(state.worldError));
  }
  state.worldPromise = import('./world/world.js')
    .then((m) => m.createWorld({
      canvas: $('#world'),
      projects,
      reducedMotion,
      isTouch,
      onProgress: (f) => { actual = Math.max(actual, f); mosaic.setProgress(f); },
      onNear,
      onPick: (id) => openPanel('project', id),
      onDrive: ({ t, speed }) => { setRouteProgress(t); state.audio?.setEngine(speed); },
      onFirstScroll: () => body.classList.add('hint-done'),
      onFirework: (kind, distance, flight) => state.audio?.firework(kind, distance, flight),
      onFail: (err) => worldFailed(err, 'The 3D view stopped working — here is the portfolio instead.'),
    }))
    .then((w) => {
      state.world = w;
      w.setMode(state.mode === 'world' ? 'drive' : state.mode === 'intro' ? 'intro' : 'paused');
      return w;
    })
    .catch((err) => { worldFailed(err); throw err; });
  state.worldPromise.catch(() => {});
  return state.worldPromise;
}

async function startAudio() {
  if (state.audio) return state.audio.resume();
  try {
    const { createAudio } = await import('./audio.js');
    state.audio = createAudio();
    syncSoundButton();
  } catch (err) { console.warn('[audio]', err); }
}

function syncSoundButton() {
  $('#hud-sound').setAttribute('aria-pressed', String(!(state.audio?.muted)));
  $('#hud-sound').setAttribute('aria-label', state.audio?.muted ? 'Turn sound on' : 'Turn sound off');
}

/* ------------------------------------------------------------------ */
/* Modes + routing                                                      */
/* ------------------------------------------------------------------ */

function setMode(mode) {
  const prev = state.mode;
  state.mode = mode;
  if (prev === 'intro' && mode === 'world' && !reducedMotion) {
    body.classList.add('leaving');
    setTimeout(() => body.classList.remove('leaving'), 2200);
  }
  if (mode === 'intro') mosaic.start();
  else if (prev === 'intro' && mode === 'world') mosaic.leave(); // stops once the tiles have fallen
  else mosaic.stop();
  body.classList.remove('mode-intro', 'mode-world', 'mode-portfolio');
  body.classList.add(`mode-${mode}`);
  $('#portfolio').hidden = mode !== 'portfolio';
  if (mode !== 'world') { closePanel(); closeOverlay(); hideOverview(); hideFinale(); }
  if (mode === 'portfolio') state.audio?.suspend();
  state.world?.setMode(mode === 'world' ? 'drive' : mode === 'intro' ? 'intro' : 'paused');
}

async function route_() {
  const h = location.hash;
  if (h.startsWith('#/projects')) {
    if ($('#portfolio').innerHTML === '' || state.worldError) renderPortfolio();
    setMode('portfolio');
    const target = h.split('/')[2];
    const el = target ? document.getElementById(target) : null;
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
    else $('#portfolio').scrollTop = 0;
    return;
  }
  if (h === '#/explore') {
    state.wantsExplore = true;
    if (state.mode !== 'world') setMode('intro');
    try { await loadWorld(); } catch { return; }
    if (location.hash !== '#/explore') return;
    setMode('world');
    state.audio?.resume();
    return;
  }
  setMode('intro');
  if (!state.worldError) loadWorld();
}

window.addEventListener('hashchange', route_);

function beginJourney() {
  startAudio(); // needs this click (browsers only allow sound after a user gesture)
  if (location.hash === '#/explore') route_();
  else location.hash = '#/explore';
}
exploreBtn.addEventListener('click', beginJourney);
// once the beach has loaded, a click anywhere on the intro (or Enter) begins too
$('#intro').addEventListener('click', (e) => {
  if (state.mode === 'intro' && !exploreBtn.disabled && !e.target.closest('a, button')) beginJourney();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.mode === 'intro' && !exploreBtn.disabled && !e.target.closest?.('a, button, input')) beginJourney();
});
$('#btn-projects').addEventListener('click', () => { location.hash = '#/projects'; });
$('#hud-home').addEventListener('click', () => travelTo('start'));
$('#hud-projects').addEventListener('click', openOverlay);
$('#hud-about').addEventListener('click', () => travelTo('pier'));
$('#hud-portfolio').addEventListener('click', () => {
  const id = state.panel?.kind === 'project' ? state.panel.id : state.near && state.near !== 'pier' ? state.near.replace(MODEL_STOP, '') : null;
  location.hash = id ? `#/projects/${id}` : '#/projects';
});
$('#hud-sound').addEventListener('click', () => {
  if (!state.audio) return startAudio();
  state.audio.setMuted(!state.audio.muted);
  syncSoundButton();
});

window.addEventListener('keydown', (e) => {
  if (state.mode !== 'world' || e.key !== 'Escape') return;
  if (!overlay.hidden) closeOverlay();
  else if (state.panel) closePanel();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.audio?.suspend();
  else if (state.mode === 'world') state.audio?.resume();
});

/* ------------------------------------------------------------------ */

function notice(text) {
  const n = document.createElement('div');
  n.className = 'notice';
  n.setAttribute('role', 'status');
  n.textContent = text;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 5200);
}

route_();
