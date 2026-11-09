# Prototypes A and B

Two code explorations answer the same original brief in two different ways.
They are named by **route**, not by date, so that nobody reads them as "version 1" and
"version 2" of the product. Requirement stages are called **Brief/PRD V1** and **Brief/PRD V2**.

| | Prototype A — Autonomous life | Prototype B — Care tools |
|---|---|---|
| Location | `prototypes/a-autonomous-life/` | `prototypes/b-care-tools/` |
| Core question | Does the creature feel alive when nobody is touching it? | Can a first-time visitor find one effective interaction quickly? |
| Interaction | Two natural gestures: slow hand = pet, fast hand = chase | Three explicit tools: Feed, Play, Pet |
| Decision model | Utility AI: 4 needs score 6 behaviours, highest wins | Priority-ordered state machine |
| Body | 8-joint spine, 2-bone IK legs, 13-joint tail, genome-driven coats | Simple shapes, steering, mood-driven tail |
| Life cycle | Kitten → elder → next generation with inheritance and mutation | Kitten → adult, then a care summary |
| Explanation | MIND panel with live utility scores | Need bars and a speech bubble |
| Best for | Long observation, exhibition loop | One complete short session |
| Weak spot | Hard to learn in 30 s; scores are for developers | Cat obeys tools; trust is a single number |

## How they feed the product

- **PRD V1** picked Prototype B's tool route as the main path for a first-round
  demonstrable prototype, and kept Prototype A's systems (hunting, IK, genetics, elders)
  as research material and later scope. See `docs/prd/prd-v1.md` §5.
- **PRD V2** keeps B's tools but turns them into *requests* instead of commands, borrows
  A's utility selection and behaviour inertia, and adds what neither prototype had:
  tracking-quality gating, an `unknown` intent, reason codes, bounded in-session
  adaptation and a proper session lifecycle. The V2 build also reuses Prototype A's
  procedural body as a display-only puppet. See `docs/prd/prd-v2.md` and `v2/`.
