// BrowserRenderer: draws one state snapshot. It only READS the snapshot;
// nothing here may change needs, trust or memory.
//
// Look: a sunlit storybook clearing. Painted habitats with dappled light, soft
// cartoon outlines, drifting pollen, and the procedural cat body (catbody.js).
//
// Feedback rule (docs/design/experience-spec.md): system uncertainty shows on the
// cursor; the creature's own choices show on the creature's body.

import { KITTENS } from '../core/config.js';
import { CatBody } from './catbody.js';
import { path2d } from './icons.js';

const INK = [34, 64, 90];
const SAGE = [169, 201, 155];
const CREAM = [251, 243, 227];
const COLD = [43, 102, 136];
const KIT = Object.fromEntries(KITTENS.map((k) => [k.id, k]));

export class Renderer {
  constructor(p) {
    this.p = p;
    this.biomes = {};
    this.shownPhase = 'kitten';
    this.prevPhase = null;
    this.fade = 1;
    this.bodies = new Map();
    this.particles = [];
    this.light = null;
  }

  resize() {
    const p = this.p;
    this.S = Math.min(p.width, p.height);
    this.u = this.S / 900;
    p.randomSeed(11); p.noiseSeed(11);
    this.biomes = { kitten: this.makeJungle(), juvenile: this.makeSnow(), adult: this.makeDesert() };
    this.particles = Array.from({ length: 70 }, () => ({ x: Math.random() * p.width, y: Math.random() * p.height, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 10 }));
    for (const b of this.bodies.values()) b.setUnit(this.u);
  }

  px(n) { return { x: n.x * this.p.width, y: n.y * this.p.height }; }

  // ---------------------------------------------------------------- frame
  draw(snap, ui, dt) {
    const p = this.p, ctx = p.drawingContext;
    const c = snap.creature;
    if (c.phase !== this.shownPhase) { this.prevPhase = this.shownPhase; this.shownPhase = c.phase; this.fade = 0; }
    this.fade = Math.min(1, this.fade + dt / 1.5);

    if (this.prevPhase && this.fade < 1) {
      p.image(this.biomes[this.prevPhase], 0, 0);
      ctx.globalAlpha = this.fade; p.image(this.biomes[this.shownPhase], 0, 0); ctx.globalAlpha = 1;
    } else p.image(this.biomes[this.shownPhase], 0, 0);

    for (const f of snap.foods) this.fish(this.px(f.position ?? f), Math.min(1, f.age / 0.3), f.age > 27 ? (30 - f.age) / 3 : 1);

    const st = snap.sessionState;
    const interactive = st === 'ACTIVE';
    const hand = snap.input.position && snap.input.quality !== 'lost' ? this.px(snap.input.position) : null;
    const main = this.px(c.position);

    if (st === 'ATTRACT' || st === 'CONSENT') this.groundMark(main, 1);
    else if (interactive) this.groundMark(main, 0.45);
    if (interactive && snap.activeTool === 'PET' && c.inviting && !c.acceptedContact) this.inviteZone(main);

    const seen = new Set();
    for (const s of snap.litter) { seen.add(s.kitten); this.body(s.kitten, s, null, dt, interactive ? 0.9 : 1); }
    const look = ['OBSERVE', 'APPROACH', 'CONTACT', 'PLAY'].includes(c.behaviour) ? hand : null;
    seen.add(c.kitten);
    this.body(c.kitten, c, look, dt, 1);
    if (c.behaviour === 'REST') this.sleepZ(main);
    if (c.acceptedContact) this.contactRipple(main);
    for (const k of [...this.bodies.keys()]) if (!seen.has(k)) this.bodies.delete(k);

    this.atmosphere(dt);
    this.lighting(main, st);
    if (interactive || st === 'CALIBRATING') this.cursor(snap, ui);
  }

  body(kid, s, look, dt, alpha) {
    const pos = this.px(s.position);
    let b = this.bodies.get(kid);
    if (!b) { b = new CatBody(KIT[kid], this.u, pos.x, pos.y, s.heading); this.bodies.set(kid, b); }
    // The core position is the body's centre; the puppet is driven from its head.
    const lead = b.bodyLen * 0.42;
    b.update(dt, {
      x: pos.x + Math.cos(s.heading) * lead, y: pos.y + Math.sin(s.heading) * lead,
      heading: s.heading, speed: s.speed * this.S, behaviour: s.behaviour, age: s.ageProgress, look,
    });
    b.draw(this.p.drawingContext, alpha);
  }

