import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("과학 탐구는 예측 전에 가상 결과와 결론을 선공개하지 않는다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/chatgpt-science-inquiry-live-fail.json"));
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.equal(fixture.observed_failures.length, 7);
  assert.match(instructions, /관찰 질문 → 학생 예측\/행동 → 실제 측정 또는 명시적 수업 가정 → 피드백 → 개념 연결/u);
  assert.match(instructions, /`계속·자동 진행·묻지 말고`는 예측·선택·관찰이 아니다/u);
  assert.match(instructions, /한 턴은 관찰 질문 1개와 서로 다른 행동\/예측 2개만/u);
  assert.equal(fixture.low_burden_turn.continue_is_evidence, false);
});

test("사실 확인됨과 응결 인과는 관찰·출처·경계조건을 보존한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/chatgpt-science-inquiry-live-fail.json"));
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /측정하지 않은 수치·관찰은 `사실 확인됨`이 아니다/u);
  assert.match(instructions, /열린 근거가 직접 지지하거나 학생이 실제 관찰한 범위만/u);
  assert.match(instructions, /출처 없는 일반 설명.*검증 완료를 주장하지 않는다/u);
  for (const boundary of fixture.condensation_boundaries) assert.match(instructions, new RegExp(boundary, "u"));
  assert.match(instructions, /자동차 창문·단열 효과를 단일 원인으로 단정하지 않는다/u);
  assert.match(instructions, /단원 미확인이면 교육과정 일치는 `확인 필요`/u);
});

test("가상 결과와 상변화 장면은 국소 라벨과 경쟁 가설을 보존한다", async () => {
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /미실행 결과·수치·반복은 같은 블록 앞의 `수업을 위한 가정` 없이는 만들지 않/u);
  assert.match(instructions, /가정으로 근거 강도나 `근거로부터 추론`을 승격하지 않는다/u);
  assert.match(instructions, /차가움≠영하/u);
  assert.match(instructions, /표면 물에 융해수\/응결 대안/u);
  assert.match(instructions, /운송 성공은 서사 가정/u);
});

test("학생 출처는 opaque turn 표지만으로 대체하지 않는다", async () => {
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /`?\[doc:turn\]`?.*(?:단독 출처로 쓰지 않|링크가 아니)/u);
  assert.match(instructions, /출처명.*(?:직접|실제).*링크.*지지 범위/u);
});

test("학생 평문은 파일·프로파일 내보내기 권한이 아니지만 화면 복사까지 막지는 않는다", async () => {
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /현재 세션에서 이미 보이는 사용자·GPT 메시지/u);
  assert.match(instructions, /화면용 복사 Markdown/u);
  assert.match(instructions, /파일 생성·다운로드·전송·영구 저장·교사용 기록 export는 인증된 교사용 Vercel 경로/u);
});

test("과학 회귀 기계 파일은 UTF-8 무BOM이다", async () => {
  for (const relativePath of [
    "tests/fixtures/chatgpt-science-inquiry-live-fail.json",
    "tests/chatgpt-science-inquiry.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotMatch(new TextDecoder("utf-8", { fatal: true }).decode(bytes), /\uFFFD|\uFEFF/u);
  }
});
