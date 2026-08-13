import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

// Regression: ISSUE-012 — 주택 층수와 실제 오른 층수를 거짓 충돌로 판정했다.
// Found by /qa on 2026-08-14
// Report: .gstack/qa-reports/qa-report-chatgpt-com-2026-08-13.md
test("상태 동일성 게이트는 의미 필드와 기준면이 다른 값을 합치지 않는다", async () => {
  const canon = await text("skills/teach-grounded-scenarios/references/canon-integrity-v2.md");
  const system = await text("skills/teach-grounded-scenarios/instructions/system.md");
  const custom = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  const combined = `${canon}\n${system}\n${custom}`;

  for (const phrase of ["의미 필드", "단위", "기준면", "측정 조건", "시점", "출처"]) {
    assert.match(combined, new RegExp(phrase, "u"));
  }
  assert.match(combined, /주택 층수/u);
  assert.match(combined, /실제로 오른 층수/u);
  assert.match(combined, /산소 사용 중 측정값/u);
  assert.match(combined, /무산소 측정값/u);
  assert.match(combined, /직접 반증/u);
  assert.match(combined, /교정 제안|교정 후보/u);
});
