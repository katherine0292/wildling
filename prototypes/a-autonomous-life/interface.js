// INPUT & OUTPUT — hand tracking (ml5.js HandPose / mouse), synthesised sound, on-screen UI.

// =============================================================== HandInput

// Hand input. Primary: ml5.js HandPose on the webcam (runs locally in the
// browser — no video leaves the machine). Fallback: mouse / touch, drawn as
// the same ghost hand so both modes feel identical. The cat only ever
// reads three things from here: where the hand is, whether it is present,
// and how fast it moves (slow = petting, fast = chasing).

const FINGERS = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
// An open right hand as the webcam mirror sees it, in world units around the palm.
const HAND_TEMPLATE = [
  [4, 62], [-22, 50], [-42, 32], [-56, 14], [-68, -2],
  [-22, -8], [-27, -38], [-29, -56], [-31, -72],
  [-2, -12], [-2, -46], [-2, -66], [-2, -84],
  [17, -8], [20, -40], [22, -58], [24, -73],
  [32, 2], [39, -22], [43, -36], [46, -50]
];

class HandInput {
  constructor() {
    this.pos = pt(-999, -999);
    this.vel = pt(0, 0);
    this.speed = 0;
    this.present = false;
    this.source = 'none';
    this.cameraState = 'off';
    this.points = null;
    this.raw = null;
    this.camPoints = null;
    this.lastCam = -1e9;
    this.lastMouse = -1e9;
    this.mouseInside = false;
    this.showPreview = true;
    this.layer = null;
  }

  startCamera() {
    if (this.cameraState !== 'off' && this.cameraState !== 'denied') return;
    if (typeof ml5 === 'undefined') { this.cameraState = 'unavailable'; return; }
    this.cameraState = 'starting';
    try {
      this.video = createCapture(VIDEO, { flipped: true }, () => {
        if (this.cameraState === 'starting') { this.cameraState = 'loading'; this.loadModel(); }
      });
      this.video.size(640, 480);
      this.video.hide();
    } catch (e) {
      this.cameraState = 'denied';
    }
    setTimeout(() => { if (this.cameraState === 'starting') this.cameraState = 'denied'; }, 12000);
  }

  loadModel() {
    this.model = ml5.handPose({ maxHands: 1, flipped: true }, () => {
      this.model.detectStart(this.video, r => this.onHands(r));
      this.cameraState = 'ready';
    });
  }

  onHands(results) {
    if (!results || !results.length || !results[0].keypoints || results[0].keypoints.length < 21) return;
    const kp = results[0].keypoints;
    const vw = this.video.width || 640, vh = this.video.height || 480, m = 0.12;
    this.camPoints = kp.map(k => pt(k.x / vw, k.y / vh));
    // Stretch the central 76% of the camera frame over the whole screen so
    // the edges of the world are reachable without leaving the camera view.
    this.raw = kp.map(k => pt((k.x / vw - m) / (1 - 2 * m) * width, (k.y / vh - m) / (1 - 2 * m) * height));
    this.lastCam = millis();
  }

  onMouse(inside) {
    this.lastMouse = millis();
    this.mouseInside = inside;
  }

  update(dt) {
    const now = millis();
    let target = null;
    if (this.raw && now - this.lastCam < 350) {
      this.source = 'camera';
      if (!this.points || this.points.length !== 21) this.points = this.raw.map(q => ({ ...q }));
      this.points = this.points.map((q, i) => lerpP(q, this.raw[i], 0.5));
      const ids = [0, 5, 9, 13, 17];
      target = ids.reduce((acc, i) => addP(acc, this.points[i], 1 / ids.length), pt(0, 0));
    } else if (this.mouseInside && now - this.lastMouse < 2500) {
      this.source = 'mouse';
      target = pt(mouseX, mouseY);
      this.points = null;
    } else {
      this.source = 'none';
    }
    const sec = Math.max(1e-3, dt / 60);
    if (target) {
      if (!this.present) { this.pos = target; this.vel = pt(0, 0); }
      const nv = { x: (target.x - this.pos.x) / sec, y: (target.y - this.pos.y) / sec };
      this.vel = lerpP(this.vel, nv, 0.35);
      this.pos = target;
      this.present = true;
    } else {
      this.present = false;
      this.vel = lerpP(this.vel, pt(0, 0), 0.3);
    }
    this.speed = vlen(this.vel) / U;
  }

