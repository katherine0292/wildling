// =====================================================================
// WILDLING — final version
// Raise a wild kitten into an adult cat. Feed it, play with it, pet it.
// It only grows while it is cared for, and it only comes close to you
// once you have earned its trust.
//
// HOW TO RUN: paste this whole file into the p5.js web editor (sketch.js),
// press Play, then choose HAND (webcam) or MOUSE. Nothing else is needed:
// ml5.js is loaded by the code itself, only if you choose HAND.
//
// Techniques used:
//   p5.js            drawing, vectors, pre-drawn backgrounds (createGraphics)
//   ml5.js HandPose  21 hand points from the webcam; a PINCH works as a click
//   Steering         wander / arrive / flee (Craig Reynolds; The Nature of Code)
//   State machine    the cat's "brain" picks ONE behaviour every frame
//   Web Audio API    meow, purr, hiss, crunch and chime are synthesised live
//
// CARE TOOLS (click a button at the bottom, pinch on it, or press 1 / 2 / 3):
//   FEED  click / pinch to drop a fish -> it runs over and eats    (Fullness)
//   PLAY  your hand becomes a yarn ball -> it chases and pounces   (Fun)
//   PET   rest your hand still on it   -> it purrs                 (Trust)
//   Moving fast near a shy cat scares it. A tired cat naps by itself.
//
// Keys: 1 2 3 tools · G grow faster (for the demo) · S sound · R restart
// =====================================================================


// ------------------------------------------------------ 1. SETTINGS
const ML5_URL = 'https://unpkg.com/ml5@1.4.0/dist/ml5.min.js';
const SECONDS_PER_STAGE = 60; // seconds of GOOD care needed for one life stage
const PET_SPEED = 350;        // hand slower than this = a gentle touch
const SCARE_SPEED = 1000;     // hand faster than this = scary for a shy cat
const MAX_FOOD = 3;           // at most 3 fish on the ground at once

// The three life stages. Each one has its own habitat and coat colour.
const STAGES = [
  { name: 'Kitten',   place: 'Jungle',     coat: [232, 168, 110], mark: [176, 104, 58] },
  { name: 'Juvenile', place: 'Snowfields', coat: [214, 140, 80],  mark: [150, 84, 40] },
  { name: 'Adult',    place: 'Desert',     coat: [196, 120, 62],  mark: [120, 64, 30] }
];

// The three care tools shown in the toolbar.
const TOOLS = [
  { id: 'FEED', icon: '🐟', label: 'Feed', hint: 'click or pinch to drop a fish' },
  { id: 'PLAY', icon: '🧶', label: 'Play', hint: 'move the yarn ball - it chases and pounces' },
  { id: 'PET',  icon: '✋', label: 'Pet',  hint: 'rest your hand gently and still on the cat' }
];


// ------------------------------------------------ 2. GLOBAL VARIABLES
let unit = 1;              // 1 "unit" = 1/900 of the shorter screen side
let cat, hand, sfx;        // the creature, the input, the sound
let biomes = [];           // three pre-drawn background pictures
let flakes = [];           // falling snow (Snowfields only)
let effects = [];          // floating ♥ z ! ? symbols
let foods = [];            // fish lying on the ground
let tool = 'FEED';         // the care tool in your hand right now
let gameScreen = 'start';  // 'start' -> 'play' -> 'grown'
                           // (not called "screen": that name belongs to the browser)
let shownStage = 0;        // the stage the banner last announced
let banner = { text: '', life: 0 };
let startButtons = [];
let toolButtons = [];
let stats;                 // what you did, shown on the ending screen


// ---------------------------------------------- 3. P5 MAIN LOOP + INPUT
function setup() {
  createCanvas(windowWidth, windowHeight);
  unit = min(width, height) / 900;
  textFont('Georgia');
  buildBiomes();
  hand = new HandInput();
  sfx = new SoundFX();
  for (let i = 0; i < 160; i++) {
    flakes.push({ x: random(width), y: random(height), s: random(1, 3.5) });
  }
  newCat();
}

// Start (or restart) one life.
function newCat() {
  cat = new Cat(width / 2, height / 2);
  foods = [];
  effects = [];
  shownStage = 0;
  stats = { time: 0, fish: 0, play: 0, pet: 0 };
  if (gameScreen === 'play') showBanner('Kitten · Jungle');
}

// draw() runs about 60 times per second: UPDATE everything, then DRAW everything.
function draw() {
  if (width < 1 || height < 1) return;  // the window has no size yet (e.g. a hidden tab)
  if (biomes[0].width !== width) buildBiomes(); // backgrounds were drawn at an old size
  const dt = min(deltaTime, 50) / 1000; // seconds since the last frame

  // --- update ---
  if (gameScreen === 'play') {
    hand.update(dt);
    handleClick();
    cat.update(dt, hand);
    sfx.update(cat, dt);
    stats.time += dt;
    if (cat.age >= 3) { gameScreen = 'grown'; sfx.chime(); }
    else if (cat.stage !== shownStage) changeStage();
  }

  // --- draw (back to front, like layers of paper) ---
  image(biomes[cat.stage], 0, 0, width, height);
  if (cat.stage === 1) drawSnowfall(dt);
  drawFoods();
  cat.draw();
  drawEffects(dt);
  if (gameScreen === 'play') {
    hand.drawPreview();
    drawHUD();
    drawToolbar();
    hand.draw();
  }
  drawBanner(dt);
  if (gameScreen === 'start') drawStartScreen();
  if (gameScreen === 'grown') drawGrownScreen();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  unit = min(width, height) / 900;
  buildBiomes();
}

function mousePressed() {
  sfx.resume();
  if (gameScreen === 'start') {
    for (const b of startButtons) {
      if (isInside(mouseX, mouseY, b)) {
        gameScreen = 'play';
        showBanner('Kitten · Jungle');
        sfx.start(); // browsers only allow sound after a click
        if (b.id === 'hand') hand.startCamera();
      }
    }
  } else if (gameScreen === 'play') {
    hand.lastMouseMove = millis();
    hand.click = { x: mouseX, y: mouseY };
  } else if (gameScreen === 'grown') {
    gameScreen = 'play';
    newCat();
  }
}

