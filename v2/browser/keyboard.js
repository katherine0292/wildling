// Keyboard as a complete alternative input (PRD V2 §9.2, AT15).
// Arrow keys move a virtual hand; Space confirms or drops; holding Space with Pet
// is an explicit "steady contact" — the keyboard never pretends to be a camera.

export class KeyboardHand {
  constructor() {
    this.x = 0.5; this.y = 0.62;
    this.keys = new Set();
    this.hold = false;
    this.seq = 0;
    this.active = false;
  }

  down(key, repeat) {
    if (key.startsWith('Arrow')) this.keys.add(key);
    if (key === ' ') { const first = !this.hold && !repeat; this.hold = true; return first; }
    return false;
  }

  up(key) {
    this.keys.delete(key);
    if (key === ' ') this.hold = false;
  }

  // returns a sample for the input track
  sample(dt, t, aspect, fast) {
    const speed = (fast ? 0.9 : 0.35) * dt; // in S per second
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    this.x = Math.min(0.97, Math.max(0.03, this.x + (dx * speed) / aspect));
    this.y = Math.min(0.83, Math.max(0.04, this.y + dy * speed));
    return { t, seq: ++this.seq, source: 'keyboard', present: true, x: this.x, y: this.y, hold: this.hold };
  }
}
