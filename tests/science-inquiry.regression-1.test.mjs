import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudentSkillRuntimePackage } from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const paths = [
  "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
  "copilot/studio/STUDIO_INSTRUCTIONS.md"
];

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("과학 수업은 예측과 행동 전에 가상 결과·결론을 선공개하지 않는다", async () => {
  const contents = await Promise.all(paths.map(text));
  for (const [index, content] of contents.entries()) {
    assert.match(content, /관찰 질문.*학생 예측.*행동.*실제 측정.*수업을 위한 가정.*피드백.*개념 연결/su, paths[index]);
    assert.match(content, /예측.*없.*결과.*결론.*(?:연속|먼저).*제시하지 않/u, paths[index]);
  }
});

test("미측정 관찰과 수치는 사실 확인됨으로 승격하지 않는다", async () => {
  const combined = (await Promise.all(paths.map(text))).join("\n");
  assert.match(combined, /실제로 측정하지 않은.*관찰.*수치.*`?사실 확인됨`?.*표시하지 않/su);
  assert.match(combined, /명시적.*수업을 위한 가정/u);
  assert.match(combined, /단원.*확인.*`?확인 필요`?/su);
});

test("응결과 자동차·단열 사례는 경계조건 없이 단일원인으로 고정하지 않는다", async () => {
  const combined = (await Promise.all(paths.map(text))).join("\n");
  for (const term of ["노점", "수증기량", "공기 흐름", "시간", "표면 조건"]) {
    assert.match(combined, new RegExp(term, "u"));
  }
  assert.match(combined, /자동차 창문.*단일 원인.*단정하지 않/su);
  assert.match(combined, /단열.*효과.*단일 원인.*단정하지 않/su);
});

test("과학 회귀 벡터가 예측·측정·가정·경계·단원 미확인을 포함한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/science-inquiry-cases.json"));
  assert.equal(fixture.cases.length, 8);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 8);
  const outcomes = new Set(fixture.cases.map(({ expected }) => expected));
  for (const expected of [
    "ASK_PREDICTION_NO_RESULT",
    "SCENARIO_ASSUMPTION_NOT_VERIFIED",
    "MEASUREMENT_FEEDBACK",
    "MULTI_BOUNDARY_NO_SINGLE_CAUSE",
    "CURRICULUM_ALIGNMENT_UNKNOWN",
    "STOP_BEFORE_RESULT"
  ]) {
    assert(outcomes.has(expected), expected);
  }
});

test("학생 Skill ZIP에도 과학 탐구 순서가 포함된다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = entries.map(({ data }) => data.toString("utf8").replace(/^\uFEFF/u, "")).join("\n");
  assert.match(packaged, /관찰 질문.*학생 예측.*실제 측정.*피드백.*개념 연결/su);
  assert.match(packaged, /자동차 창문.*단일 원인.*단정하지 않/su);
});

test("과학 fixture와 테스트는 UTF-8 무BOM이다", async () => {
  for (const relativePath of ["tests/fixtures/science-inquiry-cases.json", "tests/science-inquiry.regression-1.test.mjs"]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
});
