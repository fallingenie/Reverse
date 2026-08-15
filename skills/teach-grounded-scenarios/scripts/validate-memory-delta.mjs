#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(scriptDirectory, "..", "schemas", "memory-delta.schema.json");

const allowedAddPaths = new Set([
  "/memory/current_state/constraints/-",
  "/memory/open_threads/-",
  "/memory/episode_archive/-",
  "/memory/conflicts/-"
]);

const protectedIdPrefix = /^(?:CAN|FACT|NEG|SRC|SOURCE|VER|DER|SCN|UNK|EVD|EVIDENCE|T0|T1)-/u;
const recordIdPattern = /^[A-Z][A-Z0-9-]{2,80}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const unsafeTextPattern = /[\u0080-\u009F\u202A-\u202E\u2066-\u2069\uFEFF\uFFFD]/u;
const windows1252ByteByCharacter = new Map([
  ["\u20AC", 0x80], ["\u201A", 0x82], ["\u0192", 0x83], ["\u201E", 0x84],
  ["\u2026", 0x85], ["\u2020", 0x86], ["\u2021", 0x87], ["\u02C6", 0x88],
  ["\u2030", 0x89], ["\u0160", 0x8A], ["\u2039", 0x8B], ["\u0152", 0x8C],
  ["\u017D", 0x8E], ["\u2018", 0x91], ["\u2019", 0x92], ["\u201C", 0x93],
  ["\u201D", 0x94], ["\u2022", 0x95], ["\u2013", 0x96], ["\u2014", 0x97],
  ["\u02DC", 0x98], ["\u2122", 0x99], ["\u0161", 0x9A], ["\u203A", 0x9B],
  ["\u0153", 0x9C], ["\u017E", 0x9E], ["\u0178", 0x9F]
]);
const acceptedDecisions = new Set([
  "APPLIED",
  "RESTART_ACCEPTED",
  "RESTART_DECLINED",
  "ALTERNATE_FICTION"
]);
const contextKeys = new Set([
  "session_revision",
  "known_record_ids",
  "evidence_records",
  "provenance_records",
  "checkpoint_records",
  "approved_corrections",
  "protected_target_ids",
  "resolvable_ids"
]);

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function correctionApprovalSha256(baseRevision, correction) {
  return createHash("sha256")
    .update(canonicalJson({ base_revision: baseRevision, correction }), "utf8")
    .digest("hex");
}

function canonicalIdentifier(value) {
  return value.normalize("NFKC").toUpperCase();
}

function hasDuplicateIdentifiers(values) {
  const canonical = values.map(canonicalIdentifier);
  return new Set(canonical).size !== canonical.length;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional = []) {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        return true;
      }
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function windows1252Byte(character) {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 0xFF && !(codePoint >= 0x80 && codePoint <= 0x9F)) {
    return codePoint;
  }
  return windows1252ByteByCharacter.get(character) ?? null;
}

function containsLikelyUtf8Mojibake(value) {
  const characters = [...value];
  for (let index = 0; index < characters.length; index += 1) {
    const first = windows1252Byte(characters[index]);
    const length = first >= 0xC2 && first <= 0xDF
      ? 2
      : first >= 0xE0 && first <= 0xEF
        ? 3
        : first >= 0xF0 && first <= 0xF4
          ? 4
          : 0;
    if (length === 0 || index + length > characters.length) {
      continue;
    }
    const bytes = characters.slice(index, index + length).map(windows1252Byte);
    if (bytes.some((byte, byteIndex) => byte === null || (byteIndex > 0 && (byte < 0x80 || byte > 0xBF)))) {
      continue;
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
      return true;
    } catch {
      // 유효하지 않은 UTF-8 바이트열은 이중 디코딩 흔적으로 판정하지 않는다.
    }
  }
  return false;
}

function contextIdentifierSet(context, key) {
  if (!Array.isArray(context[key]) || context[key].some((id) => typeof id !== "string")) {
    return null;
  }
  return new Set(context[key].map(canonicalIdentifier));
}

function contextRecordMap(context, key) {
  if (!Array.isArray(context[key])) {
    return null;
  }
  const records = new Map();
  for (const record of context[key]) {
    if (!isPlainObject(record) || typeof record.id !== "string") {
      return null;
    }
    records.set(canonicalIdentifier(record.id), record);
  }
  return records;
}

