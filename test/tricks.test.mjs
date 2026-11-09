// Teach a trick (ADR-019) and passers-by (ADR-020).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';
import { TrickLearner, features } from '../v2/core/tricks.js';

// A move as a list of points: a circle or a left-right zigzag, anywhere and any size.
const circle = (cx, cy, r, n = 30) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i / (n - 1)) * Math.PI * 2), y: cy + r * Math.sin((i / (n - 1)) * Math.PI * 2) }));
const zigzag = (cx, cy, r, n = 30) => Array.from({ length: n }, (_, i) => ({ x: cx - r + (2 * r * i) / (n - 1), y: cy + (Math.floor(i / 5) % 2 ? r : -r) * 0.5 + ((i % 5) / 5) * r * (Math.floor(i / 5) % 2 ? -1 : 1) }));

test('three examples are enough: circles and zigzags are told apart at any size or place', () => {
  const L = new TrickLearner({ examples: 3, reject: 0.32 });
  L.begin('spin');
  for (const s of [0.1, 0.12, 0.09]) L.addExample(circle(0.5, 0.5, s));
  L.begin('wave');
  for (const s of [0.1, 0.13, 0.11]) L.addExample(zigzag(0.4, 0.6, s));
  assert.deepEqual(L.learned.sort(), ['spin', 'wave']);
  assert.equal(L.classify(circle(1.2, 0.3, 0.2)).trick, 'spin');
  assert.equal(L.classify(zigzag(0.9, 0.2, 0.05)).trick, 'wave');
  // a straight line matches neither
  assert.equal(L.classify(Array.from({ length: 20 }, (_, i) => ({ x: 0, y: i * 0.01 }))).trick, 'unknown', 'a straight up-down line matches neither');
});

test('consistency is high for alike examples and low for different ones', () => {
  const L = new TrickLearner();
  assert.ok(L.consistency([features(circle(0, 0, 1)), features(circle(5, 5, 2))]) > 0.9);
  assert.ok(L.consistency([features(circle(0, 0, 1)), features(zigzag(0, 0, 1))]) < 0.5);
});

// drive a mouse move through the real segmenter: pause, move along `pts` at speed, settle
function perform(d, pts) {
  const w = d.sim.world;
  d.run(0.4, () => mouseAt(pts[0].x / w.w, pts[0].y / w.h));
  for (const p of pts) d.tick(mouseAt(p.x / w.w, p.y / w.h));
  d.run(0.5, () => mouseAt(pts[pts.length - 1].x / w.w, pts[pts.length - 1].y / w.h));
}

test('teaching in the page: three moves, learned, then the move asks for the trick', () => {
  const d = new Driver();
  d.startMouse();
  const fine = () => Object.assign(d.cat.needs, { fullness: 0.8, energy: 0.9, fun: 0.6, stress: 0.05 });
  fine();
  d.cmd('teach_start', { trick: 'spin' });
  for (let k = 0; k < 3; k++) { fine(); perform(d, circle(0.9, 0.4, 0.15, 40)); }
  const learned = d.events('trick_learned');
  assert.equal(learned.length, 1);
  assert.equal(learned[0].measurement.model, 'knn_1');
  d.run(3, () => { fine(); return mouseAt(0.5, 0.4); });
  const before = d.events('trick_done').length;
  assert.ok(before >= 1, 'tries it once right after learning');
  perform(d, circle(0.6, 0.3, 0.1, 40));
  d.run(2.5, () => { fine(); return mouseAt(0.5, 0.4); });
  assert.ok(d.events('trick_done').length > before, 'performs on cue');
  assert.ok(d.events('growth_burst').some((b) => b.measurement.cause === 'TRICK'));
});

test('a tired kitten declines a trick with a reason, and learned tricks are forgotten at turnover', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('teach_start', { trick: 'wave' });
  for (let k = 0; k < 3; k++) perform(d, zigzag(0.9, 0.4, 0.15, 40));
  d.cat.needs.energy = 0.1;
  d.cat.pendingTrick = 'wave';
  d.run(0.2);
  assert.ok(d.events('refusal').some((e) => e.measurement.request === 'TRICK' && e.reasonCode === 'NEED_REST'));
  d.cmd('end'); d.cmd('next');
  assert.deepEqual(d.sim.learner.learned, []);
});

test('in exhibition attract mode the litter looks at a passer-by and one trots over', () => {
  const d = new Driver();
  d.run(1);
  d.cmd('presence', { people: [{ x: 0.85, size: 0.3 }] });
  d.run(3, () => null);
  d.cmd('presence', { people: [{ x: 0.85, size: 0.3 }] });
  const snap = d.sim.snapshot();
  assert.ok(snap.creature.lookAt || snap.litter.some((l) => l.lookAt), 'they look');
  assert.ok(d.sim.litter.some((c) => c.goal?.id === 'passer_by'), 'one walks over');
  d.run(5);
  assert.ok(d.sim.litter.every((c) => c.goal?.id !== 'passer_by'), 'and lets it go when nobody is there');
});
