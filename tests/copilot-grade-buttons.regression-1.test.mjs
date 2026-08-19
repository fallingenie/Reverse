import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const topicPath = join(root, "copilot", "studio", "topics", "reverse-grade-buttons.topic.yaml");
const guidePath = join(root, "copilot", "studio", "GRADE_BUTTON_TOPIC_SETUP.md");
const instructionsPath = join(root, "copilot", "studio", "STUDIO_INSTRUCTIONS.md");

async function readUtf8(path) {
  return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
}

test("학년 선택 Topic은 세 학교급을 실제 ClosedList Question으로 묻는다", async () => {
  const topic = await readUtf8(topicPath);
  assert.equal(topic.startsWith("\uFEFF"), false, "YAML 기계 파일은 BOM이 없어야 한다");
  assert.equal((topic.match(/kind: Question/gu) ?? []).length, 3);
  assert.equal((topic.match(/kind: ClosedListEntity/gu) ?? []).length, 3);
  assert.equal((topic.match(/prompt: 몇 학년인가요\?/gu) ?? []).length, 3);
  assert.equal((topic.match(/allowInterruption: false/gu) ?? []).length, 3);
});

test("초등·중등·고등 학년 버튼 집합이 지원 범위와 정확히 일치한다", async () => {
  const topic = await readUtf8(topicPath);
  const elementary = topic.slice(topic.indexOf("id: condition_elementary"), topic.indexOf("id: condition_middle"));
  const middle = topic.slice(topic.indexOf("id: condition_middle"), topic.indexOf("id: condition_high"));
  const high = topic.slice(topic.indexOf("id: condition_high"), topic.indexOf("elseActions:"));

  assert.deepEqual([...elementary.matchAll(/displayName: (\d학년)/gu)].map((match) => match[1]), ["3학년", "4학년", "5학년", "6학년"]);
  assert.deepEqual([...middle.matchAll(/displayName: (\d학년)/gu)].map((match) => match[1]), ["1학년", "2학년", "3학년"]);
  assert.deepEqual([...high.matchAll(/displayName: (\d학년)/gu)].map((match) => match[1]), ["1학년", "2학년"]);
});

test("예상하지 못한 호출은 학년을 추측하지 않고 닫힌다", async () => {
  const topic = await readUtf8(topicPath);
  assert.match(topic, /elseActions:\s+- kind: CancelAllDialogs/gu);
  assert.doesNotMatch(topic, /13학년|3\.5학년|3\.3학년/gu);
});

test("Studio 지침은 실제 Topic과 생성형 번호 목록을 구분한다", async () => {
  const instructions = (await readUtf8(instructionsPath)).replace(/^\uFEFF/u, "");
  assert.match(instructions, /`Reverse Grade Buttons` Topic의 `Question`\/`ClosedListEntity`/u);
  assert.match(instructions, /번호 목록·직접 입력을 쓰고 버튼이라 부르지 않는다/u);
});

test("설치 문서는 UTF-8-SIG이며 Preview·게시·WebChat 검증 전 HOLD를 유지한다", async () => {
  const bytes = await readFile(guidePath);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const guide = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  for (const term of ["Open code editor", "Multiple choice options", "Preview", "WebChat", "HOLD"]) {
    assert.match(guide, new RegExp(term, "u"));
  }
});
