// The jungle clearing from Prototype A (prototypes/a-autonomous-life/world.js), brought into
// the V2 build as its world. The painting code is Prototype A's, unchanged apart from two
// seams: the world unit U and p5's noise are handed in by the renderer, because V2 runs p5
// in instance mode. Everything is drawn with the plain Canvas 2D context.
//
//   ground      painted once: soil, roots, leaf litter, clover, mushrooms, ferns, mossy stones
//   drawUnder   every frame: dappled light drifting over the ground
//   drawOver    every frame: big leaves and fronds swaying above the kitten, light shafts
//   vignette    a dark green falloff at the edges

let U = 1;
let noise = () => 0.5;
let noiseSeed = () => {};

export function createJungle(w, h, { unit, p5 }) {
  U = unit;
  noise = (...a) => p5.noise(...a);
  noiseSeed = (s) => p5.noiseSeed(s);
  const b = new JungleBiome();
  b.build(w, h);
  return b;
}

// ---------------------------------------------------------------- Prototype A: utils.js
// Shared math, colour and path helpers. Everything is drawn with the native
// Canvas 2D context (drawingContext) for gradients, clipping and Path2D.

const FULL_TURN = Math.PI * 2;

function angDiff(a, b) {
  let d = (a - b) % FULL_TURN;
  if (d > Math.PI) d -= FULL_TURN;
  if (d < -Math.PI) d += FULL_TURN;
  return d;
}
function clampv(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smooth01(e0, e1, x) {
  const t = clampv((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function approach(cur, target, k) { return cur + (target - cur) * clampv(k, 0, 1); }

function pt(x, y) { return { x, y }; }
function polar(a, r) { return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
function addP(a, b, k = 1) { return { x: a.x + b.x * k, y: a.y + b.y * k }; }
function subP(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function lerpP(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function vdist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function vlen(v) { return Math.hypot(v.x, v.y); }
function angTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function clampMag(v, m) {
  const l = Math.hypot(v.x, v.y);
  return l > m && l > 0 ? { x: v.x / l * m, y: v.y / l * m } : v;
}

function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shadeRGB(c, k) { return c.map(v => clampv(v * k, 0, 255)); }
function rgba(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clampv(a, 0, 1).toFixed(3)})`;
}
function luminance(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

// Seeded PRNG so a genome always regrows the same markings.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth closed outline through control points (quadratic midpoint spline).
function closedSmoothPath(pts) {
  const p = new Path2D();
  const n = pts.length;
  const m0 = lerpP(pts[n - 1], pts[0], 0.5);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const a = pts[i], m = lerpP(a, pts[(i + 1) % n], 0.5);
    p.quadraticCurveTo(a.x, a.y, m.x, m.y);
  }
  p.closePath();
  return p;
}
function traceOpenSmooth(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const m = lerpP(pts[i], pts[i + 1], 0.5);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l.x, l.y);
}

// Irregular rounded blob (stones, ice, clay patches).
function blobPoints(cx, cy, r, n, rough, rand) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * FULL_TURN;
    pts.push(pt(cx + Math.cos(a) * r * (1 - rough + rand() * rough * 2),
                cy + Math.sin(a) * r * (1 - rough + rand() * rough * 2) * 0.85));
  }
  return pts;
}

// Offscreen sprite rendered once at device resolution, then stamped each frame.
function makeSprite(w, h, ax, ay, drawFn) {
  const pd = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * pd); c.height = Math.ceil(h * pd);
  const ctx = c.getContext('2d');
  ctx.scale(pd, pd);
  ctx.translate(ax, ay);
  drawFn(ctx);
  return { canvas: c, w, h, ax, ay };
}
// Same sprite flattened to one colour, used as a cast shadow.
function silhouetteOf(sprite, colour) {
  const c = document.createElement('canvas');
  c.width = sprite.canvas.width; c.height = sprite.canvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(sprite.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, c.width, c.height);
  return { canvas: c, w: sprite.w, h: sprite.h, ax: sprite.ax, ay: sprite.ay };
}
function stampSprite(ctx, s, x, y, rot = 0, scale = 1, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
  ctx.restore();
}

function pick(arr, rand = Math.random) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------- Prototype A: world.js (biomes)
function makeLayer(w, h, pd) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * pd); c.height = Math.ceil(h * pd);
  const ctx = c.getContext('2d');
  ctx.scale(pd, pd);
  return { canvas: c, ctx };
}

// Paint a low-resolution colour field and upscale it: soft organic texture, cheap.
function paintField(ctx, w, h, cell, fn) {
  const cw = Math.ceil(w / cell) + 1, ch = Math.ceil(h / cell) + 1;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const img = g.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const col = fn(x * cell, y * cell), i = (y * cw + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, cw * cell, ch * cell);
}

// Scatter positions that favour the edges so the centre stays readable.
function edgeBiased(rand, w, h, avoid = 0.35) {
  for (let i = 0; i < 25; i++) {
    const x = rand() * w, y = rand() * h;
    const r = Math.max(Math.abs(x / w - 0.5), Math.abs(y / h - 0.5)) * 2;
    if (r > avoid + rand() * 0.25 || rand() < 0.06) return pt(x, y);
  }
  return pt(rand() * w, rand() * h);
}

function edgeAnchor(rand, w, h, out) {
  const side = Math.floor(rand() * 4);
  let x, y;
  if (side === 0) { x = -out; y = rand() * h; }
  else if (side === 1) { x = w + out; y = rand() * h; }
  else if (side === 2) { x = rand() * w; y = -out; }
  else { x = rand() * w; y = h + out; }
  const ang = angTo(pt(x, y), pt(w / 2 + (rand() - 0.5) * w * 0.5, h / 2 + (rand() - 0.5) * h * 0.5)) + (rand() - 0.5) * 0.5;
  return { x, y, ang };
}

function leafPath(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  ctx.closePath();
}

function drawLitterLeaf(ctx, x, y, a, len, wid, col, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  ctx.save(); ctx.translate(1.5 * U, 2 * U);
  ctx.fillStyle = 'rgba(8,14,6,0.28)'; leafPath(ctx, len, wid); ctx.fill();
  ctx.restore();
  ctx.fillStyle = rgba(col, alpha); leafPath(ctx, len, wid); ctx.fill();
  ctx.strokeStyle = rgba(shadeRGB(col, 1.3), alpha * 0.6); ctx.lineWidth = 0.7 * U;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
  ctx.restore();
}

function drawStone(ctx, x, y, r, rand, cols, shadow, sOff) {
  const pts = blobPoints(x, y, r, 10, 0.18, rand);
  const path = closedSmoothPath(pts);
  ctx.save();
  ctx.translate(sOff.x, sOff.y);
  ctx.fillStyle = shadow; ctx.fill(path);
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2);
  g.addColorStop(0, rgba(cols[0])); g.addColorStop(1, rgba(cols[1]));
  ctx.fillStyle = g; ctx.fill(path);
  return path;
}

class Biome {
  constructor(props) { Object.assign(this, props); this.ready = false; }

  build(w, h) {
    this.w = w; this.h = h;
    const pd = Math.min(2, window.devicePixelRatio || 1);
    this.rand = mulberry32(this.seed);
    noiseSeed(this.seed);
    const g = makeLayer(w, h, pd);
    this.paintGround(g.ctx, w, h);
    this.ground = g.canvas;
    const v = makeLayer(w, h, 1);
    const r = Math.hypot(w, h) / 2;
    const vg = v.ctx.createRadialGradient(w / 2, h / 2, r * 0.42, w / 2, h / 2, r);
    vg.addColorStop(0, rgba(this.vignetteRGB, 0)); vg.addColorStop(1, rgba(this.vignetteRGB, this.vignetteA));
    v.ctx.fillStyle = vg; v.ctx.fillRect(0, 0, w, h);
    this.vignette = v.canvas;
    this.setupLive(w, h);
    this.ready = true;
  }

  drawGround(ctx) { ctx.drawImage(this.ground, 0, 0, this.w, this.h); }
  drawVignette(ctx) { ctx.drawImage(this.vignette, 0, 0, this.w, this.h); }
  drawUnder() {}
  drawOver() {}

  drawPlants(ctx, t, sway) {
    const so = this.plantShadow;
    for (const p of this.plants) {
      p.rot = p.ang + (sway ? Math.sin(t * 0.55 + p.phase) * 0.03 + (noise(p.phase, t * 0.15) - 0.5) * 0.07 : 0);
      for (let k = 1; k <= (this.longShadow ? 3 : 1); k++)
        stampSprite(ctx, p.shadow, p.x + so.x * U * k / (this.longShadow ? 2 : 1), p.y + so.y * U * k / (this.longShadow ? 2 : 1), p.rot, p.scale, this.plantShadowA / (this.longShadow ? 2 : 1));
    }
    for (const p of this.plants) stampSprite(ctx, p.sprite, p.x, p.y, p.rot, p.scale);
  }
}

// --------------------------------------------------------------- JUNGLE
class JungleBiome extends Biome {
  constructor() {
    super({
      key: 'jungle', name: 'The Jungle Nursery', shortName: 'jungle', seed: 11,
      preyKind: 'butterfly', preyName: 'butterfly', preyCount: 4,
      energyDrain: 1, speedMul: 1, pupilBias: 0.05, prints: false,
      shadowRGB: [8, 26, 10], shadowAlpha: 0.42, shadowOff: { x: 7, y: 11 },
      vignetteRGB: [6, 20, 8], vignetteA: 0.55, plantShadow: { x: 30, y: 40 }, plantShadowA: 0.34,
      uiTint: '#a8e6a0', uiGlass: 'rgba(10,18,10,0.48)', fadeRGB: [222, 236, 246]
    });
  }

  paintGround(ctx, w, h) {
    const r = this.rand, A = (w * h) / (1440 * 900);
    paintField(ctx, w, h, 4, (x, y) => {
      const n1 = noise(x * 0.0035, y * 0.0035), n2 = noise(x * 0.018 + 50, y * 0.018 + 50), n3 = noise(x * 0.07 + 9, y * 0.07);
      let c = mixRGB([44, 40, 26], [56, 88, 44], smooth01(0.32, 0.66, n1));
      c = mixRGB(c, [86, 122, 56], smooth01(0.55, 0.8, n2) * 0.55);
      return shadeRGB(c, 0.82 + n3 * 0.32);
    });
    // Roots crawling in from the edges.
    for (let i = 0; i < 6; i++) {
      const a = edgeAnchor(r, w, h, 10 * U), len = (180 + r() * 220) * U;
      const c1 = addP(a, polar(a.ang + 0.4, len * 0.4)), e = addP(a, polar(a.ang - 0.2, len));
      for (const [col, lw, off] of [[[34, 26, 18, 0.5], 16, 3], [[70, 52, 34, 1], 12, 0], [[104, 82, 56, 0.8], 5, -2]]) {
        ctx.strokeStyle = rgba(col, col[3]); ctx.lineWidth = lw * U; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y + off * U); ctx.quadraticCurveTo(c1.x, c1.y + off * U, e.x, e.y + off * U); ctx.stroke();
      }
    }
    const leafCols = [[96, 98, 46], [124, 100, 54], [72, 90, 42], [146, 124, 64], [60, 74, 38], [110, 70, 40]];
    for (let i = 0; i < Math.round(560 * A); i++) {
      const len = (9 + r() * 18) * U;
      drawLitterLeaf(ctx, r() * w, r() * h, r() * FULL_TURN, len, len * (0.34 + r() * 0.14), pick(leafCols, r), 0.5 + r() * 0.45);
    }
    // Clover and mushrooms.
    for (let i = 0; i < Math.round(50 * A); i++) {
      const p = edgeBiased(r, w, h, 0.2), rot = r() * FULL_TURN;
      for (let k = 0; k < 3; k++) {
        const q = addP(p, polar(rot + k * FULL_TURN / 3, 3.5 * U));
        ctx.fillStyle = 'rgba(10,20,8,0.3)'; ctx.beginPath(); ctx.arc(q.x + 1 * U, q.y + 1.5 * U, 4 * U, 0, FULL_TURN); ctx.fill();
        ctx.fillStyle = rgba([96, 156, 70]); ctx.beginPath(); ctx.arc(q.x, q.y, 4 * U, 0, FULL_TURN); ctx.fill();
      }
    }
    for (let i = 0; i < Math.round(9 * A); i++) {
      const p = edgeBiased(r, w, h, 0.4);
      for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
        const q = addP(p, polar(r() * FULL_TURN, r() * 14 * U)), rr = (3 + r() * 5) * U;
        ctx.fillStyle = 'rgba(10,16,6,0.35)'; ctx.beginPath(); ctx.arc(q.x + rr * 0.4, q.y + rr * 0.5, rr, 0, FULL_TURN); ctx.fill();
        const g = ctx.createRadialGradient(q.x - rr * 0.3, q.y - rr * 0.3, 0, q.x, q.y, rr);
        g.addColorStop(0, 'rgb(244,228,196)'); g.addColorStop(1, 'rgb(196,150,104)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, FULL_TURN); ctx.fill();
        ctx.fillStyle = 'rgba(150,96,60,0.7)'; ctx.beginPath(); ctx.arc(q.x, q.y, rr * 0.25, 0, FULL_TURN); ctx.fill();
      }
    }
    // Ground ferns.
    for (let i = 0; i < Math.round(16 * A); i++) {
      const p = edgeBiased(r, w, h, 0.45), n = 6 + Math.floor(r() * 4), len = (40 + r() * 45) * U;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * FULL_TURN + r() * 0.4, bend = (r() - 0.5) * 0.6;
        for (let j = 2; j < 13; j++) {
          const s = j / 13, q = addP(p, polar(a + bend * s, len * s)), ll = len * 0.22 * (1 - s * 0.8);
          for (const sd of [-1, 1]) {
            ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(a + bend * s + sd * 1.0);
            ctx.fillStyle = rgba(mixRGB([46, 92, 44], [104, 160, 74], s), 0.95);
            leafPath(ctx, ll, ll * 0.3); ctx.fill(); ctx.restore();
          }
        }
      }
    }
    // Mossy stones.
    for (let i = 0; i < Math.round(6 * A); i++) {
      const p = edgeBiased(r, w, h, 0.45), rr = (18 + r() * 26) * U;
      const path = drawStone(ctx, p.x, p.y, rr, r, [[118, 124, 110], [64, 70, 60]], 'rgba(6,14,6,0.45)', pt(5 * U, 8 * U));
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = 'rgba(92,140,62,0.85)';
      ctx.fill(closedSmoothPath(blobPoints(p.x - rr * 0.2, p.y - rr * 0.3, rr * 0.7, 9, 0.3, r)));
      ctx.restore();
    }
  }

  setupLive(w, h) {
    const r = this.rand;
    this.dapples = Array.from({ length: 9 }, () => ({ s: r() * 1000, rad: (130 + r() * 170) * U }));
    this.plants = [];
    const n = Math.round(13 * Math.sqrt((w * h) / (1440 * 900)));
    for (let i = 0; i < n; i++) {
      const a = edgeAnchor(r, w, h, 20 * U), len = (200 + r() * 170) * U;
      const frond = r() < 0.45;
      const sprite = makeSprite(len * 1.12, len * 0.85, len * 0.06, len * 0.425,
        ctx => frond ? this.drawFrond(ctx, len, r) : this.drawBigLeaf(ctx, len, r));
      this.plants.push({ sprite, shadow: silhouetteOf(sprite, 'rgb(4,18,6)'), x: a.x, y: a.y, ang: a.ang, rot: a.ang, phase: r() * 10, scale: 1 });
    }
    this.shafts = Array.from({ length: 4 }, () => ({ x: r() * w, wdt: (60 + r() * 120) * U, ph: r() * 10 }));
  }

  drawBigLeaf(ctx, len, r) {
    const W = len * (0.25 + r() * 0.08);
    ctx.strokeStyle = 'rgb(40,78,40)'; ctx.lineWidth = len * 0.025; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-len * 0.06, 0); ctx.lineTo(len * 0.14, 0); ctx.stroke();
    const path = new Path2D();
    path.moveTo(len * 0.1, 0);
    path.bezierCurveTo(len * 0.25, -W * 1.3, len * 0.8, -W * 1.05, len, 0);
    path.bezierCurveTo(len * 0.8, W * 1.05, len * 0.25, W * 1.3, len * 0.1, 0);
    const tone = r() * 0.3;
    const g = ctx.createLinearGradient(0, -W, 0, W);
    g.addColorStop(0, rgba(mixRGB([66, 132, 62], [90, 140, 52], tone)));
    g.addColorStop(0.5, rgba(mixRGB([44, 104, 52], [64, 110, 40], tone)));
    g.addColorStop(1, rgba([24, 66, 36]));
    ctx.fillStyle = g; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    ctx.strokeStyle = 'rgba(170,220,150,0.35)'; ctx.lineWidth = len * 0.011;
    ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.quadraticCurveTo(len * 0.55, -W * 0.06, len, 0); ctx.stroke();
    ctx.lineWidth = len * 0.005;
    for (let k = 0; k < 9; k++) {
      const x0 = len * (0.17 + k * 0.085);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 + len * 0.07, s * W * 0.5, x0 + len * 0.15, s * W * 1.1); ctx.stroke();
      }
    }
    const sh = ctx.createRadialGradient(len * 0.45, -W * 0.4, 0, len * 0.45, -W * 0.4, len * 0.5);
    sh.addColorStop(0, 'rgba(255,255,220,0.16)'); sh.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, -W * 1.5, len, W * 3);
    ctx.restore();
    if (r() < 0.6) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) {
        const x = len * (0.26 + k * 0.095);
        for (const s of [-1, 1]) {
          if (r() < 0.25) continue;
          ctx.beginPath(); ctx.moveTo(x, s * W * 1.3); ctx.lineTo(x + len * 0.035, s * W * (0.3 + r() * 0.15)); ctx.lineTo(x + len * 0.06, s * W * 1.3); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawFrond(ctx, len, r) {
    const bend = (r() - 0.5) * 0.5, N = 24;
    let p = pt(0, 0), a = 0;
    const pts = [p];
    for (let k = 1; k <= N; k++) { a = bend * (k / N); p = addP(p, polar(a, len / N)); pts.push(p); }
    for (let k = 2; k <= N; k++) {
      const s = k / N, q = pts[k], aa = bend * s, ll = len * 0.22 * (1 - s * 0.75);
      for (const sd of [-1, 1]) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(aa + sd * (1.05 - s * 0.35));
        const g = ctx.createLinearGradient(0, 0, ll, 0);
        g.addColorStop(0, rgba(mixRGB([36, 88, 44], [70, 130, 60], s)));
        g.addColorStop(1, rgba(mixRGB([70, 132, 62], [120, 176, 86], s)));
        ctx.fillStyle = g; leafPath(ctx, ll, ll * 0.24); ctx.fill(); ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgb(56,98,48)'; ctx.lineWidth = len * 0.014; ctx.lineCap = 'round';
    traceOpenSmooth(ctx, [pt(-len * 0.06, 0), ...pts]); ctx.stroke();
  }

  drawUnder(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const d of this.dapples) {
      const x = noise(d.s, t * 0.03) * this.w * 1.4 - this.w * 0.2;
      const y = noise(d.s + 5, t * 0.03) * this.h * 1.4 - this.h * 0.2;
      const flick = 0.75 + 0.25 * noise(d.s + 9, t * 0.6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, d.rad);
      g.addColorStop(0, `rgba(255,236,160,${0.2 * flick})`); g.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = g; ctx.fillRect(x - d.rad, y - d.rad, d.rad * 2, d.rad * 2);
    }
    ctx.restore();
  }

  drawOver(ctx, t) {
    this.drawPlants(ctx, t, true);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of this.shafts) {
      const a = 0.05 + 0.04 * Math.sin(t * 0.4 + s.ph);
      ctx.save(); ctx.translate(s.x, -50 * U); ctx.rotate(0.35);
      const g = ctx.createLinearGradient(-s.wdt, 0, s.wdt, 0);
      g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, `rgba(255,240,180,${a})`); g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g; ctx.fillRect(-s.wdt, 0, s.wdt * 2, this.h * 1.6);
      ctx.restore();
    }
    ctx.restore();
  }
}
