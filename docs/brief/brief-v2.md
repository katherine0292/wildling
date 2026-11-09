# Wildling: Project Brief V2

> **Issued by:** Project lead · Sydney game and interaction exhibition · AI interaction and product experience upgrade
> **PDF:** [`pdf/brief-v2.pdf`](pdf/brief-v2.pdf)
> **Note:** Everything in this document is a requirement or boundary set by the project lead.
> My analysis, proposals and trade-offs are in [`../prd/prd-v2.md`](../prd/prd-v2.md).

We want Wildling to become an AI interactive piece that runs on its own in a small public exhibition. Visitors build a short relationship with a virtual wild cat through hand gestures. The system must **understand observable actions, express uncertainty, and adjust its responses to what happened in this session**. The finished piece should help visitors understand that building trust takes observation, response and respect for the other's rhythm.

## 1 Background

We have seen two prototypes with clear directions. One offers autonomous hunting, utility-based decisions, a procedural body and a life cycle, and suits continuous viewing. The other offers three clear tools (Feed, Play and Pet) and an end-of-growth summary, and suits first-time participants.

This round is not about adding scenes or giving the cat a chat box. We want the effective parts of both prototypes merged into one reliable AI experience. **Visitors should know whether the system sees them, how their action was understood, and why the cat accepts, hesitates or refuses.**

## 2 Problems to solve

1. The current experience reads "the hand moves slowly" as petting and "the hand moves fast" as threat or play. That cannot handle occlusion, tracking jumps, posture adjustments, different people's movement ranges, or someone just passing by.
2. Tool selection lowers the cost of understanding but risks turning the cat into something that must obey whenever a button is pressed.
3. Trust is a single number that goes up and down. Visitors cannot tell how it relates to what they did. We need a **limited memory built from observable events**, so the cat develops a **bounded adaptation** to the interaction rhythms that worked, and shows that adaptation in its behaviour.
4. The venue needs strangers to get started fast, visitor turnover, continued operation when a model fails to load, and recovery by staff when something goes wrong. The piece must move from a laptop demo to a deliverable, maintainable interactive product.

## 3 Curatorial theme and stance

- Proposed theme: **"Learning each other's distance."** Wildling is a virtual actor with a physical state, attention and boundaries of its own. The visitor's goal is to find a way of being together that suits the moment, not to fill a trust bar as fast as possible.
- Four moments we want visitors to feel: being seen for the first time; being misunderstood and recovering; being approached by the cat; and understanding that stepping back is also a valid interaction. A short session need not include all four, but each must have clear conditions.
- The piece may express closeness, curiosity and rest. It must not interpret a visitor's actions as their real emotions, personality or mental state. On-screen trust is the virtual character's state; it must not claim to measure the visitor's empathy or wellbeing.
- Keeping it wild means the cat can pause contact, refuse too much food, end play and rest on its own. High trust lowers wariness but does not cancel physical needs or contact boundaries.

## 4 Visitors and venue

- The main participant is a first-time member of the public. The design must cover left or right hands, sitting or standing, small movements, people who do not want to use the camera, and people who cannot pinch. Bystanders can see the cat's feedback but do not get control by default.
- P0 setting: one computer, one camera, one main display or projection, one operator per round. A full session lasts **3–5 minutes**; visitors should complete a meaningful action **within the first 30 seconds**. Multiple simultaneous visitors is separately estimated scope.
- The exhibition defaults to short English copy, with Chinese as the delivery-notes language and a switchable language. Key prompts are short, specific and free of developer jargon. "Low confidence" becomes, for visitors, "I lost your hand. Try holding it here."

## 5 Experience structure

