// Wildling V2 browser slice — wires inputs → Simulation → renderer, UI and sound.
//
// Data flow per frame:
//   mouse / keyboard / camera sample ─► sim.ingest()      (InputTrack: quality gate)
//   clicks, pinches, buttons          ─► sim.command()    (de-duplicated by id)
//   sim.update(dt)                    ─► snapshot          (the only state anyone reads)
//   snapshot ─► Renderer · UI · StaffPanel · SoundAdapter
//
// URL options for demos and screenshots:
//   ?lang=zh  ?staff=1  ?seed=42  ?adapt=0  ?input=mouse|keyboard (skips the consent screen)

import { Simulation } from '../core/sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { StaffPanel } from './staff.js';
import { SoundAdapter } from './audio.js';
import { CameraInput } from './camera.js';
import { KeyboardHand } from './keyboard.js';

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
      onToggleLang: () => { const l = ui.lang === 'en' ? 'zh' : 'en'; ui.setLang(l); dispatch({ type: 'set_lang', lang: l }); },
    });
    staff = new StaffPanel({ dispatch });
    if (params.get('lang') === 'zh') { ui.setLang('zh'); sim.command({ id: 'init_lang', type: 'set_lang', lang: 'zh' }); }
    if (params.get('staff') === '1') staff.toggle();
    const direct = params.get('input');
    if (direct === 'mouse' || direct === 'keyboard') {
      sim.command({ id: 'init_start', type: 'start' });
      keyboard.active = direct === 'keyboard';
      sim.command({ id: 'init_input', type: 'choose_input', source: direct });
    }

    const stage = document.getElementById('stage');
    stage.addEventListener('pointermove', (e) => { mouse.x = e.clientX / p.width; mouse.y = e.clientY / p.height; mouse.inside = true; });
    stage.addEventListener('pointerleave', () => { mouse.inside = false; });
    stage.addEventListener('pointerdown', (e) => {
      sound.start();
      mouse.x = e.clientX / p.width; mouse.y = e.clientY / p.height; mouse.inside = true;
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
    if (k === 'l' || k === 'L') { const l = ui.lang === 'en' ? 'zh' : 'en'; ui.setLang(l); dispatch({ type: 'set_lang', lang: l }); return; }
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
      if (s) sim.ingest(s);
    } else if (keyboard.active) {
      sim.ingest(keyboard.sample(dt, now, p.width / p.height, keyboard.keys.size && p.keyIsDown(p.SHIFT)));
    } else {
      sim.ingest({ t: now, seq: ++mouse.seq, source: 'mouse', present: mouse.inside, x: mouse.x, y: mouse.y });
    }

    sim.update(dt, now);
    for (const e of sim.drainEvents()) {
      if (e.type === 'release_camera') camera.stop();
      if (soundOn) sound.play(e);
      staff.log(e);
    }
    const snap = sim.snapshot();
    sound.update(snap);

    renderer.draw(snap, { keypoints: camera.keypoints, showSkeleton: staff.open }, dt);
    const S = Math.min(p.width, p.height);
    const c = snap.creature;
    ui.update(snap, {
      camera,
      soundOn,
      width: p.width,
      height: p.height,
      catPx: { x: c.position.x * p.width, y: c.position.y * p.height, r: (0.06 + 0.012 * c.ageProgress) * S },
      cursorPx: snap.input.position ? { x: snap.input.position.x * p.width, y: snap.input.position.y * p.height } : null,
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
