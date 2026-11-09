// First-visit tutorial (ADR-023). Short steps, each with one line of text and a faint
// drawing of the hand shape to make. A step only goes away once the visitor has done it
// (a contact accepted, a fish dropped, the shape recognised…), so it teaches by doing.
// Every step can be skipped, and the whole tutorial can be replayed from the "?" chip.
//
// On the website it shows once per browser; in exhibition (kiosk) mode, for every visitor.

import { svg } from './icons.js';

const KEY = 'wildling.tutorial.v1';

// ---------------------------------------------------------------- hand drawings
// 21 points in the HandPose layout, palm facing the viewer, in a -1..1 box.
const OPEN = [[0, 0.75], [-0.3, 0.6], [-0.5, 0.42], [-0.62, 0.24], [-0.72, 0.08],
  [-0.28, 0.12], [-0.34, -0.2], [-0.37, -0.4], [-0.39, -0.58],
  [-0.06, 0.06], [-0.08, -0.3], [-0.09, -0.52], [-0.1, -0.72],
  [0.15, 0.1], [0.18, -0.22], [0.19, -0.42], [0.2, -0.6],
  [0.34, 0.2], [0.42, -0.04], [0.46, -0.2], [0.49, -0.34]];
const finger = (pts, mcp, shape) => {
  const [x, y] = pts[mcp];
  const set = (a, b, c) => { pts[mcp + 1] = a; pts[mcp + 2] = b; pts[mcp + 3] = c; };
  if (shape === 'fold') set([x + 0.02, y - 0.14], [x + 0.04, y - 0.04], [x + 0.03, y + 0.08]);
  if (shape === 'claw') set([x, y - 0.22], [x + 0.05, y - 0.3], [x + 0.08, y - 0.22]);
};
function shape(kind) {
  const p = OPEN.map((q) => [...q]);
  const fingers = { fist: ['fold', 'fold', 'fold', 'fold'], peace: [null, null, 'fold', 'fold'], claw: ['claw', 'claw', 'claw', 'claw'] }[kind];
  if (fingers) [5, 9, 13, 17].forEach((m, i) => fingers[i] && finger(p, m, fingers[i]));
  if (kind === 'fist' || kind === 'peace') { p[3] = [-0.4, 0.22]; p[4] = [-0.22, 0.12]; } // thumb across
  if (kind === 'pinch') { p[4] = [-0.42, -0.34]; p[3] = [-0.52, -0.1]; p[8] = [-0.4, -0.38]; p[7] = [-0.38, -0.3]; }
  return p;
}
const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
export function handArt(kind) {
  if (kind === 'pointer') {
    return `<svg viewBox="-1 -1 2 2" class="art"><path d="M-0.35 -0.75 L-0.35 0.45 L-0.08 0.2 L0.12 0.68 L0.3 0.6 L0.1 0.12 L0.45 0.12 Z" /></svg>`;
  }
  const p = shape(kind);
  const path = BONES.map((b) => `M${b.map((i) => p[i].join(' ')).join(' L')}`).join(' ');
  const palm = `M${[0, 1, 5, 9, 13, 17].map((i) => p[i].join(' ')).join(' L')} Z`;
  const tips = [4, 8, 12, 16, 20].map((i) => `<circle cx="${p[i][0]}" cy="${p[i][1]}" r="0.07"/>`).join('');
  const motion = kind === 'wave' ? '<path class="mo" d="M-0.95 -0.85 Q -1.05 -0.6 -0.95 -0.35 M0.85 -0.85 Q 0.95 -0.6 0.85 -0.35"/>' : '';
  return `<svg viewBox="-1.05 -1 2.1 2" class="art"><path class="palm" d="${palm}"/><path class="bones" d="${path}"/>${tips}${motion}</svg>`;
}

