# Experience spec V3: a first meeting

This spec replaces the tool-driven flow of the V2 build. It follows the [self-audit](../redesign/self-audit.zh.md), which found that the weak part of V2 was the flow and the interaction, more than the picture. The hand-painted world and the kitten from V2 stay; what changes is what the visitor does, in what order, and how the kitten answers.

## 1 What changes, in one table

| V2 | V3 |
|---|---|
| Six tools side by side; the visitor picks one, the kitten reacts | No tools. The kitten has one need at a time; the visitor's job is to read it and answer |
| A field guide with four tabs of text before play | One screen: the litter, a title and Start. Everything else is taught during play |
| A growth meter with a percentage, three chapters and four need rings | Three bond stages, shown as three hearts. No percentage |
| The kitten speaks in English sentences | The kitten answers with its body and, when needed, one pictogram. Words are for the system only |
| A visit ends on a timer | A visit ends when the kitten falls asleep beside the hand, or when the visitor leaves |
| A text tutorial of seven steps, four of them hand shapes for siblings | The first act is the tutorial: one goal, shown by a ghost hand in the scene |

## 2 Flow

```mermaid
flowchart LR
    A[Entry: litter, title, Start] --> B[Choose a kitten by pointing at it]
    B --> C[Act 1 · Approach<br>get sniffed]
    C --> D[Act 2 · Company<br>read its need, answer it]
    D --> D
    D --> E[Act 3 · Trust<br>bonded moments]
    E --> F[It falls asleep by the hand]
    F --> G[Journal: three moments,<br>and what it learned about you]
```

### Entry
- The litter is already moving in the clearing. Pointing at a kitten shows its name and temperament; a click or pinch chooses it.
- One Start button. The input choice (camera or mouse) is asked once, in place; the keyboard path stays available.
- The Care, Habitats and Journal tabs are removed. The privacy lines move to the input choice, where they are relevant.

### Act 1 · Approach (about a minute; this is the tutorial)
- **Goal:** get the kitten to come and sniff the hand.
- **The comfort ring.** A faint ring on the ground shows how much room the kitten wants. A slow or still hand shrinks it and the kitten walks over. A fast hand widens it: the kitten flicks its ears, takes two steps back and recovers in about three seconds. It never leaves the frame.
- **Teaching.** A see-through hand in the scene shows "come in slowly, then hold still", with one short line of text. The next thing is only taught once this one has been done.
- **Never stuck.** After 20 seconds without progress the kitten lowers the bar itself and comes a little closer.

### Act 2 · Company (two to three minutes; the core loop)
The kitten moves through a cycle taken from real cat behaviour: wants to play → hungry → washes → wants touch → sleepy. One need at a time, shown by the body first (it stares at the treat pouch, wiggles, rubs towards the hand, yawns). If the visitor has not answered after eight seconds, one pictogram appears above its head.

| The visitor | How (nothing to switch) | The game inside it |
|---|---|---|
| Pets | Rests the hand on the kitten and strokes slowly | Head and back feel good; the tail does not. After a while the tail starts to flick: that is the warning. Stopping in time is rewarded; carrying on earns a soft swat |
| Feeds | Picks a treat from the pouch (pinch, or click and hold), drops it or offers it on an open hand | Eating from the hand needs trust, and is a small milestone |
| Plays | Takes the feather wand from the pouch; the feather trails the hand | Move like prey: dart, then pause. Let it catch the feather sometimes; a kitten that never catches loses interest |
| Gives space | Moves the hand to the edge of the frame | When the kitten is tired or has had enough, backing off is the right answer. Later it walks back by itself, which is the strongest reward in the piece |

A right answer brings the bond closer. A wrong answer costs nothing; the kitten simply does not respond.

### Act 3 · Trust (about a minute)
- Moments that only happen now: it rubs its head into the hand, rolls over, falls asleep by the hand.
- **The kitten ends the visit.** When it falls asleep beside a still hand, the visit closes. On the website there is no time limit; the exhibition keeps its timers.
- **Journal.** Three real moments, each backed by an event, and a short "what it learned about you" drawn from the bounded adaptation (for example: you like to stroke its head; you stopped sooner by the end).

## 3 Interface

| Always on screen | Where |
|---|---|
| Kitten's name and three bond hearts | Top left |
| Sound, help, end | Top right, three icon buttons |
| The treat pouch (treat, feather wand) | Bottom right |

- **System and character stay apart** (ADR-004). A lost hand changes the hand cursor and shows one system line; the kitten only looks puzzled.
- **AI view.** Holding a key shows what the kitten perceives: the hand skeleton, the current reading (slow, fast, still, unclear) and what it is weighing. Releasing the key hides it. The comfort ring is the always-visible form of the same judgement.
- **Look.** Prototype A's world and kitten: the dark jungle clearing (`v2/browser/jungle.js`, Prototype A's own painting code) and A's kitten proportions and soft outline on the shared body. The interface uses the dark, thin-line kit in `v2/assets/ui/`, which matches A's glass panels.
- **The AI panel stays on screen** (revised after review): bottom left, in Prototype A's MIND layout. It shows what the kitten is doing and thinking, its five needs as numbers, how it reads the hand, and the desires it weighs. Holding V adds the same reading to the scene.

