// The journal (experience spec V3): what the kitten learned about the visitor, each line
// citing real events. The asleep ending itself is covered in hand-interaction.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnedAbout } from '../v2/core/learned.js';
import { Driver, mouseAt } from './helpers.mjs';

const toolless = () => new Driver({ toolless: true, growth: false, timed: false });
const ev = (type, t, extra = {}) => ({ id: `${type}_${t}`, type, simulationTime: t, validity: 'valid', ...extra });

test('when the kitten falls asleep beside the hand, the journal also says what it learned', () => {
  const d = toolless();
  d.startMouse();
  d.until(() => d.cat.behaviour === 'CONTACT', 15, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  d.run(4, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  Object.assign(d.cat.needs, { trust: 0.8, energy: 0.05, stress: 0.05 });
  Object.assign(d.cat, { behaviour: 'REST', restMinUntil: d.sim.simTime + 9, nextDecision: d.sim.simTime + 9 });
  d.run(6, () => { const p = d.catAt(0.09); return mouseAt(p.x, p.y); });
  assert.equal(d.sim.session.endReason, 'asleep');
  const learned = d.sim.snapshot().recap.learned;
  assert.ok(learned.length >= 1, 'at least one line about the visitor');
  for (const l of learned) assert.ok(l.evidence.every((id) => d.sim.log.some((e) => e.id === id)), 'every line cites real events');
});

test('learned lines: faster reading, a gentle hand, and the favourite act, each citing events', () => {
  const log = [
    ev('contact_started', 5), ev('contact_ended', 9, { measurement: { duration: 4 } }),
    ev('need_started', 20, { kind: 'food' }), ev('need_met', 34, { kind: 'food', measurement: { kind: 'food', sec: 14 } }),
    ev('contact_ended', 60, { measurement: { duration: 20 } }),
    ev('need_started', 80, { kind: 'play' }), ev('need_met', 85, { kind: 'play', measurement: { kind: 'play', sec: 5 } }),
  ];
  const lines = learnedAbout(log);
  assert.equal(lines[0].text, 'You read it faster by the end.');
  assert.match(lines[0].detail, /14 s .* 5 s/);
  assert.equal(lines[1].text, 'Your hand never startled it.');
  assert.equal(lines[2].text, 'You like to stroke it.');
  for (const l of lines) assert.ok(l.evidence.length && l.evidence.every((id) => log.some((e) => e.id === id)));
});

test('learned lines: startles that stopped become "you learned to slow down"', () => {
  const log = [ev('startle', 10), ev('startle', 20), ev('contact_started', 40), ev('contact_ended', 80, { measurement: { duration: 3 } })];
  const lines = learnedAbout(log);
  assert.equal(lines[0].text, 'You learned to slow down.');
  assert.match(lines[0].detail, /2 startles early on, none after 0:20/);
});

test('learned lines: nothing is claimed from an empty visit', () => {
  assert.deepEqual(learnedAbout([]), []);
});
