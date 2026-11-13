// Prototype A's three habitats (prototypes/a-autonomous-life/world.js), brought into the V2
// build as its worlds: the jungle clearing, the snowfields and the desert. The painting code is Prototype A's, unchanged apart from two
// seams: the world unit U and p5's noise are handed in by the renderer, because V2 runs p5
// in instance mode. Everything is drawn with the plain Canvas 2D context.
//
//   ground      painted once (jungle: soil, roots, leaf litter, ferns; snow: drifts, ice, pines;
//               desert: sand ripples, cracked clay, agaves and barrels)
//   drawUnder   every frame: light on the ground (jungle dapples, snow glints, heat shimmer)
//   drawOver    every frame: what stands above the kitten (canopy, falling snow, desert plants)
//   vignette    a falloff at the edges, tinted per habitat

let U = 1;
let noise = () => 0.5;
let noiseSeed = () => {};

export const HABITATS = ['jungle', 'snow', 'desert'];

export function createBiome(kind, w, h, { unit, p5 }) {
  U = unit;
  noise = (...a) => p5.noise(...a);
  noiseSeed = (s) => p5.noiseSeed(s);
  const b = kind === 'snow' ? new SnowBiome() : kind === 'desert' ? new DesertBiome() : new JungleBiome();
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

// --------------------------------------------------------------- SNOW
class SnowBiome extends Biome {
  constructor() {
    super({
      key: 'snow', name: 'The Snowfields', shortName: 'snowfields', seed: 27,
      preyKind: 'bird', preyName: 'snow bunting', preyCount: 3,
      energyDrain: 1.35, speedMul: 0.88, pupilBias: -0.12, prints: true, printRGB: [104, 128, 168],
      shadowRGB: [56, 80, 128], shadowAlpha: 0.3, shadowOff: { x: 6, y: 9 },
      vignetteRGB: [70, 92, 132], vignetteA: 0.38, plantShadow: { x: 46, y: 34 }, plantShadowA: 0.3,
      uiTint: '#bfe0ff', uiGlass: 'rgba(22,34,58,0.68)', fadeRGB: [252, 228, 186]
    });
  }

  paintGround(ctx, w, h) {
    const r = this.rand, A = (w * h) / (1440 * 900);
    paintField(ctx, w, h, 4, (x, y) => {
      const n1 = noise(x * 0.003 + 300, y * 0.003), n2 = noise(x * 0.015 + 400, y * 0.015 + 400);
      let c = mixRGB([238, 243, 250], [192, 208, 230], smooth01(0.3, 0.75, n1) * 0.85);
      return mixRGB(c, [255, 255, 255], smooth01(0.6, 0.85, n2) * 0.6);
    });
    // Ice patches.
    for (let i = 0; i < 2; i++) {
      const p = edgeBiased(r, w, h, 0.25), rr = (90 + r() * 70) * U;
      const path = closedSmoothPath(blobPoints(p.x, p.y, rr, 12, 0.22, r));
      const g = ctx.createRadialGradient(p.x - rr * 0.3, p.y - rr * 0.3, 0, p.x, p.y, rr * 1.2);
      g.addColorStop(0, 'rgb(214,238,248)'); g.addColorStop(1, 'rgb(156,196,224)');
      ctx.fillStyle = g; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.9 * U;
      for (let k = 0; k < 14; k++) {
        let q = pt(p.x + (r() - 0.5) * rr * 1.6, p.y + (r() - 0.5) * rr * 1.4);
        ctx.beginPath(); ctx.moveTo(q.x, q.y);
        let a = r() * FULL_TURN;
        for (let s = 0; s < 5; s++) { a += (r() - 0.5) * 1.2; q = addP(q, polar(a, (8 + r() * 20) * U)); ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 7 * U;
      for (let k = 0; k < 3; k++) { const o = (k - 1) * 30 * U; ctx.beginPath(); ctx.moveTo(p.x - rr + o, p.y + rr * 0.5); ctx.lineTo(p.x + o, p.y - rr * 0.5); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3 * U; ctx.stroke(path);
    }
    // Soft wind-carved drifts: wide, faint, mostly parallel.
    for (let i = 0; i < Math.round(28 * A); i++) {
      const p = pt(r() * w, r() * h), len = (160 + r() * 260) * U, a = -0.3 + (r() - 0.5) * 0.25;
      const e = addP(p, polar(a, len)), c = addP(lerpP(p, e, 0.5), polar(a + Math.PI / 2, (r() - 0.5) * 50 * U));
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(160,182,214,0.16)'; ctx.lineWidth = 9 * U;
      ctx.beginPath(); ctx.moveTo(p.x + 3 * U, p.y + 5 * U); ctx.quadraticCurveTo(c.x + 3 * U, c.y + 5 * U, e.x + 3 * U, e.y + 5 * U); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 6 * U;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(c.x, c.y, e.x, e.y); ctx.stroke();
    }
    // Stones with snow caps.
    for (let i = 0; i < Math.round(9 * A); i++) {
      const p = edgeBiased(r, w, h, 0.4), rr = (10 + r() * 20) * U;
      drawStone(ctx, p.x, p.y, rr, r, [[132, 138, 148], [80, 86, 98]], 'rgba(80,104,150,0.35)', pt(4 * U, 7 * U));
      ctx.fillStyle = 'rgba(250,252,255,0.97)';
      ctx.fill(closedSmoothPath(blobPoints(p.x - rr * 0.15, p.y - rr * 0.25, rr * 0.72, 9, 0.2, r)));
    }
    // Dry grass poking through, all bent the same way by the wind.
    for (let i = 0; i < Math.round(22 * A); i++) {
      const p = edgeBiased(r, w, h, 0.45);
      for (let k = 0; k < 7 + Math.floor(r() * 6); k++) {
        const base = addP(p, pt((r() - 0.5) * 8 * U, (r() - 0.5) * 6 * U));
        const a = -0.35 + (r() - 0.5) * 0.6, l = (10 + r() * 16) * U;
        const e = addP(base, polar(a, l)), m = addP(lerpP(base, e, 0.5), polar(a - Math.PI / 2, l * 0.18));
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(110,130,170,0.25)'; ctx.lineWidth = 1.6 * U;
        ctx.beginPath(); ctx.moveTo(base.x + 1.5 * U, base.y + 2 * U); ctx.quadraticCurveTo(m.x + 1.5 * U, m.y + 2 * U, e.x + 1.5 * U, e.y + 2 * U); ctx.stroke();
        ctx.strokeStyle = rgba(mixRGB([150, 120, 74], [206, 180, 120], r()));
        ctx.lineWidth = 1.3 * U;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y); ctx.stroke();
      }
    }
    for (let i = 0; i < Math.round(800 * A); i++) {
      ctx.fillStyle = r() < 0.7 ? `rgba(255,255,255,${0.6 + r() * 0.4})` : 'rgba(196,222,255,0.8)';
      ctx.beginPath(); ctx.arc(r() * w, r() * h, (0.5 + r() * 0.9) * U, 0, FULL_TURN); ctx.fill();
    }
  }

  setupLive(w, h) {
    const r = this.rand, A = (w * h) / (1440 * 900);
    this.plants = [];
    const n = Math.round(8 * Math.sqrt(A));
    for (let i = 0; i < n; i++) {
      const R = (95 + r() * 85) * U, a = edgeAnchor(r, w, h, -R * 0.15);
      const sprite = makeSprite(R * 2.3, R * 2.3, R * 1.15, R * 1.15, ctx => this.drawPine(ctx, R, r));
      this.plants.push({ sprite, shadow: silhouetteOf(sprite, 'rgb(60,86,140)'), x: a.x, y: a.y, ang: r() * FULL_TURN, rot: 0, phase: r() * 10, scale: 1 });
    }
    this.flakes = Array.from({ length: Math.round(240 * A) }, () => ({ x: r() * w, y: r() * h, z: 0.3 + r() * 1.2, ph: r() * 10 }));
    this.twinkles = Array.from({ length: 90 }, () => ({ x: r() * w, y: r() * h, f: 0.6 + r() * 1.5, ph: r() * 10 }));
  }

  drawPine(ctx, R, r) {
    for (let l = 0; l < 6; l++) {
      const rr = R * (1 - l * 0.16), n = 9 + Math.floor(r() * 3), off = r() * FULL_TURN, pts = [];
      for (let k = 0; k < n * 2; k++) {
        const a = off + (k * Math.PI) / n;
        pts.push(polar(a, k % 2 === 0 ? rr * (0.9 + r() * 0.15) : rr * (0.55 + r() * 0.1)));
      }
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      ctx.fillStyle = rgba(mixRGB([20, 48, 44], [52, 98, 78], l / 5)); ctx.fill();
      ctx.strokeStyle = 'rgba(8,26,22,0.4)'; ctx.lineWidth = 1.5 * U; ctx.stroke();
      ctx.fillStyle = 'rgba(250,252,255,0.92)';
      for (let k = 0; k < n * 2; k += 2) {
        const q = pts[k], a = Math.atan2(q.y, q.x);
        if (Math.cos(a + 2.3) > 0.1) { ctx.beginPath(); ctx.ellipse(q.x * 0.84, q.y * 0.84, rr * 0.13, rr * 0.07, a, 0, FULL_TURN); ctx.fill(); }
      }
    }
    ctx.fillStyle = 'rgb(250,252,255)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.07, 0, FULL_TURN); ctx.fill();
  }

  drawUnder(ctx, t) {
    ctx.save();
    ctx.strokeStyle = '#fff';
    for (const s of this.twinkles) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.f + s.ph)), 10);
      if (a < 0.05) continue;
      ctx.globalAlpha = a; ctx.lineWidth = 1 * U;
      const k = 4 * U * a;
      ctx.beginPath(); ctx.moveTo(s.x - k, s.y); ctx.lineTo(s.x + k, s.y); ctx.moveTo(s.x, s.y - k); ctx.lineTo(s.x, s.y + k); ctx.stroke();
    }
    ctx.restore();
  }

  drawOver(ctx, t, dt) {
    this.drawPlants(ctx, t, false);
    const wind = 0.45 + 0.35 * noise(t * 0.1, 77);
    ctx.save();
    for (const f of this.flakes) {
      f.x += (wind + 0.1) * f.z * U * dt;
      f.y += (0.5 * f.z * U + Math.sin(t * 1.4 + f.ph) * 0.2 * U) * dt;
      if (f.x > this.w + 10) f.x -= this.w + 20;
      if (f.y > this.h + 10) f.y -= this.h + 20;
      const big = f.z > 1.25;
      ctx.fillStyle = big ? 'rgba(255,255,255,0.35)' : `rgba(255,255,255,${0.55 + f.z * 0.25})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, (big ? 3.5 : 1.4) * f.z * U, 0, FULL_TURN); ctx.fill();
    }
    ctx.restore();
  }
}

// --------------------------------------------------------------- DESERT
class DesertBiome extends Biome {
  constructor() {
    super({
      key: 'desert', name: 'The Desert', shortName: 'desert', seed: 53,
      preyKind: 'beetle', preyName: 'beetle', preyCount: 3,
      energyDrain: 1.2, speedMul: 1, pupilBias: -0.22, prints: true, printRGB: [146, 98, 56],
      shadowRGB: [96, 50, 20], shadowAlpha: 0.42, shadowOff: { x: 15, y: 9 },
      vignetteRGB: [96, 42, 12], vignetteA: 0.42, plantShadow: { x: 40, y: 22 }, plantShadowA: 0.36, longShadow: true,
      uiTint: '#ffd9a0', uiGlass: 'rgba(44,24,10,0.52)', fadeRGB: [34, 24, 44]
    });
  }

  paintGround(ctx, w, h) {
    const r = this.rand, A = (w * h) / (1440 * 900);
    paintField(ctx, w, h, 4, (x, y) => {
      const n1 = noise(x * 0.0025 + 700, y * 0.0025), n2 = noise(x * 0.012 + 800, y * 0.012);
      const sun = 1 - (x / w * 0.25 + y / h * 0.35);
      const c = mixRGB([212, 162, 100], [238, 198, 140], smooth01(0.3, 0.7, n1));
      return shadeRGB(c, 0.9 + 0.14 * sun + (n2 - 0.5) * 0.12);
    });
    // Cracked clay pans.
    for (let i = 0; i < 2; i++) {
      const p = edgeBiased(r, w, h, 0.3), rr = (100 + r() * 70) * U;
      const path = closedSmoothPath(blobPoints(p.x, p.y, rr, 12, 0.2, r));
      ctx.fillStyle = 'rgba(206,150,100,0.85)'; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      ctx.strokeStyle = 'rgba(112,66,38,0.55)'; ctx.lineWidth = 1.3 * U;
      for (let k = 0; k < 26; k++) {
        let q = pt(p.x + (r() - 0.5) * rr * 2, p.y + (r() - 0.5) * rr * 2), a = r() * FULL_TURN;
        ctx.beginPath(); ctx.moveTo(q.x, q.y);
        for (let s = 0; s < 4; s++) { a += (r() - 0.5) * 1.4; q = addP(q, polar(a, (14 + r() * 22) * U)); ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(226,186,130,0.6)'; ctx.lineWidth = 10 * U; ctx.stroke(path);
    }
    // Wind ripples.
    const step = 12 * U;
    for (let y0 = -20 * U; y0 < h + 20 * U; y0 += step) {
      const pts = [];
      for (let x = -10; x <= w + 10; x += 10 * U) {
        const y = y0 + Math.sin(x * 0.018 / U + noise(y0 * 0.01) * 6) * 4 * U + (noise(x * 0.003, y0 * 0.006) - 0.5) * 50 * U;
        pts.push(pt(x, y));
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(152,100,54,0.22)'; ctx.lineWidth = 1.7 * U;
      traceOpenSmooth(ctx, pts); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,238,204,0.3)'; ctx.lineWidth = 1.2 * U;
      traceOpenSmooth(ctx, pts.map(q => pt(q.x, q.y - 2 * U))); ctx.stroke();
    }
    const pebbleCols = [[150, 110, 80], [190, 160, 120], [120, 90, 70], [214, 192, 160], [168, 112, 78]];
    for (let i = 0; i < Math.round(170 * A); i++) {
      const x = r() * w, y = r() * h, rr = (1.5 + r() * 3) * U, a = r() * Math.PI;
      ctx.fillStyle = 'rgba(100,60,30,0.35)'; ctx.beginPath(); ctx.ellipse(x + rr * 0.6, y + rr * 0.4, rr, rr * 0.7, a, 0, FULL_TURN); ctx.fill();
      ctx.fillStyle = rgba(pick(pebbleCols, r)); ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.7, a, 0, FULL_TURN); ctx.fill();
    }
    for (let i = 0; i < Math.round(18 * A); i++) {
      const p = edgeBiased(r, w, h, 0.3);
      ctx.strokeStyle = 'rgb(128,108,88)'; ctx.lineWidth = 1.4 * U; ctx.lineCap = 'round';
      let a = r() * FULL_TURN, q = p;
      for (let s = 0; s < 4; s++) {
        const e = addP(q, polar(a, (8 + r() * 12) * U));
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        const b = addP(e, polar(a + (r() < 0.5 ? 0.7 : -0.7), 7 * U));
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        q = e; a += (r() - 0.5) * 0.8;
      }
    }
    // Boulders with long late-afternoon shadows.
    for (let i = 0; i < Math.round(5 * A); i++) {
      const p = edgeBiased(r, w, h, 0.45), rr = (26 + r() * 34) * U;
      const shape = blobPoints(p.x, p.y, rr, 10, 0.2, r), path = closedSmoothPath(shape);
      for (let k = 6; k >= 1; k--) {
        ctx.save(); ctx.translate(rr * 0.16 * k, rr * 0.09 * k);
        ctx.fillStyle = 'rgba(110,58,28,0.09)'; ctx.fill(path); ctx.restore();
      }
      const g = ctx.createRadialGradient(p.x - rr * 0.4, p.y - rr * 0.4, rr * 0.1, p.x, p.y, rr * 1.2);
      g.addColorStop(0, 'rgb(196,124,82)'); g.addColorStop(1, 'rgb(116,60,40)');
      ctx.fillStyle = g; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      ctx.strokeStyle = 'rgba(80,40,24,0.3)'; ctx.lineWidth = 2 * U;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(p.x - rr, p.y + k * rr * 0.3); ctx.quadraticCurveTo(p.x, p.y + k * rr * 0.3 - rr * 0.2, p.x + rr, p.y + k * rr * 0.3); ctx.stroke(); }
      ctx.restore();
    }
  }

  setupLive(w, h) {
    const r = this.rand, A = (w * h) / (1440 * 900);
    this.plants = [];
    const n = Math.round(9 * Math.sqrt(A));
    for (let i = 0; i < n; i++) {
      const kind = i % 3, R = (kind === 1 ? 34 + r() * 22 : 70 + r() * 50) * U;
      const a = edgeAnchor(r, w, h, -R * 0.35);
      const sprite = makeSprite(R * 2.4, R * 2.4, R * 1.2, R * 1.2, ctx =>
        kind === 0 ? this.drawAgave(ctx, R, r) : kind === 1 ? this.drawBarrel(ctx, R, r) : this.drawBush(ctx, R, r));
      this.plants.push({ sprite, shadow: silhouetteOf(sprite, 'rgb(104,54,22)'), x: a.x, y: a.y, ang: r() * FULL_TURN, rot: 0, phase: r() * 10, scale: 1 });
    }
    this.streaks = Array.from({ length: 50 }, () => ({ x: r() * w, y: r() * h, v: 3 + r() * 5, l: 20 + r() * 50 }));
    this.clouds = Array.from({ length: 2 }, () => ({ s: r() * 100, rad: (260 + r() * 200) * U }));
    this.weed = { active: false, next: 8 };
    this.weedSprite = makeSprite(80 * U, 80 * U, 40 * U, 40 * U, ctx => {
      for (let k = 0; k < 70; k++) {
        ctx.strokeStyle = rgba(pick([[150, 120, 86], [118, 94, 66], [176, 146, 104]], r), 0.9);
        ctx.lineWidth = (0.8 + r()) * U;
        const a = r() * FULL_TURN, rad = (8 + r() * 26) * U, sweep = 0.6 + r() * 1.6;
        ctx.beginPath(); ctx.arc((r() - 0.5) * 10 * U, (r() - 0.5) * 10 * U, rad, a, a + sweep); ctx.stroke();
      }
    });
  }

  drawAgave(ctx, R, r) {
    for (let layer = 0; layer < 3; layer++) {
      const n = 9 - layer * 2, L = R * (1 - layer * 0.25), off = r() * FULL_TURN;
      for (let k = 0; k < n; k++) {
        const a = off + (k / n) * FULL_TURN;
        ctx.save(); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, 'rgb(80,112,98)'); g.addColorStop(0.7, 'rgb(128,160,136)'); g.addColorStop(1, 'rgb(150,170,140)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -L * 0.1); ctx.quadraticCurveTo(L * 0.6, -L * 0.14, L, 0); ctx.quadraticCurveTo(L * 0.6, L * 0.14, 0, L * 0.1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(220,226,190,0.45)'; ctx.lineWidth = 1.2 * U; ctx.stroke();
        ctx.fillStyle = 'rgb(60,36,24)'; ctx.beginPath(); ctx.arc(L * 0.97, 0, 2 * U, 0, FULL_TURN); ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgb(96,128,104)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, FULL_TURN); ctx.fill();
  }

  drawBarrel(ctx, R, r) {
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
    g.addColorStop(0, 'rgb(110,156,92)'); g.addColorStop(1, 'rgb(46,84,50)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, FULL_TURN); ctx.fill();
    const ribs = 18;
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * FULL_TURN;
      ctx.strokeStyle = 'rgba(30,60,34,0.45)'; ctx.lineWidth = 1.4 * U;
      const p0 = polar(a, R * 0.18), p1 = polar(a, R * 0.98);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      ctx.fillStyle = 'rgba(240,214,150,0.9)';
      for (let s = 0.3; s < 1; s += 0.17) { const q = polar(a + Math.PI / ribs, R * s); ctx.beginPath(); ctx.arc(q.x, q.y, 1.2 * U, 0, FULL_TURN); ctx.fill(); }
    }
    for (let k = 0; k < 9; k++) {
      ctx.save(); ctx.rotate((k / 9) * FULL_TURN);
      ctx.fillStyle = k % 2 ? 'rgb(240,110,140)' : 'rgb(250,150,170)';
      ctx.beginPath(); ctx.ellipse(R * 0.13, 0, R * 0.12, R * 0.06, 0, 0, FULL_TURN); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgb(250,214,90)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.06, 0, FULL_TURN); ctx.fill();
  }

  drawBush(ctx, R, r) {
    ctx.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      let a = r() * FULL_TURN, q = pt(0, 0);
      ctx.strokeStyle = rgba(pick([[150, 120, 86], [120, 96, 70], [170, 140, 100]], r));
      ctx.lineWidth = (1 + r() * 1.5) * U;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let s = 0; s < 4; s++) { a += (r() - 0.5) * 0.7; q = addP(q, polar(a, R * (0.15 + r() * 0.15))); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      if (r() < 0.5) { ctx.fillStyle = 'rgba(160,150,96,0.9)'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5 * U, 0, FULL_TURN); ctx.fill(); }
    }
  }

  drawUnder(ctx, t) {
    for (const c of this.clouds) {
      const x = ((t * 12 * U + c.s * 37) % (this.w + c.rad * 4)) - c.rad * 2;
      const y = noise(c.s, t * 0.02) * this.h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, c.rad);
      g.addColorStop(0, 'rgba(110,60,30,0.13)'); g.addColorStop(1, 'rgba(110,60,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x - c.rad, y - c.rad, c.rad * 2, c.rad * 2);
    }
  }

  drawOver(ctx, t, dt) {
    this.drawPlants(ctx, t, false);
    const wv = this.weed;
    wv.next -= dt / 60;
    if (!wv.active && wv.next <= 0) Object.assign(wv, { active: true, x: -60 * U, y: this.h * (0.2 + Math.random() * 0.6), vx: (2.6 + Math.random() * 1.5) * U, rot: 0 });
    if (wv.active) {
      wv.x += wv.vx * dt; wv.rot += wv.vx / (34 * U) * dt;
      const hop = Math.abs(Math.sin(t * 3.2)) * 16 * U;
      ctx.fillStyle = 'rgba(100,52,20,0.3)';
      ctx.beginPath(); ctx.ellipse(wv.x + 14 * U, wv.y + 10 * U, 30 * U, 14 * U, 0, 0, FULL_TURN); ctx.fill();
      stampSprite(ctx, this.weedSprite, wv.x, wv.y - hop, wv.rot);
      if (wv.x > this.w + 80 * U) { wv.active = false; wv.next = 20 + Math.random() * 15; }
    }
    ctx.save();
    ctx.lineCap = 'round';
    const gust = 0.6 + 0.6 * noise(t * 0.2, 5);
    for (const s of this.streaks) {
      s.x += s.v * gust * U * dt;
      if (s.x > this.w + 60) { s.x = -60; s.y = Math.random() * this.h; }
      ctx.strokeStyle = `rgba(255,236,200,${0.12 * gust})`; ctx.lineWidth = 1 * U;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.l * U * gust, s.y + 2 * U); ctx.stroke();
    }
    ctx.restore();
  }
}

// =============================================================== Prey

// Small creatures that share each biome with the cat. They wander, notice
// danger (a stalking cat or a fast hand) and escape; the cat hunts them
// when hungry. One species per habitat.

const BUTTERFLY_WINGS = [
  { a: [58, 118, 214], b: [24, 44, 96], spot: [190, 230, 255] },
  { a: [240, 146, 40], b: [60, 30, 12], spot: [255, 240, 210] },
  { a: [246, 214, 72], b: [90, 70, 20], spot: [255, 255, 230] },
  { a: [226, 96, 140], b: [80, 24, 50], spot: [255, 220, 236] }
];
const BEETLE_SHELLS = [[40, 120, 96], [70, 60, 140], [150, 70, 40], [30, 30, 34]];
