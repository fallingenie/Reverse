#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const skillRoot = resolve(dirname(modulePath), "..");
const repositoryRoot = resolve(skillRoot, "..", "..");
const coreSkillRoot = join(repositoryRoot, "skills", "teach-grounded-scenarios");
const sessionDurationMs = 30 * 60 * 1000;
const maximumFailures = 5;
const lockDurationMs = 5 * 60 * 1000;
const allowedGrades = new Set(["초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2"]);
const allowedInquiryModes = new Set(["STANDARD", "ADVANCED_ETHICS"]);
const allowedSourceClasses = new Set(["PRIMARY_SOURCE", "OFFICIAL_RECORD", "PEER_REVIEWED", "SYSTEMATIC_REVIEW", "DATASET", "LEGAL_TEXT", "LITERARY_TEXT", "REFERENCE_WORK", "CURRICULUM_RESOURCE"]);
const allowedSubjectDomains = new Set(["HISTORY", "SCIENCE", "SOCIAL_STUDIES", "GEOGRAPHY", "MATHEMATICS", "LANGUAGE_LITERATURE", "INTERDISCIPLINARY"]);
const allowedConsensus = new Set(["ESTABLISHED", "STRONG", "EMERGING", "CONTESTED", "NOT_APPLICABLE", "UNKNOWN"]);
const allowedFreshness = new Set(["STABLE", "CHECKED_THIS_SESSION", "TIME_SENSITIVE", "UNKNOWN"]);
const allowedAuthorityTiers = new Set(["A_PRIMARY", "A_SYNTHESIS", "B_SCHOLARLY", "B_INSTITUTIONAL"]);
const allowedQualityChecks = new Set(["ORIGINAL_OPENED", "RESPONSIBLE_ENTITY_CONFIRMED", "PUBLICATION_OR_RECORD_DATE_CHECKED", "STABLE_IDENTIFIER_CHECKED", "METHODS_AND_SCOPE_CHECKED", "CORRECTION_RETRACTION_CHECKED", "LIMITATIONS_RECORDED", "INDEPENDENCE_CHECKED"]);
const sourceRequirements = {
  LOW: { sources: 1, tierA: 0 },
  MEDIUM: { sources: 2, tierA: 0 },
  HIGH: { sources: 3, tierA: 2 }
};

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new Error(`알 수 없는 인수: ${token}`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

function defaultStateDirectory() {
  if (process.env.REVERSE_STATE_DIR) {
    return resolve(process.env.REVERSE_STATE_DIR);
  }
  if (platform() === "win32") {
    return resolve(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ReverseGroundedLessons");
  }
  if (platform() === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "ReverseGroundedLessons");
  }
  return resolve(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "reverse-grounded-lessons");
}

function stateDirectory(options) {
  return options["state-dir"] ? resolve(options["state-dir"]) : defaultStateDirectory();
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`필수 옵션 누락: --${key}`);
  }
  return value.trim();
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCode(options, { allowGenerated = false } = {}) {
  const hasInlineCode = typeof options.code === "string";
  const hasStdinCode = options["code-stdin"] === true;
  if (hasInlineCode && hasStdinCode) {
    throw new Error("--code와 --code-stdin은 함께 사용할 수 없습니다.");
  }
  if (hasInlineCode) {
    const code = options.code.trim();
    if (code === "") {
      throw new Error("관리 암호가 비어 있습니다.");
    }
    return code;
  }
  if (hasStdinCode) {
    if (process.stdin.isTTY) {
      throw new Error("--code-stdin에는 표준 입력으로 관리 암호를 전달해야 합니다.");
    }
    let code = "";
    for await (const chunk of process.stdin) {
      code += chunk;
    }
    code = code.trim();
    if (code === "") {
      throw new Error("표준 입력으로 받은 관리 암호가 비어 있습니다.");
    }
    return code;
  }
  if (allowGenerated) {
    return null;
  }
  throw new Error("필수 옵션 누락: --code 또는 --code-stdin");
}

async function writeJsonAtomic(path, value, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporary, path);
      return;
    } catch (error) {
      if (!["EACCES", "EPERM", "EBUSY"].includes(error.code) || attempt === 4) {
        throw error;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25 * (attempt + 1)));
    }
  }
}

