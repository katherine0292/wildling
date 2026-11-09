// Wildling V2 — parameters and copy.
// Every number here is a PRD V2 starting value, not a measured optimum.
// Tune here only; core modules must not hard-code thresholds.

export const PARAMS = Object.freeze({
  sim: { step: 1 / 60, maxSubsteps: 5, decisionInterval: 0.25, intentInterval: 0.1 },

  // F2-03 tracking quality gate
  quality: {
    maxSampleAgeMs: 200,
    maxMissingRatio: 0.2,
    jumpS: 0.35,          // a jump larger than this within one sample is a tracking error
    holdForFadeMs: 200,
    lostAfterMs: 500,
    stableBeforeWindowMs: 300,
    minHandScale: 0.04,   // palm size in S units below which keypoints are unreliable
    maxHandScale: 0.6,
  },

  // F2-04 pinch
  pinch: { close: 0.25, open: 0.45, holdMs: 100, cooldownMs: 400 },

  // F2-05 intent window and rejection
  intent: {
    windowMs: 600, sampleHz: 20, minCoverage: 0.8,
    topScore: 0.8, margin: 0.2, confirmCycles: 2,
    gentleSpeed: 0.4, fastSpeed: 1.1, nearS: 0.18,
    contactDwell: 0.6, withdrawS: 0.25, withdrawSec: 1.0,
  },

  // F2-06 creature initial state
  creature: {
    fullness: 0.55, energy: 0.8, fun: 0.5, trust: 0.25, stress: 0.15,
    bodyRadius: 0.07, contactRadius: 0.11,
    speed: { explore: 0.08, seek: 0.22, approach: 0.12, play: 0.45, retreat: 0.35 },
  },

  needs: {
    fullnessDecay: 0.004, funDecay: 0.003, energyDecay: 0.003, restGain: 0.035,
    playEnergyDrain: 0.004, calmStressRecovery: 0.02, waitStressRecovery: 0.05,
  },

  // F2-07 utility selection
  utility: { inertia: 0.1, switchMargin: 0.15, minHoldSec: 0.6, requestBoost: 0.25 },

  limits: {
    restEnter: 0.15, restExit: 0.65, restMinSec: 3,
    stressRefuse: 0.65, stressRecover: 0.4,
    playEnergy: 0.35, playStress: 0.4, playPauseAfter: 20,
    hungerBlocksContact: 0.2, fullAt: 0.85,
    groomCooldown: 12, groomSec: 3,
  },

  feed: { maxFood: 3, cooldownMs: 600, eatSec: 1.2, fullness: 0.25, trust: 0.025, foodLifeSec: 30, toolbarBandS: 0.16 },
  play: { fun: 0.12, energy: 0.04, trust: 0.01, minIntervalSec: 1.5, pounceS: 0.06 },
  // Toys for the Play tool (ADR-015). Yarn is the hand itself; the feather trails the hand
  // on a springy string; the ball is thrown and rolls on its own.
  toys: {
    feather: { spring: 60, damping: 4.5, catchBelow: 0.9, missFun: 0.03 },
    ball: { friction: 1.1, throwScale: 1.2, maxThrow: 1.4, batSpeed: 0.75, maxIdleSec: 25 },
  },
  contact: { trustPerSec: 0.02, stressPerSec: 0.08, maxSegmentSec: 6, trustBudgetSec: 12, budgetWindowSec: 60, breakSec: 2 },
  startle: { stress: 0.15, cooldownSec: 2, sustainAfterSec: 2, trustPerSec: 0.01, maxTrustLoss: 0.05 },
  wait: { farS: 0.25, stableSec: 1 },
  rewardCap: { perToolTrustPerMin: 0.06 },

  // F2-12 bounded adaptation
  memory: {
    maxEvents: 20, minSamples: 3, oldWeight: 0.8, minUpdateSec: 10,
    contactDwell: { init: 0.8, min: 0.5, max: 1.2 },
    playTempoScale: { init: 1.0, min: 0.85, max: 1.15 },
    approachRadius: { init: 0.1, min: 0.08, max: 0.12 },
    minContactForDwellSample: 2,
  },

  // F2-13 growth
  // Growth has two sources, both behind the same balanced-needs gate:
  //   a slow passive drift while the kitten is content, and a burst for each completed
  //   act of care. Bursts are capped per cause per minute, so varied care grows fastest
  //   and repeating one action cannot rush the kitten. Units: 1.0 = one chapter.
  growth: {
    minWellbeing: 0.55, minEach: 0.2, maxStress: 0.4, perSec: 1 / 150, trustBoost: 0.25,
    transitionSec: 4,
    burst: { FEED: 0.08, PLAY: 0.04, PET: 0.1, WAIT: 0.06, SOCIAL: 0.09, HUNT: 0.06, GIFT: 0.07 },
    burstCapPerMin: 0.24,
  },

  // Life with the litter (ADR-012). Siblings visit now and then; your kitten decides
  // whether to wrestle, hiss or ignore them. Visitors can invite a sibling over.
  social: {
    visitEverySec: [22, 38], visitTimeoutSec: 12, nearS: 0.32, meetS: 0.16,
    wrestleSec: 3.6, fun: 0.2, energy: 0.06, stressPerSec: 0.02, hissSec: 1.3, hissS: 0.2,
    inviteTimeoutSec: 10, cooldownSec: 8,
    // ADR-017: what the visitor can ask for, and how close the kitten must feel first
    greetSec: 2.8, cuddleSec: 5.5, standoffSec: 2.6,
    startBond: 0.25, cuddleBond: 0.35, friendBond: 0.6,
    pose: { holdMs: 600, cooldownMs: 1500, overS: 0.16 },
  },
  // Critters to chase (juvenile and older) and gifts (adult, once it comes to you).
  hunt: { everySec: [16, 28], lifeSec: 14, pounceS: 0.07, fun: 0.12, energy: 0.05, catchChance: 0.35, cooldownSec: 6, minPhase: 1 },
  // Keepsakes (ADR-016): on the web, a kitten can remember a returning visitor, kept only in
  // that visitor's own browser. In exhibition (kiosk) mode nothing is kept.
  keepsake: { trustPerVisit: 0.06, maxTrustBonus: 0.18 },
  gift: { minPhase: 2, minTrust: 0.6, cooldownSec: 22, fetchSec: 1.4, dropS: 0.12, maxShown: 6 },

  // §10 session
  session: {
    calibrateMaxSec: 20, calibrateStableSec: 1.5,
    offerEndSec: 180, maxActiveSec: 300,
    idleHintSec: 15, idlePauseSec: 30, idleEndSec: 45,
    pauseMaxSec: 60, reflectionSec: 15,
  },

  hint: { repeatSec: 4 },
});