  handPoints() {
    if (this.source === 'camera' && this.points) return this.points;
    const tilt = clampv(this.vel.x / U / 4000, -0.35, 0.35);
    const s = U * 1.05;
    return HAND_TEMPLATE.map(([x, y]) => {
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      return pt(this.pos.x + (x * c - y * sn) * s, this.pos.y + (x * sn + y * c) * s);
    });
  }

  ensureLayer() {
    const pd = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.ceil(width * pd), h = Math.ceil(height * pd);
    if (!this.layer || this.layer.canvas.width !== w || this.layer.canvas.height !== h) this.layer = makeLayer(width, height, pd);
    return this.layer;
  }

  traceHand(ctx, pts) {
    const palmW = vdist(pts[5], pts[17]);
    const fw = Math.max(10 * U, palmW * 0.32);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fill(closedSmoothPath(PALM.map(i => pts[i])));
    ctx.lineWidth = fw * 1.1;
    ctx.beginPath(); PALM.forEach((i, k) => k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y)); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = fw;
    for (const f of FINGERS) {
      ctx.beginPath(); f.forEach((i, k) => k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y)); ctx.stroke();
    }
  }

  // Ghost hand: rendered opaque into its own layer, then composited once
  // with transparency so overlapping fingers don't double up.
  draw(ctx, state) {
    if (!this.present) return;
    const pts = this.handPoints();
    const L = this.ensureLayer(), lc = L.ctx;
    lc.clearRect(0, 0, width, height);
    const chase = clampv((this.speed - PET_SPEED) / (CHASE_SPEED - PET_SPEED), 0, 1);
    const col = state === 'pet' ? [255, 226, 190] : mixRGB([240, 248, 255], [255, 120, 100], chase);
    lc.fillStyle = 'rgb(0,0,0)'; lc.strokeStyle = 'rgb(0,0,0)';
    lc.save(); lc.translate(16 * U, 24 * U); this.traceHand(lc, pts); lc.restore();
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.drawImage(L.canvas, 0, 0, width, height);
    ctx.restore();
    lc.clearRect(0, 0, width, height);
    lc.fillStyle = rgba(col); lc.strokeStyle = rgba(col);
    this.traceHand(lc, pts);
    ctx.save();
    ctx.globalAlpha = state === 'pet' ? 0.2 : 0.32;
    ctx.drawImage(L.canvas, 0, 0, width, height);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = rgba(col);
    for (const i of [4, 8, 12, 16, 20]) {
      const g = ctx.createRadialGradient(pts[i].x, pts[i].y, 0, pts[i].x, pts[i].y, 12 * U);
      g.addColorStop(0, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 12 * U, 0, FULL_TURN); ctx.fill();
    }
    ctx.restore();
  }

  drawPreview(ctx) {
    if (!this.showPreview || this.cameraState !== 'ready' || !this.video) return;
    const w = 168 * U, h = 126 * U, x = width - w - 18 * U, y = height - h - 18 * U;
    ctx.save();
    const clip = new Path2D(); clip.roundRect(x, y, w, h, 12 * U);
    ctx.clip(clip);
    ctx.translate(x + w, y); ctx.scale(-1, 1);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.video.elt, 0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.stroke(clip);
    if (this.camPoints && millis() - this.lastCam < 350) {
      const P = this.camPoints.map(q => pt(x + q.x * w, y + q.y * h));
      ctx.strokeStyle = 'rgba(140,255,200,0.9)'; ctx.lineWidth = 1.5;
      for (const f of FINGERS) { ctx.beginPath(); f.forEach((i, k) => k ? ctx.lineTo(P[i].x, P[i].y) : ctx.moveTo(P[i].x, P[i].y)); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const q of P) { ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, FULL_TURN); ctx.fill(); }
    }
    ctx.restore();
  }
}

// =============================================================== SoundEngine

// All audio is synthesised in real time with the Web Audio API — no
// recordings. Ambience layers crossfade per biome; the cat's voice
// (meow, purr, hiss) is pitched by life stage, so a kitten squeaks and an
// adult sounds deeper.

