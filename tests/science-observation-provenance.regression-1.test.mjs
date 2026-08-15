import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudentSkillRuntimePackage } from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const commonPaths = [
  "skills/teach-grounded-scenarios/SKILL.md",
  "skills/teach-grounded-scenarios/prompts/04-scenario-cards.prompt.md",
  "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md"
];
const studentPaths = [
  "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md"
];
const studioPath = "copilot/studio/STUDIO_INSTRUCTIONS.md";

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("공통·학생·Studio가 같은 과학 탐구 턴 순서를 사용한다", async () => {
  const contents = await Promise.all([...commonPaths, ...studentPaths, studioPath].map(text));
  for (const [index, content] of contents.entries()) {
    assert.match(content, /관찰 질문 1개.*예측.*행동.*2개.*실제 측정.*수업을 위한 가정.*피드백.*개념 연결/su, [...commonPaths, ...studentPaths, studioPath][index]);
    assert.match(content, /`계속`.*자동 진행.*예측.*선택.*관찰.*아니/su);
  }
});

test("가상 관찰은 같은 블록의 국소 선행 라벨 없이는 출력하지 않는다", async () => {
  const contents = await Promise.all([
    commonPaths[0], commonPaths[2], studentPaths[0], studentPaths[2], studioPath
  ].map(text));
  for (const content of contents) {
    assert.match(content, /같은 블록.*첫 문장.*`?수업을 위한 가정`?.*국소 선행 라벨/su);
    assert.match(content, /미실행.*결과.*수치.*반복/u);
    assert.match(content, /가정.*(?:DERIVED|근거로부터 추론).*승격.*금지/su);
  }
});

test("물의 상태 변화와 응결·운송은 필요한 대안과 경계조건을 보존한다", async () => {
  const combined = (await Promise.all([...commonPaths, ...studentPaths, studioPath].map(text))).join("\n");
  assert.match(combined, /물.*액체.*얼음.*고체.*융해.*과정.*응고.*과정/su);
  assert.match(combined, /차갑.*영하.*같지 않/u);
  assert.match(combined, /표면.*물.*융해수.*응결.*대안/su);
  assert.match(combined, /운송 성공.*서사.*수업을 위한 가정/su);
  for (const term of ["노점", "수증기량", "공기 흐름", "시간", "복사", "표면 조건"]) {
    assert.match(combined, new RegExp(term, "u"));
  }
});

test("교육과정·출처·내보내기 경계가 자동 승격을 막는다", async () => {
  const combined = (await Promise.all([...commonPaths, ...studentPaths, studioPath].map(text))).join("\n");
  assert.match(combined, /단원.*확인.*첫 장면.*`?확인 필요`?/su);
  assert.match(combined, /`?\[doc:turn\]`?.*단독 출처.*사용하지 않/u);
  assert.match(combined, /비인증.*(?:내보내기|export).*금지/u);
});

test("fixture가 모든 차단·허용 경계를 고유 사례로 고정한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/science-observation-provenance-cases.json"));
  assert.equal(fixture.cases.length, 15);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 15);
  const outcomes = new Set(fixture.cases.map(({ expected }) => expected));
  for (const expected of [
    "ASK_ONE_OBSERVATION_QUESTION",
    "ASK_PREDICTION_BEFORE_RESULT",
    "BLOCK_UNLABELED_SYNTHETIC_RESULT",
    "ALLOW_SCENARIO_RESULT_ONCE",
    "SCENARIO_CANNOT_STRENGTHEN_EVIDENCE",
    "SOURCE_INSUFFICIENT",
    "CORRECT_STATE_AND_PROCESS_TERMS",
    "FREEZING_CONDITION_UNKNOWN",
    "KEEP_MELTWATER_AND_CONDENSATION_ALTERNATIVES",
    "NARRATIVE_SUCCESS_SCENARIO_ONLY",
    "CURRICULUM_ALIGNMENT_UNKNOWN_IN_FIRST_SCENE",
    "MULTIVARIABLE_BOUNDARY",
    "EXPORT_BLOCKED"
  ]) {
    assert(outcomes.has(expected), expected);
  }
});

test("학생 ZIP도 강화된 과학 provenance 계약을 포함한다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = entries.map(({ data }) => data.toString("utf8").replace(/^\uFEFF/u, "")).join("\n");
  assert.match(packaged, /같은 블록.*국소 선행 라벨/su);
  assert.match(packaged, /융해수.*응결.*대안/su);
  assert.match(packaged, /\[doc:turn\].*단독 출처/su);
});

test("새 fixture와 회귀 파일은 UTF-8 무BOM이다", async () => {
  for (const relativePath of [
    "tests/fixtures/science-observation-provenance-cases.json",
    "tests/science-observation-provenance.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
});
