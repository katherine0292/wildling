#!/usr/bin/env node
// Gesture-model evaluation (PRD V2 §12.5, docs/research/data-plan.md).
//
//   node tools/evaluate.mjs predictions.json            → report
//   node tools/evaluate.mjs predictions.json --json     → machine-readable report
//   node tools/evaluate.mjs --check-split train.json test.json
//
// predictions.json: [{ "participant": "P11", "label": "stable_contact", "predicted": "unknown", "source": "model|rule_baseline" }, ...]
//
// Rules from the PRD:
//   • `unknown` counts as a miss for the true class (it lowers recall), so a model
//     cannot look precise by refusing everything — coverage is reported next to F1.
//   • rule_baseline rows are reported separately and never mixed into ML metrics.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LABELS = ['gentle_approach', 'stable_contact', 'fast_approach', 'neutral_motion'];

export function evaluate(rows) {
  const cols = [...LABELS, 'unknown'];
  const matrix = Object.fromEntries(LABELS.map((t) => [t, Object.fromEntries(cols.map((p) => [p, 0]))]));
  for (const r of rows) {
    if (!LABELS.includes(r.label)) continue;
    const p = cols.includes(r.predicted) ? r.predicted : 'unknown';
    matrix[r.label][p]++;
  }
  const perClass = {};
  for (const c of LABELS) {
    const tp = matrix[c][c];
    const support = cols.reduce((s, p) => s + matrix[c][p], 0);
    const predicted = LABELS.reduce((s, t) => s + matrix[t][c], 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[c] = { precision, recall, f1, support };
  }
  const total = LABELS.reduce((s, c) => s + perClass[c].support, 0);
  const unknown = LABELS.reduce((s, c) => s + matrix[c].unknown, 0);
  const macroF1 = LABELS.reduce((s, c) => s + perClass[c].f1, 0) / LABELS.length;
  return { macroF1, coverage: total ? 1 - unknown / total : 0, unknownRate: total ? unknown / total : 0, total, perClass, matrix };
}

export function byParticipant(rows) {
  const groups = {};
  for (const r of rows) (groups[r.participant] ??= []).push(r);
  return Object.fromEntries(Object.entries(groups).map(([p, rs]) => [p, evaluate(rs).macroF1]));
}

export function checkSplit(train, testRows) {
  const a = new Set(train.map((r) => r.participant));
  return [...new Set(testRows.map((r) => r.participant))].filter((p) => a.has(p));
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function report(rows) {
  const sources = [...new Set(rows.map((r) => r.source ?? 'unknown'))];
  for (const src of sources) {
    const rs = rows.filter((r) => (r.source ?? 'unknown') === src);
    const e = evaluate(rs);
    console.log(`\n=== source: ${src}${src === 'rule_baseline' ? '  (rule fallback — NOT an ML metric)' : ''} ===`);
    console.log(`windows ${e.total} · macro F1 ${e.macroF1.toFixed(3)} · coverage ${pct(e.coverage)} · unknown ${pct(e.unknownRate)}`);
    console.log('\nclass             precision  recall   F1     support');
    for (const c of LABELS) {
      const k = e.perClass[c];
      console.log(`${c.padEnd(17)} ${k.precision.toFixed(3).padStart(9)} ${k.recall.toFixed(3).padStart(7)} ${k.f1.toFixed(3).padStart(6)} ${String(k.support).padStart(8)}`);
    }
    console.log('\nconfusion (rows = true, cols = predicted)');
    const cols = [...LABELS, 'unknown'];
    console.log(''.padEnd(17) + cols.map((c) => c.slice(0, 8).padStart(9)).join(''));
    for (const t of LABELS) console.log(t.padEnd(17) + cols.map((p) => String(e.matrix[t][p]).padStart(9)).join(''));
    console.log('\nmacro F1 by participant');
    for (const [p, f] of Object.entries(byParticipant(rs))) console.log(`  ${p}: ${f.toFixed(3)}`);
  }
  console.log('\nNot covered here (report separately): false contacts per minute, end-to-end latency p95, low-light results.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
  if (args[0] === '--check-split') {
    const overlap = checkSplit(load(args[1]), load(args[2]));
    if (overlap.length) { console.error(`Participant leakage between splits: ${overlap.join(', ')}`); process.exit(1); }
    console.log('OK: no participant appears in both files.');
  } else if (args[0]) {
    const rows = load(args[0]);
    if (/synthetic/i.test(args[0])) console.log('!! SYNTHETIC FIXTURE — for testing this script only. These numbers are not results.');
    if (args.includes('--json')) console.log(JSON.stringify(evaluate(rows), null, 2));
    else report(rows);
  } else {
    console.log('usage: node tools/evaluate.mjs predictions.json [--json] | --check-split train.json test.json');
  }
}
