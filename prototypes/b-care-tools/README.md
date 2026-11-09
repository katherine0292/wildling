# Prototype B — Care tools

A single-file p5.js prototype that organises the relationship around three explicit
care tools: **Feed**, **Play** and **Pet**. It was built to test the *first-time visitor*
route of the original brief: can a stranger find one effective interaction quickly and
understand what it changed?

> Prototype A (repository root) and Prototype B are **two parallel explorations of the
> same Brief V1**, not two releases. "V1" and "V2" in `docs/` refer to *requirement
> stages*, not to these code folders.

## Run

- **p5.js web editor:** paste `sketch.js` into a new sketch and press Play. Nothing else is needed.
- **Locally:** serve this folder (`python3 -m http.server`) and open `index.html`.
  The webcam needs `localhost` or `https`.

Choose **Start with HAND (webcam)** or **Start with MOUSE**. Click once first: browsers
only allow sound after a user gesture.

| Tool | Input | Effect |
|---|---|---|
| `1` Feed | click, or pinch thumb + index finger, to drop a fish | Fullness |
| `2` Play | your hand becomes a yarn ball; the cat chases and pounces | Fun |
| `3` Pet  | rest your hand slowly and still on the cat | Trust |

Fast movement near a shy cat scares it (except while playing).
Keys: `G` grow faster (demo) · `S` sound · `R` restart.

## How it is built

| Part | Technique |
|---|---|
| Behaviour | Priority-ordered state machine (FLEE → SLEEP → EAT → PETTED → SEEK_FOOD → PLAY → ASK → WANDER) |
| Movement | Reynolds steering: wander, arrive, flee |
| Input | ml5.js 1.4.0 HandPose (loaded on demand); a pinch acts as a click; mouse fallback |
| Sound | Web Audio API, everything synthesised live |
| Ending | Care statistics and a one-line relationship summary when the cat reaches adulthood |

## What this prototype taught us (input to Brief V2 / PRD V2)

These are findings from reading and playing the code, not from user research.

1. **Speed thresholds are not intent.** `PET_SPEED` / `SCARE_SPEED` turn a single smoothed
   speed into "pet" or "threat". A tracking jump or a visitor re-adjusting their hand is
   read the same way as a deliberate action.
2. **Tools can turn the cat into a button.** `tool !== 'PLAY'` exempts every fast movement
   from fear while playing, and PETTED always wins once the hand is still on the body.
3. **Trust is one number.** It rises and falls, but the visitor cannot see *which* of their
   actions moved it, and nothing about the cat's behaviour changes with history.
4. **Growth can hide neglect.** Growth uses the average of three needs, so one need can sit
   near zero while the cat keeps growing.
5. **There is no session.** Restart is a key press; nothing ends, clears or hands over to
   the next visitor.

PRD V2 (`docs/prd/prd-v2.md`) and the `v2/` slice answer each of these points.
