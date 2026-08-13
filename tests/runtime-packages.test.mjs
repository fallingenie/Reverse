import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function json(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

test("세 실행 프로파일이 공통 공개 계약을 따른다", async () => {
  const schema = await json("contracts/runtime-profile.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  for (const relativePath of [
    "chatgpt/RUNTIME_PROFILE.json",
    "copilot/RUNTIME_PROFILE.json",
    "windows/RUNTIME_PROFILE.json"
  ]) {
    const data = await json(relativePath);
    assert.equal(validate(data), true, `${relativePath}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("비호스트 프로파일은 T0/T1 커밋과 모델 신원 신뢰를 금지한다", async () => {
  for (const relativePath of ["chatgpt/RUNTIME_PROFILE.json", "copilot/RUNTIME_PROFILE.json"]) {
    const profile = await json(relativePath);
    assert.equal(profile.permissions.commit_t0_t1, false);
    assert.equal(profile.model.identity_attested, false);
    assert.equal(profile.model.observed_label_trusted, false);
  }
});

test("ChatGPT Free 배포물은 설치형 또는 특정 모델 보장을 주장하지 않는다", async () => {
  const profile = await json("chatgpt/RUNTIME_PROFILE.json");
  const bootstrap = await readFile(join(root, "chatgpt", "BOOTSTRAP.md"), "utf8");
  const guide = await readFile(join(root, "chatgpt", "START-HERE.md"), "utf8");
  assert.match(guide, /설치형 Add-on이 아니라/u);
  assert.match(bootstrap, /PROMPT_GUARDED/u);
  assert.match(bootstrap, /T0\/T1 변경이 필요하면 `CANON_PROPOSAL`/u);
  assert.doesNotMatch(`${bootstrap}${guide}`, /Luna/u);
  assert.equal(profile.capability_documentation_status, "NO_PUBLIC_GUARANTEE_FOUND");
  assert.deepEqual(profile.public_sources, []);
});

test("비공개 Custom GPT 구성은 핵심 게이트와 보장 경계를 명시한다", async () => {
  const config = await readFile(join(root, "chatgpt", "custom-gpt", "BUILDER_CONFIG.md"), "utf8");
  const instructions = await readFile(join(root, "chatgpt", "custom-gpt", "INSTRUCTIONS.md"), "utf8");
  const knowledge = await readFile(join(root, "chatgpt", "custom-gpt", "KNOWLEDGE_REFERENCE.md"), "utf8");
  assert.match(config, /나만 보기/u);
  assert.match(config, /권장일 뿐 강제가 아니/u);
  assert.match(instructions, /정확히 5개/u);
  assert.match(instructions, /정확히 `\[시작\]`/u);
  assert.match(instructions, /학교급이 확인되지 않았으면/u);
  assert.match(instructions, /학교급 없이 `3`, `2학년`, `3학년`/u);
  assert.match(instructions, /새 세션의 첫 사용자 입력이 `1`, `2`, `3` 같은 숫자 하나뿐이면 학교급 선택 번호로도 해석하지 않는다/u);
  assert.match(instructions, /바로 직전 응답에서 GPT가 학교급 선택지를 명시적으로 제시한 경우에만 유효하다/u);
  assert.match(instructions, /핵심 설정 수정 제안/u);
  assert.match(instructions, /처음부터 다시 시작 권고/u);
  assert.match(instructions, /암호를 받아 권한이 생겼다고 주장하지 않는다/u);
  assert.match(instructions, /이미지 생성 도구를 자발적으로 호출하지 않는다/u);
  assert.match(config, /제품 전체 UI를 제거하는 권한으로 취급하지 않는다/u);
  assert.match(knowledge, /영구 원장/u);
  assert.match(knowledge, /선생님이나 교과서, 참고서를 확인하여 주세요/u);
  assert.match(instructions, /기술 정보는 학생에게 먼저 보여주지 않는다/u);
  assert.doesNotMatch(instructions, /`실행 프로필:|PROMPT_GUARDED/u);
  assert.doesNotMatch(`${instructions}${knowledge}`, /VERIFIED|DERIVED|SCENARIO|UNKNOWN|NOT_LOADED|CONFLICTED|참고표/u);
});

test("Copilot manifest는 공개 v1.8 경계와 Think deeper 기본 요청을 따른다", async () => {
  const manifest = await json("copilot/declarativeAgent.json");
  const profile = await json("copilot/RUNTIME_PROFILE.json");
  assert.equal(manifest.$schema, "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.8/schema.json");
  assert.equal(manifest.version, "v1.8");
  assert.equal(manifest.behavior_overrides.default_response_mode, "Think deeper");
  assert.ok(manifest.instructions.length <= 8000);
  assert.ok(manifest.conversation_starters.length <= 12);
  assert.equal(profile.model.identity_attested, false);
  assert(profile.deployment.limitations.some((item) => item.includes("@mention")));
});

test("Windows PowerShell은 UTF-8-SIG이고 기계 JSON은 무BOM이다", async () => {
  const script = await readFile(join(root, "windows", "build.ps1"));
  assert.deepEqual([...script.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  for (const relativePath of [
    "chatgpt/RUNTIME_PROFILE.json",
    "copilot/RUNTIME_PROFILE.json",
    "copilot/declarativeAgent.json",
    "windows/RUNTIME_PROFILE.json"
  ]) {
    const contents = await readFile(join(root, relativePath));
    assert.notDeepEqual([...contents.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${relativePath} should be BOM-free JSON`);
  }
});

test("Custom GPT 사람용 입력 파일은 UTF-8-SIG이다", async () => {
  for (const relativePath of [
    "chatgpt/custom-gpt/BUILDER_CONFIG.md",
    "chatgpt/custom-gpt/INSTRUCTIONS.md",
    "chatgpt/custom-gpt/KNOWLEDGE_REFERENCE.md"
  ]) {
    const contents = await readFile(join(root, relativePath));
    assert.deepEqual([...contents.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${relativePath} should be UTF-8-SIG`);
  }
});
