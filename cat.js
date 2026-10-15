// THE CREATURE — Genome (inherited traits), Brain (needs + decisions), Cat (procedural body).

// =============================================================== Genome

// A cat's inheritable traits. Every new generation is a mutated copy of its
// parent, so coat, pattern and proportions drift across a lineage.

const COATS = [
  { id: 'ginger',   base: '#d8894a', mark: '#9a4a1c', light: '#f4cf98' },
  { id: 'brown',    base: '#9b7a55', mark: '#47321f', light: '#dcc39d' },
  { id: 'silver',   base: '#c4c1bb', mark: '#4a4744', light: '#f1efea' },
  { id: 'smoke',    base: '#717a85', mark: '#363c44', light: '#b2bac4' },
  { id: 'cream',    base: '#e3c9a0', mark: '#b48a56', light: '#f8ecd6' },
  { id: 'golden',   base: '#d49d4b', mark: '#3a2715', light: '#f3daa2' },
  { id: 'charcoal', base: '#3d3a3d', mark: '#1a191b', light: '#77706b' },
  { id: 'snow',     base: '#e7e3dc', mark: '#8a837a', light: '#ffffff' }
];
const POINT_COATS = ['cream', 'snow', 'silver'];
const POINT_MARKS = ['#4a3122', '#525d6b', '#86593a'];
const PATTERNS = ['tabby', 'spotted', 'rosette', 'colorpoint'];
const EYE_COLOURS = ['#e2a72a', '#9cc54a', '#d47b2b', '#c9b043', '#5fb3a0', '#79b6e6'];
const KITTEN_EYE = '#86b9e6'; // all kittens are born with blue eyes
const CAT_NAMES = ['Mochi', 'Bao', 'Yuzu', 'Miso', 'Tofu', 'Kiko', 'Nori', 'Pip', 'Suki',
  'Juniper', 'Ember', 'Sable', 'Lumi', 'Taro', 'Wren', 'Clover', 'Koa', 'Momo', 'Saffron',
  'Indigo', 'Pebble', 'Fable', 'Rune', 'Sorrel', 'Dune', 'Frost', 'Fern', 'Ash'];

class Genome {
  constructor(t) {
    Object.assign(this, t);
    this.buildMarks();
  }

  static random(rand = Math.random, overrides = {}) {
    const pattern = overrides.pattern || pick(PATTERNS, rand);
    let coat;
    if (pattern === 'colorpoint') {
      const c = COATS.find(k => k.id === pick(POINT_COATS, rand));
      coat = { base: hexRGB(c.base), mark: hexRGB(pick(POINT_MARKS, rand)), light: hexRGB(c.light) };
    } else {
      const choices = COATS.filter(k => k.id !== 'snow' || pattern !== 'tabby');
      const c = overrides.coat ? COATS.find(k => k.id === overrides.coat) : pick(choices, rand);
      coat = { base: hexRGB(c.base), mark: hexRGB(c.mark), light: hexRGB(c.light) };
    }
    return new Genome({
      name: pick(CAT_NAMES, rand),
      generation: 1,
      parentName: null,
      seed: Math.floor(rand() * 1e9),
      coat, pattern,
      density: 0.8 + rand() * 0.45,
      contrast: 0.65 + rand() * 0.35,
      eye: hexRGB(pick(EYE_COLOURS, rand)),
      earSize: 0.88 + rand() * 0.3,
      tailLen: 0.88 + rand() * 0.3,
      bodyLen: 0.94 + rand() * 0.14,
      legLen: 0.94 + rand() * 0.14,
      headSize: 0.94 + rand() * 0.12,
      fluff: 0.6 + rand() * 0.8,
      socks: rand() < 0.3,
      whiteMuzzle: rand() < 0.35,
      tailTipDark: rand() < 0.6,
      mutations: []
    });
  }

  // Child = parent traits, each nudged; a few traits can flip entirely.
  static mutate(p, rand = Math.random) {
    const jitter = (v, amt, lo, hi) => clampv(v * (1 + (rand() * 2 - 1) * amt), lo, hi);
    const notes = [];
    let pattern = p.pattern;
    if (rand() < 0.2) { pattern = pick(PATTERNS.filter(x => x !== p.pattern), rand); notes.push(`pattern → ${pattern}`); }
    const stranger = Genome.random(rand, { pattern });
    const drift = 0.12 + rand() * 0.25;
    const coat = {
      base: mixRGB(p.coat.base, stranger.coat.base, drift),
      mark: mixRGB(p.coat.mark, stranger.coat.mark, drift),
      light: mixRGB(p.coat.light, stranger.coat.light, drift)
    };
    if (drift > 0.3) notes.push('coat colour shifted');
    let eye = p.eye;
    if (rand() < 0.3) { eye = hexRGB(pick(EYE_COLOURS, rand)); notes.push('new eye colour'); }
    const flip = (v, label) => { if (rand() < 0.15) { notes.push(label); return !v; } return v; };
    let name = pick(CAT_NAMES, rand);
    if (name === p.name) name = pick(CAT_NAMES, rand);
    return new Genome({
      name, generation: p.generation + 1, parentName: p.name,
      seed: Math.floor(rand() * 1e9),
      coat, pattern,
      density: jitter(p.density, 0.12, 0.6, 1.4),
      contrast: jitter(p.contrast, 0.1, 0.5, 1),
      eye,
      earSize: jitter(p.earSize, 0.08, 0.8, 1.3),
      tailLen: jitter(p.tailLen, 0.08, 0.8, 1.3),
      bodyLen: jitter(p.bodyLen, 0.05, 0.88, 1.15),
      legLen: jitter(p.legLen, 0.05, 0.88, 1.15),
      headSize: jitter(p.headSize, 0.05, 0.9, 1.12),
      fluff: jitter(p.fluff, 0.15, 0.4, 1.6),
      socks: flip(p.socks, p.socks ? 'lost white socks' : 'gained white socks'),
      whiteMuzzle: flip(p.whiteMuzzle, 'muzzle colour changed'),
      tailTipDark: p.tailTipDark,
      mutations: notes.length ? notes : ['subtle variation only']
    });
  }

  // Markings live in body-local coordinates: s runs neck→rump (0..1),
  // t runs across the back (-1..1). They are re-projected onto the moving
  // spine every frame, so the coat stretches and bends with the body.
  buildMarks() {
    const r = mulberry32(this.seed);
    const marks = [];
    if (this.pattern === 'tabby') {
      for (let s = 0.12; s < 0.95; s += 0.075 + r() * 0.06) {
        marks.push({ type: 'stripe', s, w: 0.014 + r() * 0.022, chev: 0.02 + r() * 0.05,
          t0: -1.1 + r() * 0.45, t1: 1.1 - r() * 0.45, gap: r() < 0.5 ? (r() < 0.5 ? -1 : 1) : null });
      }
    } else if (this.pattern === 'spotted' || this.pattern === 'rosette') {
      const n = Math.round((this.pattern === 'spotted' ? 34 : 22) * this.density);
      for (let i = 0; i < n; i++) {
        marks.push({ type: this.pattern === 'spotted' ? 'spot' : 'rosette',
          s: 0.05 + r() * 0.92, t: (r() * 2 - 1) * 0.92,
          r: this.pattern === 'spotted' ? 0.07 + r() * 0.07 : 0.11 + r() * 0.07,
          rot: r() * Math.PI, ecc: 0.65 + r() * 0.5 });
      }
    }
    this.marks = marks;
    this.tailRings = this.pattern === 'colorpoint' ? 0 : 5 + Math.floor(r() * 4);
    this.headSpots = [];
    for (let i = 0; i < 7; i++) this.headSpots.push({ x: -0.3 + r() * 0.35, y: (r() * 2 - 1) * 0.5, r: 0.05 + r() * 0.05 });
  }

  describe() {
    const names = { tabby: 'striped tabby', spotted: 'spotted', rosette: 'rosetted', colorpoint: 'colour-point' };
    return names[this.pattern];
  }
}

// =============================================================== Brain

// The cat's mind: four internal needs feed a utility score for each
// autonomous behaviour; the hand (pet / chase) can interrupt at any time.
// Everything here is surfaced live in the MIND panel so the agent's
// reasoning is visible instead of a black box.

const PET_SPEED = 380;    // hand speed (U/s) below which a hovering hand reads as petting
const CHASE_SPEED = 1050; // hand speed (U/s) above which a sweep reads as chasing
const TRUST_TO_PLAY = 0.55;

