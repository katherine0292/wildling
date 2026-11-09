// CreatureCore — the one authoritative "brain" (PRD V2 §13, ADR-006, ADR-008).
//
// Decision = hard constraints first, then utility among the remaining candidates.
// Every decision leaves a record: candidates, scores, what blocked them and why the
// winner won. That record is what the staff panel shows and what tests assert on.
//
// This module is pure: no DOM, no p5, no clock. The same code runs in the browser
// browser build and in `node --test`, which is the boundary a future Node.js service keeps.

import { PARAMS, clamp } from './config.js';
import { growthStep, growthBurst, GrowthLedger, phaseOf, PHASES } from './growth.js';
import {
  dist, RewardLedger, updateFood, finishEating, updateStartle, updateDwell,
  updateContact, startContact, endContact, updatePlay, updateWaiting,
} from './care.js';

export const BEHAVIOURS = ['EXPLORE', 'SEEK_FOOD', 'REST', 'GROOM', 'APPROACH', 'PLAY', 'CONTACT', 'RETREAT', 'OBSERVE', 'SOCIAL', 'HUNT', 'GIFT'];
export const GIFTS = ['pebble', 'feather', 'flower', 'shell'];
// How rough each kitten plays: wrestling with Saffron gets tense sooner than with Juniper.
const ROUGH = { ember: 1, juniper: 0.6, saffron: 1.5 };
// Which completed act of care feeds which growth burst.
const GROWTH_CAUSE = {
  eat_completed: () => 'FEED',
  pounce_success: () => 'PLAY',
  contact_ended: (e) => (e.validity === 'valid' && e.measurement.duration >= 1.5 ? 'PET' : null),
  space_respected: () => 'WAIT',
  sibling_play: (e) => (e.measurement.endedBy === 'done' ? 'SOCIAL' : null),
  hunt_pounce: () => 'HUNT',
  gift_given: () => 'GIFT',
};
const IDLE = new Set(['EXPLORE', 'OBSERVE', 'GROOM']);
// A lead-in may hand over to its follow-up without the switching margin
// (walking up to the hand → being petted).
const LEADS = { APPROACH: ['CONTACT'], OBSERVE: ['CONTACT'] };

let eventCounter = 0;

export class CreatureCore {
  constructor({ world, params = PARAMS, rand = Math.random, demo = false, id = 'cat', kitten = null, region = null, at = null } = {}) {
    this.p = params;
    this.world = world;
    this.rand = rand;
    this.demo = demo;
    this.id = id;
    this.kitten = kitten;
    // ambient siblings keep to a region of the world so the visitor's kitten stays central
    this.region = region;
    const cp = params.creature;
    this.x = at ? at.x : world.w * 0.5; this.y = at ? at.y : world.h * 0.45;
    this.vx = 0; this.vy = 0; this.heading = 0;
    this.needs = { fullness: cp.fullness, energy: cp.energy, fun: cp.fun, trust: cp.trust, stress: cp.stress, ...(kitten?.start ?? {}) };
    this.ageProgress = 0;
    this.behaviour = 'OBSERVE';
    this.behaviourSince = 0;
    this.boutUntil = 2;
    this.wanderTarget = null;
    this.eatUntil = 0; this.eatFoodId = null;
    this.restMinUntil = 0;
    this.retreatUntil = -1;
    this.groomReadyAt = 4;
    this.groomUntil = 0;
    this.foods = [];
    this.acceptedContact = false;
    this.inviting = false;
    this.dwell = 0;
    this.contact = { active: false, start: 0, positions: [], budget: [] };
    this.contactBreakUntil = 0;
    this.play = { since: null, lastPounce: -Infinity, pauseUntil: 0 };
    this.startle = { cooldownUntil: -Infinity, episode: null };
    this.wait = { farSince: null };
    this.waiting = false;
    this.needsSpace = null;
    this.transitionUntil = 0;
    this.growing = false;
    this.growthBlockedBy = null;
    this.ledger = new RewardLedger(params);
    this.growthLedger = new GrowthLedger(params);
    this.lastBurst = null;
    // litter life: an external goal / held pose (siblings only), social and hunting state
    this.goal = null;
    this.held = null;
    this.social = { target: null, partner: null, wrestleUntil: 0, wrestleStart: 0, cooldownUntil: 0, refused: null };
    this.reaction = null; // { type: 'hiss', reasonCode, sibling, until }
    this.huntState = { cooldownUntil: 0 };
    this.giftState = { readyAt: 0, stage: null, spot: null, item: null, seq: 0 };
    this.stats = { fed: 0, pounces: 0, contactSec: 0, startles: 0, refusals: 0, wrestles: 0, hisses: 0, hunts: 0, catches: 0, gifts: 0 };
    this.events = [];
    this.hints = [];
    this.decision = { candidates: [], chosen: 'OBSERVE', why: 'start', forced: null };
    this.nextDecision = 0;
    this.forceRedecide = false;
    this.lastRequestRefusal = {};
  }

