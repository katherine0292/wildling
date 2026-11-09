// SoundAdapter — the only place that makes sound (PRD V2 §18). It consumes semantic
// events and the snapshot; it never decides anything. Everything is synthesised with
// the Web Audio API (no audio files), so it works offline and has no licensing.
//
// Layers:
//   • ambience  — wind per habitat, birdsong in the forest
//   • purr      — a real-sounding purr while contact is accepted (and softly while cuddling)
//   • moments   — meows, trills, hisses, scuffles, pounces, chimes, all driven by events
//                 or by changes in the snapshot (a hiss starting, a play-fight running)
// Events older than 2 s are never replayed, so a resumed tab does not burst out noise.

export class SoundAdapter {
  constructor() { this.ctx = null; this.on = true; this.blocked = false; this.prev = {}; this.nextScuffle = 0; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.out = c.createGain(); this.out.gain.value = 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.out.connect(comp).connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // wind
    const wind = c.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.7;
    this.windVol = c.createGain(); this.windVol.gain.value = 0;
    wind.connect(wf).connect(this.windVol).connect(this.out); wind.start();

    // purr: band-limited noise in the range small speakers can play, pulsed ~26 times a
    // second like a cat's larynx, swelling and easing with each breath
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const body = c.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 230; body.Q.value = 1.1;
    const rasp = c.createBiquadFilter(); rasp.type = 'bandpass'; rasp.frequency.value = 650; rasp.Q.value = 1.8;
    const raspVol = c.createGain(); raspVol.gain.value = 0.45;
    const mix = c.createGain(); mix.gain.value = 2.5; // narrow bands carry little energy; bring the purr up to a meow's loudness
    src.connect(body).connect(mix);
    src.connect(rasp).connect(raspVol).connect(mix);
    const pulse = c.createGain(); pulse.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 26;
    const soften = c.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 80;
    const depth = c.createGain(); depth.gain.value = 0.5;
    lfo.connect(soften).connect(depth).connect(pulse.gain);
    const breath = c.createGain(); breath.gain.value = 0.75;
    const blfo = c.createOscillator(); blfo.frequency.value = 0.55;
    const bdepth = c.createGain(); bdepth.gain.value = 0.25;
    blfo.connect(bdepth).connect(breath.gain);
    this.purrVol = c.createGain(); this.purrVol.gain.value = 0;
    mix.connect(pulse).connect(breath).connect(this.purrVol).connect(this.out);
    lfo.start(); blfo.start(); src.start();
  }

  get ready() { return this.ctx && this.ctx.state === 'running'; }

  setOn(on) {
    this.on = on;
    if (this.ctx) this.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  // continuous layers and moments that are states rather than events
  update(snap) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, c = snap.creature;
    const phaseIdx = { kitten: 0, juvenile: 1, adult: 2 }[c.phase];
    this.phaseIdx = phaseIdx;
    const live = snap.sessionState === 'ACTIVE' || snap.sessionState === 'ATTRACT';
    this.windVol.gain.setTargetAtTime(live ? [0.05, 0.12, 0.08][phaseIdx] : 0.02, t, 0.5);
    const purr = c.acceptedContact ? 0.9 : c.socialMode === 'cuddle' ? 0.35 : c.behaviour === 'REST' && snap.sessionState === 'ACTIVE' ? 0.08 : 0;
    this.purrVol.gain.setTargetAtTime(purr, t, 0.3);
    if (phaseIdx === 0 && live && Math.random() < 0.004) this.chirp();

    // a hiss starts (the kitten's own, or a sibling hissing back in a standoff)
    const hiss = c.reaction?.type === 'hiss';
    if (hiss && !this.prev.hiss) this.hiss(1);
    const back = snap.litter.some((l) => l.standoff && l.kitten === 'saffron');
    if (back && !this.prev.back) this.hiss(0.8, 0.35);
    // a play-fight: a stream of thumps, growls and squeaks while it lasts
    if (c.socialMode === 'wrestle' && t >= this.nextScuffle) { this.scuffle(); this.nextScuffle = t + 0.18 + Math.random() * 0.22; }
    // making friends: a soft trill when it begins
    if (c.socialMode === 'greet' && this.prev.mode !== 'greet') { this.trill(); this.trill(0.5, 1.2); }
    if (c.socialMode === 'cuddle' && this.prev.mode !== 'cuddle') this.sigh();
    if (c.trick && !this.prev.trick) this.whoosh(c.trick.name === 'spin' ? 0.9 : 0.6);
    this.prev = { hiss, back, mode: c.socialMode, trick: !!c.trick };
  }

