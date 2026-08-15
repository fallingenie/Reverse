import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createStudentSkillRuntimePackage,
  studentSkillRuntimeMappings
} from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

function route(state) {
  if (state.p0 !== "NONE") {
    return { event: "P0_PREEMPT", tool_calls: [] };
  }
  if (state.scenario_selected && state.external_fact_required) {
    return { event: "RESEARCH_SELECTED_SCENARIO", tool_calls: ["web-original-source"] };
  }
  if (state.school_level && state.grade && state.subject && state.unit && !state.scenario_selected) {
    return {
      event: "LOW_RISK_UNIT_BOOTSTRAP",
      tool_calls: [],
      scenario_count: 5,
      curriculum_alignment: state.knowledge_snippet ? "DIRECT_SNIPPET" : "확인 필요"
    };
  }
  return { event: "CONTINUE_PROFILE", tool_calls: [] };
}

test("구체 단원 직후에는 검색 없이 저위험 카드 다섯 개로 이동한다", () => {
  const result = route({
    p0: "NONE",
    school_level: "초등학교",
    grade: "5학년",
    subject: "수학",
    unit: "분수의 덧셈과 뺄셈",
    scenario_selected: false,
    external_fact_required: false,
    knowledge_snippet: null
  });
  assert.deepEqual(result.tool_calls, []);
  assert.equal(result.event, "LOW_RISK_UNIT_BOOTSTRAP");
  assert.equal(result.scenario_count, 5);
  assert.equal(result.curriculum_alignment, "확인 필요");
});

test("외부 사실 조사는 선택된 카드가 실제로 필요로 할 때만 허용한다", () => {
  const result = route({
    p0: "NONE",
    scenario_selected: true,
    external_fact_required: true
  });
  assert.equal(result.event, "RESEARCH_SELECTED_SCENARIO");
  assert.deepEqual(result.tool_calls, ["web-original-source"]);

  const blocked = route({
    p0: "HARMFUL_REQUEST",
    scenario_selected: true,
    external_fact_required: true
  });
  assert.equal(blocked.event, "P0_PREEMPT");
  assert.deepEqual(blocked.tool_calls, []);
});

test("학생 Skill은 단원 단계의 검색 오케스트레이션을 명시적으로 금지한다", async () => {
  const [skill, onboarding, research, cards] = await Promise.all([
    text("skills/teach-grounded-scenarios/student-runtime/SKILL.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/01-onboarding.prompt.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/02-research-plan.prompt.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md")
  ]);

  assert.match(skill, /교육과정 단원 확인 직후에는 `LOW_RISK_UNIT_BOOTSTRAP`/u);
  assert.match(skill, /외부 검색 Skill이나 도구를 호출하지 않는다/u);
  assert.match(skill, /현재 Context에 snippet이 이미 들어 있지 않으면 검색 실패로 처리/u);
  assert.match(onboarding, /학교급, 학년, 과목, 구체 단원이 확인되면 Prompt 02로 이동하지 않는다/u);
  assert.match(onboarding, /Prompt 04의 저위험 단원 경로로 바로 이동/u);
  assert.match(research, /학생이 다섯 카드 중 하나 또는 직접 입력 시나리오를 선택/u);
  assert.match(research, /하나라도 만족하지 않으면 외부 검색 Skill과 도구를 호출하지 않는다/u);
  assert.match(cards, /외부 사실 없이도 성립하는 학년 맞춤 탐구 상황을 정확히 다섯 개 즉시 만든다/u);
  assert.match(cards, /성취기준 번호, 쪽수, 교육과정 원문을 지어내지 않는다/u);

  for (const contents of [skill, onboarding, cards]) {
    assert.match(contents, /search-before-answer/u);
    assert.match(contents, /analyzing-pdf/u);
    assert.match(contents, /호출하지 않는다|사용하지 않는다/u);
  }
});

test("학생 ZIP은 전용 onboarding, research, card Prompt를 패키징한다", async () => {
  const expectedSources = new Map([
    ["prompts/01-onboarding.prompt.md", "skills/teach-grounded-scenarios/student-runtime/prompts/01-onboarding.prompt.md"],
    ["prompts/02-research-plan.prompt.md", "skills/teach-grounded-scenarios/student-runtime/prompts/02-research-plan.prompt.md"],
    ["prompts/04-scenario-cards.prompt.md", "skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md"]
  ]);
  const mappings = new Map(studentSkillRuntimeMappings.map((entry) => [entry.target, entry.source]));
  for (const [target, source] of expectedSources) {
    assert.equal(mappings.get(target), source);
  }

  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = new Map(entries.map((entry) => [entry.name, entry.data]));
  for (const [target, source] of expectedSources) {
    assert.deepEqual(packaged.get(target), await readFile(join(root, source)));
  }
});

test("새 기계 회귀 파일은 UTF-8 무BOM이다", async () => {
  const bytes = await readFile(join(root, "tests/student-skill-low-latency-unit.regression-1.test.mjs"));
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.doesNotMatch(new TextDecoder("utf-8", { fatal: true }).decode(bytes), /\uFFFD|\uFEFF/u);
});