  // ---------------------------------------------------------------- helpers
  needSnapshot() { return { ...this.needs }; }

  emit(type, ctx, extra = {}) {
    this.events.push({
      id: `e${++eventCounter}`,
      type,
      simulationTime: ctx.time,
      source: ctx.hand?.source ?? null,
      validity: extra.validity ?? 'valid',
      before: extra.before ?? null,
      after: this.needSnapshot(),
      reasonCode: extra.reasonCode ?? null,
      measurement: extra.measurement ?? null,
    });
  }

  hint(code) { this.hints.push(code); }

  markNeedsSpace(reason, time) {
    if (!this.needsSpace) this.needsSpace = { reason, since: time, waited: 0 };
  }

  get phase() { return phaseOf(this.ageProgress); }
  get phaseIndex() { return PHASES.indexOf(this.phase); }
  get wrestling() { return this.social.partner !== null && (this.lastTime ?? 0) < this.social.wrestleUntil; }
  get relation() { const t = this.needs.trust; return t < 0.35 ? 0 : t < 0.6 ? 1 : 2; }
  get bodyRadius() { return this.p.creature.bodyRadius * (0.8 + 0.1 * this.ageProgress); }

  drainEvents() { const e = this.events; this.events = []; return e; }
  drainHints() { const h = this.hints; this.hints = []; return h; }

  // Moving a sibling to a new region sends it walking there now, not after its nap.
  setRegion(region) {
    this.region = region;
    this.wanderTarget = null;
    this.behaviour = 'EXPLORE';
    this.restMinUntil = 0;
    this.boutUntil = (this.lastTime ?? 0) + 8;
  }

  inRegion() {
    const r = this.region;
    if (!r) return true;
    const nx = this.x / this.world.w, ny = this.y / this.world.h;
    return nx >= r.x0 - 0.02 && nx <= r.x1 + 0.02 && ny >= r.y0 - 0.02 && ny <= r.y1 + 0.02;
  }

  setWorld(world) {
    const sx = world.w / this.world.w, sy = world.h / this.world.h;
    this.x *= sx; this.y *= sy;
    for (const f of this.foods) { f.x *= sx; f.y *= sy; }
    this.world = world;
  }

  addFood(food) { this.foods.push(food); }

  // ---------------------------------------------------------------- main step
  // ctx: { time, active, frozen, hand:{valid,present,x,y,speed,source,quality}, intent:{label}, tool, prefs }
  step(dt, ctx) {
    this.lastTime = ctx.time;
    if (ctx.frozen) { this.vx *= 0.8; this.vy *= 0.8; return { phaseChanged: false, grown: false }; }
    if (this.reaction && ctx.time >= this.reaction.until) this.reaction = null;
    if (this.held) {
      if (ctx.time < this.held.until) { this.behaviour = this.held.behaviour; this.actHeld(dt, ctx); return { phaseChanged: false, grown: false }; }
      this.held = null;
      this.forceRedecide = true;
    }
    const firstEvent = this.events.length;

    this.updateNeeds(dt);
    updateFood(this, ctx);
    updateDwell(this, ctx, dt);
    updateStartle(this, ctx, dt);
    updateWaiting(this, ctx, dt);
    this.updateInviting(ctx);

    if (ctx.time >= this.nextDecision || this.forceRedecide) {
      this.forceRedecide = false;
      this.nextDecision = ctx.time + this.p.sim.decisionInterval;
      if (ctx.time >= this.transitionUntil) this.decide(ctx);
    }
    this.act(dt, ctx);
    updateContact(this, ctx, dt);
    updatePlay(this, ctx, dt);
    this.updateWrestle(dt, ctx);
    this.checkHiss(ctx);

    const canGrow = ctx.active && !this.demo && ctx.time >= this.transitionUntil;
    const g = growthStep(this, dt, canGrow, this.p);
    this.afterGrowth(g, ctx);
    // a completed act of care is also a burst of growth
    const done = this.events.slice(firstEvent);
    for (const e of done) {
      const cause = GROWTH_CAUSE[e.type]?.(e);
      if (!cause) continue;
      const b = growthBurst(this, cause, ctx.time, canGrow && ctx.time >= this.transitionUntil, this.p);
      if (!b.amount) continue;
      this.lastBurst = { cause, amount: b.amount, time: ctx.time };
      this.emit('growth_burst', ctx, { measurement: { cause, amount: b.amount, for: e.id } });
      this.afterGrowth(b, ctx);
    }
    return g;
  }

