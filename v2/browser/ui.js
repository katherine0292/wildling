// Visitor interface: the field guide, the approach choice, the HUD and the journal.
// It renders from the snapshot and turns clicks and keys into commands.
// Copy is short, specific and free of developer terms.

import { COPY, KITTENS } from '../core/config.js';
import { CAMERA_ERRORS } from './camera.js';
import { svg } from './icons.js';
import { drawPostcard } from './keepsake.js';

const TOOLS = ['FEED', 'PLAY', 'PET', 'WAIT', 'LITTER'];
// What a visitor can ask of the kitten about a sibling (ADR-017), with the hand shape for each.
export const ASKS = [
  ['befriend', 'HAND', 'Make friends', 'open hand'],
  ['cuddle', 'PEACE', 'Cuddle up', 'two fingers'],
  ['fight', 'FIST', 'Play-fight', 'fist'],
  ['hiss', 'CLAW', 'Hiss', 'claw'],
];
const TABS = ['litter', 'care', 'habitats', 'journal'];
const ROMAN = ['1', '2', '3'];
const CHAPTERS = {
  kitten: { name: 'The Forest Clearing', short: 'Forest', icon: 'LEAF', thumb: 'kitten-jungle', line: 'Kitten. Big eyes, fuzzy coat. Chases yarn and tumbles with its litter.',
    looks: ['Big blue eyes and a fuzzy coat', 'A round head and a stubby tail'] },
  juvenile: { name: 'The Snowfields', short: 'Snowfields', icon: 'SNOW', thumb: 'juvenile-snow', line: 'Juvenile. Long legs, big ears, a winter ruff. Starts to hunt.',
    looks: ['Long legs and oversized ears', 'Its coat pattern comes in', 'Its eyes start to change colour'] },
  adult: { name: 'The Desert', short: 'Desert', icon: 'SUN', thumb: 'adult-desert', line: 'Adult. Full coat, ear tufts. Brings gifts to someone it trusts.',
    looks: ['Full size, with a sharp coat', 'Ear tufts and a chest ruff', 'Its adult eye colour'] },
};
const UNLOCK_COPY = { yarn: ['PLAY', 'Yarn play'], siblings: ['LITTER', 'Rough-and-tumble with the litter'], hunting: ['BUG', 'Hunting critters'], gifts: ['GIFT', 'Bringing you gifts'] };
const NEEDS = [['fed', 'FEED', 'Fed'], ['rested', 'WAIT', 'Rested'], ['played', 'PLAY', 'Played'], ['calm', 'CALM', 'Calm']];
const BLOCKED = { fullness: 'it is hungry', energy: 'it is tired', fun: 'it is bored', stress: 'it is tense', wellbeing: 'it needs a little more care overall' };
// Peek inside: plain names for each choice and each reason a choice is blocked.
const ACTS = {
  EXPLORE: ['WALK', 'Wander'], OBSERVE: ['EYE', 'Watch you'], SEEK_FOOD: ['FEED', 'Eat'], EAT: ['FEED', 'Eat'], REST: ['WAIT', 'Nap'],
  GROOM: ['WASH', 'Wash'], APPROACH: ['PET', 'Come to you'], PLAY: ['PLAY', 'Play'], CONTACT: ['PET', 'Be petted'],
  RETREAT: ['BACK', 'Back off'], SOCIAL: ['LITTER', 'Play with'], HUNT: ['BUG', 'Hunt'], GIFT: ['GIFT', 'Find you a gift'],
};
const WHY_NOT = {
  NEED_REST: 'too tired', PRESSURE_HIGH: 'too tense', TOO_FULL: 'full', HUNGRY_FIRST: 'hungry first', NOT_READY: 'not ready yet',
  PLAY_PAUSE: 'catching its breath', tool: 'not offered', input: "can't see you", far: 'too far', no_invitation: 'not invited',
  intent: 'waiting for a calm hand', break: 'short break', dwell: 'almost', no_food: 'no food', cooldown: 'just did that',
  alone: 'no sibling nearby', NOT_CLOSE_YET: 'not close enough yet', FRIENDS: "they're friends", too_young: 'too young yet', none: 'nothing to chase', trust: 'needs more trust', calm: 'feels safe',
};
const TOYS = [['yarn', 'PLAY', 'Yarn'], ['feather', 'FEATHER', 'Feather'], ['ball', 'BALL', 'Ball']];
const TOY_HINTS = {
  yarn: 'Your hand is a yarn ball. See if it wants to play',
  feather: 'A feather on a string. Slow swishes are easier to catch',
  ball: 'Click or pinch to throw the ball. It fetches on its own',
};
const HISS_WHY = { SIB_FOOD: 'it was eating', SIB_REST: 'it was napping', SIB_TENSE: 'it felt tense', SIB_STANDOFF: 'you asked, and it agreed' };
const NAMES = Object.fromEntries(KITTENS.map((k) => [k.id, k.name]));
const CARE = {
  FEED: 'Drop a fish where it can reach it. A full kitten will say so.',
  PLAY: 'Your hand becomes a yarn ball. It may chase, or ask for a pause.',
  PET: 'Rest a calm hand nearby. It comes closer when it is ready.',
  WAIT: 'Step back. Giving space is a way of caring too.',
  LITTER: 'Ask your kitten to make friends, cuddle, play-fight or hiss with a sibling. With the camera, hold a hand shape over the sibling.',
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
  constructor({ dispatch, onChooseInput, onToggleSound, keepsakes }) {
    this.dispatch = dispatch;
    this.keep = keepsakes;
    this.album = [];
    this.albumSession = null;
    this.copy = COPY.en;
    this.tab = 'litter';
    this.lastState = null;
    this.tags = new Map();

    // field guide
    for (const b of document.querySelectorAll('.tabs [data-tab]')) b.onclick = () => this.setTab(b.dataset.tab);
    $('kittenCards').innerHTML = KITTENS.map((k, i) => `
      <button class="kitten" data-kitten="${k.id}" aria-pressed="false">
        <span class="swatch" style="background:${swatchCss(k)}"></span>
        <span><span class="name">${k.name}</span><span class="temper">${k.temperament}</span><span class="blurb" style="display:block">${k.blurb}</span>${keepsakes?.badge(k.id) ? `<span class="memory">${keepsakes.badge(k.id)}</span>` : ''}</span>
        <kbd class="glyph">${i + 1}</kbd>
      </button>`).join('');
    for (const b of document.querySelectorAll('[data-kitten]')) b.onclick = () => dispatch({ type: 'choose_kitten', kitten: b.dataset.kitten });
    $('careRows').innerHTML = TOOLS.map((t, i) => `
      <div class="row"><span class="tile">${svg(t, 24)}</span><span><span class="t">${this.copy.tools[t]}</span><span class="d" style="display:block">${CARE[t]}</span></span><kbd class="glyph">${i + 1}</kbd></div>`).join('');
    $('habitatRows').innerHTML = Object.entries(CHAPTERS).map(([, c], i) => `
      <div class="row"><span class="thumb ${c.thumb}"></span><span><span class="t">${ROMAN[i]} · ${c.name}</span><span class="d" style="display:block">${c.line}</span></span><span class="tile" style="width:34px;height:34px">${svg(c.icon, 18)}</span></div>`).join('');
    this.setTab('litter');
    $('btnStart').onclick = () => dispatch({ type: 'start' });
    if (keepsakes?.enabled) {
      $('memoryRule').innerHTML = '<b>Remembered only here.</b> On this website your kitten can remember you in this browser: how often you met, how far it grew, the gifts it found. Nothing is uploaded. In the exhibition, everything is cleared for the next visitor.';
      $('btnForget').hidden = false;
      $('btnForget').onclick = () => { keepsakes.forget(); for (const m of document.querySelectorAll('.kitten .memory')) m.remove(); $('btnForget').textContent = 'Forgotten. Every kitten will meet you fresh.'; };
    }
    $('btnPostcard').innerHTML = `${svg('CAMERA', 18)}Save a postcard`;
    $('btnPostcard').onclick = () => this.savePostcard();
    $('wheel').innerHTML = ASKS.map(([act, icon, label, shape], i) => `<button data-act="${act}"><kbd class="glyph">${i + 1}</kbd>${svg(icon, 22)}<span class="t">${label}</span><span class="d">${shape}</span></button>`).join('');
    for (const b of $('wheel').children) b.addEventListener('click', (e) => { e.stopPropagation(); this.ask(b.dataset.act); });
    $('toyTray').innerHTML = TOYS.map(([id, icon, label]) => `<button data-toy="${id}" aria-pressed="false">${svg(icon, 18)}${label}</button>`).join('');
    for (const b of $('toyTray').children) b.addEventListener('click', (e) => { e.stopPropagation(); dispatch({ type: 'select_toy', toy: b.dataset.toy }); });

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
      b.className = `slot${tool === 'WAIT' ? ' wait' : ''}${tool === 'LITTER' ? ' litter' : ''}`;
      b.dataset.tool = tool;
      b.innerHTML = `<kbd class="glyph">${i + 1}</kbd><span class="well">${svg(tool, 28)}</span><span class="label">${this.copy.tools[tool]}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); dispatch({ type: 'select_tool', tool }); });
      this.toolbar.appendChild(b);
    });
    $('btnEnd').onclick = (e) => { e.stopPropagation(); dispatch({ type: 'end' }); };
    this.mindOn = false;
    $('btnMind').onclick = (e) => { e.stopPropagation(); this.toggleMind(); };
    $('gpSteps').innerHTML = Object.values(CHAPTERS).map((c, i) => `<span class="step" data-i="${i}">${svg(c.icon, 14)}<b>${ROMAN[i]}</b></span>`).join('<i></i>');
    $('gpNeeds').innerHTML = NEEDS.map(([k, icon, label]) => `<span class="need" data-need="${k}"><span class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle class="lvl" cx="18" cy="18" r="15"/></svg>${svg(icon, 16)}</span><span class="nl">${label}</span></span>`).join('');
    this.lastProgress = null;
    this.celebrateUntil = 0;
    $('btnSound').onclick = (e) => { e.stopPropagation(); onToggleSound(); };
    $('still').textContent = this.copy.stillThere;
    $('still').onclick = () => dispatch({ type: 'select_tool', tool: this.activeTool ?? 'FEED' });
    $('offerEnd').textContent = T.offerEnd;
    $('btnResume').onclick = () => dispatch({ type: 'resume' });
    $('btnSwitch').onclick = () => onChooseInput('mouse');
    $('btnPausedEnd').onclick = () => dispatch({ type: 'end' });
    $('btnNext').onclick = () => dispatch({ type: 'next' });
  }

  toggleMind() { this.mindOn = !this.mindOn; }

  // The ask wheel opens over a sibling; the kitten still decides.
  // The menu is pinned where it opened, so it never runs away from the pointer.
  openWheel(kitten) { this.wheelFor = kitten; this.wheelAt = null; this.show('wheel', true); }
  closeWheel() { this.wheelFor = null; this.wheelAt = null; this.show('wheel', false); }
  ask(act) { if (this.wheelFor) this.dispatch({ type: 'social_request', kitten: this.wheelFor, act }); this.closeWheel(); }
  get wheelOpen() { return !!this.wheelFor; }

  setTab(tab) {
    this.tab = tab;
    for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== tab;
  }

  // Photos taken automatically at moments that matter (first meal, a catch, a new chapter…).
  addPhoto(canvas, caption) {
    if (this.album.some((p) => p.caption === caption)) return;
    this.album.push({ canvas, caption, url: canvas.toDataURL('image/jpeg', 0.85) });
    if (this.album.length > 9) this.album.splice(1, 1); // keep the first photo, drop the oldest after it
  }

  savePostcard() {
    const r = this.lastRecap;
    if (!r) return;
    const { snap, k } = r, c = snap.creature;
    const chapter = Math.min(2, Math.floor(c.ageProgress)), grown = c.ageProgress >= 3;
    const rec = this.keepRecord ?? { visits: 1, best: grown ? 3 : chapter, gifts: (snap.gifts ?? []).map((g) => g.item), last: new Date().toISOString().slice(0, 10) };
    const card = drawPostcard({
      kitten: k.id,
      title: grown ? `${k.name}, all grown up` : `${k.name} and me`,
      sub: `${k.temperament} · Chapter ${ROMAN[chapter]}, ${CHAPTERS[c.phase].name}`,
      lines: snap.recap.lines.map((l) => l.text),
      photos: this.album.length > 3 ? [this.album[0], ...this.album.slice(-2)] : this.album,
      chapter, grown,
      link: this.keep ? this.keep.linkFor(k.id, rec) : null,
    });
    const a = document.createElement('a');
    a.download = `wildling-${k.id}-postcard.png`;
    a.href = card.toDataURL('image/png');
    a.click();
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
      if (st !== 'ACTIVE') this.show('celebrate', false);
      const focus = { ATTRACT: 'btnStart', CONSENT: 'btnCamera', PAUSED: 'btnResume', REFLECTION: 'btnNext' }[st];
      if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 0);
    }
    this.nameTags(snap, x);
    this.celebration(snap);
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
    const st = snap.sessionState;
    const on = st === 'ATTRACT';
    const litter = st === 'ACTIVE' && snap.activeTool === 'LITTER';
    const list = on ? [{ kitten: snap.kitten.id, ...x.catPx, chosen: true }, ...x.litterPx]
      : litter ? x.litterPx.filter((l) => !l.wrestling && !l.fleeing).map((l) => ({ ...l, invite: true })) : [];
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
      if (el.classList.contains('invite') !== !!l.invite) {
        el.classList.toggle('invite', !!l.invite);
        const k = KITTENS.find((q) => q.id === l.kitten);
        el.innerHTML = l.invite ? `<span class="n">${k.name}</span><span class="bond"></span>` : `<span class="n">${k.name}</span><span class="k">${k.temperament}</span>`;
        el.onclick = l.invite ? (e) => { e.stopPropagation(); this.openWheel(l.kitten); } : null;
      }
      if (l.invite) { // how close your kitten feels to this sibling
        const b = Math.max(0, Math.min(1, l.bond ?? 0.25)), n = b >= 0.6 ? 3 : b >= 0.35 ? 2 : b >= 0.15 ? 1 : 0;
        const word = ['Wary', 'Getting along', 'Friends', 'Best friends'][n];
        const html = `${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(3 - n)}<em>${word}</em>`;
        const bel = el.querySelector('.bond');
        if (bel && bel.innerHTML !== html) bel.innerHTML = html;
      }
      el.classList.toggle('invited', !!l.invited);
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
    const extra = [n.wrestles ? `<span>${svg('LITTER', 16)}${n.wrestles} tumble${n.wrestles > 1 ? 's' : ''}</span>` : '', n.hunts ? `<span>${svg('BUG', 16)}${n.hunts} hunt${n.hunts > 1 ? 's' : ''}</span>` : '', n.gifts ? `<span>${svg('GIFT', 16)}${n.gifts} gift${n.gifts > 1 ? 's' : ''}</span>` : ''].join('');
    $('recapCounts').innerHTML = `<span>${svg('FEED', 16)}${n.fed} fish</span><span>${svg('PLAY', 16)}${n.pounces} catches</span><span>${svg('PET', 16)}${n.contactSec}s of contact</span>${extra}`;
    const albumHtml = (this.album.length > 5 ? [this.album[0], ...this.album.slice(-4)] : this.album).map((p, i) => `<figure class="polaroid" style="--r:${[-4, 3, -2, 4, -3, 2][i]}deg"><img src="${p.url}" alt="${p.caption}"><span>${p.caption}</span></figure>`).join('');
    if (this.albumShown !== albumHtml) { this.albumShown = albumHtml; $('album').innerHTML = albumHtml; }
    this.lastRecap = { snap, k };
    if (this.keep?.enabled && !this.saved) {
      this.saved = true;
      this.keepRecord = this.keep.record(k.id, { chapter: Math.min(2, Math.floor(c.ageProgress)), grown: c.ageProgress >= 3, gifts: (snap.gifts ?? []).map((g) => g.item) });
    }
    $('keepNote').textContent = this.keep?.enabled
      ? `${k.name} will remember you in this browser${this.keepRecord ? ` (visit ${this.keepRecord.visits})` : ''}. The postcard's code lets you visit again from another device.`
      : 'This relationship lives only in this visit. The next visitor meets a kitten that has never met anyone.';
    const g = snap.growth;
    $('journalSteps').innerHTML = Object.values(CHAPTERS).map((ch, i) => `<span class="step ${i <= g.chapter || g.grown ? 'done' : ''}">${svg(ch.icon, 16)}<b>${ROMAN[i]}</b><em>${ch.short}</em></span>`).join('<i></i>');
    $('btnNext').textContent = T.next(Math.ceil(snap.timers.reflectionLeft ?? 0));
  }

  // The growth meter: how far to the next chapter, what holds it back, what comes next.
  growth(snap) {
    const g = snap.growth;
    const pct = g.grown ? 100 : Math.floor(g.progress * 100);
    const next = g.next ? CHAPTERS[g.next] : null;
    $('gpTitle').textContent = g.grown ? 'Fully grown' : g.next ? `Growing up · to Chapter ${ROMAN[g.chapter + 1]}` : 'Growing up · to fully grown';
    $('gpPct').textContent = `${pct}%`;
    $('gpFill').style.width = `${g.grown ? 100 : g.progress * 100}%`;
    const panel = $('growthPanel');
    panel.classList.toggle('paused', !g.ok && !g.grown);
    panel.classList.toggle('growing', g.growing);
    for (const el of $('gpSteps').querySelectorAll('.step')) el.classList.toggle('done', Number(el.dataset.i) < g.chapter || g.grown || Number(el.dataset.i) === g.chapter);
    for (const [k] of NEEDS) {
      const el = $('gpNeeds').querySelector(`[data-need="${k}"]`);
      const lvl = Math.max(0, Math.min(1, g.levels[k]));
      el.querySelector('.lvl').style.strokeDashoffset = String(94.2 * (1 - lvl));
      el.classList.toggle('low', !g.checks[k]);
    }
    $('gpStatus').textContent = g.grown ? 'Grown, together.' : g.ok ? (g.growing ? 'Growing. Every kind of care helps.' : 'Ready to grow.') : `Growth paused: ${BLOCKED[g.blockedBy] ?? 'it needs care'}.`;
    $('gpNext').innerHTML = next ? `<span class="lbl">Next · ${next.short}</span>${g.unlocks.map((u) => `<span class="unlock">${svg(UNLOCK_COPY[u][0], 14)}${UNLOCK_COPY[u][1]}</span>`).join('')}`
      : g.grown ? '' : `<span class="lbl">Next</span><span class="unlock">${svg('SPARK', 14)}Fully grown</span>`;
    // a "+n%" pop when a burst lands
    const b = snap.creature.lastBurst;
    if (b && b.time !== this.lastBurstAt) {
      this.lastBurstAt = b.time;
      const pop = $('gpPop');
      pop.textContent = `+${Math.round(b.amount * 100)}%`;
      pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
    }
  }

  // Peek inside: the decision trace in plain words, next to the kitten.
  mind(snap, x) {
    const el = $('mind');
    this.show('mind', this.mindOn);
    if (!this.mindOn) return;
    const c = snap.creature, d = snap.diagnostics;
    const actWord = { befriend: 'Make friends with', cuddle: 'Cuddle up with', fight: 'Play-fight with', hiss: 'Hiss at' };
    const label = (name) => (name === 'SOCIAL' && c.socialTarget ? `${actWord[c.socialAct] ?? 'Play with'} ${NAMES[c.socialTarget]}` : ACTS[name]?.[1] ?? name);
    const rows = d.candidates.filter((q) => q.available || /^[A-Z_]+$/.test(q.blocked ?? '') || ['too_young', 'trust', 'alone'].includes(q.blocked))
      .slice(0, 5).map((q) => {
        const chosen = q.name === d.chosen || (d.chosen === 'EAT' && q.name === 'SEEK_FOOD');
        const why = q.available ? (q.request ? 'you offered this' : '') : WHY_NOT[q.blocked] ?? q.blocked;
        return `<div class="m-row ${chosen ? 'chosen' : ''} ${q.available ? '' : 'blocked'}">${svg(ACTS[q.name]?.[0] ?? 'EYE', 16)}<span class="m-name">${label(q.name)}</span><span class="m-bar"><i style="width:${Math.round(Math.min(1, q.score) * 100)}%"></i></span><span class="m-why">${chosen ? 'chosen' : why}</span></div>`;
      }).join('');
    const now = d.forced ? `${label(d.chosen)}: ${d.forced}` : `${label(d.chosen)}: ${d.why}`;
    const react = c.reaction?.type === 'hiss' ? `<div class="m-react">Hissed at ${NAMES[c.reaction.sibling] ?? 'a sibling'}: ${HISS_WHY[c.reaction.reasonCode] ?? ''}.</div>` : '';
    const html = `<div class="m-head">${svg('THINK', 18)}<span>What ${snap.kitten.name} is weighing</span></div>${react}${rows}<div class="m-now">${now}</div><div class="m-foot">Safety rules first, then hand-written scores. Not a learned model.</div>`;
    if (el.innerHTML !== html) el.innerHTML = html;

  }

  // A short title card when the kitten reaches a new chapter, listing what changed.
  celebration(snap) {
    const now = performance.now();
    const c = snap.creature;
    const key = c.ageProgress >= 3 ? 'grown' : c.phase;
    if (this.celebratedFor === undefined) this.celebratedFor = key;
    if (snap.sessionState === 'ATTRACT') { this.celebratedFor = 'kitten'; return; }
    if (key !== this.celebratedFor && snap.sessionState === 'ACTIVE') {
      this.celebratedFor = key;
      const idx = { kitten: 0, juvenile: 1, adult: 2, grown: 2 }[key];
      const ch = CHAPTERS[key === 'grown' ? 'adult' : key];
      $('celEyebrow').textContent = key === 'grown' ? 'Fully grown' : `Chapter ${ROMAN[idx]}`;
      $('celTitle').textContent = key === 'grown' ? `${snap.kitten.name} is all grown up` : ch.name;
      $('celSub').textContent = key === 'grown' ? 'You raised it with balanced, patient care.' : `${snap.kitten.name} grew up a little.`;
      const fresh = key === 'grown' ? [] : ({ juvenile: ['hunting'], adult: ['gifts'] }[key] ?? []);
      $('celList').innerHTML = [...(key === 'grown' ? ['Every chapter complete'] : ch.looks).map((t) => `<li>${svg('SPARK', 16)}${t}</li>`),
        ...fresh.map((u) => `<li class="new">${svg(UNLOCK_COPY[u][0], 16)}New: ${UNLOCK_COPY[u][1]}</li>`)].join('');
      this.celebrateUntil = now + 3800;
      this.show('celebrate', true);
      const card = document.querySelector('.cel-card');
      card.classList.remove('reveal'); void card.offsetWidth; card.classList.add('reveal');
    }
    if (this.celebrateUntil && now > this.celebrateUntil) { this.celebrateUntil = 0; this.show('celebrate', false); }
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
    this.growth(snap);
    this.mind(snap, x);
    const gifts = c.stats.gifts ?? 0;
    this.show('treasures', gifts > 0);
    if (gifts) $('treasures').innerHTML = `${svg('GIFT', 16)}${gifts} gift${gifts > 1 ? 's' : ''} found`;

    const src = snap.input.source;
    const q = src === 'camera' ? snap.input.quality : 'valid';
    const status = $('inputStatus');
    status.className = `chip ${q}`;
    status.innerHTML = `<span class="dot"></span>${src === 'camera' ? T.status[q] : T.status[src]}`;
    $('btnSound').innerHTML = `${svg(x.soundOn ? 'SOUND' : 'MUTE', 16)}${x.soundOn ? 'Sound' : 'Muted'}`;
    $('btnMind').innerHTML = `${svg('THINK', 16)}Peek inside<kbd class="glyph">T</kbd>`;
    $('btnMind').setAttribute('aria-pressed', String(this.mindOn));

    this.activeTool = snap.activeTool;
    for (const b of this.toolbar.children) b.setAttribute('aria-pressed', String(b.dataset.tool === snap.activeTool));
    const play = snap.activeTool === 'PLAY';
    this.show('toyTray', play);
    if (this.wheelFor) {
      const at = x.litterPx.find((l) => l.kitten === this.wheelFor);
      if (!at || snap.activeTool !== 'LITTER') this.closeWheel();
      else if (!this.wheelAt) {
        this.wheelAt = { x: Math.max(170, Math.min(x.width - 170, at.x)), y: Math.max(150, at.y - at.r - 20) };
        const w = $('wheel'); w.style.left = `${this.wheelAt.x}px`; w.style.top = `${this.wheelAt.y}px`;
      }
    }
    if (play) for (const b of $('toyTray').children) b.setAttribute('aria-pressed', String(b.dataset.toy === snap.toy?.kind));
    $('toolHint').textContent = play ? TOY_HINTS[snap.toy?.kind ?? 'yarn']
      : snap.activeTool === 'LITTER' && snap.input.source === 'camera' ? 'Hold an open hand, two fingers, a fist or a claw over a sibling'
      : snap.activeTool === 'LITTER' ? 'Click a sibling, then choose what to ask' : this.copy.toolHints[snap.activeTool];
    if (snap.sessionId !== this.albumSession) { this.albumSession = snap.sessionId; this.album = []; this.saved = false; }
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
