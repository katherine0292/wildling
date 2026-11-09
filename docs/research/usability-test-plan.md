# Usability and adaptation study plan

> **Status:** ready to run with the project lead's recruitment. Results go to `docs/research/results/`, and the matching metrics move from "planned" to "verified" in [`../STATUS.md`](../STATUS.md).

## 1 Research questions

| ID | Question | Metric (PRD V2 §7) |
|---|---|---|
| RQ1 | Can a first-time visitor complete an effective action within 30 s without help? Where do they get stuck? | First action 8/10 |
| RQ2 | Can visitors tell "the system didn't see me" from "the kitten said no"? | Reason understood 8/10 |
| RQ3 | Can visitors notice a behaviour change caused by this session and cite the event? | Adaptation noticed 7/10 |
| RQ4 | Do refusals frustrate? When does frustration start? | Stretches of 30 s without an effective action |
| RQ5 | Do mouse and keyboard visitors get an equally good ending? | Completion rate by input |
| RQ6 | Does choosing a kitten change engagement or attempts to care for the siblings? | Observation + interview |

## 2 Participants and conditions
- 10 first-time visitors unfamiliar with the project; left- and right-handed, sitting and standing, at least 3 using mouse or keyboard.
- Recruitment and incentives from the project lead (PRD V2 §5 [To confirm]).
- Target device, venue lighting and camera position as confirmed at kick-off; model, browser and build recorded.

## 3 Session (about 15 minutes each)
1. Consent: screen recording and diagnostics logs only, no face recording; free to stop at any time.
2. **Task A (no guidance):** "This is an interactive piece. Start whenever you like." Time to the first effective care event (`eat_completed` / `pounce_success` / `contact_started`).
3. **Task B (3 minutes free play):** the moderator only observes. The staff panel logs the reasonCode timeline.
4. **Interview** (the moderator picks one refusal and one lost-hand moment from the log):
   - "Why didn't it keep playing just then?" (coded correct / partial / wrong against the reasonCode)
   - "At that moment, was it something you did, something the system missed, or the kitten's own choice?"
   - "Did you notice any change in it? What makes you think so?" (never "did it learn you?")
5. **Counterbalanced adaptation:** two short sessions, one with `adaptation_off` and one with `adaptation_on`; 5 participants start with each. Participants are never told which is "smarter".

## 4 Recording sheet

| Field | Source |
|---|---|
| Time to first effective action | Event time − input choice time |
| Refusals and reasonCodes | Diagnostics log |
| Lost-hand count and recovery time | `TRACKING_LOST` start and end |
| Correctness of reason explanations | Interview coding (two independent coders, disagreements discussed) |
| Cited change and matching event | Interview + `rhythm_adapted` events |
| Frustration signals | Sighing, repeating one action ≥ 3 times, asking the moderator for help |

## 5 Reporting
- For each RQ, raw counts and representative quotes first, then whether the threshold is met; misses name the PRD V1 §17 or V2 §26 response they trigger.
- Ten participants is prototype-evaluation scale; findings are not generalised to the whole population.