  afterGrowth(g, ctx) {
    if (g.phaseChanged) {
      this.transitionUntil = ctx.time + this.p.growth.transitionSec;
      this.emit('phase_changed', ctx, { measurement: { phase: this.phase } });
    }
    if (g.grown) {
      this.transitionUntil = ctx.time + this.p.growth.transitionSec;
      this.emit('fully_grown', ctx, { measurement: { phase: 'adult' } });
    }
  }

  // Siblings are puppeteered by the simulation while they visit, wrestle or flee.
  actHeld(dt, ctx) {
    const h = this.held;
    let dvx = 0, dvy = 0;
    if (h.flee) {
      const ax = this.x - h.flee.x, ay = this.y - h.flee.y, m = Math.hypot(ax, ay) || 1;
      dvx = (ax / m) * this.p.creature.speed.retreat; dvy = (ay / m) * this.p.creature.speed.retreat;
    } else if (h.at) {
      const dx = h.at.x - this.x, dy = h.at.y - this.y, d = Math.hypot(dx, dy);
      if (d > 0.01) { const s = Math.min(this.p.creature.speed.play, d * 4); dvx = (dx / d) * s; dvy = (dy / d) * s; }
    }
    this.move(dvx, dvy, dt, h.face ?? null);
  }

  updateNeeds(dt) {
    const n = this.needs, d = this.p.needs;
    if (this.demo) {
      // The attract-loop cat has no visitor to care for it; its needs drift back
      // toward neutral so it can loop for hours, and it naps often to look alive.
      n.fullness += (0.6 - n.fullness) * 0.01 * dt;
      n.fun += (0.6 - n.fun) * 0.01 * dt;
      n.energy = clamp(n.energy + (this.behaviour === 'REST' ? d.restGain * 2 : -d.energyDecay * 4) * dt);
      return;
    }
    n.fullness = clamp(n.fullness - d.fullnessDecay * dt);
    n.fun = clamp(n.fun - d.funDecay * dt);
    n.energy = clamp(n.energy + (this.behaviour === 'REST' ? d.restGain : -d.energyDecay) * dt);
  }

  updateInviting(ctx) {
    const h = ctx.hand;
    if (!h.valid) { this.inviting = false; return; }
    const d = dist(h.x, h.y, this.x, this.y);
    const radius = ctx.prefs.approachRadius + 0.02;
    this.inviting = this.behaviour === 'CONTACT'
      || (this.behaviour === 'APPROACH' && d <= radius)
      || (this.behaviour === 'OBSERVE' && d <= this.p.creature.contactRadius
          && this.needs.trust >= 0.35 && this.needs.stress < this.p.limits.stressRecover);
  }

