import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputTrack, PinchDetector } from '../v2/core/input.js';

const world = { w: 16 / 9, h: 1 };
const cam = (t, x, y, extra = {}) => ({ t, source: 'camera', present: true, x, y, handScale: 0.15, open: 1, keypointCount: 21, ...extra });

test('F2-04 / AT04: a pinch held for 5 s confirms exactly once', () => {
  const p = new PinchDetector();
  let fired = 0;
  for (let t = 0; t <= 5000; t += 33) if (p.update(0.1, true, t)) fired++;
  assert.equal(fired, 1);
});

test('F2-04: a new pinch needs a release past the open threshold', () => {
  const p = new PinchDetector();
  let fired = 0;
  let t = 0;
  const hold = (ratio, ms) => { for (const end = t + ms; t < end; t += 33) if (p.update(ratio, true, t)) fired++; };
  hold(0.1, 300);   // pinch → 1
  hold(0.35, 300);  // inside the hysteresis band: still latched
  hold(0.1, 300);   // no new confirm
  assert.equal(fired, 1);
  hold(0.6, 300);   // opened
  hold(0.1, 300);   // pinch again → 2
  assert.equal(fired, 2);
});

test('F2-04: a pinch shorter than 100 ms or during lost tracking does not confirm', () => {
  const p = new PinchDetector();
  assert.equal(p.update(0.1, true, 0), false);
  assert.equal(p.update(0.1, true, 60), false);
  assert.equal(p.update(0.1, false, 120), false); // tracking lost cancels the pending pinch
  assert.equal(p.update(0.1, true, 150), false);  // restarted, needs another 100 ms
  assert.equal(p.update(0.1, true, 260), true);
});

test('F2-03: a teleport is rejected as a tracking error, not read as speed', () => {
  const tr = new InputTrack(world);
  let t = 0;
  for (; t < 500; t += 33) { tr.ingest(cam(t, 0.2, 0.5)); tr.update(t); }
  assert.equal(tr.quality, 'valid');
  tr.ingest(cam(t, 0.8, 0.5)); tr.update(t); // 1 S jump in one frame
  assert.equal(tr.quality, 'uncertain');
  assert.ok(tr.speed < 0.5, `speed should not spike, got ${tr.speed}`);
  assert.ok(tr.rejects >= 1);
});

test('F2-03: after losing the hand, the first sample starts at speed 0 and must stabilise', () => {
  const tr = new InputTrack(world);
  let t = 0;
  for (; t < 400; t += 33) { tr.ingest(cam(t, 0.3, 0.5)); tr.update(t); }
  t += 900; // hand gone for 0.9 s
  tr.update(t);
  assert.equal(tr.quality, 'lost');
  tr.ingest(cam(t, 0.6, 0.5)); tr.update(t);
  assert.equal(tr.speed, 0);
  assert.equal(tr.quality, 'uncertain');
  for (let k = 0; k < 12; k++) { t += 33; tr.ingest(cam(t, 0.6, 0.5)); tr.update(t); }
  assert.equal(tr.quality, 'valid');
});

test('F2-03: keypoints outside the usable hand scale are invalid', () => {
  const tr = new InputTrack(world);
  for (let t = 0; t < 600; t += 33) { tr.ingest(cam(t, 0.5, 0.5, { handScale: 0.01 })); tr.update(t); }
  assert.notEqual(tr.quality, 'valid');
});

test('F2-02: stale or replayed packets (non-increasing seq) are rejected', () => {
  const tr = new InputTrack(world);
  tr.ingest({ ...cam(0, 0.5, 0.5), seq: 5 });
  tr.ingest({ ...cam(33, 0.9, 0.5), seq: 4 });
  assert.equal(tr.rejects, 1);
});
