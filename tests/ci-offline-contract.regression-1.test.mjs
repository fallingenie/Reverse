import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI 검증은 대화형 Microsoft 로그인을 기다리지 않는다", () => {
  const ciCheck = packageJson.scripts["check:ci"];
  const localCheck = packageJson.scripts["check:active"];

  assert.match(ciCheck, /verify:copilot/u);
  assert.match(ciCheck, /copilot:package/u);
  assert.doesNotMatch(ciCheck, /copilot:validate-package/u);
  assert.match(localCheck, /copilot:validate-package/u);
  assert.doesNotMatch(workflow, /atk validate/u);
  assert.match(workflow, /Microsoft 계정 로그인이 필요/u);
});
