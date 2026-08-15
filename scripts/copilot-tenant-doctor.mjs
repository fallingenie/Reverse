#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCopilotReadiness } from "./copilot-doctor.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function readTenantTestProfile(root = repositoryRoot) {
  return JSON.parse(await readFile(resolve(root, "copilot", "TENANT_TEST_PROFILE.json"), "utf8"));
}

function runAtk(args) {
  const cli = resolve(repositoryRoot, "node_modules", "@microsoft", "m365agentstoolkit-cli", "cli.js");
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

export function parseTenantChecks({ authOutput, doctorOutput, localPackageReady, tenantProfile, environmentIdentityConfirmed = false }) {
  const combinedDoctor = `${doctorOutput.stdout}\n${doctorOutput.stderr}`;
  const accountMatch = authOutput.stdout.match(/account is:\s*(\S+)/iu);
  const account = accountMatch?.[1]?.replace(/\.$/u, "") ?? null;
  const customUploadBlocked = /hasn't enabled custom app upload permission|사용자 지정 앱 업로드.*(?:사용|허용).*(?:않|안)/iu.test(combinedDoctor);
  const authReady = authOutput.code === 0 && Boolean(account);
  const customUploadReady = doctorOutput.code === 0 && !customUploadBlocked;
  const accountDomain = account?.split("@").at(-1)?.toLowerCase() ?? null;
  const allowedDomains = tenantProfile.supported_environment.allowed_account_domains.map((domain) => domain.toLowerCase());
  const accountDomainReady = authReady && allowedDomains.includes(accountDomain);

  let status = "TENANT_PREFLIGHT_READY";
  if (!localPackageReady) status = "LOCAL_PACKAGE_NOT_READY";
  else if (!authReady) status = "TENANT_AUTH_REQUIRED";
  else if (!accountDomainReady) status = "TENANT_IDENTITY_MISMATCH";
  else if (!customUploadReady) status = "TENANT_POLICY_BLOCKED";
  else if (!environmentIdentityConfirmed) status = "TENANT_ENVIRONMENT_CONFIRMATION_REQUIRED";

  return {
    status,
    account,
    checks: [
      { id: "account", ok: authReady, label: "Microsoft 365 시험 계정 로그인" },
      { id: "account_domain", ok: accountDomainReady, label: "시험 계정 조직 도메인이 허용된 범위와 일치" },
      { id: "custom_app_upload", ok: customUploadReady, label: "관리자의 사용자 지정 앱 업로드 허용" },
      { id: "local_package", ok: localPackageReady, label: "로컬 시험 ZIP 준비" },
      { id: "supported_environment", ok: environmentIdentityConfirmed, label: "Copilot Studio의 지원 대상 환경 ID를 관리자가 직접 대조" }
    ],
    upload_allowed: status === "TENANT_PREFLIGHT_READY",
    supported_environment: tenantProfile.supported_environment,
    environment_identity_verification: tenantProfile.environment_identity_verification,
    raw_exit_codes: { auth: authOutput.code, doctor: doctorOutput.code }
  };
}

export async function inspectTenantReadiness() {
  const [local, tenantProfile, authOutput, doctorOutput] = await Promise.all([
    inspectCopilotReadiness(),
    readTenantTestProfile(),
    runAtk(["auth", "list"]),
    runAtk(["doctor"])
  ]);
  return parseTenantChecks({
    authOutput,
    doctorOutput,
    localPackageReady: local.local_package_ready,
    tenantProfile,
    environmentIdentityConfirmed: false
  });
}

function formatHuman(result) {
  const lines = [
    "Microsoft 365 Copilot 테넌트 사전 점검",
    "",
    `지원 대상 환경: ${result.supported_environment.display_name}`,
    `환경 ID: ${result.supported_environment.environment_id}`,
    ""
  ];
  for (const check of result.checks) lines.push(`${check.ok ? "[확인]" : "[차단]"} ${check.label}`);
  if (result.account) lines.push("", `시험 계정: ${result.account}`);
  lines.push("");
  if (result.status === "TENANT_PREFLIGHT_READY") {
    lines.push("결론: 사전 조건을 확인했습니다. IT 관리자가 비공개 시험 범위에서만 설치를 진행하세요.");
  } else if (result.status === "TENANT_POLICY_BLOCKED") {
    lines.push("결론: 테넌트 정책이 사용자 지정 앱 업로드를 허용하지 않습니다.");
    lines.push("교사에게 설치를 맡기지 말고, 학교 IT 관리자가 정책과 대상 계정을 확인할 때까지 중단하세요.");
  } else if (result.status === "TENANT_AUTH_REQUIRED") {
    lines.push("결론: Microsoft 365 시험 계정 로그인이 필요합니다. 개인 학생 계정으로 진행하지 마세요.");
  } else if (result.status === "TENANT_IDENTITY_MISMATCH") {
    lines.push("결론: 현재 로그인 계정의 조직 도메인이 허용된 시험 범위와 다릅니다. 업로드하지 마세요.");
  } else if (result.status === "TENANT_ENVIRONMENT_CONFIRMATION_REQUIRED") {
    lines.push("결론: Copilot Studio 화면의 환경 ID를 위 값과 직접 대조해야 합니다. 확인 전에는 업로드하지 마세요.");
  } else {
    lines.push("결론: 로컬 시험 ZIP부터 완성해야 합니다. 업로드하지 마세요.");
  }
  lines.push("", "이 점검 통과는 실제 에이전트 응답·출처·안전 규칙 통과를 뜻하지 않습니다.", "");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await inspectTenantReadiness();
  process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify(result, null, 2)}\n` : formatHuman(result));
  if (process.argv.includes("--strict") && !result.upload_allowed) process.exitCode = 2;
}
