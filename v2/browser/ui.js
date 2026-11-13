// Visitor interface (experience spec V3): the entry, the input question, the heads-up
// display and the journal. It renders from the snapshot and turns clicks into commands.
//
// Layout rules: the clearing is the screen. The interface keeps to three corners (the
// kitten's name and bond, the visit controls, the pouch), and the kitten answers with its
// body and a pictogram, never with sentences. Words are kept for the system's own messages.

import { COPY, KITTENS } from '../core/config.js';
import { CAMERA_ERRORS } from './camera.js';
import { kit } from './kit.js';
import { svg } from './icons.js';
import { drawPostcard } from './keepsake.js';

const $ = (id) => document.getElementById(id);
const NAMES = Object.fromEntries(KITTENS.map((k) => [k.id, k.name]));
const swatchCss = (k) => `radial-gradient(circle at 34% 30%, ${k.coat.light} 0 24%, ${k.coat.base} 25% 58%, ${k.coat.mark} 59% 66%, ${k.coat.base} 67%)`;

// The kitten's replies as pictograms. The words stay as the accessible label.
const PICTO = {
  NEED_REST: 'mood/sleepy', PLAY_PAUSE: 'mood/sleepy', TOO_FULL: 'mood/relaxed', HUNGRY_FIRST: 'mood/hungry',
  NOT_READY: 'mood/curious', NOT_CLOSE_YET: 'mood/alert', PRESSURE_HIGH: 'mood/startled',
  CONTACT_ACCEPTED: 'mood/affectionate', SPACE_RESPECTED: 'mood/relaxed', RHYTHM_ADAPTED: 'ai/remembered',
  RETURNING: 'mood/affectionate', GIFT_GIVEN: 'mood/affectionate', TRICK_LEARNED: 'ai/learned',
  SIB_FOOD: 'mood/alert', SIB_REST: 'mood/sleepy', SIB_TENSE: 'mood/alert', SIB_PLAY: 'mood/playful',
  SIB_FRIEND: 'mood/affectionate', SIB_CUDDLE: 'mood/affectionate', SIB_STANDOFF: 'mood/startled', FRIENDS: 'mood/affectionate',
};
// What the kitten is asking for (the need cycle), and what in the pouch answers it.
const NEED_ICON = { food: 'inventory/treat', play: 'inventory/wand', touch: 'mood/affectionate', rest: 'mood/sleepy' };
const NEED_WORDS = { food: 'It is hungry', play: 'It wants to play', touch: 'It would like to be stroked', rest: 'It is tired. Give it some space' };
const NEED_ITEM = { food: 'treat', play: 'wand' };
// A woven basket heaped with little fish: the fish slot, drawn in colour so it reads as food.
const FISH_BASKET = `<svg class="basket" viewBox="0 0 48 40" width="40" height="34" aria-hidden="true">
  <g stroke="#2f2a1c" stroke-width="1" stroke-linejoin="round">
    <path d="M10 15c-2-6 4-9 8-6 2-5 9-5 11 0 4-3 10 0 8 6z" fill="#8fb3c8"/>
    <path d="M16 12l3 1.5M27 10.5l3 1.6M33 13l2.5 1" stroke="#5d7f95"/>
    <circle cx="20.5" cy="11.2" r=".9" fill="#1b2228" stroke="none"/><circle cx="31" cy="10.2" r=".9" fill="#1b2228" stroke="none"/>
    <path d="M6 15h36l-4 19c-.4 2-2 3-4 3H14c-2 0-3.6-1-4-3z" fill="#c99a5b"/>
    <path d="M8 21h32M9 27h30M10.5 33h27" stroke="#8a6334"/>
    <path d="M15 15l1.5 22M22 15l.5 22M29 15l-.5 22M36 15l-1.5 22" stroke="#8a6334" stroke-width=".8"/>
  </g></svg>`;
