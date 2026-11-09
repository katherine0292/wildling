// Keepsakes (ADR-016): what a kitten may remember about a returning visitor, and the
// postcard a visitor can take home.
//
// Privacy rules:
//   • Kept only in the visitor's own browser (localStorage), never sent anywhere.
//   • Only facts about the kitten: visits, furthest chapter, gifts found. No video, no
//     hand data, no timings of the visitor's behaviour.
//   • Exhibition (kiosk) mode keeps nothing, so every visitor meets a fresh kitten.
//   • "Forget me" clears it at once.
// The postcard's code carries the same small record, so a visitor can continue at home.

import { KITTENS } from '../core/config.js';

const KEY = 'wildling.keepsakes.v1';
const ROMAN = ['I', 'II', 'III'];
const NAMES = Object.fromEntries(KITTENS.map((k) => [k.id, k.name]));
const SITE = 'https://katherine0292.github.io/wildling/v2/';

const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export class Keepsakes {
  constructor({ kiosk = false } = {}) {
    this.kiosk = kiosk;
    this.data = {};
    if (!kiosk) try { this.data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { this.data = {}; }
  }

  get enabled() { return !this.kiosk; }
  get(kitten) { return this.enabled ? this.data[kitten] ?? null : null; }

  write() { if (this.enabled) try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage blocked: nothing is kept */ } }

  // Called once when a visit reaches the journal.
  record(kitten, { chapter, grown, gifts }) {
    if (!this.enabled) return null;
    const prev = this.data[kitten] ?? { visits: 0, best: 0, gifts: [] };
    const next = {
      visits: prev.visits + 1,
      best: Math.max(prev.best, grown ? 3 : chapter),
      gifts: [...prev.gifts, ...gifts].slice(-12),
      last: new Date().toISOString().slice(0, 10),
    };
    this.data[kitten] = next;
    this.write();
    return next;
  }

  forget() { this.data = {}; try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }

  // ?adopt=… from a postcard: merge it in, keeping whichever record has more visits.
  importFrom(param) {
    if (!this.enabled || !param) return null;
    try {
      const r = JSON.parse(unb64(param));
      if (!NAMES[r.k]) return null;
      const cur = this.data[r.k];
      if (!cur || (r.n | 0) > cur.visits) this.data[r.k] = { visits: Math.min(50, r.n | 0), best: Math.min(3, r.c | 0), gifts: (r.g ?? []).slice(-12), last: r.d ?? null };
      this.write();
      return r.k;
    } catch { return null; }
  }

  linkFor(kitten, rec) {
    return `${SITE}?kitten=${kitten}&adopt=${b64(JSON.stringify({ k: kitten, n: rec.visits, c: rec.best, g: rec.gifts.slice(-4), d: rec.last }))}`;
  }

  badge(kitten) {
    const r = this.get(kitten);
    if (!r) return '';
    return `Met ${r.visits}× · ${r.best >= 3 ? 'grown' : `Chapter ${ROMAN[Math.min(2, r.best)]}`}${r.gifts.length ? ` · ${r.gifts.length} gift${r.gifts.length > 1 ? 's' : ''}` : ''}`;
  }
}

