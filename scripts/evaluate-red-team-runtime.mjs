#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VECTOR_STATUS = "NOT_RUN";
const EXECUTION_STATUSES = new Set(["COMPLETED", "RATE_LIMITED", "NOT_RUN"]);
const RESULT_STATUSES = new Set(["PASS", "FAIL", "RATE_LIMITED", "NOT_RUN"]);
const MUST_KINDS = new Set([
  "contains_all",
  "contains_any",
  "regex",
  "char_count_range",
  "numbered_item_count"
]);
const MUST_NOT_KINDS = new Set(["contains_any", "regex"]);

function decodeUtf8(bytes, path) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${path}의 UTF-8 디코딩에 실패했습니다: ${error.message}`);
  }
  text = text.replace(/^\uFEFF/u, "");
  invariant(!/[\u0080-\u009F\uFFFD]/u.test(text), `${path}에 C1 제어문자 또는 UTF-8 대체문자가 있습니다.`);
  invariant(!text.includes("\uFEFF"), `${path}의 시작 이외 위치에 BOM 문자가 있습니다.`);
  return text;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeForMatch(value, caseSensitive = false) {
  const normalized = String(value).normalize("NFKC");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase("ko-KR");
}

function validateStringArray(value, field) {
  invariant(Array.isArray(value) && value.length > 0, `${field}는 비어 있지 않은 배열이어야 합니다.`);
  for (const item of value) invariant(isNonEmptyString(item), `${field}에는 빈 문자열을 넣을 수 없습니다.`);
}

function compileCriterionRegex(criterion, field) {
  invariant(isNonEmptyString(criterion.pattern), `${field}.pattern이 필요합니다.`);
  const flags = criterion.flags ?? "u";
  invariant(/^(?!.*(.).*\1)[imu]*$/u.test(flags), `${field}.flags에는 i, m, u만 중복 없이 사용할 수 있습니다.`);
  return new RegExp(criterion.pattern, flags);
}

function validateCriterion(criterion, field, allowedKinds) {
  invariant(criterion && typeof criterion === "object" && !Array.isArray(criterion), `${field}는 객체여야 합니다.`);
  invariant(isNonEmptyString(criterion.id), `${field}.id가 필요합니다.`);
  invariant(allowedKinds.has(criterion.kind), `${field}.kind가 허용되지 않았습니다: ${criterion.kind}`);
  invariant(isNonEmptyString(criterion.reason), `${field}.reason이 필요합니다.`);

  if (["contains_all", "contains_any"].includes(criterion.kind)) {
    validateStringArray(criterion.terms, `${field}.terms`);
  } else if (criterion.kind === "regex") {
    compileCriterionRegex(criterion, field);
  } else if (criterion.kind === "char_count_range") {
    invariant(Number.isInteger(criterion.min) && criterion.min >= 0, `${field}.min은 0 이상의 정수여야 합니다.`);
    invariant(Number.isInteger(criterion.max) && criterion.max >= criterion.min, `${field}.max는 min 이상의 정수여야 합니다.`);
  } else if (criterion.kind === "numbered_item_count") {
    invariant(Number.isInteger(criterion.exact) && criterion.exact >= 0, `${field}.exact는 0 이상의 정수여야 합니다.`);
  }
}

function validateVector(vector, index, knownSourceIds) {
  const field = `vectors[${index}]`;
  invariant(vector && typeof vector === "object" && !Array.isArray(vector), `${field}는 객체여야 합니다.`);
  for (const key of ["id", "category", "title", "learner_profile", "expected_policy", "status"]) {
    invariant(isNonEmptyString(vector[key]), `${field}.${key}가 필요합니다.`);
  }
  invariant(/^RTV-\d{3}$/u.test(vector.id), `${field}.id 형식이 잘못되었습니다: ${vector.id}`);
  invariant(vector.status === VECTOR_STATUS, `${vector.id}의 저장 상태는 NOT_RUN이어야 합니다.`);
  invariant(vector.live_call === false, `${vector.id}는 라이브 호출 벡터로 저장할 수 없습니다.`);
  invariant(Array.isArray(vector.turns) && vector.turns.length > 0, `${vector.id}.turns가 필요합니다.`);
  for (const [turnIndex, turn] of vector.turns.entries()) {
    invariant(["user", "assistant"].includes(turn?.role), `${vector.id}.turns[${turnIndex}].role이 잘못되었습니다.`);
    invariant(isNonEmptyString(turn?.content), `${vector.id}.turns[${turnIndex}].content가 필요합니다.`);
  }
  validateStringArray(vector.source_ids, `${vector.id}.source_ids`);
  for (const sourceId of vector.source_ids) {
    invariant(knownSourceIds.has(sourceId), `${vector.id}가 등록되지 않은 source_id를 참조합니다: ${sourceId}`);
  }
  invariant(Array.isArray(vector.must) && vector.must.length > 0, `${vector.id}.must가 필요합니다.`);
  invariant(Array.isArray(vector.must_not) && vector.must_not.length > 0, `${vector.id}.must_not이 필요합니다.`);
  invariant(Array.isArray(vector.human_review) && vector.human_review.length > 0, `${vector.id}.human_review가 필요합니다.`);

  const criterionIds = [];
  vector.must.forEach((criterion, criterionIndex) => {
    validateCriterion(criterion, `${vector.id}.must[${criterionIndex}]`, MUST_KINDS);
    criterionIds.push(criterion.id);
  });
  vector.must_not.forEach((criterion, criterionIndex) => {
    validateCriterion(criterion, `${vector.id}.must_not[${criterionIndex}]`, MUST_NOT_KINDS);
    criterionIds.push(criterion.id);
  });
  for (const [reviewIndex, review] of vector.human_review.entries()) {
    invariant(review && typeof review === "object" && !Array.isArray(review), `${vector.id}.human_review[${reviewIndex}]는 객체여야 합니다.`);
    invariant(isNonEmptyString(review.id), `${vector.id}.human_review[${reviewIndex}].id가 필요합니다.`);
    invariant(isNonEmptyString(review.question), `${vector.id}.human_review[${reviewIndex}].question이 필요합니다.`);
    criterionIds.push(review.id);
  }
  invariant(new Set(criterionIds).size === criterionIds.length, `${vector.id}의 판정 기준 ID가 중복되었습니다.`);
}

function evaluateCriterion(response, criterion, negative = false) {
  const caseSensitive = criterion.case_sensitive === true;
  const haystack = normalizeForMatch(response, caseSensitive);
  let matched;

  if (["contains_all", "contains_any"].includes(criterion.kind)) {
    const matches = criterion.terms.map((term) => haystack.includes(normalizeForMatch(term, caseSensitive)));
    matched = criterion.kind === "contains_all" ? matches.every(Boolean) : matches.some(Boolean);
  } else if (criterion.kind === "regex") {
    matched = compileCriterionRegex(criterion, criterion.id).test(response.normalize("NFKC"));
  } else if (criterion.kind === "char_count_range") {
    const count = [...response].length;
    matched = count >= criterion.min && count <= criterion.max;
  } else if (criterion.kind === "numbered_item_count") {
    const count = response.split(/\r?\n/u).filter((line) => /^\s*\d+[.)]\s+/u.test(line)).length;
    matched = count === criterion.exact;
  } else {
    throw new Error(`실행할 수 없는 판정 기준입니다: ${criterion.kind}`);
  }

  const passed = negative ? !matched : matched;
  return { id: criterion.id, passed, reason: criterion.reason };
}

function validateObservation(observation, vectorIds, index) {
  const field = `observations[${index}]`;
  invariant(observation && typeof observation === "object" && !Array.isArray(observation), `${field}는 객체여야 합니다.`);
  invariant(vectorIds.has(observation.id), `${field}.id가 등록된 벡터가 아닙니다: ${observation.id}`);
  invariant(EXECUTION_STATUSES.has(observation.execution_status), `${observation.id}.execution_status가 잘못되었습니다.`);
  if (observation.execution_status === "COMPLETED") {
    invariant(isNonEmptyString(observation.response), `${observation.id}의 COMPLETED 관측에는 response가 필요합니다.`);
  } else {
    invariant(!isNonEmptyString(observation.response), `${observation.id}의 ${observation.execution_status} 관측에는 response를 넣을 수 없습니다.`);
  }
  if (observation.execution_status === "RATE_LIMITED") {
    invariant(isNonEmptyString(observation.evidence), `${observation.id}의 RATE_LIMITED 관측에는 제한 신호 증거가 필요합니다.`);
  }
  if (observation.human_review !== undefined) {
    invariant(Array.isArray(observation.human_review), `${observation.id}.human_review는 배열이어야 합니다.`);
    const reviewIds = new Set();
    for (const review of observation.human_review) {
      invariant(isNonEmptyString(review?.id), `${observation.id}.human_review 항목 ID가 필요합니다.`);
      invariant(!reviewIds.has(review.id), `${observation.id}.human_review ID가 중복되었습니다: ${review.id}`);
      reviewIds.add(review.id);
      invariant(["PASS", "FAIL"].includes(review?.decision), `${observation.id}.human_review 결정은 PASS 또는 FAIL이어야 합니다.`);
      invariant(isNonEmptyString(review?.notes), `${observation.id}.human_review에는 검토 메모가 필요합니다.`);
    }
  }
}

export async function loadJson(path) {
  return JSON.parse(decodeUtf8(await readFile(path), path));
}

export async function loadJsonl(path) {
  const text = decodeUtf8(await readFile(path), path);
  return text.split(/\r?\n/u).flatMap((line, index) => {
    if (line.trim().length === 0) return [];
    try {
      return [JSON.parse(line)];
    } catch (error) {
      throw new Error(`${path}:${index + 1} JSONL 파싱 실패: ${error.message}`);
    }
  });
}

export async function loadSourceIds(sourceMapPath) {
  const sourceMap = await loadJson(sourceMapPath);
  invariant(sourceMap.version === "1.0.0", `${sourceMapPath}.version은 1.0.0이어야 합니다.`);
  invariant(sourceMap.kind === "offline-runtime-vector-provenance-not-live-results", `${sourceMapPath}.kind가 잘못되었습니다.`);
  invariant(/^\d{4}-\d{2}-\d{2}$/u.test(sourceMap.as_of), `${sourceMapPath}.as_of가 YYYY-MM-DD 형식이 아닙니다.`);
  invariant(isNonEmptyString(sourceMap.project_root), `${sourceMapPath}.project_root가 필요합니다.`);
  const projectRoot = resolve(dirname(sourceMapPath), sourceMap.project_root);
  const sourceIds = new Set();
  for (const source of sourceMap.local_sources ?? []) {
    invariant(isNonEmptyString(source?.id), `${sourceMapPath}의 local_sources ID가 필요합니다.`);
    invariant(isNonEmptyString(source?.path), `${source.id}.path가 필요합니다.`);
    invariant(isNonEmptyString(source?.supports), `${source.id}.supports가 필요합니다.`);
    invariant(isNonEmptyString(source?.limits), `${source.id}.limits가 필요합니다.`);
    invariant(!sourceIds.has(source.id), `중복 source_id: ${source.id}`);
    const absolutePath = resolve(projectRoot, source.path);
    const pathFromRoot = relative(projectRoot, absolutePath);
    invariant(pathFromRoot !== ".." && !pathFromRoot.startsWith(`..\\`) && !pathFromRoot.startsWith("../") && !isAbsolute(pathFromRoot), `${source.id}.path가 프로젝트 경계를 벗어납니다.`);
    const localText = decodeUtf8(await readFile(absolutePath), absolutePath);
    if (isNonEmptyString(source.anchor)) {
      invariant(localText.includes(source.anchor), `${source.id}.anchor가 실제 파일에 없습니다: ${source.anchor}`);
    }
    sourceIds.add(source.id);
  }
  for (const importedPath of sourceMap.imports ?? []) {
    invariant(isNonEmptyString(importedPath), `${sourceMapPath}의 import 경로가 잘못되었습니다.`);
    const imported = await loadJson(resolve(dirname(sourceMapPath), importedPath));
    invariant(isNonEmptyString(imported.version), `${importedPath}.version이 필요합니다.`);
    invariant(isNonEmptyString(imported.kind), `${importedPath}.kind가 필요합니다.`);
    for (const source of imported.sources ?? []) {
      invariant(isNonEmptyString(source?.id), `${importedPath}의 source ID가 필요합니다.`);
      invariant(isNonEmptyString(source?.supports), `${source.id}.supports가 필요합니다.`);
      invariant(isNonEmptyString(source?.limits), `${source.id}.limits가 필요합니다.`);
      invariant(!sourceIds.has(source.id), `중복 source_id: ${source.id}`);
      sourceIds.add(source.id);
    }
  }
  return sourceIds;
}

export async function loadAndValidateVectors(vectorPath, sourceMapPath) {
  const sourceIds = await loadSourceIds(sourceMapPath);
  const vectors = await loadJsonl(vectorPath);
  const ids = new Set();
  vectors.forEach((vector, index) => {
    validateVector(vector, index, sourceIds);
    invariant(!ids.has(vector.id), `중복 RED-TEAM 벡터 ID: ${vector.id}`);
    ids.add(vector.id);
  });
  return vectors;
}

export function evaluateVector(vector, observation) {
  if (!observation || observation.execution_status === "NOT_RUN") {
    return {
      id: vector.id,
      status: "NOT_RUN",
      automated_status: "NOT_RUN",
      reason: "응답 관측이 실행되지 않았습니다.",
      checks: []
    };
  }
  if (observation.execution_status === "RATE_LIMITED") {
    return {
      id: vector.id,
      status: "RATE_LIMITED",
      automated_status: "NOT_RUN",
      reason: "플랫폼 요청 제한 신호가 관측되었습니다. 원문 증거는 보고서에 재출력하지 않습니다.",
      checks: []
    };
  }

  const checks = [
    ...vector.must.map((criterion) => evaluateCriterion(observation.response, criterion, false)),
    ...vector.must_not.map((criterion) => evaluateCriterion(observation.response, criterion, true))
  ];
  if (checks.some((check) => !check.passed)) {
    return {
      id: vector.id,
      status: "FAIL",
      automated_status: "FAIL",
      reason: "자동 판정 기준을 충족하지 못했습니다.",
      checks
    };
  }

  const reviews = new Map((observation.human_review ?? []).map((review) => [review.id, review]));
  const unknownReviewIds = [...reviews.keys()].filter((id) => !vector.human_review.some((review) => review.id === id));
  invariant(unknownReviewIds.length === 0, `${vector.id}에 등록되지 않은 human_review ID: ${unknownReviewIds.join(", ")}`);
  const missingReviewIds = vector.human_review.map((review) => review.id).filter((id) => !reviews.has(id));
  if (missingReviewIds.length > 0) {
    return {
      id: vector.id,
      status: "NOT_RUN",
      automated_status: "PASS",
      reason: `사람 검토 미실행: ${missingReviewIds.join(", ")}`,
      checks
    };
  }
  const failedReviews = [...reviews.values()].filter((review) => review.decision === "FAIL");
  if (failedReviews.length > 0) {
    return {
      id: vector.id,
      status: "FAIL",
      automated_status: "PASS",
      reason: `사람 검토 실패: ${failedReviews.map((review) => review.id).join(", ")}`,
      checks
    };
  }
  return {
    id: vector.id,
    status: "PASS",
    automated_status: "PASS",
    reason: "자동 판정과 필수 사람 검토가 모두 통과했습니다.",
    checks
  };
}

export function evaluateSuite(vectors, observations = []) {
  const vectorIds = new Set(vectors.map((vector) => vector.id));
  const observationById = new Map();
  observations.forEach((observation, index) => {
    validateObservation(observation, vectorIds, index);
    invariant(!observationById.has(observation.id), `중복 observation ID: ${observation.id}`);
    observationById.set(observation.id, observation);
  });
  const results = vectors.map((vector) => evaluateVector(vector, observationById.get(vector.id)));
  const counts = Object.fromEntries([...RESULT_STATUSES].map((status) => [status, results.filter((result) => result.status === status).length]));
  return {
    kind: "offline-red-team-runtime-evaluation",
    live_calls_performed: false,
    counts,
    results
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  invariant(index + 1 < process.argv.length, `${name} 뒤에 경로가 필요합니다.`);
  return process.argv[index + 1];
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const vectorPath = resolve(root, argumentValue("--vectors") ?? "tests/red-team-runtime-vectors.jsonl");
  const sourceMapPath = resolve(root, argumentValue("--sources") ?? "tests/red-team-runtime-source-map.json");
  const observationArgument = argumentValue("--observations");
  const observationPath = observationArgument ? (isAbsolute(observationArgument) ? observationArgument : resolve(root, observationArgument)) : undefined;
  const vectors = await loadAndValidateVectors(vectorPath, sourceMapPath);
  const observations = observationPath ? await loadJsonl(observationPath) : [];
  const report = evaluateSuite(vectors, observations);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.counts.FAIL > 0) process.exitCode = 1;
  else if (report.counts.RATE_LIMITED > 0 || report.counts.NOT_RUN > 0) process.exitCode = 2;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
