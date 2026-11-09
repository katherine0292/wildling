# Wildling: Product Requirements Document V2

> Submitted to the project lead · AI interaction upgrade and implementation plan · Responds to [Brief V2](../brief/brief-v2.md)
> Date 2026-10-16 · Status: submitted for review · PDF [`pdf/prd-v2.pdf`](pdf/prd-v2.pdf)
> Continues the product claim of [PRD V1](prd-v1.md) and, within this round's scope, replaces its behaviour, input and technical specs.
>
> Source tags as in V1: **[Client]** project lead's requirement · **[Proposal]** my proposal · **[To confirm]** trade-off needing sign-off.
> New figures are targets for acceptance testing. Implementation progress is tracked in [`../STATUS.md`](../STATUS.md).

**In one sentence:** I propose turning Wildling into a public interactive experience that reliably understands a small set of actions, expresses the character's choices, and adapts within limits during the session. The priority is solving visitors' inability to tell **"the system didn't see clearly"** from **"the character doesn't want this right now"**, then turning shared history into behaviour changes people can notice and verify.

---

## 1 My assessment [Proposal]

Round one asked "can visitors understand care and relationship?". The new brief asks: **when the system recognises, refuses and adapts, can visitors understand and trust that response?** I keep the clarity that the tools gave, but turn tools from commands into **requests**, so that input evidence, the character's needs and this session's history decide the response together.

My assessment comes from analysing both prototypes against the new brief. The usability study in §24 validates it.

| Observed issue (source) | Experience consequence |
|---|---|
| Prototype B separates petting from threat with a single smoothed speed threshold | Jumps, posture changes and passers-by are read as intent |
| Prototype B's `tool !== 'PLAY'` exempts all stress handling | A tool becomes a "press to obey" switch |
| Both prototypes keep trust as one running number | Visitors cannot say which action changed the relationship |
| Prototype B grows on the average of three needs | Long-term neglect of one need is hidden by the average |
| Neither prototype has a session | No visitor turnover; one visitor's relationship leaks into the next |

**Core hypotheses for this round:**
1. Clearly showing recognition state reduces visitor self-blame and repeated wrong actions.
2. Refusals with a path to recovery strengthen the character's autonomy.
3. A small rhythm adaptation formed by three or more valid encounters conveys the relationship better than a single trust bar.

**[Proposal]** P0 is a 3–5 minute single-visitor experience with a Processing Java exhibition display and JavaScript for perception and the single authoritative logic. A bounded gesture model is genuinely trained and evaluated, alongside explainable rules and statistical adaptation. Generative language, multiple visitors, full ecology and generations are not prerequisites for this round.

## 2 Changes from PRD V1 [Proposal]

| Dimension | PRD V1 | PRD V2 |
|---|---|---|
| Validation focus | Understanding care and growth | Understanding recognition state, character boundaries and bounded adaptation |
| Input understanding | Position, distance, speed and dwell rules | Hand-shape and temporal features, a trained classifier, quality gating and rejection |
| Character choice | Priority state machine | Hard constraints + utility selection; **tools are requests** |
| Needs and relationship | Four needs and session trust | Adds stress; separates physical needs, relationship and input reliability |
| Memory | Care counts and short-term trust | Verifiable semantic events, preference summaries and bounded updates |
| Growth | Average of needs crosses a threshold | Adds per-need minimums and a stress condition; caps repeated rewards |
| Explanation | Bubbles and need bars | System reasons and character reasons shown separately; recap cites events |
| Alternative input | Full mouse experience | Full mouse and keyboard experience, no pinch required |
| Processing role | Visual and motion replay study | Exhibition display connected to live authoritative state |
| Operation | Manually started and reset demo | Sessions, exits, auto-turnover, disconnect recovery and operations |
| Evidence | Small experience test and prototype demo | Held-out model testing, adaptation comparison, 4-hour and 30-round runs |

The table shows how the plan progresses. Work not finished in the first stage is counted as work for this stage, not as an existing capability.

## 3 Key design decisions [Proposal]

### 3.1 Find out where misunderstanding comes from
Separate **input evidence, intent and character decision** into three layers. Seeing a hand is not knowing what it wants; knowing the action is not the character agreeing to it. Binding all three together makes technical faults look like the character's mood and makes refusals inconsistent. Every "no response" therefore has a checkable cause:

