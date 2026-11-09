// Simulation — wires session, input, intent, creature and memory together and
// publishes one state snapshot (PRD V2 §18–19).
//
// In the exhibition architecture this object is the local Node.js authority and the
// renderers only consume `snapshot()`. In the browser build it runs in the page, but
// it keeps the same contract: no renderer ever changes trust, growth or memory, and
// discrete commands are de-duplicated by `commandId`.

import { PARAMS, REASONS, HINT_PRIORITY, KITTENS, DEFAULT_KITTEN, COPY } from './config.js';
import { InputTrack, PinchDetector } from './input.js';
import { IntentClassifier } from './intent.js';
import { SessionController } from './session.js';
import { CreatureCore, BEHAVIOURS } from './creature.js';
import { RelationshipMemory } from './memory.js';
import { buildRecap } from './recap.js';
import { growthCheck, PHASES, UNLOCKS } from './growth.js';

export const PROTOCOL_VERSION = '1.0';

// Where the litter roams. While the attract screen is up the kittens stay clear of the
// field-guide panel; during a session the two siblings keep to the margins.
const ATTRACT_REGION = { x0: 0.5, x1: 0.92, y0: 0.22, y1: 0.74 };
const SIBLING_REGIONS = [{ x0: 0.04, x1: 0.18, y0: 0.5, y1: 0.72 }, { x0: 0.83, x1: 0.95, y0: 0.32, y1: 0.62 }];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class HintBoard {
  constructor(p) { this.repeat = p.hint.repeatSec; this.clear(); }
  clear() { this.current = null; this.last = {}; }
  offer(code, now, { hold = 2.6 } = {}) {
    const owner = REASONS[code] ?? 'guide';
    if (this.current?.code === code) { this.current.until = Math.max(this.current.until, now + hold); return; }
    if (now - (this.last[code] ?? -Infinity) < this.repeat) return;
    const cur = this.current && now < this.current.until ? this.current : null;
    if (cur && HINT_PRIORITY[cur.owner] > HINT_PRIORITY[owner]) return;
    this.current = { code, owner, since: now, until: now + hold };
    this.last[code] = now;
  }
  resolve(code) { if (this.current?.code === code) this.current = null; }
  get(now) { return this.current && now < this.current.until ? this.current : null; }
}

export class Simulation {
  constructor({ world = { w: 16 / 9, h: 1 }, params = PARAMS, seed = 7, adaptation = true, lang = 'en' } = {}) {
    this.p = params;
    this.world = world;
    this.rand = mulberry32(seed);
    this.lang = lang;
    this.session = new SessionController(params, this.rand);
    this.track = new InputTrack(world, params);
    this.pinch = new PinchDetector(params);
    this.intentClf = new IntentClassifier(params);
    this.memory = new RelationshipMemory(params, { adaptation });
    this.hints = new HintBoard(params);
    this.kittenId = DEFAULT_KITTEN;
    this.litter = KITTENS.map((k, i) => new CreatureCore({
      world, params, rand: this.rand, demo: true, id: `litter_${k.id}`, kitten: k, region: ATTRACT_REGION,
      at: { x: world.w * (0.6 + 0.12 * i), y: world.h * (0.38 + 0.14 * (i % 2)) },
    }));
    this.demoTime = 0;
    this.cat = null;
    this.catSession = null;
    this.simTime = 0;          // seconds of ACTIVE simulation in this session
    this.clock = 0;            // ms, same clock as input sample timestamps
    this.acc = 0;
    this.intentAcc = 0;
    this.intent = this.intentClf.current;
    this.tool = 'FEED';
    this.keyboardHold = false;
    this.log = [];             // every semantic event of this session (cleared at reset)
    this.out = [];             // events for audio / UI, drained by the page
    this.seen = new Set();     // processed commandIds
    this.seenOrder = [];
    this.lastFeedAt = -Infinity;
    this.foodSeq = 0;
    this.revision = 0;
    this.recap = null;
    this.lostSince = null;
    this.uncertainSince = null;
    this.errors = { duplicates: 0, rejected: 0 };
    this.resetLife();
  }