function mouseMoved() { if (hand) hand.lastMouseMove = millis(); }
function mouseDragged() { if (hand) hand.lastMouseMove = millis(); }

function keyPressed() {
  if (gameScreen === 'start') return;
  sfx.resume();
  const k = key.toLowerCase();
  if (k === '1' || k === '2' || k === '3') selectTool(TOOLS[int(k) - 1].id);
  if (k === 'g') cat.age = min(cat.age + 0.5, 3);
  if (k === 's') sfx.toggle();
  if (k === 'r') { gameScreen = 'play'; newCat(); }
}

// A click (mouse) or a pinch (hand): first check the toolbar, then use the tool.
function handleClick() {
  const c = hand.click;
  if (!c) return;
  hand.click = null; // use each click only once
  for (const b of toolButtons) {
    if (isInside(c.x, c.y, b)) { selectTool(b.id); return; }
  }
  if (tool === 'FEED') dropFood(c.x, c.y);
}

function selectTool(id) {
  tool = id;
  sfx.plop();
}

function changeStage() {
  shownStage = cat.stage;
  const s = STAGES[cat.stage];
  showBanner(`${s.name} · ${s.place}`);
  sfx.chime();
}


// ---------------------------------------------------------- 4. THE CAT
// One class, four parts: NEEDS (numbers), BRAIN (state machine),
// BODY (steering movement) and LOOKS (drawing).
class Cat {
  constructor(x, y) {
    this.pos = createVector(x, y);   // where it is
    this.vel = createVector(0, 0);   // how it is moving
    this.heading = 0;                // which way it faces (radians)
    this.wanderAngle = random(TWO_PI);
    this.walkCycle = 0;              // drives the paw animation
    this.age = 0;                    // 0-3: kitten, juvenile, adult
    this.state = 'WANDER';
    this.thought = 'what is this place?';
    this.timer = 0;                  // how long the current action lasts
    this.target = null;              // the fish it is walking to
    // needs, all between 0 (empty) and 1 (full)
    this.fullness = 0.5;
    this.fun = 0.5;
    this.energy = 0.9;
    this.trust = 0.2;                // a wild kitten starts shy
  }

  // "get" = a value that is calculated whenever you read it
  get stage() { return min(2, floor(this.age)); }
  get bodyLength() { return lerp(70, 130, this.age / 3) * unit; }
  get bodyWidth() { return lerp(42, 62, this.age / 3) * unit; }
  get wellbeing() { return (this.fullness + this.fun + this.energy) / 3; }
  get isGrowing() { return this.wellbeing > 0.5; }
  get isNeedy() { return this.fullness < 0.3 || this.fun < 0.3; }

  update(dt, h) {
    this.timer -= dt;
    this.think(h);
    this.move(dt, h);
    this.updateNeeds(dt, h);
    this.grow(dt);
  }

  // ---------- NEEDS: numbers that slowly change ----------
  updateNeeds(dt, h) {
    this.fullness -= dt / 80;   // gets hungry in about a minute
    this.fun -= dt / 70;        // gets bored
    if (this.state === 'SLEEP') this.energy += dt / 8;
    else if (this.state === 'PLAY' || this.state === 'FLEE') this.energy -= dt / 25;
    else this.energy -= dt / 90;

    if (this.state === 'PETTED') {
      this.trust += dt * 0.08;
      stats.pet += dt;
      if (random() < dt * 1.5) addEffect('♥', [255, 120, 150], this.pos.x + random(-20, 20) * unit, this.pos.y - 30 * unit);
    }
    if (this.state === 'PLAY') {
      stats.play += dt;
      // fun only rises when it actually reaches the toy (a "pounce")
      if (dist(h.x, h.y, this.pos.x, this.pos.y) < this.bodyLength) {
        this.fun += dt / 4;
        this.trust += dt * 0.01;
        if (random() < dt * 2) {
          addEffect('♪', [255, 255, 255], this.pos.x, this.pos.y - 30 * unit);
          sfx.jingle();
        }
      }
    }
    if (this.state === 'SLEEP' && random() < dt * 0.8) {
      addEffect('z', [255, 255, 255], this.pos.x + 20 * unit, this.pos.y - 25 * unit);
    }
    // a needy cat calls you: a meow and a "?"
    if (this.state === 'WANDER' && this.isNeedy && random() < dt * 0.2) {
      sfx.meow(this.stage);
      addEffect('?', [255, 230, 120], this.pos.x, this.pos.y - 40 * unit);
    }

    this.fullness = constrain(this.fullness, 0, 1);
    this.fun = constrain(this.fun, 0, 1);
    this.energy = constrain(this.energy, 0, 1);
    this.trust = constrain(this.trust, 0, 1);
  }

  // Growth is the reward for care: only while wellbeing is above half.
  grow(dt) {
    if (!this.isGrowing) return;
    const trustBoost = 1 + this.trust; // a cat that trusts you grows up to 2x faster
    this.age = min(3, this.age + (dt / SECONDS_PER_STAGE) * trustBoost);
  }

