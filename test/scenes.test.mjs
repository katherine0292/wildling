// V3 habitats: the arrows at the screen edges move between the jungle, the snowfields and the
// desert; every habitat offers the same four things in the pouch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';

const driver = () => new Driver({ toolless: true, growth: false, timed: false });

test('the arrows step through the three habitats, and every habitat has the same pouch', () => {
  const d = driver();
  d.startMouse();
  assert.equal(d.sim.snapshot().scene, 'jungle');
  assert.deepEqual(d.sim.snapshot().items, ['treat', 'wand', 'ball', 'bowl']);
  d.cmd('scene', { dir: 1 });
  assert.equal(d.sim.snapshot().scene, 'snow');
  assert.deepEqual(d.sim.snapshot().items, ['treat', 'wand', 'snowball', 'bowl'], 'the ball is a snowball in the snow');
  d.cmd('scene', { dir: 1 });
  assert.equal(d.sim.snapshot().scene, 'desert');
  assert.deepEqual(d.sim.snapshot().items, ['treat', 'wand', 'ball', 'bowl']);
  d.cmd('scene', { dir: -1 });
  assert.equal(d.sim.snapshot().scene, 'snow');
});

test('what the hand holds comes along to the next habitat; a ball becomes a snowball in the snow', () => {
  const d = driver();
  d.startMouse();
  d.cmd('hold', { item: 'wand' });
  d.cmd('scene', { to: 'snow' });
  assert.equal(d.sim.snapshot().held, 'wand');
  d.cmd('scene', { to: 'jungle' });
  d.cmd('hold', { item: 'ball' });
  d.cmd('scene', { to: 'snow' });
  assert.equal(d.sim.snapshot().held, 'snowball');
  d.cmd('scene', { to: 'desert' });
  assert.equal(d.sim.snapshot().held, 'ball');
});

test('a rubber ball is thrown like a snowball in the jungle', () => {
  const d = driver();
  d.startMouse();
  d.cmd('hold', { item: 'ball' });
  d.run(0.3, () => mouseAt(0.3, 0.4));
  d.cmd('confirm', { x: 0.3, y: 0.4 });
  assert.equal(d.sim.toy.live, true);
  assert.equal(d.sim.tool, 'PLAY');
});

test('in the snow a snowball is thrown with a pinch or a click, and rolls on its own', () => {
  const d = driver();
  d.startMouse();
  d.cmd('scene', { to: 'snow' });
  d.cmd('hold', { item: 'snowball' });
  d.run(0.3, () => mouseAt(0.3, 0.4));
  d.cmd('confirm', { x: 0.3, y: 0.4 });
  assert.equal(d.sim.snapshot().held, 'snowball', 'another snowball is ready in hand');
  assert.equal(d.sim.toy.live, true);
  const x0 = d.sim.toy.x;
  d.run(0.5, () => mouseAt(0.3, 0.4));
  assert.notEqual(d.sim.toy.x, x0, 'it rolls');
});

test('in the desert the water bowl is set down where you click, and the kitten drinks', () => {
  const d = driver();
  d.startMouse();
  for (const o of d.sim.siblings) o.held = { behaviour: 'REST', until: d.sim.demoTime + 60 };
  Object.assign(d.cat.needs, { stress: 0.1, energy: 0.8 });
  d.cmd('scene', { to: 'desert' });
  d.cmd('hold', { item: 'bowl' });
  const p = { x: d.cat.x / d.sim.world.w + 0.12, y: d.cat.y / d.sim.world.h };
  d.cmd('confirm', p);
  assert.ok(d.sim.snapshot().bowl, 'the bowl is on the ground');
  const t = d.until(() => d.sim.snapshot().creature.drinking, 8, () => mouseAt(0.95, 0.1));
  assert.ok(t >= 0, 'the kitten went to drink');
  const done = d.until(() => d.sim.log.some((e) => e.type === 'drink_completed'), 8, () => mouseAt(0.95, 0.1));
  assert.ok(done >= 0, 'and finished');
});