  // ---------------------------------------------------------------- decision
  candidates(ctx) {
    const n = this.needs, L = this.p.limits, h = ctx.hand;
    const handNear = h.valid && dist(h.x, h.y, this.x, this.y) < 0.6;
    const petRequest = ctx.tool === 'PET' && h.valid && ['stable_contact', 'gentle_approach'].includes(ctx.intent.label);
    const playRequest = ctx.tool === 'PLAY' && h.valid;
    const resting = this.behaviour === 'REST' && n.energy < L.restExit;
    const c = [];
    const add = (name, score, blocked = null, request = false) => {
      const boosted = clamp(score) + (request && !blocked ? this.p.utility.requestBoost : 0);
      c.push({ name, base: clamp(score), score: boosted, available: !blocked, blocked, request });
    };

    // Explore gets bored: after a bout its score drops so other idle acts can win.
    add('EXPLORE', 0.25 + 0.1 * n.fun);
    add('OBSERVE', 0.2);
    add('SEEK_FOOD', 0.1 + 0.9 * (1 - n.fullness),
      !this.foods.length ? 'no_food' : n.fullness >= L.fullAt ? 'TOO_FULL' : null, this.foods.length > 0);
    // Tuned from PRD's linear 0.1 + 0.9(1-energy): squared so a rested cat does not nap
    // all the time. Flagged for review in docs/STATUS.md.
    add('REST', 0.1 + 0.9 * (1 - n.energy) ** 2);
    add('GROOM', 0.15 + 0.15 * n.fullness - 0.1 * n.stress, ctx.time < this.groomReadyAt ? 'cooldown' : null);
    add('APPROACH', 0.2 + 0.4 * n.trust - 0.5 * n.stress,
      !h.valid ? 'input' : !handNear ? 'far'
        : n.stress >= L.stressRefuse ? 'PRESSURE_HIGH'
        : resting ? 'NEED_REST'
        : !(petRequest || ctx.intent.label === 'gentle_approach') ? 'no_invitation' : null,
      petRequest);
    add('PLAY', 0.15 + 0.5 * (1 - n.fun) + 0.2 * n.trust,
      ctx.tool !== 'PLAY' ? 'tool' : !h.valid ? 'input'
        : n.energy <= L.playEnergy || resting ? 'NEED_REST'
        : n.stress >= L.playStress ? 'PRESSURE_HIGH'
        : ctx.time < this.play.pauseUntil ? 'PLAY_PAUSE' : null,
      playRequest);
    const contactBlock = ctx.tool !== 'PET' ? 'tool'
      : !h.valid ? 'input'
      : ctx.intent.label !== 'stable_contact' ? 'intent'
      : resting ? 'NEED_REST'
      : n.stress >= L.stressRefuse ? 'PRESSURE_HIGH'
      : n.fullness < L.hungerBlocksContact ? 'HUNGRY_FIRST'
      : !this.inviting ? 'NOT_READY'
      : ctx.time < this.contactBreakUntil ? 'break'
      : this.dwell < ctx.prefs.contactDwell ? 'dwell' : null;
    add('CONTACT', 0.35 + 0.3 * n.trust - 0.4 * n.stress, contactBlock, ctx.tool === 'PET');
    add('RETREAT', 0.2 + 0.7 * n.stress - 0.2 * n.trust,
      n.stress >= L.stressRefuse || ctx.time < this.retreatUntil ? null : 'calm');

    // ---- life with the litter, hunting and gifts (ADR-012). Same rules for every kitten.
    const sibs = ctx.siblings ?? [];
    const invited = sibs.find((s) => s.invited);
    const visitor = sibs.filter((s) => s.visiting && dist(s.x, s.y, this.x, this.y) < this.p.social.nearS)
      .sort((a, b) => dist(a.x, a.y, this.x, this.y) - dist(b.x, b.y, this.x, this.y))[0];
    const partner = invited ?? visitor ?? null;
    this.social.target = partner?.id ?? null;
    const tired = resting || n.energy <= L.playEnergy;
    add('SOCIAL', 0.2 + 0.5 * (1 - n.fun) + 0.1 * n.energy,
      !partner ? 'alone'
        : ctx.time < this.social.cooldownUntil ? 'cooldown'
        : tired ? 'NEED_REST'
        : n.stress >= L.playStress ? 'PRESSURE_HIGH'
        : n.fullness < L.hungerBlocksContact ? 'HUNGRY_FIRST' : null,
      !!invited);
    const cr = ctx.critter;
    add('HUNT', 0.25 + 0.45 * (1 - n.fun),
      this.phaseIndex < this.p.hunt.minPhase ? 'too_young'
        : !cr ? 'none'
        : ctx.time < this.huntState.cooldownUntil ? 'cooldown'
        : tired ? 'NEED_REST'
        : n.stress >= L.playStress ? 'PRESSURE_HIGH' : null);
    const gp = this.p.gift;
    add('GIFT', 0.3 + 0.3 * n.trust,
      this.phaseIndex < gp.minPhase ? 'too_young'
        : n.trust < gp.minTrust ? 'trust'
        : !h.valid ? 'input'
        : ctx.time < this.giftState.readyAt ? 'cooldown'
        : tired ? 'NEED_REST'
        : n.stress >= L.playStress ? 'PRESSURE_HIGH' : null);

    const bored = this.behaviour === 'EXPLORE' && ctx.time >= this.boutUntil;
    if (bored) c[0].score = c[0].base = clamp(c[0].base - 0.15);
    return c;
  }

