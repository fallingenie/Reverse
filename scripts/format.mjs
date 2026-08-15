#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bomExtensions = new Set([".md", ".ps1", ".txt"]);
const machineExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".mjs",
  ".ndjson",
  ".svg",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const bomNames = new Set(["LICENSE", "NOTICE"]);
const machineNames = new Set([".gitattributes", ".gitignore", "pnpm-lock.yaml"]);
const textExtensions = new Set([...bomExtensions, ...machineExtensions]);
const textNames = new Set([...bomNames, ...machineNames]);

function requiresUtf8Sig(path) {
  const name = path.split(/[\\/]/u).at(-1);
  if (machineNames.has(name)) {
    return false;
  }
  return bomNames.has(name) || bomExtensions.has(extname(name));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", ".reverse-local", ".venv", "__pycache__", "node_modules", "coverage", "build", "dist"].includes(entry.name) || entry.name.endsWith(".egg-info")) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else if (textExtensions.has(extname(entry.name)) || textNames.has(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

for (const path of await walk(root)) {
  const input = await readFile(path, "utf8");
  const normalized = `${input.replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n").replace(/[ \t]+$/gmu, "").replace(/\n+$/u, "")}\n`;
  const output = requiresUtf8Sig(path) ? `\uFEFF${normalized}` : normalized;
  if (output !== input) {
    await writeFile(path, output, "utf8");
  }
}