  // Visits, invitations, critters and gifts belong to one session and are cleared with it.
  resetLife() {
    this.life = { visit: null, invite: null, nextVisitAt: this.between(this.p.social.visitEverySec), inviteSeq: 0 };
    this.critter = null;
    this.critterSeq = 0;
    this.nextCritterAt = this.between(this.p.hunt.everySec) * 0.5;
    this.gifts = [];
  }

  between([a, b]) { return a + this.rand() * (b - a); }

  get demoCat() { return this.litter.find((c) => c.kitten.id === this.kittenId); }
  get siblings() { return this.litter.filter((c) => c.kitten.id !== this.kittenId); }

  // ---------------------------------------------------------------- inputs
  ingest(sample) {
    if (!sample || typeof sample.t !== 'number') { this.errors.rejected++; return; }
    if (sample.source === 'keyboard') this.keyboardHold = !!sample.hold;
    this.track.ingest(sample);
    if (sample.source === 'camera' && Number.isFinite(sample.pinchRatio)) {
      const fired = this.pinch.update(sample.pinchRatio, this.track.valid, sample.t);
      if (fired && this.track.x !== null) {
        this.command({ id: `pinch_${sample.t}`, type: 'confirm', x: this.track.x / this.world.w, y: this.track.y / this.world.h, via: 'pinch' });
      }
    }
  }

  // Discrete commands: de-duplicated by id and acknowledged (F2-16).
  command(cmd) {
    if (cmd.id) {
      if (this.seen.has(cmd.id)) { this.errors.duplicates++; return { ack: cmd.id, duplicate: true }; }
      this.seen.add(cmd.id);
      this.seenOrder.push(cmd.id);
      if (this.seenOrder.length > 500) this.seen.delete(this.seenOrder.shift());
    }
    const s = this.session;
    switch (cmd.type) {
      case 'start': s.start(); break;
      case 'choose_kitten':
        if ((s.state === 'ATTRACT' || s.state === 'CONSENT') && KITTENS.some((k) => k.id === cmd.kitten)) this.kittenId = cmd.kitten;
        break;
      case 'choose_input':
        this.track.reset(cmd.source);
        this.pinch.reset();
        this.intentClf.reset();
        s.chooseInput(cmd.source);
        break;
      case 'calibration_failed': s.backToConsent(cmd.reason ?? 'camera_failed'); break;
      case 'select_tool':
        if (['FEED', 'PLAY', 'PET', 'WAIT'].includes(cmd.tool)) { this.tool = cmd.tool; s.noteActivity(); }
        break;
      case 'confirm': {
        s.noteActivity();
        if (s.state !== 'ACTIVE') break;
        // with the Play tool, confirming on a sibling invites it over (a request, like every tool)
        const sib = this.tool === 'PLAY' && this.siblingAt(cmd.x, cmd.y);
        if (sib) this.invite(sib.kitten.id);
        else if (this.tool === 'FEED') this.dropFood(cmd.x, cmd.y);
        break;
      }
      case 'pause': s.pause(cmd.reason ?? 'user'); break;
      case 'resume': s.resume(); break;
      case 'end': s.end(cmd.reason ?? 'user'); break;
      case 'next': s.next(); break;
      case 'invite_sibling': this.invite(cmd.kitten); break;
      case 'set_adaptation': this.memory.adaptation = !!cmd.on; break;
      case 'set_lang': if (COPY[cmd.lang]) { this.lang = cmd.lang; if (this.recap) this.recap = buildRecap(this.log, this.lang); } break;
      default: this.errors.rejected++; return { ack: cmd.id, error: 'unknown_command' };
    }
    this.processTransitions();
    return { ack: cmd.id ?? null };
  }

  setWorld(world) {
    this.world = world;
    this.track.setWorld(world);
    for (const c of this.litter) c.setWorld(world);
    if (this.cat) this.cat.setWorld(world);
  }

