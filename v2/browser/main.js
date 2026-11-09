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

import { Simulation } from '../core/sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { StaffPanel } from './staff.js';
import { SoundAdapter } from './audio.js';
import { CameraInput } from './camera.js';
import { KeyboardHand } from './keyboard.js';
import { KITTENS } from '../core/config.js';

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

  const dispatch = (cmd) => {
    sound.start();
    return sim.command({ id: `ui_${++cmdSeq}`, ...cmd });
  };

  const chooseInput = async (source) => {
    sound.start();
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
    renderer = new Renderer(p);
    renderer.resize();
    sound = new SoundAdapter();
    camera = new CameraInput();
    keyboard = new KeyboardHand();
    ui = new UI({
      dispatch,
      onChooseInput: chooseInput,
      onToggleSound: () => { soundOn = !soundOn; sound.setOn(soundOn); },
    });
    staff = new StaffPanel({ dispatch });
    if (params.get('kitten')) sim.command({ id: 'init_kitten', type: 'choose_kitten', kitten: params.get('kitten') });
    if (params.get('staff') === '1') staff.toggle();
    const direct = params.get('input');
    if (direct === 'mouse' || direct === 'keyboard') {
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
    if (k === 'Escape') { if (st === 'ACTIVE') dispatch({ type: 'pause', reason: 'user' }); else if (st === 'PAUSED') dispatch({ type: 'resume' }); return; }
    if (['1', '2', '3', '4'].includes(k)) { dispatch({ type: 'select_tool', tool: ['FEED', 'PLAY', 'PET', 'WAIT'][Number(k) - 1] }); return; }
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
    }
    sound.update(snap);

    const bar = document.getElementById('gpTrack');
    if (bar && bar.offsetParent) { const r = bar.getBoundingClientRect(); renderer.hudTarget = { x: r.left + r.width * 0.9, y: r.top + r.height / 2 }; }
    renderer.draw(snap, { keypoints: camera.keypoints, showSkeleton: staff.open }, dt);
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
    window.__wildling = { snapshot: () => snap, sim }; // for automated smoke tests
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    sim.setWorld(worldFor());
    renderer.resize();
  };
};

new window.p5(sketch);
