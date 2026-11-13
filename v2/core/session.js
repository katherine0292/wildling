// SessionController — who is using the piece, and whether anything may be remembered
// (PRD V2 §10). Pure state machine: it never touches the DOM, the camera or the cat.
//
// ATTRACT → CONSENT → (CALIBRATING) → ACTIVE ⇄ PAUSED → REFLECTION → RESETTING → ATTRACT

import { PARAMS } from './config.js';

export const STATES = ['ATTRACT', 'CONSENT', 'CALIBRATING', 'ACTIVE', 'PAUSED', 'REFLECTION', 'RESETTING'];

let counter = 0;
const newSessionId = (rand) => `s_${Date.now().toString(36)}_${(++counter).toString(36)}_${Math.floor(rand() * 1e6).toString(36)}`;

export class SessionController {
  // `timed` is the exhibition setting: a visit has a length and an idle visitor is moved on.
  // On the website nobody is waiting, so the visit lasts until the visitor ends it.
  constructor(params = PARAMS, rand = Math.random, { timed = true } = {}) {
    this.p = params.session;
    this.timed = timed;
    this.rand = rand;
    this.state = 'ATTRACT';
    this.sessionId = null;
    this.inputSource = null;
    this.activeTime = 0;     // seconds spent ACTIVE in this session
    this.idle = 0;           // seconds without meaningful activity
    this.stateTime = 0;      // seconds in the current state
    this.calibStable = 0;
    this.calibElapsed = 0;
    this.pauseReason = null;
    this.endReason = null;
    this.transitions = [];   // drained by the simulation
  }

  go(next, reason) {
    const from = this.state;
    if (from === next) return;
    this.state = next;
    this.stateTime = 0;
    if (next === 'CALIBRATING') { this.calibStable = 0; this.calibElapsed = 0; }
    this.transitions.push({ from, to: next, reason });
  }

  // --- explicit commands ---
  start() { if (this.state === 'ATTRACT') this.go('CONSENT', 'start'); }

  chooseInput(source) {
    if (this.state !== 'CONSENT' && this.state !== 'CALIBRATING' && this.state !== 'PAUSED') return false;
    const fresh = this.state === 'CONSENT';
    this.inputSource = source;
    if (fresh) { this.sessionId = newSessionId(this.rand); this.activeTime = 0; }
    this.idle = 0;
    this.go(source === 'camera' ? 'CALIBRATING' : 'ACTIVE', `input:${source}`);
    return true;
  }

  backToConsent(reason) { if (this.state === 'CALIBRATING') this.go('CONSENT', reason); }

  pause(reason) {
    if (this.state !== 'ACTIVE') return;
    this.pauseReason = reason;
    this.go('PAUSED', reason);
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    this.pauseReason = null;
    this.idle = 0;
    this.go(this.inputSource === 'camera' ? 'CALIBRATING' : 'ACTIVE', 'resume');
  }

  end(reason = 'user') {
    if (this.state === 'ACTIVE' || this.state === 'PAUSED' || this.state === 'CALIBRATING') {
      this.endReason = reason;
      this.go('REFLECTION', reason);
    } else if (this.state === 'CONSENT') {
      this.go('ATTRACT', 'cancel');
    }
  }

  next() { if (this.state === 'REFLECTION') this.go('RESETTING', 'next'); }

  noteActivity() { this.idle = 0; }

  // --- time ---
  // ctx: { trackingValid, trackingAvailable, grown }
  tick(dt, ctx = {}) {
    this.stateTime += dt;
    switch (this.state) {
      case 'CALIBRATING':
        if (ctx.trackingAvailable === false) break;
        this.calibElapsed += dt;
        this.calibStable = ctx.trackingValid ? this.calibStable + dt : 0;
        if (this.calibStable >= this.p.calibrateStableSec) this.go('ACTIVE', 'calibrated');
        else if (this.calibElapsed >= this.p.calibrateMaxSec) this.go('CONSENT', 'calibration_timeout');
        break;
      case 'ACTIVE':
        this.activeTime += dt;
        this.idle += dt;
        if (ctx.grown) this.end('grown');
        else if (this.timed && this.activeTime >= this.p.maxActiveSec) this.end('time_limit');
        else if (this.timed && this.idle >= this.p.idlePauseSec) this.pause('idle');
        break;
      case 'PAUSED':
        if (this.pauseReason === 'idle') {
          this.idle += dt;
          if (this.idle >= this.p.idleEndSec) this.end('idle');
        }
        if (this.stateTime >= this.p.pauseMaxSec) this.end('pause_timeout');
        break;
      case 'REFLECTION':
        // the exhibition moves on to the next visitor; on the website the journal stays open
        if (this.timed && this.stateTime >= this.p.reflectionSec) this.go('RESETTING', 'reflection_done');
        break;
      case 'RESETTING':
        // The simulation clears everything during this tick, then confirms.
        break;
    }
  }

  confirmReset() {
    if (this.state !== 'RESETTING') return;
    this.sessionId = null;
    this.inputSource = null;
    this.activeTime = 0;
    this.idle = 0;
    this.endReason = null;
    this.go('ATTRACT', 'reset_done');
  }

  get stillThere() { return this.timed && this.state === 'ACTIVE' && this.idle >= this.p.idleHintSec; }
  get offerEnd() { return this.timed && this.state === 'ACTIVE' && this.activeTime >= this.p.offerEndSec; }
  get reflectionLeft() { return this.state === 'REFLECTION' ? Math.max(0, this.p.reflectionSec - this.stateTime) : null; }

  drain() { const t = this.transitions; this.transitions = []; return t; }
}
