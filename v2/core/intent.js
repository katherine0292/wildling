// Short-window intent classification (PRD V2 F2-05, §12.4).
//
// IMPORTANT — what this is and is not:
//   This file ships a RULE BASELINE, labelled `source: "rule_baseline"`.
//   PRD V2 asks for a trained, evaluated time-series model; that model has NOT been
//   trained yet (see docs/ai-boundaries.md). A future TensorFlow.js model must return
//   the same shape from `scoreWindow`, so the gate below, the creature and the
//   evaluation script stay unchanged.
//
// Labels: gentle_approach · stable_contact · fast_approach · neutral_motion
// Not labels, but outcomes: unknown (rejected) · lost (no usable tracking)

import { PARAMS, clamp } from './config.js';

export const LABELS = ['gentle_approach', 'stable_contact', 'fast_approach', 'neutral_motion'];

// Features over a resampled window (12 points at 20 Hz for 600 ms).
export function extractFeatures(points, cat, p = PARAMS) {
  const pts = points.filter(Boolean);
  if (pts.length < 3) return null;
  const dtS = 1 / p.intent.sampleHz;
  const speeds = [];
  const radial = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = Math.max((b.t - a.t) / 1000, dtS * 0.5);
    speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);
    const da = Math.hypot(a.x - cat.x, a.y - cat.y);
    const db = Math.hypot(b.x - cat.x, b.y - cat.y);
    radial.push((da - db) / dt); // > 0 = moving toward the cat
  }
  const last = pts[pts.length - 1];
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(arr.length, 1);
  const cx = mean(pts.map((q) => q.x)), cy = mean(pts.map((q) => q.y));
  const jitter = Math.sqrt(mean(pts.map((q) => (q.x - cx) ** 2 + (q.y - cy) ** 2)));
  const dist = Math.hypot(last.x - cat.x, last.y - cat.y);
  // dwell: how long, counted back from now, the hand has stayed slow inside the contact zone
  let dwell = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    const q = pts[i];
    const inZone = Math.hypot(q.x - cat.x, q.y - cat.y) < cat.contactRadius;
    if (!inZone || speeds[i - 1] > p.intent.gentleSpeed) break;
    dwell += (pts[i].t - pts[i - 1].t) / 1000;
  }
  return {
    meanSpeed: mean(speeds),
    peakSpeed: Math.max(...speeds),
    // peak over the last ~300 ms: a fast approach usually *ends* with the hand stopping
    // next to the cat, and an average would wash the approach out before it is confirmed
    approachSpeed: Math.max(...radial.slice(-6)),
    dist,
    edgeDist: Math.max(0, dist - cat.bodyRadius),
    dwell,
    jitter,
    open: mean(pts.map((q) => q.open ?? 1)),
  };
}

const soft = (x, lo, hi) => clamp((x - lo) / (hi - lo));

// Rule baseline scores. Output shape is the model contract: { scores, label, score, margin }.
export function scoreWindow(f, p = PARAMS) {
  const ip = p.intent;
  // The contact zone must match the creature's own contact radius, otherwise a hand the
  // cat treats as "on its back" scores below the camera rejection threshold.
  const zone = p.creature.contactRadius;
  const inZone = 1 - soft(f.dist, zone, zone * 1.4);
  const slow = 1 - soft(f.meanSpeed, ip.gentleSpeed * 0.6, ip.gentleSpeed * 1.2);
  const settled = soft(f.dwell, ip.contactDwell * 0.5, ip.contactDwell * 0.9);
  const near = 1 - soft(f.edgeDist, ip.nearS, ip.nearS * 1.6);
  const fast = soft(f.approachSpeed, ip.fastSpeed * 0.7, ip.fastSpeed * 1.1);
  const towards = soft(f.approachSpeed, 0.02, 0.12);
  const reachable = 1 - soft(f.dist, 0.45, 0.65);
  const openHand = soft(f.open, 0.3, 0.6);

  const raw = {
    stable_contact: inZone * slow * settled * openHand,
    fast_approach: near * fast,
    gentle_approach: reachable * towards * slow * (1 - settled * inZone) * openHand,
    neutral_motion: 0,
  };
  raw.neutral_motion = clamp(1 - Math.max(raw.stable_contact, raw.fast_approach, raw.gentle_approach));
  const sum = LABELS.reduce((s, k) => s + raw[k], 0) || 1;
  const scores = Object.fromEntries(LABELS.map((k) => [k, raw[k] / sum]));
  const ranked = LABELS.slice().sort((a, b) => scores[b] - scores[a]);
  return { scores, label: ranked[0], score: scores[ranked[0]], margin: scores[ranked[0]] - scores[ranked[1]] };
}

// Gate + temporal confirmation. Holds state across 100 ms cycles.
export class IntentClassifier {
  constructor(params = PARAMS) {
    this.p = params;
    this.reset();
  }

  reset() {
    this.pending = null;
    this.pendingCount = 0;
    this.current = { label: 'lost', score: null, margin: null, source: 'rule', coverage: 0, scores: null };
  }

  // track: InputTrack · cat: {x, y, bodyRadius, contactRadius} · ctx: {keyboardHold}
  classify(track, cat, now, ctx = {}) {
    const ip = this.p.intent;
    const isCamera = track.source === 'camera';
    const source = isCamera ? 'rule_baseline' : track.source; // never fake a model score
    const out = (label, extra = {}) => {
      this.current = { label, score: null, margin: null, source, coverage: extra.coverage ?? 0, scores: extra.scores ?? null, modelVersion: null };
      if (isCamera && extra.score !== undefined) { this.current.score = extra.score; this.current.margin = extra.margin; }
      return this.current;
    };

    if (track.quality === 'lost') { this.pending = null; this.pendingCount = 0; return out('lost'); }
    if (track.quality !== 'valid') { this.pending = null; this.pendingCount = 0; return out('unknown'); }

    // Keyboard: an explicit, documented mapping instead of a guessed gesture.
    if (track.source === 'keyboard' && ctx.keyboardHold) {
      const d = Math.hypot(track.x - cat.x, track.y - cat.y);
      if (d < cat.contactRadius) return out('stable_contact', { coverage: 1 });
    }

    const { points, coverage } = track.window(now, ip.windowMs, ip.sampleHz);
    if (isCamera && coverage < ip.minCoverage) { this.pendingCount = 0; return out('unknown', { coverage }); }
    const f = extractFeatures(points, cat, this.p);
    if (!f) return out(isCamera ? 'unknown' : 'neutral_motion', { coverage });
    const r = scoreWindow(f, this.p);

    // Camera evidence must clear the rejection thresholds; mouse/keyboard are exact positions.
    const confident = !isCamera || (r.score >= ip.topScore && r.margin >= ip.margin);
    if (!confident) { this.pending = null; this.pendingCount = 0; return out('unknown', { coverage, scores: r.scores, score: r.score, margin: r.margin }); }

    if (this.pending === r.label) this.pendingCount++;
    else { this.pending = r.label; this.pendingCount = 1; }
    const need = isCamera ? ip.confirmCycles : 1;
    if (this.pendingCount < need) {
      return out(isCamera ? 'unknown' : this.current.label, { coverage, scores: r.scores, score: r.score, margin: r.margin });
    }
    return out(r.label, { coverage, scores: r.scores, score: r.score, margin: r.margin });
  }
}
