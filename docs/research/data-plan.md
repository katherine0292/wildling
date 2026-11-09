# Gesture dictionary and training-data plan

> **Status:** the capture page `tools/capture.html` and evaluator `tools/evaluate.mjs` are ready. Collection starts with participant recruitment. Training data never lives in this repository.

## 1 Gesture dictionary

| Label | Prompt read to the participant | Observable definition | Not |
|---|---|---|---|
| `gentle_approach` | "Open your hand and move it slowly towards the cat, then stop beside it." | A steady open hand moving slowly toward the interaction zone | Not "kindness" |
| `stable_contact` | "Rest your open hand over the cat and keep it still." | Low speed, low jitter, inside the contact zone | Not "affection" |
| `fast_approach` | "From the edge of the screen, move your hand quickly towards the cat." | A high-quality trajectory moving quickly into the close zone | Not "aggression" |
| `neutral_motion` | "Move your hand around freely, adjust your posture, or pass by far from the cat." | Ordinary movement, far away, or posture changes | — |

`unknown`, `lost` and `withdraw` are not training classes (PRD V2 §12.1).

## 2 Capture spec
- 16 consenting participants; 20 independent clips per class per person; at least 1,280 clips.
- Coverage: left and right hand, fast and slow, standing and sitting, venue lighting. Each clip records these conditions for stratified reporting.
- Each clip stores: anonymous participant code (P01–P16), conditions, label, timestamp and **palm-normalised keypoint sequence**. No video, audio or face data.
- Labels come from scripted prompts plus manual review; 20 % get a second reviewer; undecidable clips are marked ambiguous and go into the rejection stress set, not training.

## 3 Splits (no leakage)
- **By participant:** 10 train / 3 validation / 3 test. All of a person's clips and overlapping windows stay in one split.
- `tools/evaluate.mjs --check-split` checks train and test files for shared participants and exits with an error if any appear.
- Thresholds (top 0.80 / margin 0.20) are tuned on validation only; **the test set is never looked at before thresholds are chosen**.

## 4 Report format
`tools/evaluate.mjs` outputs per-class precision, recall and F1, macro F1 (`unknown` counts as a miss for the true class), a confusion matrix with an `unknown` column, coverage and per-participant results. Reported alongside: false contacts per minute (≥ 20 minutes of neutral tasks), end-to-end latency p95 and low-light results.

## 5 Data lifecycle
- Raw capture files go to `tools/captures/`, which `.gitignore` excludes; **they are never committed**.
- Research copies are deleted 30 days after handover; keeping them longer needs a new agreement.
- Capture mode and the public exhibit are visibly separate: capture is its own page (`tools/capture.html`, red banner); the exhibit stores no trajectories.
