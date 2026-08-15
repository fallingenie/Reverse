#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaUrl = "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.8/schema.json";
const response = await fetch(schemaUrl);
if (!response.ok) {
  throw new Error(`Microsoft schema download failed: HTTP ${response.status}`);
}
const schema = await response.json();
delete schema.$schema;
const manifest = JSON.parse(await readFile(join(root, "copilot", "declarativeAgent.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  process.stderr.write(`${ajv.errorsText(validate.errors, { separator: "\n" })}\n`);
  process.exit(1);
}
process.stdout.write(`Microsoft declarative agent v1.8 schema validation passed: ${schemaUrl}\n`);