// V3 habitats: what each pouch item looks like and is called, and how to use it
const SNOWBALL = '<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><circle cx="20" cy="21" r="13" fill="#eef4fb" stroke="#2f3a46" stroke-width="1"/><circle cx="25" cy="25" r="2.4" fill="#c4d3e6"/><circle cx="14" cy="24" r="1.9" fill="#c4d3e6"/><circle cx="19" cy="14" r="1.6" fill="#c4d3e6"/></svg>';
const BOWL = '<svg viewBox="0 0 44 34" width="38" height="30" aria-hidden="true"><ellipse cx="22" cy="18" rx="19" ry="12" fill="#c47e4c" stroke="#2f2a1c" stroke-width="1"/><ellipse cx="22" cy="17" rx="13.5" ry="7.5" fill="#6db6d2"/><path d="M14 14q4-3 9-2" stroke="#e6f6fb" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
const ITEM_LOOK = {
  treat: { label: 'Fish', icon: () => FISH_BASKET },
  wand: { label: 'Feather', icon: () => kit('inventory/wand', 28) },
  snowball: { label: 'Snowball', icon: () => SNOWBALL },
  bowl: { label: 'Water', icon: () => BOWL },
};
const ITEM_GUIDE = {
  treat: { camera: 'Open your hand, move to any spot, then pinch to drop a fish. The basket stays in your hand', pointer: 'Click anywhere to drop a fish. Every kitten nearby will want it' },
  wand: { camera: 'Move the feather in short darts, then pause. Pinch Hand to put it down', pointer: 'Move the feather in short darts, then pause. Click Hand to put it down' },
  snowball: { camera: 'Swing your hand and pinch to throw the snowball', pointer: 'Move, then click to throw the snowball' },
  bowl: { camera: 'Move to where the bowl should go, then pinch to set it down', pointer: 'Click where the water bowl should go' },
};
const SCENE_NAME = { jungle: 'Jungle', snow: 'Snowfields', desert: 'Desert' };
const SCENE_NOTE = { jungle: 'The jungle clearing: fish and the feather', snow: 'The snowfields: a snowball instead of the feather', desert: 'The desert: a water bowl instead of the fish' };
const SCENE_ORDER = ['jungle', 'snow', 'desert'];
const WARN = new Set(['PRESSURE_HIGH', 'NOT_CLOSE_YET', 'SIB_STANDOFF', 'SIB_TENSE', 'SIB_FOOD']);

const READING = {
  gentle_approach: 'Slow approach', stable_contact: 'Steady hand', fast_approach: 'Fast approach',
  neutral_motion: 'Moving nearby', unknown: 'Hold still a moment', lost: 'Move into the clearing',
};
const REPLY = {
  NEED_REST: 'Needs a quiet moment', PLAY_PAUSE: 'Taking a break', TOO_FULL: 'Is full',
  HUNGRY_FIRST: 'Wants food first', NOT_READY: 'Is still deciding',
  PRESSURE_HIGH: 'Needs more space',
};
// The AI panel's words (Prototype A's MIND layout): plain names for each choice, why a choice
// is blocked, and a line of inner voice per behaviour.
const ACTS = {
  EXPLORE: 'Wander', OBSERVE: 'Watch you', SEEK_FOOD: 'Eat', EAT: 'Eat', REST: 'Nap', GROOM: 'Wash',
  APPROACH: 'Come to you', PLAY: 'Play', CONTACT: 'Be stroked', RETREAT: 'Back off', SOCIAL: 'Join a sibling',
  HUNT: 'Hunt', GIFT: 'Find you a gift', TRICK: 'A trick', FOLLOW: 'Follow your finger', DRINK: 'Drink',
};
const WHY_NOT = {
  NEED_REST: 'too tired', PRESSURE_HIGH: 'too tense', TOO_FULL: 'full', HUNGRY_FIRST: 'hungry first', NOT_READY: 'not ready yet',
  PLAY_PAUSE: 'catching its breath', tool: 'not offered', input: "can't see you", far: 'too far', no_invitation: 'not invited',
  intent: 'waiting for a calm hand', break: 'short break', dwell: 'almost', no_food: 'no food', cooldown: 'just did that',
  alone: 'no sibling nearby', NOT_CLOSE_YET: 'not close enough yet', FRIENDS: "they're friends", too_young: 'too young', none: 'nothing to chase', trust: 'needs more trust', calm: 'feels safe',
};
const THOUGHT = {
  EXPLORE: 'just looking around.', OBSERVE: 'who are you?', APPROACH: 'you seem gentle…', CONTACT: 'mm. that’s nice.',
  REST: 'zzz…', EAT: 'nom.', GROOM: 'tidy, tidy.', PLAY: 'got it, got it!', RETREAT: 'too close!', SOCIAL: 'hey, you!',
  TRICK: 'like this?', HISS: 'hss!', FOLLOW: 'wait for me!', FOOD: 'mine! hss!', DRINK: 'lap, lap, lap…',
};

