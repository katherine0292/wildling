// Teach a trick (ADR-019): real on-device learning from a few examples.
//
// The visitor shows a move three times (a circle, a zigzag, a flick, whatever they
// like) and ties it to a trick. A move is any burst of hand motion, segmented the
// same way for camera, mouse and keyboard: it starts when the hand speeds up and ends
// when it settles. Each move becomes a 32-number shape (16 resampled points,
// centred and scaled), and a 1-nearest-neighbour model compares new moves with the
// stored examples. A move far from every example is `unknown`, never a guess.
//
// What it is: instance-based learning on this visit's examples, in this browser.
// What it is not: a trained network, or anything that outlives the visit.

export const TRICKS = ['spin', 'rollover', 'wave'];
const N = 16;

// ---------------------------------------------------------------- features
export function resample(points, n = N) {
  if (points.length < 2) return null;
  const d = [0];
  for (let i = 1; i < points.length; i++) d.push(d[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = d[d.length - 1];
  if (total <= 1e-6) return null;
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (j < d.length - 1 && d[j] < target) j++;
    const t = (target - d[j - 1]) / Math.max(1e-9, d[j] - d[j - 1]);
    out.push({ x: points[j - 1].x + (points[j].x - points[j - 1].x) * t, y: points[j - 1].y + (points[j].y - points[j - 1].y) * t });
  }
  return out;
}

// Centred on its centroid and scaled by its larger side, so size and place do not matter;
// direction and shape do.
export function features(points) {
  const r = resample(points);
  if (!r) return null;
  const cx = r.reduce((s, p) => s + p.x, 0) / r.length, cy = r.reduce((s, p) => s + p.y, 0) / r.length;
  const w = Math.max(...r.map((p) => p.x)) - Math.min(...r.map((p) => p.x));
  const h = Math.max(...r.map((p) => p.y)) - Math.min(...r.map((p) => p.y));
  const s = Math.max(w, h, 1e-6);
  return r.flatMap((p) => [(p.x - cx) / s, (p.y - cy) / s]);
}

export const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / (a.length / 2));

// ---------------------------------------------------------------- segmentation
// Cuts continuous hand positions into moves: speed above `start` begins one, speed
// below `stop` for `settleMs` ends it. Too short, too long or too small is dropped.
export class MoveSegmenter {
  constructor({ start = 0.35, stop = 0.12, settleMs = 220, minMs = 250, maxMs = 2600, minSize = 0.06 } = {}) {
    Object.assign(this, { start, stop, settleMs, minMs, maxMs, minSize });
    this.reset();
  }
  reset() { this.points = null; this.slowSince = null; }
  get active() { return this.points !== null; }
  // returns a finished move (array of {x, y, t}) or null
  update(x, y, speed, t, valid) {
    if (!valid || !Number.isFinite(x)) { this.reset(); return null; }
    if (!this.points) {
      if (speed >= this.start) { this.points = [{ x, y, t }]; this.slowSince = null; }
      return null;
    }
    this.points.push({ x, y, t });
    const dur = t - this.points[0].t;
    if (dur > this.maxMs) { this.reset(); return null; }
    if (speed < this.stop) {
      this.slowSince ??= t;
      if (t - this.slowSince >= this.settleMs) {
        const pts = this.points; this.reset();
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        return dur >= this.minMs && size >= this.minSize ? pts : null;
      }
    } else this.slowSince = null;
    return null;
  }
}

// ---------------------------------------------------------------- the learner
export class TrickLearner {
  constructor({ examples = 3, reject = 0.32 } = {}) { this.need = examples; this.reject = reject; this.reset(); }
  reset() { this.examples = []; this.teaching = null; this.pending = []; }
  get learned() { return [...new Set(this.examples.map((e) => e.trick))]; }

  begin(trick) { if (TRICKS.includes(trick)) { this.teaching = trick; this.pending = []; } }
  cancel() { this.teaching = null; this.pending = []; }

  // Adds one example while teaching. Returns { count, done, consistency } .
  addExample(points) {
    const f = features(points);
    if (!this.teaching || !f) return null;
    this.pending.push({ trick: this.teaching, f, trace: resample(points) });
    const done = this.pending.length >= this.need;
    const consistency = this.consistency(this.pending.map((p) => p.f));
    if (done) {
      this.examples = this.examples.filter((e) => e.trick !== this.teaching).concat(this.pending);
      const trick = this.teaching; this.teaching = null; this.pending = [];
      return { count: this.need, done: true, consistency, trick };
    }
    return { count: this.pending.length, done: false, consistency, trick: this.teaching };
  }

  // How alike the examples are, 0..1 (1 = identical), shown to the visitor.
  consistency(fs) {
    if (fs.length < 2) return 1;
    let sum = 0, n = 0;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) { sum += distance(fs[i], fs[j]); n++; }
    return Math.max(0, 1 - sum / n / (2 * this.reject));
  }

  // → { trick | 'unknown', distance, margin }
  classify(points) {
    const f = features(points);
    if (!f || !this.examples.length) return { trick: 'unknown', distance: null, margin: null };
    const best = {};
    for (const e of this.examples) { const d = distance(f, e.f); if (!(e.trick in best) || d < best[e.trick]) best[e.trick] = d; }
    const ranked = Object.entries(best).sort((a, b) => a[1] - b[1]);
    const [trick, d] = ranked[0];
    const margin = ranked[1] ? ranked[1][1] - d : Infinity;
    if (d > this.reject || margin < 0.05) return { trick: 'unknown', distance: d, margin };
    return { trick, distance: d, margin };
  }
}