  dropFood(nx, ny) {
    const f = this.p.feed;
    const now = this.clock;
    if (now - this.lastFeedAt < f.cooldownMs) return;
    this.lastFeedAt = now;
    const x = nx * this.world.w, y = ny * this.world.h;
    const cat = this.cat;
    if (!cat) return;
    if (!(nx > 0.03 && nx < 0.97 && ny > 0.04 && y < this.world.h - f.toolbarBandS)) { this.hints.offer('FOOD_INVALID', now / 1000); return; }
    if (cat.foods.length >= f.maxFood) { this.hints.offer('FOOD_LIMIT', now / 1000); return; }
    cat.addFood({ id: `f${++this.foodSeq}`, x, y, born: this.simTime });
    this.out.push({ type: 'food_dropped' });
    if (cat.needs.fullness >= this.p.limits.fullAt) {
      cat.stats.refusals++;
      cat.emit('refusal', this.ctx(), { reasonCode: 'TOO_FULL', measurement: { request: 'SEEK_FOOD' } });
      cat.hint('TOO_FULL');
    }
  }

  siblingAt(nx, ny) {
    if (!this.cat || !Number.isFinite(nx)) return null;
    const x = nx * this.world.w, y = ny * this.world.h;
    return this.siblings.find((o) => Math.hypot(o.x - x, o.y - y) < 0.1) ?? null;
  }

  // A visitor can invite a sibling over. Like every tool, it is a request: the kitten
  // still decides, and a refusal comes with its reason.
  invite(kitten) {
    if (this.session.state !== 'ACTIVE' || !this.cat) return;
    const sib = this.siblings.find((o) => o.kitten.id === kitten);
    if (!sib || this.cat.wrestling) return;
    this.endVisit();
    this.life.invite = { sibId: sib.id, inviteId: ++this.life.inviteSeq, since: this.simTime };
    sib.goal = { id: this.cat.id, x: this.cat.x, y: this.cat.y, stop: 0.2 };
    sib.held = null;
    this.session.noteActivity();
    this.out.push({ type: 'invite', sibling: kitten });
  }

  endVisit(sibId = null) {
    const L = this.life;
    for (const key of ['visit', 'invite']) {
      const v = L[key];
      if (!v || (sibId && v.sibId !== sibId)) continue;
      const sib = this.litter.find((o) => o.id === v.sibId);
      if (sib) sib.goal = null;
      L[key] = null;
    }
    if (!L.visit && !L.invite) L.nextVisitAt = this.simTime + this.between(this.p.social.visitEverySec);
  }

  // Directs the litter around the visitor's kitten: visits, waiting, wrestling, fleeing.
  directLitter() {
    const cat = this.cat, L = this.life, sp = this.p.social, t = this.simTime;
    if (!cat || this.session.state !== 'ACTIVE') return;
    if (!L.visit && !L.invite && t >= L.nextVisitAt && !cat.wrestling && cat.behaviour !== 'CONTACT') {
      const free = this.siblings.filter((o) => !o.held);
      if (free.length) {
        const sib = free[Math.floor(this.rand() * free.length)];
        L.visit = { sibId: sib.id, since: t };
        sib.goal = { id: cat.id, x: cat.x, y: cat.y, stop: 0.19 };
      } else L.nextVisitAt = t + 5;
    }
    for (const key of ['visit', 'invite']) {
      const v = L[key];
      if (!v) continue;
      const sib = this.litter.find((o) => o.id === v.sibId);
      const limit = key === 'visit' ? sp.visitTimeoutSec : sp.inviteTimeoutSec;
      if (!sib || (t - v.since > limit && cat.behaviour !== 'SOCIAL')) { this.endVisit(v.sibId); continue; }
      if (key === 'invite' && cat.social.refused === v.inviteId) { this.endVisit(v.sibId); continue; }
      if (sib.goal) { sib.goal.x = cat.x; sib.goal.y = cat.y; }
    }
    for (const sib of this.siblings) {
      if (cat.wrestling && cat.social.partner === sib.id) {
        const a = t * 7;
        sib.goal = null;
        sib.held = { behaviour: 'SOCIAL', until: this.demoTime + 0.25, partner: cat.id, wrestle: true,
          at: { x: cat.x + Math.cos(a) * 0.07, y: cat.y + Math.sin(a * 1.2) * 0.05 }, face: Math.atan2(cat.y - sib.y, cat.x - sib.x) };
      } else if (cat.behaviour === 'SOCIAL' && cat.social.target === sib.id && !sib.held?.flee) {
        sib.goal = null;
        sib.held = { behaviour: 'OBSERVE', until: this.demoTime + 0.25, partner: cat.id, face: Math.atan2(cat.y - sib.y, cat.x - sib.x) };
      }
    }
  }

