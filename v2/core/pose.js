// Hand-shape commands for the litter (ADR-017). A rule baseline on the 21 HandPose
// keypoints, made robust for real cameras (ADR-022):
//
//   • it uses the 3D keypoints when the model provides them (finger bend seen from the
//     front is invisible in 2D), and falls back to 2D otherwise;
//   • every finger gets soft scores (how straight, how folded, how claw-bent) instead of
//     yes/no thresholds, so one jittery joint cannot flip the answer;
//   • class scores are smoothed over recent frames before a label is given;
//   • it still says `unknown` rather than guess, and a shape must be held to count.
//
//   open_palm  ✋ all four fingers straight          → make friends
//   peace      ✌ index and middle up, others folded  → cuddle up
//   fist       ✊ all fingers folded into the palm    → play-fight
//   claw       🐾 knuckles bent, fingertips curled    → hiss
//
// It is labelled `rule_baseline`, never presented as a trained model.

export const POSE_ACTS = { open_palm: 'befriend', peace: 'cuddle', fist: 'fight', claw: 'hiss' };
export const POSES = ['open_palm', 'peace', 'fist', 'claw'];
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]; // MCP, PIP, DIP, TIP

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const d = (a, b) => len(sub(a, b));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
// bend at joint b, in radians (0 = straight)
function bend(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (len(u) * len(v) || 1);
  return Math.PI - Math.acos(Math.max(-1, Math.min(1, cos)));
}
const valid = (kp) => Array.isArray(kp) && kp.length === 21 && kp.every((k) => Number.isFinite(k?.x) && Number.isFinite(k?.y));

// Per-finger soft states from reach (tip to wrist over palm length) and joint bends.
export function fingerStates(kp, kp3 = null) {
  const use3 = valid(kp3) && kp3.every((k) => Number.isFinite(k.z));
  const P = use3 ? kp3 : kp;
  const palm = d(P[0], P[9]) || 1e-6;
  return FINGERS.map(([mcp, pip, dip, tip]) => {
    const reach = d(P[tip], P[0]) / palm;                       // ~1.9 straight · ~0.9 folded
    const bMcp = bend(P[0], P[mcp], P[pip]);
    const curl = bend(P[mcp], P[pip], P[dip]) + bend(P[pip], P[dip], P[tip]); // PIP + DIP
    const straight = smooth(1.3, 1.65, reach) * (use3 ? 1 - smooth(0.8, 1.4, curl) : 1);
    const folded = 1 - smooth(0.95, 1.3, reach);
    // a claw keeps the fingers out from the palm but bends them at the knuckles
    const mid = smooth(0.95, 1.15, reach) * (1 - smooth(1.5, 1.75, reach));
    const bent = mid * (use3 ? smooth(0.9, 1.5, curl) * (1 - smooth(0.9, 1.4, bMcp)) : smooth(0.6, 1.1, curl));
    return { reach, curl, bMcp, straight, folded, bent };
  });
}

// One frame → soft class scores in 0..1.
export function poseScores(kp, kp3 = null) {
  if (!valid(kp)) return null;
  const f = fingerStates(kp, kp3);
  const mean = (k, idx = [0, 1, 2, 3]) => idx.reduce((s, i) => s + f[i][k], 0) / idx.length;
  const down = (i) => Math.max(f[i].folded, f[i].bent);
  const up = mean('straight');
  return {
    open_palm: up * (1 - 0.6 * Math.min(down(2), down(3))),
    peace: mean('straight', [0, 1]) * ((down(2) + down(3)) / 2),
    fist: mean('folded'),
    claw: mean('bent'),
  };
}

// Single-frame label (used by tests and the evaluator): unknown unless clearly one shape.
export function classifyPose(kp, kp3 = null, { min = 0.55, margin = 0.15 } = {}) {
  const s = poseScores(kp, kp3);
  if (!s) return { label: 'unknown', score: 0, scores: null };
  return pick(s, min, margin);
}

function pick(s, min, margin) {
  const ranked = Object.entries(s).sort((a, b) => b[1] - a[1]);
  const [label, score] = ranked[0];
  if (score < min || score - ranked[1][1] < margin) return { label: 'unknown', score, scores: s };
  return { label, score, scores: s };
}

// Smooths class scores over recent frames, so a single jittery frame changes nothing.
export class PoseSmoother {
  constructor({ alpha = 0.35, min = 0.55, margin = 0.15 } = {}) { this.alpha = alpha; this.min = min; this.margin = margin; this.reset(); }
  reset() { this.s = null; }
  update(kp, kp3 = null) {
    const now = poseScores(kp, kp3);
    if (!now) { this.reset(); return { label: 'unknown', score: 0, scores: null }; }
    if (!this.s) this.s = { ...now };
    else for (const k of POSES) this.s[k] += (now[k] - this.s[k]) * this.alpha;
    return pick(this.s, this.min, this.margin);
  }
}

// Holds a shape steady before it becomes a command, and fires it once.
export class PoseGate {
  constructor({ holdMs = 500, cooldownMs = 1500 } = {}) { this.holdMs = holdMs; this.cooldownMs = cooldownMs; this.reset(); }
  reset() { this.label = 'unknown'; this.since = null; this.firedAt = -Infinity; this.fired = false; this.graceUntil = 0; }
  // returns { label, progress (0..1), fire: label | null }
  update(label, t, valid) {
    // a brief unknown (one dropped frame) does not reset the hold
    if (valid && label === 'unknown' && this.label !== 'unknown' && t < this.graceUntil) label = this.label;
    if (!valid || label === 'unknown') { this.label = 'unknown'; this.since = null; this.fired = false; return { label: 'unknown', progress: 0, fire: null }; }
    this.graceUntil = t + 200;
    if (label !== this.label) { this.label = label; this.since = t; this.fired = false; }
    const progress = Math.min(1, (t - this.since) / this.holdMs);
    if (progress >= 1 && !this.fired && t - this.firedAt >= this.cooldownMs) { this.fired = true; this.firedAt = t; return { label, progress, fire: label }; }
    return { label, progress, fire: null };
  }
}
