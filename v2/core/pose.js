// Hand-shape commands for the litter (ADR-017). A rule baseline on the 21 HandPose
// keypoints: which fingers are extended, and how bent. Like the motion intent in
// intent.js, it says `unknown` rather than guess, and a shape must be held steadily
// before it counts as a command.
//
//   open_palm  ✋ all four fingers straight          → make friends
//   peace      ✌ index and middle up, others folded  → cuddle up
//   fist       ✊ all fingers folded                  → play-fight
//   claw       🐾 fingers bent at the knuckles       → hiss
//
// It is labelled `rule_baseline`, never presented as a trained model; the trained
// gesture model planned in WP03 would replace `classifyPose` behind the same output.

export const POSE_ACTS = { open_palm: 'befriend', peace: 'cuddle', fist: 'fight', claw: 'hiss' };
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]; // MCP, PIP, DIP, TIP
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Angle at the middle joint (π = straight).
function bend(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

// Per-finger state from geometry that does not depend on hand size or rotation.
export function fingerStates(kp) {
  const wrist = kp[0], palm = d(kp[0], kp[9]) || 1e-6;
  return FINGERS.map(([mcp, pip, dip, tip]) => {
    const reach = d(kp[tip], wrist) / palm;          // ~1.9 straight, ~0.9 folded
    const pipAngle = bend(kp[mcp], kp[pip], kp[dip]); // ~π straight
    const straight = reach > 1.55 && pipAngle > 2.5;
    const folded = reach < 1.15;
    const bent = !straight && !folded && pipAngle < 2.35; // knuckles bent, tips still out: a claw
    return { reach, pipAngle, straight, folded, bent };
  });
}

// → { label, score }  label ∈ open_palm | peace | fist | claw | unknown
export function classifyPose(kp) {
  if (!Array.isArray(kp) || kp.length !== 21 || !kp.every((k) => Number.isFinite(k?.x) && Number.isFinite(k?.y))) return { label: 'unknown', score: 0 };
  const f = fingerStates(kp);
  const n = (key) => f.filter((x) => x[key]).length;
  const scores = {
    open_palm: n('straight') / 4,
    fist: n('folded') / 4,
    claw: n('bent') / 4,
    peace: (f[0].straight && f[1].straight ? 0.5 : 0) + ((f[2].folded || f[2].bent) && (f[3].folded || f[3].bent) ? 0.5 : 0),
  };
  if (scores.peace >= 1) scores.open_palm = Math.min(scores.open_palm, 0.5);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [label, score] = ranked[0];
  // reject anything that is not clearly one shape
  if (score < 0.75 || score - ranked[1][1] < 0.25) return { label: 'unknown', score };
  return { label, score };
}

// Holds a shape steady before it becomes a command, and fires it once.
export class PoseGate {
  constructor({ holdMs = 600, cooldownMs = 1500 } = {}) { this.holdMs = holdMs; this.cooldownMs = cooldownMs; this.reset(); }
  reset() { this.label = 'unknown'; this.since = null; this.firedAt = -Infinity; this.fired = false; }
  // returns { label, progress (0..1), fire: label | null }
  update(label, t, valid) {
    if (!valid || label === 'unknown') { this.label = 'unknown'; this.since = null; this.fired = false; return { label: 'unknown', progress: 0, fire: null }; }
    if (label !== this.label) { this.label = label; this.since = t; this.fired = false; }
    const progress = Math.min(1, (t - this.since) / this.holdMs);
    if (progress >= 1 && !this.fired && t - this.firedAt >= this.cooldownMs) { this.fired = true; this.firedAt = t; return { label, progress, fire: label }; }
    return { label, progress, fire: null };
  }
}
