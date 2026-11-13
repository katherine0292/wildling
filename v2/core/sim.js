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
import { NeedCycle } from './needs.js';
import { SessionController } from './session.js';
import { CreatureCore, BEHAVIOURS } from './creature.js';
import { RelationshipMemory } from './memory.js';
import { buildRecap } from './recap.js';
import { learnedAbout } from './learned.js';
import { growthCheck, PHASES, UNLOCKS } from './growth.js';
import { PoseSmoother, PoseGate, POSE_ACTS } from './pose.js';
import { TrickLearner, MoveSegmenter, TRICKS } from './tricks.js';

export const PROTOCOL_VERSION = '1.0';

// Where the litter roams. While the attract screen is up the kittens stay clear of the
// field-guide panel; during a session the two siblings keep to the margins.
const ATTRACT_REGION = { x0: 0.5, x1: 0.92, y0: 0.22, y1: 0.74 };
const SIBLING_REGIONS = [{ x0: 0.04, x1: 0.18, y0: 0.5, y1: 0.72 }, { x0: 0.83, x1: 0.95, y0: 0.32, y1: 0.62 }];
// V3: three habitats with the same four things in the pouch, so every habitat plays the same:
// fish, the feather, a ball to throw (a snowball in the snow, a little rubber ball elsewhere)
// and a water bowl to set down.
export const SCENES = ['jungle', 'snow', 'desert'];
export const SCENE_ITEMS = { jungle: ['treat', 'wand', 'ball', 'bowl'], snow: ['treat', 'wand', 'snowball', 'bowl'], desert: ['treat', 'wand', 'ball', 'bowl'] };
const isBall = (item) => item === 'ball' || item === 'snowball';
// V3: every kitten can be met, so the others roam most of the clearing instead of its edges
const SIBLING_REGIONS_V3 = [{ x0: 0.06, x1: 0.46, y0: 0.18, y1: 0.74 }, { x0: 0.54, x1: 0.94, y0: 0.18, y1: 0.74 }];

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
  constructor({ world = { w: 16 / 9, h: 1 }, params = PARAMS, seed = 7, adaptation = true, lang = 'en', timed = true, toolless = false, growth = true } = {}) {
    this.p = params;
    this.world = world;
    this.rand = mulberry32(seed);
    this.lang = lang;
    this.session = new SessionController(params, this.rand, { timed });
    // Toolless mode (experience spec V3): there is no tool to pick. An empty hand is a hand,
    // and what the visitor holds from the pouch (a treat, the feather wand) decides the rest.
    this.toolless = toolless;
    this.held = null;
    // With growth off the kitten stays a kitten; the bond is the progress instead.
    this.growthOn = growth;
    this.needs = new NeedCycle();
    this.resetLitter3();
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
    this.tool = toolless ? 'PET' : 'FEED';
    this.keyboardHold = false;
    this.log = [];             // every semantic event of this session (cleared at reset)
    this.out = [];             // events for audio / UI, drained by the page
    this.seen = new Set();     // processed commandIds
    this.seenOrder = [];
    this.lastFeedAt = -Infinity;
    this.foodSeq = 0;
    this.revision = 0;
    this.recap = null;
    this.quietRest = 0;
    this.lostSince = null;
    this.uncertainSince = null;
    this.errors = { duplicates: 0, rejected: 0 };
    this.poseGate = new PoseGate(params.social.pose);
    this.poseSmoother = new PoseSmoother(params.social.pose);
    this.poseTarget = null;
    this.learner = new TrickLearner({ examples: params.tricks.examples, reject: params.tricks.reject });
    this.segmenter = new MoveSegmenter();
    this.teach = { lastTrace: null, lastResult: null, consistency: null };
    this.presence = { people: [], at: -Infinity };
    this.pose = { label: 'unknown', progress: 0, target: null, source: 'rule_baseline' };
    this.resetLife();
  }

  // Visits, invitations, critters and gifts belong to one session and are cleared with it.
  resetLife() {
    this.life = { visit: null, invite: null, nextVisitAt: this.between(this.p.social.visitEverySec), inviteSeq: 0 };
    this.critter = null;
    this.critterSeq = 0;
    this.nextCritterAt = this.between(this.p.hunt.everySec) * 0.5;
    this.gifts = [];
    this.toy = { kind: 'yarn', x: null, y: null, vx: 0, vy: 0, live: false, thrownAt: 0 };
    this.handPrev = null;
    this.held = null;
    if (this.toolless) this.tool = 'PET';
  }

  between([a, b]) { return a + this.rand() * (b - a); }

  get demoCat() { return this.litter.find((c) => c.kitten.id === this.kittenId); }
  get siblings() { return this.litter.filter((c) => c.kitten.id !== this.kittenId); }

  // ---------------------------------------------------------------- inputs
  ingest(sample) {
    if (!sample || typeof sample.t !== 'number') { this.errors.rejected++; return; }
    if (sample.source === 'keyboard') this.keyboardHold = !!sample.hold;
    const accepted = this.track.ingest(sample);
    if (sample.source !== 'camera') return;
    this.track.update(sample.t);
    if (accepted) this.readPose(sample);
    // a pinch is a click on every screen the visitor can act on, so the hand can do all the mouse can
    const valid = accepted && this.track.valid && ['ACTIVE', 'PAUSED', 'REFLECTION'].includes(this.session.state);
    if (!valid && this.pinch.closedSince !== null) this.pinch.requireRelease();
    if (this.pinch.update(sample.pinchRatio, valid, sample.t)) {
      const confirmation = { id: `pinch_${sample.seq ?? sample.t}`, type: 'confirm',
        x: this.track.x / this.world.w, y: this.track.y / this.world.h, via: 'pinch' };
      if (this.toolless) return confirmation; // The browser resolves HUD targets before world actions.
      this.command(confirmation);
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
        this.intent = this.intentClf.current;
        this.hints.resolve('TRACKING_LOST');
        this.hints.resolve('INTENT_UNCERTAIN');
        s.chooseInput(cmd.source);
        break;
      case 'calibration_failed': s.backToConsent(cmd.reason ?? 'camera_failed'); break;
      case 'hold': if (s.state === 'ACTIVE') this.hold(cmd.item ?? null); break;
      // V3: a held mouse button on open ground, with an empty hand, is the mouse's pointing finger
      case 'follow': this.followMouse = !!cmd.on; break;
      // V3: the arrows at the screen edges move to the next or previous habitat
      case 'scene': if (s.state === 'ACTIVE' && this.toolless) this.setScene(cmd.to ?? SCENES[(SCENES.indexOf(this.scene) + (cmd.dir ?? 1) + SCENES.length) % SCENES.length]); break;
      case 'select_tool':
        if (this.toolless) break;
        if (['FEED', 'PLAY', 'PET', 'WAIT', 'LITTER', 'TRICK'].includes(cmd.tool)) { this.tool = cmd.tool; s.noteActivity(); if (cmd.tool !== 'TRICK') this.learner.cancel(); }
        break;
      case 'confirm': {
        s.noteActivity();
        if (s.state !== 'ACTIVE') break;
        // siblings are asked with the Siblings tool (social_request), never by a stray click
        if (this.toolless) {
          // what the hand holds stays in it until the visitor takes something else from the pouch
          if (this.held === 'treat') this.dropFood(cmd.x, cmd.y);
          else if (isBall(this.held)) this.throwBall(cmd.x, cmd.y);
          else if (this.held === 'bowl') this.placeBowl(cmd.x, cmd.y);
          break;
        }
        if (this.tool === 'FEED') this.dropFood(cmd.x, cmd.y);
        else if (this.tool === 'PLAY' && this.toy.kind === 'ball') this.throwBall(cmd.x, cmd.y);
        break;
      }
      case 'pause': s.pause(cmd.reason ?? 'user'); break;
      case 'resume': s.resume(); break;
      case 'end': s.end(cmd.reason ?? 'user'); break;
      case 'next': s.next(); break;
      case 'invite_sibling': this.invite(cmd.kitten); break;
      case 'teach_start':
        if (s.state === 'ACTIVE' && TRICKS.includes(cmd.trick)) { this.tool = 'TRICK'; this.learner.begin(cmd.trick); this.segmenter.reset(); this.teach.consistency = null; s.noteActivity(); }
        break;
      case 'teach_cancel': this.learner.cancel(); break;
      // people walking past an exhibition screen: horizontal positions and apparent size only
      case 'presence':
        this.presence = { people: (cmd.people ?? []).slice(0, 4).map((q) => ({ x: Math.max(0, Math.min(1, +q.x || 0)), size: Math.max(0, Math.min(1, +q.size || 0)) })), at: this.demoTime };
        break;
      case 'social_request': if (['befriend', 'cuddle', 'fight', 'hiss'].includes(cmd.act)) this.invite(cmd.kitten, cmd.act); break;
      // a returning visitor's own browser tells the core how many times they have met
      case 'set_returning':
        if (s.state === 'ATTRACT' || s.state === 'CONSENT') this.returning = cmd.visits > 0 ? { kitten: cmd.kitten, visits: Math.min(50, cmd.visits | 0) } : null;
        break;
      case 'select_toy':
        if (['yarn', 'feather', 'ball'].includes(cmd.toy)) {
          this.tool = 'PLAY';
          if (cmd.toy !== this.toy.kind) Object.assign(this.toy, { kind: cmd.toy, live: false, vx: 0, vy: 0 });
          s.noteActivity();
        }
        break;
      case 'set_adaptation': this.memory.adaptation = !!cmd.on; break;
      case 'set_lang': if (COPY[cmd.lang]) { this.lang = cmd.lang; if (this.recap) this.recap = buildRecap(this.log, this.lang); } break;
      default: this.errors.rejected++; return { ack: cmd.id, error: 'unknown_command' };
    }
    this.processTransitions();
    return { ack: cmd.id ?? null };
  }

  // ---------------------------------------------------------------- V3: every kitten can be met
  resetLitter3() {
    this.full = {};                 // kitten id → its own creature, kept while another is met
    this.needCycles = {};           // kitten id → its own need cycle
    this.tally = {};                // kitten id → what it did with the visitor, for the end of visit
    this.followMouse = false;
    this.scene = 'jungle';
    this.bowl = null;
    this.feast = null;              // a fish two kittens are facing off over
    this.pair = null;               // two litter-mates meeting on their own
    this.focusAt = -Infinity;
    this.nextPairAt = this.between(this.p.litter3.pairEverySec);
  }

  // The kitten nearest the hand, or the feather, becomes the one being met. Never in the middle
  // of a touch, a meal or a moment with a sibling, and not more than about once a second.
  updateFocus(ctx) {
    const L3 = this.p.litter3, c = this.cat, h = ctx.hand;
    if (!c || !h.valid || this.feast || this.simTime - this.focusAt < L3.focusHoldSec) return;
    if (c.acceptedContact || c.behaviour === 'EAT' || c.socialActive || c.held) return;
    const p = this.held === 'wand' && this.toy.live && this.toy.x !== null ? { x: this.toy.x, y: this.toy.y } : h;
    const dc = Math.hypot(p.x - c.x, p.y - c.y);
    let best = null, bd = Infinity;
    for (const o of this.siblings) {
      if (o.held?.partner === c.id || o.held?.behaviour === 'EAT') continue;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best && bd < L3.focusNearS && bd < dc * L3.focusRatio) this.switchFocus(best.kitten.id);
  }

  switchFocus(id) {
    const old = this.cat;
    if (!old || old.kitten.id === id) return;
    const twinNew = this.litter.find((o) => o.kitten.id === id), twinOld = this.litter.find((o) => o.kitten.id === old.kitten.id);
    if (!twinNew || !twinOld) return;
    // the kitten you were meeting goes back to the litter where it stands, with its own state
    old.acceptedContact = false; old.contact.active = false;
    Object.assign(old.social, { partner: null, mode: null, wrestleUntil: 0 });
    Object.assign(twinOld, { x: old.x, y: old.y, heading: old.heading, vx: 0, vy: 0, held: null, goal: null, behaviour: 'OBSERVE', forceRedecide: true });
    Object.assign(twinOld.needs, old.needs);
    twinOld.setRegion(twinNew.region);
    this.full[old.kitten.id] = old;
    let core = this.full[id];
    if (!core) core = new CreatureCore({ world: this.world, params: this.p, rand: this.rand, id: `cat_${this.session.sessionId}_${id}`, kitten: twinNew.kitten, at: { x: twinNew.x, y: twinNew.y } });
    Object.assign(core, { x: twinNew.x, y: twinNew.y, heading: twinNew.heading, vx: 0, vy: 0, held: null, goal: null, reaction: null, behaviour: 'OBSERVE', forceRedecide: true });
    Object.assign(core.social, { partner: null, mode: null, wrestleUntil: 0 });
    core.foods = old.foods; old.foods = []; // a fish on the ground belongs to whoever gets there
    this.endVisit();
    this.kittenId = id;
    this.cat = core;
    this.needCycles[old.kitten.id] = this.needs; // each kitten keeps its own asks
    this.needs = this.needCycles[id] ??= new NeedCycle();
    this.intentClf.reset(); this.intent = this.intentClf.current;
    this.focusAt = this.simTime;
    const e = { id: `focus_${Math.round(this.simTime * 1000)}_${id}`, type: 'focus_changed', simulationTime: this.simTime, validity: 'valid', sessionId: this.session.sessionId, measurement: { kitten: id, from: old.kitten.id } };
    this.log.push(e); this.out.push(e);
  }

  // ---------------------------------------------------------------- V3: the end of a visit
  countFor(id, type) {
    const key = { contact_started: 'strokes', eat_completed: 'fed', pounce_success: 'played', drink_completed: 'drank', startle: 'startled' }[type];
    if (!key || !this.tally) return;
    const t = (this.tally[id] ??= { strokes: 0, fed: 0, played: 0, drank: 0, startled: 0 });
    t[key]++;
  }

  // One card per kitten: how close it came to the visitor. Half the score is the trust it
  // gained this visit, half the kinds of care it actually received, so varied care beats
  // repeating one thing, and nothing is taken away for what the camera got wrong.
  kittenScores() {
    return KITTENS.map((k) => {
      const core = this.cat?.kitten.id === k.id ? this.cat : this.full?.[k.id];
      const twin = this.litter.find((o) => o.kitten.id === k.id);
      const t = this.tally?.[k.id] ?? { strokes: 0, fed: 0, played: 0, drank: 0, startled: 0 };
      const trust = (core ?? twin)?.needs.trust ?? 0;
      const contactSec = core?.stats.contactSec ?? 0;
      const gained = Math.max(0, trust - (k.start?.trust ?? this.p.creature.trust)); // what this visit earned
      const care = 0.2 * Math.min(contactSec / 15, 1) + 0.12 * Math.min(t.fed / 2, 1) + 0.12 * Math.min(t.played / 3, 1) + 0.06 * Math.min(t.drank, 1);
      const score = Math.round(100 * Math.min(1, 0.5 * Math.min(1, gained / 0.4) + care));
      return { kitten: k.id, name: k.name, met: !!core, trust, contactSec: Math.round(contactSec), ...t, score,
        stars: score >= 70 ? 3 : score >= 40 ? 2 : score >= 15 ? 1 : 0 };
    }).sort((a, b) => b.score - a.score);
  }

  setScene(scene) {
    if (!SCENES.includes(scene) || scene === this.scene) return;
    const from = this.scene;
    this.scene = scene;
    // the ball in hand becomes this habitat's ball; anything else the habitat lacks is put down
    if (isBall(this.held)) this.hold(SCENE_ITEMS[scene].find(isBall));
    else if (this.held && !SCENE_ITEMS[scene].includes(this.held)) this.hold(null);
    if (this.toy.kind === 'ball') this.toy.live = false;
    this.bowl = null;
    if (this.tool === 'PLAY' && !this.held) this.tool = 'PET';
    this.logLitter('scene_changed', { from, to: scene });
  }

  // The water bowl (any habitat): set down where the visitor pinches or clicks; the kitten you are
  // meeting goes to drink, and so does any litter-mate passing by.
  placeBowl(nx, ny) {
    const x = nx * this.world.w, y = Math.min(ny * this.world.h, this.world.h - this.p.feed.toolbarBandS);
    this.bowl = { x, y, placedAt: this.simTime };
    if (this.cat) this.cat.wantsWater = true;
    this.out.push({ type: 'bowl_placed' });
  }

  // A pointing finger (or a held mouse button) with an empty hand: the kitten follows the tip.
  followPoint(ctx) {
    if (this.held !== null || !ctx.hand.valid) return null;
    const pointing = this.track.source === 'camera' ? this.pose.label === 'point' : this.track.source === 'mouse' && this.followMouse;
    return pointing ? { x: ctx.hand.x, y: ctx.hand.y } : null;
  }

  // The rest of the litter around the kitten you are meeting: they chase the feather too, rush
  // a fish, face off over it, and meet each other when nothing else is going on.
  stepLitter3(dt, ctx) {
    const L3 = this.p.litter3, cat = this.cat, until = this.demoTime + 0.3;
    const free = (o) => !o.held || o.held.rush || o.held.chase;
    // the feather: everyone close enough and awake joins in, each from its own side
    const toy = ctx.toy?.kind === 'feather' && ctx.toy.valid ? ctx.toy : null;
    this.siblings.forEach((o, i) => {
      if (o.held?.chase && !toy) o.held = null;
      if (!toy || !free(o) || o.behaviour === 'REST' || Math.hypot(o.x - toy.x, o.y - toy.y) > L3.chaseS) return;
      // each one keeps to its own side of the feather, about a body length out, so nobody piles on
      const side = Math.atan2(o.y - toy.y, o.x - toy.x) + Math.sin(this.simTime * 1.3 + i * 2) * 0.35;
      const r = 0.12 + 0.03 * Math.sin(this.simTime * 3 + i); // a little dart in and out, like a pounce
      o.goal = null;
      o.held = { behaviour: 'PLAY', chase: true, until, at: { x: toy.x + Math.cos(side) * r, y: toy.y + Math.sin(side) * r }, face: Math.atan2(toy.y - o.y, toy.x - o.x) };
    });
    this.stepFeast(ctx, until);
    this.stepPair(until);
    // the water bowl: litter-mates close by come to drink too, each from its own side
    if (this.bowl) this.siblings.forEach((o, i) => {
      if (o.held?.drink) { if (this.demoTime < o.held.until) return; o.held = null; o.drankAt = this.simTime; this.countFor(o.kitten.id, 'drink_completed'); return; }
      if (o.held || o.behaviour === 'REST' || (o.drankAt ?? -99) > this.bowl.placedAt) return;
      if (Math.hypot(o.x - this.bowl.x, o.y - this.bowl.y) > 0.6) return;
      const a = Math.atan2(o.y - this.bowl.y, o.x - this.bowl.x);
      o.goal = null;
      o.held = { behaviour: 'EAT', drink: true, until: this.demoTime + 4.5, at: { x: this.bowl.x + Math.cos(a) * 0.075, y: this.bowl.y + Math.sin(a) * 0.075 }, face: a + Math.PI };
    });
  }

  stepFeast(ctx, until) {
    const L3 = this.p.litter3, cat = this.cat;
    const f = this.feast;
    if (f) {
      const sib = this.litter.find((o) => o.id === f.sibId);
      if (this.simTime < f.until && sib) {
        sib.held = { ...sib.held, until };
        return;
      }
      // the hungrier kitten usually wins; the other backs off
      const ch = 1 - cat.needs.fullness, sh = sib ? 1 - sib.needs.fullness : 0;
      const catWins = !sib || this.rand() < (ch + 0.05) / (ch + sh + 0.1);
      cat.held = null; cat.reaction = null; cat.forceRedecide = true;
      this.feast = null;
      if (catWins) {
        cat.foods.push(f.food);
        if (sib) sib.held = { behaviour: 'RETREAT', until: this.demoTime + 1.2, flee: { x: f.food.x, y: f.food.y } };
      } else this.siblingEats(f.food, sib);
      this.logLitter('food_contest', { winner: catWins ? cat.kitten.id : sib.kitten.id, loser: catWins ? sib?.kitten.id : cat.kitten.id });
      return;
    }
    for (const food of [...cat.foods]) {
      for (const o of this.siblings) {
        if (!free(o) || (o.behaviour === 'REST' && !o.held)) continue;
        const d = Math.hypot(o.x - food.x, o.y - food.y);
        if (d > L3.rushS) { if (o.held?.rush === food.id) o.held = null; continue; }
        o.goal = null;
        o.held = { behaviour: 'SEEK_FOOD', rush: food.id, until, at: { x: food.x, y: food.y }, face: Math.atan2(food.y - o.y, food.x - o.x) };
        if (d > 0.05) continue;
        // first to the fish: unless the kitten you are meeting is right there too, it eats
        const dc = Math.hypot(cat.x - food.x, cat.y - food.y);
        if (dc < L3.contestS && this.wantsFish(cat)) this.startFeast(food, o, ctx);
        else this.siblingEats(food, o);
        return;
      }
    }
    // the kitten you are meeting reaches the fish while another is closing in
    if (this.wantsFish(cat)) {
      const food = cat.foods.find((q) => Math.hypot(cat.x - q.x, cat.y - q.y) < 0.12);
      const rival = food && this.siblings.find((o) => o.held?.rush === food.id && Math.hypot(o.x - food.x, o.y - food.y) < L3.contestS);
      if (rival) this.startFeast(food, rival, ctx);
    }
    function free(o) { return !o.held || o.held.rush || o.held.chase; }
  }

  // The kitten you meet stands its ground over a fish when it is awake and not full.
  wantsFish(c) { return c.behaviour !== 'REST' && c.behaviour !== 'EAT' && c.needs.fullness < this.p.limits.fullAt && !c.held; }

  // Two kittens, one fish: they face each other across it, a body length apart, and hiss.
  startFeast(food, sib, ctx) {
    const L3 = this.p.litter3, cat = this.cat;
    cat.foods = cat.foods.filter((q) => q.id !== food.id);
    let ux = sib.x - food.x, uy = sib.y - food.y;
    const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
    if (m < 1e-3) { ux = 1; uy = 0; }
    const catAt = { x: food.x - ux * L3.gapS, y: food.y - uy * L3.gapS }, sibAt = { x: food.x + ux * L3.gapS, y: food.y + uy * L3.gapS };
    this.feast = { food, sibId: sib.id, until: this.simTime + L3.contestSec };
    cat.held = { behaviour: 'SOCIAL', until: this.simTime + L3.contestSec, at: catAt, face: Math.atan2(sibAt.y - catAt.y, sibAt.x - catAt.x) };
    cat.reaction = { type: 'hiss', reasonCode: 'SIB_FOOD', sibling: sib.kitten.id, siblingId: sib.id, until: this.simTime + L3.contestSec };
    sib.goal = null;
    sib.held = { behaviour: 'SOCIAL', standoff: true, hiss: true, until: this.demoTime + 0.3, at: sibAt, face: Math.atan2(catAt.y - sibAt.y, catAt.x - sibAt.x) };
    this.logLitter('food_standoff', { sibling: sib.kitten.id });
  }

  siblingEats(food, sib) {
    const cat = this.cat;
    cat.foods = cat.foods.filter((q) => q.id !== food.id);
    sib.goal = null;
    sib.held = { behaviour: 'EAT', until: this.demoTime + this.p.feed.eatSec * 1.6, at: { x: food.x, y: food.y }, face: sib.heading };
    sib.needs.fullness = Math.min(1, sib.needs.fullness + this.p.feed.fullness);
    const own = this.full[sib.kitten.id];
    if (own) own.needs.fullness = Math.min(1, own.needs.fullness + this.p.feed.fullness);
    this.logLitter('sibling_ate', { sibling: sib.kitten.id });
    this.countFor(sib.kitten.id, 'eat_completed');
  }

  // The litter on its own: two idle litter-mates now and then meet, and either groom each
  // other or puff up and face off, a body length apart. Never on top of each other.
  stepPair(until) {
    const L3 = this.p.litter3, P = this.pair;
    const idle = (o) => !o.held && !o.goal && o.behaviour !== 'REST' && o.behaviour !== 'EAT';
    if (!P) {
      if (this.simTime < this.nextPairAt) return;
      const [a, b] = this.siblings;
      if (!a || !b || !idle(a) || !idle(b)) { this.nextPairAt = this.simTime + 4; return; }
      const mode = (a.needs.stress + b.needs.stress) / 2 > 0.3 || this.rand() < 0.35 ? 'faceoff' : 'groom';
      this.pair = { a: a.id, b: b.id, mode, since: this.simTime, meetUntil: this.simTime + 8, until: null };
      return;
    }
    const a = this.litter.find((o) => o.id === P.a), b = this.litter.find((o) => o.id === P.b);
    const end = () => { this.pair = null; this.nextPairAt = this.simTime + this.between(L3.pairEverySec); if (a?.held?.pair) a.held = null; if (b?.held?.pair) b.held = null; };
    if (!a || !b || a === this.cat || b === this.cat || !this.siblings.includes(a) || !this.siblings.includes(b)) return end();
    if ((a.held && !a.held.pair) || (b.held && !b.held.pair)) return end(); // something more pressing came up
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (P.until === null) {
      if (d <= L3.pairMeetS * 1.15) { P.until = this.simTime + L3.pairSec; this.logLitter(P.mode === 'groom' ? 'litter_groom' : 'litter_faceoff', { a: a.kitten.id, b: b.kitten.id }); }
      else if (this.simTime > P.meetUntil) return end();
      else { a.held = { behaviour: 'EXPLORE', pair: true, until, at: { x: b.x - Math.cos(ang) * L3.pairMeetS, y: b.y - Math.sin(ang) * L3.pairMeetS }, face: ang }; return; }
    }
    if (this.simTime >= P.until) return end();
    const groom = P.mode === 'groom';
    a.held = { behaviour: groom ? 'GROOM' : 'SOCIAL', pair: true, standoff: !groom, hiss: !groom, mode: groom ? 'greet' : null, until, at: { x: b.x - Math.cos(ang) * L3.pairMeetS, y: b.y - Math.sin(ang) * L3.pairMeetS }, face: ang };
    b.held = { behaviour: groom ? 'GROOM' : 'SOCIAL', pair: true, standoff: !groom, hiss: !groom, mode: groom ? 'greet' : null, until, at: { x: b.x, y: b.y }, face: ang + Math.PI };
  }

  logLitter(type, measurement) {
    const e = { id: `${type}_${Math.round(this.simTime * 1000)}`, type, simulationTime: this.simTime, validity: 'valid', sessionId: this.session.sessionId, measurement };
    this.log.push(e); this.out.push(e);
  }

  // Toolless mode: take something from the pouch, or put it back (item null).
  hold(item) {
    if (!this.toolless || !(item === null || SCENE_ITEMS[this.scene].includes(item))) return;
    this.held = item;
    // a thrown snowball keeps rolling (and stays the toy) after the hand lets go
    const rolling = item === null && this.toy.kind === 'ball' && this.toy.live;
    this.tool = item === 'treat' ? 'FEED' : item === 'wand' || isBall(item) || rolling ? 'PLAY' : 'PET';
    if (item === 'wand' && this.toy.kind !== 'feather') Object.assign(this.toy, { kind: 'feather', live: false, vx: 0, vy: 0 });
    if (isBall(item)) Object.assign(this.toy, { kind: 'ball', live: false, vx: 0, vy: 0 });
    this.session.noteActivity();
    this.out.push({ type: 'held', item });
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
    if (now - this.lastFeedAt < f.cooldownMs) return false;
    this.lastFeedAt = now;
    const x = nx * this.world.w, y = ny * this.world.h;
    const cat = this.cat;
    if (!cat) return false;
    if (!(nx > 0.03 && nx < 0.97 && ny > 0.04 && y < this.world.h - f.toolbarBandS)) { this.hints.offer('FOOD_INVALID', now / 1000); return false; }
    if (cat.foods.length >= f.maxFood) { this.hints.offer('FOOD_LIMIT', now / 1000); return false; }
    cat.addFood({ id: `f${++this.foodSeq}`, x, y, born: this.simTime });
    this.out.push({ type: 'food_dropped' });
    if (cat.needs.fullness >= this.p.limits.fullAt) {
      cat.stats.refusals++;
      cat.emit('refusal', this.ctx(), { reasonCode: 'TOO_FULL', measurement: { request: 'SEEK_FOOD' } });
      cat.hint('TOO_FULL');
    }
    return true;
  }

  siblingAt(nx, ny, r = 0.1) {
    if (!this.cat || !Number.isFinite(nx)) return null;
    const x = nx * this.world.w, y = ny * this.world.h;
    return this.siblings.find((o) => Math.hypot(o.x - x, o.y - y) < r) ?? null;
  }

  // A visitor can invite a sibling over. Like every tool, it is a request: the kitten
  // still decides, and a refusal comes with its reason.
  invite(kitten, act = 'fight') {
    if (this.session.state !== 'ACTIVE' || !this.cat) return;
    const sib = this.siblings.find((o) => o.kitten.id === kitten);
    if (!sib || this.cat.socialActive) return;
    this.endVisit();
    this.life.invite = { sibId: sib.id, act, inviteId: ++this.life.inviteSeq, since: this.simTime };
    sib.goal = { id: this.cat.id, x: this.cat.x, y: this.cat.y, stop: 0.2 };
    sib.held = null;
    this.session.noteActivity();
    this.out.push({ type: 'invite', sibling: kitten, act });
  }

  // Hand shapes as requests about the litter (ADR-017): hold a shape over a sibling with
  // the Siblings tool. A rule baseline with rejection; the kitten still decides.
  readPose(sample) {
    const kp = sample.present && Array.isArray(sample.keypoints) ? sample.keypoints : null;
    const raw = kp ? this.poseSmoother.update(kp, sample.keypoints3D ?? null) : (this.poseSmoother.reset(), { label: 'unknown', score: 0 });
    const P = this.p.social.pose, nx = this.track.x / this.world.w, ny = this.track.y / this.world.h;
    // the sibling under the hand; once a shape is being held, a small drift keeps the same target
    let target = this.tool === 'LITTER' && this.track.valid ? this.siblingAt(nx, ny, P.overS) : null;
    if (!target && this.poseTarget && this.poseGate.label !== 'unknown' && this.track.valid) {
      const keep = this.siblings.find((o) => o.id === this.poseTarget);
      if (keep && Math.hypot(keep.x - this.track.x, keep.y - this.track.y) < P.keepS) target = keep;
    }
    this.poseTarget = target?.id ?? null;
    const g = this.poseGate.update(raw.label, sample.t, this.track.valid && this.session.state === 'ACTIVE' && this.tool === 'LITTER');
    // the recognised shape is always reported (the tutorial and the cursor use it); only the Siblings tool acts on it
    this.pose = { label: this.tool === 'LITTER' ? g.label : raw.label, progress: target ? g.progress : 0, target: target?.kitten.id ?? null, score: raw.score, scores: raw.scores, source: 'rule_baseline' };
    if (g.fire && target) this.command({ id: `pose_${sample.t}`, type: 'social_request', kitten: target.kitten.id, act: POSE_ACTS[g.fire], via: 'pose' });
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
      const mode = cat.social.partner === sib.id ? cat.socialMode : null;
      const toCat = Math.atan2(cat.y - sib.y, cat.x - sib.x);
      const until = this.demoTime + 0.25;
      if (mode === 'wrestle') { // face to face, a body length apart, puffed up: never on top of each other
        const away = Math.atan2(sib.y - cat.y, sib.x - cat.x);
        sib.goal = null;
        sib.held = { behaviour: 'SOCIAL', until, partner: cat.id, wrestle: true, hiss: true,
          at: { x: cat.x + Math.cos(away) * this.p.litter3.pairMeetS, y: cat.y + Math.sin(away) * this.p.litter3.pairMeetS }, face: toCat };
      } else if (mode === 'greet') { // nose to nose
        sib.goal = null;
        sib.held = { behaviour: 'GROOM', until, partner: cat.id, mode, at: { x: cat.x + Math.cos(cat.heading) * 0.13, y: cat.y + Math.sin(cat.heading) * 0.13 }, face: cat.heading + Math.PI };
      } else if (mode === 'cuddle') { // curled up side by side
        const side = cat.heading + Math.PI / 2;
        sib.goal = null;
        sib.held = { behaviour: 'REST', until, partner: cat.id, mode, at: { x: cat.x + Math.cos(side) * 0.1, y: cat.y + Math.sin(side) * 0.1 }, face: cat.heading };
      } else if (mode === 'standoff') { // circling, puffed up, face to face
        const a = Math.atan2(sib.y - cat.y, sib.x - cat.x) + 0.35 * (1 / 60) * 6;
        sib.goal = null;
        sib.held = { behaviour: 'SOCIAL', until, partner: cat.id, mode, standoff: true, hiss: true, at: { x: cat.x + Math.cos(a) * 0.27, y: cat.y + Math.sin(a) * 0.27 }, face: toCat };
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

  // The ball leaves the hand with the hand's own velocity, then rolls on its own.
  throwBall(nx, ny) {
    const b = this.p.toys.ball, t = this.toy;
    const v = this.handVel ?? { x: 0, y: 0 };
    let vx = v.x * b.throwScale, vy = v.y * b.throwScale;
    const m = Math.hypot(vx, vy);
    if (m > b.maxThrow) { vx *= b.maxThrow / m; vy *= b.maxThrow / m; }
    if (m < 0.15 && this.cat) { // a still hand tosses it gently past the kitten
      const dx = this.cat.x - nx * this.world.w, dy = this.cat.y - ny * this.world.h, d = Math.hypot(dx, dy) || 1;
      vx = (dx / d) * 0.5; vy = (dy / d) * 0.5;
    }
    Object.assign(t, { x: nx * this.world.w, y: ny * this.world.h, vx, vy, live: true, thrownAt: this.simTime });
    this.out.push({ type: 'toy_thrown', toy: 'ball' });
  }

  // Moves the toy for this step and returns what the kitten sees of it.
  stepToy(dt) {
    const t = this.toy, h = this.track, P = this.p.toys;
    // hand velocity, for throwing and for the feather's lag
    if (h.valid && h.x !== null) {
      if (this.handPrev) this.handVel = { x: (h.x - this.handPrev.x) / dt, y: (h.y - this.handPrev.y) / dt };
      this.handPrev = { x: h.x, y: h.y };
    } else { this.handPrev = null; this.handVel = { x: 0, y: 0 }; }
    if (this.tool !== 'PLAY') return null;
    if (t.kind === 'yarn') return h.valid ? { kind: 'yarn', x: h.x, y: h.y, valid: true, speed: h.speed } : { kind: 'yarn', valid: false };
    if (t.kind === 'feather') {
      if (!h.valid) { t.live = false; return { kind: 'feather', valid: false }; }
      if (!t.live) Object.assign(t, { x: h.x, y: h.y + 0.12, vx: 0, vy: 0, live: true });
      // a springy string: the feather trails the hand, overshoots and swings
      const f = P.feather, ax = (h.x - t.x) * f.spring - t.vx * f.damping, ay = (h.y + 0.12 - t.y) * f.spring - t.vy * f.damping;
      t.vx += ax * dt; t.vy += ay * dt; t.x += t.vx * dt; t.y += t.vy * dt;
      return { kind: 'feather', x: t.x, y: t.y, valid: true, speed: Math.hypot(t.vx, t.vy) };
    }
    // ball
    if (!t.live) { if (this.toolless && !this.held) this.tool = 'PET'; return { kind: 'ball', valid: false }; }
    const b = P.ball, k = Math.exp(-b.friction * dt);
    t.vx *= k; t.vy *= k; t.x += t.vx * dt; t.y += t.vy * dt;
    const W = this.world.w, H = this.world.h - this.p.feed.toolbarBandS;
    if (t.x < 0.05) { t.x = 0.05; t.vx = Math.abs(t.vx) * 0.7; } if (t.x > W - 0.05) { t.x = W - 0.05; t.vx = -Math.abs(t.vx) * 0.7; }
    if (t.y < 0.05) { t.y = 0.05; t.vy = Math.abs(t.vy) * 0.7; } if (t.y > H) { t.y = H; t.vy = -Math.abs(t.vy) * 0.7; }
    if (this.simTime - t.thrownAt > (this.toolless ? 8 : b.maxIdleSec)) { t.live = false; return { kind: 'ball', valid: false }; }
    return { kind: 'ball', x: t.x, y: t.y, valid: true, speed: Math.hypot(t.vx, t.vy) };
  }

  // Moves made with the Tricks tool either teach (while teaching) or ask for a trick.
  readMoves() {
    const t = this.track;
    if (this.tool !== 'TRICK') { this.segmenter.reset(); return; }
    const move = this.segmenter.update(t.x, t.y, t.speed, this.clock, t.valid);
    if (!move) return;
    const L = this.learner, cat = this.cat;
    this.teach.lastTrace = move.map((p) => ({ x: p.x / this.world.w, y: p.y / this.world.h }));
    if (L.teaching) {
      const r = L.addExample(move);
      if (!r) return;
      this.teach.consistency = r.consistency;
      this.out.push({ type: 'teach_example', trick: r.trick, count: r.count, done: r.done });
      if (r.done) {
        cat.emit('trick_learned', { time: this.simTime, hand: { source: t.source } }, { reasonCode: 'TRICK_LEARNED', measurement: { trick: r.trick, examples: L.need, consistency: Math.round(r.consistency * 100) / 100, model: 'knn_1' } });
        cat.hint('TRICK_LEARNED');
        cat.pendingTrick = r.trick; // it tries the new trick once, if it is up for it
      }
      return;
    }
    if (!L.learned.length) return;
    const c = L.classify(move);
    this.teach.lastResult = { trick: c.trick, distance: c.distance };
    if (c.trick === 'unknown') this.hints.offer('TRICK_UNKNOWN', this.clock / 1000);
    else cat.pendingTrick = c.trick;
  }

  // ---------------------------------------------------------------- time
  update(dtSec, now, { trackingAvailable = true } = {}) {
    this.clock = now;
    const step = this.p.sim.step;
    // Long gaps (hidden tab, debugger) are a pause, never a giant dt that drains energy.
    this.acc = Math.min(this.acc + dtSec, step * this.p.sim.maxSubsteps);
    while (this.acc >= step - 1e-9) { this.acc -= step; this.stepOnce(step, trackingAvailable); }
  }

  ctx() {
    const t = this.track;
    const overUI = !!t.lastSample?.overUI;
    return {
      time: this.cat && this.session.state !== 'ATTRACT' ? this.simTime : this.demoTime,
      active: this.session.state === 'ACTIVE',
      frozen: this.session.state !== 'ACTIVE',
      hand: { valid: t.valid && !overUI, present: t.present, quality: t.quality, x: t.x, y: t.y, speed: t.speed, source: t.source },
      intent: this.intent,
      tool: this.tool,
      prefs: this.memory.prefs,
    };
  }

  stepOnce(dt, trackingAvailable) {
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
    s.tick(dt, { trackingAvailable, trackingValid: this.track.valid, grown: this.cat ? this.cat.ageProgress >= 3 && this.simTime >= this.cat.transitionUntil : false });
    this.processTransitions();

    this.demoTime += dt;
    const ambient = s.state === 'ATTRACT' || !this.cat ? this.litter : this.siblings;
    this.stepAmbient(ambient, dt);
    if (this.cat && s.state !== 'ATTRACT') {
      if (s.state === 'ACTIVE') this.simTime += dt;
      if (s.state === 'ACTIVE' && this.toolless) this.updateFocus(this.ctx());
      const ctx = this.ctx();
      ctx.others = this.siblings.map((o) => ({ id: o.id, x: o.x, y: o.y }));
      ctx.siblings = this.siblings.map((o) => ({
        id: o.id, kitten: o.kitten.id, x: o.x, y: o.y,
        visiting: this.life.visit?.sibId === o.id, invited: this.life.invite?.sibId === o.id, inviteId: this.life.invite?.sibId === o.id ? this.life.invite.inviteId : null,
        act: this.life.invite?.sibId === o.id ? this.life.invite.act : null,
      }));
      ctx.critter = this.critter && !this.critter.fleeing ? { id: this.critter.id, kind: this.critter.kind, x: this.critter.x, y: this.critter.y } : null;
      if (s.state === 'ACTIVE') { this.directLitter(); this.stepCritter(dt); this.readMoves(); }
      ctx.toy = s.state === 'ACTIVE' ? this.stepToy(dt) : null;
      ctx.growth = this.growthOn;
      if (s.state === 'ACTIVE' && this.toolless) { ctx.follow = this.followPoint(ctx); ctx.water = this.bowl; this.stepLitter3(dt, ctx); }
      this.cat.step(dt, ctx);
      this.collect(ctx);
      this.settleByHand(ctx, dt);
      this.systemHints(nowS);
      if (s.state === 'ACTIVE' && this.track.valid
          && (this.track.speed > 0.05 || ['stable_contact', 'gentle_approach'].includes(this.intent.label))) {
        s.noteActivity();
      }
    }
    this.revision++;
  }

  // A bonded kitten can end the visit when it has already settled to rest beside a steady hand.
  settleByHand(ctx, dt) {
    const c = this.cat;
    const h = ctx.hand;
    const eligible = ctx.active && this.toolless && !this.growthOn && c.relation === 2
      && c.behaviour === 'REST' && this.held === null && h.valid && h.speed < 0.06
      && c.needs.stress < 0.3 && Math.hypot(c.x - h.x, c.y - h.y) < this.p.creature.contactRadius * 1.6;
    this.quietRest = eligible ? this.quietRest + dt : 0;
    if (this.quietRest < 5) return;
    c.emit('slept_beside_hand', ctx);
    this.collect(ctx);
    this.session.end('asleep');
    this.processTransitions();
  }

  // Someone walking past the exhibition screen (ADR-020): every kitten looks, and the
  // closest one trots to the near edge of the clearing. Positions only, never stored.
  noticePassersBy(cats) {
    const fresh = this.session.state === 'ATTRACT' && this.demoTime - this.presence.at < this.p.presence.lookSec;
    const who = fresh ? [...this.presence.people].sort((a, b) => b.size - a.size)[0] : null;
    for (const c of cats) {
      if (c.goal?.id === 'passer_by' && !who) { c.goal = null; c.forceRedecide = true; }
      c.lookAt = who ? { x: who.x * this.world.w, y: this.world.h * 0.98 } : null;
    }
    if (!who || who.size < this.p.presence.approachSize) return;
    const x = who.x * this.world.w;
    const near = cats.reduce((a, b) => (Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b));
    near.goal = { id: 'passer_by', x: Math.max(0.15, Math.min(this.world.w - 0.15, x)), y: this.world.h - this.p.feed.toolbarBandS - 0.05, stop: 0.04 };
  }

  // The litter lives on its own: it never sees the hand and remembers nothing.
  stepAmbient(cats, dt) {
    if (this.session.state === 'ATTRACT') this.noticePassersBy(cats);
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
    const fresh = this.cat.drainEvents();
    // the need cycle reads the same events; its episodes join the session log
    if (accepting && this.toolless) {
      for (const n of this.needs.step(this.cat, fresh, ctx.time, this.p.sim.step)) {
        fresh.push({ id: `need_${this.needs.episodes.length}_${n.type}`, simulationTime: ctx.time, source: ctx.hand.source, validity: 'valid', measurement: { kind: n.kind, sec: n.sec ?? null }, ...n });
      }
    }
    for (const e of fresh) {
      if (e.type === 'contact_started') {
        for (const code of ['NOT_READY', 'NEED_REST', 'HUNGRY_FIRST', 'PRESSURE_HIGH']) this.hints.resolve(code);
      }
      if (e.type === 'eat_completed') this.hints.resolve('TOO_FULL');
      e.sessionId = s.sessionId;
      if (this.toolless && this.cat) this.countFor(this.cat.kitten.id, e.type);
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
    // A hand that frightens one kitten frightens the ones beside it: they scatter from the hand.
    if (e.type === 'startle' && this.toolless && this.track.valid) {
      const hx = this.track.x, hy = this.track.y;
      for (const sib of this.siblings) {
        if (Math.hypot(sib.x - hx, sib.y - hy) > 0.4 || sib.held?.flee) continue;
        this.endVisit?.(sib.id);
        sib.goal = null;
        sib.held = { behaviour: 'RETREAT', until: this.demoTime + 1.8, flee: { x: hx, y: hy } };
      }
    }
    if (e.type === 'hiss') {
      const sib = this.litter.find((o) => o.kitten.id === m.sibling);
      if (sib && this.cat) {
        this.endVisit(sib.id);
        sib.goal = null;
        sib.held = { behaviour: 'RETREAT', until: this.demoTime + 1.6, flee: { x: this.cat.x, y: this.cat.y } };
      }
    }
    if (e.type === 'hiss' && e.reasonCode === 'SIB_STANDOFF') this.out.push({ type: 'standoff_end', sibling: m.sibling });
    if (e.type === 'sibling_befriend' || e.type === 'sibling_cuddle') {
      const sib = this.litter.find((o) => o.kitten.id === m.sibling);
      if (sib) { sib.held = null; this.endVisit(sib.id); sib.forceRedecide = true; }
    }
    if (e.type === 'sibling_play') {
      const sib = this.litter.find((o) => o.kitten.id === m.sibling);
      if (sib) { sib.held = null; this.endVisit(sib.id); sib.forceRedecide = true; }
    }
    if (e.type === 'refusal' && m.request === 'SOCIAL') this.endVisit();
    if (e.type === 'pounce_success' && m.toy === 'ball' && this.cat) { // a bat sends the ball rolling again
      const t = this.toy, a = this.cat.heading + (this.rand() - 0.5) * 1.6, sp = this.p.toys.ball.batSpeed * (0.7 + this.rand() * 0.6);
      t.vx = Math.cos(a) * sp; t.vy = Math.sin(a) * sp; t.thrownAt = this.simTime;
    }
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
    } else {
      this.uncertainSince = null;
      this.hints.resolve('INTENT_UNCERTAIN');
    }
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
      if (t.from === 'CALIBRATING' && t.to === 'CONSENT') this.out.push({ type: 'release_camera', reason: t.reason });
      if (t.to === 'REFLECTION') {
        // the camera stays on through the journal so a pinch can press its buttons; it is
        // released when the journal closes (RESETTING)
        this.memory.freeze();
        if (this.cat) { this.cat.contact.active = false; this.cat.acceptedContact = false; }
        this.recap = buildRecap(this.log, this.lang);
        if (this.toolless) { this.recap.learned = learnedAbout(this.log); this.recap.kittens = this.kittenScores(); }
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
    this.siblings.forEach((c, i) => c.setRegion((this.toolless ? SIBLING_REGIONS_V3 : SIBLING_REGIONS)[i]));
    this.catSession = s.sessionId;
    this.resetLife();
    this.learner.reset(); this.segmenter.reset();
    this.teach = { lastTrace: null, lastResult: null, consistency: null };
    const back = this.returning?.kitten === chosen.kitten.id ? this.returning : null;
    if (back) {
      const k = this.p.keepsake;
      this.cat.needs.trust = Math.min(1, this.cat.needs.trust + Math.min(k.maxTrustBonus, k.trustPerVisit * back.visits));
      this.cat.emit('returned', { time: 0, hand: {} }, { reasonCode: 'RETURNING', measurement: { visits: back.visits + 1 } });
      this.cat.hint('RETURNING');
    }
    this.simTime = 0;
    this.memory.reset();
    this.needs.reset();
    this.resetLitter3();
    this.log = [];
    this.recap = null;
    this.quietRest = 0;
    this.tool = this.toolless ? 'PET' : 'FEED';
    this.held = null;
    this.hints.clear();
  }

  // Everything that belonged to the visitor is destroyed here (F2-17).
  resetSession() {
    this.cat = null;
    this.catSession = null;
    this.returning = null;
    this.learner.reset(); this.segmenter.reset();
    this.teach = { lastTrace: null, lastResult: null, consistency: null };
    for (const c of this.litter) { c.goal = null; c.held = null; c.setRegion(ATTRACT_REGION); }
    this.resetLife();
    this.memory.reset();
    this.needs.reset();
    this.log = [];
    this.recap = null;
    this.quietRest = 0;
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
        calibration: s.state === 'CALIBRATING' ? s.calibElapsed : null,
        calibStable: s.calibStable,
      },
      stillThere: s.stillThere,
      offerEnd: s.offerEnd,
      timed: s.timed,
      kitten: { id: c.kitten.id, name: c.kitten.name, temperament: c.kitten.temperament },
      litter: (s.state === 'ATTRACT' || !this.cat ? this.litter.filter((x) => x !== c) : this.siblings).map((x) => ({
        id: x.id, kitten: x.kitten.id, position: { x: x.x / W, y: x.y / H }, heading: x.heading,
        // litter-mates grow up alongside the visitor's kitten (display only; they have no growth of their own)
        lookAt: x.lookAt ? { x: x.lookAt.x / W, y: x.lookAt.y / H } : null,
        speed: Math.hypot(x.vx, x.vy), behaviour: x.behaviour, ageProgress: this.cat && s.state !== 'ATTRACT' ? this.cat.ageProgress : x.ageProgress,
        wrestling: !!x.held?.wrestle, visiting: this.life.visit?.sibId === x.id, invited: this.life.invite?.sibId === x.id,
        mode: x.held?.wrestle ? 'wrestle' : x.held?.mode ?? null, standoff: !!x.held?.standoff, hissing: !!x.held?.hiss,
        needs: { ...(this.full?.[x.kitten.id]?.needs ?? x.needs) },
        drinking: !!x.held?.drink,
        bond: this.cat && s.state !== 'ATTRACT' ? this.cat.bond(x.kitten.id) : null,
        fleeing: !!x.held?.flee,
      })),
      growth: this.growthSnapshot(c),
      critter: this.critter ? { id: this.critter.id, kind: this.critter.kind, position: { x: this.critter.x / W, y: this.critter.y / H }, fleeing: this.critter.fleeing, caught: this.critter.caught, heading: Math.atan2(this.critter.vy, this.critter.vx) } : null,
      pose: { ...this.pose },
      tricks: {
        learned: this.learner.learned, teaching: this.learner.teaching, count: this.learner.pending.length, need: this.learner.need,
        consistency: this.teach.consistency, lastTrace: this.teach.lastTrace, lastResult: this.teach.lastResult, model: 'knn_1',
        moving: this.segmenter.active,
      },
      presence: this.demoTime - this.presence.at < this.p.presence.lookSec ? this.presence.people : [],
      toy: this.toy.live || this.toy.kind === 'yarn' ? { kind: this.toy.kind, position: this.toy.live && this.toy.x !== null ? { x: this.toy.x / W, y: this.toy.y / H } : null } : { kind: this.toy.kind, position: null },
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
        drinking: c.behaviour === 'DRINK' && (c.drinkUntil ?? 0) > this.simTime,
        inviting: c.inviting,
        contactProgress: c.inviting ? Math.min(1, c.dwell / this.memory.prefs.contactDwell) : 0,
        growing: c.growing,
        growthBlockedBy: c.growthBlockedBy,
        transition: this.simTime < c.transitionUntil,
        stats: { ...c.stats },
        wrestling: c.wrestling,
        socialMode: c.socialMode,
        socialAct: c.social.act,
        socialTarget: c.social.target ? this.litter.find((o) => o.id === c.social.target)?.kitten.id ?? null : null,
        reaction: c.reaction ? { type: c.reaction.type, reasonCode: c.reaction.reasonCode, sibling: c.reaction.sibling } : null,
        carrying: c.giftState.stage === 'bring' ? c.giftState.item : null,
        lastBurst: c.lastBurst,
        lookAt: c.lookAt && s.state === 'ATTRACT' ? { x: c.lookAt.x / W, y: c.lookAt.y / H } : null,
        trick: c.trick ? { name: c.trick.name, t: (this.simTime - c.trick.start) / (c.trick.until - c.trick.start) } : null,
      },
      // a fish being fought over is off the kitten's list for a moment, but still on the ground
      foods: [...c.foods, ...(this.feast ? [this.feast.food] : [])].map((f) => ({ id: f.id, x: f.x / W, y: f.y / H, age: this.simTime - f.born })),
      input: {
        source: this.track.source, quality: this.track.quality, present: this.track.present, overUI: !!this.track.lastSample?.overUI,
        position: this.track.x === null ? null : { x: this.track.x / W, y: this.track.y / H },
        speedSPerSecond: this.track.speed,
        validRatio: this.track.validRatio(),
        rejected: this.track.rejects,
      },
      intent: { ...this.intent },
      activeTool: this.tool,
      toolless: this.toolless,
      scene: this.scene,
      items: SCENE_ITEMS[this.scene],
      bowl: this.bowl ? { x: this.bowl.x / W, y: this.bowl.y / H } : null,
      need: this.toolless && this.cat ? this.needs.view(this.simTime) : null,
      held: this.held,
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
