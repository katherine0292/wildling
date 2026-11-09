// Growth (PRD V2 F2-13, ADR-013). Growth is the reward for *balanced, low-stress* care.
//
// Gate: W = mean(fullness, energy, fun) ≥ 0.55, every one of them ≥ 0.20, stress ≤ 0.40,
// and the session is ACTIVE. The average alone is not enough: that was the weakness
// found in Prototype B, where one need could sit near zero while the cat kept growing.
//
// Behind the gate, growth comes from two sources:
//   • a slow passive drift while the kitten is content, sped up a little by trust;
//   • a burst for each completed act of care (a meal, a catch, a quiet contact, space
//     given when asked, a wrestle with a sibling, a hunt, a gift). Bursts are capped per
//     cause per minute, so varied care grows fastest and spamming one action cannot.
// A blocked gate pauses both sources and names the need that blocks it.

import { PARAMS } from './config.js';

export const PHASES = ['kitten', 'juvenile', 'adult'];
export const phaseOf = (age) => PHASES[Math.min(2, Math.floor(age))];

// What each chapter adds, shown to the visitor as the next goal.
export const UNLOCKS = {
  kitten: ['yarn', 'siblings'],
  juvenile: ['hunting'],
  adult: ['gifts'],
};

export function growthCheck(needs, p = PARAMS) {
  const g = p.growth;
  const w = (needs.fullness + needs.energy + needs.fun) / 3;
  const low = ['fullness', 'energy', 'fun'].filter((k) => needs[k] < g.minEach);
  let blockedBy = null;
  if (low.length) blockedBy = low.sort((a, b) => needs[a] - needs[b])[0];
  else if (needs.stress > g.maxStress) blockedBy = 'stress';
  else if (w < g.minWellbeing) blockedBy = 'wellbeing';
  return { wellbeing: w, ok: blockedBy === null, blockedBy };
}

// Caps bursts per cause within a rolling minute.
export class GrowthLedger {
  constructor(p = PARAMS) { this.cap = p.growth.burstCapPerMin; this.entries = []; }
  grant(cause, amount, time) {
    this.entries = this.entries.filter((e) => time - e.t < 60);
    const used = this.entries.filter((e) => e.cause === cause).reduce((s, e) => s + e.amount, 0);
    const ok = Math.max(0, Math.min(amount, this.cap - used));
    if (ok > 0) this.entries.push({ cause, amount: ok, t: time });
    return ok;
  }
}

function advance(c, amount) {
  const before = Math.floor(c.ageProgress);
  c.ageProgress = Math.min(3, c.ageProgress + amount);
  const after = Math.floor(c.ageProgress);
  return { phaseChanged: after !== before && after < 3, grown: c.ageProgress >= 3 && before < 3 };
}

// Passive drift. Returns { phaseChanged, grown, blockedBy }.
export function growthStep(c, dt, active, p = PARAMS) {
  const check = growthCheck(c.needs, p);
  c.growing = active && check.ok;
  c.growthBlockedBy = check.blockedBy;
  if (!c.growing || c.ageProgress >= 3) return { phaseChanged: false, grown: false, blockedBy: check.blockedBy };
  return { ...advance(c, dt * p.growth.perSec * (1 + p.growth.trustBoost * c.needs.trust)), blockedBy: null };
}

// A burst for one completed act of care. Returns { amount, phaseChanged, grown }.
export function growthBurst(c, cause, time, active, p = PARAMS) {
  const base = p.growth.burst[cause] ?? 0;
  if (!active || !base || c.ageProgress >= 3 || !growthCheck(c.needs, p).ok) return { amount: 0, phaseChanged: false, grown: false };
  const amount = c.growthLedger.grant(cause, base, time);
  if (!amount) return { amount: 0, phaseChanged: false, grown: false };
  return { amount, ...advance(c, amount) };
}
