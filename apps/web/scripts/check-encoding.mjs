import {readdir, readFile} from 'node:fs/promises';
import {basename, extname, join, relative} from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SKIP_DIRECTORIES = new Set([
  '.astryx-reference',
  '.git',
  '.next',
  '.vercel',
  'coverage',
  'node_modules',
  'out',
]);
const MACHINE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.mjs',
  '.ndjson',
  '.svg',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const HUMAN_EXTENSIONS = new Set(['.md', '.ps1', '.txt']);
const HUMAN_FILE_NAMES = new Set(['LICENSE', 'NOTICE']);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const decoder = new TextDecoder('utf-8', {fatal: true});
const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const mojibakePattern =
  /(?:\u00c3.|\u00c2.|\u00e2[\u20ac-\u2122]|\u00ef\u00bb\u00bf|\u00f0\u0178)/u;

async function collectFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolutePath)));
    if (entry.isFile()) files.push(absolutePath);
  }

  return files;
}

const failures = [];
const files = await collectFiles(ROOT);

for (const file of files) {
  const extension = extname(file).toLowerCase();
  const humanFile =
    HUMAN_EXTENSIONS.has(extension) || HUMAN_FILE_NAMES.has(basename(file));
  if (!MACHINE_EXTENSIONS.has(extension) && !humanFile) {
    continue;
  }

  const bytes = await readFile(file);
  const hasBom = bytes.subarray(0, 3).equals(UTF8_BOM);
  let text;

  try {
    text = decoder.decode(hasBom ? bytes.subarray(3) : bytes);
  } catch {
    failures.push(`${relative(ROOT, file)}: 올바른 UTF-8이 아닙니다.`);
    continue;
  }

  if (MACHINE_EXTENSIONS.has(extension) && hasBom) {
    failures.push(`${relative(ROOT, file)}: 실행 소스는 UTF-8 무BOM이어야 합니다.`);
  }
  if (humanFile && !hasBom) {
    failures.push(`${relative(ROOT, file)}: 사람 편집 문서는 UTF-8-SIG여야 합니다.`);
  }
  if (text.includes('\ufeff')) {
    failures.push(`${relative(ROOT, file)}: 파일 중간 BOM이 있습니다.`);
  }
  if (text.includes('\ufffd')) {
    failures.push(`${relative(ROOT, file)}: U+FFFD 대체 문자가 있습니다.`);
  }
  if (/[\u0080-\u009f]/u.test(text)) {
    failures.push(`${relative(ROOT, file)}: C1 제어 문자가 있습니다.`);
  }
  if (mojibakePattern.test(text)) {
    failures.push(`${relative(ROOT, file)}: 대표적인 이중 디코딩 흔적이 있습니다.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${files.length}개 파일의 문자 무결성을 확인했습니다.`);
}
