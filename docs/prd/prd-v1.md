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
