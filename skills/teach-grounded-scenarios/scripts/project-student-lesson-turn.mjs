#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOP_LEVEL_KEYS = ["turn", "student_view", "evidence_ids"];
const STUDENT_VIEW_KEYS = ["scene", "clues", "thinking_question", "choices", "custom_input_allowed"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushExactKeyIssues(value, allowedKeys, path, issues) {
  const allowed = new Set(allowedKeys);
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) {
      issues.push({ code: "REQUIRED_FIELD_MISSING", path: `${path}/${key}` });
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({ code: "FIELD_NOT_ALLOWED", path: `${path}/${key}` });
    }
  }
}

function pushStringArrayIssues(value, path, { minimum = 0, maximum = Infinity, unique = false } = {}, issues) {
  if (!Array.isArray(value)) {
    issues.push({ code: "ARRAY_REQUIRED", path });
    return;
  }
  if (value.length < minimum || value.length > maximum) {
    issues.push({ code: "ARRAY_LENGTH_INVALID", path });
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      issues.push({ code: "NON_EMPTY_STRING_REQUIRED", path: `${path}/${index}` });
    }
  });
  if (unique && new Set(value).size !== value.length) {
    issues.push({ code: "DUPLICATE_ITEM", path });
  }
}

export function validateStudentLessonTurn(value) {
  const issues = [];
  if (!isRecord(value)) {
    return [{ code: "OBJECT_REQUIRED", path: "$" }];
  }

  pushExactKeyIssues(value, TOP_LEVEL_KEYS, "$", issues);
  if (!Number.isInteger(value.turn) || value.turn < 1) {
    issues.push({ code: "TURN_INVALID", path: "$/turn" });
  }

  if (!isRecord(value.student_view)) {
    issues.push({ code: "OBJECT_REQUIRED", path: "$/student_view" });
  } else {
    pushExactKeyIssues(value.student_view, STUDENT_VIEW_KEYS, "$/student_view", issues);
    for (const key of ["scene", "thinking_question"]) {
      if (typeof value.student_view[key] !== "string" || value.student_view[key].length === 0) {
        issues.push({ code: "NON_EMPTY_STRING_REQUIRED", path: `$/student_view/${key}` });
      }
    }
    pushStringArrayIssues(value.student_view.clues, "$/student_view/clues", { minimum: 1 }, issues);
    pushStringArrayIssues(value.student_view.choices, "$/student_view/choices", { minimum: 2, maximum: 4 }, issues);
    if (value.student_view.custom_input_allowed !== true) {
      issues.push({ code: "CUSTOM_INPUT_MUST_BE_TRUE", path: "$/student_view/custom_input_allowed" });
    }
  }

  pushStringArrayIssues(value.evidence_ids, "$/evidence_ids", { unique: true }, issues);
  return issues;
}

export function assertStudentLessonTurn(value) {
  const issues = validateStudentLessonTurn(value);
  if (issues.length > 0) {
    throw studentTurnError(issues);
  }
  return value;
}

function studentTurnError(issues) {
  const error = new TypeError(`학생용 수업 턴 계약 위반: ${issues.map((issue) => `${issue.code}@${issue.path}`).join(", ")}`);
  error.code = "STUDENT_LESSON_TURN_INVALID";
  error.issues = issues;
  return error;
}

function cloneStudentFields(source, { rejectUnknown = false } = {}) {
  if (!isRecord(source)) {
    throw new TypeError("학생용 수업 턴의 원본은 객체여야 합니다.");
  }
  const studentView = isRecord(source.student_view) ? source.student_view : {};
  if (rejectUnknown) {
    const boundaryIssues = [];
    pushExactKeyIssues(source, TOP_LEVEL_KEYS, "$", boundaryIssues);
    if (isRecord(studentView)) {
      pushExactKeyIssues(studentView, STUDENT_VIEW_KEYS, "$/student_view", boundaryIssues);
    }
    if (boundaryIssues.length > 0) {
      throw studentTurnError(boundaryIssues);
    }
  }
  return {
    turn: source.turn,
    student_view: {
      scene: studentView.scene,
      clues: Array.isArray(studentView.clues) ? [...studentView.clues] : studentView.clues,
      thinking_question: studentView.thinking_question,
      choices: Array.isArray(studentView.choices) ? [...studentView.choices] : studentView.choices,
      custom_input_allowed: studentView.custom_input_allowed
    },
    evidence_ids: Array.isArray(source.evidence_ids) ? [...source.evidence_ids] : source.evidence_ids
  };
}

export function createStudentLessonTurn(value) {
  return assertStudentLessonTurn(cloneStudentFields(value, { rejectUnknown: true }));
}

export function projectStudentLessonTurn(developerFixture) {
  return assertStudentLessonTurn(cloneStudentFields(developerFixture));
}

export function serializeStudentLessonTurn(value, { developerFixture = false } = {}) {
  const result = developerFixture
    ? projectStudentLessonTurn(value)
    : createStudentLessonTurn(value);
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function runCli() {
  const arguments_ = process.argv.slice(2);
  const developerFixture = arguments_.includes("--from-developer-fixture");
  const paths = arguments_.filter((argument) => argument !== "--from-developer-fixture");
  if (paths.length < 1 || paths.length > 2) {
    throw new Error("사용법: node project-student-lesson-turn.mjs [--from-developer-fixture] <입력.json> [출력.json]");
  }
  const inputText = (await readFile(resolve(paths[0]), "utf8")).replace(/^\uFEFF/u, "");
  const output = serializeStudentLessonTurn(JSON.parse(inputText), { developerFixture });
  if (paths[1]) {
    await writeFile(resolve(paths[1]), output, "utf8");
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
