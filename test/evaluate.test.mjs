import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, checkSplit } from '../tools/evaluate.mjs';

test('unknown lowers recall instead of hiding errors', () => {
  const rows = [
    { label: 'stable_contact', predicted: 'stable_contact' },
    { label: 'stable_contact', predicted: 'unknown' },
  ];
  const e = evaluate(rows);
  assert.equal(e.perClass.stable_contact.precision, 1);
  assert.equal(e.perClass.stable_contact.recall, 0.5);
  assert.equal(e.coverage, 0.5);
});

test('confusion matrix and macro F1 on the synthetic fixture', () => {
  const rows = JSON.parse(readFileSync(new URL('../tools/fixtures/synthetic-predictions.json', import.meta.url)))
    .filter((r) => r.source === 'model');
  const e = evaluate(rows);
  assert.equal(e.total, 15);
  assert.equal(e.matrix.gentle_approach.stable_contact, 1);
  assert.equal(e.matrix.stable_contact.unknown, 1);
  assert.ok(e.macroF1 > 0.8 && e.macroF1 < 1);
});

test('participant leakage between train and test is detected', () => {
  assert.deepEqual(checkSplit([{ participant: 'P01' }, { participant: 'P02' }], [{ participant: 'P02' }, { participant: 'P14' }]), ['P02']);
  assert.deepEqual(checkSplit([{ participant: 'P01' }], [{ participant: 'P14' }]), []);
});
