import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepositoryTextIntegrity, inspectTextBytes } from "../scripts/check-text-integrity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const utf8 = (value) => Buffer.from(value, "utf8");
const utf8Sig = (value) => Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8(value)]);

test("CJK 사람용 문서는 UTF-8-SIG, JSON·YAML·웹 소스는 무BOM만 허용한다", () => {
  assert.deepEqual(inspectTextBytes(utf8Sig("# 한글\n"), "guide.md"), []);
  assert.deepEqual(inspectTextBytes(utf8('{"한글":true}\n'), "data.json"), []);
  assert.deepEqual(inspectTextBytes(utf8("한글: true\n"), "config.yaml"), []);
  assert.deepEqual(inspectTextBytes(utf8('process.stdout.write("한글");\n'), "tool.mjs"), []);
  assert.deepEqual(inspectTextBytes(utf8('export const 안내 = () => <p>한글</p>;\n'), "page.tsx"), []);
  assert.deepEqual(inspectTextBytes(utf8('.안내::before { content: "한글"; }\n'), "theme.css"), []);

  assert.match(inspectTextBytes(utf8("# 한글\n"), "guide.md").join("\n"), /UTF-8-SIG/u);
  assert.match(inspectTextBytes(utf8Sig('{"한글":true}\n'), "data.json").join("\n"), /기계 판독/u);
  assert.match(inspectTextBytes(utf8Sig("한글: true\n"), "config.yaml").join("\n"), /기계 판독/u);
  assert.match(inspectTextBytes(utf8Sig('export const 제목 = "한글";\n'), "page.tsx").join("\n"), /기계 판독/u);
  assert.match(inspectTextBytes(utf8Sig('.안내 { content: "한글"; }\n'), "theme.css").join("\n"), /기계 판독/u);
});

test("잘못된 UTF-8과 대표적인 mojibake 흔적은 fail-closed로 차단한다", () => {
  const invalidUtf8 = Buffer.from([0xED, 0xA0, 0x80]);
  assert.match(inspectTextBytes(invalidUtf8, "bad.json").join("\n"), /유효한 UTF-8/u);
  assert.match(inspectTextBytes(utf8Sig("깨짐: \uFFFD\n"), "bad.md").join("\n"), /U\+FFFD/u);
  assert.match(inspectTextBytes(utf8Sig("제목\uFEFF본문\n"), "bad.md").join("\n"), /본문 중간 BOM/u);
  assert.match(inspectTextBytes(utf8Sig("It\u00E2\u20AC\u2122s broken\n"), "bad.md").join("\n"), /이중 디코딩/u);
  assert.match(inspectTextBytes(utf8Sig("\u00ED\u2022\u0153\n"), "bad.md").join("\n"), /CJK UTF-8/u);
  assert.match(inspectTextBytes(utf8('export const 손상 = "\uFFFD";\n'), "bad.tsx").join("\n"), /U\+FFFD/u);
  assert.match(inspectTextBytes(utf8('.broken { content: "\u0085"; }\n'), "bad.css").join("\n"), /C1 제어문자/u);
  assert.match(inspectTextBytes(utf8('<p>제목\uFEFF본문</p>\n'), "bad.html").join("\n"), /본문 중간 BOM/u);
  assert.match(inspectTextBytes(utf8('<text>\u00ED\u2022\u0153</text>\n'), "bad.svg").join("\n"), /CJK UTF-8/u);
});

test("현재 저장소에는 배포를 차단할 문자 손상이 없다", async () => {
  assert.deepEqual(await checkRepositoryTextIntegrity(undefined, { skipWindows: true }), []);
});

test("package.json CJK 설명은 원본 UTF-8 바이트에서 정확히 왕복된다", async () => {
  const bytes = await readFile(join(root, "package.json"));
  assert.deepEqual(inspectTextBytes(bytes, "package.json"), []);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  assert.equal(parsed.description, "초3~고2 근거 기반 시나리오 수업 Skill 프로토타입");
});

test("apps/web의 웹 소스도 활성 저장소 문자 무결성 검사 범위에 포함된다", async () => {
  assert.deepEqual(await checkRepositoryTextIntegrity(join(root, "apps", "web")), []);
});

test("웹 빌드 산출물은 제외하지만 apps/web/src 원본은 계속 검사한다", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "reverse-text-integrity-"));
  context.after(() => rm(sandbox, { recursive: true, force: true }));

  const sourceDirectory = join(sandbox, "apps", "web", "src");
  const generatedDirectories = [
    join(sandbox, "apps", "web", ".next"),
    join(sandbox, "apps", "web", ".vercel"),
    join(sandbox, "apps", "web", "coverage"),
    join(sandbox, "apps", "web", "node_modules")
  ];
  await mkdir(sourceDirectory, { recursive: true });
  for (const directory of generatedDirectories) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "generated.js"), "const 손상 = '\uFFFD';\n", "utf8");
  }

  const sourcePath = join(sourceDirectory, "page.tsx");
  await writeFile(sourcePath, "export default function Page() { return <p>정상</p>; }\n", "utf8");
  assert.deepEqual(await checkRepositoryTextIntegrity(sandbox), []);

  await writeFile(sourcePath, "export default function Page() { return <p>\uFFFD</p>; }\n", "utf8");
  const errors = await checkRepositoryTextIntegrity(sandbox);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /apps\/web\/src\/page\.tsx: U\+FFFD/u);
});
