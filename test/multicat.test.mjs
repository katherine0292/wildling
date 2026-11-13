// V3: every kitten can be met. The kitten nearest the hand is the one you meet; the others
// join in around the feather and a fish, face off over food a body length apart, and keep
// their own state while you meet someone else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';
import { classifyPose } from '../v2/core/pose.js';

const driver = () => new Driver({ toolless: true, growth: false, timed: false });
const at = (d, o, dx = 0, dy = 0) => ({ x: (o.x + dx) / d.sim.world.w, y: (o.y + dy) / d.sim.world.h });
const sib = (d, id) => d.sim.siblings.find((o) => o.kitten.id === id);
const awake = (o) => { o.held = null; o.behaviour = 'OBSERVE'; o.needs.energy = 0.9; };

test('the kitten nearest the hand becomes the one you meet, and the panel follows it', () => {
  const d = driver();
  d.startMouse();
  const first = d.cat.kitten.id, other = d.sim.siblings[0];
  const id = other.kitten.id;
  d.run(1.5, () => mouseAt(at(d, other, 0.03).x, at(d, other, 0.03).y));
  assert.equal(d.sim.snapshot().kitten.id, id);
  assert.ok(d.sim.siblings.some((o) => o.kitten.id === first), 'the first kitten is back in the litter');
  assert.ok(d.sim.log.some((e) => e.type === 'focus_changed' && e.measurement.kitten === id));
});

test('each kitten keeps its own bond while you meet another', () => {
  const d = driver();
  d.startMouse();
  const first = d.cat;
  first.needs.trust = 0.71;
  const other = d.sim.siblings[0];
  d.run(1.5, () => mouseAt(at(d, other, 0.03).x, at(d, other, 0.03).y));
  assert.notEqual(d.cat, first);
  const back = d.sim.siblings.find((o) => o.kitten.id === first.kitten.id);
  d.run(1.5, () => mouseAt(at(d, back, 0.03).x, at(d, back, 0.03).y));
  assert.equal(d.cat.kitten.id, first.kitten.id);
  assert.equal(d.cat.needs.trust.toFixed(2), '0.71');
});

test('a pointing finger (a held mouse button) leads the kitten across the clearing', () => {
  const d = driver();
  d.startMouse();
  Object.assign(d.cat.needs, { energy: 0.9, stress: 0.05 });
  for (const o of d.sim.siblings) o.held = { behaviour: 'REST', until: d.sim.demoTime + 60 };
  const target = { x: d.cat.x / d.sim.world.w - 0.25, y: 0.3 };
  d.cmd('follow', { on: true });
  const before = Math.hypot(d.cat.x / d.sim.world.w - target.x, d.cat.y - target.y);
  d.run(3, () => mouseAt(target.x, target.y));
  const after = Math.hypot(d.cat.x / d.sim.world.w - target.x, d.cat.y - target.y);
  assert.equal(d.cat.behaviour, 'FOLLOW');
  assert.ok(after < before * 0.5, `closer: ${before.toFixed(2)} → ${after.toFixed(2)}`);
  d.cmd('follow', { on: false });
});

test('the feather draws the other kittens in too', () => {
  const d = driver();
  d.startMouse();
  const o = d.sim.siblings[0];
  awake(o);
  d.cmd('hold', { item: 'wand' });
  d.run(0.5, () => mouseAt(at(d, o, 0.12).x, at(d, o, 0.12, -0.12).y));
  assert.ok(d.sim.siblings.some((q) => q.held?.chase), 'a litter-mate is chasing the feather');
});

test('a fish dropped by another kitten is eaten by that kitten', () => {
  const d = driver();
  d.startMouse();
  const o = d.sim.siblings[0];
  awake(o);
  o.needs.fullness = 0.3;
  d.cat.x = 0.15; d.cat.y = 0.15; d.cat.needs.fullness = 0.95; // the kitten you meet is far away and full
  d.cmd('hold', { item: 'treat' });
  const p = at(d, o, 0.06);
  d.cmd('confirm', { x: p.x, y: p.y });
  const t = d.until(() => d.sim.log.some((e) => e.type === 'sibling_ate'), 10, () => mouseAt(0.9, 0.1));
  assert.ok(t >= 0, 'the litter-mate got the fish');
  assert.equal(d.cat.foods.length, 0);
});

