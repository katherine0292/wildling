// Growth you can see, life with the litter, hunting and gifts (ADR-012, ADR-013).
// Every new behaviour keeps the old fairness rules: the gate still blocks growth,
// refusals still carry a reason, and nothing here can cost the visitor trust.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';
import { PARAMS } from '../v2/core/config.js';

const far = () => mouseAt(0.95, 0.1);
const content = { fullness: 0.8, energy: 0.9, fun: 0.8, stress: 0.1 };

test('a completed meal is a growth burst, on top of the passive drift', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { fullness: 0.5, energy: 0.9, fun: 0.8, stress: 0.1 });
  const p = d.catAt(0.12, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  d.until(() => d.cat.stats.fed === 1, 8, far);
  const burst = d.events('growth_burst');
  assert.equal(burst.length, 1);
  assert.equal(burst[0].measurement.cause, 'FEED');
  assert.ok(Math.abs(burst[0].measurement.amount - PARAMS.growth.burst.FEED) < 1e-9);
});

test('bursts are capped per cause per minute, so one repeated action cannot rush growth', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, content);
  const c = d.cat;
  let total = 0;
  for (let i = 0; i < 10; i++) {
    c.emit('pounce_success', { time: d.sim.simTime, hand: {} }, { measurement: { interval: 2 } });
    d.tick(far());
  }
  for (const e of d.events('growth_burst')) if (e.measurement.cause === 'PLAY') total += e.measurement.amount;
  assert.ok(total <= PARAMS.growth.burstCapPerMin + 1e-9, `capped, got ${total}`);
});

test('a blocked gate stops bursts as well as drift, and says which need blocks it', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { fullness: 0.1, energy: 0.9, fun: 0.9, stress: 0.1 });
  d.cat.emit('pounce_success', { time: 0, hand: {} }, { measurement: {} });
  d.run(1, far);
  assert.equal(d.cat.ageProgress, 0);
  const g = d.sim.snapshot().growth;
  assert.equal(g.ok, false);
  assert.equal(g.blockedBy, 'fullness');
  assert.equal(g.checks.fed, false);
  assert.equal(g.next, 'juvenile');
  assert.deepEqual(g.unlocks, ['hunting']);
});

test('growing up waits for the celebration before the visit ends', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, content);
  d.cat.ageProgress = 2.999;
  d.run(0.5, far);
  assert.ok(d.cat.ageProgress >= 3);
  assert.equal(d.state, 'ACTIVE', 'celebration first');
  d.run(PARAMS.growth.transitionSec + 0.5, far);
  assert.equal(d.state, 'REFLECTION');
  assert.equal(d.sim.session.endReason, 'grown');
});

test('a sibling visits; a playful, rested kitten wrestles it and grows from it', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { fullness: 0.8, energy: 0.9, fun: 0.3, stress: 0.05 });
  d.sim.life.nextVisitAt = 0;
  const ok = d.until(() => d.events('sibling_play').length > 0, 30, () => { d.cat.needs.stress = 0.05; return far(); });
  assert.ok(ok >= 0, 'wrestled');
  const e = d.events('sibling_play')[0];
  assert.equal(e.measurement.endedBy, 'done');
  assert.ok(d.events('growth_burst').some((b) => b.measurement.cause === 'SOCIAL'));
  assert.ok(d.cat.needs.fun > 0.3);
});

test('a sibling that comes close while the kitten eats gets hissed at, and trust is untouched', () => {
  const d = new Driver();
  d.startMouse();
  const p = d.catAt(0.02, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  d.until(() => d.cat.behaviour === 'EAT', 5, far);
  const trust = d.cat.needs.trust;
  const sib = d.sim.siblings[0];
  sib.x = d.cat.x + 0.1; sib.y = d.cat.y;
  d.run(0.1, far);
  const h = d.events('hiss');
  assert.equal(h.length, 1);
  assert.equal(h[0].reasonCode, 'SIB_FOOD');
  assert.equal(d.cat.needs.trust, trust);
  assert.ok(sib.held?.flee, 'the sibling backs off');
});

test('inviting a sibling is a request: a tired kitten declines with a reason', () => {
  const d = new Driver();
  d.startMouse();
  d.cat.needs.energy = 0.2;
  d.cmd('invite_sibling', { kitten: 'juniper' });
  d.run(1, far);
  const r = d.events('refusal').find((e) => e.measurement.request === 'SOCIAL');
  assert.ok(r, 'refusal recorded');
  assert.equal(r.reasonCode, 'NEED_REST');
  assert.equal(d.sim.life.invite, null, 'invitation withdrawn');
  assert.equal(d.cat.stats.wrestles, 0);
});

test('kittens are too young to hunt; from Chapter II the kitten may chase a critter', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { ...content, fun: 0.2 });
  d.sim.nextCritterAt = 0;
  d.run(2, far);
  const hunt = d.cat.decision.candidates.find((c) => c.name === 'HUNT');
  assert.equal(hunt.blocked, 'too_young');

  const j = new Driver();
  j.startMouse();
  j.cat.ageProgress = 1.05;
  j.sim.nextCritterAt = 0;
  const got = j.until(() => j.events('hunt_pounce').length > 0, 40, () => { Object.assign(j.cat.needs, { ...content, fun: 0.2 }); return far(); });
  assert.ok(got >= 0, 'chased and pounced');
});

test('an adult that trusts you brings a gift to your hand', () => {
  const d = new Driver();
  d.startMouse();
  d.cat.ageProgress = 2.05;
  const got = d.until(() => d.events('gift_given').length > 0, 40, () => {
    Object.assign(d.cat.needs, { ...content, trust: 0.8 });
    return mouseAt(0.5, 0.45);
  });
  assert.ok(got >= 0, 'gift given');
  const snap = d.sim.snapshot();
  assert.equal(snap.gifts.length, 1);
  assert.equal(d.cat.stats.gifts, 1);
});

test('visits, critters and gifts are cleared for the next visitor', () => {
  const d = new Driver();
  d.startMouse();
  d.sim.gifts.push({ id: 'g1', item: 'pebble', x: 0.5, y: 0.5, born: 0 });
  d.cmd('invite_sibling', { kitten: 'juniper' });
  d.cmd('end');
  d.cmd('next');
  assert.equal(d.sim.gifts.length, 0);
  assert.equal(d.sim.life.invite, null);
  assert.ok(d.sim.litter.every((c) => !c.goal && !c.held));
});
