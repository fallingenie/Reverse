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

  const normalized = item.input.normalize("NFKC").trim();
  const inferred = item.semantic_grade ?? null;
  if (inferred?.school_level) {
    const prefix = inferred.school_level === "중학교" ? "중" : inferred.school_level === "고등학교" ? "고" : "초";
    return {
      event: "SET_GRADE",
      schoolLevel: inferred.school_level,
      grade: `${prefix}${inferred.grade}`,
      invalidGradeCount: 0
    };
  }
  if (!item.school_level) {
    return { event: "ASK_SCHOOL_LEVEL", invalidGradeCount: 0 };
  }

  if (inferred?.grade) {
    const prefix = item.school_level === "중학교" ? "중" : "초";
    return { event: "SET_GRADE", grade: `${prefix}${inferred.grade}`, invalidGradeCount: 0 };
  }

  if (item.invalid_grade_count >= 2) {
    return {
      event: "END_UNCONFIRMED_GRADE",
      invalidGradeCount: item.invalid_grade_count,
      studentText: fixture.termination_text
    };
  }

  if (item.invalid_grade_count === 0) {
    const fractionalGrade = normalized.match(/([3-6][.]\d+)\s*학년/u);
    return {
      event: "GRADE_CLARIFY",
      invalidGradeCount: 1,
      studentText: fractionalGrade
        ? `${fractionalGrade[1]}학년${fixture.clarification_suffix}`
        : "입력한 표현만으로는 한 학년을 정할 수 없습니다. 정확한 학년을 알려 주세요."
    };
  }
  return {
    event: "GRADE_TEASE_RETRY",
    invalidGradeCount: 2,
    studentText: fixture.tease_text
  };
}

test("모든 소수형 학년은 다음 단계로 소비하지 않고 재확인·도발·종료 순서만 허용한다", () => {
  for (const item of fixture.cases) {
    const result = reduceGradeTurn(item);
    assert.equal(result.event, item.expected_event, item.id);
    assert.equal(result.invalidGradeCount, item.expected_invalid_grade_count, item.id);
    if (item.expected_grade) assert.equal(result.grade, item.expected_grade, item.id);
    if (item.expected_school_level) assert.equal(result.schoolLevel, item.expected_school_level, item.id);
  }
});

test("유치원생 언급은 두 번째 무효 학년에서만 한 번 나오며 반복 조롱으로 이어지지 않는다", () => {
  const first = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-001"));
  const second = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-002"));
  const third = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-003"));

  assert.doesNotMatch(first.studentText, /유치원생/u);
  assert.equal(first.studentText, `3.3학년${fixture.clarification_suffix}`);
  assert.match(second.studentText, /아직 유치원생인가요/u);
  assert.match(second.studentText, /농담은 여기까지/u);
  assert.match(second.studentText, /마지막으로/u);
  assert.doesNotMatch(third.studentText, /유치원생|농담/u);
  assert.equal(third.studentText, fixture.termination_text);
});

test("세 런타임은 같은 제한된 학년 재확인 계약을 가진다", async () => {
  for (const relativePath of policyPaths) {
    const text = (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
    assert.match(text, /3[.]3.*3[.]5학년|3[.]3학년.*3[.]5/su, relativePath);
    assert.match(text, /(?:목록 )?번호(?:로|를)?.*(?:소비|해석|추정).*(?:다음 단계|과목)|(?:목록 )?번호(?:로|를)?.*(?:다음 단계|과목)/su, relativePath);
    assert.match(
      text,
      /메시지 전체.*(?:한 학교급·학년|한 학년).*명백|전체 뜻.*한 학교급·학년|한 학교급·학년(?:이 명백하면|을 명백히 뜻하면)/su,
      relativePath,
    );
    assert.match(text, /(?:예시는 )?닫힌 목록(?:이)? 아/u, relativePath);
    assert.match(text, /소수·분수·범위·상충·(?:불명확|복수 후보)/u, relativePath);
    assert.match(
      text,
      /둘 이상의 (?:서로 다른 )?(?:정수 )?(?:학년 )?후보|학년 후보가 둘 이상|복수 (?:정수 )?후보/u,
      relativePath,
    );
    assert.match(
      text,
      /13학년.*(?:다른 학년 체계|다른 체계·난이도|난이도).*(?:취급하지 않|보지 않)|다른 학년 체계.*13학년.*취급하지 않|복수 후보[^\n]*13학년|13학년[^\n]*번호로 해석·추정하지 않/u,
      relativePath,
    );
    for (const form of ["삼학년", "중학교 3학년", "중3", "중 3"]) {
      assert.match(text, new RegExp(form, "u"), `${relativePath}: ${form}`);
    }
    assert.match(text, /중학교 삼학년|삼학년.*중학교 3학년/su, `${relativePath}: 중학교 삼학년 의미`);
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

test("설명 문장 속 소수형과 NFKC 전각 표기도 유효 학년이나 과목 단계로 넘어가지 않는다", () => {
  for (const id of ["FG-002", "FG-010", "FG-011"]) {
    const result = reduceGradeTurn(fixture.cases.find((item) => item.id === id));
    assert.match(result.event, /^GRADE_/u, id);
    assert.notEqual(result.event, "SET_GRADE", id);
  }
});

test("분수형·범위형·상충 표현도 의미가 하나로 정해질 때까지 진행하지 않는다", () => {
  for (const id of ["FG-018", "FG-019", "FG-020", "FG-021", "FG-024", "FG-025", "FG-026", "FG-027"]) {
    const result = reduceGradeTurn(fixture.cases.find((item) => item.id === id));
    assert.equal(result.event, "GRADE_CLARIFY", id);
    assert.equal(result.invalidGradeCount, 1, id);
  }
});

test("복수 정수 학년 뒤의 무효 입력은 확인·한 번의 도발·종료를 넘지 않는다", () => {
  const first = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-021"));
  const second = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-022"));
  const third = reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-023"));

  assert.equal(first.event, "GRADE_CLARIFY");
  assert.equal(second.event, "GRADE_TEASE_RETRY");
  assert.equal(third.event, "END_UNCONFIRMED_GRADE");
  assert.doesNotMatch(first.studentText, /13학년.*(?:체계|난이도)|중학교 3학년으로 진행/u);
  assert.match(second.studentText, /아직 유치원생인가요/u);
  assert.equal(third.studentText, fixture.termination_text);
});

test("한글 수사와 학교급 결합 표기는 정상 학년으로 수용한다", () => {
  for (const id of ["FG-012", "FG-013", "FG-014", "FG-015", "FG-016"]) {
    const result = reduceGradeTurn(fixture.cases.find((item) => item.id === id));
    assert.equal(result.event, "SET_GRADE", id);
    assert.equal(result.grade, "중3", id);
  }
  assert.equal(reduceGradeTurn(fixture.cases.find((item) => item.id === "FG-017")).event, "ASK_SCHOOL_LEVEL");
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
