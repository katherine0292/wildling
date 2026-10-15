// THE WORLD — life cycle and ecosystem, the three biomes, and the prey that live in them.

// =============================================================== World

// The ecosystem and life cycle:
//   Kitten (Jungle) → Juvenile (Snowfields) → Adult (Desert) → rests → a
//   mutated kitten is born back in the Jungle. Each stage change is a
//   migration: the cat walks off-screen and arrives in the next habitat.

const STAGE_COPY = [
  'Safe, warm and full of butterflies.',
  'Cold paws, quick birds — it tires faster here.',
  'Bright sun, slit pupils, beetles in the sand.'
];

class World {
  constructor(opts = {}) {
    this.biomes = [new JungleBiome(), new SnowBiome(), new DesertBiome()];
    this.biomeIndex = opts.stage || 0;
    this.hand = new HandInput();
    this.sound = new SoundEngine();
    this.prey = [];
    this.prints = [];
    this.fx = [];
    this.time = 0;
    this.dt = 1;
    this.growthBoost = 1;
    this.transition = null;
    this.debug = !!opts.debug;
    this.started = false;
    this.spawnT = 1;
    this.restT = 0;
    this.buildBiomes();
    const g = Genome.random(Math.random, { pattern: opts.pattern, coat: opts.coat });
    this.newCat(g, this.biomeIndex + (opts.stage ? 0.05 : 0), !opts.wake);
    this.ui = new UI(this);
  }

  get biome() { return this.biomes[this.biomeIndex]; }

  buildBiomes() {
    const w = Math.max(60, width), h = Math.max(60, height);
    this.biomes[this.biomeIndex].build(w, h);
    this.biomes.forEach((b, i) => { if (i !== this.biomeIndex) setTimeout(() => this.ensureBiome(b), 200 + i * 250); });
    this.shadow = makeLayer(w, h, 0.25);
  }

  ensureBiome(b = this.biome) {
    if (width < 60 || height < 60) return;
    if (!b.ready || b.w !== width || b.h !== height) b.build(width, height);
    if (this.shadow.canvas.width !== Math.ceil(width * 0.25) || this.shadow.canvas.height !== Math.ceil(height * 0.25))
      this.shadow = makeLayer(width, height, 0.25);
  }

  resize() {
    for (const b of this.biomes) b.ready = false;
    this.buildBiomes();
    this.cat.pos = pt(clampv(this.cat.pos.x, 60 * U, width - 60 * U), clampv(this.cat.pos.y, 60 * U, height - 60 * U));
  }

  newCat(genome, age, asleep = true, inheritedTrust = 0) {
    const cat = new Cat(genome, width * 0.5, height * 0.56, age, -0.4);
    cat.brain.needs.trust = clampv(0.3 + inheritedTrust * 0.25, 0, 1);
    if (asleep) {
      cat.brain.needs.energy = 0.55;
      cat.beginCurl();
      cat.pose.curl = 1;
      cat.pose.eye = 0;
    } else {
      cat.brain.needs.energy = 1;
      cat.brain.decide(this, true);
    }
    this.cat = cat;
  }

  begin(mode) {
    this.started = true;
    this.sound.start(this.biomeIndex);
    if (mode === 'camera') this.hand.startCamera();
    this.ui.caption(`${STAGES[this.cat.stage]} · ${this.biome.name}`, STAGE_COPY[this.biomeIndex]);
  }

  // ------------------------------------------------------------ update
  update() {
    const dt = this.dt = Math.min(deltaTime, 50) / (1000 / 60);
    const sec = dt / 60;
    this.time += sec;
    this.ensureBiome();
    this.hand.update(dt);
    this.lifecycle(sec);
    this.cat.update(dt, this);

    this.spawnT -= sec;
    if (this.spawnT <= 0 && !this.transition && this.prey.length < this.biome.preyCount && !this.cat.brain.lifecycle) {
      this.prey.push(Prey.spawn(this.biome.preyKind));
      this.spawnT = 3 + Math.random() * 4;
    }
    for (const p of this.prey) p.update(dt, this);
    this.prey = this.prey.filter(p => p.alive);

    for (const p of this.prints) p.age += sec;
    this.prints = this.prints.filter(p => p.age < p.max);
    for (const f of this.fx) {
      f.life += sec;
      if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    }
    this.fx = this.fx.filter(f => f.life < f.max);

    this.sound.update(dt, this);
    this.ui.update(dt);
  }

