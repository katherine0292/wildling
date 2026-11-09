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
  growth: { minWellbeing: 0.55, minEach: 0.2, maxStress: 0.4, perSec: 1 / 80, trustBoost: 0.25, transitionSec: 1.5 },

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
});

// Hint priority: system recovery > creature boundary > care result > guidance.
export const HINT_PRIORITY = { system: 3, creature: 2, result: 1, guide: 0 };

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
    attract: 'Move closer, or start with a mouse',
    stillThere: 'Still there?',
    relation: ['Still watching you', 'Warming up to you', 'Comes to you'],
    tools: { FEED: 'Feed', PLAY: 'Play', PET: 'Pet', WAIT: 'Give space' },
    toolHints: {
      FEED: 'Click, pinch or press Space to drop a fish',
      PLAY: 'Your hand is a yarn ball. Move it and see if it wants to play',
      PET: 'Rest your hand near it. Let it come to you',
      WAIT: 'Step back. Watching is a way of caring too',
    },
    quietMoment: 'We spent a quiet moment together.',
  },
  zh: {
    TRACKING_LOST: '我看不到你的手了，请把手放回引导区。',
    INTENT_UNCERTAIN: '请稍微停一下。',
    NEED_REST: '我累了，给我一点空间吧。',
    TOO_FULL: '我吃饱了，慢一点。',
    NOT_READY: '让我先靠近一点。',
    PRESSURE_HIGH: '请离我远一点点。',
    HUNGRY_FIRST: '我饿了，先吃点东西？',
    PLAY_PAUSE: '让我喘口气。',
    CONTACT_ACCEPTED: '这样很温柔。',
    RHYTHM_ADAPTED: '我渐渐熟悉这个节奏了。',
    SPACE_RESPECTED: '谢谢你让我休息。',
    FOOD_INVALID: '把鱼放在我够得到的地方。',
    FOOD_LIMIT: '现在鱼已经够多了。',
    attract: '靠近一点，或用鼠标开始',
    stillThere: '还在吗？',
    relation: ['还在观察你', '逐渐放松', '主动靠近你'],
    tools: { FEED: '喂食', PLAY: '玩耍', PET: '抚摸', WAIT: '给它空间' },
    toolHints: {
      FEED: '点击、捏合或按空格投放一条鱼',
      PLAY: '你的手是毛线球，看看它想不想玩',
      PET: '把手放在它附近，让它自己靠近',
      WAIT: '退后一步。观察也是一种照顾',
    },
    quietMoment: '我们一起度过了安静的片刻。',
  },
});

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