const THOUGHTS = {
  WANDER: ['just exploring…', 'what\'s over there?', 'sniff, sniff', 'patrolling the {biome}', 'la la la'],
  HUNT: ['a {prey}… don\'t move.', 'wiggle, wiggle…', 'mine.', 'shhh. hunting.'],
  POUNCE: ['NOW!', 'got you—!'],
  EAT: ['crunchy.', 'delicious.', 'hunter instincts: satisfied'],
  MISS: ['…I meant to do that.', 'next time.'],
  SLEEP: ['zzz…', 'dreaming of warm hands', 'nap time', 'zzz… mice… zzz'],
  GROOM: ['washing my face', 'must look presentable', 'lick, lick'],
  CURIOUS: ['a hand? …curious', 'you again?', 'smells friendly', 'what are you?'],
  PETTED: ['purrrr…', 'yes, right there', 'safe.', 'warm hand. good hand.'],
  FLEE: ['too fast! run!', 'HSSS!', 'not today!', 'scary hand!'],
  PLAY: ['chase me!', 'zoomies!!', 'catch me if you can', 'you\'re it!'],
  AVOID: ['I\'m watching you…', 'keep your distance', 'not ready to trust you'],
  MIGRATE: ['the world is bigger than this…', 'something is calling me', 'time to go'],
  ARRIVE: ['new place… new smells', 'so this is the {biome}'],
  REST: ['a long, good life.', 'so sleepy…']
};
const AUTONOMOUS = ['WANDER', 'HUNT', 'SLEEP', 'GROOM', 'CURIOUS', 'AVOID'];

class Brain {
  constructor(cat) {
    this.cat = cat;
    this.behaviour = 'SLEEP';
    this.phase = null;
    this.timer = 0;
    this.lock = 0;
    this.decideIn = 0;
    this.needs = { energy: 0.62, fullness: 0.7, trust: 0.3, stress: 0 };
    this.scores = {};
    this.thought = 'zzz…';
    this.cooldown = { GROOM: 6, HUNT: 0 };
    this.lifecycle = null;
    this.petTime = 0;
    this.misses = 0;
    this.lastHandSeen = -99;
  }

  say(key, world) {
    const lines = THOUGHTS[key];
    if (!lines) return;
    this.thought = pick(lines)
      .replace('{biome}', world ? world.biome.shortName : 'world')
      .replace('{prey}', world ? world.biome.preyName : 'bug');
  }

  set(b, world, phase = null) {
    if (b === this.behaviour && phase === this.phase) return;
    const prev = this.behaviour;
    this.behaviour = b;
    this.phase = phase;
    this.timer = 0;
    this.say(b === 'HUNT' && phase === 'pounce' ? 'POUNCE' : b, world);
    this.cat.onBehaviour(b, prev, world);
  }

  setLifecycle(b, world) {
    this.lifecycle = b;
    this.set(b, world);
  }

  update(dt, world) {
    const sec = dt / 60;
    const n = this.needs, cat = this.cat, b = this.behaviour;
    this.timer += sec;
    this.lock -= sec;
    for (const k in this.cooldown) this.cooldown[k] = Math.max(0, this.cooldown[k] - sec);

    // --- needs drift -------------------------------------------------------
    const drain = world.biome.energyDrain * (cat.age < 1 ? 1.25 : 1) * (cat.age > 2.5 ? 1.2 : 1);
    if (b === 'SLEEP' || b === 'REST') n.energy += 0.055 * sec;
    else if (b === 'FLEE' || b === 'PLAY' || this.phase === 'pounce') n.energy -= 0.03 * drain * sec;
    else n.energy -= 0.0085 * drain * sec;
    n.fullness -= 0.0095 * sec;
    n.stress -= (b === 'PETTED' ? 0.2 : 0.06) * sec;
    if (b === 'FLEE') { n.stress += 0.5 * sec; n.trust -= 0.035 * sec; }
    if (b === 'PETTED') n.trust += 0.075 * sec * (1 - n.trust * 0.6);
    if (b === 'PLAY') n.trust += 0.01 * sec;
    for (const k in n) n[k] = clampv(n[k], 0, 1);

    // --- growth --------------------------------------------------------------
    if (!this.lifecycle) {
      let g = sec / 85;
      if (b === 'PETTED') g += sec / 70;
      if (b === 'PLAY') g += sec / 200;
      cat.age += g * world.growthBoost;
    }

    if (this.lifecycle) return;

    // --- hand overrides -----------------------------------------------------
    const hand = world.hand;
    if (hand.present) this.lastHandSeen = world.time;
    if (hand.present) {
      const dHead = vdist(hand.pos, cat.headCentre());
      const dBody = cat.distToBody(hand.pos);
      const petR = cat.hw * 1.3 + 34 * U;
      const chaseR = 270 * U * (0.6 + 0.4 * cat.size);
      const isChase = hand.speed > CHASE_SPEED && dHead < chaseR;
      const isPet = hand.speed < PET_SPEED && dBody < petR;

      if (isChase && b !== 'PLAY') {
        if (n.trust >= TRUST_TO_PLAY) { this.set('PLAY', world, 'run'); world.sound.meow(cat.stage, 'trill'); }
        else {
          const wasCalm = b !== 'FLEE';
          this.set('FLEE', world);
          if (wasCalm) cat.startle(world, n.trust < 0.3 || n.stress > 0.5);
        }
        this.lock = 1.6;
        return;
      }
      if (b === 'PLAY') {
        if (isChase) { this.lock = 1.4; if (this.phase !== 'run') this.phase = 'run', this.timer = 0; }
        return;
      }
      if (isPet && n.stress < 0.55 && b !== 'FLEE') {
        if (b !== 'PETTED') {
          this.set('PETTED', world);
          this.petTime = 0;
          world.sound.meow(cat.stage, 'trill');
        }
        this.petTime += sec;
        this.lock = 0.5;
        return;
      }
      if (b === 'PETTED' && this.lock > 0) return;
      if (b === 'FLEE' && this.lock > 0) return;
    } else {
      if (b === 'PLAY' && world.time - this.lastHandSeen < 1.5) return;
      if (b === 'FLEE' && this.lock > 0) return;
    }

    if (b === 'PETTED' || b === 'FLEE' || b === 'PLAY') { this.decide(world, true); return; }

    // --- autonomous choice --------------------------------------------------
    const busy = (b === 'SLEEP' && (this.timer < 6 || n.energy < 0.95)) ||
                 (b === 'HUNT' && (this.phase === 'pounce' || this.phase === 'eat' || this.phase === 'wiggle')) ||
                 (b === 'GROOM' && this.timer < this.groomFor);
    this.decideIn -= sec;
    if (this.decideIn <= 0 && !busy) this.decide(world, false);
    else if (this.decideIn <= 0) this.score(world);
  }

  score(world) {
    const n = this.needs, hand = world.hand, s = {};
    const prey = world.prey.some(p => p.alive && p.huntable);
    s.WANDER = 0.3;
    s.HUNT = prey && n.energy > 0.18 && this.cooldown.HUNT <= 0 ? 0.12 + (1 - n.fullness) * 0.95 : 0;
    s.SLEEP = Math.pow(1 - n.energy, 1.5) * 1.25 + (this.cat.age < 1 ? 0.05 : 0) + (this.cat.age > 2.6 ? 0.08 : 0);
    s.GROOM = this.cooldown.GROOM > 0 ? 0 : 0.14 + n.fullness * 0.22;
    s.CURIOUS = hand.present ? clampv(0.36 + n.trust * 0.55 - n.stress * 0.9, 0, 1) : 0;
    s.AVOID = hand.present && n.stress > 0.3 ? clampv(0.25 + n.stress * 0.75 - n.trust * 0.45, 0, 1) : 0;
    this.scores = s;
    this.decideIn = 0.4;
    return s;
  }

  decide(world, force) {
    const s = this.score(world);
    const withInertia = { ...s };
    if (!force && withInertia[this.behaviour] !== undefined) withInertia[this.behaviour] += 0.12;
    let best = 'WANDER', bv = -1;
    for (const k of AUTONOMOUS) if (withInertia[k] > bv) { bv = withInertia[k]; best = k; }
    if (best !== this.behaviour || force) {
      if (best === 'GROOM') this.groomFor = 4 + Math.random() * 2.5;
      if (best === 'HUNT') this.misses = 0;
      this.set(best, world, best === 'HUNT' ? 'stalk' : best === 'WANDER' ? 'walk' : null);
    }
  }
}

// =============================================================== Cat

