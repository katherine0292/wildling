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
| [ADR-012](#adr-012-the-litter-is-part-of-the-kittens-life) | The litter is part of the kitten's life | V2 build | Proposed · implemented for review · amends ADR-010 |
| [ADR-013](#adr-013-growth-the-visitor-can-see-and-work-towards) | Growth the visitor can see and work towards | V2 build | Proposed · implemented for review · amends F2-13 |
| [ADR-014](#adr-014-peek-inside-the-decision-trace-as-a-visitor-feature) | Peek inside: the decision trace as a visitor feature | V2 build | Proposed · implemented for review |
| [ADR-015](#adr-015-three-toys-one-set-of-play-rules) | Three toys, one set of play rules | V2 build | Proposed · implemented for review |
| [ADR-016](#adr-016-keepsakes-stay-with-the-visitor-not-the-venue) | Keepsakes stay with the visitor, not the venue | V2 build | Proposed · implemented for review · extends F2-17 |
| [ADR-017](#adr-017-hand-shapes-ask-the-kitten-about-its-siblings) | Hand shapes ask the kitten about its siblings | V2 build | Proposed · implemented for review · amends ADR-012 |
| [ADR-018](#adr-018-show-the-hand-the-system-sees) | Show the hand the system sees | V2 build | Proposed · implemented for review |
| [ADR-019](#adr-019-teach-a-trick-few-shot-learning-on-the-device) | Teach a trick: few-shot learning on the device | V2 build | Proposed · implemented for review |
| [ADR-020](#adr-020-the-litter-notices-passers-by) | The litter notices passers-by | V2 build | Proposed · implemented for review · exhibition only |
| [ADR-021](#adr-021-dreams-replay-real-moments) | Dreams replay real moments | V2 build | Proposed · implemented for review |
| [ADR-022](#adr-022-hand-shapes-that-hold-up-on-a-real-camera) | Hand shapes that hold up on a real camera | V2 build | Proposed · implemented for review · revises ADR-017 |
| [ADR-023](#adr-023-a-tutorial-that-teaches-by-doing) | A tutorial that teaches by doing | V2 build | Proposed · implemented for review |

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

## ADR-012 The litter is part of the kitten's life
- **Context:** in early play the siblings were scenery. Once Feed, Play and Pet had each been tried, there was little left to discover, and an exhibition piece needs moments that draw a crowd.
- **Options:** ① keep siblings ambient; ② let the visitor care for all three; ③ keep one relationship, but let the chosen kitten have its own relationships with its litter.
- **Decision:** ③. Siblings visit now and then; the chosen kitten decides, through the same utility selection, whether to wrestle (`SOCIAL`) or ignore them. A sibling that comes close while it eats, sleeps or is tense gets hissed at (`SIB_FOOD`, `SIB_REST`, `SIB_TENSE`), and rough play can end in a hiss. With the Play tool the visitor can **invite** a sibling over; like every tool it is a request, and a tired or tense kitten declines with a reason. Hunting a passing critter unlocks in Chapter II and bringing the visitor a gift in Chapter III.
- **Kept from ADR-010:** siblings still never react to the hand, never enter memory and never affect trust. Hissing is the kitten's boundary toward its litter, not a penalty for the visitor.
- **Evidence:** `test/life.test.mjs` (wrestle, hiss on food, invite refused when tired, hunting locked before Chapter II, gift in Chapter III, all cleared at turnover).
- **Overturned if:** testing shows visitors read a hiss as being told off, or the litter distracts from the visitor's own relationship.

## ADR-013 Growth the visitor can see and work towards
- **Context:** growth was a slow, invisible drift (about four minutes of qualifying time) shown as three thin bars. Visitors could not tell what made the kitten grow or what was holding it back, and the change between chapters was too subtle to feel like an achievement.
- **Decision:**
  - Keep the PRD gate unchanged (each need ≥ 0.20, mean ≥ 0.55, stress ≤ 0.40, active session).
  - Behind the gate, growth has two sources: a slower passive drift (1/150 per second, raised by trust) and a **burst for each completed act of care** (a meal, a catch, a quiet contact, space given when asked, a wrestle, a hunt, a gift).
  - Bursts are capped per cause at 0.24 of a chapter per minute, so varied care grows fastest and repeating one action cannot rush the kitten.
  - A growth meter shows the percentage to the next chapter, the four needs that gate it, the reason when it pauses, and what the next chapter unlocks.
  - Each chapter changes the body clearly (kitten: big head and eyes, fuzz; juvenile: long legs, big ears, pattern; adult: full size, ruff, ear tufts, adult eye colour). A title card and a camera push-in celebrate it; becoming fully grown is celebrated before the visit ends.
- **Relation to ADR-009:** trust still has no bar. Growth is the kitten's progress, not a score of the visitor, and its gate is the kitten's wellbeing.
- **Cost:** a visible meter invites goal-directed play; the gate and the per-cause cap keep that play balanced and kind.
- **Evidence:** `test/life.test.mjs` (burst on a meal, cap per cause, gate blocks bursts, celebration before reflection); AT10 still passes.
- **Overturned if:** visitors rush tools to fill the meter, or ignore refusals to chase progress.

## ADR-014 Peek inside: the decision trace as a visitor feature
- **Context:** the explainable decision trace lived only in the staff panel. Visitors could not see the AI that makes the kitten feel alive, which undersold the work and the brief's goal of understandable AI.
- **Decision:** a **Peek inside** toggle (`T`) shows, beside the scene, what the kitten is weighing: the top candidates with their relative scores, the winner, why each blocked option is blocked in plain words ("too tired", "too young yet"), and any reaction ("Hissed at Juniper: it was eating"). A footer states what it is: safety rules first, then hand-written scores, not a learned model.
- **Kept:** exact numbers stay in the staff panel; the public view shows bars and words only.
- **Overturned if:** visitors find it distracting or read the bars as a score to beat.

## ADR-015 Three toys, one set of play rules
- **Context:** Play meant waving the hand as a yarn ball. It was the most fun tool, but it never changed, and it excluded visitors who cannot keep a hand moving.
- **Decision:** the Play tool offers three toys, switched from a small tray or by pressing `2` again.
  - **Yarn:** the hand is the toy, as before.
  - **Feather:** a feather on a springy string trails the hand. Above 0.9 S/s it is a leap and a miss (`pounce_missed`: a little fun, no reward), so slow, teasing swishes work best.
  - **Ball:** a click or pinch throws it with the hand's own velocity. It rolls with friction and bounces off the edges, and every bat sends it rolling again, so the kitten plays on with no hand on screen.
- **Kept:** every toy goes through the same PLAY candidate, the same energy, stress and pause limits, and the same capped rewards; catches feed the same adaptation sample.
- **Evidence:** `test/toys.test.mjs` (yarn default, ball chased with no hand, fast feather missed and slow feather caught).

## ADR-016 Keepsakes stay with the visitor, not the venue
- **Context:** a visit felt complete but weightless: nothing carried over, and nothing could be taken home. Yet F2-17 requires every exhibition visitor to meet a fresh kitten, and visits must never be linked by the venue.
- **Options:** ① no memory; ② a venue database of returning visitors; ③ memory that lives only with the visitor.
- **Decision:** ③, in two forms.
  - **Album and postcard (everywhere):** the page takes photos of key moments (first meal, first touch, a catch, a tumble, a hiss, a hunt, a gift, each new chapter). The photos are cropped from the canvas, which holds no interface. At the end the visitor can save a postcard with up to three photos, the journal lines, chapter stamps and a code. The postcard is drawn in the browser and nothing is uploaded.
  - **Keepsake (website only):** a small record (visits, furthest chapter, gifts) is kept in that browser's `localStorage`. On the next visit with the same kitten, the core receives `set_returning`: a greeting, a cited journal line and a bounded trust head start (0.06 per visit, at most 0.18). The postcard's code carries the same record so it can continue on another device. "Forget me" clears it.
- **Exhibition:** `?kiosk=1` keeps nothing, so F2-17 is unchanged at the venue.
- **Never kept:** video, hand data, timings of the visitor's behaviour, or anything about the siblings.
- **Evidence:** `test/toys.test.mjs` (no keepsake means a fresh kitten; the head start is capped; it applies only to the remembered kitten; it is cleared for the next visitor).
- **Overturned if:** visitors find the head start unfair to first-timers, or the project lead prefers no persistence at all.

## ADR-017 Hand shapes ask the kitten about its siblings
- **Context:** in the build review, visitors wanted to direct how the kitten treats its litter (make friends, cuddle, play-fight, hiss), and to do it with their hands. Until then, sibling moments were spontaneous or a single "invite".
- **Decision:**
  - A fifth tool, **Siblings** (`5`), turns the hand into a way of asking. Four static hand shapes map to four requests: open hand → make friends, two fingers → cuddle up, fist → play-fight, claw → hiss. Shapes are read from the 21 HandPose keypoints by a **rule baseline** (`v2/core/pose.js`: finger reach and knuckle bend, independent of hand size and rotation).
  - Ambiguous shapes are `unknown`. A shape only counts when it is held over a sibling for 600 ms, with a 1.5 s cooldown. The cursor shows the recognised shape and a filling ring, so the visitor sees what was understood before anything happens.
  - Mouse and keyboard reach the same four requests through a small menu over the sibling, with keys `1` to `4`.
  - **Requests, not commands (ADR-005):** the kitten keeps a bond with each sibling (this visit only). Cuddling needs a bond of at least 0.35 ("We're not close enough for that yet"), and it will not hiss at a close friend ("But we're friends!"). Tiredness, tension and hunger block play-fights as before.
  - Each act changes the bond: friends +0.15, cuddle +0.10, a play-fight +0.05 (−0.10 if it got too rough), a hiss −0.15. A standoff makes the sibling back away. None of it touches the visitor's trust.
- **Kept:** siblings still never read the hand themselves; the visitor's request goes to the chosen kitten only.
- **Evidence:** `test/litter-commands.test.mjs` (four shapes and a rejected mix; befriend raises the bond; cuddle declined for a stranger and accepted later; no hissing at a friend; a standoff sends the sibling off; a held fist over a sibling asks for a play-fight; an unclear shape asks for nothing).
- **Overturned if:** visitors cannot form the shapes reliably at viewing distance, or hissing on request reads as cruelty rather than play.

## ADR-018 Show the hand the system sees
- **Context:** with the camera, the cursor was a circle. Visitors could not tell whether the system saw their fingers, and petting had no visible stroke, so contact felt abstract.
- **Decision:**
  - With the camera, the cursor is the tracked hand itself: five fingers from the 21 keypoints, drawn slightly smaller around the palm so it never hides the kitten. It turns dashed blue when tracking is uncertain, as before.
  - With Pet or Siblings, mouse and keyboard users get the same hand from a template, fingers wiggling as they stroke.
  - Accepted contact now shows fur brushed along the path of the hand, purr rings and hearts, while the kitten's eyes half-close.
- **Kept:** the feedback rule. System uncertainty shows on the hand (cursor); the kitten's own choice shows on its body.

## ADR-019 Teach a trick: few-shot learning on the device
- **Context:** every AI capability so far was a pre-trained model, rules or statistics. Visitors could not *teach* the kitten anything, which is the most intuitive way to experience learning, and the strongest moment for an exhibition about AI.
- **Options:** ① no learning in the visit (the PRD's position); ② online training of a network in the browser; ③ instance-based learning from a few examples.
- **Decision:** ③. A sixth tool, **Tricks**:
  - The visitor picks a trick (spin, roll over, wave) and shows a move of their own three times: a circle, a zigzag, anything.
  - A move is segmented the same way for camera, mouse and keyboard: it starts when the hand speeds up and ends when it settles.
  - Each move becomes 16 resampled points, centred and scaled (32 numbers), so size and position do not matter. A **1-nearest-neighbour** model stores the examples.
  - A later move is matched to the nearest example. If it is further than 0.32 from every example, or too close to two tricks to choose, it is `unknown` and the visitor is told so.
  - The panel shows how alike the examples were, the last move as the model saw it, and its distance.
- **Kept:** a recognised move is a request; a tired or tense kitten declines with a reason. Learned tricks are forgotten at turnover.
- **Honest wording:** "learned on this device from your three examples (nearest neighbour)", never "trained a neural network" or "understands your gestures".
- **Evidence:** `test/tricks.test.mjs` (circles and zigzags separated at any size and place; an unrelated move rejected; three moves learned in the page, then the move asks for the trick; a tired kitten declines; forgotten at turnover).
- **Overturned if:** testing shows the hand camera's jitter makes three examples too few, or visitors expect the kitten to keep the trick for next time.

## ADR-020 The litter notices passers-by
- **Context:** an exhibition screen has to draw people in before anyone touches it. A kitten that turns to look at you as you walk past is the strongest invitation we have.
- **Decision:** in exhibition mode only (`?kiosk=1&watch=1`), ml5 BodyPose watches the room while nobody is playing. Only each person's horizontal position and apparent size (shoulder width) reach the core. Every kitten turns to look, and the closest trots to the near edge if someone is close enough. The camera is released the moment a visitor starts. `?watch=demo` plays a demo passer-by for testing.
- **Privacy:** no frames, faces or poses are kept or sent; positions are forgotten after 4 s.
- **Evidence:** `test/tricks.test.mjs` (they look, one approaches, and they let go when nobody is there). On-device detection in the venue is part of WP06.

## ADR-021 Dreams replay real moments
- **Context:** memory was only visible at the end, in the journal.
- **Decision:** while the kitten sleeps, a dream bubble cycles through the visit's own album photos ("Dreaming of: first fish"). Only real, photographed moments appear.

## ADR-022 Hand shapes that hold up on a real camera
- **Context:** first tests with a real camera found the hand shapes unreliable. Each finger was judged with hard yes/no thresholds on 2D distances, so jitter flipped answers, a tilted hand looked like a different shape, and a claw seen from the front looked like short straight fingers. The shape also had to be held exactly over a moving sibling.
- **Decision:**
  - Use the model's **3D keypoints** when present to measure how each finger bends at its joints, and fall back to 2D reach otherwise.
  - Give every finger **soft scores** (straight, folded, claw-bent) instead of booleans, and average them per shape.
  - **Smooth** the shape scores over recent frames (α = 0.35) before naming a shape, then require top ≥ 0.55 and margin ≥ 0.15, else `unknown`.
  - Allow a 200 ms gap in the hold, shorten the hold to 500 ms, widen the target to 0.22 S, and keep the same sibling while a shape is held (up to 0.32 S).
  - The visible cursor became a see-through hand, so it no longer hides the kitten.
- **Evidence:** `test/litter-commands.test.mjs` (shapes at ±40° rotation, 0.6–1.4× scale and offset; 22 of 22 settled frames correct under heavy jitter; a claw curled toward the camera recognised from 3D). Accuracy on real hands at venue distance is still to be measured (WP06).

## ADR-023 A tutorial that teaches by doing
- **Context:** first-time visitors did not know the hand shapes existed, or how to start a play-fight.
- **Decision:** a short tutorial on the first visit:
  - **Steps:** say hello, offer a fish, play, then one step per hand shape (make friends, play-fight, cuddle, hiss).
  - **Each step:** one line of text and the hand shape to make, drawn faintly on the scene, with the right tool selected.
  - **Moving on:** a step only goes away when the visitor has done it (contact accepted, fish dropped, shape recognised, or the request chosen from the menu).
  - **Escape hatches:** every step can be skipped, a Next button appears after 20 s, and "?" replays the tutorial.
  - **When it shows:** once per browser on the website, and for every visitor in kiosk mode.
