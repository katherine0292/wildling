// Act 1 (experience spec V3): the first minutes are the tutorial. One goal at a time, one
// short line at the bottom of the screen, and a see-through hand in the scene that shows the
// move. A step clears only when it has actually happened, so it teaches by doing.
//
//   1 approach   come in slowly and hold still until the kitten comes to sniff
//   2 stroke     keep a gentle hand on it for a moment
//   3 treat      take a treat from the pouch and drop it near the kitten
//   4 feather    play with the feather until it pounces
//
// On the website it runs once per browser; in exhibition (kiosk) mode, for every visitor.
// It is never a trap: after 20 s without progress a step offers to move on.

const KEY = 'wildling.coach.v3';

const STEPS = [
  { id: 'approach', demo: 'approach',
    text: { camera: 'Bring your hand in slowly, then hold still', pointer: 'Come in slowly, then hold still' },
    done: (s, e) => e.some((x) => x.type === 'contact_started') },
  { id: 'stroke',
    text: { camera: 'Stroke it gently. Watch the tail', pointer: 'Stroke it gently. Watch the tail' },
    hold: (s) => s.creature.acceptedContact, needMs: 2500 },
  { id: 'treat', pulse: 'treat',
    text: { camera: 'Pinch the treat slot, open your hand, then pinch to drop', pointer: 'Take a treat from the pouch, click to drop it' },
    done: (s, e) => e.some((x) => x.type === 'eat_completed') },
  { id: 'feather', pulse: 'wand',
    text: { camera: 'Pinch the feather slot. Dart, then pause', pointer: 'Now the feather. Dart, then pause' },
    done: (s, e) => e.some((x) => x.type === 'pounce_success') },
];

export class Coach {
  constructor({ ui, renderer, kiosk }) {
    this.ui = ui;
    this.renderer = renderer;
    this.kiosk = kiosk;
    this.el = document.getElementById('coach');
    this.active = false;
    this.session = null;
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-coach]')?.dataset.coach;
      if (a === 'skip') this.finish();
      if (a === 'next') this.advance();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  get seen() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
  markSeen() { if (!this.kiosk) try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }

  begin() { this.i = 0; this.active = true; this.enter(); }

  enter() {
    const s = STEPS[this.i];
    this.stepAt = performance.now();
    this.heldMs = 0;
    this.doneAt = null;
    this.el.hidden = false;
    this.el.className = 'glass in';
    this.render(false);
    this.ui.pulse = s.pulse ?? null;
    this.renderer.demo = s.demo ?? null;
  }

  render(stuck) {
    const s = STEPS[this.i];
    const dots = STEPS.map((_, k) => `<i class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></i>`).join('');
    this.el.innerHTML = `<span class="c-text">${s.text[this.cam ? 'camera' : 'pointer']}</span><span class="dots" aria-label="Step ${this.i + 1} of ${STEPS.length}">${dots}</span>`
      + (stuck ? '<button class="c-next" data-coach="next">Next</button>' : '') + '<button class="c-skip" data-coach="skip" aria-label="Skip the introduction">Skip</button>';
    this.stuck = stuck;
  }

  // Called every frame with the snapshot and the events drained this frame.
  update(snap, events, now, dt) {
    if (snap.sessionState !== 'ACTIVE') {
      if (this.active && snap.sessionState !== 'PAUSED') this.close();
      return;
    }
    const camera = snap.input.source === 'camera';
    if (this.active && camera !== this.cam) { this.cam = camera; this.render(this.stuck); }
    this.cam = camera;
    if (snap.sessionId !== this.session) { // a new visit
      this.session = snap.sessionId;
      if (this.kiosk || !this.seen) setTimeout(() => { if (this.session === snap.sessionId) this.begin(); }, 900);
    }
    if (!this.active) return;
    const s = STEPS[this.i];
    if (this.doneAt) { if (now - this.doneAt > 900) this.advance(); return; }
    let ok = s.done ? s.done(snap, events) : false;
    if (s.hold) { this.heldMs = s.hold(snap) ? this.heldMs + dt * 1000 : Math.max(0, this.heldMs - dt * 500); ok = ok || this.heldMs >= s.needMs; }
    // the demonstration hand only shows while the visitor's hand is still far from the kitten
    if (s.demo) this.renderer.demo = snap.creature.behaviour === 'APPROACH' || snap.creature.acceptedContact ? null : s.demo;
    if (ok) { this.doneAt = now; this.el.classList.add('ok'); this.renderer.demo = null; return; }
    if (!this.stuck && now - this.stepAt > 20000) this.render(true);
  }

  advance() {
    if (this.i >= STEPS.length - 1) { this.finish(); return; }
    this.i++;
    this.enter();
  }

  finish() { this.markSeen(); this.close(); }

  close() {
    this.active = false;
    this.el.hidden = true;
    this.ui.pulse = null;
    this.renderer.demo = null;
  }
}
