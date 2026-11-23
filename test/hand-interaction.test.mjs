import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, cam, mouseAt } from './helpers.mjs';
import { buildRecap } from '../v2/core/recap.js';

const driver = () => new Driver({ toolless: true, growth: false, timed: false });

// The browser starts the next capture only after a worker result, then waits for a
// fresh video frame. Keep capture and delivery on the same clock, as a real camera
// does; feeding both timestamps from the render tick hides slow-inference failures.
function serialCamera(d, inferenceMs) {
  const videoFrameMs = 1000 / 30;
  let nextCapture = d.t + videoFrameMs;
  let frame = null;
  return {
    tick(sample = () => cam(0.5, 0.5)) {
      const now = d.t + 1000 / 60;
      let delivered = null;
      while ((frame ? frame.readyAt : nextCapture) <= now + 1e-6) {
        if (frame) {
          delivered = { ...frame.sample, t: frame.capturedAt, receivedAt: frame.readyAt, seq: ++d.seq };
          d.sim.ingest(delivered);
          nextCapture = frame.readyAt + videoFrameMs;
          frame = null;
        } else {
          frame = { sample: sample(), capturedAt: nextCapture, readyAt: nextCapture + inferenceMs };
        }
      }
      d.t = now;
      d.sim.update(1 / 60, d.t, { trackingAvailable: true });
      return delivered;
    },
  };
}

for (const inferenceMs of [100, 150, 200, 250, 300]) {
  test(`a steady hand calibrates with ${inferenceMs} ms serial inference and a video-frame wait`, () => {
    const d = driver();
    d.cmd('start');
    d.cmd('choose_input', { source: 'camera' });
    const camera = serialCamera(d, inferenceMs);
    for (let i = 0; i < 21 * 60 && d.sim.snapshot().sessionState === 'CALIBRATING'; i++) camera.tick();
    assert.equal(d.sim.snapshot().sessionState, 'ACTIVE');
  });
}

test('a returned empty-hand result immediately interrupts calibration', () => {
  const d = driver();
  d.cmd('start');
  d.cmd('choose_input', { source: 'camera' });
  const camera = serialCamera(d, 100);
  for (let i = 0; i < 60; i++) camera.tick();
  assert.ok(d.sim.snapshot().timers.calibStable > 0, 'calibration was making progress');
  let missing = null;
  for (let i = 0; i < 30 && !missing; i++) {
    const result = camera.tick(() => ({ source: 'camera', present: false }));
    if (result && !result.present) missing = result;
  }
  assert.ok(missing, 'the worker delivered an empty-hand result');
  const snap = d.sim.snapshot();
  assert.equal(snap.sessionState, 'CALIBRATING');
  assert.equal(snap.input.quality, 'lost');
  assert.equal(snap.timers.calibStable, 0);
});

test('a camera that stops returning results becomes lost and cannot finish calibration', () => {
  const d = driver();
  d.cmd('start');
  d.cmd('choose_input', { source: 'camera' });
  const camera = serialCamera(d, 100);
  for (let i = 0; i < 60; i++) camera.tick();
  assert.ok(d.sim.snapshot().timers.calibStable > 0);
  d.run(0.6);
  const snap = d.sim.snapshot();
  assert.equal(snap.input.quality, 'lost');
  assert.equal(snap.timers.calibStable, 0);
  assert.equal(snap.sessionState, 'CALIBRATING');
  d.run(2);
  assert.equal(d.sim.snapshot().sessionState, 'CALIBRATING');
});

test('an inference result more than a second old cannot revive a lost hand', () => {
  const d = driver();
  d.startCamera();
  const capturedAt = d.t;
  d.run(1.1); // the worker remains busy while the last returned result expires
  assert.equal(d.sim.snapshot().input.quality, 'lost');
  d.sim.ingest({ ...cam(0.2, 0.2), t: capturedAt, receivedAt: d.t, seq: ++d.seq });
  assert.equal(d.sim.snapshot().input.quality, 'lost', 'a fresh delivery must not revive stale evidence');
  d.sim.update(1 / 60, d.t + 1000 / 60);
  assert.equal(d.sim.snapshot().input.quality, 'lost');
});

