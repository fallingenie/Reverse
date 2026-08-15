import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  correctionApprovalSha256,
  decodeJsonPointer,
  parseJsonWithOptionalBom,
  validateMemoryDeltaDocument,
  validateMemoryDeltaSemantics
} from "../skills/teach-grounded-scenarios/scripts/validate-memory-delta.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = join(root, "tests", "fixtures", "memory-delta");
const validator = join(root, "skills", "teach-grounded-scenarios", "scripts", "validate-memory-delta.mjs");

async function fixture(name) {
  return JSON.parse(await readFile(join(fixtures, name), "utf8"));
}

async function issueCodes(name, context = {}) {
  const issues = await validateMemoryDeltaDocument(await fixture(name), context);
  return new Set(issues.map((issue) => issue.code));
}

async function findFiles(directory, name) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findFiles(path, name));
    } else if (entry.name === name) {
      results.push(path);
    }
  }
  return results;
}

function runNode(arguments_) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, arguments_, { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("add 전용 델타는 현재 revision과 허용 경로가 맞으면 통과한다", async () => {
  const issues = await validateMemoryDeltaDocument(await fixture("valid-add.json"), {
    session_revision: 0,
    known_record_ids: ["VER-001"],
    evidence_records: [{ id: "VER-001", status: "VERIFIED" }]
  });
  assert.deepEqual(issues, []);
});

test("모든 수업 예시의 lesson-turn 델타가 의미 검증을 통과한다", async () => {
  const examplesRoot = join(root, "skills", "teach-grounded-scenarios", "examples");
  const lessonTurns = await findFiles(examplesRoot, "lesson-turn.json");
  assert.ok(lessonTurns.length >= 1);
  for (const path of lessonTurns) {
    const lessonTurn = JSON.parse(await readFile(path, "utf8"));
    const session = JSON.parse(await readFile(join(dirname(path), "session.json"), "utf8"));
    const addedIds = new Set(lessonTurn.memory_delta.add
      .map((operation) => operation.value?.id)
      .filter(Boolean));
    const collectIds = (value) => {
      if (Array.isArray(value)) {
        return value.flatMap(collectIds);
      }
      if (value && typeof value === "object") {
        return [
          ...(typeof value.id === "string" ? [value.id] : []),
          ...Object.values(value).flatMap(collectIds)
        ];
      }
      return [];
    };
    const issues = await validateMemoryDeltaDocument(lessonTurn.memory_delta, {
      session_revision: lessonTurn.memory_delta.base_revision,
      known_record_ids: [...new Set(collectIds(session))].filter((id) => !addedIds.has(id)),
      evidence_records: session.evidence.map((record) => ({ id: record.id, status: record.status }))
    });
    assert.deepEqual(issues, [], path);
  }
});

test("근거·영향 범위가 있는 교정 제안은 사용자 결정 대기 상태로 통과한다", async () => {
  const context = await fixture("context.json");
  const issues = await validateMemoryDeltaDocument(await fixture("valid-correction-pending.json"), context);
  assert.deepEqual(issues, []);
});

test("보호 대상 교정 적용은 승인 문맥과 USER_DECISION provenance가 모두 있어야 통과한다", async () => {
  const context = await fixture("context.json");
  context.session_revision = 8;
  context.known_record_ids.push("DEC-001");
  const delta = await fixture("valid-correction-applied.json");
  context.approved_corrections = [{
    correction_id: "COR-TEST-0002",
    decision: "APPLIED",
    content_sha256: correctionApprovalSha256(delta.base_revision, delta.correct[0]),
    user_decision_ref: "DEC-001"
  }];
  const issues = await validateMemoryDeltaDocument(delta, context);
  assert.deepEqual(issues, []);
});

test("revision 건너뛰기를 거부한다", async () => {
  assert.equal((await issueCodes("invalid-revision-gap.json")).has("REVISION_SEQUENCE"), true);
});

test("안전 정수 범위를 넘는 revision과 현재 revision 문맥 생략을 거부한다", async () => {
  const unsafe = {
    base_revision: 9007199254740992,
    next_revision: 9007199254740992,
    add: [],
    correct: [],
    resolve: []
  };
  assert.equal((await validateMemoryDeltaDocument(unsafe, {
    session_revision: 0,
    known_record_ids: [],
    evidence_records: []
  })).some((issue) => issue.code === "SCHEMA"), true);
  assert.equal(validateMemoryDeltaSemantics(unsafe, {
    session_revision: 0,
    known_record_ids: [],
    evidence_records: []
  }).some((issue) => issue.code === "REVISION_SAFE_INTEGER_REQUIRED"), true);

  const valid = await fixture("valid-add.json");
  const codes = new Set((await validateMemoryDeltaDocument(valid, {
    known_record_ids: ["VER-001"],
    evidence_records: [{ id: "VER-001", status: "VERIFIED" }]
  })).map((issue) => issue.code));
  assert.equal(codes.has("SESSION_REVISION_CONTEXT_REQUIRED"), true);
});

test("Canon 직접 경로와 JSON Pointer escape 우회를 구조 단계에서 거부한다", async () => {
  assert.equal((await issueCodes("invalid-direct-canon-path.json")).has("SCHEMA"), true);
  assert.equal((await issueCodes("invalid-pointer-escape.json")).has("SCHEMA"), true);
  assert.throws(() => decodeJsonPointer("/memory/~2anon/-"), /escape/u);
  assert.deepEqual(decodeJsonPointer("/memory/~1canon/-"), ["memory", "/canon", "-"]);
});

test("같은 append 경로의 중복 작업을 거부한다", async () => {
  assert.equal((await issueCodes("invalid-duplicate-append.json")).has("DUPLICATE_PATH"), true);
});

test("기존 ID 재사용과 기존 교정 ID replay를 거부한다", async () => {
  const add = await fixture("valid-add.json");
  let codes = new Set((await validateMemoryDeltaDocument(add, {
    session_revision: 0,
    known_record_ids: ["EP-001", "VER-001"],
    evidence_records: [{ id: "VER-001", status: "VERIFIED" }]
  })).map((issue) => issue.code));
  assert.equal(codes.has("ADD_ID_ALREADY_EXISTS"), true);

  const correction = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  context.known_record_ids.push("COR-TEST-0001");
  codes = new Set((await validateMemoryDeltaDocument(correction, context)).map((issue) => issue.code));
  assert.equal(codes.has("CORRECTION_ID_ALREADY_EXISTS"), true);
});

test("JSON.parse가 마지막 값으로 덮는 중복 객체 키를 입력 단계에서 거부한다", async () => {
  const source = await readFile(join(fixtures, "invalid-duplicate-key.json"), "utf8");
  assert.throws(() => parseJsonWithOptionalBom(source), /중복 객체 키.*next_revision/u);
  assert.throws(() => parseJsonWithOptionalBom("{\"path\":1,\"p\\u0061th\":2}"), /중복 객체 키.*path/u);
});

test("보호 대상은 사용자 승인 없이 APPLIED로 승격할 수 없다", async () => {
  const context = await fixture("context.json");
  const codes = await issueCodes("invalid-protected-apply.json", context);
  assert.equal(codes.has("USER_DECISION_REQUIRED"), true);
  assert.equal(codes.has("PROTECTED_TARGET_APPROVAL"), true);
});

test("승인은 교정 전체 내용과 base revision에 결합되어 replay·변조를 막는다", async () => {
  const delta = await fixture("valid-correction-applied.json");
  const context = await fixture("context.json");
  context.session_revision = 8;
  context.known_record_ids.push("DEC-001");
  context.approved_corrections = [{
    correction_id: "COR-TEST-0002",
    decision: "APPLIED",
    content_sha256: correctionApprovalSha256(delta.base_revision, delta.correct[0]),
    user_decision_ref: "DEC-001"
  }];
  delta.correct[0].replacement = "승인 뒤 몰래 바꾼 교정 내용";
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("USER_DECISION_REQUIRED"), true);
  assert.equal(codes.has("PROTECTED_TARGET_APPROVAL"), true);
});