  lifecycle(sec) {
    const cat = this.cat, br = cat.brain;
    if (this.transition) { this.runTransition(sec); return; }
    if (br.lifecycle === 'MIGRATE') {
      const p = cat.pos, m = 120 * U;
      if (p.x > width + m || p.x < -m || p.y < -m || p.y > height + m) this.startTransition('migrate');
      return;
    }
    if (br.lifecycle === 'REST') {
      this.restT += sec;
      if (this.restT > 7) this.startTransition('rebirth');
      return;
    }
    if (br.lifecycle) return;
    const next = this.biomeIndex + 1;
    if (this.biomeIndex < 2 && cat.age >= next) {
      cat.age = next - 0.0001;
      br.setLifecycle('MIGRATE', this);
      this.ui.caption(`${cat.g.name} is growing up`, `Something calls from beyond the ${this.biome.shortName}…`);
      this.sound.arpeggio('grow');
      this.sound.meow(cat.stage, 'normal');
    } else if (this.biomeIndex === 2 && cat.age >= 3) {
      cat.age = 3;
      br.setLifecycle('REST', this);
      this.restT = 0;
      this.ui.caption(`${cat.g.name} has lived a full life`, 'Curling up one last time under the desert sky…', 7);
      this.sound.arpeggio('rest');
    }
  }

  startTransition(kind) {
    this.transition = { kind, phase: 'out', t: 0, dur: kind === 'rebirth' ? 2.6 : 1.4, colour: this.biome.fadeRGB };
  }

  runTransition(sec) {
    const tr = this.transition;
    tr.t += sec;
    if (tr.phase === 'out' && tr.t >= tr.dur) { this.swap(tr.kind); tr.phase = 'hold'; tr.t = 0; }
    else if (tr.phase === 'hold' && tr.t >= 0.5) { tr.phase = 'in'; tr.t = 0; }
    else if (tr.phase === 'in' && tr.t >= tr.dur) this.transition = null;
  }

  swap(kind) {
    if (kind === 'migrate') {
      this.biomeIndex = Math.min(2, this.biomeIndex + 1);
      this.ensureBiome();
      const cat = this.cat;
      cat.age = this.biomeIndex;
      cat.updateDims();
      cat.resetBody(-90 * U, height * (0.4 + Math.random() * 0.25), 0);
      cat.brain.setLifecycle('ARRIVE', this);
      this.ui.caption(`${STAGES[cat.stage]} · ${this.biome.name}`, STAGE_COPY[this.biomeIndex]);
      this.sound.setBiome(this.biomeIndex);
    } else {
      const parent = this.cat;
      const child = Genome.mutate(parent.g);
      this.biomeIndex = 0;
      this.ensureBiome();
      this.newCat(child, 0, true, parent.brain.needs.trust);
      this.ui.caption(`Generation ${child.generation} · ${child.name} is born`,
        `Child of ${child.parentName} — ${child.mutations.join(', ')}`, 6);
      this.sound.setBiome(0);
      this.sound.arpeggio('birth');
      setTimeout(() => this.sound.meow(0, 'soft'), 1400);
    }
    this.prey = []; this.prints = []; this.fx = [];
    this.spawnT = 1.5;
  }

  jumpToStage(i) {
    this.transition = null;
    this.biomeIndex = i;
    this.ensureBiome();
    this.newCat(this.cat.g, i + 0.05, false, this.cat.brain.needs.trust);
    this.prey = []; this.prints = []; this.fx = [];
    this.sound.setBiome(i);
    this.ui.caption(`${STAGES[this.cat.stage]} · ${this.biome.name}`, STAGE_COPY[i]);
  }