  // Hard constraints → utility. Records everything needed to explain the choice.
  decide(ctx) {
    const n = this.needs, L = this.p.limits;
    const cands = this.candidates(ctx);
    this.reportRefusals(ctx, cands);
    this.reportInviteRefusal(ctx, cands);
    let forced = null;

    if (this.behaviour === 'EAT') forced = ['EAT', 'eating lock (1.2 s)'];
    else if (this.goal) forced = ['EXPLORE', 'visiting a sibling'];
    else if (this.wrestling) forced = ['SOCIAL', 'wrestling'];
    else if (ctx.time < this.retreatUntil) forced = ['RETREAT', 'pressure protection'];
    else if (n.energy < L.restEnter) forced = ['REST', 'energy below 0.15'];
    else if (this.behaviour === 'REST' && (n.energy < L.restExit || ctx.time < this.restMinUntil)) forced = ['REST', 'resting until energy 0.65'];
    else if (this.behaviour === 'GROOM' && ctx.time < this.groomUntil) forced = ['GROOM', 'short action'];

    if (forced) {
      this.setBehaviour(forced[0], ctx);
      this.decision = { candidates: cands, chosen: forced[0], why: forced[1], forced: forced[1] };
      return;
    }

    const avail = cands.filter((c) => c.available).sort((a, b) => b.score - a.score || BEHAVIOURS.indexOf(a.name) - BEHAVIOURS.indexOf(b.name));
    const best = avail[0];
    const current = cands.find((c) => c.name === this.behaviour);
    const u = this.p.utility;
    let chosen = this.behaviour;
    let why;

    if (!current || !current.available) { chosen = best.name; why = `${this.behaviour} no longer allowed`; }
    else if (IDLE.has(this.behaviour) && ctx.time >= this.boutUntil && best.name !== this.behaviour) { chosen = best.name; why = 'idle bout finished'; }
    else if (best.name !== this.behaviour && LEADS[this.behaviour]?.includes(best.name)) { chosen = best.name; why = 'request accepted'; }
    else if (best.name !== this.behaviour && best.score > current.score + u.switchMargin
             && ctx.time - this.behaviourSince >= u.minHoldSec) { chosen = best.name; why = `+${(best.score - current.score).toFixed(2)} over current`; }
    else { why = best.name === this.behaviour ? 'highest score' : `inertia (+${u.inertia.toFixed(2)})`; }

    if (current) current.inertia = u.inertia;
    this.setBehaviour(chosen, ctx);
    this.decision = { candidates: cands, chosen, why, forced: null };
  }

  // Tell the visitor why a request they are making right now is not accepted.
  reportRefusals(ctx, cands) {
    const h = ctx.hand;
    if (!h.valid) return;
    const refuse = (name, inZoneOnly) => {
      const c = cands.find((x) => x.name === name);
      const code = c?.blocked;
      if (!code || !/^[A-Z_]+$/.test(code)) return;
      if (inZoneOnly && dist(h.x, h.y, this.x, this.y) > this.p.creature.contactRadius * 1.4) return;
      if (this.lastRequestRefusal[name] === code && ctx.time - (this.lastRequestRefusal[`${name}_t`] ?? 0) < 4) return;
      this.lastRequestRefusal[name] = code;
      this.lastRequestRefusal[`${name}_t`] = ctx.time;
      this.stats.refusals++;
      if (code === 'NEED_REST' || code === 'PRESSURE_HIGH') this.markNeedsSpace(code, ctx.time);
      this.emit('refusal', ctx, { reasonCode: code, measurement: { request: name } });
      this.hint(code);
    };
    if (ctx.tool === 'PET' && ['stable_contact', 'gentle_approach'].includes(ctx.intent.label)) refuse('CONTACT', true);
    if (ctx.tool === 'PLAY' && h.speed > 0.05) refuse('PLAY', false);
  }

  // An invitation to play with a sibling is a request too: refused with a reason, once.
  reportInviteRefusal(ctx, cands) {
    const inv = (ctx.siblings ?? []).find((s) => s.invited);
    if (!inv || this.social.refused === inv.inviteId) return;
    const c = cands.find((x) => x.name === 'SOCIAL');
    if (!c?.blocked || !/^[A-Z_]+$/.test(c.blocked)) return;
    this.social.refused = inv.inviteId;
    this.stats.refusals++;
    if (c.blocked === 'NEED_REST' || c.blocked === 'PRESSURE_HIGH') this.markNeedsSpace(c.blocked, ctx.time);
    this.emit('refusal', ctx, { reasonCode: c.blocked, measurement: { request: 'SOCIAL', sibling: inv.kitten } });
    this.hint(c.blocked);
  }

