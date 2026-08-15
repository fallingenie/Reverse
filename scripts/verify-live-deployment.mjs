#!/usr/bin/env node

import { readFile, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  canonicalJson,
  canonicalText,
  expectedManifestPaths,
  inspectZip,
  readJsonAllowBom,
  sha256
} from "./build-deployment-expectations.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultReceiptDirectory = join(root, ".reverse-local", "deployment-receipts");
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sensitiveKeyPattern = /^(?:agent_id|environment_id|gpt_id|target_url|live_url|token|secret|credential)$/iu;
const sensitiveValuePatterns = [
  /https?:\/\/(?:chatgpt\.com\/g\/|copilotstudio\.microsoft\.com\/environments\/)/iu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu
];
let schemaValidatorsPromise;

async function schemaValidators() {
  schemaValidatorsPromise ??= Promise.all([
    readJsonAllowBom(join(root, "contracts", "deployment-expected.schema.json")),
    readJsonAllowBom(join(root, "contracts", "deployment-receipt.schema.json"))
  ]).then(([expectedSchema, receiptSchema]) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return {
      expected: ajv.compile(expectedSchema),
      receipt: ajv.compile(receiptSchema)
    };
  });
  return schemaValidatorsPromise;
}

function schemaErrorMessage(validate) {
  return (validate.errors ?? []).map((error) => `${error.instancePath || "$"} ${error.message}`).join("; ");
}

function parseArguments(argv) {
  const options = { platform: "all", receiptDirectory: defaultReceiptDirectory, initNotRun: false, force: false };
  for (const argument of argv) {
    if (argument.startsWith("--platform=")) options.platform = argument.slice("--platform=".length);
    else if (argument.startsWith("--receipt-dir=")) options.receiptDirectory = resolve(argument.slice("--receipt-dir=".length));
    else if (argument === "--init-not-run") options.initNotRun = true;
    else if (argument === "--force") options.force = true;
    else throw new Error(`알 수 없는 옵션: ${argument}`);
  }
  if (!["all", "chatgpt", "copilot"].includes(options.platform)) {
    throw new Error("--platform은 all, chatgpt, copilot 중 하나여야 합니다.");
  }
  return options;
}

function platformsFor(value) {
  if (value === "chatgpt") return ["CUSTOM_GPT"];
  if (value === "copilot") return ["COPILOT_STUDIO"];
  return ["CUSTOM_GPT", "COPILOT_STUDIO"];
}

function receiptName(platform) {
  return platform === "CUSTOM_GPT" ? "chatgpt.json" : "copilot-studio.json";
}