  // One small critter at a time drifts through the habitat. Kittens are too young to
  // hunt it; from Chapter II on, the kitten may give chase.
  stepCritter(dt) {
    const hp = this.p.hunt, W = this.world.w, H = this.world.h - this.p.feed.toolbarBandS;
    const t = this.simTime;
    let c = this.critter;
    if (!c && t >= this.nextCritterAt) {
      const kind = ['butterfly', 'moth', 'dragonfly'][this.cat ? this.cat.phaseIndex : 0];
      const side = this.rand() < 0.5;
      c = this.critter = { id: `c${++this.critterSeq}`, kind, x: side ? 0.05 : W - 0.05, y: 0.15 + this.rand() * (H - 0.3), vx: side ? 0.06 : -0.06, vy: 0, born: t, fleeing: false, caught: false };
    }
    if (!c) return;
    const cat = this.cat;
    const d = cat ? Math.hypot(cat.x - c.x, cat.y - c.y) : 9;
    if (!c.fleeing) {
      c.vx += (this.rand() - 0.5) * 0.4 * dt; c.vy += (this.rand() - 0.5) * 0.6 * dt;
      if (d < 0.18 && cat) { c.vx += ((c.x - cat.x) / d) * 0.25 * dt; c.vy += ((c.y - cat.y) / d) * 0.25 * dt; }
      if (c.x < 0.12) c.vx += 0.1 * dt; if (c.x > W - 0.12) c.vx -= 0.1 * dt;
      if (c.y < 0.12) c.vy += 0.1 * dt; if (c.y > H - 0.05) c.vy -= 0.2 * dt;
      const v = Math.hypot(c.vx, c.vy), max = 0.11;
      if (v > max) { c.vx *= max / v; c.vy *= max / v; }
    }
    c.x += c.vx * dt; c.y += c.vy * dt;
    const gone = c.x < -0.1 || c.x > W + 0.1 || c.y < -0.1 || c.y > this.world.h + 0.1;
    if (gone || (!c.fleeing && t - c.born > hp.lifeSec)) {
      if (!gone && !c.fleeing) { c.fleeing = true; c.vx = (c.x < W / 2 ? -1 : 1) * 0.3; c.vy = -0.2; }
      if (gone) { this.critter = null; this.nextCritterAt = t + this.between(hp.everySec); }
    }
  }

  // ---------------------------------------------------------------- time
  update(dtSec, now) {
    this.clock = now;
    const step = this.p.sim.step;
    // Long gaps (hidden tab, debugger) are a pause, never a giant dt that drains energy.
    this.acc = Math.min(this.acc + dtSec, step * this.p.sim.maxSubsteps);
    while (this.acc >= step - 1e-9) { this.acc -= step; this.stepOnce(step); }
  }

  ctx() {
    const t = this.track;
    return {
      time: this.cat && this.session.state !== 'ATTRACT' ? this.simTime : this.demoTime,
      active: this.session.state === 'ACTIVE',
      frozen: this.session.state !== 'ACTIVE',
      hand: { valid: t.valid, present: t.present, quality: t.quality, x: t.x, y: t.y, speed: t.speed, source: t.source },
      intent: this.intent,
      tool: this.tool,
      prefs: this.memory.prefs,
    };
  }

