// RelationshipMemory — limited memory and bounded adaptation (PRD V2 F2-12, ADR-007).
//
// What it is: a statistical estimate (median target + 0.8/0.2 smoothing + hard range).
// What it is not: online learning, a personality model, or anything kept after the session.
//
// Three preferences, each needing ≥ 3 independent valid events before it may move:
//   contactDwell    0.8 s  [0.5, 1.2]   how long the system waits to confirm a steady hand
//   playTempoScale  1.0    [0.85, 1.15] multiplies the cat's chase speed
//   approachRadius  0.10 S [0.08, 0.12] how close the cat comes when it invites contact

import { PARAMS, clamp } from './config.js';

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const SEMANTIC = new Set([
  'eat_completed', 'pounce_success', 'contact_started', 'contact_ended',
  'refusal', 'startle', 'space_respected', 'phase_changed', 'rhythm_adapted',
  'sibling_play', 'hiss', 'hunt_pounce', 'gift_given',
]);

export class RelationshipMemory {
  constructor(params = PARAMS, { adaptation = true } = {}) {
    this.p = params.memory;
    this.adaptation = adaptation;
    this.reset();
  }

  reset() {
    const p = this.p;
    this.events = [];
    this.samples = { contactDwell: [], playTempoScale: [], approachRadius: [] };
    this.prefs = { contactDwell: p.contactDwell.init, playTempoScale: p.playTempoScale.init, approachRadius: p.approachRadius.init };
    this.lastUpdate = { contactDwell: -Infinity, playTempoScale: -Infinity, approachRadius: -Infinity };
    this.updates = { contactDwell: 0, playTempoScale: 0, approachRadius: 0 };
    this.readOnly = false;
  }

  // Returns derived events (e.g. rhythm_adapted) for the caller to publish.
  // `accepting` is false whenever the session is not ACTIVE, the input is not valid,
  // or the event was not confirmed — nothing is learned from those moments.
  record(evt, { accepting = true } = {}) {
    if (this.readOnly || !accepting) return [];
    if (!SEMANTIC.has(evt.type)) return [];
    this.events.push(evt);
    if (this.events.length > this.p.maxEvents) this.events.shift();
    if (evt.validity !== 'valid') return [];

    const m = evt.measurement || {};
    const out = [];
    if (evt.type === 'contact_ended' && m.duration >= this.p.minContactForDwellSample) {
      this.samples.contactDwell.push(clamp(0.5 + 20 * m.jitter, 0.5, 1.2));
      out.push(...this.maybeUpdate('contactDwell', evt));
    }
    if (evt.type === 'pounce_success' && Number.isFinite(m.interval) && m.interval > 0 && m.interval < 10) {
      this.samples.playTempoScale.push(clamp(2 / m.interval, 0.85, 1.15));
      out.push(...this.maybeUpdate('playTempoScale', evt));
    }
    if (evt.type === 'contact_started' && Number.isFinite(m.handDistance)) {
      this.samples.approachRadius.push(clamp(m.handDistance, 0.08, 0.12));
      out.push(...this.maybeUpdate('approachRadius', evt));
    }
    return out;
  }

  maybeUpdate(key, evt) {
    const range = this.p[key];
    const s = this.samples[key];
    if (s.length > 12) s.shift();
    if (!this.adaptation) return [];
    if (s.length < this.p.minSamples) return [];
    if (evt.simulationTime - this.lastUpdate[key] < this.p.minUpdateSec) return [];
    const old = this.prefs[key];
    const target = median(s);
    const next = clamp(old * this.p.oldWeight + target * (1 - this.p.oldWeight), range.min, range.max);
    this.lastUpdate[key] = evt.simulationTime;
    if (Math.abs(next - old) < 1e-4) return [];
    this.prefs[key] = next;
    this.updates[key]++;
    return [{
      type: 'rhythm_adapted',
      reasonCode: 'RHYTHM_ADAPTED',
      measurement: { key, from: old, to: next, target, samples: s.length, evidence: evt.id },
    }];
  }

  freeze() { this.readOnly = true; }

  snapshot() {
    return {
      adaptation: this.adaptation,
      prefs: { ...this.prefs },
      samples: Object.fromEntries(Object.entries(this.samples).map(([k, v]) => [k, v.length])),
      updates: { ...this.updates },
      events: this.events.length,
    };
  }
}
