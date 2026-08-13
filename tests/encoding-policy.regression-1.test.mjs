import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ignored = new Set([".git", ".reverse-local", ".venv", "__pycache__", "build", "coverage", "dist", "node_modules"]);
const humanExtensions = new Set([".md", ".ps1", ".txt", ".yaml", ".yml"]);
const humanNames = new Set(["LICENSE", "NOTICE"]);
const machineNames = new Set([".editorconfig", ".gitattributes", ".gitignore", "pnpm-lock.yaml"]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".egg-info")) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function hasUtf8Sig(contents) {
  return contents.length >= 3 && contents[0] === 0xEF && contents[1] === 0xBB && contents[2] === 0xBF;
}

test("사람이 편집하는 텍스트는 UTF-8-SIG이고 제어·기계 파일은 무BOM이다", async () => {
  for (const path of await walk(root)) {
    const name = path.split(/[\\/]/u).at(-1);
    const extension = extname(name);
    const contents = await readFile(path);

    if ((humanNames.has(name) || humanExtensions.has(extension)) && !machineNames.has(name)) {
      assert.equal(hasUtf8Sig(contents), true, `${path}: UTF-8-SIG 필요`);
    }

    if (machineNames.has(name) || [".json", ".jsonl", ".ndjson", ".mjs", ".js", ".py", ".toml", ".lock", ".spec"].includes(extension)) {
      assert.equal(hasUtf8Sig(contents), false, `${path}: 기계 파일은 무BOM이어야 함`);
    }
  }
});
