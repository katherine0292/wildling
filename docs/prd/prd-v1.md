# Wildling: Product Requirements Document V1

> Submitted to the project lead · Product, interaction design and implementation plan · Responds to [Brief V1](../brief/brief-v1.md)
> Date 2026-10-09 · Status: submitted for review · PDF [`pdf/prd-v1.pdf`](pdf/prd-v1.pdf)
>
> **V1 and V2 are requirement stages**, not code versions. The code explorations are Prototype A (repository root)
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
