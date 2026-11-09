// Test driver: replays synthetic input against the real core modules.
// Every test is a scripted, reproducible replay (fixed seed, fixed 60 Hz clock),
// which is exactly the "fixed replay verifies product logic" stage of PRD V2 §24.

import { Simulation } from '../v2/core/sim.js';

export const cam = (x, y, extra = {}) => ({ source: 'camera', present: true, x, y, handScale: 0.15, open: 0.9, keypointCount: 21, pinchRatio: 0.8, ...extra });
export const mouseAt = (x, y) => ({ source: 'mouse', present: true, x, y });

export class Driver {
  constructor(opts = {}) {
    this.sim = new Simulation({ seed: 1, ...opts });
    this.t = 0;
    this.seq = 0;
    this.n = 0;
  }

  tick(sample) {
    this.t += 1000 / 60;
    if (sample) this.sim.ingest({ t: this.t, seq: ++this.seq, ...sample });
    this.sim.update(1 / 60, this.t);
  }

  // fn(elapsedSec) → sample | null
  run(sec, fn) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) this.tick(fn ? fn(i / 60) : null);
  }

  // run until pred() or timeout; returns elapsed seconds or -1
  until(pred, maxSec, fn) {
    const n = Math.round(maxSec * 60);
    for (let i = 0; i < n; i++) { if (pred()) return i / 60; this.tick(fn ? fn(i / 60) : null); }
    return pred() ? maxSec : -1;
  }

  cmd(type, extra = {}) { return this.sim.command({ id: `t${++this.n}`, type, ...extra }); }

  get cat() { return this.sim.cat; }
  get state() { return this.sim.session.state; }
  // the cat's position in normalised screen coordinates, plus an offset in S units
  catAt(dx = 0, dy = 0) {
    const w = this.sim.world;
    return { x: (this.cat.x + dx) / w.w, y: (this.cat.y + dy) / w.h };
  }

  startMouse() { this.cmd('start'); this.cmd('choose_input', { source: 'mouse' }); }

  startCamera() {
    this.cmd('start');
    this.cmd('choose_input', { source: 'camera' });
    this.until(() => this.state === 'ACTIVE', 5, () => cam(0.2, 0.2));
  }

  // Hold the hand on the cat with the Pet tool until contact is accepted.
  petUntilContact(make = (p) => mouseAt(p.x, p.y), maxSec = 12) {
    this.cmd('select_tool', { tool: 'PET' });
    return this.until(() => this.cat.behaviour === 'CONTACT', maxSec, () => make(this.catAt(0.02, 0)));
  }

  events(type) { return this.sim.log.filter((e) => e.type === type); }
}
