#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readableJson(path) {
  try {
    JSON.parse(await readFile(path, "utf8"));
    return true;
  } catch {
    return false;
  }
}

async function pngMatches(path, width, height, requireAlpha = false) {
  try {
    const buffer = await readFile(path);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 26 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
      return false;
    }
    const colorType = buffer[25];
    return buffer.readUInt32BE(16) === width
      && buffer.readUInt32BE(20) === height
      && (!requireAlpha || [4, 6].includes(colorType));
  } catch {
    return false;
  }
}

export async function inspectCopilotReadiness(root = repositoryRoot) {
  const copilotRoot = join(root, "copilot");
  const packageRoot = join(copilotRoot, "appPackage");
  const checks = [
    {
      id: "declarative_agent",
      label: "선언형 에이전트 JSON을 읽을 수 있음",
      ok: await readableJson(join(copilotRoot, "declarativeAgent.json"))
    },
    {
      id: "knowledge_file",
      label: "에이전트가 참조하는 지식 파일이 있음",
      ok: await exists(join(copilotRoot, "knowledge", "reverse-policy.txt"))
    },
    {
      id: "app_manifest",
      label: "Microsoft 365 앱 manifest.json이 있음",
      ok: await readableJson(join(packageRoot, "manifest.json"))
    },
    {
      id: "color_icon",
      label: "192×192 컬러 PNG 아이콘이 올바른 경로에 있음",
      ok: await pngMatches(join(packageRoot, "assets", "color.png"), 192, 192)
    },
    {
      id: "outline_icon",
      label: "32×32 투명 외곽선 PNG 아이콘이 올바른 경로에 있음",
      ok: await pngMatches(join(packageRoot, "assets", "outline.png"), 32, 32, true)
    },
    {
      id: "packaged_agent",
      label: "앱 패키지 안에 선언형 에이전트 JSON이 있음",
      ok: await readableJson(join(packageRoot, "declarativeAgent.json"))
    },
    {
      id: "knowledge_file_packaged",
      label: "앱 패키지 안에 근거 정책 파일이 있음",
      ok: await exists(join(packageRoot, "knowledge", "reverse-policy.txt"))
    },
    {
      id: "package_zip",
      label: "시험 테넌트용 ZIP 패키지가 생성됨",
      ok: await exists(join(packageRoot, "build", "reverse-m365-copilot.zip"))
    }
  ];
  const packageFilesReady = checks.filter((check) => !["declarative_agent", "knowledge_file"].includes(check.id)).every((check) => check.ok);
  return {
    ok: true,
    status: packageFilesReady ? "PACKAGE_BUILT_TENANT_TEST_REQUIRED" : "HOLD_INCOMPLETE_APP_PACKAGE",
    local_package_ready: packageFilesReady,
    upload_ready: false,
    checks,
    manual_checks: [
      "Microsoft 365 Copilot Enterprise/Education 테스트 테넌트가 있어야 합니다.",
      "조직 관리자가 에이전트 업로드 또는 사이드로드 정책을 확인해야 합니다.",
      "완성 ZIP을 Microsoft의 현재 도구로 검증해야 합니다.",
      "직접 실행, 메인 Copilot 호출, 응답 모드 변경, 웹 출처 표시를 실제로 시험해야 합니다."
    ],
    next_document: "copilot/IT-ADMIN-QUICK-START.md"
  };
}

function formatHuman(result) {
  const lines = [
    "Microsoft 365 Copilot 준비 상태",
    "",
    `판정: ${result.status === "HOLD_INCOMPLETE_APP_PACKAGE" ? "보류 — 설치 패키지가 완성되지 않았습니다." : "패키지 준비 — 실제 학교 테넌트 시험과 관리자 검토가 남았습니다."}`,
    ""
  ];
  for (const check of result.checks) {
    lines.push(`${check.ok ? "[확인]" : "[없음]"} ${check.label}`);
  }
  lines.push("", "사람이 직접 확인할 항목:");
  for (const item of result.manual_checks) {
    lines.push(`- ${item}`);
  }
  lines.push("", `다음 문서: ${result.next_document}`, "", result.local_package_ready
    ? "결론: 시험 테넌트에서만 관리자가 ZIP을 검증하세요. 아직 학생에게 배포하지 마세요."
    : "결론: 현재 폴더를 Copilot에 업로드하지 마세요.", "");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await inspectCopilotReadiness();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatHuman(result));
  }
  if (process.argv.includes("--strict") && !result.upload_ready) {
    process.exitCode = 2;
  }
}
