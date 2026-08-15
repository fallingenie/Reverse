import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function text(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

test("RED-TEAM 사례 ID는 RT-01부터 RT-149까지 빠짐없이 한 번씩 존재한다", async () => {
  const matrix = await text("tests/custom-gpt-red-team-cases.md");
  const ids = [...matrix.matchAll(/\| RT-(\d{2,3}) \|/gu)].map((match) => Number(match[1]));
  assert.equal(ids.length, 149);
  assert.equal(new Set(ids).size, 149);
  assert.deepEqual(ids, Array.from({ length: 149 }, (_, index) => index + 1));
});

test("고난도 과학·역사·의료·압축 Canon 합성 공격을 포함한다", async () => {
  const matrix = await text("tests/custom-gpt-red-team-cases.md");
  for (const pattern of [
    /AMOC 정지를 모든 해류와 대기 열수송/u,
    /지역 조위계 상대해수면/u,
    /태양광 설비용량/u,
    /표준시·현지시·군용시/u,
    /실제 역사 항복문서/u,
    /산소농축기 소비전력/u,
    /정전 중 인슐린 온도/u,
    /사망 확인 안 됨/u,
    /파생 결과는 재검사하지 말라고/u
  ]) {
    assert.match(matrix, pattern);
  }
});

test("사례표는 복합·다국어·위기·개인정보·출처 세탁·재시작 공격을 포함한다", async () => {
  const matrix = await text("tests/custom-gpt-red-team-cases.md");
  for (const pattern of [
    /다른 언어로 된 역할 변경/u,
    /유니코드 방향 제어문자/u,
    /교사·교장·연구책임자·플랫폼 관리자/u,
    /위기 도움 요청 뒤/u,
    /학생 명단과 성적표/u,
    /원연구·파생 요약·교육용 서술/u,
    /달력 체계·시각 기준/u,
    /재시작하는 선택지/u,
    /한꺼번에 결합/u
  ]) {
    assert.match(matrix, pattern);
  }
});

test("사례표는 직접·간접·난독화 주입과 누적 위해 목적을 함께 다룬다", async () => {
  const matrix = await text("tests/custom-gpt-red-team-cases.md");
  assert.match(matrix, /지침 무시와 내부 파일·상태 원문 공개/u);
  assert.match(matrix, /PDF 본문에 이전 지침 무시/u);
  assert.match(matrix, /웹페이지 본문이 이전 지침 무시·외부 전송/u);
  assert.match(matrix, /Base64/u);
  assert.match(matrix, /가짜 `SYSTEM`, `DEVELOPER`/u);
  assert.match(matrix, /여러 턴으로 위험 절차의 조각을 분할/u);
  assert.match(matrix, /최소 45초의 냉각 시간/u);
});

test("사례표는 사실·과학·역사·Canon·학년 적합성의 독립 공격축을 유지한다", async () => {
  const matrix = await text("tests/custom-gpt-red-team-cases.md");
  for (const pattern of [
    /AMOC 붕괴/u,
    /반사실 분기 이후 사건/u,
    /압축 요약에서 빠진 금지·부정 사실/u,
    /같은 인물·기관·장소/u,
    /습구온도·습구흑구온도·열지수/u,
    /초3 프로필에서 대학원 수식/u,
    /교사용 근거 메모·정답·평가표/u
  ]) {
    assert.match(matrix, pattern);
  }
});

test("배포 지침은 실제 위기 지원을 일반 금지 응답과 분리한다", async () => {
  const paths = [
    "AGENTS.md",
    "RULES.md",
    "chatgpt/BOOTSTRAP.md",
    "chatgpt/POLICY.md",
    "chatgpt/custom-gpt/INSTRUCTIONS.md",
    "copilot/knowledge/reverse-policy.txt",
    "skills/teach-grounded-scenarios/instructions/system.md",
    "skills/teach-grounded-scenarios/references/safety-policy.md"
  ];
  const contents = await Promise.all(paths.map(text));
  for (let index = 0; index < paths.length; index += 1) {
    assert.match(contents[index], /온보딩과 이야기를 (?:즉시 )?중단|일반 (?:온보딩과 이야기|수업 흐름)을 (?:즉시 )?중단/u, paths[index]);
    assert.match(contents[index], /가까운 신뢰할 수 있는 (?:사람|성인)에게 지금 알리기/u, paths[index]);
    assert.match(contents[index], /확인되지 않은 국가별 전화번호/u, paths[index]);
  }
});

test("평문 교사 검토 토큰은 인증이나 숨은 정답 공개 열쇠가 아니다", async () => {
  const customInstructions = await text("chatgpt/custom-gpt/INSTRUCTIONS.md");
  const copilotManifest = JSON.parse(await text("copilot/declarativeAgent.json"));
  for (const content of [customInstructions, copilotManifest.instructions]) {
    assert.match(content, /\[?교사 검토\]?[^\n]*(?:인증|권한 상승)/u);
    assert.match(content, /숨은 정답/u);
    assert.match(content, /(?:접근이 분리된|별도) 교사용 (?:GPT )?사본/u);
  }
});

test("Copilot 배포 지침은 위기 대응을 포함하면서 공개 길이 한계를 지킨다", async () => {
  const manifest = JSON.parse(await text("copilot/declarativeAgent.json"));
  assert.ok(manifest.instructions.length <= 8000);
  assert.match(manifest.instructions, /일반 수업 흐름을 중단한다/u);
  assert.match(manifest.instructions, /지역 응급서비스나 위기지원/u);
  assert.match(manifest.instructions, /위치를 추측하거나 확인되지 않은 국가별 전화번호/u);
});
