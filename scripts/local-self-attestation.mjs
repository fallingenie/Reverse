#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { arch, homedir, platform, release, tmpdir, type } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = resolve(dirname(scriptPath), "..");
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const temporaryPrefix = "reverse-local-attest-";
const ignoredDigestDirectories = new Set([".venv", "__pycache__", "build", "dist"]);
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const secretPatterns = [
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gu],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu],
  ["authorization-header", /\bauthorization\s*:\s*(?:bearer|basic)\s+\S+/giu],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu],
  [
    "assigned-secret",
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?(?!<|\*|REDACTED|CHANGEME|EXAMPLE)[^\s"']{8,}/giu
  ]
];

const validationPlan = [
  { id: "install", command: pnpmExecutable, args: ["install", "--frozen-lockfile"], timeoutMs: 15 * 60_000 },
  { id: "validate", command: pnpmExecutable, args: ["run", "validate"], timeoutMs: 5 * 60_000 },
  { id: "node-tests", command: pnpmExecutable, args: ["test"], timeoutMs: 15 * 60_000 },
  { id: "verify-active-exports", command: pnpmExecutable, args: ["run", "verify:exports:active"], timeoutMs: 5 * 60_000 },
  { id: "verify-copilot-schema", command: pnpmExecutable, args: ["run", "verify:copilot"], timeoutMs: 5 * 60_000 },
  { id: "build-copilot-package", command: pnpmExecutable, args: ["run", "copilot:package"], timeoutMs: 5 * 60_000 },
  { id: "validate-copilot-package", command: pnpmExecutable, args: ["run", "copilot:validate-package"], timeoutMs: 10 * 60_000 },
  { id: "dependency-audit", command: pnpmExecutable, args: ["audit", "--audit-level", "low"], timeoutMs: 10 * 60_000 },
  { id: "diff-check", command: "git", args: ["diff", "--check"], timeoutMs: 60_000 }
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function scanForSecrets(text) {
  const findings = [];
  for (const [id, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      findings.push(id);
    }
  }
  return findings;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function sanitizeAbsoluteUserPaths(text, roots = []) {
  let sanitized = text;
  let replacements = 0;
  const candidates = [...new Set([homedir(), ...roots].filter(Boolean).map((value) => resolve(value)))]
    .sort((left, right) => right.length - left.length);

  for (const root of candidates) {
    const variants = [
      root,
      root.replaceAll("\\", "/"),
      root.replaceAll("\\", "\\\\")
    ];
    for (const variant of variants) {
      const pattern = new RegExp(escapeRegExp(variant), process.platform === "win32" ? "giu" : "gu");
      sanitized = sanitized.replace(pattern, () => {
        replacements += 1;
        return "<LOCAL_PATH>";
      });
    }
  }

  const genericPatterns = [
    /\b[A-Za-z]:\\\\Users\\\\[^\\/\s"']+/gu,
    /\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gu,
    /\/(?:home|Users)\/[^/\s"']+/gu
  ];
  for (const pattern of genericPatterns) {
    sanitized = sanitized.replace(pattern, () => {
      replacements += 1;
      return "<USER_HOME>";
    });
  }

  return { text: sanitized, replacements };
}

export function containsAbsoluteUserPath(text) {
  return /\b[A-Za-z]:\\\\Users\\\\[^\\/\s"']+|\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+|\/(?:home|Users)\/[^/\s"']+/u.test(text);
}

export function isSafeTemporaryRoot(path) {
  const resolvedPath = resolve(path);
  const resolvedTemp = resolve(tmpdir());
  return dirname(resolvedPath) === resolvedTemp
    && basename(resolvedPath).startsWith(temporaryPrefix)
    && basename(resolvedPath).length > temporaryPrefix.length;
}

export async function removeTemporaryRoot(path) {
  if (!isSafeTemporaryRoot(path)) {
    throw new Error(`안전하지 않은 임시 경로는 삭제하지 않습니다: ${path}`);
  }
  await rm(path, { recursive: true, force: true });
}

function utf8Sig(text) {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function captureCommand({ command, args = [], cwd, timeoutMs = 60_000, environment = {} }) {
  const startedAt = new Date();
  return await new Promise((resolvePromise) => {
    const stdout = [];
    const stderr = [];
    let spawnError = null;
    const requiresCommandShell = process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(command);
    let childCommand = command;
    let childArgs = args;
    if (requiresCommandShell) {
      const commandTokens = [command, ...args];
      if (commandTokens.some((token) => !/^[A-Za-z0-9_./\\:=@+,-]+$/u.test(token))) {
        throw new Error("Windows .cmd 인수에 허용되지 않은 문자가 있습니다.");
      }
      childCommand = process.env.ComSpec || "cmd.exe";
      childArgs = ["/d", "/s", "/c", commandTokens.join(" ")];
    }
    const child = spawn(childCommand, childArgs, {
      cwd,
      // Windows .cmd는 고정된 안전 문자 인수만 cmd.exe에 넘기고, Node의 shell 결합은 사용하지 않는다.
      shell: false,
      windowsHide: true,
      timeout: timeoutMs,
      env: {
        ...process.env,
        CI: "true",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        ...environment
      }
    });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (exitCode, signal) => {
      const endedAt = new Date();
      resolvePromise({
        argv: [command, ...args],
        started_at_utc: startedAt.toISOString(),
        ended_at_utc: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        exit_code: exitCode,
        signal,
        spawn_error: spawnError ? spawnError.message : null,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      });
    });
  });
}

async function runText(command, args, cwd, timeoutMs = 60_000) {
  const result = await captureCommand({ command, args, cwd, timeoutMs });
  if (result.exit_code !== 0 || result.signal || result.spawn_error) {
    throw new Error(`${[command, ...args].join(" ")} 실행 실패: ${result.exit_code ?? result.signal ?? result.spawn_error}`);
  }
  const stdout = textDecoder.decode(result.stdout).trim();
  const stderr = textDecoder.decode(result.stderr).trim();
  const findings = scanForSecrets(`${stdout}\n${stderr}`);
  if (findings.length > 0) {
    throw new Error(`도구 출력에서 비밀값 패턴 감지: ${findings.join(", ")}`);
  }
  return stdout;
}

async function runRawText(command, args, cwd, timeoutMs = 60_000) {
  const result = await captureCommand({ command, args, cwd, timeoutMs });
  if (result.exit_code !== 0 || result.signal || result.spawn_error) {
    throw new Error(`${[command, ...args].join(" ")} 실행 실패: ${result.exit_code ?? result.signal ?? result.spawn_error}`);
  }
  const stdout = textDecoder.decode(result.stdout);
  const stderr = textDecoder.decode(result.stderr);
  const findings = scanForSecrets(`${stdout}\n${stderr}`);
  if (findings.length > 0) {
    throw new Error(`도구 출력에서 비밀값 패턴 감지: ${findings.join(", ")}`);
  }
  return stdout;
}

export function parsePorcelainZ(value) {
  return value.split("\0").filter(Boolean).map((entry) => ({
    status: entry.slice(0, 2),
    path: entry.slice(3).replaceAll("\\", "/")
  }));
}

async function listDigestFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDigestDirectories.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listDigestFiles(path, base));
    } else if (entry.isFile()) {
      files.push({ path, relative: relative(base, path).replaceAll("\\", "/") });
    }
  }
  return files;
}

export async function directoryDigest(directory) {
  const files = (await listDigestFiles(directory)).sort((left, right) => left.relative.localeCompare(right.relative));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(await readFile(file.path));
    hash.update("\0");
  }
  return { file_count: files.length, sha256: hash.digest("hex") };
}

