// WILDLING — a virtual cat that grows up between your hands.
// Entry point: p5.js setup/draw loop, input wiring and URL options.
//
// URL options (handy for presenting / screenshots):
//   ?autostart=1        skip the intro (mouse mode)
//   ?stage=0|1|2        start in Jungle / Snowfields / Desert
//   ?pattern=tabby|spotted|rosette|colorpoint   ?coat=ginger|golden|...
//   ?wake=1             start awake      ?debug=1  show skeleton

let world;
const params = new URLSearchParams(location.search);

function setup() {
  pixelDensity(Math.min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight).parent('stage');
  updateUnit();
  world = new World({
    stage: clampv(parseInt(params.get('stage') || '0', 10), 0, 2),
    pattern: params.get('pattern') || undefined,
    coat: params.get('coat') || undefined,
    wake: params.has('wake'),
    debug: params.has('debug')
  });

  document.getElementById('btnCamera').onclick = () => begin('camera');
  document.getElementById('btnMouse').onclick = () => begin('mouse');
  const canvasEl = document.querySelector('#stage canvas');
  canvasEl.addEventListener('mouseleave', () => world.hand.onMouse(false));
  canvasEl.addEventListener('mouseenter', () => world.hand.onMouse(true));
  if (params.has('autostart')) {
    document.getElementById('intro').style.display = 'none';
    begin('mouse');
  }
}

function begin(mode) {
  document.getElementById('intro').classList.add('gone');
  world.begin(mode);
}

function updateUnit() {
  U = Math.max(0.35, Math.min(width, height) / 900);
}

function draw() {
  if (width < 60 || height < 60) return; // hidden / collapsed window
  world.update();
  world.draw();
}

function mouseMoved() { world.hand.onMouse(true); }
function mouseDragged() { world.hand.onMouse(true); }
function touchStarted() { if (world.started) { world.hand.onMouse(true); return false; } }
function touchMoved() { world.hand.onMouse(true); return false; }

function keyPressed() {
  const k = key.toLowerCase();
  if (k === 'm') world.ui.toggle('mind');
  else if (k === 'd') world.debug = !world.debug;
  else if (k === 'g' && !world.cat.brain.lifecycle) world.cat.age = Math.min(3, world.cat.age + 0.34);
  else if (k === 'n') { world.newCat(Genome.random(), world.biomeIndex + 0.05, false); }
  else if (k === 's') world.sound.setMuted(!world.sound.muted);
  else if (k === 'h') world.ui.setVisible(!world.ui.visible);
  else if (k === 'c') world.hand.showPreview = !world.hand.showPreview;
  else if (k === 'f') fullscreen(!fullscreen());
  else if (['1', '2', '3'].includes(k)) world.jumpToStage(parseInt(k, 10) - 1);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateUnit();
  if (width >= 60 && height >= 60) world.resize();
}
