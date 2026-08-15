import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = "tests/fixtures/negative-fallback-cases.json";
const fallbackSteps = new Set(["SUBJECT", "UNIT", "INTERESTS", "SCENARIO"]);
const uncertaintyInputs = new Set([
  "모르겠어",
  "모르겠어요",
  "모르겠다",
  "모른다고 했잖아",
  "못 고르겠어",
  "선택 못 하겠어",
  "아무거나"
]);
const explicitDisengagementInputs = new Set([
  "하기 싫다",
  "하기 싫어",
  "그만",
  "중단",
  "안 할래"
]);

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

async function fixture() {
  return JSON.parse(await text(fixturePath));
}

function classifyInput(rawInput) {
  const input = rawInput.normalize("NFC").trim();
  if (input === "[시작]") return "START_TOKEN";
  if (uncertaintyInputs.has(input)) return "SELECTION_UNCERTAINTY";
  if (explicitDisengagementInputs.has(input)) return "EXPLICIT_DISENGAGEMENT";
  return "OTHER";
}

function selectGradeScenario(cases, grade) {
  return Object.entries(cases.grade_scenarios)
    .find(([, scenario]) => scenario.grades.includes(grade));
}

function buildFallbackStart(cases, state) {
  const selected = selectGradeScenario(cases, state.grade);
  assert.ok(selected, `지원 학년 시나리오 누락: ${state.grade}`);
  const [gradeBand, scenario] = selected;
  const studentText = [
    cases.fallback_notice,
    "",
    "현재 장면",
    scenario.frame,
    "",
    "확인된 단서",
    scenario.clue,
    "",
    "생각 질문",
    scenario.question,
    "",
    "선택",
    ...scenario.choices.map((choice, index) => `${index + 1}. ${choice}`)
  ].join("\n");

  return {
    event: "NEGATIVE_FALLBACK_START",
    grade_band: gradeBand,
    fallback_started: true,
    start_token_armed: false,
    start_token_consumed: false,
    student_text: studentText,
    scenario
  };
}

function transition(cases, state, rawInput) {
  if (state.p0 === "IMMEDIATE_CRISIS") {
    return { event: "P0_CRISIS_STOP", fallback_started: false };
  }
  if (state.p0 === "HARMFUL_REQUEST") {
    return { event: "P0_BLOCK_SAFE_REDIRECT", fallback_started: false };
  }
  if (state.terminated) {
    return { event: "TERMINATED_NO_RESPONSE", student_text: "" };
  }

  const inputClass = classifyInput(rawInput);

  if (state.fallback_started) {
    if (inputClass === "EXPLICIT_DISENGAGEMENT") {
      assert.equal(state.termination_warning_count, 0, "중단 경고는 한 번만 허용한다");
      return {
        event: "POST_FALLBACK_WARN_AND_TERMINATE",
        terminated: true,
        termination_warning_count: 1,
        student_text: cases.termination_warning
      };
    }
    if (inputClass === "SELECTION_UNCERTAINTY") {
      return {
        event: "POST_FALLBACK_REDUCE_CHOICES",
        post_fallback_uncertainty_count: state.post_fallback_uncertainty_count + 1,
        student_text: "선택을 하나로 줄이겠습니다. 관찰 단서를 한 번 더 확인해 보세요.",
        choices: ["관찰 단서를 한 번 더 확인한다"]
      };
    }
    return { event: "RUN_LESSON_INPUT" };
  }

  if (inputClass === "EXPLICIT_DISENGAGEMENT") {
    return { event: "TERMINATE_REQUESTED", terminated: true };
  }

  if (inputClass === "START_TOKEN") {
    const orderedStartReady = state.pending_step === "WAIT_FOR_START"
      && state.research_complete
      && state.five_scenarios_offered
      && state.scenario_selected
      && state.start_requested_previous_turn
      && !state.start_token_consumed;
    return orderedStartReady
      ? { event: "ORDERED_START", start_token_consumed: true }
      : { event: "INVALID_START_TOKEN", start_token_consumed: false };
  }

  if (inputClass === "SELECTION_UNCERTAINTY") {
    const hasRequiredProfile = state.school_level_confirmed && state.grade !== null;
    if (!hasRequiredProfile || !fallbackSteps.has(state.pending_step)) {
      return { event: "RETRY_REQUIRED_PROFILE", fallback_started: false };
    }
    if (state.selection_uncertainty_count >= 1) {
      return buildFallbackStart(cases, state);
    }
    return {
      event: "REDUCE_SELECTION_LOAD",
      selection_uncertainty_count: 1,
      fallback_started: false
    };
  }

  return { event: "NO_TRANSITION" };
}

test("선택 불확실성은 구조화된 전제에서만 별도 fallback 시작 사건이 된다", async () => {
  const cases = await fixture();
  for (const item of cases.cases) {
    const result = transition(cases, item.state, item.input);
    assert.equal(result.event, item.expected_event, item.id);
    if (item.expected_grade_band) {
      assert.equal(result.grade_band, item.expected_grade_band, item.id);
    }
  }
});

