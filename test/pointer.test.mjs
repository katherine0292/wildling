// Pointer speed and staying in view: a mouse is not a hand, and backing off is not leaving.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, cam, mouseAt } from './helpers.mjs';

test('a mouse sweeping past the kitten at an ordinary speed does not startle it', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('select_tool', { tool: 'PET' });
  d.run(1, () => mouseAt(0.1, 0.2));
  // across the kitten at about 1.4 S/s: brisk for a hand at a camera, ordinary for a mouse
  const c = d.catAt();
  let k = 0;
  d.run(1.2, () => { k++; const t = Math.min(1, k / 45); return mouseAt(c.x - 0.35 + 0.7 * t, c.y + 0.02); });
  assert.equal(d.cat.stats.startles, 0);
});

test('a mouse lunging straight at the kitten still startles it', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('select_tool', { tool: 'PET' });
  const start = d.catAt(-0.6, 0);
  d.run(0.8, () => mouseAt(start.x, start.y));
  let k = 0;
  // 0.6 S in 0.15 s = 4 S/s, straight in
  d.run(1, () => { k++; const t = Math.min(1, k / 9); const c = d.catAt(); return mouseAt(start.x + (c.x - start.x) * t, start.y + (c.y - start.y) * t); });
  assert.ok(d.cat.stats.startles >= 1);
});

test('a startled kitten backs off but stays inside the frame', () => {
  const d = new Driver();
  d.startCamera();
  const w = d.sim.world, m = d.sim.p.retreat.margin;
  // park the kitten by the right-hand edge, then rush it from the left again and again
  d.cat.x = w.w - m - 0.01; d.cat.y = w.h * 0.4;
  for (let round = 0; round < 4; round++) {
    const start = d.catAt(-0.45, 0);
    d.run(0.6, () => cam(start.x, start.y));
    let k = 0;
    d.run(2.6, () => { k++; const t = Math.min(1, k / 15); const c = d.catAt(-0.02, 0); return cam(start.x + (c.x - start.x) * t, start.y + (c.y - start.y) * t); });
    assert.ok(d.cat.x >= m - 0.03 && d.cat.x <= w.w - m + 0.03, `x in view (round ${round}): ${d.cat.x.toFixed(3)} of ${w.w.toFixed(3)}`);
    assert.ok(d.cat.y >= m - 0.03 && d.cat.y <= w.h - 0.03, `y in view (round ${round})`);
  }
  assert.ok(d.cat.stats.startles >= 1, 'the rushes did register');
});

const touchAt = (x, y, touchPhase) => ({ ...mouseAt(x, y), pointerType: 'touch', touchPhase });

function phoneVisit() {
  const d = new Driver({ toolless: true, growth: false, world: { w: 1, h: 2 } });
  d.startMouse();
  const c = d.cat;
  c.x = 0.5;
  c.y = 1;
  c.behaviour = 'OBSERVE';
  c.boutUntil = 3;
  Object.assign(c.needs, { stress: 0.05, energy: 0.9, fullness: 0.6, trust: 0.4 });
  for (const o of d.sim.siblings) { o.x = 0.84; o.y = 1.4; }
  return d;
}

test('a touch parked on the back stays eligible for contact after the last move', () => {
  const d = phoneVisit();
  const p = d.catAt();
  d.tick(touchAt(p.x, p.y, 'start'));
  d.run(0.85, () => touchAt(p.x, p.y));
  assert.equal(d.cat.acceptedContact, true);
  assert.equal(d.events('contact_started').length, 1);
});

test('one short touch swipe past the kitten starts a retreat even after the swipe ends', () => {
  const d = phoneVisit();
  const p = d.catAt();
  d.tick(touchAt(p.x - 0.32, p.y - 0.055, 'start'));
  for (let i = 1; i <= 4; i++) d.tick(touchAt(p.x - 0.32 + i * 0.16, p.y - 0.055, 'move'));
  d.run(0.4, () => touchAt(p.x + 0.32, p.y - 0.055));
  assert.equal(d.events('startle').length, 1);
  assert.equal(d.cat.behaviour, 'RETREAT');
});

test('a fresh touch, a gentle stroke, and a fast swipe far from the kitten do not startle it', () => {
  const d = phoneVisit();
  const p = d.catAt();
  d.tick(touchAt(p.x - 0.32, p.y - 0.05, 'start'));
  d.tick(touchAt(p.x + 0.32, p.y - 0.05, 'start'));
  d.run(0.3, () => touchAt(p.x + 0.32, p.y - 0.05));
  d.tick(touchAt(p.x - 0.05, p.y, 'start'));
  d.run(0.5, (t) => touchAt(p.x - 0.05 + t * 0.2, p.y, 'move'));
  d.tick(touchAt(p.x - 0.32, p.y - 0.24, 'start'));
  for (let i = 1; i <= 4; i++) d.tick(touchAt(p.x - 0.32 + i * 0.16, p.y - 0.24, 'move'));
  d.run(0.4, () => touchAt(p.x + 0.32, p.y - 0.24));
  assert.equal(d.events('startle').length, 0);
});

test('a quick touch swing with a feather still counts as play', () => {
  const d = phoneVisit();
  const p = d.catAt();
  d.cmd('hold', { item: 'wand' });
  d.tick(touchAt(p.x - 0.32, p.y - 0.055, 'start'));
  for (let i = 1; i <= 4; i++) d.tick(touchAt(p.x - 0.32 + i * 0.16, p.y - 0.055, 'move'));
  d.run(0.4, () => touchAt(p.x + 0.32, p.y - 0.055));
  assert.equal(d.events('startle').length, 0);
  assert.equal(d.sim.held, 'wand');
});
