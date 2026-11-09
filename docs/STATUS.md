# Delivery status

PRD V1 §18: **planned, implemented, verified and confirmed are four different states**, tracked separately.
This board records the repository's state as of 2026-11-09.

| State | Meaning |
|---|---|
| 📝 Planned | Specified in the PRD; scheduled |
| 🛠 Implemented | Runnable code in this repository |
| ✅ Verified | Reproducible evidence (replay tests or browser smoke tests), with the evidence type named |
| 🤝 Confirmed | Signed off by the project lead in review |

## P0 capabilities (PRD V2)

| Capability | Spec | State | Evidence and notes |
|---|---|---|---|
| Session lifecycle (attract → approach → calibrate → active → pause → journal → turnover) | §10 | ✅ Verified | `test/acceptance.test.mjs` AT01, AT12, AT14, idle cases |
| Litter of three, one chosen kitten, ambient siblings | ADR-010 | ✅ Verified | `test/litter.test.mjs` |
| Full mouse experience | AT01 | ✅ Verified | Replay tests + Playwright browser smoke test with no console errors |
| Full keyboard experience (no pinch) | §9.2 / AT15 | ✅ Verified | Replay tests; screen-reader review scheduled with the accessibility pass |
| Camera input with categorised permission errors | F2-01 | 🛠 Implemented | `v2/browser/camera.js`; on-device validation in the venue phase |
| Tracking-quality gate (valid / uncertain / lost) | F2-03 | ✅ Verified (replays) | `test/input.test.mjs`; real occlusion and low light in the venue phase |
| Pinch confirm and de-duplication | F2-04 / AT04 | ✅ Verified (replays) | `test/input.test.mjs`, AT04 |
| Short-window intent | F2-05 | 🛠 Rule baseline | `v2/core/intent.js`, labelled `rule_baseline`. **Trained model: 📝 planned (WP03)**; capture page and evaluator ready |
| `unknown` rejection | §12.4 | ✅ Verified (rule scores) | AT09; thresholds frozen on validation data after capture |
| Hard constraints + utility selection | F2-07 | ✅ Verified | AT05, AT06, AT07; staff panel shows candidates and reasons |
| Care and refusals (Feed / Play / Pet / Give space) | F2-08–11 | ✅ Verified | AT05–AT07; one `space_respected` per episode |
| Bounded adaptation | F2-12 | ✅ Verified | AT08, `test/adaptation.test.mjs` (on/off comparison) |
| Growth conditions (each ≥ 0.20, stress ≤ 0.40) | F2-13 | ✅ Verified | AT10 |
| Reason codes and hint priority | F2-14 | 🛠 Implemented | reasonCodes asserted in replays; hint scheduling covered in the usability study |
| Event-cited recap | F2-15 | ✅ Verified | `test/recap.test.mjs`, AT17 |
| Command de-duplication | F2-16 | ✅ Verified | AT04 (one `commandId`, one fish) |
| Data clearing at turnover | F2-17 | ✅ Verified (in memory) | AT12; camera track release checked on device in the venue phase |
| Staff diagnostics panel | §20.2 | 🛠 Implemented | Press `D`; see the README screenshot |
| Procedural kitten body (spine, IK legs, tail, coats) | ADR-011 | 🛠 Implemented | `v2/browser/catbody.js`, a display-only port of Prototype A's body; three distinct life-stage forms (ADR-013) |
| Visible growth: capped care bursts, growth meter, chapter celebrations | ADR-013 | ✅ Verified (replays) | `test/life.test.mjs`; meter readability in the usability study |
| Life with the litter: visits, wrestling, hissing, invitations | ADR-012 | ✅ Verified (replays) | `test/life.test.mjs`; whether visitors read hissing as a scolding is a study question |
| Hunting (Chapter II) and gifts (Chapter III) | ADR-012 | ✅ Verified (replays) | `test/life.test.mjs` |
| Peek inside: visitor view of the decision trace | ADR-014 | 🛠 Implemented | Press `T` during a visit |
| Toys: yarn, feather, ball | ADR-015 | ✅ Verified (replays) | `test/toys.test.mjs` |
| Siblings tool: four requests, hand shapes, bonds | ADR-017 | ✅ Verified (replays, synthetic keypoints) | `test/litter-commands.test.mjs`; recognition on real hands at venue distance is checked in WP06 |
| Tracked hand cursor, petting strokes, social animations | ADR-018 | 🛠 Implemented | Browser check with injected keypoints; real camera check on device |
| Robust hand shapes (3D, soft scores, smoothing) | ADR-022 | ✅ Verified (synthetic rotation, scale, jitter, 3D) | Real hands at venue distance in WP06 |
| First-visit tutorial | ADR-023 | 🛠 Implemented | Browser check with injected keypoints and with the mouse |
| Sound for every moment (purr, hiss, scuffle, trill, hunt, gift, tricks, growth) | §18 | 🛠 Implemented | Synthesised with Web Audio; loudness checked in the browser (purr ≈ scuffle level); venue mix in WP06 |
| Teach a trick (few-shot, nearest neighbour) | ADR-019 | ✅ Verified (replays) | `test/tricks.test.mjs`; the number of examples needed with real camera jitter is a study question |
| Passers-by on the attract screen | ADR-020 | ✅ Verified (core) · 🛠 camera | `test/tricks.test.mjs`; `?watch=demo` in the browser; BodyPose in the venue (WP06) |
| Dreams from the album | ADR-021 | 🛠 Implemented | Browser check |
| Keepsakes, album and postcard | ADR-016 | ✅ Verified (core replays) · 🛠 page | `test/toys.test.mjs` for the core rule; album, postcard and storage checked in a browser smoke test; `?kiosk=1` for the venue |
| Painted habitats, foreground depth, follow camera, light and grain | ADR-011 | 🛠 Implemented | Frame rate on the target device is checked in WP06 |
| Offline assets | AT16 | 🛠 Partly implemented | p5.js and fonts ship in `v2/vendor` and `v2/assets`; bundling ml5 and model weights is part of the offline-package milestone |
| Node.js authority + WebSocket protocol | §18–19 | 📝 Planned (WP02) | The core is already pure modules with protocol field names; the move is a transport change |
| Processing Java exhibition display | §18.3 | 📝 Planned (WP05) | — |
| 4-hour run, 30 turnovers, latency p95 | AT18, §7 | 📝 Planned (WP06) | Run on the target device |
| 10-person usability and adaptation study | §24 | 📝 Planned (WP06) | Plan in `docs/research/` |

