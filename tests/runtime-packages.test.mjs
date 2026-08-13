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