// ---------------------------------------------------------------- postcard
// A 1500 × 1000 card: up to three photos from the visit, the journal, chapter stamps and
// a code to continue at home. Drawn on a canvas and saved as PNG, so it works offline.
export function drawPostcard({ kitten, title, sub, lines, photos, chapter, grown, link }) {
  const W = 1500, H = 1000, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf3e3'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#e6bfae'; x.lineWidth = 5; x.setLineDash([18, 14]);
  roundRect(x, 28, 28, W - 56, H - 56, 40); x.stroke(); x.setLineDash([]);

  // photos as tilted polaroids on the left
  const shots = photos.slice(-3);
  shots.forEach((p, i) => {
    const px = 100 + i * 36, py = 80 + i * 280, s = 250;
    x.save(); x.translate(px + s / 2, py + s / 2); x.rotate([-0.06, 0.05, -0.03][i]);
    x.shadowColor = 'rgba(34,64,90,0.25)'; x.shadowBlur = 18; x.shadowOffsetY = 8;
    x.fillStyle = '#fff'; x.fillRect(-s / 2 - 14, -s / 2 - 14, s + 28, s + 70);
    x.shadowColor = 'transparent';
    x.drawImage(p.canvas, -s / 2, -s / 2, s, s);
    x.fillStyle = '#4c6478'; x.font = '700 24px Fredoka, Nunito, sans-serif'; x.textAlign = 'center';
    x.fillText(p.caption, 0, s / 2 + 40);
    x.restore();
  });
  if (!shots.length) { x.fillStyle = '#f4e7cf'; roundRect(x, 90, 140, 420, 420, 30); x.fill(); }

  // words on the right
  const L = 600;
  x.textAlign = 'left';
  x.fillStyle = '#8fb57f'; x.font = '700 26px Fredoka, Nunito, sans-serif';
  x.fillText('WILDLING · FIELD JOURNAL', L, 140);
  x.fillStyle = '#22405a'; x.font = '700 66px Fredoka, Nunito, sans-serif';
  x.fillText(title, L, 220);
  x.fillStyle = '#4c6478'; x.font = '600 30px Nunito, sans-serif';
  x.fillText(sub, L, 270);
  x.strokeStyle = '#e6bfae'; x.setLineDash([12, 10]); x.lineWidth = 3;
  x.beginPath(); x.moveTo(L, 305); x.lineTo(W - 90, 305); x.stroke(); x.setLineDash([]);
  x.font = '700 34px Fredoka, Nunito, sans-serif'; x.fillStyle = '#22405a';
  let y = 370;
  for (const l of lines) {
    x.fillStyle = '#e57f73'; heart(x, L + 14, y - 12, 13);
    x.fillStyle = '#22405a';
    y = wrap(x, l, L + 48, y, W - 90 - (L + 48), 44) + 62;
  }
  // chapter stamps
  ['Forest', 'Snowfields', 'Desert'].forEach((n, i) => {
    const done = grown || i <= chapter, cx = L + 70 + i * 170, cy = H - 170;
    x.save(); x.translate(cx, cy); x.rotate(-0.1 + i * 0.08);
    x.strokeStyle = done ? '#8fb57f' : '#d9cdb8'; x.lineWidth = 5; x.setLineDash(done ? [] : [8, 8]);
    x.beginPath(); x.arc(0, 0, 62, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.fillStyle = done ? '#8fb57f' : '#c9bda8'; x.textAlign = 'center';
    x.font = '700 40px Fredoka, Nunito, sans-serif'; x.fillText(ROMAN[i], 0, 6);
    x.font = '800 14px Nunito, sans-serif'; x.fillText(n.toUpperCase(), 0, 34);
    x.restore();
  });
  // a code to continue at home
  if (link && typeof window.qrcode === 'function') {
    const q = window.qrcode(0, 'M'); q.addData(link); q.make();
    const n = q.getModuleCount(), size = 190, cell = size / n, qx = W - 90 - size, qy = H - 90 - size;
    x.fillStyle = '#fff'; roundRect(x, qx - 14, qy - 14, size + 28, size + 28, 16); x.fill();
    x.fillStyle = '#22405a';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(qx + k * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    x.fillStyle = '#4c6478'; x.font = '700 20px Nunito, sans-serif'; x.textAlign = 'right';
    x.fillText(`Scan to visit ${NAMES[kitten]} again`, qx + size, qy - 26);
  }
  x.fillStyle = '#8193a1'; x.font = '600 20px Nunito, sans-serif'; x.textAlign = 'left';
  x.fillText(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }), L, H - 60);
  return c;
}

function roundRect(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); }
function heart(x, cx, cy, s) {
  x.beginPath(); x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9); x.fill();
}
function wrap(x, text, left, y, max, lh) {
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > max && line) { x.fillText(line, left, y); line = w; y += lh; } else line = t;
  }
  x.fillText(line, left, y);
  return y;
}
