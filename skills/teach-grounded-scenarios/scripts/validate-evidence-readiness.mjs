import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SCHEMA_BOUNDARY = "JSON Schema validates record shape only. Cross-record references, recorded direct support, authority, upstream independence, and READY thresholds are enforced by this Node semantic validator. It does not retrieve live sources. ChatGPT and Copilot reference assets are guidance, not executable validators.";

const RISK_MINIMUMS = Object.freeze({
  LOW: Object.freeze({ independent: 1, tierA: 0 }),
  MEDIUM: Object.freeze({ independent: 2, tierA: 0 }),
  HIGH: Object.freeze({ independent: 3, tierA: 2 })
});

const VERIFIED_AUTHORITY_TIERS = new Set([
  "A_PRIMARY",
  "A_SYNTHESIS",
  "B_SCHOLARLY",
  "B_INSTITUTIONAL"
]);

const AUTHORITY_SOURCE_CLASSES = new Map([
  ["A_PRIMARY", new Set(["PRIMARY_SOURCE", "OFFICIAL_RECORD", "DATASET", "LEGAL_TEXT", "LITERARY_TEXT"])],
  ["A_SYNTHESIS", new Set(["SYSTEMATIC_REVIEW", "OFFICIAL_RECORD", "REFERENCE_WORK"])],
  ["B_SCHOLARLY", new Set(["PEER_REVIEWED", "SYSTEMATIC_REVIEW", "REFERENCE_WORK"])],
  ["B_INSTITUTIONAL", new Set(["OFFICIAL_RECORD", "DATASET", "REFERENCE_WORK", "CURRICULUM_RESOURCE"])]
]);

const EXCEPTION_SCOPES = new Set([
  "MINIMUM_INDEPENDENT_SOURCES",
  "MINIMUM_TIER_A_SOURCES"
]);

const SEARCH_SUMMARY_MARKERS = new Set([
  "SEARCH_RESULT",
  "SEARCH_SUMMARY",
  "SEARCH_SNIPPET",
  "SEARCH_SUMMARY_ONLY",
  "SEARCH_RESULT_SNIPPET_ONLY",
  "GENERATIVE_SUMMARY"
]);

function isSearchResultUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase().replace(/\/+$/u, "") || "/";
    const knownSearchHost = /^(?:www\.)?google\.[a-z.]+$/u.test(hostname)
      || hostname === "bing.com"
      || hostname.endsWith(".bing.com")
      || hostname === "search.yahoo.com"
      || hostname === "duckduckgo.com"
      || hostname === "www.duckduckgo.com"
      || hostname === "search.brave.com"
      || hostname === "search.naver.com"
      || hostname === "search.daum.net"
      || hostname === "yandex.com"
      || hostname.endsWith(".yandex.com")
      || hostname === "www.baidu.com"
      || hostname === "www.ecosia.org"
      || hostname === "www.startpage.com";
    const searchParameterNames = new Set(["q", "query", "querytext", "search_query", "wd", "keyword", "search", "text"]);
    const searchParameter = [...url.searchParams.keys()]
      .some((name) => searchParameterNames.has(name.toLowerCase()));
    const searchPath = /\/(?:search|search\.(?:html|php|aspx)|search\.naver|sp\/search|s)$/u.test(pathname);
    return (knownSearchHost && (searchPath || searchParameter))
      || ((hostname === "bing.com" || hostname.endsWith(".bing.com")) && pathname === "/search")
      || (hostname === "search.yahoo.com" && pathname.startsWith("/search"))
      || ((hostname === "duckduckgo.com" || hostname === "www.duckduckgo.com") && url.searchParams.has("q"))
      || (hostname === "search.brave.com" && pathname === "/search")
      || (hostname === "search.naver.com" && pathname === "/search.naver")
      || (hostname === "search.daum.net" && pathname === "/search");
  } catch {
    return false;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function arrayValue(value, errors, path) {
  if (!Array.isArray(value)) {
    addError(errors, "SEMANTIC_ARRAY_REQUIRED", path, "Expected an array before relational validation.");
    return [];
  }
  return value;
}

function uniqueRecordMap(records, errors, collectionPath, duplicateCode) {
  const recordsById = new Map();
  records.forEach((record, index) => {
    const path = `${collectionPath}/${index}/id`;
    if (!isObject(record) || typeof record.id !== "string" || record.id.length === 0) {
      addError(errors, "SEMANTIC_ID_REQUIRED", path, "A non-empty record ID is required.");
      return;
    }
    if (recordsById.has(record.id)) {
      addError(errors, duplicateCode, path, `Duplicate record ID: ${record.id}`);
      return;
    }
    recordsById.set(record.id, record);
  });
  return recordsById;
}

function hasSearchSummaryMarker(source) {
  const values = [
    source.title,
    source.source_class,
    source.provenance_kind,
    ...(Array.isArray(source.limitations) ? source.limitations : [])
  ];
  return isSearchResultUrl(source.url)
    || values.some((value) => {
      if (typeof value !== "string") {
        return false;
      }
      const normalized = value.trim().normalize("NFKC").toUpperCase();
      return SEARCH_SUMMARY_MARKERS.has(normalized)
        || /\bSEARCH[ _-]?(?:RESULT|SUMMARY|SNIPPET|PREVIEW)\b/u.test(normalized)
        || /검색\s*(?:결과|요약|스니펫|미리보기)/u.test(normalized);
    });
}

function normalizedIndependenceKey(source) {
  return typeof source.independence_key === "string"
    ? source.independence_key.trim().normalize("NFKC").toUpperCase()
    : "";
}

function isQualifiedVerifiedSource(source, evidenceId) {
  return source.opened === true
    && Array.isArray(source.quality_checks)
    && source.quality_checks.includes("ORIGINAL_OPENED")
    && VERIFIED_AUTHORITY_TIERS.has(source.authority_tier)
    && AUTHORITY_SOURCE_CLASSES.get(source.authority_tier)?.has(source.source_class) === true
    && typeof source.independence_key === "string"
    && source.independence_key.trim().length > 0
    && Array.isArray(source.direct_support)
    && source.direct_support.includes(evidenceId)
    && !hasSearchSummaryMarker(source);
}

function parseException(value, errors, path) {
  if (value === null || value === undefined) {
    return { used: false, valid: true, reason: null, scopes: new Set() };
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    addError(errors, "EXCEPTION_FORMAT_INVALID", path, "An exception must use 'scope=SCOPE[,SCOPE]; reason=explanation'.");
    return { used: true, valid: false, reason: null, scopes: new Set() };
  }

  const fields = new Map();
  let valid = true;
  for (const segment of value.split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) {
      valid = false;
      continue;
    }
    const key = segment.slice(0, separator).trim().toLowerCase();
    const fieldValue = segment.slice(separator + 1).trim();
    if (fields.has(key) || fieldValue.length === 0) {
      valid = false;
      continue;
    }
    fields.set(key, fieldValue);
  }

  const reason = fields.get("reason") ?? "";
  const rawScope = fields.get("scope") ?? "";
  if (fields.size !== 2 || reason.length === 0 || rawScope.length === 0 || !fields.has("reason") || !fields.has("scope")) {
    valid = false;
  }

  const scopes = new Set(rawScope.split(",").map((scope) => scope.trim()).filter(Boolean));
  if (scopes.size === 0 || [...scopes].some((scope) => !EXCEPTION_SCOPES.has(scope))) {
    valid = false;
  }

  if (!valid) {
    addError(errors, "EXCEPTION_FORMAT_INVALID", path, "An exception must contain only a non-empty reason and recognized, comma-separated scope values.");
  }
  return { used: true, valid, reason, scopes };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

export function validateEvidenceReadiness(session) {
  const errors = [];
  const gateMetrics = [];

  if (!isObject(session)) {
    addError(errors, "SEMANTIC_SESSION_REQUIRED", "/", "The semantic validator requires a session object.");
    return {
      ok: false,
      validator_type: "NODE_SEMANTIC_CROSS_RECORD",
      schema_boundary: SCHEMA_BOUNDARY,
      errors,
      metrics: { readiness: null, disclosed_gap_count: null, source_count: 0, evidence_count: 0, verified_evidence_count: 0, gates: [] }
    };
  }

  const research = isObject(session.research) ? session.research : {};
  const plan = isObject(research.plan) ? research.plan : {};
  const sources = arrayValue(session.sources, errors, "/sources");
  const evidence = arrayValue(session.evidence, errors, "/evidence");
  const gates = arrayValue(plan.claim_quality_gates, errors, "/research/plan/claim_quality_gates");
  const sourcesById = uniqueRecordMap(sources, errors, "/sources", "SOURCE_ID_DUPLICATE");
  const evidenceById = uniqueRecordMap(evidence, errors, "/evidence", "EVIDENCE_ID_DUPLICATE");

  for (const [sourceId, source] of sourcesById) {
    const supportIds = arrayValue(source.direct_support, errors, `/sources/${sourceId}/direct_support`);
    for (const duplicate of duplicateValues(supportIds)) {
      addError(errors, "SOURCE_DIRECT_SUPPORT_DUPLICATE", `/sources/${sourceId}/direct_support`, `Duplicate direct-support evidence ID: ${duplicate}`);
    }
    for (const evidenceId of supportIds) {
      const record = evidenceById.get(evidenceId);
      if (!record) {
        addError(errors, "SOURCE_DIRECT_SUPPORT_DANGLING", `/sources/${sourceId}/direct_support`, `Source ${sourceId} names missing evidence ${evidenceId}.`);
        continue;
      }
      if (!Array.isArray(record.source_ids) || !record.source_ids.includes(sourceId)) {
        addError(errors, "SOURCE_DIRECT_SUPPORT_NOT_RECIPROCAL", `/sources/${sourceId}/direct_support`, `Evidence ${evidenceId} does not cite source ${sourceId}.`);
      }
      if (record.status !== "VERIFIED") {
        addError(errors, "SOURCE_DIRECT_SUPPORT_NON_VERIFIED", `/sources/${sourceId}/direct_support`, `Direct support may name only VERIFIED evidence: ${evidenceId}.`);
      }
    }
  }

  for (const [evidenceId, record] of evidenceById) {
    const sourceIds = arrayValue(record.source_ids, errors, `/evidence/${evidenceId}/source_ids`);
    for (const duplicate of duplicateValues(sourceIds)) {
      addError(errors, "EVIDENCE_SOURCE_ID_DUPLICATE", `/evidence/${evidenceId}/source_ids`, `Duplicate source ID: ${duplicate}`);
    }

    const referencedSources = [];
    for (const sourceId of sourceIds) {
      const source = sourcesById.get(sourceId);
      if (!source) {
        addError(errors, "EVIDENCE_SOURCE_DANGLING", `/evidence/${evidenceId}/source_ids`, `Evidence ${evidenceId} cites missing source ${sourceId}.`);
        continue;
      }
      referencedSources.push(source);
    }

    if (record.status !== "VERIFIED") {
      continue;
    }
    if (sourceIds.length === 0) {
      addError(errors, "VERIFIED_SOURCE_REQUIRED", `/evidence/${evidenceId}/source_ids`, "VERIFIED evidence requires at least one source.");
    }

    for (const source of referencedSources) {
      const sourcePath = `/sources/${source.id}`;
      if (source.opened !== true) {
        addError(errors, "VERIFIED_SOURCE_NOT_OPENED", `${sourcePath}/opened`, `VERIFIED evidence ${evidenceId} cites an unopened source.`);
      }
      if (!Array.isArray(source.quality_checks) || !source.quality_checks.includes("ORIGINAL_OPENED")) {
        addError(errors, "VERIFIED_ORIGINAL_OPEN_CHECK_MISSING", `${sourcePath}/quality_checks`, `VERIFIED evidence ${evidenceId} lacks an ORIGINAL_OPENED check.`);
      }
      if (hasSearchSummaryMarker(source)) {
        addError(errors, "VERIFIED_SEARCH_SUMMARY_FORBIDDEN", sourcePath, `VERIFIED evidence ${evidenceId} cannot use a search result, snippet, or generated summary.`);
      }
      if (!VERIFIED_AUTHORITY_TIERS.has(source.authority_tier)) {
        addError(errors, "VERIFIED_AUTHORITY_INADEQUATE", `${sourcePath}/authority_tier`, `VERIFIED evidence ${evidenceId} requires an A or B authority tier.`);
      } else if (AUTHORITY_SOURCE_CLASSES.get(source.authority_tier)?.has(source.source_class) !== true) {
        addError(errors, "VERIFIED_AUTHORITY_CLASS_MISMATCH", sourcePath, `Source class ${String(source.source_class)} does not justify authority tier ${source.authority_tier} for VERIFIED evidence ${evidenceId}.`);
      }
      if (typeof source.independence_key !== "string" || source.independence_key.trim().length === 0) {
        addError(errors, "VERIFIED_INDEPENDENCE_KEY_REQUIRED", `${sourcePath}/independence_key`, `VERIFIED evidence ${evidenceId} requires an upstream independence key.`);
      }
      if (!Array.isArray(source.direct_support) || !source.direct_support.includes(evidenceId)) {
        addError(errors, "VERIFIED_DIRECT_SUPPORT_MISSING", `${sourcePath}/direct_support`, `Source ${source.id} does not directly support evidence ${evidenceId}.`);
      }
    }

    const qualifiedIndependentCount = new Set(
      referencedSources
        .filter((source) => isQualifiedVerifiedSource(source, evidenceId))
        .map((source) => normalizedIndependenceKey(source))
    ).size;
    if (qualifiedIndependentCount === 0) {
      addError(errors, "VERIFIED_QUALIFIED_SOURCE_REQUIRED", `/evidence/${evidenceId}`, "VERIFIED evidence has no opened, directly supporting, independent A/B source.");
    }
  }

  const readiness = typeof plan.readiness === "string" ? plan.readiness : null;
  const isReady = readiness === "READY";
  if (isReady) {
    if (research.readiness_checked !== true) {
      addError(errors, "READY_CHECK_NOT_COMPLETED", "/research/readiness_checked", "READY requires a completed readiness check.");
    }
    if (!Array.isArray(research.gaps)) {
      addError(errors, "READY_GAPS_ARRAY_REQUIRED", "/research/gaps", "READY requires an explicit gaps array.");
    }
    if (sources.length === 0) {
      addError(errors, "READY_SOURCES_REQUIRED", "/sources", "READY requires actual source records.");
    }
    if (evidence.length === 0) {
      addError(errors, "READY_EVIDENCE_REQUIRED", "/evidence", "READY requires actual evidence records.");
    }

    const claimCandidates = arrayValue(plan.claim_candidates, errors, "/research/plan/claim_candidates");
    if (claimCandidates.length === 0) {
      addError(errors, "READY_CLAIM_REQUIRED", "/research/plan/claim_candidates", "READY requires at least one bounded claim candidate.");
    }
    if (gates.length === 0) {
      addError(errors, "READY_GATE_REQUIRED", "/research/plan/claim_quality_gates", "READY requires at least one claim quality gate.");
    }
    const candidateSet = new Set(claimCandidates);
    const gateClaims = gates.map((gate) => gate?.claim).filter((claim) => typeof claim === "string");
    const gateClaimSet = new Set(gateClaims);
    if (candidateSet.size !== claimCandidates.length || gateClaimSet.size !== gateClaims.length) {
      addError(errors, "READY_CLAIM_DUPLICATE", "/research/plan", "READY claim candidates and quality gates must have unique claims.");
    }
    if (candidateSet.size !== gateClaimSet.size || [...candidateSet].some((claim) => !gateClaimSet.has(claim))) {
      addError(errors, "READY_CLAIM_GATE_MISMATCH", "/research/plan", "Every READY claim candidate requires exactly one matching quality gate.");
    }
  }

  gates.forEach((gate, gateIndex) => {
    if (!isObject(gate)) {
      addError(errors, "SEMANTIC_GATE_REQUIRED", `/research/plan/claim_quality_gates/${gateIndex}`, "A claim quality gate must be an object.");
      return;
    }
    const gatePath = `/research/plan/claim_quality_gates/${gateIndex}`;
    const exception = parseException(gate.exception_reason, errors, `${gatePath}/exception_reason`);
    if (!isReady) {
      return;
    }

    const gateEvidenceIds = arrayValue(gate.evidence_ids, errors, `${gatePath}/evidence_ids`);
    if (gateEvidenceIds.length === 0) {
      addError(errors, "READY_GATE_EVIDENCE_REQUIRED", `${gatePath}/evidence_ids`, "A READY claim gate requires actual evidence IDs.");
    }
    for (const duplicate of duplicateValues(gateEvidenceIds)) {
      addError(errors, "READY_GATE_EVIDENCE_DUPLICATE", `${gatePath}/evidence_ids`, `Duplicate gate evidence ID: ${duplicate}`);
    }

    const gateEvidence = [];
    for (const evidenceId of gateEvidenceIds) {
      const record = evidenceById.get(evidenceId);
      if (!record) {
        addError(errors, "READY_GATE_EVIDENCE_DANGLING", `${gatePath}/evidence_ids`, `Claim gate cites missing evidence ${evidenceId}.`);
        continue;
      }
      gateEvidence.push(record);
      if (record.status !== "VERIFIED") {
        addError(errors, "READY_GATE_EVIDENCE_NOT_VERIFIED", `${gatePath}/evidence_ids`, `Claim gate evidence ${evidenceId} is not VERIFIED.`);
      }
      if (record.claim !== gate.claim) {
        addError(errors, "READY_GATE_EVIDENCE_CLAIM_MISMATCH", `${gatePath}/evidence_ids`, `Claim gate ${String(gate.claim)} cites evidence ${evidenceId} for a different claim.`);
      }
    }

    const qualifiedSourcesById = new Map();
    for (const record of gateEvidence) {
      if (record.status !== "VERIFIED" || !Array.isArray(record.source_ids)) {
        continue;
      }
      for (const sourceId of record.source_ids) {
        const source = sourcesById.get(sourceId);
        if (source && isQualifiedVerifiedSource(source, record.id)) {
          qualifiedSourcesById.set(sourceId, source);
        }
      }
    }

    const qualifiedSources = [...qualifiedSourcesById.values()];
    const independentKeys = new Set(qualifiedSources.map((source) => normalizedIndependenceKey(source)));
    const tierAIndependentKeys = new Set(
      qualifiedSources
        .filter((source) => typeof source.authority_tier === "string" && source.authority_tier.startsWith("A_"))
        .map((source) => normalizedIndependenceKey(source))
    );
    const minimums = RISK_MINIMUMS[gate.risk];
    if (!minimums) {
      addError(errors, "READY_GATE_RISK_INVALID", `${gatePath}/risk`, `Unknown claim risk: ${String(gate.risk)}`);
      return;
    }

    const declaredIndependent = Number.isInteger(gate.minimum_independent_sources)
      ? gate.minimum_independent_sources
      : Number.POSITIVE_INFINITY;
    const declaredTierA = Number.isInteger(gate.minimum_tier_a_sources)
      ? gate.minimum_tier_a_sources
      : Number.POSITIVE_INFINITY;
    if (!Number.isInteger(gate.minimum_independent_sources) || gate.minimum_independent_sources < 1) {
      addError(errors, "READY_GATE_INDEPENDENT_MINIMUM_INVALID", `${gatePath}/minimum_independent_sources`, "The independent-source minimum must be a positive integer.");
    }
    if (!Number.isInteger(gate.minimum_tier_a_sources) || gate.minimum_tier_a_sources < 0) {
      addError(errors, "READY_GATE_TIER_A_MINIMUM_INVALID", `${gatePath}/minimum_tier_a_sources`, "The Tier A minimum must be a non-negative integer.");
    }
    if (Number.isFinite(declaredIndependent) && Number.isFinite(declaredTierA) && declaredTierA > declaredIndependent) {
      addError(errors, "READY_GATE_TIER_A_EXCEEDS_INDEPENDENT", gatePath, "The Tier A target cannot exceed the independent-source target.");
    }

    const requiredIndependent = Math.max(minimums.independent, Number.isFinite(declaredIndependent) ? declaredIndependent : minimums.independent);
    const requiredTierA = Math.max(minimums.tierA, Number.isFinite(declaredTierA) ? declaredTierA : minimums.tierA);
    const deficits = new Set();
    if (Number.isFinite(declaredIndependent) && declaredIndependent < minimums.independent) {
      deficits.add("MINIMUM_INDEPENDENT_SOURCES");
    }
    if (Number.isFinite(declaredTierA) && declaredTierA < minimums.tierA) {
      deficits.add("MINIMUM_TIER_A_SOURCES");
    }
    if (independentKeys.size < requiredIndependent) {
      deficits.add("MINIMUM_INDEPENDENT_SOURCES");
    }
    if (tierAIndependentKeys.size < requiredTierA) {
      deficits.add("MINIMUM_TIER_A_SOURCES");
    }

    for (const deficit of deficits) {
      if (!exception.valid || !exception.scopes.has(deficit)) {
        const code = deficit === "MINIMUM_INDEPENDENT_SOURCES"
          ? "READY_INDEPENDENT_SOURCE_TARGET_UNMET"
          : "READY_TIER_A_SOURCE_TARGET_UNMET";
        addError(errors, code, gatePath, `READY claim ${String(gate.claim)} does not meet ${deficit}.`);
      }
    }
    if (exception.valid) {
      for (const scope of exception.scopes) {
        if (!deficits.has(scope)) {
          addError(errors, "EXCEPTION_SCOPE_UNUSED", `${gatePath}/exception_reason`, `Exception scope ${scope} does not match an actual deficit.`);
        }
      }
    }

    gateMetrics.push({
      claim: typeof gate.claim === "string" ? gate.claim : null,
      risk: gate.risk,
      required_independent_sources: requiredIndependent,
      actual_independent_upstreams: independentKeys.size,
      required_tier_a_sources: requiredTierA,
      actual_tier_a_upstreams: tierAIndependentKeys.size,
      exception_scopes: exception.valid ? [...exception.scopes].sort() : []
    });
  });

  return {
    ok: errors.length === 0,
    validator_type: "NODE_SEMANTIC_CROSS_RECORD",
    schema_boundary: SCHEMA_BOUNDARY,
    errors,
    metrics: {
      readiness,
      disclosed_gap_count: Array.isArray(research.gaps) ? research.gaps.length : null,
      source_count: sources.length,
      evidence_count: evidence.length,
      verified_evidence_count: evidence.filter((record) => record?.status === "VERIFIED").length,
      gates: gateMetrics
    }
  };
}

export async function validateEvidenceReadinessFile(path) {
  const bytes = await readFile(path);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  if (text.includes("\uFEFF")) {
    throw new Error("Input contains a mid-file BOM.");
  }
  if (text.includes("\uFFFD")) {
    throw new Error("Input contains a Unicode replacement character.");
  }
  if (/[\u0080-\u009F]/u.test(text)) {
    throw new Error("Input contains a C1 control character.");
  }
  return validateEvidenceReadiness(JSON.parse(text));
}

async function main(arguments_) {
  if (arguments_.length !== 1) {
    const result = {
      ok: false,
      validator_type: "NODE_SEMANTIC_CROSS_RECORD",
      schema_boundary: SCHEMA_BOUNDARY,
      errors: [{ code: "CLI_USAGE", path: "/", message: "Usage: node validate-evidence-readiness.mjs <session.json>" }],
      metrics: { readiness: null, disclosed_gap_count: null, source_count: 0, evidence_count: 0, verified_evidence_count: 0, gates: [] }
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const result = await validateEvidenceReadinessFile(arguments_[0]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const result = {
      ok: false,
      validator_type: "NODE_SEMANTIC_CROSS_RECORD",
      schema_boundary: SCHEMA_BOUNDARY,
      errors: [{ code: "CLI_INPUT_INVALID", path: arguments_[0], message: error instanceof Error ? error.message : String(error) }],
      metrics: { readiness: null, disclosed_gap_count: null, source_count: 0, evidence_count: 0, verified_evidence_count: 0, gates: [] }
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
