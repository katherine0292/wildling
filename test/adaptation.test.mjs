// PRD V2 §15.3: the same fixed replay run with adaptation on and off.
// Same seed, same inputs — any difference must come from the preference summary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';
import { RelationshipMemory } from '../v2/core/memory.js';

function playSession(adaptation) {
  const d = new Driver({ adaptation, seed: 11 });
  d.startMouse();
  d.cat.needs.fun = 0.2;
  d.cmd('select_tool', { tool: 'PLAY' });
  // a steady rhythm: the yarn hops onto the cat every ~1.6 s, then away again
  d.run(40, (s) => {
    const phase = (s % 1.6) / 1.6;
    const p = phase < 0.5 ? d.catAt(0.01, 0) : d.catAt(0.3, 0.05);
    return mouseAt(p.x, p.y);
  });
  return d;
}

test('§15.3: adaptation_off keeps defaults; adaptation_on moves play tempo within bounds', () => {
  const off = playSession(false);
  const on = playSession(true);
  assert.ok(off.cat.stats.pounces >= 4, `enough play to learn from (got ${off.cat.stats.pounces})`);
  assert.equal(off.sim.memory.prefs.playTempoScale, 1);
  const tempo = on.sim.memory.prefs.playTempoScale;
  assert.ok(on.sim.memory.updates.playTempoScale >= 1, 'on: at least one update');
  assert.ok(tempo >= 0.85 && tempo <= 1.15, `bounded, got ${tempo}`);
  assert.notEqual(tempo, 1);
});

test('§15.2: preferences never move before three valid samples, and never in one jump', () => {
  const m = new RelationshipMemory();
  const ev = (i, interval) => ({ id: `e${i}`, type: 'pounce_success', validity: 'valid', simulationTime: i * 20, measurement: { interval } });
  assert.deepEqual(m.record(ev(1, 0.5)), []);
  assert.deepEqual(m.record(ev(2, 0.5)), []);
  assert.equal(m.prefs.playTempoScale, 1);
  const out = m.record(ev(3, 0.5)); // target clamps to 1.15; one step is 0.8·1 + 0.2·1.15
  assert.equal(out.length, 1);
  assert.ok(Math.abs(m.prefs.playTempoScale - 1.03) < 1e-9);
});

test('§15.2: interrupted or unconfirmed events are never learning samples', () => {
  const m = new RelationshipMemory();
  for (let i = 0; i < 5; i++) {
    m.record({ id: `c${i}`, type: 'contact_ended', validity: 'interrupted', simulationTime: i * 20, measurement: { duration: 3, jitter: 0 } });
  }
  assert.equal(m.samples.contactDwell.length, 0);
  m.record({ id: 'x', type: 'contact_ended', validity: 'valid', simulationTime: 200, measurement: { duration: 3, jitter: 0 } }, { accepting: false });
  assert.equal(m.samples.contactDwell.length, 0);
});

test('§15.1: memory keeps at most 20 events and is read-only during reflection', () => {
  const m = new RelationshipMemory();
  for (let i = 0; i < 30; i++) m.record({ id: `e${i}`, type: 'eat_completed', validity: 'valid', simulationTime: i });
  assert.equal(m.events.length, 20);
  m.freeze();
  m.record({ id: 'late', type: 'eat_completed', validity: 'valid', simulationTime: 99 });
  assert.equal(m.events.at(-1).id, 'e29');
});