  stepOnce(dt) {
    const s = this.session;
    const nowS = this.clock / 1000;
    this.track.update(this.clock);

    const cat = s.state === 'ATTRACT' || !this.cat ? this.demoCat : this.cat;
    this.intentAcc += dt;
    if (this.intentAcc >= this.p.sim.intentInterval) {
      this.intentAcc = 0;
      this.intent = this.intentClf.classify(this.track,
        { x: cat.x, y: cat.y, bodyRadius: cat.bodyRadius, contactRadius: this.p.creature.contactRadius },
        this.clock, { keyboardHold: this.keyboardHold && this.tool === 'PET' });
    }

    // a fully grown kitten gets its celebration before the visit ends
    s.tick(dt, { trackingValid: this.track.valid, grown: this.cat ? this.cat.ageProgress >= 3 && this.simTime >= this.cat.transitionUntil : false });
    this.processTransitions();

    this.demoTime += dt;
    const ambient = s.state === 'ATTRACT' || !this.cat ? this.litter : this.siblings;
    this.stepAmbient(ambient, dt);
    if (this.cat && s.state !== 'ATTRACT') {
      if (s.state === 'ACTIVE') this.simTime += dt;
      const ctx = this.ctx();
      ctx.others = this.siblings.map((o) => ({ id: o.id, x: o.x, y: o.y }));
      ctx.siblings = this.siblings.map((o) => ({
        id: o.id, kitten: o.kitten.id, x: o.x, y: o.y,
        visiting: this.life.visit?.sibId === o.id, invited: this.life.invite?.sibId === o.id, inviteId: this.life.invite?.sibId === o.id ? this.life.invite.inviteId : null,
      }));
      ctx.critter = this.critter && !this.critter.fleeing ? { id: this.critter.id, kind: this.critter.kind, x: this.critter.x, y: this.critter.y } : null;
      if (s.state === 'ACTIVE') { this.directLitter(); this.stepCritter(dt); }
      this.cat.step(dt, ctx);
      this.collect(ctx);
      this.systemHints(nowS);
      if (s.state === 'ACTIVE' && this.track.valid
          && (this.track.speed > 0.05 || ['stable_contact', 'gentle_approach'].includes(this.intent.label))) {
        s.noteActivity();
      }
    }
    this.revision++;
  }

  // The litter lives on its own: it never sees the hand and remembers nothing.
  stepAmbient(cats, dt) {
    const ctx = this.ctx();
    ctx.time = this.demoTime;
    ctx.hand = { valid: false, present: false, quality: 'lost', x: null, y: null, speed: 0, source: this.track.source };
    ctx.intent = { label: 'lost' };
    ctx.frozen = false;
    ctx.active = false;
    const all = this.cat && this.session.state !== 'ATTRACT' ? [this.cat, ...cats] : cats;
    for (const c of cats) {
      ctx.others = all.filter((o) => o !== c).map((o) => ({ id: o.id, x: o.x, y: o.y }));
      c.step(dt, ctx); c.drainEvents(); c.drainHints();
    }
  }

  collect(ctx) {
    const s = this.session;
    const accepting = s.state === 'ACTIVE';
    for (const e of this.cat.drainEvents()) {
      e.sessionId = s.sessionId;
      this.react(e);
      this.log.push(e);
      this.out.push(e);
      for (const d of this.memory.record(e, { accepting })) {
        const full = { id: `${e.id}_adapt`, simulationTime: ctx.time, source: e.source, validity: 'valid', sessionId: s.sessionId, ...d };
        this.log.push(full);
        this.out.push(full);
        this.memory.record(full, { accepting });
        this.cat.hint('RHYTHM_ADAPTED');
      }
    }
    for (const code of this.cat.drainHints()) this.hints.offer(code, this.clock / 1000);
  }

  // How the world answers the kitten's own acts.
  react(e) {
    const m = e.measurement ?? {};
    if (e.type === 'hiss') {
      const sib = this.litter.find((o) => o.kitten.id === m.sibling);
      if (sib && this.cat) {
        this.endVisit(sib.id);
        sib.goal = null;
        sib.held = { behaviour: 'RETREAT', until: this.demoTime + 1.6, flee: { x: this.cat.x, y: this.cat.y } };
      }
    }
    if (e.type === 'sibling_play') {
      const sib = this.litter.find((o) => o.kitten.id === m.sibling);
      if (sib) { sib.held = null; this.endVisit(sib.id); sib.forceRedecide = true; }
    }
    if (e.type === 'refusal' && m.request === 'SOCIAL') this.endVisit();
    if (e.type === 'hunt_pounce' && this.critter?.id === m.critterId) {
      const c = this.critter;
      c.fleeing = true; c.caught = m.caught;
      c.vx = (this.rand() - 0.5) * 0.4; c.vy = -0.3;
    }
    if (e.type === 'gift_given') {
      this.gifts.push({ id: m.giftId, item: m.item, x: m.x, y: m.y, born: this.simTime });
      if (this.gifts.length > this.p.gift.maxShown) this.gifts.shift();
    }
  }

