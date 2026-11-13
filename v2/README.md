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

Open <http://localhost:8790/v2/> in Chrome. Camera mode needs localhost or HTTPS. The hand model, p5.js and fonts ship with the app. Camera frames stay on the device.

Choose **Your hand** and keep one hand in view until the ring fills. Move slowly towards the kitten and pause to let it come closer. Pinch over a pouch slot to pick up an item. Open your fingers before the next pinch. To feed the kitten, pinch again over clear ground nearby. To play, move the feather in short bursts with pauses. If tracking is lost, bring one open hand back into view or choose **Use mouse**.

| Key | Action |
|---|---|
| `1`–`3` · `Enter` on the entry screen | Pick a kitten with `1`–`3`, then start the visit with `Enter` |
| `1` `2` during the visit | Take or put back a treat or feather |
| Arrow keys + `Space` | Move and confirm with the keyboard hand |
| Hold `V` or press `T` | View what the kitten sees. The eye button also toggles this view |
| `Esc` | Put the held item back, or pause or resume the visit |
| `D` | Staff diagnostics |
| `M` | Toggle sound |

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
  camera.js       getUserMedia, hand tracking lifecycle and single-hand lock
  hand-worker.js  local MediaPipe Hand Landmarker and frame processing
  keyboard.js     keyboard virtual hand
  presence.js     exhibition only: people walking past, as positions (ml5 BodyPose)
  keepsake.js     keepsakes in the visitor's own browser, and the take-home postcard
  audio.js        Web Audio, the only sound source
  icons.js        one icon set for the interface and the canvas
  main.js         wiring
v2/assets/      crest and bundled fonts (OFL)
v2/vendor/      pinned p5.js and MediaPipe for offline use
```

`sim.snapshot()` already uses the field names of the PRD V2 §19 protocol (`protocolVersion`, `sessionState`,
`stateRevision`, `behaviour`, `needs`, `reasonCode`, …), so moving the core into the local Node.js service is a
transport change, not a rewrite.