const AMBIENCE = [
  { wind: 0.025, windF: 650, insects: 0.04, hiss: 0.0, drone: 0.0 },   // jungle
  { wind: 0.11, windF: 480, insects: 0.0, hiss: 0.01, drone: 0.0 },    // snow
  { wind: 0.065, windF: 360, insects: 0.0, hiss: 0.018, drone: 0.03 }  // desert
];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.biome = 0;
    this.nextEvent = 2;
    this.t = 0;
  }

  start(biome = 0) {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = this.gain(0.9);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5;
    this.master.connect(comp).connect(c.destination);
    this.dry = this.gain(1); this.dry.connect(this.master);
    this.revIn = this.gain(1);
    const conv = c.createConvolver();
    conv.buffer = this.makeImpulse(2.8, 2.4);
    this.revIn.connect(conv).connect(this.gain(0.8)).connect(this.master);
    this.noiseBuf = this.makeNoise(3);
    this.buildAmbience();
    this.buildPurr();
    this.setBiome(biome, 0.5);
  }

  gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  out(node, wet = 0.2, pan = 0) {
    let n = node;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); n = p; }
    n.connect(this.dry);
    if (wet > 0) { const s = this.gain(wet); n.connect(s); s.connect(this.revIn); }
  }

  makeNoise(sec) {
    const sr = this.ctx.sampleRate, b = this.ctx.createBuffer(1, sec * sr, sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  makeImpulse(sec, decay) {
    const sr = this.ctx.sampleRate, len = sec * sr, b = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  noiseSrc(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = loop;
    return s;
  }

  buildAmbience() {
    const a = this.amb = {};
    const w = this.noiseSrc(), wf = this.filter('lowpass', 500, 0.8), wg = this.gain(0);
    w.connect(wf).connect(wg); this.out(wg, 0.15); w.start(0, Math.random() * 2);
    a.wind = wg; a.windF = wf;
    const ins = this.noiseSrc(), bp = this.filter('bandpass', 5200, 9), am = this.gain(0.5), ig = this.gain(0);
    const lfo = this.osc('sine', 11), lg = this.gain(0.5);
    lfo.connect(lg).connect(am.gain); lfo.start();
    ins.connect(bp).connect(am).connect(ig); this.out(ig, 0.3); ins.start(0, Math.random() * 2);
    a.insects = ig;
    const hs = this.noiseSrc(), hp = this.filter('highpass', 4200, 0.5), hg = this.gain(0);
    hs.connect(hp).connect(hg); this.out(hg, 0.2); hs.start(0, Math.random() * 2);
    a.hiss = hg;
    const d1 = this.osc('sine', 55), d2 = this.osc('sine', 82.6), dl = this.filter('lowpass', 300), dg = this.gain(0);
    d1.connect(dl); d2.connect(dl); dl.connect(dg); this.out(dg, 0.4); d1.start(); d2.start();
    a.drone = dg;
  }

  buildPurr() {
    const n = this.noiseSrc(), lp = this.filter('lowpass', 260, 1.2);
    const saw = this.osc('sawtooth', 46), slp = this.filter('lowpass', 160), sg = this.gain(0.5);
    const am = this.gain(0.5), lfo = this.osc('sine', 25), lg = this.gain(0.5);
    lfo.connect(lg).connect(am.gain);
    n.connect(lp).connect(am);
    saw.connect(slp).connect(sg).connect(am);
    this.purrG = this.gain(0);
    am.connect(this.purrG);
    this.out(this.purrG, 0.05);
    n.start(0, Math.random()); saw.start(); lfo.start();
    this.purrLFO = lfo;
  }

  setBiome(i, fade = 2.5) {
    this.biome = i;
    if (!this.ctx) return;
    const L = AMBIENCE[i], t = this.ctx.currentTime;
    this.amb.insects.gain.setTargetAtTime(L.insects, t, fade / 3);
    this.amb.hiss.gain.setTargetAtTime(L.hiss, t, fade / 3);
    this.amb.drone.gain.setTargetAtTime(L.drone, t, fade / 3);
    this.nextEvent = 1.5;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  update(dt, world) {
    if (!this.ctx) return;
    const sec = dt / 60, t = this.ctx.currentTime, L = AMBIENCE[this.biome];
    this.t += sec;
    const gust = noise(this.t * 0.12, 3.3);
    this.amb.wind.gain.setTargetAtTime(L.wind * (0.5 + gust), t, 0.3);
    this.amb.windF.frequency.setTargetAtTime(L.windF * (0.7 + 0.8 * noise(this.t * 0.15, 9.1)), t, 0.3);
    const cat = world.cat;
    this.purrG.gain.setTargetAtTime(cat.pose.purr * 0.38, t, 0.25);
    this.purrLFO.frequency.setTargetAtTime([28, 25, 23, 21][cat.stage], t, 0.5);
    this.nextEvent -= sec;
    if (this.nextEvent <= 0 && !world.transition) {
      if (this.biome === 0) { this.chirp(); this.nextEvent = 1.5 + Math.random() * 4; }
      else if (this.biome === 1) { this.chime(); this.nextEvent = 3.5 + Math.random() * 6; }
      else { this.raptor(); this.nextEvent = 12 + Math.random() * 12; }
    }
  }

  env(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  meow(stage, kind = 'normal') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.01;
    const base = [920, 680, 500, 440][stage] * (0.92 + Math.random() * 0.16);
    const dur = { normal: 0.55 + 0.1 * stage, trill: 0.28, soft: 0.4, yelp: 0.22 }[kind];
    const o = this.osc('sawtooth', base), f = o.frequency;
    if (kind === 'trill') { f.setValueAtTime(base * 0.85, t); f.linearRampToValueAtTime(base * 1.2, t + dur * 0.7); f.linearRampToValueAtTime(base * 1.1, t + dur); }
    else if (kind === 'yelp') { f.setValueAtTime(base * 1.3, t); f.exponentialRampToValueAtTime(base * 0.9, t + dur); }
    else { f.setValueAtTime(base * 0.82, t); f.linearRampToValueAtTime(base * 1.15, t + dur * 0.32); f.exponentialRampToValueAtTime(base * 0.72, t + dur); }
    const vib = this.osc('sine', kind === 'trill' ? 26 : 6), vg = this.gain(kind === 'trill' ? base * 0.06 : base * 0.012);
    vib.connect(vg).connect(f);
    const f1 = this.filter('bandpass', 800, 3), f2 = this.filter('bandpass', 2400, 6), body = this.filter('lowpass', 2800);
    f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1500, t + dur * 0.35); f1.frequency.linearRampToValueAtTime(760, t + dur);
    f2.frequency.setValueAtTime(2200, t); f2.frequency.linearRampToValueAtTime(3000, t + dur * 0.35); f2.frequency.linearRampToValueAtTime(2000, t + dur);
    const peak = { normal: 0.5, trill: 0.38, soft: 0.26, yelp: 0.5 }[kind];
    const g = this.gain(0), g2 = this.gain(0.6), g3 = this.gain(0.18);
    o.connect(f1).connect(g); o.connect(f2).connect(g2).connect(g); o.connect(body).connect(g3).connect(g);
    this.env(g, t, peak, 0.045, dur);
    this.out(g, 0.25, (Math.random() - 0.5) * 0.3);
    o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  noiseBurst(t, dur, filterType, freq, q, peak, wet = 0.15, pan = 0, attack = 0.005) {
    const s = this.noiseSrc(false), f = this.filter(filterType, freq, q), g = this.gain(0);
    s.connect(f).connect(g);
    this.env(g, t, peak, attack, dur);
    this.out(g, wet, pan);
    s.start(t, Math.random() * 2, dur + 0.05);
    return f;
  }

  hiss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.noiseBurst(t, 0.9, 'highpass', 2600, 0.6, 0.45, 0.2, 0, 0.05);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const f = this.noiseBurst(t, 0.28, 'bandpass', 400, 1.3, 0.14, 0.1, 0, 0.03);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
  }

  chomp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    for (let k = 0; k < 3; k++) this.noiseBurst(t + k * 0.13, 0.05, 'lowpass', 1500, 1, 0.25, 0.05);
  }

  footstep(biome, size, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005, vol = (0.04 + 0.04 * size) * clampv(speed / 3, 0.4, 1.2);
    const pan = (Math.random() - 0.5) * 0.4;
    if (biome === 0) this.noiseBurst(t, 0.09, 'bandpass', 1200, 0.8, vol * 0.9, 0.05, pan);
    else if (biome === 1) for (let k = 0; k < 3; k++) this.noiseBurst(t + k * 0.025, 0.04, 'lowpass', 2400, 0.7, vol * 1.3, 0.05, pan);
    else this.noiseBurst(t, 0.12, 'bandpass', 3200, 0.6, vol * 0.8, 0.05, pan, 0.02);
  }

  chirp() {
    const c = this.ctx, t = c.currentTime + 0.01, n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1600, pan = (Math.random() - 0.5) * 1.6;
    for (let k = 0; k < n; k++) {
      const t0 = t + k * 0.11, o = this.osc('sine', base), g = this.gain(0);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.linearRampToValueAtTime(base * 1.35, t0 + 0.05);
      o.frequency.linearRampToValueAtTime(base * 0.9, t0 + 0.09);
      o.connect(g); this.env(g, t0, 0.05, 0.01, 0.1); this.out(g, 0.35, pan);
      o.start(t0); o.stop(t0 + 0.12);
    }
  }

  chime() {
    const t = this.ctx.currentTime + 0.01, f = PENTA[5 + Math.floor(Math.random() * 6)], pan = (Math.random() - 0.5) * 1.4;
    for (const [mult, type, amp] of [[1, 'sine', 0.035], [2.01, 'triangle', 0.01]]) {
      const o = this.osc(type, f * mult), g = this.gain(0);
      o.connect(g); this.env(g, t, amp, 0.005, 2.6); this.out(g, 0.7, pan);
      o.start(t); o.stop(t + 2.7);
    }
  }

  raptor() {
    const t = this.ctx.currentTime + 0.01, o = this.osc('sine', 2300), g = this.gain(0);
    o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
    const v = this.osc('sine', 14), vg = this.gain(80); v.connect(vg).connect(o.frequency);
    o.connect(g); this.env(g, t, 0.03, 0.05, 1.0); this.out(g, 0.6, (Math.random() - 0.5) * 1.4);
    o.start(t); v.start(t); o.stop(t + 1.05); v.stop(t + 1.05);
  }

  arpeggio(kind) {
    if (!this.ctx) return;
    const seq = { grow: [0, 2, 4, 5], birth: [3, 5, 6, 8, 10], rest: [5, 3, 2, 0] }[kind];
    const gap = kind === 'rest' ? 0.38 : kind === 'birth' ? 0.2 : 0.14;
    const t = this.ctx.currentTime + 0.05;
    seq.forEach((n, k) => {
      const f = PENTA[n] * (kind === 'rest' ? 0.5 : 1);
      for (const [mult, type, amp] of [[1, 'sine', 0.06], [2, 'triangle', 0.012]]) {
        const o = this.osc(type, f * mult), g = this.gain(0);
        o.connect(g); this.env(g, t + k * gap, amp, 0.01, 1.8); this.out(g, 0.6);
        o.start(t + k * gap); o.stop(t + k * gap + 1.9);
      }
    });
  }
}

// =============================================================== UI

// DOM overlay: identity card, life-stage track, the live MIND panel
// (needs, current behaviour, utility scores), captions and input status.

const STATE_LABEL = {
  WANDER: 'Exploring', HUNT: 'Hunting', SLEEP: 'Sleeping', GROOM: 'Grooming', CURIOUS: 'Curious',
  PETTED: 'Being petted', FLEE: 'Fleeing', AVOID: 'Wary', PLAY: 'Playing', MIGRATE: 'Migrating',
  ARRIVE: 'Arriving', REST: 'Resting'
};
const PHASE_LABEL = { stalk: 'Stalking', wiggle: 'Wiggling', pounce: 'Pouncing', eat: 'Eating', run: 'Running', bat: 'Batting', pause: 'Looking around' };
const NEED_ROWS = [['energy', 'Energy'], ['fullness', 'Fullness'], ['trust', 'Trust'], ['stress', 'Stress']];
const SCORE_ROWS = ['WANDER', 'HUNT', 'SLEEP', 'GROOM', 'CURIOUS', 'AVOID'];
const HINTS = [
  'Hold an open hand slowly over the cat to pet it',
  'Sweep your hand quickly toward it to chase',
  'Leave it alone — it hunts, grooms and naps on its own',
  'Gentle hands build trust; a trusting cat turns chasing into play'
];

class UI {
  constructor(world) {
    this.w = world;
    this.$ = id => document.getElementById(id);
    this.tick = 0;
    this.capT = 0;
    this.hintT = 0;
    this.hintI = 0;
    this.visible = true;
    const needs = this.$('needs'), scores = this.$('scores');
    this.needBars = {};
    for (const [k, label] of NEED_ROWS) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="lbl">${label}</span><span class="bar"><i class="need-${k}"></i></span><span class="val"></span>`;
      needs.appendChild(row);
      this.needBars[k] = { fill: row.querySelector('i'), val: row.querySelector('.val') };
    }
    this.scoreBars = {};
    for (const k of SCORE_ROWS) {
      const row = document.createElement('div');
      row.className = 'row score';
      row.innerHTML = `<span class="lbl">${STATE_LABEL[k]}</span><span class="bar"><i></i></span>`;
      scores.appendChild(row);
      this.scoreBars[k] = { row, fill: row.querySelector('i') };
    }
  }

  caption(main, sub, secs = 4.5) {
    this.$('capMain').textContent = main;
    this.$('capSub').textContent = sub || '';
    this.$('caption').classList.add('show');
    this.capT = secs;
  }

  toggle(id) { this.$(id).classList.toggle('hidden'); }

  setVisible(v) {
    this.visible = v;
    this.$('ui').classList.toggle('hidden', !v);
  }

  update(dt) {
    const sec = dt / 60;
    if (this.capT > 0) { this.capT -= sec; if (this.capT <= 0) this.$('caption').classList.remove('show'); }
    this.tick += sec;
    if (this.tick < 0.1) return;
    this.tick = 0;
    const w = this.w, cat = w.cat, br = cat.brain, g = cat.g;

    this.$('hudGen').textContent = `Generation ${g.generation}${g.parentName ? ' · child of ' + g.parentName : ''}`;
    this.$('hudName').textContent = g.name;
    this.$('hudSub').textContent = `${STAGES[cat.stage]} · ${w.biome.name}`;
    const eye = cat.age < 1 ? 'kitten-blue eyes' : 'eyes ' + this.eyeWord(g.eye);
    this.$('hudTraits').textContent = `${g.describe()} coat · ${eye}`;
    document.querySelectorAll('#lifeTrack .seg i').forEach((el, i) => {
      el.style.width = `${clampv(cat.age - i, 0, 1) * 100}%`;
    });
    document.querySelectorAll('#lifeTrack .seg').forEach((el, i) => el.classList.toggle('now', i === Math.min(2, Math.floor(cat.age))));
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--tint', w.biome.uiTint);
    rootStyle.setProperty('--glass', w.biome.uiGlass);

    const label = br.behaviour === 'HUNT' || br.behaviour === 'PLAY' || (br.behaviour === 'WANDER' && br.phase === 'pause')
      ? (PHASE_LABEL[br.phase] || STATE_LABEL[br.behaviour]) : STATE_LABEL[br.behaviour];
    this.$('mindState').textContent = label;
    this.$('mindThought').textContent = `“${br.thought}”`;
    for (const [k] of NEED_ROWS) {
      const v = br.needs[k];
      this.needBars[k].fill.style.width = `${v * 100}%`;
      this.needBars[k].val.textContent = Math.round(v * 100);
    }
    const reactive = ['PETTED', 'FLEE', 'PLAY', 'MIGRATE', 'ARRIVE', 'REST'].includes(br.behaviour);
    this.$('scoresNote').textContent = reactive ? 'overridden by ' + (br.lifecycle ? 'life cycle' : 'your hand') : 'highest score wins';
    for (const k of SCORE_ROWS) {
      const v = br.scores[k] || 0;
      this.scoreBars[k].fill.style.width = `${clampv(v, 0, 1.2) / 1.2 * 100}%`;
      this.scoreBars[k].row.classList.toggle('active', !reactive && br.behaviour === k);
    }

    const h = w.hand, st = this.$('status');
    let txt;
    if (h.cameraState === 'loading' || h.cameraState === 'starting') txt = 'Starting hand tracking…';
    else if (h.source === 'camera') txt = br.behaviour === 'PETTED' ? 'Hand · petting' : h.speed > CHASE_SPEED ? 'Hand · chasing!' : 'Hand detected';
    else if (h.cameraState === 'ready') txt = 'Show your hand to the camera';
    else if (h.cameraState === 'denied' || h.cameraState === 'unavailable') txt = 'Camera unavailable · using mouse';
    else txt = h.source === 'mouse' ? (br.behaviour === 'PETTED' ? 'Mouse · petting' : 'Mouse hand') : 'Mouse mode';
    st.textContent = txt;
    st.classList.toggle('live', h.present);

    this.hintT -= 0.1;
    if (this.hintT <= 0 && w.started) {
      this.hintT = 7;
      this.hintI = (this.hintI + 1) % HINTS.length;
      this.$('hint').textContent = HINTS[this.hintI];
    }
  }

  eyeWord(c) {
    const [r, g, b] = c;
    if (b > r && b > g) return 'blue';
    if (g > r * 0.95 && g > b) return g - b > 60 && r > 150 ? 'yellow-green' : 'green';
    if (r > 200 && g < 140) return 'copper';
    return 'amber';
  }
}
