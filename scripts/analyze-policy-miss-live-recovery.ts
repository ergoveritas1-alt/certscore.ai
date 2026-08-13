import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

async function main() {
const root = process.argv[2];
if (!root) throw new Error("Usage: analyze-policy-miss-live-recovery <baseline-directory>");

const diagnosis = JSON.parse(await readFile(path.join(root, "scaled-diagnosis-progress.json"), "utf8")) as JsonRecord;
const baseline = JSON.parse(await readFile(path.join(root, "baseline.json"), "utf8")) as JsonRecord;
const baselineByScanId = new Map(array(baseline.rows).map(record).flatMap((row) => {
  const scanId = string(row.scan_id);
  return scanId ? [[scanId, row] as const] : [];
}));
const summary = JSON.parse(await readFile(
  path.join(root, "policy-miss-live-run", "Wc01V2ScanLabCohort.summary.json"),
  "utf8",
)) as JsonRecord;
const cases = array(diagnosis.confirmedCases).map(record)
  .filter((row) => string(row.label)?.startsWith("false_negative_"));
const caseByDomain = new Map(cases.map((row) => [canonicalDomain(row.hostname), row]));

const rows = await Promise.all(array(summary.results).map(record).map(async (result) => {
  const domain = canonicalDomain(result.domain ?? result.url);
  const diagnosisCase = caseByDomain.get(domain);
  if (!diagnosisCase) throw new Error(`No adjudicated case for ${domain}`);
  const cohort = string(result.cohort);
  if (!cohort) throw new Error(`Missing cohort for ${domain}`);
  const bundlePath = path.join("artifacts", `v2-calibration-${cohort}`, domain, "CanonicalEvidenceBundle.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as JsonRecord;
  const privacyObservations = array(bundle.policySurfaceObservations).map(record)
    .filter((observation) => observation.surfaceType === "privacy_policy");
  const useful = privacyObservations.filter((observation) =>
    observation.status === "fetched" &&
    observation.documentFetchState !== "failed" &&
    observation.documentEvaluationState === "usable" &&
    (string(observation.textExcerpt) || array(observation.observedTopics).length > 0)
  );
  const truthUrl = string(diagnosisCase.truthUrl) ?? "";
  const exactTruthRetained = useful.some((observation) =>
    equivalentPolicyUrl(string(observation.finalUrl) ?? string(observation.normalizedUrl) ?? string(observation.url) ?? "", truthUrl)
  );
  const noGo = record(result.runtime).noGoCandidate === true;
  const alternatePolicyDocuments = useful.filter((observation) => observation.documentRole === "policy_document");
  const scopedOnly = useful.length > 0 && alternatePolicyDocuments.length > 0 && alternatePolicyDocuments.every((observation) =>
    /facial recognition|biometric|job applicant|recruitment|children(?:'s)? privacy/i.test(
      `${string(observation.title) ?? ""} ${string(observation.finalUrl) ?? string(observation.url) ?? ""}`,
    )
  );
  const sameBrandAlternate = alternatePolicyDocuments.some((observation) =>
    targetBrandToken(result.url) === targetBrandToken(observation.finalUrl ?? observation.normalizedUrl ?? observation.url)
  );
  const recoveryClassification = noGo
    ? "no_go"
    : exactTruthRetained ? "confirmed_exact_truth"
    : scopedOnly ? "scoped_policy_only"
    : sameBrandAlternate ? "confirmed_same_brand_alternate"
    : useful.length > 0 ? "ambiguous_alternate_policy" : "missed";
  return {
    domain,
    baselineScanId: string(diagnosisCase.scanId),
    locale: localeForCase(diagnosisCase, baselineByScanId.get(string(diagnosisCase.scanId) ?? ""), bundle),
    originalFailureClass: string(diagnosisCase.label),
    firstBrokenStage: string(diagnosisCase.firstBrokenStage),
    truthUrl,
    currentNoGo: noGo,
    currentNoGoReasons: array(record(result.runtime).noGoReasons),
    usefulPolicyCaptured: useful.length > 0 && !noGo,
    exactAdjudicatedTruthRetained: exactTruthRetained && !noGo,
    recoveryClassification,
    usefulPolicyUrls: useful.map((observation) =>
      string(observation.finalUrl) ?? string(observation.normalizedUrl) ?? string(observation.url)
    ).filter(Boolean),
    usefulPolicyOwnership: useful.map((observation) => ({
      relationship: observation.targetRelationship ?? "unknown",
      confidence: observation.ownershipConfidence ?? null,
    })),
    policyInspection: bundle.policySurfaceInspection ?? null,
    bundlePath,
  };
}));

const normallyReached = rows.filter((row) => !row.currentNoGo);
const recovered = normallyReached.filter((row) => row.usefulPolicyCaptured);
const confirmedRecovered = normallyReached.filter((row) => row.recoveryClassification.startsWith("confirmed_"));
const ambiguous = normallyReached.filter((row) => row.recoveryClassification === "ambiguous_alternate_policy");
const scopedOnly = normallyReached.filter((row) => row.recoveryClassification === "scoped_policy_only");
const missed = normallyReached.filter((row) => row.recoveryClassification === "missed");
const noGo = rows.filter((row) => row.currentNoGo);
const byLocale = Object.values(Object.groupBy(rows, (row) => row.locale ?? "unknown"))
  .map((localeRows) => {
    const values = localeRows ?? [];
    const reached = values.filter((row) => !row.currentNoGo);
    return {
      locale: values[0]?.locale ?? "unknown",
      attempted: values.length,
      normallyReached: reached.length,
      confirmedRecovered: reached.filter((row) => row.recoveryClassification.startsWith("confirmed_")).length,
      confirmedRecoveryRate: rate(reached.filter((row) => row.recoveryClassification.startsWith("confirmed_")).length, reached.length),
    };
  }).sort((left, right) => left.locale.localeCompare(right.locale));
const byFailureClass = Object.entries(Object.groupBy(rows, (row) => row.originalFailureClass ?? "unknown"))
  .map(([failureClass, values]) => {
    const reached = (values ?? []).filter((row) => !row.currentNoGo);
    return {
      failureClass,
      attempted: values?.length ?? 0,
      normallyReached: reached.length,
      confirmedRecovered: reached.filter((row) => row.recoveryClassification.startsWith("confirmed_")).length,
      ambiguous: reached.filter((row) => row.recoveryClassification === "ambiguous_alternate_policy").length,
      scopedOnly: reached.filter((row) => row.recoveryClassification === "scoped_policy_only").length,
      confirmedRecoveryRate: rate(reached.filter((row) => row.recoveryClassification.startsWith("confirmed_")).length, reached.length),
    };
  }).sort((left, right) => left.failureClass.localeCompare(right.failureClass));

const report = {
  schemaVersion: "policy_miss_live_recovery.1",
  generatedAt: new Date().toISOString(),
  runKey: "policy-miss-35-20260813-owner-exception-v1",
  metrics: {
    attempted: rows.length,
    completed: array(summary.results).map(record).filter((row) => row.status === "completed").length,
    noGo: noGo.length,
    normallyReached: normallyReached.length,
    usefulPoliciesRecovered: recovered.length,
    confirmedGeneralPoliciesRecovered: confirmedRecovered.length,
    ambiguousAlternatePolicies: ambiguous.length,
    scopedPoliciesOnly: scopedOnly.length,
    missedOnNormallyReachedSites: missed.length,
    confirmedRecoveryRateNormallyReached: rate(confirmedRecovered.length, normallyReached.length),
    broadUsefulDocumentRateNormallyReached: rate(recovered.length, normallyReached.length),
    exactAdjudicatedTruthUrlsRetained: rows.filter((row) => row.exactAdjudicatedTruthRetained).length,
  },
  byLocale,
  byFailureClass,
  confirmedRecoveredDomains: confirmedRecovered.map((row) => row.domain),
  ambiguousDomains: ambiguous.map((row) => row.domain),
  scopedOnlyDomains: scopedOnly.map((row) => row.domain),
  missedDomains: missed.map((row) => row.domain),
  noGoDomains: noGo.map((row) => ({ domain: row.domain, reasons: row.currentNoGoReasons })),
  rows,
  limitations: [
    "Recovery means at least one fetched privacy-policy observation was retained as usable with substantive evidence on a normally reached policy-only scan.",
    "Confirmed recovery additionally requires the adjudicated truth URL or a non-scoped policy document on the same deterministic brand token; ambiguous parent-brand alternates are reported separately.",
    "Exact truth URL agreement is reported separately because an applicable target or parent-brand policy may be useful even when its URL differs from the adjudicated example.",
    "No-go targets are excluded from the normally-reached recovery denominator and are not counted as misses.",
    "This diagnostic run is artifact-only and does not project findings or scores.",
  ],
};
const outputPath = path.join(root, "policy-miss-live-recovery.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ metrics: report.metrics, byFailureClass, missedDomains: report.missedDomains, noGoDomains: report.noGoDomains }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function canonicalDomain(value: unknown): string {
  const input = string(value) ?? "unknown";
  try {
    return new URL(input.includes("://") ? input : `https://${input}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.replace(/^www\./, "").toLowerCase();
  }
}

function equivalentPolicyUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left, "https://placeholder.invalid");
    const b = new URL(right, "https://placeholder.invalid");
    const hostA = a.hostname.replace(/^www\./, "").toLowerCase();
    const hostB = b.hostname.replace(/^www\./, "").toLowerCase();
    const pathA = a.pathname.replace(/\/+$/, "").toLowerCase();
    const pathB = b.pathname.replace(/\/+$/, "").toLowerCase();
    return hostA === hostB && pathA === pathB;
  } catch {
    return left === right;
  }
}

function localeForCase(diagnosisCase: JsonRecord, baselineRow: JsonRecord | undefined, bundle: JsonRecord): string {
  const observed = array(bundle.policySurfaceObservations).map(record)
    .map((row) => string(row.matchedLocale)).find(Boolean);
  return observed ?? string(baselineRow?.site_language_primary) ?? string(diagnosisCase.locale) ?? "unknown";
}

function targetBrandToken(value: unknown): string {
  const hostname = canonicalDomain(value);
  const labels = hostname.split(".");
  const registrableIndex = labels.length >= 3 && labels.at(-1)?.length === 2 && labels.at(-2)?.length !== undefined && (labels.at(-2)?.length ?? 0) <= 3
    ? labels.length - 3
    : labels.length - 2;
  return (labels[Math.max(0, registrableIndex)] ?? "").replace(/[^a-z0-9]/g, "");
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}