  systemHints(nowS) {
    const s = this.session;
    if (s.state !== 'ACTIVE' || this.track.source !== 'camera') { this.lostSince = null; return; }
    if (this.track.quality === 'lost') {
      this.lostSince ??= nowS;
      if (nowS - this.lostSince > this.p.quality.lostAfterMs / 1000) this.hints.offer('TRACKING_LOST', nowS, { hold: 0.6 });
    } else {
      this.lostSince = null;
      this.hints.resolve('TRACKING_LOST');
    }
    const engaged = this.tool === 'PET' || this.tool === 'PLAY';
    if (engaged && this.intent.label === 'unknown' && this.track.quality !== 'lost') {
      this.uncertainSince ??= nowS;
      if (nowS - this.uncertainSince > 1.2) this.hints.offer('INTENT_UNCERTAIN', nowS);
    } else this.uncertainSince = null;
  }

  processTransitions() {
    const s = this.session;
    for (const t of s.drain()) {
      this.out.push({ type: 'session', from: t.from, to: t.to, reason: t.reason });
      if (t.to === 'ACTIVE' && this.catSession !== s.sessionId) this.beginActive();
      if (t.to === 'PAUSED' && this.cat?.contact.active) {
        this.cat.contact.active = false;
        this.cat.acceptedContact = false;
      }
      if (t.to === 'REFLECTION') {
        this.memory.freeze();
        if (this.cat) { this.cat.contact.active = false; this.cat.acceptedContact = false; }
        this.recap = buildRecap(this.log, this.lang);
      }
      if (t.to === 'RESETTING') this.resetSession();
    }
  }

  beginActive() {
    const s = this.session;
    const chosen = this.demoCat;
    this.cat = new CreatureCore({
      world: this.world, params: this.p, rand: this.rand, id: `cat_${s.sessionId}`,
      kitten: chosen.kitten, at: { x: chosen.x, y: chosen.y },
    });
    this.cat.heading = chosen.heading;
    this.siblings.forEach((c, i) => c.setRegion(SIBLING_REGIONS[i]));
    this.catSession = s.sessionId;
    this.resetLife();
    this.simTime = 0;
    this.memory.reset();
    this.log = [];
    this.recap = null;
    this.tool = 'FEED';
    this.hints.clear();
  }

  // Everything that belonged to the visitor is destroyed here (F2-17).
  resetSession() {
    this.cat = null;
    this.catSession = null;
    for (const c of this.litter) { c.goal = null; c.held = null; c.setRegion(ATTRACT_REGION); }
    this.resetLife();
    this.memory.reset();
    this.log = [];
    this.recap = null;
    this.simTime = 0;
    this.tool = 'FEED';
    this.keyboardHold = false;
    this.track.reset('mouse');
    this.pinch.reset();
    this.intentClf.reset();
    this.hints.clear();
    this.out.push({ type: 'release_camera' });
    this.session.confirmReset();
    this.processTransitions();
  }

  drainEvents() { const o = this.out; this.out = []; return o; }

  // What the visitor needs to see to want to keep caring: how far to the next chapter,
  // which needs are holding growth back, and what the next chapter unlocks.
  growthSnapshot(c) {
    const g = this.p.growth, n = c.needs;
    const check = growthCheck(n, this.p);
    const chapter = Math.min(2, Math.floor(c.ageProgress));
    const next = PHASES[chapter + 1] ?? null;
    return {
      chapter,
      progress: Math.min(1, c.ageProgress - chapter),
      total: c.ageProgress / 3,
      growing: !!c.growing,
      ok: check.ok,
      blockedBy: check.blockedBy,
      wellbeing: check.wellbeing,
      checks: { fed: n.fullness >= g.minEach, rested: n.energy >= g.minEach, played: n.fun >= g.minEach, calm: n.stress <= g.maxStress },
      levels: { fed: n.fullness, rested: n.energy, played: n.fun, calm: 1 - n.stress },
      next,
      unlocks: next ? UNLOCKS[next] : [],
      grown: c.ageProgress >= 3,
    };
  }

