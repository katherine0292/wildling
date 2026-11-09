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
    play: (n) => `We played. I made ${n} catch${n === 1 ? '' : 'es'}.`,
    fed: (n) => `You fed me ${n} time${n === 1 ? '' : 's'}.`,
    recovered: () => 'We had a startled moment, and found our way back.',
    grew: (p) => `I grew into ${p === 'adult' ? 'an adult' : `a ${p}`} while you were here.`,
    quiet: () => 'We spent a quiet moment together.',
    befriend: (name) => `${name} and I became friends.`,
    cuddle: (name) => `I curled up with ${name}.`,
    returned: (n) => `You came back. This was visit ${n}.`,
    gift: (item) => `I brought you ${{ pebble: 'a smooth pebble', feather: 'a feather', flower: 'a dry flower', shell: 'a beetle shell' }[item] ?? 'a little gift'}.`,
    wrestle: (name) => `I wrestled with ${name} while you watched.`,
    hunt: (n) => `I chased ${n === 1 ? 'a critter' : `critters ${n} times`}. ${n === 1 ? 'It got away.' : 'Most got away.'}`,
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
  const gifts = of('gift_given');
  const wrestles = of('sibling_play', (e) => e.measurement?.endedBy === 'done');
  const hunts = of('hunt_pounce');
  const friends = of('sibling_befriend');
  const cuddles = of('sibling_cuddle');
  const NAMES = { ember: 'Ember', juniper: 'Juniper', saffron: 'Saffron' };

  const back = of('returned');
  if (back.length) push(t.returned(back[0].measurement.visits), ids(back, 1));
  if (gifts.length) push(t.gift(gifts[gifts.length - 1].measurement.item), ids(gifts, 1));
  push(t.space(), ids(space));
  if (contacts.length >= 2 && contactSec >= 3) push(t.contactLong(contactSec), ids(contacts));
  else if (contacts.length === 1) push(t.contactOne(), ids(contacts));
  push(t.adapted(), ids(adapted));
  if (pounces.length >= 2) push(t.play(pounces.length), ids(pounces));
  if (cuddles.length) push(t.cuddle(NAMES[cuddles[0].measurement.sibling] ?? 'a sibling'), ids(cuddles, 1));
  else if (friends.length) push(t.befriend(NAMES[friends[0].measurement.sibling] ?? 'a sibling'), ids(friends, 1));
  if (wrestles.length) push(t.wrestle(NAMES[wrestles[0].measurement.sibling] ?? 'a sibling'), ids(wrestles, 1));
  if (hunts.length) push(t.hunt(hunts.length), ids(hunts));
  if (fed.length) push(t.fed(fed.length), ids(fed));
  if (startles.length && (space.length || contacts.some((c) => c.simulationTime > startles[0].simulationTime))) {
    push(t.recovered(), [startles[0].id, ...ids(space.length ? space : contacts, 1)]);
  }
  if (grew.length) push(t.grew(grew[grew.length - 1].measurement.phase), ids(grew, 1));
  if (!lines.length) lines.push({ text: t.quiet(), evidence: [] });

  return {
    lines,
    counts: { fed: fed.length, pounces: pounces.length, contactSec, adapted: adapted.length, gifts: gifts.length, wrestles: wrestles.length, hunts: hunts.length },
  };
}
