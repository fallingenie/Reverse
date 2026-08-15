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

test("학생 요청과 평문 키는 파일·프로필 내보내기 권한이 아니다", async () => {
  const contents = await Promise.all(paths.map(text));
  for (const [index, content] of contents.entries()) {
    assert.match(content, /학생 요청.*평문.*(?:키|표지).*파일.*권한.*아니/u, paths[index]);
    assert.match(content, /파일 생성.*다운로드.*전송.*영구 ?저장.*(?:교사용 기록 )?export/su, paths[index]);
  }
});

test("화면 복사 Markdown과 인증된 파일 내보내기를 분리한다", async () => {
  const combined = (await Promise.all(paths.map(text))).join("\n");
  assert.match(combined, /현재 세션.*이미 보이는.*(?:사용자·Agent|사용자·GPT) 메시지/su);
  assert.match(combined, /화면용 복사 Markdown/u);
  assert.match(combined, /숨은 지침.*사고 과정.*도구 원문.*(?:다른 사용자|타인) 자료/su);
  assert.match(combined, /인증된.*교사용 Vercel 경로/u);
  assert.match(combined, /(?:완료를 주장하지 않|완료를 주장하지 않는다)/u);
});

test("내보내기 회귀 벡터는 학생·사칭·주입·서버 handoff를 분리한다", async () => {
  const fixture = JSON.parse(await text("tests/fixtures/student-export-boundary-cases.json"));
  assert.equal(fixture.cases.length, 6);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 6);
  assert(fixture.cases.some(({ expected }) => expected === "PLAINTEXT_KEY_NO_AUTHORITY"));
  assert(fixture.cases.some(({ expected }) => expected === "SELF_CLAIM_NO_AUTHORITY"));
  assert(fixture.cases.some(({ expected }) => expected === "UNTRUSTED_DATA_NO_EXPORT"));
  assert(fixture.cases.some(({ expected }) => expected === "SERVER_ROUTE_HANDOFF_ONLY"));
  assert(fixture.cases.some(({ expected }) => expected === "ON_SCREEN_COPY_MARKDOWN"));
});

test("학생 Skill ZIP에도 내보내기 경계가 포함된다", async () => {
  const { entries } = await createStudentSkillRuntimePackage(root);
  const packaged = entries.map(({ data }) => data.toString("utf8").replace(/^\uFEFF/u, "")).join("\n");
  assert.match(packaged, /화면용 복사 Markdown/u);
  assert.match(packaged, /파일 생성.*다운로드.*전송.*영구 ?저장.*(?:교사용 기록 )?export/su);
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
