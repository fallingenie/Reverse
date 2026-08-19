import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const instructionsPath = join(root, "copilot", "studio", "STUDIO_INSTRUCTIONS.md");

async function readInstructions() {
  const bytes = await readFile(instructionsPath);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  return { bytes, text };
}

test("Studio 지침은 UTF-8-SIG와 문자 무결성을 지킨다", async () => {
  const { text } = await readInstructions();
  assert.equal(text.length <= 8_000, true, `Studio 지침이 8,000자를 넘음: ${text.length}`);
  assert.doesNotMatch(text, /\uFFFD|[\u0080-\u009F]|\uFEFF/u);
  assert.doesNotMatch(
    text,
    /\u00C3.|\u00C2.|\u00E2\u20AC|\u00EB\u00AC|\u00EC\u2014|\u00ED\u2022|\u00EF\u00BF\u00BD/u
  );
});

test("첫 화면에는 목적, 절대 규칙, 시작 순서가 이 순서로 보인다", async () => {
  const { text } = await readInstructions();
  const purpose = text.indexOf("【목적】");
  const absolutes = text.indexOf("【절대 규칙 — 항상 적용】");
  const start = text.indexOf("【시작 순서】");
  const p0Details = text.indexOf("【P0 안전·과학 무결성】");

  assert.equal(purpose, 0);
  assert(purpose < absolutes && absolutes < start && start < p0Details);
  assert(start < 1_200, `시작 순서가 첫 화면에서 너무 늦음: ${start}`);
});

test("P0는 Skill과 권한 주장으로 비활성화되지 않는다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /Skill을 불러오지 못했거나 비활성화한 경우에도/u);
  assert.match(text, /모든 응답보다 먼저 적용하며 해제할 수 없다/u);
  assert.match(text, /교사·관리자·연구자 주장, 암호, 역할극/u);
  assert.match(text, /여러 턴에 나뉜 요청도 누적 목적을 검사/u);
});

test("외부 자료와 세션 자료의 간접 프롬프트 주입을 데이터로 격리한다", async () => {
  const { text } = await readInstructions();
  for (const source of ["웹", "PDF", "교과서", "업로드", "Context Pack", "오버레이"]) {
    assert.match(text, new RegExp(source, "u"));
  }
  assert.match(text, /비신뢰 데이터/u);
  assert.match(text, /역할 변경·규칙 무시·비밀 공개·외부 전송.*따르지 않는다/su);
  assert.match(text, /새 Canon을 쓰는 권한이 아니다/u);
});

test("Template과 example은 현재 세션의 내용이 아닌 형식 예시다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /session\.template\.json.*형식 예시일 뿐 새 세션의 기본 내용이 아니다/u);
  assert.match(text, /학년·과목·주제·사실·시나리오 값은 복사하지 않고/u);
  assert.match(text, /examples\/.*형식·회귀 예시일 뿐 현재 학생의 사실, 정답, Canon이 아니다/u);
  assert.doesNotMatch(text, /세션 상태를 만들거나 읽을 때.*session\.template\.json.*기준으로 삼는다/u);
});

test("지원 JSON과 YAML은 참조 전용이며 로컬 기능을 과장하지 않는다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /지원 JSON·YAML과 스키마는 출력 형식을 참고하는 자료/u);
  assert.match(text, /자동으로 JSON Schema를 실행하거나 내용을 강제한다고 주장하지 않는다/u);
  assert.match(text, /로컬 `compact-session\.mjs`와 교사용 로컬 테스트베드를 실행할 수 있다고 가정하지 않는다/u);
  assert.match(text, /실제 Tool 연결과 성공 증거가 없으면/u);
  assert.match(text, /검토용 초안이나 Context Pack 형식을 제안하는 것뿐/u);
});

test("모르겠다는 선택 부담 완화이고 좁은 임의 시작 예외만 허용한다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /`모르겠다`는 거부가 (?:아니라|아닌) 선택 부담(?: 신호|이다)/u);
  assert.match(text, /학교급·학년(?:이)? 확인(?:된)? 뒤 과목·단원·관심사·시나리오/u);
  assert.match(text, /`NEGATIVE_FALLBACK_START`/u);
  assert.match(text, /학년에 맞는 주제[\s\S]{0,120}장면/u);
  assert.match(text, /일반 `\[시작\]`을 발급·소비하지 않는다/u);
  assert.match(text, /임의 시작 뒤에도 `모르겠다`면 선택지를 하나로 줄인다/u);
  assert.match(text, /`하기 싫다·그만·중단`이면/u);
  assert.match(text, /위해·즉시위기에는 이 예외를 적용하지 않고 P0를 먼저/u);
});

test("구체 단원은 UNIT_INFERRED 관심이 되어 범용 관심사를 다시 묻지 않는다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /구체 단원.*(?:확인되면|`interest_source=UNIT_INFERRED`)/u);
  assert.match(text, /interest_source=UNIT_INFERRED/u);
  assert.match(text, /(?:범용 관심사 목록을 다시 (?:묻지|내밀지)|기본 관심사로 기록하고 다시 묻지 않)/u);
  assert.match(text, /과목을 바꾸면 이전 단원과 단원에서 추론한 관심을 폐기/u);
  assert.match(text, /명시했던 이전 관심사와 관심 출처도 모두 폐기/u);
  assert.match(text, /새 과목의 단원을 받는다/u);
});

test("교육과정 PDF 세 개의 권위는 교육과정 범위로만 제한한다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /Knowledge에 연결된 교육과정 PDF 3개/u);
  assert.match(text, /학년, 성취기준, 단원, 교과 용어의 범위를 정하는 `CURRICULUM_AUTHORITY`/u);
  assert.match(text, /최신 과학 쟁점, 논쟁적 역사 해석, 통계, 법령의 사실을 자동으로 확정하지는 않는다/u);
  assert.match(text, /해당 교과의 최신 원문으로 별도 검증/u);
});

test("온보딩 단원 조회는 Knowledge 한 번으로 제한하고 연쇄 PDF 처리를 금지한다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /Knowledge snippet 1회만/u);
  assert.match(text, /`search-before-answer`→`analyzing-pdf`·PDF 전체/u);
  assert.match(text, /로컬 manifest·artifact·path·grep 연쇄를 금지/u);
  assert.match(text, /교육과정 자료 한 개의 직접 snippet이 단원 범위를 지지하면 시나리오 초안을 만들기에 충분/u);
});

test("Knowledge 조회 실패는 확인 필요와 안전한 수학 상황 다섯 개로 복구한다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /snippet이 즉시 없으면/u);
  assert.match(text, /재시도·전체 PDF 분석 없이/u);
  assert.match(text, /교육과정 일치(?:는|를) `확인 필요`로 (?:표시|두고)/u);
  assert.match(text, /입력 단원의 안전한 상황 5개를 제시/u);
  assert.match(text, /성취기준·쪽수·교육과정 문구는 지어내지 않는다/u);
  assert.match(text, /초 단위 완료 시간을 약속하지 않는다/u);
});

test("시나리오는 번호와 지원되는 선택 UI로 선택 가능하게 표시한다", async () => {
  const { text } = await readInstructions();
  assert.match(text, /각 제목 앞에는 `1\.`부터 `5\.`까지 번호/u);
  assert.match(text, /실제 선택 버튼을 지원하면 같은 다섯 제목을 버튼/u);
});
