#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const chatgptExpectedPath = join(root, "chatgpt", "custom-gpt", "DEPLOYMENT_EXPECTED.json");
const copilotExpectedPath = join(root, "copilot", "studio", "DEPLOYMENT_EXPECTED.json");
const localExternalPdfLocatorPath = join(root, ".reverse-local", "chatgpt-knowledge-external-pdfs.json");
const localCurriculumDirectory = join(root, ".reverse-local", "curriculum-knowledge");
const curriculumAuthorityLimit = "교육과정의 범위·성취기준·용어를 정하는 자료이며 역사·과학·통계·법령의 개별 사실을 자동으로 확정하지 않는다.";
const curriculumPageCounts = new Map([
  ["fe053096df68d788d3e81b1098a526d21ad9d2825a0d715d448ba12f5b32ebcd", 521],
  ["03c6e28b18ee526b00a95a642fc24f3f80f23d268685ff2795572ac3420d5c3a", 677],
  ["456f3181d45a92b33d83b86f144f41ce1c832918671162ec4e82b4d91ddcd6d0", 2215]
]);
const highSchoolFragments = [
  {
    live_filename: "[별책4] 고등학교 교육과정_1-1108쪽.pdf",
    bytes: 11_313_085,
    sha256: "3e4def0e7c528685cf9f4d5214177559bf934175b53a7dc89625cb320607367f",
    page_count: 1108,
    page_range: { start: 1, end: 1108 }
  },
  {
    live_filename: "[별책4] 고등학교 교육과정_1109-2215쪽.pdf",
    bytes: 12_415_445,
    sha256: "534205af5091e144b4d8e5475b72f9ddbbf1b2f6d320370b3b016218e715e7be",
    page_count: 1107,
    page_range: { start: 1109, end: 2215 }
  }
];

export const expectedManifestPaths = {
  CUSTOM_GPT: chatgptExpectedPath,
  COPILOT_STUDIO: copilotExpectedPath
};

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stripUtf8Bom(text) {
  return text.replace(/^\uFEFF/u, "");
}

export function canonicalText(text) {
  return stripUtf8Bom(text).replace(/\r\n?/gu, "\n");
}

export async function readJsonAllowBom(path) {
  return JSON.parse(stripUtf8Bom(await readFile(path, "utf8")));
}

function assertCjkInstructionIntegrity(text, path, markers = ["초등학교", "근거", "확인 필요"]) {
  if (text.includes("\uFFFD") || text.includes("\u0000")) {
    throw new Error(`${path}: 손상된 Unicode 문자가 있습니다.`);
  }
  for (const marker of markers) {
    if (!text.includes(marker)) {
      throw new Error(`${path}: CJK 무결성 표식 '${marker}'가 없습니다.`);
    }
  }
}

async function textArtifact(path, markers) {
  const bytes = await readFile(path);
  const text = bytes.toString("utf8");
  assertCjkInstructionIntegrity(text, path, markers);
  const utf8Sig = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  if (!utf8Sig) {
    throw new Error(`${path}: 사람이 편집하는 CJK 지침은 UTF-8-SIG여야 합니다.`);
  }
  const canonical = canonicalText(text);
  return {
    source_path: relative(root, path).replaceAll("\\", "/"),
    source_sha256: sha256(bytes),
    canonical_text_sha256: sha256(Buffer.from(canonical, "utf8")),
    source_bytes: bytes.length,
    utf8_sig: utf8Sig
  };
}

function sealManifest(unsigned) {
  return { ...unsigned, seal_sha256: sha256(canonicalJson(unsigned)) };
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054B50) {
      return offset;
    }
  }
  throw new Error("Skill ZIP의 중앙 디렉터리 끝 레코드를 찾지 못했습니다.");
}

export function inspectZip(bytes) {
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014B50) {
      throw new Error(`Skill ZIP 중앙 디렉터리 ${index}번 항목이 손상됐습니다.`);
    }
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const files = entries.filter((name) => !/[\\/]$/u.test(name));
  return { entry_count: entries.length, file_count: files.length, files };
}

function parseSkillZipArgument(argv) {
  const prefix = "--copilot-skill-zip=";
  const value = argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
    ?? process.env.REVERSE_COPILOT_SKILL_ZIP;
  return value ? resolve(value) : null;
}

async function newestLocalSkillZip() {
  const directory = join(root, ".reverse-local", "copilot-skill");
  const names = (await readdir(directory)).filter((name) => /^teach-grounded-scenarios.*\.zip$/u.test(name)).sort();
  if (names.length === 0) {
    throw new Error("Copilot Skill ZIP이 없습니다. --copilot-skill-zip=<절대경로>를 지정하세요.");
  }
  return join(directory, names.at(-1));
}