| Cause layer | Example | Feedback | Affects relationship? |
|---|---|---|---|
| The system did not see clearly | Lost hand, occlusion, jump | Cursor and tracking cue | **No** |
| The action is not clear yet | Classifier score too low | "Hold still for a moment." | No |
| Character boundary | Tired, full, stressed | Posture + a short line | No (refusals are free) |

Only the last belongs to the character. This is my main answer to the AI product trust problem.

### 3.2 Keep the tools to reduce inference risk
Fully natural interaction is more immersive, but in a short public session it is hard to tell whether a visitor is adjusting posture or offering care. Tools give the model clear context, so it only needs to judge the quality of a few actions. Visitors need not memorise many gestures, and no single hand shape becomes everyone's only input. If research later shows natural interaction is reliable enough, the tool UI can be reduced step by step.

### 3.3 Protect autonomy with a hybrid behaviour system
Exhaustion, high stress and invalid input are handled by **hard constraints**, not probabilistic output. Trade-offs between several reasonable needs use **utility scoring**. The same action can get different responses in different states, but the same valid evidence never gets an unexplained random penalty. Every choice records its candidates, blocked conditions, inertia and final reason, so it can be replayed and discussed.

### 3.4 Remember a few verifiable facts
No cross-visitor long-term profiles in a short exhibition. P0 keeps only this session's semantic events and a few rhythm preferences, cleared at the end. Adaptation uses **bounded statistical updates**, not online neural training. The model recognises actions, rules hold character boundaries, statistics drive bounded adaptation, and the deliverables describe each separately (see [AI capability boundaries](../ai-boundaries.md)).

### 3.5 Put explainability into the body and feedback
Live utility scores stay off the public screen. Visitors need to know "it's tired" or "the system lost your hand", not algorithm parameters. The main screen uses posture and short hints; the staff view keeps exact state and scores. The recap chooses lines from real semantic events, so the character never describes time together that did not happen. Free chat and generative stories are deferred: they cannot prove that body-based interaction is reliable, and they add content and latency risk.

### 3.6 One character state across two languages
Processing Java becomes the exhibition display but does not get its own copy of the brain. The browser handles camera and model; a local JavaScript service owns needs, utility, memory and sessions; Java and the browser show the same state. This adds protocol and connection work but removes the risk of the two clients disagreeing on trust, growth or contact zones. It also keeps the browser as a backup display and lets one anonymous replay separate interaction issues from rendering issues.

## 4 Requirement sources and acceptance tracking

**[Client]** goals define the problems this round must solve; **[Proposal]** the parameters, model, feedback and route are mine. Changes update this table and the acceptance cases, not just a chat thread. Full matrix: [`../traceability.md`](../traceability.md).

| ID | [Client] Brief V2 goal | [Proposal] Spec and evidence |
|---|---|---|
| B2-01 | Visitors get started quickly | Sessions and guidance; 10-person first-action test |
| B2-02 | Understand bounded actions and express uncertainty | F2-01–05; held-out-participant model evaluation and false-trigger report |
| B2-03 | The character keeps its choices and boundaries | F2-06–11; tired, full, stressed and recovery cases |
| B2-04 | This session's history shapes responses | F2-12; adaptation on/off replay and counterbalanced study |
| B2-05 | Explain system and character behaviour | F2-14–15; reason codes and recap fact checks |
| B2-06 | Effective care drives three-chapter growth | F2-13; boundary tests for average versus per-need minimum |
| B2-07 | Processing and JavaScript work together | Two-client architecture and F2-16; disconnect and state-consistency tests |
| B2-08 | Single-visitor turnover and data clearing | Sessions and F2-17; 30 rounds with no leakage and camera release |
| B2-09 | Accessibility and alternative input | Full mouse and keyboard flow, mute, no-pinch acceptance |
| B2-10 | Offline and continuous venue operation | Performance and operations spec; offline start and 4-hour test |

## 5 My role and how I work

- **I own:** requirement clarification, product structure, AI interaction logic, interface and motion feedback, model features and training pipeline, the JavaScript core, Processing display integration, sound, testing and delivery notes. "Must" in this document describes product behaviour both sides intend to adopt; "I own" describes work I intend to take on.
- **[Client] The project lead owns:** curatorial direction, venue and devices, final public copy, scope decisions and phase acceptance, plus test recruitment and venue conditions.
- **[To confirm]** A second reviewer for 20 % of training labels needs a collaborator arranged by the project lead or agreed separately.
- I build the replayable mouse loop first, then perception and adaptation, then the Processing main display and venue integration. Adding multiple visitors, accounts, long-term memory, full ecology or generative services starts with a statement of extra work and acceptance changes.

