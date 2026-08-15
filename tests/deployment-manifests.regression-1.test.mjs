import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  createNotRunReceipt,
  assertNoSensitivePublicData,
  validateLiveReceipt,
  verifyLiveDeployments
} from "../scripts/verify-live-deployment.mjs";
import { readJsonAllowBom, sha256 } from "../scripts/build-deployment-expectations.mjs";

const digest = (character) => character.repeat(64);
const authorityLimit = "교육과정의 범위·성취기준·용어를 정하며 개별 과학·역사 사실을 자동 확정하지 않는다.";

function curriculumSource(level, originalDigest, pageCount, fragments) {
  return {
    school_level: level,
    original_filename: `${level}.pdf`,
    original_bytes: 1000,
    original_sha256: originalDigest,
    original_page_count: pageCount,
    authority_role: "CURRICULUM_AUTHORITY",
    non_academic_fact_authority: false,
    authority_limit_ko: authorityLimit,
    source_locator: "LOCAL_RECEIPT_ONLY",
    repository_copy: false,
    live_fragments: fragments
  };
}

function curriculumFragment(filename, fileDigest, originalDigest, start, end, preservation) {
  return {
    live_filename: filename,
    bytes: 900,
    sha256: fileDigest,
    page_count: end - start + 1,
    page_range: { start, end },
    mapped_original_sha256: originalDigest,
    content_preservation: preservation
  };
}

function expectedManifest(platform) {
  const common = {
    schema_version: "1.0.0",
    manifest_type: "EXPECTED_DEPLOYMENT",
    platform,
    live_contract: {
      receipt_location: platform === "CUSTOM_GPT"
        ? ".reverse-local/deployment-receipts/chatgpt.json"
        : ".reverse-local/deployment-receipts/copilot-studio.json",
      identifier_policy: "LOCAL_FINGERPRINT_ONLY",
      required_checks: platform === "CUSTOM_GPT"
        ? ["knowledge_processing", "configuration_saved", "publication", "privacy", "live_canary"]
        : ["skill_processing", "knowledge_processing", "configuration_saved", "publication", "environment_name", "model_selection", "resource_state", "live_canary"],
      completion_policy: "ALL_REQUIRED_CHECKS_PASS_WITH_BROWSER_EVIDENCE"
    },
    public_repository: {
      contains_live_identifiers: false,
      contains_live_urls: false,
      contains_tokens_or_credentials: false
    },
    seal_sha256: digest("c")
  };
  if (platform === "CUSTOM_GPT") {
    return {
      ...common,
      configuration: {
        instructions: {
          source_path: "chatgpt/custom-gpt/INSTRUCTIONS.md",
          source_sha256: digest("9"),
          canonical_text_sha256: digest("a"),
          source_bytes: 100,
          utf8_sig: true
        },
        knowledge: {
          manifest_path: "chatgpt/custom-gpt/knowledge/KNOWLEDGE_MANIFEST.json",
          package_seal_sha256: digest("b"),
          file_count: 9,
          packaged_file_count: 6,
          external_upload_count: 3,
          files: [
            ...Array.from({ length: 6 }, (_, index) => ({
            upload_name: `knowledge-${index}.json`,
            sha256: digest(String(index + 1)),
            bytes: index + 1,
            delivery: "PACKAGE_COPY"
            })),
            ...[
              ["ELEMENTARY", digest("a"), 521],
              ["MIDDLE", digest("b"), 677],
              ["HIGH", digest("c"), 2215]
            ].map(([schoolLevel, fileDigest, pageCount]) => ({
              upload_name: `${schoolLevel}.pdf`,
              original_filename: `${schoolLevel}.pdf`,
              sha256: fileDigest,
              bytes: 1000,
              page_count: pageCount,
              school_level: schoolLevel,
              delivery: "EXTERNAL_UPLOAD",
              source_locator: "LOCAL_RECEIPT_ONLY",
              repository_copy: false,
              authority_role: "CURRICULUM_AUTHORITY",
              non_academic_fact_authority: false,
              authority_limit_ko: authorityLimit
            }))
          ],
          excluded: [
            { source: "internal-reference", reason: "학생 공개 묶음이 아님" },
            { source: "session", reason: "내부 상태 계약" },
            { source: "memory", reason: "내부 수정 계약" },
            { source: "teacher-turn", reason: "교사용 필드 포함" }
          ]
        },
        capability_toggles: {
          web_search: true,
          image_generation: true,
          code_interpreter_data_analysis: true,
          apps: false,
          actions: false
        },
        privacy: { visibility: "OWNER_ONLY", sharing: "PRIVATE" }
      }
    };
  }
  return {
      ...common,
      configuration: {
      environment: {
        scope: "ANY_MICROSOFT_365_WORK_OR_EDUCATION_TENANT",
        display_name: "TARGET_TENANT_SELECTED_AT_INSTALL",
        immutable: false,
        identifier_storage: "LOCAL_RECEIPT_FINGERPRINT_ONLY"
      },
      instructions: {
        source_path: "copilot/studio/STUDIO_INSTRUCTIONS.md",
        source_sha256: digest("9"),
        canonical_text_sha256: digest("a"),
        source_bytes: 100,
        utf8_sig: true
      },
      model: {
        display_name: "GPT-5.6 Reasoning",
        selection: "PLATFORM_OBSERVED",
        identity_or_capability_proof: false
      },
      skill_zip: {
        archive_name: "teach-grounded-scenarios-test.zip",
        sha256: digest("b"),
        file_count: 40
      },
      resources: {
        tools: { mode: "NONE" },
        knowledge: {
          mode: "SEARCH_ALL_WEBSITES_PLUS_CURRICULUM_FILES",
          web_search: { enabled: true, scope: "ALL_WEBSITES" },
          max_live_file_bytes: 16777216,
          original_source_count: 3,
          live_file_count: 4,
          curriculum_sources: [
            curriculumSource("ELEMENTARY", digest("a"), 521, [
              curriculumFragment("ELEMENTARY.pdf", digest("a"), digest("a"), 1, 521, "ORIGINAL_FILE")
            ]),
            curriculumSource("MIDDLE", digest("b"), 677, [
              curriculumFragment("MIDDLE.pdf", digest("b"), digest("b"), 1, 677, "ORIGINAL_FILE")
            ]),
            curriculumSource("HIGH", digest("c"), 2215, [
              curriculumFragment("HIGH-1.pdf", digest("d"), digest("c"), 1, 1108, "PAGE_RANGE_SPLIT_FROM_ORIGINAL"),
              curriculumFragment("HIGH-2.pdf", digest("e"), digest("c"), 1109, 2215, "PAGE_RANGE_SPLIT_FROM_ORIGINAL")
            ])
          ]
        },
        connected_agents: { mode: "NONE" },
        memory: { enabled: false }
      }
    }
  };
}

