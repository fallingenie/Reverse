#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, "skills", "teach-grounded-scenarios");
const example = join(skill, "examples", "grade-6", "1945-no-atomic-bomb");
const decoder = new TextDecoder("utf-8", { fatal: true });

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "coverage"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function text(path) {
  const buffer = await readFile(path);
  return decoder.decode(buffer);
}

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

export async function validateRepository() {
  const errors = [];
  const files = await walk(root);

  for (const file of files) {
    try {
      await text(file);
    } catch {
      errors.push(`UTF-8이 아닌 파일: ${relative(root, file)}`);
    }
  }

  const required = [
    "AGENTS.md",
    "RULES.md",
    "README.md",
    "LICENSE",
    "NOTICE",
    "package.json",
    "skills/teach-grounded-scenarios/SKILL.md",
    "skills/teach-grounded-scenarios/agents/openai.yaml",
    "skills/teach-grounded-scenarios/instructions/system.md",
    "skills/teach-grounded-scenarios/assets/session.template.json",
    "skills/teach-grounded-scenarios/examples/grade-6/1945-no-atomic-bomb/session.json"
  ];
  const fileSet = new Set(files.map((file) => relative(root, file).replaceAll("\\", "/")));
  for (const path of required) {
    assert(fileSet.has(path), `필수 파일 누락: ${path}`, errors);
  }

  const readme = await text(join(root, "README.md"));
  const license = await text(join(root, "LICENSE"));
  const notice = await text(join(root, "NOTICE"));
  assert(
    readme.includes("프로젝트는 Apache License 2.0에 따라 배포됩니다."),
    "README에 지정된 Apache 2.0 문구가 없습니다.",
    errors
  );
  assert(license.includes("Apache License") && license.includes("Version 2.0"), "LICENSE가 Apache 2.0이 아닙니다.", errors);
  assert(
    notice.includes("lemos999/Singulari-Tea-Codex-Prompt-for-Gemini") && notice.includes("fewweekslater"),
    "NOTICE에 원 프로젝트 고지가 없습니다.",
    errors
  );

  const agents = await text(join(root, "AGENTS.md"));
  for (const phrase of [
    "검증이 끝나기 전에 성공",
    "오래된 상태",
    "자료가 없다고 단정",
    "내부 오류나 근거 충돌을 삼키지 않는다",
    "진행 기록",
    "명시된 범위를 넘어"
  ]) {
    assert(agents.includes(phrase), `AGENTS 재발 방지 문구 누락: ${phrase}`, errors);
  }

  const skillFiles = [
    join(skill, "SKILL.md"),
    ...files.filter((file) => [
      join(skill, "instructions"),
      join(skill, "prompts"),
      join(skill, "references")
    ].some((directory) => file.startsWith(directory)))
  ];
  const forbidden = /Soulforged|\bSHN\b|월뮬|뮬월|정로|Singulari-Tea|\bCodex\b/u;
  for (const file of skillFiles) {
    const content = await text(file);
    assert(!forbidden.test(content), `운영 프롬프트에 원 프로젝트 고유 용어가 남음: ${relative(root, file)}`, errors);
  }

  const onboardingPrompt = await text(join(skill, "prompts", "01-onboarding.prompt.md"));
  for (const phrase of ["몇 학년", "과목이나 단원", "관심", "이야기나 예시 장면을 시작하지 않는다"]) {
    assert(onboardingPrompt.includes(phrase), `온보딩 질문 누락: ${phrase}`, errors);
  }

  const transcript = await text(join(example, "onboarding-transcript.md"));
  const scenarioSection = transcript.split("## 진행자 2")[1]?.split("번호를 고르거나")[0] ?? "";
  const cards = scenarioSection.match(/^[1-5]\. /gmu) ?? [];
  assert(cards.length === 5, `예시 시나리오 수가 5개가 아님: ${cards.length}`, errors);
  assert(transcript.includes("정확히 `[시작]`"), "예시 온보딩에 [시작] 게이트가 없습니다.", errors);
  assert(!transcript.includes("### 현재 장면"), "[시작] 전 예시에 장면이 포함되었습니다.", errors);

  const opening = await text(join(example, "opening-turn.md"));
  for (const label of ["[실제 역사에서 확인]", "[수업 가정]", "[아직 모름]"]) {
    assert(opening.includes(label), `첫 턴에 근거 표지가 없습니다: ${label}`, errors);
  }
  assert(opening.includes("직접 입력"), "첫 턴에 직접 입력 선택지가 없습니다.", errors);

  const schemaDirectory = join(skill, "schemas");
  const evidenceSchema = JSON.parse(await text(join(schemaDirectory, "evidence.schema.json")));
  const memoryDeltaSchema = JSON.parse(await text(join(schemaDirectory, "memory-delta.schema.json")));
  const lessonTurnSchema = JSON.parse(await text(join(schemaDirectory, "lesson-turn.schema.json")));
  const sessionSchema = JSON.parse(await text(join(schemaDirectory, "session.schema.json")));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schema of [evidenceSchema, memoryDeltaSchema, lessonTurnSchema, sessionSchema]) {
    ajv.addSchema(schema);
  }

  const validations = [
    ["https://example.org/reverse/session.schema.json", join(skill, "assets", "session.template.json")],
    ["https://example.org/reverse/session.schema.json", join(example, "session.json")],
    ["https://example.org/reverse/lesson-turn.schema.json", join(example, "lesson-turn.json")]
  ];
  for (const [schemaId, path] of validations) {
    const data = JSON.parse(await text(path));
    const validate = ajv.getSchema(schemaId);
    if (!validate(data)) {
      errors.push(`${relative(root, path)} 스키마 오류: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    }
  }

  const session = JSON.parse(await text(join(example, "session.json")));
  const sourceIds = new Set(session.sources.map((source) => source.id));
  const evidenceIds = new Set(session.evidence.map((record) => record.id));
  for (const record of session.evidence) {
    for (const sourceId of record.source_ids) {
      assert(sourceIds.has(sourceId), `존재하지 않는 출처 참조: ${record.id} -> ${sourceId}`, errors);
    }
    for (const parentId of record.derived_from ?? []) {
      assert(evidenceIds.has(parentId), `존재하지 않는 근거 참조: ${record.id} -> ${parentId}`, errors);
    }
  }
  for (const source of session.sources) {
    assert(source.url.startsWith("https://"), `HTTPS가 아닌 출처: ${source.id}`, errors);
  }

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateRepository()
    .then((errors) => {
      if (errors.length > 0) {
        process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write("저장소 계약 검증 통과\n");
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
