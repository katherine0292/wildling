# Wildling: Product Requirements Document V1

> Submitted to the project lead · Product, interaction design and implementation plan · Responds to [Brief V1](../brief/brief-v1.md)
> Date 2026-10-09 · Status: submitted for review · PDF [`pdf/prd-v1.pdf`](pdf/prd-v1.pdf)
>
> **V1 and V2 are requirement stages**, not code versions. The code explorations are Prototype A (`prototypes/a-autonomous-life/`)
> and Prototype B (`prototypes/b-care-tools/`). Features, parameters and acceptance targets become the development
> baseline after review.

### Source tags

| Tag | Meaning | Who decides |
|---|---|---|
| **[Client]** | A goal, boundary or requirement the project lead set in the brief | Project lead |
| **[Proposal]** | A product, interaction, parameter or technical decision I propose | I propose; aligned in review |
| **[To confirm]** | A trade-off affecting scope, schedule or experience that both sides must confirm before it enters the baseline | Both |

---

## 1 My reading of the brief

**[Client]** An interactive piece on "how care builds trust" that is understandable, alive, relational and presentable on its own.

**[Proposal]** Visitors need to feel two things at once: "its response is about what I did", and "it does not revolve around me". The product therefore needs **understandable input, legible needs and a degree of autonomy**.

The biggest design risk runs in two opposite directions:
- the character looks rich, but visitors do not know what they can do;
- the controls are clear, but the character feels like an animation answering buttons.

Explicit tools lower the first-time learning cost; rest, fullness and approach boundaries keep the character's own rhythm. I **do not recommend** delivering the full ecology, generations and complex skeleton in round one. They add atmosphere but do not prove the core relationship works. Success for round one: a visitor completes one effective act of care, reads one autonomous choice, and understands one growth change.

## 2 Product claim and design hypotheses

**[Client]** The product claim is "how care builds trust".

**[Proposal]** Three kinds of care map to fullness, fun and trust; rest maps to energy; growth marks time spent together. These are hypotheses to validate, not conclusions:

| ID | Hypothesis | How it is tested |
|---|---|---|
| H1 | Explicit tool entry points are easier for first-time visitors than relying only on natural gestures | Feed, Play and Pet entry points; first-visit usability test (A1-10) |
| H2 | Visitors read the relationship through distance, ear and tail posture and sound; meters only support | Build state expression before fur, lighting and props |
| H3 | A refusal that has a reason and recovers quickly does not break the experience, and may make the creature feel more alive | First-visit observation |
| H4 | Three environments help visitors read growth; a full life cycle is not needed for a satisfying close | Show a care recap at adulthood; elders, breeding and genetics later |

## 3 From brief to product

The B1 IDs are mine, added for traceability.

| ID | [Client] Brief goal | [Proposal] Product response |
|---|---|---|
| B1-01 | Care builds trust | A clear causal chain from tool to need to relationship feedback |
| B1-02 | First-time visitors understand | Three visible tools, mouse fallback, one-line instant hints |
| B1-03 | The creature acts on its own | Autonomous exploring, expressing needs and resting; allowed to refuse ineffective care |
| B1-04 | Gentle and fast actions get different responses | Position, distance and speed rules with smoothing and valid-input checks |
| B1-05 | Growth and three environments are visible | Kitten, juvenile and adult chapters with transitions and a recap |
| B1-06 | Visitors understand the reasons for behaviour | Body language plus short bubbles; developer view shows state and needs |
| B1-07 | Presentable on its own | Browser build, real camera test, mute and restart |
| B1-08 | Fits creative coding | JavaScript runs the interaction; Processing Java validates visual and motion rules |

## 4 Users and setting

- **[Client]** First-time members of the public, one operator per round with others watching, on a computer with a webcam, mouse and speakers.
- **[Proposal]** Target display range 1280×720 to 1920×1080.
- **[Proposal]** About 3–5 minutes per round as the prototype's rhythm target. Visitors can end before growth completes; speed is not a success measure.
- **[Proposal]** Round one is a demonstrable prototype. Unattended all-day operation, multi-visitor control and arbitrary lighting are later-stage goals.
- **[To confirm]** Actual devices, display size, and left/right hand and sitting/standing test conditions.