test("SCENARIO·UNKNOWN만으로 사실 Canon을 교정할 수 없다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  context.evidence_records[0].status = "SCENARIO";
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("EVIDENCE_STATUS_NOT_ALLOWED"), true);
  assert.equal(codes.has("VERIFIED_EVIDENCE_REQUIRED"), true);
});

test("provenance hash는 trusted 원장 digest와 일치해야 한다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  delta.correct[0].provenance[1].content_sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("PROVENANCE_HASH_MISMATCH"), true);
});

test("동일 provenance kind/ref 중복을 거부한다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  delta.correct[0].provenance.push({ ...delta.correct[0].provenance[1] });
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("DUPLICATE_PROVENANCE"), true);
});

test("존재하지 않는 evidence를 교정 근거로 사용할 수 없다", async () => {
  const context = await fixture("context.json");
  assert.equal((await issueCodes("invalid-unknown-evidence.json", context)).has("UNKNOWN_EVIDENCE"), true);
});

test("형식이 잘못된 검증 문맥도 예외로 빠져나가지 않고 fail-closed 이슈가 된다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const issues = await validateMemoryDeltaDocument(delta, {
    session_revision: 7,
    known_record_ids: "CAN-001",
    evidence_records: "VER-001",
    provenance_records: [3],
    checkpoint_records: null
  });
  const codes = new Set(issues.map((issue) => issue.code));
  assert.equal(codes.has("CONTEXT_ID_LIST"), true);
  assert.equal(codes.has("EVIDENCE_CONTEXT_REQUIRED"), true);
  assert.equal(codes.has("UNKNOWN_PROVENANCE"), true);
  assert.equal(codes.has("RECORD_CONTEXT_REQUIRED"), true);
});