test('an invalid camera frame cancels a pending pinch and a fresh release is needed', () => {
  const d = driver();
  d.startCamera();
  const p = d.catAt(0.15, 0);
  const open = cam(p.x, p.y);
  const pinch = cam(p.x, p.y, { pinchRatio: 0.12 });
  d.run(1, () => open);
  d.run(0.083, () => pinch);
  assert.notEqual(d.sim.pinch.closedSince, null);
  d.tick({ ...pinch, handScale: 0.02 });
  d.run(1, () => pinch);
  assert.equal(d.sim.pinch.lastFire, -Infinity);
  d.run(0.2, () => open);
  d.run(0.25, () => pinch);
  assert.ok(Number.isFinite(d.sim.pinch.lastFire));
});

test('one camera confirmation is offered for target routing without dropping the treat', () => {
  const d = driver();
  d.startCamera();
  d.cmd('hold', { item: 'treat' });
  const p = d.catAt(0.15, 0);
  const open = cam(p.x, p.y);
  const pinch = cam(p.x, p.y, { pinchRatio: 0.12 });
  d.run(1, () => open);
  const confirmations = [];
  for (let i = 0; i < 30; i++) {
    d.t += 1000 / 60;
    const result = d.sim.ingest({ t: d.t, seq: ++d.seq, ...pinch });
    if (result) confirmations.push(result);
    d.sim.update(1 / 60, d.t);
  }
  assert.equal(confirmations.length, 1);
  assert.equal(d.cat.foods.length, 0);
  assert.equal(d.sim.held, 'treat');
  d.sim.command(confirmations[0]);
  assert.equal(d.cat.foods.length, 1);
  assert.equal(d.sim.held, 'treat', 'the basket stays in hand for the next fish');
});

test('calibration timeout returns to input choice and requests camera release', () => {
  const d = driver();
  d.cmd('start');
  d.cmd('choose_input', { source: 'camera' });
  for (let i = 0; i < 25 * 60; i++) {
    d.t += 1000 / 60;
    d.sim.update(1 / 60, d.t, { trackingAvailable: false });
  }
  assert.equal(d.state, 'CALIBRATING');
  d.run(20.5, () => ({ source: 'camera', present: false }));
  assert.equal(d.state, 'CONSENT');
  assert.ok(d.sim.drainEvents().some(e => e.type === 'release_camera' && e.reason === 'calibration_timeout'));
});

test('a hand over the interface can still select a control but cannot start contact', () => {
  const d = driver();
  d.startCamera();
  d.cat.needs.trust = 0.8;
  d.run(4, () => {
    const p = d.catAt(0.02);
    return { ...cam(p.x, p.y), overUI: true };
  });
  assert.equal(d.sim.track.quality, 'valid');
  assert.equal(d.cat.acceptedContact, false);
  assert.equal(d.events('contact_started').length, 0);
});

test('a bonded, settled kitten closes the visit only after quiet rest beside a valid hand', () => {
  const d = driver();
  d.startMouse();
  d.cat.needs.trust = 0.8;
  d.cat.needs.energy = 0.05;
  d.cat.behaviour = 'REST';
  d.cat.restMinUntil = 9;
  d.cat.nextDecision = 9;
  d.run(3, () => ({ source: 'mouse', present: false }));
  assert.equal(d.state, 'ACTIVE');
  d.run(5.3, () => { const p = d.catAt(0.09); return mouseAt(p.x, p.y); });
  assert.equal(d.state, 'REFLECTION');
  assert.equal(d.sim.session.endReason, 'asleep');
  assert.deepEqual(d.sim.recap.lines[0].evidence, [d.events('slept_beside_hand')[0].id]);
});

test('the recap names the direction of a real adaptation', () => {
  const recap = buildRecap([{ id: 'a1', type: 'rhythm_adapted', validity: 'valid',
    measurement: { key: 'approachRadius', from: 0.10, to: 0.09 } }]);
  assert.deepEqual(recap.lines, [{ text: 'I started coming a little closer to your hand.', evidence: ['a1'] }]);
});