  addPrint(p, heading, size, front) {
    if (!this.biome.prints || this.transition) return;
    this.prints.push({ x: p.x, y: p.y, a: heading, s: size * (front ? 1 : 0.92), age: 0, max: 24 });
    if (this.prints.length > 280) this.prints.shift();
  }

  burst(p, colour, n) {
    for (let i = 0; i < n; i++) {
      const v = polar(Math.random() * FULL_TURN, (1 + Math.random() * 3) * U);
      this.fx.push({ type: 'spark', x: p.x, y: p.y, vx: v.x, vy: v.y, life: 0, max: 0.5 + Math.random() * 0.4, col: colour, size: (1.5 + Math.random() * 2) * U });
    }
  }

  // ------------------------------------------------------------ draw
  draw() {
    const ctx = drawingContext, b = this.biome, cat = this.cat;
    b.drawGround(ctx);
    b.drawUnder(ctx, this.time);
    this.drawPrints(ctx);

    // Soft contact shadows: silhouettes drawn at quarter resolution, then upscaled.
    const s = this.shadow.ctx;
    s.clearRect(0, 0, width, height);
    s.filter = 'blur(1.5px)';
    s.fillStyle = rgba(b.shadowRGB); s.strokeStyle = rgba(b.shadowRGB);
    const k = 0.5 + 0.5 * cat.size;
    cat.drawSilhouette(s, pt(b.shadowOff.x * U * k, b.shadowOff.y * U * k));
    for (const p of this.prey) p.drawSilhouette(s, pt(b.shadowOff.x * U * 0.4, b.shadowOff.y * U * 0.4));
    s.filter = 'none';
    ctx.save();
    ctx.globalAlpha = b.shadowAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.shadow.canvas, 0, 0, width, height);
    ctx.restore();

    for (const p of this.prey) if (!p.flying) p.draw(ctx);
    cat.draw(ctx);
    for (const p of this.prey) if (p.flying) p.draw(ctx);
    this.drawFx(ctx);
    b.drawOver(ctx, this.time, this.dt);
    b.drawVignette(ctx);

    const br = cat.brain;
    this.hand.draw(ctx, br.behaviour === 'PETTED' ? 'pet' : 'idle');
    if (this.debug) { cat.drawDebug(ctx); this.drawDebugText(ctx); }
    this.hand.drawPreview(ctx);

