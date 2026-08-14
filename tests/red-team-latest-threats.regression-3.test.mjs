import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

function parseRows(markdown) {
  return new Map(
    [...markdown.matchAll(/^\| (RT-(\d{2,3})) \| ([^\n|]+) \| ([^\n|]+) \|$/gmu)].map((match) => [
      match[1],
      { number: Number(match[2]), attack: match[3].trim(), expected: match[4].trim() }
    ])
  );
}

test("RED-TEAM 사례 ID는 RT-01부터 RT-149까지 연속이며 중복되지 않는다", async () => {
  const markdown = await text("tests/custom-gpt-red-team-cases.md");
  const rows = parseRows(markdown);
  const numbers = [...rows.values()].map((row) => row.number);
  const rawRowCount = [...markdown.matchAll(/^\| RT-/gmu)].length;
  assert.equal(rows.size, rawRowCount, "일부 Markdown 행이 엄격한 표 파서에서 누락됨");
  assert.equal(rows.size, 149);
  assert.deepEqual(numbers, Array.from({ length: 149 }, (_, index) => index + 1));
  const normalizedAttacks = [...rows.values()].map((row) => row.attack.normalize("NFKC"));
  const normalizedExpected = [...rows.values()].map((row) => row.expected.normalize("NFKC"));
  assert.equal(new Set(normalizedAttacks).size, normalizedAttacks.length, "완전히 같은 공격 설명이 중복됨");
  assert.equal(new Set(normalizedExpected).size, normalizedExpected.length, "완전히 같은 기대 동작이 중복됨");
  for (const [id, row] of rows) {
    assert.ok(row.attack.length >= 1, `${id}: 공격 설명이 비어 있음`);
    assert.ok(row.expected.length >= 1, `${id}: 기대 동작이 비어 있음`);
    if (row.number >= 116) {
      assert.ok(row.attack.length >= 20, `${id}: 신규 공격 설명이 너무 짧음`);
      assert.ok(row.expected.length >= 30, `${id}: 신규 기대 동작이 너무 짧음`);
    }
  }
});

test("최신 공격 보강은 문서·기억·출처·도구 상태·다국어·장기 사회공학을 독립 사례로 둔다", async () => {
  const rows = parseRows(await text("tests/custom-gpt-red-team-cases.md"));
  const required = new Map([
    ["RT-116", /OCR 숨은 층/u],
    ["RT-117", /검색 청크/u],
    ["RT-119", /다음 학급 포크/u],
    ["RT-120", /설명·스키마·제공자 정보가 나중에 바뀌었는데/u],
    ["RT-121", /실제 호출 없이/u],
    ["RT-124", /AI로 요약/u],
    ["RT-126", /며칠 뒤/u],
    ["RT-127", /학생 B 세션/u],
    ["RT-130", /여러 도메인의 문서 수십 개/u],
    ["RT-131", /문단 전체를 확정/u],
    ["RT-132", /같은 URL의 문서가 내용·날짜·첨부파일을 바꿨는데/u],
    ["RT-135", /유니코드 태그/u],
    ["RT-136", /동형문자/u],
    ["RT-137", /번역 도구/u],
    ["RT-138", /친밀감·긴급성/u],
    ["RT-139", /도구 실행 완료/u],
    ["RT-146", /URL 경로·쿼리·리디렉션/u],
    ["RT-147", /정상 업무 절차/u],
    ["RT-148", /고위험 도구 인자/u],
    ["RT-149", /계속할까요/u]
  ]);

  for (const [id, pattern] of required) {
    assert.ok(rows.has(id), `${id} 누락`);
    assert.match(rows.get(id).attack, pattern, id);
  }
  assert.match(rows.get("RT-146").expected, /정확한 URL과 최종 목적지/u);
  assert.match(rows.get("RT-147").expected, /과업 밖 계획 이탈은 실행하지 않고/u);
  assert.match(rows.get("RT-148").expected, /공격자 통제 입력/u);
  assert.match(rows.get("RT-149").expected, /모호한 동의를 승인으로 승격하지 않는다/u);
});

test("정상 방어·윤리·교실 활동·교사 교정에는 과잉거절하지 않는다", async () => {
  const rows = parseRows(await text("tests/custom-gpt-red-team-cases.md"));
  for (const id of ["RT-140", "RT-141", "RT-142", "RT-143", "RT-144", "RT-145"]) {
    const expected = rows.get(id)?.expected ?? "";
    assert.match(expected, /설명|평가|분석|제공|등록|제시/u, id);
    assert.doesNotMatch(expected, /^전체를 거절/u, id);
  }
  assert.match(rows.get("RT-140").expected, /전체 질문을 거절하지 않는다/u);
  assert.match(rows.get("RT-141").expected, /문서 전체를 폐기하거나 무조건 거절하지 않는다/u);
  assert.match(rows.get("RT-144").expected, /정정을 무조건 거절하지 않는다/u);
});

test("RT-116부터 RT-149까지 공식·1차·동료심사 출처와 적용 한계를 가진다", async () => {
  const provenance = JSON.parse(await text("tests/red-team-primary-source-map.json"));
  assert.equal(provenance.kind, "offline-test-design-provenance-not-live-results");
  assert.equal(provenance.scope, "RT-116..RT-149");

  const sourceById = new Map(provenance.sources.map((source) => [source.id, source]));
  assert.equal(sourceById.size, provenance.sources.length);
  assert.ok(provenance.sources.filter((source) => source.type.startsWith("peer-reviewed")).length >= 4);

  const expectedCaseIds = Array.from({ length: 34 }, (_, index) => `RT-${116 + index}`);
  assert.deepEqual(Object.keys(provenance.cases), expectedCaseIds);

  const allowedHosts = new Set([
    "doi.org",
    "genai.owasp.org",
    "github.com",
    "developer.microsoft.com",
    "www.microsoft.com",
    "learn.microsoft.com",
    "openai.com",
    "atlas.mitre.org",
    "proceedings.iclr.cc",
    "www.usenix.org",
    "proceedings.mlr.press"
  ]);

  for (const source of provenance.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, "https:", source.id);
    assert.ok(allowedHosts.has(url.hostname), `${source.id}: 허용되지 않은 호스트 ${url.hostname}`);
    assert.ok(source.supports.length >= 30, `${source.id}: 직접 지지 범위가 너무 짧음`);
    assert.ok(source.limits.length >= 20, `${source.id}: 적용 한계가 너무 짧음`);
  }

  for (const [caseId, sourceIds] of Object.entries(provenance.cases)) {
    assert.ok(sourceIds.length >= 1, `${caseId}: 출처 없음`);
    for (const sourceId of sourceIds) {
      assert.ok(sourceById.has(sourceId), `${caseId}: 존재하지 않는 출처 ${sourceId}`);
    }
  }
});

test("출처 지도는 라이브 모델 통과나 플랫폼 보장을 주장하지 않는다", async () => {
  const provenance = await text("tests/red-team-primary-source-map.json");
  assert.match(provenance, /offline-test-design-provenance-not-live-results/u);
  assert.doesNotMatch(provenance, /live-pass|live_pass|라이브 통과 완료/u);
});
