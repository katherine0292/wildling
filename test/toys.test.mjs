// Toys for the Play tool (ADR-015): the same play rules, three different targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';

const keen = (d) => Object.assign(d.cat.needs, { fullness: 0.8, energy: 0.9, fun: 0.2, stress: 0.05 });

test('yarn stays the default: the hand itself is the toy', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('select_tool', { tool: 'PLAY' });
  assert.equal(d.sim.toy.kind, 'yarn');
});

test('a thrown ball rolls on its own and the kitten chases it with no hand on screen', () => {
  const d = new Driver();
  d.startMouse();
  keen(d);
  d.cmd('select_toy', { toy: 'ball' });
  assert.equal(d.sim.tool, 'PLAY');
  const p = d.catAt(0.3, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  assert.equal(d.sim.toy.live, true);
  const got = d.until(() => d.cat.stats.pounces > 0, 15, () => { keen(d); return { source: 'mouse', present: false }; });
  assert.ok(got >= 0, 'pounced on the ball');
  assert.equal(d.events('pounce_success')[0].measurement.toy, 'ball');
  assert.ok(Math.hypot(d.sim.toy.vx, d.sim.toy.vy) > 0.2, 'the bat sends it rolling');
});

test('a feather flicked fast is a leap and a miss; slow, it is caught', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('select_toy', { toy: 'feather' });
  // whip the hand back and forth across the kitten
  d.run(8, (s) => { keen(d); const p = d.catAt(0.3 * Math.sin(s * 8), -0.1); return mouseAt(p.x, p.y); });
  assert.ok(d.events('pounce_missed').length >= 1, 'fast feather is missed');

  const e = new Driver();
  e.startMouse();
  e.cmd('select_toy', { toy: 'feather' });
  const got = e.until(() => e.cat.stats.pounces > 0, 15, (s) => { keen(e); const p = e.catAt(0.02, -0.12); return mouseAt(p.x, p.y); });
  assert.ok(got >= 0, 'slow feather is caught');
});

// Keepsakes (ADR-016): remembered only when the visitor's own browser says so.
test('without a keepsake every visitor meets a kitten that has never met anyone', () => {
  const d = new Driver();
  d.startMouse();
  assert.equal(d.cat.needs.trust, 0.25);
  assert.equal(d.events('returned').length, 0);
});

test('a returning visitor is greeted, gets a bounded head start and a cited journal line', () => {
  const d = new Driver();
  d.cmd('set_returning', { kitten: 'ember', visits: 5 });
  d.startMouse();
  d.run(0.2);
  assert.ok(Math.abs(d.cat.needs.trust - (0.25 + 0.18)) < 1e-9, 'bonus is capped');
  const r = d.events('returned');
  assert.equal(r.length, 1);
  assert.equal(r[0].measurement.visits, 6);
  d.cmd('end');
  assert.match(d.sim.recap.lines[0].text, /visit 6/);
  d.cmd('next');
  d.startMouse();
  assert.equal(d.cat.needs.trust, 0.25, 'cleared for the next visitor');
});

test('a keepsake for one kitten does not carry over to its siblings', () => {
  const d = new Driver();
  d.cmd('set_returning', { kitten: 'juniper', visits: 2 });
  d.startMouse();
  assert.equal(d.cat.kitten.id, 'ember');
  assert.equal(d.cat.needs.trust, 0.25);
});
