// Wildling V2 browser build: wires inputs → core → renderer, UI and sound.
//
// Data flow per frame:
//   mouse / keyboard / camera sample ─► sim.ingest()      (InputTrack: quality gate)
//   clicks, pinches, buttons          ─► sim.command()    (de-duplicated by id)
//   sim.update(dt)                    ─► snapshot          (the only state anyone reads)
//   snapshot ─► Renderer · UI · StaffPanel · SoundAdapter
//
// URL options for demos and screenshots:
//   ?staff=1  ?seed=42  ?adapt=0  ?kitten=ember|juniper|saffron  ?input=mouse|keyboard (skips the approach screen)
//   ?kiosk=1  exhibition mode: no keepsakes, every visitor meets a fresh kitten
//   ?adopt=…  a postcard's code: brings a keepsake into this browser

import { Simulation } from '../core/sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { StaffPanel } from './staff.js';
import { SoundAdapter } from './audio.js';
import { CameraInput } from './camera.js';
import { KeyboardHand } from './keyboard.js';
import { KITTENS } from '../core/config.js';
import { Keepsakes } from './keepsake.js';
import { PassersBy } from './presence.js';
import { Tutorial } from './tutorial.js';

// Moments worth a photo for the album: [event test, caption, delay in seconds].
const NAMES = Object.fromEntries(KITTENS.map((k) => [k.id, k.name]));
const PHOTO_MOMENTS = [
  [(e) => e.type === 'returned', () => 'Back again', 1.2],
  [(e) => e.type === 'eat_completed', () => 'First fish', 0.2],
  [(e) => e.type === 'contact_started', () => 'First touch', 0.8],
  [(e) => e.type === 'pounce_success', (e) => ({ ball: 'Got the ball!', feather: 'Feather caught' }[e.measurement?.toy] ?? 'Got the yarn!'), 0.1],
  [(e) => e.type === 'sibling_play' && e.measurement?.endedBy === 'done', (e) => `Tumbling with ${NAMES[e.measurement.sibling] ?? 'family'}`, 0],
  [(e) => e.type === 'hiss', () => 'Hss!', 0],
  [(e) => e.type === 'hunt_pounce', (e) => (e.measurement?.caught ? 'Caught one!' : 'The hunt'), 0.1],
  [(e) => e.type === 'gift_given', () => 'A gift for me', 0.4],
  [(e) => e.type === 'phase_changed', (e) => ({ juvenile: 'Chapter II', adult: 'Chapter III' }[e.measurement?.phase] ?? 'Growing up'), 2.4],
  [(e) => e.type === 'fully_grown', () => 'All grown up', 2.4],
  [(e) => e.type === 'trick_done', (e) => ({ spin: 'A spin!', rollover: 'Rolled over', wave: 'A wave' }[e.measurement?.trick] ?? 'A trick'), 0.6],
];

const params = new URLSearchParams(location.search);
let cmdSeq = 0;

