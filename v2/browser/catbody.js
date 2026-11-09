// CatBody: the procedural cat body, ported from Prototype A (cat.js) as a pure puppet.
//
// Technique: a follow-the-leader spine (8 joints with bend limits) carries a width
// profile, so the outline bends with every turn; 4 legs are solved with 2-bone IK and
// plant their paws until a diagonal-pair step; a 13-joint tail is driven by a mood wave;
// coat markings live in body coordinates (s along the spine, t across the back) and are
// re-projected onto the moving spine each frame. The chain approach follows
// argonautcode/animal-proc-anim; leg IK follows the classic 2-bone solution.
//
// The puppet READS the snapshot (position, heading, speed, behaviour, age). It owns no
// state that matters to the experience: trust, needs and decisions live in v2/core only.

const NJ = 8;
const WIDTH_PROFILE = [0.44, 0.86, 0.94, 0.9, 0.86, 0.9, 0.84, 0.52];
const TAIL_N = 13;
const TAU = Math.PI * 2;
// Three life stages that read at a glance (ADR-013):
//   kitten   — small, big round head, huge blue eyes, stubby tail, fuzzy outline, faint coat
//   juvenile — lanky legs, oversized ears, coat pattern coming in, eyes changing colour
//   adult    — full size, sharp pattern, adult eye colour, chest ruff, ear tufts, long whiskers
const MORPH = [
  { size: 0.56, head: 1.5, body: 0.72, leg: 0.76, tail: 0.6, eye: 1.55, chub: 1.28, fluff: 1.0, pattern: 0.3, ear: 0.96, ruff: 0, tuft: 0, whisker: 0.7 },
  { size: 0.8, head: 1.1, body: 0.98, leg: 1.12, tail: 0.96, eye: 1.15, chub: 0.9, fluff: 0.45, pattern: 0.72, ear: 1.22, ruff: 0.45, tuft: 0.3, whisker: 0.9 },
  { size: 1.0, head: 1.0, body: 1.06, leg: 1.04, tail: 1.1, eye: 1.0, chub: 1.0, fluff: 0.2, pattern: 1.0, ear: 1.04, ruff: 1, tuft: 1, whisker: 1.2 },
  { size: 1.0, head: 1.0, body: 1.06, leg: 1.04, tail: 1.1, eye: 1.0, chub: 1.0, fluff: 0.2, pattern: 1.0, ear: 1.04, ruff: 1, tuft: 1, whisker: 1.2 },
];
const KITTEN_EYE = [134, 185, 230];

// ---------------------------------------------------------------- small math
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pt = (x, y) => ({ x, y });
const polar = (a, r) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const approach = (c, t, k) => c + (t - c) * clamp(k, 0, 1);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smooth01 = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => c.map((v) => clamp(v * k, 0, 255));
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function closedSmooth(pts) {
  const p = new Path2D(), n = pts.length;
  const m0 = lerpP(pts[n - 1], pts[0], 0.5);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) { const a = pts[i], m = lerpP(a, pts[(i + 1) % n], 0.5); p.quadraticCurveTo(a.x, a.y, m.x, m.y); }
  p.closePath();
  return p;
}
function traceOpen(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) { const m = lerpP(pts[i], pts[i + 1], 0.5); ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y); }
  const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
}

// ---------------------------------------------------------------- genome (fixed per kitten)
export function genomeFor(k) {
  const r = mulberry32(k.seed);
  const g = {
    coat: { base: hex(k.coat.base), mark: hex(k.coat.mark), light: hex(k.coat.light) },
    pattern: k.pattern, eye: hex(k.eye),
    density: 0.95, contrast: 0.85, earSize: 1.06, tailLen: 1.06, bodyLen: 1, legLen: 1, headSize: 1, fluff: 1.1,
    socks: k.id === 'ember', whiteMuzzle: k.id !== 'saffron', tailTipDark: true,
  };
  const marks = [];
  if (g.pattern === 'tabby') {
    for (let s = 0.12; s < 0.95; s += 0.075 + r() * 0.06) {
      marks.push({ type: 'stripe', s, w: 0.014 + r() * 0.022, chev: 0.02 + r() * 0.05, t0: -1.1 + r() * 0.45, t1: 1.1 - r() * 0.45, gap: r() < 0.5 ? (r() < 0.5 ? -1 : 1) : null });
    }
  } else {
    const n = Math.round((g.pattern === 'spotted' ? 34 : 22) * g.density);
    for (let i = 0; i < n; i++) {
      marks.push({ type: g.pattern === 'spotted' ? 'spot' : 'rosette', s: 0.05 + r() * 0.92, t: (r() * 2 - 1) * 0.92,
        r: g.pattern === 'spotted' ? 0.07 + r() * 0.07 : 0.11 + r() * 0.07, rot: r() * Math.PI, ecc: 0.65 + r() * 0.5 });
    }
  }
  g.marks = marks;
  g.tailRings = 5 + Math.floor(r() * 4);
  g.headSpots = Array.from({ length: 7 }, () => ({ x: -0.3 + r() * 0.35, y: (r() * 2 - 1) * 0.5, r: 0.05 + r() * 0.05 }));
  return g;
}

