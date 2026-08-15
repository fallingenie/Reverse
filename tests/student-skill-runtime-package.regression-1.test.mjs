import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildStudentSkillRuntime,
  createStudentSkillRuntimePackage,
  excludedStudentRuntimeSources,
  verifyPublishedStudentSkillRuntime
} from "../scripts/build-student-skill-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedNames = [
  "SKILL.md",
  "prompts/01-onboarding.prompt.md",
  "prompts/02-research-plan.prompt.md",
  "prompts/03-source-audit.prompt.md",
  "prompts/04-scenario-cards.prompt.md",
  "prompts/05-lesson-turn.prompt.md",
  "prompts/07-debrief.prompt.md",
  "references/grade-bands.md",
  "references/evidence-policy.md",
  "references/domain-policies.md",
  "references/source-quality.md",
  "references/safety-policy.md",
  "references/research-workflow.md",
  "references/dialogue-state-contract.md",
  "references/learner-profile-policy.md",
  "schemas/source-record.schema.json",
  "schemas/evidence.schema.json",
  "schemas/research-plan.schema.json",
  "schemas/student-lesson-turn.schema.json"
];

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function findEndOfCentralDirectory(archive) {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054B50) {
      return offset;
    }
  }
  throw new Error("ZIP 중앙 디렉터리 끝 레코드가 없습니다.");
}

function parseStoredZip(archive) {
  const eocd = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocd + 10);
  let centralOffset = archive.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(centralOffset), 0x02014B50, `${index}번 중앙 레코드 signature`);
    const compression = archive.readUInt16LE(centralOffset + 10);
    const expectedCrc = archive.readUInt32LE(centralOffset + 16);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");

    assert.equal(compression, 0, `${name}: 저장 방식 ZIP만 허용한다`);
    assert.equal(compressedSize, uncompressedSize, `${name}: 저장 방식 크기가 일치해야 한다`);
    assert.equal(archive.readUInt32LE(localOffset), 0x04034B50, `${name}: local header signature`);
    assert.equal(archive.readUInt16LE(localOffset + 8), 0, `${name}: local compression`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8");
    assert.equal(localName, name, `${name}: 중앙·로컬 이름 일치`);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + compressedSize);
    assert.equal(data.length, uncompressedSize, `${name}: 데이터 크기`);
    assert.equal(crc32(data), expectedCrc, `${name}: CRC-32`);
    entries.push({ name, data });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(new Set(entries.map((entry) => entry.name)).size, entries.length, "ZIP 이름이 중복되면 안 된다");
  return entries;
}

test("학생 Skill runtime은 allowlist의 공개 안전 파일만 패키징한다", async () => {
  const { archive, manifest } = await createStudentSkillRuntimePackage(root);
  const entries = parseStoredZip(archive);
  const names = entries.map((entry) => entry.name);
  assert.deepEqual(names, expectedNames);
  assert.equal(manifest.audience, "STUDENT_PUBLIC_SAFE");
  assert.equal(manifest.generation_contract, "DIRECT_STUDENT_SCHEMA_ONLY");
  assert.equal(manifest.file_count, entries.length);
  assert.deepEqual(manifest.files.map((file) => file.path), expectedNames);
  for (const [index, entry] of entries.entries()) {
    assert.equal(createHash("sha256").update(entry.data).digest("hex"), manifest.files[index].sha256);
    assert.equal(entry.data.length, manifest.files[index].bytes);
  }
  assert(Buffer.isBuffer(archive));
  assert(archive.length > 0);
  assert(names.includes("SKILL.md"));
  assert(names.includes("schemas/student-lesson-turn.schema.json"));
  assert(!names.some((name) => /examples|teacher-mode|session\.schema|memory-delta|(?<!student-)lesson-turn\.schema|scripts/u.test(name)));
});

test("학생 Skill runtime의 어느 바이트에도 교사용·기억 변경 인터페이스가 없다", async () => {
  const { archive } = await createStudentSkillRuntimePackage(root);
  const entries = parseStoredZip(archive);
  const combined = entries.map((entry) => entry.data.toString("utf8")).join("\n");
  assert.doesNotMatch(
    combined,
    /teacher_view|assessment_note|misconception_watch|memory_delta|teacher-grounded-testbed/u
  );
  assert.match(combined, /공개 가능한 관찰 기준과 검증 가능한 출처/u);
  assert.match(combined, /접근이 분리되고 인증된 별도 교사용 사본 또는 flow/u);
  assert.match(combined, /첫 카드부터 차례로 `1\.`, `2\.`, `3\.`, `4\.`, `5\.`/u);
  assert.match(combined, /실제 선택 버튼을 지원하면 같은 다섯 제목을 버튼/u);
});