test("JSON escape와 직접 object API로 들어온 손상·제어 문자를 거부한다", async () => {
  const delta = parseJsonWithOptionalBom("{\"base_revision\":0,\"next_revision\":1,\"add\":[{\"path\":\"/memory/conflicts/-\",\"value\":\"\\uFFFD\\u0085\\uFEFF\",\"reason\":\"공격\"}],\"correct\":[],\"resolve\":[]}");
  const context = { session_revision: 0, known_record_ids: [], evidence_records: [] };
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("TEXT_INTEGRITY"), true);

  delta.add[0].value = "\u202E방향 제어";
  assert.equal(validateMemoryDeltaSemantics(delta, context).some((issue) => issue.code === "TEXT_INTEGRITY"), true);
});

test("마지막 유효 체크포인트는 base revision보다 뒤일 수 없다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  context.checkpoint_records[0].revision = 8;
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("CHECKPOINT_AFTER_BASE"), true);
});

test("교정 대상은 affected_ids에서 빠질 수 없고 비어 있는 영향 범위로 rebase할 수 없다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  delta.correct[0].affected_ids = ["EP-001"];
  delta.correct[0].impact_scope = {
    summary: "영향 없음으로 위장",
    timeline: false,
    causality: false,
    student_choices: false,
    current_state: false,
    learning_objective: false
  };
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("TARGET_NOT_AFFECTED"), true);
  assert.equal(codes.has("IMPACT_SCOPE_EMPTY"), true);
});

test("resolve는 확인된 미해결 ID만 허용하며 보호 ID를 닫지 않는다", async () => {
  const valid = await fixture("valid-add.json");
  valid.add = [];
  valid.resolve = ["OPEN-001"];
  assert.deepEqual(await validateMemoryDeltaDocument(valid, {
    session_revision: 0,
    known_record_ids: ["OPEN-001"],
    evidence_records: [],
    resolvable_ids: ["OPEN-001"]
  }), []);

  valid.resolve = ["VER-001"];
  const codes = new Set((await validateMemoryDeltaDocument(valid, {
    session_revision: 0,
    known_record_ids: ["VER-001"],
    evidence_records: [{ id: "VER-001", status: "VERIFIED" }],
    resolvable_ids: ["VER-001"]
  })).map((issue) => issue.code));
  assert.equal(codes.has("SCHEMA"), true);
});

test("resolve 후보는 trusted 원장에도 실제로 존재해야 한다", async () => {
  const delta = { base_revision: 0, next_revision: 1, add: [], correct: [], resolve: ["OPEN-999"] };
  const context = {
    session_revision: 0,
    known_record_ids: [],
    evidence_records: [],
    resolvable_ids: ["OPEN-999"]
  };
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.ok(codes.has("CONTEXT_RESOLVABLE_NOT_IN_LEDGER"));
  assert.ok(codes.has("RESOLVE_NOT_IN_LEDGER"));
});