// A procedurally animated cat seen from above.
// Body  = a chain of spine joints that follows the head (follow-the-leader
//         with bend limits), so turning, curling and sitting emerge from
//         where the head goes rather than from pre-drawn frames.
// Legs  = 2-bone inverse kinematics; paws stay planted and step in a
//         diagonal trot only when the body has moved too far from them.
// Tail  = a lagging chain driven by a travelling wave whose amplitude,
//         speed and curl express mood.
// Growth = continuous interpolation through life-stage keyframes.

const NJ = 8;
const WIDTH_PROFILE = [0.44, 0.86, 0.94, 0.9, 0.86, 0.9, 0.84, 0.52];
const TAIL_N = 13;
const STAGES = ['Kitten', 'Juvenile', 'Adult', 'Elder'];
const MORPH = [
  { size: 0.50, head: 1.42, body: 0.76, leg: 0.80, tail: 0.70, eye: 1.45, chub: 1.22, fluff: 1.0, speed: 0.80, pattern: 0.42, ear: 1.0, clumsy: 1.0, grey: 0 },
  { size: 0.76, head: 1.12, body: 0.94, leg: 0.98, tail: 0.92, eye: 1.16, chub: 1.04, fluff: 0.6, speed: 1.00, pattern: 0.74, ear: 1.05, clumsy: 0.3, grey: 0 },
  { size: 1.00, head: 1.00, body: 1.04, leg: 1.04, tail: 1.04, eye: 1.00, chub: 0.96, fluff: 0.3, speed: 1.12, pattern: 1.00, ear: 1.00, clumsy: 0.0, grey: 0 },
  { size: 1.00, head: 1.00, body: 1.02, leg: 1.00, tail: 1.00, eye: 0.96, chub: 1.03, fluff: 0.45, speed: 0.80, pattern: 0.82, ear: 0.98, clumsy: 0.1, grey: 0.45 }
];
function morphAt(age) {
  const a = clampv(age, 0, 3), i = Math.min(2, Math.floor(a)), f = a - i;
  const A = MORPH[i], B = MORPH[i + 1], o = {};
  for (const k in A) o[k] = A[k] + (B[k] - A[k]) * f;
  return o;
}
const CAT_SCALE = 1.3; // overall on-screen size of every cat
const legGroup = i => (i === 0 || i === 3 ? 0 : 1); // diagonal pairs trot together

class Cat {
  constructor(genome, x, y, age = 0, heading = 0) {
    this.g = genome;
    this.age = age;
    this.time = Math.random() * 100;
    this.seedN = Math.random() * 1000;
    this.tailSide = Math.random() < 0.5 ? -1 : 1;
    this.pose = { sit: 0, curl: 0, crouch: 0, eye: 1, ear: 0, pupil: 0.5, puff: 0, purr: 0,
      tailAmp: 0.4, tailFreq: 1, tailCurl: 0, dip: 0 };
    this.blink = 0; this.blinkT = 2;
    this.breathK = 1;
    this.lookAng = 0; this.lookPoint = null;
    this.nudge = pt(0, 0);
    this.alpha = 1;
    this.paw = null;
    this.curlInfo = null;
    this.fxT = 0;
    this.lastStepSound = 0;
    this.prey = null;
    this.updateDims();
    this.resetBody(x, y, heading);
    this.brain = new Brain(this);
  }

  get stage() { return Math.min(3, Math.floor(this.age + 1e-6)); }

  updateDims() {
    const m = this.m = morphAt(this.age), g = this.g, s = m.size * U * CAT_SCALE;
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
    this.baseSpeed = U * m.speed * (0.55 + 0.45 * m.size);
  }

  resetBody(x, y, heading) {
    this.pos = pt(x, y);
    this.heading = heading;
    this.wanderDir = heading;
    this.vel = pt(0, 0);
    this.speed = 0;
    this.spine = [];
    for (let i = 0; i < NJ; i++) this.spine.push(addP(this.pos, polar(heading + Math.PI, i * this.segLen)));
    const end = this.spine[NJ - 1];
    this.tail = [];
    for (let i = 0; i < TAIL_N; i++) this.tail.push(addP(end, polar(heading + Math.PI, i * this.tailSeg)));
    this.cacheFrame();
    this.legs = [[0, -1], [0, 1], [1, -1], [1, 1]].map(([g, side]) =>
      ({ g, side, foot: null, stepping: false, t: 0, from: null, dur: 8, lift: 0 }));
    for (const L of this.legs) L.foot = this.footTarget(L);
  }

  // ---------------------------------------------------------------- update
  update(dt, world) {
    const sec = dt / 60;
    this.time += sec;
    this.updateDims();
    this.brain.update(dt, world);
    const intent = this.act(dt, world);
    this.integrate(dt, intent, world);
    this.solveSpine(dt);
    this.cacheFrame();
    this.solveTail(dt);
    this.solveLegs(dt, world);
    this.animateFace(dt, intent.look);
    this.emitFx(dt, world);
  }