---

## 6 Scope and tiers

**[Proposal]** Positioning: an **explainable AI virtual-life experience in which relationships are built through body movement**. Three core values: reliably perceiving the bounded action a visitor is making; choosing a fitting response from the character's needs; and turning this session's history into small, observable, resettable preferences. Open dialogue and general intelligence are not part of the core value.

| Tier | Scope |
|---|---|
| **P0** | Single-visitor session; attract and start; input choice and camera notice; light calibration; Feed, Play, Pet and wait; autonomous exploring, rest and grooming; three-chapter growth; gesture classification with `unknown`; character state, utility selection, stress and trust; bounded in-session adaptation; reason feedback; early exit; relationship recap; auto-turnover; staff diagnostics; offline package; Processing exhibition display; browser backup display; operating and test docs |
| **P1** | Full IK body, hunting subsystem, genetic coats, elders and next generation, long observation mode, opt-in anonymous profile |
| **P2** | Constrained generative text, multi-visitor play, more complex online learning. Off by default; P0 must never depend on the network or an account through a hidden dependency |
| **Out** | Real emotion or personality judgement; face recognition, age estimation or identity tracking; medical or animal-care advice; accounts, social and payments; cloud raw-video analysis |

## 7 Success metrics and how they are measured

**[Client]** thresholds come from Brief V2 §9; **[Proposal]** the measurement details, including coverage, are mine.

| Metric | Target | Measurement |
|---|---|---|
| First effective action | At least 8 of 10 first-time participants within 30 s | Timed from input choice to being able to act; excludes first-time system setup; no verbal teaching |
| Reason understood | At least 8 correctly explain one acceptance or refusal | After the session ask "why didn't it keep playing just now?" and compare with the reasonCode |
| Adaptation noticed | At least 7 name a specific adaptation and its event | "It likes me more" does not count; must mention dwell, tempo or distance |
| Gesture classification | Macro F1 ≥ 0.85 on held-out participants | Four known classes; `unknown` counts as a miss for the true class; confusion matrix reported |
| Classification coverage | ≥ 80 % of known-action windows get a confident class under standard conditions | Prevents "refuse everything" from looking accurate |
| False contact | ≤ 1 false contact per minute in no-contact tasks | At least 20 minutes of neutral movement and posture adjustment |
| Unfair penalty | Zero trust loss from invalid tracking | 30 replayed occlusion, lost-hand and jump cases, state and reason compared one by one |
| Pointer response | Sample to on-screen feedback p95 ≤ 150 ms | On target device, high-frame-rate video or timestamp loop-back |
| Intent response | Action start to confirmation feedback p95 ≤ 900 ms | Includes the 600 ms observation window, not only model inference time |
| Run and turnover | 4 hours without a crash; 30 rounds without leakage | Logs build, model, device, temperature and mode |

These sample sizes are prototype-evaluation scale. Low light, backlight, skin tones, hand shapes, left and right hands and sitting are recorded separately; under-sampled conditions are listed as limits. Launch readiness is judged in the target venue, not by one high accuracy figure.

## 8 Users and key situations [Proposal]

| User | Need | Design answer |
|---|---|---|
| U01 First-time visitor | Know immediately how to start | One clear main action, alternative inputs and an instant cursor |
| U02 Cautious or small movements | Not be wrongly penalised | Scale normalisation, calibration, a wider valid range and `unknown` |
| U03 No camera or cannot pinch | Complete the full experience | Mouse and keyboard enter the same decision logic without a worse ending |
| U04 Bystander | Understand what happened | The main screen shows choices through posture and one line |
| U05 Staff | Start, diagnose and recover | Diagnostics show input, model, connection and session; switch modes and reset |

**Key stories:**
- **US01** When I approach slowly, it sees me, but when it's tense it watches first.
- **US02** It's tired and turns down play; I step back, it rests and relaxes.
- **US03** After my hand is occluded I can carry on without losing relationship progress to a system error.
- **US04** After a few encounters it responds faster to my steady rhythm.
- **US05** When I leave, the next person sees a separate new round.

## 9 Journey and interface structure [Proposal]

