import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = "tests/fixtures/student-visible-source-free-input-cases.json";
const runtimePaths = [
  "chatgpt/custom-gpt/INSTRUCTIONS.md",
  "copilot/studio/STUDIO_INSTRUCTIONS.md",
  "skills/teach-grounded-scenarios/SKILL.md",
  "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
  "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
];

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("학생에게 고아 번호 인용을 보이지 않고 같은 응답에 실제 원문 링크를 연결한다", async () => {
  for (const relativePath of runtimePaths) {
    const contents = await text(relativePath);
    assert.match(contents, /\[1\]\[2\]/u, `${relativePath}: 고아 인용 회귀 표지 누락`);
    assert.match(contents, /출처명/u, `${relativePath}: 학생용 출처명 누락`);
    assert.match(contents, /실제 `?https:\/\//u, `${relativePath}: 실제 HTTPS 링크 누락`);
    assert.match(contents, /지지 범위/u, `${relativePath}: 직접 지지 범위 누락`);
    assert.match(contents, /번호.*확인 필요|확인 필요.*번호/su, `${relativePath}: 링크 실패 fallback 누락`);
  }
});

test("직접 입력은 문장 틀과 무관한 자유 서술을 허용한다", async () => {
  const fixture = JSON.parse(await text(fixturePath));
  const guidance = fixture.cases.find(item => item.id === "SVS-002").student_guidance;
  for (const relativePath of runtimePaths) {
    const contents = await text(relativePath);
    assert.match(contents, /직접 입력.*자유 서술/su, `${relativePath}: 자유 서술 경계 누락`);
    assert.match(contents, new RegExp(guidance.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(contents, /빈칸만.*(?:강제하지|금지|제한하지)/su, `${relativePath}: 빈칸 강제 차단 누락`);
  }
});

test("사실 교정 뒤 같은 응답에서 장면과 행동으로 복귀한다", async () => {
  for (const relativePath of runtimePaths) {
    const contents = await text(relativePath);
    assert.match(contents, /핵심 교정 2~4문장/u, `${relativePath}: 교정 분량 경계 누락`);
    assert.match(contents, /출처 링크 1~2개/u, `${relativePath}: 링크 수 경계 누락`);
    assert.match(contents, /장면(?:으로)? 복귀/u, `${relativePath}: 장면 복귀 누락`);
    assert.match(contents, /단서 1개/u, `${relativePath}: 복귀 단서 누락`);
    assert.match(contents, /행동 2~4개/u, `${relativePath}: 복귀 행동 누락`);
    assert.match(contents, /(?:출력 예산|분량).*소진하지 않/su, `${relativePath}: 해설 독점 차단 누락`);
  }
});

test("모든 학년 밴드의 학생 응답 범위는 이전 계약의 정확히 두 배다", async () => {
  const fixture = JSON.parse(await text(fixturePath));
  const policyPaths = [
    "RULES.md",
    "chatgpt/POLICY.md",
    "chatgpt/custom-gpt/INSTRUCTIONS.md",
    "copilot/studio/STUDIO_INSTRUCTIONS.md",
    "copilot/knowledge/reverse-policy.txt",
    "copilot/appPackage/knowledge/reverse-policy.txt",
    "skills/teach-grounded-scenarios/references/grade-bands.md",
  ];
  const bandLabels = {
    "초3~4": "(?:초3~4|초등학교 3~4학년)",
    "초5~6": "(?:초5~6|초등학교 5~6학년)",
    "중1~3": "(?:중1~3|중학교 1~3학년)",
    "고1~2": "(?:고1~2|고등학교 1~2학년)",
  };
  for (const relativePath of policyPaths) {
    const contents = await text(relativePath);
    for (const [band, range] of Object.entries(fixture.grade_turn_ranges)) {
      const min = range.min.toLocaleString("en-US");
      const max = range.max.toLocaleString("en-US");
      assert.match(
        contents,
        new RegExp(`${bandLabels[band]}[\\s\\S]{0,120}${min}~${max}자`, "u"),
        `${relativePath}: ${band}`,
      );
    }
  }
});

test("새 회귀 fixture와 실행 파일은 UTF-8 무BOM 기계 파일이다", async () => {
  for (const relativePath of [fixturePath, "tests/student-visible-source-free-input.regression-1.test.mjs"]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], relativePath);
    assert.doesNotMatch(new TextDecoder("utf-8", {fatal: true}).decode(bytes), /\uFFFD|\uFEFF/u, relativePath);
  }
});
