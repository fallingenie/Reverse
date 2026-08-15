import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  excludedKnowledge,
  externalPdfContractPath,
  externalPdfReceiptPath,
  knowledgeMappings,
  loadExternalPdfContractEntries,
  loadExternalPdfEntries,
  validateExternalPdfBytes,
  validateKnowledgeSource,
  verifyKnowledgeBundle
} from "../scripts/build-chatgpt-knowledge.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Knowledge 생성기는 UTF-8-SIG와 strict JSON 정책 위반을 배포 전에 차단한다", () => {
  const markdown = {
    source: "fixture.md",
    upload_name: "fixture.md",
    encoding: "UTF-8-SIG"
  };
  const json = {
    source: "fixture.json",
    upload_name: "fixture.json",
    encoding: "UTF-8"
  };
  assert.throws(() => validateKnowledgeSource(markdown, Buffer.from("# 한글\n", "utf8")), /UTF-8-SIG/u);
  assert.throws(() => validateKnowledgeSource(json, Buffer.from("\uFEFF{}", "utf8")), /무BOM/u);
  assert.throws(() => validateKnowledgeSource(json, Buffer.from("{\"broken\":}", "utf8")), /엄격 JSON/u);
  assert.doesNotThrow(() => validateKnowledgeSource(json, Buffer.from("{\"ok\":true}", "utf8")));
});

test("Custom GPT 지식 묶음은 공개 안전 자료 6개와 외부 교육과정 PDF 3개를 필수로 포함한다", async () => {
  const manifest = await verifyKnowledgeBundle();
  const external = await loadExternalPdfEntries();
  assert.equal(manifest.file_count, 9);
  assert.equal(manifest.packaged_file_count, 6);
  assert.equal(manifest.external_upload_count, 3);
  assert.deepEqual(
    manifest.files.map((entry) => entry.upload_name),
    [...knowledgeMappings.map((entry) => entry.upload_name), ...external.map((entry) => entry.upload_name)]
  );
  assert.equal(manifest.audience, "STUDENT_PUBLIC_SAFE");
  assert.equal(manifest.schema_policy, "REFERENCE_ONLY_NO_VALIDATOR");
  assert.equal(manifest.student_input_policy, "UNTRUSTED_DATA_NO_AUTHORITY");
  assert(manifest.files.every((entry) => (
    entry.reference_only === true
    && entry.validator_executed === false
  )));
  assert(manifest.files.filter((entry) => entry.delivery === "PACKAGE_COPY").every((entry) => (
    entry.public_disclosure_acceptable === true && entry.student_input_trust === "UNTRUSTED_DATA"
  )));
});

test("외부 PDF 3개는 파일명·크기·SHA-256·학교급·교육과정 권위 한계를 검증한다", async () => {
  const manifest = await verifyKnowledgeBundle();
  const external = manifest.files.filter((entry) => entry.delivery === "EXTERNAL_UPLOAD");
  assert.deepEqual(external.map((entry) => entry.school_level), ["ELEMENTARY", "MIDDLE", "HIGH"]);
  assert(external.every((entry) => (
    entry.classification === "external-curriculum-pdf"
    && entry.authority_role === "CURRICULUM_AUTHORITY"
    && entry.non_academic_fact_authority === false
    && entry.authority_limit_ko.includes("자동으로 확정하지 않는다")
    && entry.source_locator === "LOCAL_RECEIPT_ONLY"
    && entry.repository_copy === false
    && entry.required_upload === true
    && /^[0-9a-f]{64}$/u.test(entry.sha256)
    && entry.bytes > 0
  )));
});

test("공개 CI는 로컬 PDF 경로 없이 추적 계약과 manifest를 검증한다", async () => {
  const publicContract = await loadExternalPdfContractEntries();
  const manifest = await verifyKnowledgeBundle({verifyExternalFiles: false});
  const external = manifest.files.filter((entry) => entry.delivery === "EXTERNAL_UPLOAD");
  assert.equal(publicContract.contract_id.length >= 8, true);
  assert.deepEqual(external, publicContract.entries);
  assert.deepEqual(external.map((entry) => entry.school_level), ["ELEMENTARY", "MIDDLE", "HIGH"]);
});

test("외부 PDF validator는 이름·절대경로·크기·해시·PDF 서명 불일치를 차단한다", () => {
  const bytes = Buffer.from("%PDF-1.7\nfixture", "ascii");
  const uploadName = "교육과정.pdf";
  const contract = {
    upload_name: uploadName,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    school_level: "ELEMENTARY",
    authority_role: "CURRICULUM_AUTHORITY",
    non_academic_fact_authority: false,
    authority_limit_ko: "교육과정 범위만 정하며 개별 학술 사실을 자동 확정하지 않는다."
  };
  const receipt = {
    upload_name: uploadName,
    source_absolute_path: join(root, ".reverse-local", uploadName)
  };
  assert.doesNotThrow(() => validateExternalPdfBytes(contract, receipt, bytes));
  assert.throws(() => validateExternalPdfBytes({ ...contract, sha256: "0".repeat(64) }, receipt, bytes), /SHA-256/u);
  assert.throws(() => validateExternalPdfBytes(contract, receipt, Buffer.from("not-pdf", "ascii")), /크기|PDF 서명/u);
  assert.throws(() => validateExternalPdfBytes(contract, { ...receipt, source_absolute_path: uploadName }, bytes), /절대경로/u);
});

