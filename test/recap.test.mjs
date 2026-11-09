// PRD V2 F2-15: the recap may only say what the session's events can prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from '../v2/core/recap.js';

const e = (id, type, measurement = {}, validity = 'valid', t = 1) => ({ id, type, validity, simulationTime: t, measurement });

test('no events → the neutral quiet-moment line, with no invented care', () => {
  const r = buildRecap([]);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0].text, /quiet moment/);
});

test('one contact is "a gentle hello", never "always patient"', () => {
  const r = buildRecap([e('c1', 'contact_ended', { duration: 2 })]);
  const text = r.lines.map((l) => l.text).join(' ');
  assert.match(text, /gentle way to say hello/);
  assert.doesNotMatch(text, /seconds of quiet contact/);
});

test('no pounces → no play sentence, even with lots of other care', () => {
  const log = [e('f1', 'eat_completed'), e('f2', 'eat_completed'), e('c1', 'contact_ended', { duration: 3 }), e('c2', 'contact_ended', { duration: 3 })];
  const r = buildRecap(log);
  assert.ok(!r.lines.some((l) => /played/.test(l.text)));
});

test('every sentence cites real event ids and there are at most three', () => {
  const log = [
    e('s1', 'space_respected'), e('c1', 'contact_ended', { duration: 3 }), e('c2', 'contact_ended', { duration: 4 }),
    e('a1', 'rhythm_adapted'), e('p1', 'pounce_success'), e('p2', 'pounce_success'), e('f1', 'eat_completed'),
  ];
  const ids = new Set(log.map((x) => x.id));
  const r = buildRecap(log);
  assert.equal(r.lines.length, 3);
  for (const l of r.lines) { assert.ok(l.evidence.length > 0); for (const id of l.evidence) assert.ok(ids.has(id)); }
});

test('interrupted contacts are not counted as shared contact', () => {
  const r = buildRecap([e('c1', 'contact_ended', { duration: 5 }, 'interrupted')]);
  assert.match(r.lines[0].text, /quiet moment/);
});