  // ---------- BRAIN: a state machine, checked from most to least urgent ----------
  think(h) {
    const d = h.present ? dist(h.x, h.y, this.pos.x, this.pos.y) : Infinity;

    // 1. DANGER: a fast hand close by scares a cat that does not trust you yet
    if (h.present && h.speed > SCARE_SPEED && d < 250 * unit && this.trust < 0.5 && tool !== 'PLAY') {
      if (this.state !== 'FLEE') {
        this.setState('FLEE', 'too fast! run!');
        this.trust = max(0, this.trust - 0.12);
        sfx.hiss();
        addEffect('!', [255, 220, 90], this.pos.x, this.pos.y - 50 * unit, 36);
      }
      this.timer = 1.5;
      return;
    }
    if (this.state === 'FLEE' && this.timer > 0) return;

    // 2. SLEEP: a tired cat sleeps until it is fully rested
    if (this.state === 'SLEEP') {
      if (this.energy >= 1) this.setState('WANDER', 'what a nap!');
      return;
    }
    if (this.energy < 0.15) { this.setState('SLEEP', 'zzz…'); return; }

    // 3. EATING: finish the fish first
    if (this.state === 'EAT' && this.timer > 0) return;

    // 4. PETTED: the PET tool resting still on its body
    if (tool === 'PET' && d < this.bodyLength * 0.8 && h.speed < PET_SPEED) {
      if (this.state !== 'PETTED') sfx.meow(this.stage, 1.1);
      this.setState('PETTED', 'purrrr…');
      return;
    }

    // 5. FOOD: go to the nearest fish, eat it when close enough
    const food = this.nearestFood();
    if (food && this.fullness < 0.9) {
      if (dist(food.x, food.y, this.pos.x, this.pos.y) < this.bodyLength * 0.6) this.eat(food);
      else {
        if (this.state !== 'SEEK_FOOD') sfx.meow(this.stage, 1.25); // an excited meow when it spots food
        this.target = food;
        this.setState('SEEK_FOOD', 'fish!!');
      }
      return;
    }

    // 6. PLAY: chase the yarn ball (if it has the energy)
    if (tool === 'PLAY' && h.present && this.energy > 0.25) {
      this.setState('PLAY', 'gotta catch it!');
      return;
    }

    // 7. ASK: a needy cat that trusts you comes to your hand
    if (this.isNeedy && h.present && this.trust >= 0.3) {
      this.setState('ASK', this.needThought());
      return;
    }

    // 8. Otherwise: wander and think about what it needs
    this.setState('WANDER');
    this.thought = this.needThought();
  }

  setState(s, thought) {
    if (thought) this.thought = thought;
    if (s === this.state) return;
    if (this.state === 'SLEEP') sfx.meow(this.stage, 0.9); // a sleepy meow on waking
    this.state = s;
  }

  // What the speech bubble says when nothing special is happening.
  needThought() {
    if (this.fullness < 0.3) return 'so hungry… feed me?';
    if (this.fun < 0.3) return 'bored… play with me?';
    if (foods.length > 0) return 'too full to eat';
    if (this.trust < 0.3) return 'who are you?';
    if (this.energy < 0.3) return 'getting sleepy…';
    return 'life is good';
  }

  nearestFood() {
    let best = null;
    for (const f of foods) {
      if (!best || dist(f.x, f.y, this.pos.x, this.pos.y) < dist(best.x, best.y, this.pos.x, this.pos.y)) best = f;
    }
    return best;
  }

  eat(food) {
    foods.splice(foods.indexOf(food), 1); // remove that fish from the ground
    this.fullness += 0.35;
    this.trust += 0.04;                    // feeding builds a little trust
    this.timer = 1.2;
    this.setState('EAT', 'nom nom');
    stats.fish++;
    sfx.crunch();
  }

  // ---------- BODY: steering behaviours (Reynolds / The Nature of Code) ----------
  // 1) decide a DESIRED velocity  2) steer = desired - current (limited)
  // 3) add steer to velocity      4) add velocity to position
  move(dt, h) {
    const f = dt * 60; // 1 when the sketch runs at 60 frames per second
    let desired = createVector(0, 0);
    let maxForce = 0.15;
    const handPos = createVector(h.x, h.y);

    if (this.state === 'WANDER') {
      this.wanderAngle += random(-0.25, 0.25);
      desired = p5.Vector.fromAngle(this.wanderAngle).mult(1.3 * unit);
    } else if (this.state === 'SEEK_FOOD') {
      desired = this.arrive(createVector(this.target.x, this.target.y), 3 * unit, 10 * unit);
    } else if (this.state === 'ASK') {
      desired = this.arrive(handPos, 1.8 * unit, 80 * unit);
    } else if (this.state === 'PLAY') {
      desired = this.arrive(handPos, 4.5 * unit, 20 * unit);
      maxForce = 0.4;
    } else if (this.state === 'FLEE') {
      desired = p5.Vector.sub(this.pos, handPos).setMag(5 * unit);
      maxForce = 0.4;
    }
    // SLEEP, EAT and PETTED keep desired = 0, so it slows to a stop
    desired.add(this.stayInside());

    const steer = p5.Vector.sub(desired, this.vel).limit(maxForce * unit * f);
    this.vel.add(steer);
    if (this.state === 'SLEEP' || this.state === 'EAT' || this.state === 'PETTED') this.vel.mult(0.8);
    this.pos.add(p5.Vector.mult(this.vel, f));

    // turn the body smoothly toward where it is going
    const speed = this.vel.mag();
    if (speed > 0.2 * unit) {
      this.heading = lerpAngle(this.heading, this.vel.heading(), 0.15);
      this.wanderAngle = lerpAngle(this.wanderAngle, this.vel.heading(), 0.02);
    }
    this.walkCycle += (speed / unit) * 0.12 * f;
  }

  // Arrive: full speed when far, slowing down near the target, stop inside stopRadius.
  arrive(target, maxSpeed, stopRadius) {
    const toTarget = p5.Vector.sub(target, this.pos);
    const gap = toTarget.mag();
    if (gap < stopRadius) return createVector(0, 0);
    const speed = gap < stopRadius * 3 ? map(gap, stopRadius, stopRadius * 3, 0, maxSpeed) : maxSpeed;
    return toTarget.setMag(speed);
  }

  // A gentle push back when it walks near the edge of the screen.
  stayInside() {
    const margin = 90 * unit;
    const nudge = createVector(0, 0);
    if (this.pos.x < margin) nudge.x = 2 * unit;
    if (this.pos.x > width - margin) nudge.x = -2 * unit;
    if (this.pos.y < margin) nudge.y = 2 * unit;
    if (this.pos.y > height - margin - 90 * unit) nudge.y = -2 * unit; // keep clear of the toolbar
    return nudge;
  }