  // ---------------------------------------------------------------- feedback layers
  groundMark({ x, y }, alpha) {
    const ctx = this.p.drawingContext, u = this.u, t = this.p.millis() / 1000;
    const r = 0.12 * this.S;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(255,250,230,${0.16 * alpha})`;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * alpha})`;
    ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
    ctx.setLineDash([2 * u, 10 * u]);
    ctx.lineDashOffset = -t * 8;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Where contact is welcome: a breathing ring with words in the UI (never colour alone).
  inviteZone({ x, y }) {
    const ctx = this.p.drawingContext, t = this.p.millis() / 1000, u = this.u;
    const r = 0.11 * this.S * (1 + 0.03 * Math.sin(t * 2.4));
    ctx.fillStyle = `rgba(${SAGE},0.22)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3.5 * u; ctx.lineCap = 'round';
    ctx.setLineDash([12 * u, 10 * u]);
    ctx.lineDashOffset = -t * 16;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Little hearts float up while contact is accepted.
  contactRipple({ x, y }) {
    const ctx = this.p.drawingContext, t = this.p.millis() / 1000, u = this.u;
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.45 + k / 4) % 1;
      const hx = x + Math.sin(k * 2.1 + t) * 24 * u + (k - 1.5) * 18 * u, hy = y - 40 * u - ph * 70 * u, s = (7 + 3 * Math.sin(k)) * u;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.fillStyle = '#e57f73'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(hx, hy + s * 0.9);
      ctx.bezierCurveTo(hx - s * 1.4, hy - s * 0.1, hx - s * 0.7, hy - s * 1.2, hx, hy - s * 0.45);
      ctx.bezierCurveTo(hx + s * 0.7, hy - s * 1.2, hx + s * 1.4, hy - s * 0.1, hx, hy + s * 0.9);
      ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  sleepZ({ x, y }) {
    const ctx = this.p.drawingContext, t = this.p.millis() / 1000, u = this.u;
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

  // ---------------------------------------------------------------- atmosphere
  atmosphere(dt) {
    const p = this.p, ctx = p.drawingContext, u = this.u, t = p.millis() / 1000;
    const phase = this.shownPhase;
    ctx.save();
    for (const q of this.particles) {
      if (phase === 'kitten') { // pollen drifting in the sun
        q.x += (10 + Math.cos(t * 0.3 + q.ph) * 8) * dt * u; q.y += Math.sin(t * 0.4 + q.ph * 2) * 8 * dt * u;
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.9 + q.ph * 3));
        const r = 6 * u * q.s;
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        g.addColorStop(0, `rgba(255,252,220,${0.8 * a})`); g.addColorStop(1, 'rgba(255,252,220,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (phase === 'juvenile') { // snowfall
        q.x += 22 * dt * q.s * u; q.y += 38 * dt * q.s * u;
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(q.x, q.y, q.s * 1.6 * u, 0, Math.PI * 2); ctx.fill();
      } else { // drifting dust
        q.x += 30 * dt * q.s * u; q.y += Math.sin(t + q.ph) * 6 * dt * u;
        ctx.fillStyle = `rgba(255,226,170,${0.25 + 0.2 * Math.sin(t * 2 + q.ph)})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.s * 1.2 * u, 0, Math.PI * 2); ctx.fill();
      }
      if (q.x > p.width) q.x = 0; if (q.x < 0) q.x = p.width;
      if (q.y > p.height) q.y = 0; if (q.y < 0) q.y = p.height;
    }
    ctx.restore();
  }

  // Warm sunlight from the top left, a soft glow around the kitten, a gentle vignette.
  lighting({ x, y }, st) {
    const p = this.p, ctx = p.drawingContext, W = p.width, H = p.height;
    this.light = this.light ? { x: this.light.x + (x - this.light.x) * 0.06, y: this.light.y + (y - this.light.y) * 0.06 } : { x, y };
    const L = this.light;
    const sun = ctx.createLinearGradient(0, 0, W * 0.7, H);
    sun.addColorStop(0, 'rgba(255,240,180,0.28)'); sun.addColorStop(0.5, 'rgba(255,240,180,0.04)'); sun.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, this.S * 0.32);
    glow.addColorStop(0, 'rgba(255,248,215,0.18)'); glow.addColorStop(1, 'rgba(255,248,215,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    const tint = { kitten: '30,60,20', juvenile: '40,70,100', adult: '110,60,20' }[this.shownPhase];
    v.addColorStop(0, `rgba(${tint},0)`); v.addColorStop(1, `rgba(${tint},${st === 'ACTIVE' ? 0.22 : 0.3})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  fish({ x, y }, land, alpha) {
    const ctx = this.p.drawingContext, s = this.u;
    ctx.save();
    ctx.translate(x, y - (1 - land) * 60 * s);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,40,20,0.18)';
    ctx.beginPath(); ctx.ellipse(5 * s, 8 * s, 19 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = '#1b2228'; ctx.beginPath(); ctx.arc(10 * s, -2 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- cursor
  cursor(snap, ui) {
    const inp = snap.input;
    if (!inp.position) return;
    const ctx = this.p.drawingContext, u = this.u, t = this.p.millis() / 1000;
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
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = `rgb(${col})`;
    ctx.lineWidth = 2.6 * u;
    if (uncertain) { ctx.setLineDash([5 * u, 5 * u]); ctx.lineDashOffset = -t * 24; }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (snap.creature.acceptedContact) { ctx.strokeStyle = `rgba(${SAGE},${0.7 + 0.3 * Math.sin(t * 3)})`; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(0, 0, r + 8 * u, 0, Math.PI * 2); ctx.stroke(); }
    const k = (r * 1.05) / 12;
    ctx.scale(k, k);
    ctx.translate(-12, -12);
    ctx.strokeStyle = `rgb(${INK})`;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(path2d(snap.activeTool));
    ctx.restore();
    if (ui?.showSkeleton && ui.keypoints) this.skeleton(ui.keypoints);
  }

  skeleton(points) {
    const p = this.p, ctx = p.drawingContext;
    const F = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
    ctx.strokeStyle = `rgba(${COLD},0.6)`; ctx.lineWidth = 2 * this.u;
    for (const f of F) for (let i = 1; i < f.length; i++) {
      const a = points[f[i - 1]], b = points[f[i]];
      ctx.beginPath(); ctx.moveTo(a.x * p.width, a.y * p.height); ctx.lineTo(b.x * p.width, b.y * p.height); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- habitats
  // Soft dappled light: big blurred pools of sun and shade, painted once.
  dapple(g, sunRGB, shadeRGB, n) {
    const p = this.p, u = this.u;
    g.drawingContext.filter = `blur(${26 * u}px)`;
    g.noStroke();
    for (let i = 0; i < n; i++) {
      g.fill(shadeRGB[0], shadeRGB[1], shadeRGB[2], 70); g.ellipse(p.random(p.width), p.random(p.height), p.random(140, 320) * u, p.random(90, 200) * u);
      g.fill(sunRGB[0], sunRGB[1], sunRGB[2], 80); g.ellipse(p.random(p.width), p.random(p.height), p.random(80, 220) * u, p.random(60, 150) * u);
    }
    g.drawingContext.filter = 'none';
  }

  makeJungle() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(118, 170, 84);
    this.dapple(g, [222, 238, 140], [62, 120, 60], 16);
    g.noStroke();
    // a winding dirt path
    g.drawingContext.filter = `blur(${4 * u}px)`;
    g.noFill(); g.stroke(214, 184, 132, 230); g.strokeWeight(110 * u); g.strokeCap(p.ROUND);
    g.bezier(-60 * u, p.height * 0.86, p.width * 0.3, p.height * 0.62, p.width * 0.62, p.height * 1.02, p.width + 60 * u, p.height * 0.7);
    g.drawingContext.filter = 'none'; g.noStroke();
    for (let i = 0; i < 700; i++) { g.fill(p.random(120, 175), p.random(175, 210), p.random(80, 110), 70); g.ellipse(p.random(p.width), p.random(p.height), p.random(10, 34) * u, p.random(6, 18) * u); }
    for (let i = 0; i < 90; i++) { // flower clusters
      const x = p.random(p.width), y = p.random(p.height), c = p.random([[255, 255, 255], [150, 190, 245], [255, 214, 120], [245, 170, 190]]);
      for (let k = 0; k < 4; k++) { g.fill(...c); g.circle(x + p.random(-9, 9) * u, y + p.random(-9, 9) * u, p.random(4, 7) * u); }
    }
    for (let i = 0; i < 26; i++) { // leafy borders
      const side = p.random() < 0.5;
      const x = side ? p.random([0, p.width]) : p.random(p.width);
      const y = side ? p.random(p.height) : p.random([0, p.height]);
      g.push(); g.translate(x, y); g.rotate(Math.atan2(p.height / 2 - y, p.width / 2 - x) + p.random(-0.6, 0.6));
      g.fill(30, 70, 40, 60); g.ellipse(96 * u, 14 * u, 250 * u, 92 * u);
      g.fill(p.random([[70, 150, 64], [92, 168, 70], [56, 130, 58]])); g.ellipse(86 * u, 0, 240 * u, 86 * u);
      g.stroke(190, 230, 150, 160); g.strokeWeight(3 * u); g.line(-20 * u, 0, 190 * u, 0); g.noStroke(); g.pop();
    }
    return g;
  }

  makeSnow() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(236, 244, 250);
    this.dapple(g, [255, 255, 255], [180, 206, 228], 14);
    g.noStroke();
    for (let i = 0; i < 500; i++) { g.fill(196, 216, 236, 60); g.ellipse(p.random(p.width), p.random(p.height), p.random(30, 120) * u, p.random(10, 34) * u); }
    for (let i = 0; i < 16; i++) {
      const x = p.random(p.width), y = p.random(p.height), r = p.random(14, 30) * u;
      g.fill(150, 166, 186); g.ellipse(x, y, r * 2, r * 1.6); g.fill(255); g.ellipse(x - r * 0.2, y - r * 0.32, r * 1.6, r * 0.95);
    }
    for (let i = 0; i < 14; i++) {
      const x = p.random() < 0.5 ? p.random(0, p.width * 0.15) : p.random(p.width * 0.85, p.width);
      const y = p.random(p.height), r = p.random(55, 95) * u;
      g.fill(40, 80, 90, 50); g.circle(x + r * 0.25, y + r * 0.3, r * 2);
      for (let k = 0; k < 4; k++) { g.fill(58 + k * 14, 128 + k * 12, 104 + k * 8); g.circle(x, y, r * 2 * (1 - k * 0.22)); }
      g.fill(255, 240); g.circle(x - r * 0.25, y - r * 0.25, r * 0.6);
    }
    return g;
  }

  makeDesert() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(242, 204, 146);
    this.dapple(g, [255, 236, 190], [214, 160, 104], 14);
    g.noFill();
    for (let y = 0; y < p.height; y += 18 * u) {
      g.stroke(210, 160, 100, 70); g.strokeWeight(2 * u); g.beginShape();
      for (let x = 0; x <= p.width; x += 20 * u) g.vertex(x, y + Math.sin(x * 0.012 + y * 0.05) * 7 * u);
      g.endShape();
    }
    g.noStroke();
    for (let i = 0; i < 160; i++) { g.fill(p.random(200, 230), p.random(150, 180), p.random(100, 130)); g.ellipse(p.random(p.width), p.random(p.height), p.random(4, 9) * u); }
    for (let i = 0; i < 10; i++) {
      const x = p.random(p.width), y = p.random(p.height), r = p.random(26, 40) * u;
      g.fill(120, 80, 40, 60); g.circle(x + r * 0.45, y + r * 0.4, r * 2);
      g.fill(108, 172, 98); g.circle(x, y, r * 2); g.fill(140, 200, 120); g.circle(x - r * 0.25, y - r * 0.25, r * 1.1);
      g.fill(246, 150, 170); g.circle(x, y, r * 0.5); g.fill(255, 220, 230); g.circle(x - r * 0.06, y - r * 0.06, r * 0.2);
    }
    return g;
  }
}