const HOW = [
  ['ai/sees-you', 'Come in slowly', 'A slow, steady hand shrinks the ring around it. A fast one makes it back off.', 'Move your hand towards it, then stop.'],
  ['mood/affectionate', 'Stroke it', 'Rest your hand on it and move gently. Watch its tail: a flick means stop.', 'Keep the pointer on it and move slowly.'],
  ['inventory/treat', 'Drop a fish', 'Pinch a fish from the basket. Open your fingers, then pinch again anywhere to drop it. Every kitten nearby will want it.', 'Click the basket, then click where the fish should land.'],
  ['ai/sees-you', 'Point one finger', 'Point with your index finger and the nearest kitten follows it.', 'Press and hold on the ground: the nearest kitten follows the pointer.'],
  ['inventory/wand', 'Play with the feather', 'Pinch over the feather to pick it up. Dart, then pause.', 'Pick the feather; your pointer moves it.'],
  ['mood/relaxed', 'Step back', 'When it is tired or tense, move your hand away. It notices, and it comes back.', 'Move the pointer to the edge, or off the window.'],
];

const T = {
  calibLoading: 'Starting the camera…',
  calibLooking: 'Looking for your hand…',
  calibHold: 'There you are. Hold still for a moment…',
  pausedReasons: { user: 'Take your time.', hidden: 'The page went into the background.', idle: 'It seemed nobody was here.', system: 'Something needs a moment.' },
  titles: { user: 'Until next time', time_limit: 'Until next time', idle: 'It noticed you left', pause_timeout: 'Until next time', staff: 'Until next time', grown: 'Grown, together', asleep: '{name} fell asleep beside you' },
  status: { valid: 'Hand tracked', uncertain: 'Show one hand and hold still', lost: 'Show your open hand to continue' },
  offerEnd: 'Whenever you are ready, you can end your visit here.',
  options: {
    camera: ['system/camera-gesture', 'Your hand', 'Hold your hand up to the camera. Closest to meeting a real kitten.', 'Recommended'],
    mouse: ['system/mouse', 'Mouse or touch', 'Your pointer becomes your hand. Works on any device.', ''],
  },
};

export class UI {
  constructor({ dispatch, onChooseInput, onStart, onRecoverMouse, onToggleSound, onHelp, keepsakes }) {
    this.dispatch = dispatch;
    this.keep = keepsakes;
    this.album = [];
    this.albumSession = null;
    this.copy = COPY.en;
    this.lastState = null;
    this.tags = new Map();
    this.hover = null;
    this.mindOn = false;
    this.pulse = null;

    // entry
    // the cover offers the two ways in; either one starts the visit straight away
    $('btnStartHand').innerHTML = `${kit('system/camera-gesture', 24)}Use your hand`;
    $('btnStartMouse').innerHTML = `${kit('system/mouse', 24)}Use the mouse`;
    $('btnStartHand').onclick = () => onStart('camera');
    $('btnStartMouse').onclick = () => onStart('mouse');
    $('btnHow').onclick = () => this.showHow(true);
    $('btnHowClose').onclick = () => this.showHow(false);
    $('how').addEventListener('click', (e) => { if (e.target === $('how')) this.showHow(false); });

    // input
    for (const [id, src] of [['btnCamera', 'camera'], ['btnMouse', 'mouse']]) {
      const [icon, t, d, pill] = T.options[src];
      $(id).innerHTML = `${kit(icon, 30)}<b>${t}</b><span class="d">${d}</span>${pill ? `<span class="pill">${pill}</span>` : ''}`;
      $(id).onclick = () => onChooseInput(src);
    }
    $('btnKeyboard').onclick = () => onChooseInput('keyboard');
    $('btnRecoverMouse').onclick = onRecoverMouse;
    $('btnCalibMouse').onclick = () => onChooseInput('mouse');
    $('btnCancel').onclick = () => dispatch({ type: 'end' });

    // heads-up display
    $('btnMind').innerHTML = kit('ai/sees-you', 22);
    $('btnMind').onclick = (e) => { e.stopPropagation(); this.toggleMind(); };
    $('btnHelp').innerHTML = kit('system/help', 22);
    $('btnHelp').onclick = (e) => { e.stopPropagation(); (onHelp ?? (() => this.showHow(true)))(); };
    $('btnEnd').innerHTML = kit('system/end', 22);
    $('btnEnd').onclick = (e) => { e.stopPropagation(); dispatch({ type: 'end' }); };
    $('btnSound').onclick = (e) => { e.stopPropagation(); onToggleSound(); };
    for (const b of document.querySelectorAll('.scene-arrow')) b.addEventListener('click', (e) => { e.stopPropagation(); dispatch({ type: 'scene', dir: Number(b.dataset.dir) }); });
    for (const b of document.querySelectorAll('.scene-arrow')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const b of document.querySelectorAll('#pouch .slot')) {
      b.querySelector('.w').innerHTML = b.dataset.item === 'treat' ? FISH_BASKET : b.dataset.item === 'hand' ? svg('HAND', 30) : kit(`inventory/${b.dataset.item}`, 28);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.take(b.dataset.item); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    $('still').textContent = this.copy.stillThere;
    $('offerEnd').textContent = T.offerEnd;
    $('btnResume').onclick = () => dispatch({ type: 'resume' });
    $('btnSwitch').onclick = () => onChooseInput('mouse');
    $('btnPausedEnd').onclick = () => dispatch({ type: 'end' });
    $('btnNext').onclick = () => dispatch({ type: 'next' });
    $('btnPostcard').innerHTML = `${kit('journal/download', 20)}Save a postcard`;
    $('btnPostcard').onclick = () => this.savePostcard();
  }

  blocksSceneAt(x, y) {
    return !!document.elementFromPoint(x, y)?.closest('button, [role="dialog"], #pouch, #coach');
  }

  // A tracked hand is never pixel-exact: the button under the hand wins, else the nearest
  // visible button within a small reach, so a pinch just beside a pouch slot still takes it.
  buttonAt(x, y, reach = 56) {
    const under = document.elementFromPoint(x, y)?.closest('button');
    if (under) return under;
    let best = null, bestD = reach;
    for (const b of document.querySelectorAll('button')) {
      if (b.disabled || b.classList.contains('dwell') || !b.offsetParent || b.closest('[hidden]')) continue; // edge arrows need the hand right on them
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bestD && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === b) { best = b; bestD = d; }
    }
    return best;
  }

