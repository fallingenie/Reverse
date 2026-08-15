#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const windowsRoot = join(root, "windows");
const candidates = process.platform === "win32"
  ? [
      process.env.REVERSE_PYTHON,
      join(windowsRoot, ".venv", "Scripts", "python.exe"),
      "python"
    ]
  : [
      process.env.REVERSE_PYTHON,
      join(windowsRoot, ".venv", "bin", "python"),
      "python3",
      "python"
    ];

let python = null;
for (const candidate of candidates.filter(Boolean)) {
  if (candidate.includes("\\") || candidate.includes("/")) {
    if (existsSync(resolve(candidate))) {
      python = resolve(candidate);
      break;
    }
  } else {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) {
      python = candidate;
      break;
    }
  }
}

if (!python) {
  process.stderr.write("Python 3.12~3.13 실행기를 찾지 못했습니다. windows/README.md의 환경 설정을 먼저 실행하세요.\n");
  process.exit(1);
}

const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "tests", "-v"],
  {
    cwd: windowsRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, PYTHONPATH: windowsRoot }
  }
);
process.exit(result.status ?? 1);
