// Visitor interface (experience spec V3): the entry, the input question, the heads-up
// display and the journal. It renders from the snapshot and turns clicks into commands.
//
// Layout rules: the clearing is the screen. The interface keeps to three corners (the
// kitten's name and bond, the visit controls, the pouch), and the kitten answers with its
// body and a pictogram, never with sentences. Words are kept for the system's own messages.

import { COPY, KITTENS } from '../core/config.js';
import { CAMERA_ERRORS } from './camera.js';
import { kit } from './kit.js';
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

const HOW = [
  ['ai/sees-you', 'Come in slowly', 'A slow, steady hand shrinks the ring around it. A fast one makes it back off.', 'Move your hand towards it, then stop.'],
  ['mood/affectionate', 'Stroke it', 'Rest your hand on it and move gently. Watch its tail: a flick means stop.', 'Keep the pointer on it and move slowly.'],
  ['inventory/treat', 'Offer a treat', 'Pinch over the treat to pick it up. Open your fingers, then pinch again near the kitten to drop it.', 'Pick the treat, then click where it should land.'],
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
  constructor({ dispatch, onChooseInput, onRecoverMouse, onToggleSound, onHelp, keepsakes }) {
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
    $('btnStart').onclick = () => dispatch({ type: 'start' });
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
    for (const b of document.querySelectorAll('#pouch .slot')) {
      b.querySelector('.w').innerHTML = kit(`inventory/${b.dataset.item}`, 28);
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

  activateAt(x, y) {
    const target = document.elementFromPoint(x, y);
    const button = target?.closest('button');
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    return this.blocksSceneAt(x, y);
  }

  // Take something from the pouch, or put it back if it is already in hand.
  take(item) { this.dispatch({ type: 'hold', item: this.held === item ? null : item }); }

  showHow(on, cam = this.lastSource === 'camera') {
    if (on) $('howGrid').innerHTML = HOW.map(([icon, t, d, mouse]) => `<div class="how-item">${kit(icon, 26)}<b>${t}</b><span>${cam ? d : mouse}</span></div>`).join('');
    $('howTitle').textContent = `${HOW.length === 5 ? 'Five' : HOW.length} things you can do`;
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
      const focus = { ATTRACT: 'btnStart', CONSENT: 'btnCamera', PAUSED: 'btnResume', REFLECTION: 'btnNext' }[st];
      if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 0);
    }
    this.nameTags(snap, x);
    if (st === 'ATTRACT') this.entry(snap);
    if (st === 'CONSENT') this.consent(x.camera);
    if (st === 'CALIBRATING') this.calibrating(snap, x.camera);
    if (st === 'PAUSED') $('pausedReason').textContent = T.pausedReasons[snap.pauseReason] ?? '';
    if (st === 'REFLECTION') this.reflection(snap);
    if (st === 'ACTIVE') this.active(snap, x);
  }

  entry(snap) {
    const k = KITTENS.find((q) => q.id === snap.kitten.id);
    $('btnStart').textContent = `Meet ${k.name}`;
    $('entryNote').textContent = this.hover && this.hover !== k.id ? `Click to choose ${NAMES[this.hover]}.` : 'Point at a kitten, or click one to choose it.';
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
        el = document.createElement('button');
        el.className = 'tag glass';
        el.innerHTML = `<b>${k.name}</b><span>${k.temperament[0].toUpperCase()}${k.temperament.slice(1)}. ${k.blurb}</span>${this.keep?.badge(k.id) ? `<em>${this.keep.badge(k.id)}</em>` : ''}`;
        el.onclick = (e) => { e.stopPropagation(); this.dispatch({ type: 'choose_kitten', kitten: k.id }); };
        root.appendChild(el);
        this.tags.set(l.kitten, el);
      }
      el.classList.toggle('chosen', l.kitten === snap.kitten.id);
      el.classList.toggle('open', l.kitten === (this.hover ?? snap.kitten.id));
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
    const html = r.lines.map((l) => `<li>${l.text}<span class="ev">${l.evidence.join(', ') || 'no events'}</span></li>`).join('');
    if ($('recap').innerHTML !== html) $('recap').innerHTML = html;
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

  // Explain the current moment. The staff panel retains scores and candidate actions.
  mind(snap) {
    const on = this.mindVisible;
    this.show('mind', on);
    document.body.classList.toggle('mind-on', on);
    $('btnMind').setAttribute('aria-pressed', String(this.mindOn));
    if (!on) return;
    const c = snap.creature, input = snap.input;
    const seen = input.quality === 'lost' ? (input.source === 'camera' ? 'Hand out of view' : 'Move into the clearing')
      : input.quality === 'uncertain' ? 'Finding a steady hand'
      : input.source === 'camera' ? 'Hand tracked' : 'Pointer tracked';
    const action = input.quality !== 'valid' ? 'Waiting for input'
      : input.overUI ? 'Selecting a control' : READING[snap.intent.label] ?? 'Watching';
    const reply = c.acceptedContact ? 'Welcomes your touch' : c.behaviour === 'EAT' ? 'Is eating your treat'
      : c.behaviour === 'APPROACH' ? 'Is coming to sniff' : REPLY[snap.reasonCode]
      ?? (c.behaviour === 'REST' ? 'Is resting' : c.behaviour === 'PLAY' ? 'Is following the feather' : 'Is watching the clearing');
    const guidance = input.quality !== 'valid' ? (input.source === 'camera' ? 'Bring your hand back into view.' : 'Move your pointer into the clearing.')
      : c.inviting && !c.acceptedContact && snap.activeTool === 'PET' ? 'Hold still to let it come to you.'
      : c.behaviour === 'RETREAT' ? 'Move a little farther away.' : '';
    const html = `<h3>${kit('ai/sees-you', 20)}${snap.kitten.name}’s view</h3>
      <div class="m-fact"><span>Input</span><em>${seen}</em></div>
      <div class="m-fact"><span>Your move</span><em>${action}</em></div>
      <div class="m-fact"><span>${snap.kitten.name}</span><em>${reply}</em></div>
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
    const handTarget = cam && snap.input.quality === 'valid' && x.cursorPx
      ? document.elementFromPoint(x.cursorPx.x, x.cursorPx.y)?.closest('button') : null;
    if (handTarget !== this.handTarget) {
      this.handTarget?.classList.remove('hand-target');
      handTarget?.classList.add('hand-target');
      this.handTarget = handTarget;
    }
    // the coach leads in Act 1; after that the kitten's own need lights up the matching slot
    const need = this.pulse ? null : snap.need?.hint ? snap.need : null;
    const call = this.pulse ?? NEED_ITEM[need?.kind] ?? null;
    for (const b of document.querySelectorAll('#pouch .slot')) {
      b.setAttribute('aria-pressed', String(b.dataset.item === snap.held));
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
    if (h && h.owner === 'system' && !(cam && h.code === 'TRACKING_LOST')) {
      sys.innerHTML = `${kit(h.code === 'TRACKING_LOST' ? 'ai/hand-lost' : 'ai/motion-unclear', 20)}<span>${this.copy[h.code] ?? h.code}</span>`;
      sys.className = 'glass show';

    } else sys.className = 'glass';
  }
}
