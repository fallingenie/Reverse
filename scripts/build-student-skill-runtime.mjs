#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectTextBytes } from "./check-text-integrity.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOutputPath = join(
  repositoryRoot,
  ".reverse-local",
  "copilot-skill",
  "teach-grounded-scenarios-student.zip"
);

export const studentSkillRuntimeMappings = [
  ["skills/teach-grounded-scenarios/student-runtime/SKILL.md", "SKILL.md"],
  ["skills/teach-grounded-scenarios/student-runtime/prompts/01-onboarding.prompt.md", "prompts/01-onboarding.prompt.md"],
  ["skills/teach-grounded-scenarios/student-runtime/prompts/02-research-plan.prompt.md", "prompts/02-research-plan.prompt.md"],
  ["skills/teach-grounded-scenarios/prompts/03-source-audit.prompt.md", "prompts/03-source-audit.prompt.md"],
  ["skills/teach-grounded-scenarios/student-runtime/prompts/04-scenario-cards.prompt.md", "prompts/04-scenario-cards.prompt.md"],
  ["skills/teach-grounded-scenarios/student-runtime/prompts/05-lesson-turn.prompt.md", "prompts/05-lesson-turn.prompt.md"],
  ["skills/teach-grounded-scenarios/student-runtime/prompts/07-debrief.prompt.md", "prompts/07-debrief.prompt.md"],
  ["skills/teach-grounded-scenarios/references/grade-bands.md", "references/grade-bands.md"],
  ["skills/teach-grounded-scenarios/references/evidence-policy.md", "references/evidence-policy.md"],
  ["skills/teach-grounded-scenarios/references/domain-policies.md", "references/domain-policies.md"],
  ["skills/teach-grounded-scenarios/references/source-quality.md", "references/source-quality.md"],
  ["skills/teach-grounded-scenarios/references/safety-policy.md", "references/safety-policy.md"],
  ["skills/teach-grounded-scenarios/references/research-workflow.md", "references/research-workflow.md"],
  ["skills/guide-brief-learner-dialogue/references/dialogue-state-contract.md", "references/dialogue-state-contract.md"],
  ["skills/guide-brief-learner-dialogue/references/learner-profile-policy.md", "references/learner-profile-policy.md"],
  ["skills/teach-grounded-scenarios/schemas/source-record.schema.json", "schemas/source-record.schema.json"],
  ["skills/teach-grounded-scenarios/schemas/evidence.schema.json", "schemas/evidence.schema.json"],
  ["skills/teach-grounded-scenarios/schemas/research-plan.schema.json", "schemas/research-plan.schema.json"],
  ["skills/teach-grounded-scenarios/schemas/student-lesson-turn.schema.json", "schemas/student-lesson-turn.schema.json"]
].map(([source, target]) => ({ source, target }));