// Pose per behaviour: what each choice looks like from above.
const POSES = {
  EXPLORE:   { ear: 0.15, tailAmp: 0.45, tailCurl: 0.35 },
  OBSERVE:   { sit: 0.7, ear: 0.45, pupil: 0.6, tailAmp: 0.2, tailFreq: 0.6, tailCurl: 0.7 },
  SEEK_FOOD: { crouch: 0.25, ear: 0.4, pupil: 0.7, tailAmp: 0.6, tailFreq: 1.4, tailCurl: 0.3 },
  EAT:       { sit: 0.5, crouch: 0.3, eye: 0.55, tailAmp: 0.3, tailFreq: 0.8, dip: 1 },
  REST:      { curl: 1, eye: 0, ear: 0.35, tailAmp: 0.05, tailFreq: 0.4, pupil: 0.2 },
  GROOM:     { sit: 1, eye: 0.45, tailAmp: 0.2, tailFreq: 0.6, tailCurl: 0.8, dip: 1 },
  APPROACH:  { ear: 0.55, pupil: 0.55, tailAmp: 0.35, tailFreq: 0.8, tailCurl: 1 },
  CONTACT:   { sit: 0.85, eye: 0.3, ear: 0.3, pupil: 0.25, purr: 1, tailAmp: 0.25, tailFreq: 0.55, tailCurl: 1 },
  PLAY:      { crouch: 0.7, pupil: 1, ear: 0.6, tailAmp: 0.9, tailFreq: 3.2, tailCurl: 0.15 },
  SOCIAL:    { ear: 0.5, pupil: 0.8, tailAmp: 0.6, tailFreq: 1.6, tailCurl: 0.9 },
  WRESTLE:   { crouch: 0.6, puff: 0.35, ear: -0.25, pupil: 1, tailAmp: 1.2, tailFreq: 4.2, tailCurl: 0.2 },
  HUNT:      { crouch: 0.85, ear: 0.75, pupil: 1, eye: 1.1, tailAmp: 0.25, tailFreq: 3.6, tailCurl: 0 },
  GIFT:      { ear: 0.35, pupil: 0.5, tailAmp: 0.3, tailFreq: 0.9, tailCurl: 1 },
  RETREAT:   { crouch: 0.35, ear: -0.5, eye: 1.15, pupil: 1, puff: 1, tailAmp: 0.12, tailFreq: 3, tailCurl: 0 },
};
const DEFAULT_POSE = { sit: 0, curl: 0, crouch: 0, eye: 1, ear: 0, pupil: 0.45, puff: 0, purr: 0, tailAmp: 0.45, tailFreq: 1, tailCurl: 0.35, dip: 0, mouth: 0 };

export class CatBody {
  constructor(kitten, unit, x, y, heading) {
    this.g = genomeFor(kitten);
    this.U = unit;
    this.age = 0;
    this.time = Math.random() * 100;
    this.tailSide = kitten.id === 'juniper' ? -1 : 1;
    this.pose = { ...DEFAULT_POSE };
    this.blink = 0; this.blinkT = 2;
    this.lookAng = 0; this.lookPoint = null;
    this.curlInfo = null;
    this.behaviour = 'OBSERVE';
    this.speed = 0; this.vel = pt(0, 0);
    this.updateDims();
    this.resetBody(x, y, heading);
  }

  updateDims() {
    const a = clamp(this.age, 0, 3), i = Math.min(2, Math.floor(a)), f = a - i;
    const A = MORPH[i], B = MORPH[i + 1], m = {};
    for (const k in A) m[k] = A[k] + (B[k] - A[k]) * f;
    this.m = m;
    const s = m.size * this.U * 1.32, g = this.g;
    this.size = m.size;
    this.bodyLen = 126 * s * m.body * g.bodyLen;
    this.segLen = this.bodyLen / (NJ - 1);
    this.hw = 28 * s * m.chub;
    this.headL = 50 * s * m.head * g.headSize;
    this.headW = 30 * s * m.head * g.headSize;
    this.legA = 21 * s * m.leg * g.legLen;
    this.legB = 20 * s * m.leg * g.legLen;
    this.tailLen = 150 * s * m.tail * g.tailLen;
    this.tailSeg = this.tailLen / (TAIL_N - 1);
  }

  resetBody(x, y, heading) {
    this.pos = pt(x, y);
    this.heading = heading;
    this.spine = Array.from({ length: NJ }, (_, i) => add(this.pos, polar(heading + Math.PI, i * this.segLen)));
    const end = this.spine[NJ - 1];
    this.tail = Array.from({ length: TAIL_N }, (_, i) => add(end, polar(heading + Math.PI, i * this.tailSeg)));
    this.cacheFrame();
    this.planted = []; // paw plants since the last frame, read by the renderer for footprints
    this.legs = [[0, -1], [0, 1], [1, -1], [1, 1]].map(([g, side]) => ({ g, side, foot: null, stepping: false, t: 0, from: null, dur: 8, lift: 0 }));
    for (const L of this.legs) L.foot = this.footTarget(L);
  }

  setUnit(u) { this.U = u; this.updateDims(); this.resetBody(this.pos.x, this.pos.y, this.heading); }