## 5 Scope and route choice

### 5.1 In scope for this round [Proposal]
Start and input choice; camera hand position and pinch confirm; mouse fallback; Feed, Play and Pet; fullness, fun, energy and trust; autonomous exploring and rest; avoidance of fast close approaches; three-chapter growth; state hints, sound and mute; care recap and restart; source code, run notes and demo material.

Processing Java delivers a runnable **visual and motion study** this round, replaying the same parameters and anonymous state. The interactive prototype is browser-first. Wiring live perception into Processing and the exhibition main screen is the next stage.

### 5.2 Deferred [Proposal]
Autonomous hunting, full prey ecology, eight-joint spine and two-bone IK, genetics, elders and rebirth, persistent profiles, a newly trained gesture model, open dialogue and cloud generation. Prototype A's systems are research material for these later stages.

### 5.3 Three routes compared [Proposal]

| Route | Strength | Trade-off |
|---|---|---|
| Natural gestures + autonomous ecology (Prototype A) | Minimal UI, strong sense of observation | Higher barrier for first-timers; not chosen for round one |
| **Three tools + visible needs (Prototype B)** | Easy to understand; care causality is testable | **Chosen as the main route**, with autonomous rest to avoid feeling mechanical |
| Free conversation | Expresses personality easily | Adds latency and content scope without solving action understanding; deferred |

The cost of the chosen route is that visitors switch tools. My answer: **the tool states what the visitor is about to do; the character's state decides whether it accepts.** No button is a guaranteed command.

## 6 Experience flow and interface [Proposal]

1. **Entry:** a short introduction and two choices, camera or mouse. Camera permission is requested only after choosing the camera; the mouse path loads no hand model. First entry shows only the current tool and one line of guidance.
2. **During:** observe its needs, choose a kind of care, adjust to body language and bubbles. With low energy it rests; when full it refuses food; with low trust it keeps more distance. With basic care met, body and environment change.
3. **Close:** at adulthood or on request, show effective feeding, play and contact counts and a line about the relationship. The line comes from fixed rules, **with no generative text and no moral judgement of the visitor**.

Layout: the character and world in the centre; three tools at the bottom; stage and needs top-left; input status and mute top-right; short bubbles near the character. Meters show relative change; exact values are for the developer view.

**[To confirm]** Public copy in English ("Hold still to pet", "I'm full", "I need a nap"), with a second language in a separate copy file. Whether a formal language switch ships is confirmed at kick-off.

## 7 Input and interaction spec [Proposal]

### 7.1 One input object
Camera and mouse produce one object: `source, x, y, present, speed, confirm, timestamp`. Character logic reads only this object, so mouse and camera never have two sets of care rules.

- Positions use content coordinates 0–1; speed uses **S/s** (short screen side per second); mirroring happens once, at input.
- Hand keypoints not updated for 300 ms count as lost and stop counting contact.
- Speed resets when a hand first appears or the input switches, so jumping in from an invalid position is never read as a scare. **A tracking jump is a system issue and never costs trust.**

### 7.2 Rules and starting parameters

| Item | Start value | Meaning and validation |
|---|---|---|
| Pinch close ratio | thumb–index gap / palm size < 0.25 | One confirm; validate with real hands |
| Pinch release ratio | > 0.45 | Hysteresis prevents repeats |
| Confirm cooldown | 400 ms | A held pinch confirms once |
| Gentle movement reference | < 0.40 S/s | Combined with tool, distance and dwell for contact |
| Fast close reference | > 1.10 S/s and < 0.18 S from the cat | Only valid trajectories count toward alarm |
| Contact dwell | 600 ms | Passing over the body does not start petting |

These are starting values to tune, not measured optima. Hand shape is used only for pinch and keypoint validity this round; "open hand means petting" is guidance only. Understanding hand shape is the research question for the next stage. Toolbar hits take priority over the scene.

## 8 Feature spec [Proposal]