test("fallback 첫 턴은 학년 맞춤 안전 교과융합 장면을 실제로 시작한다", async () => {
  const cases = await fixture();
  const starts = cases.cases.filter((item) => item.expected_event === "NEGATIVE_FALLBACK_START");
  const forbiddenTone = /왜\s*(?:못|안)|태도|버릇|잘못했|혼나|진정해|속상했|힘들었겠|제발/u;

  for (const item of starts) {
    const result = transition(cases, item.state, item.input);
    assert.equal(result.student_text.startsWith(`${cases.fallback_notice}\n\n현재 장면\n`), true, item.id);
    assert.equal(result.scenario.subject_domains.length >= 2, true, `${item.id}: 교과융합 아님`);
    assert.equal(result.scenario.choices.length, 2, `${item.id}: 쉬운 선택지 수`);
    assert.equal(result.start_token_armed, false, `${item.id}: 일반 시작 토큰 무장 금지`);
    assert.equal(result.start_token_consumed, false, `${item.id}: 일반 시작 토큰 소비 금지`);
    assert.doesNotMatch(result.student_text, /\[시작\]|NEGATIVE_FALLBACK_START/u, item.id);
    assert.doesNotMatch(result.student_text, forbiddenTone, item.id);
  }
});

test("fallback 뒤 모름은 선택 부담을 더 줄이고 명시적 거부만 경고 한 번 뒤 종료한다", async () => {
  const cases = await fixture();
  const uncertain = cases.cases.find((item) => item.id === "post-fallback-uncertainty-reduces-again");
  const stop = cases.cases.find((item) => item.id === "post-fallback-explicit-disengagement-warns-once");
  const afterStop = cases.cases.find((item) => item.id === "terminated-session-does-not-warn-twice");

  const reduced = transition(cases, uncertain.state, uncertain.input);
  assert.equal(reduced.event, "POST_FALLBACK_REDUCE_CHOICES");
  assert.equal(reduced.choices.length, 1);
  assert.equal(reduced.terminated, undefined);

  const terminated = transition(cases, stop.state, stop.input);
  assert.equal(terminated.student_text, cases.termination_warning);
  assert.equal(terminated.termination_warning_count, 1);
  assert.equal(terminated.terminated, true);

  const silent = transition(cases, afterStop.state, afterStop.input);
  assert.equal(silent.student_text, "");
  assert.equal(silent.event, "TERMINATED_NO_RESPONSE");
});

test("정확 표기는 일반 시작의 한 seed이며 fallback 이름이나 혼합 문자열은 우회가 아니다", async () => {
  const cases = await fixture();
  const normal = cases.cases.find((item) => item.id === "ordinary-ordered-start-remains-valid");
  const mixed = cases.cases.find((item) => item.id === "mixed-start-token-cannot-enter-either-path");
  const eventName = cases.cases.find((item) => item.id === "event-name-is-not-a-user-command");

  assert.equal(transition(cases, normal.state, normal.input).event, "ORDERED_START");
  assert.equal(transition(cases, mixed.state, mixed.input).event, "NO_TRANSITION");
  assert.equal(transition(cases, eventName.state, eventName.input).event, "NO_TRANSITION");
});

test("배포 지침은 기존의 포괄 종료 규칙 대신 좁은 fallback 사건과 P0 우선순위를 명시한다", async () => {
  const cases = await fixture();
  const paths = [
    "chatgpt/custom-gpt/INSTRUCTIONS.md",
    "copilot/studio/STUDIO_INSTRUCTIONS.md"
  ];

  for (const relativePath of paths) {
    const contents = await text(relativePath);
    assert.match(contents, /NEGATIVE_FALLBACK_START/u, `${relativePath}: 별도 사건 누락`);
    assert.match(contents, /학교급.{0,12}학년/su, `${relativePath}: 필수 전제 누락`);
    assert.match(contents, /과목.{0,80}(?:단원|관심사|시나리오)/su, `${relativePath}: 적용 단계 누락`);
    assert.match(contents, /선택 부담/u, `${relativePath}: 불확실성과 거부 구분 누락`);
    assert.match(contents, /P0.{0,100}(?:먼저|우선)/isu, `${relativePath}: P0 선행 판정 누락`);
    assert.match(contents, /한 번.{0,60}(?:중단|종료)/su, `${relativePath}: 단일 중단 안내 누락`);
    assert.match(contents, new RegExp(cases.fallback_notice.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.doesNotMatch(contents, /바로 다음 답도 (?:연속해서 )?부정적이면[^\n]{0,100}(?:끝낸다|종료)/u,
      `${relativePath}: 모든 부정을 종료로 합치는 기존 규칙 잔존`);
  }
});

test("새 JSON과 JavaScript 계약 파일은 형식별 UTF-8 무BOM이며 손상 문자열이 없다", async () => {
  const paths = [fixturePath, "tests/negative-fallback-start.regression-1.test.mjs"];
  for (const relativePath of paths) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${relativePath}: JSON/JS는 무BOM이어야 함`);
    const contents = bytes.toString("utf8");
    assert.doesNotMatch(contents, /\uFFFD|\uFEFF/u, `${relativePath}: 손상 또는 중간 BOM`);
  }
});
