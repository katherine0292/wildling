// BrowserRenderer: draws one state snapshot. It only READS the snapshot;
// nothing here may change needs, trust or memory.
//
// Look: three hand-painted, top-down habitats (a sunlit forest clearing, a snowfield
// ringed by pines, a desert of wind ripples and low-poly rock), each built from three
// layers: a ground painted once per size, a live middle layer (footprints, critters,
// gifts, the litter, feedback), and a swaying foreground (canopy, pines or rock) that
// sits above the kittens for depth. A light camera follows the chosen kitten and pushes
// in when it grows up; colour grading, light shafts, a vignette and film grain finish it.
//
// Feedback rule (docs/design/experience-spec.md): system uncertainty shows on the
// cursor; the creature's own choices show on the creature's body.

import { KITTENS } from '../core/config.js';
import { CatBody, drawGift } from './catbody.js';
import { path2d } from './icons.js';

const INK = [34, 64, 90];
const SAGE = [169, 201, 155];
const CREAM = [251, 243, 227];
const COLD = [43, 102, 136];
const KIT = Object.fromEntries(KITTENS.map((k) => [k.id, k]));
// Prototype A's hand: bone chains, palm outline, and an open right hand as the mirrored
// webcam sees it (world units around the palm).
const HAND_FINGERS = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20]];
const HAND_PALM = [0, 1, 5, 9, 13, 17];
const HAND_TEMPLATE = [
  [4, 62], [-22, 50], [-42, 32], [-56, 14], [-68, -2],
  [-22, -8], [-27, -38], [-29, -56], [-31, -72],
  [-2, -12], [-2, -46], [-2, -66], [-2, -84],
  [17, -8], [20, -40], [22, -58], [24, -73],
  [32, 2], [39, -22], [43, -36], [46, -50],
];
function smoothClosed(pts) {
  const p = new Path2D(), n = pts.length, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) { const a = pts[i], m = mid(a, pts[(i + 1) % n]); p.quadraticCurveTo(a.x, a.y, m.x, m.y); }
  p.closePath();
  return p;
}
const TAU = Math.PI * 2;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Seeded random so a habitat looks the same every time it is painted.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export class Renderer {
  constructor(p) {
    this.p = p;
    this.biomes = {};
    this.shownPhase = 'kitten';
    this.prevPhase = null;
    this.fade = 1;
    this.bodies = new Map();
    this.particles = [];
    this.prints = [];
    this.sparks = [];
    this.bursts = [];
    this.cam = { x: 0, y: 0, z: 1.03 };
    this.celebrateUntil = 0;
    this.hudTarget = { x: 160, y: 120 };
  }

  resize() {
    const p = this.p;
    this.W = p.width; this.H = p.height;
    this.S = Math.min(this.W, this.H);
    this.u = this.S / 900;
    this.dpr = p.pixelDensity();
    this.grain = this.makeGrain();
    // paint the habitat on screen now and the other two shortly after, off the first frame
    const makers = { kitten: () => this.makeForest(), juvenile: () => this.makeSnow(), adult: () => this.makeDesert() };
    const gen = (this.gen = (this.gen ?? 0) + 1);
    this.biomes = {};
    this.biome = (ph) => (this.biomes[ph] ??= makers[ph]());
    this.biome(this.shownPhase);
    for (const [i, ph] of ['kitten', 'juvenile', 'adult'].entries()) setTimeout(() => { if (gen === this.gen) this.biome(ph); }, 1200 + i * 900);
    this.particles = Array.from({ length: 80 }, () => ({ x: Math.random() * this.W, y: Math.random() * this.H, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 10 }));
    this.prints = [];
    this.cam = { x: this.W / 2, y: this.H / 2, z: 1.03 };
    for (const b of this.bodies.values()) b.setUnit(this.u);
  }

  // ---------------------------------------------------------------- camera
  // World pixels (what the core's normalised coordinates map to) ↔ screen pixels.
  toScreen(x, y) { const c = this.cam; return { x: (x - c.x) * c.z + this.W / 2, y: (y - c.y) * c.z + this.H / 2 }; }
  toWorld(x, y) { const c = this.cam; return { x: (x - this.W / 2) / c.z + c.x, y: (y - this.H / 2) / c.z + c.y }; }
  // normalised screen → normalised world, for pointer and camera-hand input
  screenToWorldN(nx, ny) { const w = this.toWorld(nx * this.W, ny * this.H); return { x: w.x / this.W, y: w.y / this.H }; }
  worldNToScreen(n) { return this.toScreen(n.x * this.W, n.y * this.H); }

  updateCamera(snap, dt) {
    const c = snap.creature, st = snap.sessionState;
    const now = performance.now() / 1000;
    const celebrating = now < this.celebrateUntil;
    let z = st === 'ACTIVE' ? 1.06 : 1.03, tx = this.W / 2, ty = this.H / 2;
    if (st === 'ACTIVE' || celebrating) {
      const cx = c.position.x * this.W, cy = c.position.y * this.H;
      tx += (cx - this.W / 2) * 0.35; ty += (cy - this.H / 2) * 0.35;
      if (celebrating) { z = 1.22; tx = cx; ty = cy; }
    }
    // never show past the painted edge
    const hw = this.W / (2 * z), hh = this.H / (2 * z);
    tx = Math.max(hw, Math.min(this.W - hw, tx)); ty = Math.max(hh, Math.min(this.H - hh, ty));
    if (REDUCED) { this.cam = { x: this.W / 2, y: this.H / 2, z: 1 }; return; }
    const k = Math.min(1, dt * (celebrating ? 2.2 : 1.1));
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; this.cam.z += (z - this.cam.z) * k;
  }

  px(n) { return { x: n.x * this.W, y: n.y * this.H }; }

  // Semantic events the page forwards: growth sparkles, chapter celebrations.
  onEvent(e, snap) {
    if (!snap) return;
    const at = this.px(snap.creature.position);
    if (e.type === 'growth_burst') {
      for (let i = 0; i < 9; i++) this.sparks.push({ x: at.x, y: at.y - 20 * this.u, vx: (Math.random() - 0.5) * 260 * this.u, vy: -(120 + Math.random() * 160) * this.u, t: 0, d: 1.1 + Math.random() * 0.4, home: i < 5 });
    }
    if (e.type === 'phase_changed' || e.type === 'fully_grown') {
      this.celebrateUntil = performance.now() / 1000 + 3.6;
      this.bursts.push({ x: at.x, y: at.y, t: 0, kind: e.type === 'fully_grown' ? 'grown' : snap.creature.phase });
    }
    if (e.type === 'hunt_pounce' && e.measurement?.caught) this.bursts.push({ x: at.x, y: at.y, t: 0, kind: 'catch' });
  }

  // ---------------------------------------------------------------- frame
  draw(snap, ui, dt) {
    const p = this.p, ctx = p.drawingContext;
    const c = snap.creature;
    if (c.phase !== this.shownPhase) { this.prevPhase = this.shownPhase; this.shownPhase = c.phase; this.fade = 0; this.prints = []; }
    this.fade = Math.min(1, this.fade + dt / 1.6);
    this.updateCamera(snap, dt);
    const t = performance.now() / 1000;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#20301c'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.translate(this.W / 2, this.H / 2); ctx.scale(this.cam.z, this.cam.z); ctx.translate(-this.cam.x, -this.cam.y);

    this.layer(ctx, 'ground');
    this.footprints(ctx, dt);
    for (const f of snap.foods) this.fish(ctx, this.px(f.position ?? f), Math.min(1, f.age / 0.3), f.age > 27 ? (30 - f.age) / 3 : 1);

    const st = snap.sessionState;
    const interactive = st === 'ACTIVE';
    const hand = snap.input.position && snap.input.quality !== 'lost' ? this.px(snap.input.position) : null;
    const main = this.px(c.position);

    if (st === 'ATTRACT' || st === 'CONSENT') this.groundMark(ctx, main, 1, t);
    else if (interactive && snap.toolless) this.comfortRing(ctx, main, snap, dt, t);
    else if (interactive) this.groundMark(ctx, main, 0.45, t);
    if (interactive && !snap.toolless && snap.activeTool === 'PET' && c.inviting && !c.acceptedContact) this.inviteZone(ctx, main, t);
    if (interactive && !snap.toolless && snap.activeTool === 'PLAY') for (const s of snap.litter) if (!s.wrestling && !s.fleeing) this.inviteRing(ctx, this.px(s.position), t, s.invited);

    if (snap.toy?.kind === 'ball' && snap.toy.position && interactive) { const b = this.px(snap.toy.position); this.drawBall(ctx, b.x, b.y, t); }
    const seen = new Set();
    const partner = snap.litter.find((s) => s.mode);
    const pp = partner ? this.px(partner.position) : null;
    if (c.socialMode === 'wrestle' && pp) this.dustBehind(ctx, main, pp, t);
    if (c.socialMode === 'cuddle' && pp) this.warmGlow(ctx, main, pp, t);
    for (const s of snap.litter) {
      seen.add(s.kitten);
      const reaction = s.standoff ? (s.kitten === 'saffron' ? 'hiss' : 'cower') : s.fleeing ? 'cower' : null;
      this.body(ctx, s.kitten, s, s.lookAt ? this.px(s.lookAt) : null, dt, 1, { wrestling: s.wrestling, socialMode: s.mode === 'wrestle' ? null : s.mode, reaction });
    }
    let look = ['OBSERVE', 'APPROACH', 'CONTACT', 'PLAY', 'GIFT'].includes(c.behaviour) ? hand : null;
    // a hungry kitten keeps glancing at the pouch: the body asks before any pictogram does
    if (interactive && snap.need?.kind === 'food' && this.pouchAt && !c.acceptedContact && Math.sin(t * 1.3) > -0.2) look = this.toWorld(this.pouchAt.x, this.pouchAt.y);
    seen.add(c.kitten);
    this.body(ctx, c.kitten, c, look ?? (c.lookAt ? this.px(c.lookAt) : null), dt, 1, { wrestling: c.wrestling, socialMode: c.socialMode, reaction: c.reaction?.type, carrying: c.carrying, trick: c.trick?.name });
    if (c.trick) this.trickSparkle(ctx, main, t, c.trick);
    if (interactive && snap.activeTool === 'TRICK') this.moveTrail(ctx, snap, hand, dt);
    for (const k of [...this.bodies.keys()]) if (!seen.has(k)) this.bodies.delete(k);

    for (const g of snap.gifts ?? []) this.giftOnGround(ctx, this.px(g.position), g.age, g.item, t);
    if (snap.critter) this.critter(ctx, snap.critter, t);
    if (c.behaviour === 'REST' && !c.reaction) this.sleepZ(ctx, main, t);
    if (c.acceptedContact) { this.purr(ctx, main, t); this.hearts(ctx, main, t); }
    this.strokeTrail(ctx, snap, hand, main, dt);
    if (c.socialMode === 'wrestle' && pp) this.scuffle(ctx, main, pp, t, dt);
    if (c.socialMode === 'greet' && pp) this.noseHearts(ctx, main, pp, t);
    if (c.socialMode === 'cuddle' && pp) this.cuddleHeart(ctx, main, pp, t);
    if (c.socialMode === 'standoff' && pp) this.standoff(ctx, main, pp, t);
    if (c.reaction?.type === 'hiss') this.hissMarks(ctx, main, c.heading, t);
    this.atmosphere(ctx, dt, t);
    if (interactive && snap.activeTool === 'PLAY' && snap.toy?.kind === 'feather' && snap.toy.position && hand) this.feather(ctx, hand, this.px(snap.toy.position), t);
    if (interactive || st === 'CALIBRATING') {
      // the real tracked hand, as a see-through ghost hand (Prototype A)
      const kp = snap.input.source === 'camera' && ui?.keypoints && snap.input.quality !== 'lost' ? ui.keypoints.map((q) => this.px(this.screenToWorldN(q.x, q.y))) : null;
      const handTool = snap.activeTool === 'PET' || snap.activeTool === 'LITTER' || (snap.toolless && hand);
      if (interactive && this.demo === 'approach' && hand) this.demoHand(ctx, hand, main, snap, t);
      if (kp) this.handCursor(ctx, snap, kp, t);
      else if (handTool && hand) this.handCursor(ctx, snap, this.templateHand(hand, snap, t), t);
      else this.cursor(ctx, snap, ui, t);
      if (snap.held === 'treat' && hand) { // the treat sits in the palm
        ctx.save(); ctx.translate(hand.x, hand.y + 6 * this.u); ctx.scale(1.7, 1.7); ctx.rotate(-0.5);
        this.fish(ctx, { x: 0, y: 0 }, 1, 1); ctx.restore();
      }
    }
    this.burstFx(ctx, dt);
    ctx.restore();

    // screen-space layers: foreground with parallax, light, grade, grain, sparkles
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.foreground(ctx, t);
    this.lighting(ctx, main, st, t);
    this.sparkFx(ctx, dt);
    this.filmGrain(ctx);
    ctx.restore();
  }

  // Cross-fades the outgoing habitat while a new chapter arrives.
  layer(ctx, which) {
    const cur = this.biome(this.shownPhase)[which];
    if (this.prevPhase && this.fade < 1) {
      ctx.drawImage(this.biome(this.prevPhase)[which], 0, 0, this.W, this.H);
      ctx.globalAlpha = this.fade; ctx.drawImage(cur, 0, 0, this.W, this.H); ctx.globalAlpha = 1;
    } else ctx.drawImage(cur, 0, 0, this.W, this.H);
  }

  body(ctx, kid, s, look, dt, alpha, extra) {
    const pos = this.px(s.position);
    let b = this.bodies.get(kid);
    if (!b) { b = new CatBody(KIT[kid], this.u, pos.x, pos.y, s.heading); this.bodies.set(kid, b); }
    const lead = b.bodyLen * 0.42;
    b.update(dt, {
      x: pos.x + Math.cos(s.heading) * lead, y: pos.y + Math.sin(s.heading) * lead,
      heading: s.heading, speed: s.speed * this.S, behaviour: s.behaviour, age: s.ageProgress, look, ...extra,
    });
    if (this.shownPhase !== 'kitten') for (const q of b.planted) this.prints.push({ ...q, t: 0, s: b.size });
    b.planted.length = 0;
    b.draw(ctx, alpha);
  }

  // ---------------------------------------------------------------- feedback layers
  groundMark(ctx, { x, y }, alpha, t) {
    const u = this.u, r = 0.12 * this.S;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(255,250,230,${0.14 * alpha})`;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * alpha})`;
    ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
    ctx.setLineDash([2 * u, 10 * u]); ctx.lineDashOffset = -t * 8;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // The comfort ring (experience spec V3): how much room the kitten wants, drawn on the
  // ground. Tension and a fast hand widen it; trust and a calm hand shrink it. When the
  // kitten is ready for a hand it warms and closes in around it.
  comfortRing(ctx, at, snap, dt, t) {
    const c = snap.creature, n = c.needs ?? { stress: 0.2, trust: 0.3 };
    const fast = snap.intent?.label === 'fast_approach' || c.behaviour === 'RETREAT';
    const want = Math.max(0, Math.min(1, 0.65 * n.stress + 0.55 * (1 - n.trust) + (fast ? 0.45 : 0) - (c.inviting ? 0.35 : 0)));
    const target = this.S * (0.075 + 0.14 * want);
    const before = this.ringR ?? target;
    this.ringR = this.ringR ? this.ringR + (target - this.ringR) * Math.min(1, dt * (fast ? 6 : 1.6)) : target;
    this.ringTrend = (this.ringTrend ?? 0) * 0.9 + ((this.ringR - before) / Math.max(dt, 1e-3) / this.S) * 0.1;
    const u = this.u, r = this.ringR, warm = c.inviting;
    if (this.mindView) { // the same judgement, shown plainly: a solid ring, and a line to the hand
      ctx.save();
      ctx.translate(at.x, at.y + 6 * u);
      ctx.strokeStyle = 'rgba(243,206,135,0.95)'; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.84, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(243,206,135,0.4)'; ctx.lineWidth = 1.5 * u; ctx.setLineDash([6 * u, 6 * u]);
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(r * 1.45, this.S * 0.2), Math.max(r * 1.45, this.S * 0.2) * 0.84, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      const h = snap.input.position && snap.input.quality !== 'lost' ? this.px(snap.input.position) : null;
      if (h) {
        ctx.save(); ctx.strokeStyle = 'rgba(159,214,230,0.85)'; ctx.lineWidth = 1.6 * u; ctx.setLineDash([4 * u, 5 * u]);
        ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.restore();
      }
      return;
    }
    if (c.acceptedContact) return;
    ctx.save();
    ctx.translate(at.x, at.y + 6 * u);
    ctx.fillStyle = warm ? 'rgba(255,214,140,0.16)' : 'rgba(255,250,232,0.08)';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.84, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = warm ? 'rgba(255,226,160,0.95)' : fast ? 'rgba(255,236,226,0.9)' : 'rgba(255,250,235,0.7)';
    ctx.lineWidth = (warm ? 3 : 2.4) * u; ctx.lineCap = 'round';
    ctx.setLineDash(warm ? [10 * u, 8 * u] : [2 * u, 9 * u]); ctx.lineDashOffset = -t * (warm ? 14 : 6);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.84, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // Act 1's demonstration: a see-through hand travels from the visitor's hand to the edge of
  // the comfort ring and stops there, along a dotted path. It loops until the kitten comes.
  demoHand(ctx, from, cat, snap, t) {
    const u = this.u, dx = from.x - cat.x, dy = from.y - cat.y, d = Math.hypot(dx, dy) || 1;
    const r = (this.ringR ?? this.S * 0.12) * 1.08;
    if (d < r * 1.35) return; // already close: nothing to show
    const to = { x: cat.x + (dx / d) * r, y: cat.y + (dy / d) * r * 0.9 };
    const mid = { x: (from.x + to.x) / 2 - dy * 0.12, y: (from.y + to.y) / 2 + dx * 0.12 };
    const loop = 3.6, k = (t % loop) / loop, move = Math.min(1, k / 0.6), e = 1 - Math.pow(1 - move, 3);
    const q = (a) => ({ x: (1 - a) * (1 - a) * from.x + 2 * (1 - a) * a * mid.x + a * a * to.x, y: (1 - a) * (1 - a) * from.y + 2 * (1 - a) * a * mid.y + a * a * to.y });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,252,240,0.8)'; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round';
    ctx.setLineDash([1, 10 * u]); ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(mid.x, mid.y, to.x, to.y); ctx.stroke();
    ctx.setLineDash([]);
    // where to stop: a small mark on the ring
    ctx.fillStyle = 'rgba(255,252,240,0.9)';
    ctx.beginPath(); ctx.arc(to.x, to.y, 4 * u, 0, TAU); ctx.fill();
    const p = q(e), fade = k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 1;
    const pts = HAND_TEMPLATE.map(([x, y]) => ({ x: p.x + x * u * 0.95, y: p.y + y * u * 0.95 }));
    ctx.restore();
    // drawn opaque into its own layer, then composited once, so overlaps never double up
    const L = this.demoLayer ??= document.createElement('canvas');
    if (L.width !== ctx.canvas.width || L.height !== ctx.canvas.height) { L.width = ctx.canvas.width; L.height = ctx.canvas.height; }
    const g = L.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.width, L.height);
    g.setTransform(ctx.getTransform());
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff';
    this.traceHand(g, pts);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.45 * fade; ctx.drawImage(L, 0, 0); ctx.restore();
  }

  // Where contact is welcome: a breathing ring with words in the UI (never colour alone).
  inviteZone(ctx, { x, y }, t) {
    const u = this.u, r = 0.11 * this.S * (1 + 0.03 * Math.sin(t * 2.4));
    ctx.fillStyle = `rgba(${SAGE},0.22)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5 * u; ctx.lineCap = 'round';
    ctx.setLineDash([12 * u, 10 * u]); ctx.lineDashOffset = -t * 16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }

  // With the Play tool, siblings show a soft ring: click one to invite it over.
  inviteRing(ctx, { x, y }, t, invited) {
    const u = this.u, r = 0.085 * this.S;
    ctx.save();
    ctx.strokeStyle = invited ? 'rgba(255,217,138,0.95)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5 * u; ctx.setLineDash([3 * u, 9 * u]); ctx.lineDashOffset = t * 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  hearts(ctx, { x, y }, t) {
    const u = this.u;
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.45 + k / 4) % 1;
      const hx = x + Math.sin(k * 2.1 + t) * 24 * u + (k - 1.5) * 18 * u, hy = y - 40 * u - ph * 70 * u, s = (7 + 3 * Math.sin(k)) * u;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      heart(ctx, hx, hy, s, '#e57f73', u);
    }
    ctx.globalAlpha = 1;
  }

  sleepZ(ctx, { x, y }, t) {
    const u = this.u;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = `rgba(${INK},0.9)`; ctx.lineWidth = 3 * u; ctx.lineJoin = 'round';
    ctx.font = `700 ${22 * u}px Fredoka, Nunito, sans-serif`;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.35 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.strokeText('z', x + 50 * u + ph * 26 * u, y - 50 * u - ph * 40 * u);
      ctx.fillText('z', x + 50 * u + ph * 26 * u, y - 50 * u - ph * 40 * u);
    }
    ctx.globalAlpha = 1;
  }

  // A cartoon scuffle: dust puffs ringing the pair, stars and tufts of fur flying.
  scuffle(ctx, a, b, t) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, R = 70 * u;
    ctx.save();
    const dust = this.shownPhase === 'juvenile' ? '255,255,255' : this.shownPhase === 'adult' ? '246,218,170' : '236,226,196';
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * TAU + t * 1.6, rr = R * (0.75 + 0.3 * Math.sin(t * 6 + i * 2.3));
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr * 0.72, s = (18 + 9 * Math.sin(t * 8 + i)) * u;
      const g = ctx.createRadialGradient(px - s * 0.3, py - s * 0.3, 0, px, py, s);
      g.addColorStop(0, `rgba(${dust},0.95)`); g.addColorStop(1, `rgba(${dust},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = `rgba(${INK},0.5)`; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) { // speed lines
      const ang = i * 1.05 + Math.floor(t * 6) * 0.7, r0 = R * 1.05, r1 = R * 1.35;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.75); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.75); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const ph = (t * 1.3 + i / 4) % 1, ang = i * 1.7 + 0.4;
      const sx = cx + Math.cos(ang) * (R + ph * 50 * u), sy = cy + Math.sin(ang) * (R * 0.7 + ph * 40 * u) - ph * 20 * u;
      ctx.globalAlpha = 1 - ph;
      star(ctx, sx, sy, 9 * u, '#ffd36a', u, t * 4 + i);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  hissMarks(ctx, { x, y }, heading, t) {
    const u = this.u;
    ctx.save();
    ctx.strokeStyle = 'rgba(214,82,70,0.9)'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const hx = x + Math.cos(heading) * 60 * u, hy = y + Math.sin(heading) * 60 * u;
    for (let k = -1; k <= 1; k++) {
      const a = heading + k * 0.5, j = Math.sin(t * 30 + k) * 2 * u;
      ctx.beginPath();
      for (let s = 0; s < 4; s++) {
        const d = (26 + s * 9) * u, off = (s % 2 ? 5 : -5) * u;
        const qx = hx + Math.cos(a) * d + Math.cos(a + Math.PI / 2) * off + j, qy = hy + Math.sin(a) * d + Math.sin(a + Math.PI / 2) * off;
        if (s === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  footprints(ctx, dt) {
    const life = this.shownPhase === 'juvenile' ? 12 : 7;
    const col = this.shownPhase === 'juvenile' ? '120,150,185' : '150,105,60';
    for (const q of this.prints) q.t += dt;
    this.prints = this.prints.filter((q) => q.t < life).slice(-140);
    const u = this.u;
    for (const q of this.prints) {
      const a = (1 - q.t / life) * 0.38, s = (q.front ? 5 : 5.6) * u * q.s * 1.3;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.fillStyle = `rgba(${col},${a})`;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.85, 0, 0, TAU); ctx.fill();
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(s * 1.25, k * s * 0.7, s * 0.38, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  critter(ctx, c, t) {
    const { x, y } = this.px(c.position), u = this.u;
    const flap = Math.sin(t * (c.kind === 'dragonfly' ? 40 : 16));
    const col = { butterfly: ['#ffb347', '#e0663a'], moth: ['#d8c6b0', '#8a7360'], dragonfly: ['#bff3ff', '#2aa7a0'] }[c.kind];
    ctx.save();
    ctx.fillStyle = 'rgba(20,40,20,0.15)';
    ctx.beginPath(); ctx.ellipse(x + 14 * u, y + 22 * u, 9 * u, 5 * u, 0, 0, TAU); ctx.fill();
    ctx.translate(x, y); ctx.rotate(c.heading + Math.PI / 2);
    ctx.strokeStyle = `rgba(${INK},0.7)`; ctx.lineWidth = 1.4 * u;
    if (c.kind === 'dragonfly') {
      ctx.fillStyle = 'rgba(220,250,255,0.65)';
      for (const sx of [-1, 1]) for (const yy of [-3, 3]) { ctx.beginPath(); ctx.ellipse(sx * 11 * u * (0.8 + 0.2 * flap), yy * u, 11 * u, 3 * u, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = col[1]; ctx.beginPath(); ctx.ellipse(0, 6 * u, 2.2 * u, 13 * u, 0, 0, TAU); ctx.fill();
    } else {
      const w = 0.35 + 0.65 * Math.abs(flap);
      for (const sx of [-1, 1]) {
        ctx.fillStyle = col[0];
        ctx.beginPath(); ctx.ellipse(sx * 8 * u * w, -3 * u, 8 * u * w, 7 * u, sx * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col[1];
        ctx.beginPath(); ctx.ellipse(sx * 6 * u * w, 6 * u, 5.5 * u * w, 5 * u, -sx * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = `rgb(${INK})`; ctx.beginPath(); ctx.ellipse(0, 0, 1.6 * u, 7 * u, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  giftOnGround(ctx, { x, y }, age, item, t) {
    const u = this.u, a = Math.min(1, age * 2);
    ctx.save();
    ctx.globalAlpha = a;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 30 * u);
    glow.addColorStop(0, 'rgba(255,240,170,0.55)'); glow.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 30 * u, 0, TAU); ctx.fill();
    drawGift(ctx, item, x, y, 15 * u, u);
    const tw = (Math.sin(t * 3 + x) + 1) / 2;
    star(ctx, x + 12 * u, y - 12 * u, 4 * u * tw + 1, '#fff', u, t);
    ctx.restore();
  }

  fish(ctx, { x, y }, land, alpha) {
    const s = this.u;
    ctx.save();
    ctx.translate(x, y - (1 - land) * 60 * s);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,40,20,0.18)';
    ctx.beginPath(); ctx.ellipse(5 * s, 8 * s, 19 * s, 7 * s, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(0, -8 * s, 0, 8 * s);
    g.addColorStop(0, '#cfe3ee'); g.addColorStop(0.5, '#8fb3c8'); g.addColorStop(1, '#5d7f95');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(18 * s, 0);
    ctx.quadraticCurveTo(4 * s, -10 * s, -12 * s, -2 * s);
    ctx.lineTo(-24 * s, -9 * s); ctx.lineTo(-21 * s, 0); ctx.lineTo(-24 * s, 9 * s); ctx.lineTo(-12 * s, 2 * s);
    ctx.quadraticCurveTo(4 * s, 10 * s, 18 * s, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,60,0.5)'; ctx.lineWidth = 1 * s; ctx.stroke();
    ctx.fillStyle = '#1b2228'; ctx.beginPath(); ctx.arc(10 * s, -2 * s, 1.8 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- hands and petting
  // A stand-in open hand for mouse and keyboard: Prototype A's hand template, in the same
  // 21-point layout as HandPose, tilting with movement and wiggling while it strokes.
  templateHand(at, snap, t) {
    const u = this.u, s = u * 1.05, moving = (snap.input.speedSPerSecond ?? 0) > 0.05 || snap.creature.acceptedContact;
    const vx = this.lastHandAt ? at.x - this.lastHandAt.x : 0;
    this.lastHandAt = { ...at };
    this.handTilt = (this.handTilt ?? 0) + (Math.max(-0.35, Math.min(0.35, vx / (u * 40))) - (this.handTilt ?? 0)) * 0.2;
    const c = Math.cos(this.handTilt), sn = Math.sin(this.handTilt);
    return HAND_TEMPLATE.map(([x, y], i) => {
      const finger = i >= 5 ? Math.floor((i - 5) / 4) : -1, joint = i >= 5 ? (i - 5) % 4 : 0;
      const w = moving && finger >= 0 ? Math.sin(t * 9 + finger * 1.3) * 2.5 * joint : 0;
      const px = x + w, py = y;
      return { x: at.x + (px * c - py * sn) * s, y: at.y + (px * sn + py * c) * s };
    });
  }

  // Prototype A's ghost hand: thick rounded fingers and a smooth palm, drawn opaque into
  // a layer of its own and composited once with transparency, so overlapping fingers
  // never double up. A faint offset shadow, glowing fingertips, warm while petting,
  // reddening when it moves fast, cool blue and dashed when tracking is uncertain.
  traceHand(ctx, pts) {
    const palmW = Math.hypot(pts[5].x - pts[17].x, pts[5].y - pts[17].y);
    const fw = Math.max(10 * this.u, palmW * 0.32);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fill(smoothClosed(HAND_PALM.map((i) => pts[i])));
    ctx.lineWidth = fw * 1.1;
    ctx.beginPath(); HAND_PALM.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y))); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = fw;
    for (const f of HAND_FINGERS) { ctx.beginPath(); f.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y))); ctx.stroke(); }
  }

  handCursor(ctx, snap, kp, t) {
    const u = this.u, q = snap.input.quality;
    const uncertain = q !== 'valid' || (snap.activeTool === 'PET' && snap.intent.label === 'unknown');
    const pet = snap.creature.acceptedContact;
    const fast = Math.max(0, Math.min(1, ((snap.input.speedSPerSecond ?? 0) - 0.4) / 0.7));
    const col = uncertain ? [205, 228, 245] : pet ? [255, 226, 190] : [240 + (255 - 240) * fast, 248 + (120 - 248) * fast, 255 + (100 - 255) * fast];
    const L = this.handLayer ??= document.createElement('canvas');
    if (L.width !== this.W * this.dpr || L.height !== this.H * this.dpr) { L.width = this.W * this.dpr; L.height = this.H * this.dpr; }
    const lc = L.getContext('2d'), m = ctx.getTransform();
    const composite = (alpha) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(L, 0, 0); ctx.restore(); };
    const clear = () => { lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, L.width, L.height); lc.setTransform(m); };
    const fade = q === 'lost' ? 0.4 : 1;
    // shadow
    clear(); lc.fillStyle = lc.strokeStyle = '#000';
    lc.save(); lc.translate(16 * u, 24 * u); this.traceHand(lc, kp); lc.restore();
    composite(0.16 * fade);
    // the hand
    clear(); lc.fillStyle = lc.strokeStyle = `rgb(${col.map((v) => v | 0)})`;
    this.traceHand(lc, kp);
    composite((pet ? 0.2 : 0.32) * fade);
    ctx.save();
    ctx.globalAlpha = 0.8 * fade;
    for (const i of [4, 8, 12, 16, 20]) {
      const g = ctx.createRadialGradient(kp[i].x, kp[i].y, 0, kp[i].x, kp[i].y, 12 * u);
      g.addColorStop(0, `rgba(${col.map((v) => v | 0)},0.7)`); g.addColorStop(1, `rgba(${col.map((v) => v | 0)},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kp[i].x, kp[i].y, 12 * u, 0, TAU); ctx.fill();
    }
    if (uncertain) { // system uncertainty is shown on the hand, never on the kitten
      ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = `rgb(${COLD})`; ctx.lineWidth = 2 * u; ctx.lineCap = 'round';
      ctx.setLineDash([5 * u, 6 * u]); ctx.lineDashOffset = -t * 20;
      for (const f of HAND_FINGERS) { ctx.beginPath(); f.forEach((i, k) => (k ? ctx.lineTo(kp[i].x, kp[i].y) : ctx.moveTo(kp[i].x, kp[i].y))); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = fade;
    // the active tool as a small badge on the palm
    const c = { x: (kp[0].x + kp[9].x) / 2, y: (kp[0].y + kp[9].y) / 2 };
    // the palm shows what the hand means; a held treat or feather speaks for itself
    if (!snap.held) {
      ctx.fillStyle = `rgba(${CREAM},0.75)`; ctx.strokeStyle = `rgba(${INK},0.6)`; ctx.lineWidth = 1.6 * u;
      ctx.beginPath(); ctx.arc(c.x, c.y, 12 * u, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(0.9 * u, 0.9 * u); ctx.translate(-12, -12); ctx.lineWidth = 1.8; ctx.stroke(path2d(snap.toolless ? 'PET' : snap.activeTool)); ctx.restore(); }
    // a held hand shape (Siblings tool): ring fills while it is held over a sibling
    const pose = snap.pose;
    if (snap.activeTool === 'LITTER' && pose && pose.label !== 'unknown') {
      const words = { open_palm: 'Make friends', peace: 'Cuddle up', fist: 'Play-fight', claw: 'Hiss' }[pose.label];
      const tip = kp[12], r = 22 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke();
      if (pose.progress > 0) { ctx.strokeStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * pose.progress); ctx.stroke(); }
      const label = pose.target ? `${words} · hold` : `${words} · point at a sibling`;
      ctx.font = `700 ${15 * u}px Fredoka, Nunito, sans-serif`;
      const tw = ctx.measureText(label).width + 22 * u, ty = Math.min(tip.y, kp[8].y) - 26 * u;
      ctx.fillStyle = '#fff7d6'; ctx.beginPath(); ctx.roundRect(c.x - tw / 2, ty - 15 * u, tw, 28 * u, 14 * u); ctx.fill();
      ctx.fillStyle = `rgb(${INK})`; ctx.textAlign = 'center'; ctx.fillText(label, c.x, ty + 5 * u);
    }
    ctx.restore();
  }

  // Strokes along the fur where the hand passes during accepted contact.
  strokeTrail(ctx, snap, hand, main, dt) {
    const u = this.u;
    this.trail ??= [];
    for (const q of this.trail) q.t += dt;
    if (snap.creature.acceptedContact && hand) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(hand.x - last.x, hand.y - last.y) > 4 * u) this.trail.push({ x: hand.x, y: hand.y, t: 0 });
    }
    this.trail = this.trail.filter((q) => q.t < 1.4).slice(-40);
    if (this.trail.length < 2) return;
    const k = KIT[snap.creature.kitten];
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i], ang = Math.atan2(b.y - a.y, b.x - a.x), alpha = 1 - b.t / 1.4;
      for (const off of [-9, 0, 9]) {
        const ox = Math.cos(ang + Math.PI / 2) * off * u, oy = Math.sin(ang + Math.PI / 2) * off * u;
        ctx.strokeStyle = k?.coat.light ?? '#fff'; ctx.globalAlpha = 0.75 * alpha; ctx.lineWidth = 2.4 * u;
        ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.quadraticCurveTo((a.x + b.x) / 2 + ox + Math.sin(i) * 3 * u, (a.y + b.y) / 2 + oy, b.x + ox, b.y + oy); ctx.stroke();
      }
      if (i % 6 === 0) { ctx.globalAlpha = alpha; star(ctx, b.x, b.y - 10 * u, 4 * u, '#fff3b0', u, b.t * 4); }
    }
    ctx.restore();
  }

  purr(ctx, { x, y }, t) {
    const u = this.u;
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.8 + k / 3) % 1;
      ctx.strokeStyle = `rgba(255,236,190,${0.5 * (1 - ph)})`; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.ellipse(x, y, (40 + ph * 70) * u, (30 + ph * 52) * u, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- tricks
  trickSparkle(ctx, { x, y }, t, tr) {
    const u = this.u, k = Math.min(1, tr.t);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 3, r = (55 + 12 * Math.sin(t * 6 + i)) * u;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      star(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, (5 + 2 * Math.sin(i)) * u, i % 2 ? '#ffd98a' : '#fff', u, a);
    }
    ctx.globalAlpha = 1;
  }

  // While the Tricks tool is on, the move being made is drawn as a golden trail, so the
  // visitor can see what the kitten will learn from.
  moveTrail(ctx, snap, hand, dt) {
    const u = this.u;
    this.moveTrailPts ??= [];
    for (const q of this.moveTrailPts) q.t += dt;
    if (hand && snap.tricks?.moving) this.moveTrailPts.push({ x: hand.x, y: hand.y, t: 0 });
    this.moveTrailPts = this.moveTrailPts.filter((q) => q.t < 1.6);
    const pts = this.moveTrailPts;
    if (pts.length < 2) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = Math.max(0, 1 - pts[i].t / 1.6);
      ctx.strokeStyle = `rgba(255,211,106,${a})`; ctx.lineWidth = 7 * u * a + 2;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the litter together
  dustBehind(ctx, a, b, t) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const dust = this.shownPhase === 'juvenile' ? '255,255,255' : this.shownPhase === 'adult' ? '246,214,160' : '226,214,170';
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * TAU + t * 0.9, r = (70 + 18 * Math.sin(t * 5 + i)) * u;
      const px = cx + Math.cos(ang) * r * 0.9, py = cy + Math.sin(ang) * r * 0.65 + 10 * u, s = (34 + 10 * Math.sin(t * 7 + i * 2)) * u;
      const g = ctx.createRadialGradient(px, py, 0, px, py, s);
      g.addColorStop(0, `rgba(${dust},0.75)`); g.addColorStop(1, `rgba(${dust},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
    }
  }

  // Play-fight: impact bursts, tufts of fur and stars fly from where the two meet.
  scuffle(ctx, a, b, t, dt) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    this.tufts ??= [];
    if (Math.random() < dt * 9) {
      const ang = Math.random() * TAU, sp = (80 + Math.random() * 140) * u;
      this.tufts.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60 * u, t: 0, rot: Math.random() * TAU, kind: Math.random() < 0.6 ? 'fur' : 'star' });
    }
    ctx.save();
    for (const q of this.tufts) {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 240 * u * dt; q.rot += dt * 6;
      ctx.globalAlpha = Math.max(0, 1 - q.t / 0.9);
      if (q.kind === 'star') star(ctx, q.x, q.y, 7 * u, '#ffd36a', u, q.rot);
      else { ctx.strokeStyle = 'rgba(250,240,225,0.95)'; ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + Math.cos(q.rot + k * 0.5) * 9 * u, q.y + Math.sin(q.rot + k * 0.5) * 9 * u); ctx.stroke(); } }
    }
    this.tufts = this.tufts.filter((q) => q.t < 0.9);
    // a periodic comic impact burst
    const beat = (t * 2.6) % 1;
    if (beat < 0.35) {
      const ang = Math.floor(t * 2.6) * 2.1, bx = cx + Math.cos(ang) * 28 * u, by = cy + Math.sin(ang) * 20 * u, s = (1 - beat / 0.35);
      ctx.globalAlpha = s;
      ctx.fillStyle = '#fff7d6'; ctx.strokeStyle = `rgb(${INK})`; ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const aa = (i / 16) * TAU, r = (i % 2 ? 14 : 30) * u * (0.7 + 0.5 * (1 - s)); ctx.lineTo(bx + Math.cos(aa) * r, by + Math.sin(aa) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(${INK},0.5)`; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const ang = i * 1.05 + Math.floor(t * 6) * 0.7, r0 = 80 * u, r1 = 110 * u;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.75); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.75); ctx.stroke();
    }
    ctx.restore();
  }

  // Making friends: noses touch, little hearts pop up between them.
  noseHearts(ctx, a, b, t) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.7 + k / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      heart(ctx, cx + Math.sin(t * 2 + k * 2) * 10 * u, cy - 30 * u - ph * 50 * u, (6 + 3 * k) * u, '#f29ab0', u);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(${INK},0.5)`; // sniffing dots
    for (let k = 0; k < 3; k++) { const ph = (t * 2 + k / 3) % 1; ctx.beginPath(); ctx.arc(cx + (k - 1) * 8 * u, cy - 14 * u - ph * 8 * u, 1.8 * u, 0, TAU); ctx.fill(); }
  }

  warmGlow(ctx, a, b, t) {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = this.S * 0.16 * (1 + 0.04 * Math.sin(t * 1.6));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,226,170,0.45)'); g.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  }

  cuddleHeart(ctx, a, b, t) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - 70 * u + Math.sin(t * 2) * 4 * u;
    heart(ctx, cx, cy, 16 * u * (1 + 0.08 * Math.sin(t * 4)), '#e57f73', u);
    this.sleepZ(ctx, { x: cx - 40 * u, y: cy + 40 * u }, t);
  }

  // A standoff: both puffed up, circling; jagged lines of tension and a big hiss between them.
  standoff(ctx, a, b, t) {
    const u = this.u, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save();
    ctx.strokeStyle = 'rgba(214,82,70,0.85)'; ctx.lineWidth = 3 * u; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let k = -2; k <= 2; k++) { // zigzag sparks between them
      const off = k * 12 * u, jx = Math.cos(ang + Math.PI / 2) * off, jy = Math.sin(ang + Math.PI / 2) * off;
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        const f = -0.5 + s / 6, z = (s % 2 ? 6 : -6) * u * Math.sin(t * 40 + k);
        const px = cx + Math.cos(ang) * f * 60 * u + jx + Math.cos(ang + Math.PI / 2) * z, py = cy + Math.sin(ang) * f * 60 * u + jy + Math.sin(ang + Math.PI / 2) * z;
        if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 12 + k)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the hiss itself, lettered, shaking
    const jx = Math.sin(t * 50) * 2.5 * u, jy = Math.cos(t * 43) * 2.5 * u;
    ctx.font = `700 ${38 * u}px Fredoka, Nunito, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 7 * u; ctx.strokeStyle = '#fff'; ctx.strokeText('HSSS!', cx + jx, cy + 70 * u + jy);
    ctx.fillStyle = '#d4523f'; ctx.fillText('HSSS!', cx + jx, cy + 70 * u + jy);
    ctx.restore();
  }

  // ---------------------------------------------------------------- toys
  feather(ctx, hand, f, t) {
    const u = this.u;
    ctx.save();
    // the string sags between wand and feather
    ctx.strokeStyle = 'rgba(34,64,90,0.55)'; ctx.lineWidth = 1.6 * u;
    const mx = (hand.x + f.x) / 2, my = Math.max(hand.y, f.y) + 30 * u;
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo(mx, my, f.x, f.y); ctx.stroke();
    ctx.fillStyle = 'rgba(20,40,20,0.15)'; ctx.beginPath(); ctx.ellipse(f.x + 10 * u, f.y + 16 * u, 16 * u, 5 * u, 0, 0, TAU); ctx.fill();
    ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.y - hand.y, f.x - hand.x) - Math.PI / 2 + Math.sin(t * 6) * 0.2);
    for (const [col, w, l] of [['#e57f73', 9, 30], ['#ffd98a', 6, 24], ['#a9c99b', 4, 18]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, l * 0.5 * u, w * u, l * 0.6 * u, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(34,64,90,0.6)'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34 * u); ctx.stroke();
    ctx.restore();
  }

  drawBall(ctx, x, y, t) {
    const u = this.u, r = 13 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(20,40,20,0.2)'; ctx.beginPath(); ctx.ellipse(x + 5 * u, y + 8 * u, r, r * 0.6, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, '#ffe7b8'); g.addColorStop(1, '#f2a65a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,90,70,0.85)'; ctx.lineWidth = 2.4 * u;
    const a = (x + y) * 0.06;
    ctx.beginPath(); ctx.arc(x, y, r * 0.75, a, a + Math.PI * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.75, a + Math.PI, a + Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = 'rgba(34,64,90,0.6)'; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // A square photo around the kitten, taken from the finished frame (the canvas holds no
  // interface, so photos are clean).
  capture(snap, size = 360) {
    const src = this.p.drawingContext.canvas, d = this.dpr;
    const c = this.toScreen(snap.creature.position.x * this.W, snap.creature.position.y * this.H);
    const half = this.S * 0.2 * this.cam.z;
    const sx = Math.max(0, Math.min(this.W - 2 * half, c.x - half)), sy = Math.max(0, Math.min(this.H - 2 * half, c.y - half));
    const out = document.createElement('canvas'); out.width = out.height = size;
    out.getContext('2d').drawImage(src, sx * d, sy * d, 2 * half * d, 2 * half * d, 0, 0, size, size);
    return out;
  }

  // Growth sparkles fly from the kitten up to the growth meter in the HUD.
  sparkFx(ctx, dt) {
    const u = this.u;
    for (const s of this.sparks) {
      s.t += dt;
      const sp = this.toScreen(s.x, s.y);
      if (s.home && s.t > 0.35) {
        const k = Math.min(1, (s.t - 0.35) / (s.d - 0.35));
        s.sx ??= sp.x; s.sy ??= sp.y;
        const e = k * k;
        s.px = lerp(s.sx, this.hudTarget.x, e); s.py = lerp(s.sy, this.hudTarget.y, e) - Math.sin(k * Math.PI) * 60 * u;
      } else {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * u * dt;
        s.px = sp.x; s.py = sp.y;
      }
      ctx.globalAlpha = Math.max(0, 1 - s.t / s.d) * 0.9 + 0.1;
      star(ctx, s.px, s.py, 7 * u, '#ffe27a', u, s.t * 6);
    }
    ctx.globalAlpha = 1;
    this.sparks = this.sparks.filter((s) => s.t < s.d);
  }

  burstFx(ctx, dt) {
    const u = this.u;
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / (b.kind === 'catch' ? 0.8 : 2.4);
      if (b.kind === 'catch') {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.globalAlpha = 1 - k; star(ctx, b.x + Math.cos(a) * k * 60 * u, b.y + Math.sin(a) * k * 60 * u, 6 * u, '#fff3b0', u, a); }
        continue;
      }
      // chapter celebration: a ring of light and confetti in the habitat's colours
      const R = k * 380 * u;
      const ring = ctx.createRadialGradient(b.x, b.y, R * 0.6, b.x, b.y, R);
      ring.addColorStop(0, 'rgba(255,248,210,0)'); ring.addColorStop(0.8, `rgba(255,248,210,${0.45 * (1 - k)})`); ring.addColorStop(1, 'rgba(255,248,210,0)');
      ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, TAU); ctx.fill();
      const cols = { juvenile: ['#ffffff', '#cfe6f2', '#9cc5e0'], adult: ['#ffd98a', '#f6b26b', '#e57f73'], grown: ['#ffd98a', '#a9c99b', '#e57f73', '#cfe6f2'], kitten: ['#a9c99b', '#ffd98a'] }[b.kind] ?? ['#fff'];
      for (let i = 0; i < 36; i++) {
        const a = i * 2.399, sp = (160 + (i % 7) * 40) * u;
        const x = b.x + Math.cos(a) * sp * k * 1.6, y = b.y + Math.sin(a) * sp * k * 1.2 + k * k * 160 * u;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = cols[i % cols.length];
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + b.t * 6);
        ctx.fillRect(-4 * u, -2 * u, 8 * u, 4 * u); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    this.bursts = this.bursts.filter((b) => b.t < (b.kind === 'catch' ? 0.8 : 2.4));
  }

  // ---------------------------------------------------------------- atmosphere and light
  atmosphere(ctx, dt, t) {
    const u = this.u, phase = this.shownPhase, W = this.W, H = this.H;
    ctx.save();
    for (const q of this.particles) {
      if (phase === 'kitten') { // pollen drifting in the sun
        q.x += (10 + Math.cos(t * 0.3 + q.ph) * 8) * dt * u; q.y += Math.sin(t * 0.4 + q.ph * 2) * 8 * dt * u;
        const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 0.9 + q.ph * 3));
        const r = 5 * u * q.s;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        g.addColorStop(0, `rgba(255,252,220,${0.85 * a})`); g.addColorStop(1, 'rgba(255,252,220,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
      } else if (phase === 'juvenile') { // snowfall with a little sway
        q.x += (18 + Math.sin(t + q.ph) * 14) * dt * q.s * u; q.y += 42 * dt * q.s * u;
        ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * (q.s - 0.6)})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.s * 1.9 * u, 0, TAU); ctx.fill();
      } else { // wind-blown sand
        q.x += 70 * dt * q.s * u; q.y += Math.sin(t * 2 + q.ph) * 10 * dt * u;
        ctx.strokeStyle = `rgba(255,232,190,${0.25 + 0.2 * Math.sin(t * 2 + q.ph)})`; ctx.lineWidth = q.s * 1.2 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - 9 * u * q.s, q.y); ctx.stroke();
      }
      if (q.x > W) q.x = 0; if (q.x < 0) q.x = W;
      if (q.y > H) q.y = 0; if (q.y < 0) q.y = H;
    }
    ctx.restore();
  }

  // The foreground layer sways and drifts with a little parallax, which reads as depth.
  foreground(ctx, t) {
    const sway = REDUCED ? 0 : Math.sin(t * 0.6) * 4 * this.u;
    const px = (this.W / 2 - this.cam.x) * 0.25, py = (this.H / 2 - this.cam.y) * 0.25;
    const z = 1 + (this.cam.z - 1) * 1.3;
    ctx.save();
    ctx.translate(this.W / 2 + px + sway, this.H / 2 + py);
    ctx.scale(z, z);
    ctx.translate(-this.W / 2, -this.H / 2);
    this.layer(ctx, 'fore');
    ctx.restore();
  }

  lighting(ctx, main, st, t) {
    const W = this.W, H = this.H, ph = this.shownPhase;
    ctx.save();
    // light shafts through the canopy (forest) or a low sun (desert)
    if (ph !== 'juvenile') {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 4; i++) {
        const x0 = W * (0.05 + i * 0.22) + Math.sin(t * 0.15 + i) * 30 * this.u;
        const a = (ph === 'kitten' ? 0.12 : 0.07) * (0.6 + 0.4 * Math.sin(t * 0.4 + i * 1.7));
        const g = ctx.createLinearGradient(x0, 0, x0 + W * 0.25, H);
        g.addColorStop(0, `rgba(255,244,190,${a})`); g.addColorStop(1, 'rgba(255,244,190,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + W * 0.07, -10); ctx.lineTo(x0 + W * 0.36, H); ctx.lineTo(x0 + W * 0.2, H); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // colour grade per habitat
    const grade = { kitten: 'rgba(255,236,170,0.07)', juvenile: 'rgba(170,205,240,0.10)', adult: 'rgba(255,190,120,0.09)' }[ph];
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = grade; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // a soft spotlight on the kitten, then the vignette
    const m = this.toScreen(main.x, main.y);
    const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, this.S * 0.3);
    glow.addColorStop(0, 'rgba(255,248,215,0.12)'); glow.addColorStop(1, 'rgba(255,248,215,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    const tint = { kitten: '18,40,16', juvenile: '30,60,95', adult: '100,50,20' }[ph];
    v.addColorStop(0, `rgba(${tint},0)`); v.addColorStop(1, `rgba(${tint},${st === 'ACTIVE' ? 0.32 : 0.4})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  filmGrain(ctx) {
    if (!this.grain) return;
    const ox = Math.random() * 256, oy = Math.random() * 256;
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(this.grain, 'repeat');
    ctx.fillRect(0, 0, this.W + 256, this.H + 256);
    ctx.restore();
  }

  makeGrain() {
    const c = canvas(256, 256), x = c.getContext('2d'), img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- cursor
  cursor(ctx, snap, ui, t) {
    const inp = snap.input;
    if (!inp.position) return;
    const u = this.u;
    const { x, y } = this.px(inp.position);
    const q = inp.quality;
    const uncertain = q !== 'valid' || snap.intent.label === 'unknown';
    const col = uncertain ? COLD : INK;
    const a = q === 'lost' ? 0.35 : 0.95;
    const r = (snap.activeTool === 'PET' ? 27 : 23) * u * (uncertain ? 1 + 0.05 * Math.sin(t * 8) : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = a;
    ctx.fillStyle = uncertain ? 'rgba(207,230,242,0.92)' : `rgba(${CREAM},0.95)`;
    ctx.shadowColor = 'rgba(34,64,90,0.25)'; ctx.shadowOffsetY = 3 * u;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = `rgb(${col})`;
    ctx.lineWidth = 2.6 * u;
    if (uncertain) { ctx.setLineDash([5 * u, 5 * u]); ctx.lineDashOffset = -t * 24; }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (snap.creature.acceptedContact) { ctx.strokeStyle = `rgba(${SAGE},${0.7 + 0.3 * Math.sin(t * 3)})`; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(0, 0, r + 8 * u, 0, TAU); ctx.stroke(); }
    const k = (r * 1.05) / 12;
    ctx.scale(k, k);
    ctx.translate(-12, -12);
    ctx.strokeStyle = `rgb(${INK})`;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(path2d(snap.activeTool));
    ctx.restore();
    if (ui?.showSkeleton && ui.keypoints) this.skeleton(ctx, ui.keypoints);
  }

  skeleton(ctx, points) {
    const F = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
    ctx.strokeStyle = `rgba(${COLD},0.6)`; ctx.lineWidth = 2 * this.u;
    for (const f of F) for (let i = 1; i < f.length; i++) {
      const a = this.screenToWorldN(points[f[i - 1]].x, points[f[i - 1]].y), b = this.screenToWorldN(points[f[i]].x, points[f[i]].y);
      ctx.beginPath(); ctx.moveTo(a.x * this.W, a.y * this.H); ctx.lineTo(b.x * this.W, b.y * this.H); ctx.stroke();
    }
  }

  // ================================================================ habitats
  // Each habitat is painted once per screen size into two canvases: `ground` (under
  // everything) and `fore` (over the kittens, kept to the edges of the frame).
  newLayer() {
    const c = canvas(this.W * this.dpr, this.H * this.dpr), x = c.getContext('2d');
    x.scale(this.dpr, this.dpr);
    return [c, x];
  }

  // Many tiny strokes give painted ground a texture that reads at any size.
  strokes(x, r, n, len, colours, alpha, angle = null) {
    const u = this.u;
    x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = r() * this.W, py = r() * this.H, a = angle === null ? r() * TAU : angle + (r() - 0.5) * 0.8;
      const l = (len[0] + r() * (len[1] - len[0])) * u;
      x.strokeStyle = rgb(pick(r, colours), alpha * (0.5 + r() * 0.5));
      x.lineWidth = (1 + r() * 1.6) * u;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  }

  // Blur filters are slow per draw call, so blurred content is drawn sharp onto a
  // scratch canvas and blurred once as a whole.
  blurred(x, px, draw) {
    const [c, cx] = this.newLayer();
    draw(cx);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = `blur(${px * this.dpr}px)`; x.drawImage(c, 0, 0); x.filter = 'none';
    x.restore();
  }

  blobs(x, r, n, size, colour, alpha, area = null, blur = 0) {
    if (blur) { this.blurred(x, blur * this.u, (y) => this.blobs(y, r, n, size, colour, alpha, area, 0)); return; }
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const px = area ? area.x + (r() - 0.5) * area.w : r() * this.W, py = area ? area.y + (r() - 0.5) * area.h : r() * this.H;
      x.fillStyle = rgb(colour, alpha * (0.6 + r() * 0.4));
      x.beginPath(); x.ellipse(px, py, (size[0] + r() * (size[1] - size[0])) * u, (size[0] + r() * (size[1] - size[0])) * u * (0.5 + r() * 0.5), r() * TAU, 0, TAU); x.fill();
    }
  }

  rock(x, r, cx, cy, size, { base, light, dark, cap = null, moss = false, shadowDir = [1, 1] }) {
    const u = this.u, n = 7 + Math.floor(r() * 3), pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.3; const rr = size * u * (0.75 + r() * 0.35); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]); }
    const poly = (arr) => { x.beginPath(); arr.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
    x.fillStyle = 'rgba(20,30,20,0.28)';
    x.save(); x.translate(shadowDir[0] * size * u * 0.35, shadowDir[1] * size * u * 0.35); poly(pts); x.fill(); x.restore();
    x.fillStyle = rgb(dark); poly(pts); x.fill();
    // flat-shaded facets: a lit top face and a mid face
    const top = pts.map(([a, b]) => [lerp(cx - size * u * 0.12, a, 0.78), lerp(cy - size * u * 0.14, b, 0.72)]);
    x.fillStyle = rgb(base); poly(top); x.fill();
    const hi = top.filter((_, i) => i >= Math.floor(n * 0.45) && i <= Math.floor(n * 0.85));
    x.fillStyle = rgb(light); poly([[cx - size * u * 0.12, cy - size * u * 0.14], ...hi]); x.fill();
    if (cap) { x.fillStyle = rgb(cap); poly(top.map(([a, b]) => [lerp(cx - size * u * 0.2, a, 0.7), lerp(cy - size * u * 0.25, b, 0.6)])); x.fill(); }
    if (moss) { x.fillStyle = 'rgba(110,160,70,0.75)'; x.beginPath(); x.ellipse(cx - size * u * 0.2, cy - size * u * 0.25, size * u * 0.35, size * u * 0.2, 0.3, 0, TAU); x.fill(); }
    x.strokeStyle = 'rgba(34,40,50,0.35)'; x.lineWidth = 1.5 * u; poly(pts); x.stroke();
  }

  // A top-down pine: stacked star-shaped tiers, optionally snow-laden.
  pine(x, r, cx, cy, R, { snow = false, shadow = [0, 0] } = {}) {
    const u = this.u;
    if (shadow[0] || shadow[1]) {
      x.fillStyle = snow ? 'rgba(90,130,180,0.28)' : 'rgba(10,30,15,0.3)';
      x.beginPath(); x.ellipse(cx + shadow[0] * R * u, cy + shadow[1] * R * u, R * u * 1.05, R * u * 0.7, Math.atan2(shadow[1], shadow[0]), 0, TAU); x.fill();
    }
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const rr = R * u * (1 - k * 0.21), spikes = 9 + k, rot = r() * TAU;
      const g = 52 + k * 14;
      x.fillStyle = snow ? `rgb(${40 + k * 10},${82 + k * 12},${70 + k * 8})` : `rgb(${24 + k * 8},${g},${34 + k * 6})`;
      x.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const a = rot + (i / (spikes * 2)) * TAU, d = i % 2 ? rr * 0.68 : rr;
        const px = cx + Math.cos(a) * d - k * 1.5 * u, py = cy + Math.sin(a) * d - k * 2 * u;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath(); x.fill();
      if (snow) {
        x.fillStyle = 'rgba(250,253,255,0.92)';
        for (let i = 0; i < spikes; i++) {
          const a = rot + (i / spikes) * TAU + 0.2;
          x.beginPath(); x.ellipse(cx + Math.cos(a) * rr * 0.55 - k * 2 * u, cy + Math.sin(a) * rr * 0.55 - k * 2.5 * u, rr * 0.2, rr * 0.11, a, 0, TAU); x.fill();
        }
      }
    }
  }

  // Leafy canopy clumps along the frame: the foreground of the forest.
  canopyClump(x, r, cx, cy, R) {
    const u = this.u;
    for (let k = 0; k < 3; k++) {
      const shade = [[22, 48, 28], [34, 72, 38], [58, 110, 52]][k];
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, d = r() * R * u * (0.7 - k * 0.18);
        const rr = R * u * (0.32 - k * 0.06) * (0.7 + r() * 0.5);
        const px = cx + Math.cos(a) * d - k * 4 * u, py = cy + Math.sin(a) * d - k * 5 * u;
        x.fillStyle = rgb(shade, 0.96);
        x.beginPath();
        for (let j = 0; j <= 14; j++) { const b = (j / 14) * TAU; const q = rr * (0.85 + 0.15 * Math.sin(b * 5 + i)); x.lineTo(px + Math.cos(b) * q, py + Math.sin(b) * q); }
        x.closePath(); x.fill();
      }
    }
    // a few lit leaf edges
    x.fillStyle = 'rgba(150,200,100,0.55)';
    for (let i = 0; i < 10; i++) { const a = r() * TAU, d = r() * R * u * 0.5; x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 7 * u, 3 * u, a, 0, TAU); x.fill(); }
  }

  edgePoints(r, n, inset) {
    const pts = [], W = this.W, H = this.H;
    for (let i = 0; i < n; i++) {
      const side = i % 4, f = r();
      if (side === 0) pts.push([f * W, -inset * r()]);
      if (side === 1) pts.push([W + inset * r(), f * H]);
      if (side === 2) pts.push([f * W, H + inset * r()]);
      if (side === 3) pts.push([-inset * r(), f * H]);
    }
    return pts;
  }

  makeForest() {
    const r = rng(101), u = this.u, W = this.W, H = this.H;
    const [ground, x] = this.newLayer();
    const bg = x.createRadialGradient(W * 0.52, H * 0.48, 0, W * 0.52, H * 0.48, Math.hypot(W, H) * 0.6);
    bg.addColorStop(0, '#9cc55c'); bg.addColorStop(0.55, '#6f9e45'); bg.addColorStop(1, '#3d6a33');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    this.blobs(x, r, 22, [80, 200], [70, 120, 50], 0.35, null, 30);
    this.strokes(x, r, Math.round(9000 * (W * H) / (1600 * 900)), [4, 9], [[90, 150, 60], [120, 175, 70], [70, 130, 55], [150, 195, 90]], 0.55, -Math.PI / 2);
    // sun-dappled clearing: soft pools of light through the leaves, brightest in the middle
    this.blobs(x, r, 14, [90, 170], [210, 230, 120], 0.35, { x: W * 0.52, y: H * 0.5, w: W * 0.55, h: H * 0.55 }, 18);
    this.blurred(x, 5 * u, (g) => {
      for (let i = 0; i < 70; i++) {
        const cx = W * 0.5 + (r() - 0.5) * W * 0.9 * Math.sqrt(r()), cy = H * 0.5 + (r() - 0.5) * H * 0.9 * Math.sqrt(r());
        const near = 1 - Math.min(1, Math.hypot((cx - W / 2) / W, (cy - H / 2) / H) * 1.8);
        g.fillStyle = `rgba(240,248,168,${0.18 + 0.4 * near})`;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + (r() - 0.5) * 40 * u, cy + (r() - 0.5) * 26 * u, (6 + r() * 14) * u, 0, TAU); g.fill(); }
      }
      for (let i = 0; i < 40; i++) { // leaf shadows
        const cx = r() * W, cy = r() * H;
        g.fillStyle = 'rgba(40,80,35,0.18)';
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx + (r() - 0.5) * 50 * u, cy + (r() - 0.5) * 30 * u, (10 + r() * 18) * u, 0, TAU); g.fill(); }
      }
    });
    // grass tufts
    x.lineCap = 'round';
    for (let i = 0; i < 700; i++) {
      const cx = r() * W, cy = r() * H;
      x.strokeStyle = rgb(pick(r, [[60, 110, 45], [80, 135, 55], [140, 190, 90]]), 0.6); x.lineWidth = 1.3 * u;
      for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + k * 4 * u, cy - (6 + r() * 4) * u); x.stroke(); }
    }
    // bare earth patches
    this.blobs(x, r, 7, [40, 90], [196, 172, 118], 0.55, { x: W * 0.5, y: H * 0.55, w: W * 0.7, h: H * 0.6 }, 10);
    // flowers and clover
    for (let i = 0; i < 120; i++) {
      const cx = r() * W, cy = r() * H, c = pick(r, [[255, 255, 255], [250, 190, 205], [255, 220, 120], [190, 210, 255]]);
      for (let k = 0; k < 4; k++) { x.fillStyle = rgb(c, 0.95); x.beginPath(); x.arc(cx + (r() - 0.5) * 12 * u, cy + (r() - 0.5) * 12 * u, (1.6 + r() * 2) * u, 0, TAU); x.fill(); }
    }
    // canopy shadow falling onto the ground around the edges
    const sh = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    sh.addColorStop(0, 'rgba(10,30,15,0)'); sh.addColorStop(1, 'rgba(10,30,15,0.5)');
    x.fillStyle = sh; x.fillRect(0, 0, W, H);
    // rocks and a stump
    for (const [fx, fy, s] of [[0.14, 0.3, 30], [0.2, 0.36, 16], [0.86, 0.22, 26], [0.8, 0.78, 34], [0.3, 0.84, 20], [0.66, 0.14, 18], [0.93, 0.55, 22]]) {
      this.rock(x, r, W * fx, H * fy, s, { base: [150, 156, 160], light: [196, 202, 204], dark: [96, 104, 110], moss: r() < 0.6 });
    }
    this.stump(x, W * 0.33, H * 0.2, 26 * u);
    this.texture(x, 0.05);

    const [fore, f] = this.newLayer();
    this.blurred(f, 1.6 * u, (g) => {
      for (const [cx, cy] of this.edgePoints(r, 30, 40 * u)) this.canopyClump(g, r, cx, cy, 120 + r() * 70);
      for (const [cx, cy] of [[-20 * u, -10 * u], [W + 10 * u, -20 * u], [W + 20 * u, H + 10 * u], [-10 * u, H + 20 * u]]) this.canopyClump(g, r, cx, cy, 240);
    });
    return { ground, fore };
  }

  stump(x, cx, cy, R) {
    x.fillStyle = 'rgba(20,30,15,0.3)'; x.beginPath(); x.ellipse(cx + R * 0.35, cy + R * 0.4, R * 1.1, R * 0.95, 0, 0, TAU); x.fill();
    x.fillStyle = '#6a4a2e'; x.beginPath(); x.arc(cx, cy, R * 1.06, 0, TAU); x.fill();
    x.fillStyle = '#d9b47c'; x.beginPath(); x.arc(cx, cy, R * 0.86, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(150,110,60,0.7)'; x.lineWidth = 1.4 * this.u;
    for (let k = 1; k <= 4; k++) { x.beginPath(); x.arc(cx + k * 0.8 * this.u, cy, R * 0.18 * k, 0, TAU); x.stroke(); }
  }

  // ---- Snowfield (after the reference): clean fine-grained snow, soft drifts,
  // snow-laden firs with long cool shadows, a snow-capped boulder, an old fence.
  makeSnow() {
    const r = rng(202), u = this.u, W = this.W, H = this.H;
    const [ground, x] = this.newLayer();
    const bg = x.createLinearGradient(W, 0, 0, H);
    bg.addColorStop(0, '#fbfdff'); bg.addColorStop(1, '#e9f0f7');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // gentle drifts: broad soft hollows (cool) and crests (bright)
    this.blobs(x, r, 26, [120, 300], [214, 226, 238], 0.5, null, 50);
    this.blobs(x, r, 16, [100, 240], [255, 255, 255], 0.8, null, 40);
    // fine crystalline grain, the texture of fresh snow up close
    this.speckle(x, r, 0.06, [[205, 218, 232], [255, 255, 255], [225, 235, 245]]);
    // tree layout first, so ground shadows and foreground firs line up
    const trees = [
      [W * 0.06, H * 0.08, 120], [W * 0.0, H * 0.4, 110], [-10 * u, H * 0.75, 100],
      [W * 0.96, H * 0.06, 110], [W * 1.0, H * 0.42, 130], [W * 0.95, H * 0.95, 140],
      [W * 0.55, -20 * u, 90], [W * 0.3, H + 10 * u, 90], [W * 0.75, H + 20 * u, 110],
    ];
    // long soft shadows, cast to the lower left by a low sun at the upper right
    this.blurred(x, 14 * u, (g) => {
      g.fillStyle = 'rgba(120,150,190,0.32)';
      for (const [cx, cy, R] of trees) {
        g.save(); g.translate(cx, cy); g.rotate(Math.PI * 0.78);
        g.beginPath(); g.ellipse(R * u * 1.9, 0, R * u * 2.2, R * u * 0.62, 0, 0, TAU); g.fill(); g.restore();
      }
    });
    // a snow-capped boulder and its shadow
    const bx = W * 0.38, by = H * 0.13, br = 32 * u;
    this.blurred(x, 8 * u, (g) => { g.fillStyle = 'rgba(110,140,180,0.38)'; g.save(); g.translate(bx, by); g.rotate(Math.PI * 0.78); g.beginPath(); g.ellipse(br * 1.6, 0, br * 2.1, br * 0.8, 0, 0, TAU); g.fill(); g.restore(); });
    this.boulder(x, r, bx, by, br);
    this.boulder(x, r, W * 0.82, H * 0.7, 18 * u);
    this.texture(x, 0.03);

    const [fore, f] = this.newLayer();
    this.fence(f, r, -10 * u, H * 0.86, 0.12);
    this.fence(f, r, W - 30 * u, H * 0.55, -1.48);
    for (const [cx, cy, R] of trees) this.snowFir(f, r, cx, cy, R);
    return { ground, fore };
  }

  // per-pixel grain at screen resolution, cheap because it is baked once
  speckle(x, r, density, colours) {
    const u = this.u, n = Math.round((this.W * this.H) * density / (u * u * 40));
    for (let i = 0; i < n; i++) { x.fillStyle = rgb(pick(r, colours), 0.5 + r() * 0.5); x.fillRect(r() * this.W, r() * this.H, (0.8 + r()) * u, (0.8 + r()) * u); }
  }

  boulder(x, r, cx, cy, R) {
    const u = this.u, pts = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; pts.push([cx + Math.cos(a) * R * (0.85 + r() * 0.2), cy + Math.sin(a) * R * 0.8 * (0.85 + r() * 0.2)]); }
    const poly = (arr) => { x.beginPath(); arr.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); };
    const g = x.createLinearGradient(cx + R, cy - R, cx - R, cy + R);
    g.addColorStop(0, '#6d6f74'); g.addColorStop(1, '#2f3136');
    x.fillStyle = g; poly(pts); x.fill();
    // a smooth snow cap on top, shaded cool on its lower edge
    const cap = pts.map(([a, b]) => [lerp(cx + R * 0.05, a, 0.66), lerp(cy - R * 0.25, b, 0.5)]);
    x.fillStyle = '#f8fbff'; poly(cap); x.fill();
    x.strokeStyle = 'rgba(160,185,215,0.8)'; x.lineWidth = 2.5 * u; poly(cap); x.stroke();
  }

  // A snow-laden fir from above: dark needles under heavy, rounded clumps of snow.