function generatedCode() {
  const raw = randomBytes(9).toString("base64url").toUpperCase();
  return `RV-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function codeHash(code, salt) {
  return scryptSync(code, salt, 32).toString("hex");
}

function safeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function profileDirectory(root, profileId) {
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/u.test(profileId)) {
    throw new Error("프로필 ID는 영문 소문자, 숫자, 하이픈으로 2~48자여야 합니다.");
  }
  return join(root, "profiles", profileId);
}

function privacyFindings(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    ["이메일", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
    ["전화번호", /(?:\+?82[- ]?)?0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/u],
    ["주민등록번호 형태", /\b\d{6}-[1-4]\d{6}\b/u],
    ["학생 식별정보 표현", /(학생\s*이름|학생명단|학번|주민등록번호|보호자\s*연락처)/u]
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function immutableRuleConflict(text) {
  const patterns = [
    /안전\s*(규칙|정책).{0,8}(무시|해제|생략)/u,
    /(출처|근거|웹\s*조사).{0,8}(없이|생략|무시)/u,
    /\[시작\].{0,8}(없이|생략|무시)/u,
    /(암호|학생\s*개인정보).{0,8}(공개|출력|수집)/u,
    /(LICENSE|NOTICE|라이선스|저작권).{0,8}(삭제|제거|생략)/iu,
    /(오류|실패|충돌).{0,8}(숨기|감추|말하지)/u,
    /(사실|진실|투명성).{0,8}(무시|생략|감추)/u,
    /(Canon|Story\s*Track|교정).{0,8}(덮어쓰|삭제|기록하지)/iu,
    /(?:자신|본인|나|타인|다른\s*사람|제3자).{0,32}(?:자해|자살|타해|살해|중독|무력화|사망|죽이|해치|위해).{0,32}(?:방법|절차|수단|도구|용량|계획|정보|답).{0,16}(?:제공(?!하지)|안내(?!하지)|설명(?!하지)|허용(?!하지)|알려(?!주지)|작성(?!하지)|계산(?!하지)|최적화(?!하지))/u,
    /(?:자해|자살|타해|살해).{0,24}(?:방법|절차|수단|도구|용량|계획).{0,16}(?:제공(?!하지)|안내(?!하지)|설명(?!하지)|허용(?!하지)|알려(?!주지)|작성(?!하지)|계산(?!하지)|최적화(?!하지))/u,
    /(?:가상\s*)?(?:인체|동물)\s*실험.{0,24}(?:치사|중독|무력화|사망|위해|투여|노출).{0,16}(?:계산(?!하지)|최적화(?!하지)|예측(?!하지)|제공(?!하지)|허용(?!하지))/u,
    /(?:약물|독성물질|독극물|펜토바르비탈).{0,24}(?:치사|자살|안락사|무력화|사망).{0,16}(?:용량|농도|투여|조합|시간표).{0,12}(?:계산(?!하지)|제공(?!하지)|안내(?!하지)|허용(?!하지))/u,
    /(?:무기|급조\s*로켓|까삼\s*로켓|카삼\s*로켓|파이프\s*로켓|폭발물|소이물|유해\s*발사체).{0,28}(?:재료|치수|추진제|점화|조립|조준|사거리|탑재물|제작|고장수리).{0,16}(?:제공(?!하지)|안내(?!하지)|최적화(?!하지)|허용(?!하지)|설명(?!하지))/u,
    /(?:생물|화학)\s*위해.{0,24}(?:배양|합성|추출|정제|살포).{0,16}(?:제공(?!하지)|안내(?!하지)|최적화(?!하지)|허용(?!하지))/u
  ];
  return patterns.some((pattern) => pattern.test(text));
}

async function loadConfig(root) {
  const path = join(root, "config.json");
  if (!await exists(path)) {
    throw new Error("교사 로컬 저장소가 초기화되지 않았습니다. setup을 먼저 실행하세요.");
  }
  return { path, value: await readJson(path) };
}

async function setup(options) {
  const root = stateDirectory(options);
  const configPath = join(root, "config.json");
  if (await exists(configPath)) {
    throw new Error("이미 초기화된 교사 로컬 저장소입니다. 기존 암호를 덮어쓰지 않았습니다.");
  }
  const supplied = await readCode(options, { allowGenerated: true });
  const code = supplied ?? generatedCode();
  if (code.length < 12) {
    throw new Error("관리 암호는 12자 이상이어야 합니다.");
  }
  const findings = privacyFindings(code);
  if (findings.length > 0) {
    throw new Error("관리 암호에 개인정보 형태를 사용하지 마세요.");
  }
  const salt = randomBytes(16).toString("hex");
  await writeJsonAtomic(configPath, {
    schema_version: "1.0.0",
    created_at: new Date().toISOString(),
    auth: {
      salt,
      code_hash: codeHash(code, salt),
      auth_epoch: 1,
      failed_attempts: 0,
      locked_until: null
    }
  });
  await mkdir(join(root, "sessions"), { recursive: true, mode: 0o700 });
  await mkdir(join(root, "profiles"), { recursive: true, mode: 0o700 });
  return {
    ok: true,
    state_directory: root,
    generated_code: supplied ? undefined : code,
    message: supplied ? "교사 로컬 저장소가 초기화되었습니다." : "관리 암호는 이번 응답에서만 표시됩니다. 안전하게 보관하세요."
  };
}

async function unlock(options) {
  const root = stateDirectory(options);
  const code = await readCode(options);
  const { path, value: config } = await loadConfig(root);
  const now = Date.now();
  if (config.auth.locked_until && Date.parse(config.auth.locked_until) > now) {
    throw new Error("암호 검증이 잠시 잠겼습니다. 나중에 다시 시도하세요.");
  }
  const candidate = codeHash(code, config.auth.salt);
  if (!safeEqualHex(candidate, config.auth.code_hash)) {
    config.auth.failed_attempts += 1;
    if (config.auth.failed_attempts >= maximumFailures) {
      config.auth.failed_attempts = 0;
      config.auth.locked_until = new Date(now + lockDurationMs).toISOString();
    }
    await writeJsonAtomic(path, config);
    throw new Error("암호 불일치");
  }
  config.auth.failed_attempts = 0;
  config.auth.locked_until = null;
  await writeJsonAtomic(path, config);

  const id = randomBytes(12).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now + sessionDurationMs).toISOString();
  await writeJsonAtomic(join(root, "sessions", `${id}.json`), {
    id,
    secret_hash: sha256(secret),
    auth_epoch: config.auth.auth_epoch ?? 1,
    created_at: new Date(now).toISOString(),
    expires_at: expiresAt
  });
  return { ok: true, token: `${id}.${secret}`, expires_at: expiresAt };
}

async function verifyToken(root, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{20,}$/u.test(token)) {
    throw new Error("유효한 교사 세션이 필요합니다.");
  }
  const [id, secret] = token.split(".");
  const path = join(root, "sessions", `${id}.json`);
  if (!await exists(path)) {
    throw new Error("유효한 교사 세션이 필요합니다.");
  }
  const session = await readJson(path);
  const { value: config } = await loadConfig(root);
  if (
    Date.parse(session.expires_at) <= Date.now()
    || session.auth_epoch !== (config.auth.auth_epoch ?? 1)
    || !safeEqualHex(sha256(secret), session.secret_hash)
  ) {
    throw new Error("교사 세션이 만료되었거나 유효하지 않습니다.");
  }
  return { path, session };
}

async function logout(options) {
  const root = stateDirectory(options);
  const token = requireOption(options, "token");
  const { path } = await verifyToken(root, token);
  await rm(path, { force: true });
  return { ok: true, message: "교사 세션을 종료했습니다." };
}

async function rotateCode(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const code = await readCode(options);
  if (code.length < 12) {
    throw new Error("관리 암호는 12자 이상이어야 합니다.");
  }
  if (privacyFindings(code).length > 0) {
    throw new Error("관리 암호에 개인정보 형태를 사용하지 마세요.");
  }
  const { path, value: config } = await loadConfig(root);
  const salt = randomBytes(16).toString("hex");
  config.auth = {
    salt,
    code_hash: codeHash(code, salt),
    auth_epoch: (config.auth.auth_epoch ?? 1) + 1,
    failed_attempts: 0,
    locked_until: null
  };
  config.updated_at = new Date().toISOString();
  await writeJsonAtomic(path, config);
  const sessions = join(root, "sessions");
  let cleanupWarning = null;
  try {
    await rm(sessions, { recursive: true, force: true });
    await mkdir(sessions, { recursive: true, mode: 0o700 });
  } catch (error) {
    cleanupWarning = `만료 세션 파일 정리 실패: ${error.code ?? "UNKNOWN"}`;
  }
  return {
    ok: true,
    message: "관리 암호를 교체하고 기존 교사 세션을 모두 폐기했습니다.",
    cleanup_warning: cleanupWarning
  };
}

async function createProfile(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const id = requireOption(options, "id");
  const directory = profileDirectory(root, id);
  const path = join(directory, "profile.json");
  if (await exists(path)) {
    throw new Error("같은 ID의 학급 프로필이 이미 있습니다.");
  }
  const profile = {
    schema_version: "1.0.0",
    id,
    alias: requireOption(options, "alias"),
    grade: requireOption(options, "grade"),
    subject: requireOption(options, "subject"),
    unit: typeof options.unit === "string" ? options.unit : "",
    goals: typeof options.goals === "string" ? options.goals.split("|").map((value) => value.trim()).filter(Boolean) : [],
    reading_level: typeof options["reading-level"] === "string" ? options["reading-level"] : "GRADE_DEFAULT",
    sensitivity: typeof options.sensitivity === "string" ? options.sensitivity : "DEFAULT",
    inquiry_mode: typeof options["inquiry-mode"] === "string" ? options["inquiry-mode"] : "STANDARD",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (!allowedGrades.has(profile.grade)) {
    throw new Error("학년은 초3부터 고2까지여야 합니다.");
  }
  if (!allowedInquiryModes.has(profile.inquiry_mode)) {
    throw new Error("탐구 모드는 STANDARD 또는 ADVANCED_ETHICS여야 합니다.");
  }
  if (profile.inquiry_mode === "ADVANCED_ETHICS" && !new Set(["고1", "고2"]).has(profile.grade)) {
    throw new Error("ADVANCED_ETHICS 탐구 모드는 고1·고2 학급에서만 사용할 수 있습니다.");
  }
  const findings = privacyFindings(profile);
  if (findings.length > 0) {
    throw new Error(`학급 프로필에 개인정보를 저장할 수 없습니다: ${findings.join(", ")}`);
  }
  await writeJsonAtomic(path, profile);
  await writeJsonAtomic(join(directory, "learning.json"), { schema_version: "1.0.0", items: [] });
  await mkdir(join(directory, "previews"), { recursive: true, mode: 0o700 });
  return { ok: true, profile };
}

async function loadProfile(root, profileId) {
  const directory = profileDirectory(root, profileId);
  const profilePath = join(directory, "profile.json");
  const learningPath = join(directory, "learning.json");
  if (!await exists(profilePath)) {
    throw new Error("학급 프로필을 찾을 수 없습니다.");
  }
  return {
    directory,
    profilePath,
    learningPath,
    profile: await readJson(profilePath),
    learning: await readJson(learningPath)
  };
}

const kindMap = {
  observation: "OBSERVATION",
  rule: "RULE",
  instruction: "INSTRUCTION",
  example: "EXAMPLE",
  "fact-correction": "FACT_CORRECTION"
};

async function addLearning(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const profileId = requireOption(options, "profile");
  const kind = kindMap[requireOption(options, "kind")];
  if (!kind) {
    throw new Error("kind는 observation, rule, instruction, example, fact-correction 중 하나여야 합니다.");
  }
  const text = requireOption(options, "text");
  const findings = privacyFindings(text);
  if (findings.length > 0) {
    throw new Error(`로컬 학습 항목에 개인정보를 저장할 수 없습니다: ${findings.join(", ")}`);
  }
  if (["RULE", "INSTRUCTION", "EXAMPLE"].includes(kind) && immutableRuleConflict(text)) {
    throw new Error("이 항목은 진실성·안전·근거·교정·시작 게이트·개인정보·라이선스 불변 규칙과 충돌합니다.");
  }
  const loaded = await loadProfile(root, profileId);
  const sourceUrls = typeof options["source-url"] === "string"
    ? options["source-url"].split("|").map((value) => value.trim()).filter(Boolean)
    : [];
  if (sourceUrls.some((url) => !isHttpsUrl(url))) {
    throw new Error("출처 후보는 HTTPS 원문 URL이어야 합니다.");
  }
  const now = new Date().toISOString();
  const item = {
    id: `LRN-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
    profile_id: profileId,
    kind,
    status: kind === "OBSERVATION" ? "OBSERVATION" : kind === "FACT_CORRECTION" ? "PENDING_RESEARCH" : "ACTIVE",
    text,
    source_urls: sourceUrls,
    created_at: now,
    updated_at: now,
    verification: null
  };
  loaded.learning.items.push(item);
  await writeJsonAtomic(loaded.learningPath, loaded.learning);
  return { ok: true, item };
}

