#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function confinedPath(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath === "" || isAbsolute(relativePath)) {
    return null;
  }
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, relativePath);
  return candidate.startsWith(`${normalizedRoot}${sep}`) ? candidate : null;
}

function containsPrivateKey(value) {
  if (Array.isArray(value)) {
    return value.some(containsPrivateKey);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const blocked = new Set(["auth", "code_hash", "secret_hash", "token", "sessions", "previews", "observations"]);
  return Object.entries(value).some(([key, child]) => blocked.has(key) || containsPrivateKey(child));
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

function hasUtf8Sig(contents) {
  return contents.length >= 3 && contents[0] === 0xEF && contents[1] === 0xBB && contents[2] === 0xBF;
}

export async function verifyFork(root, options = {}) {
  root = resolve(root);
  const manifestPath = join(root, "FORK_MANIFEST.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { seal_sha256: expectedSeal, ...withoutSeal } = manifest;
  const actualSeal = sha256(canonicalJson(withoutSeal));
  const errors = [];
  if (actualSeal !== expectedSeal) {
    errors.push("manifest seal 불일치");
  }
  const readyBase = ["CLEAN_COMMIT", "CONTENT_ADDRESSED_PACKAGE"].includes(manifest.base?.source_state);
  if (manifest.distribution_ready !== readyBase) {
    errors.push("기반 상태와 distribution_ready 값이 일치하지 않음");
  }
  if (!Number.isInteger(manifest.base?.file_count) || manifest.base.file_count < 1 || !/^[a-f0-9]{64}$/u.test(manifest.base?.content_sha256 ?? "")) {
    errors.push("기반 입력 파일의 내용 주소 해시가 없음");
  }
  if (manifest.base?.source_state === "CLEAN_COMMIT" && !/^[a-f0-9]{40}$/u.test(manifest.base?.commit ?? "")) {
    errors.push("clean Git 기반의 정확한 커밋 SHA가 없음");
  }
  if (options.requireDistributionReady === true && manifest.distribution_ready !== true) {
    errors.push(`배포 준비되지 않은 기반 상태: ${manifest.base?.source_state ?? "UNKNOWN"}`);
  }
  const digestEntries = Object.entries(manifest.file_digests ?? {});
  if (digestEntries.length === 0) {
    errors.push("manifest 파일 digest 목록이 비어 있음");
  }
  for (const [relativePath, expectedDigest] of digestEntries) {
    const path = confinedPath(root, relativePath);
    if (!path) {
      errors.push(`허용되지 않은 manifest 경로: ${relativePath}`);
      continue;
    }
    try {
      const actualDigest = sha256(await readFile(path));
      if (actualDigest !== expectedDigest) {
        errors.push(`파일 digest 불일치: ${relativePath}`);
      }
    } catch {
      errors.push(`manifest 파일 누락 또는 읽기 실패: ${relativePath}`);
    }
  }
  const actualFiles = await listFiles(root);
  const expectedFiles = new Set([...Object.keys(manifest.file_digests ?? {}), "FORK_MANIFEST.json"]);
  for (const path of actualFiles) {
    const key = relative(root, path).replaceAll("\\", "/");
    if (!expectedFiles.has(key)) {
      errors.push(`manifest에 없는 추가 파일: ${key}`);
    }
    const name = key.split("/").at(-1);
    const extension = extname(name);
    const contents = await readFile(path);
    const humanText = [".md", ".ps1", ".txt"].includes(extension) || ["LICENSE", "NOTICE"].includes(name);
    const machineText = [".json", ".jsonl", ".ndjson", ".yaml", ".yml", ".mjs", ".js", ".py", ".toml", ".lock", ".spec"].includes(extension);
    if (humanText && !hasUtf8Sig(contents)) {
      errors.push(`사람이 편집하는 파일에 UTF-8-SIG 누락: ${key}`);
    }
    if (machineText && hasUtf8Sig(contents)) {
      errors.push(`기계 파일에 허용되지 않은 BOM 존재: ${key}`);
    }
  }
  const profileText = await readFile(join(root, "CLASS_PROFILE.json"), "utf8");
  const overlayText = await readFile(join(root, "CLASS_OVERLAY.json"), "utf8");
  const profile = JSON.parse(profileText);
  const overlay = JSON.parse(overlayText);
  if (!Array.isArray(overlay.items)) {
    errors.push("학생 오버레이 items 형식이 올바르지 않음");
  } else if (overlay.items.some((item) => ![
    "ACTIVE",
    "VERIFIED"
  ].includes(item.status) || !["RULE", "INSTRUCTION", "EXAMPLE", "FACT_CORRECTION"].includes(item.kind))) {
    errors.push("학생 포크에 비공개 또는 검증 대기 항목이 포함됨");
  } else {
    if (overlay.items.some((item) => item.kind === "FACT_CORRECTION" ? item.status !== "VERIFIED" : item.status !== "ACTIVE")) {
      errors.push("학생 포크 학습 항목의 종류와 상태가 일치하지 않음");
    }
    for (const item of overlay.items.filter((candidate) => candidate.kind === "FACT_CORRECTION")) {
      const verification = item.verification;
      const requirement = {
        LOW: { sources: 1, tierA: 0 },
        MEDIUM: { sources: 2, tierA: 0 },
        HIGH: { sources: 3, tierA: 2 }
      }[verification?.risk];
      const sources = Array.isArray(verification?.sources) ? verification.sources : [];
      const independentCount = new Set(sources.map((source) => source.independence_key)).size;
      const tierACount = sources.filter((source) => typeof source.authority_tier === "string" && source.authority_tier.startsWith("A_")).length;
      const sourcesValid = sources.every((source) =>
        source.opened === true
        && validHttpsUrl(source.url)
        && ["A_PRIMARY", "A_SYNTHESIS", "B_SCHOLARLY", "B_INSTITUTIONAL"].includes(source.authority_tier)
        && Array.isArray(source.quality_checks)
        && source.quality_checks.includes("ORIGINAL_OPENED")
        && source.quality_checks.includes("RESPONSIBLE_ENTITY_CONFIRMED")
      );
      if (!requirement || !sourcesValid || independentCount < requirement.sources || tierACount < requirement.tierA) {
        errors.push(`사실 정정 출처 품질 게이트 불일치: ${item.id}`);
      }
    }
    const includedItems = Array.isArray(manifest.included_items) ? manifest.included_items : [];
    const expectedItems = overlay.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      content_sha256: sha256(canonicalJson(item))
    }));
    if (canonicalJson(includedItems) !== canonicalJson(expectedItems)) {
      errors.push("manifest 적용 항목과 학급 오버레이가 일치하지 않음");
    }
  }
  if (containsPrivateKey(profile) || containsPrivateKey(overlay)) {
    errors.push("학생 포크 JSON에 교사 전용 인증·세션·관찰 필드가 포함됨");
  }
  if (sha256(canonicalJson(profile)) !== manifest.class_profile_sha256) {
    errors.push("학급 프로필 내용 해시 불일치");
  }
  const copiedProfileText = await readFile(join(root, "skills", "teach-grounded-scenarios", "references", "class-profile.json"), "utf8");
  const copiedOverlayText = await readFile(join(root, "skills", "teach-grounded-scenarios", "references", "class-overlay.json"), "utf8");
  if (copiedProfileText !== profileText || copiedOverlayText !== overlayText) {
    errors.push("루트 학급 설정과 Skill 참조 사본이 일치하지 않음");
  }
  for (const required of [
    "LICENSE",
    "NOTICE",
    "AGENTS.md",
    "README.md",
    "verify-class-fork.mjs",
    "CLASS_PROFILE.json",
    "CLASS_OVERLAY.json",
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/references/class-profile.json",
    "skills/teach-grounded-scenarios/references/class-overlay.json"
  ]) {
    if (!Object.hasOwn(manifest.file_digests, required)) {
      errors.push(`manifest 필수 파일 누락: ${required}`);
    }
  }
  const forkSkill = await readFile(join(root, "skills", "teach-grounded-scenarios", "SKILL.md"), "utf8");
  if (!forkSkill.includes("## 학급 포크 오버레이")) {
    errors.push("학생 Skill에 학급 포크 진입 규칙이 없음");
  }
  const studentAgents = await readFile(join(root, "AGENTS.md"), "utf8");
  if (!studentAgents.includes("Transparency and Truth") || !studentAgents.includes("재시작 옵션")) {
    errors.push("학생 포크에 진실성 또는 Canon 재시작 경계가 없음");
  }
  if (!studentAgents.includes("학교급부터") || !studentAgents.includes("신뢰하지 않는 인용 데이터")) {
    errors.push("학생 포크에 단계형 온보딩 또는 PDF 명령 불신 경계가 없음");
  }
  if (actualFiles.some((path) => relative(root, path).replaceAll("\\", "/").includes("teacher-grounded-testbed"))) {
    errors.push("학생 포크에 교사 테스트베드 파일이 포함됨");
  }
  const license = await readFile(join(root, "LICENSE"), "utf8");
  const notice = await readFile(join(root, "NOTICE"), "utf8");
  if (!license.includes("Apache License") || !license.includes("Version 2.0")) {
    errors.push("Apache License 2.0 본문이 없음");
  }
  if (!notice.includes("Singulari-Tea Codex") || !notice.includes("Class fork modification notice")) {
    errors.push("원 프로젝트 또는 학급 포크 NOTICE 고지가 없음");
  }
  return errors;
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
  verifyFork(root, { requireDistributionReady: true })
    .then((errors) => {
      if (errors.length > 0) {
        process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
        process.exitCode = 1;
      } else {
        process.stdout.write("학급 포크 검증 통과\n");
      }
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
