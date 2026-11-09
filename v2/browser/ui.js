// Visitor interface: the field guide, the approach choice, the HUD and the journal.
// It renders from the snapshot and turns clicks and keys into commands.
// Copy is short, specific and free of developer terms.

import { COPY, KITTENS } from '../core/config.js';
import { CAMERA_ERRORS } from './camera.js';
import { svg } from './icons.js';

const TOOLS = ['FEED', 'PLAY', 'PET', 'WAIT'];
const TABS = ['litter', 'care', 'habitats', 'journal'];
const ROMAN = ['1', '2', '3'];
const CHAPTERS = {
  kitten: { name: 'The Jungle Nursery', icon: 'LEAF', thumb: 'kitten-jungle', line: 'Kitten. Everything is new; trust is earned slowly.' },
  juvenile: { name: 'The Snowfields', icon: 'SNOW', thumb: 'juvenile-snow', line: 'Juvenile. Bolder, faster, and tired sooner in the cold.' },
  adult: { name: 'The Desert', icon: 'SUN', thumb: 'adult-desert', line: 'Adult. Grown, and still free to say no.' },
};
const CARE = {
  FEED: 'Drop a fish where it can reach it. A full kitten will say so.',
  PLAY: 'Your hand becomes a yarn ball. It may chase, or ask for a pause.',
  PET: 'Rest a calm hand nearby. It comes closer when it is ready.',
  WAIT: 'Step back. Giving space is a way of caring too.',
};
const T = {
  calibLoading: 'Starting the camera…',
  calibLooking: 'Looking for your hand…',
  calibHold: 'There you are. Hold still for a moment…',
  pausedReasons: { user: 'Take your time.', hidden: 'The page went into the background.', idle: 'It seemed nobody was here.', system: 'Something needs a moment.' },
  reflectTitles: { grown: 'Grown, together', time_limit: 'Until next time', idle: 'It noticed you left', user: 'Thank you for visiting', pause_timeout: 'Thank you for visiting', staff: 'Thank you for visiting' },
  next: (s) => `Next visitor · ${s}s`,
  status: { mouse: 'Mouse', keyboard: 'Keyboard', valid: 'Hand found', uncertain: 'Hold still', lost: 'Finding your hand' },
  offerEnd: 'Whenever you are ready, you can end your visit here.',
  options: {
    camera: ['HAND', 'Your hand', 'One open hand in front of the camera.'],
    mouse: ['MOUSE', 'Mouse', 'Move to offer, click to drop food.'],
    keyboard: ['KEYS', 'Keyboard', 'Arrow keys to move, Space to offer.'],
  },
};
const $ = (id) => document.getElementById(id);
const swatchCss = (k) => `radial-gradient(circle at 35% 30%, ${k.coat.light}, ${k.coat.base} 55%, ${k.coat.mark})`;

