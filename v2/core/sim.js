// Simulation — wires session, input, intent, creature and memory together and
// publishes one state snapshot (PRD V2 §18–19).
//
// In the exhibition architecture this object is the local Node.js authority and the
// renderers only consume `snapshot()`. In this browser slice it runs in the page, but
// it keeps the same contract: no renderer ever changes trust, growth or memory, and
// discrete commands are de-duplicated by `commandId`.

import { PARAMS, REASONS, HINT_PRIORITY } from './config.js';
import { InputTrack, PinchDetector } from './input.js';
import { IntentClassifier } from './intent.js';
import { SessionController } from './session.js';
import { CreatureCore, BEHAVIOURS } from './creature.js';
import { RelationshipMemory } from './memory.js';
import { buildRecap } from './recap.js';

export const PROTOCOL_VERSION = '1.0';

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
    this.demoCat = new CreatureCore({ world, params, rand: this.rand, demo: true, id: 'demo' });
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
  }

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
      case 'confirm': s.noteActivity(); if (s.state === 'ACTIVE' && this.tool === 'FEED') this.dropFood(cmd.x, cmd.y); break;
      case 'pause': s.pause(cmd.reason ?? 'user'); break;
      case 'resume': s.resume(); break;
      case 'end': s.end(cmd.reason ?? 'user'); break;
      case 'next': s.next(); break;
      case 'set_adaptation': this.memory.adaptation = !!cmd.on; break;
      case 'set_lang': this.lang = cmd.lang === 'zh' ? 'zh' : 'en'; if (this.recap) this.recap = buildRecap(this.log, this.lang); break;
      default: this.errors.rejected++; return { ack: cmd.id, error: 'unknown_command' };
    }
    this.processTransitions();
    return { ack: cmd.id ?? null };
  }

  setWorld(world) {
    this.world = world;
    this.track.setWorld(world);
    this.demoCat.setWorld(world);
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

    s.tick(dt, { trackingValid: this.track.valid, grown: this.cat ? this.cat.ageProgress >= 3 : false });
    this.processTransitions();

    if (s.state === 'ATTRACT' || !this.cat) {
      this.demoTime += dt;
      const ctx = this.ctx();
      // The attract cat lives on its own: it does not see the hand and remembers nothing.
      ctx.hand = { valid: false, present: false, quality: 'lost', x: null, y: null, speed: 0, source: this.track.source };
      ctx.intent = { label: 'lost' };
      ctx.frozen = false;
      this.demoCat.step(dt, ctx);
      this.demoCat.drainEvents();
      this.demoCat.drainHints();
    } else if (this.cat) {
      if (s.state === 'ACTIVE') this.simTime += dt;
      const ctx = this.ctx();
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

  collect(ctx) {
    const s = this.session;
    const accepting = s.state === 'ACTIVE';
    for (const e of this.cat.drainEvents()) {
      e.sessionId = s.sessionId;
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
    this.cat = new CreatureCore({ world: this.world, params: this.p, rand: this.rand, id: `cat_${s.sessionId}` });
    this.catSession = s.sessionId;
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
      creature: {
        id: c.id,
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
