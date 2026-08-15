import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectCopilotReadiness } from "../scripts/copilot-doctor.mjs";
import { run } from "../skills/teacher-grounded-testbed/scripts/teacher-store.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return (await readFile(join(root, relativePath), "utf8")).replace(/^\uFEFF/u, "");
}

async function runTeacherHelp() {
  const script = join(root, "skills", "teacher-grounded-testbed", "scripts", "teacher-store.mjs");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, "--help"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function runTeacherInvalid() {
  const script = join(root, "skills", "teacher-grounded-testbed", "scripts", "teacher-store.mjs");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, "not-a-command"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("첫 화면은 학생·교사·학교 IT 관리자의 경로와 현재 한계를 분리한다", async () => {
  const guide = await text("START-HERE.md");
  assert.match(guide, /학생 또는 수업 체험자/u);
  assert.match(guide, /교사: 내 학급에 맞게 간단히 편집/u);
  assert.match(guide, /학교 IT 관리자: Microsoft 365 Copilot/u);
  assert.match(guide, /Microsoft 365 Copilot \| 시험 패키지 준비/u);
  assert.match(guide, /Windows 독립 실행 \| 보류/u);
});

test("초심자용 학급 설정표는 개인정보와 불변 규칙 경계를 함께 안내한다", async () => {
  const settings = await text("chatgpt/CLASSROOM_SETTINGS.example.md");
  const bootstrap = await text("chatgpt/BOOTSTRAP.md");
  const custom = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  assert.match(settings, /대괄호 안만 고치세요/u);
  assert.match(settings, /학생 개인정보를 적지 마세요/u);
  assert.match(settings, /\[학급 설정\]/u);
  assert.match(settings, /공통 안전 규칙/u);
  assert.match(bootstrap, /교사가 제공한 학급 설정/u);
  assert.match(custom, /학급 설정 입력/u);
});

test("교사 명령은 빈 호출과 도움말에서 실패하지 않고 다음 행동을 보여준다", async () => {
  const empty = await run([]);
  const pnpmStyle = await run(["--", "doctor"]);
  const commandHelp = await run(["create-profile", "--help"]);
  const cli = await runTeacherHelp();
  assert.equal(empty.ok, true);
  assert.match(empty.help, /Reverse 교사 로컬 학습 도구/u);
  assert.equal(pnpmStyle.ok, true);
  assert.match(commandHelp.help, /create-profile/u);
  assert.equal(cli.code, 0);
  assert.equal(cli.stderr, "");
  assert.match(cli.stdout, /가장 짧은 확인/u);
  assert.match(cli.stdout, /CLASSROOM_SETTINGS\.example\.md/u);
});

test("잘못된 교사 명령은 JSON 대신 고칠 방법을 쉬운 문장으로 보여준다", async () => {
  const invalid = await runTeacherInvalid();
  assert.equal(invalid.code, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /^오류:/u);
  assert.match(invalid.stderr, /pnpm teacher -- --help/u);
  assert.doesNotMatch(invalid.stderr, /\{"ok":false/u);
});

test("Copilot 진단은 로컬 패키지 준비와 실제 테넌트 검증을 구분한다", async () => {
  const result = await inspectCopilotReadiness(root);
  assert.equal(result.status, "PACKAGE_BUILT_TENANT_TEST_REQUIRED");
  assert.equal(result.local_package_ready, true);
  assert.equal(result.upload_ready, false);
  assert.equal(result.checks.find((check) => check.id === "declarative_agent").ok, true);
  assert.equal(result.checks.find((check) => check.id === "app_manifest").ok, true);
  assert.equal(result.checks.find((check) => check.id === "package_zip").ok, true);
  assert.match(result.manual_checks.join("\n"), /Enterprise\/Education/u);
});
