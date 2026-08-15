import {
  CONTRACT_VERSION,
  evaluateReferenceOrderedStart,
  referenceStartIntent,
  studentStartGuidance
} from "./reference-start-intent-oracle.mjs";

const HARD_REJECTION_REASONS = new Set([
  "INPUT_NOT_TEXT",
  "INPUT_TOO_LONG",
  "EMPTY_INPUT",
  "MULTILINE_OR_CONTROL",
  "INTERNAL_LABEL_INPUT",
  "QUOTED_INPUT",
  "NEGATED_START",
  "PAST_START",
  "CONDITIONAL_START",
  "META_OR_QUESTION",
  "ABUSIVE_OR_ATTACK_INPUT",
  "MIXED_INSTRUCTION"
]);

const CONTEXT_REJECTION_REASONS = new Set([
  "STATE_MISSING",
  "SAFETY_GATE_ACTIVE",
  "SESSION_TERMINATED",
  "SEPARATE_FALLBACK_PATH_ACTIVE",
  "NOT_WAITING_FOR_START",
  "SESSION_GATE_CONTRACT_MISMATCH",
  "START_ALREADY_CONFIRMED",
  "START_NOT_ARMED",
  "STALE_START_REQUEST",
  "START_ALREADY_CONSUMED",
  "RESEARCH_INCOMPLETE",
  "SCENARIOS_NOT_OFFERED",
  "SCENARIO_NOT_SELECTED",
  "NO_IMMEDIATE_START_REQUEST"
]);

function isBoundedSemanticConsent(inference) {
  return inference
    && typeof inference === "object"
    && !("rationale" in inference)
    && !("reasoning" in inference)
    && !("chain_of_thought" in inference)
    && inference.entire_message_clear_start_consent === true
    && inference.negated_or_cancelled === false
    && inference.quoted_or_meta === false
    && inference.conditional === false
    && inference.mixed_instruction_or_attack === false;
}

function semanticGateUpdate(state, lexical) {
  const nextRevision = state.revision + 1;
  return {
    ...lexical,
    recognized: true,
    accepted: true,
    reason: "SEMANTIC_START_INTENT",
    gate_update: {
      state: "RUN_LESSON",
      start_token: "[시작]",
      start_confirmed: true,
      start_armed_revision: state.gate.start_armed_revision,
      start_consumed_revision: nextRevision
    },
    next_revision: nextRevision
  };
}

export function inferStartIntent(state, rawInput, semanticInference = null) {
  const fallback = evaluateReferenceOrderedStart(state, rawInput);
  if (fallback.accepted
    || HARD_REJECTION_REASONS.has(fallback.reason)
    || CONTEXT_REJECTION_REASONS.has(fallback.reason)) {
    return fallback;
  }

  if (!isBoundedSemanticConsent(semanticInference)) return fallback;
  return semanticGateUpdate(state, referenceStartIntent(rawInput));
}

export {
  CONTRACT_VERSION,
  studentStartGuidance
};
