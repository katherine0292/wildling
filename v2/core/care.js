// Care interactions and their boundaries (PRD V2 §14).
//
// Each function reads the creature `c` and the frame context `ctx`, mutates the
// creature, and emits semantic events. None of them decides *which* behaviour runs;
// that is the job of the utility selection in creature.js.
//
// Fairness rules that apply everywhere in this file:
//   • invalid tracking never costs trust and never counts as success
//   • a refusal never costs trust
//   • every reward comes from exactly one semantic event

import { PARAMS, clamp } from './config.js';

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Per-tool trust budget: "the same tool's rewards are capped within one minute".
export class RewardLedger {
  constructor(p = PARAMS) { this.cap = p.rewardCap.perToolTrustPerMin; this.entries = []; }
  grant(tool, amount, time) {
    this.entries = this.entries.filter((e) => time - e.t < 60);
    const used = this.entries.filter((e) => e.tool === tool).reduce((s, e) => s + e.amount, 0);
    const ok = Math.max(0, Math.min(amount, this.cap - used));
    if (ok > 0) this.entries.push({ tool, amount: ok, t: time });
    return ok;
  }
}

// ---------------------------------------------------------------- feeding (F2-08)
export function updateFood(c, ctx) {
  const life = c.p.feed.foodLifeSec;
  c.foods = c.foods.filter((f) => ctx.time - f.born < life);
}

export function finishEating(c, ctx) {
  const p = c.p.feed;
  const food = c.foods.find((f) => f.id === c.eatFoodId);
  c.foods = c.foods.filter((f) => f.id !== c.eatFoodId);
  c.eatFoodId = null;
  if (!food) return;
  const before = c.needSnapshot();
  c.needs.fullness = clamp(c.needs.fullness + p.fullness);
  c.needs.trust = clamp(c.needs.trust + c.ledger.grant('FEED', p.trust, ctx.time));
  c.stats.fed++;
  c.emit('eat_completed', ctx, { before, measurement: { foodId: food.id } });
}

// ---------------------------------------------------------------- startle (§13.4, §14.5)
export function updateStartle(c, ctx, dt) {
  const s = c.p.startle;
  const st = c.startle;
  const h = ctx.hand;
  if (!h.valid) { st.episode = null; return; } // uncertainty stops any penalty at once
  const fast = ctx.intent.label === 'fast_approach';
  // Chasing the toy is not a threat — but only while it is actually playing and relaxed.
  // Swinging a toy is play too: a wave only frightens when the hand holds nothing to play with.
  const exempt = (c.behaviour === 'PLAY' && c.needs.stress < c.p.limits.playStress) || (ctx.intent.wave && ctx.tool === 'PLAY');
  if (fast && !exempt) {
    if (ctx.time >= st.cooldownUntil) {
      const before = c.needSnapshot();
      c.needs.stress = clamp(c.needs.stress + s.stress);
      st.cooldownUntil = ctx.time + s.cooldownSec;
      // high trust shortens the retreat; it never removes the reaction entirely
      c.retreatUntil = ctx.time + c.p.startle.retreatSec * (1 - 0.6 * c.needs.trust);
      if (!st.episode) st.episode = { start: ctx.time, loss: 0, lastSeen: ctx.time };
      c.stats.startles++;
      c.markNeedsSpace('PRESSURE_HIGH', ctx.time);
      if (c.contact.active) endContact(c, ctx, 'startle');
      c.emit('startle', ctx, { before, reasonCode: 'PRESSURE_HIGH' });
      c.hint('PRESSURE_HIGH');
    }
    if (st.episode) {
      st.episode.lastSeen = ctx.time;
      if (ctx.time - st.episode.start > s.sustainAfterSec && st.episode.loss < s.maxTrustLoss) {
        const loss = Math.min(s.trustPerSec * dt, s.maxTrustLoss - st.episode.loss);
        st.episode.loss += loss;
        c.needs.trust = clamp(c.needs.trust - loss);
      }
    }
  } else if (st.episode && ctx.time - st.episode.lastSeen > 1) {
    st.episode = null;
  }
}