test('two hungry kittens face off over one fish, a body length apart, and only one eats', () => {
  const d = driver();
  d.startMouse();
  const o = d.sim.siblings[0];
  awake(o);
  for (const q of d.sim.siblings.slice(1)) q.held = { behaviour: 'REST', until: d.sim.demoTime + 60 };
  Object.assign(d.cat.needs, { fullness: 0.3, trust: 0.5, stress: 0.05 });
  o.needs.fullness = 0.3;
  // the fish between them
  o.x = d.cat.x + 0.24; o.y = d.cat.y;
  d.cmd('hold', { item: 'treat' });
  d.cmd('confirm', { x: (d.cat.x + 0.12) / d.sim.world.w, y: d.cat.y / d.sim.world.h });
  const t = d.until(() => !!d.sim.feast, 6, () => mouseAt(0.95, 0.1));
  assert.ok(t >= 0, 'a standoff started');
  d.run(0.6, () => mouseAt(0.95, 0.1));
  assert.ok(Math.hypot(d.cat.x - o.x, d.cat.y - o.y) > 0.15, 'apart, not on top of each other');
  assert.equal(d.cat.reaction?.type, 'hiss');
  d.until(() => d.sim.log.some((e) => e.type === 'food_contest'), 6, () => mouseAt(0.95, 0.1));
  const r = d.sim.log.find((e) => e.type === 'food_contest').measurement;
  assert.ok([d.cat.kitten.id, o.kitten.id].includes(r.winner));
});

test('litter-mates on their own groom each other or face off, never overlapping', () => {
  const d = driver();
  d.startMouse();
  d.sim.siblings.forEach(awake);
  d.sim.nextPairAt = d.sim.simTime;
  const t = d.until(() => d.sim.pair?.until != null, 20, () => mouseAt(0.5, 0.05));
  assert.ok(t >= 0, 'they met');
  d.run(1, () => mouseAt(0.5, 0.05));
  const [a, b] = d.sim.siblings;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.13);
});

test('pointing and OK are told apart from the other hand shapes', () => {
  const hand = (fingers, okRing = false) => {
    const kp = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
    [[1, 0.42, 0.74], [2, 0.38, 0.7], [3, 0.36, 0.66], [4, 0.35, 0.62]].forEach(([i, x, y]) => { kp[i] = { x, y }; });
    const mcp = { 5: [0.44, 0.6], 9: [0.48, 0.58], 13: [0.52, 0.6], 17: [0.56, 0.62] };
    for (const [m, [x, y]] of Object.entries(mcp)) {
      const i = Number(m), f = fingers[[5, 9, 13, 17].indexOf(i)];
      kp[i] = { x, y };
      if (f === 'up') { kp[i + 1] = { x, y: y - 0.07 }; kp[i + 2] = { x, y: y - 0.12 }; kp[i + 3] = { x, y: y - 0.16 }; }
      if (f === 'fold') { kp[i + 1] = { x, y: y - 0.05 }; kp[i + 2] = { x, y: y - 0.02 }; kp[i + 3] = { x, y: y + 0.05 }; }
      if (f === 'ring') { kp[i + 1] = { x: x - 0.03, y: y - 0.05 }; kp[i + 2] = { x: x - 0.06, y: y - 0.05 }; kp[i + 3] = { x: 0.36, y: 0.62 }; }
    }
    if (okRing) kp[4] = { ...kp[8] };
    return kp;
  };
  assert.equal(classifyPose(hand(['up', 'fold', 'fold', 'fold'])).label, 'point');
  assert.equal(classifyPose(hand(['ring', 'up', 'up', 'up'], true)).label, 'ok');
});

test('the end of a visit scores every kitten by what it gained and the care it got', () => {
  const d = new Driver({ toolless: true, growth: false, timed: false });
  d.startMouse();
  d.petUntilContact();
  d.run(6, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  d.cmd('end');
  const k = d.sim.recap.kittens;
  assert.equal(k.length, 3);
  assert.equal(k[0].kitten, d.sim.kittenId, 'the kitten you stroked comes first');
  assert.ok(k[0].strokes >= 1 && k[0].score > 0);
  for (const other of k.slice(1)) assert.equal(other.score, 0, `${other.name} was not met and scores nothing`);
});
