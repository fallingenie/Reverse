import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { buildCopilotPackage, pngInfo } from "../scripts/build-copilot-package.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Microsoft 365 앱 manifest는 공식 v1.28 스키마를 통과한다", async () => {
  const response = await fetch("https://developer.microsoft.com/json-schemas/teams/v1.28/MicrosoftTeams.schema.json");
  assert.equal(response.ok, true);
  const schema = await response.json();
  delete schema.$schema;
  const manifest = JSON.parse(await readFile(join(root, "copilot", "appPackage", "manifest.json"), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  assert.equal(validate(manifest), true, ajv.errorsText(validate.errors, { separator: "\n" }));
});

test("앱 아이콘은 Microsoft 필수 크기와 투명 형식을 지킨다", async () => {
  const color = pngInfo(await readFile(join(root, "copilot", "appPackage", "assets", "color.png")));
  const outline = pngInfo(await readFile(join(root, "copilot", "appPackage", "assets", "outline.png")));
  assert.deepEqual([color.width, color.height], [192, 192]);
  assert.deepEqual([outline.width, outline.height], [32, 32]);
  assert.ok([4, 6].includes(outline.colorType));
});

test("Copilot ZIP은 결정적인 파일 목록으로 재현된다", async () => {
  const first = await buildCopilotPackage();
  const second = await buildCopilotPackage();
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.files, [
    "manifest.json",
    "assets/color.png",
    "assets/outline.png",
    "declarativeAgent.json",
    "knowledge/reverse-policy.txt"
  ]);
  assert.ok(first.bytes > 0);
});