  setBehaviour(name, ctx) {
    if (name === this.behaviour) return;
    const prev = this.behaviour;
    if (prev === 'CONTACT' && this.contact.active) endContact(this, ctx, 'left');
    this.behaviour = name;
    this.behaviourSince = ctx.time;
    const r = this.rand;
    if (name === 'EXPLORE') { this.boutUntil = ctx.time + 6 + r() * 4; this.wanderTarget = null; }
    if (name === 'OBSERVE') this.boutUntil = ctx.time + 2 + r() * 2;
    if (name === 'GROOM') { this.groomUntil = ctx.time + this.p.limits.groomSec; this.boutUntil = this.groomUntil; this.groomReadyAt = ctx.time + this.p.limits.groomCooldown; }
    if (name === 'REST') this.restMinUntil = ctx.time + this.p.limits.restMinSec;
    if (name === 'CONTACT') startContact(this, ctx);
    if (name === 'SEEK_FOOD') this.eatFoodId = null;
    if (name === 'GIFT') { this.giftState.stage = 'fetch'; this.giftState.spot = this.randomPoint(); this.giftState.item = null; }
    if (prev === 'GIFT') { this.giftState.stage = null; this.giftState.item = null; }
  }

  // ---------------------------------------------------------------- litter, hunting, gifts
  updateWrestle(dt, ctx) {
    const s = this.social, sp = this.p.social;
    if (s.partner === null) return;
    if (ctx.time < s.wrestleUntil) {
      const partner = (ctx.siblings ?? []).find((o) => o.id === s.partner);
      const rough = ROUGH[partner?.kitten] ?? 1;
      this.needs.fun = clamp(this.needs.fun + (sp.fun / sp.wrestleSec) * dt);
      this.needs.energy = clamp(this.needs.energy - (sp.energy / sp.wrestleSec) * dt);
      this.needs.stress = clamp(this.needs.stress + sp.stressPerSec * rough * dt);
      if (this.needs.stress < this.p.limits.playStress) return;
      // play got too rough: it ends in a hiss, never in a penalty for the visitor
      this.endWrestle(ctx, 'too_rough', partner);
      this.hiss(ctx, 'SIB_TENSE', partner);
      return;
    }
    this.endWrestle(ctx, 'done', (ctx.siblings ?? []).find((o) => o.id === s.partner));
  }

  endWrestle(ctx, endedBy, partner) {
    const s = this.social;
    const duration = Math.max(0, Math.min(ctx.time, s.wrestleUntil) - s.wrestleStart);
    s.partner = null;
    s.wrestleUntil = 0;
    s.cooldownUntil = ctx.time + this.p.social.cooldownSec;
    this.stats.wrestles++;
    this.emit('sibling_play', ctx, { reasonCode: endedBy === 'done' ? 'SIB_PLAY' : 'SIB_TENSE', measurement: { sibling: partner?.kitten ?? null, duration, endedBy } });
    if (endedBy === 'done') this.hint('SIB_PLAY');
    this.behaviour = 'OBSERVE'; this.behaviourSince = ctx.time; this.boutUntil = ctx.time + 1.5;
    this.forceRedecide = true;
  }

  hiss(ctx, reasonCode, sib) {
    this.reaction = { type: 'hiss', reasonCode, sibling: sib?.kitten ?? null, siblingId: sib?.id ?? null, until: ctx.time + this.p.social.hissSec };
    this.social.cooldownUntil = ctx.time + this.p.social.cooldownSec;
    this.stats.hisses++;
    this.emit('hiss', ctx, { reasonCode, measurement: { sibling: sib?.kitten ?? null, behaviour: this.behaviour } });
    this.hint(reasonCode);
  }

  // A sibling that comes too close while the kitten eats, sleeps or is tense gets hissed at.
  // This is the kitten's own boundary toward its litter-mates; it never touches trust.
  checkHiss(ctx) {
    if (this.demo || this.reaction || this.wrestling) return;
    const n = this.needs, sp = this.p.social;
    const near = (ctx.siblings ?? []).find((o) => dist(o.x, o.y, this.x, this.y) < sp.hissS && o.id !== this.social.target);
    if (!near) return;
    const code = this.behaviour === 'EAT' || (this.behaviour === 'SEEK_FOOD' && n.fullness < 0.6) ? 'SIB_FOOD'
      : this.behaviour === 'REST' ? 'SIB_REST'
      : n.stress >= this.p.limits.playStress ? 'SIB_TENSE' : null;
    if (code) this.hiss(ctx, code, near);
  }

