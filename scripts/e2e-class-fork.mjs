#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../skills/teacher-grounded-testbed/scripts/teacher-store.mjs";
import { verifyFork } from "../skills/teacher-grounded-testbed/scripts/verify-class-fork.mjs";

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  const requireDistributionReady = process.argv.includes("--require-distribution-ready");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "reverse-class-fork-e2e-"));
  const state = join(temporaryRoot, "state");
  const output = join(temporaryRoot, "student-fork");
  const code = `RV-E2E-${randomBytes(10).toString("base64url")}`;
  let report;
  try {
    await run(["setup", "--state-dir", state, "--code", code]);
    const session = await run(["unlock", "--state-dir", state, "--code", code]);
    await run([
      "create-profile",
      "--state-dir", state,
      "--token", session.token,
      "--id", "grade6-e2e",
      "--alias", "6학년 검증반",
      "--grade", "초6",
      "--subject", "사회",
      "--unit", "광복",
      "--goals", "사실과 설정 구분|근거 비교"
    ]);
    await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-e2e", "--kind", "rule", "--text", "선택지는 학생이 확인할 수 있는 행동으로 쓴다."]);
    await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-e2e", "--kind", "observation", "--text", "교사에게만 남길 미리보기 관찰이다."]);
    await run(["add", "--state-dir", state, "--token", session.token, "--profile", "grade6-e2e", "--kind", "fact-correction", "--text", "검증되지 않아 학생에게 배포하면 안 되는 정정이다.", "--source-url", "https://example.org/pending"]);

    const built = await run(["build-fork", "--state-dir", state, "--token", session.token, "--profile", "grade6-e2e", "--output", output]);
    const errors = await verifyFork(output, { requireDistributionReady });
    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }

    const exportedText = (await Promise.all((await listFiles(output)).map((path) => readFile(path, "utf8")))).join("\n");
    for (const secret of [code, session.token, "교사에게만 남길 미리보기 관찰", "검증되지 않아 학생에게 배포하면 안 되는 정정"]) {
      if (exportedText.includes(secret)) {
        throw new Error("학생 포크에 교사 비밀 또는 제외 대상 항목이 포함되었습니다.");
      }
    }
    const manifest = JSON.parse(await readFile(join(output, "FORK_MANIFEST.json"), "utf8"));
    report = {
      ok: true,
      fork_id: built.fork_id,
      seal_sha256: built.seal_sha256,
      distribution_ready: built.distribution_ready,
      base_state: manifest.base.source_state,
      base_commit: manifest.base.commit,
      base_content_sha256: manifest.base.content_sha256,
      base_file_count: manifest.base.file_count,
      included_items: built.included_items,
      excluded_counts: built.excluded_counts
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  report.temporary_data_removed = true;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
