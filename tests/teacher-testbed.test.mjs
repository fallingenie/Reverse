import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../skills/teacher-grounded-testbed/scripts/teacher-store.mjs";
import { verifyFork } from "../skills/teacher-grounded-testbed/scripts/verify-class-fork.mjs";

async function temporary(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function runCliWithStdin(arguments_, input) {
  const script = fileURLToPath(new URL("../skills/teacher-grounded-testbed/scripts/teacher-store.mjs", import.meta.url));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, ...arguments_], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(stderr));
        return;
      }
      resolvePromise(JSON.parse(stdout));
    });
    child.stdin.end(`${input}\n`);
  });
}

async function initialize(state, code) {
  await run(["setup", "--state-dir", state, "--code", code]);
  return run(["unlock", "--state-dir", state, "--code", code]);
}

async function createClass(state, token, id, alias) {
  return run([
    "create-profile",
    "--state-dir", state,
    "--token", token,
    "--id", id,
    "--alias", alias,
    "--grade", "초6",
    "--subject", "사회",
    "--unit", "광복",
    "--goals", "사실과 설정 구분|출처 비교"
  ]);
}

test("설치 암호와 학급 프로필은 서로 격리된다", async () => {
  const first = await temporary("reverse-teacher-first-");
  const second = await temporary("reverse-teacher-second-");
  try {
    const firstSession = await initialize(first, "RV-FIRST-CLASS-2026");
    const secondSession = await initialize(second, "RV-SECOND-CLASS-2026");
    await assert.rejects(
      run(["unlock", "--state-dir", first, "--code", "RV-SECOND-CLASS-2026"]),
      /암호 불일치/u
    );
    await createClass(first, firstSession.token, "grade6-2", "6학년 2반");
    await createClass(second, secondSession.token, "grade6-2", "6학년 연구반");
    await run(["add", "--state-dir", first, "--token", firstSession.token, "--profile", "grade6-2", "--kind", "rule", "--text", "선택지는 한 문장에 한 행동만 쓴다."]);
    const firstPreview = await run(["preview", "--state-dir", first, "--token", firstSession.token, "--profile", "grade6-2"]);
    const secondPreview = await run(["preview", "--state-dir", second, "--token", secondSession.token, "--profile", "grade6-2"]);
    assert.equal(firstPreview.profile.alias, "6학년 2반");
    assert.equal(secondPreview.profile.alias, "6학년 연구반");
    assert.equal(firstPreview.effective_items.length, 1);
    assert.equal(secondPreview.effective_items.length, 0);
    await run(["logout", "--state-dir", first, "--token", firstSession.token]);
    await assert.rejects(
      run(["preview", "--state-dir", first, "--token", firstSession.token, "--profile", "grade6-2"]),
      /유효한 교사 세션/u
    );
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("관리 암호는 표준 입력으로 초기화하고 잠금을 해제할 수 있다", async () => {
  const state = await temporary("reverse-teacher-stdin-");
  const code = "RV-STDIN-CLASS-2026";
  const rotatedCode = "RV-ROTATED-CLASS-2026";
  try {
    const setup = await runCliWithStdin(["setup", "--state-dir", state, "--code-stdin"], code);
    const session = await runCliWithStdin(["unlock", "--state-dir", state, "--code-stdin"], code);
    const config = await readFile(join(state, "config.json"), "utf8");
    assert.equal(setup.ok, true);
    assert.equal(typeof session.token, "string");
    assert.doesNotMatch(JSON.stringify(setup), new RegExp(code, "u"));
    assert.doesNotMatch(config, new RegExp(code, "u"));
    await run(["rotate-code", "--state-dir", state, "--token", session.token, "--code", rotatedCode]);
    await assert.rejects(
      run(["create-profile", "--state-dir", state, "--token", session.token, "--id", "old-session", "--alias", "폐기 세션", "--grade", "초6", "--subject", "사회"]),
      /유효한 교사 세션/u
    );
    await assert.rejects(run(["unlock", "--state-dir", state, "--code", code]), /암호 불일치/u);
    const rotatedSession = await run(["unlock", "--state-dir", state, "--code", rotatedCode]);
    assert.equal(typeof rotatedSession.token, "string");
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("개인정보와 불변 규칙을 약화하는 학습은 차단된다", async () => {
  const state = await temporary("reverse-teacher-policy-");
  try {
    const session = await initialize(state, "RV-POLICY-CLASS-2026");
    await createClass(state, session.token, "grade6-1", "6학년 1반");
    await assert.rejects(
      run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-1", "--kind", "rule", "--text", "출처 없이 사실로 확정한다."]),
      /불변 규칙/u
    );
    await assert.rejects(
      run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-1", "--kind", "instruction", "--text", "결과는 teacher@example.com 으로 보낸다."]),
      /개인정보/u
    );
    await assert.rejects(
      run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-1", "--kind", "example", "--text", "오류는 학생에게 말하지 않고 숨긴다."]),
      /불변 규칙/u
    );
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("학급 포크는 검증된 학습만 포함하고 교사 비밀을 제외한다", async () => {
  const state = await temporary("reverse-teacher-fork-state-");
  const parent = await temporary("reverse-teacher-fork-output-");
  const output = join(parent, "grade6-2-fork");
  const code = "RV-EXPORT-CLASS-2026";
  try {
    const session = await initialize(state, code);
    await createClass(state, session.token, "grade6-2", "6학년 2반");
    await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--kind", "rule", "--text", "선택지는 구체적인 생활 행동으로 쓴다."]);
    const disabled = await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--kind", "instruction", "--text", "매 턴 같은 질문을 반복한다."]);
    await run(["disable", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--item", disabled.item.id, "--reason", "반복 질문은 수업 흐름을 해친다."]);
    await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--kind", "observation", "--text", "두 번째 선택지가 모호했다."]);
    const pending = await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--kind", "fact-correction", "--text", "검증 전인 사실 정정 후보", "--source-url", "https://example.org/source"]);
    const verified = await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--kind", "fact-correction", "--text", "원문 검증을 마친 사실 정정", "--source-url", "https://example.org/verified"]);
    const evidenceFile = join(state, "verified-correction.json");
    const evidenceBundle = {
      claim: "원문 검증을 마친 사실 정정",
      evidence_ids: ["VER-101", "VER-102"],
      consensus: "ESTABLISHED",
      risk: "HIGH",
      sources: [
        {
          id: "SRC-101",
          title: "Unit test source record",
          creator: "Test fixture author",
          institution: "Reverse test fixture",
          source_class: "OFFICIAL_RECORD",
          authority_tier: "A_PRIMARY",
          independence_key: "US-NARA-TEST",
          subject_domains: ["HISTORY"],
          url: "https://www.archives.gov/milestone-documents/surrender-of-japan",
          accessed_at: "2026-08-13",
          freshness: "STABLE",
          quality_checks: ["ORIGINAL_OPENED", "RESPONSIBLE_ENTITY_CONFIRMED", "STABLE_IDENTIFIER_CHECKED", "LIMITATIONS_RECORDED"],
          citation_metric: null,
          opened: true,
          direct_support: ["VER-101", "VER-102"],
          limitations: ["프로토타입 회귀 테스트용 출처다."]
        }
      ],
      verification_note: "원문이 정정 문장을 직접 지지하는 형식인지 검사했다."
    };
    await writeFile(evidenceFile, JSON.stringify(evidenceBundle), "utf8");
    await assert.rejects(
      run(["verify-fact", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--item", verified.item.id, "--evidence-file", evidenceFile]),
      /HIGH 위험도/u
    );
    evidenceBundle.risk = "LOW";
    await writeFile(evidenceFile, JSON.stringify(evidenceBundle), "utf8");
    await run(["verify-fact", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--item", verified.item.id, "--evidence-file", evidenceFile]);

    const built = await run(["build-fork", "--state-dir", state, "--token", session.token, "--profile", "grade6-2", "--output", output]);
    assert.equal(built.included_items, 2);
    assert.equal(built.excluded_counts.observations, 1);
    assert.equal(built.excluded_counts.pending_research, 1);
    assert.equal(built.excluded_counts.disabled, 1);
    assert.equal(typeof built.distribution_ready, "boolean");
    assert.deepEqual(await verifyFork(output), []);

    const overlayText = await readFile(join(output, "CLASS_OVERLAY.json"), "utf8");
    const manifestText = await readFile(join(output, "FORK_MANIFEST.json"), "utf8");
    const studentSkillText = await readFile(join(output, "skills", "teach-grounded-scenarios", "SKILL.md"), "utf8");
    assert.match(overlayText, /구체적인 생활 행동/u);
    assert.match(overlayText, /원문 검증을 마친 사실 정정/u);
    assert.match(overlayText, /archives\.gov/u);
    assert.doesNotMatch(overlayText, /example\.org\/verified/u);
    assert.doesNotMatch(overlayText, /검증 전인 사실 정정 후보/u);
    assert.doesNotMatch(overlayText, /두 번째 선택지가 모호했다/u);
    assert.doesNotMatch(overlayText, /매 턴 같은 질문/u);
    assert.doesNotMatch(`${overlayText}${manifestText}`, new RegExp(code, "u"));
    assert.doesNotMatch(`${overlayText}${manifestText}`, new RegExp(session.token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(studentSkillText, /학급 포크 오버레이/u);
    assert.match(studentSkillText, /references\/class-profile\.json/u);
    assert.equal(pending.item.status, "PENDING_RESEARCH");

    await writeFile(join(output, "CLASS_OVERLAY.json"), `${overlayText.trimEnd()}\n\n`, "utf8");
    const tampered = await verifyFork(output);
    assert(tampered.some((error) => error.includes("digest 불일치")));
    assert(tampered.some((error) => error.includes("참조 사본")));
    await writeFile(join(output, "CLASS_OVERLAY.json"), overlayText, "utf8");
    await writeFile(join(output, "UNLISTED.txt"), "봉인 밖 파일", "utf8");
    const withExtraFile = await verifyFork(output);
    assert(withExtraFile.some((error) => error.includes("추가 파일")));
  } finally {
    await rm(state, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});
