import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateRepository } from "../scripts/validate.mjs";
import {
  assertProtectedInvariants,
  compactSession
} from "../skills/teach-grounded-scenarios/scripts/compact-session.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const examplePath = join(
  root,
  "skills",
  "teach-grounded-scenarios",
  "examples",
  "grade-6",
  "1945-no-atomic-bomb",
  "session.json"
);

test("저장소의 문서, 프롬프트, 스키마 계약이 유효하다", async () => {
  const errors = await validateRepository();
  assert.deepEqual(errors, []);
});

test("기억 압축이 절대 보존 항목과 원본을 지킨다", async () => {
  const sourceText = await readFile(examplePath, "utf8");
  const original = JSON.parse(sourceText);
  const snapshot = structuredClone(original);
  const compacted = compactSession(original, sourceText);

  assert.deepEqual(original, snapshot);
  assert.equal(compacted.memory.compaction.sequence, 1);
  assert.equal(compacted.memory.compaction.source_revision, original.revision);
  assert.match(compacted.memory.compaction.source_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(compacted.memory.canon, original.memory.canon);
  assert.deepEqual(compacted.memory.negative_facts, original.memory.negative_facts);
  assert.deepEqual(compacted.memory.corrections, original.memory.corrections);
  assert.deepEqual(compacted.memory.open_threads, original.memory.open_threads);
  assert.equal(compacted.memory.episode_archive[0].detail, undefined);
  assert.equal(compacted.memory.episode_archive[0].id, "EP-001");
  assert.equal(compacted.memory.episode_archive[0].must_keep, true);
});

test("예시 세션은 부정 사실과 열린 질문을 분리해 보존한다", async () => {
  const session = JSON.parse(await readFile(examplePath, "utf8"));
  assert.ok(session.memory.negative_facts.some((item) => item.id === "NEG-001" && item.must_keep));
  assert.ok(session.memory.open_threads.some((item) => item.id === "OPEN-001" && item.must_keep));
  assert.ok(session.evidence.some((item) => item.status === "UNKNOWN" && item.must_keep));
  assert.ok(session.evidence.some((item) => item.status === "SCENARIO" && item.must_keep));
});

test("Story Track 재시작 권고와 사용자 결정 대기는 압축 후에도 보존된다", async () => {
  const sourceText = await readFile(examplePath, "utf8");
  const session = JSON.parse(sourceText);
  const correction = {
    id: "COR-TEST-001",
    severity: "RESTART_RECOMMENDED",
    replaces: ["CAN-001"],
    text: "핵심 전제 오류 때문에 재시작을 권고한다.",
    reason: "부분 교정으로는 인과망을 복구할 수 없다.",
    evidence_ids: ["VER-001"],
    affected_ids: ["CAN-001", "EP-001"],
    last_valid_checkpoint: "EP-001 이전",
    decision: "USER_DECISION_PENDING",
    user_options: ["재시작", "수업 중단"],
    must_keep: true
  };
  session.memory.corrections.push(correction);
  const compacted = compactSession(session, JSON.stringify(session));
  assert.deepEqual(compacted.memory.corrections, [correction]);
  assert.equal(compacted.memory.corrections[0].decision, "USER_DECISION_PENDING");
});

test("같은 ID를 유지한 절대 보존 내용 변조도 압축 무결성 실패다", async () => {
  const sourceText = await readFile(examplePath, "utf8");
  const original = JSON.parse(sourceText);
  const mutated = structuredClone(original);
  mutated.memory.canon[0].text = "ID만 유지한 조용한 Canon 변경";
  assert.throws(
    () => assertProtectedInvariants(original, mutated),
    /ID 또는 내용이 변경/u
  );
});
