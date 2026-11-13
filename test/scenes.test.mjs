// V3 habitats: the arrows at the screen edges move between the jungle, the snowfields and the
// desert; each habitat offers its own two things in the pouch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';

const driver = () => new Driver({ toolless: true, growth: false, timed: false });

test('the arrows step through the three habitats, and each has its own pouch', () => {
  const d = driver();
  d.startMouse();
  assert.equal(d.sim.snapshot().scene, 'jungle');
  assert.deepEqual(d.sim.snapshot().items, ['treat', 'wand']);
  d.cmd('scene', { dir: 1 });
  assert.equal(d.sim.snapshot().scene, 'snow');
  assert.deepEqual(d.sim.snapshot().items, ['treat', 'snowball']);
  d.cmd('scene', { dir: 1 });
  assert.equal(d.sim.snapshot().scene, 'desert');
  assert.deepEqual(d.sim.snapshot().items, ['bowl', 'wand']);
  d.cmd('scene', { dir: -1 });
  assert.equal(d.sim.snapshot().scene, 'snow');
});

test('what the hand holds goes back to the pouch when the habitat has no place for it', () => {
  const d = driver();
  d.startMouse();
  d.cmd('hold', { item: 'wand' });
  d.cmd('scene', { to: 'snow' });
  assert.equal(d.sim.snapshot().held, null);
  d.cmd('hold', { item: 'wand' });
  assert.equal(d.sim.snapshot().held, null, 'no feather in the snow');
});

test('in the snow a snowball is thrown with a pinch or a click, and rolls on its own', () => {
  const d = driver();
  d.startMouse();
  d.cmd('scene', { to: 'snow' });
  d.cmd('hold', { item: 'snowball' });
  d.run(0.3, () => mouseAt(0.3, 0.4));
  d.cmd('confirm', { x: 0.3, y: 0.4 });
  assert.equal(d.sim.snapshot().held, null);
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