export function parseNodeTestCounts(output) {
  const values = {};
  for (const key of ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const match = output.match(new RegExp(`^(?:#|ℹ) ${key} (\\d+)$`, "mu"));
    if (match) {
      values[key] = Number.parseInt(match[1], 10);
    }
  }
  if (!Number.isInteger(values.tests) || !Number.isInteger(values.pass) || !Number.isInteger(values.fail)) {
    throw new Error("Node 시험 수를 출력에서 확인할 수 없습니다.");
  }
  return values;
}

export function parseToolkitValidationCount(output) {
  const match = output.match(/Summary:\s*(\d+) passed\./mu);
  if (!match) {
    throw new Error("Microsoft 365 Agents Toolkit 검사 수를 출력에서 확인할 수 없습니다.");
  }
  return { passed: Number.parseInt(match[1], 10), failed: 0 };
}

function repositorySlug(remoteUrl) {
  const withoutSuffix = remoteUrl.replace(/\.git$/u, "");
  const match = withoutSuffix.match(/github\.com[/:]([^/]+\/[^/]+)$/u);
  if (!match) {
    throw new Error("GitHub 원격 저장소 owner/repo를 확인할 수 없습니다.");
  }
  return match[1];
}

function assertSafeRemote(remoteUrl) {
  if (/^https?:\/\/[^/@]+:[^/@]+@/u.test(remoteUrl) || scanForSecrets(remoteUrl).length > 0) {
    throw new Error("원격 URL에 자격 증명이 포함되어 있어 기록할 수 없습니다.");
  }
}