export function assertNoSensitivePublicData(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitivePublicData(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (sensitiveKeyPattern.test(key)) {
        throw new Error(`${path}.${key}: 공개 manifest에 민감 식별자 키를 넣을 수 없습니다.`);
      }
      assertNoSensitivePublicData(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && sensitiveValuePatterns.some((pattern) => pattern.test(value))) {
    throw new Error(`${path}: 공개 manifest에 라이브 URL 또는 원시 식별자를 넣을 수 없습니다.`);
  }
}

function verifyManifestSeal(manifest) {
  const { seal_sha256: actualSeal, ...unsigned } = manifest;
  const expectedSeal = sha256(canonicalJson(unsigned));
  if (actualSeal !== expectedSeal) {
    throw new Error(`${manifest.platform}: expected manifest seal이 일치하지 않습니다.`);
  }
}

async function currentCanonicalInstructionHash(sourcePath) {
  const text = await readFile(join(root, sourcePath), "utf8");
  return sha256(Buffer.from(canonicalText(text), "utf8"));
}

async function verifyCurriculumArtifacts(curriculumSources, { maxFragmentBytes = null } = {}) {
  const issues = [];
  const locator = await readJsonAllowBom(join(root, ".reverse-local", "chatgpt-knowledge-external-pdfs.json"));
  const originalPaths = new Map(locator.files?.map((file) => [file.upload_name, file.source_absolute_path]) ?? []);
  for (const source of curriculumSources ?? []) {
    const originalPath = originalPaths.get(source.original_filename);
    let originalBytes;
    try {
      originalBytes = await readFile(originalPath);
    } catch (error) {
      issues.push(`${source.original_filename}: 로컬 원본 PDF를 읽지 못했습니다: ${error.message}`);
      continue;
    }
    if (originalBytes.length !== source.original_bytes || sha256(originalBytes) !== source.original_sha256) {
      issues.push(`${source.original_filename}: 로컬 원본 PDF size/hash가 expected manifest와 다릅니다.`);
    }
    let expectedStart = 1;
    let totalPages = 0;
    for (const fragment of source.live_fragments ?? []) {
      const fragmentPath = fragment.live_filename === source.original_filename
        ? originalPath
        : join(root, ".reverse-local", "curriculum-knowledge", fragment.live_filename);
      try {
        const fragmentBytes = await readFile(fragmentPath);
        if (fragmentBytes.length !== fragment.bytes || sha256(fragmentBytes) !== fragment.sha256) {
          issues.push(`${fragment.live_filename}: 라이브 분할본 size/hash가 expected manifest와 다릅니다.`);
        }
      } catch (error) {
        issues.push(`${fragment.live_filename}: 라이브 분할본을 읽지 못했습니다: ${error.message}`);
      }
      if (maxFragmentBytes !== null && fragment.bytes > maxFragmentBytes) {
        issues.push(`${fragment.live_filename}: ${maxFragmentBytes}바이트 라이브 파일 제한을 초과합니다.`);
      }
      if (fragment.mapped_original_sha256 !== source.original_sha256
        || fragment.page_range?.start !== expectedStart
        || fragment.page_count !== fragment.page_range?.end - fragment.page_range?.start + 1) {
        issues.push(`${fragment.live_filename}: 원본 SHA 또는 페이지 범위 매핑이 잘못됐습니다.`);
      }
      expectedStart = (fragment.page_range?.end ?? expectedStart - 1) + 1;
      totalPages += fragment.page_count ?? 0;
    }
    if (expectedStart !== source.original_page_count + 1 || totalPages !== source.original_page_count) {
      issues.push(`${source.original_filename}: 분할본이 원본 전체 페이지를 연속 보존하지 않습니다.`);
    }
  }
  return issues;
}

async function verifyExpectedAgainstWorkspace(manifest) {
  const issues = [];
  const currentInstructionHash = await currentCanonicalInstructionHash(manifest.configuration.instructions.source_path);
  if (currentInstructionHash !== manifest.configuration.instructions.canonical_text_sha256) {
    issues.push("지침 canonical hash가 현재 파일과 다릅니다. expected manifest를 다시 생성해야 합니다.");
  }

  if (manifest.platform === "CUSTOM_GPT") {
    const knowledge = await readJsonAllowBom(join(root, manifest.configuration.knowledge.manifest_path));
    if (knowledge.seal_sha256 !== manifest.configuration.knowledge.package_seal_sha256) {
      issues.push("Knowledge package seal이 expected manifest와 다릅니다.");
    }
    if (knowledge.file_count !== 9
      || knowledge.packaged_file_count !== 6
      || knowledge.external_upload_count !== 3
      || manifest.configuration.knowledge.file_count !== 9) {
      issues.push("ChatGPT Knowledge가 생성 6개와 외부 교육과정 PDF 3개, 총 9개가 아닙니다.");
    }
    issues.push(...await verifyCurriculumArtifacts(
      manifest.configuration.knowledge.files
        .filter((file) => file.delivery === "EXTERNAL_UPLOAD")
        .map((file) => ({
          school_level: file.school_level,
          original_filename: file.original_filename,
          original_bytes: file.bytes,
          original_sha256: file.sha256,
          original_page_count: file.page_count,
          live_fragments: [{
            live_filename: file.original_filename,
            bytes: file.bytes,
            sha256: file.sha256,
            page_count: file.page_count,
            page_range: { start: 1, end: file.page_count },
            mapped_original_sha256: file.sha256
          }]
        }))
    ));
  } else {
    const archivePath = join(root, ".reverse-local", "copilot-skill", manifest.configuration.skill_zip.archive_name);
    try {
      const bytes = await readFile(archivePath);
      const inspection = inspectZip(bytes);
      if (sha256(bytes) !== manifest.configuration.skill_zip.sha256) {
        issues.push("로컬 Skill ZIP hash가 expected manifest와 다릅니다.");
      }
      if (inspection.file_count !== manifest.configuration.skill_zip.file_count) {
        issues.push("로컬 Skill ZIP 파일 수가 expected manifest와 다릅니다.");
      }
    } catch (error) {
      issues.push(`검증할 로컬 Skill ZIP을 읽지 못했습니다: ${error.message}`);
    }
    const knowledge = manifest.configuration.resources.knowledge;
    const actualLiveFileCount = knowledge.curriculum_sources
      .reduce((total, source) => total + source.live_fragments.length, 0);
    if (knowledge.original_source_count !== knowledge.curriculum_sources.length
      || knowledge.live_file_count !== actualLiveFileCount) {
      issues.push("Copilot Knowledge 원본 3개·라이브 파일 4개 수량 계약이 맞지 않습니다.");
    }
    issues.push(...await verifyCurriculumArtifacts(
      knowledge.curriculum_sources,
      { maxFragmentBytes: knowledge.max_live_file_bytes }
    ));
  }
  return issues;
}

function emptyCheck() {
  return { status: "NOT_RUN", observed_at: null, evidence: [] };
}

export function createNotRunReceipt(manifest) {
  const checks = Object.fromEntries(manifest.live_contract.required_checks.map((name) => [name, emptyCheck()]));
  const observedConfiguration = manifest.platform === "CUSTOM_GPT"
    ? {
        instructions_canonical_sha256: null,
        knowledge_package_seal_sha256: null,
        knowledge_files: [],
        capability_toggles: null,
        privacy: null
      }
    : {
        environment_display_name: null,
        instructions_canonical_sha256: null,
        model_display_name: null,
        skill_zip_sha256: null,
        skill_file_count: null,
        resources: null
      };
  return {
    schema_version: "1.0.0",
    manifest_type: "LIVE_DEPLOYMENT_RECEIPT",
    platform: manifest.platform,
    expected_manifest_seal_sha256: manifest.seal_sha256,
    target_fingerprint_sha256: null,
    observed_configuration: observedConfiguration,
    checks,
    completion: {
      complete: false,
      status: "BLOCKED",
      evaluated_at: null,
      reason: "브라우저 증거와 라이브 canary가 아직 없습니다."
    }
  };
}

function equal(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

async function resolveEvidenceArtifact(evidenceRoot, localArtifactPath) {
  if (typeof localArtifactPath !== "string" || isAbsolute(localArtifactPath)) return null;
  const portablePath = localArtifactPath.replaceAll("\\", "/");
  if (!portablePath.startsWith(".reverse-local/deployment-evidence/")) return null;
  const evidenceDirectory = resolve(evidenceRoot, ".reverse-local", "deployment-evidence");
  const candidate = resolve(evidenceRoot, ...portablePath.split("/"));
  const relation = relative(evidenceDirectory, candidate);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) return null;
  const [realRoot, realEvidenceDirectory, realCandidate] = await Promise.all([
    realpath(evidenceRoot),
    realpath(evidenceDirectory),
    realpath(candidate)
  ]);
  const evidenceDirectoryRelation = relative(realRoot, realEvidenceDirectory);
  if (evidenceDirectoryRelation === ""
    || evidenceDirectoryRelation === ".."
    || evidenceDirectoryRelation.startsWith(`..${sep}`)
    || isAbsolute(evidenceDirectoryRelation)) return null;
  const realRelation = relative(realEvidenceDirectory, realCandidate);
  if (realRelation === "" || realRelation === ".." || realRelation.startsWith(`..${sep}`) || isAbsolute(realRelation)) return null;
  if (!(await stat(realCandidate)).isFile()) return null;
  return realCandidate;
}

async function validateEvidence(checkName, check, issues, evidenceRoot) {
  if (check.status !== "PASS") {
    issues.push(`${checkName}: ${check.status ?? "MISSING"} 상태라 완료할 수 없습니다.`);
    return;
  }
  if (!check.observed_at || Number.isNaN(Date.parse(check.observed_at))) {
    issues.push(`${checkName}: 유효한 observed_at이 없습니다.`);
  }
  if (!Array.isArray(check.evidence) || check.evidence.length === 0) {
    issues.push(`${checkName}: 브라우저 증거가 없습니다.`);
    return;
  }
  for (const [index, evidence] of check.evidence.entries()) {
    if (!evidence || !["BROWSER_SCREENSHOT", "BROWSER_DOM", "LIVE_TRANSCRIPT", "PLATFORM_CONFIRMATION"].includes(evidence.kind)) {
      issues.push(`${checkName}.evidence[${index}]: 지원하지 않는 증거 종류입니다.`);
    }
    if (!sha256Pattern.test(evidence?.sha256 ?? "")) {
      issues.push(`${checkName}.evidence[${index}]: SHA-256이 없습니다.`);
    }
    if (!evidence?.captured_at || Number.isNaN(Date.parse(evidence.captured_at))) {
      issues.push(`${checkName}.evidence[${index}]: 유효한 captured_at이 없습니다.`);
    }
    let artifactPath;
    try {
      artifactPath = await resolveEvidenceArtifact(evidenceRoot, evidence?.local_artifact_path);
    } catch {
      artifactPath = null;
    }
    if (!artifactPath) {
      issues.push(`${checkName}.evidence[${index}]: .reverse-local/deployment-evidence 안의 실제 증거 파일이 필요합니다.`);
    } else {
      const artifactBytes = await readFile(artifactPath);
      if (sha256(artifactBytes) !== evidence.sha256) {
        issues.push(`${checkName}.evidence[${index}]: 실제 증거 파일 SHA-256이 receipt와 다릅니다.`);
      }
    }
  }
  const browserEvidenceKinds = new Set(["BROWSER_SCREENSHOT", "BROWSER_DOM", "LIVE_TRANSCRIPT"]);
  if (!check.evidence.some((evidence) => browserEvidenceKinds.has(evidence.kind))) {
    issues.push(`${checkName}: 실제 브라우저에서 얻은 증거가 필요합니다.`);
  }
  if (checkName === "live_canary" && !check.evidence.some((evidence) => evidence.kind === "LIVE_TRANSCRIPT")) {
    issues.push("live_canary: LIVE_TRANSCRIPT 증거가 필요합니다.");
  }
}

function validateReceiptConfiguration(manifest, receipt, issues) {
  const observed = receipt.observed_configuration ?? {};
  if (observed.instructions_canonical_sha256 !== manifest.configuration.instructions.canonical_text_sha256) {
    issues.push("라이브 지침 hash가 expected manifest와 다릅니다.");
  }
  if (manifest.platform === "CUSTOM_GPT") {
    if (observed.knowledge_package_seal_sha256 !== manifest.configuration.knowledge.package_seal_sha256) {
      issues.push("라이브 Knowledge seal이 expected manifest와 다릅니다.");
    }
    if (!equal(observed.knowledge_files, manifest.configuration.knowledge.files)) {
      issues.push("라이브 Knowledge 9개 파일명·hash·크기·교육과정 메타데이터가 expected manifest와 다릅니다.");
    }
    if (!equal(observed.capability_toggles, manifest.configuration.capability_toggles)) {
      issues.push("라이브 capability toggles가 expected manifest와 다릅니다.");
    }
    if (!equal(observed.privacy, manifest.configuration.privacy)) {
      issues.push("라이브 privacy 상태가 expected manifest와 다릅니다.");
    }
  } else {
    const environmentContract = manifest.configuration.environment;
    if (environmentContract.scope === "ANY_MICROSOFT_365_WORK_OR_EDUCATION_TENANT") {
      if (typeof observed.environment_display_name !== "string" || observed.environment_display_name.trim() === "") {
        issues.push("Copilot 설치 대상 환경의 표시 이름을 라이브 receipt에 기록해야 합니다.");
      }
    } else if (observed.environment_display_name !== environmentContract.display_name) {
      issues.push("Copilot environment display name이 expected manifest와 다릅니다.");
    }
    if (observed.model_display_name !== manifest.configuration.model.display_name) {
      issues.push("Copilot Model이 'GPT-5.6 Reasoning'과 다릅니다. 모델 표시는 권한·성능 증거로 사용하지 않습니다.");
    }
    if (observed.skill_zip_sha256 !== manifest.configuration.skill_zip.sha256) {
      issues.push("라이브 Skill ZIP hash가 expected manifest와 다릅니다.");
    }
    if (observed.skill_file_count !== manifest.configuration.skill_zip.file_count) {
      issues.push("라이브 Skill 파일 수가 expected manifest와 다릅니다.");
    }
    if (!equal(observed.resources, manifest.configuration.resources)) {
      issues.push("Tools/Knowledge/Connected Agents/Memory 상태가 expected manifest와 다릅니다.");
    }
  }
}

export async function validateLiveReceipt(manifest, receipt, { evidenceRoot = root } = {}) {
  const issues = [];
  if (receipt.manifest_type !== "LIVE_DEPLOYMENT_RECEIPT" || receipt.platform !== manifest.platform) {
    issues.push("receipt 유형 또는 platform이 expected manifest와 다릅니다.");
  }
  if (receipt.expected_manifest_seal_sha256 !== manifest.seal_sha256) {
    issues.push("receipt가 현재 expected manifest seal을 참조하지 않습니다.");
  }
  if (!sha256Pattern.test(receipt.target_fingerprint_sha256 ?? "")) {
    issues.push("원시 ID 대신 target_fingerprint_sha256을 기록해야 합니다.");
  }
  try {
    assertNoSensitivePublicData(receipt);
  } catch (error) {
    issues.push(error.message);
  }
  validateReceiptConfiguration(manifest, receipt, issues);
  const expectedChecks = new Set(manifest.live_contract.required_checks);
  const actualChecks = Object.keys(receipt.checks ?? {});
  if (actualChecks.length !== expectedChecks.size || actualChecks.some((name) => !expectedChecks.has(name))) {
    issues.push("receipt의 check 목록이 expected manifest의 필수 목록과 정확히 일치하지 않습니다.");
  }
  for (const checkName of manifest.live_contract.required_checks) {
    await validateEvidence(checkName, receipt.checks?.[checkName] ?? {}, issues, evidenceRoot);
  }
  const shouldBeComplete = issues.length === 0;
  if (receipt.completion?.complete !== shouldBeComplete || receipt.completion?.status !== (shouldBeComplete ? "COMPLETE" : "BLOCKED")) {
    issues.push("completion 상태가 검증 결과와 일치하지 않습니다.");
  }
  if (shouldBeComplete && (!receipt.completion.evaluated_at || Number.isNaN(Date.parse(receipt.completion.evaluated_at)))) {
    issues.push("완료 receipt에 유효한 evaluated_at이 없습니다.");
  }
  return { ok: issues.length === 0, issues };
}

async function loadExpected(platform) {
  const manifest = await readJsonAllowBom(expectedManifestPaths[platform]);
  const validators = await schemaValidators();
  if (!validators.expected(manifest)) {
    throw new Error(`${platform}: expected manifest schema 실패: ${schemaErrorMessage(validators.expected)}`);
  }
  assertNoSensitivePublicData(manifest);
  verifyManifestSeal(manifest);
  return manifest;
}

async function initializeReceipts(platforms, receiptDirectory, force) {
  await mkdir(receiptDirectory, { recursive: true });
  const initialized = [];
  for (const platform of platforms) {
    const manifest = await loadExpected(platform);
    const path = join(receiptDirectory, receiptName(platform));
    if (!force) {
      try {
        await readFile(path);
        initialized.push({ platform, path, status: "PRESERVED" });
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await writeFile(path, `${JSON.stringify(createNotRunReceipt(manifest), null, 2)}\n`, "utf8");
    initialized.push({ platform, path, status: "NOT_RUN_CREATED" });
  }
  return initialized;
}

export async function verifyLiveDeployments({ platforms, receiptDirectory, verifyWorkspaceArtifacts = true }) {
  const results = [];
  for (const platform of platforms) {
    const manifest = await loadExpected(platform);
    const workspaceIssues = verifyWorkspaceArtifacts
      ? await verifyExpectedAgainstWorkspace(manifest)
      : [];
    const receiptPath = join(receiptDirectory, receiptName(platform));
    let receiptResult;
    try {
      const receipt = await readJsonAllowBom(receiptPath);
      const validators = await schemaValidators();
      if (!validators.receipt(receipt)) {
        receiptResult = { ok: false, issues: [`라이브 receipt schema 실패: ${schemaErrorMessage(validators.receipt)}`] };
      } else {
        receiptResult = await validateLiveReceipt(manifest, receipt);
      }
    } catch (error) {
      receiptResult = { ok: false, issues: [`라이브 receipt를 읽지 못했습니다: ${error.message}`] };
    }
    const issues = [...workspaceIssues, ...receiptResult.issues];
    results.push({ platform, ok: issues.length === 0, receipt_path: receiptPath, issues });
  }
  return { ok: results.every((result) => result.ok), results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const platforms = platformsFor(options.platform);
  const operation = options.initNotRun
    ? initializeReceipts(platforms, options.receiptDirectory, options.force).then((initialized) => ({ ok: true, initialized }))
    : verifyLiveDeployments({ platforms, receiptDirectory: options.receiptDirectory });
  operation
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.ok) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