  // ---------- LOOKS: drawn from simple shapes, seen from above ----------
  draw() {
    const s = STAGES[this.stage];
    const L = this.bodyLength, W = this.bodyWidth;
    const coat = color(...s.coat), mark = color(...s.mark);
    push();
    translate(this.pos.x, this.pos.y); // (0,0) is now the cat's centre

    noStroke();
    fill(0, 0, 0, 50); // shadow
    ellipse(6 * unit, 9 * unit, L * 1.15, W * 1.05);

    if (this.state === 'SLEEP') {
      this.drawCurled(L, W, coat, mark);
    } else {
      rotate(this.heading); // now "forward" is the +x direction
      this.drawPaws(L, W, coat);
      this.drawTail(L, W, coat, mark);
      this.drawBody(L, W, coat, mark);
      this.drawHead(L * 0.52, W, coat, mark);
    }
    pop();
    this.drawBubble();
  }

  drawPaws(L, W, coat) {
    const stride = this.vel.mag() > 0.3 * unit ? 9 * unit : 0;
    fill(lerpColor(coat, color(255), 0.25));
    // [x, y, phase]: diagonal paws move together, like a real walk
    const paws = [[L * 0.28, -W * 0.42, 0], [L * 0.28, W * 0.42, PI], [-L * 0.28, -W * 0.42, PI], [-L * 0.28, W * 0.42, 0]];
    for (const [px, py, phase] of paws) {
      ellipse(px + sin(this.walkCycle + phase) * stride, py, W * 0.3, W * 0.24);
    }
  }

  // The tail is a bezier curve. Its wag speed and size show the mood.
  drawTail(L, W, coat, mark) {
    const wagSpeed = { WANDER: 3, ASK: 4, SEEK_FOOD: 5, EAT: 1, PLAY: 9, PETTED: 1.5, FLEE: 0 }[this.state];
    const wagSize = { WANDER: 0.5, ASK: 0.7, SEEK_FOOD: 0.6, EAT: 0.3, PLAY: 0.9, PETTED: 0.8, FLEE: 0.05 }[this.state];
    const wag = sin(millis() / 1000 * wagSpeed) * wagSize;
    const tx = -L * 0.5;
    noFill();
    stroke(coat);
    strokeWeight(W * (this.state === 'FLEE' ? 0.3 : 0.18)); // a scared cat puffs its tail
    bezier(tx, 0, tx - L * 0.3, wag * L * 0.2, tx - L * 0.45, wag * L * 0.5, tx - L * 0.65, wag * L * 0.6);
    stroke(mark);
    point(tx - L * 0.65, wag * L * 0.6);
  }

  drawBody(L, W, coat, mark) {
    noStroke();
    fill(coat);
    ellipse(0, 0, L, W);
    stroke(mark);
    strokeWeight(3 * unit);
    strokeCap(ROUND);
    line(-L * 0.4, 0, L * 0.3, 0); // stripe along the spine
    for (let i = -2; i <= 2; i++) {  // tabby stripes on both sides
      const sx = i * L * 0.14;
      for (const side of [-1, 1]) line(sx, side * W * 0.12, sx - W * 0.12, side * W * 0.4);
    }
  }

  drawHead(hx, W, coat, mark) {
    const r = W * lerp(0.62, 0.5, this.age / 3); // kittens have bigger heads
    const scared = this.state === 'FLEE';
    noStroke();
    fill(coat);
    ellipse(hx, 0, r * 1.7, r * 1.9);

    // ears: fear flattens them backwards
    const back = scared ? 0.75 : 0.45;
    for (const side of [-1, 1]) {
      fill(coat);
      triangle(hx - r * 0.25, side * r * 0.35, hx + r * 0.2, side * r * 0.75, hx - r * (0.35 + back), side * r * (scared ? 1.0 : 1.1));
      fill(235, 160, 160);
      triangle(hx - r * 0.15, side * r * 0.5, hx + r * 0.08, side * r * 0.72, hx - r * (0.25 + back * 0.8), side * r * (scared ? 0.92 : 1.0));
    }

    // eyes: happy squint when petted or eating, wide open when scared
    const eyeX = hx + r * 0.2, eyeY = r * 0.38;
    if (this.state === 'PETTED' || this.state === 'EAT') {
      stroke(60);
      strokeWeight(2 * unit);
      noFill();
      for (const side of [-1, 1]) arc(eyeX, side * eyeY, r * 0.35, r * 0.25, -HALF_PI, HALF_PI);
    } else {
      noStroke();
      const eyeSize = r * (scared ? 0.5 : 0.42);
      for (const side of [-1, 1]) {
        fill(this.age < 1 ? color(120, 180, 230) : color(220, 180, 50)); // blue kitten eyes turn gold
        ellipse(eyeX, side * eyeY, eyeSize, eyeSize);
        fill(20);
        ellipse(eyeX + eyeSize * 0.1, side * eyeY, eyeSize * 0.4, eyeSize * (scared ? 0.9 : 0.6));
        fill(255);
        ellipse(eyeX + eyeSize * 0.2, side * eyeY - eyeSize * 0.15, eyeSize * 0.18);
      }
    }

    // nose and whiskers
    noStroke();
    fill(220, 120, 120);
    triangle(hx + r * 0.85, 0, hx + r * 0.7, -r * 0.1, hx + r * 0.7, r * 0.1);
    stroke(255, 200);
    strokeWeight(1 * unit);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) line(hx + r * 0.7, side * r * 0.2, hx + r * 1.3, side * (r * 0.5 + k * r * 0.25));
    }
    stroke(mark);
    strokeWeight(2.5 * unit);
    line(hx - r * 0.1, 0, hx - r * 0.5, 0); // forehead mark
  }

  drawCurled(L, W, coat, mark) {
    const r = (L + W) * 0.3;
    noStroke();
    fill(coat);
    ellipse(0, 0, r * 2, r * 1.8);
    noFill();
    stroke(coat);
    strokeWeight(W * 0.2);
    arc(0, 0, r * 2.1, r * 1.9, 0.2, PI * 0.9); // tail wrapped around
    stroke(mark);
    strokeWeight(3 * unit);
    arc(0, 0, r * 1.2, r * 1.1, PI, PI * 1.8);
    noStroke();
    fill(coat);
    ellipse(r * 0.45, -r * 0.35, r * 1.0, r * 0.95); // head tucked in
    triangle(r * 0.15, -r * 0.6, r * 0.35, -r * 1.0, r * 0.5, -r * 0.65);
    triangle(r * 0.6, -r * 0.65, r * 0.85, -r * 0.95, r * 0.9, -r * 0.5);
    stroke(60);
    strokeWeight(2 * unit);
    noFill();
    arc(r * 0.32, -r * 0.35, r * 0.2, r * 0.12, 0, PI); // closed eyes
    arc(r * 0.62, -r * 0.35, r * 0.2, r * 0.12, 0, PI);
  }

  // A speech bubble above the cat says what it wants.
  drawBubble() {
    if (this.state === 'SLEEP' || gameScreen !== 'play') return; // no bubble behind menus
    textSize(15 * unit);
    const w = textWidth(this.thought) + 24 * unit, h = 28 * unit;
    const x = constrain(this.pos.x - w / 2, 4, width - w - 4); // never off-screen
    const y = this.pos.y - this.bodyLength * 0.7 - h;
    noStroke();
    fill(255, 235);
    rect(x, y, w, h, h / 2);
    triangle(this.pos.x - 7 * unit, y + h, this.pos.x + 7 * unit, y + h, this.pos.x, y + h + 9 * unit);
    fill(this.isNeedy ? color(190, 60, 40) : color(40));
    textAlign(CENTER, CENTER);
    text(this.thought, x + w / 2, y + h / 2);
  }
}


