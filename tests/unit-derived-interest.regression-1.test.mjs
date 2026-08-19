import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function reduce(initial, events) {
  const state = structuredClone(initial);
  for (const event of events) {
    if (event.type === "SET_SUBJECT") {
      state.subject = event.value;
      state.unit = null;
      state.interests = null;
      state.interest_source = null;
      state.next = "ASK_UNIT";
    } else if (event.type === "SET_UNIT") {
      state.unit = event.value.trim();
      state.interests = [state.unit];
      state.interest_source = "UNIT_INFERRED";
      state.next = "PLAN_RESEARCH";
    } else if (event.type === "SET_INTEREST") {
      state.interests = [...event.value];
      state.interest_source = "STUDENT_EXPLICIT";
      state.next = "PLAN_RESEARCH";
    } else if (event.type === "NO_UNIT") {
      state.unit = "";
      state.next = "ASK_OPTIONAL_INTEREST";
    } else {
      throw new Error(`알 수 없는 사건: ${event.type}`);
    }
  }
  return state;
}

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("과목 변경과 단원 입력은 단원 중심 관심 상태를 결정적으로 갱신한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/unit-derived-interest-cases.json"));
  for (const item of fixture.cases) {
    assert.deepEqual(reduce(item.initial, item.events), item.expected, item.id);
  }
});

test("ChatGPT, Copilot, 공통 Skill은 단원 뒤 범용 관심사를 다시 묻지 않는다", async () => {
  const files = await Promise.all([
    text("chatgpt/custom-gpt/INSTRUCTIONS.md"),
    text("copilot/studio/STUDIO_INSTRUCTIONS.md"),
    text("skills/teach-grounded-scenarios/SKILL.md"),
    text("skills/teach-grounded-scenarios/student-runtime/SKILL.md"),
    text("skills/teach-grounded-scenarios/prompts/01-onboarding.prompt.md"),
    text("skills/teach-grounded-scenarios/instructions/system.md")
  ]);
  for (const [index, contents] of files.entries()) {
    assert.match(contents, /(?:단원이 확인되면|구체 단원은).{0,100}기본 관심사/su, `파일 ${index}: 단원 기본 관심 누락`);
    assert.match(contents, /기본 관심사로 기록하고.{0,30}(?:별도 관심사 질문을 생략|다시 묻지 않는다)/su, `파일 ${index}: 재질문 금지 누락`);
  }
  assert.match(files[1], /과목을 바꾸면 이전 단원과 단원에서 추론한 관심을 폐기/u);
  assert.match(files[1], /범용 관심사 목록을 다시 내밀지 않는다/u);
});

test("Custom GPT는 구체 단원을 UNIT_INFERRED로 처리하고 제한된 조회 뒤 바로 다섯 시나리오로 간다", async () => {
  const contents = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(contents, /초5 수학 `분수의 덧셈과 뺄셈`은 `interest_source=UNIT_INFERRED`/u);
  assert.match(contents, /과목 변경 시 이전 unit\/interests를 모두 폐기/u);
  assert.match(contents, /Knowledge 검색 1회의 반환 snippet만 사용/u);
  assert.match(contents, /PDF 전체 분석·전처리/u);
  assert.match(contents, /로컬 manifest\/path 탐색/u);
  assert.match(contents, /grep 연쇄를 하지 않는다/u);
  assert.match(contents, /`확인 필요`를 밝히고 입력 단원만으로 안전한 번호 5개 시나리오/u);
  assert.match(contents, /성취기준 번호·문구·쪽수는 만들지 않는다/u);
});

test("Custom GPT Knowledge는 공개 참고 6개와 교육과정 PDF 3개의 권위 경계를 분리한다", async () => {
  const contents = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(contents, /(?:학생 )?공개 참고 6개와 교육과정 PDF 3개/u);
  assert.match(contents, /`CURRICULUM_AUTHORITY`/u);
  assert.match(contents, /논쟁적 역사·과학 주장의 학술적 확정 근거가 아니/u);
  assert.match(contents, /(?:해당 분야 )?최신 원문으로 별도 검증/u);
});

test("Custom GPT는 문제집식 퀴즈 대신 장면과 실제 행동 분기를 만든다", async () => {
  const contents = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  for (const phrase of ["장소·상황", "학생 역할", "현재 갈등", "관찰 단서", "실제 행동 2~4개", "다음 단서나 장면"]) {
    assert.match(contents, new RegExp(phrase, "u"));
  }
  assert.match(contents, /`옳은 것을 골라·설명해 봐·문제를 풀어` 위주로 퀴즈화하지 않/u);
  assert.match(contents, /긴 교과서 해설은 행동 뒤 짧게 연결/u);
  assert.match(contents, /각 카드 제목에는 `1\.`부터 `5\.`까지 번호/u);
  assert.match(contents, /너의 역할.*지금 있는 곳과 상황.*당장 할 일.*사실\/가정 경계/su);
  assert.match(contents, /단순 문제 유형 목록/u);
  assert.match(contents, /계산 대상만 바꾼 문제 5개는 금지/u);
});

test("라이브 번호 누락 실패는 학생-visible 카드 템플릿으로 차단한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/chatgpt-scenario-card-live-fail.json"));
  const contents = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.equal(fixture.observed.cards_count, 5);
  assert.equal(fixture.observed.visible_numbering, false);
  assert.equal(fixture.observed.selection_prompt, "1~5");
  assert.match(contents, /학생 화면에서 다음 형식을 정확히 5회 쓴다/u);
  for (const line of fixture.expected.required_template_lines) {
    assert.match(contents, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(contents, /3문장 내외의 실제 갈등 상황/u);
  assert.match(contents, /계산 대상만 바꾼 문제 5개는 금지/u);
});

test("Custom GPT 지시문은 7,950자 이하의 UTF-8-SIG다", async () => {
  const bytes = await readFile(join(root, "chatgpt/custom-gpt/INSTRUCTIONS.md"));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  assert.equal(contents.length <= 7_950, true, `현재 지시문 길이: ${contents.length}`);
  assert.doesNotMatch(contents, /\uFFFD|\uFEFF/u);
});

test("세션 스키마는 단원 추론 관심의 출처와 비어 있지 않은 값을 기록한다", async () => {
  const schema = JSON.parse(await text("skills/teach-grounded-scenarios/schemas/session.schema.json"));
  const profile = schema.properties.profile;
  assert(profile.properties.interest_source.enum.includes("UNIT_INFERRED"));
  const inferredRule = profile.allOf.find((rule) => rule.if?.properties?.interest_source?.const === "UNIT_INFERRED");
  assert(inferredRule);
  assert.equal(inferredRule.then.properties.interests.minItems, 1);
  const template = JSON.parse(await text("skills/teach-grounded-scenarios/assets/session.template.json"));
  assert.equal(template.profile.interest_source, null);
});

test("새 기계 fixture와 검사 파일은 UTF-8 무BOM이다", async () => {
  for (const relativePath of [
    "tests/fixtures/chatgpt-scenario-card-live-fail.json",
    "tests/fixtures/unit-derived-interest-cases.json",
    "tests/unit-derived-interest.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotMatch(new TextDecoder("utf-8", { fatal: true }).decode(bytes), /\uFFFD|\uFEFF/u);
  }
});