| ID | Feature | Rule | Boundaries and anti-farming |
|---|---|---|---|
| F1-01 | Feed | Up to 3 fish on the ground; the cat seeks the nearest when fullness < 0.85, eats for 1.2 s; on completion fullness +0.25, trust +0.025 | At fullness ≥ 0.85 it refuses without affecting trust; the recap counts fish *eaten*, not dropped; uneaten fish fade after 30 s |
| F1-02 | Play | With energy > 0.30 it chases; reaching the toy is one pounce: fun +0.12, energy −0.04, trust +0.01 | At least 1.5 s between pounces, never per frame; moving the toy away costs nothing |
| F1-03 | Pet | Slow dwell of 600 ms on the body requests contact; accepted when not asleep, not startled and fullness ≥ 0.20; trust +0.02 per second | At most 6 s per contact, then a pause and reposition; a lost hand stops the timer; a refusal costs no trust |
| F1-04 | Observe and autonomy | Without care it explores, pauses, signals hunger or grooms; at energy < 0.15 it rests until 0.65 | No death from neglect; no guilt-inducing copy |
| F1-05 | Fast approach | Low trust + a valid close trajectory + speed condition → a brief retreat; the first time only shows alertness | Only 2 s of sustained valid scaring may reduce trust a little, at most 0.05 per episode; lost hands, jumps, input switches and the first recovered frame never count |

## 9 Needs model and behaviour selection [Proposal]

- Starting values: fullness 0.55, fun 0.50, energy 0.80, trust 0.25, all clamped to 0–1.
- Decay: fullness −0.004/s, fun −0.003/s, energy −0.003/s; resting +0.035/s. All in real seconds, independent of frame rate.
- **Priority state machine:** pause and end first, then valid scare, needed rest, finishing a meal, urgent hunger, valid contact, seeking food, play, low-need hints and autonomous exploring. States hold a minimum duration so bubbles and posture never flicker within a second.

> **Why a state machine, not Prototype A's utility AI, for round one?** With few behaviours, causality and readability come first. Utility AI suits later stages where many needs compete. Round one does not need a decision system visitors cannot read just to look "more AI". Machine learning is used for HandPose keypoints; character decisions are explainable rules. ([ADR-002](../decisions/README.md#adr-002-a-priority-state-machine-for-round-one))

## 10 Growth and recap [Proposal]

- Wellbeing = mean(fullness, fun, energy). Growth advances when wellbeing > 0.50, at 1/80 per second × (1 + 0.25 × trust). 0–1 kitten in the jungle, 1–2 juvenile in the snowfields, 2–3 adult in the desert; transitions take about 1.5 s.
- **Known risk:** an average can hide one need being very low. Replays and tests check for this; if "one need is very low but it still grows" appears, the next round adds a per-need minimum (adopted in PRD V2 F2-13).
- The recap shows effective feeds, successful pounces, accepted contact time and one relationship line. With no successful care, a neutral close: "We shared a quiet moment."
- Speed-up exists only in an explicit Demo mode with an on-screen label; it is disabled in real sessions and testing.

## 11 AI and technical approach [Proposal]

- JavaScript and p5.js run the main loop; ml5.js HandPose provides keypoints (loaded only when the camera is chosen); Web Audio synthesises all sound; camera failure switches to the mouse immediately.
- Processing Java is a separate motion and visual study: PVector movement, turning, tail, gait and rest pose, replaying anonymous synthetic state JSON. **It runs no second set of needs or growth.**
- Modules: InputAdapter, CreatureState, BehaviourController, WorldView, SoundAdapter, SessionController and UI, with parameters and copy kept separately.
- At least one event replay is kept: input, behaviour changes, effective care and state changes. It is the baseline for moving to an authoritative core next stage.

## 12 Design expression and accessibility [Proposal]

- Each of explore, eat, chase, contact, retreat and rest has defined motion, posture, text and sound: contact = closed eyes or relaxed tail + purr; retreat = backing away + ears + a short hint; rest = curling up + slower breathing. **All key states stay readable with sound off.**
- Tools have selected states and text labels, not icons alone; danger and success never rely on red and green.
- **[To confirm]** The mouse is the full alternative input this round. Keyboard control, a no-pinch path and complete focus navigation are next-round accessibility work; if required in round one, they are added to scope with test time.

## 13 Testing and acceptance

**[Proposal]** These targets are my proposal for review.