  // ---------------------------------------------------------------- snapshot
  snapshot() {
    const s = this.session;
    const showCat = s.state === 'ATTRACT' || !this.cat ? this.demoCat : this.cat;
    const W = this.world.w, H = this.world.h;
    const c = showCat;
    const hint = this.hints.get(this.clock / 1000);
    const d = c.decision;
    const ranked = d.candidates.slice().sort((a, b) => (b.available - a.available) || b.score - a.score);
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: 'state.snapshot',
      sessionId: s.sessionId,
      stateRevision: this.revision,
      simulationTime: this.simTime,
      sessionState: s.state,
      pauseReason: s.pauseReason,
      endReason: s.endReason,
      timers: {
        active: s.activeTime, idle: s.idle, reflectionLeft: s.reflectionLeft,
        calibration: s.state === 'CALIBRATING' ? s.stateTime : null,
        calibStable: s.calibStable,
      },
      stillThere: s.stillThere,
      offerEnd: s.offerEnd,
      kitten: { id: c.kitten.id, name: c.kitten.name, temperament: c.kitten.temperament },
      litter: (s.state === 'ATTRACT' || !this.cat ? this.litter.filter((x) => x !== c) : this.siblings).map((x) => ({
        id: x.id, kitten: x.kitten.id, position: { x: x.x / W, y: x.y / H }, heading: x.heading,
        // litter-mates grow up alongside the visitor's kitten (display only; they have no growth of their own)
        speed: Math.hypot(x.vx, x.vy), behaviour: x.behaviour, ageProgress: this.cat && s.state !== 'ATTRACT' ? this.cat.ageProgress : x.ageProgress,
        wrestling: !!x.held?.wrestle, visiting: this.life.visit?.sibId === x.id, invited: this.life.invite?.sibId === x.id,
        fleeing: !!x.held?.flee,
      })),
      growth: this.growthSnapshot(c),
      critter: this.critter ? { id: this.critter.id, kind: this.critter.kind, position: { x: this.critter.x / W, y: this.critter.y / H }, fleeing: this.critter.fleeing, caught: this.critter.caught, heading: Math.atan2(this.critter.vy, this.critter.vx) } : null,
      gifts: this.gifts.map((g) => ({ id: g.id, item: g.item, position: { x: g.x / W, y: g.y / H }, age: this.simTime - g.born })),
      creature: {
        id: c.id,
        kitten: c.kitten.id,
        demo: c.demo,
        position: { x: c.x / W, y: c.y / H },
        heading: c.heading,
        speed: Math.hypot(c.vx, c.vy),
        behaviour: c.behaviour,
        phase: c.phase,
        ageProgress: c.ageProgress,
        needs: { ...c.needs },
        relation: c.relation,
        acceptedContact: c.acceptedContact,
        inviting: c.inviting,
        growing: c.growing,
        growthBlockedBy: c.growthBlockedBy,
        transition: this.simTime < c.transitionUntil,
        stats: { ...c.stats },
        wrestling: c.wrestling,
        socialTarget: c.social.target ? this.litter.find((o) => o.id === c.social.target)?.kitten.id ?? null : null,
        reaction: c.reaction ? { type: c.reaction.type, reasonCode: c.reaction.reasonCode, sibling: c.reaction.sibling } : null,
        carrying: c.giftState.stage === 'bring' ? c.giftState.item : null,
        lastBurst: c.lastBurst,
      },
      foods: c.foods.map((f) => ({ id: f.id, x: f.x / W, y: f.y / H, age: this.simTime - f.born })),
      input: {
        source: this.track.source, quality: this.track.quality, present: this.track.present,
        position: this.track.x === null ? null : { x: this.track.x / W, y: this.track.y / H },
        speedSPerSecond: this.track.speed,
        validRatio: this.track.validRatio(),
        rejected: this.track.rejects,
      },
      intent: { ...this.intent },
      activeTool: this.tool,
      displayHint: hint ? { code: hint.code, owner: hint.owner } : null,
      reasonCode: hint?.code ?? null,
      diagnostics: {
        chosen: d.chosen, why: d.why, forced: d.forced,
        candidates: ranked.map((x) => ({ name: x.name, score: x.score, available: x.available, blocked: x.blocked, request: x.request })),
        memory: this.memory.snapshot(),
        errors: { ...this.errors },
        behaviours: BEHAVIOURS,
      },
      recap: this.recap,
    };
  }
}