test("full fixture와 교사용 경로는 학생 Skill manifest에서 이유와 함께 제외된다", () => {
  const excluded = new Map(excludedStudentRuntimeSources.map((entry) => [entry.source, entry.reason]));
  for (const path of [
    "skills/teach-grounded-scenarios/schemas/lesson-turn.schema.json",
    "skills/teach-grounded-scenarios/schemas/session.schema.json",
    "skills/teach-grounded-scenarios/schemas/memory-delta.schema.json",
    "skills/teach-grounded-scenarios/references/teacher-mode.md",
    "skills/teach-grounded-scenarios/examples",
    "skills/teacher-grounded-testbed"
  ]) {
    assert(excluded.get(path), `${path}의 제외 이유가 필요하다`);
  }
});

test("학생 Skill runtime의 Markdown은 UTF-8-SIG, JSON은 UTF-8 무BOM이다", async () => {
  const { archive } = await createStudentSkillRuntimePackage(root);
  const entries = parseStoredZip(archive);
  for (const entry of entries) {
    const hasBom = [...entry.data.subarray(0, 3)].join(",") === "239,187,191";
    if (entry.name.endsWith(".md")) {
      assert.equal(hasBom, true, `${entry.name}은 UTF-8-SIG여야 한다`);
    } else if (entry.name.endsWith(".json")) {
      assert.equal(hasBom, false, `${entry.name}은 UTF-8 무BOM이어야 한다`);
      assert.doesNotThrow(() => JSON.parse(entry.data.toString("utf8")));
    }
  }

  for (const relativePath of [
    "scripts/build-student-skill-runtime.mjs",
    "tests/student-skill-runtime-package.regression-1.test.mjs"
  ]) {
    const bytes = await readFile(join(root, relativePath));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  }
});

test("학생 Skill runtime의 지원 파일 참조는 ZIP 안에서 닫혀 있다", async () => {
  const { archive } = await createStudentSkillRuntimePackage(root);
  const entries = parseStoredZip(archive);
  const names = new Set(entries.map((entry) => entry.name));
  for (const entry of entries.filter(({ name }) => name.endsWith(".md"))) {
    const text = entry.data.toString("utf8");
    for (const match of text.matchAll(/`([^`]+\.(?:md|json))`/gu)) {
      const reference = match[1];
      const direct = posix.normalize(reference);
      const relative = posix.normalize(posix.join(posix.dirname(entry.name), reference));
      assert(names.has(direct) || names.has(relative), `${entry.name}: 누락된 지원 파일 ${reference}`);
    }
  }
});

test("학생 Skill archive와 seal은 같은 원본에서 결정적으로 재현된다", async () => {
  const first = await createStudentSkillRuntimePackage(root);
  const second = await createStudentSkillRuntimePackage(root);
  assert(first.archive.equals(second.archive));
  assert.equal(first.manifest.archive_sha256, second.manifest.archive_sha256);
  assert.equal(first.manifest.seal_sha256, second.manifest.seal_sha256);
});

test("ZIP이 아닌 출력 경로는 manifest가 archive를 덮어쓰기 전에 거부한다", async () => {
  await assert.rejects(
    () => buildStudentSkillRuntime({ outputPath: join(root, ".reverse-local", "copilot-skill", "invalid-output.json") }),
    /\.zip 확장자/u
  );
});

test("archive, manifest, COMPLETE 해시는 하나의 fail-closed 배포 세트를 이룬다", async (t) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "reverse-student-skill-"));
  const outputPath = join(outputDirectory, "student-runtime.zip");
  const manifestPath = join(outputDirectory, "student-runtime.manifest.json");
  const completePath = join(outputDirectory, "student-runtime.complete.json");
  t.after(async () => {
    for (const path of [completePath, manifestPath, outputPath]) {
      await unlink(path).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    await rmdir(outputDirectory);
  });

  const result = await buildStudentSkillRuntime({ outputPath, root });
  assert.match(result.complete_path, /student-runtime\.complete\.json$/u);
  const published = await verifyPublishedStudentSkillRuntime({ outputPath });
  assert.equal(published.complete.status, "COMPLETE");
  assert.equal(published.manifest.archive_sha256, result.archive_sha256);

  await writeFile(manifestPath, "{}\n", "utf8");
  await assert.rejects(
    () => verifyPublishedStudentSkillRuntime({ outputPath }),
    /manifest seal|manifest hash/u
  );
  await unlink(completePath);
  await assert.rejects(
    () => verifyPublishedStudentSkillRuntime({ outputPath }),
    /ENOENT/u
  );
});

test("manifest 게시가 실패하면 COMPLETE를 남기지 않고 배포 세트를 거부한다", async (t) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "reverse-student-skill-failure-"));
  const outputPath = join(outputDirectory, "student-runtime.zip");
  const manifestPath = join(outputDirectory, "student-runtime.manifest.json");
  const completePath = join(outputDirectory, "student-runtime.complete.json");
  await mkdir(manifestPath);
  t.after(async () => {
    for (const path of [completePath, outputPath]) {
      await unlink(path).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    await rmdir(manifestPath);
    await rmdir(outputDirectory);
  });

  await assert.rejects(() => buildStudentSkillRuntime({ outputPath, root }));
  await assert.rejects(() => readFile(completePath), /ENOENT/u);
  await assert.rejects(
    () => verifyPublishedStudentSkillRuntime({ outputPath }),
    /ENOENT|EISDIR/u
  );
});
