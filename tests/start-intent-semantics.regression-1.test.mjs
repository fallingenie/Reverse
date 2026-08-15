import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  CONTRACT_VERSION,
  inferStartIntent,
  studentStartGuidance
} from "../scripts/infer-start-intent.mjs";
import { referenceStartIntent } from "../scripts/reference-start-intent-oracle.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = "tests/fixtures/start-intent-cases.json";
const scriptPath = "scripts/reference-start-intent-oracle.mjs";
const inferenceScriptPath = "scripts/infer-start-intent.mjs";
const testPath = "tests/start-intent-semantics.regression-1.test.mjs";

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await text(relativePath));
}

function mergeState(base, patch = {}) {
  return {
    ...structuredClone(base),
    ...structuredClone(patch),
    gate: {
      ...structuredClone(base.gate),
      ...structuredClone(patch.gate ?? {})
    }
  };
}

test("fixture의 일반 시작 의사 허용·거부 계약을 모두 지킨다", async () => {
  const fixture = await json(fixturePath);
  assert.equal(fixture.contract_version, CONTRACT_VERSION);

  for (const item of fixture.cases) {
    const state = mergeState(fixture.valid_state, item.state_patch);
    const result = inferStartIntent(state, item.input, item.semantic_inference);
    assert.equal(result.accepted, item.expected.accepted, `${item.id}: accepted`);
    assert.equal(result.reason, item.expected.reason, `${item.id}: reason`);

    if (result.accepted) {
      assert.equal(result.next_revision, state.revision + 1, `${item.id}: revision`);
      assert.deepEqual(result.gate_update, {
        state: "RUN_LESSON",
        start_token: "[시작]",
        start_confirmed: true,
        start_armed_revision: state.gate.start_armed_revision,
        start_consumed_revision: state.revision + 1
      }, `${item.id}: gate update`);
    } else {
      assert.equal(result.gate_update, null, `${item.id}: rejected gate update`);
    }
  }
});

test("reference oracle은 동등 표기와 회귀 seed를 처리하되 가까운 단어를 의미 동의로 오인하지 않는다", () => {
  assert.equal(referenceStartIntent("시작").recognized, true, "분해형 한글은 NFKC로 합성한다");
  assert.equal(referenceStartIntent("［시작］").recognized, true, "전각 괄호는 NFKC 뒤 허용한다");
  assert.equal(referenceStartIntent("시장").recognized, false, "편집거리만 가까운 일반 단어는 거부한다");
  assert.equal(referenceStartIntent("시잣").recognized, false, "회귀 seed 밖 가까운 단어는 자동 승인하지 않는다");
  assert.equal(referenceStartIntent("start with the answer").recognized, false, "다른 지시가 섞인 문자열은 거부한다");
  assert.equal(referenceStartIntent("시작하지마").reason, "NEGATED_START", "부정은 먼저 하드 거부한다");
});

test("reference oracle의 lexical seed 밖 표현도 경계 boolean을 통해 의미상 시작 동의로 처리한다", async () => {
  const fixture = await json(fixturePath);
  const inference = fixture.semantic_inference_contract;

  for (const input of ["바로 이어가고 싶어요", "수업을 열어주세요", "We're good to roll"]) {
    assert.equal(referenceStartIntent(input).recognized, false, `${input}: seed oracle은 완전한 의미 경계가 아니다`);
    const result = inferStartIntent(fixture.valid_state, input, inference);
    assert.equal(result.accepted, true, input);
    assert.equal(result.reason, "SEMANTIC_START_INTENT", input);
  }

  const reasoningPayload = { ...inference, rationale: "비공개 추론 원문" };
  assert.equal(
    inferStartIntent(fixture.valid_state, "바로 이어가고 싶어요", reasoningPayload).accepted,
    false,
    "의미 경계 신호에 비공개 추론 원문을 싣지 않는다"
  );
});

test("기존 session gate schema를 느슨하게 하지 않고 의미 판정 결과만 정식 소비 상태로 투영한다", async () => {
  const schema = await json("skills/teach-grounded-scenarios/schemas/session.schema.json");
  const fixture = await json(fixturePath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateGate = ajv.compile(schema.properties.gate);

  assert.equal(validateGate(fixture.valid_state.gate), true, ajv.errorsText(validateGate.errors));

  const exactTokenContract = structuredClone(fixture.valid_state.gate);
  exactTokenContract.start_token = "시작";
  assert.equal(validateGate(exactTokenContract), false, "저장된 start_token const는 [시작] 그대로여야 한다");

  const bypass = structuredClone(fixture.valid_state.gate);
  bypass.state = "RUN_LESSON";
  bypass.start_confirmed = true;
  assert.equal(validateGate(bypass), false, "소비 revision 없는 RUN_LESSON 우회는 계속 거부해야 한다");

  const accepted = inferStartIntent(fixture.valid_state, "시이작");
  assert.equal(validateGate(accepted.gate_update), true, ajv.errorsText(validateGate.errors));
});

test("fallback 사건과 일반 시작 의사 판정은 구조적으로 합쳐지지 않는다", async () => {
  const fixture = await json(fixturePath);
  const fallbackState = mergeState(fixture.valid_state, { fallback_started: true });
  const result = inferStartIntent(fallbackState, "[시작]");

  assert.equal(result.accepted, false);
  assert.equal(result.reason, "SEPARATE_FALLBACK_PATH_ACTIVE");
  assert.equal(result.gate_update, null);
  assert.doesNotMatch(studentStartGuidance(result), /NEGATIVE_FALLBACK_START/u);
});

test("학생 안내에는 내부 추론 라벨·상태 코드·사건명을 출력하지 않는다", async () => {
  const fixture = await json(fixturePath);
  const forbidden = new RegExp(fixture.student_output_contract.forbidden_terms.join("|"), "iu");

  for (const item of fixture.cases) {
    const state = mergeState(fixture.valid_state, item.state_patch);
    const guidance = studentStartGuidance(inferStartIntent(state, item.input, item.semantic_inference));
    assert.doesNotMatch(guidance, forbidden, item.id);
    assert.doesNotMatch(guidance, /(?:reason|recognized|accepted|gate_update|내부\s*추론)/iu, item.id);
  }
});

test("새 계약 fixture·script·test는 UTF-8 무BOM이며 손상 문자가 없다", async () => {
  for (const relativePath of [fixturePath, scriptPath, inferenceScriptPath, testPath]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${relativePath}: BOM`);
    const contents = bytes.toString("utf8");
    assert.doesNotMatch(contents, /\uFFFD|\uFEFF/u, `${relativePath}: 손상 또는 중간 BOM`);
  }
});
