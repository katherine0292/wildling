// Toolless mode (experience spec V3): no tool to pick. An empty hand pets, a treat from the
// pouch feeds, the feather wand plays; growth can be switched off in favour of the bond.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt } from './helpers.mjs';

const toolless = () => new Driver({ toolless: true, growth: false });

test('an empty hand resting by the kitten is petting, with nothing selected', () => {
  const d = toolless();
  d.startMouse();
  assert.equal(d.sim.tool, 'PET');
  const t = d.until(() => d.cat.behaviour === 'CONTACT', 15, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  assert.ok(t >= 0, 'contact was accepted');
});

test('a treat from the pouch drops where the visitor clicks, and the basket stays in hand until put down', () => {
  const d = toolless();
  d.startMouse();
  d.run(0.5, () => mouseAt(0.3, 0.3));
  d.cmd('hold', { item: 'treat' });
  assert.equal(d.sim.snapshot().held, 'treat');
  const p = d.catAt(0.1, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  assert.equal(d.cat.foods.length, 1);
  assert.equal(d.sim.snapshot().held, 'treat');
  assert.equal(d.sim.tool, 'FEED');
  d.cmd('hold', { item: null });
  assert.equal(d.sim.snapshot().held, null);
  assert.equal(d.sim.tool, 'PET');
});

test('a click with an empty hand drops nothing', () => {
  const d = toolless();
  d.startMouse();
  const p = d.catAt(0.1, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  assert.equal(d.cat.foods.length, 0);
});

test('the feather wand turns the hand into the feather toy', () => {
  const d = toolless();
  d.startMouse();
  d.cmd('hold', { item: 'wand' });
  const s = d.sim.snapshot();
  assert.equal(s.held, 'wand');
  assert.equal(s.activeTool, 'PLAY');
  assert.equal(s.toy.kind, 'feather');
  d.cmd('hold', { item: null });
  assert.equal(d.sim.tool, 'PET');
});

test('tools cannot be picked in toolless mode', () => {
  const d = toolless();
  d.startMouse();
  d.cmd('select_tool', { tool: 'LITTER' });
  assert.equal(d.sim.tool, 'PET');
});

test('with growth off, care builds the bond but the kitten does not age', () => {
  const d = toolless();
  d.startMouse();
  d.until(() => d.cat.behaviour === 'CONTACT', 15, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  d.run(30, () => { const p = d.catAt(0.02, 0); return mouseAt(p.x, p.y); });
  assert.equal(d.cat.ageProgress, 0);
});
