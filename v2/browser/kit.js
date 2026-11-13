// The interface's icons, from the UI kit in v2/assets/ui/icons (24 × 24, 1.5 px strokes,
// currentColor). Generated from those files so the page needs no extra requests.

const PATHS = {
  "ai/hand-found": "<path d=\"M8 13V6.5a1 1 0 0 1 2 0V11 4.7a1 1 0 0 1 2 0V11 5.3a1 1 0 0 1 2 0V11 7a1 1 0 0 1 2 0v6l1.4-1.4a1.4 1.4 0 0 1 2 2l-3.2 3.1H9.6L6 16a1.5 1.5 0 0 1 2-2Z\"/><path d=\"m15 6 2 2 3.5-4\"/>",
  "ai/hand-lost": "<path d=\"M8 13V6.5a1 1 0 0 1 2 0V11 4.7a1 1 0 0 1 2 0V11 5.3a1 1 0 0 1 2 0V11 7a1 1 0 0 1 2 0v6l1.4-1.4a1.4 1.4 0 0 1 2 2l-3.2 3.1H9.6L6 16a1.5 1.5 0 0 1 2-2Z\"/><path d=\"M3 21 21 3\"/>",
  "ai/learned": "<path d=\"M4 4.5h11v14H5.5a1.5 1.5 0 0 0 0 3H17M4 4.5v15m3-11h4m4 3 2 2 4-4\"/>",
  "ai/motion-unclear": "<path d=\"M4 8V5h3m10 0h3v3m0 8v3h-3m-10 0H4v-3m3-4c2.5-5 4.7 5 7 0 1-2 2-2.4 3.2-1\"/>",
  "ai/remembered": "<path d=\"M6 4h12v16l-6-4-6 4Zm3.2 6.7 1.9 2 3.6-3.7\"/>",
  "ai/sees-you": "<path d=\"M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/>",
  "ai/thinking": "<path d=\"M4 5.5h16v11H9l-5 3Z\"/><circle cx=\"8.5\" cy=\"11\" r=\"0.42\"/><circle cx=\"12\" cy=\"11\" r=\"0.42\"/><circle cx=\"15.5\" cy=\"11\" r=\"0.42\"/>",
  "inventory/ball": "<circle cx=\"12\" cy=\"12\" r=\"7.8\"/><path d=\"M5.5 15.6c5.6-1.6 9.5-5.5 10.7-10.4m-9 12.9c5.8-.4 10.1-4.7 11-10.1\"/>",
  "inventory/mic": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6\"/>",
  "inventory/treat": "<path d=\"M7.5 11C10 7 15 5 20.5 8c-1.3 5.5-6.5 8.6-12 7.2L4 18v-7Z\"/><circle cx=\"16.5\" cy=\"9.7\" r=\"0.6\"/>",
  "inventory/wand": "<path d=\"m4.5 20 9-9m-2 3c-.4-5.4 4.6-9.5 8.7-10.3.2 4.3-2.5 10-8.7 10.3Zm.5-.6 4.7-4.4m-2.8.4.5 1.8m1.7-4.6.3 2.1\"/>",
  "journal/download": "<path d=\"M12 3.5v11m-4-4 4 4 4-4m-11 4V20h14v-5.5\"/>",
  "journal/qr": "<rect x=\"3.5\" y=\"3.5\" width=\"5.5\" height=\"5.5\" rx=\"0\"/><rect x=\"15\" y=\"3.5\" width=\"5.5\" height=\"5.5\" rx=\"0\"/><rect x=\"3.5\" y=\"15\" width=\"5.5\" height=\"5.5\" rx=\"0\"/><path d=\"M12 4v3m0 4h4m-4 4v3h3m2-5h3m-4 3v2m4-2v4h-2m-6 1h3\"/>",
  "journal/share": "<circle cx=\"6\" cy=\"12\" r=\"2\"/><circle cx=\"17.5\" cy=\"5.6\" r=\"2\"/><circle cx=\"17.5\" cy=\"18.4\" r=\"2\"/><path d=\"m7.8 11 7.9-4.4m-7.9 6.4 7.9 4.4\"/>",
  "journal/stamp": "<path d=\"M8.8 12.5c.4-1.4 1-2.2 1-3.6a2.7 2.7 0 1 1 4.4 0c0 1.4.6 2.2 1 3.6M4.5 16h15v3.5h-15Z\"/><rect x=\"6.5\" y=\"12.5\" width=\"11\" height=\"3.5\" rx=\"1\"/>",
  "mood/affectionate": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"M7.5 13.8q1.5-2 3 0m3 0q1.5-2 3 0m-6 2.8q1.5 2.4 3 0\"/>",
  "mood/alert": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"m8 12.3 2.4 1.1m5.6-1.1-2.4 1.1m-2.6 3.7h2\"/>",
  "mood/curious": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><circle cx=\"9\" cy=\"13\" r=\"1\"/><circle cx=\"15\" cy=\"13\" r=\"1\"/><path d=\"M12 16.7h.01\"/>",
  "mood/hungry": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"M8 13h2m4 0h2m-5.3 3.1c0 2.8 2.6 2.8 2.6 0Z\"/>",
  "mood/playful": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"m8 14 1.3-1.2 1.1 1.1m3.2 0 1.3-1.1 1.1 1.2m-5.9 2.1q2 3 4 0\"/>",
  "mood/relaxed": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"M7.8 13.3c1 1 2 1 3 0m2.4 0c1 1 2 1 3 0m-5.4 3.3 1.2.8 1.2-.8\"/>",
  "mood/sleepy": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><path d=\"M8 13.8h2m4 0h2m-5.8 3.2h.01m1.8.8h.01m1.8-.8h.01M16 3h4l-4 3h4\"/>",
  "mood/startled": "<path d=\"M5 11 4.8 5.5 9 8h6l4.2-2.5L19 11a7 7 0 1 1-14 0Z\"/><circle cx=\"9\" cy=\"13\" r=\"0.7\"/><circle cx=\"15\" cy=\"13\" r=\"0.7\"/><circle cx=\"12\" cy=\"17\" r=\"1.1\"/><path d=\"M12 3v2\"/>",
  "relationship/alert": "<path d=\"M12 3.5 5.5 6v5.4c0 4.4 3.3 7.5 6.5 9.1 3.2-1.6 6.5-4.7 6.5-9.1V6Z\"/><path d=\"M12 8.4v4.5m0 2.5h.01\"/>",
  "relationship/close-bond": "<path d=\"M12 19s-7-3.8-7-8a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 4.2-7 8-7 8Z\"/><path d=\"m3 14 1 3m16 0 1-3\"/>",
  "relationship/curious": "<path d=\"M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\"/><path d=\"M12 2.7v1.5m-5.6 0 .9 1m10.3-1-.9 1\"/>",
  "system/back": "<path d=\"m10 6-6 6 6 6m-6-6h16\"/>",
  "system/camera-gesture": "<path d=\"M3.5 7.5H16v9H3.5ZM16 11l4.5-2.5v7L16 13\"/><path d=\"M7 13v-1m3 1v-2m3 2v-1\"/>",
  "system/close": "<path d=\"m6 6 12 12M18 6 6 18\"/>",
  "system/end": "<path d=\"M12 4H5v16h7m3-12 4 4-4 4m4-4H9\"/>",
  "system/fullscreen": "<path d=\"M3.5 9V3.5H9m6 0h5.5V9m0 6v5.5H15m-6 0H3.5V15\"/>",
  "system/help": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M9.4 9.2a2.65 2.65 0 1 1 4.2 2.15c-1.1.7-1.6 1.2-1.6 2.2m0 2.8h.01\"/>",
  "system/keyboard": "<rect x=\"2.75\" y=\"5.5\" width=\"18.5\" height=\"13\" rx=\"2\"/><path d=\"M6.5 9h1m3 0h1m3 0h1m3 0h.1M6.5 12h1m3 0h1m3 0h1m3 0h.1M8.5 15h7\"/>",
  "system/mouse": "<rect x=\"6\" y=\"3\" width=\"12\" height=\"18\" rx=\"6\"/><path d=\"M12 3v6\"/>",
  "system/pause": "<path d=\"M9 5v14m6-14v14\"/>",
  "system/photo": "<path d=\"M4 7.5h4l1.4-2h5.2l1.4 2h4v12H4Z\"/><circle cx=\"12\" cy=\"13.4\" r=\"3.2\"/>",
  "system/sound-off": "<path d=\"M3 9h4l4-3.5v13L7 15H3Z\"/><path d=\"m15 10 5 5m0-5-5 5\"/>",
  "system/sound-on": "<path d=\"M3 9h4l4-3.5v13L7 15H3Z\"/><path d=\"M14 9a4.3 4.3 0 0 1 0 6m2.5-8.7a7.7 7.7 0 0 1 0 11.4\"/>",
};

export function kit(name, size = 22, label = '') {
  const inner = PATHS[name];
  if (!inner) return '';
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="kit" ${a11y} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
