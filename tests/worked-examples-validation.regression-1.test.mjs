import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  discoverExampleFixtures,
  validateExampleCatalogCoverage,
  validateNoHarmfulProceduralDetails,
  validateSafetyRedTeamCases,
  validateSourceOpeningBoundary,
  validateVerifiedQualityGateEvidence
} from "../scripts/validate.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDirectory = join(root, "skills", "teach-grounded-scenarios", "examples");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("full worked example은 재귀 발견되고 카탈로그와 양방향으로 연결된다", async () => {
  const discovery = await discoverExampleFixtures(examplesDirectory);
  const catalog = await json(join(examplesDirectory, "cross-domain-catalog.json"));

  assert.deepEqual(discovery.errors, []);
  assert.ok(discovery.lessons.length >= 6);
  assert.deepEqual(validateExampleCatalogCoverage(catalog, discovery.lessons, discovery.safety), []);

  const incompleteCatalog = structuredClone(catalog);
  incompleteCatalog.worked_examples.shift();
  assert.ok(
    validateExampleCatalogCoverage(incompleteCatalog, discovery.lessons, discovery.safety)
      .some((error) => error.includes("카탈로그에 등록되지 않은 full example"))
  );
});

test("재귀 발견기는 session과 lesson-turn 중 한쪽만 추가된 예시를 P0로 거부한다", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "reverse-worked-example-"));
  try {
    const nested = join(temporary, "grade-5", "new-example");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "session.json"), "{}\n", "utf8");

    const incomplete = await discoverExampleFixtures(temporary);
    assert.ok(incomplete.errors.some((error) => error.includes("full example JSON 쌍 누락")));

    await writeFile(join(nested, "lesson-turn.json"), "{}\n", "utf8");
    const paired = await discoverExampleFixtures(temporary);
    assert.deepEqual(paired.errors, []);
    assert.equal(paired.lessons[0].path, "grade-5/new-example");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("안전 경계 red-team 형식은 필수 위기 연결과 차단 invariant 누락을 거부한다", async () => {
  const path = join(
    examplesDirectory,
    "safety-boundaries",
    "self-harm-imminent-risk",
    "red-team-cases.json"
  );
  const fixture = await json(path);
  assert.deepEqual(validateSafetyRedTeamCases(fixture), []);

  const missingHelp = structuredClone(fixture);
  missingHelp.global_assertions.must_include = missingHelp.global_assertions.must_include
    .filter((value) => value !== "혼자 있지 않기");
  assert.ok(
    validateSafetyRedTeamCases(missingHelp)
      .some((error) => error.includes("필수 도움 연결 invariant 누락"))
  );

  const missingBoundary = structuredClone(fixture);
  missingBoundary.global_assertions.must_not_include = missingBoundary.global_assertions.must_not_include
    .filter((value) => value !== "계획을 구체화하는 질문");
  assert.ok(
    validateSafetyRedTeamCases(missingBoundary)
      .some((error) => error.includes("필수 차단 invariant 누락"))
  );
});

test("full example 안전 감사는 실행 가능한 위해 수치와 절차 순서를 거부한다", () => {
  assert.deepEqual(
    validateNoHarmfulProceduralDetails("질량이 10 mg인 안전한 교실 표본을 관찰한다."),
    []
  );
  assert.ok(
    validateNoHarmfulProceduralDetails("가상의 치사 약물 10 mg을 투여한다.")
      .some((error) => error.includes("구체적인 위해 용량"))
  );
  assert.ok(
    validateNoHarmfulProceduralDetails("1단계에서 먼저 점화하고 다음 단계에서 조립한다.")
      .some((error) => error.includes("위해 절차 순서"))
  );
});

test("원문을 열지 못한 출처는 열린 공식 페이지와 접근 한계를 분리하고 모순을 거부한다", async () => {
  const path = join(examplesDirectory, "grade-9", "korean-war-source-comparison", "session.json");
  const fixture = await json(path);
  const limitedSources = fixture.sources.filter((source) => ["SRC-01", "SRC-05", "SRC-06"].includes(source.id));

  for (const source of limitedSources) {
    assert.ok(!source.quality_checks.includes("ORIGINAL_OPENED"));
    assert.deepEqual(validateSourceOpeningBoundary(source, source.id), []);

    const contradictory = structuredClone(source);
    contradictory.quality_checks.push("ORIGINAL_OPENED");
    assert.ok(
      validateSourceOpeningBoundary(contradictory, source.id)
        .some((error) => error.includes("ORIGINAL_OPENED와 원문 접근 실패 기록이 모순"))
    );
  }
});

test("claim quality gate는 DERIVED와 UNKNOWN을 포함한 VERIFIED 외 근거를 모두 거부한다", async () => {
  const path = join(examplesDirectory, "grade-9", "korean-war-source-comparison", "session.json");
  const fixture = await json(path);
  const mutated = structuredClone(fixture);
  mutated.research.plan.claim_quality_gates[0].evidence_ids.push("DER-001", "DER-002", "UNK-001");

  const errors = validateVerifiedQualityGateEvidence(mutated, "grade-9 fixture");
  for (const evidenceId of ["DER-001", "DER-002", "UNK-001"]) {
    assert.ok(errors.some((error) => error.includes(evidenceId)), `${evidenceId} 거부 오류가 필요합니다.`);
  }
});

test("grade-9 시작 화면은 후속 확인용 공식 원문 링크를 보존한다", async () => {
  const path = join(examplesDirectory, "grade-9", "korean-war-source-comparison", "opening-turn.md");
  const opening = await readFile(path, "utf8");

  assert.match(opening, /원문:/u);
  assert.match(opening, /https:\/\/docs\.un\.org\/S\/RES\/82%281950%29/u);
  assert.match(opening, /https:\/\/www\.trumanlibrary\.gov\/library\/public-papers\/173\/statement-president-situation-korea/u);
  assert.match(opening, /https:\/\/www\.archives\.gov\/research\/military\/korean-war/u);
});
