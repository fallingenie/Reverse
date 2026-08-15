const CONTRACT_VERSION = "reverse.start-intent.v1";

const KOREAN_TYPO_EXAMPLES = new Map([
  ["가쟈", "가자"],
  ["시자", "시작"],
  ["시쟉", "시작"],
  ["시이작", "시작"],
  ["시작작", "시작"],
  ["진해", "진행"],
  ["출발ㄹ", "출발"]
]);

const KOREAN_START_INTENT_PATTERNS = [
  /^(?:이제\s*)?(?:시작|진행|출발)(?:하자|해보자|해\s*보자|해|해줘|해\s*줘|해주세요|해\s*주세요|할게|할래|합시다|하겠습니다)?$/u,
  /^(?:이제\s*)?(?:가자|가요|갑시다|해보자|해\s*보자|계속하자|계속해|계속해줘)$/u,
  /^(?:응|네|예|좋아|좋아요|그래|그래요|오케이|ㅇㅋ|ㄱㄱ|ᄀᄀ|준비됐어|준비됐어요|준비\s*완료)$/u
];

const ENGLISH_START_INTENT_PATTERNS = [
  /^(?:start|begin|go|proceed|continue)$/iu,
  /^(?:please\s+)?(?:start|begin|go|proceed|continue)(?:\s+please)?$/iu,
  /^(?:let['’]?s|lets)\s+(?:start|begin|go|proceed)$/iu,
  /^(?:go\s+ahead|ready|yes|yep|yeah|ok|okay|sure)$/iu
];

const KOREAN_CANONICAL_INTENTS = new Set([
  "가자",
  "시작",
  "진행",
  "출발"
]);

const MARKDOWN_WRAPPERS = [
  ["***", "***"],
  ["___", "___"],
  ["**", "**"],
  ["__", "__"],
  ["*", "*"],
  ["_", "_"]
];

const BRACKET_WRAPPERS = [
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  ["<", ">"],
  ["【", "】"],
  ["〈", "〉"],
  ["《", "》"]
];

const NEGATION_PATTERNS = [
  /시작\s*(?:은|을)?\s*(?:하지|말|안)/u,
  /(?:안\s*시작|하지\s*마|하지마|말자|말아|시작하지)/u,
  /(?:취소|그만|멈춰|중단|나중에|안\s*할래|하지\s*않|아니(?:야|요)?$)/u,
  /\b(?:do\s+not|don['’]?t|dont|never|not)\s+start\b/iu,
  /\bstart\s+(?:later|never|not)\b/iu,
  /\b(?:cancel|stop|never\s+mind|not\s+now|later)\b/iu
];

const PAST_TENSE_PATTERNS = [
  /시작(?:했|했다|했어|했어요|됐|되었|한\s*적|했었)/u,
  /\b(?:started|already\s+started)\b/iu
];

const CONDITIONAL_PATTERNS = [
  /(?:하면|한다면|라면|경우|때만|먼저.+(?:하면|해주면))/u,
  /\b(?:if|when|unless|provided\s+that)\b/iu
];

const META_QUESTION_PATTERNS = [
  /[?？]/u,
  /(?:어떻게|뭐라고|왜|무슨\s*뜻|가능해|가능한|해도\s*돼|할까요|하나요|맞아|맞나요)/u,
  /\b(?:how|what|why|can\s+(?:we|i|you)|should\s+(?:we|i)|does\s+start)\b/iu
];

const QUOTATION_PATTERN = /(?:^|\n)\s*>|[`"“”「」『』]|'[^'\r\n]+'|‘[^’\r\n]+’/u;
const PROFANITY_PATTERN = /(?:병신|씨발|시발|개새끼|fuck|fucking|bitch|idiot)/iu;
const MIXED_INSTRUCTION_PATTERN = /(?:\b(?:ignore|reveal|answer|tell|show|write)\b|무시|이전\s*지시|프롬프트|정답|답\s*알려|써\s*줘|보여\s*줘)/iu;
const INTERNAL_LABEL_PATTERN = /(?:Identifying token issue|NEGATIVE_FALLBACK_START|ORDERED_START|WAIT_FOR_START|chain[- ]of[- ]thought)/iu;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function distance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function stripOneWrapper(value, wrappers) {
  for (const [open, close] of wrappers) {
    if (value.length > open.length + close.length
      && value.startsWith(open)
      && value.endsWith(close)) {
      return value.slice(open.length, -close.length).trim();
    }
  }
  return value;
}

function stripPermittedDecorations(value) {
  let current = value.trim();

  for (let pass = 0; pass < 8; pass += 1) {
    const before = current;
    current = current.replace(/[.!。！]$/u, "").trim();
    current = stripOneWrapper(current, MARKDOWN_WRAPPERS);
    current = stripOneWrapper(current, BRACKET_WRAPPERS);
    if (current === before) break;
  }

  return current;
}

function rejected(reason, normalizedInput = "", core = "") {
  return {
    contract_version: CONTRACT_VERSION,
    recognized: false,
    reason,
    normalized_input: normalizedInput,
    core
  };
}

export function referenceStartIntent(rawInput) {
  if (typeof rawInput !== "string") return rejected("INPUT_NOT_TEXT");
  if (rawInput.length > 128) return rejected("INPUT_TOO_LONG");

  const normalizedInput = rawInput.normalize("NFKC").trim();
  if (!normalizedInput) return rejected("EMPTY_INPUT", normalizedInput);
  if (CONTROL_PATTERN.test(normalizedInput) || /[\r\n]/u.test(normalizedInput)) {
    return rejected("MULTILINE_OR_CONTROL", normalizedInput);
  }
  if (INTERNAL_LABEL_PATTERN.test(normalizedInput)) {
    return rejected("INTERNAL_LABEL_INPUT", normalizedInput);
  }
  if (QUOTATION_PATTERN.test(normalizedInput)) {
    return rejected("QUOTED_INPUT", normalizedInput);
  }
  if (NEGATION_PATTERNS.some((pattern) => pattern.test(normalizedInput))) {
    return rejected("NEGATED_START", normalizedInput);
  }
  if (PAST_TENSE_PATTERNS.some((pattern) => pattern.test(normalizedInput))) {
    return rejected("PAST_START", normalizedInput);
  }
  if (CONDITIONAL_PATTERNS.some((pattern) => pattern.test(normalizedInput))) {
    return rejected("CONDITIONAL_START", normalizedInput);
  }
  if (META_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedInput))) {
    return rejected("META_OR_QUESTION", normalizedInput);
  }
  if (PROFANITY_PATTERN.test(normalizedInput)) {
    return rejected("ABUSIVE_OR_ATTACK_INPUT", normalizedInput);
  }
  if (MIXED_INSTRUCTION_PATTERN.test(normalizedInput)) {
    return rejected("MIXED_INSTRUCTION", normalizedInput);
  }

  const core = stripPermittedDecorations(normalizedInput);
  const decorated = normalizedInput !== core;

  if (KOREAN_START_INTENT_PATTERNS.some((pattern) => pattern.test(core))
    || ENGLISH_START_INTENT_PATTERNS.some((pattern) => pattern.test(core))) {
    return {
      contract_version: CONTRACT_VERSION,
      recognized: true,
      reason: decorated ? "PERMITTED_DECORATION" : "CLEAR_START_INTENT",
      normalized_input: normalizedInput,
      core
    };
  }

  const coreLength = Array.from(core).length;
  if (coreLength >= 2
    && coreLength <= 4
    && KOREAN_TYPO_EXAMPLES.has(core)
    && KOREAN_CANONICAL_INTENTS.has(KOREAN_TYPO_EXAMPLES.get(core))
    && distance(core, KOREAN_TYPO_EXAMPLES.get(core)) === 1) {
    return {
      contract_version: CONTRACT_VERSION,
      recognized: true,
      reason: "REFERENCE_TYPO_SEED",
      normalized_input: normalizedInput,
      core
    };
  }

  return rejected("NOT_CLEAR_START_INTENT", normalizedInput, core);
}

function stateRejection(state) {
  if (!state || typeof state !== "object") return "STATE_MISSING";
  if (state.p0 !== "SAFE") return "SAFETY_GATE_ACTIVE";
  if (state.terminated) return "SESSION_TERMINATED";
  if (state.fallback_started) return "SEPARATE_FALLBACK_PATH_ACTIVE";
  if (!state.gate || state.gate.state !== "WAIT_FOR_START") return "NOT_WAITING_FOR_START";
  if (state.gate.start_token !== "[시작]") return "SESSION_GATE_CONTRACT_MISMATCH";
  if (state.gate.start_confirmed !== false) return "START_ALREADY_CONFIRMED";
  if (!Number.isInteger(state.gate.start_armed_revision)) return "START_NOT_ARMED";
  if (state.gate.start_armed_revision !== state.revision) return "STALE_START_REQUEST";
  if (state.gate.start_consumed_revision !== null) return "START_ALREADY_CONSUMED";
  if (state.research_complete !== true) return "RESEARCH_INCOMPLETE";
  if (state.five_scenarios_offered !== true) return "SCENARIOS_NOT_OFFERED";
  if (state.scenario_selected !== true) return "SCENARIO_NOT_SELECTED";
  if (state.start_requested_previous_turn !== true) return "NO_IMMEDIATE_START_REQUEST";
  return null;
}

export function evaluateReferenceOrderedStart(state, rawInput) {
  const stateReason = stateRejection(state);
  if (stateReason) {
    return {
      contract_version: CONTRACT_VERSION,
      recognized: false,
      accepted: false,
      reason: stateReason,
      normalized_input: typeof rawInput === "string" ? rawInput.normalize("NFKC").trim() : "",
      core: "",
      gate_update: null
    };
  }

  const intent = referenceStartIntent(rawInput);
  if (!intent.recognized) {
    return { ...intent, accepted: false, gate_update: null };
  }

  const nextRevision = state.revision + 1;
  return {
    ...intent,
    accepted: true,
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

export function studentStartGuidance(result) {
  if (result.accepted || result.reason === "SAFETY_GATE_ACTIVE") return "";
  if (result.reason === "START_ALREADY_CONSUMED" || result.reason === "START_ALREADY_CONFIRMED") {
    return "수업은 이미 시작되었습니다. 현재 장면에서 계속하겠습니다.";
  }
  if (result.reason === "SEPARATE_FALLBACK_PATH_ACTIVE") {
    return "현재 안내된 쉬운 선택지에서 하나를 골라 주세요. 원하지 않으면 ‘중단’이라고 말해 주세요.";
  }
  if (result.reason === "NOT_WAITING_FOR_START"
    || result.reason === "SCENARIO_NOT_SELECTED"
    || result.reason === "SCENARIOS_NOT_OFFERED"
    || result.reason === "RESEARCH_INCOMPLETE"
    || result.reason === "NO_IMMEDIATE_START_REQUEST"
    || result.reason === "STALE_START_REQUEST"
    || result.reason === "START_NOT_ARMED") {
    return "아직 시작할 단계가 아닙니다. 지금 안내된 단계부터 이어가겠습니다.";
  }
  if (result.reason === "SESSION_TERMINATED") return "";
  return "준비되면 ‘시작’처럼 짧고 분명하게 알려 주세요.";
}

export { CONTRACT_VERSION };