  activateAt(x, y) {
    const button = this.buttonAt(x, y);
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    return this.blocksSceneAt(x, y);
  }

  // Take something from the pouch. It stays in hand until something else is taken; the Hand
  // slot empties the hand for stroking. Taking what is already held changes nothing, so a
  // second pinch on the same slot never drops it by accident.
  take(item) {
    const next = item === 'hand' ? null : item;
    if (next === (this.held ?? null)) return;
    this.dispatch({ type: 'hold', item: next });
  }

  showHow(on, cam = this.lastSource === 'camera') {
    if (on) $('howGrid').innerHTML = HOW.map(([icon, t, d, mouse]) => `<div class="how-item">${kit(icon, 26)}<b>${t}</b><span>${cam ? d : mouse}</span></div>`).join('');
    $('howTitle').textContent = `${['Four', 'Five', 'Six', 'Seven'][HOW.length - 4] ?? HOW.length} things you can do`;
    this.show('how', on);
    if (on) setTimeout(() => $('btnHowClose').focus({ preventScroll: true }), 0);
  }
  get howOpen() { return !$('how').hidden; }

  toggleMind() { this.mindOn = !this.mindOn; }
  // Holding V shows the view only while held; the eye button and T keep it open.
  holdMind(on) { this.mindHeld = on; }
  get mindVisible() { return this.mindOn || !!this.mindHeld; }

  // Pointer over the clearing on the entry screen: which kitten is under it.
  hoverAt(px, py) { this.hoverPoint = px === null ? null : { x: px, y: py }; }
  kittenAt(px, py, x) {
    if (!x) return null;
    const all = [{ kitten: this.chosen, ...x.catPx }, ...x.litterPx];
    let best = null, bd = Infinity;
    for (const l of all) { const d = Math.hypot(l.x - px, l.y - py); if (d < (l.r ?? 60) * 1.4 && d < bd) { bd = d; best = l.kitten; } }
    return best;
  }

  // Photos taken automatically at moments that matter.
  addPhoto(canvas, caption) {
    if (this.album.some((p) => p.caption === caption)) return;
    this.album.push({ canvas, caption, url: canvas.toDataURL('image/jpeg', 0.85), at: this.activeSec ?? 0 });
    if (this.album.length > 9) this.album.splice(1, 1); // keep the first photo, drop the oldest after it
  }

  savePostcard() {
    const r = this.lastRecap;
    if (!r) return;
    const { snap, k } = r;
    const rec = this.keepRecord ?? { visits: 1, best: 0, gifts: [], last: new Date().toISOString().slice(0, 10) };
    const card = drawPostcard({
      kitten: k.id,
      title: `${k.name} and me`,
      sub: `${k.temperament} · ${this.copy.relation[snap.creature.relation].toLowerCase()}`,
      lines: snap.recap.lines.map((l) => l.text),
      photos: this.pickPhotos(),
      chapter: 0, grown: false,
      link: this.keep ? this.keep.linkFor(k.id, rec) : null,
    });
    const a = document.createElement('a');
    a.download = `wildling-${k.id}-postcard.png`;
    a.href = card.toDataURL('image/png');
    a.click();
  }

  pickPhotos() { return this.album.length > 3 ? [this.album[0], this.album[Math.floor(this.album.length / 2)], this.album[this.album.length - 1]] : this.album; }

  show(id, on) { $(id).hidden = !on; }

