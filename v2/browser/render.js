// BrowserRenderer — draws one state snapshot with p5 (instance mode).
// It only *reads* the snapshot. Nothing here may change needs, trust or memory.
//
// Feedback rule (docs/design/experience-spec.md): system uncertainty shows on the
// cursor and tracking ring; the creature's own choices show on the creature's body.

const PHASE_STYLE = {
  kitten:   { coat: [232, 168, 110], mark: [176, 104, 58], eye: [120, 180, 230] },
  juvenile: { coat: [214, 140, 80],  mark: [150, 84, 40],  eye: [190, 190, 80] },
  adult:    { coat: [196, 120, 62],  mark: [120, 64, 30],  eye: [220, 180, 50] },
};
const BIOMES = ['kitten', 'juvenile', 'adult'];

export class Renderer {
  constructor(p) {
    this.p = p;
    this.biomes = {};
    this.flakes = [];
    this.shownPhase = 'kitten';
    this.fade = 1;
    this.prevPhase = null;
    this.tailPhase = 0;
    this.walk = 0;
  }

  resize() {
    const p = this.p;
    this.S = Math.min(p.width, p.height);
    this.u = this.S / 900;
    p.randomSeed(11);
    this.biomes = { kitten: this.makeJungle(), juvenile: this.makeSnow(), adult: this.makeDesert() };
    this.flakes = Array.from({ length: 140 }, () => ({ x: p.random(p.width), y: p.random(p.height), s: p.random(1, 3.5) }));
  }

  px(n) { return { x: n.x * this.p.width, y: n.y * this.p.height }; }

  // ---------------------------------------------------------------- frame
  draw(snap, ui, dt) {
    const p = this.p;
    const c = snap.creature;
    if (c.phase !== this.shownPhase) { this.prevPhase = this.shownPhase; this.shownPhase = c.phase; this.fade = 0; }
    this.fade = Math.min(1, this.fade + dt / 1.5);

    if (this.prevPhase && this.fade < 1) {
      p.image(this.biomes[this.prevPhase], 0, 0);
      p.tint(255, 255 * this.fade);
      p.image(this.biomes[this.shownPhase], 0, 0);
      p.noTint();
    } else p.image(this.biomes[this.shownPhase], 0, 0);
    if (this.shownPhase === 'juvenile') this.snowfall(dt);

    for (const f of snap.foods) this.fish(this.px(f), Math.min(1, f.age / 0.3), f.age > 27 ? (30 - f.age) / 3 : 1);
    const interactive = snap.sessionState === 'ACTIVE';
    if (interactive && snap.activeTool === 'PET' && c.inviting && !c.acceptedContact) this.inviteZone(c);
    this.cat(c, dt);
    if (interactive || snap.sessionState === 'CALIBRATING') this.cursor(snap, ui);
  }

  snowfall(dt) {
    const p = this.p;
    p.noStroke(); p.fill(255, 220);
    for (const f of this.flakes) {
      f.x += 25 * dt * f.s * this.u; f.y += 40 * dt * f.s * this.u;
      if (f.x > p.width) f.x = 0; if (f.y > p.height) f.y = 0;
      p.circle(f.x, f.y, f.s * 2 * this.u);
    }
  }

  // A dashed circle *and* words: never colour alone (PRD V2 §9.1).
  inviteZone(c) {
    const p = this.p;
    const { x, y } = this.px(c.position);
    const r = 0.11 * this.S;
    const t = p.millis() / 1000;
    p.push();
    p.noFill();
    p.stroke(255, 240, 200, 200);
    p.strokeWeight(2 * this.u);
    p.drawingContext.setLineDash([8 * this.u, 8 * this.u]);
    p.drawingContext.lineDashOffset = -t * 20;
    p.circle(x, y, r * 2);
    p.drawingContext.setLineDash([]);
    p.pop();
  }

