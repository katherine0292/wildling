// The need cycle (experience spec V3, Act 2). The kitten wants one thing at a time; the
// visitor's job is to notice it and answer. This module only reads the kitten's needs and
// the events it emits; it never changes the kitten, so it adds no new way to lose trust.
//
//   rest   energy is low      → answered by stepping back (space respected) or it naps it off
//   food   fullness is low    → answered by a meal
//   play   fun is low         → answered by two catches
//   touch  calm, fed, trusting, and no stroke for a while → answered by three seconds of contact
//
// A need is shown on the body first; the page adds a pictogram only after `hintAfterSec`
// without an answer. An unanswered need lapses quietly after `lapseSec`. Each episode is
// logged with how long the answer took, which the journal can cite later.

export const NEED_KINDS = ['rest', 'food', 'play', 'touch'];

export const NEED_PARAMS = Object.freeze({
  rest: { below: 0.3, metAt: 0.6 },
  food: { below: 0.35, metAt: 0.6 },
  play: { below: 0.3, catches: 2 },
  touch: { maxStress: 0.35, minTrust: 0.3, minFull: 0.4, afterSec: 25, contactSec: 3 },
  hintAfterSec: 8, lapseSec: 40, gapSec: 6,
});

export class NeedCycle {
  constructor(p = NEED_PARAMS) { this.p = p; this.reset(); }

  reset() {
    this.current = null;     // { kind, since, catches, contactSec }
    this.gapUntil = 0;
    this.lastContactAt = 0;
    this.episodes = [];      // { kind, since, until, outcome: 'met' | 'lapsed', sec }
  }

  // What the kitten wants most right now, or null. Rest outranks food, food outranks play.
  wants(n, time) {
    const p = this.p;
    if (n.energy < p.rest.below) return 'rest';
    if (n.fullness < p.food.below) return 'food';
    if (n.fun < p.play.below) return 'play';
    if (n.stress <= p.touch.maxStress && n.trust >= p.touch.minTrust && n.fullness >= p.touch.minFull
        && time - this.lastContactAt >= p.touch.afterSec) return 'touch';
    return null;
  }

  // cat: { needs, acceptedContact }; events: this step's semantic events. Returns new episode events.
  step(cat, events, time, dt) {
    const out = [];
    if (cat.acceptedContact) this.lastContactAt = time;
    const c = this.current;
    if (c) {
      if (c.kind === 'play') c.catches += events.filter((e) => e.type === 'pounce_success').length;
      if (c.kind === 'touch') c.contactSec = cat.acceptedContact ? c.contactSec + dt : c.contactSec;
      if (this.met(c, cat.needs, events)) out.push(this.close('met', time));
      else if (time - c.since >= this.p.lapseSec) out.push(this.close('lapsed', time));
    } else if (time >= this.gapUntil) {
      const kind = this.wants(cat.needs, time);
      if (kind) {
        this.current = { kind, since: time, catches: 0, contactSec: 0 };
        out.push({ type: 'need_started', kind });
      }
    }
    return out;
  }

  met(c, n, events) {
    const p = this.p;
    switch (c.kind) {
      case 'rest': return n.energy >= p.rest.metAt || events.some((e) => e.type === 'space_respected');
      case 'food': return events.some((e) => e.type === 'eat_completed') || n.fullness >= p.food.metAt;
      case 'play': return c.catches >= p.play.catches;
      case 'touch': return c.contactSec >= p.touch.contactSec;
      default: return true;
    }
  }

  close(outcome, time) {
    const c = this.current;
    const ep = { kind: c.kind, since: c.since, until: time, outcome, sec: time - c.since };
    this.episodes.push(ep);
    this.current = null;
    this.gapUntil = time + this.p.gapSec;
    return { type: outcome === 'met' ? 'need_met' : 'need_lapsed', kind: ep.kind, sec: ep.sec };
  }

  // For the snapshot: the current need, and whether it has waited long enough for a hint.
  view(time) {
    const c = this.current;
    if (!c) return null;
    const waited = time - c.since;
    return { kind: c.kind, waited, hint: waited >= this.p.hintAfterSec };
  }
}
