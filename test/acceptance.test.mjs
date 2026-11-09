// PRD V2 §23 acceptance cases that can be verified by replay, without a camera.
// Cases that need real hardware (AT13 display, AT16 offline package, AT18 4-hour run)
// are listed as "not verified" in docs/STATUS.md instead of being faked here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, cam, mouseAt } from './helpers.mjs';

test('AT01: mouse only — care, refusal-free feeding, reflection and reset without any camera step', () => {
  const d = new Driver();
  d.startMouse();
  assert.equal(d.state, 'ACTIVE');
  const p = d.catAt(0.15, 0);
  d.cmd('confirm', { x: p.x, y: p.y });
  d.run(6, () => mouseAt(0.9, 0.15 + Math.random() * 0.01));
  assert.equal(d.cat.stats.fed, 1);
  d.cmd('end');
  assert.equal(d.state, 'REFLECTION');
  assert.ok(d.sim.recap.lines.length >= 1);
  d.cmd('next');
  assert.equal(d.state, 'ATTRACT');
  assert.equal(d.sim.cat, null);
});

test('AT02: occlusion during contact stops the timer, costs no trust and causes no startle on return', () => {
  const d = new Driver();
  d.startCamera();
  const took = d.petUntilContact((p) => cam(p.x, p.y));
  assert.ok(took >= 0, 'contact should be accepted');
  d.run(1, () => cam(d.catAt(0.02).x, d.catAt(0.02).y));
  const trustBefore = d.cat.needs.trust;
  const startles = d.cat.stats.startles;
  const where = d.catAt(0.02);
  d.run(1, () => ({ source: 'camera', present: false }));   // hand hidden for 1 s
  assert.notEqual(d.cat.behaviour, 'CONTACT');
  assert.ok(d.cat.needs.trust >= trustBefore - 1e-9, 'trust must not drop');
  const ended = d.events('contact_ended').at(-1);
  assert.equal(ended.measurement.cause, 'tracking');
  assert.equal(ended.validity, 'interrupted');
  d.run(2, () => cam(where.x, where.y));                     // hand comes back in place
  assert.equal(d.cat.stats.startles, startles, 'no high-speed startle after recovery');
});

test('AT03: a fast wave far away is neutral; a fast approach close by raises stress', () => {
  const d = new Driver();
  d.startCamera();
  const c0 = d.catAt();
  const farX = c0.x > 0.5 ? 0.08 : 0.92;
  d.run(4, (s) => cam(farX, 0.15 + 0.12 * Math.sin(s * 9)));
  assert.equal(d.cat.stats.startles, 0, 'far movement is not a threat');

  const stress0 = d.cat.needs.stress;
  const start = d.catAt(-0.45, 0);
  d.run(0.6, () => cam(start.x, start.y));
  let k = 0;
  // 0.45 S in 0.25 s ≈ 1.8 S/s, above the 1.1 S/s fast-approach reference
  d.run(1.2, () => { k++; const t = Math.min(1, k / 15); const c = d.catAt(); return cam(start.x + (c.x - start.x) * t, start.y + (c.y - start.y) * t); });
  assert.ok(d.cat.stats.startles >= 1, 'close fast approach startles');
  assert.ok(d.cat.needs.stress > stress0);
});

test('AT04: holding a pinch for 5 s drops one fish; a repeated command id drops none', () => {
  const d = new Driver();
  d.startCamera();
  const p = d.catAt(0.25, 0);
  d.run(5, () => cam(p.x, p.y, { pinchRatio: 0.1 }));
  assert.equal(d.cat.foods.length + d.cat.stats.fed, 1);
  const r1 = d.sim.command({ id: 'same', type: 'confirm', x: 0.3, y: 0.3 });
  d.run(1);
  const r2 = d.sim.command({ id: 'same', type: 'confirm', x: 0.3, y: 0.3 });
  assert.equal(r2.duplicate, true);
  assert.ok(!r1.duplicate);
  assert.equal(d.cat.foods.length + d.cat.stats.fed, 2);
});

