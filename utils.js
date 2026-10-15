// Shared math, colour and path helpers. Everything is drawn with the native
// Canvas 2D context (drawingContext) for gradients, clipping and Path2D.

let U = 1; // world unit: 1 at a 900px-tall screen, rescaled on resize
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