| Step | Requirement |
|---|---|
| 5.1 Attract and entry | The attract screen shows the cat living on its own, with the prompt "Move closer, or start with a mouse". Explain the camera's purpose before starting; allow mouse or keyboard instead. The attract screen builds no relationship memory and never carries one visitor's state to the next. |
| 5.2 Input mapping | A light guide of no more than 20 seconds helps visitors see how their hand maps to the cursor. Detect valid tracking and reach rather than forcing one gesture; offer an alternative input straight away on failure. |
| 5.3 Exploring together | Keep Feed, Play and Pet, and add a clearly understandable "step back or wait". A tool expresses what the visitor is trying; the cat still decides based on needs, stress and history. Reasonable refusals come with movement and a short explanation. Repeated failure or recognition errors must not count as the visitor harming the character. |
| 5.4 Relationship and ending | Stage changes come from effective care, low-stress time together and time itself, never from holding one action. The ending shows 2–3 event-based relationship notes such as "You gave me space when I needed a rest". Visitors can end at any time; early exits, low trust or unfinished growth all get a complete, gentle close with no blame. After 15 seconds the ending clears and the next visitor starts a fresh session. |

## 6 AI scope

- **6.1 Perception (required).** On top of HandPose keypoints, add a trained, evaluable short-window gesture classifier that at least distinguishes gentle approach, stable contact, fast close approach and ordinary movement. No hand, occlusion, low quality and unreliable classification must go to separate `unknown` or `lost` results. Recognition must combine hand shape, trajectory, dwell time and spatial relation; a single-frame speed threshold may not be the only rule. Explicit button actions take priority over inferred intent; a failed pinch must have a keyboard or click alternative. Deliver anonymous keypoint samples, label definitions, participant-split training and test records, confusion matrices and a false-trigger report.
- **6.2 Behaviour (required).** Use a hybrid of hard state constraints and utility selection. The system must answer: what was observed; what the character needs; how both shaped this choice. Staff can see input quality, candidate scores and the final reason; visitors see short feedback only.
- **6.3 Bounded adaptation (required).** Record this session's successful contact duration, acceptable distance and play tempo, and adjust responses with bounded estimates. Visible preference changes need **at least 3 valid events**; the adjustment is limited, resettable and cleared at the end. Statistical estimation is acceptable; online neural training is not required. The deliverables must state clearly what is a trained model, what is a rule and what is statistical adaptation. Random appearance variation must not pass as personality learning.
- **6.4 Extensions.** P1 may restore the full eight-joint spine, IK, genetic coats and elder cycle, or add an opt-in anonymous relationship profile. P2 may try constrained generative recaps. Generative text is not a P0 requirement and must never control live behaviour, change state or invent interactions.

## 7 Scope and trade-offs

| Priority | Scope | Criterion |
|---|---|---|
| P0 | Single-visitor session, camera and alternative input, three kinds of care plus waiting, quality gating, trained gesture model, utility behaviour, bounded adaptation, explanatory feedback, ending and turnover | Completed and accepted on the target device |
| P0 | Processing Java exhibition display, JavaScript perception and behaviour service, disconnect recovery, operating notes and test evidence | Both technologies have real responsibilities and runnable deliverables |
| P1 | Full procedural skeleton, genetics and generations, long-form observation mode, opt-in anonymous saving | Must not block the core loop |
| P2 | Generative recap, multilingual free input, complex learning strategies, multi-visitor control | Separate change request |
| Out of scope | Accounts and social features, cloud video analysis, emotion recognition, voice chat, payments, real animal-care advice | Not in this quote or acceptance |

Keep the three environments as artistic chapters of growing up. P0 needs recognisable scenes and state transitions, not a full port of every prop, prey animal and lighting effect. Autonomous hunting can be P1; in P0, autonomous exploration, rest and grooming show that the character has its own life when nobody is interacting.

## 8 Processing and JavaScript

Processing Java renders the exhibition display: the character's body, scenes, state animation and rendering. JavaScript handles browser camera input, keypoints and gesture recognition. A local Node.js service owns the single character state, utility decisions, memory, sessions and logs. The browser p5.js version is the development preview and backup display.

Versioned JSON messages travel over a local WebSocket. The character's "brain" runs once; Processing and the browser must not each compute trust and growth. Sound plays only in the browser's Web Audio to avoid two displays making noise. All venue-critical dependencies and models ship in an offline package that starts without internet. The browser still asks for camera permission; privacy copy must not turn "local inference" into "no camera permission needed".

## 9 Interaction quality and acceptance targets