function parseArguments(argv) {
  const options = {
    repositoryRoot: defaultRepositoryRoot,
    subject: "HEAD",
    remote: "origin",
    remoteRef: null,
    runIds: [],
    output: null,
    dryRun: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = (name) => {
      const inline = argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : null;
      if (inline !== null) {
        return inline;
      }
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${name} 값이 필요합니다.`);
      }
      return argv[index];
    };
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--repo" || argument.startsWith("--repo=")) {
      options.repositoryRoot = resolve(takeValue("--repo"));
    } else if (argument === "--subject" || argument.startsWith("--subject=")) {
      options.subject = takeValue("--subject");
    } else if (argument === "--remote" || argument.startsWith("--remote=")) {
      options.remote = takeValue("--remote");
    } else if (argument === "--remote-ref" || argument.startsWith("--remote-ref=")) {
      options.remoteRef = takeValue("--remote-ref");
    } else if (argument === "--run-id" || argument.startsWith("--run-id=")) {
      options.runIds.push(takeValue("--run-id"));
    } else if (argument === "--output" || argument.startsWith("--output=")) {
      options.output = takeValue("--output");
    } else {
      throw new Error(`알 수 없는 인수: ${argument}`);
    }
  }
  return options;
}

function helpText() {
  return `LOCAL SELF-ATTESTATION — NOT CI

사용법:
  node scripts/local-self-attestation.mjs --run-id <GitHub 실행 ID> [--run-id <ID> ...]

선택:
  --repo <경로>          저장소 경로 (기본: 현재 Reverse 저장소)
  --subject <ref>        검증할 Git ref (기본: HEAD)
  --remote <이름>        원격 이름 (기본: origin)
  --remote-ref <ref>     원격 브랜치 ref (기본: 현재 브랜치)
  --output <경로>        증거 디렉터리 (기본: .reverse-local/local-self-attestation/...)
  --dry-run              명령을 실행하지 않고 preflight와 bundle 형식만 확인

이 도구는 GitHub status, check, release, tag, commit 또는 push를 만들지 않습니다.
`;
}

async function inspectHostedRuns({ runIds, slug, subjectSha, repositoryRoot }) {
  if (runIds.length === 0) {
    throw new Error("최소 한 개의 --run-id가 필요합니다. 실행하지 않은 CI를 임의로 추정하지 않습니다.");
  }
  const records = [];
  for (const rawRunId of runIds) {
    if (!/^\d+$/u.test(rawRunId)) {
      throw new Error(`GitHub 실행 ID는 숫자여야 합니다: ${rawRunId}`);
    }
    const raw = await runText(
      "gh",
      ["run", "view", rawRunId, "--repo", slug, "--json", "databaseId,status,conclusion,event,headBranch,headSha,url,jobs"],
      repositoryRoot,
      60_000
    );
    const record = JSON.parse(raw);
    if (record.headSha !== subjectSha) {
      throw new Error(`GitHub 실행 ${rawRunId}의 SHA가 검증 대상과 다릅니다.`);
    }
    if (record.status !== "completed" || record.conclusion === "success") {
      throw new Error(`GitHub 실행 ${rawRunId}은 완료된 비성공 실행이 아닙니다.`);
    }
    records.push({
      run_id: record.databaseId,
      event: record.event,
      head_branch: record.headBranch,
      head_sha: record.headSha,
      status: record.status,
      conclusion: record.conclusion,
      url: record.url,
      jobs: record.jobs.map((job) => ({
        job_id: job.databaseId,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        step_count: Array.isArray(job.steps) ? job.steps.length : null,
        url: job.url
      }))
    });
  }
  return records;
}

async function writeSanitizedLog(path, buffer, roots) {
  let decoded;
  try {
    decoded = textDecoder.decode(buffer);
  } catch {
    throw new Error("명령 출력이 유효한 UTF-8이 아닙니다.");
  }
  const secretFindings = scanForSecrets(decoded);
  if (secretFindings.length > 0) {
    return { blocked: true, secret_findings: secretFindings, path_replacements: 0, sha256: null, bytes: 0 };
  }
  const sanitized = sanitizeAbsoluteUserPaths(decoded, roots);
  if (containsAbsoluteUserPath(sanitized.text)) {
    throw new Error("로그에서 제거되지 않은 사용자 절대 경로를 발견했습니다.");
  }
  const bytes = utf8Sig(sanitized.text);
  await writeFile(path, bytes);
  return {
    blocked: false,
    secret_findings: [],
    path_replacements: sanitized.replacements,
    sha256: sha256(bytes),
    bytes: bytes.length
  };
}

export async function recordCommandEvidence({ id, command, args, cwd, logDirectory, roots = [], timeoutMs }) {
  if (!/^[a-z0-9-]+$/u.test(id)) {
    throw new Error(`안전하지 않은 명령 ID: ${id}`);
  }
  const result = await captureCommand({ command, args, cwd, timeoutMs });
  const stdoutPath = join(logDirectory, `${id}.stdout.txt`);
  const stderrPath = join(logDirectory, `${id}.stderr.txt`);
  const [stdout, stderr] = await Promise.all([
    writeSanitizedLog(stdoutPath, result.stdout, roots),
    writeSanitizedLog(stderrPath, result.stderr, roots)
  ]);
  const secretFindings = [...new Set([...stdout.secret_findings, ...stderr.secret_findings])];
  if (secretFindings.length > 0) {
    for (const path of [stdoutPath, stderrPath]) {
      if (await pathExists(path)) {
        await rm(path, { force: true });
      }
    }
  }
  return {
    id,
    argv: result.argv,
    cwd: ".",
    started_at_utc: result.started_at_utc,
    ended_at_utc: result.ended_at_utc,
    duration_ms: result.duration_ms,
    exit_code: result.exit_code,
    signal: result.signal,
    spawn_error: result.spawn_error,
    secret_scan: {
      passed: secretFindings.length === 0,
      finding_types: secretFindings
    },
    stdout: stdout.blocked ? null : { file: `logs/${basename(stdoutPath)}`, ...stdout },
    stderr: stderr.blocked ? null : { file: `logs/${basename(stderrPath)}`, ...stderr }
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function overallCommandPassed(command) {
  return command.exit_code === 0
    && command.signal === null
    && command.spawn_error === null
    && command.secret_scan.passed;
}

async function createChecksums(bundleRoot) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name !== "SHA256SUMS") {
        files.push(path);
      }
    }
  }
  await walk(bundleRoot);
  const lines = [];
  for (const path of files.sort()) {
    lines.push(`${sha256(await readFile(path))}  ${relative(bundleRoot, path).replaceAll("\\", "/")}`);
  }
  await writeFile(join(bundleRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

export async function createLocalSelfAttestation(options) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const subjectSha = await runText("git", ["rev-parse", "--verify", `${options.subject}^{commit}`], repositoryRoot);
  const treeSha = await runText("git", ["rev-parse", `${subjectSha}^{tree}`], repositoryRoot);
  const branch = await runText("git", ["branch", "--show-current"], repositoryRoot);
  const remoteRef = options.remoteRef ?? (branch ? `refs/heads/${branch}` : null);
  if (!remoteRef) {
    throw new Error("detached HEAD에서는 --remote-ref가 필요합니다.");
  }
  const remoteUrl = await runText("git", ["remote", "get-url", options.remote], repositoryRoot);
  assertSafeRemote(remoteUrl);
  const remoteLine = await runText("git", ["ls-remote", options.remote, remoteRef], repositoryRoot);
  const remoteSha = remoteLine.split(/\s+/u)[0] ?? "";
  if (remoteSha !== subjectSha) {
    throw new Error(`원격 ${remoteRef} SHA가 검증 대상과 다릅니다: ${remoteSha || "없음"}`);
  }

  const slug = repositorySlug(remoteUrl);
  const hostedRuns = await inspectHostedRuns({
    runIds: options.runIds,
    slug,
    subjectSha,
    repositoryRoot
  });
  const statusRaw = await runRawText("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repositoryRoot);
  const sourceStatus = parsePorcelainZ(statusRaw);
  const windowsPath = join(repositoryRoot, "windows");
  const windowsBefore = await directoryDigest(windowsPath);
  const timestamp = new Date().toISOString().replace(/[-:.]/gu, "");
  const outputRoot = resolve(options.output ?? join(
    repositoryRoot,
    ".reverse-local",
    "local-self-attestation",
    `${subjectSha.slice(0, 12)}-${timestamp}`
  ));
  const relativeOutput = relative(repositoryRoot, outputRoot).replaceAll("\\", "/");
  if (relativeOutput === "windows" || relativeOutput.startsWith("windows/") || (!relativeOutput.startsWith("../") && relativeOutput === "")) {
    throw new Error("증거 출력은 windows/ 또는 저장소 루트일 수 없습니다.");
  }
  if (await pathExists(outputRoot)) {
    throw new Error(`기존 증거 디렉터리를 덮어쓰지 않습니다: ${outputRoot}`);
  }
  await mkdir(join(outputRoot, "logs"), { recursive: true });

  const tempRoot = await mkdtemp(join(tmpdir(), temporaryPrefix));
  if (!isSafeTemporaryRoot(tempRoot)) {
    throw new Error("안전한 OS 임시 디렉터리를 만들지 못했습니다.");
  }
  const checkoutRoot = join(tempRoot, "checkout");
  const commandRecords = [];
  let cleanupPassed = false;
  let cleanCheckoutInitially = false;
  let cleanCheckoutFinally = false;
  let fatalError = null;
  let toolVersions = null;
  let derivedResults = null;
  let subjectLockfileSha = null;

  try {
    await runText("git", ["clone", "--quiet", "--no-hardlinks", "--no-checkout", repositoryRoot, checkoutRoot], repositoryRoot, 5 * 60_000);
    await runText("git", ["checkout", "--quiet", "--detach", subjectSha], checkoutRoot, 60_000);
    cleanCheckoutInitially = (await runText("git", ["status", "--porcelain=v1", "--untracked-files=all"], checkoutRoot)) === "";
    if (!cleanCheckoutInitially) {
      throw new Error("임시 checkout이 처음부터 깨끗하지 않습니다.");
    }
    subjectLockfileSha = sha256(await readFile(join(checkoutRoot, "pnpm-lock.yaml")));

    if (!options.dryRun) {
      for (const item of validationPlan) {
        const record = await recordCommandEvidence({
          ...item,
          cwd: checkoutRoot,
          logDirectory: join(outputRoot, "logs"),
          roots: [repositoryRoot, tempRoot, checkoutRoot]
        });
        commandRecords.push(record);
        if (!overallCommandPassed(record)) {
          throw new Error(`${item.id} 검증이 실패했습니다.`);
        }
      }

      const [gitVersion, pnpmVersion, atkVersion] = await Promise.all([
        runText("git", ["--version"], checkoutRoot),
        runText(pnpmExecutable, ["--version"], checkoutRoot),
        runText(pnpmExecutable, ["exec", "atk", "--version"], checkoutRoot, 60_000)
      ]);
      toolVersions = {
        node: process.version,
        pnpm: pnpmVersion,
        m365_agents_toolkit: atkVersion,
        git: gitVersion
      };

      const testCommand = commandRecords.find((entry) => entry.id === "node-tests");
      const testStdout = textDecoder.decode(await readFile(join(outputRoot, testCommand.stdout.file)));
      const toolkitCommand = commandRecords.find((entry) => entry.id === "validate-copilot-package");
      const toolkitStdout = textDecoder.decode(await readFile(join(outputRoot, toolkitCommand.stdout.file)));
      const chatgptManifest = await readJson(join(checkoutRoot, "chatgpt", "EXPORT_MANIFEST.json"));
      const copilotManifest = await readJson(join(checkoutRoot, "copilot", "EXPORT_MANIFEST.json"));
      const copilotZipPath = join(checkoutRoot, "copilot", "appPackage", "build", "reverse-m365-copilot.zip");
      derivedResults = {
        node_tests: parseNodeTestCounts(testStdout.replace(/^\uFEFF/u, "")),
        m365_agents_toolkit_validation: parseToolkitValidationCount(toolkitStdout.replace(/^\uFEFF/u, "")),
        export_seals: {
          chatgpt: chatgptManifest.seal_sha256,
          copilot: copilotManifest.seal_sha256
        },
        copilot_zip: {
          path: "copilot/appPackage/build/reverse-m365-copilot.zip",
          bytes: (await stat(copilotZipPath)).size,
          sha256: sha256(await readFile(copilotZipPath))
        }
      };
      cleanCheckoutFinally = (await runText("git", ["status", "--porcelain=v1", "--untracked-files=all"], checkoutRoot)) === "";
      if (!cleanCheckoutFinally) {
        throw new Error("검증 명령이 임시 checkout의 추적 상태를 변경했습니다.");
      }
    }
  } catch (error) {
    fatalError = error;
  } finally {
    try {
      await removeTemporaryRoot(tempRoot);
      cleanupPassed = !(await pathExists(tempRoot));
    } catch (cleanupError) {
      fatalError ??= cleanupError;
    }
  }

  const windowsAfter = await directoryDigest(windowsPath);
  const windowsUnchanged = windowsBefore.sha256 === windowsAfter.sha256
    && windowsBefore.file_count === windowsAfter.file_count;
  if (!windowsUnchanged) {
    fatalError ??= new Error("검증 중 원본 windows/ 디렉터리가 변경되었습니다.");
  }
  if (!cleanupPassed) {
    fatalError ??= new Error("임시 checkout 정리를 확인하지 못했습니다.");
  }

  const generatorCommitted = (await captureCommand({
    command: "git",
    args: ["cat-file", "-e", `${subjectSha}:scripts/local-self-attestation.mjs`],
    cwd: repositoryRoot
  })).exit_code === 0;
  if (!subjectLockfileSha) {
    throw new Error("검증 대상 commit의 pnpm-lock.yaml 해시를 계산하지 못했습니다.");
  }
  const manifest = {
    schema_version: "reverse.local-self-attestation.v1",
    label: "LOCAL SELF-ATTESTATION — NOT CI",
    overall_status: options.dryRun ? "DRY_RUN_NOT_VALIDATION" : fatalError ? "FAIL" : "PASS_LOCAL_ONLY",
    generated_at_utc: new Date().toISOString(),
    subject: {
      sha: subjectSha,
      tree_sha: treeSha,
      branch,
      remote_name: options.remote,
      remote_url: remoteUrl,
      remote_ref: remoteRef,
      remote_sha: remoteSha,
      matches_remote: remoteSha === subjectSha
    },
    generator: {
      path: "scripts/local-self-attestation.mjs",
      sha256: sha256(await readFile(scriptPath)),
      included_in_subject_commit: generatorCommitted
    },
    environment: {
      os_type: type(),
      os_platform: platform(),
      os_release: release(),
      architecture: arch(),
      process_architecture: process.arch,
      tools: toolVersions
    },
    inputs: {
      lockfile: {
        path: "pnpm-lock.yaml",
        sha256: subjectLockfileSha
      },
      source_worktree: {
        is_validation_subject: false,
        dirty: sourceStatus.length > 0,
        entry_count: sourceStatus.length,
        windows_entry_count: sourceStatus.filter((entry) => entry.path === "windows" || entry.path.startsWith("windows/")).length
      }
    },
    hosted_ci: {
      passed: false,
      status: "NOT_PASSED",
      run_ids: hostedRuns.map((entry) => entry.run_id),
      runs: hostedRuns
    },
    validation: {
      mode: options.dryRun ? "DRY_RUN" : "CLEAN_DETACHED_CHECKOUT",
      commands: commandRecords,
      derived_results: derivedResults,
      clean_checkout_initially: cleanCheckoutInitially,
      clean_checkout_finally: cleanCheckoutFinally,
      windows_source_unchanged: windowsUnchanged,
      temporary_checkout_cleaned: cleanupPassed,
      failure: fatalError ? { message: fatalError.message } : null
    },
    claim_boundary: {
      remote_ci_passed: false,
      local_only: true,
      windows_runtime_validated: false,
      statement: "이 묶음은 로컬 자기검증 기록이며 GitHub Actions 통과 증거가 아닙니다."
    }
  };

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestSecretFindings = scanForSecrets(manifestText);
  if (manifestSecretFindings.length > 0 || containsAbsoluteUserPath(manifestText)) {
    throw new Error(`manifest 안전 검사 실패: ${manifestSecretFindings.join(", ") || "absolute-user-path"}`);
  }
  await writeFile(join(outputRoot, "evidence.json"), manifestText, "utf8");
  await writeFile(join(outputRoot, "README.md"), utf8Sig(`# LOCAL SELF-ATTESTATION — NOT CI

이 디렉터리는 \`${subjectSha}\`의 로컬 자기검증 기록입니다.

- GitHub-hosted CI 통과 기록이 아닙니다.
- 검증 대상은 임시 clean checkout이며 현재 작업 폴더의 미커밋 파일이 아닙니다.
- \`windows/\` 독립 실행본은 검증 범위에서 제외했습니다.
- 세부 결과와 제외 범위는 \`evidence.json\`을 확인하세요.
- \`SHA256SUMS\`로 이 묶음의 파일 변경 여부를 확인할 수 있습니다.
`));
  await createChecksums(outputRoot);

  if (fatalError) {
    const wrapped = new Error(`로컬 자기검증 실패: ${fatalError.message}`);
    wrapped.outputRoot = outputRoot;
    throw wrapped;
  }
  return { outputRoot, manifest };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = await createLocalSelfAttestation(options);
  process.stdout.write(`${result.manifest.label}\n`);
  process.stdout.write(`상태: ${result.manifest.overall_status}\n`);
  process.stdout.write(`대상 SHA: ${result.manifest.subject.sha}\n`);
  process.stdout.write(`증거 위치: ${result.outputRoot}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (error.outputRoot) {
      process.stderr.write(`실패 증거 위치: ${error.outputRoot}\n`);
    }
    process.exitCode = 1;
  });
}