test('AT05: when full, repeated feeding gives TOO_FULL, no fullness reward and no trust loss', () => {
  const d = new Driver();
  d.startMouse();
  d.cat.needs.fullness = 0.9;
  const trust = d.cat.needs.trust;
  for (let i = 0; i < 3; i++) { const p = d.catAt(0.2, 0); d.cmd('confirm', { x: p.x, y: p.y }); d.run(1, () => mouseAt(0.9, 0.2)); }
  d.run(3, () => mouseAt(0.9, 0.2));
  assert.equal(d.cat.stats.fed, 0);
  assert.ok(d.cat.needs.fullness <= 0.9);
  assert.ok(d.cat.needs.trust >= trust);
  assert.ok(d.events('refusal').some((e) => e.reasonCode === 'TOO_FULL'));
});

test('AT06: energy 0.10 with trust 0.90 still rests when asked to play', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { energy: 0.1, trust: 0.9 });
  d.cmd('select_tool', { tool: 'PLAY' });
  d.run(3, (s) => { const c = d.catAt(0.1 * Math.cos(s * 4), 0.1 * Math.sin(s * 4)); return mouseAt(c.x, c.y); });
  assert.equal(d.cat.behaviour, 'REST');
  assert.equal(d.cat.stats.pounces, 0);
  assert.ok(d.events('refusal').some((e) => e.reasonCode === 'NEED_REST'));
});

test('AT07: high stress refuses contact with a reason; stepping back recovers and contact is possible again', () => {
  const d = new Driver();
  d.startMouse();
  d.cat.needs.stress = 0.7;
  const took = d.petUntilContact(undefined, 2);
  assert.equal(took, -1, 'no contact while stressed');
  assert.ok(d.events('refusal').some((e) => e.reasonCode === 'PRESSURE_HIGH'));
  const t = d.cat.needs.trust;
  d.cmd('select_tool', { tool: 'WAIT' });
  d.until(() => d.cat.needs.stress < 0.4, 20, () => mouseAt(0.95, 0.1));
  assert.ok(d.cat.needs.stress < 0.4);
  assert.ok(d.cat.needs.trust >= t - 1e-9, 'refusal and waiting cost no trust');
  d.run(1.5, () => mouseAt(0.95, 0.1));
  assert.ok(d.events('space_respected').length === 1, 'one verifiable space_respected');
  assert.ok(d.petUntilContact() >= 0, 'contact possible again after recovery');
});

test('AT08: two valid contacts do not adapt; the third does, within bounds', () => {
  const d = new Driver();
  d.startMouse();
  const cycle = () => {
    assert.ok(d.petUntilContact() >= 0);
    const p = d.catAt(0.02);
    d.run(2.5, () => mouseAt(p.x, p.y));
    d.cmd('select_tool', { tool: 'WAIT' });
    d.run(2, () => mouseAt(0.95, 0.1));
  };
  cycle(); cycle();
  assert.equal(d.sim.memory.updates.contactDwell, 0);
  assert.equal(d.sim.memory.prefs.contactDwell, 0.8);
  cycle();
  const m = d.sim.memory;
  assert.equal(m.updates.contactDwell, 1);
  assert.ok(m.prefs.contactDwell < 0.8 && m.prefs.contactDwell >= 0.5, `bounded update, got ${m.prefs.contactDwell}`);
  assert.ok(d.events('rhythm_adapted').length >= 1);
});

test('AT09: unknown intent and pause do not create memory, trust or growth', () => {
  const d = new Driver();
  d.startCamera();
  d.cmd('select_tool', { tool: 'PET' });
  const trust = d.cat.needs.trust;
  // flickering tracking: present every other sample → coverage too low → unknown
  let i = 0;
  d.run(4, () => { i++; const p = d.catAt(0.02); return i % 3 === 0 ? cam(p.x, p.y) : { source: 'camera', present: false }; });
  assert.notEqual(d.cat.behaviour, 'CONTACT');
  assert.ok(d.cat.needs.trust <= trust + 1e-9);
  assert.equal(d.sim.memory.samples.contactDwell.length, 0);

  d.cmd('pause');
  const age = d.cat.ageProgress, t2 = d.cat.needs.trust, ev = d.sim.log.length;
  d.run(5, () => cam(d.catAt(0.02).x, d.catAt(0.02).y));
  assert.equal(d.cat.ageProgress, age);
  assert.equal(d.cat.needs.trust, t2);
  assert.equal(d.sim.log.length, ev);
});