  // s: { x, y (px), heading, speed (px/s), behaviour, age, look (px point | null),
  //      wrestling, reaction ('hiss' | null), carrying (gift id | null) }
  update(dt, s) {
    this.reaction = s.reaction ?? null;
    this.carrying = s.carrying ?? null;
    const f = Math.min(dt * 60, 3); // frames at 60 fps, as in Prototype A
    this.time += dt;
    if (Math.abs(s.age - this.age) > 0.002) { this.age = s.age; this.updateDims(); }
    if (dist(this.pos, s) > this.bodyLen * 3) this.resetBody(s.x, s.y, s.heading);
    if (s.behaviour !== this.behaviour) {
      if (s.behaviour === 'REST') this.beginCurl();
      this.behaviour = s.behaviour;
    }
    const target = { ...DEFAULT_POSE, ...(POSES[s.wrestling ? 'WRESTLE' : s.behaviour] || {}) };
    // a hiss overrides the face and fur: puffed up, ears flat, slit pupils, mouth open
    if (this.reaction === 'hiss') Object.assign(target, { puff: 1, ear: -0.5, eye: 1.15, pupil: 0.12, crouch: 0.25, mouth: 1, tailAmp: 0.1, tailCurl: 0 });
    else target.mouth = 0;
    if (this.pose.mouth === undefined) this.pose.mouth = 0;
    if (s.behaviour === 'EAT' || s.behaviour === 'GROOM') target.dip = 0.5 + 0.5 * Math.sin(this.time * 14);
    for (const k in target) this.pose[k] = approach(this.pose[k], target[k], (k === 'curl' ? 0.035 : 0.09) * f);

    this.speed = s.speed / 60;
    this.vel = polar(s.heading, this.speed);
    this.heading = s.heading;
    this.pos = pt(s.x, s.y);
    this.solveSpine();
    this.cacheFrame();
    this.solveTail(f);
    this.solveLegs(f);
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const look = s.look;
    const tgt = look ? clamp(angDiff(angTo(this.spine[0], look), this._fwd[0]), -1, 1) : 0;
    this.lookAng = approach(this.lookAng, tgt, 0.12 * f);
    this.lookPoint = look;
  }

  // ---------------------------------------------------------------- skeleton
  solveSpine() {
    const sp = this.spine, p = this.pose;
    sp[0] = { ...this.pos };
    for (let i = 1; i < NJ; i++) {
      const seg = this.segLen * (i >= 4 ? 1 - 0.36 * p.sit : 1) * (1 - 0.06 * p.crouch);
      const ref = i === 1 ? this.heading : angTo(sp[i - 1], sp[i - 2]);
      const d = clamp(angDiff(angTo(sp[i], sp[i - 1]), ref), -0.32, 0.32);
      sp[i] = add(sp[i - 1], polar(ref + d + Math.PI, seg));
    }
    if (p.curl > 0.01 && this.curlInfo) {
      const c = this.curlInfo;
      for (let i = 0; i < NJ; i++) {
        const th = c.thMid + c.dir * (3 - i) * (this.segLen / c.R);
        sp[i] = lerpP(sp[i], add(c.centre, polar(th, c.R)), ease(p.curl));
      }
    }
  }

  beginCurl() {
    const R = (this.bodyLen + this.headL * 0.5) / (TAU * 0.56);
    const mid = this.spine[3], a = this._fwd[3], dir = this.tailSide;
    const centre = add(mid, polar(a + dir * Math.PI / 2, R));
    this.curlInfo = { centre, R, dir, thMid: angTo(centre, mid) };
  }

  cacheFrame() {
    const sp = this.spine, p = this.pose;
    const breath = 1 + Math.sin(this.time * (p.curl > 0.5 ? 1.6 : 2.6)) * (0.018 + 0.02 * p.curl);
    this._fwd = []; this._w = [];
    for (let i = 0; i < NJ; i++) {
      this._fwd.push(i === 0 ? angTo(sp[1], sp[0]) : i === NJ - 1 ? angTo(sp[NJ - 1], sp[NJ - 2]) : angTo(sp[i + 1], sp[i - 1]));
      this._w.push(WIDTH_PROFILE[i] * this.hw * breath * (1 + p.puff * 0.16) * (1 + p.crouch * 0.06));
    }
  }

  solveTail(f) {
    const t = this.tail, sp = this.spine, p = this.pose;
    const back = angTo(sp[NJ - 2], sp[NJ - 1]);
    t[0] = add(sp[NJ - 1], polar(back, this.segLen * 0.3));
    for (let i = 1; i < TAIL_N; i++) {
      const prevA = i === 1 ? back : angTo(t[i - 2], t[i - 1]);
      const k = i / (TAIL_N - 1);
      const wave = Math.sin(this.time * p.tailFreq * 2.4 - i * 0.5) * p.tailAmp * (0.3 + k);
      const desired = prevA + wave * 0.24 + p.tailCurl * this.tailSide * k * k * 0.45;
      const cur = angTo(t[i - 1], t[i]);
      const na = cur + angDiff(desired, cur) * clamp(0.25 * f, 0, 1);
      const d = clamp(angDiff(na, prevA), -0.6, 0.6);
      t[i] = add(t[i - 1], polar(prevA + d, this.tailSeg));
    }
    if (p.curl > 0.01 && this.curlInfo) {
      const c = this.curlInfo, R2 = c.R * 1.3;
      const thEnd = c.thMid + c.dir * (3 - (NJ - 1)) * (this.segLen / c.R);
      for (let i = 0; i < TAIL_N; i++) {
        const th = thEnd - c.dir * (i * this.tailSeg) / R2 - c.dir * 0.25;
        t[i] = lerpP(t[i], add(c.centre, polar(th, R2 * (1 - 0.1 * i / TAIL_N))), ease(p.curl));
      }
    }
  }

