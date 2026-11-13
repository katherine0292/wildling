// Hand and mouse parity (exhibition): a pinch is a click on every screen the visitor can act
// on. Outside a visit it only presses buttons; it never reaches the kitten's world.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, cam } from './helpers.mjs';

const driver = () => new Driver({ toolless: true, growth: false, timed: false });

function pinchOnce(d, at) {
  const open = cam(at.x, at.y), pinch = cam(at.x, at.y, { pinchRatio: 0.12 });
  d.run(0.5, () => open);
  const out = [];
  for (let i = 0; i < 30; i++) {
    d.t += 1000 / 60;
    const r = d.sim.ingest({ t: d.t, seq: ++d.seq, ...pinch });
    if (r) out.push(r);
    d.sim.update(1 / 60, d.t);
  }
  return out;
}

test('a pinch on the journal is offered as a click and drops nothing in the world', () => {
  const d = driver();
  d.startCamera();
  d.cmd('end');
  assert.equal(d.state, 'REFLECTION');
  const clicks = pinchOnce(d, { x: 0.5, y: 0.6 });
  assert.equal(clicks.length, 1);
  assert.equal(d.cat.foods.length, 0);
});

test('the camera stays on through the journal and is released when it closes', () => {
  const d = driver();
  d.startCamera();
  d.sim.drainEvents();
  d.cmd('end');
  assert.ok(!d.sim.drainEvents().some((e) => e.type === 'release_camera'), 'still on for the journal buttons');
  d.cmd('next');
  d.run(0.2);
  assert.ok(d.sim.drainEvents().some((e) => e.type === 'release_camera'));
});
