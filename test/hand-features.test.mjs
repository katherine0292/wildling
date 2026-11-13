// Hand features read from the tracker's landmarks must not depend on how the hand is turned:
// a stroking hand faces down, and a pinch is a pinch from any angle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handFeatures } from '../v2/browser/camera.js';
import { Driver, cam } from './helpers.mjs';

// A simple 3D hand: wrist at the origin, palm towards +y, each finger as four joints.
// curl 0 = straight, 1 = folded into the palm. `turn` rotates the hand about the x axis,
// pointing the fingers at the camera as when stroking.
function hand({ curl = 0, thumbTo = null, turn = 0 } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const bases = [-0.03, -0.01, 0.01, 0.03];
  [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach((f, i) => {
    let x = bases[i], y = 0.085, z = 0, a = 0;
    pts[f[0]] = { x, y, z };
    for (let j = 1; j < 4; j++) {
      a += curl * 1.3;
      y += 0.025 * Math.cos(a); z -= 0.025 * Math.sin(a);
      pts[f[j]] = { x, y, z };
    }
  });
  pts[1] = { x: -0.03, y: 0.02, z: 0 }; pts[2] = { x: -0.05, y: 0.04, z: 0 }; pts[3] = { x: -0.06, y: 0.06, z: 0 };
  pts[4] = thumbTo ? { ...pts[thumbTo] , x: pts[thumbTo].x - 0.012 } : { x: -0.07, y: 0.08, z: 0 };
  const c = Math.cos(turn), s = Math.sin(turn);
  return pts.map((p) => ({ x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }));
}

test('an open hand reads as open even when its fingers point at the camera', () => {
  for (const turn of [0, 1.1]) assert.ok(handFeatures(hand({ turn }), hand({ turn })).open > 0.8, `turn ${turn}`);
  assert.ok(handFeatures(hand({ curl: 1 }), hand({ curl: 1 })).open < 0.2, 'a fist is not open');
});

test('touching fingertips pinch from any angle, and a fist never does', () => {
  for (const turn of [0, 1.1]) {
    const w = hand({ curl: 0.35, thumbTo: 8, turn });
    assert.ok(handFeatures(w, w).pinchRatio < 0.33, `turn ${turn}`);
  }
  const open = hand();
  assert.ok(handFeatures(open, open).pinchRatio > 0.5, 'an open hand releases');
  const fist = hand({ curl: 1, thumbTo: 8 });
  assert.equal(handFeatures(fist, fist).pinchRatio, 1);
});

test('a brisk stroke with a relaxed hand is accepted as contact', () => {
  const d = new Driver({ toolless: true, growth: false });
  d.startCamera();
  const at = (sec) => { const p = d.catAt(0.07 * Math.sin(2 * Math.PI * sec), 0); return cam(p.x, p.y, { open: 0.35 }); };
  d.run(2, (s) => { const p = d.catAt(0.25 * (1 - s / 2), 0); return cam(p.x, p.y, { open: 0.35 }); });
  assert.ok(d.until(() => d.cat.behaviour === 'CONTACT', 10, at) >= 0, 'stroking along its back is contact');
});

test('waving the hand beside the kittens scares them off, and the others scatter too', () => {
  const d = new Driver({ toolless: true, growth: false });
  d.startCamera();
  const c0 = d.catAt(0, 0);
  d.run(1.5, () => cam(c0.x, c0.y - 0.3));
  // swat side to side just above the kitten, about 2 S/s
  const wave = (sec) => { const p = d.catAt(0.12 * Math.sin(2 * Math.PI * 2.5 * sec), -0.12); return cam(p.x, p.y); };
  assert.ok(d.until(() => d.events('startle').length > 0, 4, wave) >= 0, 'the kitten startles');
  assert.ok(d.until(() => d.cat.behaviour === 'RETREAT', 2, wave) >= 0, 'and backs away');
  assert.ok(d.sim.snapshot().litter.some((k) => k.fleeing), 'a sibling nearby runs from the hand');
});

test('stroking never counts as waving', () => {
  const d = new Driver({ toolless: true, growth: false });
  d.startCamera();
  d.run(2, (s) => { const p = d.catAt(0.25 * (1 - s / 2), 0); return cam(p.x, p.y); });
  d.run(8, (sec) => { const p = d.catAt(0.07 * Math.sin(2 * Math.PI * sec), 0); return cam(p.x, p.y, { open: 0.5 }); });
  assert.equal(d.events('startle').length, 0);
});

test('a palm resting on the kitten\'s back is stroking at once, without waiting to be invited', () => {
  const d = new Driver({ toolless: true, growth: false });
  d.startCamera();
  d.run(1, () => cam(0.9, 0.2));
  d.cat.needs.trust = 0.1; d.cat.needs.stress = 0.45; // wary: it would not come to a hand by itself
  const onBack = () => { const p = d.catAt(0.01, 0); return cam(p.x, p.y, { open: 0.4 }); };
  const t = d.until(() => d.cat.behaviour === 'CONTACT', 3, onBack);
  assert.ok(t >= 0 && t < 1.5, `contact after ${t}s`);
  assert.ok(d.events('contact_started').length >= 1);
});