| ID | Scenario | Pass condition |
|---|---|---|
| A1-01 | Full mouse session | Choose tools, care, rest, pass three chapters and restart |
| A1-02 | Real camera | Position mapping, pinch and contact on the target device, live |
| A1-03 | Camera declined | Choose the mouse directly; nothing locks up |
| A1-04 | Repeated pinch and toolbar clicks | One pinch confirms once; tool clicks never drop food |
| A1-05 | Full and tired | Refuses food and rests for matching reasons, then recovers |
| A1-06 | Lost hand or jump during contact | Timer stops, no trust lost, no scare on the first recovered frame |
| A1-07 | Watching only | Autonomous behaviour continues without clicks |
| A1-08 | Mute and restart | Key feedback still readable; all relationship and care stats reset |
| A1-09 | Processing motion replay | The same state reproduces the same pose, with no second relationship logic |
| A1-10 | First usability test | At least 4 of 5 complete an effective act of care within 30 s and explain one piece of feedback |
| A1-11 | Continuous demo | 30 minutes and 5 restarts on the target device without blocking errors |

Builds, devices, parameters, observed issues and before/after changes are logged.

## 14 Responsibilities

- **I own:** turning the brief into a product plan, interaction flow, interface and motion-feedback spec; building the browser prototype, the Processing study, sound, state logic and demo package; agreed testing, fixes and delivery documentation.
- **[Client] The project lead owns:** theme, main setting, devices, public copy, scope and phase acceptance, and support with venue conditions and test recruitment.
- Review aligns key scope; not every visual detail is locked up front. Parameters and local interactions are updated after prototype testing. New features, multi-visitor support or a full Processing main screen are scheduled separately.

## 15 Plan and deliverables [Proposal]

About 14–18 working days over 3–4 weeks, reusing existing prototype material, including small-scale testing and revision. Large new visual assets, model training and unattended venue delivery are outside this stage.

| Checkpoint | Content |
|---|---|
| CP1 Input and state skeleton | Mouse loop, camera mapping and simple poses |
| CP2 Playable | Three kinds of care, refusal and recovery, three chapters and recap |
| CP3 Delivery | Processing replay, user testing, run notes and demo material |

Deliverables: product and interaction notes, interface and motion-feedback spec, browser source and build, Processing study and replay data, parameter and copy configuration, test and issue log, run notes and a 60–90 s demo video. Reused code and third-party resources are credited with their scope of change.

## 16 Decisions for the project lead [To confirm]

| ID | Decision | My recommendation | If not confirmed |
|---|---|---|---|
| Q1 | A short session built on "three tools + autonomous rest", or keep full autonomous hunting and life cycle | The former; the latter as a later observation mode | Hunting and generations in round one need a separate estimate |
| Q2 | Accept the browser as the main prototype and Processing as a visual and motion study | Accept | A Processing public screen in round one adds communication and dual-client integration |
| Q3 | Accept ~3–5 minutes and an adulthood recap; English main UI with a second language; when devices, venue conditions and testers are available | Accept; English UI with copy in config | Affects copy and test schedule |

Until Q1 and Q2 are confirmed, only reversible input validation and low-fidelity design proceed.

## 17 Triggers for the next iteration [Proposal]

| If we observe | The next round should |
|---|---|
| Gestures often don't match intent | Add temporal features, quality gating and an evaluated gesture classifier |
| Visitors watch the trust bar instead of the character | Strengthen body language, reasons and refusals |
| Interaction feels like grinding tasks | Introduce event memory and bounded rhythm adaptation |
| The piece goes to a public exhibition | Full start, pause, exit, end and turnover rules; staff diagnostics; offline package; Processing main display; repeated long runs |

These become inputs to Brief V2 and PRD V2.

## 18 References and document control

- Requirements: [Brief V1](../brief/brief-v1.md). Technical material: Prototype A (`prototypes/a-autonomous-life/`) and Prototype B (`prototypes/b-care-tools/`).
- Technical references: p5.js, ml5.js, Processing reference, MDN getUserMedia. Dependency versions are pinned after verification.
- **Planned, implemented, verified and confirmed are four different states**, tracked separately in [`../STATUS.md`](../STATUS.md).
