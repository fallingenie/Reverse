#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const textExtensions = new Set([".json", ".md", ".mjs", ".yaml", ".yml"]);
const textNames = new Set([".gitattributes", ".gitignore", "LICENSE", "NOTICE"]);

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
  const output = `${input.replaceAll("\r\n", "\n").replace(/[ \t]+$/gmu, "").replace(/\n+$/u, "")}\n`;
  if (output !== input) {
    await writeFile(path, output, "utf8");
  }
}