const sketch = (p) => {
  let sim, renderer, ui, staff, sound, camera, keyboard;
  const mouse = { x: 0.5, y: 0.5, inside: false, seq: 0 };
  let soundOn = true;

  const worldFor = () => {
    const S = Math.min(p.width, p.height);
    return { w: p.width / S, h: p.height / S };
  };

  let keepsakes, presence = null, lastMode = null, tutorial;
  const photoQueue = [];
  // The core only learns about a returning visitor from this browser's own keepsake.
  const tellReturning = () => {
    const r = keepsakes.get(sim.kittenId);
    sim.command({ id: `ui_${++cmdSeq}`, type: 'set_returning', kitten: sim.kittenId, visits: r ? r.visits : 0 });
  };
  const dispatch = (cmd) => {
    sound.start();
    if (cmd.type === 'start') tellReturning();
    const res = sim.command({ id: `ui_${++cmdSeq}`, ...cmd });
    if (cmd.type === 'choose_kitten') tellReturning();
    return res;
  };

  const chooseInput = async (source) => {
    sound.start();
    presence?.stop(); // free the camera for the visitor's own hand
    if (source !== 'camera') camera.stop();
    keyboard.active = source === 'keyboard';
    dispatch({ type: 'choose_input', source });
    if (source === 'camera') {
      await camera.start();
      if (camera.status === 'failed') dispatch({ type: 'calibration_failed', reason: camera.error });
    }
  };

  p.setup = () => {
    const cnv = p.createCanvas(window.innerWidth, window.innerHeight);
    cnv.parent('stage');
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    p.textFont('Inter');
    sim = new Simulation({
      world: worldFor(),
      seed: Number(params.get('seed')) || Math.floor(Math.random() * 1e9),
      adaptation: params.get('adapt') !== '0',
    });
    keepsakes = new Keepsakes({ kiosk: params.get('kiosk') === '1' });
    const adopted = keepsakes.importFrom(params.get('adopt'));
    if (adopted && history.replaceState) { const q = new URLSearchParams(location.search); q.delete('adopt'); q.set('kitten', adopted); history.replaceState(null, '', `${location.pathname}?${q}`); }
    // Exhibition only: notice people walking past (ADR-020). ?watch=1 uses the camera, ?watch=demo plays a demo passer-by.
    const watch = params.get('watch');
    if (watch === 'demo' || (watch === '1' && params.get('kiosk') === '1')) presence = new PassersBy({ demo: watch === 'demo', send: (people) => sim.command({ id: `pres_${++cmdSeq}`, type: 'presence', people }) });
    renderer = new Renderer(p);
    renderer.resize();
    sound = new SoundAdapter();
    camera = new CameraInput();
    keyboard = new KeyboardHand();
    ui = new UI({
      dispatch,
      keepsakes,
      onChooseInput: chooseInput,
      onToggleSound: () => { soundOn = !soundOn; sound.setOn(soundOn); },
    });
    staff = new StaffPanel({ dispatch });
    tutorial = new Tutorial({ dispatch, kiosk: params.get('kiosk') === '1' });
    if (params.get('kitten')) sim.command({ id: 'init_kitten', type: 'choose_kitten', kitten: params.get('kitten') });
    if (params.get('staff') === '1') staff.toggle();
    const direct = params.get('input');
    if (direct === 'mouse' || direct === 'keyboard') {
      tellReturning();
      sim.command({ id: 'init_start', type: 'start' });
      keyboard.active = direct === 'keyboard';
      sim.command({ id: 'init_input', type: 'choose_input', source: direct });
    }

    const stage = document.getElementById('stage');
    // pointer positions are on screen; the core works in world coordinates behind the camera
    const toWorld = (e) => { const w = renderer.screenToWorldN(e.clientX / p.width, e.clientY / p.height); mouse.x = w.x; mouse.y = w.y; };
    stage.addEventListener('pointermove', (e) => { mouse.sx = e.clientX / p.width; mouse.sy = e.clientY / p.height; toWorld(e); mouse.inside = true; });
    stage.addEventListener('pointerleave', () => { mouse.inside = false; });
    stage.addEventListener('pointerdown', (e) => {
      sound.start();
      mouse.sx = e.clientX / p.width; mouse.sy = e.clientY / p.height; toWorld(e); mouse.inside = true;
      if (sim.session.state === 'ATTRACT') { dispatch({ type: 'start' }); return; }
      if (sim.session.state === 'ACTIVE' && sim.tool === 'LITTER') {
        const sib = sim.siblingAt(mouse.x, mouse.y, 0.14);
        if (sib) ui.openWheel(sib.kitten.id); else ui.closeWheel();
        return;
      }
      if (sim.track.source === 'mouse') dispatch({ type: 'confirm', x: mouse.x, y: mouse.y });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) dispatch({ type: 'pause', reason: 'hidden' });
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', (e) => keyboard.up(e.key));
  };

  function onKeyDown(e) {
    const k = e.key;
    const typing = e.target instanceof HTMLButtonElement && (k === 'Enter' || k === ' ');
    if (typing && !keyboard.active) return; // let focused buttons work normally
    if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
    sound.start();
    const st = sim.session.state;
    if (k === 'd' || k === 'D') { staff.toggle(); return; }
    if (st === 'ATTRACT') {
      if (k === 'q' || k === 'Q') { ui.stepTab(-1); return; }
      if (k === 'e' || k === 'E') { ui.stepTab(1); return; }
      if (['1', '2', '3'].includes(k)) { ui.setTab('litter'); dispatch({ type: 'choose_kitten', kitten: KITTENS[Number(k) - 1].id }); return; }
      if (k === 'Enter' && !typing) { dispatch({ type: 'start' }); return; }
    }
    if ((k === 't' || k === 'T') && st === 'ACTIVE') { ui.toggleMind(); return; }
    if (k === 'm' || k === 'M') { soundOn = !soundOn; sound.setOn(soundOn); return; }
    if (k === 'Escape' && ui.wheelOpen) { ui.closeWheel(); return; }
    if (k === 'Escape') { if (st === 'ACTIVE') dispatch({ type: 'pause', reason: 'user' }); else if (st === 'PAUSED') dispatch({ type: 'resume' }); return; }
    if (k === '2' && st === 'ACTIVE' && sim.tool === 'PLAY') { // press Play again to switch toy
      const toys = ['yarn', 'feather', 'ball'];
      dispatch({ type: 'select_toy', toy: toys[(toys.indexOf(sim.toy.kind) + 1) % toys.length] });
      return;
    }
    if (ui.wheelOpen && ['1', '2', '3', '4'].includes(k)) { ui.ask(['befriend', 'cuddle', 'fight', 'hiss'][Number(k) - 1]); return; }
    if (['1', '2', '3', '4', '5', '6'].includes(k)) { dispatch({ type: 'select_tool', tool: ['FEED', 'PLAY', 'PET', 'WAIT', 'LITTER', 'TRICK'][Number(k) - 1] }); return; }
    if (keyboard.active && k === ' ' && st === 'ACTIVE' && sim.tool === 'LITTER') {
      const sib = sim.siblingAt(keyboard.x, keyboard.y, 0.16);
      if (sib) ui.openWheel(sib.kitten.id);
      return;
    }
    if (keyboard.active) {
      const confirm = keyboard.down(k, e.repeat);
      if (confirm && st === 'ACTIVE') dispatch({ type: 'confirm', x: keyboard.x, y: keyboard.y });
      if (k.startsWith('Arrow')) sim.session.noteActivity();
    } else if (k === ' ' && st === 'ATTRACT') dispatch({ type: 'start' });
  }

  p.draw = () => {
    const dt = Math.min(p.deltaTime, 100) / 1000;
    const now = performance.now();

    // one source at a time; switching source resets the track
    const src = sim.track.source;
    if (src === 'camera') {
      const s = camera.take();
      if (s && Number.isFinite(s.x)) { const w = renderer.screenToWorldN(s.x, s.y); s.x = w.x; s.y = w.y; }
      if (s) sim.ingest(s);
    } else if (keyboard.active) {
      sim.ingest(keyboard.sample(dt, now, p.width / p.height, keyboard.keys.size && p.keyIsDown(p.SHIFT)));
    } else {
      // re-project the resting pointer as the camera drifts, so it stays under the real cursor
      if (mouse.sx !== undefined) { const w = renderer.screenToWorldN(mouse.sx, mouse.sy); mouse.x = w.x; mouse.y = w.y; }
      sim.ingest({ t: now, seq: ++mouse.seq, source: 'mouse', present: mouse.inside, x: mouse.x, y: mouse.y });
    }

    sim.update(dt, now);
    const events = sim.drainEvents();
    const snap = sim.snapshot();
    for (const e of events) {
      if (e.type === 'release_camera') camera.stop();
      if (soundOn) sound.play(e);
      staff.log(e);
      renderer.onEvent(e, snap);
      for (const [test, caption, delay] of PHOTO_MOMENTS) if (test(e)) photoQueue.push({ at: now + delay * 1000, caption: caption(e) });
    }
    sound.update(snap);

    const bar = document.getElementById('gpTrack');
    if (bar && bar.offsetParent) { const r = bar.getBoundingClientRect(); renderer.hudTarget = { x: r.left + r.width * 0.9, y: r.top + r.height / 2 }; }
    renderer.draw(snap, { keypoints: camera.keypoints, showSkeleton: staff.open }, dt);
    // social moments are photographed while they happen, not after
    const mode = snap.creature.socialMode, partner = snap.litter.find((l) => l.mode)?.kitten;
    if (mode && mode !== lastMode && partner && (mode === 'greet' || mode === 'cuddle')) photoQueue.push({ at: now + (mode === 'cuddle' ? 1800 : 1000), caption: mode === 'cuddle' ? `Cosy with ${NAMES[partner]}` : `Friends with ${NAMES[partner]}` });
    lastMode = mode;
    presence?.update(snap, now);
    tutorial.update(snap, events, now);
    while (photoQueue.length && photoQueue[0].at <= now) {
      const ph = photoQueue.shift();
      if (snap.sessionState === 'ACTIVE') ui.addPhoto(renderer.capture(snap), ph.caption);
    }
    photoQueue.sort((a, b) => a.at - b.at);
    const S = Math.min(p.width, p.height);
    const c = snap.creature;
    const z = renderer.cam.z;
    const scr = (n) => renderer.worldNToScreen(n);
    ui.update(snap, {
      camera,
      soundOn,
      width: p.width,
      height: p.height,
      catPx: { ...scr(c.position), r: (0.06 + 0.025 * c.ageProgress) * S * z },
      litterPx: snap.litter.map((l) => ({ kitten: l.kitten, ...scr(l.position), r: (0.06 + 0.025 * l.ageProgress) * S * z, wrestling: l.wrestling, fleeing: l.fleeing, invited: l.invited })),
      cursorPx: snap.input.position ? scr(snap.input.position) : null,
    });
    staff.render(snap, camera);
    window.__wildling = { snapshot: () => snap, sim, renderer, camera, tutorial, sound }; // for automated smoke tests
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    sim.setWorld(worldFor());
    renderer.resize();
  };
};

new window.p5(sketch);