  startWrestle(ctx, partner) {
    this.social.partner = partner.id;
    this.social.wrestleStart = ctx.time;
    this.social.wrestleUntil = ctx.time + this.p.social.wrestleSec;
  }

  huntPounce(ctx, critter) {
    const hp = this.p.hunt;
    const before = this.needSnapshot();
    const caught = this.rand() < hp.catchChance;
    this.needs.fun = clamp(this.needs.fun + hp.fun);
    this.needs.energy = clamp(this.needs.energy - hp.energy);
    this.huntState.cooldownUntil = ctx.time + hp.cooldownSec;
    this.stats.hunts++;
    if (caught) this.stats.catches++;
    this.emit('hunt_pounce', ctx, { before, measurement: { critter: critter.kind, critterId: critter.id, caught } });
    this.forceRedecide = true;
  }

  dropGift(ctx) {
    const g = this.giftState;
    g.readyAt = ctx.time + this.p.gift.cooldownSec;
    this.stats.gifts++;
    this.emit('gift_given', ctx, { reasonCode: 'GIFT_GIVEN', measurement: { item: g.item, giftId: `g${++g.seq}`, x: this.x + Math.cos(this.heading) * this.bodyRadius * 1.5 + Math.cos(this.heading + Math.PI / 2) * 0.06, y: this.y + Math.sin(this.heading) * this.bodyRadius * 1.5 + Math.sin(this.heading + Math.PI / 2) * 0.06 } });
    this.hint('GIFT_GIVEN');
    g.stage = null; g.item = null;
    this.behaviour = 'OBSERVE'; this.behaviourSince = ctx.time; this.boutUntil = ctx.time + 2;
    this.forceRedecide = true;
  }