test("EVIDENCE와 USER_DECISION provenance에는 의미 없는 자체 해시를 허용하지 않는다", async () => {
  const delta = await fixture("valid-correction-pending.json");
  const context = await fixture("context.json");
  delta.correct[0].provenance[0].content_sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  assert.ok(new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code)).has("SCHEMA"));

  delete delta.correct[0].provenance[0].content_sha256;
  delta.correct[0].provenance.push({
    kind: "USER_DECISION",
    ref: "DEC-001",
    content_sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  });
  assert.ok(new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code)).has("SCHEMA"));
});

test("단독 surrogate와 대표 UTF-8 이중 디코딩 흔적을 거부하되 정상 emoji는 허용한다", async () => {
  const baseContext = { session_revision: 0, known_record_ids: [], evidence_records: [] };
  for (const value of ["\uD800", "\u00EC\u201E\u0153\u00EC\u0161\u00B8"]) {
    const delta = {
      base_revision: 0,
      next_revision: 1,
      add: [{ path: "/memory/conflicts/-", value, reason: "문자 무결성 검사" }],
      correct: [],
      resolve: []
    };
    assert.ok(new Set((await validateMemoryDeltaDocument(delta, baseContext)).map((issue) => issue.code)).has("TEXT_INTEGRITY"));
  }

  const validEmoji = {
    base_revision: 0,
    next_revision: 1,
    add: [{ path: "/memory/conflicts/-", value: "정상 문자 😀", reason: "정상 surrogate pair" }],
    correct: [],
    resolve: []
  };
  assert.deepEqual(await validateMemoryDeltaDocument(validEmoji, baseContext), []);
});

test("명시적 null 문맥도 예외 대신 구조화된 fail-closed 이슈를 반환한다", async () => {
  const delta = await fixture("valid-add.json");
  const issues = await validateMemoryDeltaDocument(delta, null);
  assert.ok(new Set(issues.map((issue) => issue.code)).has("CONTEXT_TYPE"));
});

test("add·correct·resolve 사이의 ID 충돌을 거부한다", async () => {
  const delta = await fixture("valid-add.json");
  delta.add = [{
    path: "/memory/open_threads/-",
    value: { id: "OPEN-001", text: "같은 ID를 추가하고 해결하려는 공격", must_keep: true },
    reason: "교차 연산 충돌 fixture"
  }];
  delta.resolve = ["OPEN-001"];
  const context = {
    session_revision: 0,
    known_record_ids: [],
    evidence_records: [],
    resolvable_ids: ["OPEN-001"]
  };
  const codes = new Set((await validateMemoryDeltaDocument(delta, context)).map((issue) => issue.code));
  assert.equal(codes.has("CROSS_OPERATION_ID_COLLISION"), true);
});

test("기계 JSON은 무BOM strict JSON.parse 호환이고 입력기는 선두 UTF-8-SIG를 허용한다", async () => {
  const schemaPath = join(root, "skills", "teach-grounded-scenarios", "schemas", "memory-delta.schema.json");
  const schemaBytes = await readFile(schemaPath);
  assert.notDeepEqual([...schemaBytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.doesNotThrow(() => JSON.parse(schemaBytes.toString("utf8")));

  const deltaText = await readFile(join(fixtures, "valid-add.json"), "utf8");
  assert.deepEqual(parseJsonWithOptionalBom(`\uFEFF${deltaText}`), JSON.parse(deltaText));
  assert.throws(() => parseJsonWithOptionalBom(`{}\uFEFF`), /선두 이외/u);
  assert.throws(() => parseJsonWithOptionalBom(`{\"x\":\"${"가".repeat(400000)}\"}`), /바이트 제한/u);

  const directory = await mkdtemp(join(tmpdir(), "reverse-memory-delta-"));
  try {
    const deltaPath = join(directory, "delta-with-bom.json");
    const contextPath = join(directory, "context-with-bom.json");
    await writeFile(deltaPath, `\uFEFF${deltaText}`, "utf8");
    await writeFile(contextPath, "\uFEFF{\"session_revision\":0,\"known_record_ids\":[\"VER-001\"],\"evidence_records\":[{\"id\":\"VER-001\",\"status\":\"VERIFIED\"}]}\n", "utf8");
    const result = await runNode([validator, deltaPath, contextPath]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).valid, true);

    const missingContext = await runNode([validator, deltaPath]);
    assert.notEqual(missingContext.code, 0);
    assert.match(missingContext.stderr, /trusted-context\.json/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
