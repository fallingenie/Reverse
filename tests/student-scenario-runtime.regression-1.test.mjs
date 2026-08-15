import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudentSkillRuntimePackage } from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("다섯 카드는 문제집 제목이 아니라 역할·장소·갈등·근거 경계를 약속한다", async () => {
  const [commonSkill, studentCards, studio] = await Promise.all([
    text("skills/teach-grounded-scenarios/SKILL.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md"),
    text("copilot/studio/STUDIO_INSTRUCTIONS.md")
  ]);

  assert.match(commonSkill, /문제집 제목이나 개념 퀴즈가 아니라 학생이 들어갈 역할/u);
  assert.match(commonSkill, /구체적 장소·시간 또는 상황/u);
  assert.match(commonSkill, /부딪힐 갈등, 당장 해결할 목표/u);
  assert.match(studentCards, /문제집 문항을 배경으로 포장하지 않는다/u);
  for (const field of ["역할", "장소·때", "갈등과 목표", "근거 경계"]) {
    assert.match(studentCards, new RegExp(`- ${field}:`, "u"));
  }
  assert.match(studio, /다섯 시나리오 카드는 문제집 제목이 아니라 학생 역할/u);
});

test("첫 수업 턴은 장면과 관찰 단서로 즉시 시작한다", async () => {
  const paths = [
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
    "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md",
    "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
    "copilot/studio/STUDIO_INSTRUCTIONS.md"
  ];
  for (const relativePath of paths) {
    const contents = await text(relativePath);
    assert.match(contents, /첫 수업 턴|첫 턴/u, `${relativePath}: 첫 턴 계약 누락`);
    assert.match(contents, /구체적 장소·시간 또는 상황/u, `${relativePath}: 장소·시간 누락`);
    assert.match(contents, /학생 역할/u, `${relativePath}: 역할 누락`);
    assert.match(contents, /당장 해결할 문제/u, `${relativePath}: 즉시 문제 누락`);
    assert.match(contents, /관찰 단서|감각·관찰 단서/u, `${relativePath}: 관찰 단서 누락`);
    assert.match(contents, /인물·환경 반응|인물과 환경의 반응/u, `${relativePath}: 반응 누락`);
  }
});

test("선택지는 정답이 아니라 서로 다른 다음 장면을 여는 행동이다", async () => {
  const paths = [
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
    "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md",
    "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
    "copilot/studio/STUDIO_INSTRUCTIONS.md"
  ];
  for (const relativePath of paths) {
    const contents = await text(relativePath);
    assert.match(contents, /행동 2~4개|행동 선택`? 2~4개/u, `${relativePath}: 행동 수 누락`);
    assert.match(contents, /정답 후보, 개념 이름, 검사 항목/u, `${relativePath}: 객관식 금지 누락`);
    assert.match(contents, /서로 다른 다음 단서|다른 단서·장소·인물 반응/u, `${relativePath}: 분기 누락`);
    assert.match(contents, /직접 입력/u, `${relativePath}: 직접 행동 누락`);
  }
});

test("교과 개념은 행동 뒤에 짧게 연결하고 문제풀이 발문을 중심으로 삼지 않는다", async () => {
  const paths = [
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
    "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md",
    "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
    "copilot/studio/STUDIO_INSTRUCTIONS.md"
  ];
  for (const relativePath of paths) {
    const contents = await text(relativePath);
    assert.match(contents, /`설명해 봐`, `옳은 것을 골라`, `문제를 풀어`/u, `${relativePath}: 금지 발문 누락`);
    assert.match(contents, /중심 과제로 삼지 않는다|중심으로 진행하지 않는다/u, `${relativePath}: 금지 효과 누락`);
    assert.match(contents, /행동.*뒤.*개념|행동 뒤.*개념/u, `${relativePath}: 행동 후 개념 연결 누락`);
  }
});

test("시나리오 턴의 모든 생성 경로에서 P0가 먼저다", async () => {
  const [commonSkill, commonTurn, studentSkill, studentCards, studentTurn, studio] = await Promise.all([
    text("skills/teach-grounded-scenarios/SKILL.md"),
    text("skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md"),
    text("skills/teach-grounded-scenarios/student-runtime/SKILL.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md"),
    text("skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md"),
    text("copilot/studio/STUDIO_INSTRUCTIONS.md")
  ]);
  for (const contents of [commonSkill, commonTurn, studentSkill, studentCards, studentTurn, studio]) {
    assert.match(contents, /P0/u);
  }
  assert.match(commonTurn, /P0 안전·과학 무결성 게이트를 먼저 적용/u);
  assert.match(studentCards, /카드 생성 전에 P0 안전·과학 무결성 게이트를 먼저 적용/u);
  assert.match(studentTurn, /P0 안전·과학 무결성 게이트를 먼저 적용/u);
});

test("재빌드 대상 학생 ZIP에도 장면형 Prompt 04와 05가 포함된다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = new Map(entries.map((entry) => [entry.name, entry.data.toString("utf8")]));
  const cards = packaged.get("prompts/04-scenario-cards.prompt.md");
  const turn = packaged.get("prompts/05-lesson-turn.prompt.md");
  assert.match(cards, /역할: 학생이 장면에서 맡을 구체적 역할/u);
  assert.match(cards, /갈등과 목표/u);
  assert.match(turn, /### 행동 선택/u);
  assert.match(turn, /서로 다른 행동 2~4개/u);
});

test("새 JavaScript 회귀 파일은 UTF-8 무BOM이다", async () => {
  const bytes = await readFile(join(root, "tests/student-scenario-runtime.regression-1.test.mjs"));
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.doesNotMatch(new TextDecoder("utf-8", { fatal: true }).decode(bytes), /\uFFFD|\uFEFF/u);
});
