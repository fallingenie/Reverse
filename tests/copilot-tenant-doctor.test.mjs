import assert from "node:assert/strict";
import test from "node:test";
import { parseTenantChecks } from "../scripts/copilot-tenant-doctor.mjs";

test("관리자 업로드 정책 차단을 설치 가능으로 오인하지 않는다", () => {
  const result = parseTenantChecks({
    authOutput: { code: 0, stdout: "Your Microsoft 365 account is: teacher@example.edu.", stderr: "" },
    doctorOutput: {
      code: 0,
      stdout: "Warning: Your Microsoft 365 tenant admin hasn't enabled custom app upload permission for your account.",
      stderr: ""
    },
    localPackageReady: true
  });
  assert.equal(result.status, "TENANT_POLICY_BLOCKED");
  assert.equal(result.upload_allowed, false);
  assert.equal(result.account, "teacher@example.edu");
});

test("로그인·정책·로컬 패키지가 모두 확인된 때만 사전 준비로 판정한다", () => {
  const result = parseTenantChecks({
    authOutput: { code: 0, stdout: "Your Microsoft 365 account is: teacher@example.edu.", stderr: "" },
    doctorOutput: { code: 0, stdout: "Done", stderr: "" },
    localPackageReady: true
  });
  assert.equal(result.status, "TENANT_PREFLIGHT_READY");
  assert.equal(result.upload_allowed, true);
});

test("로그인 실패는 정책 상태보다 먼저 별도 안내한다", () => {
  const result = parseTenantChecks({
    authOutput: { code: 1, stdout: "", stderr: "not signed in" },
    doctorOutput: { code: 0, stdout: "Done", stderr: "" },
    localPackageReady: true
  });
  assert.equal(result.status, "TENANT_AUTH_REQUIRED");
  assert.equal(result.upload_allowed, false);
});
