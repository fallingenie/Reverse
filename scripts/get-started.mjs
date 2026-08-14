#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { inspectCopilotReadiness } from "./copilot-doctor.mjs";
import { inspectTenantReadiness } from "./copilot-tenant-doctor.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stripBom(text) {
  return text.replace(/^\uFEFF/u, "");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readableText(path, requiredPatterns = []) {
  try {
    const value = stripBom(await readFile(path, "utf8"));
    return requiredPatterns.every((pattern) => pattern.test(value));
  } catch {
    return false;
  }
}

async function verifyExportManifest(root) {
  try {
    const chatgptRoot = join(root, "chatgpt");
    const manifest = JSON.parse(stripBom(await readFile(join(chatgptRoot, "EXPORT_MANIFEST.json"), "utf8")));
    const entries = Object.entries(manifest.file_digests ?? {});
    if (manifest.package_id !== "reverse-chatgpt"
      || manifest.license !== "Apache-2.0"
      || entries.length === 0
      || manifest.file_count !== entries.length) {
      return false;
    }
    const withoutSeal = {
      schema_version: manifest.schema_version,
      package_id: manifest.package_id,
      license: manifest.license,
      file_count: manifest.file_count,
      file_digests: manifest.file_digests
    };
    if (sha256(canonicalJson(withoutSeal)) !== manifest.seal_sha256) return false;
    for (const [relativePath, expectedDigest] of entries) {
      const contentPath = resolve(chatgptRoot, relativePath);
      const pathFromRoot = relative(chatgptRoot, contentPath);
      if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return false;
      const content = await readFile(contentPath);
      const actualDigest = sha256(content);
      if (actualDigest !== expectedDigest) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function inspectChatgptReadiness(root = repositoryRoot) {
  const chatgptRoot = join(root, "chatgpt");
  const checks = [
    {
      id: "bootstrap",
      label: "ChatGPT 시작 지침에 학교급 확인과 [시작] 게이트가 있음",
      ok: await readableText(join(chatgptRoot, "BOOTSTRAP.md"), [/학교급/u, /\[시작\]/u])
    },
    {
      id: "classroom_settings",
      label: "개인정보 금지선이 있는 학급 설정표가 있음",
      ok: await readableText(join(chatgptRoot, "CLASSROOM_SETTINGS.example.md"), [/학생 개인정보/u, /학급 설정/u])
    },
    {
      id: "custom_gpt_instructions",
      label: "비공개 Custom GPT용 지침 파일이 있음",
      ok: await readableText(join(chatgptRoot, "custom-gpt", "INSTRUCTIONS.md"), [/P0/u, /학교급/u])
    },
    {
      id: "export_manifest",
      label: "ChatGPT 배포물 해시가 현재 파일과 일치함",
      ok: await verifyExportManifest(root)
    },
    {
      id: "license_notice",
      label: "ChatGPT 배포물에 LICENSE와 NOTICE가 있음",
      ok: await Promise.all([
        readableText(join(chatgptRoot, "LICENSE"), [/Apache License/u]),
        readableText(join(chatgptRoot, "NOTICE"), [/Reverse/u])
      ]).then((items) => items.every(Boolean))
    }
  ];
  const localPackageReady = checks.every((check) => check.ok);
  return {
    status: localPackageReady ? "LOCAL_PACKAGE_READY_LIVE_TEST_REQUIRED" : "LOCAL_PACKAGE_NOT_READY",
    local_package_ready: localPackageReady,
    live_chatgpt_verified: false,
    checks
  };
}

function menuText() {
  return [
    "Reverse 시작 점검",
    "",
    "1. ChatGPT 수업 자료 확인",
    "2. Microsoft 365 Copilot 패키지 확인",
    "",
    "바로 실행:",
    "  pnpm start -- chatgpt",
    "  pnpm start -- copilot",
    "",
    "학교 IT 관리자가 테넌트 정책까지 확인할 때만:",
    "  pnpm start -- copilot --tenant",
    "",
    "이 도구는 비공개 GPT를 만들거나 공유하지 않고, Microsoft 365 정책을 변경하거나 앱을 설치하지 않습니다.",
    ""
  ].join("\n");
}

function formatChecks(checks, failedLabel = "없음") {
  return checks.map((check) => `${check.ok ? "[확인]" : `[${failedLabel}]`} ${check.label}`);
}

function formatChatgpt(result) {
  const lines = ["ChatGPT 준비 점검", "", ...formatChecks(result.checks), ""];
  if (result.local_package_ready) {
    lines.push(
      "결론: 로컬 ChatGPT 수업 자료의 파일 무결성을 확인했습니다.",
      "공유받은 비공개 GPT가 있으면 해당 링크를 열어 교사 계정으로 시험하세요.",
      "공유 GPT가 없으면 이 저장소만으로 ChatGPT에 자동 설치할 수 없습니다.",
      "일반 대화 방식은 chatgpt/START-HERE.md를 따르며, 지침 입력이 필요합니다."
    );
  } else {
    lines.push(
      "결론: 로컬 ChatGPT 수업 자료가 누락됐거나 배포물 해시가 맞지 않습니다.",
      "사용하지 말고 개발 담당자에게 현재 저장소 상태를 전달하세요."
    );
  }
  lines.push("", "이 점검은 실제 ChatGPT 응답·출처·안전 규칙 통과를 뜻하지 않습니다.", "");
  return lines.join("\n");
}

function formatCopilotLocal(result, { tenantRequested = false } = {}) {
  const lines = ["Microsoft 365 Copilot 로컬 패키지 점검", "", ...formatChecks(result.checks), ""];
  if (result.local_package_ready) {
    lines.push(
      "결론: 로컬 시험 ZIP이 준비됐습니다. 아직 설치 가능 또는 배포 가능 상태는 아닙니다."
    );
    if (tenantRequested) {
      lines.push("학교 IT 관리자 요청으로 로그인과 조직 정책 점검을 이어갑니다.");
    } else {
      lines.push(
        "교사는 여기서 중단하세요.",
        "학교 IT 관리자만 다음 명령으로 로그인과 조직 정책을 확인하세요:",
        "  pnpm start -- copilot --tenant"
      );
    }
  } else {
    lines.push(
      "결론: 로컬 시험 ZIP이 준비되지 않았습니다.",
      "업로드하지 말고 개발 담당자에게 누락 항목을 전달하세요."
    );
  }
  lines.push("", "이 점검은 실제 테넌트 동작을 뜻하지 않습니다.", "");
  return lines.join("\n");
}

function formatTenant(result) {
  const lines = ["Microsoft 365 Copilot 테넌트 경계 점검", ""];
  if (result.supported_environment) {
    lines.push(
      `지원 대상 환경: ${result.supported_environment.display_name}`,
      `환경 ID: ${result.supported_environment.environment_id}`,
      ""
    );
  }
  lines.push(...formatChecks(result.checks, "차단"), "");
  if (result.status === "TENANT_PREFLIGHT_READY") {
    lines.push(
      "결론: 사전 조건을 확인했습니다.",
      "학교 IT 관리자가 비공개 시험 범위에서만 설치와 실제 응답 검증을 진행하세요."
    );
  } else if (result.status === "TENANT_POLICY_BLOCKED") {
    lines.push(
      "결론: 조직 정책이 사용자 지정 앱 업로드를 허용하지 않습니다.",
      "교사가 해결할 문제가 아닙니다. 학교 IT 관리자가 정책과 대상 계정을 확인할 때까지 중단하세요."
    );
  } else if (result.status === "TENANT_AUTH_REQUIRED") {
    lines.push(
      "결론: 시험용 Microsoft 365 계정 로그인이 필요합니다.",
      "개인 학생 계정으로 진행하지 말고 학교 IT 관리자에게 요청하세요."
    );
  } else if (result.status === "TENANT_IDENTITY_MISMATCH") {
    lines.push(
      "결론: 현재 로그인 계정의 조직 도메인이 허용된 시험 범위와 다릅니다.",
      "업로드하지 말고 학교 IT 관리자에게 대상 계정과 환경을 확인해 달라고 요청하세요."
    );
  } else if (result.status === "TENANT_ENVIRONMENT_CONFIRMATION_REQUIRED") {
    lines.push(
      "결론: Copilot Studio 화면의 환경 ID를 위 값과 직접 대조해야 합니다.",
      "확인 전에는 앱을 업로드하지 마세요."
    );
  } else {
    lines.push(
      "결론: 로컬 시험 ZIP부터 준비해야 합니다.",
      "업로드하거나 정책을 변경하지 마세요."
    );
  }
  lines.push("", "이 점검은 앱 설치, 실제 에이전트 응답, 출처, 안전 규칙 통과를 뜻하지 않습니다.", "");
  return lines.join("\n");
}

function normalizeArgs(args) {
  const normalized = [...args];
  while (normalized[0] === "--") normalized.shift();
  return normalized;
}

export function selectionToArgs(value) {
  const answer = String(value ?? "").trim();
  if (answer === "") return [];
  if (answer === "1") return ["chatgpt"];
  if (answer === "2") return ["copilot"];
  return [answer];
}

function argumentError(message) {
  return {
    exitCode: 1,
    stdout: "",
    stderr: [
      `오류: ${message}`,
      "",
      "사용법:",
      "  pnpm start -- chatgpt",
      "  pnpm start -- copilot",
      "  pnpm start -- copilot --tenant",
      ""
    ].join("\n")
  };
}

export async function runStart(rawArgs, dependencies = {}) {
  const args = normalizeArgs(rawArgs);
  const inspectChatgpt = dependencies.inspectChatgptReadiness ?? inspectChatgptReadiness;
  const inspectCopilot = dependencies.inspectCopilotReadiness ?? inspectCopilotReadiness;
  const inspectTenant = dependencies.inspectTenantReadiness ?? inspectTenantReadiness;

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: menuText(), stderr: "" };
  }

  const [target, ...flags] = args;
  const strict = flags.includes("--strict");
  const unknownFlags = flags.filter((flag) => !["--strict", "--tenant"].includes(flag));
  if (unknownFlags.length > 0) return argumentError(`지원하지 않는 옵션입니다: ${unknownFlags.join(", ")}`);

  if (target === "chatgpt") {
    if (flags.includes("--tenant")) return argumentError("--tenant 옵션은 Copilot 경로에서만 사용합니다.");
    const result = await inspectChatgpt(repositoryRoot);
    return {
      exitCode: strict && !result.local_package_ready ? 2 : 0,
      stdout: formatChatgpt(result),
      stderr: ""
    };
  }

  if (target === "copilot") {
    const tenantRequested = flags.includes("--tenant");
    const local = await inspectCopilot(repositoryRoot);
    let stdout = formatCopilotLocal(local, { tenantRequested });
    let ready = local.local_package_ready;
    if (tenantRequested && local.local_package_ready) {
      const tenant = await inspectTenant();
      stdout = `${stdout}\n${formatTenant(tenant)}`;
      ready = tenant.upload_allowed;
    }
    return { exitCode: strict && !ready ? 2 : 0, stdout, stderr: "" };
  }

  return argumentError(`지원하지 않는 경로입니다: ${target}`);
}

async function main() {
  let args = process.argv.slice(2);
  if (normalizeArgs(args).length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    process.stdout.write(menuText());
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await reader.question("선택 번호를 입력하세요. 종료하려면 Enter를 누르세요: ");
    reader.close();
    args = selectionToArgs(answer);
    if (args.length === 0) return;
  }

  const result = await runStart(args);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