  act(dt, world) {
    const br = this.brain, b = br.behaviour, n = br.needs, hand = world.hand;
    const head = this.pos, sp = this.baseSpeed, sec = dt / 60;
    const p = { sit: 0, curl: 0, crouch: 0, eye: 1, ear: 0, pupil: 0.42 + world.biome.pupilBias,
      puff: 0, purr: 0, tailAmp: 0.45, tailFreq: 1, tailCurl: 0.35, dip: 0 };
    let want = pt(0, 0), look = null, agility = 1;
    this.paw = null;
    let nudge = pt(0, 0);

    switch (b) {
      case 'WANDER': {
        if (br.phase === 'walk' && br.timer > 5 + (this.seedN % 4)) { br.phase = 'pause'; br.timer = 0; }
        if (br.phase === 'pause') {
          p.sit = br.timer > 1.2 ? 0.6 : 0;
          look = addP(head, polar(this.heading + Math.sin(this.time * 0.9) * 1.1, 120 * U));
          p.tailAmp = 0.3;
          if (br.timer > 2.5) { br.phase = 'walk'; br.timer = 0; }
        } else {
          this.wanderDir += (noise(this.seedN, this.time * 0.25) - 0.5) * 0.08 * dt;
          if (this.m.clumsy > 0.2) this.wanderDir += (Math.random() - 0.5) * 0.08 * this.m.clumsy * dt;
          want = polar(this.wanderDir, sp * 1.05);
          look = addP(head, polar(this.heading, 100 * U));
          p.tailAmp = 0.55; p.tailFreq = 0.9;
        }
        break;
      }
      case 'HUNT': {
        const prey = this.pickPrey(world);
        if (!prey && br.phase !== 'eat') { br.cooldown.HUNT = 4; br.decide(world, true); break; }
        p.crouch = 1; p.pupil = 1; p.ear = -0.35; p.tailAmp = 0.22; p.tailFreq = 3.2; p.tailCurl = 0.1;
        if (br.phase === 'eat') {
          p.sit = 0.5; p.dip = 0.5 + 0.5 * Math.sin(br.timer * 14); p.crouch = 0.3; p.pupil = 0.5;
          p.tailAmp = 0.5; p.tailFreq = 1.2;
          if (br.timer > 2.2) {
            n.fullness = Math.min(1, n.fullness + 0.4);
            this.age += 0.04 * world.growthBoost;
            br.cooldown.HUNT = 3;
            br.decide(world, true);
          }
          break;
        }
        look = prey.pos;
        const d = vdist(head, prey.pos);
        const pounceR = (95 + 40 * this.size) * U;
        if (br.phase === 'stalk') {
          const v = d > 300 * U ? sp * 1.5 : sp * 0.55;
          want = this.seek(prey.pos, v, pounceR * 0.6);
          if (d < pounceR && prey.huntable) { br.phase = 'wiggle'; br.timer = 0; }
        } else if (br.phase === 'wiggle') {
          want = this.seek(prey.pos, sp * 0.15, pounceR);
          p.tailAmp = 0.9; p.tailFreq = 5; p.crouch = 1.15;
          if (br.timer > 0.55) {
            br.phase = 'pounce'; br.timer = 0; br.say('POUNCE', world);
            this.pounceTarget = addP(prey.pos, prey.vel, 10);
            world.sound.whoosh();
          }
        } else if (br.phase === 'pounce') {
          want = this.seek(this.pounceTarget, sp * 6.5, 0);
          agility = 2.4; p.crouch = 0.2; p.ear = -0.5;
          const mouth = addP(this.headCentre(), polar(this.heading, this.headL * 0.4));
          if (vdist(mouth, prey.pos) < (16 + 14 * this.size) * U && prey.huntable) {
            prey.caught(world);
            world.sound.chomp();
            world.burst(prey.pos, prey.fxColour, 14);
            br.phase = 'eat'; br.timer = 0; br.say('EAT', world);
          } else if (br.timer > 0.45) {
            br.misses++;
            br.say('MISS', world);
            if (br.misses >= 3) { br.cooldown.HUNT = 8; br.decide(world, true); }
            else { br.phase = 'stalk'; br.timer = 0; }
          }
        }
        break;
      }
      case 'SLEEP':
      case 'REST': {
        p.curl = 1; p.eye = 0; p.ear = 0.35; p.tailAmp = 0.05; p.tailFreq = 0.4; p.pupil = 0.2;
        break;
      }
      case 'GROOM': {
        p.sit = 1; p.eye = 0.45; p.tailAmp = 0.2; p.tailFreq = 0.6; p.tailCurl = 0.8;
        const lick = Math.sin(br.timer * 9);
        const side = this.tailSide;
        const paw = side < 0 ? 0 : 1;
        const below = addP(this.headCentre(), polar(this.heading, this.headL * 0.45));
        this.paw = { leg: paw, target: addP(below, polar(this.heading + side * Math.PI / 2, this.headW * 0.4)), w: smooth01(0.2, 0.8, br.timer) };
        look = addP(this.paw.target, polar(this.heading, -10 * U));
        p.dip = 0.5 + 0.5 * lick;
        break;
      }
      case 'CURIOUS': {
        if (!hand.present) { br.decide(world, true); break; }
        const keep = (70 + 30 * this.size) * U + this.headL;
        const target = addP(hand.pos, polar(angTo(hand.pos, head), keep));
        want = this.seek(target, sp * 1.7, 80 * U);
        look = hand.pos;
        p.ear = -0.25; p.pupil = 0.7; p.tailAmp = 0.35; p.tailCurl = 0.9;
        const near = vdist(head, target) < 30 * U;
        if (near) p.sit = 1;
        // Bat at a hand that hovers just out of reach of a front paw.
        const shoulder = this.spine[2];
        const reach = (this.legA + this.legB) * 2.2 + this.headL;
        if (near && vdist(shoulder, hand.pos) < reach) {
          const phase = (br.timer * 1.3) % 1;
          const swipe = phase < 0.35 ? Math.sin(phase / 0.35 * Math.PI) : 0;
          const leg = angDiff(angTo(head, hand.pos), this.heading) < 0 ? 0 : 1;
          const tgt = addP(shoulder, polar(angTo(shoulder, hand.pos), Math.min(reach, vdist(shoulder, hand.pos))));
          this.paw = { leg, target: tgt, w: swipe };
        }
        break;
      }
      case 'PETTED': {
        look = hand.present ? hand.pos : null;
        const sink = smooth01(0, 1.5, br.petTime);
        p.sit = sink; p.eye = 0.32; p.ear = 0.3; p.pupil = 0.25; p.purr = (0.35 + 0.65 * n.trust) * smooth01(0, 1, br.petTime);
        p.tailAmp = 0.25; p.tailFreq = 0.55; p.tailCurl = 1;
        if (hand.present) {
          want = this.seek(hand.pos, sp * 0.3, 120 * U);
          want.x *= 0.3; want.y *= 0.3;
          const rub = 0.5 + 0.5 * Math.sin(this.time * 2.6);
          nudge = polar(angTo(this.headCentre(), hand.pos), rub * 5 * U * (0.5 + this.size * 0.5));
        }
        break;
      }
      case 'FLEE': {
        const from = hand.present ? hand.pos : this.fleeFrom || head;
        if (hand.present) this.fleeFrom = { ...hand.pos };
        want = this.awayFrom(from, sp * 5);
        agility = 2.2;
        p.ear = 1; p.eye = 1.15; p.pupil = 1; p.puff = this.puffed ? 1 : 0.25; p.tailAmp = 0.12; p.tailFreq = 3; p.tailCurl = 0;
        p.crouch = 0.35;
        look = addP(head, want, 20);
        break;
      }
      case 'AVOID': {
        if (!hand.present) { br.decide(world, true); break; }
        const d = vdist(head, hand.pos);
        if (d < 230 * U) want = this.awayFrom(hand.pos, sp * 1.8);
        look = hand.pos;
        p.crouch = 0.6; p.ear = 0.75; p.pupil = 0.85; p.tailAmp = 0.25; p.tailFreq = 3.5; p.tailCurl = 0;
        break;
      }
      case 'PLAY': {
        p.pupil = 1; p.tailAmp = 0.9; p.tailFreq = 2.4; p.tailCurl = 0.2; p.ear = -0.1;
        const hp = hand.present ? hand.pos : (this.fleeFrom || head);
        if (hand.present) this.fleeFrom = { ...hand.pos };
        look = hp;
        if (br.phase === 'run') {
          want = this.awayFrom(hp, sp * 4.2); agility = 2.2; look = null;
          if (br.timer > 1.1 && hand.speed < CHASE_SPEED) { br.phase = 'stalk'; br.timer = 0; br.thought = 'wiggle, wiggle…'; }
        } else if (br.phase === 'stalk') {
          want = this.seek(hp, sp * 0.8, 110 * U);
          p.crouch = 1;
          if (vdist(head, hp) < 150 * U && br.timer > 0.6) {
            br.phase = 'pounce'; br.timer = 0; br.thought = 'gotcha!';
            this.pounceTarget = { ...hp };
            world.sound.whoosh();
          }
        } else if (br.phase === 'pounce') {
          want = this.seek(this.pounceTarget, sp * 6, 0); agility = 2.5;
          if (br.timer > 0.45) { br.phase = 'bat'; br.timer = 0; world.sound.meow(this.stage, 'trill'); }
        } else if (br.phase === 'bat') {
          p.sit = 0.6;
          const tgt = addP(this.spine[2], polar(angTo(this.spine[2], hp), (this.legA + this.legB) * 1.8));
          this.paw = { leg: Math.floor(br.timer * 3) % 2, target: tgt, w: Math.abs(Math.sin(br.timer * 9)) };
          if (br.timer > 1.1) { br.phase = 'stalk'; br.timer = 0; }
        }
        break;
      }
      case 'MIGRATE': {
        want = this.seek(pt(width + 400 * U, height * 0.5 + (head.y - height * 0.5) * 0.5), sp * 2.6, 0);
        look = addP(head, polar(this.heading, 100 * U));
        p.tailAmp = 0.5; p.tailCurl = 0.7;
        break;
      }
      case 'ARRIVE': {
        const c = pt(width * 0.48, height * 0.56);
        want = this.seek(c, sp * 1.7, 120 * U);
        look = addP(head, polar(this.heading + Math.sin(this.time * 1.4) * 0.9, 100 * U));
        p.ear = -0.2; p.pupil = 0.8; p.tailCurl = 0.6;
        if (vdist(head, c) < 90 * U) { br.lifecycle = null; br.decide(world, true); }
        break;
      }
    }

    if (!['MIGRATE', 'ARRIVE'].includes(b)) want = addP(want, this.boundsPush(sp));
    if (b === 'SLEEP' || b === 'REST' || b === 'GROOM' || (b === 'HUNT' && br.phase === 'eat')) want = pt(0, 0);

    // Smoothly blend pose so every transition reads as continuous motion.
    const k = 0.09 * dt;
    for (const key in p) this.pose[key] = approach(this.pose[key], p[key], key === 'curl' ? 0.035 * dt : k);
    this.nudge = lerpP(this.nudge, nudge, 0.15 * dt);
    return { want, look, agility };
  }

  seek(target, speed, slowR) {
    const d = vdist(this.pos, target);
    if (d < 1) return pt(0, 0);
    const s = slowR > 0 && d < slowR ? speed * (d / slowR) : speed;
    return polar(angTo(this.pos, target), s);
  }

  awayFrom(from, speed) {
    let a = angTo(from, this.pos);
    const m = 110 * U, x = this.pos.x, y = this.pos.y;
    // Cornered: slide along the wall instead of running into it.
    if (x < m || x > width - m || y < m || y > height - m) {
      const toC = angTo(this.pos, pt(width / 2, height / 2));
      a = a + clampv(angDiff(toC, a), -1.3, 1.3);
    }
    return polar(a, speed);
  }

