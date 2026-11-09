# Product decision records

Each record states the context, the options, the decision, its cost, and what evidence would overturn it.
Status: **Proposed** (in the PRD, awaiting review) · **Adopted** (confirmed or implemented) · **Superseded** (replaced by a later decision).

| ID | Decision | Stage | Status |
|---|---|---|---|
| [ADR-001](#adr-001-three-tools-before-natural-gestures) | Three tools before natural gestures | PRD V1 | Revised by ADR-005 |
| [ADR-002](#adr-002-a-priority-state-machine-for-round-one) | A priority state machine for round one | PRD V1 | Superseded by ADR-006 |
| [ADR-003](#adr-003-no-open-chat-no-generative-endings) | No open chat, no generative endings | V1 / V2 | Adopted |
| [ADR-004](#adr-004-separate-system-uncertainty-from-character-refusal) | Separate system uncertainty from character refusal | PRD V2 | Adopted · implemented in the V2 build |
| [ADR-005](#adr-005-tools-are-requests-not-commands) | Tools are requests, not commands | PRD V2 | Adopted · implemented |
| [ADR-006](#adr-006-hard-constraints-then-utility) | Hard constraints, then utility | PRD V2 | Adopted · implemented |
| [ADR-007](#adr-007-bounded-statistical-adaptation-not-online-learning) | Bounded statistical adaptation, not online learning | PRD V2 | Adopted · implemented |
| [ADR-008](#adr-008-one-authoritative-character-state) | One authoritative character state | PRD V2 | Adopted · in-process in the browser build |
| [ADR-009](#adr-009-no-trust-bar-on-the-public-screen) | No trust bar on the public screen | PRD V2 | Adopted · implemented |
| [ADR-010](#adr-010-a-litter-of-three-one-relationship) | A litter of three, one relationship | V2 build | Proposed · implemented for review |
| [ADR-011](#adr-011-a-warm-storybook-visual-language) | A warm storybook visual language | V2 build | Proposed · implemented for review |

---

## ADR-001 Three tools before natural gestures
- **Context:** Brief V1 accepts both the autonomous route (pet, chase, observe; Prototype A) and the tool route (Feed, Play, Pet; Prototype B). Round one has to prove that a first-time visitor understands care and its effect.
- **Options:** ① natural gestures with an autonomous ecology; ② three tools with visible needs; ③ free conversation.
- **Decision:** ② as the main route; autonomous rest and refusals keep it from feeling mechanical.
- **Cost:** visitors switch tools, and the character can look as if it follows orders.
- **Overturned if:** usability shows visitors treat tools as a task list, or research shows natural gestures are learnable within 30 s.

## ADR-002 A priority state machine for round one
- **Context:** few behaviours; the priority is readable cause and effect.
- **Decision:** a priority state machine; utility AI held back for when several needs compete.
- **Cost:** trade-offs between states are a hard-coded order, so "hungry and playful" is hard to express.
- **Outcome:** Brief V2 asked for hard constraints plus utility. Superseded by ADR-006.

## ADR-003 No open chat, no generative endings
- **Context:** both briefs put the understandability of body-based interaction first.
- **Decision:** P0 uses fixed templates with event citations only. A generative recap is P2: it may never enter the Brain, change state or invent interactions, and falls back to the template on a 2 s timeout.
- **Why:** generated text cannot prove that body interaction works, and adds latency, moderation and the risk of describing things that never happened.

## ADR-004 Separate system uncertainty from character refusal
- **Context:** in both prototypes a lost hand, a tracking jump and an unwilling cat all looked like "it ignores me". Visitors blame themselves or think the cat is cross.
- **Decision:** three cause layers: the system didn't see (`TRACKING_LOST`), the action isn't clear (`INTENT_UNCERTAIN`), and character boundaries (`NEED_REST`, `TOO_FULL`, `PRESSURE_HIGH`, `NOT_READY`). The first two show on the cursor and tracking cue as a dashed note; only the last uses the cat's body and a speech bubble. The first two **never affect relationship values**.
- **Evidence:** AT02 (occlusion costs no trust), AT09 (no memory during `unknown`); usability metric "reason understood 8/10".

## ADR-005 Tools are requests, not commands
- **Context:** in Prototype B, `tool !== 'PLAY'` made a tool an exemption from stress handling, and PETTED always won once the hand was still on the body.
- **Decision:** a tool only expresses what the visitor is **trying**, and adds a +0.25 request boost to legal candidates; hard constraints and utility decide whether it is accepted. A fourth option, "Give space", makes stepping back a valid interaction.
- **Cost:** visitors meet refusals. The first refusal also says what to try, and refusals cost nothing.

## ADR-006 Hard constraints, then utility
- **Context:** required by Brief V2, together with answering "what was observed, what does it need, how did both shape this choice".
- **Decision:** session freeze → input validity → stress and energy protection → uninterruptible short actions → utility. Decisions every 250 ms, inertia +0.10, switch margin 0.15, minimum hold 600 ms. Each decision records candidate scores, blocked reasons and the winner.
- **Why:** rules give provable safety boundaries; utility gives a sense of life. Both are explainable and replayable.

## ADR-007 Bounded statistical adaptation, not online learning
- **Context:** Brief V2 requires visible change only after 3 events, limited magnitude, resettable.
- **Decision:** three preferences (contact dwell, play tempo, approach distance), median target, 0.8 / 0.2 smoothing, 10 s rate limit, hard ranges. Adaptation never changes the quality gate, energy limits or rejection thresholds.
- **Why:** a short session has neither the data nor the explainability for online training; statistical updates can be compared directly with `adaptation_on` / `adaptation_off` replays.
- **Wording:** "I'm getting used to this rhythm", never "I know your personality".

## ADR-008 One authoritative character state
- **Context:** with a Processing display and a browser perception client, two copies of trust and growth would drift.
- **Decision:** a local Node.js service runs the only CreatureCore; displays consume 30 Hz snapshots and interpolate; commands are de-duplicated by `commandId`.
- **Current build:** `v2/core/` is pure JavaScript with no DOM or p5. The browser build calls it in-process and the tests run the same code under Node, which is exactly the boundary the service keeps. The snapshot already uses the protocol's field names.

## ADR-009 No trust bar on the public screen
- **Context:** Prototype B's need bars invited visitors to "fill trust", which works against the theme "learning each other's distance".
- **Decision:** the main screen shows character phrases (Still watching you · Warming up to you · Comes to you) with three hearts; exact values are in the staff panel (`D`).
- **Cost:** less sense of progress control. The recap balances this with event-based relationship notes.

## ADR-010 A litter of three, one relationship
- **Context:** a single cat on the attract screen felt sparse, and choosing a companion is a strong emotional first moment. But the brief's core is one traceable relationship, and multi-character control is P2.
- **Options:** ① one cat; ② several cats the visitor cares for at once; ③ a litter of three where the visitor chooses one.
- **Decision:** ③. Ember (curious), Juniper (shy) and Saffron (playful). **Temperament changes starting values only**; every rule, threshold and boundary is identical. The two siblings stay ambient at the edges and never see the hand, never enter memory, and never affect the session.
- **Evidence:** `test/litter.test.mjs` (siblings never react; rules identical for every kitten; choice locked once a session starts).
- **Overturned if:** testing shows visitors try to care for the siblings and feel ignored.

## ADR-011 A warm storybook visual language
- **Context:** the exhibition audience is the general public, and the theme is gentle. A dark, technical look made refusals feel colder.
- **Decision:** cream paper cards with stitched borders, sage highlights, rounded type (Fredoka, Nunito), a sunlit painted world and storybook ink outlines on the procedural body ported from Prototype A. Colour is never the only signal: system notes are dashed and sky-blue, the character speaks in white speech bubbles. Fonts and p5 ship locally for offline use.
- **Overturned if:** the venue lighting or projection makes the palette unreadable at viewing distance.
