import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

// Regression: ISSUE-007 — 사실성 강화가 출처 나열 또는 무근거 창작 중 한쪽으로 치우칠 수 있었다.
// Found by /qa on 2026-08-13
// Report: .gstack/qa-reports/qa-report-chatgpt-com-2026-08-13.md
test("수업 품질 계약은 근거·추론·창의 수업·미확인을 분리한다", async () => {
  const quality = await text("skills/teach-grounded-scenarios/references/lesson-quality-balance.md");
  const skill = await text("skills/teach-grounded-scenarios/SKILL.md");
  const system = await text("skills/teach-grounded-scenarios/instructions/system.md");
  const turn = await text("skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md");
  const custom = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");

  for (const phrase of ["확정 근거층", "제한 추론층", "창의 수업층", "미확인층"]) {
    assert.match(quality, new RegExp(phrase, "u"));
  }
  assert.match(skill, /lesson-quality-balance\.md/u);
  assert.match(system, /정확성은 창의성을 제거하라는 뜻이 아니다/u);
  assert.match(turn, /T3\/T4 장면 요소/u);
  assert.match(custom, /정확성은 창의성을 없애라는 뜻이 아니다/u);
  assert.match(custom, /핵심 개념 하나, 구체적 단서 하나/u);
});

// Regression: ISSUE-008 — 같은 설명을 모든 학년에 재사용할 위험이 있었다.
// Found by /qa on 2026-08-13
// Report: .gstack/qa-reports/qa-report-chatgpt-com-2026-08-13.md
test("학년별 계약은 개념 수·인과 깊이·자료 비판 수준을 단계화한다", async () => {
  const quality = await text("skills/teach-grounded-scenarios/references/lesson-quality-balance.md");
  const grades = await text("skills/teach-grounded-scenarios/references/grade-bands.md");
  const custom = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");

  for (const grade of [
    "초등학교 3~4학년",
    "초등학교 5~6학년",
    "중학교 1~3학년",
    "고등학교 1~2학년"
  ]) {
    assert.match(quality, new RegExp(grade, "u"));
    assert.match(grades, new RegExp(grade, "u"));
  }
  assert.match(custom, /초3~4: 360~600자/u);
  assert.match(custom, /고1~2: 1,200~2,000자/u);
  assert.match(quality, /학생의 실제 반응이 학년 기본값보다 우선한다/u);
});

// Regression: ISSUE-009 — 출력 직전 교차 점검이 각 문서에 흩어져 누락될 수 있었다.
// Found by /qa on 2026-08-13
// Report: .gstack/qa-reports/qa-report-chatgpt-com-2026-08-13.md
test("출력 전 감사는 안전부터 창의성까지 일곱 축을 모두 검사한다", async () => {
  const quality = await text("skills/teach-grounded-scenarios/references/lesson-quality-balance.md");
  const auditSection = quality.split("## 출력 전 7문항 감사")[1] ?? "";
  const numbered = auditSection.match(/^[1-7]\. /gmu) ?? [];

  assert.equal(numbered.length, 7);
  for (const phrase of ["P0", "열린 원문", "조건과 한계", "확정 사건", "인과 앵커", "문장 길이", "실제로 선택"]) {
    assert.match(auditSection, new RegExp(phrase, "u"));
  }
});