export class UI {
  constructor({ dispatch, onChooseInput, onToggleSound }) {
    this.dispatch = dispatch;
    this.copy = COPY.en;
    this.tab = 'litter';
    this.lastState = null;
    this.tags = new Map();

    // field guide
    for (const b of document.querySelectorAll('.tabs [data-tab]')) b.onclick = () => this.setTab(b.dataset.tab);
    $('kittenCards').innerHTML = KITTENS.map((k, i) => `
      <button class="kitten" data-kitten="${k.id}" aria-pressed="false">
        <span class="swatch" style="background:${swatchCss(k)}"></span>
        <span><span class="name">${k.name}</span><span class="temper">${k.temperament}</span><span class="blurb" style="display:block">${k.blurb}</span></span>
        <kbd class="glyph">${i + 1}</kbd>
      </button>`).join('');
    for (const b of document.querySelectorAll('[data-kitten]')) b.onclick = () => dispatch({ type: 'choose_kitten', kitten: b.dataset.kitten });
    $('careRows').innerHTML = TOOLS.map((t, i) => `
      <div class="row"><span class="tile">${svg(t, 24)}</span><span><span class="t">${this.copy.tools[t]}</span><span class="d" style="display:block">${CARE[t]}</span></span><kbd class="glyph">${i + 1}</kbd></div>`).join('');
    $('habitatRows').innerHTML = Object.entries(CHAPTERS).map(([, c], i) => `
      <div class="row"><span class="thumb ${c.thumb}"></span><span><span class="t">${ROMAN[i]} · ${c.name}</span><span class="d" style="display:block">${c.line}</span></span><span class="tile" style="width:34px;height:34px">${svg(c.icon, 18)}</span></div>`).join('');
    this.setTab('litter');
    $('btnStart').onclick = () => dispatch({ type: 'start' });

    // approach
    for (const [id, src] of [['btnCamera', 'camera'], ['btnMouse', 'mouse'], ['btnKeyboard', 'keyboard']]) {
      const [icon, t, d] = T.options[src];
      $(id).innerHTML = `${svg(icon, 34)}<span class="t">${t}</span><span class="d">${d}</span>`;
      $(id).onclick = () => onChooseInput(src);
    }
    $('btnCamera').classList.add('recommended');
    $('btnCalibMouse').onclick = () => onChooseInput('mouse');
    $('btnCancel').onclick = () => dispatch({ type: 'end' });

    // HUD
    this.toolbar = $('toolbar');
    TOOLS.forEach((tool, i) => {
      const b = document.createElement('button');
      b.className = `slot${tool === 'WAIT' ? ' wait' : ''}`;
      b.dataset.tool = tool;
      b.innerHTML = `<kbd class="glyph">${i + 1}</kbd><span class="well">${svg(tool, 28)}</span><span class="label">${this.copy.tools[tool]}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); dispatch({ type: 'select_tool', tool }); });
      this.toolbar.appendChild(b);
    });
    $('btnEnd').onclick = (e) => { e.stopPropagation(); dispatch({ type: 'end' }); };
    $('btnSound').onclick = (e) => { e.stopPropagation(); onToggleSound(); };
    $('still').textContent = this.copy.stillThere;
    $('still').onclick = () => dispatch({ type: 'select_tool', tool: this.activeTool ?? 'FEED' });
    $('offerEnd').textContent = T.offerEnd;
    $('btnResume').onclick = () => dispatch({ type: 'resume' });
    $('btnSwitch').onclick = () => onChooseInput('mouse');
    $('btnPausedEnd').onclick = () => dispatch({ type: 'end' });
    $('btnNext').onclick = () => dispatch({ type: 'next' });
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== tab;
  }

  stepTab(dir) { const i = TABS.indexOf(this.tab); this.setTab(TABS[(i + dir + TABS.length) % TABS.length]); }

  show(id, on) { $(id).hidden = !on; }

  // x: { camera, soundOn, width, height, catPx, cursorPx, litterPx: [{ kitten, x, y }] }
  update(snap, x) {
    const st = snap.sessionState;
    if (st !== this.lastState) {
      this.lastState = st;
      this.show('guide', st === 'ATTRACT');
      this.show('consent', st === 'CONSENT');
      this.show('calibrate', st === 'CALIBRATING');
      this.show('paused', st === 'PAUSED');
      this.show('reflection', st === 'REFLECTION');
      this.show('ui', st === 'ACTIVE');
      const focus = { ATTRACT: 'btnStart', CONSENT: 'btnCamera', PAUSED: 'btnResume', REFLECTION: 'btnNext' }[st];
      if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 0);
    }
    this.nameTags(snap, x);
    if (st === 'ATTRACT') for (const b of document.querySelectorAll('[data-kitten]')) b.setAttribute('aria-pressed', String(b.dataset.kitten === snap.kitten.id));
    if (st === 'CONSENT') this.consent(x.camera);
    if (st === 'CALIBRATING') this.calibrating(snap, x.camera);
    if (st === 'PAUSED') $('pausedReason').textContent = T.pausedReasons[snap.pauseReason] ?? '';
    if (st === 'REFLECTION') this.reflection(snap);
    if (st === 'ACTIVE') this.active(snap, x);
  }

  // Name tags over the litter on the field guide; hidden during a visit.
  nameTags(snap, x) {
    const root = $('tags');
    const on = snap.sessionState === 'ATTRACT';
    const list = on ? [{ kitten: snap.kitten.id, ...x.catPx, chosen: true }, ...x.litterPx] : [];
    const keep = new Set(list.map((l) => l.kitten));
    for (const [k, el] of this.tags) if (!keep.has(k)) { el.remove(); this.tags.delete(k); }
    for (const l of list) {
      let el = this.tags.get(l.kitten);
      if (!el) {
        const k = KITTENS.find((q) => q.id === l.kitten);
        el = document.createElement('div');
        el.className = 'tag';
        el.innerHTML = `<span class="n">${k.name}</span><span class="k">${k.temperament}</span>`;
        root.appendChild(el);
        this.tags.set(l.kitten, el);
      }
      el.classList.toggle('chosen', !!l.chosen);
      el.style.left = `${l.x}px`;
      el.style.top = `${l.y - (l.r ?? 60) - 6}px`;
    }
  }

  consent(cam) {
    const err = $('cameraError');
    if (cam.status === 'failed') { err.hidden = false; err.textContent = CAMERA_ERRORS.en[cam.error] ?? ''; }
    else err.hidden = true;
  }

  calibrating(snap, cam) {
    const stable = Math.min(1, (snap.timers.calibStable ?? 0) / 1.5);
    $('calibArc').style.strokeDashoffset = String(289 * (1 - stable));
    $('calibStatus').textContent = cam.status === 'loading' ? T.calibLoading : stable > 0 ? T.calibHold : T.calibLooking;
  }

  reflection(snap) {
    const r = snap.recap;
    if (!r) return;
    const c = snap.creature, k = KITTENS.find((q) => q.id === snap.kitten.id);
    $('seal').style.background = swatchCss(k);
    $('sealNumeral').textContent = ROMAN[Math.min(2, Math.floor(c.ageProgress))];
    $('reflectTitle').textContent = T.reflectTitles[snap.endReason] ?? T.reflectTitles.user;
    $('reflectSub').textContent = `${k.name}, ${k.temperament} · Chapter ${ROMAN[Math.min(2, Math.floor(c.ageProgress))]}, ${CHAPTERS[c.phase].name}`;
    const html = r.lines.map((l) => `<li>${l.text}<span class="ev">${l.evidence.join(', ') || 'no events'}</span></li>`).join('');
    if ($('recap').innerHTML !== html) $('recap').innerHTML = html;
    const n = r.counts;
    $('recapCounts').innerHTML = `<span>${svg('FEED', 16)}${n.fed} fish</span><span>${svg('PLAY', 16)}${n.pounces} catches</span><span>${svg('PET', 16)}${n.contactSec}s of contact</span>`;
    $('btnNext').textContent = T.next(Math.ceil(snap.timers.reflectionLeft ?? 0));
  }

  active(snap, x) {
    const c = snap.creature;
    const idx = Math.min(2, Math.floor(c.ageProgress));
    $('numeral').innerHTML = `<span>${ROMAN[idx]}</span>`;
    $('chapter').textContent = `Chapter ${ROMAN[idx]} · ${CHAPTERS[c.phase].name}`;
    $('kname').textContent = snap.kitten.name;
    $('temper').textContent = snap.kitten.temperament;
    $('relation').textContent = this.copy.relation[c.relation];
    [...$('pips').children].forEach((el, i) => el.classList.toggle('on', i <= c.relation));
    [...document.querySelectorAll('#hud .growth i')].forEach((el, i) => el.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, c.ageProgress - i)) * 100)}%`));

    const src = snap.input.source;
    const q = src === 'camera' ? snap.input.quality : 'valid';
    const status = $('inputStatus');
    status.className = `chip ${q}`;
    status.innerHTML = `<span class="dot"></span>${src === 'camera' ? T.status[q] : T.status[src]}`;
    $('btnSound').innerHTML = `${svg(x.soundOn ? 'SOUND' : 'MUTE', 16)}${x.soundOn ? 'Sound' : 'Muted'}`;

    this.activeTool = snap.activeTool;
    for (const b of this.toolbar.children) b.setAttribute('aria-pressed', String(b.dataset.tool === snap.activeTool));
    $('toolHint').textContent = this.copy.toolHints[snap.activeTool];
    this.show('still', snap.stillThere);
    this.show('offerEnd', snap.offerEnd && !snap.stillThere);

    const h = snap.displayHint;
    const bubble = $('bubble'), sys = $('sysHint');
    if (h && (h.owner === 'creature' || h.owner === 'result')) {
      bubble.textContent = this.copy[h.code] ?? h.code;
      bubble.className = `show ${h.owner}`;
      bubble.style.left = `${clampX(x.catPx.x, x.width)}px`;
      bubble.style.top = `${Math.max(150, x.catPx.y - x.catPx.r)}px`;
    } else bubble.className = '';
    if (h && h.owner === 'system') {
      sys.innerHTML = `${svg('EYE', 18)}<span>${this.copy[h.code] ?? h.code}</span>`;
      sys.className = 'show';
      const at = x.cursorPx ?? { x: x.width / 2, y: x.height * 0.3 };
      sys.style.left = `${clampX(at.x, x.width)}px`;
      sys.style.top = `${Math.max(150, at.y - 34)}px`;
    } else sys.className = '';
  }
}

function clampX(v, w) { return Math.max(190, Math.min(w - 190, v)); }
