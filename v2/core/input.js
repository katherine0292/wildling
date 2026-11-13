// InputTrack — one input object for camera, mouse and keyboard (PRD V2 F2-01 – F2-04).
//
// Positions arrive normalised (0..1, origin top-left, mirrored once by the camera
// adapter) and are converted to world units where 1 S = the short side of the screen.
// Speeds are therefore in S/s for every source.
//
// The track never decides what a gesture *means*. It only answers:
//   is the evidence usable right now?   → quality: 'valid' | 'uncertain' | 'lost'
// Everything downstream (intent, trust, memory) must respect that answer.

import { PARAMS } from './config.js';

export class InputTrack {
  constructor(world, params = PARAMS) {
    this.p = params.quality;
    this.world = world;
    this.reset('mouse');
  }

  // Switching source clears filters, windows and pending pinches (F2-01).
  reset(source) {
    this.source = source;
    this.samples = [];          // recent valid samples {t, x, y, open}
    this.lastSample = null;     // last sample of any validity
    this.lastValid = null;
    this.stableSince = null;    // when the current run of valid samples started
    this.x = null; this.y = null;
    this.speed = 0;
    this.present = false;
    this.quality = 'lost';
    this.rejects = 0;           // aggregate error count for diagnostics
    this.validCount = 0;
    this.totalCount = 0;
    this.lastSeq = -1;
  }

  setWorld(world) { this.world = world; }

  // sample: { t, seq, source, present, x, y, handScale?, open?, keypointCount? }
  ingest(s) {
    if (s.source !== this.source) this.reset(s.source);
    if (typeof s.seq === 'number') {
      if (s.seq <= this.lastSeq) { this.rejects++; return false; } // stale or replayed packet
      this.lastSeq = s.seq;
    }
    this.totalCount++;
    this.lastSample = s;
    this.present = !!s.present;
    const ok = this.isValid(s);
    if (!ok) { this.stableSince = null; return false; }

    const wx = s.x * this.world.w, wy = s.y * this.world.h;
    const prev = this.lastValid;
    // A teleport inside one sample interval is a tracking error, not a fast hand.
    if (prev && this.source === 'camera') {
      const gap = s.t - prev.t;
      const jump = Math.hypot(wx - prev.x, wy - prev.y);
      if (gap < 120 && jump > this.p.jumpS) {
        this.rejects++;
        this.stableSince = null;
        this.samples = [];
        this.lastValid = { t: s.t, x: wx, y: wy, open: s.open ?? 1 };
        return false;
      }
    }

    // First valid sample after a gap: speed starts at 0, never a spike.
    const resumed = !prev || this.stableSince === null || s.t - prev.t > this.p.maxSampleAgeMs;
    if (resumed) { this.samples = []; this.speed = 0; this.stableSince = s.t; }
    if (this.stableSince === null) this.stableSince = s.t;

    if (!resumed && prev) {
      const dt = Math.max((s.t - prev.t) / 1000, 1e-3);
      const inst = Math.hypot(wx - prev.x, wy - prev.y) / dt;
      this.speed = this.speed * 0.6 + inst * 0.4;
    }
    this.x = this.x === null || resumed ? wx : this.x * 0.4 + wx * 0.6;
    this.y = this.y === null || resumed ? wy : this.y * 0.4 + wy * 0.6;

    const v = { t: s.t, x: wx, y: wy, open: s.open ?? 1 };
    this.lastValid = v;
    this.samples.push(v);
    this.validCount++;
    const keep = s.t - 1200;
    while (this.samples.length && this.samples[0].t < keep) this.samples.shift();
    return true;
  }

  isValid(s) {
    if (!s.present) return false;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return false;
    if (s.x < -0.05 || s.x > 1.05 || s.y < -0.05 || s.y > 1.05) return false;
    if (s.source !== 'camera') return true; // mouse / keyboard positions are exact
    if (s.keypointCount !== 21) return false;
    if (!(s.handScale >= this.p.minHandScale && s.handScale <= this.p.maxHandScale)) return false;
    return true;
  }

  // Called every simulation step with the current clock (ms).
  update(now) {
    const last = this.lastValid;
    if (!this.present || !last) { this.quality = 'lost'; this.speed = 0; return; }
    const age = now - last.t;
    if (this.source !== 'camera') {
      this.quality = 'valid';
      if (this.source === 'mouse' && age > 250) this.speed *= 0.5; // a resting mouse has no speed
      return;
    }
    if (age > this.p.lostAfterMs) { this.quality = 'lost'; this.speed = 0; return; }
    if (age > this.p.maxSampleAgeMs) { this.quality = 'uncertain'; return; }
    if (this.stableSince === null || now - this.stableSince < this.p.stableBeforeWindowMs) {
      this.quality = 'uncertain';
      return;
    }
    this.quality = 'valid';
  }

  get valid() { return this.quality === 'valid'; }

  // Resample the last `windowMs` of valid samples at `hz` (time-based, never frame-based).
  // Returns { points, coverage } where coverage = share of slots backed by a real sample.
  window(now, windowMs, hz) {
    const n = Math.round((windowMs / 1000) * hz);
    const step = 1000 / hz;
    const pts = [];
    let backed = 0;
    let j = 0;
    const s = this.samples;
    for (let i = 0; i < n; i++) {
      const t = now - windowMs + (i + 1) * step;
      while (j < s.length - 1 && s[j + 1].t <= t) j++;
      const a = s[j];
      if (!a || a.t > t) { pts.push(null); continue; }
      const b = s[j + 1];
      let p = a;
      if (b && b.t > a.t) {
        const k = Math.min(1, (t - a.t) / (b.t - a.t));
        p = { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, open: a.open };
      }
      if (t - a.t <= step * 1.6 || (b && b.t >= t)) backed++;
      pts.push({ t, x: p.x, y: p.y, open: p.open });
    }
    return { points: pts, coverage: n ? backed / n : 0 };
  }

  validRatio() { return this.totalCount ? this.validCount / this.totalCount : 0; }
}

// Pinch = thumb tip near index tip, relative to the hand's own size.
// One closed pinch yields exactly one confirm; it must open again before the next.
export class PinchDetector {
  constructor(params = PARAMS) {
    this.p = params.pinch;
    this.reset();
  }

  reset() {
    this.closedSince = null;
    this.latched = false;
    this.lastFire = -Infinity;
  }

  requireRelease() { this.latched = true; this.closedSince = null; }

  // ratio = thumb–index distance / palm scale. Returns true on the frame a confirm fires.
  update(ratio, valid, now) {
    if (!valid || !Number.isFinite(ratio)) { this.closedSince = null; return false; }
    if (ratio > this.p.open) { this.latched = false; this.closedSince = null; return false; }
    if (ratio >= this.p.close) return false; // hysteresis band: keep state
    if (this.latched) return false;
    if (this.closedSince === null) this.closedSince = now;
    if (now - this.closedSince < this.p.holdMs) return false;
    if (now - this.lastFire < this.p.cooldownMs) return false;
    this.latched = true;
    this.lastFire = now;
    return true;
  }
}