export const excludedStudentRuntimeSources = [
  {
    source: "skills/teach-grounded-scenarios/schemas/lesson-turn.schema.json",
    reason: "개발 회귀검사와 접근 분리된 교사용 결합 fixture"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/session.schema.json",
    reason: "학생 응답에 필요하지 않은 전체 세션 상태와 교정 인터페이스"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/memory-delta.schema.json",
    reason: "학생 응답에 필요하지 않은 내부 기억 변경 인터페이스"
  },
  {
    source: "skills/teach-grounded-scenarios/references/teacher-mode.md",
    reason: "접근이 분리된 교사용 사본에서만 사용하는 자료"
  },
  {
    source: "skills/teach-grounded-scenarios/examples",
    reason: "비공개 평가 메모와 완성된 회귀 답안을 포함할 수 있는 개발 fixture"
  },
  {
    source: "skills/teach-grounded-scenarios/scripts",
    reason: "Copilot Studio에서 실행이 보장되지 않는 로컬 개발 도구"
  },
  {
    source: "skills/teacher-grounded-testbed",
    reason: "인증과 로컬 저장이 필요한 별도 교사용 흐름"
  }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function manifestPathFor(outputPath) {
  return outputPath.replace(/\.zip$/iu, ".manifest.json");
}

function completePathFor(outputPath) {
  return outputPath.replace(/\.zip$/iu, ".complete.json");
}

async function unlinkIfExists(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function replaceFile(tempPath, finalPath) {
  await unlinkIfExists(finalPath);
  await rename(tempPath, finalPath);
}

function assertSafeTarget(target) {
  if (target.startsWith("/") || target.includes("\\") || target.split("/").some((segment) => ["", ".", ".."].includes(segment))) {
    throw new Error(`학생 Skill 대상 경로가 안전하지 않습니다: ${target}`);
  }
}

function assertStudentRuntimeEntry(entry) {
  assertSafeTarget(entry.name);
  const text = entry.data.toString("utf8");
  const integrityErrors = inspectTextBytes(entry.data, entry.name);
  if (integrityErrors.length > 0) {
    throw new Error(integrityErrors.join("; "));
  }
  const forbidden = /teacher_view|assessment_note|misconception_watch|memory_delta|teacher-grounded-testbed/u;
  if (forbidden.test(text)) {
    throw new Error(`${entry.name}: 학생 런타임에서 제외해야 하는 내부 인터페이스가 있습니다.`);
  }
  if (entry.name.endsWith(".json")) {
    JSON.parse(text);
  }
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function zipStore(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.concat([
      uint32(0x04034B50), uint16(20), uint16(0x0800), uint16(0),
      uint16(0), uint16(0x0021), uint32(checksum), uint32(entry.data.length),
      uint32(entry.data.length), uint16(name.length), uint16(0), name, entry.data
    ]);
    const central = Buffer.concat([
      uint32(0x02014B50), uint16(20), uint16(20), uint16(0x0800), uint16(0),
      uint16(0), uint16(0x0021), uint32(checksum), uint32(entry.data.length),
      uint32(entry.data.length), uint16(name.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), name
    ]);
    localRecords.push(local);
    centralRecords.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.concat([
    uint32(0x06054B50), uint16(0), uint16(0), uint16(entries.length),
    uint16(entries.length), uint32(centralDirectory.length), uint32(offset), uint16(0)
  ]);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

export async function createStudentSkillRuntimePackage(root = repositoryRoot) {
  const targets = new Set();
  const entries = [];
  const files = [];
  for (const mapping of studentSkillRuntimeMappings) {
    if (targets.has(mapping.target)) {
      throw new Error(`학생 Skill 대상 경로가 중복됩니다: ${mapping.target}`);
    }
    targets.add(mapping.target);
    const data = await readFile(join(root, mapping.source));
    const entry = { name: mapping.target, data };
    assertStudentRuntimeEntry(entry);
    entries.push(entry);
    files.push({
      path: mapping.target,
      source_path: mapping.source,
      sha256: sha256(data),
      bytes: data.length,
      encoding: mapping.target.endsWith(".md") ? "UTF-8-SIG" : "UTF-8"
    });
  }

  const archive = zipStore(entries);
  const unsignedManifest = {
    schema_version: "1.0.0",
    package_id: "reverse-student-skill-runtime",
    audience: "STUDENT_PUBLIC_SAFE",
    generation_contract: "DIRECT_STUDENT_SCHEMA_ONLY",
    file_count: files.length,
    files,
    excluded: excludedStudentRuntimeSources,
    archive_sha256: sha256(archive),
    archive_bytes: archive.length
  };
  const manifest = {
    ...unsignedManifest,
    seal_sha256: sha256(canonicalJson(unsignedManifest))
  };
  return { archive, entries, manifest };
}

export async function verifyPublishedStudentSkillRuntime({ outputPath = defaultOutputPath } = {}) {
  const resolvedOutput = resolve(outputPath);
  const manifestPath = manifestPathFor(resolvedOutput);
  const completePath = completePathFor(resolvedOutput);
  const [archive, manifestBytes, completeBytes] = await Promise.all([
    readFile(resolvedOutput),
    readFile(manifestPath),
    readFile(completePath)
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const complete = JSON.parse(completeBytes.toString("utf8"));
  const { seal_sha256: manifestSeal, ...unsignedManifest } = manifest;

  if (complete.status !== "COMPLETE") {
    throw new Error("학생 Skill 배포 세트에 COMPLETE 표식이 없습니다.");
  }
  if (complete.archive_name !== basename(resolvedOutput) || complete.manifest_name !== basename(manifestPath)) {
    throw new Error("학생 Skill 완료 표식의 파일 이름이 현재 배포 세트와 일치하지 않습니다.");
  }
  if (manifestSeal !== sha256(canonicalJson(unsignedManifest))) {
    throw new Error("학생 Skill manifest seal 검증에 실패했습니다.");
  }
  if (manifest.archive_sha256 !== sha256(archive) || manifest.archive_bytes !== archive.length) {
    throw new Error("학생 Skill archive와 manifest가 일치하지 않습니다.");
  }
  if (complete.archive_sha256 !== manifest.archive_sha256) {
    throw new Error("학생 Skill 완료 표식의 archive hash가 일치하지 않습니다.");
  }
  if (complete.manifest_sha256 !== sha256(manifestBytes) || complete.manifest_seal_sha256 !== manifestSeal) {
    throw new Error("학생 Skill 완료 표식의 manifest hash 또는 seal이 일치하지 않습니다.");
  }
  return { archive, manifest, complete };
}

export async function buildStudentSkillRuntime({ outputPath = defaultOutputPath, root = repositoryRoot } = {}) {
  const resolvedOutput = resolve(outputPath);
  if (!resolvedOutput.toLowerCase().endsWith(".zip")) {
    throw new Error("학생 Skill 출력 경로는 .zip 확장자여야 합니다.");
  }
  const { archive, manifest } = await createStudentSkillRuntimePackage(root);
  const outputDirectory = dirname(resolvedOutput);
  const manifestPath = manifestPathFor(resolvedOutput);
  const completePath = completePathFor(resolvedOutput);
  const suffix = `${process.pid}-${randomUUID()}`;
  const archiveTempPath = join(outputDirectory, `.${basename(resolvedOutput)}.${suffix}.tmp`);
  const manifestTempPath = join(outputDirectory, `.${basename(manifestPath)}.${suffix}.tmp`);
  const completeTempPath = join(outputDirectory, `.${basename(completePath)}.${suffix}.tmp`);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const complete = {
    schema_version: "1.0.0",
    package_id: manifest.package_id,
    status: "COMPLETE",
    archive_name: basename(resolvedOutput),
    manifest_name: basename(manifestPath),
    archive_sha256: manifest.archive_sha256,
    manifest_sha256: sha256(manifestBytes),
    manifest_seal_sha256: manifest.seal_sha256
  };
  const completeBytes = Buffer.from(`${JSON.stringify(complete, null, 2)}\n`, "utf8");

  await mkdir(outputDirectory, { recursive: true });
  try {
    await Promise.all([
      writeFile(archiveTempPath, archive),
      writeFile(manifestTempPath, manifestBytes),
      writeFile(completeTempPath, completeBytes)
    ]);
    const [writtenArchive, writtenManifest, writtenComplete] = await Promise.all([
      readFile(archiveTempPath),
      readFile(manifestTempPath),
      readFile(completeTempPath)
    ]);
    if (sha256(writtenArchive) !== manifest.archive_sha256 || !writtenManifest.equals(manifestBytes) || !writtenComplete.equals(completeBytes)) {
      throw new Error("학생 Skill 임시 배포 세트의 재검증에 실패했습니다.");
    }

    // 완료 표식을 먼저 없애야 중간 실패 상태를 배포 완료로 오인하지 않는다.
    await unlinkIfExists(completePath);
    await replaceFile(archiveTempPath, resolvedOutput);
    await replaceFile(manifestTempPath, manifestPath);
    await replaceFile(completeTempPath, completePath);
    await verifyPublishedStudentSkillRuntime({ outputPath: resolvedOutput });
  } catch (error) {
    await unlinkIfExists(completePath);
    throw error;
  } finally {
    await Promise.all([
      unlinkIfExists(archiveTempPath),
      unlinkIfExists(manifestTempPath),
      unlinkIfExists(completeTempPath)
    ]);
  }
  return {
    output_path: relative(root, resolvedOutput).replaceAll("\\", "/"),
    manifest_path: relative(root, manifestPath).replaceAll("\\", "/"),
    complete_path: relative(root, completePath).replaceAll("\\", "/"),
    file_count: manifest.file_count,
    archive_sha256: manifest.archive_sha256,
    seal_sha256: manifest.seal_sha256
  };
}

function outputArgument(argv) {
  const prefix = "--output=";
  const value = argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return value ? resolve(value) : defaultOutputPath;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  buildStudentSkillRuntime({ outputPath: outputArgument(process.argv.slice(2)) })
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