  // discrete sounds follow semantic events
  play(e) {
    if (!this.ready) return;
    const m = e.measurement ?? {};
    switch (e.type) {
      case 'eat_completed': this.burst('bandpass', 1800, 0.5, 0.1, 0); this.burst('bandpass', 1500, 0.4, 0.1, 0.2); this.burst('bandpass', 1700, 0.35, 0.08, 0.38); break;
      case 'pounce_success': this.whoosh(0.4); this.thump(0.5, 0.12); this.tone(2000, 1900, 0.2, 0.06, 0.14); break;
      case 'pounce_missed': this.whoosh(0.5); break;
      case 'startle': this.burst('highpass', 2500, 0.35, 0.7, 0); this.meow(1.4, 0.05, 0.35); break;
      case 'contact_started': this.meow(1.1); break;
      case 'refusal': if (['NEED_REST', 'TOO_FULL', 'NOT_CLOSE_YET', 'HUNGRY_FIRST'].includes(e.reasonCode)) this.meow(0.85); else if (e.reasonCode === 'FRIENDS') this.trill(0.8); break;
      case 'rhythm_adapted': this.chord([659, 784, 988], 0.06); break;
      case 'space_respected': this.chord([523, 659], 0.05); break;
      case 'phase_changed': this.chord([523, 659, 784, 1047], 0.12); this.meow(1); break;
      case 'fully_grown': this.chord([392, 523, 659, 784, 1047], 0.14); break;
      case 'food_dropped': this.plop(); break;
      case 'growth_burst': this.sparkle(m.amount ?? 0.05); break;
      case 'sibling_play': if (m.endedBy === 'done') this.trill(1.1); break;
      case 'sibling_befriend': this.chord([784, 988, 1175], 0.05); break;
      case 'sibling_cuddle': this.chord([523, 659, 784], 0.04); break;
      case 'hunt_pounce': this.whoosh(0.6); this.thump(0.45, 0.15); if (m.caught) this.tone(3200, 2400, 0.12, 0.05, 0.25); break;
      case 'gift_given': this.chime(); this.meow(1.2, 0.3); break;
      case 'trick_learned': this.chord([523, 784, 1047, 1319], 0.08); break;
      case 'trick_done': this.chime(); break;
      case 'teach_example': this.tone(880 + (e.count ?? 1) * 220, 900 + (e.count ?? 1) * 220, 0.12, 0.08, 0); break;
      case 'returned': this.meow(1.2); this.trill(1, 0.5); break;
      case 'toy_thrown': this.whoosh(0.5); break;
      case 'session': if (e.to === 'REFLECTION') this.chord([392, 523, 659], 0.08); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- voices
  meow(scale = 1, delay = 0, vol = 0.5) {
    const c = this.ctx, t = c.currentTime + delay;
    const base = [900, 650, 480][this.phaseIdx ?? 0] * scale;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.linearRampToValueAtTime(base * 1.2, t + 0.15);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 0.5);
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + 0.6);
  }

  // a rolled "mrrrp": a short rising tone with a fast flutter
  trill(scale = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const base = [700, 560, 460][this.phaseIdx ?? 0] * scale;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), fl = c.createOscillator(), fd = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(base * 0.8, t); o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.22);
    fl.frequency.value = 32; fd.gain.value = base * 0.06; fl.connect(fd).connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + 0.32); fl.start(t); fl.stop(t + 0.32);
  }

  // a hiss: a sharp spit, then sustained breathy noise high in the spectrum
  hiss(vol = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), pk = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
    hp.type = 'highpass'; hp.frequency.value = 2200;
    pk.type = 'peaking'; pk.frequency.value = 4800; pk.gain.value = 10; pk.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * vol, t + 0.015);      // spit
    g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.12);
    g.gain.setValueAtTime(0.22 * vol, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    s.connect(hp).connect(pk).connect(g).connect(this.out); s.start(t); s.stop(t + 1.1);
  }

  // one beat of a scuffle: a soft body thump, a growl or a squeak
  scuffle() {
    const r = Math.random();
    if (r < 0.45) this.thump(0.5 + Math.random() * 0.3);
    else if (r < 0.75) this.growl();
    else this.tone(1400 + Math.random() * 900, 1000, 0.09, 0.05, 0);
    if (Math.random() < 0.3) this.burst('bandpass', 3000, 0.12, 0.06, 0.05); // fur rustle
  }

  growl() {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), tr = c.createOscillator(), td = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = [240, 200, 170][this.phaseIdx ?? 0] * (0.9 + Math.random() * 0.2);
    tr.frequency.value = 18; td.gain.value = 0.12; tr.connect(td).connect(g.gain);
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + 0.3); tr.start(t); tr.stop(t + 0.3);
  }

  thump(vol = 0.5, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.16);
    this.burst('lowpass', 600, vol * 0.4, 0.08, delay);
  }

  whoosh(vol = 0.5) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 0.3);
  }

  sigh() {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 1);
  }

  chime() { [1319, 1760, 2093].forEach((f, i) => this.tone(f, f, 0.6, 0.05, i * 0.08)); }

  // growth: a short rising sparkle, brighter for a bigger burst
  sparkle(amount) {
    const top = 1200 + Math.min(1, amount / 0.1) * 900;
    this.tone(top * 0.75, top, 0.12, 0.05, 0); this.tone(top, top * 1.25, 0.14, 0.04, 0.07);
  }

  plop() {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.2);
  }

  tone(from, to, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  chirp() { const p = 2200 + Math.random() * 1000; this.tone(p, p * 1.4, 0.08, 0.04, 0); this.tone(p, p * 1.5, 0.1, 0.04, 0.12); }

  chord(freqs, vol) {
    const c = this.ctx, t = c.currentTime;
    freqs.forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(), s = t + i * 0.12;
      o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
      o.connect(g).connect(this.out); o.start(s); o.stop(s + 1.2);
    });
  }

  burst(type, freq, peak, dur, delay) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + dur);
  }
}
