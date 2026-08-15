#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(root, "chatgpt", "custom-gpt", "knowledge");
const manifestPath = join(outputDirectory, "KNOWLEDGE_MANIFEST.json");
export const externalPdfContractPath = join(root, "chatgpt", "custom-gpt", "EXTERNAL_PDF_KNOWLEDGE.json");
export const externalPdfReceiptPath = join(root, ".reverse-local", "chatgpt-knowledge-external-pdfs.json");

export const knowledgeMappings = [
  {
    source: "chatgpt/custom-gpt/public-knowledge/PUBLIC_LESSON_PRINCIPLES.md",
    upload_name: "PUBLIC_LESSON_PRINCIPLES.md",
    purpose: "학생에게 공개 가능한 근거·가정·안전·입력 신뢰 원칙",
    classification: "public-reference",
    encoding: "UTF-8-SIG"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/source-record.schema.json",
    upload_name: "source-record.schema.json",
    purpose: "출처 원문·독립성·품질 기록 형식",
    classification: "public-schema",
    encoding: "UTF-8"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/evidence.schema.json",
    upload_name: "evidence.schema.json",
    purpose: "사실·추론·가정·미확인 근거 형식",
    classification: "public-schema",
    encoding: "UTF-8"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/research-plan.schema.json",
    upload_name: "research-plan.schema.json",
    purpose: "조사 계획과 근거 준비도 형식",
    classification: "public-schema",
    encoding: "UTF-8"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/student-lesson-turn.schema.json",
    upload_name: "student-lesson-turn.schema.json",
    purpose: "교사용 평가와 기억 수정 인터페이스를 제거한 학생 공개용 턴 예시 구조",
    classification: "public-schema",
    encoding: "UTF-8"
  },
  {
    source: "skills/teach-grounded-scenarios/examples/cross-domain-catalog.json",
    upload_name: "cross-domain-catalog.json",
    purpose: "여러 교과·학년 수업 모드 방향 검토",
    classification: "public-catalog",
    encoding: "UTF-8"
  }
];

export const retiredUploadNames = [
  "KNOWLEDGE_REFERENCE.md",
  "session.schema.json",
  "lesson-turn.schema.json",
  "memory-delta.schema.json"
];

