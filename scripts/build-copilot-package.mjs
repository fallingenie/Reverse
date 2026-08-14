#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(repositoryRoot, "copilot", "appPackage");
const buildRoot = join(packageRoot, "build");
const outputPath = join(buildRoot, "reverse-m365-copilot.zip");

const inputFiles = [
  "manifest.json",
  "assets/color.png",
  "assets/outline.png",
  "declarativeAgent.json",
  "knowledge/reverse-policy.txt"
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0),
      uint16(0), uint16(0x0021), uint32(checksum), uint32(entry.data.length),
      uint32(entry.data.length), uint16(name.length), uint16(0), name, entry.data
    ]);
    const central = Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0),
      uint16(0), uint16(0x0021), uint32(checksum), uint32(entry.data.length),
      uint32(entry.data.length), uint16(name.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), name
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length),
    uint16(entries.length), uint32(centralDirectory.length), uint32(offset), uint16(0)
  ]);
  return Buffer.concat([...locals, centralDirectory, end]);
}

export function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("유효한 PNG가 아닙니다.");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25]
  };
}

export async function buildCopilotPackage() {
  await mkdir(join(packageRoot, "knowledge"), { recursive: true });
  await mkdir(buildRoot, { recursive: true });
  await copyFile(join(repositoryRoot, "copilot", "declarativeAgent.json"), join(packageRoot, "declarativeAgent.json"));
  await copyFile(join(repositoryRoot, "copilot", "knowledge", "reverse-policy.txt"), join(packageRoot, "knowledge", "reverse-policy.txt"));

  JSON.parse(await readFile(join(packageRoot, "manifest.json"), "utf8"));
  JSON.parse(await readFile(join(packageRoot, "declarativeAgent.json"), "utf8"));
  const color = pngInfo(await readFile(join(packageRoot, "assets", "color.png")));
  const outline = pngInfo(await readFile(join(packageRoot, "assets", "outline.png")));
  if (color.width !== 192 || color.height !== 192) {
    throw new Error(`컬러 아이콘 규격 오류: ${color.width}×${color.height}`);
  }
  if (outline.width !== 32 || outline.height !== 32 || ![4, 6].includes(outline.colorType)) {
    throw new Error(`외곽선 아이콘 규격 또는 투명도 오류: ${outline.width}×${outline.height}, colorType=${outline.colorType}`);
  }

  const entries = await Promise.all(inputFiles.map(async (name) => ({ name, data: await readFile(join(packageRoot, name)) })));
  const archive = zipStore(entries);
  await writeFile(outputPath, archive);
  return {
    outputPath,
    files: inputFiles,
    bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex")
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await buildCopilotPackage();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