  footTarget(L) {
    const gi = L.g === 0 ? 2 : 6, sp = this.spine, p = this.pose;
    const a = this._fwd[gi], reach = this.legA + this.legB;
    let lat = this._w[gi] * (0.55 + p.crouch * 0.2);
    let fwd = L.g === 0 ? reach * 0.32 : reach * 0.05;
    if (p.sit > 0.01) {
      fwd += ((L.g === 0 ? reach * 0.45 : reach * 0.8) - fwd) * p.sit;
      lat *= L.g === 0 ? 1 - 0.35 * p.sit : 1 + 0.12 * p.sit;
    }
    let target = add(add(sp[gi], polar(a, fwd)), polar(a + L.side * Math.PI / 2, lat));
    if (p.curl > 0.01) target = lerpP(target, add(sp[gi], polar(a + L.side * Math.PI / 2, lat * 0.2)), p.curl);
    return target;
  }

  solveLegs(f) {
    const reach = this.legA + this.legB;
    const moving = this.speed > 0.15 * this.U;
    const stepDist = reach * (moving ? 0.55 : 0.2);
    const dur = clamp(14 - (this.speed / this.U) * 1.9, 4, 14);
    const group = (i) => (i === 0 || i === 3 ? 0 : 1);
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const target = this.footTarget(L);
      if (!L.stepping) {
        const d = dist(L.foot, target);
        const otherBusy = this.legs.some((o, j) => group(j) !== group(i) && o.stepping);
        if ((d > stepDist && !otherBusy) || d > reach * 1.7) { L.stepping = true; L.t = 0; L.dur = dur; L.from = { ...L.foot }; }
      }
      if (L.stepping) {
        const to = add(target, this.vel, L.dur * 0.45);
        L.t += f / L.dur;
        L.foot = lerpP(L.from, to, ease(Math.min(1, L.t)));
        L.lift = Math.sin(Math.PI * Math.min(1, L.t));
        if (L.t >= 1) { L.stepping = false; L.lift = 0; this.planted.push({ x: L.foot.x, y: L.foot.y, a: this.heading, front: L.g === 0 }); }
      }
    }
  }

  // ---------------------------------------------------------------- geometry
  headCentre() { return add(this.spine[0], polar(this._fwd[0], this.headL * 0.3)); }
  headAngle() { return this._fwd[0] + this.lookAng; }

  bodyPoint(s, t) {
    const f = clamp(s, 0, 1) * (NJ - 1), i = Math.min(NJ - 2, Math.floor(f)), k = f - i;
    const p = lerpP(this.spine[i], this.spine[i + 1], k);
    const a = this._fwd[i] + angDiff(this._fwd[i + 1], this._fwd[i]) * k;
    const w = this._w[i] * (1 - k) + this._w[i + 1] * k;
    return { p: add(p, polar(a + Math.PI / 2, t * w)), a, w };
  }

  bodyOutline() {
    const sp = this.spine, L = [], R = [];
    for (let i = 0; i < NJ; i++) {
      L.push(add(sp[i], polar(this._fwd[i] - Math.PI / 2, this._w[i])));
      R.push(add(sp[i], polar(this._fwd[i] + Math.PI / 2, this._w[i])));
    }
    const front = add(sp[0], polar(this._fwd[0], this._w[0] * 0.9));
    const rear = add(sp[NJ - 1], polar(this._fwd[NJ - 1] + Math.PI, this._w[NJ - 1] * 1.1));
    return [front, ...L, rear, ...R.reverse()];
  }

  legGeom(i) {
    const L = this.legs[i], gi = L.g === 0 ? 2 : 6, a = this._fwd[gi];
    const out = a + L.side * Math.PI / 2;
    const hip = add(this.spine[gi], polar(out, this._w[gi] * 0.5));
    let foot = L.foot;
    const A = this.legA, B = this.legB;
    let d = dist(hip, foot);
    const maxD = (A + B) * 0.98;
    if (d > maxD) { foot = add(hip, polar(angTo(hip, foot), maxD)); d = maxD; }
    d = Math.max(d, Math.abs(A - B) + 0.5);
    const base = angTo(hip, foot);
    const bend = Math.acos(clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1));
    const k1 = add(hip, polar(base + bend, A)), k2 = add(hip, polar(base - bend, A));
    const o = polar(out, 1);
    const knee = (k1.x - hip.x) * o.x + (k1.y - hip.y) * o.y > (k2.x - hip.x) * o.x + (k2.y - hip.y) * o.y ? k1 : k2;
    return { hip, knee, foot, lift: L.lift, front: L.g === 0 };
  }

  palette() {
    const g = this.g, m = this.m, base = g.coat.base;
    return {
      base,
      mark: mix(base, g.coat.mark, g.contrast * m.pattern),
      markFull: g.coat.mark,
      light: g.coat.light,
      eye: mix(KITTEN_EYE, g.eye, smooth01(0.25, 1.5, this.age)),
      inner: mix([232, 160, 150], base, 0.25),
      nose: lum(base) > 0.45 ? [214, 128, 120] : [70, 52, 50],
      sock: [244, 240, 232],
    };
  }

  // ---------------------------------------------------------------- drawing
  // A soft cast shadow from the real silhouette: three stacked, slightly grown passes
  // instead of a blur filter, which is far too slow to run every frame.
  drawShadow(ctx, dx, dy, alpha) {
    const body = closedSmooth(this.bodyOutline());
    const hc = this.headCentre();
    ctx.save();
    ctx.translate(dx, dy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [grow, a] of [[6, 0.25], [3, 0.35], [0, 0.4]]) {
      const g = grow * this.U;
      ctx.fillStyle = ctx.strokeStyle = `rgba(20,40,20,${alpha * a})`;
      ctx.lineWidth = g * 2;
      ctx.fill(body); if (g) ctx.stroke(body);
      ctx.beginPath(); ctx.ellipse(hc.x, hc.y, this.headL * 0.55 + g, this.headW * 0.95 + g, this.headAngle(), 0, TAU); ctx.fill();
      ctx.lineWidth = this.tailWidth(4) + g * 2;
      traceOpen(ctx, this.tail); ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, alpha = 1) {
    const c = this.palette();
    ctx.save();
    ctx.globalAlpha = alpha;
    this.drawShadow(ctx, 6 * this.U, 9 * this.U, 0.26);
    this.drawLegs(ctx, c, [2, 3]);
    this.drawTail(ctx, c);
    this.drawLegs(ctx, c, [0, 1]);
    this.drawBody(ctx, c);
    this.drawHead(ctx, c);
    ctx.restore();
  }

  drawLegs(ctx, c, which) {
    ctx.lineCap = 'round';
    for (const i of which) {
      const G = this.legGeom(i);
      const upper = shade(c.base, G.front ? 0.93 : 0.87);
      const lower = this.g.socks ? c.sock : shade(c.base, 0.9);
      const wU = this.hw * (G.front ? 0.4 : 0.52), wL = this.hw * 0.3, edge = Math.max(1, 1.4 * this.U * this.size);
      const a = angTo(G.knee, G.foot), pr = this.hw * 0.22 * (1 + G.lift * 0.3);
      ctx.strokeStyle = 'rgba(34,64,90,0.6)';
      ctx.fillStyle = 'rgba(34,64,90,0.6)';
      ctx.lineWidth = wU + edge * 2;
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.stroke();
      ctx.lineWidth = wL + edge * 2;
      ctx.beginPath(); ctx.moveTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(G.foot.x, G.foot.y, pr * 1.2 + edge, pr + edge, a, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(upper); ctx.lineWidth = wU;
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.stroke();
      ctx.strokeStyle = rgba(lower); ctx.lineWidth = wL;
      ctx.beginPath(); ctx.moveTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
      ctx.fillStyle = rgba(lower);
      ctx.beginPath(); ctx.ellipse(G.foot.x, G.foot.y, pr * 1.2, pr, a, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(shade(lower, 0.6), 0.45);
      ctx.lineWidth = Math.max(0.6, 0.9 * this.U * this.size);
      for (let k = -1; k <= 1; k++) {
        const tp = add(G.foot, polar(a + k * 0.5, pr * 0.85)), tq = add(tp, polar(a + k * 0.5 + Math.PI, pr * 0.35));
        ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tq.x, tq.y); ctx.stroke();
      }
    }
  }

  tailWidth(i) {
    const k = i / (TAIL_N - 1);
    return this.hw * 0.44 * (1 - k * 0.42) * (1 + this.pose.puff * 1.3) * (0.85 + 0.15 * this.g.fluff * this.m.fluff + 0.1 * this.m.fluff);
  }

  drawTail(ctx, c) {
    const t = this.tail;
    ctx.lineCap = 'round';
    for (let i = 0; i < TAIL_N - 1; i++) {
      const k = i / (TAIL_N - 1);
      ctx.strokeStyle = rgba(this.g.tailTipDark && k > 0.82 ? c.mark : c.base);
      ctx.lineWidth = this.tailWidth(i);
      ctx.beginPath(); ctx.moveTo(t[i].x, t[i].y); ctx.lineTo(t[i + 1].x, t[i + 1].y); ctx.stroke();
    }
    if (this.pose.puff > 0.3) {
      ctx.strokeStyle = rgba(c.base, this.pose.puff);
      ctx.lineWidth = 1.4 * this.U * this.size;
      for (let i = 1; i < TAIL_N; i++) {
        const a = angTo(t[i - 1], t[i]), w = this.tailWidth(i - 1) * 0.6;
        for (const s of [-1, 1]) {
          const b = add(t[i], polar(a + s * Math.PI / 2, w * 0.6)), e = add(b, polar(a + s * 1.2, w * 0.7));
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = rgba(c.mark, 0.9);
    for (let r = 0; r < this.g.tailRings; r++) {
      const f = 0.22 + (r / this.g.tailRings) * 0.66;
      const idx = Math.floor(f * (TAIL_N - 1));
      const q = lerpP(t[idx], t[idx + 1], f * (TAIL_N - 1) - idx);
      const a = angTo(t[idx], t[idx + 1]), w = this.tailWidth(idx) * 0.42;
      ctx.lineWidth = this.tailWidth(idx) * 0.28;
      const p1 = add(q, polar(a + Math.PI / 2, w)), p2 = add(q, polar(a - Math.PI / 2, w)), cp = add(q, polar(a, -w * 0.4));
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y); ctx.stroke();
    }
  }

  drawBody(ctx, c) {
    const path = closedSmooth(this.bodyOutline());
    ctx.fillStyle = rgba(c.base);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    this.drawMarks(ctx, c);
    // volume: darker flanks, warm light along the spine
    ctx.strokeStyle = rgba(shade(c.base, 0.66), 0.5); ctx.lineWidth = this.hw * 0.75; ctx.stroke(path);
    ctx.strokeStyle = rgba(shade(c.base, 0.8), 0.35); ctx.lineWidth = this.hw * 1.3; ctx.stroke(path);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, a] of [[1.0, 0.1], [0.65, 0.12], [0.35, 0.14]]) {
      ctx.strokeStyle = rgba(c.light, a); ctx.lineWidth = this.hw * w; traceOpen(ctx, this.spine); ctx.stroke();
    }
    ctx.restore();
    this.strokeEdge(ctx, path, c);
    if (this.m.fluff > 0.5) this.drawFuzz(ctx, c);
    if (this.m.ruff > 0.05) this.drawRuff(ctx, c);
  }

  // Kitten fuzz: soft tufts all around the outline, fading out as it grows.
  drawFuzz(ctx, c) {
    const k = (this.m.fluff - 0.5) * 2;
    const out = this.bodyOutline();
    ctx.strokeStyle = rgba(mix(c.base, c.light, 0.4), 0.85 * k);
    ctx.lineWidth = Math.max(1, 1.6 * this.U);
    ctx.lineCap = 'round';
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length], m = lerpP(a, b, 0.5);
      const n = angTo(a, b) - Math.PI / 2, len = this.hw * 0.16 * k;
      for (const q of [a, m]) {
        const e = add(q, polar(n + Math.sin(i * 3.1 + this.time * 2) * 0.3, len));
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    }
  }

  // Chest ruff: a pale fluffy crescent behind the head, fuller on adults.
  drawRuff(ctx, c) {
    const r = this.m.ruff, sp = this.spine, a = this._fwd[1];
    const centre = lerpP(sp[0], sp[1], 0.6), w = this._w[1] * (1.02 + 0.12 * r);
    ctx.fillStyle = rgba(mix(c.base, c.light, 0.45 + 0.2 * r), 0.55);
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const t = -Math.PI / 2 + (i / 14) * Math.PI;
      const rr = w * (1 + 0.12 * Math.sin(i * 2.7) * r);
      const q = add(centre, polar(a + Math.PI + t * 0.95, rr * (0.55 + 0.45 * Math.abs(Math.sin(t)))));
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath(); ctx.fill();
  }

  // Storybook ink outline, so every coat reads clearly against bright ground.
  strokeEdge(ctx, path, c) {
    ctx.strokeStyle = 'rgba(34,64,90,0.62)';
    ctx.lineWidth = Math.max(1.4, 2.4 * this.U * this.size);
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    if (lum(c.base) < 0.42) {
      ctx.strokeStyle = rgba(mix(c.light, [255, 255, 255], 0.4), 0.32);
      ctx.lineWidth = Math.max(1, 1.6 * this.U * this.size);
      ctx.stroke(path);
    }
  }

  drawMarks(ctx, c) {
    const g = this.g;
    ctx.lineCap = 'round';
    if (g.pattern === 'tabby') {
      ctx.strokeStyle = rgba(c.mark, 0.95); ctx.lineWidth = this.hw * 0.3;
      traceOpen(ctx, this.spine.slice(1)); ctx.stroke();
    }
    for (const mk of g.marks) {
      if (mk.type === 'stripe') {
        ctx.fillStyle = rgba(c.mark, 0.9);
        for (const side of [-1, 1]) {
          let reach = side > 0 ? mk.t1 : -mk.t0;
          if (mk.gap !== null && Math.sign(mk.gap) === side) reach *= 0.55;
          const top = [], bot = [], N = 6, shift = side > 0 ? 0.014 : -0.008;
          for (let k = 0; k <= N; k++) {
            const tt = 0.16 + (k / N) * (reach - 0.16);
            const s = mk.s + shift - mk.chev * (1 - tt * tt) + Math.sin(k * 1.7 + mk.s * 40) * 0.006;
            const half = mk.w * 0.55 * (1 - (k / N) * 0.85);
            top.push(this.bodyPoint(s - half, side * tt).p);
            bot.push(this.bodyPoint(s + half, side * tt).p);
          }
          ctx.fill(closedSmooth([...top, ...bot.reverse()]));
        }
      } else {
        const q = this.bodyPoint(mk.s, mk.t), r = mk.r * this.hw * 1.6;
        if (mk.type === 'spot') {
          ctx.fillStyle = rgba(c.mark, 0.9);
          ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, r, r * mk.ecc, q.a + mk.rot, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = rgba(mix(c.base, c.mark, 0.35), 0.9);
          ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, r, r * mk.ecc, q.a + mk.rot, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(c.mark, 0.95); ctx.lineWidth = r * 0.42;
          ctx.setLineDash([r * 0.9, r * 0.45]); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
  }

  drawEars(ctx, c, L, W) {
    const p = this.pose, g = this.g;
    const e = clamp(p.ear, -0.5, 1);
    const earLen = W * 0.86 * g.earSize * this.m.ear * (1 - 0.3 * clamp(e, 0, 1)) * (1 + 0.1 * clamp(-e, 0, 1));
    for (const s of [-1, 1]) {
      const base = pt(-0.16 * L, s * 0.46 * W);
      const dir = Math.PI - s * (1.0 - 0.55 * e), perp = dir + Math.PI / 2;
      const b1 = add(base, polar(perp, W * 0.36)), b2 = add(base, polar(perp, -W * 0.36));
      const tip = add(base, polar(dir, earLen));
      const m1 = add(lerpP(b1, tip, 0.5), polar(perp, W * 0.06)), m2 = add(lerpP(b2, tip, 0.5), polar(perp, -W * 0.06));
      const ear = new Path2D();
      ear.moveTo(b1.x, b1.y); ear.quadraticCurveTo(m1.x, m1.y, tip.x, tip.y); ear.quadraticCurveTo(m2.x, m2.y, b2.x, b2.y); ear.closePath();
      ctx.fillStyle = rgba(shade(c.base, 0.96)); ctx.fill(ear);
      ctx.save(); ctx.clip(ear);
      const front = Math.cos(perp) > 0 ? b1 : b2;
      ctx.fillStyle = rgba(c.inner, 0.85);
      ctx.beginPath();
      const q1 = lerpP(base, front, 0.15), q2 = lerpP(front, tip, 0.85), q3 = lerpP(base, tip, 0.25);
      ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(c.mark, 0.75);
      ctx.beginPath(); ctx.arc(tip.x, tip.y, earLen * 0.22, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(34,64,90,0.62)'; ctx.lineWidth = Math.max(1.2, 2 * this.U * this.size); ctx.stroke(ear);
      if (this.m.tuft > 0.05) { // lynx-like ear tufts on older cats
        ctx.strokeStyle = rgba(c.markFull, 0.9 * this.m.tuft); ctx.lineWidth = Math.max(1, 1.8 * this.U); ctx.lineCap = 'round';
        const e = add(tip, polar(dir, earLen * 0.32 * this.m.tuft));
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    }
  }

  drawHead(ctx, c) {
    const hc = this.headCentre(), p = this.pose, g = this.g;
    const L = this.headL, W = this.headW * (1 + 0.06 * p.sit) * (1 - 0.04 * p.dip);
    ctx.save();
    ctx.translate(hc.x, hc.y);
    ctx.rotate(this.headAngle());
    const cheek = 1 + 0.08 * this.m.fluff * g.fluff;
    const hp = closedSmooth([pt(0.52 * L, 0), pt(0.4 * L, 0.5 * W), pt(0.1 * L, 0.98 * W * cheek), pt(-0.25 * L, 0.78 * W),
      pt(-0.48 * L, 0.35 * W), pt(-0.5 * L, -0.35 * W), pt(-0.25 * L, -0.78 * W), pt(0.1 * L, -0.98 * W * cheek), pt(0.4 * L, -0.5 * W)]);
    ctx.fillStyle = rgba(c.base); ctx.fill(hp);
    ctx.save(); ctx.clip(hp);
    if (g.pattern === 'tabby') {
      ctx.strokeStyle = rgba(c.mark, 0.9); ctx.lineCap = 'round'; ctx.lineWidth = W * 0.1;
      for (const [a, b] of [[pt(0.18 * L, 0), pt(-0.4 * L, 0)], [pt(0.14 * L, 0.16 * W), pt(-0.38 * L, 0.24 * W)], [pt(0.14 * L, -0.16 * W), pt(-0.38 * L, -0.24 * W)]]) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0.05 * L, s * 0.62 * W); ctx.quadraticCurveTo(-0.08 * L, s * 0.78 * W, -0.18 * L, s * 0.95 * W); ctx.stroke(); }
    } else {
      ctx.fillStyle = rgba(c.mark, 0.85);
      for (const sp of g.headSpots) { ctx.beginPath(); ctx.arc(sp.x * L, sp.y * W, sp.r * W * 1.4, 0, TAU); ctx.fill(); }
    }
    const crown = ctx.createRadialGradient(-0.12 * L, 0, 0, -0.12 * L, 0, 0.75 * L);
    crown.addColorStop(0, rgba(c.light, 0.28)); crown.addColorStop(1, rgba(c.light, 0));
    ctx.fillStyle = crown; ctx.fillRect(-L, -W * 1.5, 2 * L, 3 * W);
    ctx.strokeStyle = rgba(shade(c.base, 0.7), 0.45); ctx.lineWidth = W * 0.35; ctx.stroke(hp);
    ctx.restore();
    this.strokeEdge(ctx, hp, c);
    this.drawEars(ctx, c, L, W);

    ctx.fillStyle = rgba(g.whiteMuzzle ? [246, 242, 236] : c.light, 0.95);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0.36 * L, s * 0.17 * W, 0.13 * L, 0.2 * W, 0, 0, TAU); ctx.fill(); }
    if (p.dip > 0.6 && this.behaviour === 'GROOM') {
      ctx.fillStyle = 'rgba(226,120,130,0.95)';
      ctx.beginPath(); ctx.ellipse(0.5 * L, 0, 0.07 * L, 0.09 * W, 0, 0, TAU); ctx.fill();
    }
    if (p.mouth > 0.05) { // hissing: open mouth with two small fangs
      ctx.fillStyle = 'rgba(120,40,50,0.95)';
      ctx.beginPath(); ctx.ellipse(0.5 * L, 0, 0.09 * L * p.mouth, 0.17 * W * p.mouth, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0.46 * L, sd * 0.1 * W * p.mouth); ctx.lineTo(0.55 * L, sd * 0.07 * W * p.mouth); ctx.lineTo(0.47 * L, sd * 0.03 * W * p.mouth); ctx.closePath(); ctx.fill(); }
    }
    ctx.fillStyle = rgba(c.nose);
    ctx.beginPath(); ctx.moveTo(0.49 * L, 0); ctx.lineTo(0.42 * L, 0.09 * W); ctx.lineTo(0.42 * L, -0.09 * W); ctx.closePath(); ctx.fill();
    if (this.carrying) drawGift(ctx, this.carrying, 0.66 * L, 0, W * 0.55, this.U);
    if (this.m.fluff > 0.7) { // a little tuft on a kitten's crown
      ctx.strokeStyle = rgba(c.base); ctx.lineWidth = Math.max(1.2, 2.2 * this.U); ctx.lineCap = 'round';
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(-0.3 * L, k * 0.08 * W); ctx.quadraticCurveTo(-0.5 * L, k * 0.12 * W, -0.56 * L, k * 0.2 * W + 0.05 * W); ctx.stroke(); }
    }

    const open = Math.min(p.eye, 1 - this.blink);
    const er = W * 0.2 * this.m.eye;
    const rel = this.lookPoint ? angDiff(angTo(hc, this.lookPoint), this.headAngle()) : 0;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(0.14 * L, s * 0.36 * W);
      ctx.rotate(-s * 0.3);
      const rx = er * 0.8, ry = er;
      if (open < 0.08) {
        ctx.strokeStyle = rgba(shade(c.base, 0.35), 0.9); ctx.lineWidth = er * 0.22; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.5, ry, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      } else {
        const eye = new Path2D(); eye.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.fillStyle = 'rgba(25,20,18,0.9)'; ctx.fill(eye);
        ctx.save(); ctx.clip(eye);
        const ir = ctx.createRadialGradient(rx * 0.15, 0, 0, 0, 0, ry * 1.05);
        ir.addColorStop(0, rgba(mix(c.eye, [255, 255, 230], 0.35))); ir.addColorStop(1, rgba(shade(c.eye, 0.7)));
        ctx.fillStyle = ir; ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, 0, TAU); ctx.fill();
        const ox = Math.cos(rel) * rx * 0.15, oy = Math.sin(rel) * ry * 0.3;
        const pw = ry * (0.16 + 0.62 * clamp(p.pupil, 0, 1));
        ctx.fillStyle = 'rgba(12,10,10,0.95)'; ctx.beginPath(); ctx.ellipse(ox, oy, rx * 0.72, Math.min(pw, rx * 0.72), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ox + rx * 0.25, oy - ry * 0.25, er * 0.17, 0, TAU); ctx.fill();
        if (open < 1) {
          ctx.fillStyle = rgba(shade(c.base, 0.92));
          const lid = -rx + 2 * rx * (1 - open);
          ctx.fillRect(-rx * 1.2, -ry * 1.2, lid + rx * 1.2, ry * 2.4);
          ctx.strokeStyle = rgba(shade(c.base, 0.35), 0.8); ctx.lineWidth = er * 0.14;
          ctx.beginPath(); ctx.moveTo(lid, -ry); ctx.quadraticCurveTo(lid + rx * 0.3, 0, lid, ry); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(30,24,20,0.8)'; ctx.lineWidth = er * 0.12; ctx.stroke(eye);
      }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(0.6, 0.9 * this.U * this.size);
    const tw = Math.sin(this.time * 7) * 0.04 - 0.2 * clamp(-p.ear, 0, 1) + 0.25 * clamp(p.ear, 0, 1);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const a = s * (0.75 + k * 0.32 + tw), o = pt(0.38 * L, s * 0.22 * W), len = W * (1.15 + 0.12 * k) * this.m.whisker;
        const e = add(o, polar(a, len)), m = add(o, polar(a - s * 0.12, len * 0.55));
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// Small found objects, drawn the same in the kitten's mouth and on the ground.
export function drawGift(ctx, item, x, y, size, U) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, 1.6 * U);
  ctx.strokeStyle = 'rgba(34,64,90,0.75)';
  if (item === 'pebble') {
    const g = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size * 0.6);
    g.addColorStop(0, '#e8eef2'); g.addColorStop(1, '#7d8c99');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, size * 0.55, size * 0.4, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (item === 'feather') {
    ctx.rotate(0.5);
    ctx.fillStyle = '#f4ecdf'; ctx.beginPath(); ctx.ellipse(0, 0, size * 0.85, size * 0.25, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#a47c55'; ctx.beginPath(); ctx.moveTo(-size * 0.95, 0); ctx.lineTo(size * 0.8, 0); ctx.stroke();
    ctx.fillStyle = '#7a4f2e'; ctx.beginPath(); ctx.ellipse(size * 0.45, 0, size * 0.2, size * 0.2, 0, 0, TAU); ctx.fill();
  } else if (item === 'flower') {
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; ctx.fillStyle = '#f2a9b8'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * size * 0.3, Math.sin(a) * size * 0.3, size * 0.26, size * 0.16, a, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(0, 0, size * 0.16, 0, TAU); ctx.fill();
  } else {
    const g = ctx.createLinearGradient(-size * 0.4, -size * 0.4, size * 0.4, size * 0.4);
    g.addColorStop(0, '#5fd1b8'); g.addColorStop(0.5, '#3a6fd1'); g.addColorStop(1, '#7a3ac2');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, size * 0.42, size * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(0, -size * 0.5); ctx.lineTo(0, size * 0.5); ctx.stroke();
  }
  ctx.restore();
}
