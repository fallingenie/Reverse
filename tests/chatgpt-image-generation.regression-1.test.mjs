import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(root, "tests", "fixtures", "chatgpt-image-generation-cases.json");
const instructionsPath = join(root, "chatgpt", "custom-gpt", "INSTRUCTIONS.md");
const builderPath = join(root, "chatgpt", "custom-gpt", "BUILDER_CONFIG.md");
const copilotInstructionsPath = join(root, "copilot", "studio", "STUDIO_INSTRUCTIONS.md");
const copilotManifestPath = join(root, "copilot", "declarativeAgent.json");
const copilotSkillPath = join(root, "skills", "teach-grounded-scenarios", "student-runtime", "SKILL.md");
const copilotTurnPromptPath = join(root, "skills", "teach-grounded-scenarios", "student-runtime", "prompts", "05-lesson-turn.prompt.md");

const allowedPurposes = new Set(["SCENE_ILLUSTRATION", "CONCEPT_DIAGRAM", "SCENE_IMAGINATION", "LEARNING_VISUALIZATION"]);
const allowedTriggers = new Set(["STUDENT_REQUESTED", "OFFER_ACCEPTED"]);

function decideImageGeneration(item) {
  if (item.grade < 3 || item.grade > 11) return "DENY";
  if (!allowedTriggers.has(item.trigger)) return "DENY";
  if (!allowedPurposes.has(item.purpose)) return "DENY";
  if (item.callsInScene >= 1) return "DENY";
  if (item.riskFlags.length > 0) return "DENY";
  return "ALLOW";
}

function decideImageStyle(item) {
  return ["국어", "문학"].includes(item.subject)
    ? "PASTEL_ILLUSTRATION"
    : "PHOTOREALISTIC_EDUCATIONAL";
}

test("초3~고2 모든 과목의 동의된 안전 시각화를 허용한다", async () => {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  assert.equal(fixture.cases.length, 13);
  for (const item of fixture.cases) {
    assert.equal(decideImageGeneration(item), item.expected, item.id);
    if (item.expected === "ALLOW") {
      assert.equal(decideImageStyle(item), item.expectedStyle, `${item.id}:style`);
    }
  }
});

test("Custom GPT 지침과 Builder 구성은 이미지 생성 경계를 함께 고정한다", async () => {
  const [instructions, builder] = await Promise.all([
    readFile(instructionsPath, "utf8"),
    readFile(builderPath, "utf8")
  ]);

  assert.match(builder, /이미지 생성: 켬/u);
  assert.match(instructions, /초3~고2 모든 과목/u);
  assert.match(instructions, /학생 요청 또는 한 번의 제안 뒤 동의/u);
  assert.match(instructions, /장면당 1회(?:만 호출| 쓴다)/u);
  assert.match(instructions, /실제 사료·사진·지도·실측(?:처럼|으로) 속이는/u);
  assert.match(instructions, /미실행 (?:실험 )?결과·측정값/u);
  assert.match(instructions, /실존 학생·개인정보/u);
  assert.match(instructions, /가능한 한 실제 사진처럼/u);
  assert.match(instructions, /국어·문학 장면.*파스텔톤 삽화/u);
  assert.match(instructions, /세포 관찰·감수분열·식물 개화/u);
  assert.match(instructions, /AI 생성 이미지 — 교육용 시각화이며 실제 사진·관찰·사료가 아닙니다/u);
  assert.match(instructions, /실패하면 텍스트로 대체/u);
});

test("Copilot 선언형 에이전트와 학생 Skill은 같은 GraphicArt 경계를 적용한다", async () => {
  const [instructions, manifestText, skill, turnPrompt] = await Promise.all([
    readFile(copilotInstructionsPath, "utf8"),
    readFile(copilotManifestPath, "utf8"),
    readFile(copilotSkillPath, "utf8"),
    readFile(copilotTurnPromptPath, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);
  assert.ok(manifest.capabilities.some((item) => item.name === "GraphicArt"));
  for (const text of [instructions, skill, turnPrompt]) {
    assert.match(text, /초3~고2 모든 과목|초등학교 3학년부터 고등학교 2학년까지 모든 과목/u);
    assert.match(text, /(?:학생 )?요청 또는 (?:한 번의|1회) 제안 뒤 동의/u);
    assert.match(text, /장면당 (?:1회|한 번)/u);
    assert.match(text, /정답·(?:완성 )?풀이/u);
    assert.match(text, /미실행 (?:실험 )?결과/u);
    assert.match(text, /실존 학생(?:의 얼굴)?·개인정보/u);
    assert.match(text, /(?:가능한 한 )?실제 사진처럼/u);
    assert.match(text, /국어·문학.*파스텔톤 삽화/u);
    assert.match(text, /세포 관찰·감수분열·(?:식물 )?개화/u);
    assert.match(text, /AI 생성 시각화 — 실제 사진·관찰·사료가 아님/u);
    assert.match(text, /실패하면|실패하면 결과를 가장하지 않고/u);
  }
});

test("새 fixture와 실행 소스는 UTF-8 무BOM이며 지침은 UTF-8-SIG이다", async () => {
  const [fixture, source, instructions, builder] = await Promise.all([
    readFile(fixturePath),
    readFile(new URL(import.meta.url)),
    readFile(instructionsPath),
    readFile(builderPath)
  ]);
  const bom = [0xEF, 0xBB, 0xBF];
  assert.notDeepEqual([...fixture.subarray(0, 3)], bom);
  assert.notDeepEqual([...source.subarray(0, 3)], bom);
  assert.deepEqual([...instructions.subarray(0, 3)], bom);
  assert.deepEqual([...builder.subarray(0, 3)], bom);
});