async function verifyExternalCurriculumPdfs(externalFiles) {
  const locator = await readJsonAllowBom(localExternalPdfLocatorPath);
  const paths = new Map(locator.files?.map((file) => [file.upload_name, file.source_absolute_path]) ?? []);
  const verified = [];
  for (const file of externalFiles) {
    const sourcePath = paths.get(file.upload_name);
    if (!sourcePath) {
      throw new Error(`${file.upload_name}: 로컬 PDF 위치 영수증에 원본 위치가 없습니다.`);
    }
    const bytes = await readFile(sourcePath);
    const pageCount = curriculumPageCounts.get(file.sha256);
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes || !pageCount) {
      throw new Error(`${file.upload_name}: 원본 PDF의 size/hash/page-count 계약이 일치하지 않습니다.`);
    }
    if (file.authority_role !== "CURRICULUM_AUTHORITY"
      || file.non_academic_fact_authority !== false
      || file.authority_limit_ko !== curriculumAuthorityLimit
      || file.delivery !== "EXTERNAL_UPLOAD"
      || file.source_locator !== "LOCAL_RECEIPT_ONLY"
      || file.repository_copy !== false) {
      throw new Error(`${file.upload_name}: 교육과정 권위·외부 업로드·권위 한계 계약이 불완전합니다.`);
    }
    verified.push({ ...file, page_count: pageCount, original_filename: file.upload_name });
  }
  return verified;
}

async function copilotCurriculumKnowledge(externalFiles) {
  const originalByLevel = new Map(externalFiles.map((file) => [file.school_level, file]));
  const elementary = originalByLevel.get("ELEMENTARY");
  const middle = originalByLevel.get("MIDDLE");
  const high = originalByLevel.get("HIGH");
  if (!elementary || !middle || !high) {
    throw new Error("Copilot 교육과정 Knowledge에 초등·중등·고등 원본이 모두 필요합니다.");
  }
  for (const fragment of highSchoolFragments) {
    const bytes = await readFile(join(localCurriculumDirectory, fragment.live_filename));
    if (bytes.length !== fragment.bytes || sha256(bytes) !== fragment.sha256) {
      throw new Error(`${fragment.live_filename}: 내용보존 분할본의 size/hash가 일치하지 않습니다.`);
    }
    if (fragment.bytes > 16 * 1024 * 1024 || fragment.page_count !== fragment.page_range.end - fragment.page_range.start + 1) {
      throw new Error(`${fragment.live_filename}: 16MB 또는 페이지 범위 계약을 위반했습니다.`);
    }
  }
  if (highSchoolFragments[0].page_range.start !== 1
    || highSchoolFragments.at(-1).page_range.end !== high.page_count
    || highSchoolFragments[0].page_range.end + 1 !== highSchoolFragments[1].page_range.start
    || highSchoolFragments.reduce((sum, fragment) => sum + fragment.page_count, 0) !== high.page_count) {
    throw new Error("고등학교 교육과정 분할본의 페이지 범위가 원본 전체를 연속 보존하지 않습니다.");
  }

  const sameAsOriginalFragment = (original) => ({
    live_filename: original.original_filename,
    bytes: original.bytes,
    sha256: original.sha256,
    page_count: original.page_count,
    page_range: { start: 1, end: original.page_count },
    mapped_original_sha256: original.sha256,
    content_preservation: "ORIGINAL_FILE"
  });
  const source = (original, liveFragments) => ({
    school_level: original.school_level,
    original_filename: original.original_filename,
    original_bytes: original.bytes,
    original_sha256: original.sha256,
    original_page_count: original.page_count,
    authority_role: "CURRICULUM_AUTHORITY",
    non_academic_fact_authority: false,
    authority_limit_ko: curriculumAuthorityLimit,
    source_locator: "LOCAL_RECEIPT_ONLY",
    repository_copy: false,
    live_fragments: liveFragments
  });

  return {
    mode: "SEARCH_ALL_WEBSITES_PLUS_CURRICULUM_FILES",
    web_search: { enabled: true, scope: "ALL_WEBSITES" },
    max_live_file_bytes: 16 * 1024 * 1024,
    original_source_count: 3,
    live_file_count: 4,
    curriculum_sources: [
      source(elementary, [sameAsOriginalFragment(elementary)]),
      source(middle, [sameAsOriginalFragment(middle)]),
      source(high, highSchoolFragments.map((fragment) => ({
        ...fragment,
        mapped_original_sha256: high.sha256,
        content_preservation: "PAGE_RANGE_SPLIT_FROM_ORIGINAL"
      })))
    ]
  };
}

