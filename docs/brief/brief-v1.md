# Wildling: Project Brief V1

> **Issued by:** Project lead · Sydney game and interaction exhibition
> **PDF:** [`pdf/brief-v1.pdf`](pdf/brief-v1.pdf)
> **Note:** Everything in this document is a requirement or boundary set by the project lead.
> My product translation is in [`../prd/prd-v1.md`](../prd/prd-v1.md).

This brief commissions an interactive piece whose protagonist is a virtual wild cat. Through their own movement, presence and care, visitors should feel how a relationship forms. We care about the creature's autonomous responses, the cause and effect between action and feedback, and the emotional change that comes with growing up. Please deliver it as a creative-coding and interaction prototype.

## 1 Project

We plan to show Wildling in a public game and interaction exhibition. The piece is a top-down virtual wild cat that explores its surroundings, expresses its needs, and responds to a visitor approaching, petting or moving quickly. Over time and through interaction it grows from a kitten and passes through three environments: jungle, snowfields and desert.

The theme is **"how care builds trust"**. Visitors are both participants and observers. We want them to realise that the same action can meet a different response depending on trust and physical state, and that a virtual creature should have a rhythm of its own.

The piece does not need to simulate real felid ecology. The three landscapes are an artistic metaphor for growing up and must not be presented as real migration routes or as animal-care advice.

## 2 Creative proposition and experience goals

**Core proposition:** through a virtual creature whose inner needs are visible, help visitors understand how behaviour, needs, trust and growth relate.

| Goal | Description |
|---|---|
| Understandable | A first-time visitor discovers at least one effective interaction and knows what their action changed |
| Alive | Even when the visitor is not acting, the creature shows observable behaviour |
| Relational | Gentle contact and persistent chasing lead to different relationship outcomes |
| Presentable | The piece can be demonstrated end to end without a presenter explaining the code |

Clarity of behavioural feedback comes before visual complexity. A complex skeleton, more scenes or more numbers cannot replace an understandable interaction.

## 3 Audience and setting

- Primary audience: members of the public interested in games, digital art and interactive experiences. No programming background; no assumed familiarity with gesture recognition.
- One main participant per session; others may watch.
- Setting: a computer with a webcam, mouse and speakers, with the browser full screen. The camera tracks one hand; the mouse offers an equivalent experience without a camera. The piece must run stand-alone on a personal computer.
- Venue hardware, age guidance, multi-visitor capacity and final session length will be confirmed at commission kick-off.

## 4 Core experience flow

1. Enter the piece and learn that Wildling is a virtual creature that responds, has needs and grows.
2. Choose camera or mouse input and complete a first effective action.
3. Observe the posture, movement, sound and state changes the action causes.
4. Adjust to its needs, finding a rhythm between keeping it company and letting it be.
5. See changes in body, environment or relationship; complete one growth arc or keep observing the life cycle.

## 5 Functional requirements

### 5.1 Creature and body language
The protagonist must be a recognisable feline. It must at least express movement, quiet contact, play or chase, avoidance and rest. At least two of ears, tail, eyes, gait or breathing must reflect the current state.

The body may be built from simple shapes or a procedural skeleton, but behavioural state and visual pose must agree. State changes must not happen only in a numbers panel.

### 5.2 Input and interaction
Camera mode maps the hand's position into the interaction space and uses movement speed and distance to the cat to tell gentle contact from a fast approach. Mouse mode must keep the same basic cause and effect.

Two prototype routes are already visible. **Route A** centres on petting, chasing and observation and stresses the creature's autonomous life. **Route B** centres on explicit Feed, Play and Pet tools and stresses understandable care tasks. They are two ways of organising the same theme; do not claim that every feature of both routes exists at once.

### 5.3 Needs and behaviour
The creature must have an internal state, and that state must influence its choices. Energy, fullness and trust are expected dimensions; Route A also models stress and Route B models fun. What matters is that the states form an explainable behavioural relationship, not a fixed set of four meters.

When energy drops it should rest; when hungry it should seek food or ask for it; gentle company should build trust; a fast approach should, under some conditions, trigger avoidance. Existing trust can change responses, but "total obedience to the visitor" must not be the piece's only outcome.

### 5.4 Growth and environments
There must be three main life stages (young, juvenile and adult), matched to jungle, snowfields and desert. Growth must be visible and must have transition cues.

Route A extends the cycle with ageing, rest and the birth of a next generation with inherited and slightly mutated looks. Route B ends adulthood with care statistics and a closing line about the relationship. The former suits continuous viewing; the latter suits a complete demonstration.

### 5.5 Feedback and explanation
The interface must show current needs and interaction state, and must let visitors know whether the system can see their hand. Sound should strengthen state perception and must be mutable. Short bubbles or captions should help explain the current behaviour; open-ended chat is not needed.

Route A's MIND panel shows utility scores and helps explain decisions. Route B shows growth, fullness, fun, energy and trust, which is easier for newcomers.

## 6 Technical boundaries

- Both prototypes are JavaScript and p5.js browser projects, use ml5.js HandPose for hand keypoints, and synthesise sound with the Web Audio API.
- Neither calls a large language model, ships a self-trained gesture classifier, or keeps the relationship across page reloads.
- Utility AI and a priority state machine are both valid behaviour-design methods, but neither may be described as a machine-learning character trained to understand visitor intent.
- Processing (Java) and JavaScript are constraints for later stages. p5.js code is not Processing Java-mode code; drawing, vectors, audio and input libraries need porting or a protocol bridge.

## 7 Deliverables and acceptance

Deliverables: a runnable browser prototype, all source code, run instructions, interaction notes and a short demo video.

Minimum acceptance:
- one full round of core interaction with the mouse;
- the camera passes a real test on the target device;
- action and feedback have a clear causal link;
- needs influence behaviour;
- all three growth environments can be shown;
- sound can be turned off;
- a restart begins a new round.
