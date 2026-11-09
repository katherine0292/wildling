// Staff diagnostics (press D). Answers the three questions PRD V2 §6.2 asks for:
//   1. what did the system observe?      → input quality, intent, score, margin, source
//   2. what does the creature need?      → exact needs, growth gate
//   3. how did both shape this choice?   → candidates, blocked reasons, inertia, winner
// Visitors never see these numbers; the public screen uses posture and short phrases.

const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(2));
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class StaffPanel {
  constructor({ dispatch }) {
    this.el = document.getElementById('staff');
    this.dispatch = dispatch;
    this.open = false;
    this.events = [];
    this.adaptation = true;
    this.el.addEventListener('click', (e) => {
      const a = e.target.dataset?.action;
      if (a === 'adapt') { this.adaptation = !this.adaptation; dispatch({ type: 'set_adaptation', on: this.adaptation }); }
      if (a === 'end') dispatch({ type: 'end', reason: 'staff' });
      if (a === 'next') dispatch({ type: 'next' });
    });
  }

  toggle() {
    this.open = !this.open;
    this.el.hidden = !this.open;
    document.body.classList.toggle('staff', this.open);
  }

  log(e) {
    if (!e.type || e.type === 'food_dropped') return;
    const label = e.type === 'session' ? `session ${e.from}→${e.to} (${e.reason})`
      : `${e.id ?? ''} ${e.type}${e.reasonCode ? ` ${e.reasonCode}` : ''}${e.validity && e.validity !== 'valid' ? ` [${e.validity}]` : ''}`;
    this.events.unshift(`${(e.simulationTime ?? 0).toFixed(1)}s ${label}`);
    this.events.length = Math.min(this.events.length, 14);
  }

  render(snap, camera) {
    if (!this.open) return;
    const c = snap.creature, d = snap.diagnostics, i = snap.intent, inp = snap.input, m = d.memory;
    const needs = Object.entries(c.needs).map(([k, v]) => `<div class="row"><span>${k}</span><span>${f2(v)}</span></div><div class="bar"><i style="width:${v * 100}%"></i></div>`).join('');
    const cands = d.candidates.map((x) => {
      const cls = x.name === d.chosen ? 'chosen' : x.available ? '' : 'blocked';
      const tag = x.available ? (x.request ? ' +req' : '') : ` ✕ ${esc(x.blocked)}`;
      return `<div class="row ${cls}"><span>${x.name}${tag}</span><span>${f2(x.score)}</span></div><div class="bar ${x.available ? '' : 'off'}"><i style="width:${Math.min(1, x.score) * 100}%"></i></div>`;
    }).join('');
    const prefs = Object.entries(m.prefs).map(([k, v]) => `<div class="row"><span>${k}</span><span>${f2(v)} · n=${m.samples[k]} · upd ${m.updates[k]}</span></div>`).join('');
    this.el.innerHTML = `
      <h3>Session</h3>
      <div class="row"><span>state</span><span>${snap.sessionState}${snap.pauseReason ? ` (${snap.pauseReason})` : ''}</span></div>
      <div class="row"><span>id</span><span>${snap.sessionId ?? '—'}</span></div>
      <div class="row"><span>active / idle</span><span>${snap.timers.active.toFixed(0)} s / ${snap.timers.idle.toFixed(0)} s</span></div>
      <div class="row"><span>actions</span><span><button data-action="end">End session</button> <button data-action="next">Next</button></span></div>
      <h3>1 · Observed</h3>
      <div class="row"><span>source</span><span>${inp.source}${inp.source === 'camera' ? ` · cam ${camera.status}${camera.error ? ` (${camera.error})` : ''}` : ''}</span></div>
      <div class="row"><span>quality</span><span>${inp.quality} · valid ${(inp.validRatio * 100).toFixed(0)}% · rejected ${inp.rejected}</span></div>
      <div class="row"><span>speed</span><span>${f2(inp.speedSPerSecond)} S/s</span></div>
      <div class="row"><span>intent</span><span>${i.label}</span></div>
      <div class="row"><span>score / margin</span><span>${f2(i.score)} / ${f2(i.margin)}</span></div>
      <div class="row"><span>source of intent</span><span>${i.source}${i.modelVersion ? ` ${i.modelVersion}` : ''}</span></div>
      <div class="row"><span>window coverage</span><span>${f2(i.coverage)}</span></div>
      <h3>2 · Needs</h3>${needs}
      <div class="row"><span>growth</span><span>${f2(c.ageProgress)} · ${c.growing ? 'growing' : `blocked by ${c.growthBlockedBy}`}</span></div>
      <h3>3 · Decision</h3>
      <div class="row"><span>behaviour</span><span class="chosen">${c.behaviour}</span></div>
      <div class="row"><span>why</span><span>${esc(d.why)}</span></div>
      ${cands}
      <h3>Adaptation (this session only)</h3>
      <div class="row"><span>mode</span><span>${m.adaptation ? 'on' : 'off'} <button data-action="adapt">toggle</button></span></div>
      ${prefs}
      <h3>Events</h3>
      <div class="log">${this.events.map((e) => `<div>${esc(e)}</div>`).join('')}</div>
      <h3>Hint</h3>
      <div>${snap.displayHint ? `${snap.displayHint.code} (${snap.displayHint.owner})` : '—'}</div>`;
  }
}