// ---------------------------------------------------------------- contact (F2-10)
export function updateDwell(c, ctx, dt) {
  const h = ctx.hand;
  const inZone = h.valid && dist(h.x, h.y, c.x, c.y) < c.p.creature.contactRadius;
  const slow = h.speed < (c.p.intent.strokeSpeed ?? c.p.intent.gentleSpeed);
  c.dwell = ctx.tool === 'PET' && inZone && slow ? c.dwell + dt : 0;
}

export function contactBudgetLeft(c, time) {
  const cp = c.p.contact;
  c.contact.budget = c.contact.budget.filter((e) => time - e.t < cp.budgetWindowSec);
  const used = c.contact.budget.reduce((s, e) => s + e.dt, 0);
  return Math.max(0, cp.trustBudgetSec - used);
}

export function startContact(c, ctx) {
  const h = ctx.hand;
  c.contact.active = true;
  c.contact.start = ctx.time;
  c.contact.positions = [];
  c.acceptedContact = true;
  c.emit('contact_started', ctx, {
    reasonCode: 'CONTACT_ACCEPTED',
    measurement: { handDistance: dist(h.x, h.y, c.x, c.y), dwellUsed: c.dwell },
  });
  c.hint('CONTACT_ACCEPTED');
}

export function endContact(c, ctx, cause) {
  if (!c.contact.active) return;
  const cp = c.contact;
  const duration = ctx.time - cp.start;
  const xs = cp.positions;
  let jitter = 0;
  if (xs.length > 2) {
    const mx = xs.reduce((s, q) => s + q.x, 0) / xs.length;
    const my = xs.reduce((s, q) => s + q.y, 0) / xs.length;
    jitter = Math.sqrt(xs.reduce((s, q) => s + (q.x - mx) ** 2 + (q.y - my) ** 2, 0) / xs.length);
  }
  cp.active = false;
  c.acceptedContact = false;
  c.dwell = 0;
  if (cause === 'segment') c.contactBreakUntil = ctx.time + c.p.contact.breakSec;
  // Only a contact that ended normally is evidence about rhythm; interrupted ones are not.
  const validity = cause === 'tracking' || cause === 'startle' || cause === 'stress' ? 'interrupted' : 'valid';
  c.emit('contact_ended', ctx, { validity, measurement: { duration, jitter, cause } });
}

export function updateContact(c, ctx, dt) {
  if (!c.contact.active) return;
  const h = ctx.hand;
  if (!h.valid) { endContact(c, ctx, 'tracking'); c.hint('TRACKING_LOST'); return; }
  const d = dist(h.x, h.y, c.x, c.y);
  if (ctx.tool !== 'PET' || d > c.p.creature.contactRadius * 1.35) { endContact(c, ctx, 'left'); return; }
  if (c.needs.stress >= c.p.limits.stressRefuse) { endContact(c, ctx, 'stress'); return; }
  if (ctx.time - c.contact.start >= c.p.contact.maxSegmentSec) { endContact(c, ctx, 'segment'); return; }

  const cp = c.p.contact;
  if (contactBudgetLeft(c, ctx.time) > 0) {
    c.needs.trust = clamp(c.needs.trust + cp.trustPerSec * dt);
    c.contact.budget.push({ t: ctx.time, dt });
  }
  c.needs.stress = clamp(c.needs.stress - cp.stressPerSec * dt);
  c.stats.contactSec += dt;
  c.contact.positions.push({ x: h.x, y: h.y });
}

