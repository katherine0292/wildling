# Wildling V2 — browser vertical slice

The first end-to-end slice of [PRD V2](../docs/prd/prd-v2.md), built along the delivery
instruction in Brief V2 §14:

> visitor approaches → the system recognises reliably → the cat decides from its own
> state whether to accept → the visitor sees why → after three valid encounters a
> bounded, explainable rhythm adaptation appears → the next visitor gets a clean session.

What is real, what is a rule and what is still a plan is stated in
[`docs/ai-boundaries.md`](../docs/ai-boundaries.md) and [`docs/STATUS.md`](../docs/STATUS.md).

## Run

```bash
python3 -m http.server 8790     # from the repository root
```

Open <http://localhost:8790/v2/> in Chrome. The camera needs `localhost` or `https`.

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Feed · Play · Pet · Give space |
| Arrows + `Space` | keyboard hand (move · drop / hold to pet) |
| `Esc` | pause / continue |
| `D` | staff diagnostics (observed input, needs, decision trace, adaptation) |
| `L` | English / 中文 |
| `M` | sound on / off |

URL options: `?input=mouse|keyboard` (skip the consent screen), `?staff=1`, `?lang=zh`, `?adapt=0`, `?seed=42`.

## Structure

```
v2/core/        pure JavaScript, no DOM, no p5 — runs in the page and in `node --test`
  config.js       every parameter and all visitor copy (EN / ZH)
  input.js        InputTrack (coordinates, speed in S/s, quality gate) · PinchDetector
  intent.js       600 ms window → gentle_approach / stable_contact / fast_approach / neutral_motion,
                  with unknown / lost (rule baseline, model-shaped output)
  session.js      ATTRACT → CONSENT → CALIBRATING → ACTIVE ⇄ PAUSED → REFLECTION → RESETTING
  creature.js     hard constraints → utility selection, with a recorded reason for every choice
  care.js         feed · play · contact · startle · wait, and their fairness rules
  growth.js       balanced-needs growth gate
  memory.js       20 semantic events + 3 bounded preferences
  recap.js        evidence-cited end-of-session lines
  sim.js          the single authority: commands (de-duplicated), fixed 60 Hz step, snapshot
v2/browser/     everything that touches the page
  camera.js       getUserMedia + ml5 HandPose, error kinds, single-hand lock, clean release
  keyboard.js     keyboard virtual hand
  render.js       p5 renderer (reads the snapshot only)
  ui.js           visitor screens and hints
  staff.js        diagnostics panel
  audio.js        Web Audio, the only sound source
  main.js         wiring
```

`sim.snapshot()` uses the field names of the PRD V2 §19 protocol (`protocolVersion`,
`sessionState`, `stateRevision`, `behaviour`, `needs`, `reasonCode`, …), so moving the
core into the planned local Node.js service is a transport change, not a rewrite.
