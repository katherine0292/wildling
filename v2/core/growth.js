// Growth (PRD V2 F2-13). Growth is the reward for *balanced, low-stress* care:
//   W = mean(fullness, energy, fun) ≥ 0.55, every one of them ≥ 0.20, stress ≤ 0.40,
//   and the session is ACTIVE. The average alone is not enough — that was the
//   weakness found in Prototype B, where one need could sit near zero while the
//   cat kept growing.

import { PARAMS } from './config.js';

export const PHASES = ['kitten', 'juvenile', 'adult'];
export const phaseOf = (age) => PHASES[Math.min(2, Math.floor(age))];

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

// Advances ageProgress. Returns { phaseChanged, grown, blockedBy }.
export function growthStep(c, dt, active, p = PARAMS) {
  const check = growthCheck(c.needs, p);
  c.growing = active && check.ok;
  c.growthBlockedBy = check.blockedBy;
  if (!c.growing || c.ageProgress >= 3) return { phaseChanged: false, grown: false, blockedBy: check.blockedBy };
  const before = Math.floor(c.ageProgress);
  c.ageProgress = Math.min(3, c.ageProgress + dt * p.growth.perSec * (1 + p.growth.trustBoost * c.needs.trust));
  const after = Math.floor(c.ageProgress);
  return { phaseChanged: after !== before && after < 3, grown: c.ageProgress >= 3, blockedBy: null };
}
