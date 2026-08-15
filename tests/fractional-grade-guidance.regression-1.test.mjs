import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(root, "tests", "fixtures", "fractional-grade-guidance-cases.json");
const policyPaths = [
  "chatgpt/custom-gpt/INSTRUCTIONS.md",
  "copilot/studio/STUDIO_INSTRUCTIONS.md",
  "skills/teach-grounded-scenarios/instructions/system.md",
  "skills/teach-grounded-scenarios/prompts/01-onboarding.prompt.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/01-onboarding.prompt.md"
];

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

function reduceGradeTurn(item) {
  if (item.p0) {
    return { event: "HAND_OFF_P0", invalidGradeCount: item.invalid_grade_count };
  }
  if (!item.school_level) {
    return { event: "ASK_SCHOOL_LEVEL", invalidGradeCount: 0 };
  }

  const normalized = item.input.normalize("NFKC").trim();
  const valid = normalized.match(/^3(?:학년)?(?:\s*2학기)?$/u);
  if (valid) {
    return { event: "SET_GRADE", grade: "초3", invalidGradeCount: 0 };
  }

  if (item.invalid_grade_count >= 2) {
    return {
      event: "END_UNCONFIRMED_GRADE",
      invalidGradeCount: item.invalid_grade_count,
      studentText: fixture.termination_text
    };
  }

  if (/^3[.]5\s*학년(?:이요)?$/u.test(normalized)) {
    if (item.invalid_grade_count === 0) {
      return {
        event: "FRACTIONAL_GRADE_CLARIFY",
        invalidGradeCount: 1,
        studentText: fixture.clarification_text
      };
    }
    return {
      event: "FRACTIONAL_GRADE_TEASE_RETRY",
      invalidGradeCount: 2,
      studentText: fixture.tease_text
    };
  }

  return { event: "ASK_VALID_GRADE", invalidGradeCount: item.invalid_grade_count + 1 };
}

test("소수 학년은 학기 가능성 확인, 한 번의 가벼운 도발, 건조한 종료 순서만 허용한다", () => {
  for (const item of fixture.cases) {
    const result = reduceGradeTurn(item);
    assert.equal(result.event, item.expected_event, item.id);
    assert.equal(result.invalidGradeCount, item.expected_invalid_grade_count, item.id);
    if (item.expected_grade) assert.equal(result.grade, item.expected_grade, item.id);
  }
});

test("유치원생 언급은 두 번째 무효 학년에서만 한 번 나오며 반복 조롱으로 이어지지 않는다", () => {
  const first = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-001"));
  const second = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-002"));
  const third = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-003"));

  assert.doesNotMatch(first.studentText, /유치원생/u);
  assert.match(second.studentText, /아직 유치원생인가요/u);
  assert.match(second.studentText, /농담은 여기까지/u);
  assert.match(second.studentText, /마지막으로/u);
  assert.doesNotMatch(third.studentText, /유치원생|농담/u);
  assert.equal(third.studentText, fixture.termination_text);
});

test("세 런타임은 같은 제한된 학년 재확인 계약을 가진다", async () => {
  for (const relativePath of policyPaths) {
    const text = (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
    assert.match(text, /3[.]5학년/u, relativePath);
    assert.match(text, /3학년 2학기/u, relativePath);
    assert.match(text, /아직 유치원생인가요/u, relativePath);
    assert.match(text, /농담은 여기까지/u, relativePath);
    assert.match(text, /마지막으로/u, relativePath);
    assert.match(text, /학년을 확인할 수 없어 여기서 종료/u, relativePath);
    assert.match(text, /유효.*횟수.*초기화|정상.*횟수.*초기화/u, relativePath);
  }
});

test("P0와 학교급 확인은 소수 학년 재확인보다 항상 먼저다", () => {
  const p0 = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-009"));
  const noSchoolLevel = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-007"));
  assert.equal(p0.event, "HAND_OFF_P0");
  assert.equal(noSchoolLevel.event, "ASK_SCHOOL_LEVEL");
});

test("새 JSON과 실행 소스는 UTF-8 무BOM 기계 파일이다", async () => {
  for (const relativePath of [
    "tests/fixtures/fractional-grade-guidance-cases.json",
    "tests/fractional-grade-guidance.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], relativePath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assert.doesNotMatch(text, /\uFFFD|[\u0080-\u009F]|\uFEFF/u, relativePath);
  }
});
