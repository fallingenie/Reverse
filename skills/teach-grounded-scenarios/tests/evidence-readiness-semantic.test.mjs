import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCHEMA_BOUNDARY,
  validateEvidenceReadiness
} from "../scripts/validate-evidence-readiness.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(testDirectory);
const fixtureDirectory = join(skillDirectory, "fixtures", "evidence-readiness");
const validatorPath = join(skillDirectory, "scripts", "validate-evidence-readiness.mjs");

async function fixture(name) {
  return JSON.parse(await readFile(join(fixtureDirectory, name), "utf8"));
}

function errorCodes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function runCli(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [validatorPath, path], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      });
    });
  });
}

test("READY는 실제로 열린 독립 A/B 원문과 근거 목표가 일치할 때만 통과한다", async () => {
  const result = validateEvidenceReadiness(await fixture("valid-ready.semantic.json"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.validator_type, "NODE_SEMANTIC_CROSS_RECORD");
  assert.equal(result.schema_boundary, SCHEMA_BOUNDARY);
  assert.match(result.schema_boundary, /JSON Schema/u);
  assert.match(result.schema_boundary, /does not retrieve live sources/u);
  assert.match(result.schema_boundary, /ChatGPT and Copilot reference assets are guidance/u);
  assert.equal(result.metrics.gates[0].actual_independent_upstreams, 2);
  assert.equal(result.metrics.gates[0].actual_tier_a_upstreams, 1);
});

test("동일 upstream의 재인용은 서로 다른 독립 출처로 중복 계산하지 않는다", async () => {
  const result = validateEvidenceReadiness(await fixture("invalid-same-upstream.semantic.json"));

  assert.equal(result.ok, false);
  assert(errorCodes(result).has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
  assert.equal(result.metrics.gates[0].actual_independent_upstreams, 1);
});

test("검색 요약과 미열람 원문 및 C 등급은 VERIFIED를 만들 수 없다", async () => {
  const result = validateEvidenceReadiness(await fixture("invalid-unopened-search-summary.semantic.json"));
  const codes = errorCodes(result);

  assert.equal(result.ok, false);
  for (const code of [
    "VERIFIED_SOURCE_NOT_OPENED",
    "VERIFIED_ORIGINAL_OPEN_CHECK_MISSING",
    "VERIFIED_SEARCH_SUMMARY_FORBIDDEN",
    "VERIFIED_AUTHORITY_INADEQUATE",
    "VERIFIED_QUALIFIED_SOURCE_REQUIRED"
  ]) {
    assert(codes.has(code), code);
  }
});

test("검색 결과 URL은 원문을 열었다는 자기표시만으로 VERIFIED가 되지 않는다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.sources[0].url = "https://www.google.co.kr/search/?q=claimed+fact";
  const result = validateEvidenceReadiness(session);

  assert(errorCodes(result).has("VERIFIED_SEARCH_SUMMARY_FORBIDDEN"));
  assert(errorCodes(result).has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
});

test("검색 결과의 자연어 한계 표기와 추가 검색 엔진 URL도 차단한다", async () => {
  const naturalLanguage = await fixture("valid-ready.semantic.json");
  naturalLanguage.sources[0].limitations = ["This source is only a search result snippet, not the original."];
  assert(errorCodes(validateEvidenceReadiness(naturalLanguage)).has("VERIFIED_SEARCH_SUMMARY_FORBIDDEN"));

  const yandex = await fixture("valid-ready.semantic.json");
  yandex.sources[0].url = "https://yandex.com/search/?text=claimed+fact";
  assert(errorCodes(validateEvidenceReadiness(yandex)).has("VERIFIED_SEARCH_SUMMARY_FORBIDDEN"));
});

test("evidence source_ids와 직접 지지 관계는 실제 레코드와 양방향으로 일치해야 한다", async () => {
  const dangling = await fixture("valid-ready.semantic.json");
  dangling.evidence[0].source_ids.push("SRC-999");
  const danglingResult = validateEvidenceReadiness(dangling);
  assert(errorCodes(danglingResult).has("EVIDENCE_SOURCE_DANGLING"));

  const oneWay = await fixture("valid-ready.semantic.json");
  oneWay.sources[0].direct_support = [];
  const oneWayResult = validateEvidenceReadiness(oneWay);
  const oneWayCodes = errorCodes(oneWayResult);
  assert(oneWayCodes.has("VERIFIED_DIRECT_SUPPORT_MISSING"));
  assert(oneWayCodes.has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
});

test("gate claim은 연결한 VERIFIED evidence의 claim과 정확히 일치해야 한다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.research.plan.claim_candidates[0] = "An unrelated claim was substituted into the plan.";
  session.research.plan.claim_quality_gates[0].claim = "An unrelated claim was substituted into the plan.";
  const result = validateEvidenceReadiness(session);

  assert(errorCodes(result).has("READY_GATE_EVIDENCE_CLAIM_MISMATCH"));
});

test("claim과 gate가 모두 비어 있는 READY는 실제 sources가 있어도 실패한다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.research.plan.claim_candidates = [];
  session.research.plan.claim_quality_gates = [];
  const result = validateEvidenceReadiness(session);
  const codes = errorCodes(result);

  assert(codes.has("READY_CLAIM_REQUIRED"));
  assert(codes.has("READY_GATE_REQUIRED"));
});

test("부적절 권위는 직접 지지처럼 표시되어도 READY 계산에서 제외한다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.sources[1].authority_tier = "D_EXCLUDED";
  const result = validateEvidenceReadiness(session);
  const codes = errorCodes(result);

  assert(codes.has("VERIFIED_AUTHORITY_INADEQUATE"));
  assert(codes.has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
});

test("source_class와 authority_tier의 자기모순은 고권위 출처로 인정하지 않는다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.sources[0].source_class = "CURRICULUM_RESOURCE";
  const result = validateEvidenceReadiness(session);
  const codes = errorCodes(result);

  assert(codes.has("VERIFIED_AUTHORITY_CLASS_MISMATCH"));
  assert(codes.has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
});

test("Tier A 목표도 source ID가 아니라 고유 upstream 단위로 센다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.research.plan.claim_quality_gates[0].risk = "HIGH";
  session.research.plan.claim_quality_gates[0].minimum_independent_sources = 3;
  session.research.plan.claim_quality_gates[0].minimum_tier_a_sources = 2;
  session.sources[1].authority_tier = "A_SYNTHESIS";
  session.sources[1].source_class = "SYSTEMATIC_REVIEW";
  session.sources[1].independence_key = session.sources[0].independence_key;

  for (const [id, key] of [["SRC-103", "UPSTREAM-103"], ["SRC-104", "UPSTREAM-104"]]) {
    session.sources.push({
      id,
      source_class: "PEER_REVIEWED",
      authority_tier: "B_SCHOLARLY",
      independence_key: key,
      opened: true,
      direct_support: ["VER-101"],
      limitations: ["Independent corroboration with a bounded scope."],
      quality_checks: ["ORIGINAL_OPENED", "METHODS_AND_SCOPE_CHECKED"]
    });
    session.evidence[0].source_ids.push(id);
  }

  const result = validateEvidenceReadiness(session);
  const codes = errorCodes(result);
  assert.equal(result.metrics.gates[0].actual_independent_upstreams, 3);
  assert.equal(result.metrics.gates[0].actual_tier_a_upstreams, 1);
  assert.equal(codes.has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"), false);
  assert(codes.has("READY_TIER_A_SOURCE_TARGET_UNMET"));
});

test("예외는 reason과 정확한 scope를 모두 갖고 해당 수량 미달만 면제한다", async () => {
  const accepted = validateEvidenceReadiness(await fixture("valid-scoped-exception.semantic.json"));
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.metrics.gates[0].exception_scopes, [
    "MINIMUM_INDEPENDENT_SOURCES",
    "MINIMUM_TIER_A_SOURCES"
  ]);

  const missingScope = await fixture("valid-scoped-exception.semantic.json");
  missingScope.research.plan.claim_quality_gates[0].exception_reason = "A unique original is the only appropriate source.";
  const missingScopeResult = validateEvidenceReadiness(missingScope);
  assert(errorCodes(missingScopeResult).has("EXCEPTION_FORMAT_INVALID"));
  assert(errorCodes(missingScopeResult).has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"));
  assert(errorCodes(missingScopeResult).has("READY_TIER_A_SOURCE_TARGET_UNMET"));

  const underScoped = await fixture("valid-scoped-exception.semantic.json");
  underScoped.research.plan.claim_quality_gates[0].exception_reason = "scope=MINIMUM_INDEPENDENT_SOURCES; reason=The claim is limited to one unique original record.";
  const underScopedResult = validateEvidenceReadiness(underScoped);
  assert.equal(errorCodes(underScopedResult).has("READY_INDEPENDENT_SOURCE_TARGET_UNMET"), false);
  assert(errorCodes(underScopedResult).has("READY_TIER_A_SOURCE_TARGET_UNMET"));

  const unusedScope = await fixture("valid-ready.semantic.json");
  unusedScope.research.plan.claim_quality_gates[0].exception_reason = "scope=MINIMUM_TIER_A_SOURCES; reason=This exception does not correspond to a real deficit.";
  const unusedScopeResult = validateEvidenceReadiness(unusedScope);
  assert(errorCodes(unusedScopeResult).has("EXCEPTION_SCOPE_UNUSED"));
});

test("READY 표시는 readiness_checked와 실제 source 및 evidence 배열과 일치해야 한다", async () => {
  const session = await fixture("valid-ready.semantic.json");
  session.research.readiness_checked = false;
  const result = validateEvidenceReadiness(session);
  assert(errorCodes(result).has("READY_CHECK_NOT_COMPLETED"));

  const empty = await fixture("valid-ready.semantic.json");
  empty.sources = [];
  empty.evidence = [];
  const emptyResult = validateEvidenceReadiness(empty);
  assert(errorCodes(emptyResult).has("READY_SOURCES_REQUIRED"));
  assert(errorCodes(emptyResult).has("READY_EVIDENCE_REQUIRED"));
});

test("CLI는 BOM 입력을 허용하고 stdout에 UTF-8 무BOM 기계 JSON만 출력한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reverse-evidence-readiness-"));
  const inputPath = join(directory, "session-with-bom.json");
  try {
    const data = await fixture("valid-ready.semantic.json");
    await writeFile(inputPath, `\uFEFF${JSON.stringify(data)}`, "utf8");
    const result = await runCli(inputPath);

    assert.equal(result.code, 0);
    assert.equal(result.stderr.length, 0);
    assert.notDeepEqual([...result.stdout.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const output = JSON.parse(result.stdout.toString("utf8"));
    assert.equal(output.ok, true);
    assert.equal(output.validator_type, "NODE_SEMANTIC_CROSS_RECORD");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI는 잘못된 UTF-8을 대체문자로 삼키지 않고 기계 JSON 오류로 차단한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reverse-evidence-invalid-utf8-"));
  const inputPath = join(directory, "invalid-utf8.json");
  try {
    await writeFile(inputPath, Buffer.from([0x7b, 0xff, 0x7d]));
    const result = await runCli(inputPath);

    assert.equal(result.code, 2);
    assert.equal(result.stderr.length, 0);
    assert.notDeepEqual([...result.stdout.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const outputText = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
    assert.doesNotMatch(outputText, /\uFFFD/u);
    const output = JSON.parse(outputText);
    assert.equal(output.ok, false);
    assert.equal(output.errors[0].code, "CLI_INPUT_INVALID");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("새 실행 소스와 JSON fixture는 저장소 정책대로 UTF-8 무BOM이다", async () => {
  const paths = [
    validatorPath,
    fileURLToPath(import.meta.url),
    join(fixtureDirectory, "valid-ready.semantic.json"),
    join(fixtureDirectory, "invalid-same-upstream.semantic.json"),
    join(fixtureDirectory, "invalid-unopened-search-summary.semantic.json"),
    join(fixtureDirectory, "valid-scoped-exception.semantic.json")
  ];

  for (const path of paths) {
    const bytes = await readFile(path);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], path);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
});
