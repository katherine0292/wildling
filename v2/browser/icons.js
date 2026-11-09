// One icon set, used both as inline SVG in the interface and as Path2D on the canvas,
// so the cursor, the skill bar and the field guide always show the same glyph.
// 24 × 24 grid, drawn for 1.5 px strokes.

export const ICONS = {
  FEED: { stroke: 'M2.5 12c2.6-3.8 7.4-5.3 11.6-3.1L20 5.5v13l-5.9-3.4C9.9 17.3 5.1 15.8 2.5 12Z M8.5 11.2v.1 M13.2 9.2c.9 1.8.9 3.8 0 5.6' },
  PLAY: { stroke: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18Z M4.6 8.6c4.2.9 10.1.6 14.6-1.6 M3.4 13.4c5.3 1.4 11.8.8 16.9-2.2 M8.6 3.7c3.3 4.1 4.4 11 2.2 17 M15.3 4c-1.2 4.8-.6 11 2.9 15.2' },
  PET: { stroke: 'M12 13.2c-2.9 0-5.3 2.4-5.3 4.6c0 1.9 1.8 3.2 5.3 3.2s5.3-1.3 5.3-3.2c0-2.2-2.4-4.6-5.3-4.6Z M5.6 9.4a1.9 2.3 0 1 0 3.8 0a1.9 2.3 0 1 0-3.8 0Z M9.6 5.6a1.9 2.3 0 1 0 3.8 0a1.9 2.3 0 1 0-3.8 0Z M14.6 6.2a1.9 2.3 0 1 0 3.8 0a1.9 2.3 0 1 0-3.8 0Z M17.6 10.6a1.7 2.1 0 1 0 3.4 0a1.7 2.1 0 1 0-3.4 0Z' },
  WAIT: { stroke: 'M15.5 3.5a8.5 8.5 0 1 0 5 14.2A7.2 7.2 0 0 1 15.5 3.5Z M18.5 6.5v.1 M20.5 10v.1' },
  HAND: { stroke: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4a1.5 1.5 0 0 1 3 0v7 M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13 M8 12.5 6.6 11a1.6 1.6 0 0 0-2.4 2.1L8 18.5c1.3 1.6 3 2.5 5 2.5h.5a3.5 3.5 0 0 0 3.5-3.5V11a1.5 1.5 0 0 1 3 0v6' },
  MOUSE: { stroke: 'M12 3a5.5 5.5 0 0 1 5.5 5.5v7a5.5 5.5 0 0 1-11 0v-7A5.5 5.5 0 0 1 12 3Z M12 7v3' },
  KEYS: { stroke: 'M3 7h18v11H3Z M6.5 10.5h.1 M10 10.5h.1 M13.5 10.5h.1 M17 10.5h.1 M7.5 14.5h9' },
  EYE: { stroke: 'M2.5 12s3.6-6.5 9.5-6.5s9.5 6.5 9.5 6.5s-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z M12 9.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6Z' },
  SOUND: { stroke: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4Z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11' },
  MUTE: { stroke: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4Z M16 9.5l5 5 M21 9.5l-5 5' },
  LEAF: { stroke: 'M5 19c0-8.5 5.5-14 15-14c0 9.5-5.5 15-14 15 M5 19 13 11' },
  SNOW: { stroke: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9 M9.5 4.5 12 6.5l2.5-2 M9.5 19.5 12 17.5l2.5 2' },
  SUN: { stroke: 'M12 7.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4' },
  JOURNAL: { stroke: 'M5 3.5h11.5a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2Z M5 18.5a2 2 0 0 1 2-2h11.5 M9 7.5h6 M9 10.5h4' },
};

export function svg(name, size = 24, cls = '') {
  const i = ICONS[name];
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${i.stroke}"/></svg>`;
}

const cache = {};
export function path2d(name) { return (cache[name] ??= new Path2D(ICONS[name].stroke)); }