async function verifyFact(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const loaded = await loadProfile(root, requireOption(options, "profile"));
  const itemId = requireOption(options, "item");
  const item = loaded.learning.items.find((candidate) => candidate.id === itemId);
  if (!item || item.kind !== "FACT_CORRECTION") {
    throw new Error("검증할 사실 정정 항목을 찾을 수 없습니다.");
  }
  if (item.status !== "PENDING_RESEARCH") {
    throw new Error("PENDING_RESEARCH 상태의 사실 정정만 검증할 수 있습니다.");
  }
  const evidenceFile = resolve(requireOption(options, "evidence-file"));
  const bundle = await readJson(evidenceFile);
  if (bundle.claim !== item.text) {
    throw new Error("검증 묶음의 claim이 사실 정정 문장과 일치하지 않습니다.");
  }
  if (!Array.isArray(bundle.evidence_ids) || bundle.evidence_ids.length === 0) {
    throw new Error("검증 묶음에는 하나 이상의 근거 ID가 필요합니다.");
  }
  if (bundle.evidence_ids.some((id) => typeof id !== "string" || !/^[A-Z]+-[0-9]{3}$/u.test(id))) {
    throw new Error("검증 묶음의 근거 ID 형식이 올바르지 않습니다.");
  }
  if (!allowedConsensus.has(bundle.consensus)) {
    throw new Error("검증 묶음에는 유효한 합의 상태가 필요합니다.");
  }
  if (!Object.hasOwn(sourceRequirements, bundle.risk)) {
    throw new Error("검증 묶음에는 LOW, MEDIUM, HIGH 중 하나의 주장 위험도가 필요합니다.");
  }
  if (!Array.isArray(bundle.sources) || bundle.sources.length === 0) {
    throw new Error("검증 묶음에는 하나 이상의 원문 출처가 필요합니다.");
  }
  for (const source of bundle.sources) {
    if (source.opened !== true || typeof source.url !== "string" || !isHttpsUrl(source.url)) {
      throw new Error("모든 검증 출처는 실제로 연 HTTPS 원문이어야 합니다.");
    }
    if (!Array.isArray(source.limitations) || source.limitations.length === 0) {
      throw new Error("모든 검증 출처에는 한계 설명이 필요합니다.");
    }
    if (
      typeof source.id !== "string"
      || !/^SRC-[0-9]{2,4}$/u.test(source.id)
      || typeof source.title !== "string"
      || source.title.trim() === ""
      || typeof source.creator !== "string"
      || source.creator.trim() === ""
      || typeof source.institution !== "string"
      || source.institution.trim() === ""
      || !allowedSourceClasses.has(source.source_class)
      || !allowedAuthorityTiers.has(source.authority_tier)
      || typeof source.independence_key !== "string"
      || source.independence_key.trim() === ""
      || !Array.isArray(source.subject_domains)
      || source.subject_domains.length === 0
      || source.subject_domains.some((domain) => !allowedSubjectDomains.has(domain))
      || typeof source.accessed_at !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/u.test(source.accessed_at)
      || !allowedFreshness.has(source.freshness)
      || !Array.isArray(source.quality_checks)
      || source.quality_checks.length < 2
      || source.quality_checks.some((check) => !allowedQualityChecks.has(check))
      || !source.quality_checks.includes("ORIGINAL_OPENED")
      || !source.quality_checks.includes("RESPONSIBLE_ENTITY_CONFIRMED")
      || !Array.isArray(source.direct_support)
      || !source.direct_support.some((id) => bundle.evidence_ids.includes(id))
    ) {
      throw new Error("검증 출처의 식별·기관·유형·교과·확인일·직접 지지 정보가 불완전합니다.");
    }
    if (source.citation_metric !== null) {
      const metric = source.citation_metric;
      if (
        !metric
        || !Number.isInteger(metric.count)
        || metric.count < 0
        || typeof metric.provider !== "string"
        || metric.provider.trim() === ""
        || typeof metric.checked_at !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/u.test(metric.checked_at)
        || metric.interpretation !== "SUPPORTING_SIGNAL_ONLY"
      ) {
        throw new Error("논문 피인용 지표는 제공자·확인일과 함께 보조 신호 형식으로만 기록해야 합니다.");
      }
    }
  }
  const requirement = sourceRequirements[bundle.risk];
  const independentSources = new Set(bundle.sources.map((source) => source.independence_key)).size;
  const tierASources = bundle.sources.filter((source) => source.authority_tier.startsWith("A_")).length;
  if (independentSources < requirement.sources || tierASources < requirement.tierA) {
    throw new Error(`${bundle.risk} 위험도에 필요한 독립 출처 수 또는 A 등급 출처 수를 충족하지 못했습니다.`);
  }
  if (typeof bundle.verification_note !== "string" || bundle.verification_note.trim() === "") {
    throw new Error("검증 묶음에는 검증 메모가 필요합니다.");
  }
  const findings = privacyFindings(bundle);
  if (findings.length > 0) {
    throw new Error(`검증 묶음에 개인정보를 저장할 수 없습니다: ${findings.join(", ")}`);
  }
  const submittedSourceUrls = item.source_urls;
  item.status = "VERIFIED";
  item.updated_at = new Date().toISOString();
  item.source_urls = [...new Set(bundle.sources.map((source) => source.url))];
  item.verification = { ...bundle, submitted_source_urls: submittedSourceUrls, verified_at: item.updated_at };
  await writeJsonAtomic(loaded.learningPath, loaded.learning);
  return { ok: true, item };
}

