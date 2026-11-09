# Wildling V2: the exhibition build

The browser build of [PRD V2](../docs/prd/prd-v2.md), built along the delivery instruction in Brief V2 §14:

> a visitor approaches → the system recognises them reliably → the kitten decides from its own state whether to accept →
> the visitor sees why → after three valid encounters a bounded, explainable rhythm adaptation appears →
> the next visitor gets a clean session.

What is a model, a rule or a statistic, and what is planned or verified, is in
[`docs/ai-boundaries.md`](../docs/ai-boundaries.md) and [`docs/STATUS.md`](../docs/STATUS.md).

## Run

```bash
python3 -m http.server 8790     # from the repository root
```

Open <http://localhost:8790/v2/> in Chrome. The camera needs `localhost` or `https`. p5.js and all fonts ship in the folder, so the mouse and keyboard paths work offline.

| Key | Action |
|---|---|
| `Q` `E` · `1` `2` `3` · `Enter` | Field guide: switch tabs · choose a kitten · say hello |
| `1` … `6` | Feed · Play · Pet · Give space · Siblings · Tricks |
| Tricks | Pick a trick and press Teach, then make your own move three times (move, then pause). Make it again later to ask for the trick |
| Siblings: click a sibling (or `Space` on it) | Ask: `1` make friends · `2` cuddle up · `3` play-fight · `4` hiss. With the camera: hold an open hand, two fingers, a fist or a claw over the sibling |
| Arrows + `Space` | Keyboard hand: move · offer, or hold to pet |
| Click a sibling with Play | Invite it over (a request; your kitten may decline) |
| `T` | Peek inside: what the kitten is weighing, and why |
| `2` again | With Play selected: switch toy (yarn, feather, ball) |
| `Esc` | Pause or continue |
| `D` | Staff diagnostics: observed input, needs, decision trace, adaptation |
| `M` | Sound on or off |

URL options: `?input=mouse|keyboard` (skip the approach screen), `?kitten=ember|juniper|saffron`, `?staff=1`, `?adapt=0`, `?seed=42`, `?kiosk=1` (exhibition: no keepsakes), `?adopt=…` (a postcard's code), `?watch=1` with `?kiosk=1` (notice passers-by with the camera) or `?watch=demo` (a demo passer-by).

## Structure

```
v2/core/        pure JavaScript, no DOM, no p5: runs in the page and under `node --test`
  config.js       every parameter, all visitor copy, the litter
  input.js        InputTrack (coordinates, speed in S/s, quality gate) · PinchDetector
  tricks.js       teach a trick: move segmentation, 32-number move shapes, 1-nearest-neighbour with rejection
  pose.js         hand shapes (open hand, two fingers, fist, claw) as a rule baseline with rejection
  intent.js       600 ms window → gentle_approach / stable_contact / fast_approach / neutral_motion,
                  with unknown / lost (rule baseline with the model's output contract)
  session.js      ATTRACT → CONSENT → CALIBRATING → ACTIVE ⇄ PAUSED → REFLECTION → RESETTING
  creature.js     hard constraints → utility selection, with a recorded reason for every choice
  care.js         feed · play · contact · startle · wait, and their fairness rules
  growth.js       balanced-needs gate, passive drift and capped care bursts
  memory.js       20 semantic events + 3 bounded preferences
  recap.js        evidence-cited journal lines
  sim.js          the single authority: commands (de-duplicated), fixed 60 Hz step, snapshot
v2/browser/     everything that touches the page
  catbody.js      procedural kitten body (spine, IK legs, tail, coats), display only
  render.js       painted habitats, follow camera, light, feedback layers and cursor (reads the snapshot only)
  ui.js           field guide, approach choice, HUD and journal
  staff.js        diagnostics panel
  camera.js       getUserMedia + ml5 HandPose, error kinds, single-hand lock, clean release
  keyboard.js     keyboard virtual hand
  presence.js     exhibition only: people walking past, as positions (ml5 BodyPose)
  keepsake.js     keepsakes in the visitor's own browser, and the take-home postcard
  audio.js        Web Audio, the only sound source
  icons.js        one icon set for the interface and the canvas
  main.js         wiring
v2/assets/      crest and bundled fonts (OFL)
v2/vendor/      pinned p5.js for offline use
```

`sim.snapshot()` already uses the field names of the PRD V2 §19 protocol (`protocolVersion`, `sessionState`,
`stateRevision`, `behaviour`, `needs`, `reasonCode`, …), so moving the core into the local Node.js service is a
transport change, not a rewrite.