function passingReceipt(manifest, evidenceArtifact) {
  const receipt = createNotRunReceipt(manifest);
  receipt.target_fingerprint_sha256 = digest("f");
  if (manifest.platform === "CUSTOM_GPT") {
    receipt.observed_configuration = {
      instructions_canonical_sha256: manifest.configuration.instructions.canonical_text_sha256,
      knowledge_package_seal_sha256: manifest.configuration.knowledge.package_seal_sha256,
      knowledge_files: structuredClone(manifest.configuration.knowledge.files),
      capability_toggles: structuredClone(manifest.configuration.capability_toggles),
      privacy: structuredClone(manifest.configuration.privacy)
    };
  } else {
    receipt.observed_configuration = {
      environment_display_name: manifest.configuration.environment.display_name,
      instructions_canonical_sha256: manifest.configuration.instructions.canonical_text_sha256,
      model_display_name: manifest.configuration.model.display_name,
      skill_zip_sha256: manifest.configuration.skill_zip.sha256,
      skill_file_count: manifest.configuration.skill_zip.file_count,
      resources: structuredClone(manifest.configuration.resources)
    };
  }
  const timestamp = "2026-08-15T01:23:45.000Z";
  for (const checkName of manifest.live_contract.required_checks) {
    receipt.checks[checkName] = {
      status: "PASS",
      observed_at: timestamp,
      evidence: [{
        kind: checkName === "live_canary" ? "LIVE_TRANSCRIPT" : "BROWSER_DOM",
        sha256: evidenceArtifact.sha256,
        captured_at: timestamp,
        description: `${checkName} 확인 증거`,
        local_artifact_path: evidenceArtifact.path
      }]
    };
  }
  receipt.completion = {
    complete: true,
    status: "COMPLETE",
    evaluated_at: timestamp,
    reason: "필수 라이브 검사가 모두 통과했습니다."
  };
  return receipt;
}

