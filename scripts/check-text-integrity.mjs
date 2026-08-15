#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".reverse-local",
  ".vercel",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const humanExtensions = new Set([".md", ".ps1", ".txt"]);
const humanNames = new Set(["LICENSE", "NOTICE"]);
const machineExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".lock",
  ".mjs",
  ".ndjson",
  ".py",
  ".spec",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const machineNames = new Set([".editorconfig", ".gitattributes", ".gitignore", "pnpm-lock.yaml"]);
const textExtensions = new Set([...humanExtensions, ...machineExtensions]);
const textNames = new Set([...humanNames, ...machineNames]);
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const suspiciousPatterns = [
  [/\uFFFD/u, "U+FFFD 대체 문자"],
  [/[\u0080-\u009F]/u, "C1 제어문자"],
  [/\uFEFF/u, "본문 중간 BOM"],
  [/\u00EF\u00BB\u00BF/u, "BOM 바이트의 문자 오해석"],
  [/\u00C3[\u0080-\u00BF]/u, "UTF-8의 Latin-1 이중 디코딩 흔적"],
  [/\u00E2(?:\u20AC[\u009D\u0152\u0153\u201C\u201D\u2022\u2026\u2122]|\u0080[\u0098-\u009D])/u, "문장부호의 이중 디코딩 흔적"],
  [/\u00F0\u0178/u, "이모지의 Windows-1252 이중 디코딩 흔적"],
  [/[\u00EA-\u00EF](?:[\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u20AC\u2018-\u2022]){2}/u, "CJK UTF-8의 단일 바이트 이중 디코딩 흔적"]
];

function hasUtf8Sig(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
}

export function inspectTextBytes(bytes, path = "<memory>") {
  const errors = [];
  const name = basename(path);
  const extension = extname(name).toLowerCase();
  const hasBom = hasUtf8Sig(bytes);
  const requiresBom = (humanNames.has(name) || humanExtensions.has(extension)) && !machineNames.has(name);
  const forbidsBom = machineNames.has(name) || machineExtensions.has(extension);

  if (requiresBom && !hasBom) {
    errors.push(`${path}: 사람이 편집하는 CJK 텍스트에 UTF-8-SIG가 없습니다.`);
  }
  if (forbidsBom && hasBom) {
    errors.push(`${path}: 기계 판독 파일에 UTF-8 BOM이 있습니다.`);
  }

  let content;
  const payload = hasBom ? bytes.subarray(3) : bytes;
  try {
    content = utf8Decoder.decode(payload);
  } catch {
    errors.push(`${path}: 유효한 UTF-8이 아닙니다.`);
    return errors;
  }
  if (!Buffer.from(content, "utf8").equals(payload)) {
    errors.push(`${path}: UTF-8 바이트 왕복 결과가 원본과 다릅니다.`);
  }

  for (const [pattern, label] of suspiciousPatterns) {
    if (pattern.test(content)) {
      errors.push(`${path}: ${label}가 발견되었습니다.`);
    }
  }
  return errors;
}

async function walk(directory, options, isRoot = false) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      ignoredDirectories.has(entry.name)
      || entry.name.endsWith(".egg-info")
      || (isRoot && options.skipWindows && entry.name === "windows")
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path, options));
    } else if (textExtensions.has(extname(entry.name).toLowerCase()) || textNames.has(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

export async function checkRepositoryTextIntegrity(root = repositoryRoot, options = {}) {
  const normalizedOptions = { skipWindows: options.skipWindows === true };
  const errors = [];
  for (const path of await walk(root, normalizedOptions, true)) {
    const displayPath = relative(root, path).replaceAll("\\", "/");
    errors.push(...inspectTextBytes(await readFile(path), displayPath));
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkRepositoryTextIntegrity(repositoryRoot, { skipWindows: process.argv.includes("--active") })
    .then((errors) => {
      if (errors.length > 0) {
        process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write("CJK 문자 무결성 및 BOM 정책 검사 통과\n");
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