| Stage | Visitor | Main screen | System |
|---|---|---|---|
| Attract | Watches or passes | The litter living on its own, with an entry point | Demo world with no relationship memory and no formal growth |
| Choose | Picks hand or alternative input | Camera purpose, input options, mute | New session, initial configuration |
| Calibrate | Puts a hand in the guide and moves | Tracking outline, reach, skip | Checks quality and hand mapping |
| Explore | Chooses a tool and tries | Character, tools, short hints, need cues | Classifies actions and chooses behaviour |
| Adjust | Accepts a refusal, slows down or steps back | Posture and a specific reason | Stress recovers; memory updates from valid events |
| Grow | Keeps caring and watching | Chapter transitions and changing appearance | Checks growth conditions and switches environment |
| End | Ends or accepts the close | Event-based relationship recap | Closes input, prepares to destroy session data |
| Turnover | Next visitor gets ready | Back to start | Clears state, cache, audio and session ID |

### 9.1 Visitor screen
- The character and world in the centre; Feed, Play, Pet and "Give space" at the bottom; current input and readable tracking state in a corner; key reasons shown near the character.
- Reachable, safe-distance or contact areas use **shape and words**, never colour alone.
- **Trust is not a percentage reward.** P0 uses character phrases such as "Still watching you", "Warming up to you" and "Comes to you"; exact values are staff-only, which also discourages grinding.

### 9.2 Alternative input and keyboard
- Mouse to move and click to confirm; `1` `2` `3` `4` to choose a tool; arrow keys move a virtual hand; Space confirms or drops; holding Space with Pet means steady contact; `Esc` pauses with continue, switch input and end.
- Alternative inputs produce explicit intent with `source` = `mouse` or `keyboard`, and **never fake camera model scores**.
- Focus order and button states are visible. Pinch is never the only way to start or leave. The camera preview stays in the control view and can be turned off; the public screen shows an abstract hand rather than the visitor's image.

## 10 Session state machine [Proposal]

```mermaid
stateDiagram-v2
    [*] --> ATTRACT
    ATTRACT --> CONSENT: visitor starts
    CONSENT --> CALIBRATING: chooses hand
    CONSENT --> ACTIVE: chooses mouse / keyboard
    CALIBRATING --> ACTIVE: tracking stable (≤ 20 s)
    CALIBRATING --> CONSENT: fails → retry or switch
    ACTIVE --> PAUSED: Esc / hidden page / idle 30 s / system fault
    PAUSED --> ACTIVE: explicit resume with stable input
    PAUSED --> REFLECTION: paused > 60 s or ended
    ACTIVE --> REFLECTION: ended / 300 s limit / growth complete / idle 45 s
    REFLECTION --> RESETTING: 15 s or "Next visitor"
    RESETTING --> ATTRACT: camera stopped, cache and state cleared
```

| State | Enters when | Allows | Leaves when |
|---|---|---|---|
| ATTRACT | Start-up or turnover complete | Independent demo loop, waiting | Explicit start → CONSENT |
| CONSENT | Visitor starts | Choose camera or alternative input | Hand → CALIBRATING; alternative → ACTIVE |
| CALIBRATING | Hand chosen | Quality check, position demo, ≤ 20 s | Stable → ACTIVE; failure → retry or switch |
| ACTIVE | Input usable and round started | Formal behaviour, memory, growth | Pause, end, idle or time limit |
| PAUSED | User pause, hidden page or fault | Show the reason; formal state frozen | Explicit resume with re-stabilised input, or end |
| REFLECTION | User ends, 300 s limit or growth complete | Show recap; contact and growth stop | 15 s or "Next visitor" → RESETTING |
| RESETTING | Close finished | Stop camera, clear cache and state | Clearing confirmed → ATTRACT |

- The clock starts in ACTIVE. A pause longer than 60 s goes to REFLECTION. At 180 s an ending option appears; at 300 s the recap starts automatically. **Not every round needs to reach adulthood.**
- Idle = no valid input and no clicks: "Still there?" at 15 s, a pause prompt at 30 s, the recap at 45 s. A lost camera hand does not end the round at once; a mouse resting on screen is not activity.
- **ATTRACT never shares the ACTIVE character instance or memory.** A pause freezes needs, trust, stress, growth and active time; rendering can keep a breathing animation. While disconnected, no actions, feeding or adaptation events accumulate.

---