  boundsPush(sp) {
    const m = 120 * U, x = this.pos.x, y = this.pos.y;
    let f = pt(0, 0);
    if (x < m) f.x += (m - x) / m;
    if (x > width - m) f.x -= (x - (width - m)) / m;
    if (y < m) f.y += (m - y) / m;
    if (y > height - m) f.y -= (y - (height - m)) / m;
    if (f.x || f.y) this.wanderDir = this.wanderDir + angDiff(Math.atan2(f.y, f.x), this.wanderDir) * 0.05;
    return { x: f.x * sp * 2.2, y: f.y * sp * 2.2 };
  }

  pickPrey(world) {
    if (this.prey && this.prey.alive && this.prey.huntable && world.prey.includes(this.prey)) return this.prey;
    let best = null, bd = Infinity;
    for (const q of world.prey) {
      if (!q.alive || !q.huntable) continue;
      const d = vdist(this.pos, q.pos);
      if (d < bd) { bd = d; best = q; }
    }
    this.prey = best;
    return best;
  }

  integrate(dt, intent, world) {
    const k = clampv(0.1 * intent.agility * dt, 0, 1);
    const slow = world.biome.speedMul;
    this.vel = lerpP(this.vel, { x: intent.want.x * slow, y: intent.want.y * slow }, k);
    let s = vlen(this.vel);
    if (s > 0.05 * U) {
      const a = Math.atan2(this.vel.y, this.vel.x);
      const maxTurn = (0.07 + 0.05 * intent.agility) * dt;
      this.heading += clampv(angDiff(a, this.heading), -maxTurn, maxTurn);
      this.vel = polar(this.heading, s);
    }
    this.speed = s;
    this.pos = addP(this.pos, this.vel, dt);
  }

  solveSpine(dt) {
    const sp = this.spine, p = this.pose;
    sp[0] = { ...this.pos };
    const maxBend = 0.32;
    for (let i = 1; i < NJ; i++) {
      const seg = this.segLen * (i >= 4 ? 1 - 0.36 * p.sit : 1) * (1 - 0.06 * p.crouch);
      const ref = i === 1 ? this.heading : angTo(sp[i - 1], sp[i - 2]);
      const cur = angTo(sp[i], sp[i - 1]);
      const d = clampv(angDiff(cur, ref), -maxBend, maxBend);
      sp[i] = addP(sp[i - 1], polar(ref + d + Math.PI, seg));
    }
    if (p.curl > 0.01 && this.curlInfo) {
      const c = this.curlInfo;
      for (let i = 0; i < NJ; i++) {
        const th = c.thMid + c.dir * (3 - i) * (this.segLen / c.R);
        sp[i] = lerpP(sp[i], addP(c.centre, polar(th, c.R)), easeInOut(p.curl));
      }
    }
  }

  beginCurl() {
    const R = (this.bodyLen + this.headL * 0.5) / (FULL_TURN * 0.56);
    const mid = this.spine[3], a = this.fwdAt(3), dir = this.tailSide;
    const centre = addP(mid, polar(a + dir * Math.PI / 2, R));
    this.curlInfo = { centre, R, dir, thMid: angTo(centre, mid) };
  }

  cacheFrame() {
    const sp = this.spine;
    this.breathK = 1 + Math.sin(this.time * (this.pose.curl > 0.5 ? 1.6 : 2.6)) * (0.018 + 0.02 * this.pose.curl);
    this._fwd = []; this._w = [];
    for (let i = 0; i < NJ; i++) {
      this._fwd.push(i === 0 ? angTo(sp[1], sp[0]) : i === NJ - 1 ? angTo(sp[NJ - 1], sp[NJ - 2]) : angTo(sp[i + 1], sp[i - 1]));
      this._w.push(WIDTH_PROFILE[i] * this.hw * this.breathK * (1 + this.pose.puff * 0.16) * (1 + this.pose.crouch * 0.06));
    }
  }
  fwdAt(i) { return this._fwd[i]; }
  widthAt(i) { return this._w[i]; }

  solveTail(dt) {
    const t = this.tail, sp = this.spine, p = this.pose;
    const back = angTo(sp[NJ - 2], sp[NJ - 1]);
    t[0] = addP(sp[NJ - 1], polar(back, this.segLen * 0.3));
    for (let i = 1; i < TAIL_N; i++) {
      const prevA = i === 1 ? back : angTo(t[i - 2], t[i - 1]);
      const k = i / (TAIL_N - 1);
      const wave = Math.sin(this.time * p.tailFreq * 2.4 - i * 0.5) * p.tailAmp * (0.3 + k);
      const desired = prevA + wave * 0.24 + p.tailCurl * this.tailSide * k * k * 0.45;
      const cur = angTo(t[i - 1], t[i]);
      const na = cur + angDiff(desired, cur) * clampv(0.25 * dt, 0, 1);
      const d = clampv(angDiff(na, prevA), -0.6, 0.6);
      t[i] = addP(t[i - 1], polar(prevA + d, this.tailSeg));
    }
    if (p.curl > 0.01 && this.curlInfo) {
      const c = this.curlInfo, R2 = c.R * 1.3;
      const thEnd = c.thMid + c.dir * (3 - (NJ - 1)) * (this.segLen / c.R);
      for (let i = 0; i < TAIL_N; i++) {
        const th = thEnd - c.dir * (i * this.tailSeg) / R2 - c.dir * 0.25;
        t[i] = lerpP(t[i], addP(c.centre, polar(th, R2 * (1 - 0.1 * i / TAIL_N))), easeInOut(p.curl));
      }
    }
  }

  footTarget(L) {
    const gi = L.g === 0 ? 2 : 6, sp = this.spine, p = this.pose;
    const a = this.fwdAt(gi), reach = this.legA + this.legB;
    let lat = this.widthAt(gi) * (0.55 + p.crouch * 0.2);
    let fwd = L.g === 0 ? reach * 0.32 : reach * 0.05;
    if (p.sit > 0.01) {
      fwd = fwd + ((L.g === 0 ? reach * 0.45 : reach * 0.8) - fwd) * p.sit;
      lat *= L.g === 0 ? 1 - 0.35 * p.sit : 1 + 0.12 * p.sit;
    }
    let target = addP(addP(sp[gi], polar(a, fwd)), polar(a + L.side * Math.PI / 2, lat));
    if (p.curl > 0.01) target = lerpP(target, addP(sp[gi], polar(a + L.side * Math.PI / 2, lat * 0.2)), p.curl);
    return target;
  }

