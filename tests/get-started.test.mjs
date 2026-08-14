import assert from "node:assert/strict";
import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectCopilotReadiness } from "../scripts/copilot-doctor.mjs";
import { inspectChatgptReadiness, runStart, selectionToArgs } from "../scripts/get-started.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const localCopilotReady = {
  local_package_ready: true,
  checks: [{ id: "package_zip", ok: true, label: "로컬 시험 ZIP 준비" }]
};

test("첫 진입점은 역할별 명령과 자동 설치 경계를 보여준다", async () => {
  const result = await runStart([]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /1\. ChatGPT 수업 자료 확인/u);
  assert.match(result.stdout, /2\. Microsoft 365 Copilot 패키지 확인/u);
  assert.match(result.stdout, /pnpm start -- copilot --tenant/u);
  assert.match(result.stdout, /정책을 변경하거나 앱을 설치하지 않습니다/u);
});

test("번호 선택은 ChatGPT·Copilot·종료·잘못된 입력을 명확히 구분한다", () => {
  assert.deepEqual(selectionToArgs("1"), ["chatgpt"]);
  assert.deepEqual(selectionToArgs("2"), ["copilot"]);
  assert.deepEqual(selectionToArgs(""), []);
  assert.deepEqual(selectionToArgs("  "), []);
  assert.deepEqual(selectionToArgs("3"), ["3"]);
});

test("ChatGPT 진단은 로컬 무결성과 실제 라이브 검증을 구분한다", async () => {
  const result = await runStart(["--", "chatgpt"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /배포물 해시가 현재 파일과 일치/u);
  assert.match(result.stdout, /자동 설치할 수 없습니다/u);
  assert.match(result.stdout, /실제 ChatGPT 응답·출처·안전 규칙 통과를 뜻하지 않습니다/u);
});

test("하위 경로 뒤 도움말도 실행 없이 첫 메뉴를 보여준다", async () => {
  let copilotCalls = 0;
  const result = await runStart(["copilot", "--help"], {
    inspectCopilotReadiness: async () => {
      copilotCalls += 1;
      return localCopilotReady;
    }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(copilotCalls, 0);
  assert.match(result.stdout, /Reverse 시작 점검/u);
});

test("ChatGPT 배포물은 현재 해시 기준으로 준비돼 있다", async () => {
  const result = await inspectChatgptReadiness();
  assert.equal(result.status, "LOCAL_PACKAGE_READY_LIVE_TEST_REQUIRED");
  assert.equal(result.local_package_ready, true);
  assert.equal(result.live_chatgpt_verified, false);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test("ChatGPT 파일이 manifest 뒤에 바뀌면 준비 상태를 실패 폐쇄한다", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverse-chatgpt-doctor-"));
  try {
    await cp(join(root, "chatgpt"), join(temporaryRoot, "chatgpt"), { recursive: true });
    await appendFile(join(temporaryRoot, "chatgpt", "BOOTSTRAP.md"), "\n변조 시험\n", "utf8");
    const result = await inspectChatgptReadiness(temporaryRoot);
    assert.equal(result.status, "LOCAL_PACKAGE_NOT_READY");
    assert.equal(result.local_package_ready, false);
    assert.equal(result.checks.find((check) => check.id === "export_manifest").ok, false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Copilot 기본 진입은 테넌트나 계정을 조회하지 않는다", async () => {
  let tenantCalls = 0;
  const result = await runStart(["copilot"], {
    inspectCopilotReadiness: async () => localCopilotReady,
    inspectTenantReadiness: async () => {
      tenantCalls += 1;
      throw new Error("기본 경로에서 호출되면 안 됨");
    }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(tenantCalls, 0);
  assert.match(result.stdout, /교사는 여기서 중단하세요/u);
  assert.match(result.stdout, /학교 IT 관리자만/u);
});

test("Copilot ZIP이 손상되면 로컬 준비 상태를 실패 폐쇄한다", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverse-copilot-doctor-corrupt-"));
  try {
    await cp(join(root, "copilot"), join(temporaryRoot, "copilot"), { recursive: true });
    await appendFile(
      join(temporaryRoot, "copilot", "appPackage", "build", "reverse-m365-copilot.zip"),
      Buffer.from([0])
    );
    const result = await inspectCopilotReadiness(temporaryRoot);
    assert.equal(result.local_package_ready, false);
    assert.equal(result.checks.find((check) => check.id === "package_zip").ok, false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Copilot 원본 정책이 ZIP 생성 뒤 바뀌면 오래된 패키지를 거부한다", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverse-copilot-doctor-stale-"));
  try {
    await cp(join(root, "copilot"), join(temporaryRoot, "copilot"), { recursive: true });
    await appendFile(join(temporaryRoot, "copilot", "knowledge", "reverse-policy.txt"), "\n변경 감지 시험\n", "utf8");
    const result = await inspectCopilotReadiness(temporaryRoot);
    assert.equal(result.local_package_ready, false);
    assert.equal(result.checks.find((check) => check.id === "package_zip").ok, false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("명시적 Copilot 테넌트 점검은 정책 차단을 설치 실패와 구분한다", async () => {
  const result = await runStart(["copilot", "--tenant"], {
    inspectCopilotReadiness: async () => localCopilotReady,
    inspectTenantReadiness: async () => ({
      status: "TENANT_POLICY_BLOCKED",
      upload_allowed: false,
      checks: [
        { id: "account", ok: true, label: "Microsoft 365 시험 계정 로그인" },
        { id: "custom_app_upload", ok: false, label: "관리자의 사용자 지정 앱 업로드 허용" }
      ]
    })
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /학교 IT 관리자 요청으로 로그인과 조직 정책 점검을 이어갑니다/u);
  assert.doesNotMatch(result.stdout, /교사는 여기서 중단하세요/u);
  assert.match(result.stdout, /\[차단\] 관리자의 사용자 지정 앱 업로드 허용/u);
  assert.match(result.stdout, /조직 정책이 사용자 지정 앱 업로드를 허용하지 않습니다/u);
  assert.match(result.stdout, /교사가 해결할 문제가 아닙니다/u);
  assert.doesNotMatch(result.stdout, /@/u);
});

test("로컬 Copilot 패키지가 없으면 테넌트 조회를 시작하지 않는다", async () => {
  let tenantCalls = 0;
  const result = await runStart(["copilot", "--tenant"], {
    inspectCopilotReadiness: async () => ({
      local_package_ready: false,
      checks: [{ id: "package_zip", ok: false, label: "로컬 시험 ZIP 준비" }]
    }),
    inspectTenantReadiness: async () => {
      tenantCalls += 1;
      throw new Error("로컬 준비 실패 뒤 호출되면 안 됨");
    }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(tenantCalls, 0);
  assert.match(result.stdout, /로컬 시험 ZIP이 준비되지 않았습니다/u);
});

test("엄격 모드에서는 정책 차단을 자동화 실패 코드로 반환한다", async () => {
  const result = await runStart(["copilot", "--tenant", "--strict"], {
    inspectCopilotReadiness: async () => localCopilotReady,
    inspectTenantReadiness: async () => ({
      status: "TENANT_POLICY_BLOCKED",
      upload_allowed: false,
      checks: [{ id: "custom_app_upload", ok: false, label: "관리자 정책" }]
    })
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderr, "");
});

test("자동 설치처럼 보이는 옵션은 건조한 한국어로 거부한다", async () => {
  const result = await runStart(["copilot", "--install"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^오류: 지원하지 않는 옵션입니다/u);
  assert.match(result.stderr, /pnpm start -- copilot --tenant/u);
});
