// The need cycle (experience spec V3, Act 2): one need at a time, answered by the matching
// act, lapsing quietly when nobody answers, and never touching the kitten's own state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeedCycle } from '../v2/core/needs.js';
import { Driver, mouseAt } from './helpers.mjs';

const cat = (needs, acceptedContact = false) => ({ needs: { fullness: 0.6, energy: 0.8, fun: 0.6, trust: 0.4, stress: 0.1, ...needs }, acceptedContact });

test('the most pressing need wins: rest before food before play', () => {
  const n = new NeedCycle();
  assert.equal(n.wants(cat({ energy: 0.2, fullness: 0.2, fun: 0.2 }).needs, 100), 'rest');
  assert.equal(n.wants(cat({ fullness: 0.2, fun: 0.2 }).needs, 100), 'food');
  assert.equal(n.wants(cat({ fun: 0.2 }).needs, 100), 'play');
});

test('a calm, trusting kitten asks for touch only after a while without it', () => {
  const n = new NeedCycle();
  n.lastContactAt = 90;
  assert.equal(n.wants(cat({}).needs, 100), null);
  assert.equal(n.wants(cat({}).needs, 120), 'touch');
  assert.equal(n.wants(cat({ trust: 0.1 }).needs, 120), null, 'not before it trusts the visitor');
});

test('one need at a time, met by the matching act, with the time it took', () => {
  const n = new NeedCycle();
  assert.deepEqual(n.step(cat({ fullness: 0.2 }), [], 10, 0.1), [{ type: 'need_started', kind: 'food' }]);
  assert.deepEqual(n.step(cat({ fullness: 0.2, fun: 0.1 }), [{ type: 'pounce_success' }], 12, 0.1), [], 'a catch does not answer hunger');
  const [met] = n.step(cat({ fullness: 0.45 }), [{ type: 'eat_completed' }], 15, 0.1);
  assert.equal(met.type, 'need_met');
  assert.equal(met.kind, 'food');
  assert.equal(met.sec, 5);
});

test('a short gap follows each episode, and an unanswered need lapses without blame', () => {
  const n = new NeedCycle();
  n.step(cat({ fun: 0.1 }), [], 0, 0.1);
  assert.equal(n.step(cat({ fun: 0.1 }), [], 39, 0.1).length, 0);
  const [lapsed] = n.step(cat({ fun: 0.1 }), [], 40, 0.1);
  assert.equal(lapsed.type, 'need_lapsed');
  assert.equal(n.step(cat({ fun: 0.1 }), [], 42, 0.1).length, 0, 'still in the gap');
  assert.equal(n.step(cat({ fun: 0.1 }), [], 47, 0.1)[0].kind, 'play');
});

test('the hint appears only after the kitten has asked with its body for a while', () => {
  const n = new NeedCycle();
  n.step(cat({ fun: 0.1 }), [], 0, 0.1);
  assert.equal(n.view(5).hint, false);
  assert.equal(n.view(8).hint, true);
});

test('in a visit, a hungry kitten asks for food and a treat answers it', () => {
  const d = new Driver({ toolless: true, growth: false });
  d.startMouse();
  d.cat.needs.fullness = 0.2;
  d.run(0.5, () => mouseAt(0.15, 0.2));
  assert.equal(d.sim.snapshot().need?.kind, 'food');
  d.cmd('hold', { item: 'treat' });
  const p = d.catAt(0.08, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  const t = d.until(() => d.sim.log.some((e) => e.type === 'need_met' && e.kind === 'food'), 15, () => mouseAt(0.15, 0.2));
  assert.ok(t >= 0, 'the meal answered the need');
  assert.equal(d.sim.snapshot().need, null);
});
