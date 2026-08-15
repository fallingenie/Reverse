import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  createStudentLessonTurn,
  projectStudentLessonTurn,
  validateStudentLessonTurn
} from "../skills/teach-grounded-scenarios/scripts/project-student-lesson-turn.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function json(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

test("학생 전용 schema는 교사용 보기와 기억 변경 필드를 구조적으로 허용하지 않는다", async () => {
  const schemaPath = join(root, "skills", "teach-grounded-scenarios", "schemas", "student-lesson-turn.schema.json");
  const schemaText = await readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaText);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const fixture = await json("skills/teach-grounded-scenarios/examples/elementary/grade-6/social-studies/1945-no-atomic-bomb/lesson-turn.json");
  const studentTurn = projectStudentLessonTurn(fixture);

  assert.equal(validate(studentTurn), true, JSON.stringify(validate.errors));
  assert.equal(validate(fixture), false, "결합 fixture를 학생 schema로 직접 전달하면 거부해야 한다");
  assert.deepEqual(schema.required, ["turn", "student_view", "evidence_ids"]);
  assert.doesNotMatch(schemaText, /teacher_view|assessment_note|misconception_watch|memory_delta|must_keep/u);
});

test("개발·교사용 결합 fixture를 투영해도 학생 허용 필드의 새 복사본만 남는다", async () => {
  const fixture = await json("skills/teach-grounded-scenarios/examples/elementary/grade-6/social-studies/1945-no-atomic-bomb/lesson-turn.json");
  fixture.student_view.debug_note = "학생에게 전달하면 안 되는 임시 메모";
  fixture.unexpected = { secret: "학생에게 전달하면 안 되는 값" };
  const projected = projectStudentLessonTurn(fixture);
  const serialized = JSON.stringify(projected);

  assert.deepEqual(Object.keys(projected), ["turn", "student_view", "evidence_ids"]);
  assert.deepEqual(Object.keys(projected.student_view), [
    "scene",
    "clues",
    "thinking_question",
    "choices",
    "custom_input_allowed"
  ]);
  assert.doesNotMatch(serialized, /teacher_view|memory_delta|assessment_note|misconception_watch|debug_note|unexpected/u);
  assert.notEqual(projected.student_view, fixture.student_view);
  assert.notEqual(projected.student_view.clues, fixture.student_view.clues);
  assert.notEqual(projected.evidence_ids, fixture.evidence_ids);
});

test("학생 runtime 생성 함수는 결합 객체와 중첩된 추가 필드를 fail-closed한다", async () => {
  const fixture = await json("skills/teach-grounded-scenarios/examples/elementary/grade-6/social-studies/1945-no-atomic-bomb/lesson-turn.json");
  assert.throws(
    () => createStudentLessonTurn(fixture),
    (error) => error.code === "STUDENT_LESSON_TURN_INVALID"
      && error.issues.some((issue) => issue.path === "$/teacher_view")
      && error.issues.some((issue) => issue.path === "$/memory_delta")
  );

  const projected = projectStudentLessonTurn(fixture);
  projected.student_view.assessment_note = "숨은 평가";
  const issues = validateStudentLessonTurn(projected);
  assert(issues.some((issue) => issue.code === "FIELD_NOT_ALLOWED" && issue.path === "$/student_view/assessment_note"));
});

test("학생 runtime은 accessor를 한 번만 읽은 snapshot을 검증해 TOCTOU 누출을 차단한다", async () => {
  let sceneReads = 0;
  const value = {
    turn: 1,
    student_view: {
      get scene() {
        sceneReads += 1;
        return sceneReads === 1
          ? "학생에게 공개 가능한 장면"
          : { teacher_view: { assessment_note: "SECRET" } };
      },
      clues: ["[확인됨] 공개 단서"],
      thinking_question: "어떤 근거가 필요할까?",
      choices: ["첫 번째 선택", "두 번째 선택"],
      custom_input_allowed: true
    },
    evidence_ids: ["VER-001"]
  };

  const result = createStudentLessonTurn(value);
  assert.equal(sceneReads, 1);
  assert.equal(result.student_view.scene, "학생에게 공개 가능한 장면");
  assert.doesNotMatch(JSON.stringify(result), /SECRET|teacher_view|assessment_note/u);
});

test("학생 schema와 결합 fixture schema는 공유 학생 필드 제약이 일치한다", async () => {
  const [studentSchema, fullSchema] = await Promise.all([
    json("skills/teach-grounded-scenarios/schemas/student-lesson-turn.schema.json"),
    json("skills/teach-grounded-scenarios/schemas/lesson-turn.schema.json")
  ]);
  assert.deepEqual(fullSchema.properties.turn, studentSchema.properties.turn);
  assert.deepEqual(fullSchema.properties.student_view, studentSchema.properties.student_view);
  assert.deepEqual(fullSchema.properties.evidence_ids, studentSchema.properties.evidence_ids);
});

test("결합 schema와 수업 지침은 full turn을 학생 runtime 계약으로 사용하지 않는다", async () => {
  const [fullSchema, prompt, system, teacherMode] = await Promise.all([
    readFile(join(root, "skills", "teach-grounded-scenarios", "schemas", "lesson-turn.schema.json"), "utf8"),
    readFile(join(root, "skills", "teach-grounded-scenarios", "prompts", "05-lesson-turn.prompt.md"), "utf8"),
    readFile(join(root, "skills", "teach-grounded-scenarios", "instructions", "system.md"), "utf8"),
    readFile(join(root, "skills", "teach-grounded-scenarios", "references", "teacher-mode.md"), "utf8")
  ]);

  assert.match(fullSchema, /개발 회귀검사와 접근이 분리된 교사용 흐름/u);
  assert.match(fullSchema, /학생 경로는 student-lesson-turn\.schema\.json/u);
  assert.match(prompt, /student-lesson-turn\.schema\.json/u);
  assert.match(prompt, /결합 객체를 먼저 생성한 뒤 숨기지 않는다/u);
  assert.match(prompt, /학생 런타임은 기억 델타를 만들지 않는다/u);
  assert.match(system, /평문 `\[교사 검토\]`.*인증/u);
  assert.match(system, /공개 가능한 관찰 기준과 검증 가능한 출처/u);
  assert.match(teacherMode, /접근이 분리되고 교사 인증이 확인된 별도 사본 또는 flow/u);
  assert.match(teacherMode, /공개 가능한 관찰 기준과 검증 가능한 출처/u);
});

test("새 JSON·실행 소스는 UTF-8 무BOM이고 사람용 CJK 지침은 UTF-8-SIG다", async () => {
  for (const relativePath of [
    "skills/teach-grounded-scenarios/schemas/student-lesson-turn.schema.json",
    "skills/teach-grounded-scenarios/scripts/project-student-lesson-turn.mjs",
    "tests/student-teacher-output-separation.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${relativePath}은 무BOM이어야 한다`);
  }
  for (const relativePath of [
    "skills/teach-grounded-scenarios/prompts/05-lesson-turn.prompt.md",
    "skills/teach-grounded-scenarios/instructions/system.md",
    "skills/teach-grounded-scenarios/references/teacher-mode.md"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${relativePath}은 UTF-8-SIG여야 한다`);
  }
});