export const excludedKnowledge = [
  {
    source: "chatgpt/custom-gpt/KNOWLEDGE_REFERENCE.md",
    reason: "학생에게 숨겨야 하는 내부 상태 계층과 비공개 요구가 포함된 내부 운영 문서"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/session.schema.json",
    reason: "시작 상태기계·Canon·교정·기억 보존 인터페이스를 노출해 위조 세션 오염 표면이 됨"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/memory-delta.schema.json",
    reason: "학생이 사용할 필요가 없는 내부 기억 수정 제안 인터페이스"
  },
  {
    source: "skills/teach-grounded-scenarios/schemas/lesson-turn.schema.json",
    reason: "teacher_view와 기억 수정 인터페이스가 포함되어 학생 공개용으로 부적합함"
  },
  {
    source: "skills/teach-grounded-scenarios/agents/openai.yaml",
    reason: "Custom GPT가 실행하는 Skill 선언이 아니며 내부 호출 토큰만 노출할 수 있음"
  },
  {
    source: "chatgpt/RUNTIME_PROFILE.json",
    reason: "실행 설정이 아니라 플랫폼 한계 기록이며 모델·권한 메타데이터가 학생에게 노출될 수 있음"
  },
  {
    source: "chatgpt/EXPORT_MANIFEST.json",
    reason: "로컬 배포물 무결성 봉인으로 수업 지식이 아님"
  },
  {
    source: "skills/teach-grounded-scenarios/assets/session.template.json",
    reason: "특정 초6 사회 프로필이 하드코딩된 새 세션 개발 템플릿"
  },
  {
    source: "skills/teacher-grounded-testbed",
    reason: "로컬 저장·실행·접근 분리가 필요한 교사용 전용 기능"
  },
  {
    source: "skills/teach-grounded-scenarios/examples",
    reason: "교사용 평가 메모·완성 답·특정 학년과 주제의 앵커가 포함될 수 있는 개발·회귀 예시"
  },
  {
    source: "skills/teach-grounded-scenarios/examples/**/lesson-turn.json",
    reason: "teacher_view와 평가 관찰점이 포함될 수 있는 교사용 회귀 출력"
  },
  {
    source: "skills/teach-grounded-scenarios/examples/**/session.json",
    reason: "수업 상태기계·Canon·완성 연구 결론을 미리 노출하는 회귀 세션"
  },
  {
    source: "chatgpt/CLASSROOM_SETTINGS.example.md",
    reason: "교사가 별도 접근 통제 아래 검토할 선택 설정이며 학생 공용 Knowledge가 아님"
  }
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function startsWithUtf8Sig(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

export function validateKnowledgeSource(mapping, bytes) {
  const hasSig = startsWithUtf8Sig(bytes);
  if (mapping.encoding === "UTF-8-SIG" && !hasSig) {
    throw new Error(`${mapping.source}: 사람이 읽는 CJK 문서는 UTF-8-SIG여야 합니다.`);
  }
  if (mapping.encoding === "UTF-8" && hasSig) {
    throw new Error(`${mapping.source}: 기계 판독 파일은 UTF-8 무BOM이어야 합니다.`);
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${mapping.source}: 올바른 UTF-8로 해석할 수 없습니다.`);
  }
  const body = text.replace(/^\uFEFF/u, "");
  if (/\uFEFF|[\u0080-\u009F\uFFFD]/u.test(body)) {
    throw new Error(`${mapping.source}: BOM 위치 오류나 제어·대체 문자가 있습니다.`);
  }
  if (mapping.upload_name.endsWith(".json")) {
    try {
      JSON.parse(body);
    } catch {
      throw new Error(`${mapping.source}: 엄격 JSON으로 파싱할 수 없습니다.`);
    }
  }
}

function parseStrictJson(path, bytes) {
  validateKnowledgeSource({ source: path, upload_name: basename(path), encoding: "UTF-8" }, bytes);
  return JSON.parse(bytes.toString("utf8"));
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label}: 허용되지 않은 필드가 있거나 필수 필드가 없습니다.`);
  }
}

export function validateExternalPdfContract(contract) {
  assertExactKeys(contract, [
    "upload_name",
    "size_bytes",
    "sha256",
    "school_level",
    "authority_role",
    "non_academic_fact_authority",
    "authority_limit_ko"
  ], `외부 PDF 계약 ${contract.upload_name ?? "이름 없음"}`);
  if (typeof contract.upload_name !== "string" || !contract.upload_name.endsWith(".pdf") || basename(contract.upload_name) !== contract.upload_name) {
    throw new Error("외부 PDF 계약의 파일명이 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(contract.size_bytes) || contract.size_bytes <= 0) {
    throw new Error(`${contract.upload_name}: PDF 크기 계약이 올바르지 않습니다.`);
  }
  if (!/^[0-9a-f]{64}$/u.test(contract.sha256)) {
    throw new Error(`${contract.upload_name}: PDF SHA-256 계약이 올바르지 않습니다.`);
  }
  if (!new Set(["ELEMENTARY", "MIDDLE", "HIGH"]).has(contract.school_level)) {
    throw new Error(`${contract.upload_name}: 지원하지 않는 학교급입니다.`);
  }
  if (contract.authority_role !== "CURRICULUM_AUTHORITY" || contract.non_academic_fact_authority !== false) {
    throw new Error(`${contract.upload_name}: 교육과정 권위와 비학술 사실권위 한계가 명시되지 않았습니다.`);
  }
  if (typeof contract.authority_limit_ko !== "string" || contract.authority_limit_ko.length < 20) {
    throw new Error(`${contract.upload_name}: 권위 한계 설명이 부족합니다.`);
  }
}

export function validateExternalPdfBytes(contract, receipt, bytes) {
  validateExternalPdfContract(contract);
  assertExactKeys(receipt, ["upload_name", "source_absolute_path"], `외부 PDF 영수증 ${receipt.upload_name ?? "이름 없음"}`);
  if (contract.upload_name !== receipt.upload_name) {
    throw new Error("외부 PDF 계약과 로컬 영수증의 파일명이 일치하지 않습니다.");
  }
  if (!isAbsolute(receipt.source_absolute_path) || basename(receipt.source_absolute_path) !== contract.upload_name) {
    throw new Error(`${contract.upload_name}: 로컬 영수증에는 같은 파일명의 절대경로가 필요합니다.`);
  }
  if (bytes.length !== contract.size_bytes) {
    throw new Error(`${contract.upload_name}: PDF 크기가 추적 계약과 일치하지 않습니다.`);
  }
  if (sha256(bytes) !== contract.sha256) {
    throw new Error(`${contract.upload_name}: PDF SHA-256이 추적 계약과 일치하지 않습니다.`);
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${contract.upload_name}: PDF 서명이 없습니다.`);
  }
}

function externalPdfManifestEntry(expected) {
  return {
    upload_name: expected.upload_name,
    sha256: expected.sha256,
    bytes: expected.size_bytes,
    content_type: "application/pdf",
    school_level: expected.school_level,
    authority_role: expected.authority_role,
    non_academic_fact_authority: expected.non_academic_fact_authority,
    authority_limit_ko: expected.authority_limit_ko,
    purpose: "학교급별 국가 교육과정 범위·성취기준 참조",
    classification: "external-curriculum-pdf",
    delivery: "EXTERNAL_UPLOAD",
    source_locator: "LOCAL_RECEIPT_ONLY",
    repository_copy: false,
    required_upload: true,
    reference_only: true,
    validator_executed: false
  };
}

export async function loadExternalPdfContractEntries() {
  const contract = parseStrictJson("chatgpt/custom-gpt/EXTERNAL_PDF_KNOWLEDGE.json", await readFile(externalPdfContractPath));
  assertExactKeys(contract, ["schema_version", "contract_id", "required_count", "files"], "외부 PDF 계약");
  if (contract.schema_version !== "1.0.0" || typeof contract.contract_id !== "string" || contract.contract_id.length < 8) {
    throw new Error("외부 PDF 계약의 버전 또는 계약 ID가 올바르지 않습니다.");
  }
  if (contract.required_count !== 3 || !Array.isArray(contract.files) || contract.files.length !== 3) {
    throw new Error("외부 교육과정 PDF는 정확히 3개여야 합니다.");
  }
  const contractNames = contract.files.map((entry) => entry.upload_name);
  if (new Set(contractNames).size !== 3) {
    throw new Error("외부 PDF 파일명이 중복되었습니다.");
  }
  const schoolLevels = contract.files.map((entry) => entry.school_level);
  if (schoolLevels.join(",") !== "ELEMENTARY,MIDDLE,HIGH") {
    throw new Error("외부 PDF 계약은 초등·중등·고등 순서로 정확히 한 개씩 필요합니다.");
  }
  for (const expected of contract.files) {
    validateExternalPdfContract(expected);
  }
  return {
    contract_id: contract.contract_id,
    entries: contract.files.map(externalPdfManifestEntry)
  };
}

export async function loadExternalPdfEntries() {
  const publicContract = await loadExternalPdfContractEntries();
  const receipt = parseStrictJson(".reverse-local/chatgpt-knowledge-external-pdfs.json", await readFile(externalPdfReceiptPath));
  assertExactKeys(receipt, ["schema_version", "contract_id", "files"], "외부 PDF 로컬 영수증");
  if (receipt.schema_version !== "1.0.0" || publicContract.contract_id !== receipt.contract_id) {
    throw new Error("외부 PDF 계약과 로컬 영수증의 버전 또는 계약 ID가 일치하지 않습니다.");
  }
  if (!Array.isArray(receipt.files) || receipt.files.length !== 3) {
    throw new Error("외부 교육과정 PDF 로컬 영수증은 정확히 3개여야 합니다.");
  }
  const receiptNames = receipt.files.map((entry) => entry.upload_name);
  if (new Set(receiptNames).size !== 3) {
    throw new Error("외부 PDF 로컬 영수증 파일명이 중복되었습니다.");
  }
  const receiptByName = new Map(receipt.files.map((entry) => [entry.upload_name, entry]));
  const entries = [];
  for (const expected of publicContract.entries) {
    const local = receiptByName.get(expected.upload_name);
    if (!local) {
      throw new Error(`${expected.upload_name}: 로컬 영수증 항목이 없습니다.`);
    }
    const bytes = await readFile(local.source_absolute_path);
    validateExternalPdfBytes({
      upload_name: expected.upload_name,
      size_bytes: expected.bytes,
      sha256: expected.sha256,
      school_level: expected.school_level,
      authority_role: expected.authority_role,
      non_academic_fact_authority: expected.non_academic_fact_authority,
      authority_limit_ko: expected.authority_limit_ko
    }, local, bytes);
    entries.push(expected);
  }
  return entries;
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

export async function expectedKnowledgeManifest({verifyExternalFiles = true} = {}) {
  const files = [];
  for (const mapping of knowledgeMappings) {
    const bytes = await readFile(join(root, mapping.source));
    validateKnowledgeSource(mapping, bytes);
    files.push({
      upload_name: mapping.upload_name,
      source_path: mapping.source,
      sha256: sha256(bytes),
      bytes: bytes.length,
      purpose: mapping.purpose,
      classification: mapping.classification,
      encoding: mapping.encoding,
      delivery: "PACKAGE_COPY",
      required_upload: true,
      public_disclosure_acceptable: true,
      student_input_trust: "UNTRUSTED_DATA",
      reference_only: true,
      validator_executed: false
    });
  }
  const externalEntries = verifyExternalFiles
    ? await loadExternalPdfEntries()
    : (await loadExternalPdfContractEntries()).entries;
  files.push(...externalEntries);
  const unsigned = {
    schema_version: "1.0.0",
    package_id: "reverse-chatgpt-knowledge",
    platform: "CUSTOM_GPT_KNOWLEDGE",
    audience: "STUDENT_PUBLIC_SAFE",
    schema_policy: "REFERENCE_ONLY_NO_VALIDATOR",
    student_input_policy: "UNTRUSTED_DATA_NO_AUTHORITY",
    file_count: files.length,
    packaged_file_count: knowledgeMappings.length,
    external_upload_count: files.length - knowledgeMappings.length,
    files,
    excluded: excludedKnowledge
  };
  return { ...unsigned, seal_sha256: sha256(canonicalJson(unsigned)) };
}

export async function buildKnowledgeBundle() {
  await mkdir(outputDirectory, { recursive: true });
  for (const name of retiredUploadNames) {
    if ((await readdir(outputDirectory)).includes(name)) {
      await unlink(join(outputDirectory, name));
    }
  }
  const allowed = new Set([...knowledgeMappings.map((entry) => entry.upload_name), "KNOWLEDGE_MANIFEST.json"]);
  const unexpected = (await readdir(outputDirectory)).filter((name) => !allowed.has(name));
  if (unexpected.length > 0) {
    throw new Error(`지식 디렉터리에 승인되지 않은 파일이 있습니다: ${unexpected.join(", ")}`);
  }
  for (const mapping of knowledgeMappings) {
    await copyFile(join(root, mapping.source), join(outputDirectory, mapping.upload_name));
  }
  const manifest = await expectedKnowledgeManifest();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function verifyKnowledgeBundle({verifyExternalFiles = true} = {}) {
  const expected = await expectedKnowledgeManifest({verifyExternalFiles});
  const actual = JSON.parse(await readFile(manifestPath, "utf8"));
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error("KNOWLEDGE_MANIFEST.json이 현재 원본과 일치하지 않습니다.");
  }
  const expectedNames = new Set([...knowledgeMappings.map((entry) => entry.upload_name), "KNOWLEDGE_MANIFEST.json"]);
  const actualNames = new Set(await readdir(outputDirectory));
  if (expectedNames.size !== actualNames.size || [...expectedNames].some((name) => !actualNames.has(name))) {
    throw new Error("지식 디렉터리 파일 목록이 승인된 업로드 목록과 일치하지 않습니다.");
  }
  for (const file of expected.files.filter((entry) => entry.delivery === "PACKAGE_COPY")) {
    const bytes = await readFile(join(outputDirectory, file.upload_name));
    if (sha256(bytes) !== file.sha256) {
      throw new Error(`${file.upload_name}이 원본과 일치하지 않습니다.`);
    }
  }
  return actual;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verifyOnly = process.argv.includes("--verify");
  const verifyPublicContract = process.argv.includes("--verify-public-contract");
  if (verifyOnly && verifyPublicContract) {
    throw new Error("--verify와 --verify-public-contract는 함께 사용할 수 없습니다.");
  }
  const operation = verifyPublicContract
    ? verifyKnowledgeBundle({verifyExternalFiles: false})
    : verifyOnly
      ? verifyKnowledgeBundle()
      : buildKnowledgeBundle();
  operation
    .then((manifest) => {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode: verifyPublicContract ? "verify-public-contract" : verifyOnly ? "verify" : "build",
        external_pdf_byte_verification: !verifyPublicContract,
        file_count: manifest.file_count,
        packaged_file_count: manifest.packaged_file_count,
        external_upload_count: manifest.external_upload_count,
        seal_sha256: manifest.seal_sha256
      }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