// ---------------------------------------------------- 5. CARE: FOOD
function dropFood(x, y) {
  if (foods.length >= MAX_FOOD) return;
  if (y > height - 110 * unit) return; // not on top of the toolbar
  foods.push({ x: x, y: y, born: millis() });
  sfx.plop();
}

function drawFoods() {
  textAlign(CENTER, CENTER);
  textSize(34 * unit);
  noStroke();
  fill(255);
  for (const f of foods) {
    // the fish drops in from above during its first 0.3 seconds
    const fall = constrain(1 - (millis() - f.born) / 300, 0, 1);
    text('🐟', f.x, f.y - fall * 60 * unit);
  }
}


// --------------------------------------------- 6. HAND INPUT (ml5 + mouse)
class HandInput {
  constructor() {
    this.x = -999;
    this.y = -999;
    this.speed = 0;         // how fast the hand moves (units per second)
    this.present = false;   // is there a hand / mouse on screen?
    this.mode = 'mouse';    // 'mouse' or 'hand'
    this.camera = 'off';    // off · loading · ready · failed
    this.points = null;     // the 21 hand points, in screen coordinates
    this.lastSeen = 0;
    this.lastMouseMove = 0;
    this.pinching = false;
    this.click = null;      // a click waiting to be used: {x, y}
  }

  // Load ml5 only now, start the webcam, then ask HandPose for hands forever.
  startCamera() {
    this.mode = 'hand';
    this.camera = 'loading';
    loadScript(ML5_URL).then(() => {
      this.video = createCapture(VIDEO, { flipped: true });
      this.video.size(640, 480);
      this.video.hide();
      this.model = ml5.handPose({ maxHands: 1, flipped: true }, () => {
        this.model.detectStart(this.video, (results) => this.gotHands(results));
        this.camera = 'ready';
      });
    }).catch(() => { this.camera = 'failed'; });
  }

  // Called by ml5 every time it has looked at a new camera frame.
  gotHands(results) {
    if (results.length === 0) return;
    const k = results[0].keypoints; // 21 points: 0 wrist, 4 thumb tip, 8 index tip…
    // stretch the middle of the camera image over the whole canvas
    this.points = k.map((p) => ({
      x: map(p.x, 64, 576, 0, width, true),
      y: map(p.y, 48, 432, 0, height, true)
    }));
    this.lastSeen = millis();

    // PINCH = thumb tip touching index tip. Compare to the hand's own size,
    // so it works whether the hand is near or far from the camera.
    const handSize = dist(k[0].x, k[0].y, k[9].x, k[9].y);
    const gap = dist(k[4].x, k[4].y, k[8].x, k[8].y);
    if (!this.pinching && gap < handSize * 0.25) {
      this.pinching = true;
      this.click = { x: this.x, y: this.y }; // one pinch = one click
    } else if (this.pinching && gap > handSize * 0.45) {
      this.pinching = false; // fingers opened again: ready for the next pinch
    }
  }

  update(dt) {
    let target = null;
    if (this.points && millis() - this.lastSeen < 300) {
      // palm centre = average of the wrist and the four finger bases
      const ids = [0, 5, 9, 13, 17];
      target = { x: 0, y: 0 };
      for (const i of ids) {
        target.x += this.points[i].x / ids.length;
        target.y += this.points[i].y / ids.length;
      }
    } else if (this.mode === 'mouse' || millis() - this.lastMouseMove < 2000) {
      target = { x: mouseX, y: mouseY };
    }

    if (target) {
      // smooth the position a little (removes camera jitter)
      const nx = this.present ? lerp(this.x, target.x, 0.6) : target.x;
      const ny = this.present ? lerp(this.y, target.y, 0.6) : target.y;
      // speed = distance moved / time, also smoothed
      const instant = dist(nx, ny, this.x, this.y) / max(dt, 0.001) / unit;
      this.speed = this.present ? lerp(this.speed, instant, 0.3) : 0;
      this.x = nx;
      this.y = ny;
      this.present = true;
    } else {
      this.present = false;
      this.speed = 0;
    }
  }

