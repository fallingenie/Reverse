#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function protectedIds(session) {
  const memory = session.memory ?? {};
  const groups = [
    session.evidence ?? [],
    memory.canon ?? [],
    memory.negative_facts ?? [],
    memory.corrections ?? [],
    memory.open_threads ?? [],
    memory.episode_archive ?? []
  ];

  return groups
    .flat()
    .filter((item) => item?.must_keep === true)
    .map((item) => item.id)
    .filter(Boolean)
    .sort();
}

export function compactSession(session, sourceText = JSON.stringify(session)) {
  const compacted = structuredClone(session);
  const before = protectedIds(session);
  let removedDetails = 0;

  compacted.memory.episode_archive = compacted.memory.episode_archive.map((episode) => {
    const next = {
      id: episode.id,
      turn: episode.turn,
      student_choice: episode.student_choice,
      result: episode.result,
      evidence_ids: episode.evidence_ids,
      must_keep: episode.must_keep
    };

    if (episode.detail) {
      removedDetails += 1;
    }

    return next;
  });

  if (removedDetails > 0) {
    compacted.memory.discarded_detail_summary.push(
      `에피소드의 반복 묘사 ${removedDetails}개를 축약함`
    );
  }

  compacted.memory.compaction = {
    sequence: (session.memory.compaction?.sequence ?? 0) + 1,
    source_revision: session.revision,
    source_sha256: createHash("sha256").update(sourceText, "utf8").digest("hex")
  };

  const after = protectedIds(compacted);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("압축 중 절대 보존 항목이 변경되었습니다.");
  }

  return compacted;
}

async function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    throw new Error("사용법: node compact-session.mjs <input.json> [output.json]");
  }

  const inputPath = resolve(inputArg);
  const outputPath = outputArg ? resolve(outputArg) : null;
  if (outputPath && inputPath === outputPath) {
    throw new Error("원본 세션을 덮어쓸 수 없습니다. 다른 출력 경로를 사용하세요.");
  }

  const sourceText = await readFile(inputPath, "utf8");
  const session = JSON.parse(sourceText);
  const compacted = compactSession(session, sourceText);
  const output = `${JSON.stringify(compacted, null, 2)}\n`;

  if (outputPath) {
    await writeFile(outputPath, output, "utf8");
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
