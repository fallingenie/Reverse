import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  discoverExampleFixtures,
  validateScenarioExampleMetadata
} from "../scripts/validate.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillDirectory = join(root, "skills", "teach-grounded-scenarios");
const examplesDirectory = join(skillDirectory, "examples");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("모든 full 시나리오는 학교급/학년/과목/시나리오 경로와 메타데이터를 가진다", async () => {
  const discovery = await discoverExampleFixtures(examplesDirectory);
  const schema = await json(join(skillDirectory, "schemas", "scenario-example.schema.json"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const caseIds = new Set();

  assert.deepEqual(discovery.errors, []);
  assert.equal(discovery.lessons.length, 6);
  for (const entry of discovery.lessons) {
    const metadata = await json(entry["scenario.meta.json"]);
    const session = await json(entry["session.json"]);
    assert.equal(validate(metadata), true, `${entry.path}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(validateScenarioExampleMetadata(metadata, session, entry.path), []);
    for (const caseId of metadata.regression_case_ids) {
      assert.equal(caseIds.has(caseId), false, `중복 회귀 사례 ID: ${caseId}`);
      caseIds.add(caseId);
    }
  }
});

test("경로·학년·과목·위험 등급이 session과 다르면 실패 폐쇄한다", async () => {
  const discovery = await discoverExampleFixtures(examplesDirectory);
  const entry = discovery.lessons.find(candidate => candidate.path.includes("forest-animal-ecology"));
  const metadata = await json(entry["scenario.meta.json"]);
  const session = await json(entry["session.json"]);

  assert.ok(validateScenarioExampleMetadata(metadata, session, "grade-5/forest-animal-ecology")
    .some(error => error.includes("학교급/학년/과목/시나리오")));

  const wrongSubject = { ...metadata, subject_id: "history" };
  assert.ok(validateScenarioExampleMetadata(wrongSubject, session, entry.path)
    .some(error => error.includes("과목 ID")));

  const wrongGrade = { ...metadata, grade_label: "초6" };
  assert.ok(validateScenarioExampleMetadata(wrongGrade, session, entry.path)
    .some(error => error.includes("학년 표기")));

  const wrongRisk = { ...metadata, safety_risk: "LOW" };
  assert.ok(validateScenarioExampleMetadata(wrongRisk, session, entry.path)
    .some(error => error.includes("최대 위험")));
});

test("시나리오 메타데이터와 실행 테스트는 UTF-8 무BOM 기계 파일이다", async () => {
  const discovery = await discoverExampleFixtures(examplesDirectory);
  const paths = [
    join(skillDirectory, "schemas", "scenario-example.schema.json"),
    ...discovery.lessons.map(entry => entry["scenario.meta.json"]),
    fileURLToPath(import.meta.url)
  ];

  for (const path of paths) {
    const bytes = await readFile(path);
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], path);
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes), path);
  }
});