function scanTextIntegrity(value, issues, location = "$", state = { nodes: 0, seen: new WeakSet() }, depth = 0) {
  if (depth > 64) {
    pushIssue(issues, "INPUT_DEPTH_LIMIT", "기억 델타와 문맥의 중첩 깊이가 64단계를 초과합니다.", location);
    return;
  }
  state.nodes += 1;
  if (state.nodes > 10000) {
    pushIssue(issues, "INPUT_NODE_LIMIT", "기억 델타와 문맥의 전체 노드 수가 10,000개를 초과합니다.", location);
    return;
  }
  if (typeof value === "string") {
    if (value.length > 10000) {
      pushIssue(issues, "INPUT_STRING_LIMIT", "문자열 하나의 길이가 10,000자를 초과합니다.", location);
    }
    if (unsafeTextPattern.test(value) || containsLoneSurrogate(value) || containsLikelyUtf8Mojibake(value)) {
      pushIssue(issues, "TEXT_INTEGRITY", "대체 문자, C1 제어문자, 중간 BOM, 방향 제어문자, 단독 surrogate 또는 UTF-8 이중 디코딩 흔적을 포함할 수 없습니다.", location);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (state.seen.has(value)) {
      pushIssue(issues, "INPUT_CYCLE", "순환 참조 객체는 JSON 기억 델타가 아닙니다.", location);
      return;
    }
    state.seen.add(value);
    for (const [index, item] of value.entries()) {
      scanTextIntegrity(item, issues, `${location}[${index}]`, state, depth + 1);
    }
    return;
  }
  if (isPlainObject(value)) {
    if (state.seen.has(value)) {
      pushIssue(issues, "INPUT_CYCLE", "순환 참조 객체는 JSON 기억 델타가 아닙니다.", location);
      return;
    }
    state.seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      scanTextIntegrity(key, issues, `${location}.<key>`, state, depth + 1);
      scanTextIntegrity(item, issues, `${location}.${key}`, state, depth + 1);
    }
  }
}

function pushIssue(issues, code, message, location = "$") {
  issues.push({ code, location, message });
}

export function assertNoDuplicateJsonKeys(source, label = "JSON 입력") {
  const stack = [];
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      index += 1;
      continue;
    }
    if (character === "[") {
      stack.push({ type: "array" });
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      index += 1;
      continue;
    }
    if (character === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") {
        current.expectingKey = true;
      }
      index += 1;
      continue;
    }
    if (character !== "\"") {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const stringCharacter = source[index];
      if (escaped) {
        escaped = false;
      } else if (stringCharacter === "\\") {
        escaped = true;
      } else if (stringCharacter === "\"") {
        index += 1;
        break;
      }
      index += 1;
    }
    const current = stack.at(-1);
    if (current?.type !== "object" || current.expectingKey !== true) {
      continue;
    }
    let lookahead = index;
    while (lookahead < source.length && /\s/u.test(source[lookahead])) {
      lookahead += 1;
    }
    if (source[lookahead] !== ":") {
      continue;
    }
    const rawKey = source.slice(start, index);
    const key = JSON.parse(rawKey);
    if (current.keys.has(key)) {
      throw new SyntaxError(`${label}에 중복 객체 키가 있습니다: ${key}`);
    }
    current.keys.add(key);
    current.expectingKey = false;
  }
}

export function parseJsonWithOptionalBom(source, label = "JSON 입력") {
  if (typeof source !== "string") {
    throw new TypeError(`${label}은 문자열이어야 합니다.`);
  }
  if (Buffer.byteLength(source, "utf8") > 1000000) {
    throw new RangeError(`${label}이 1,000,000바이트 제한을 초과합니다.`);
  }
  const normalized = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (normalized.includes("\uFEFF")) {
    throw new SyntaxError(`${label}에 선두 이외의 BOM 문자가 있습니다.`);
  }
  assertNoDuplicateJsonKeys(normalized, label);
  return JSON.parse(normalized);
}

export function decodeJsonPointer(pointer) {
  if (typeof pointer !== "string" || pointer === "" || !pointer.startsWith("/")) {
    throw new SyntaxError("JSON Pointer는 /로 시작하는 비어 있지 않은 문자열이어야 합니다.");
  }
  return pointer.slice(1).split("/").map((token) => {
    if (/~(?:[^01]|$)/u.test(token)) {
      throw new SyntaxError(`잘못된 JSON Pointer escape: ${pointer}`);
    }
    return token.replaceAll("~1", "/").replaceAll("~0", "~");
  });
}

