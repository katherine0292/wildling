# AI capability boundaries

Brief V2 §6.3 asks the delivery to **state clearly what is a trained model, what is a rule and what is statistical adaptation, and never let random appearance variation pass as personality learning**. This page classifies every piece of "intelligence" in the repository and gives its current state.

## At a glance

| Capability | Type | Where | State |
|---|---|---|---|
| 21 hand keypoints | **Pre-trained model** (ml5.js HandPose) | Prototypes A and B, `v2/browser/camera.js` | Integrated; on-device tuning in the validation phase |
| Tracking-quality gate (valid / uncertain / lost) | **Rule** | `v2/core/input.js` | Implemented; covered by replay tests |
| Pinch confirm (close 0.25 / release 0.45 / 100 ms / 400 ms cooldown) | **Rule** | `v2/core/input.js` `PinchDetector` | Implemented; tested |
| Short-window intent (gentle_approach / stable_contact / fast_approach / neutral_motion) | **Rule baseline today**; trained model next | `v2/core/intent.js` | Rule baseline implemented and labelled `source: "rule_baseline"`; model training is the next milestone |
| `unknown` rejection (top ≥ 0.80, margin ≥ 0.20, 2 cycles) | **Rule**; thresholds to be frozen on validation data | `v2/core/intent.js` | Implemented; applied to rule-baseline scores |
| Character decisions | **Rules** (hard constraints) + **hand-written utility functions** | `v2/core/creature.js` | Implemented; tested |
| Rhythm adaptation (contactDwell / playTempoScale / approachRadius) | **Statistical estimate** (median + smoothing + hard range) | `v2/core/memory.js` | Implemented; on/off comparison tested |
| Life with the litter (visit, wrestle, hiss, invite) | **Rules** (hiss triggers) + **hand-written utility** (`SOCIAL`) | `v2/core/creature.js`, `v2/core/sim.js` | Implemented; tested |
| Hunting and gifts | **Hand-written utility** with chapter and trust gates | `v2/core/creature.js` | Implemented; tested |
| Growth meter | **Rule gate** + **capped bursts** per completed act of care | `v2/core/growth.js` | Implemented; tested |
| Peek inside | **Display of the recorded decision trace**; no model | `v2/browser/ui.js` | Implemented |
| Kitten temperament | **Fixed starting values** per kitten, chosen by the visitor | `v2/core/config.js` `KITTENS` | Implemented; not learned, never changes rules |
| Relationship recap | **Templates** citing event IDs | `v2/core/recap.js` | Implemented |
| Prototype A utility AI | **Hand-written utility functions** | `prototypes/a-autonomous-life/cat.js` `Brain` | Prototype |
| Prototype A genetics and mutation | **Random generation** of appearance, **not learning** | `prototypes/a-autonomous-life/cat.js` `Genome` | Prototype |
| Generative recap | Language model (P2) | — | Out of P0 scope |

## How we describe it

- "Wildling sees your hand with a pre-trained keypoint model, checks with rules whether the tracking is reliable, and says 'I lost your hand' rather than punishing you."
- "The kitten trades off its needs with explainable utility scores; safety boundaries are guaranteed by hard constraints."
- "Within a visit it makes small, bounded statistical adjustments to your steady rhythm. They appear after three valid encounters and are cleared when you leave."

## What we never claim

- ✗ "The AI understands your emotions, kindness or personality." The model only outputs bounded action classes.
- ✗ "The cat learned you with machine learning." Adaptation is a statistical estimate, not online training.
- ✗ "The gesture model is xx % accurate." No ML accuracy figure is quoted until the trained model has been evaluated on held-out participants.
- ✗ "Runs locally, so no camera permission is needed." Local inference still needs browser permission.
- ✗ "Each kitten has a learned personality." Temperament is a fixed set of starting values.
- ✗ "The kittens have real social intelligence." Sibling visits are scripted; the chosen kitten's response is the same utility selection and hiss rules as everything else.

## Where the trained model plugs in

`v2/core/intent.js` exposes one contract, `scoreWindow(features) → { scores, label, score, margin }`, wrapped by the confirmation gate.
The rule baseline and the planned TensorFlow.js model return the same shape, so:
- the quality gate, rejection thresholds and CreatureCore do not change;
- `tools/evaluate.mjs` reports the same metrics for both, enabling the PRD V2 §24 comparison of old rules, new features and the trained model;
- if the model is missing or incompatible, the build falls back to the rule baseline, marks it `rule_baseline` in diagnostics and logs, and **never counts it as an ML metric**.