  // The cursor: hand skeleton (if tracked), a ring coloured by speed, the tool icon.
  draw() {
    if (!this.present) return;
    const col = this.speed > SCARE_SPEED ? color(255, 110, 90) : this.speed < PET_SPEED ? color(150, 255, 170) : color(255);
    if (this.points && millis() - this.lastSeen < 300) {
      const fingers = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
      stroke(red(col), green(col), blue(col), 170);
      strokeWeight(3 * unit);
      for (const f of fingers) {
        for (let i = 1; i < f.length; i++) {
          line(this.points[f[i - 1]].x, this.points[f[i - 1]].y, this.points[f[i]].x, this.points[f[i]].y);
        }
      }
      noStroke();
      fill(255);
      for (const p of this.points) circle(p.x, p.y, 6 * unit);
    }
    noFill();
    stroke(red(col), green(col), blue(col), 220);
    strokeWeight(3 * unit);
    circle(this.x, this.y, (this.pinching ? 30 : 46) * unit);
    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    const t = TOOLS.find((t) => t.id === tool);
    textSize((tool === 'PLAY' ? 34 : 22) * unit);
    text(t.icon, this.x, this.y);
  }

  drawPreview() {
    if (this.camera !== 'ready' || !this.video) return;
    const w = 200 * unit, h = 150 * unit, x = width - w - 16 * unit, y = 50 * unit;
    image(this.video, x, y, w, h);
    noFill();
    stroke(255, 160);
    strokeWeight(1);
    rect(x, y, w, h, 6);
  }
}


// ----------------------------------------------- 7. SOUND (Web Audio API)
// Every sound is built live from an oscillator (a pure tone) or white noise,
// passed through a filter (shapes the colour) and a gain (shapes the volume).
class SoundFX {
  constructor() {
    this.ctx = null;
    this.on = true;
  }

  start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = this.ctx.createGain(); // master volume
    this.out.gain.value = 1;
    this.out.connect(this.ctx.destination);

    // two seconds of random numbers = white noise, reused by several sounds
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = random(-1, 1);

    // AMBIENCE: soft wind that never stops, so the world always sounds alive
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    this.windVolume = this.ctx.createGain();
    this.windVolume.gain.value = 0;
    wind.connect(windFilter).connect(this.windVolume).connect(this.out);
    wind.start();

    // PURR: muffled noise whose volume throbs 25 times a second
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 500; // high enough for laptop speakers to play
    this.purrVolume = this.ctx.createGain();
    this.purrVolume.gain.value = 0;
    const throb = this.ctx.createGain();
    throb.gain.value = 0.5;
    src.connect(low).connect(this.purrVolume).connect(throb).connect(this.out);
    const lfo = this.ctx.createOscillator(); // a slow wave that moves the volume
    lfo.frequency.value = 25;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(throb.gain);
    lfo.start();
    src.start();
  }

  // Called every frame: wind per habitat, purr while petted, birds in the jungle.
  update(c, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windVolume.gain.setTargetAtTime([0.07, 0.16, 0.1][c.stage], t, 0.5); // snow is windiest
    this.purrVolume.gain.setTargetAtTime(c.state === 'PETTED' ? 1.2 : 0, t, 0.2);
    if (c.stage === 0 && random() < dt * 0.4) this.chirp();
  }

  // Browsers may pause sound until the user clicks; every click wakes it up again.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.on = !this.on;
    if (this.ctx) this.out.gain.setTargetAtTime(this.on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  // MEOW: a buzzy wave whose pitch goes up then down. Younger = higher.
  meow(stage, pitchScale = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = [900, 650, 480][stage] * pitchScale;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.8, t);
    osc.frequency.linearRampToValueAtTime(base * 1.2, t + 0.15);
    osc.frequency.linearRampToValueAtTime(base * 0.7, t + 0.5);
    filt.type = 'bandpass';
    filt.frequency.value = 1200;
    filt.Q.value = 2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(filt).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  hiss() { this.burst('highpass', 2500, 0.4, 0.8, 0); }

  crunch() { // two short bites
    this.burst('bandpass', 1800, 0.5, 0.1, 0);
    this.burst('bandpass', 1500, 0.4, 0.1, 0.2);
  }

  // PLOP: a short tone that drops in pitch
  plop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // A short high tone that slides in pitch (used for bird chirps and the yarn bell).
  tone(from, to, dur, vol, delay) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  chirp() { // a jungle bird: two quick rising whistles
    const p = random(2200, 3200);
    this.tone(p, p * 1.4, 0.08, 0.05, 0);
    this.tone(p, p * 1.5, 0.1, 0.05, 0.12);
  }

  jingle() { // the little bell inside the yarn ball
    this.tone(2000, 1900, 0.25, 0.08, 0);
    this.tone(2600, 2500, 0.2, 0.06, 0.06);
  }

  // CHIME: three notes (C, E, G) one after another, for growing up
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = t + i * 0.15;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.2);
      o.connect(g).connect(this.out);
      o.start(start);
      o.stop(start + 1.3);
    });
  }

  // A short burst of filtered noise (used for hiss and crunch).
  burst(type, freq, peak, dur, delay) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = this.noise;
    filt.type = type;
    filt.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(gain).connect(this.out);
    src.start(t);
    src.stop(t + dur);
  }
}


// ------------------------------------------------- 8. THE WORLD (habitats)
// Each background is drawn ONCE into an off-screen picture (createGraphics).
// draw() then only pastes that picture, instead of drawing 1000+ shapes every frame.
function buildBiomes() {
  biomes = [makeJungle(), makeSnow(), makeDesert()];
}

