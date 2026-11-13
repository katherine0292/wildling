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