    if (this.transition) {
      const tr = this.transition;
      const a = tr.phase === 'out' ? easeInOut(tr.t / tr.dur) : tr.phase === 'hold' ? 1 : 1 - easeInOut(tr.t / tr.dur);
      ctx.fillStyle = rgba(tr.colour, a);
      ctx.fillRect(0, 0, width, height);
    }
  }

  drawPrints(ctx) {
    const b = this.biome;
    if (!b.prints) return;
    ctx.save();
    for (const p of this.prints) {
      const fade = 1 - p.age / p.max, sc = p.s * U;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.a);
      for (const [dx, dy, col, a] of [[-0.8, -1, [255, 255, 255], 0.5], [0, 0, b.printRGB, 0.5]]) {
        ctx.fillStyle = rgba(col, a * fade);
        ctx.beginPath(); ctx.ellipse(dx * U, dy * U, 3.6 * sc, 4 * sc, 0, 0, FULL_TURN); ctx.fill();
        for (const [tx, ty] of [[5.2, -3.4], [6.8, -1.1], [6.8, 1.1], [5.2, 3.4]]) {
          ctx.beginPath(); ctx.arc(tx * sc + dx * U, ty * sc + dy * U, 1.5 * sc, 0, FULL_TURN); ctx.fill();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawFx(ctx) {
    ctx.save();
    for (const f of this.fx) {
      const k = f.life / f.max, a = 1 - k;
      if (f.type === 'z') {
        ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.font = `italic ${f.size * (0.8 + k * 0.8)}px Georgia, serif`;
        ctx.fillText('z', f.x + Math.sin(f.life * 3) * 6 * U, f.y - f.life * 28 * U);
      } else if (f.type === 'ring') {
        ctx.strokeStyle = `rgba(255,240,220,${0.35 * a})`;
        ctx.lineWidth = 1.5 * U;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + k * 46 * U, 0, FULL_TURN); ctx.stroke();
      } else if (f.type === 'heart') {
        const s = f.size * (0.7 + 0.5 * Math.min(1, k * 4)), x = f.x + Math.sin(f.life * 4) * 5 * U, y = f.y - f.life * 34 * U;
        ctx.fillStyle = `rgba(255,128,156,${0.9 * a})`;
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.35);
        ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s * 1.1, x, y - s * 0.45);
        ctx.bezierCurveTo(x + s * 0.4, y - s * 1.1, x + s, y - s * 0.4, x, y + s * 0.35);
        ctx.fill();
      } else if (f.type === 'alert') {
        const s = (18 + 10 * Math.min(1, k * 5)) * U;
        ctx.font = `800 ${s}px "Avenir Next", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4 * U; ctx.strokeStyle = `rgba(40,20,10,${0.7 * a})`;
        ctx.strokeText('!', f.x, f.y - k * 10 * U);
        ctx.fillStyle = `rgba(255,226,110,${a})`;
        ctx.fillText('!', f.x, f.y - k * 10 * U);
        ctx.textAlign = 'left';
      } else if (f.type === 'spark') {
        ctx.fillStyle = rgba(f.col, a);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size * a, 0, FULL_TURN); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawDebugText(ctx) {
    const c = this.cat, b = c.brain, h = this.hand;
    ctx.save();
    ctx.font = `12px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(width / 2 - 170, 12, 340, 54);
    ctx.fillStyle = '#9ff';
    ctx.fillText(`${b.behaviour}${b.phase ? ':' + b.phase : ''}  age ${c.age.toFixed(2)}  speed ${(c.speed / U).toFixed(2)}`, width / 2 - 160, 32);
    ctx.fillText(`hand ${h.source} ${h.present ? 'present' : '—'}  ${h.speed.toFixed(0)} U/s  (pet<${PET_SPEED} chase>${CHASE_SPEED})`, width / 2 - 160, 52);
    ctx.restore();
  }
}

// =============================================================== Biomes

// Three habitats, one per life stage. Each biome paints its static ground
// once into an offscreen canvas, then animates light, weather and
// foreground plants every frame. Biomes also change the cat's behaviour:
// cold snow drains energy and slows it down, bright desert narrows pupils.

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

class Prey {
  constructor(kind, x, y, heading) {
    this.kind = kind;
    this.pos = pt(x, y);
    this.vel = pt(0, 0);
    this.heading = heading;
    this.t = Math.random() * 100;
    this.seed = Math.random() * 1000;
    this.alive = true;
    this.fade = 0;
    this.state = kind === 'bird' ? 'land' : kind === 'butterfly' ? 'fly' : 'crawl';
    this.stateT = 0;
    this.alt = kind === 'bird' ? 1 : kind === 'butterfly' ? 0.6 : 0;
    this.hopT = 0.5;
    this.peck = 0;
    if (kind === 'butterfly') this.wings = pick(BUTTERFLY_WINGS);
    if (kind === 'beetle') this.shell = pick(BEETLE_SHELLS);
    this.size = (kind === 'butterfly' ? 15 : kind === 'bird' ? 13 : 9) * U;
    // Seconds of continuous danger before it reacts: a fast pounce can beat it.
    this.reaction = 0.22 + Math.random() * 0.3;
    this.alarm = 0;
  }

  static spawn(kind) {
    const side = Math.floor(Math.random() * 4), m = 30 * U;
    let x, y;
    if (side === 0) { x = -m; y = Math.random() * height; }
    else if (side === 1) { x = width + m; y = Math.random() * height; }
    else if (side === 2) { x = Math.random() * width; y = -m; }
    else { x = Math.random() * width; y = height + m; }
    const h = angTo(pt(x, y), pt(width * (0.3 + Math.random() * 0.4), height * (0.3 + Math.random() * 0.4)));
    return new Prey(kind, x, y, h);
  }

  get fxColour() {
    return this.kind === 'butterfly' ? this.wings.a : this.kind === 'beetle' ? this.shell : [200, 170, 130];
  }

  get onScreen() {
    const m = 20 * U;
    return this.pos.x > m && this.pos.x < width - m && this.pos.y > m && this.pos.y < height - m;
  }

  get huntable() {
    if (!this.alive || !this.onScreen || this.fade < 0.9) return false;
    if (this.kind === 'butterfly') return this.alt < 0.55;
    if (this.kind === 'bird') return this.state === 'hop';
    return true;
  }

  caught() { this.alive = false; }

  threatened(world) {
    const cat = world.cat, h = cat.headCentre();
    const sneaky = cat.brain.behaviour === 'HUNT' && cat.brain.phase !== 'pounce';
    const r = (sneaky ? 55 : 120) * U * (0.6 + 0.4 * cat.size);
    if (vdist(h, this.pos) < r && cat.brain.behaviour !== 'SLEEP') return h;
    const hand = world.hand;
    if (hand.present && hand.speed > 700 && vdist(hand.pos, this.pos) < 160 * U) return hand.pos;
    return null;
  }

  steerInside(rate) {
    const m = 70 * U;
    if (this.pos.x < m || this.pos.x > width - m || this.pos.y < m || this.pos.y > height - m) {
      const toC = angTo(this.pos, pt(width / 2, height / 2));
      this.heading += angDiff(toC, this.heading) * rate;
    }
  }

  update(dt, world) {
    const sec = dt / 60;
    this.t += sec;
    this.stateT += sec;
    this.fade = Math.min(1, this.fade + sec * 1.5);
    const danger = this.threatened(world);
    this.alarm = danger ? this.alarm + sec : Math.max(0, this.alarm - sec);
    const threat = this.alarm > this.reaction ? danger : null;
    if (this.kind === 'butterfly') this.updateButterfly(dt, threat);
    else if (this.kind === 'bird') this.updateBird(dt, threat);
    else this.updateBeetle(dt, threat);
    this.pos = addP(this.pos, this.vel, dt);
  }

  updateButterfly(dt, threat) {
    if (threat && this.state !== 'flee') { this.state = 'flee'; this.stateT = 0; this.heading = angTo(threat, this.pos); }
    if (this.state === 'rest') {
      this.vel = pt(0, 0);
      this.alt = approach(this.alt, 0, 0.08 * dt);
      if (this.stateT > 2.5 + (this.seed % 3)) { this.state = 'fly'; this.stateT = 0; }
      return;
    }
    if (this.state === 'flee') {
      this.alt = approach(this.alt, 1, 0.08 * dt);
      this.vel = polar(this.heading, 3 * U);
      if (this.stateT > 1.4) { this.state = 'fly'; this.stateT = 0; }
      return;
    }
    this.heading += (noise(this.seed, this.t * 0.6) - 0.5) * 0.14 * dt;
    this.steerInside(0.05 * dt);
    this.alt = approach(this.alt, 0.2 + 0.7 * noise(this.seed + 9, this.t * 0.3), 0.04 * dt);
    const flutter = polar(this.heading + Math.PI / 2, Math.sin(this.t * 11) * 0.9 * U);
    this.vel = addP(polar(this.heading, 1.25 * U), flutter);
    if (this.stateT > 5 && Math.random() < 0.004 * dt && this.onScreen) { this.state = 'rest'; this.stateT = 0; }
  }

  updateBird(dt, threat) {
    if (threat && this.state === 'hop') { this.state = 'fly'; this.stateT = 0; this.heading = angTo(threat, this.pos) + (Math.random() - 0.5) * 0.6; }
    if (this.state === 'land') {
      this.alt = approach(this.alt, 0, 0.03 * dt);
      this.vel = polar(this.heading, 2.6 * U * this.alt + 0.2 * U);
      if (this.alt < 0.05) { this.state = 'hop'; this.stateT = 0; this.alt = 0; }
      return;
    }
    if (this.state === 'fly') {
      this.alt = approach(this.alt, 1, 0.06 * dt);
      this.vel = polar(this.heading, 4.2 * U);
      if (this.pos.x < -60 * U || this.pos.x > width + 60 * U || this.pos.y < -60 * U || this.pos.y > height + 60 * U) this.alive = false;
      return;
    }
    this.hopT -= dt / 60;
    this.vel = lerpP(this.vel, pt(0, 0), 0.25 * dt);
    this.peck = Math.max(0, this.peck - dt / 60 * 4);
    if (this.hopT <= 0) {
      this.hopT = 0.45 + Math.random() * 0.9;
      if (Math.random() < 0.35) this.peck = 1;
      else {
        this.heading += (Math.random() - 0.5) * 1.6;
        this.steerInside(0.8);
        this.vel = polar(this.heading, (2.4 + Math.random() * 1.6) * U);
      }
    }
  }

  updateBeetle(dt, threat) {
    if (threat && this.state !== 'scurry') { this.state = 'scurry'; this.stateT = 0; this.heading = angTo(threat, this.pos); }
    if (this.state === 'scurry') {
      this.vel = polar(this.heading, 2.3 * U);
      this.steerInside(0.1 * dt);
      if (this.stateT > 1.1) { this.state = 'crawl'; this.stateT = 0; }
      return;
    }
    if (this.state === 'freeze') {
      this.vel = pt(0, 0);
      if (this.stateT > 1.2 + (this.seed % 1.5)) { this.state = 'crawl'; this.stateT = 0; }
      return;
    }
    this.heading += (noise(this.seed, this.t * 0.5) - 0.5) * 0.08 * dt;
    this.steerInside(0.05 * dt);
    this.vel = polar(this.heading, 0.5 * U);
    if (this.stateT > 3 && Math.random() < 0.006 * dt) { this.state = 'freeze'; this.stateT = 0; }
  }

  get flying() { return this.alt > 0.35; }

  drawSilhouette(ctx, off) {
    const k = 1 + this.alt * 3.5;
    const s = this.size * (this.kind === 'butterfly' ? 0.9 : 0.75);
    ctx.beginPath();
    ctx.ellipse(this.pos.x + off.x * k, this.pos.y + off.y * k, s, s * 0.7, this.heading, 0, FULL_TURN);
    ctx.fill();
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.fade;
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.heading);
    const sc = 1 + this.alt * 0.35;
    ctx.scale(sc, sc);
    if (this.kind === 'butterfly') this.drawButterfly(ctx);
    else if (this.kind === 'bird') this.drawBird(ctx);
    else this.drawBeetle(ctx);
    ctx.restore();
  }

  drawButterfly(ctx) {
    const s = this.size, w = this.wings;
    const flap = this.state === 'rest' ? 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 2)) : 0.15 + 0.85 * Math.abs(Math.sin(this.t * 16));
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(1, side * flap);
      for (const [ang, len, wid, col] of [[1.15, 1.0, 0.62, w.a], [2.25, 0.72, 0.5, mixRGB(w.a, w.b, 0.25)]]) {
        ctx.save();
        ctx.rotate(ang);
        const g = ctx.createRadialGradient(0, 0, 0, s * len * 0.5, 0, s * len);
        g.addColorStop(0, rgba(w.b)); g.addColorStop(0.35, rgba(col)); g.addColorStop(0.85, rgba(col)); g.addColorStop(1, rgba(w.b));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(s * len * 0.5, 0, s * len * 0.55, s * wid * 0.55, 0, 0, FULL_TURN); ctx.fill();
        ctx.fillStyle = rgba(w.spot, 0.85);
        ctx.beginPath(); ctx.arc(s * len * 0.78, 0, s * 0.08, 0, FULL_TURN); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(30,24,20,0.95)';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.1, 0, 0, FULL_TURN); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,20,0.8)'; ctx.lineWidth = 0.8 * U;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.4, 0); ctx.lineTo(s * 0.75, sd * s * 0.22); ctx.stroke(); }
  }

  drawBird(ctx) {
    const s = this.size;
    const flying = this.alt > 0.15;
    ctx.fillStyle = 'rgba(70,50,36,0.9)';
    ctx.beginPath(); ctx.moveTo(-s * 0.6, 0); ctx.lineTo(-s * 1.15, s * 0.22); ctx.lineTo(-s * 1.15, -s * 0.22); ctx.closePath(); ctx.fill();
    if (flying) {
      const f = Math.sin(this.t * 22);
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(1, side * (0.4 + 0.6 * Math.abs(f)));
        ctx.fillStyle = 'rgba(245,244,240,1)';
        ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.8, s * 0.35, s * 0.85, 0.2, 0, FULL_TURN); ctx.fill();
        ctx.fillStyle = 'rgba(40,34,30,0.9)';
        ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 1.35, s * 0.25, s * 0.35, 0.2, 0, FULL_TURN); ctx.fill();
        ctx.restore();
      }
    }
    const g = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
    g.addColorStop(0, 'rgb(246,244,238)'); g.addColorStop(0.5, 'rgb(196,160,118)'); g.addColorStop(1, 'rgb(246,244,238)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-s * 0.1, 0, s * 0.62, s * 0.45, 0, 0, FULL_TURN); ctx.fill();
    if (!flying) {
      ctx.fillStyle = 'rgba(52,40,32,0.85)';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-s * 0.3, side * s * 0.28, s * 0.42, s * 0.13, side * 0.15, 0, FULL_TURN); ctx.fill(); }
    }
    const hx = s * 0.48 + this.peck * s * 0.2;
    ctx.fillStyle = 'rgb(250,248,244)';
    ctx.beginPath(); ctx.arc(hx, 0, s * 0.3, 0, FULL_TURN); ctx.fill();
    ctx.fillStyle = 'rgb(232,170,60)';
    ctx.beginPath(); ctx.moveTo(hx + s * 0.45, 0); ctx.lineTo(hx + s * 0.22, s * 0.09); ctx.lineTo(hx + s * 0.22, -s * 0.09); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgb(20,18,18)';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 0.1, side * s * 0.17, s * 0.06, 0, FULL_TURN); ctx.fill(); }
  }

  drawBeetle(ctx) {
    const s = this.size, moving = vlen(this.vel) > 0.05 * U;
    ctx.strokeStyle = 'rgba(28,24,22,0.9)'; ctx.lineWidth = 1 * U; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const ph = moving ? Math.sin(this.t * 22 + i * 2 + (side > 0 ? Math.PI : 0)) * 0.35 : 0;
        const bx = s * (0.45 - i * 0.45), a = side * (Math.PI / 2 + (i - 1) * 0.6 + ph);
        const k = addP(pt(bx, side * s * 0.3), polar(a, s * 0.55));
        const e = addP(k, polar(a - side * 0.5, s * 0.45));
        ctx.beginPath(); ctx.moveTo(bx, side * s * 0.3); ctx.lineTo(k.x, k.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    }
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.95, side * s * 0.12); ctx.quadraticCurveTo(s * 1.4, side * s * 0.2, s * 1.55, side * s * 0.45); ctx.stroke(); }
    ctx.fillStyle = 'rgb(24,22,22)';
    ctx.beginPath(); ctx.ellipse(s * 0.85, 0, s * 0.26, s * 0.24, 0, 0, FULL_TURN); ctx.fill();
    const g = ctx.createRadialGradient(s * 0.1, -s * 0.2, 0, 0, 0, s * 1.1);
    g.addColorStop(0, rgba(mixRGB(this.shell, [255, 255, 255], 0.45)));
    g.addColorStop(0.5, rgba(this.shell));
    g.addColorStop(1, rgba(shadeRGB(this.shell, 0.35)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-s * 0.05, 0, s * 0.8, s * 0.52, 0, 0, FULL_TURN); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8 * U;
    ctx.beginPath(); ctx.moveTo(s * 0.62, 0); ctx.lineTo(-s * 0.82, 0); ctx.stroke();
  }
}
