import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDirectory = join(root, "skills", "teach-grounded-scenarios", "schemas");
const templatePath = join(root, "skills", "teach-grounded-scenarios", "assets", "session.template.json");
const existingExamplePath = join(
  root,
  "skills",
  "teach-grounded-scenarios",
  "examples",
  "grade-6",
  "1945-no-atomic-bomb",
  "session.json"
);

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sessionValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of [
    "evidence.schema.json",
    "source-record.schema.json",
    "research-plan.schema.json",
    "session.schema.json"
  ]) {
    ajv.addSchema(await json(join(schemaDirectory, name)));
  }
  return { ajv, validate: ajv.getSchema("https://example.org/reverse/session.schema.json") };
}

test("새 세션 템플릿은 모든 학생 프로필을 미수집 null로 시작한다", async () => {
  const bytes = await readFile(templatePath);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "JSON에 BOM을 두면 안 된다");

  const template = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(template.profile, {
    school_level: null,
    grade: null,
    subject: null,
    unit: null,
    interests: null,
    interest_source: null
  });
  assert.doesNotMatch(bytes.toString("utf8"), /초6|평범한 사람의 생활/u);
});

test("COLLECT_PROFILE에서는 단계적으로 수집한 값과 아직 묻지 않은 null을 함께 허용한다", async () => {
  const template = await json(templatePath);
  const { ajv, validate } = await sessionValidator();
  assert.equal(validate(template), true, ajv.errorsText(validate.errors));

  const partial = structuredClone(template);
  partial.profile.school_level = "초등학교";
  assert.equal(validate(partial), true, ajv.errorsText(validate.errors));

  partial.profile.grade = "6";
  assert.equal(validate(partial), false, "숫자만 받은 학년에서 학교급을 추정하면 안 된다");

  partial.profile.grade = "중1";
  assert.equal(validate(partial), false, "명시된 학교급과 학년 범위가 충돌하면 안 된다");

  const fallbackEventAsGate = structuredClone(template);
  fallbackEventAsGate.gate.state = "NEGATIVE_FALLBACK_START";
  assert.equal(validate(fallbackEventAsGate), false, "fallback 구조 이벤트를 일반 세션 게이트 상태로 승격하면 안 된다");
});

test("프로필 수집이 끝난 단계는 null을 거부하고 명시적인 없음은 보존한다", async () => {
  const template = await json(templatePath);
  const { ajv, validate } = await sessionValidator();

  const incomplete = structuredClone(template);
  incomplete.gate.state = "PLAN_RESEARCH";
  assert.equal(validate(incomplete), false, "조사 계획 단계가 미수집 프로필을 받아들이면 안 된다");

  const complete = structuredClone(incomplete);
  complete.profile = {
    school_level: "초등학교",
    grade: "초6",
    subject: "사회",
    unit: "",
    interests: []
  };
  assert.equal(validate(complete), true, ajv.errorsText(validate.errors));
});

test("RUN_LESSON은 완성 프로필과 무장·소비된 시작 게이트를 모두 요구한다", async () => {
  const template = await json(templatePath);
  const existingExample = await json(existingExamplePath);
  const { ajv, validate } = await sessionValidator();

  assert.equal(validate(existingExample), true, ajv.errorsText(validate.errors));

  const missingProfile = structuredClone(existingExample);
  missingProfile.profile.subject = null;
  assert.equal(validate(missingProfile), false, "실행 상태에 미수집 프로필이 남으면 안 된다");

  const missingGate = structuredClone(template);
  missingGate.profile = {
    school_level: "초등학교",
    grade: "초6",
    subject: "사회",
    unit: "",
    interests: []
  };
  missingGate.gate.state = "RUN_LESSON";
  missingGate.gate.start_confirmed = true;
  assert.equal(validate(missingGate), false, "시작 요청과 소비 revision 없이 실행하면 안 된다");

  const newStyleExample = structuredClone(existingExample);
  newStyleExample.profile.school_level = "초등학교";
  assert.equal(validate(newStyleExample), true, ajv.errorsText(validate.errors));
});