async function disableLearning(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const loaded = await loadProfile(root, requireOption(options, "profile"));
  const itemId = requireOption(options, "item");
  const item = loaded.learning.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error("비활성화할 로컬 학습 항목을 찾을 수 없습니다.");
  }
  if (item.status === "DISABLED") {
    throw new Error("이미 비활성화된 로컬 학습 항목입니다.");
  }
  const reason = requireOption(options, "reason");
  const findings = privacyFindings(reason);
  if (findings.length > 0) {
    throw new Error(`비활성화 사유에 개인정보를 저장할 수 없습니다: ${findings.join(", ")}`);
  }
  item.previous_status = item.status;
  item.status = "DISABLED";
  item.disabled_reason = reason;
  item.updated_at = new Date().toISOString();
  await writeJsonAtomic(loaded.learningPath, loaded.learning);
  return { ok: true, item };
}

async function preview(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const loaded = await loadProfile(root, requireOption(options, "profile"));
  return {
    ok: true,
    profile: loaded.profile,
    effective_items: loaded.learning.items.filter((item) => item.status === "ACTIVE" || item.status === "VERIFIED"),
    pending_items: loaded.learning.items.filter((item) => item.status === "PENDING_RESEARCH"),
    observations: loaded.learning.items.filter((item) => item.status === "OBSERVATION"),
    disabled_items: loaded.learning.items.filter((item) => item.status === "DISABLED")
  };
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function baseContentProvenance() {
  const inputPaths = [
    join(repositoryRoot, "LICENSE"),
    join(repositoryRoot, "NOTICE"),
    join(repositoryRoot, "package.json"),
    ...await listFiles(coreSkillRoot),
    join(skillRoot, "scripts", "teacher-store.mjs"),
    join(skillRoot, "scripts", "verify-class-fork.mjs")
  ];
  const digests = {};
  for (const path of inputPaths.sort()) {
    const key = relative(repositoryRoot, path).replaceAll("\\", "/");
    digests[key] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
  return {
    file_count: Object.keys(digests).length,
    content_sha256: sha256(canonicalJson(digests))
  };
}

async function baseProvenance() {
  const packageMetadata = await readJson(join(repositoryRoot, "package.json"));
  const content = await baseContentProvenance();
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", "LICENSE", "NOTICE", "package.json", "skills/teach-grounded-scenarios", "skills/teacher-grounded-testbed/scripts"],
      { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return {
      repository: "https://github.com/fallingenie/Reverse",
      commit,
      package_version: packageMetadata.version,
      source_state: status === "" ? "CLEAN_COMMIT" : "DIRTY_WORKTREE",
      dirty_paths: status === "" ? [] : status.split(/\r?\n/u),
      ...content
    };
  } catch {
    return {
      repository: "https://github.com/fallingenie/Reverse",
      commit: "UNAVAILABLE",
      package_version: packageMetadata.version,
      source_state: "CONTENT_ADDRESSED_PACKAGE",
      dirty_paths: [],
      ...content
    };
  }
}

async function buildFork(options) {
  const root = stateDirectory(options);
  await verifyToken(root, requireOption(options, "token"));
  const loaded = await loadProfile(root, requireOption(options, "profile"));
  const output = resolve(requireOption(options, "output"));
  if (await exists(output)) {
    throw new Error("출력 경로가 이미 존재합니다. 기존 포크를 덮어쓰지 않았습니다.");
  }

  const included = loaded.learning.items.filter((item) => item.status === "ACTIVE" || item.status === "VERIFIED");
  const exportData = { profile: loaded.profile, included };
  const findings = privacyFindings(exportData);
  if (findings.length > 0) {
    throw new Error(`학급 포크 생성 차단: 개인정보 가능 항목 ${findings.join(", ")}`);
  }
  if (included.some((item) => ["RULE", "INSTRUCTION", "EXAMPLE"].includes(item.kind) && immutableRuleConflict(item.text))) {
    throw new Error("학급 포크 생성 차단: 진실성·안전·근거·교정 불변 규칙과 충돌하는 로컬 항목이 있습니다.");
  }
  if (included.some((item) => item.kind === "FACT_CORRECTION" && (!item.verification || item.status !== "VERIFIED"))) {
    throw new Error("학급 포크 생성 차단: 검증 묶음이 없는 사실 정정이 있습니다.");
  }

  await mkdir(output, { recursive: false, mode: 0o755 });
  await mkdir(join(output, "skills"), { recursive: true });
  await cp(coreSkillRoot, join(output, "skills", "teach-grounded-scenarios"), { recursive: true });
  await cp(join(repositoryRoot, "LICENSE"), join(output, "LICENSE"));
  await cp(join(repositoryRoot, "NOTICE"), join(output, "NOTICE"));
  await cp(join(skillRoot, "scripts", "verify-class-fork.mjs"), join(output, "verify-class-fork.mjs"));
  const baseNotice = await readFile(join(output, "NOTICE"), "utf8");
  const forkNotice = `${baseNotice.trimEnd()}\n\nClass fork modification notice\nThis student-only fork applies the locally reviewed profile \"${loaded.profile.alias}\".\nTeacher credentials, preview transcripts, observations, and unverified corrections are not distributed.\n`;
  await writeFile(join(output, "NOTICE"), forkNotice, "utf8");

  const profileForStudents = {
    schema_version: "1.0.0",
    id: loaded.profile.id,
    alias: loaded.profile.alias,
    grade: loaded.profile.grade,
    subject: loaded.profile.subject,
    unit: loaded.profile.unit,
    goals: loaded.profile.goals,
    reading_level: loaded.profile.reading_level,
    sensitivity: loaded.profile.sensitivity,
    inquiry_mode: loaded.profile.inquiry_mode ?? "STANDARD"
  };
  const overlay = {
    schema_version: "1.0.0",
    profile_id: loaded.profile.id,
    items: included.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      text: item.text,
      source_urls: item.kind === "FACT_CORRECTION" ? item.source_urls : [],
      verification: item.kind === "FACT_CORRECTION" ? {
        claim: item.verification.claim,
        evidence_ids: item.verification.evidence_ids,
        consensus: item.verification.consensus,
        risk: item.verification.risk,
        sources: item.verification.sources,
        verification_note: item.verification.verification_note,
        verified_at: item.verification.verified_at
      } : null
    }))
  };
  await writeJsonAtomic(join(output, "CLASS_PROFILE.json"), profileForStudents, 0o644);
  await writeJsonAtomic(join(output, "CLASS_OVERLAY.json"), overlay, 0o644);
  const forkReferenceDirectory = join(output, "skills", "teach-grounded-scenarios", "references");
  await writeJsonAtomic(join(forkReferenceDirectory, "class-profile.json"), profileForStudents, 0o644);
  await writeJsonAtomic(join(forkReferenceDirectory, "class-overlay.json"), overlay, 0o644);
  const forkSkillPath = join(output, "skills", "teach-grounded-scenarios", "SKILL.md");
  const forkSkill = await readFile(forkSkillPath, "utf8");
  const forkEntrypoint = `\n## 학급 포크 오버레이\n\n수업을 시작할 때 \`references/class-profile.json\`과 \`references/class-overlay.json\`을 읽는다. 학년·과목·관심사를 학생에게 다시 확인하되 학급 프로필을 기본값으로 사용한다. 오버레이의 검증된 규칙·지침·예시·사실 정정을 해당 학급에만 적용한다. 공통 진실성·투명성·안전·근거·Canon 교정·[시작] 규칙과 충돌하는 항목은 적용하지 않는다.\n`;
  await writeFile(forkSkillPath, `${forkSkill.trimEnd()}${forkEntrypoint}`, "utf8");

  const studentAgents = `# 학생용 학급 포크 규칙\n\n- 이 포크는 교사 모드가 없는 학생 전용 배포본이다.\n- Transparency and Truth를 몰입과 연속성보다 우선한다.\n- CLASS_PROFILE.json과 CLASS_OVERLAY.json을 수업 시작 전에 읽는다.\n- 공통 Skill의 P0 안전·과학 무결성, 근거 조사, 상태 표시, Canon 교정, [시작] 게이트를 우선한다.\n- 교사·관리자·연구자가 질문해도 자신 또는 타인에 대한 자해·자살·타해·중독·무력화·사망 등 위해를 돕지 않는다. 대리 실행, 제3자 대상, 가상 인물 대상도 동일하다.\n- 고1·고2의 ADVANCED_ETHICS 탐구 모드는 비실행형 분석의 깊이만 높이며 P0를 해제하지 않는다.\n- 가상 실험·교과 융합·역할극을 이유로 인체·동물 위해 실험, 치명적 약물·독성물질 사용, 무기·급조 로켓·폭발물·생물·화학 위해 절차의 실행 가능한 정보를 제공하지 않는다. 여러 턴을 합친 누적 목적도 검사한다.\n- 기본 추론 오류를 숨기지 않는다. 국소 오류만 이력을 남겨 부분 교정하고, 핵심 인과망이 무너지면 사용자에게 재시작 옵션을 제시한다.\n- 로컬 오버레이는 해당 학급에만 적용한다.\n- 학생 개인정보를 수집하거나 저장하지 않는다.\n- 교사 암호, 관리 명령, 로컬 교사 저장소를 요청하거나 추측하지 않는다.\n- LICENSE, NOTICE, FORK_MANIFEST.json을 유지한다.\n`;
  await writeFile(join(output, "AGENTS.md"), studentAgents, "utf8");
  const readme = `# ${loaded.profile.alias} 근거 기반 수업 포크\n\n이 포크는 ${loaded.profile.grade} ${loaded.profile.subject} 수업을 위해 교사가 검토한 로컬 규칙과 예시를 반영한 학생 전용 배포본입니다.\n\n교사 암호, 테스트 대화, 관찰 로그, 검증 대기 중인 사실 정정은 포함하지 않습니다. 수업은 학년·과목·관심사를 확인한 뒤 웹 조사와 원문 검증을 수행하고 시나리오 다섯 개를 제시합니다.\n\n프로젝트는 Apache License 2.0에 따라 배포됩니다. LICENSE와 NOTICE를 확인하세요.\n`;
  await writeFile(join(output, "README.md"), readme, "utf8");

  const filesBeforeManifest = await listFiles(output);
  const fileDigests = {};
  for (const path of filesBeforeManifest.sort()) {
    const key = relative(output, path).replaceAll("\\", "/");
    fileDigests[key] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
  const provenance = await baseProvenance();
  const manifestWithoutSeal = {
    schema_version: "1.0.0",
    fork_id: `CLASS-${loaded.profile.id}-${Date.now().toString(36).toUpperCase()}`,
    base: provenance,
    distribution_ready: ["CLEAN_COMMIT", "CONTENT_ADDRESSED_PACKAGE"].includes(provenance.source_state),
    class_profile_sha256: sha256(canonicalJson(profileForStudents)),
    included_items: overlay.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      content_sha256: sha256(canonicalJson(item))
    })),
    excluded_counts: {
      observations: loaded.learning.items.filter((item) => item.status === "OBSERVATION").length,
      pending_research: loaded.learning.items.filter((item) => item.status === "PENDING_RESEARCH").length,
      disabled: loaded.learning.items.filter((item) => item.status === "DISABLED").length
    },
    created_at: new Date().toISOString(),
    license: "Apache-2.0",
    file_digests: fileDigests
  };
  const manifest = {
    ...manifestWithoutSeal,
    seal_sha256: sha256(canonicalJson(manifestWithoutSeal))
  };
  await writeJsonAtomic(join(output, "FORK_MANIFEST.json"), manifest, 0o644);

  return {
    ok: true,
    output,
    fork_id: manifest.fork_id,
    seal_sha256: manifest.seal_sha256,
    distribution_ready: manifest.distribution_ready,
    included_items: manifest.included_items.length,
    excluded_counts: manifest.excluded_counts
  };
}

async function doctor(options) {
  const root = stateDirectory(options);
  const configPresent = await exists(join(root, "config.json"));
  const profileRoot = join(root, "profiles");
  const profiles = await exists(profileRoot)
    ? (await readdir(profileRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  return { ok: true, state_directory: root, initialized: configPresent, profiles };
}

export async function run(argv) {
  const { command, options } = parseArguments(argv);
  switch (command) {
    case "setup": return setup(options);
    case "unlock": return unlock(options);
    case "logout": return logout(options);
    case "rotate-code": return rotateCode(options);
    case "create-profile": return createProfile(options);
    case "add": return addLearning(options);
    case "verify-fact": return verifyFact(options);
    case "disable": return disableLearning(options);
    case "preview": return preview(options);
    case "build-fork": return buildFork(options);
    case "doctor": return doctor(options);
    default:
      throw new Error("명령은 setup, unlock, logout, rotate-code, create-profile, add, verify-fact, disable, preview, build-fork, doctor 중 하나여야 합니다.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(modulePath)) {
  run(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
      process.exitCode = 1;
    });
}
