import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  captureCommand,
  containsAbsoluteUserPath,
  directoryDigest,
  isSafeTemporaryRoot,
  parsePorcelainZ,
  parseNodeTestCounts,
  parseToolkitValidationCount,
  recordCommandEvidence,
  removeTemporaryRoot,
  sanitizeAbsoluteUserPaths,
  scanForSecrets,
  sha256
} from "../scripts/local-self-attestation.mjs";

test("비밀값 패턴은 원문을 증거에 넣기 전에 차단한다", () => {
  assert.deepEqual(scanForSecrets("normal output"), []);
  assert.deepEqual(scanForSecrets(`token=github_pat_${"a".repeat(30)}`), ["github-token"]);
  assert.deepEqual(scanForSecrets("Authorization: Bearer abcdefghijklmnop"), ["authorization-header"]);
});

test("사용자 홈과 지정한 로컬 경로를 공개 로그에서 치환한다", () => {
  const source = "C:\\Users\\teacher\\project\\file.txt\nC:\\Temp\\reverse\\a.txt";
  const result = sanitizeAbsoluteUserPaths(source, ["C:\\Temp\\reverse"]);
  assert.ok(result.replacements >= 2);
  assert.equal(containsAbsoluteUserPath(result.text), false);
  assert.match(result.text, /<USER_HOME>|<LOCAL_PATH>/u);
});

test("NUL 구분 Git 상태의 첫 공백과 미추적 경로를 보존한다", () => {
  const status = parsePorcelainZ(" M windows/README.md\0?? windows/tests/test_profiles.py\0");
  assert.deepEqual(status, [
    { status: " M", path: "windows/README.md" },
    { status: "??", path: "windows/tests/test_profiles.py" }
  ]);
});

test("임시 checkout 삭제는 OS 임시 폴더의 전용 접두사만 허용한다", async () => {
  const safe = await mkdtemp(join(tmpdir(), "reverse-local-attest-"));
  assert.equal(isSafeTemporaryRoot(safe), true);
  assert.equal(isSafeTemporaryRoot(tmpdir()), false);
  await assert.rejects(removeTemporaryRoot(join(tmpdir(), "unrelated-folder")), /안전하지 않은 임시 경로/u);
  await removeTemporaryRoot(safe);
});

test("명령 기록은 argv, 시각, exit code와 UTF-8-SIG 로그 해시를 보존한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-evidence-test-"));
  try {
    const record = await recordCommandEvidence({
      id: "probe",
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok')"],
      cwd: root,
      logDirectory: root,
      roots: [root],
      timeoutMs: 10_000
    });
    assert.equal(record.exit_code, 0);
    assert.equal(record.secret_scan.passed, true);
    assert.deepEqual(record.argv.slice(1), ["-e", "process.stdout.write('ok')"]);
    const stdout = await readFile(join(root, "probe.stdout.txt"));
    assert.deepEqual([...stdout.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(record.stdout.sha256, sha256(stdout));
    assert.match(record.started_at_utc, /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(record.ended_at_utc, /^\d{4}-\d{2}-\d{2}T/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("명령이 비밀값을 출력하면 원문 로그 파일을 남기지 않는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-evidence-secret-test-"));
  try {
    const token = `github_pat_${"z".repeat(30)}`;
    const record = await recordCommandEvidence({
      id: "secret-probe",
      command: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(token)})`],
      cwd: root,
      logDirectory: root,
      roots: [root],
      timeoutMs: 10_000
    });
    assert.equal(record.secret_scan.passed, false);
    assert.equal(record.stdout, null);
    await assert.rejects(readFile(join(root, "secret-probe.stdout.txt")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("명령 실패는 exit code를 숨기지 않는다", async () => {
  const result = await captureCommand({
    command: process.execPath,
    args: ["-e", "process.exit(7)"],
    cwd: tmpdir(),
    timeoutMs: 10_000
  });
  assert.equal(result.exit_code, 7);
});

test("Node TAP 시험 수와 디렉터리 digest를 결정적으로 읽는다", async () => {
  assert.deepEqual(parseNodeTestCounts("# tests 51\n# pass 51\n# fail 0\n# skipped 0\n"), {
    tests: 51,
    pass: 51,
    fail: 0,
    skipped: 0
  });
  assert.deepEqual(parseNodeTestCounts("ℹ tests 51\nℹ pass 51\nℹ fail 0\n"), {
    tests: 51,
    pass: 51,
    fail: 0
  });
  assert.deepEqual(parseToolkitValidationCount("Summary:\n59 passed.\n"), {
    passed: 59,
    failed: 0
  });
  const root = await mkdtemp(join(tmpdir(), "reverse-evidence-digest-test-"));
  try {
    const first = await directoryDigest(root);
    const second = await directoryDigest(root);
    assert.deepEqual(first, second);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