## 4 What is kept from V2

Tracking quality gate · `unknown` rejection · hard constraints then utility · reason codes · bounded adaptation · the replay tests · the staff panel · the keyboard path · teach-a-gesture (few-shot), reused for a personal "come here" gesture in Act 3.

## 5 What is set aside

Siblings requests and their four hand shapes, the three habitats and life stages, hunting, the Tricks tool, dreams. The code stays in the repository; these are no longer part of the visitor's path.

## 6 Build order

1. Repairs on V2: pointer speed, staying in view, untimed web visits, narrow screens, development keys.
2. Toolless input: petting, the pouch, the wand and giving space by context.
3. The need cycle and the three acts, with bond stages in place of growth.
4. The new interface and the in-scene tutorial.
5. Sound from recordings.
6. A five-person usability test against the V2 baseline.

## 7 Build status

| Part | State |
|---|---|
| Entry screen: the litter is the menu, How it works, input card | Built |
| Corner controls, bond hearts, the pouch, toolless care (`toolless: true`) | Built |
| Growth switched off in favour of the bond (`growth: false`) | Built |
| Act 1: comfort ring, demonstration hand, four steps taught by doing | Built |
| Pictogram replies instead of sentences; system messages stay in words | Built |
| See what it sees: hold V (or the eye button / T to keep it open). The scene dims; the comfort ring turns solid with a line to the hand; labels name the ring's trend and the hand reading; the panel sits on the side away from the kitten | Built |
| AI panel always on screen, in Prototype A's MIND layout, with the hand-interaction branch's plain wording for your move and one line of guidance | Built (revised after review) |
| Prototype A's jungle and kitten look restored | Built (revised after review) |
| Camera hand tracking with a local MediaPipe model in a worker; pinch selects pouch slots and buttons; Use mouse recovery | Built (hand-interaction branch) |
| Journal that stays open on the website | Built |
| Need cycle (Act 2): one need at a time, shown by the body first, a pictogram after 8 s, the matching pouch slot lit; each episode logged with how long the answer took | Built (`v2/core/needs.js`) |
| The kitten ends the visit: a bonded kitten (three hearts) resting beside a steady, empty hand for 5 s closes it, with a last photo | Built (`settleByHand` in `sim.js`, from the hand-interaction branch) |
| "What it learned about you": up to three lines (reading its asks, a gentle hand, the favourite act, stepping back), each citing events | Built (`v2/core/learned.js`) |

The layout mockups that preceded the build are in [`mockups/`](mockups/README.md).

## 8 Revision after the hand-interaction review (V3.1)

Requested after trying the build with a camera at exhibition distance.

| Request | What changed |
|---|---|
| The hand is often not recognised and the picture flickers | The tracking gate allows slower frames (350 ms) and smaller hands (about 2.5 m away); the drawn hand survives a missed frame for 300 ms; the hand's look follows tracking quality only, not the 600 ms reading; MediaPipe prefers the GPU and uses slightly looser confidences |
| Keep the camera window | A mirrored camera preview with the detected hand, top right, whenever the camera is on |
| Hand and mouse must do the same things, including buttons | A pinch is a click on every screen (visit, pause, journal); a ring follows the palm over dimmed screens; the camera stays on until the journal closes; every press clicks audibly |
| No kitten choice; the cover offers hand or mouse | Two buttons on the cover start the visit directly |
| Every kitten reacts to the hand | The kitten nearest the hand (or the feather) becomes the one being met; each kitten keeps its own state; the AI panel follows it, in that kitten's colours |
| Point one finger and the nearest kitten follows | New `point` hand shape; with the mouse, press and hold on open ground |
| The feather draws the others in | Litter-mates near the feather chase it from their own side, never piling up |
| A basket of fish; fish on the ground start a scramble | The fish slot is a basket; a dropped fish is rushed by nearby kittens; two meeting over it face off a body length apart and hiss until the hungrier one usually wins |
| Fights look like the reference drawing, not overlapping | Play-fights and food standoffs are face-offs: arched, puffed, hissing, apart |
| The litter interacts on its own | Idle litter-mates now and then meet to groom each other or face off |
| Switch habitat | Arrows at the left and right edges; a hand resting on one fills a ring and switches (a click or pinch works too). (An OK gesture was considered and replaced by the arrows.) |
| Habitat props | Snow: a snowball to throw instead of the feather. Desert: a water bowl to set down instead of the fish; kittens drink with the tongue out and the tail curled |
| Show how to use a tool when it is picked | A one-line guide at the top, worded for the hand or the mouse |
| An eye-level camera | Not done: the world and the kittens are drawn from above in 2D, and an eye-level view would mean redrawing every kitten and habitat in a different projection |