export async function buildExpectedManifests({ skillZipPath } = {}) {
  const chatgptInstruction = await textArtifact(join(root, "chatgpt", "custom-gpt", "INSTRUCTIONS.md"));
  const knowledgeManifestPath = join(root, "chatgpt", "custom-gpt", "knowledge", "KNOWLEDGE_MANIFEST.json");
  const knowledgeManifest = await readJsonAllowBom(knowledgeManifestPath);
  const approvedKnowledgeNames = [
    "PUBLIC_LESSON_PRINCIPLES.md",
    "source-record.schema.json",
    "evidence.schema.json",
    "research-plan.schema.json",
    "student-lesson-turn.schema.json",
    "cross-domain-catalog.json"
  ];
  const externalKnowledgeFiles = knowledgeManifest.files?.filter((file) => file.delivery === "EXTERNAL_UPLOAD") ?? [];
  const packagedKnowledgeFiles = knowledgeManifest.files?.filter((file) => file.delivery === "PACKAGE_COPY") ?? [];
  if (knowledgeManifest.file_count !== 9
    || knowledgeManifest.packaged_file_count !== 6
    || knowledgeManifest.external_upload_count !== 3
    || knowledgeManifest.files?.length !== 9
    || packagedKnowledgeFiles.length !== 6
    || externalKnowledgeFiles.length !== 3
    || !approvedKnowledgeNames.every((name, index) => knowledgeManifest.files[index]?.upload_name === name)) {
    throw new Error("ChatGPT Knowledge는 생성 6개와 외부 교육과정 원본 PDF 3개, 총 9개여야 합니다.");
  }
  const requiredExcludedSources = [
    "chatgpt/custom-gpt/KNOWLEDGE_REFERENCE.md",
    "skills/teach-grounded-scenarios/schemas/session.schema.json",
    "skills/teach-grounded-scenarios/schemas/memory-delta.schema.json",
    "skills/teach-grounded-scenarios/schemas/lesson-turn.schema.json"
  ];
  if (!requiredExcludedSources.every((source) => knowledgeManifest.excluded?.some((entry) => entry.source === source && entry.reason))) {
    throw new Error("내부 reference/session/memory/original lesson-turn 제외 이유가 Knowledge manifest에 모두 있어야 합니다.");
  }
  for (const file of packagedKnowledgeFiles) {
    const sourceBytes = await readFile(join(root, file.source_path));
    const uploadBytes = await readFile(join(dirname(knowledgeManifestPath), file.upload_name));
    const hasBom = sourceBytes.length >= 3 && sourceBytes[0] === 0xEF && sourceBytes[1] === 0xBB && sourceBytes[2] === 0xBF;
    if (sha256(sourceBytes) !== file.sha256 || sourceBytes.length !== file.bytes || !sourceBytes.equals(uploadBytes)) {
      throw new Error(`${file.upload_name}: Knowledge manifest, 원본, 업로드 파일의 bytes/hash가 일치하지 않습니다.`);
    }
    if (file.encoding === "UTF-8-SIG" && !hasBom) {
      throw new Error(`${file.upload_name}: UTF-8-SIG 표기와 실제 BOM이 일치하지 않습니다.`);
    }
    if (file.encoding === "UTF-8" && hasBom) {
      throw new Error(`${file.upload_name}: 기계 파일은 UTF-8 무BOM이어야 합니다.`);
    }
    if (sourceBytes.toString("utf8").includes("\uFFFD")) {
      throw new Error(`${file.upload_name}: Unicode replacement character가 있습니다.`);
    }
  }
  const verifiedExternalKnowledgeFiles = await verifyExternalCurriculumPdfs(externalKnowledgeFiles);
  const expectedChatgptKnowledgeFiles = [
    ...packagedKnowledgeFiles.map(({ upload_name, sha256: digest, bytes, delivery }) => ({
      upload_name,
      sha256: digest,
      bytes,
      delivery
    })),
    ...verifiedExternalKnowledgeFiles.map((file) => ({
      upload_name: file.upload_name,
      original_filename: file.original_filename,
      sha256: file.sha256,
      bytes: file.bytes,
      page_count: file.page_count,
      school_level: file.school_level,
      delivery: file.delivery,
      source_locator: file.source_locator,
      repository_copy: file.repository_copy,
      authority_role: file.authority_role,
      non_academic_fact_authority: file.non_academic_fact_authority,
      authority_limit_ko: file.authority_limit_ko
    }))
  ];

  const chatgptUnsigned = {
    schema_version: "1.0.0",
    manifest_type: "EXPECTED_DEPLOYMENT",
    platform: "CUSTOM_GPT",
    configuration: {
      instructions: chatgptInstruction,
      knowledge: {
        manifest_path: relative(root, knowledgeManifestPath).replaceAll("\\", "/"),
        package_seal_sha256: knowledgeManifest.seal_sha256,
        file_count: knowledgeManifest.file_count,
        packaged_file_count: 6,
        external_upload_count: 3,
        files: expectedChatgptKnowledgeFiles,
        excluded: knowledgeManifest.excluded.map(({ source, reason }) => ({ source, reason }))
      },
      capability_toggles: {
        web_search: true,
        image_generation: true,
        code_interpreter_data_analysis: true,
        apps: false,
        actions: false
      },
      privacy: {
        visibility: "OWNER_ONLY",
        sharing: "PRIVATE"
      }
    },
    live_contract: {
      receipt_location: ".reverse-local/deployment-receipts/chatgpt.json",
      identifier_policy: "LOCAL_FINGERPRINT_ONLY",
      required_checks: ["knowledge_processing", "configuration_saved", "publication", "privacy", "live_canary"],
      completion_policy: "ALL_REQUIRED_CHECKS_PASS_WITH_BROWSER_EVIDENCE"
    },
    public_repository: {
      contains_live_identifiers: false,
      contains_live_urls: false,
      contains_tokens_or_credentials: false
    }
  };

  const resolvedSkillZip = skillZipPath ?? await newestLocalSkillZip();
  const skillZipBytes = await readFile(resolvedSkillZip);
  const zipInspection = inspectZip(skillZipBytes);
  if (!zipInspection.files.includes("SKILL.md") || zipInspection.file_count < 2) {
    throw new Error("Copilot Skill ZIP에 SKILL.md와 지원 파일이 있어야 합니다.");
  }
  const copilotInstruction = await textArtifact(join(root, "copilot", "studio", "STUDIO_INSTRUCTIONS.md"));
  const copilotGreetingMessage = await textArtifact(
    join(root, "copilot", "studio", "GREETING_MESSAGE.md"),
    ["Reverse", "학교급", "Apache-2.0"]
  );
  const copilotKnowledge = await copilotCurriculumKnowledge(verifiedExternalKnowledgeFiles);
  const copilotUnsigned = {
    schema_version: "1.0.0",
    manifest_type: "EXPECTED_DEPLOYMENT",
    platform: "COPILOT_STUDIO",
    configuration: {
      environment: {
        scope: "ANY_MICROSOFT_365_WORK_OR_EDUCATION_TENANT",
        display_name: "TARGET_TENANT_SELECTED_AT_INSTALL",
        immutable: false,
        identifier_storage: "LOCAL_RECEIPT_FINGERPRINT_ONLY"
      },
      instructions: copilotInstruction,
      greeting_message: copilotGreetingMessage,
      model: {
        display_name: "GPT-5.6 Reasoning",
        selection: "PLATFORM_OBSERVED",
        identity_or_capability_proof: false
      },
      skill_zip: {
        archive_name: basename(resolvedSkillZip),
        sha256: sha256(skillZipBytes),
        file_count: zipInspection.file_count
      },
      resources: {
        tools: { mode: "NONE" },
        knowledge: copilotKnowledge,
        connected_agents: { mode: "NONE" },
        memory: { enabled: false }
      }
    },
    live_contract: {
      receipt_location: ".reverse-local/deployment-receipts/copilot-studio.json",
      identifier_policy: "LOCAL_FINGERPRINT_ONLY",
      required_checks: ["skill_processing", "knowledge_processing", "configuration_saved", "publication", "environment_name", "model_selection", "resource_state", "live_canary"],
      completion_policy: "ALL_REQUIRED_CHECKS_PASS_WITH_BROWSER_EVIDENCE"
    },
    public_repository: {
      contains_live_identifiers: false,
      contains_live_urls: false,
      contains_tokens_or_credentials: false
    }
  };

  const manifests = {
    CUSTOM_GPT: sealManifest(chatgptUnsigned),
    COPILOT_STUDIO: sealManifest(copilotUnsigned)
  };
  await writeFile(chatgptExpectedPath, `${JSON.stringify(manifests.CUSTOM_GPT, null, 2)}\n`, "utf8");
  await writeFile(copilotExpectedPath, `${JSON.stringify(manifests.COPILOT_STUDIO, null, 2)}\n`, "utf8");
  return manifests;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildExpectedManifests({ skillZipPath: parseSkillZipArgument(process.argv.slice(2)) })
    .then((manifests) => {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        chatgpt_seal_sha256: manifests.CUSTOM_GPT.seal_sha256,
        copilot_studio_seal_sha256: manifests.COPILOT_STUDIO.seal_sha256,
        copilot_skill_file_count: manifests.COPILOT_STUDIO.configuration.skill_zip.file_count
      }, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
