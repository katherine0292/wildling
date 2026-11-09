// The litter: three kittens, one chosen. Temperament may only change starting values;
// the siblings are ambient and can never be cared for, remembered or punished.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';
import { KITTENS, PARAMS } from '../v2/core/config.js';

test('the attract screen shows the whole litter, roaming on its own', () => {
  const d = new Driver();
  d.run(5);
  const snap = d.sim.snapshot();
  assert.equal(snap.litter.length + 1, KITTENS.length);
  assert.equal(snap.kitten.id, 'ember');
});

test('choosing a kitten sets only its starting values', () => {
  const d = new Driver();
  d.cmd('choose_kitten', { kitten: 'juniper' });
  d.startMouse();
  assert.equal(d.cat.kitten.id, 'juniper');
  assert.equal(d.cat.needs.trust, 0.18);
  assert.equal(d.cat.needs.stress, 0.22);
  assert.equal(d.cat.needs.fullness, PARAMS.creature.fullness);
});

test('the kitten cannot be changed once a session is active', () => {
  const d = new Driver();
  d.startMouse();
  d.cmd('choose_kitten', { kitten: 'saffron' });
  assert.equal(d.cat.kitten.id, 'ember');
  assert.equal(d.sim.kittenId, 'ember');
});

test('siblings never react to the hand and never enter the session log', () => {
  const d = new Driver();
  d.startMouse();
  const sib = d.sim.siblings[0];
  const before = { ...sib.needs };
  d.cmd('select_tool', { tool: 'PET' });
  d.run(6, () => { const w = d.sim.world; return mouseAt(sib.x / w.w, sib.y / w.h); });
  assert.notEqual(sib.behaviour, 'CONTACT');
  assert.equal(sib.needs.trust, before.trust);
  assert.ok(d.sim.log.every((e) => e.sessionId === d.sim.session.sessionId));
  assert.equal(d.sim.snapshot().litter.length, 2);
});

test('rules are identical for every kitten: a tired shy or playful kitten still rests', () => {
  for (const k of KITTENS) {
    const d = new Driver();
    d.cmd('choose_kitten', { kitten: k.id });
    d.startMouse();
    d.cat.needs.energy = 0.1;
    d.cmd('select_tool', { tool: 'PLAY' });
    d.run(2, (s) => { const p = d.catAt(0.1 * Math.cos(s * 4), 0.1 * Math.sin(s * 4)); return mouseAt(p.x, p.y); });
    assert.equal(d.cat.behaviour, 'REST', k.id);
  }
});