Every 🤝 column entry is pending the project lead's review of PRD V2.

## Tuning notes for review

| Item | PRD | Build | Why |
|---|---|---|---|
| REST utility curve | 0.10 + 0.90 × (1 − energy) | 0.10 + 0.90 × (1 − energy)² | The linear curve beat exploring at energy ≈ 0.6, so the kitten napped too often; to confirm after usability testing |
| Idle behaviour switching | +0.10 inertia; new behaviour needs +0.15 | Idle behaviours (explore, observe, groom) re-choose freely when a bout ends | Otherwise grooming almost never appears and the character feels mechanical |
| Lead-in to contact | Same switching margin | APPROACH → CONTACT is not held back by the margin | Contact is the natural continuation of approaching; hard constraints still apply |
| Scare response | Utility candidate | A confirmed close fast approach triggers a short hard retreat, shortened by trust | Matches §13.2 "close-range stress protection" in the constraint layer |
| Growth rate | (1/80) × (1 + 0.25 × trust) per second | Drift 1/150 per second plus capped bursts per act of care | Makes progress visible and tied to care; see ADR-013, to confirm in review |
| Chapter transition | 1.5 s | 4 s with a title card | Gives the change of form time to land; to confirm in review |
| Second language | Switchable at the venue | English ships; copy tables ready for a second language | Public copy and language set to be signed off by the project lead |

## Run the tests

```bash
npm test
```

All replay tests pass on Node 22 (CI: `.github/workflows/test.yml`).