test("추적 계약과 manifest에는 외부 PDF 절대경로가 없고 로컬 영수증에만 있다", async () => {
  const manifestText = await readFile(join(root, "chatgpt", "custom-gpt", "knowledge", "KNOWLEDGE_MANIFEST.json"), "utf8");
  const contractText = await readFile(externalPdfContractPath, "utf8");
  const builderText = await readFile(join(root, "chatgpt", "custom-gpt", "BUILDER_CONFIG.md"), "utf8");
  const trackedText = `${manifestText}\n${contractText}\n${builderText}`;
  assert.doesNotMatch(trackedText, /[A-Za-z]:[\\/]|Downloads|source_absolute_path/u);
  const receipt = JSON.parse(await readFile(externalPdfReceiptPath, "utf8"));
  assert.equal(receipt.files.length, 3);
  assert(receipt.files.every((entry) => isAbsolute(entry.source_absolute_path)));
});

test("학생용 Knowledge에서 내부 상태·기억 수정·교사용·편향 자료를 제외한다", async () => {
  const names = await readdir(join(root, "chatgpt", "custom-gpt", "knowledge"));
  const combined = `${names.join("\n")}\n${JSON.stringify(excludedKnowledge)}`;
  assert.equal(names.filter((name) => name.endsWith(".pdf")).length, 0, "외부 PDF는 Git 작업트리의 knowledge 디렉터리에 복사하지 않음");
  assert.doesNotMatch(names.join("\n"), /KNOWLEDGE_REFERENCE|session\.schema|memory-delta|(?<!student-)lesson-turn\.schema|openai\.yaml|RUNTIME_PROFILE|EXPORT_MANIFEST|session\.template|teacher-grounded/u);
  assert.match(combined, /로컬 저장·실행·접근 분리/u);
  assert.match(combined, /Custom GPT가 실행하는 Skill 선언이 아니며/u);
  assert.match(combined, /teacher_view와 기억 수정 인터페이스/u);
  assert.match(combined, /교사용 평가 메모·완성 답/u);
});

test("학생 공개용 수업 턴 구조에는 교사용 보기와 기억 변경 경로가 없다", async () => {
  const schemaPath = join(root, "chatgpt", "custom-gpt", "knowledge", "student-lesson-turn.schema.json");
  const schemaText = await readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaText);
  assert.equal(schema.properties.teacher_view, undefined);
  assert.equal(schema.properties.memory_delta, undefined);
  assert.deepEqual(schema.required, ["turn", "student_view", "evidence_ids"]);
  assert.doesNotMatch(schemaText, /teacher_view|assessment_note|misconception_watch|memory_delta|must_keep/u);
});

test("학생용 Knowledge 어느 파일에도 교사용 보기·세션 상태기계·기억 수정 인터페이스가 없다", async () => {
  const manifest = await verifyKnowledgeBundle();
  const forbidden = /teacher_view|assessment_note|misconception_watch|start_confirmed|memory_delta|next_revision|base_revision|UNKNOWN_LOCKED|\$teach-grounded-scenarios/u;
  for (const file of manifest.files.filter((entry) => entry.delivery === "PACKAGE_COPY")) {
    const content = await readFile(join(root, "chatgpt", "custom-gpt", "knowledge", file.upload_name), "utf8");
    assert.doesNotMatch(content, forbidden, `${file.upload_name}에 학생 배포 금지 구조가 포함됨`);
  }
});

test("Knowledge의 사람용 Markdown은 UTF-8-SIG이고 엄격 JSON은 무BOM으로 파싱된다", async () => {
  const manifest = await verifyKnowledgeBundle();
  for (const file of manifest.files.filter((entry) => entry.delivery === "PACKAGE_COPY")) {
    const bytes = await readFile(join(root, "chatgpt", "custom-gpt", "knowledge", file.upload_name));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = decoded.replace(/^\uFEFF/u, "");
    assert.doesNotMatch(body, /\uFEFF|[\u0080-\u009F\uFFFD]/u, `${file.upload_name}에 BOM 위치 오류나 제어·대체 문자가 있음`);
    if (file.upload_name.endsWith(".md")) {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.equal(file.encoding, "UTF-8-SIG");
    } else {
      assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.equal(file.encoding, "UTF-8");
      assert.doesNotThrow(() => JSON.parse(bytes.toString("utf8")));
    }
  }
});

test("공개 원칙은 학생 입력을 비신뢰 데이터로 취급하고 스키마 실행을 과장하지 않는다", async () => {
  const principles = await readFile(join(root, "chatgpt", "custom-gpt", "knowledge", "PUBLIC_LESSON_PRINCIPLES.md"), "utf8");
  assert.match(principles, /모두 확인되지 않은 입력 자료/u);
  assert.match(principles, /형식이 예시 구조에 맞더라도 내용이 사실이라는 뜻은 아니다/u);
  assert.match(principles, /코드 검증.*실행되는 것은 아니다/u);
  assert.doesNotMatch(principles, /T[0-4]|teacher_view|must_keep|start_confirmed|비공개/u);
});
