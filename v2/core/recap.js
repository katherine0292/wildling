// End-of-session recap (PRD V2 F2-15).
// At most three sentences. Each one cites the ids of real events from this session,
// so nothing can be claimed that did not happen: no "we played for ages" without
// pounces, no "you were always patient" from a single contact.

const T = {
  en: {
    space: () => 'You gave me space when I needed it.',
    contactLong: (s) => `Your hand felt gentle. We shared ${s} seconds of quiet contact.`,
    contactOne: () => 'You found a gentle way to say hello.',
    adapted: () => 'I got used to your rhythm.',
    play: (n) => `We played. I caught the yarn ${n} time${n === 1 ? '' : 's'}.`,
    fed: (n) => `You fed me ${n} time${n === 1 ? '' : 's'}.`,
    recovered: () => 'We had a startled moment, and found our way back.',
    grew: (p) => `I grew into ${p === 'adult' ? 'an adult' : `a ${p}`} while you were here.`,
    quiet: () => 'We spent a quiet moment together.',
  },
};

// log: all semantic events of this session (destroyed at reset)
export function buildRecap(log, lang = 'en') {
  const t = T[lang] ?? T.en;
  const of = (type, pred = () => true) => log.filter((e) => e.type === type && e.validity === 'valid' && pred(e));
  const ids = (arr, k = 3) => arr.slice(-k).map((e) => e.id);
  const lines = [];
  const push = (text, evidence) => { if (lines.length < 3 && evidence.length) lines.push({ text, evidence }); };

  const space = of('space_respected');
  const contacts = of('contact_ended');
  const contactSec = Math.round(contacts.reduce((s, e) => s + (e.measurement?.duration ?? 0), 0));
  const adapted = of('rhythm_adapted');
  const pounces = of('pounce_success');
  const fed = of('eat_completed');
  const startles = log.filter((e) => e.type === 'startle');
  const grew = of('phase_changed');

  push(t.space(), ids(space));
  if (contacts.length >= 2 && contactSec >= 3) push(t.contactLong(contactSec), ids(contacts));
  else if (contacts.length === 1) push(t.contactOne(), ids(contacts));
  push(t.adapted(), ids(adapted));
  if (pounces.length >= 2) push(t.play(pounces.length), ids(pounces));
  if (fed.length) push(t.fed(fed.length), ids(fed));
  if (startles.length && (space.length || contacts.some((c) => c.simulationTime > startles[0].simulationTime))) {
    push(t.recovered(), [startles[0].id, ...ids(space.length ? space : contacts, 1)]);
  }
  if (grew.length) push(t.grew(grew[grew.length - 1].measurement.phase), ids(grew, 1));
  if (!lines.length) lines.push({ text: t.quiet(), evidence: [] });

  return {
    lines,
    counts: { fed: fed.length, pounces: pounces.length, contactSec, adapted: adapted.length },
  };
}
