import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputTrack } from '../v2/core/input.js';
import { IntentClassifier } from '../v2/core/intent.js';

const world = { w: 1, h: 1 };
const cat = { x: 0.5, y: 0.5, bodyRadius: 0.1, contactRadius: 0.18 };
const cameraSample = (t, receivedAt, seq, extra = {}) => ({
  t, receivedAt, seq, source: 'camera', present: true,
  x: 0.5, y: 0.5, handScale: 0.15, open: 1, keypointCount: 21, ...extra,
});

// The worker starts the next capture after returning its previous result. Keep both
// clocks so the gesture window sees real capture intervals and tracking sees arrivals.
function settledCamera(inferenceMs) {
  const track = new InputTrack(world);
  const classifier = new IntentClassifier();
  let seq = 0, capturedAt = 0, receivedAt = 0, result;
  for (; capturedAt <= 2400; capturedAt += inferenceMs) {
    receivedAt = capturedAt + inferenceMs;
    track.ingest(cameraSample(capturedAt, receivedAt, ++seq));
    track.update(receivedAt);
    result = classifier.classify(track, cat, receivedAt);
  }
  return { track, classifier, result, receivedAt, nextCaptureAt: capturedAt, seq };
}

for (const inferenceMs of [200, 250, 300]) {
  test(`a steady camera hand remains contact with ${inferenceMs} ms inference delay`, () => {
    const { track, result } = settledCamera(inferenceMs);
    assert.equal(track.quality, 'valid');
    assert.equal(result.label, 'stable_contact');
    assert.ok(result.coverage >= 0.8, `window coverage was ${result.coverage}`);
  });
}

test('camera movement speed follows capture time when inference latency varies', () => {
  const immediate = new InputTrack(world);
  const delayed = new InputTrack(world);
  const captures = [0, 200, 400, 600];
  const arrivals = [200, 450, 600, 900];
  for (let i = 0; i < captures.length; i++) {
    const t = captures[i], x = 0.2 + 0.2 * t / 1000;
    immediate.ingest(cameraSample(t, t, i + 1, { x }));
    immediate.update(t);
    delayed.ingest(cameraSample(t, arrivals[i], i + 1, { x }));
    delayed.update(arrivals[i]);
  }
  assert.ok(delayed.speed > 0.1, 'moving hands must retain nonzero speed');
  assert.ok(Math.abs(delayed.speed - immediate.speed) < 1e-9,
    `capture speed ${immediate.speed} changed to ${delayed.speed} with delayed arrivals`);
});

test('a stalled camera cannot keep its last contact intent', () => {
  const { track, classifier, receivedAt } = settledCamera(250);
  track.update(receivedAt + 351);
  assert.equal(track.quality, 'uncertain');
  assert.equal(classifier.classify(track, cat, receivedAt + 351).label, 'unknown');
  track.update(receivedAt + 501);
  assert.equal(track.quality, 'lost');
  assert.equal(classifier.classify(track, cat, receivedAt + 501).label, 'lost');
});

test('an empty camera frame clears contact despite a usable captured window', () => {
  const { track, classifier, receivedAt, nextCaptureAt, seq } = settledCamera(250);
  const now = receivedAt + 250;
  track.ingest(cameraSample(nextCaptureAt, now, seq + 1, { present: false }));
  track.update(now);
  assert.equal(track.quality, 'lost');
  assert.equal(classifier.classify(track, cat, now).label, 'lost');
});