function makeJungle() {
  const g = createGraphics(width, height);
  g.background(46, 70, 38);
  g.noStroke();
  for (let i = 0; i < 1400; i++) { // soft patches of moss
    g.fill(random(40, 90), random(80, 120), random(35, 60), 60);
    g.ellipse(random(width), random(height), random(20, 80) * unit);
  }
  for (let i = 0; i < 300; i++) { // fallen leaves
    g.push();
    g.translate(random(width), random(height));
    g.rotate(random(TWO_PI));
    g.fill(random([color(120, 100, 50), color(90, 110, 50), color(140, 90, 45)]));
    g.ellipse(0, 0, 18 * unit, 7 * unit);
    g.pop();
  }
  for (let i = 0; i < 26; i++) { // big leaves pointing in from the edges
    const onSide = random() < 0.5;
    const x = onSide ? random([0, width]) : random(width);
    const y = onSide ? random(height) : random([0, height]);
    g.push();
    g.translate(x, y);
    g.rotate(atan2(height / 2 - y, width / 2 - x) + random(-0.6, 0.6));
    g.fill(30, random(90, 120), 45);
    g.ellipse(80 * unit, 0, 220 * unit, 80 * unit);
    g.stroke(120, 170, 100, 120);
    g.strokeWeight(2 * unit);
    g.line(-20 * unit, 0, 180 * unit, 0);
    g.noStroke();
    g.pop();
  }
  return g;
}

function makeSnow() {
  const g = createGraphics(width, height);
  g.background(232, 240, 248);
  g.noStroke();
  for (let i = 0; i < 900; i++) { // drifts
    g.fill(190, 210, 232, 50);
    g.ellipse(random(width), random(height), random(30, 120) * unit, random(10, 40) * unit);
  }
  for (let i = 0; i < 18; i++) { // rocks with snow caps
    const x = random(width), y = random(height), r = random(14, 32) * unit;
    g.fill(110, 118, 130);
    g.ellipse(x, y, r * 2, r * 1.6);
    g.fill(250);
    g.ellipse(x - r * 0.2, y - r * 0.3, r * 1.5, r * 0.9);
  }
  for (let i = 0; i < 14; i++) { // pine trees seen from above
    const x = random() < 0.5 ? random(0, width * 0.15) : random(width * 0.85, width);
    const y = random(height), r = random(50, 90) * unit;
    for (let k = 0; k < 4; k++) {
      g.fill(30 + k * 10, 70 + k * 12, 60 + k * 8);
      g.circle(x, y, r * 2 * (1 - k * 0.22));
    }
    g.fill(255, 230);
    g.circle(x - r * 0.2, y - r * 0.2, r * 0.5);
  }
  return g;
}

function makeDesert() {
  const g = createGraphics(width, height);
  g.background(226, 186, 128);
  g.noFill();
  for (let y = 0; y < height; y += 14 * unit) { // wavy ripples in the sand
    g.stroke(170, 120, 70, 70);
    g.strokeWeight(1.5 * unit);
    g.beginShape();
    for (let x = 0; x <= width; x += 20 * unit) g.vertex(x, y + sin(x * 0.015 + y * 0.05) * 6 * unit);
    g.endShape();
  }
  g.noStroke();
  for (let i = 0; i < 200; i++) { // pebbles
    g.fill(random(140, 200), random(100, 150), random(70, 100));
    g.ellipse(random(width), random(height), random(3, 7) * unit);
  }
  for (let i = 0; i < 10; i++) { // cacti seen from above
    const x = random(width), y = random(height), r = random(25, 40) * unit;
    g.fill(0, 0, 0, 40);
    g.circle(x + r * 0.5, y + r * 0.4, r * 2);
    g.fill(70, 120, 70);
    g.circle(x, y, r * 2);
    g.fill(240, 120, 150);
    g.circle(x, y, r * 0.4);
  }
  return g;
}

function drawSnowfall(dt) {
  noStroke();
  fill(255, 220);
  for (const f of flakes) {
    f.x += 25 * dt * f.s * unit;
    f.y += 40 * dt * f.s * unit;
    if (f.x > width) f.x = 0;
    if (f.y > height) f.y = 0;
    circle(f.x, f.y, f.s * 2 * unit);
  }
}


// ---------------------------------------------------- 9. INTERFACE
function addEffect(symbol, rgb, x, y, size = 22) {
  effects.push({ symbol: symbol, rgb: rgb, x: x, y: y, size: size, life: 1 });
}

// Floating symbols rise and fade out, then are removed.
function drawEffects(dt) {
  textAlign(CENTER, CENTER);
  noStroke();
  for (const e of effects) {
    e.life -= dt * 0.8;
    e.y -= 30 * dt * unit;
    fill(e.rgb[0], e.rgb[1], e.rgb[2], 255 * e.life);
    textSize(e.size * unit);
    text(e.symbol, e.x, e.y);
  }
  effects = effects.filter((e) => e.life > 0);
}

function showBanner(t) { banner = { text: t, life: 3 }; }

function drawBanner(dt) {
  if (banner.life <= 0) return;
  banner.life -= dt;
  const fade = min(1, banner.life);
  noStroke();
  fill(0, 0, 0, 90 * fade);
  rect(0, height * 0.12 - 40 * unit, width, 80 * unit);
  fill(255, 255 * fade);
  textAlign(CENTER, CENTER);
  textSize(40 * unit);
  text(banner.text, width / 2, height * 0.12);
}

// Top-left panel: life stage, growth, and the four needs.
function drawHUD() {
  const s = STAGES[cat.stage];
  const x = 20 * unit, y = 20 * unit;
  noStroke();
  fill(10, 20, 15, 170);
  rect(x, y, 270 * unit, 250 * unit, 12 * unit);
  fill(255);
  textAlign(LEFT, TOP);
  textSize(26 * unit);
  text(`${s.name} · ${s.place}`, x + 16 * unit, y + 14 * unit);
  textSize(15 * unit);
  fill(cat.isGrowing ? color(170, 240, 160) : color(255, 160, 140));
  text(cat.isGrowing ? '▲ growing — well cared for' : '■ not growing — it needs care', x + 16 * unit, y + 52 * unit);
  bar('Growth', cat.age % 1, x + 16 * unit, y + 86 * unit, [240, 240, 240]);
  bar('Fullness', cat.fullness, x + 16 * unit, y + 118 * unit, [255, 170, 90]);
  bar('Fun', cat.fun, x + 16 * unit, y + 150 * unit, [140, 200, 255]);
  bar('Energy', cat.energy, x + 16 * unit, y + 182 * unit, [255, 220, 110]);
  bar('Trust', cat.trust, x + 16 * unit, y + 214 * unit, [255, 150, 180]);

  // top-right: what the input is doing
  let status = 'mouse mode';
  if (hand.mode === 'hand') {
    status = { loading: 'loading hand tracking…', ready: hand.present ? 'hand detected · pinch = click' : 'show your hand to the camera', failed: 'camera unavailable - use the mouse' }[hand.camera];
  }
  labelText(`${status}   ·   S sound ${sfx.on ? 'on' : 'off'}   ·   R restart   ·   G grow`, width - 20 * unit, 30 * unit, RIGHT);
}