function validateContext(context, issues) {
  if (!isPlainObject(context)) {
    pushIssue(issues, "CONTEXT_TYPE", "검증 문맥은 객체여야 합니다.", "$context");
    return;
  }
  for (const key of Object.keys(context)) {
    if (!contextKeys.has(key)) {
      pushIssue(issues, "CONTEXT_UNKNOWN_KEY", `허용되지 않은 검증 문맥 필드입니다: ${key}`, `$context.${key}`);
    }
  }
  if (!Number.isSafeInteger(context.session_revision) || context.session_revision < 0) {
    pushIssue(issues, "CONTEXT_REVISION_REQUIRED", "session_revision은 필수이며 0 이상의 안전한 정수여야 합니다.", "$context.session_revision");
  }
  for (const key of [
    "known_record_ids",
    "protected_target_ids",
    "resolvable_ids"
  ]) {
    if (key !== "known_record_ids" && context[key] === undefined) {
      continue;
    }
    if (!Array.isArray(context[key]) || context[key].some((id) => typeof id !== "string" || !recordIdPattern.test(id))) {
      pushIssue(issues, "CONTEXT_ID_LIST", `${key}는 안전한 레코드 ID 배열이어야 합니다.`, `$context.${key}`);
    } else if (hasDuplicateIdentifiers(context[key])) {
      pushIssue(issues, "CONTEXT_DUPLICATE_ID", `${key}에 대소문자·정규화 기준 중복 ID가 있습니다.`, `$context.${key}`);
    }
  }

  if (!Array.isArray(context.evidence_records)) {
    pushIssue(issues, "CONTEXT_EVIDENCE_RECORDS_REQUIRED", "evidence_records는 필수 배열입니다.", "$context.evidence_records");
  } else {
    const ids = [];
    for (const [index, record] of context.evidence_records.entries()) {
      if (!exactKeys(record, ["id", "status"])
        || !recordIdPattern.test(record.id)
        || !["VERIFIED", "DERIVED", "SCENARIO", "UNKNOWN"].includes(record.status)) {
        pushIssue(issues, "CONTEXT_EVIDENCE_RECORD", "evidence record는 안전한 id와 허용된 status만 가져야 합니다.", `$context.evidence_records[${index}]`);
      } else {
        ids.push(record.id);
      }
    }
    if (hasDuplicateIdentifiers(ids)) {
      pushIssue(issues, "CONTEXT_DUPLICATE_EVIDENCE", "evidence_records에 중복 ID가 있습니다.", "$context.evidence_records");
    }
  }

  if (context.provenance_records !== undefined) {
    if (!Array.isArray(context.provenance_records)) {
      pushIssue(issues, "CONTEXT_PROVENANCE_RECORDS", "provenance_records는 배열이어야 합니다.", "$context.provenance_records");
    } else {
      const identities = [];
      for (const [index, record] of context.provenance_records.entries()) {
        if (!exactKeys(record, ["kind", "ref", "content_sha256"])
          || !["SOURCE", "PDF_CHUNK", "TURN", "SYSTEM_RULE"].includes(record.kind)
          || !recordIdPattern.test(record.ref)
          || (record.content_sha256 !== null && !sha256Pattern.test(record.content_sha256))) {
          pushIssue(issues, "CONTEXT_PROVENANCE_RECORD", "provenance record의 kind, ref, content_sha256이 유효해야 합니다.", `$context.provenance_records[${index}]`);
        } else {
          identities.push(`${record.kind}:${record.ref}`);
        }
      }
      if (new Set(identities).size !== identities.length) {
        pushIssue(issues, "CONTEXT_DUPLICATE_PROVENANCE", "provenance_records에 중복 kind/ref가 있습니다.", "$context.provenance_records");
      }
    }
  }

  if (context.checkpoint_records !== undefined) {
    if (!Array.isArray(context.checkpoint_records)) {
      pushIssue(issues, "CONTEXT_CHECKPOINT_RECORDS", "checkpoint_records는 배열이어야 합니다.", "$context.checkpoint_records");
    } else {
      const ids = [];
      for (const [index, record] of context.checkpoint_records.entries()) {
        if (!exactKeys(record, ["id", "revision"])
          || !/^EP-[A-Z0-9-]{3,76}$/u.test(record.id)
          || !Number.isSafeInteger(record.revision)
          || record.revision < 0) {
          pushIssue(issues, "CONTEXT_CHECKPOINT_RECORD", "checkpoint record는 EP ID와 안전한 revision을 가져야 합니다.", `$context.checkpoint_records[${index}]`);
        } else {
          ids.push(record.id);
        }
      }
      if (hasDuplicateIdentifiers(ids)) {
        pushIssue(issues, "CONTEXT_DUPLICATE_CHECKPOINT", "checkpoint_records에 중복 ID가 있습니다.", "$context.checkpoint_records");
      }
    }
  }

  if (context.approved_corrections !== undefined) {
    if (!Array.isArray(context.approved_corrections)) {
      pushIssue(issues, "CONTEXT_APPROVAL_RECORDS", "approved_corrections는 배열이어야 합니다.", "$context.approved_corrections");
    } else {
      const ids = [];
      for (const [index, record] of context.approved_corrections.entries()) {
        if (!exactKeys(record, ["correction_id", "decision", "content_sha256", "user_decision_ref"])
          || !/^COR-[A-Z0-9-]{4,76}$/u.test(record.correction_id)
          || !acceptedDecisions.has(record.decision)
          || !sha256Pattern.test(record.content_sha256)
          || !recordIdPattern.test(record.user_decision_ref)) {
          pushIssue(issues, "CONTEXT_APPROVAL_RECORD", "승인 레코드는 교정 ID·결정·결합 해시·사용자 결정 참조를 가져야 합니다.", `$context.approved_corrections[${index}]`);
        } else {
          ids.push(record.correction_id);
        }
      }
      if (hasDuplicateIdentifiers(ids)) {
        pushIssue(issues, "CONTEXT_DUPLICATE_APPROVAL", "approved_corrections에 중복 교정 ID가 있습니다.", "$context.approved_corrections");
      }
    }
  }

  const knownRecords = contextIdentifierSet(context, "known_record_ids");
  if (knownRecords !== null) {
    for (const record of Array.isArray(context.evidence_records) ? context.evidence_records : []) {
      if (isPlainObject(record) && typeof record.id === "string" && !knownRecords.has(canonicalIdentifier(record.id))) {
        pushIssue(issues, "CONTEXT_EVIDENCE_NOT_IN_LEDGER", `evidence record가 known_record_ids에 없습니다: ${record.id}`, "$context.evidence_records");
      }
    }
    for (const record of Array.isArray(context.provenance_records) ? context.provenance_records : []) {
      if (isPlainObject(record) && typeof record.ref === "string" && !knownRecords.has(canonicalIdentifier(record.ref))) {
        pushIssue(issues, "CONTEXT_PROVENANCE_NOT_IN_LEDGER", `provenance record가 known_record_ids에 없습니다: ${record.ref}`, "$context.provenance_records");
      }
    }
    for (const record of Array.isArray(context.checkpoint_records) ? context.checkpoint_records : []) {
      if (isPlainObject(record) && typeof record.id === "string" && !knownRecords.has(canonicalIdentifier(record.id))) {
        pushIssue(issues, "CONTEXT_CHECKPOINT_NOT_IN_LEDGER", `checkpoint record가 known_record_ids에 없습니다: ${record.id}`, "$context.checkpoint_records");
      }
    }
    for (const record of Array.isArray(context.approved_corrections) ? context.approved_corrections : []) {
      if (isPlainObject(record)
        && typeof record.user_decision_ref === "string"
        && !knownRecords.has(canonicalIdentifier(record.user_decision_ref))) {
        pushIssue(issues, "CONTEXT_DECISION_NOT_IN_LEDGER", `사용자 결정 provenance가 known_record_ids에 없습니다: ${record.user_decision_ref}`, "$context.approved_corrections");
      }
    }
    for (const id of Array.isArray(context.resolvable_ids) ? context.resolvable_ids : []) {
      if (typeof id === "string" && !knownRecords.has(canonicalIdentifier(id))) {
        pushIssue(issues, "CONTEXT_RESOLVABLE_NOT_IN_LEDGER", `resolvable ID가 known_record_ids에 없습니다: ${id}`, "$context.resolvable_ids");
      }
    }
  }
}