  solveLegs(dt, world) {
    const reach = this.legA + this.legB;
    const stepDist = reach * (this.speed > 0.15 * U ? 0.55 : 0.2);
    const dur = clampv(14 - (this.speed / U) * 1.9, 4, 14);
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const target = this.footTarget(L);
      if (!L.stepping) {
        const d = vdist(L.foot, target);
        const otherBusy = this.legs.some((o, j) => legGroup(j) !== legGroup(i) && o.stepping);
        if ((d > stepDist && !otherBusy) || d > reach * 1.7) {
          L.stepping = true; L.t = 0; L.dur = dur; L.from = { ...L.foot };
        }
      }
      if (L.stepping) {
        const to = addP(target, this.vel, L.dur * 0.45);
        L.t += dt / L.dur;
        L.foot = lerpP(L.from, to, easeInOut(Math.min(1, L.t)));
        L.lift = Math.sin(Math.PI * Math.min(1, L.t));
        if (L.t >= 1) { L.stepping = false; L.lift = 0; this.onFootDown(L, i, world); }
      }
    }
  }

  onFootDown(L, i, world) {
    if (this.speed < 0.25 * U) return;
    world.addPrint(L.foot, this.heading, this.size * CAT_SCALE, L.g === 0);
    if (legGroup(i) === 0 && this.time - this.lastStepSound > 0.14) {
      this.lastStepSound = this.time;
      world.sound.footstep(world.biomeIndex, this.size, this.speed / U);
    }
  }

  animateFace(dt, look) {
    const sec = dt / 60;
    this.blinkT -= sec;
    if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - sec * 7);
    const bodyFwd = this.fwdAt(0);
    const target = look ? clampv(angDiff(angTo(this.spine[0], look), bodyFwd), -1.0, 1.0) : 0;
    this.lookAng = approach(this.lookAng, target, 0.12 * dt);
    this.lookPoint = look;
  }

  // ----------------------------------------------------- events & effects
  onBehaviour(b, prev, world) {
    if (b === 'SLEEP' || b === 'REST') this.beginCurl();
    if (prev === 'SLEEP' && b !== 'SLEEP' && world) world.sound.meow(this.stage, 'soft');
    if (b !== 'FLEE') this.puffed = false;
    if (b === 'HUNT') this.prey = null;
  }

  startle(world, hiss) {
    this.puffed = hiss;
    world.fx.push({ type: 'alert', x: this.headCentre().x, y: this.headCentre().y - 30 * U, life: 0, max: 0.9 });
    if (hiss) { world.sound.hiss(); this.brain.thought = 'HSSS!'; this.brain.needs.stress = Math.min(1, this.brain.needs.stress + 0.25); }
    else world.sound.meow(this.stage, 'yelp');
  }

  emitFx(dt, world) {
    const sec = dt / 60, b = this.brain.behaviour;
    this.fxT -= sec;
    if (this.fxT > 0) return;
    const hc = this.headCentre();
    if (b === 'SLEEP' || b === 'REST') {
      world.fx.push({ type: 'z', x: hc.x + 10 * U, y: hc.y - 10 * U, life: 0, max: 2.4, size: (9 + 6 * this.size) * U });
      this.fxT = 1.4;
    } else if (b === 'PETTED' && this.pose.purr > 0.2) {
      world.fx.push({ type: 'ring', x: this.spine[3].x, y: this.spine[3].y, life: 0, max: 1.2, r0: this.hw * 1.4 });
      if (this.brain.needs.trust > 0.5 && Math.random() < 0.6)
        world.fx.push({ type: 'heart', x: hc.x + (Math.random() - 0.5) * 20 * U, y: hc.y - 14 * U, life: 0, max: 1.8, size: (6 + 3 * this.size) * U });
      this.fxT = 0.55;
    } else this.fxT = 0.3;
  }

  // ------------------------------------------------------------ geometry
  headCentre() {
    return addP(addP(this.spine[0], polar(this.fwdAt(0), this.headL * 0.3)), this.nudge);
  }
  headAngle() { return this.fwdAt(0) + this.lookAng; }

  distToBody(q) {
    let d = vdist(q, this.headCentre()) - this.headW * 0.8;
    for (let i = 0; i < NJ; i++) d = Math.min(d, vdist(q, this.spine[i]) - this.widthAt(i));
    return Math.max(0, d);
  }

  bodyPoint(s, t) {
    const f = clampv(s, 0, 1) * (NJ - 1), i = Math.min(NJ - 2, Math.floor(f)), k = f - i;
    const p = lerpP(this.spine[i], this.spine[i + 1], k);
    const a = this._fwd[i] + angDiff(this._fwd[i + 1], this._fwd[i]) * k;
    const w = this._w[i] * (1 - k) + this._w[i + 1] * k;
    return { p: addP(p, polar(a + Math.PI / 2, t * w)), a, w };
  }

  bodyOutline() {
    const sp = this.spine, L = [], R = [];
    for (let i = 0; i < NJ; i++) {
      const a = this._fwd[i], w = this._w[i];
      L.push(addP(sp[i], polar(a - Math.PI / 2, w)));
      R.push(addP(sp[i], polar(a + Math.PI / 2, w)));
    }
    const front = addP(sp[0], polar(this._fwd[0], this._w[0] * 0.9));
    const rear = addP(sp[NJ - 1], polar(this._fwd[NJ - 1] + Math.PI, this._w[NJ - 1] * 1.1));
    return [front, ...L, rear, ...R.reverse()];
  }

  footDrawn(i) {
    const L = this.legs[i];
    if (this.paw && this.paw.leg === i && this.paw.w > 0.01) return lerpP(L.foot, this.paw.target, this.paw.w);
    return L.foot;
  }

  legGeom(i) {
    const L = this.legs[i], gi = L.g === 0 ? 2 : 6, a = this.fwdAt(gi);
    const out = a + L.side * Math.PI / 2;
    const hip = addP(this.spine[gi], polar(out, this.widthAt(gi) * 0.5));
    let foot = this.footDrawn(i);
    const A = this.legA, B = this.legB;
    let d = vdist(hip, foot);
    const maxD = (A + B) * 0.98;
    if (d > maxD) { foot = addP(hip, polar(angTo(hip, foot), maxD)); d = maxD; }
    d = Math.max(d, Math.abs(A - B) + 0.5);
    const base = angTo(hip, foot);
    const bend = Math.acos(clampv((A * A + d * d - B * B) / (2 * A * d), -1, 1));
    const k1 = addP(hip, polar(base + bend, A)), k2 = addP(hip, polar(base - bend, A));
    const o = polar(out, 1);
    const knee = (k1.x - hip.x) * o.x + (k1.y - hip.y) * o.y > (k2.x - hip.x) * o.x + (k2.y - hip.y) * o.y ? k1 : k2;
    return { hip, knee, foot, lift: L.lift, front: L.g === 0 };
  }

  palette() {
    const g = this.g, m = this.m;
    const base = mixRGB(g.coat.base, [186, 182, 176], m.grey * 0.4);
    const strength = g.contrast * m.pattern;
    return {
      base,
      mark: mixRGB(base, g.coat.mark, strength),
      markFull: g.coat.mark,
      light: mixRGB(g.coat.light, [240, 238, 234], m.grey * 0.5),
      eye: mixRGB(hexRGB(KITTEN_EYE), g.eye, smooth01(0.25, 1.5, this.age)),
      inner: mixRGB([232, 160, 150], base, 0.25),
      nose: luminance(base) > 0.45 ? [214, 128, 120] : [70, 52, 50],
      sock: [244, 240, 232]
    };
  }

  // ------------------------------------------------------------- drawing
  drawSilhouette(ctx, off) {
    ctx.save();
    ctx.translate(off.x, off.y);
    ctx.lineCap = 'round';
    for (let i = 0; i < TAIL_N - 1; i++) {
      ctx.lineWidth = this.tailWidth(i);
      ctx.beginPath(); ctx.moveTo(this.tail[i].x, this.tail[i].y); ctx.lineTo(this.tail[i + 1].x, this.tail[i + 1].y); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const G = this.legGeom(i);
      ctx.lineWidth = this.hw * 0.5;
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
    }
    ctx.fill(closedSmoothPath(this.bodyOutline()));
    const hc = this.headCentre();
    ctx.beginPath(); ctx.ellipse(hc.x, hc.y, this.headL * 0.55, this.headW * 0.95, this.headAngle(), 0, FULL_TURN); ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    const c = this.palette();
    ctx.save();
    ctx.globalAlpha = this.alpha;
    this.drawLegs(ctx, c, [2, 3]);
    this.drawTail(ctx, c);
    this.drawLegs(ctx, c, [0, 1]);
    this.drawBody(ctx, c);
    this.drawHead(ctx, c);
    ctx.restore();
  }

  drawLegs(ctx, c, which) {
    ctx.lineCap = 'round';
    const point = this.g.pattern === 'colorpoint';
    for (const i of which) {
      const G = this.legGeom(i);
      const upper = point ? mixRGB(c.base, c.markFull, 0.45) : shadeRGB(c.base, G.front ? 0.93 : 0.87);
      const lower = this.g.socks ? c.sock : point ? mixRGB(c.base, c.markFull, 0.8) : shadeRGB(c.base, 0.9);
      const wU = this.hw * (G.front ? 0.4 : 0.52), wL = this.hw * 0.3, edge = Math.max(1, 1.4 * U * this.size);
      const a = angTo(G.knee, G.foot), pr = this.hw * 0.22 * (1 + G.lift * 0.3);
      ctx.strokeStyle = rgba(shadeRGB(upper, 0.55), 0.55);
      ctx.fillStyle = rgba(shadeRGB(upper, 0.55), 0.55);
      ctx.lineWidth = wU + edge * 2;
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.stroke();
      ctx.lineWidth = wL + edge * 2;
      ctx.beginPath(); ctx.moveTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(G.foot.x, G.foot.y, pr * 1.2 + edge, pr + edge, a, 0, FULL_TURN); ctx.fill();
      ctx.strokeStyle = rgba(upper);
      ctx.lineWidth = wU;
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.stroke();
      ctx.strokeStyle = rgba(lower);
      ctx.lineWidth = wL;
      ctx.beginPath(); ctx.moveTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
      ctx.fillStyle = rgba(this.g.socks ? c.sock : lower);
      ctx.beginPath(); ctx.ellipse(G.foot.x, G.foot.y, pr * 1.2, pr, a, 0, FULL_TURN); ctx.fill();
      ctx.strokeStyle = rgba(shadeRGB(lower, 0.6), 0.45);
      ctx.lineWidth = Math.max(0.6, 0.9 * U * this.size);
      for (let k = -1; k <= 1; k++) {
        const tp = addP(G.foot, polar(a + k * 0.5, pr * 0.85));
        const tq = addP(tp, polar(a + k * 0.5 + Math.PI, pr * 0.35));
        ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tq.x, tq.y); ctx.stroke();
      }
    }
  }

  tailWidth(i) {
    const k = i / (TAIL_N - 1);
    return this.hw * 0.44 * (1 - k * 0.42) * (1 + this.pose.puff * 1.3) * (0.85 + 0.15 * this.g.fluff * this.m.fluff + 0.1 * this.m.fluff);
  }

  drawTail(ctx, c) {
    const t = this.tail, point = this.g.pattern === 'colorpoint';
    ctx.lineCap = 'round';
    for (let i = 0; i < TAIL_N - 1; i++) {
      const k = i / (TAIL_N - 1);
      let col = c.base;
      if (point) col = mixRGB(c.base, c.markFull, smooth01(0, 0.35, k) * 0.9);
      else if (this.g.tailTipDark && k > 0.82) col = c.mark;
      ctx.strokeStyle = rgba(col);
      ctx.lineWidth = this.tailWidth(i);
      ctx.beginPath(); ctx.moveTo(t[i].x, t[i].y); ctx.lineTo(t[i + 1].x, t[i + 1].y); ctx.stroke();
    }
    // Bottle-brush fur when frightened.
    if (this.pose.puff > 0.3) {
      ctx.strokeStyle = rgba(c.base, this.pose.puff);
      ctx.lineWidth = 1.4 * U * this.size;
      for (let i = 1; i < TAIL_N; i++) {
        const a = angTo(t[i - 1], t[i]), w = this.tailWidth(i - 1) * 0.6;
        for (const s of [-1, 1]) {
          const b = addP(t[i], polar(a + s * Math.PI / 2, w * 0.6));
          const e = addP(b, polar(a + s * 1.2, w * 0.7));
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        }
      }
    }
    // Rings.
    if (this.g.tailRings) {
      ctx.strokeStyle = rgba(c.mark, 0.9);
      for (let r = 0; r < this.g.tailRings; r++) {
        const f = 0.22 + (r / this.g.tailRings) * 0.66;
        const idx = Math.floor(f * (TAIL_N - 1));
        const q = lerpP(t[idx], t[idx + 1], f * (TAIL_N - 1) - idx);
        const a = angTo(t[idx], t[idx + 1]), w = this.tailWidth(idx) * 0.42;
        ctx.lineWidth = this.tailWidth(idx) * 0.28;
        const p1 = addP(q, polar(a + Math.PI / 2, w)), p2 = addP(q, polar(a - Math.PI / 2, w));
        const cp = addP(q, polar(a, -w * 0.4));
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y); ctx.stroke();
      }
    }
  }

  drawBody(ctx, c) {
    const outline = this.bodyOutline();
    const path = closedSmoothPath(outline);
    ctx.fillStyle = rgba(c.base);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    this.drawMarks(ctx, c);
    // Volume: darker flanks, warm light along the spine.
    ctx.strokeStyle = rgba(shadeRGB(c.base, 0.66), 0.5);
    ctx.lineWidth = this.hw * 0.75;
    ctx.stroke(path);
    ctx.strokeStyle = rgba(shadeRGB(c.base, 0.8), 0.35);
    ctx.lineWidth = this.hw * 1.3;
    ctx.stroke(path);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, a] of [[1.0, 0.1], [0.65, 0.12], [0.35, 0.14]]) {
      ctx.strokeStyle = rgba(c.light, a);
      ctx.lineWidth = this.hw * w;
      traceOpenSmooth(ctx, this.spine);
      ctx.stroke();
    }
    ctx.restore();
    this.strokeEdge(ctx, path, c);
  }

  // Dark contour, plus a light rim on dark coats so they never sink into the ground.
  strokeEdge(ctx, path, c) {
    ctx.strokeStyle = rgba(shadeRGB(c.base, 0.5), 0.35);
    ctx.lineWidth = Math.max(0.8, 1.1 * U * this.size);
    ctx.stroke(path);
    if (luminance(c.base) < 0.42) {
      ctx.strokeStyle = rgba(mixRGB(c.light, [255, 255, 255], 0.4), 0.32);
      ctx.lineWidth = Math.max(1, 1.6 * U * this.size);
      ctx.stroke(path);
    }
  }

  drawMarks(ctx, c) {
    const g = this.g;
    ctx.lineCap = 'round';
    if (g.pattern === 'colorpoint') {
      ctx.strokeStyle = rgba(c.markFull, 0.16 * this.m.pattern);
      ctx.lineWidth = this.hw * 1.1;
      traceOpenSmooth(ctx, this.spine.slice(2));
      ctx.stroke();
      return;
    }
    if (g.pattern === 'tabby') {
      ctx.strokeStyle = rgba(c.mark, 0.95);
      ctx.lineWidth = this.hw * 0.3;
      traceOpenSmooth(ctx, this.spine.slice(1));
      ctx.stroke();
    }
    for (const mk of g.marks) {
      if (mk.type === 'stripe') {
        // Mackerel stripe: two tapering half-stripes sweeping back from the spine.
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
          ctx.fill(closedSmoothPath([...top, ...bot.reverse()]));
        }
      } else {
        const q = this.bodyPoint(mk.s, mk.t), r = mk.r * this.hw * 1.6;
        if (mk.type === 'spot') {
          ctx.fillStyle = rgba(c.mark, 0.9);
          ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, r, r * mk.ecc, q.a + mk.rot, 0, FULL_TURN); ctx.fill();
        } else {
          ctx.fillStyle = rgba(mixRGB(c.base, c.mark, 0.35), 0.9);
          ctx.beginPath(); ctx.ellipse(q.p.x, q.p.y, r, r * mk.ecc, q.a + mk.rot, 0, FULL_TURN); ctx.fill();
          ctx.strokeStyle = rgba(c.mark, 0.95);
          ctx.lineWidth = r * 0.42;
          ctx.setLineDash([r * 0.9, r * 0.45]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  // Seen from above, ears stand on top of the skull and splay back-outward;
  // flattening (fear) folds them backward, alertness swings them forward.
  drawEars(ctx, c, L, W) {
    const p = this.pose, g = this.g, point = g.pattern === 'colorpoint';
    const e = clampv(p.ear, -0.5, 1);
    const earLen = W * 0.86 * g.earSize * this.m.ear * (1 - 0.3 * clampv(e, 0, 1)) * (1 + 0.1 * clampv(-e, 0, 1));
    for (const s of [-1, 1]) {
      const base = pt(-0.16 * L, s * 0.46 * W);
      const dir = Math.PI - s * (1.0 - 0.55 * e);
      const perp = dir + Math.PI / 2;
      const b1 = addP(base, polar(perp, W * 0.36)), b2 = addP(base, polar(perp, -W * 0.36));
      const tip = addP(base, polar(dir, earLen));
      const mid1 = addP(lerpP(b1, tip, 0.5), polar(perp, W * 0.06)), mid2 = addP(lerpP(b2, tip, 0.5), polar(perp, -W * 0.06));
      const ear = new Path2D();
      ear.moveTo(b1.x, b1.y); ear.quadraticCurveTo(mid1.x, mid1.y, tip.x, tip.y); ear.quadraticCurveTo(mid2.x, mid2.y, b2.x, b2.y); ear.closePath();
      ctx.fillStyle = rgba(point ? c.markFull : shadeRGB(c.base, 0.96));
      ctx.fill(ear);
      ctx.save(); ctx.clip(ear);
      const front = Math.cos(perp) > 0 ? b1 : b2; // edge facing forward shows the pink inner ear
      ctx.fillStyle = rgba(c.inner, 0.85);
      ctx.beginPath();
      ctx.moveTo(lerpP(base, front, 0.15).x, lerpP(base, front, 0.15).y);
      ctx.lineTo(lerpP(front, tip, 0.85).x, lerpP(front, tip, 0.85).y);
      ctx.lineTo(lerpP(base, tip, 0.25).x, lerpP(base, tip, 0.25).y);
      ctx.closePath(); ctx.fill();
      if (!point) {
        ctx.fillStyle = rgba(c.mark, 0.75);
        ctx.beginPath(); ctx.arc(tip.x, tip.y, earLen * 0.22, 0, FULL_TURN); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = rgba(shadeRGB(c.base, 0.45), 0.4);
      ctx.lineWidth = Math.max(0.7, 1 * U * this.size);
      ctx.stroke(ear);
    }
  }

  drawHead(ctx, c) {
    const hc = this.headCentre(), L = this.headL, W = this.headW * (1 + 0.06 * this.pose.sit) * (1 - 0.04 * this.pose.dip);
    const p = this.pose, g = this.g, point = g.pattern === 'colorpoint';
    ctx.save();
    ctx.translate(hc.x, hc.y);
    ctx.rotate(this.headAngle());

    // Skull with fluffy cheeks.
    const cheek = 1 + 0.08 * this.m.fluff * g.fluff;
    const headPts = [pt(0.52 * L, 0), pt(0.4 * L, 0.5 * W), pt(0.1 * L, 0.98 * W * cheek), pt(-0.25 * L, 0.78 * W),
      pt(-0.48 * L, 0.35 * W), pt(-0.5 * L, -0.35 * W), pt(-0.25 * L, -0.78 * W), pt(0.1 * L, -0.98 * W * cheek), pt(0.4 * L, -0.5 * W)];
    const hp = closedSmoothPath(headPts);
    ctx.fillStyle = rgba(c.base);
    ctx.fill(hp);
    ctx.save();
    ctx.clip(hp);
    if (point) {
      const gr = ctx.createRadialGradient(0.42 * L, 0, 0, 0.42 * L, 0, 0.75 * L);
      gr.addColorStop(0, rgba(c.markFull, 0.95)); gr.addColorStop(1, rgba(c.markFull, 0));
      ctx.fillStyle = gr; ctx.fillRect(-L, -W * 1.5, 2 * L, 3 * W);
    } else if (g.pattern === 'tabby') {
      ctx.strokeStyle = rgba(c.mark, 0.9); ctx.lineCap = 'round'; ctx.lineWidth = W * 0.1;
      const lines = [[pt(0.18 * L, 0), pt(-0.4 * L, 0)], [pt(0.14 * L, 0.16 * W), pt(-0.38 * L, 0.24 * W)], [pt(0.14 * L, -0.16 * W), pt(-0.38 * L, -0.24 * W)]];
      for (const [a, b] of lines) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0.05 * L, s * 0.62 * W); ctx.quadraticCurveTo(-0.08 * L, s * 0.78 * W, -0.18 * L, s * 0.95 * W); ctx.stroke();
      }
    } else {
      ctx.fillStyle = rgba(c.mark, 0.85);
      for (const sp of g.headSpots) { ctx.beginPath(); ctx.arc(sp.x * L, sp.y * W, sp.r * W * 1.4, 0, FULL_TURN); ctx.fill(); }
    }
    const crown = ctx.createRadialGradient(-0.12 * L, 0, 0, -0.12 * L, 0, 0.75 * L);
    crown.addColorStop(0, rgba(c.light, 0.28)); crown.addColorStop(1, rgba(c.light, 0));
    ctx.fillStyle = crown; ctx.fillRect(-L, -W * 1.5, 2 * L, 3 * W);
    ctx.strokeStyle = rgba(shadeRGB(c.base, 0.7), 0.45); ctx.lineWidth = W * 0.35; ctx.stroke(hp);
    ctx.restore();
    this.strokeEdge(ctx, hp, c);
    this.drawEars(ctx, c, L, W);

    // Muzzle pads, nose, tongue.
    const pad = g.whiteMuzzle ? [246, 242, 236] : point ? mixRGB(c.markFull, c.base, 0.2) : c.light;
    ctx.fillStyle = rgba(pad, 0.95);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0.36 * L, s * 0.17 * W, 0.13 * L, 0.2 * W, 0, 0, FULL_TURN); ctx.fill(); }
    if (p.dip > 0.6 && (this.brain.behaviour === 'GROOM')) {
      ctx.fillStyle = 'rgba(226,120,130,0.95)';
      ctx.beginPath(); ctx.ellipse(0.5 * L, 0, 0.07 * L, 0.09 * W, 0, 0, FULL_TURN); ctx.fill();
    }
    ctx.fillStyle = rgba(c.nose);
    ctx.beginPath(); ctx.moveTo(0.49 * L, 0); ctx.lineTo(0.42 * L, 0.09 * W); ctx.lineTo(0.42 * L, -0.09 * W); ctx.closePath(); ctx.fill();

    // Eyes.
    const blinkOpen = 1 - this.blink;
    const open = Math.min(p.eye, blinkOpen);
    const er = W * 0.2 * this.m.eye;
    let rel = 0;
    if (this.lookPoint) rel = angDiff(angTo(hc, this.lookPoint), this.headAngle());
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(0.14 * L, s * 0.36 * W);
      ctx.rotate(-s * 0.3);
      const rx = er * 0.8, ry = er;
      if (open < 0.08) {
        ctx.strokeStyle = rgba(shadeRGB(c.base, 0.35), 0.9); ctx.lineWidth = er * 0.22; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.5, ry, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      } else {
        const eyeP = new Path2D(); eyeP.ellipse(0, 0, rx, ry, 0, 0, FULL_TURN);
        ctx.fillStyle = 'rgba(25,20,18,0.9)'; ctx.fill(eyeP);
        ctx.save(); ctx.clip(eyeP);
        const ir = ctx.createRadialGradient(rx * 0.15, 0, 0, 0, 0, ry * 1.05);
        ir.addColorStop(0, rgba(mixRGB(c.eye, [255, 255, 230], 0.35))); ir.addColorStop(1, rgba(shadeRGB(c.eye, 0.7)));
        ctx.fillStyle = ir; ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, 0, FULL_TURN); ctx.fill();
        const ox = Math.cos(rel) * rx * 0.15, oy = Math.sin(rel) * ry * 0.3;
        const pw = ry * (0.16 + 0.62 * clampv(p.pupil, 0, 1));
        ctx.fillStyle = 'rgba(12,10,10,0.95)'; ctx.beginPath(); ctx.ellipse(ox, oy, rx * 0.72, Math.min(pw, rx * 0.72), 0, 0, FULL_TURN); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ox + rx * 0.25, oy - ry * 0.25, er * 0.17, 0, FULL_TURN); ctx.fill();
        if (open < 1) {
          ctx.fillStyle = rgba(shadeRGB(point ? mixRGB(c.base, c.markFull, 0.8) : c.base, 0.92));
          const lidEdge = -rx + 2 * rx * (1 - open);
          ctx.fillRect(-rx * 1.2, -ry * 1.2, lidEdge + rx * 1.2, ry * 2.4);
          ctx.strokeStyle = rgba(shadeRGB(c.base, 0.35), 0.8); ctx.lineWidth = er * 0.14;
          ctx.beginPath(); ctx.moveTo(lidEdge, -ry); ctx.quadraticCurveTo(lidEdge + rx * 0.3, 0, lidEdge, ry); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(30,24,20,0.8)'; ctx.lineWidth = er * 0.12; ctx.stroke(eyeP);
      }
      ctx.restore();
    }

    // Whiskers.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(0.6, 0.9 * U * this.size);
    const tw = Math.sin(this.time * 7) * 0.04 - 0.2 * clampv(-p.ear, 0, 1) + 0.25 * clampv(p.ear, 0, 1);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const a = s * (0.75 + k * 0.32 + tw);
        const o = pt(0.38 * L, s * 0.22 * W), len = W * (1.15 + 0.12 * k);
        const e = addP(o, polar(a, len)), m = addP(o, polar(a - s * 0.12, len * 0.55));
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(m.x, m.y, e.x, e.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawDebug(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,200,0.9)'; ctx.fillStyle = 'rgba(0,255,200,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); this.spine.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    for (const q of this.spine) { ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, FULL_TURN); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,200,0,0.9)';
    ctx.beginPath(); this.tail.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const G = this.legGeom(i), T = this.footTarget(this.legs[i]);
      ctx.strokeStyle = 'rgba(255,80,160,0.9)';
      ctx.beginPath(); ctx.moveTo(G.hip.x, G.hip.y); ctx.lineTo(G.knee.x, G.knee.y); ctx.lineTo(G.foot.x, G.foot.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(T.x, T.y, 4, 0, FULL_TURN); ctx.stroke();
    }
    const petR = this.hw * 1.3 + 34 * U;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(120,255,140,0.6)';
    ctx.beginPath(); ctx.arc(this.spine[3].x, this.spine[3].y, petR + this.hw, 0, FULL_TURN); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,100,100,0.5)';
    const hc = this.headCentre();
    ctx.beginPath(); ctx.arc(hc.x, hc.y, 270 * U * (0.6 + 0.4 * this.size), 0, FULL_TURN); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
