import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStudentSkillRuntimePackage } from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const paths = [
  "skills/teach-grounded-scenarios/student-runtime/SKILL.md",
  "skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md",
  "copilot/studio/STUDIO_INSTRUCTIONS.md"
];

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

test("학생 요청과 평문 키는 대화·프로필 Markdown 내보내기 권한이 아니다", async () => {
  const contents = await Promise.all(paths.map(text));
  for (const [index, content] of contents.entries()) {
    assert.match(content, /학생 요청.*평문.*(?:키|표지).*인증.*아니/u, paths[index]);
    assert.match(content, /대화.*프로필.*Markdown.*(?:내보내|export)/su, paths[index]);
    assert.match(content, /파일 생성.*전송.*영구 ?저장.*약속하지 않/su, paths[index]);
  }
});

test("인증된 교사용 서버 경로만 별도 처리 주체이며 Copilot은 실행을 주장하지 않는다", async () => {
  const combined = (await Promise.all(paths.map(text))).join("\n");
  assert.match(combined, /서버에서 인증된.*교사용 Vercel 경로/u);
  assert.match(combined, /현재 Copilot.*실행.*완료.*주장하지 않/su);
  assert.match(combined, /화면.*요약/u);
});

test("내보내기 회귀 벡터는 학생·사칭·주입·서버 handoff를 분리한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/student-export-boundary-cases.json"));
  assert.equal(fixture.cases.length, 5);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 5);
  assert(fixture.cases.some(({ expected }) => expected === "PLAINTEXT_KEY_NO_AUTHORITY"));
  assert(fixture.cases.some(({ expected }) => expected === "SELF_CLAIM_NO_AUTHORITY"));
  assert(fixture.cases.some(({ expected }) => expected === "UNTRUSTED_DATA_NO_EXPORT"));
  assert(fixture.cases.some(({ expected }) => expected === "SERVER_ROUTE_HANDOFF_ONLY"));
});

test("학생 Skill ZIP에도 내보내기 경계가 포함된다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = entries.map(({ data }) => data.toString("utf8").replace(/^\uFEFF/u, "")).join("\n");
  assert.match(packaged, /대화.*프로필.*Markdown.*(?:내보내|export)/su);
  assert.match(packaged, /파일 생성.*전송.*영구 ?저장.*약속하지 않/su);
});

test("내보내기 fixture와 테스트는 UTF-8 무BOM이다", async () => {
  for (const relativePath of [
    "tests/fixtures/student-export-boundary-cases.json",
    "tests/student-export-boundary.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
});