  // x: { camera, soundOn, width, height, catPx, cursorPx, litterPx: [{ kitten, x, y, r }] }
  update(snap, x) {
    const st = snap.sessionState;
    this.chosen = snap.kitten.id;
    this.lastSource = snap.input.source;
    this.x = x;
    if (st !== this.lastState) {
      this.lastState = st;
      this.show('entry', st === 'ATTRACT');
      this.show('consent', st === 'CONSENT');
      this.show('calibrate', st === 'CALIBRATING');
      this.show('paused', st === 'PAUSED');
      this.show('reflection', st === 'REFLECTION');
      this.show('ui', st === 'ACTIVE');
      if (st !== 'ATTRACT' && st !== 'ACTIVE') this.showHow(false);
      document.body.dataset.state = st.toLowerCase();
      const focus = { ATTRACT: 'btnStartHand', CONSENT: 'btnCamera', PAUSED: 'btnResume', REFLECTION: 'btnNext' }[st];
      if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 0);
    }
    this.nameTags(snap, x);
    this.handPointer(snap, x);
    if (st === 'ATTRACT') this.entry(snap);
    if (st === 'CONSENT') this.consent(x.camera);
    if (st === 'CALIBRATING') this.calibrating(snap, x.camera);
    if (st === 'PAUSED') $('pausedReason').textContent = T.pausedReasons[snap.pauseReason] ?? '';
    if (st === 'REFLECTION') this.reflection(snap);
    if (st === 'ACTIVE') this.active(snap, x);
  }

  // V3 habitats: the pouch shows this habitat's two items, the edge arrows name where they lead.
  habitat(snap) {
    const items = snap.items ?? ['treat', 'wand'];
    if (this.itemsShown !== items.join()) {
      this.itemsShown = items.join();
      [...document.querySelectorAll('#pouch .slot:not(.hand)')].forEach((b, i) => {
        b.dataset.item = items[i];
        b.querySelector('.w').innerHTML = ITEM_LOOK[items[i]].icon();
        b.querySelector('.l').textContent = ITEM_LOOK[items[i]].label;
      });
    }
    const i = SCENE_ORDER.indexOf(snap.scene ?? 'jungle');
    const left = SCENE_ORDER[(i + 2) % 3], right = SCENE_ORDER[(i + 1) % 3];
    $('sceneLeft').querySelector('.lbl').textContent = SCENE_NAME[left];
    $('sceneRight').querySelector('.lbl').textContent = SCENE_NAME[right];
    $('sceneLeft').setAttribute('aria-label', `Go to the ${SCENE_NAME[left]}`);
    $('sceneRight').setAttribute('aria-label', `Go to the ${SCENE_NAME[right]}`);
    if (this.guideUntil && performance.now() > this.guideUntil) { this.guideUntil = 0; this.show('toolGuide', false); }
  }

  // Semantic events the page forwards: a short how-to when something is picked up, and a
  // line naming the habitat when it changes.
  onEvent(e, snap) {
    const cam = snap?.input?.source === 'camera';
    if (e.type === 'held' && e.item) this.guide(ITEM_GUIDE[e.item]?.[cam ? 'camera' : 'pointer']);
    if (e.type === 'scene_changed') this.guide(SCENE_NOTE[e.measurement?.to]);
  }

  guide(text) {
    if (!text) return;
    const el = $('toolGuide');
    el.innerHTML = `${kit('system/help', 20)}<span>${text}</span>`;
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    this.guideUntil = performance.now() + 4200;
  }

  // The hand as a pointer for the interface: over a dimmed screen (pause, journal) the canvas
  // hand is hidden, so a ring follows the palm; on any screen the button under the hand lights
  // up, and a pinch presses it, exactly like a click.
  handPointer(snap, x) {
    const st = snap.sessionState, cam = snap.input.source === 'camera';
    const at = !cam ? null : st === 'ACTIVE' ? (snap.input.quality === 'valid' ? x.cursorPx : null) : x.handPx;
    this.handPx = at;
    const ptr = $('handPointer');
    const dom = cam && at && st !== 'ACTIVE';
    ptr.hidden = !dom;
    if (dom) { ptr.style.left = `${at.x}px`; ptr.style.top = `${at.y}px`; }
    const target = at ? this.buttonAt(at.x, at.y) : null;
    if (target !== this.handTarget) {
      this.handTarget?.classList.remove('hand-target');
      this.handTarget?.style.setProperty('--p', '0%');
      target?.classList.add('hand-target');
      this.handTarget = target;
      this.dwellSince = performance.now();
    }
    // a hand resting on an edge arrow fills its ring, then presses it: no pinch needed
    if (target?.classList.contains('dwell') && performance.now() > (this.dwellCooldown ?? 0)) {
      const k = Math.min(1, (performance.now() - this.dwellSince) / 900);
      target.style.setProperty('--p', `${Math.round(k * 100)}%`);
      if (k >= 1) { target.click(); target.style.setProperty('--p', '0%'); this.dwellCooldown = performance.now() + 1500; this.dwellSince = performance.now(); }
    }
  }

  entry(snap) {
    const k = KITTENS.find((q) => q.id === snap.kitten.id);
    void k; // every kitten can be met; there is nothing to choose before the visit
  }

  // Names over the litter on the entry screen. The chosen or pointed-at kitten shows its
  // temperament; clicking a tag chooses that kitten.
  nameTags(snap, x) {
    const root = $('tags');
    const on = snap.sessionState === 'ATTRACT' && !this.howOpen;
    const list = on ? [{ kitten: snap.kitten.id, ...x.catPx }, ...x.litterPx] : [];
    this.hover = on && this.hoverPoint ? this.kittenAt(this.hoverPoint.x, this.hoverPoint.y, x) : null;
    const keep = new Set(list.map((l) => l.kitten));
    for (const [k, el] of this.tags) if (!keep.has(k)) { el.remove(); this.tags.delete(k); }
    for (const l of list) {
      let el = this.tags.get(l.kitten);
      if (!el) {
        const k = KITTENS.find((q) => q.id === l.kitten);
        el = document.createElement('div'); // a label, not a control: every kitten can be met
        el.className = 'tag glass';
        el.innerHTML = `<b>${k.name}</b><span>${k.temperament[0].toUpperCase()}${k.temperament.slice(1)}. ${k.blurb}</span>${this.keep?.badge(k.id) ? `<em>${this.keep.badge(k.id)}</em>` : ''}`;
        root.appendChild(el);
        this.tags.set(l.kitten, el);
      }
      el.classList.toggle('open', l.kitten === this.hover);
      // keep the tag on screen, even when the kitten is near an edge
      const half = el.offsetWidth / 2 + 8;
      el.style.left = `${Math.max(half, Math.min(x.width - half, l.x))}px`;
      el.style.top = `${Math.max(el.offsetHeight + 12, l.y - (l.r ?? 60) * 0.9)}px`;
    }
  }

  consent(cam) {
    const err = $('cameraError');
    if (cam.status === 'failed') { err.hidden = false; err.textContent = CAMERA_ERRORS.en[cam.error] ?? ''; } else err.hidden = true;
  }

  calibrating(snap, cam) {
    const stable = Math.min(1, (snap.timers.calibStable ?? 0) / 1.5);
    $('calibArc').style.strokeDashoffset = String(289 * (1 - stable));
    $('calibStatus').textContent = cam.status === 'loading' ? T.calibLoading : stable > 0 ? T.calibHold : T.calibLooking;
  }

  reflection(snap) {
    const r = snap.recap;
    if (!r) return;
    const k = KITTENS.find((q) => q.id === snap.kitten.id);
    const mins = Math.max(1, Math.round((snap.timers.active ?? 0) / 60));
    $('reflectEyebrow').textContent = `A first meeting · ${mins} minute${mins > 1 ? 's' : ''}`;
    $('reflectTitle').textContent = (T.titles[snap.endReason] ?? T.titles.user).replace('{name}', k.name);
    $('reflectSub').textContent = `${k.name}, ${k.temperament}. ${this.copy.relation[snap.creature.relation]}.`;
    // what it learned about you comes first; the event diary stands in when there is nothing to say yet
    const learned = r.learned ?? [];
    this.show('learned', learned.length > 0);
    $('learnedTitle').innerHTML = `${kit('ai/remembered', 20)}What ${k.name} learned about you`;
    const lhtml = learned.map((l) => `<li>${l.text} <span>${l.detail}</span><span class="ev">${l.evidence.join(', ')}</span></li>`).join('');
    if ($('learnedList').innerHTML !== lhtml) $('learnedList').innerHTML = lhtml;
    const html = r.lines.map((l) => `<li>${l.text}<span class="ev">${l.evidence.join(', ') || 'no events'}</span></li>`).join('');
    if ($('recap').innerHTML !== html) $('recap').innerHTML = html;
    this.show('recap', learned.length === 0);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const albumHtml = this.pickPhotos().map((p) => `<figure class="pol"><img src="${p.url}" alt="${p.caption}"><b>${p.caption}</b><span>${fmt(p.at)}</span></figure>`).join('');
    if (this.albumShown !== albumHtml) { this.albumShown = albumHtml; $('album').innerHTML = albumHtml; }
    $('album').hidden = !this.album.length;
    this.lastRecap = { snap, k };
    if (this.keep?.enabled && !this.saved) {
      this.saved = true;
      this.keepRecord = this.keep.record(k.id, { chapter: 0, grown: false, gifts: (snap.gifts ?? []).map((g) => g.item) });
    }
    $('keepNote').textContent = this.keep?.enabled
      ? `${k.name} will remember you in this browser${this.keepRecord ? ` (visit ${this.keepRecord.visits})` : ''}. Nothing is uploaded.`
      : 'Forgotten when you leave. Nothing is uploaded.';
    const left = snap.timers.reflectionLeft;
    $('btnNext').textContent = left !== null && left !== undefined && snap.timed ? `Next visitor · ${Math.ceil(left)}s` : `Meet another kitten`;
  }

  // The AI panel stays on screen for the whole visit, in Prototype A's MIND layout: what the
  // kitten is doing and thinking, its needs as numbers, how it reads your move, and the desires
  // it is weighing, with one line of guidance when the visitor can help. Holding V (or the eye
  // button) dims the scene and shows the same judgement on the ring and the tracked hand.
  mind(snap) {
    const scene = this.mindVisible;
    this.show('mind', true);
    document.body.classList.toggle('mind-on', scene);
    $('btnMind').setAttribute('aria-pressed', String(this.mindOn));
    const c = snap.creature, d = snap.diagnostics, n = c.needs ?? {}, input = snap.input;
    // each kitten has its own colours; the panel changes with whichever kitten you are meeting
    const el = $('mind');
    if (el.dataset.kitten !== snap.kitten.id) {
      el.dataset.kitten = snap.kitten.id;
      el.classList.remove('switch'); void el.offsetWidth; el.classList.add('switch');
    }
    const doing = d.chosen === 'SEEK_FOOD' || d.chosen === 'EAT' ? 'EAT' : d.chosen;
    const label = (k) => (k === 'SOCIAL' && c.socialTarget ? `Join ${NAMES[c.socialTarget]}` : ACTS[k] ?? k);
    const setAside = snap.toolless ? ['HUNT', 'GIFT', 'TRICK'] : [];
    const rows = d.candidates.filter((q) => !setAside.includes(q.name)).filter((q) => q.available || /^[A-Z_]+$/.test(q.blocked ?? '') || ['too_young', 'trust', 'alone'].includes(q.blocked))
      .slice(0, 6).map((q) => {
        const chosen = q.name === d.chosen || (d.chosen === 'EAT' && q.name === 'SEEK_FOOD');
        const why = q.available ? (q.request ? 'you offered' : Math.round(q.score * 100)) : WHY_NOT[q.blocked] ?? q.blocked;
        return `<div class="m-row ${chosen ? 'chosen' : ''} ${q.available ? '' : 'blocked'}"><span>${label(q.name)}</span><i style="--v:${Math.round(Math.min(1, q.score) * 100)}%"></i><em>${why}</em></div>`;
      }).join('');
    const needs = [['Energy', n.energy, 'energy'], ['Fullness', n.fullness, 'full'], ['Fun', n.fun, 'fun'], ['Trust', n.trust, 'trust'], ['Stress', n.stress, 'stress']]
      .map(([k, v, cls]) => `<div class="m-need ${cls}"><span>${k}</span><i style="--v:${Math.round((v ?? 0) * 100)}%"></i><b>${Math.round((v ?? 0) * 100)}</b></div>`).join('');
    const pointing = snap.pose?.label === 'point' || c.behaviour === 'FOLLOW';
    const move = pointing && input.quality === 'valid' ? 'Pointing: leading the way' : input.quality === 'lost' ? (input.source === 'camera' ? 'Hand out of view' : 'Move into the clearing')
      : input.quality === 'uncertain' ? 'Finding a steady hand'
      : input.overUI ? 'Selecting a control' : READING[snap.intent.label] ?? 'Watching';
    const guidance = input.quality !== 'valid' ? (input.source === 'camera' ? 'Bring your hand back into view.' : 'Move your pointer into the clearing.')
      : c.inviting && !c.acceptedContact && snap.activeTool === 'PET' ? 'Hold still to let it come to you.'
      : c.behaviour === 'RETREAT' ? 'Move a little farther away.' : REPLY[snap.reasonCode] ? `${snap.kitten.name} ${REPLY[snap.reasonCode].toLowerCase()}.` : '';
    const tone = input.quality !== 'valid' || snap.intent.label === 'unknown' ? 'cool' : snap.intent.label === 'fast_approach' ? 'warn' : '';
    const html = `<div class="m-head"><span class="eyebrow">Mind</span><span class="m-state">${label(doing)}</span></div>
      <p class="m-thought"><b>${snap.kitten.name}</b> “${THOUGHT[c.reaction?.reasonCode === 'SIB_FOOD' ? 'FOOD' : c.reaction?.type === 'hiss' ? 'HISS' : doing] ?? '…'}”</p>
      ${needs}
      <div class="m-hand ${tone}"><span>Your move</span><em>${move}</em></div>
      <div class="m-head sub"><span class="eyebrow">Desires</span><span class="m-note">highest score wins</span></div>${rows}
      ${guidance ? `<p class="m-foot">${guidance}</p>` : ''}`;
    if (this.mindHtml !== html) { this.mindHtml = html; $('mind').innerHTML = html; }
  }

  active(snap, x) {
    const c = snap.creature;
    const k = KITTENS.find((q) => q.id === snap.kitten.id);
    this.activeSec = snap.timers.active ?? 0;
    $('face').style.background = swatchCss(k);
    $('kname').textContent = snap.kitten.name;
    $('relation').textContent = this.copy.relation[c.relation];
    [...$('hearts').children].forEach((el, i) => el.classList.toggle('on', i <= c.relation));
    this.mind(snap);
    $('btnSound').innerHTML = kit(x.soundOn ? 'system/sound-on' : 'system/sound-off', 22);
    $('btnSound').setAttribute('aria-pressed', String(x.soundOn));

    const cam = snap.input.source === 'camera';
    this.show('inputStatus', cam);
    if (cam) {
      const q = snap.input.quality;
      $('inputStatus').className = `glass ${q}`;
      const recovering = q !== 'valid';
      const text = x.camera.status === 'failed' ? CAMERA_ERRORS.en[x.camera.error] : T.status[q];
      if (this.trackingText !== text) {
        this.trackingText = text;
        $('trackingText').innerHTML = `${kit(recovering ? 'ai/hand-lost' : 'ai/hand-found', 18)}<span>${text}</span>`;
      }
      this.show('btnRecoverMouse', recovering);

    }

    this.held = snap.held;
    this.habitat(snap);
    // the coach leads in Act 1; after that the kitten's own need lights up the matching slot
    const need = this.pulse ? null : snap.need?.hint ? snap.need : null;
    const call = this.pulse ?? NEED_ITEM[need?.kind] ?? null;
    for (const b of document.querySelectorAll('#pouch .slot')) {
      b.setAttribute('aria-pressed', String(b.dataset.item === (snap.held ?? 'hand')));
      b.classList.toggle('pulse', call === b.dataset.item && snap.held !== b.dataset.item);
    }
    if (snap.sessionId !== this.albumSession) { this.albumSession = snap.sessionId; this.album = []; this.saved = false; }
    this.show('still', snap.stillThere);
    this.show('offerEnd', snap.offerEnd && !snap.stillThere);

    // the kitten's reply: a pictogram above it; the system's own messages: words by the hand
    const h = snap.displayHint;
    const bubble = $('bubble'), sys = $('sysHint');
    if (h && (h.owner === 'creature' || h.owner === 'result') && PICTO[h.code]) {
      if (this.bubbleCode !== h.code) { this.bubbleCode = h.code; bubble.innerHTML = kit(PICTO[h.code], 30, this.copy[h.code] ?? h.code); }
      bubble.className = `glass show ${WARN.has(h.code) ? 'warn' : ''}`;
      bubble.title = this.copy[h.code] ?? '';
      bubble.style.left = `${x.catPx.x}px`;
      bubble.style.top = `${Math.max(110, x.catPx.y - x.catPx.r * 0.95)}px`;
    } else if (need) { // no reply to show: the kitten asks for what it needs
      const code = `need:${need.kind}`;
      if (this.bubbleCode !== code) { this.bubbleCode = code; bubble.innerHTML = kit(NEED_ICON[need.kind], 30, NEED_WORDS[need.kind]); }
      bubble.className = 'glass show need';
      bubble.title = NEED_WORDS[need.kind];
      bubble.style.left = `${x.catPx.x}px`;
      bubble.style.top = `${Math.max(110, x.catPx.y - x.catPx.r * 0.95)}px`;
    } else { bubble.className = 'glass'; this.bubbleCode = null; }
    // a lost hand shows in the camera preview; a mouse resting on a panel is not lost at all
    if (h && h.owner === 'system' && h.code !== 'TRACKING_LOST') {
      sys.innerHTML = `${kit(h.code === 'TRACKING_LOST' ? 'ai/hand-lost' : 'ai/motion-unclear', 20)}<span>${this.copy[h.code] ?? h.code}</span>`;
      sys.className = 'glass show';

    } else sys.className = 'glass';
  }
}
