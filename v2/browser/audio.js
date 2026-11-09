// SoundAdapter — the only place that makes sound (PRD V2 §18). It consumes semantic
// events and the snapshot; it never decides anything. Everything is synthesised with
// the Web Audio API (no audio files), adapted from Prototype B.
// Events older than 2 s are never replayed, so a resumed tab does not burst out noise.

export class SoundAdapter {
  constructor() { this.ctx = null; this.on = true; this.blocked = false; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const wind = c.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.7;
    this.windVol = c.createGain(); this.windVol.gain.value = 0;
    wind.connect(wf).connect(this.windVol).connect(this.out); wind.start();

    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 500;
    this.purrVol = c.createGain(); this.purrVol.gain.value = 0;
    const throb = c.createGain(); throb.gain.value = 0.5;
    src.connect(low).connect(this.purrVol).connect(throb).connect(this.out);
    const lfo = c.createOscillator(); lfo.frequency.value = 25;
    const depth = c.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(throb.gain); lfo.start(); src.start();
  }

  get ready() { return this.ctx && this.ctx.state === 'running'; }

  setOn(on) {
    this.on = on;
    if (this.ctx) this.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  // continuous layers follow the snapshot
  update(snap) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const phaseIdx = { kitten: 0, juvenile: 1, adult: 2 }[snap.creature.phase];
    const live = snap.sessionState === 'ACTIVE' || snap.sessionState === 'ATTRACT';
    this.windVol.gain.setTargetAtTime(live ? [0.06, 0.14, 0.09][phaseIdx] : 0.02, t, 0.5);
    this.purrVol.gain.setTargetAtTime(snap.creature.acceptedContact ? 1.1 : 0, t, 0.25);
    if (phaseIdx === 0 && live && Math.random() < 0.004) this.chirp();
    this.phaseIdx = phaseIdx;
  }

  // discrete sounds follow semantic events
  play(e) {
    if (!this.ready) return;
    switch (e.type) {
      case 'eat_completed': this.burst('bandpass', 1800, 0.5, 0.1, 0); this.burst('bandpass', 1500, 0.4, 0.1, 0.2); break;
      case 'pounce_success': this.tone(2000, 1900, 0.25, 0.08, 0); this.tone(2600, 2500, 0.2, 0.06, 0.06); break;
      case 'startle': this.burst('highpass', 2500, 0.35, 0.7, 0); break;
      case 'contact_started': this.meow(1.1); break;
      case 'refusal': if (e.reasonCode === 'NEED_REST' || e.reasonCode === 'TOO_FULL') this.meow(0.85); break;
      case 'rhythm_adapted': this.chord([659, 784, 988], 0.06); break;
      case 'space_respected': this.chord([523, 659], 0.05); break;
      case 'phase_changed': this.chord([523, 659, 784], 0.12); break;
      case 'food_dropped': this.plop(); break;
      case 'session': if (e.to === 'REFLECTION') this.chord([392, 523, 659], 0.08); break;
      default: break;
    }
  }

  meow(scale = 1) {
    const c = this.ctx, t = c.currentTime;
    const base = [900, 650, 480][this.phaseIdx ?? 0] * scale;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.linearRampToValueAtTime(base * 1.2, t + 0.15);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 0.5);
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + 0.6);
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
