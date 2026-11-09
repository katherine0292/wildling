// Asking the kitten to make friends, cuddle, play-fight or hiss (ADR-017).
// Requests, not commands: the kitten's state and its bond with that sibling decide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Driver, mouseAt, cam } from './helpers.mjs';
import { classifyPose } from '../v2/core/pose.js';

const far = () => mouseAt(0.95, 0.1);
const fine = (d) => Object.assign(d.cat.needs, { fullness: 0.8, energy: 0.8, fun: 0.7, stress: 0.05 });

// A synthetic right hand, palm towards the camera: wrist low, fingers up.
function hand(shape) {
  const kp = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8 }));
  kp[0] = { x: 0.5, y: 0.8 };
  [[1, 0.42, 0.74], [2, 0.38, 0.7], [3, 0.36, 0.66], [4, 0.35, 0.62]].forEach(([i, x, y]) => { kp[i] = { x, y }; });
  const mcp = { 5: [0.44, 0.6], 9: [0.48, 0.58], 13: [0.52, 0.6], 17: [0.56, 0.62] };
  for (const [m, [x, y]] of Object.entries(mcp)) {
    const i = Number(m), f = shape[[5, 9, 13, 17].indexOf(i)];
    kp[i] = { x, y };
    if (f === 'up') { kp[i + 1] = { x, y: y - 0.07 }; kp[i + 2] = { x, y: y - 0.12 }; kp[i + 3] = { x, y: y - 0.16 }; }
    if (f === 'fold') { kp[i + 1] = { x, y: y - 0.05 }; kp[i + 2] = { x, y: y - 0.02 }; kp[i + 3] = { x, y: y + 0.05 }; }
    if (f === 'bent') { kp[i + 1] = { x, y: y - 0.07 }; kp[i + 2] = { x: x + 0.035, y: y - 0.07 }; kp[i + 3] = { x: x + 0.055, y: y - 0.05 }; }
  }
  return kp;
}
const SHAPES = {
  open_palm: ['up', 'up', 'up', 'up'], fist: ['fold', 'fold', 'fold', 'fold'],
  claw: ['bent', 'bent', 'bent', 'bent'], peace: ['up', 'up', 'fold', 'fold'],
};

test('the hand-shape rule baseline tells the four shapes apart and rejects a mix', () => {
  for (const [label, shape] of Object.entries(SHAPES)) assert.equal(classifyPose(hand(shape)).label, label, label);
  assert.equal(classifyPose(hand(['up', 'fold', 'bent', 'up'])).label, 'unknown');
  assert.equal(classifyPose([]).label, 'unknown');
});

test('make friends: the kitten walks over, touches noses, and the bond grows', () => {
  const d = new Driver();
  d.startMouse();
  const before = d.cat.bond('juniper');
  d.cmd('social_request', { kitten: 'juniper', act: 'befriend' });
  const got = d.until(() => d.events('sibling_befriend').length > 0, 20, () => { fine(d); return far(); });
  assert.ok(got >= 0, 'befriended');
  assert.ok(d.cat.bond('juniper') > before);
  assert.ok(d.events('growth_burst').some((b) => b.measurement.cause === 'SOCIAL'));
});

test('cuddling needs a bond first: a stranger is declined with a reason', () => {
  const d = new Driver();
  d.startMouse();
  fine(d);
  d.cat.bonds.saffron = 0.1;
  d.cmd('social_request', { kitten: 'saffron', act: 'cuddle' });
  d.run(1, () => { fine(d); return far(); });
  const r = d.events('refusal').find((e) => e.measurement.request === 'SOCIAL');
  assert.equal(r?.reasonCode, 'NOT_CLOSE_YET');

  d.cat.bonds.saffron = 0.5;
  d.cat.social.cooldownUntil = 0;
  d.cmd('social_request', { kitten: 'saffron', act: 'cuddle' });
  const got = d.until(() => d.events('sibling_cuddle').length > 0, 25, () => { fine(d); return far(); });
  assert.ok(got >= 0, 'cuddled once close enough');
});