  // ---------------------------------------------------------------- creature
  cat(c, dt) {
    const p = this.p;
    const st = PHASE_STYLE[c.phase];
    const age = c.ageProgress;
    // ~25 % larger than Prototype B so body language reads from a viewing distance
    const L = (0.1 + 0.03 * age) * this.S;
    const W = (0.06 + 0.01 * age) * this.S;
    const { x, y } = this.px(c.position);
    const coat = p.color(...st.coat), mark = p.color(...st.mark);
    const b = c.behaviour;
    const breathe = 1 + (b === 'REST' ? 0.035 : 0.015) * Math.sin(p.millis() / (b === 'REST' ? 900 : 400));
    this.walk += (c.speed / 0.1) * dt * 9;

    p.push();
    p.translate(x, y);
    p.noStroke();
    p.fill(0, 0, 0, 50);
    p.ellipse(6 * this.u, 9 * this.u, L * 1.15, W * 1.05);
    if (b === 'REST') { p.scale(breathe); this.curled(L, W, coat, mark); }
    else {
      p.rotate(c.heading);
      this.paws(L, W, coat, c.speed);
      this.tail(L, W, coat, mark, b, dt);
      p.push(); p.scale(1, breathe); this.body(L, W, coat, mark, b); p.pop();
      this.head(L * 0.52, W, coat, mark, b, st.eye, age);
    }
    p.pop();
    if (b === 'REST') {
      p.noStroke(); p.fill(255, 200 + 55 * Math.sin(p.millis() / 500));
      p.textAlign(p.CENTER, p.CENTER); p.textSize(20 * this.u);
      p.text('z', x + L * 0.45, y - L * 0.5 - 6 * this.u * Math.sin(p.millis() / 700));
    }
  }

  paws(L, W, coat, speed) {
    const p = this.p;
    const stride = speed > 0.02 ? 9 * this.u : 0;
    p.fill(p.lerpColor(coat, p.color(255), 0.25));
    const paws = [[L * 0.28, -W * 0.42, 0], [L * 0.28, W * 0.42, Math.PI], [-L * 0.28, -W * 0.42, Math.PI], [-L * 0.28, W * 0.42, 0]];
    for (const [px, py, ph] of paws) p.ellipse(px + Math.sin(this.walk + ph) * stride, py, W * 0.3, W * 0.24);
  }

  tail(L, W, coat, mark, b, dt) {
    const p = this.p;
    const speed = { EXPLORE: 3, OBSERVE: 1.5, APPROACH: 4, SEEK_FOOD: 5, EAT: 1, PLAY: 9, CONTACT: 1.2, GROOM: 1, RETREAT: 0 }[b] ?? 2;
    const size = { EXPLORE: 0.5, OBSERVE: 0.3, APPROACH: 0.7, SEEK_FOOD: 0.6, EAT: 0.3, PLAY: 0.9, CONTACT: 0.8, GROOM: 0.25, RETREAT: 0.05 }[b] ?? 0.4;
    this.tailPhase += dt * speed;
    const wag = Math.sin(this.tailPhase) * size;
    const tx = -L * 0.5;
    p.noFill();
    p.stroke(coat);
    p.strokeWeight(W * (b === 'RETREAT' ? 0.32 : 0.18)); // a scared cat puffs its tail
    p.bezier(tx, 0, tx - L * 0.3, wag * L * 0.2, tx - L * 0.45, wag * L * 0.5, tx - L * 0.65, wag * L * 0.6);
    p.stroke(mark);
    p.point(tx - L * 0.65, wag * L * 0.6);
  }

  body(L, W, coat, mark, b) {
    const p = this.p;
    p.noStroke(); p.fill(coat);
    const low = b === 'CONTACT' ? 0.94 : 1; // relaxes and sinks a little when accepting contact
    p.ellipse(0, 0, L, W * low);
    p.stroke(mark); p.strokeWeight(3 * this.u); p.strokeCap(p.ROUND);
    p.line(-L * 0.4, 0, L * 0.3, 0);
    for (let i = -2; i <= 2; i++) {
      const sx = i * L * 0.14;
      for (const side of [-1, 1]) p.line(sx, side * W * 0.12, sx - W * 0.12, side * W * 0.4);
    }
  }

