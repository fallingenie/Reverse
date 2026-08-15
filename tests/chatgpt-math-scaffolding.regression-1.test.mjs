import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("최초 수학 응답은 정답 대신 학년 맞춤 탐색 순서를 시작한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/chatgpt-math-answer-live-fail.json"));
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.equal(fixture.observed_failure.final_answer_revealed, true);
  assert.equal(fixture.observed_failure.student_attempt_present, false);
  assert.match(instructions, /최초 응답에 최종 정답·완성 계산식을 노출하지 않는다/u);
  assert.match(instructions, /학년 맞춤 탐색 힌트 1개 → 학생 시도 → 틀린 단계만 특정한 피드백/u);
});

test("정답 공개는 학생 시도 또는 두 번의 도움 뒤 조건부로만 열린다", async () => {
  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /시도 뒤 답 확인을 명시하거나 도움 두 번 뒤에도 막힌 경우에만/u);
  assert.match(instructions, /풀이와 정답을 짧게 공개/u);
  assert.match(instructions, /즉시 위기 P0 대응과 사실 교정은 지연하지 않는다/u);
});

test("수학 정답 회귀 파일은 UTF-8 무BOM 기계 파일이다", async () => {
  for (const relativePath of [
    "tests/fixtures/chatgpt-math-answer-live-fail.json",
    "tests/chatgpt-math-scaffolding.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotMatch(new TextDecoder("utf-8", { fatal: true }).decode(bytes), /\uFFFD|\uFEFF/u);
  }
});
