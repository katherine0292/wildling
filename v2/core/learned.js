// "What it learned about you" (experience spec V3, journal). Up to three short lines about
// the visitor, each one computed from this session's events and citing them, like the recap:
// nothing is claimed that the log cannot show. It reads the log only.
//
//   reading   how quickly the visitor answered the kitten's asks, first against last
//   gentle    whether the hand ever startled it, and whether that stopped
//   favourite what the visitor did most: stroking, playing or feeding
//   space     whether the visitor stepped back when it was tired or tense

const fmt = (s) => `${Math.max(1, Math.round(s))} s`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function learnedAbout(log) {
  const of = (type) => log.filter((e) => e.type === type && (e.validity ?? 'valid') === 'valid');
  const lines = [];
  const push = (text, detail, evidence) => { if (lines.length < 3 && evidence.length) lines.push({ text, detail, evidence }); };

  // reading its asks
  const met = of('need_met'), asked = of('need_started');
  if (met.length >= 2) {
    const first = met[0].measurement?.sec ?? met[0].sec, last = met[met.length - 1].measurement?.sec ?? met[met.length - 1].sec;
    if (last < first * 0.7) push('You read it faster by the end.', `${fmt(first)} to answer its first ask, ${fmt(last)} for its last.`, [met[0].id, met[met.length - 1].id]);
    else push(`You answered ${met.length} of its ${asked.length} asks.`, `About ${fmt(met.reduce((s, e) => s + (e.measurement?.sec ?? e.sec ?? 0), 0) / met.length)} each.`, met.slice(-3).map((e) => e.id));
  } else if (met.length === 1) {
    const k = met[0].measurement?.kind ?? met[0].kind;
    push('You noticed what it wanted.', { food: 'It was hungry, and you brought a treat.', play: 'It wanted to play, and you took the feather.', touch: 'It wanted a stroke, and you gave one.', rest: 'It was tired, and you let it rest.' }[k] ?? '', [met[0].id]);
  }

  // a gentle hand
  const startles = log.filter((e) => e.type === 'startle');
  const contacts = of('contact_started');
  const end = log.length ? log[log.length - 1].simulationTime ?? 0 : 0;
  if (!startles.length && contacts.length) push('Your hand never startled it.', 'Every approach was slow enough.', [contacts[0].id]);
  else if (startles.length) {
    const lastStartle = startles[startles.length - 1];
    const calmAfter = contacts.filter((c) => c.simulationTime > lastStartle.simulationTime);
    if (calmAfter.length && end - lastStartle.simulationTime > 30) {
      push('You learned to slow down.', `${startles.length} startle${startles.length > 1 ? 's' : ''} early on, none after ${clock(lastStartle.simulationTime)}.`, [lastStartle.id, calmAfter[0].id]);
    }
  }

  // what the visitor did most
  const ended = of('contact_ended');
  const contactSec = Math.round(ended.reduce((s, e) => s + (e.measurement?.duration ?? 0), 0));
  const catches = of('pounce_success'), meals = of('eat_completed');
  const score = [['stroke', contactSec / 8, ended], ['play', catches.length / 2, catches], ['feed', meals.length, meals]].sort((a, b) => b[1] - a[1])[0];
  if (score[1] >= 1) {
    const [kind, , ev] = score;
    if (kind === 'stroke') push('You like to stroke it.', `${contactSec} seconds of quiet contact in all.`, ev.slice(-3).map((e) => e.id));
    if (kind === 'play') push('You like to play.', `${catches.length} catches with the feather.`, ev.slice(-3).map((e) => e.id));
    if (kind === 'feed') push('You came with treats.', `${meals.length} eaten, ${meals.length > 1 ? 'one at a time' : 'and enjoyed'}.`, ev.slice(-3).map((e) => e.id));
  }

  // stepping back
  const space = of('space_respected');
  if (space.length) push('You stepped back when it needed space.', `${space.length} time${space.length > 1 ? 's' : ''}.`, space.slice(-2).map((e) => e.id));

  return lines;
}
