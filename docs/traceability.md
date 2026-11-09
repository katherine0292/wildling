# Requirement traceability

One checkable chain from **client goal → my spec → acceptance case**. When requirements change, this table changes too, not just a conversation. Implementation and verification progress is in [`STATUS.md`](STATUS.md).

| Tag | Source |
|---|---|
| **[Client]** | [Brief V1](brief/brief-v1.md) / [Brief V2](brief/brief-v2.md) |
| **[Proposal]** | [PRD V1](prd/prd-v1.md) / [PRD V2](prd/prd-v2.md), my specification |
| **[To confirm]** | Trade-offs needing sign-off, listed at the bottom |

## Stage 1: Brief V1 → PRD V1

| Req. | [Client] goal | [Proposal] spec | Acceptance |
|---|---|---|---|
| B1-01 | Care builds trust | F1-01 Feed · F1-02 Play · F1-03 Pet | A1-01 |
| B1-02 | First-time visitors understand | Three tools, one-line hints, mouse fallback (§6) | A1-03, A1-10 |
| B1-03 | The creature acts on its own | F1-04 autonomy and rest; may refuse ineffective care | A1-05, A1-07 |
| B1-04 | Gentle and fast actions differ | §7 unified input and parameters; F1-05 fast approach | A1-04, A1-06 |
| B1-05 | Growth and three environments | §10 three chapters and recap | A1-01 |
| B1-06 | Visitors understand reasons | §12 state → posture → sound mapping; bubbles | A1-08, A1-10 |
| B1-07 | Presentable on its own | Browser build, mute, restart | A1-02, A1-08, A1-11 |
| B1-08 | Fits creative coding | §11 JS main loop + Processing motion replay | A1-09 |

## Stage 2: Brief V2 → PRD V2

| Req. | [Client] goal (Brief V2 §) | [Proposal] spec | Acceptance | Metric (PRD V2 §7) |
|---|---|---|---|---|
| B2-01 | Quick start for the public (§4, §5.1–5.2) | §9 journey, §10 sessions, F2-01 | AT01, AT14 | First action 8/10 within 30 s |
| B2-02 | Understand bounded actions, express uncertainty (§6.1) | F2-02 coordinates · F2-03 quality gate · F2-04 pinch · F2-05 gesture model | AT02, AT03, AT04, AT13 | Macro F1 ≥ 0.85; coverage ≥ 80 %; false contact ≤ 1/min |
| B2-03 | Character keeps choices and boundaries (§3, §5.3) | F2-06 state · F2-07 utility · F2-08–11 care and waiting | AT05, AT06, AT07 | Reason understood 8/10 |
| B2-04 | Session history shapes responses (§6.3) | F2-12 bounded memory and adaptation | AT08, AT09 | Adaptation noticed 7/10 |
| B2-05 | Explain system and character (§1, §6.2) | F2-14 reason codes · F2-15 recap | AT07, AT17 | Reason understood 8/10 |
| B2-06 | Effective care drives growth (§5.4) | F2-13 growth conditions | AT10, AT17 | — |
| B2-07 | Processing and JavaScript together (§8) | §18 architecture · F2-16 protocol | AT11, AT13 | Pointer p95 ≤ 150 ms; intent p95 ≤ 900 ms |
| B2-08 | Turnover and data clearing (§5.4, §13) | §10 sessions · F2-17 data minimisation | AT12, AT14, AT18 | 30 rounds without leakage |
| B2-09 | Accessibility and alternative input (§4) | §9.2 keyboard, mute, no-pinch path | AT01, AT15 | — |
| B2-10 | Offline, continuous venue operation (§8, §9) | §21 NFR01–02 · §22 recovery | AT16, AT18 | 4 h without crash; 2 min recovery |

## What the client asked, what I proposed, what needs sign-off

| Topic | [Client] | [Proposal] | [To confirm] |
|---|---|---|---|
| Interaction route | V1 allows both routes; V2 keeps three tools and adds waiting | Tools are **requests**, not commands; the kitten decides from needs, stress and history | Whether to reduce the tool UI once natural gestures prove reliable |
| Litter | One wild cat per visitor | Three kittens on the attract screen; the visitor chooses one, the other two stay ambient ([ADR-010](decisions/README.md#adr-010-a-litter-of-three-one-relationship)) | Approve as P0 presentation scope |
| Action understanding | Trained, evaluable classes; not single-frame speed | 600 ms window, 20 Hz resampling, 1D CNN + statistical baseline, thresholds frozen on validation | Who provides the 20 % second-review labelling |
| Behaviour model | Hard constraints + utility | 8 candidates, 250 ms decisions, inertia 0.10, switch margin 0.15, request boost 0.25 | Parameters revisited after usability testing |
| Trust | Never claims to measure the visitor | Character phrases on the main screen; exact values staff-only | — |
| Adaptation | Visible only after 3 events | Three preferences, median target, 0.8 / 0.2 smoothing, 10 s rate limit | — |
| Growth | Not farmable by holding one action | Per-need ≥ 0.20, stress ≤ 0.40, per-tool reward cap per minute | — |
| Architecture | Processing display + single Node brain | Loopback WebSocket, 30 Hz snapshots, `commandId` de-duplication | Processing runtime validated in week 1 |
| Data | No raw video stored | Anonymous normalised keypoints only; research copies deleted after 30 days | Whether anonymous statistics are recorded |
| Language | English main UI, second language switchable | All copy in one table per language; English ships | Second-language copy and sign-off of public copy |
| Devices and venue | Confirmed at kick-off | Provisional 8 GB / 720p / 1920×1080 baseline | Devices, light, age, recruitment, launch date |
