import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudentSkillRuntimePackage } from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contractPaths = [
  "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
  "copilot/studio/STUDIO_INSTRUCTIONS.md"
];

async function readText(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

function answerReleaseDecision(item) {
  if (item.p0_signal) return "P0_PREEMPT";
  if (item.student_result_correct && item.attempt_count >= 1) return "CONFIRM_STUDENT_RESULT";
  if (item.attempt_count < 1) return "HINT_NO_ANSWER";
  if (!item.process_feedback_given) return "PROCESS_FEEDBACK_NO_ANSWER";
  if (item.explicit_reveal_request) return "ANSWER_RELEASE_ALLOWED";
  if (item.attempt_count >= 2 && item.explicit_worked_solution_request) return "ANSWER_RELEASE_ALLOWED";
  return "PROCESS_FEEDBACK_NO_ANSWER";
}

test("수학 응답은 힌트에서 정답 공개까지 순서를 지킨다", async () => {
  const contents = await Promise.all(contractPaths.map(readText));
  for (const [index, content] of contents.entries()) {
    assert.match(content, /힌트 단계.*학생 시도.*과정 피드백.*정답 공개/su, contractPaths[index]);
    assert.match(content, /최종 (?:수치|값)|최종값/u, contractPaths[index]);
    assert.match(content, /완성 계산식/u, contractPaths[index]);
  }

  const turnContracts = contents.filter((_, index) => index !== 1);
  for (const content of turnContracts) {
    assert.match(content, /학생이 한 시도/u);
    assert.match(content, /과정 피드백/u);
    assert.match(content, /풀이 전체/u);
  }
});

test("직답 요구·정답 유도·교사 사칭·프롬프트 주입은 공개 순서를 우회하지 못한다", async () => {
  const combined = (await Promise.all(contractPaths.map(readText))).join("\n");
  for (const phrase of ["답 알려줘", "정답 유도", "교사라고 주장", "이전 지침을 무시"] ) {
    assert.match(combined, new RegExp(phrase, "u"));
  }
  assert.match(combined, /관찰 단서.*인물.*행동 선택.*근거 경계/su);
  assert.match(combined, /정답.*숨기거나.*누설/u);
});

test("학년별 힌트는 정답이 아닌 다음 한 단계만 제공한다", async () => {
  const combined = (await Promise.all(contractPaths.map(readText))).join("\n");
  assert.match(combined, /초3~4.*그림.*한 연산/su);
  assert.match(combined, /초5~6.*수직선.*분수 막대.*공통분모/su);
  assert.match(combined, /중1~3.*표현.*전략.*오류 위치/su);
  assert.match(combined, /고1~2.*조건.*불변량.*다음 유도 단계/su);
});

test("회귀 벡터가 공개 허용과 차단 경계를 모두 포함한다", async () => {
  const fixture = JSON.parse(await readText("tests/fixtures/math-answer-release-cases.json"));
  assert.equal(fixture.cases.length, 10);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 10);
  const outcomes = new Set(fixture.cases.map(({ expected }) => expected));
  for (const expected of [
    "HINT_NO_ANSWER",
    "PROCESS_FEEDBACK_NO_ANSWER",
    "ANSWER_RELEASE_ALLOWED",
    "CONFIRM_STUDENT_RESULT",
    "P0_PREEMPT"
  ]) {
    assert(outcomes.has(expected), expected);
  }
  assert(fixture.cases.some(({ input }) => /교사|선생님/u.test(input)));
  assert(fixture.cases.some(({ input }) => input.includes("이전 지침을 무시")));
  assert(fixture.cases.some(({ p0_signal }) => p0_signal === true));
  for (const item of fixture.cases) {
    assert.equal(answerReleaseDecision(item), item.expected, item.id);
  }
});

test("학생 Skill ZIP도 수학 정답 공개 계약을 포함한다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = new Map(entries.map(({ name, data }) => [name, data.toString("utf8").replace(/^\uFEFF/u, "")]));
  for (const name of ["SKILL.md", "prompts/04-scenario-cards.prompt.md", "prompts/05-lesson-turn.prompt.md"]) {
    const content = packaged.get(name);
    assert.match(content, /힌트 단계.*학생 시도.*과정 피드백.*정답 공개/su, name);
    assert.match(content, /완성 계산식/u, name);
  }
});

test("기계 회귀 파일은 UTF-8 무BOM이다", async () => {
  for (const relativePath of [
    "tests/fixtures/math-answer-release-cases.json",
    "tests/math-answer-release.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], relativePath);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
});