async function createEvidenceArtifact() {
  const evidenceRoot = await mkdtemp(join(tmpdir(), "reverse-deployment-evidence-"));
  const relativePath = ".reverse-local/deployment-evidence/browser-proof.txt";
  const absolutePath = join(evidenceRoot, ...relativePath.split("/"));
  await mkdir(join(evidenceRoot, ".reverse-local", "deployment-evidence"), { recursive: true });
  const bytes = Buffer.from("evidence", "utf8");
  await writeFile(absolutePath, bytes);
  return {
    root: evidenceRoot,
    path: relativePath,
    sha256: sha256(bytes)
  };
}

test("브라우저 증거가 없는 NOT_RUN receipt는 완료로 승격되지 않는다", async () => {
  for (const platform of ["CUSTOM_GPT", "COPILOT_STUDIO"]) {
    const manifest = expectedManifest(platform);
    const receipt = createNotRunReceipt(manifest);
    const result = await validateLiveReceipt(manifest, receipt);
    assert.equal(result.ok, false);
    assert.equal(receipt.completion.complete, false);
    assert.ok(result.issues.some((issue) => issue.includes("NOT_RUN")));
  }
});

test("실제 구성값과 증거를 모두 가진 receipt만 완료된다", async () => {
  const evidenceArtifact = await createEvidenceArtifact();
  for (const platform of ["CUSTOM_GPT", "COPILOT_STUDIO"]) {
    const manifest = expectedManifest(platform);
    const receipt = passingReceipt(manifest, evidenceArtifact);
    if (platform === "COPILOT_STUDIO") {
      receipt.observed_configuration.environment_display_name = "다른 학교 교육 테넌트";
    }
    const result = await validateLiveReceipt(manifest, receipt, { evidenceRoot: evidenceArtifact.root });
    assert.deepEqual(result, { ok: true, issues: [] });
  }
});

test("Copilot 배포 계약은 특정 재단명 대신 설치 대상 테넌트 기록을 요구한다", async () => {
  const evidenceArtifact = await createEvidenceArtifact();
  const manifest = expectedManifest("COPILOT_STUDIO");
  const receipt = passingReceipt(manifest, evidenceArtifact);
  receipt.observed_configuration.environment_display_name = "";
  const result = await validateLiveReceipt(manifest, receipt, { evidenceRoot: evidenceArtifact.root });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("설치 대상 환경")));
});

test("완료 표지만 위조하거나 라이브 구성이 다르면 fail-closed한다", async () => {
  const evidenceArtifact = await createEvidenceArtifact();
  const manifest = expectedManifest("CUSTOM_GPT");
  const noEvidence = createNotRunReceipt(manifest);
  noEvidence.completion = {
    complete: true,
    status: "COMPLETE",
    evaluated_at: "2026-08-15T01:23:45.000Z",
    reason: "근거 없이 완료로 표시"
  };
  const forgedResult = await validateLiveReceipt(manifest, noEvidence);
  assert.equal(forgedResult.ok, false);
  assert.ok(forgedResult.issues.some((issue) => issue.includes("브라우저 증거") || issue.includes("NOT_RUN")));

  const drifted = passingReceipt(manifest, evidenceArtifact);
  drifted.observed_configuration.capability_toggles.web_search = false;
  drifted.completion = { complete: false, status: "BLOCKED", evaluated_at: null, reason: "구성 불일치" };
  const driftResult = await validateLiveReceipt(manifest, drifted, { evidenceRoot: evidenceArtifact.root });
  assert.equal(driftResult.ok, false);
  assert.ok(driftResult.issues.some((issue) => issue.includes("capability toggles")));

  const platformOnly = passingReceipt(manifest, evidenceArtifact);
  platformOnly.checks.configuration_saved.evidence[0].kind = "PLATFORM_CONFIRMATION";
  platformOnly.completion = { complete: false, status: "BLOCKED", evaluated_at: null, reason: "브라우저 증거 없음" };
  const platformOnlyResult = await validateLiveReceipt(manifest, platformOnly, { evidenceRoot: evidenceArtifact.root });
  assert.equal(platformOnlyResult.ok, false);
  assert.ok(platformOnlyResult.issues.some((issue) => issue.includes("실제 브라우저")));

  const missingArtifact = passingReceipt(manifest, {
    path: ".reverse-local/deployment-evidence/missing.txt",
    sha256: digest("e")
  });
  const missingArtifactResult = await validateLiveReceipt(manifest, missingArtifact, { evidenceRoot: evidenceArtifact.root });
  assert.equal(missingArtifactResult.ok, false);
  assert.ok(missingArtifactResult.issues.some((issue) => issue.includes("실제 증거 파일")));

  const wrongHash = passingReceipt(manifest, {
    path: evidenceArtifact.path,
    sha256: digest("a")
  });
  const wrongHashResult = await validateLiveReceipt(manifest, wrongHash, { evidenceRoot: evidenceArtifact.root });
  assert.equal(wrongHashResult.ok, false);
  assert.ok(wrongHashResult.issues.some((issue) => issue.includes("실제 증거 파일 SHA-256")));

  const traversal = passingReceipt(manifest, {
    path: ".reverse-local/deployment-evidence/../outside.txt",
    sha256: digest("e")
  });
  const traversalResult = await validateLiveReceipt(manifest, traversal, { evidenceRoot: evidenceArtifact.root });
  assert.equal(traversalResult.ok, false);
  assert.ok(traversalResult.issues.some((issue) => issue.includes("실제 증거 파일")));
});