test('AT10: one need at 0.10 blocks growth even when the average is high', () => {
  const d = new Driver();
  d.startMouse();
  Object.assign(d.cat.needs, { fullness: 0.1, energy: 0.95, fun: 0.95, stress: 0.1 });
  d.run(5, (s) => mouseAt(0.5 + 0.05 * Math.sin(s * 3), 0.2));
  assert.equal(d.cat.ageProgress, 0);
  assert.equal(d.cat.growthBlockedBy, 'fullness');

  const g = new Driver();
  g.startMouse();
  Object.assign(g.cat.needs, { fullness: 0.9, energy: 0.95, fun: 0.9, stress: 0.1 });
  g.run(5, (s) => mouseAt(0.5 + 0.05 * Math.sin(s * 3), 0.2));
  assert.ok(g.cat.ageProgress > 0, 'balanced care does grow');
});

test('AT12: the next session starts clean — new id, default trust and preferences, empty log', () => {
  const d = new Driver();
  d.startMouse();
  const first = d.sim.session.sessionId;
  d.petUntilContact();
  d.run(3, () => mouseAt(d.catAt(0.02).x, d.catAt(0.02).y));
  d.cmd('end');
  d.run(16);
  assert.equal(d.state, 'ATTRACT', 'reflection auto-clears after 15 s');
  d.startMouse();
  assert.notEqual(d.sim.session.sessionId, first);
  assert.equal(d.cat.needs.trust, 0.25);
  assert.deepEqual(d.sim.memory.prefs, { contactDwell: 0.8, playTempoScale: 1, approachRadius: 0.1 });
  assert.equal(d.sim.log.length, 0);
});

test('AT14: two minutes on the attract screen do not grow or warm up the visitor\'s cat', () => {
  const d = new Driver();
  d.run(120);
  d.startMouse();
  assert.equal(d.cat.ageProgress, 0);
  assert.equal(d.cat.needs.trust, 0.25);
  assert.equal(d.cat.needs.fullness, 0.55);
});

test('AT15: keyboard only — explicit hold-to-pet works without camera or pinch', () => {
  const d = new Driver();
  d.cmd('start');
  d.cmd('choose_input', { source: 'keyboard' });
  d.cmd('select_tool', { tool: 'PET' });
  const took = d.until(() => d.cat.behaviour === 'CONTACT', 12, () => { const p = d.catAt(0.02); return { source: 'keyboard', present: true, x: p.x, y: p.y, hold: true }; });
  assert.ok(took >= 0, 'keyboard contact accepted');
  assert.equal(d.sim.intent.score, null, 'keyboard never fakes a model score');
});

test('AT17: 300 s without finishing growth ends gently with a factual recap', () => {
  const d = new Driver();
  d.startMouse();
  d.run(301, (s) => mouseAt(0.85 + 0.05 * Math.sin(s), 0.15)); // present and moving, never caring
  assert.equal(d.state, 'REFLECTION');
  assert.equal(d.sim.session.endReason, 'time_limit');
  assert.ok(d.cat.ageProgress < 3);
  const text = d.sim.recap.lines.map((l) => l.text).join(' ');
  assert.doesNotMatch(text, /fed|played|contact/i, 'no invented care');
  for (const l of d.sim.recap.lines) assert.ok(Array.isArray(l.evidence));
});

test('§10 idle: 15 s shows "Still there?", 30 s pauses, 45 s ends', () => {
  const d = new Driver();
  d.startMouse();
  d.run(16);
  assert.equal(d.sim.snapshot().stillThere, true);
  d.run(15);
  assert.equal(d.state, 'PAUSED');
  assert.equal(d.sim.session.pauseReason, 'idle');
  d.run(15);
  assert.equal(d.state, 'REFLECTION');
});

test('§11.2: a long frame gap is a pause, not a giant dt that drains energy', () => {
  const d = new Driver();
  d.startMouse();
  const e = d.cat.needs.energy;
  d.t += 10000;
  d.sim.update(10, d.t); // 10 s gap in one call
  assert.ok(e - d.cat.needs.energy < 0.003, 'at most 5 fixed steps are processed');
});