snowFir(x, r, cx, cy, R) {
    const u = this.u, RR = R * u;
    // layered boughs from the outside in, each tier a darker-to-lighter green star
    for (let tier = 0; tier < 4; tier++) {
      const rr = RR * (1 - tier * 0.22), spikes = 11 + tier * 2, rot = tier * 0.37 + r() * 0.2;
      x.fillStyle = ['#183a2e', '#21483a', '#2b5746', '#356552'][tier];
      x.beginPath();
      for (let i = 0; i <= spikes * 2; i++) { const a = rot + (i / (spikes * 2)) * TAU, d = i % 2 ? rr * 0.62 : rr; x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
      x.closePath(); x.fill();
      // heavy snow resting on the upper side of each bough, leaving dark gaps between
      for (let i = 0; i < spikes; i++) {
        if (r() < 0.25) continue;
        const a = rot + (i / spikes) * TAU, d = rr * (0.62 + r() * 0.18);
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, s2 = rr * 0.17 * (0.8 + r() * 0.4);
        x.fillStyle = 'rgba(196,210,228,0.95)';
        x.beginPath(); x.ellipse(px - s2 * 0.15, py + s2 * 0.18, s2, s2 * 0.7, a, 0, TAU); x.fill();
        x.fillStyle = '#ffffff';
        x.beginPath(); x.ellipse(px + s2 * 0.06, py - s2 * 0.08, s2 * 0.82, s2 * 0.56, a, 0, TAU); x.fill();
      }
    }
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, RR * 0.12, 0, TAU); x.fill();
  }

  // Weathered planks with snow along their tops, half out of frame.
  fence(x, r, cx, cy, rot) {
    const u = this.u;
    x.save(); x.translate(cx, cy); x.rotate(rot);
    for (let i = 0; i < 6; i++) {
      const px = i * 34 * u, len = (110 + r() * 30) * u;
      x.fillStyle = 'rgba(110,130,160,0.3)'; x.fillRect(px + 8 * u, 10 * u, 22 * u, len);
      const g = x.createLinearGradient(px, 0, px + 24 * u, 0);
      g.addColorStop(0, '#b9a58a'); g.addColorStop(1, '#8c7a63');
      x.fillStyle = g; x.fillRect(px, 0, 24 * u, len);
      x.strokeStyle = 'rgba(90,75,60,0.5)'; x.lineWidth = 1 * u;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(px + (5 + k * 7) * u, 6 * u); x.lineTo(px + (5 + k * 7) * u + r() * 3 * u, len - 6 * u); x.stroke(); }
      x.fillStyle = '#fbfdff'; x.beginPath(); x.ellipse(px + 12 * u, len * (0.2 + r() * 0.5), 14 * u, 6 * u, 0, 0, TAU); x.fill();
    }
    x.fillStyle = '#9b876d'; x.fillRect(-10 * u, 30 * u, 220 * u, 14 * u);
    x.fillStyle = '#fbfdff'; x.fillRect(-10 * u, 27 * u, 220 * u, 6 * u);
    x.restore();
  }

  // ---- Desert (after the references): smooth wind ripples, a broad pale dune valley,
  // faceted low-poly red rock with succulents and dry grass gathered at its feet.
  makeDesert() {
    const r = rng(303), u = this.u, W = this.W, H = this.H;
    const [ground, x] = this.newLayer();
    x.fillStyle = '#efcf93'; x.fillRect(0, 0, W, H);
    // broad dune shading and a pale wind-swept valley through the middle
    this.blurred(x, 40 * u, (g) => {
      g.fillStyle = 'rgba(214,166,104,0.45)';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(r() * W, r() * H, (160 + r() * 220) * u, (80 + r() * 120) * u, r() * TAU, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,238,200,0.75)'; g.lineWidth = 170 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(W * 0.1, -40 * u); g.bezierCurveTo(W * 0.35, H * 0.35, W * 0.15, H * 0.6, W * 0.55, H + 40 * u); g.stroke();
      g.lineWidth = 120 * u; g.strokeStyle = 'rgba(255,240,206,0.55)';
      g.beginPath(); g.moveTo(W * 0.6, -40 * u); g.bezierCurveTo(W * 0.75, H * 0.3, W * 0.45, H * 0.55, W * 0.85, H + 40 * u); g.stroke();
    });
    // wind ripples: smooth crests (lit) over troughs (shade), tapering at both ends
    this.blurred(x, 1.2 * u, (g) => {
      g.lineCap = 'round';
      const gap = 20 * u;
      for (let row = -3; row < H / gap + 3; row++) {
        let xx = -60 * u + r() * 40 * u;
        while (xx < W + 60 * u) {
          const len = (120 + r() * 260) * u, y0 = row * gap + r() * 6 * u;
          const curve = (q) => y0 + Math.sin(q * 0.011 + row * 0.7) * 7 * u + Math.sin(q * 0.0031 + row * 0.2) * 22 * u;
          for (const [dy, col, w] of [[2.5, 'rgba(196,140,84,0.42)', 3.2], [-1.5, 'rgba(255,244,214,0.7)', 2.4]]) {
            const N = 14;
            for (let k = 0; k < N; k++) {
              const t0 = k / N, t1 = (k + 1) / N, taper = Math.sin(((t0 + t1) / 2) * Math.PI);
              const q0 = xx + t0 * len, q1 = xx + t1 * len;
              g.strokeStyle = col; g.lineWidth = w * u * taper + 0.3;
              g.beginPath(); g.moveTo(q0, curve(q0) + dy * u); g.lineTo(q1, curve(q1) + dy * u); g.stroke();
            }
          }
          xx += len + (10 + r() * 50) * u;
        }
      }
    });
    // pebbles
    for (let i = 0; i < 160; i++) { x.fillStyle = rgb(pick(r, [[205, 160, 110], [180, 140, 100], [246, 228, 196]]), 0.9); x.beginPath(); x.ellipse(r() * W, r() * H, (1.4 + r() * 2.6) * u, (1 + r() * 2) * u, r() * TAU, 0, TAU); x.fill(); }
    // rock outcrops on the ground, each with plants gathered in its lee
    const outcrops = [[0.12, 0.2, 46], [0.88, 0.16, 40], [0.86, 0.82, 52], [0.2, 0.86, 36], [0.64, 0.1, 22], [0.07, 0.55, 26]];
    for (const [fx, fy, s] of outcrops) {
      const cx = W * fx, cy = H * fy;
      for (let k = 0; k < 5; k++) this.desertPlant(x, r, cx + (r() - 0.3) * s * 2.4 * u, cy + (r() - 0.2) * s * 2 * u, r() < 0.45);
      this.lowPolyCluster(x, r, cx, cy, s, 3);
    }
    for (let i = 0; i < 7; i++) this.lowPolyRock(x, r, r() * W, r() * H, 6 + r() * 7);
    this.texture(x, 0.05);

    const [fore, f] = this.newLayer();
    for (const [cx, cy, s] of [[-20 * u, -20 * u, 120], [W + 20 * u, -10 * u, 100], [W + 10 * u, H + 20 * u, 130], [-10 * u, H + 10 * u, 110], [W * 0.42, -50 * u, 60], [W + 40 * u, H * 0.5, 70]]) {
      this.lowPolyCluster(f, r, cx, cy, s, 5);
    }
    return { ground, fore };
  }

  // A faceted rock: every triangle from the peak to the rim is shaded by which way it
  // faces the sun (upper left), which is what gives low-poly rock its look.
  lowPolyRock(x, r, cx, cy, size) {
    const u = this.u, R = size * u, n = 6 + Math.floor(r() * 3), rim = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.4; rim.push([cx + Math.cos(a) * R * (0.75 + r() * 0.4), cy + Math.sin(a) * R * 0.85 * (0.75 + r() * 0.4)]); }
    const peak = [cx - R * 0.18 + (r() - 0.5) * R * 0.2, cy - R * 0.22];
    // cast shadow, cool-tinted, toward the lower right
    x.fillStyle = 'rgba(120,70,70,0.28)';
    x.beginPath(); rim.forEach(([a, b], i) => (i ? x.lineTo(a + R * 0.5, b + R * 0.45) : x.moveTo(a + R * 0.5, b + R * 0.45))); x.closePath(); x.fill();
    const L = [-0.62, -0.78];
    const tones = [[150, 70, 46], [190, 96, 58], [222, 128, 74], [240, 162, 104], [250, 192, 138]];
    for (let i = 0; i < n; i++) {
      const a = rim[i], b = rim[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2 - peak[0], my = (a[1] + b[1]) / 2 - peak[1], m = Math.hypot(mx, my) || 1;
      const lit = (mx / m) * L[0] + (my / m) * L[1];
      const tone = tones[Math.max(0, Math.min(4, Math.round((lit + 1) * 2)))];
      x.fillStyle = rgb(tone);
      x.beginPath(); x.moveTo(peak[0], peak[1]); x.lineTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.closePath(); x.fill();
      x.strokeStyle = rgb(tone); x.lineWidth = 0.8 * u; x.stroke();
    }
    x.strokeStyle = 'rgba(255,214,170,0.35)'; x.lineWidth = 1 * u;
    for (const [a, b] of rim) { x.beginPath(); x.moveTo(peak[0], peak[1]); x.lineTo(a, b); x.stroke(); }
  }

  lowPolyCluster(x, r, cx, cy, size, n) {
    const u = this.u, rocks = [];
    for (let k = 0; k < n; k++) rocks.push([cx + (r() - 0.5) * size * 1.6 * u, cy + (r() - 0.5) * size * 1.2 * u, size * (0.45 + r() * 0.55)]);
    rocks.sort((a, b) => a[1] - b[1]);
    for (const [px, py, s] of rocks) this.lowPolyRock(x, r, px, py, s);
  }

  // Agave rosettes and dry grass tufts.
  desertPlant(x, r, cx, cy, agave) {
    const u = this.u;
    if (agave) {
      const R = (10 + r() * 8) * u;
      x.fillStyle = 'rgba(110,70,40,0.25)'; x.beginPath(); x.ellipse(cx + R * 0.4, cy + R * 0.4, R, R * 0.8, 0, 0, TAU); x.fill();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + r() * 0.2;
        x.fillStyle = k % 2 ? '#4f9a6a' : '#6db27c';
        x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a + 0.25) * R * 0.6, cy + Math.sin(a + 0.25) * R * 0.6, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        x.quadraticCurveTo(cx + Math.cos(a - 0.25) * R * 0.6, cy + Math.sin(a - 0.25) * R * 0.6, cx, cy); x.fill();
      }
    } else {
      x.strokeStyle = 'rgba(176,156,96,0.95)'; x.lineWidth = 1.3 * u; x.lineCap = 'round';
      for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (r() - 0.5) * 2; const l = (8 + r() * 10) * u; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.6, cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }
    }
  }

  // Paper-like grain baked into the ground.
  texture(x, alpha) {
    if (!this.grain) return;
    x.save();
    x.globalAlpha = alpha; x.globalCompositeOperation = 'overlay';
    x.fillStyle = x.createPattern(this.grain, 'repeat');
    x.fillRect(0, 0, this.W, this.H);
    x.restore();
  }
}

function heart(ctx, hx, hy, s, fill, u) {
  ctx.fillStyle = fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(hx, hy + s * 0.9);
  ctx.bezierCurveTo(hx - s * 1.4, hy - s * 0.1, hx - s * 0.7, hy - s * 1.2, hx, hy - s * 0.45);
  ctx.bezierCurveTo(hx + s * 0.7, hy - s * 1.2, hx + s * 1.4, hy - s * 0.1, hx, hy + s * 0.9);
  ctx.fill(); ctx.stroke();
}

function star(ctx, x, y, r, fill, u, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = fill; ctx.strokeStyle = 'rgba(34,64,90,0.5)'; ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, d = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