test("공개 expected manifest에는 라이브 URL·원시 ID·토큰을 넣지 않는다", () => {
  assert.doesNotThrow(() => assertNoSensitivePublicData(expectedManifest("COPILOT_STUDIO")));
  assert.throws(
    () => assertNoSensitivePublicData({ agent_id: "private" }),
    /민감 식별자/u
  );
  assert.throws(
    () => assertNoSensitivePublicData({ location: "https://chatgpt.com/g/private" }),
    /라이브 URL/u
  );
  assert.throws(
    () => assertNoSensitivePublicData({ location: "11111111-1111-4111-8111-111111111111" }),
    /라이브 URL 또는 원시 식별자/u
  );
});

test("JSON 입력기는 UTF-8-SIG와 무BOM을 모두 읽고 기계 출력은 무BOM이다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reverse-deployment-json-"));
  const bomPath = join(directory, "bom.json");
  const plainPath = join(directory, "plain.json");
  const payload = { display_name: "학교 교육 테넌트" };
  await writeFile(bomPath, `\uFEFF${JSON.stringify(payload)}`, "utf8");
  await writeFile(plainPath, JSON.stringify(payload), "utf8");
  assert.deepEqual(await readJsonAllowBom(bomPath), payload);
  assert.deepEqual(await readJsonAllowBom(plainPath), payload);
  const plainBytes = await readFile(plainPath);
  assert.notDeepEqual([...plainBytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
});

test("ChatGPT 원본 PDF에는 Copilot Studio의 16MB 분할 제한을 적용하지 않는다", async () => {
  const receiptDirectory = await mkdtemp(join(tmpdir(), "reverse-chatgpt-receipt-"));
  const result = await verifyLiveDeployments({
    platforms: ["CUSTOM_GPT"],
    receiptDirectory,
    verifyWorkspaceArtifacts: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].issues.length, 1);
  assert.match(result.results[0].issues[0], /라이브 receipt를 읽지 못했습니다/u);
  assert.doesNotMatch(result.results[0].issues[0], /파일 제한/u);
});

test("receipt JSON Schema는 NOT_RUN과 증거 기반 PASS 구조를 모두 엄격하게 읽는다", async () => {
  const schema = JSON.parse(await readFile(new URL("../contracts/deployment-receipt.schema.json", import.meta.url), "utf8"));
  const expectedSchema = JSON.parse(await readFile(new URL("../contracts/deployment-expected.schema.json", import.meta.url), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const validateExpected = ajv.compile(expectedSchema);
  const manifest = expectedManifest("CUSTOM_GPT");
  assert.equal(validateExpected(manifest), true, JSON.stringify(validateExpected.errors));
  assert.equal(validate(createNotRunReceipt(manifest)), true, JSON.stringify(validate.errors));
  assert.equal(validate(passingReceipt(manifest, {
    path: ".reverse-local/deployment-evidence/browser-proof.txt",
    sha256: digest("e")
  })), true, JSON.stringify(validate.errors));
});