// Text on a dark pill, so it can be read on every habitat (even white snow).
function labelText(t, x, y, align) {
  textSize(15 * unit);
  const w = textWidth(t) + 24 * unit, h = 26 * unit;
  const left = align === RIGHT ? x - w + 12 * unit : x - w / 2;
  noStroke();
  fill(10, 20, 15, 150);
  rect(left, y - h / 2, w, h, h / 2);
  fill(255);
  textAlign(align, CENTER);
  text(t, x, y);
}

function bar(label, v, x, y, rgb) {
  fill(255);
  textSize(14 * unit);
  textAlign(LEFT, TOP);
  text(label, x, y);
  fill(255, 40);
  rect(x + 80 * unit, y + 4 * unit, 150 * unit, 10 * unit, 5 * unit);
  fill(rgb[0], rgb[1], rgb[2]);
  rect(x + 80 * unit, y + 4 * unit, 150 * unit * constrain(v, 0, 1), 10 * unit, 5 * unit);
}

// Bottom-centre: the three care tools.
function drawToolbar() {
  const bw = 130 * unit, bh = 56 * unit, gap = 14 * unit;
  const x0 = width / 2 - (bw * 3 + gap * 2) / 2, y = height - bh - 20 * unit;
  toolButtons = [];
  TOOLS.forEach((t, i) => {
    const b = { id: t.id, x: x0 + i * (bw + gap), y: y, w: bw, h: bh };
    toolButtons.push(b);
    const selected = tool === t.id;
    noStroke();
    fill(selected ? color(168, 230, 160) : color(10, 20, 15, 170));
    rect(b.x, b.y, b.w, b.h, bh / 2);
    fill(selected ? 20 : 255);
    textAlign(CENTER, CENTER);
    textSize(18 * unit);
    text(`${i + 1}  ${t.icon} ${t.label}`, b.x + bw / 2, b.y + bh / 2);
  });
  const hint = TOOLS.find((t) => t.id === tool).hint;
  labelText(hint, width / 2, y - 22 * unit, CENTER);
}

function drawStartScreen() {
  fill(8, 16, 10, 200);
  noStroke();
  rect(0, 0, width, height);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(72 * unit);
  text('Wildling', width / 2, height * 0.28);
  textSize(22 * unit);
  fill(170, 230, 160);
  text('raise a wild kitten — it grows only as well as you care for it', width / 2, height * 0.28 + 60 * unit);
  fill(230);
  textSize(17 * unit);
  text('🐟 feed it    ·    🧶 play with it    ·    ✋ pet it gently    ·    fast hands scare it', width / 2, height * 0.45);
  const bw = 240 * unit, bh = 54 * unit, gap = 24 * unit, by = height * 0.55;
  startButtons = [
    { id: 'hand', label: 'Start with HAND (webcam)', x: width / 2 - bw - gap / 2, y: by, w: bw, h: bh },
    { id: 'mouse', label: 'Start with MOUSE', x: width / 2 + gap / 2, y: by, w: bw, h: bh }
  ];
  for (const b of startButtons) {
    const over = isInside(mouseX, mouseY, b);
    fill(b.id === 'hand' ? color(168, 230, 160, over ? 255 : 220) : color(255, over ? 60 : 30));
    rect(b.x, b.y, b.w, b.h, bh / 2);
    fill(b.id === 'hand' ? 20 : 255);
    textSize(17 * unit);
    text(b.label, b.x + b.w / 2, b.y + b.h / 2);
  }
  fill(200);
  textSize(13 * unit);
  text('Hand mode: move your palm to aim, pinch thumb and index finger to click. Sound on.', width / 2, by + bh + 40 * unit);
}

// The ending: a summary of how you raised it, and what kind of bond you built.
function drawGrownScreen() {
  fill(8, 16, 10, 210);
  noStroke();
  rect(0, 0, width, height);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(54 * unit);
  text('Your wildling has grown up', width / 2, height * 0.25);
  textSize(19 * unit);
  fill(220);
  const minutes = floor(stats.time / 60), seconds = floor(stats.time % 60);
  text(`raised in ${minutes} min ${seconds} s   ·   ${stats.fish} fish   ·   ${round(stats.play)} s of play   ·   ${round(stats.pet)} s of petting`, width / 2, height * 0.38);
  textSize(26 * unit);
  fill(255, 190, 210);
  let bond = 'It is grown, but it still keeps its distance from people.';
  if (cat.trust > 0.7) bond = 'It trusts you completely. It will always come back to you.';
  else if (cat.trust > 0.4) bond = 'It likes you - on its own terms, like a true wild cat.';
  text(bond, width / 2, height * 0.5);
  textSize(17 * unit);
  fill(200);
  text('click or press R to raise another kitten', width / 2, height * 0.62);
}


// ------------------------------------------------------- 10. HELPERS
function isInside(px, py, b) {
  return px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h;
}

// Blend between two angles the short way round (e.g. from 350° to 10° is +20°, not -340°).
function lerpAngle(a, b, t) {
  let d = (b - a) % TWO_PI;
  if (d > PI) d -= TWO_PI;
  if (d < -PI) d += TWO_PI;
  return a + d * t;
}

// Add a <script> tag to the page and wait until the library has loaded.
function loadScript(src) {
  if (window.ml5) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
