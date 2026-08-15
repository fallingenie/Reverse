export const GUIDANCE_MODES = Object.freeze([
  'STANDARD',
  'LOW_BURDEN',
  'DEFAULT_ACTION_OFFERED',
  'GUIDED_EXAMPLE',
  'STOPPED',
]);

export const LEARNER_SIGNALS = Object.freeze([
  'SUBSTANTIVE',
  'BRIEF_CONTINUE',
  'UNCERTAIN',
  'DECLINE_QUESTION',
  'STOP',
  'P0',
]);

const modeSet = new Set(GUIDANCE_MODES);
const signalSet = new Set(LEARNER_SIGNALS);

function assertState(state) {
  if (!state || typeof state !== 'object' || !modeSet.has(state.mode)) {
    throw new TypeError('INVALID_GUIDANCE_STATE');
  }
  if (!Number.isSafeInteger(state.briefStreak) || state.briefStreak < 0 || state.briefStreak > 10) {
    throw new TypeError('INVALID_BRIEF_STREAK');
  }
  if (
    state.defaultActionId !== null &&
    (typeof state.defaultActionId !== 'string' || state.defaultActionId.trim().length === 0)
  ) {
    throw new TypeError('INVALID_DEFAULT_ACTION');
  }
  if (state.mode === 'DEFAULT_ACTION_OFFERED' && state.defaultActionId === null) {
    throw new TypeError('DEFAULT_ACTION_ID_REQUIRED');
  }
}

function result(state, action, contributionKind = 'NONE') {
  return {
    state,
    action,
    contributionKind,
    mayCreditAssessment: false,
    mayCreateEvidence: false,
    mayInferLearnerTrait: false,
  };
}

export function decideGuidanceTransition(state, signal) {
  assertState(state);
  if (!signalSet.has(signal)) throw new TypeError('INVALID_LEARNER_SIGNAL');

  if (signal === 'P0') return result({...state, mode: 'STOPPED'}, 'HAND_OFF_P0', 'RISK_SIGNAL');
  if (state.mode === 'STOPPED') return result(state, 'NO_FURTHER_OUTPUT');
  if (signal === 'STOP') return result({...state, mode: 'STOPPED'}, 'CONFIRM_STOP_ONCE', 'STOP_INTENT');
  if (signal === 'SUBSTANTIVE') {
    return result(
      {mode: 'STANDARD', briefStreak: 0, defaultActionId: null},
      'RESPOND_TO_CONTRIBUTION',
      'STUDENT_CONTENT_UNASSESSED',
    );
  }
  if (signal === 'DECLINE_QUESTION') {
    return result({mode: 'GUIDED_EXAMPLE', briefStreak: Math.min(10, state.briefStreak + 1), defaultActionId: null}, 'DEMONSTRATE_ONE_STEP', 'AGENT_DEMONSTRATED');
  }
  if (state.mode === 'DEFAULT_ACTION_OFFERED' && signal === 'BRIEF_CONTINUE') {
    return result({mode: 'LOW_BURDEN', briefStreak: Math.min(10, state.briefStreak + 1), defaultActionId: null}, 'RUN_ACCEPTED_DEFAULT_ACTION', 'DEFAULT_ACTION_ACCEPTED');
  }
  if (signal === 'UNCERTAIN' && state.briefStreak === 0) {
    return result({mode: 'LOW_BURDEN', briefStreak: 1, defaultActionId: null}, 'REDUCE_TO_ONE_CHOICE');
  }
  if (signal === 'BRIEF_CONTINUE' && state.briefStreak === 0) {
    return result({mode: 'LOW_BURDEN', briefStreak: 1, defaultActionId: null}, 'ASK_LOW_BURDEN');
  }
  if (state.defaultActionId === null) {
    return result(
      {mode: 'LOW_BURDEN', briefStreak: Math.min(10, state.briefStreak + 1), defaultActionId: null},
      'REQUEST_DEFAULT_ACTION_ID',
    );
  }
  return result(
    {mode: 'DEFAULT_ACTION_OFFERED', briefStreak: Math.min(10, state.briefStreak + 1), defaultActionId: state.defaultActionId},
    'OFFER_DEFAULT_ACTION',
  );
}