function validateAddValue(operation, index, context, issues) {
  const location = `$.add[${index}]`;
  let decoded;
  try {
    decoded = decodeJsonPointer(operation.path);
  } catch (error) {
    pushIssue(issues, "POINTER_ESCAPE", error.message, `${location}.path`);
    return;
  }
  const normalizedPath = `/${decoded.map((token) => token.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
  if (normalizedPath !== operation.path || !allowedAddPaths.has(operation.path)) {
    pushIssue(issues, "PATH_NOT_ALLOWED", "기억 델타의 add는 T2/T3 추가 전용 허용 경로만 사용할 수 있습니다.", `${location}.path`);
    return;
  }
  if (!nonEmptyText(operation.reason)) {
    pushIssue(issues, "EMPTY_REASON", "add 이유는 공백이 아닌 문장이어야 합니다.", `${location}.reason`);
  }

  if (operation.path === "/memory/current_state/constraints/-" || operation.path === "/memory/conflicts/-") {
    if (!nonEmptyText(operation.value)) {
      pushIssue(issues, "ADD_VALUE_TYPE", "현재 제약 또는 충돌 추가 값은 비어 있지 않은 문자열이어야 합니다.", `${location}.value`);
    }
    return;
  }

  if (operation.path === "/memory/open_threads/-") {
    if (!exactKeys(operation.value, ["id", "text", "must_keep"])) {
      pushIssue(issues, "OPEN_THREAD_SHAPE", "미해결 항목은 id, text, must_keep만 가진 객체여야 합니다.", `${location}.value`);
      return;
    }
    if (!/^OPEN-[A-Z0-9-]{3,75}$/u.test(operation.value.id)
      || !nonEmptyText(operation.value.text)
      || operation.value.must_keep !== true) {
      pushIssue(issues, "OPEN_THREAD_VALUE", "미해결 항목은 안전한 OPEN ID, 설명, must_keep=true가 필요합니다.", `${location}.value`);
    }
    return;
  }

  if (!exactKeys(
    operation.value,
    ["id", "turn", "student_choice", "result", "evidence_ids", "must_keep"],
    ["detail"]
  )) {
    pushIssue(issues, "EPISODE_SHAPE", "에피소드 추가 값의 필드가 계약과 다릅니다.", `${location}.value`);
    return;
  }
  const episode = operation.value;
  if (!/^EP-[A-Z0-9-]{3,76}$/u.test(episode.id)
    || !Number.isSafeInteger(episode.turn)
    || episode.turn < 1
    || !nonEmptyText(episode.student_choice)
    || !nonEmptyText(episode.result)
    || episode.must_keep !== true) {
    pushIssue(issues, "EPISODE_VALUE", "에피소드에는 안전한 ID·턴·학생 선택·결과와 must_keep=true가 필요합니다.", `${location}.value`);
  }
  if (!Array.isArray(episode.evidence_ids)
    || episode.evidence_ids.some((id) => typeof id !== "string" || !recordIdPattern.test(id))
    || hasDuplicateIdentifiers(episode.evidence_ids)) {
    pushIssue(issues, "EPISODE_EVIDENCE", "에피소드 evidence_ids는 중복 없는 안전한 ID 배열이어야 합니다.", `${location}.value.evidence_ids`);
  } else if (episode.evidence_ids.length > 0) {
    const knownEvidence = contextRecordMap(context, "evidence_records");
    if (knownEvidence === null) {
      pushIssue(issues, "EPISODE_EVIDENCE_CONTEXT_REQUIRED", "근거를 참조하는 에피소드를 검증하려면 evidence_records 문맥이 필요합니다.", "$context.evidence_records");
    } else {
      for (const evidenceId of episode.evidence_ids) {
        if (!knownEvidence.has(canonicalIdentifier(evidenceId))) {
          pushIssue(issues, "EPISODE_UNKNOWN_EVIDENCE", `존재가 확인되지 않은 에피소드 근거입니다: ${evidenceId}`, `${location}.value.evidence_ids`);
        }
      }
    }
  }
  if (episode.detail !== undefined && typeof episode.detail !== "string") {
    pushIssue(issues, "EPISODE_DETAIL", "에피소드 detail은 문자열이어야 합니다.", `${location}.value.detail`);
  }
}

function validateCorrection(correction, index, delta, context, issues) {
  const location = `$.correct[${index}]`;
  const provenanceIdentities = correction.provenance.map((entry) => `${entry.kind}:${canonicalIdentifier(entry.ref)}`);
  if (new Set(provenanceIdentities).size !== provenanceIdentities.length) {
    pushIssue(issues, "DUPLICATE_PROVENANCE", "같은 kind/ref provenance를 한 교정에 중복 연결할 수 없습니다.", `${location}.provenance`);
  }
  const evidenceRefs = correction.provenance
    .filter((entry) => entry.kind === "EVIDENCE")
    .map((entry) => entry.ref);
  const evidenceIds = new Set(correction.evidence_ids.map(canonicalIdentifier));
  if (evidenceRefs.length === 0 || evidenceRefs.some((id) => !evidenceIds.has(canonicalIdentifier(id)))) {
    pushIssue(issues, "EVIDENCE_PROVENANCE", "교정 provenance에는 evidence_ids 중 하나 이상을 직접 가리키는 EVIDENCE 항목이 필요합니다.", `${location}.provenance`);
  }
  if (!correction.affected_ids.some((id) => canonicalIdentifier(id) === canonicalIdentifier(correction.target_id))) {
    pushIssue(issues, "TARGET_NOT_AFFECTED", "affected_ids에는 target_id가 포함되어야 합니다.", `${location}.affected_ids`);
  }
  if (!nonEmptyText(correction.replacement)
    || !nonEmptyText(correction.reason)
    || !nonEmptyText(correction.impact_scope.summary)) {
    pushIssue(issues, "CORRECTION_EMPTY_TEXT", "교정 내용, 이유, 영향 요약은 공백이 아닌 문장이어야 합니다.", location);
  }
  const impactFlags = [
    "timeline",
    "causality",
    "student_choices",
    "current_state",
    "learning_objective"
  ].filter((key) => correction.impact_scope[key] === true);
  if (correction.severity !== "LOCAL_PATCH" && impactFlags.length === 0) {
    pushIssue(issues, "IMPACT_SCOPE_EMPTY", "TRACK_REBASE와 RESTART_RECOMMENDED는 실제 영향 영역을 하나 이상 표시해야 합니다.", `${location}.impact_scope`);
  }
  if (correction.severity === "RESTART_RECOMMENDED"
    && correction.impact_scope.learning_objective !== true
    && correction.impact_scope.timeline !== true
    && correction.impact_scope.causality !== true) {
    pushIssue(issues, "RESTART_IMPACT", "재시작 권고는 학습 목표·연표·인과 중 하나 이상의 핵심 영향을 표시해야 합니다.", `${location}.impact_scope`);
  }

  const knownEvidence = contextRecordMap(context, "evidence_records");
  const knownRecords = contextIdentifierSet(context, "known_record_ids");
  if (knownEvidence === null) {
    pushIssue(issues, "EVIDENCE_CONTEXT_REQUIRED", "교정을 검증하려면 evidence_records 문맥이 필요합니다.", "$context.evidence_records");
  } else {
    let verifiedCount = 0;
    for (const evidenceId of correction.evidence_ids) {
      const record = knownEvidence.get(canonicalIdentifier(evidenceId));
      if (!record) {
        pushIssue(issues, "UNKNOWN_EVIDENCE", `존재가 확인되지 않은 교정 근거입니다: ${evidenceId}`, `${location}.evidence_ids`);
        continue;
      }
      if (record.status === "VERIFIED") {
        verifiedCount += 1;
      }
      const allowedStatuses = correction.decision === "ALTERNATE_FICTION"
        ? new Set(["VERIFIED", "DERIVED", "SCENARIO"])
        : new Set(["VERIFIED", "DERIVED"]);
      if (!allowedStatuses.has(record.status)) {
        pushIssue(issues, "EVIDENCE_STATUS_NOT_ALLOWED", `교정 결정에 사용할 수 없는 근거 상태입니다: ${evidenceId}=${record.status}`, `${location}.evidence_ids`);
      }
    }
    if (correction.decision !== "ALTERNATE_FICTION" && verifiedCount === 0) {
      pushIssue(issues, "VERIFIED_EVIDENCE_REQUIRED", "사실·Canon 교정에는 VERIFIED 근거가 하나 이상 필요합니다.", `${location}.evidence_ids`);
    }
  }

  const trustedProvenance = Array.isArray(context.provenance_records)
    ? new Map(context.provenance_records
      .filter((record) => isPlainObject(record) && typeof record.kind === "string" && typeof record.ref === "string")
      .map((record) => [`${record.kind}:${canonicalIdentifier(record.ref)}`, record]))
    : null;
  for (const entry of correction.provenance) {
    if (entry.kind === "EVIDENCE" || entry.kind === "USER_DECISION") {
      if (Object.hasOwn(entry, "content_sha256")) {
        pushIssue(issues, "PROVENANCE_HASH_NOT_ALLOWED", `${entry.kind} provenance에는 독립 검증할 수 없는 content_sha256을 넣을 수 없습니다.`, `${location}.provenance`);
      }
      continue;
    }
    if (trustedProvenance === null) {
      pushIssue(issues, "PROVENANCE_CONTEXT_REQUIRED", "SOURCE·PDF_CHUNK·TURN·SYSTEM_RULE provenance를 검증하려면 provenance_records 문맥이 필요합니다.", "$context.provenance_records");
      break;
    }
    const trusted = trustedProvenance.get(`${entry.kind}:${canonicalIdentifier(entry.ref)}`);
    if (!trusted) {
      pushIssue(issues, "UNKNOWN_PROVENANCE", `존재가 확인되지 않은 provenance 참조입니다: ${entry.kind}:${entry.ref}`, `${location}.provenance`);
    } else if ((entry.content_sha256 ?? null) !== (trusted.content_sha256 ?? null)) {
      pushIssue(issues, "PROVENANCE_HASH_MISMATCH", `provenance 해시가 신뢰 문맥과 일치하지 않습니다: ${entry.ref}`, `${location}.provenance`);
    }
  }

  if (knownRecords === null) {
    pushIssue(issues, "RECORD_CONTEXT_REQUIRED", "교정을 검증하려면 known_record_ids 문맥이 필요합니다.", "$context.known_record_ids");
  } else {
    for (const targetId of [correction.target_id, ...correction.affected_ids]) {
      if (!knownRecords.has(canonicalIdentifier(targetId))) {
        pushIssue(issues, "UNKNOWN_TARGET", `존재가 확인되지 않은 교정 대상입니다: ${targetId}`, `${location}.affected_ids`);
      }
    }
  }

  if (correction.last_valid_checkpoint !== null) {
    const checkpoints = contextRecordMap(context, "checkpoint_records");
    const checkpoint = checkpoints?.get(canonicalIdentifier(correction.last_valid_checkpoint));
    if (!checkpoint) {
      pushIssue(issues, "CHECKPOINT_CONTEXT_REQUIRED", "last_valid_checkpoint는 신뢰된 checkpoint_records의 EP ID여야 합니다.", `${location}.last_valid_checkpoint`);
    } else if (checkpoint.revision > delta.base_revision) {
      pushIssue(issues, "CHECKPOINT_AFTER_BASE", "마지막 유효 체크포인트가 교정 대상 base_revision보다 뒤에 있습니다.", `${location}.last_valid_checkpoint`);
    }
  }

  const protectedTargets = contextIdentifierSet(context, "protected_target_ids") ?? new Set();
  const targetIsProtected = protectedIdPrefix.test(correction.target_id)
    || protectedTargets.has(canonicalIdentifier(correction.target_id));
  const approvals = Array.isArray(context.approved_corrections)
    ? new Map(context.approved_corrections
      .filter((record) => isPlainObject(record) && typeof record.correction_id === "string")
      .map((record) => [canonicalIdentifier(record.correction_id), record]))
    : new Map();
  const approval = approvals.get(canonicalIdentifier(correction.correction_id));
  const userDecisionEntries = correction.provenance.filter((entry) => entry.kind === "USER_DECISION");
  const expectedApprovalHash = correctionApprovalSha256(delta.base_revision, correction);
  const approvalMatches = approval !== undefined
    && approval.decision === correction.decision
    && approval.content_sha256 === expectedApprovalHash
    && userDecisionEntries.length === 1
    && canonicalIdentifier(userDecisionEntries[0].ref) === canonicalIdentifier(approval.user_decision_ref);

  if (acceptedDecisions.has(correction.decision) && !approvalMatches) {
    pushIssue(issues, "USER_DECISION_REQUIRED", "적용·재시작·대안 허구 결정에는 현재 교정 본문과 base_revision에 결합된 승인·결정·USER_DECISION provenance가 필요합니다.", `${location}.decision`);
  }
  if (targetIsProtected && correction.decision !== "USER_DECISION_PENDING" && !approvalMatches) {
    pushIssue(issues, "PROTECTED_TARGET_APPROVAL", "T0/T1·Canon·출처·검증 사실은 교정 제안만 가능하며 결합 승인 없이 적용할 수 없습니다.", `${location}.decision`);
  }
  if (correction.decision === "USER_DECISION_PENDING" && approval !== undefined) {
    pushIssue(issues, "DECISION_STATE_MISMATCH", "승인 레코드가 있는데 교정 상태가 USER_DECISION_PENDING으로 남아 있습니다.", `${location}.decision`);
  }
  if (correction.decision === "USER_DECISION_PENDING" && userDecisionEntries.length > 0) {
    pushIssue(issues, "DECISION_PROVENANCE_MISMATCH", "결정 대기 상태에는 완료된 USER_DECISION provenance를 넣을 수 없습니다.", `${location}.provenance`);
  }
  if (userDecisionEntries.length > 1) {
    pushIssue(issues, "DUPLICATE_USER_DECISION", "교정 하나에는 USER_DECISION provenance를 하나만 연결할 수 있습니다.", `${location}.provenance`);
  }
  if (["SOURCE", "PDF_CHUNK"].some((kind) => correction.provenance.some((entry) => entry.kind === kind && !entry.content_sha256))) {
    pushIssue(issues, "PROVENANCE_HASH_REQUIRED", "SOURCE와 PDF_CHUNK provenance에는 content_sha256이 필요합니다.", `${location}.provenance`);
  }
}

export function validateMemoryDeltaSemantics(delta, context = {}) {
  const issues = [];
  validateContext(context, issues);
  if (!isPlainObject(context)) {
    return issues;
  }
  if (!isPlainObject(delta)) {
    pushIssue(issues, "DELTA_TYPE", "기억 델타는 객체여야 합니다.");
    return issues;
  }
  scanTextIntegrity(delta, issues);
  scanTextIntegrity(context, issues, "$context");
  if (!Number.isSafeInteger(delta.base_revision) || delta.base_revision < 0
    || !Number.isSafeInteger(delta.next_revision) || delta.next_revision < 1) {
    pushIssue(issues, "REVISION_SAFE_INTEGER_REQUIRED", "base_revision과 next_revision은 안전한 정수 범위여야 합니다.", "$");
  } else if (delta.next_revision !== delta.base_revision + 1) {
    pushIssue(issues, "REVISION_SEQUENCE", "next_revision은 base_revision보다 정확히 1 커야 합니다.", "$.next_revision");
  }
  if (!Number.isSafeInteger(context.session_revision)) {
    pushIssue(issues, "SESSION_REVISION_CONTEXT_REQUIRED", "현재 세션 revision 없이 의미 검증을 통과할 수 없습니다.", "$context.session_revision");
  } else if (delta.base_revision !== context.session_revision) {
    pushIssue(issues, "STALE_BASE_REVISION", "base_revision이 현재 세션 revision과 일치하지 않습니다.", "$.base_revision");
  }

  const addPaths = [];
  const addedIds = [];
  for (const [index, operation] of (delta.add ?? []).entries()) {
    addPaths.push(operation.path);
    validateAddValue(operation, index, context, issues);
    if (isPlainObject(operation.value) && typeof operation.value.id === "string") {
      addedIds.push(operation.value.id);
    }
  }
  if (new Set(addPaths).size !== addPaths.length) {
    pushIssue(issues, "DUPLICATE_PATH", "한 델타에서 같은 append 경로를 두 번 사용할 수 없습니다.", "$.add");
  }
  if (hasDuplicateIdentifiers(addedIds)) {
    pushIssue(issues, "DUPLICATE_ADD_ID", "add 작업에 대소문자·정규화 기준 중복 ID가 있습니다.", "$.add");
  }

  const knownRecords = contextIdentifierSet(context, "known_record_ids");
  if (knownRecords === null) {
    pushIssue(issues, "KNOWN_RECORDS_REQUIRED", "기존 ID 재사용을 막으려면 trusted known_record_ids가 필요합니다.", "$context.known_record_ids");
  } else {
    for (const id of addedIds) {
      if (knownRecords.has(canonicalIdentifier(id))) {
        pushIssue(issues, "ADD_ID_ALREADY_EXISTS", `이미 존재하는 ID를 새 값으로 추가할 수 없습니다: ${id}`, "$.add");
      }
    }
  }

  const correctionIds = (delta.correct ?? []).map((entry) => entry.correction_id);
  const correctionTargets = (delta.correct ?? []).map((entry) => entry.target_id);
  if (hasDuplicateIdentifiers(correctionIds)) {
    pushIssue(issues, "DUPLICATE_CORRECTION_ID", "교정 ID가 중복되었습니다.", "$.correct");
  }
  if (hasDuplicateIdentifiers(correctionTargets)) {
    pushIssue(issues, "DUPLICATE_CORRECTION_TARGET", "한 델타에서 같은 대상을 여러 번 교정할 수 없습니다.", "$.correct");
  }
  if (knownRecords !== null) {
    for (const id of correctionIds) {
      if (knownRecords.has(canonicalIdentifier(id))) {
        pushIssue(issues, "CORRECTION_ID_ALREADY_EXISTS", `이미 존재하는 교정 ID를 재사용할 수 없습니다: ${id}`, "$.correct");
      }
    }
  }
  for (const [index, correction] of (delta.correct ?? []).entries()) {
    validateCorrection(correction, index, delta, context, issues);
  }

  const resolveIds = delta.resolve ?? [];
  const resolvableIds = contextIdentifierSet(context, "resolvable_ids");
  for (const [index, id] of resolveIds.entries()) {
    if (!/^OPEN-[A-Z0-9-]{3,75}$/u.test(id) || protectedIdPrefix.test(id)) {
      pushIssue(issues, "PROTECTED_RESOLVE", "resolve는 trusted OPEN ID만 닫을 수 있으며 부정·근거·Canon 레코드는 닫을 수 없습니다.", `$.resolve[${index}]`);
    }
    if (resolvableIds === null) {
      pushIssue(issues, "RESOLVE_CONTEXT_REQUIRED", "resolve를 검증하려면 resolvable_ids 문맥이 필요합니다.", "$context.resolvable_ids");
    } else if (!resolvableIds.has(canonicalIdentifier(id))) {
      pushIssue(issues, "UNKNOWN_RESOLVE", `해결 가능한 상태로 확인되지 않은 ID입니다: ${id}`, `$.resolve[${index}]`);
    } else if (knownRecords === null || !knownRecords.has(canonicalIdentifier(id))) {
      pushIssue(issues, "RESOLVE_NOT_IN_LEDGER", `known_record_ids에 없는 ID는 해결할 수 없습니다: ${id}`, `$.resolve[${index}]`);
    }
  }

  const mutationIds = [...addedIds, ...correctionIds, ...correctionTargets, ...resolveIds];
  if (hasDuplicateIdentifiers(mutationIds)) {
    pushIssue(issues, "CROSS_OPERATION_ID_COLLISION", "add·correct·resolve 사이에 ID 충돌이 있습니다.", "$");
  }
  return issues;
}

async function structuralValidator() {
  const schemaText = await readFile(schemaPath, "utf8");
  const schema = parseJsonWithOptionalBom(schemaText, "memory-delta.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return { ajv, validate: ajv.compile(schema) };
}

export async function validateMemoryDeltaDocument(delta, context = {}) {
  const { ajv, validate } = await structuralValidator();
  const issues = [];
  if (!validate(delta)) {
    for (const error of validate.errors ?? []) {
      pushIssue(
        issues,
        "SCHEMA",
        ajv.errorsText([error], { separator: "; " }),
        error.instancePath === "" ? "$" : `$${error.instancePath}`
      );
    }
    return issues;
  }
  return validateMemoryDeltaSemantics(delta, context);
}

export async function assertValidMemoryDelta(delta, context = {}) {
  const issues = await validateMemoryDeltaDocument(delta, context);
  if (issues.length > 0) {
    const error = new Error(issues.map((issue) => `${issue.code} ${issue.location}: ${issue.message}`).join("\n"));
    error.name = "MemoryDeltaValidationError";
    error.issues = issues;
    throw error;
  }
  return {
    valid: true,
    base_revision: delta.base_revision,
    next_revision: delta.next_revision,
    operations: delta.add.length + delta.correct.length + delta.resolve.length
  };
}

async function main() {
  const [, , deltaArgument, contextArgument] = process.argv;
  if (!deltaArgument || !contextArgument) {
    throw new Error("사용법: node validate-memory-delta.mjs <delta.json> <trusted-context.json>");
  }
  const deltaText = await readFile(resolve(deltaArgument), "utf8");
  const delta = parseJsonWithOptionalBom(deltaText, "기억 델타");
  const context = parseJsonWithOptionalBom(await readFile(resolve(contextArgument), "utf8"), "검증 문맥");
  const result = await assertValidMemoryDelta(delta, context);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
