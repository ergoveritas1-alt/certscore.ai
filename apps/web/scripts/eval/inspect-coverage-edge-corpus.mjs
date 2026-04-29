import fs from "node:fs";
import path from "node:path";

const COVERAGE_EDGE_FINDINGS = [
  "cookie_disclosure_gap",
  "pre_consent_tracking_detected",
  "rtb_cookie_sync_observed",
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected"
];

function loadJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const objects = [];
  let buffer = "";
  let depth = 0;
  let escapeNext = false;
  let inString = false;
  for (const ch of content) {
    buffer += ch;
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0 && buffer.trim()) {
      objects.push(JSON.parse(buffer.trim()));
      buffer = "";
    }
  }
  return objects;
}

function loadCorpusObjects(baseDir) {
  const directJsonl = path.join(baseDir, "kimi_review_input.jsonl");
  if (fs.existsSync(directJsonl)) {
    return loadJsonl(directJsonl);
  }

  return [
    ...loadJsonl(path.join(baseDir, "agreed_kimi_review_input.jsonl")),
    ...loadJsonl(path.join(baseDir, "challenge-only_kimi_review_input.jsonl")),
    ...loadJsonl(path.join(baseDir, "no-positives_kimi_review_input.jsonl"))
  ];
}

function getSnippetCount(example) {
  return Array.isArray(example.evidence?.evidence_snippets) ? example.evidence.evidence_snippets.length : 0;
}

function getCoverageEvidence(example) {
  return example.coverage_limitation_evidence && typeof example.coverage_limitation_evidence === "object"
    ? example.coverage_limitation_evidence
    : null;
}

function getRuntimeSignalCount(coverageEvidence) {
  const retained = coverageEvidence?.runtimeSignalsRetained;
  if (!retained || typeof retained !== "object") return 0;
  const numericKeys = ["preconsentEvidenceUrlCount", "scriptTagCount", "thirdPartyRequestCount"];
  const numericTotal = numericKeys.reduce((sum, key) => {
    const value = retained[key];
    return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
  const sampleTotal = ["requestDomainSamples", "trackerVendorSamples"].reduce((sum, key) => {
    const value = retained[key];
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);
  return numericTotal + sampleTotal;
}

function summarizeFinding(examples, findingId) {
  const scoped = examples.filter((example) => example.finding_id === findingId || example.candidate_finding_id === findingId);
  const positives = scoped.filter((example) => example.example_type === "positive");
  const challenges = scoped.filter((example) => example.example_type === "challenge");
  const strongChallenges = challenges.filter((example) => example.confidence === "strong");
  const strongZeroSnippetChallenges = strongChallenges.filter((example) => getSnippetCount(example) === 0);
  const explainedStrongZeroSnippetChallenges = strongZeroSnippetChallenges.filter((example) => {
    const coverageEvidence = getCoverageEvidence(example);
    const flags = Array.isArray(coverageEvidence?.coverageFlags) ? coverageEvidence.coverageFlags : example.coverage_flags ?? [];
    return flags.length > 0 && getRuntimeSignalCount(coverageEvidence) > 0;
  });
  const positiveSnippetCoverage = positives.length
    ? positives.filter((example) => getSnippetCount(example) > 0).length / positives.length
    : null;

  return {
    findingId,
    positives: positives.length,
    challenges: challenges.length,
    strongChallenges: strongChallenges.length,
    strongZeroSnippetChallenges: strongZeroSnippetChallenges.length,
    explainedStrongZeroSnippetChallenges: explainedStrongZeroSnippetChallenges.length,
    positiveSnippetCoverage,
    status:
      strongZeroSnippetChallenges.length === explainedStrongZeroSnippetChallenges.length
        ? "pass"
        : "review"
  };
}

function formatPct(value) {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function resolveBaseDir(arg) {
  const value = arg ?? "artifacts/eval/finding-corpus/2026-04-28-merged-reviewed";
  const direct = path.resolve(value);
  if (fs.existsSync(direct)) return direct;
  if (value.startsWith("apps/web/")) {
    const webRelative = path.resolve(value.slice("apps/web/".length));
    if (fs.existsSync(webRelative)) return webRelative;
  }
  return direct;
}

const baseDirArg = process.argv.slice(2).find((arg) => arg !== "--");
const baseDir = resolveBaseDir(baseDirArg);
const examples = loadCorpusObjects(baseDir);

if (examples.length === 0) {
  console.error(`No corpus examples found under ${baseDir}`);
  process.exitCode = 1;
} else {
  const summaries = COVERAGE_EDGE_FINDINGS.map((findingId) => summarizeFinding(examples, findingId));
  console.log(`Coverage-edge corpus inspection: ${baseDir}`);
  console.log("finding_id,positives,challenges,strong_challenges,strong_zero_snippet,explained_strong_zero_snippet,positive_snippet_coverage,status");
  for (const summary of summaries) {
    console.log([
      summary.findingId,
      summary.positives,
      summary.challenges,
      summary.strongChallenges,
      summary.strongZeroSnippetChallenges,
      summary.explainedStrongZeroSnippetChallenges,
      formatPct(summary.positiveSnippetCoverage),
      summary.status
    ].join(","));
  }

  if (summaries.some((summary) => summary.status === "review")) {
    process.exitCode = 1;
  }
}
