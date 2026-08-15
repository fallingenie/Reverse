#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verifyOnly = process.argv.includes("--verify");
const supportedPlatformIds = ["chatgpt", "copilot", "windows"];
const platformArgument = process.argv.find((argument) => argument.startsWith("--platforms="));
const platformIds = platformArgument
  ? [...new Set(platformArgument.slice("--platforms=".length).split(",").map((item) => item.trim()).filter(Boolean))]
  : supportedPlatformIds;
const unsupportedPlatformIds = platformIds.filter((platformId) => !supportedPlatformIds.includes(platformId));
if (platformIds.length === 0 || unsupportedPlatformIds.length > 0) {
  throw new Error(`지원 플랫폼은 ${supportedPlatformIds.join(", ")}입니다.`);
}
const excludedDirectoryNames = new Set([".venv", "__pycache__", "build", "dist"]);
const excludedFileNames = new Set(["EXPORT_MANIFEST.json"]);

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
      continue;
    }
    if (entry.isFile() && excludedFileNames.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function expectedManifest(platformId) {
  const directory = join(root, platformId);
  const files = await listFiles(directory);
  const fileDigests = {};
  for (const path of files.sort()) {
    fileDigests[relative(directory, path).replaceAll("\\", "/")] = sha256(await readFile(path));
  }
  const withoutSeal = {
    schema_version: "1.0.0",
    package_id: `reverse-${platformId}`,
    license: "Apache-2.0",
    file_count: Object.keys(fileDigests).length,
    file_digests: fileDigests
  };
  return { ...withoutSeal, seal_sha256: sha256(canonicalJson(withoutSeal)) };
}

async function ensureLicenseCopies(platformId) {
  const directory = join(root, platformId);
  for (const name of ["LICENSE", "NOTICE"]) {
    const source = join(root, name);
    const target = join(directory, name);
    if (verifyOnly) {
      const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
      if (!sourceBytes.equals(targetBytes)) {
        throw new Error(`${platformId}/${name} is not byte-identical to the repository root.`);
      }
    } else {
      await copyFile(source, target);
    }
  }
}

async function processPlatform(platformId) {
  await ensureLicenseCopies(platformId);
  const manifestPath = join(root, platformId, "EXPORT_MANIFEST.json");
  const expected = await expectedManifest(platformId);
  if (verifyOnly) {
    const actual = JSON.parse(await readFile(manifestPath, "utf8"));
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(`${platformId}/EXPORT_MANIFEST.json does not match current package contents.`);
    }
  } else {
    await writeFile(manifestPath, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
  }
  return { platform_id: platformId, file_count: expected.file_count, seal_sha256: expected.seal_sha256 };
}

const results = [];
for (const platformId of platformIds) {
  results.push(await processPlatform(platformId));
}
process.stdout.write(`${JSON.stringify({ ok: true, mode: verifyOnly ? "verify" : "export", packages: results }, null, 2)}\n`);