test('it will not hiss at a close friend; otherwise a standoff sends the sibling off', () => {
  const d = new Driver();
  d.startMouse();
  d.cat.bonds.juniper = 0.8;
  d.cmd('social_request', { kitten: 'juniper', act: 'hiss' });
  d.run(1, () => { fine(d); return far(); });
  assert.equal(d.events('refusal').find((e) => e.measurement.request === 'SOCIAL')?.reasonCode, 'FRIENDS');

  const e = new Driver();
  e.startMouse();
  const trust = e.cat.needs.trust;
  e.cmd('social_request', { kitten: 'saffron', act: 'hiss' });
  const got = e.until(() => e.events('hiss').some((h) => h.reasonCode === 'SIB_STANDOFF'), 25, () => { fine(e); return far(); });
  assert.ok(got >= 0, 'stood off');
  assert.ok(e.cat.bond('saffron') < 0.25);
  assert.ok(e.sim.siblings.find((s) => s.kitten.id === 'saffron').held?.flee, 'the sibling backs away');
  assert.ok(e.cat.needs.trust >= trust - 1e-9, 'no cost to the visitor');
});

test('a held fist over a sibling, with the Siblings tool, asks for a play-fight', () => {
  const d = new Driver();
  d.startCamera();
  d.cmd('select_tool', { tool: 'LITTER' });
  const sib = d.sim.siblings.find((s) => s.kitten.id === 'juniper');
  const at = () => ({ x: sib.x / d.sim.world.w, y: sib.y / d.sim.world.h });
  d.run(1.2, () => { fine(d); return cam(at().x, at().y, { keypoints: hand(SHAPES.fist) }); });
  assert.equal(d.sim.life.invite?.act ?? d.cat.social.act, 'fight');
  assert.equal(d.sim.snapshot().pose.source, 'rule_baseline');
});

test('an unclear hand shape asks for nothing', () => {
  const d = new Driver();
  d.startCamera();
  d.cmd('select_tool', { tool: 'LITTER' });
  const sib = d.sim.siblings[0];
  d.run(2, () => cam(sib.x / d.sim.world.w, sib.y / d.sim.world.h, { keypoints: hand(['up', 'fold', 'bent', 'up']) }));
  assert.equal(d.sim.life.invite, null);
});

// ---- robustness for real cameras (ADR-022)
import { PoseSmoother, poseScores } from '../v2/core/pose.js';

const rot = (kp, a, s = 1, dx = 0, dy = 0) => kp.map((p) => ({ x: 0.5 + ((p.x - 0.5) * Math.cos(a) - (p.y - 0.8) * Math.sin(a)) * s + dx, y: 0.8 + ((p.x - 0.5) * Math.sin(a) + (p.y - 0.8) * Math.cos(a)) * s + dy }));
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const jitter = (kp, j) => kp.map((p) => ({ x: p.x + rnd() * j, y: p.y + rnd() * j }));

test('hand shapes survive rotation, scale and position', () => {
  for (const [label, shape] of Object.entries(SHAPES)) {
    for (const a of [-0.7, -0.3, 0.3, 0.7]) for (const s of [0.6, 1.4]) {
      assert.equal(classifyPose(rot(hand(shape), a, s, 0.1, -0.1)).label, label, `${label} at ${a} rad, ×${s}`);
    }
  }
});

test('smoothing over frames holds the right shape through camera jitter', () => {
  for (const [label, shape] of Object.entries(SHAPES)) {
    const sm = new PoseSmoother({ alpha: 0.35, min: 0.55, margin: 0.15 });
    let hits = 0;
    for (let i = 0; i < 30; i++) { const r = sm.update(jitter(hand(shape), 0.03)); if (i >= 8 && r.label === label) hits++; }
    assert.ok(hits >= 20, `${label}: ${hits} / 22 frames after settling`);
  }
});

test('with 3D keypoints a claw curled toward the camera is still a claw', () => {
  // seen from the front the fingers look short and straight; depth shows the bend
  const kp2 = hand(['bent', 'bent', 'bent', 'bent']).map((p) => ({ ...p }));
  const kp3 = Array.from({ length: 21 }, (_, i) => ({ x: kp2[i].x, y: kp2[i].y, z: 0 }));
  for (const m of [5, 9, 13, 17]) {
    const b = kp3[m];
    kp3[m + 1] = { x: b.x, y: b.y - 0.07, z: 0 };
    kp3[m + 2] = { x: b.x, y: b.y - 0.09, z: -0.05 };
    kp3[m + 3] = { x: b.x, y: b.y - 0.07, z: -0.08 };
  }
  const s = poseScores(kp2, kp3);
  assert.ok(s.claw > s.fist && s.claw > s.open_palm, JSON.stringify(s));
});