  head(hx, W, coat, mark, b, eyeRGB, age) {
    const p = this.p;
    const r = W * (0.62 - 0.04 * age);
    const scared = b === 'RETREAT';
    const alert = b === 'OBSERVE' || b === 'APPROACH';
    p.noStroke(); p.fill(coat);
    p.ellipse(hx, 0, r * 1.7, r * 1.9);
    const back = scared ? 0.78 : alert ? 0.3 : 0.45; // ears: forward when curious, flat when scared
    for (const side of [-1, 1]) {
      p.fill(coat);
      p.triangle(hx - r * 0.25, side * r * 0.35, hx + r * 0.2, side * r * 0.75, hx - r * (0.35 + back), side * r * (scared ? 1.0 : 1.1));
      p.fill(235, 160, 160);
      p.triangle(hx - r * 0.15, side * r * 0.5, hx + r * 0.08, side * r * 0.72, hx - r * (0.25 + back * 0.8), side * r * (scared ? 0.92 : 1.0));
    }
    const ex = hx + r * 0.2, ey = r * 0.38;
    if (b === 'CONTACT' || b === 'EAT' || b === 'GROOM') {
      p.stroke(60); p.strokeWeight(2 * this.u); p.noFill();
      for (const side of [-1, 1]) p.arc(ex, side * ey, r * 0.35, r * 0.25, -Math.PI / 2, Math.PI / 2);
    } else {
      p.noStroke();
      const es = r * (scared ? 0.5 : 0.42);
      for (const side of [-1, 1]) {
        p.fill(...eyeRGB); p.ellipse(ex, side * ey, es, es);
        p.fill(20); p.ellipse(ex + es * 0.1, side * ey, es * 0.4, es * (scared ? 0.9 : 0.6));
        p.fill(255); p.ellipse(ex + es * 0.2, side * ey - es * 0.15, es * 0.18);
      }
    }
    p.noStroke(); p.fill(220, 120, 120);
    p.triangle(hx + r * 0.85, 0, hx + r * 0.7, -r * 0.1, hx + r * 0.7, r * 0.1);
    p.stroke(255, 200); p.strokeWeight(1 * this.u);
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) p.line(hx + r * 0.7, side * r * 0.2, hx + r * 1.3, side * (r * 0.5 + k * r * 0.25));
    p.stroke(mark); p.strokeWeight(2.5 * this.u);
    p.line(hx - r * 0.1, 0, hx - r * 0.5, 0);
  }

  curled(L, W, coat, mark) {
    const p = this.p;
    const r = (L + W) * 0.3;
    p.noStroke(); p.fill(coat);
    p.ellipse(0, 0, r * 2, r * 1.8);
    p.noFill(); p.stroke(coat); p.strokeWeight(W * 0.2);
    p.arc(0, 0, r * 2.1, r * 1.9, 0.2, Math.PI * 0.9);
    p.stroke(mark); p.strokeWeight(3 * this.u);
    p.arc(0, 0, r * 1.2, r * 1.1, Math.PI, Math.PI * 1.8);
    p.noStroke(); p.fill(coat);
    p.ellipse(r * 0.45, -r * 0.35, r, r * 0.95);
    p.triangle(r * 0.15, -r * 0.6, r * 0.35, -r, r * 0.5, -r * 0.65);
    p.triangle(r * 0.6, -r * 0.65, r * 0.85, -r * 0.95, r * 0.9, -r * 0.5);
    p.stroke(60); p.strokeWeight(2 * this.u); p.noFill();
    p.arc(r * 0.32, -r * 0.35, r * 0.2, r * 0.12, 0, Math.PI);
    p.arc(r * 0.62, -r * 0.35, r * 0.2, r * 0.12, 0, Math.PI);
  }

  fish({ x, y }, land, alpha) {
    const p = this.p;
    const s = this.u;
    p.push();
    p.translate(x, y - (1 - land) * 60 * s);
    p.noStroke();
    p.fill(0, 0, 0, 40 * alpha); p.ellipse(4 * s, 6 * s, 34 * s, 12 * s);
    p.fill(120, 170, 210, 255 * alpha);
    p.ellipse(0, 0, 34 * s, 14 * s);
    p.triangle(-14 * s, 0, -26 * s, -9 * s, -26 * s, 9 * s);
    p.fill(30, 255 * alpha); p.circle(10 * s, -2 * s, 3.5 * s);
    p.pop();
  }

  // ---------------------------------------------------------------- cursor
  cursor(snap, ui) {
    const p = this.p;
    const inp = snap.input;
    if (!inp.position) return;
    const { x, y } = this.px(inp.position);
    const q = inp.quality;
    const t = p.millis() / 1000;
    const s = this.u;
    const uncertain = q !== 'valid' || snap.intent.label === 'unknown';
    p.push();
    p.noFill();
    p.strokeWeight(3 * s);
    const a = q === 'lost' ? 90 : 230;
    p.stroke(255, 255, 255, a);
    if (uncertain) { p.drawingContext.setLineDash([6 * s, 6 * s]); p.drawingContext.lineDashOffset = -t * 30; }
    const ring = (snap.activeTool === 'PET' ? 52 : 44) * s * (uncertain ? 1 + 0.06 * Math.sin(t * 8) : 1);
    p.circle(x, y, ring);
    p.drawingContext.setLineDash([]);
    if (snap.creature.acceptedContact) { p.stroke(255, 220, 150, 200); p.circle(x, y, ring * 1.35); }
    p.pop();
    this.toolIcon(snap.activeTool, x, y, q === 'lost' ? 0.35 : 1);
    if (ui?.showSkeleton && ui.keypoints) this.skeleton(ui.keypoints);
  }

  toolIcon(tool, x, y, alpha) {
    const p = this.p, s = this.u;
    p.push(); p.translate(x, y); p.noStroke();
    if (tool === 'FEED') { this.fish({ x: 0, y: 0 }, 1, alpha); }
    else if (tool === 'PLAY') {
      p.fill(225, 90, 110, 255 * alpha); p.circle(0, 0, 30 * s);
      p.noFill(); p.stroke(255, 200 * alpha); p.strokeWeight(1.5 * s);
      p.arc(0, 0, 22 * s, 30 * s, -1.2, 1.2); p.arc(0, 0, 30 * s, 16 * s, 0.4, 2.8); p.arc(-4 * s, 0, 18 * s, 28 * s, 1.9, 4.3);
    } else if (tool === 'PET') {
      p.fill(255, 235, 215, 240 * alpha);
      p.ellipse(0, 4 * s, 20 * s, 18 * s);
      for (let i = 0; i < 4; i++) p.ellipse((-7.5 + i * 5) * s, -9 * s + Math.abs(i - 1.5) * 1.5 * s, 4.5 * s, 11 * s);
      p.ellipse(-12 * s, 4 * s, 5 * s, 10 * s);
    } else {
      p.fill(255, 230 * alpha);
      p.rect(-7 * s, -9 * s, 5 * s, 18 * s, 2 * s); p.rect(2 * s, -9 * s, 5 * s, 18 * s, 2 * s);
    }
    p.pop();
  }

  skeleton(points) {
    const p = this.p;
    const F = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
    p.stroke(255, 120); p.strokeWeight(2 * this.u);
    for (const f of F) for (let i = 1; i < f.length; i++) {
      const a = points[f[i - 1]], b = points[f[i]];
      p.line(a.x * p.width, a.y * p.height, b.x * p.width, b.y * p.height);
    }
  }

  // ---------------------------------------------------------------- habitats (from Prototype B)
  makeJungle() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(46, 70, 38); g.noStroke();
    for (let i = 0; i < 1400; i++) { g.fill(p.random(40, 90), p.random(80, 120), p.random(35, 60), 60); g.ellipse(p.random(p.width), p.random(p.height), p.random(20, 80) * u); }
    for (let i = 0; i < 300; i++) {
      g.push(); g.translate(p.random(p.width), p.random(p.height)); g.rotate(p.random(Math.PI * 2));
      g.fill(p.random([[120, 100, 50], [90, 110, 50], [140, 90, 45]])); g.ellipse(0, 0, 18 * u, 7 * u); g.pop();
    }
    for (let i = 0; i < 26; i++) {
      const side = p.random() < 0.5;
      const x = side ? p.random([0, p.width]) : p.random(p.width);
      const y = side ? p.random(p.height) : p.random([0, p.height]);
      g.push(); g.translate(x, y); g.rotate(Math.atan2(p.height / 2 - y, p.width / 2 - x) + p.random(-0.6, 0.6));
      g.fill(30, p.random(90, 120), 45); g.ellipse(80 * u, 0, 220 * u, 80 * u);
      g.stroke(120, 170, 100, 120); g.strokeWeight(2 * u); g.line(-20 * u, 0, 180 * u, 0); g.noStroke(); g.pop();
    }
    return g;
  }

  makeSnow() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(232, 240, 248); g.noStroke();
    for (let i = 0; i < 900; i++) { g.fill(190, 210, 232, 50); g.ellipse(p.random(p.width), p.random(p.height), p.random(30, 120) * u, p.random(10, 40) * u); }
    for (let i = 0; i < 18; i++) {
      const x = p.random(p.width), y = p.random(p.height), r = p.random(14, 32) * u;
      g.fill(110, 118, 130); g.ellipse(x, y, r * 2, r * 1.6); g.fill(250); g.ellipse(x - r * 0.2, y - r * 0.3, r * 1.5, r * 0.9);
    }
    for (let i = 0; i < 14; i++) {
      const x = p.random() < 0.5 ? p.random(0, p.width * 0.15) : p.random(p.width * 0.85, p.width);
      const y = p.random(p.height), r = p.random(50, 90) * u;
      for (let k = 0; k < 4; k++) { g.fill(30 + k * 10, 70 + k * 12, 60 + k * 8); g.circle(x, y, r * 2 * (1 - k * 0.22)); }
      g.fill(255, 230); g.circle(x - r * 0.2, y - r * 0.2, r * 0.5);
    }
    return g;
  }

  makeDesert() {
    const p = this.p, u = this.u;
    const g = p.createGraphics(p.width, p.height);
    g.background(226, 186, 128); g.noFill();
    for (let y = 0; y < p.height; y += 14 * u) {
      g.stroke(170, 120, 70, 70); g.strokeWeight(1.5 * u); g.beginShape();
      for (let x = 0; x <= p.width; x += 20 * u) g.vertex(x, y + Math.sin(x * 0.015 + y * 0.05) * 6 * u);
      g.endShape();
    }
    g.noStroke();
    for (let i = 0; i < 200; i++) { g.fill(p.random(140, 200), p.random(100, 150), p.random(70, 100)); g.ellipse(p.random(p.width), p.random(p.height), p.random(3, 7) * u); }
    for (let i = 0; i < 10; i++) {
      const x = p.random(p.width), y = p.random(p.height), r = p.random(25, 40) * u;
      g.fill(0, 0, 0, 40); g.circle(x + r * 0.5, y + r * 0.4, r * 2);
      g.fill(70, 120, 70); g.circle(x, y, r * 2); g.fill(240, 120, 150); g.circle(x, y, r * 0.4);
    }
    return g;
  }
}

export { BIOMES };