// ---------------------------------------------------------------- steps
function steps(cam, name) {
  const pose = (label) => (s) => s.pose?.label === label;
  return [
    { id: 'hello', tool: 'PET', art: cam ? 'open' : 'pointer', title: 'Say hello',
      text: cam ? `Hold an open hand near ${name} and keep it still.` : `Rest the pointer next to ${name} and keep it still.`,
      note: 'It comes to you when it is ready.', event: (e) => e.type === 'contact_started' },
    { id: 'feed', tool: 'FEED', art: cam ? 'pinch' : 'pointer', title: 'Offer a fish',
      text: cam ? 'Pinch your thumb and first finger together to drop a fish.' : 'Click near it to drop a fish.',
      note: 'A full kitten will say so.', event: (e) => e.type === 'food_dropped' },
    { id: 'play', tool: 'PLAY', art: cam ? 'wave' : 'pointer', title: 'Play',
      text: 'Wave slowly: your hand is a yarn ball now.', note: 'Too fast near it can startle it.',
      event: (e) => e.type === 'pounce_success' || e.type === 'pounce_missed' },
    { id: 'friends', tool: 'LITTER', art: 'open', title: 'Make friends',
      text: cam ? 'Hold an open hand over one of the other kittens.' : 'Click another kitten, then choose Make friends.',
      note: 'With a camera: open hand.', hold: cam ? pose('open_palm') : null, event: (e) => !cam && e.type === 'invite' && e.act === 'befriend' },
    { id: 'fight', tool: 'LITTER', art: 'fist', title: 'Start a play-fight',
      text: cam ? 'Make a fist over a sibling.' : 'Click a sibling, then choose Play-fight.',
      note: 'With a camera: fist. A tired kitten will say no.', hold: cam ? pose('fist') : null, event: (e) => !cam && e.type === 'invite' && e.act === 'fight' },
    { id: 'cuddle', tool: 'LITTER', art: 'peace', title: 'Cuddle up',
      text: cam ? 'Show two fingers over a sibling.' : 'Click a sibling, then choose Cuddle up.',
      note: 'They need to be friends first.', hold: cam ? pose('peace') : null, event: (e) => !cam && e.type === 'invite' && e.act === 'cuddle' },
    { id: 'hiss', tool: 'LITTER', art: 'claw', title: 'Hiss',
      text: cam ? 'Curl your fingers like a claw over a sibling.' : 'Click a sibling, then choose Hiss.',
      note: 'It won’t hiss at a close friend.', hold: cam ? pose('claw') : null, event: (e) => !cam && e.type === 'invite' && e.act === 'hiss' },
    { id: 'end', art: null, title: "You're ready",
      text: 'Keep its needs balanced to fill the growth meter. Press T to peek inside its mind, and 6 to teach it a trick.', note: '', auto: 6000 },
  ];
}

export class Tutorial {
  constructor({ dispatch, kiosk }) {
    this.dispatch = dispatch;
    this.kiosk = kiosk;
    this.active = false;
    this.session = null;
    this.el = document.getElementById('coach');
    this.art = document.getElementById('coachArt');
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-coach]')?.dataset.coach;
      if (a === 'skip') this.finish();
      if (a === 'next') this.advance();
    });
    document.getElementById('btnHelp')?.addEventListener('click', (e) => { e.stopPropagation(); this.begin(this.lastSnap, true); });
  }

  get seen() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
  markSeen() { if (!this.kiosk) try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }

  begin(snap, force = false) {
    if (!snap || snap.sessionState !== 'ACTIVE') return;
    this.cam = snap.input.source === 'camera';
    this.list = steps(this.cam, snap.kitten.name);
    this.i = 0; this.active = true; this.forced = force;
    this.enter();
  }

  enter() {
    const s = this.list[this.i];
    this.stepAt = performance.now(); this.heldMs = 0; this.doneAt = null;
    if (s.tool) this.dispatch({ type: 'select_tool', tool: s.tool });
    const n = this.list.length - 1;
    this.el.className = 'coach in';
    this.el.innerHTML = `<div class="c-top"><span class="c-step">${this.i < n ? `Step ${this.i + 1} of ${n}` : 'Tutorial'}</span><button class="c-skip" data-coach="skip">Skip tutorial</button></div>
      <div class="c-title">${s.title}</div><p class="c-text">${s.text}</p>${s.note ? `<p class="c-note">${s.note}</p>` : ''}
      <div class="c-dots">${this.list.slice(0, n).map((_, k) => `<i class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="c-next" data-coach="next" hidden>${this.i < n ? 'Next' : 'Start playing'}</button>`;
    this.el.hidden = false;
    document.body.classList.add('coaching');
    this.art.innerHTML = s.art ? handArt(s.art) : '';
    this.art.className = `coach-art${s.art ? ' in' : ''}${s.art === 'wave' ? ' waving' : ''}`;
    this.art.hidden = !s.art;
  }

  // Called every frame with the snapshot and the events drained this frame.
  update(snap, events, now) {
    this.lastSnap = snap;
    if (snap.sessionState !== 'ACTIVE') {
      if (this.active && snap.sessionState !== 'PAUSED') this.close();
      return;
    }
    if (snap.sessionId !== this.session) { // a new visit
      this.session = snap.sessionId;
      if (this.kiosk || !this.seen) setTimeout(() => this.begin(this.lastSnap), 1200);
    }
    if (!this.active) return;
    const s = this.list[this.i];
    if (this.doneAt) { if (now - this.doneAt > 1300) this.advance(); return; }
    let ok = s.event && events.some(s.event);
    if (s.hold) { this.heldMs = s.hold(snap) ? this.heldMs + 16.7 : Math.max(0, this.heldMs - 33); ok = ok || this.heldMs > 450; }
    if (ok) this.succeed();
    if (s.auto && now - this.stepAt > s.auto) this.advance();
    if (!s.auto && now - this.stepAt > 20000) this.el.querySelector('.c-next')?.removeAttribute('hidden'); // never stuck
  }

  succeed() {
    this.doneAt = performance.now();
    this.el.classList.add('ok');
    this.el.querySelector('.c-title').innerHTML = `${svg('SPARK', 20)} Nice!`;
    this.art.classList.add('ok');
  }

  advance() {
    if (this.i >= this.list.length - 1) { this.finish(); return; }
    this.i++; this.enter();
  }

  finish() { this.markSeen(); this.close(); }
  close() { this.active = false; this.el.hidden = true; this.art.hidden = true; document.body.classList.remove('coaching'); }
}