// F2-14 reason codes. `owner` decides where feedback appears:
// system → cursor / tracking indicator; creature → the cat's body; result → both.
export const REASONS = Object.freeze({
  TRACKING_LOST: 'system',
  INTENT_UNCERTAIN: 'system',
  NEED_REST: 'creature',
  TOO_FULL: 'creature',
  NOT_READY: 'creature',
  PRESSURE_HIGH: 'creature',
  HUNGRY_FIRST: 'creature',
  PLAY_PAUSE: 'creature',
  CONTACT_ACCEPTED: 'result',
  RHYTHM_ADAPTED: 'result',
  SPACE_RESPECTED: 'result',
  FOOD_INVALID: 'system',
  FOOD_LIMIT: 'system',
  SIB_FOOD: 'creature',
  SIB_REST: 'creature',
  SIB_TENSE: 'creature',
  SIB_PLAY: 'result',
  GIFT_GIVEN: 'result',
  GROWTH_PAUSED: 'guide',
  RETURNING: 'result',
  NOT_CLOSE_YET: 'creature',
  FRIENDS: 'creature',
  SIB_FRIEND: 'result',
  SIB_CUDDLE: 'result',
  SIB_STANDOFF: 'creature',
});

// Hint priority: system recovery > creature boundary > care result > guidance.
export const HINT_PRIORITY = { system: 3, creature: 2, result: 1, guide: 0 };