| Target | Acceptance requirement |
|---|---|
| Onboarding | In the first usability round, at least 8 of 10 people complete an effective action within 30 s without staff help |
| Explainability | At least 8 of 10 correctly explain the reason for one acceptance or refusal |
| Fair recovery | Across 30 scripted cases of lost hand, occlusion and jumps, no trust loss caused by invalid tracking |
| Perceivable relationship | At least 7 of 10 point to one behaviour change caused by this session's history and cite the actual event |
| Gesture recognition | Macro F1 ≥ 0.85 on a held-out-participant test set, reported with coverage and false triggers |
| Responsiveness | Continuous pointer feedback p95 ≤ 150 ms; intent confirmation, including the observation window, p95 ≤ 900 ms |
| Stability | 4 hours continuous on the target device without a crash; 30 turnovers with no state leaking into the next round |
| Maintainability | Staff can start up, switch to the backup input or restart within 2 minutes |

## 10 Deliverables

- **Design:** research questions and observation plan, trade-off notes on both prototypes, user journey, two-layer session and character state diagram, gesture dictionary, model labels and data notes, feedback and failure-recovery spec, key screens, sound mapping, privacy notes, usability tests and change log.
- **Engineering:** Processing project, JavaScript input and behaviour project, model and pinned dependencies, parameter and copy configuration, message protocol, replayable event samples, offline package, start-up and recovery guide, test report, model evaluation and known-limits list.
- **Demo:** a 90–120 s experience video, plus a walkthrough showing occlusion recovery, a refusal, preference adaptation and visitor turnover. Portfolio notes must state my role, inherited code and AI capability boundaries.

## 11 Timeline and checkpoints

Planned for one freelance designer-developer at about 34–42 working days over 8–10 weeks, assuming timely access to devices, venue feedback and test recruitment. Includes 6–8 days of integration and buffer. Large new visual assets, extra hardware or a commercial launch would be estimated separately. This schedule is not a price commitment.

| Phase | Weeks | Review |
|---|---|---|
| Requirements and technical validation | 1 | Scope, device baseline, input protocol, Java–browser communication and model loading |
| Interaction loop | 2–3 | Three kinds of care, waiting, character boundaries, full mouse experience, ending and turnover |
| AI perception and adaptation | 3–5 | Data capture, training and held-out testing, quality gating, in-session preferences |
| Processing display integration | 5–6 | Character and scene port, sound sync, three-chapter growth and explanation UI |
| User testing and revision | 7–8 | 10-person usability, misrecognition recovery, explainability and adaptation ablation |
| Venue and handover | within 9–10 | 4-hour run, 30 turnovers, offline package and on-site handover |

## 12 Responsibilities and change control

- The project lead confirms curatorial goals, venue, devices, final public copy, scope and phase acceptance, and provides test recruitment and projection and sound conditions. The freelancer owns interaction design, the AI prototype, code integration, documentation and agreed testing. Real camera tests and venue technical acceptance are done together.
- Payment can follow four milestones (requirements sign-off, playable mid-build, test build, final handover), for example 20 / 30 / 30 / 20 %. This is a suggestion for contract negotiation; this brief does not set fees, tax or liability.
- Adding multiple visitors, cloud services, accounts, extra displays, generative features or a full visual remake requires recording the goal, extra work, cost and acceptance change before scheduling. Bug fixes, meeting written acceptance criteria and two rounds of design feedback within scope are part of the original scope.

## 13 Decisions before delivery

Defaults for this round: local offline operation; Processing Java display; English main interface; one visitor per round; 3–5 minutes; no accounts; no raw video stored; relationship memory valid for the session only; no generative cloud service in P0.

To confirm at kick-off: actual devices and OS, display size and viewing distance, venue lighting, target age and accessibility arrangements, whether anonymous statistics are recorded, test recruitment and launch date. If these change, adjust the verifiable targets and device scope first rather than keeping every performance commitment by default.

## 14 Delivery instruction

First build one replayable, measurable experience chain: a visitor approaches; the system recognises them reliably; the cat decides from its own state whether to accept contact; the visitor sees why; after three valid encounters an explainable rhythm adaptation appears; and when they leave, the next visitor gets a clean new session. Improve character motion and environments after that.