// ---------------------------------------------------------------- play (F2-09)
export function updatePlay(c, ctx, dt) {
  if (c.behaviour !== 'PLAY') { c.play.since = null; return; }
  const pp = c.p.play;
  const h = ctx.hand;
  if (c.play.since === null) c.play.since = ctx.time;
  c.needs.energy = clamp(c.needs.energy - c.p.needs.playEnergyDrain * dt);
  // the target is the toy: the hand itself (yarn), a trailing feather, or a rolling ball
  const toy = ctx.toy ?? (h.valid ? { kind: 'yarn', x: h.x, y: h.y, valid: true, speed: h.speed } : null);
  if (!toy?.valid) return;
  const reach = c.p.creature.bodyRadius + pp.pounceS;
  if (dist(toy.x, toy.y, c.x, c.y) < reach && ctx.time - c.play.lastPounce >= pp.minIntervalSec
      && toy.kind === 'feather' && toy.speed > c.p.toys.feather.catchBelow) {
    // a feather flicked too fast is a leap and a miss: a little fun, no reward
    c.play.lastPounce = ctx.time;
    c.needs.fun = clamp(c.needs.fun + c.p.toys.feather.missFun);
    c.emit('pounce_missed', ctx, { measurement: { toy: toy.kind } });
  } else if (dist(toy.x, toy.y, c.x, c.y) < reach && ctx.time - c.play.lastPounce >= pp.minIntervalSec) {
    const interval = Number.isFinite(c.play.lastPounce) ? ctx.time - c.play.lastPounce : null;
    const before = c.needSnapshot();
    c.needs.fun = clamp(c.needs.fun + pp.fun);
    c.needs.energy = clamp(c.needs.energy - pp.energy);
    c.needs.trust = clamp(c.needs.trust + c.ledger.grant('PLAY', pp.trust, ctx.time));
    c.play.lastPounce = ctx.time;
    c.stats.pounces++;
    c.emit('pounce_success', ctx, { before, measurement: { interval, toy: toy.kind ?? 'yarn' } });
  }
  // a natural pause after 20 s of continuous play
  if (ctx.time - c.play.since >= c.p.limits.playPauseAfter) {
    c.play.pauseUntil = ctx.time + 3;
    c.play.since = null;
    c.hint('PLAY_PAUSE');
    c.forceRedecide = true;
  }
}

// ---------------------------------------------------------------- waiting (F2-11)
export function updateWaiting(c, ctx, dt) {
  const h = ctx.hand;
  const edge = h.valid ? dist(h.x, h.y, c.x, c.y) - c.p.creature.bodyRadius : null;
  // Mouse leaving the canvas or Give-space with a far hand is a deliberate step back.
  // A lost camera hand is NOT waiting: we do not know what the visitor is doing.
  const farNow = (h.valid && edge > c.p.wait.farS) || (!h.present && h.source !== 'camera');
  if (farNow) { if (c.wait.farSince === null) c.wait.farSince = ctx.time; } else c.wait.farSince = null;
  c.waiting = c.wait.farSince !== null && ctx.time - c.wait.farSince >= c.p.wait.stableSec;

  const calm = ctx.time - c.startle.cooldownUntil > 0 && !c.startle.episode;
  if (c.waiting) c.needs.stress = clamp(c.needs.stress - c.p.needs.waitStressRecovery * dt);
  else if (calm && !c.contact.active) c.needs.stress = clamp(c.needs.stress - c.p.needs.calmStressRecovery * dt);

  // One verifiable "you gave me space" per episode — never counted per frame.
  const ns = c.needsSpace;
  if (!ns) return;
  if (c.waiting) ns.waited += dt;
  const recovered = ns.reason === 'NEED_REST'
    ? c.needs.energy >= c.p.limits.restExit
    : c.needs.stress < c.p.limits.stressRecover;
  if (recovered && ns.waited >= c.p.wait.stableSec) {
    c.needsSpace = null;
    c.emit('space_respected', ctx, { reasonCode: 'SPACE_RESPECTED', measurement: { waited: ns.waited, after: ns.reason } });
    c.hint('SPACE_RESPECTED');
  } else if (recovered && !c.waiting) {
    c.needsSpace = null; // recovered on its own; no credit claimed for the visitor
  }
}