// Visitor copy lives in one table per language. Only English ships today; a second
// language is added by adding a sibling table, with no code changes.
export const COPY = Object.freeze({
  en: {
    TRACKING_LOST: "I lost your hand. Hold it in the guide.",
    INTENT_UNCERTAIN: 'Hold still for a moment.',
    NEED_REST: "I'm tired. Give me a little space.",
    TOO_FULL: "I'm full. Let's slow down.",
    NOT_READY: 'Let me come closer first.',
    PRESSURE_HIGH: 'A little more distance, please.',
    HUNGRY_FIRST: "I'm hungry. Food first?",
    PLAY_PAUSE: 'Let me catch my breath.',
    CONTACT_ACCEPTED: 'This feels gentle.',
    RHYTHM_ADAPTED: "I'm getting used to this rhythm.",
    SPACE_RESPECTED: 'Thanks for giving me time to rest.',
    FOOD_INVALID: 'Drop the fish where I can reach it.',
    FOOD_LIMIT: 'That is plenty of fish for now.',
    SIB_FOOD: 'Hss! That fish is mine.',
    SIB_REST: "Hss! I'm napping.",
    SIB_TENSE: 'Hss! Not now.',
    SIB_PLAY: 'Rough and tumble!',
    GIFT_GIVEN: 'I found this for you.',
    RETURNING: 'You came back! I remember you.',
    NOT_CLOSE_YET: "We're not close enough for that yet.",
    FRIENDS: "But we're friends!",
    SIB_FRIEND: 'Friends now!',
    SIB_CUDDLE: 'Warm and cosy.',
    SIB_STANDOFF: 'Hsss! Back off!',
    attract: 'Move closer, or start with a mouse',
    stillThere: 'Still there?',
    relation: ['Still watching you', 'Warming up to you', 'Comes to you'],
    tools: { FEED: 'Feed', PLAY: 'Play', PET: 'Pet', WAIT: 'Give space', LITTER: 'Siblings' },
    toolHints: {
      FEED: 'Click, pinch or press Space to offer a fish',
      PLAY: 'Your hand is a yarn ball. See if it wants to play',
      PET: 'Rest a calm hand nearby. Let it come to you',
      WAIT: 'Step back. Watching is a way of caring too',
      LITTER: 'Point at a sibling and pick what to ask',
    },
    quietMoment: 'We spent a quiet moment together.',
  },
});

// The litter. Visitors choose one kitten; the others stay in the world as ambient
// siblings that never react to the hand. Temperament changes STARTING values only —
// every rule, threshold and boundary is identical for all three kittens.
export const KITTENS = Object.freeze([
  { id: 'ember', name: 'Ember', temperament: 'curious', blurb: 'First to sniff the new hand.', start: {},
    coat: { base: '#d8894a', mark: '#9a4a1c', light: '#f4cf98' }, pattern: 'tabby', eye: '#e2a72a', seed: 4021 },
  { id: 'juniper', name: 'Juniper', temperament: 'shy', blurb: 'Watches from a distance before deciding.', start: { trust: 0.18, stress: 0.22 },
    coat: { base: '#c4c1bb', mark: '#4a4744', light: '#f1efea' }, pattern: 'spotted', eye: '#9cc54a', seed: 7314 },
  { id: 'saffron', name: 'Saffron', temperament: 'playful', blurb: 'Pounces at anything that moves.', start: { fun: 0.38, energy: 0.86 },
    coat: { base: '#d49d4b', mark: '#3a2715', light: '#f3daa2' }, pattern: 'rosette', eye: '#d47b2b', seed: 1187 },
]);
export const DEFAULT_KITTEN = 'ember';

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