  // ---------------------------------------------------------------- body
  act(dt, ctx) {
    const sp = this.p.creature.speed;
    const h = ctx.hand;
    let tx = null, ty = null, speed = 0, stopAt = 0.01;

    switch (this.behaviour) {
      case 'EXPLORE': {
        if (this.goal) { tx = this.goal.x; ty = this.goal.y; speed = sp.seek * 0.8; stopAt = this.goal.stop ?? 0.05; break; }
        if (!this.wanderTarget || dist(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y) < 0.03) {
          this.wanderTarget = this.randomPoint();
        }
        tx = this.wanderTarget.x; ty = this.wanderTarget.y; speed = this.inRegion() ? sp.explore : sp.seek;
        break;
      }
      case 'SEEK_FOOD': {
        const f = this.nearestFood();
        if (!f) { this.forceRedecide = true; break; }
        tx = f.x; ty = f.y; speed = sp.seek;
        if (dist(this.x, this.y, f.x, f.y) < this.bodyRadius * 0.8) {
          this.eatFoodId = f.id;
          this.eatUntil = ctx.time + this.p.feed.eatSec;
          this.behaviour = 'EAT';
          this.behaviourSince = ctx.time;
        }
        break;
      }
      case 'EAT':
        if (ctx.time >= this.eatUntil) { finishEating(this, ctx); this.behaviour = 'OBSERVE'; this.boutUntil = ctx.time + 1.5; this.forceRedecide = true; }
        break;
      case 'APPROACH':
        if (h.valid) { tx = h.x; ty = h.y; speed = sp.approach; stopAt = ctx.prefs.approachRadius; }
        break;
      case 'PLAY':
        if (h.valid) { tx = h.x; ty = h.y; speed = sp.play * ctx.prefs.playTempoScale; stopAt = 0.02; }
        break;
      case 'RETREAT':
        if (h.valid || h.present) {
          const ax = this.x - (h.x ?? this.x), ay = this.y - (h.y ?? this.y);
          const m = Math.hypot(ax, ay) || 1;
          tx = this.x + (ax / m) * 0.3; ty = this.y + (ay / m) * 0.3;
          speed = sp.retreat * (1 - 0.4 * this.needs.trust);
        }
        break;
      case 'SOCIAL': {
        const sid = this.social.partner ?? this.social.target;
        const o = (ctx.siblings ?? []).find((q) => q.id === sid);
        if (!o) { this.forceRedecide = true; break; }
        if (this.social.partner !== null) { tx = o.x; ty = o.y; speed = sp.approach; stopAt = this.p.social.meetS * 0.6; break; }
        tx = o.x; ty = o.y; speed = sp.seek; stopAt = this.p.social.meetS * 0.8;
        if (this.social.partner === null && dist(this.x, this.y, o.x, o.y) < this.p.social.meetS) this.startWrestle(ctx, o);
        break;
      }
      case 'HUNT': {
        const cr = ctx.critter;
        if (!cr) { this.forceRedecide = true; break; }
        tx = cr.x; ty = cr.y; speed = sp.play * 0.85; stopAt = 0.01;
        if (dist(this.x, this.y, cr.x, cr.y) < this.bodyRadius + this.p.hunt.pounceS) this.huntPounce(ctx, cr);
        break;
      }
      case 'GIFT': {
        const g = this.giftState;
        if (g.stage === 'fetch' && g.spot) {
          tx = g.spot.x; ty = g.spot.y; speed = sp.seek * 0.8;
          if (dist(this.x, this.y, g.spot.x, g.spot.y) < 0.04) { g.stage = 'bring'; g.item = GIFTS[Math.floor(this.rand() * GIFTS.length)]; }
        } else if (g.stage === 'bring' && h.valid) {
          tx = h.x; ty = h.y; speed = sp.approach * 1.2; stopAt = this.p.gift.dropS;
          if (dist(this.x, this.y, h.x, h.y) < this.p.gift.dropS + 0.02) this.dropGift(ctx);
        }
        break;
      }
      default:
        break; // OBSERVE, REST, GROOM, CONTACT: stay put
    }

    let dvx = 0, dvy = 0;
    if (this.wrestling) { const t = ctx.time * 9; dvx += Math.sin(t) * 0.12; dvy += Math.cos(t * 1.3) * 0.12; }
    if (tx !== null) {
      const dx = tx - this.x, dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > stopAt) {
        const s = d < stopAt * 3 + 0.05 ? speed * Math.min(1, (d - stopAt) / 0.08) : speed;
        dvx = (dx / d) * s; dvy = (dy / d) * s;
      }
    }
    // personal space: litter-mates never walk through each other (except a wrestling partner)
    const pal = this.social.partner ?? (this.behaviour === 'SOCIAL' ? this.social.target : null) ?? this.goal?.id ?? this.held?.partner ?? null;
    for (const o of ctx.others ?? []) {
      if (pal && o.id === pal) continue;
      const ox = this.x - o.x, oy = this.y - o.y, d = Math.hypot(ox, oy);
      if (d > 1e-6 && d < 0.22) { const push = (0.22 - d) / 0.22 * 0.25; dvx += (ox / d) * push; dvy += (oy / d) * push; }
    }
    let face = null;
    if (Math.hypot(dvx, dvy) < 0.01 && (this.behaviour === 'OBSERVE' || this.behaviour === 'CONTACT') && h.valid) face = Math.atan2(h.y - this.y, h.x - this.x);
    this.move(dvx, dvy, dt, face);
  }

  move(dvx, dvy, dt, faceIfStill) {
    // keep away from the edges and the toolbar band
    const m = 0.08, bottom = this.world.h - this.p.feed.toolbarBandS;
    if (this.x < m) dvx += 0.1; if (this.x > this.world.w - m) dvx -= 0.1;
    if (this.y < m) dvy += 0.1; if (this.y > bottom) dvy -= 0.1;

    const k = Math.min(1, dt * 6);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 0.02, this.world.w - 0.02);
    this.y = clamp(this.y + this.vy * dt, 0.02, this.world.h - 0.02);
    const v = Math.hypot(this.vx, this.vy);
    let face = null;
    if (v > 0.01 && !this.wrestling) face = Math.atan2(this.vy, this.vx);
    else face = faceIfStill;
    if (face !== null) {
      let d = face - this.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.heading += d * Math.min(1, dt * 5);
    }
  }

  nearestFood() {
    let best = null, bd = Infinity;
    for (const f of this.foods) { const d = dist(f.x, f.y, this.x, this.y); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  randomPoint() {
    const m = 0.15;
    if (this.region) {
      const r = this.region;
      return { x: (r.x0 + this.rand() * (r.x1 - r.x0)) * this.world.w, y: (r.y0 + this.rand() * (r.y1 - r.y0)) * this.world.h };
    }
    return {
      x: m + this.rand() * (this.world.w - 2 * m),
      y: m + this.rand() * (this.world.h - 2 * m - this.p.feed.toolbarBandS),
    };
  }
}
