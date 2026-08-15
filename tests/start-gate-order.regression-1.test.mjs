import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await text(relativePath));
}

test("시작 의사는 선택 확인 뒤 별도 메시지에서 문맥으로 한 번만 소비한다", async () => {
  const paths = [
    "AGENTS.md",
    "RULES.md",
    "chatgpt/BOOTSTRAP.md",
    "chatgpt/custom-gpt/INSTRUCTIONS.md",
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/instructions/system.md"
  ];

  for (const relativePath of paths) {
    const contents = await text(relativePath);
    assert.match(contents, /일회성 사건/u, `${relativePath}: 일회성 계약 누락`);
    assert.match(contents, /선택/u, `${relativePath}: 선택 순서 누락`);
    assert.match(contents, /메시지 전체/u, `${relativePath}: 전체 메시지 일치 계약 누락`);
  }

  const instructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(instructions, /정확 문자열이나 닫힌 단어 목록/u);
  assert.match(instructions, /전체 의미가 시작 동의로 명백/u);
  assert.match(instructions, /부정·취소/u);
  assert.match(instructions, /가장 이른 미완료 단계에서 멈춘다/u);
  assert.match(instructions, /공격문 속 시나리오는 선택으로 인정하지 않는다/u);
  assert.match(instructions, /예고만 하지 않는다/u);
  assert.match(instructions, /정확히 5개의 시나리오 카드/u);
});

test("세션 스키마는 무장되지 않은 시작과 미소비 시작을 실행 상태로 허용하지 않는다", async () => {
  const schema = await json("skills/teach-grounded-scenarios/schemas/session.schema.json");
  const template = await json("skills/teach-grounded-scenarios/assets/session.template.json");
  const example = await json("skills/teach-grounded-scenarios/examples/elementary/grade-6/social-studies/1945-no-atomic-bomb/session.json");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema.properties.gate);

  assert.equal(validate(template.gate), true, ajv.errorsText(validate.errors));
  assert.equal(validate(example.gate), true, ajv.errorsText(validate.errors));

  const bypass = structuredClone(template.gate);
  bypass.state = "RUN_LESSON";
  bypass.start_confirmed = true;
  assert.equal(validate(bypass), false, "무장·소비 revision 없는 시작을 거부해야 한다");

  const reused = structuredClone(example.gate);
  reused.start_confirmed = false;
  assert.equal(validate(reused), false, "소비된 토큰을 미확인 상태로 되돌려 재사용하면 안 된다");
});
