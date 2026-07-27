import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalEvidenceBundleSchema } from "../packages/certscore-contracts/src/index.js";

const execFileAsync = promisify(execFile);
const DEFAULT_LIMIT = 3000;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_OUT = "artifacts/prod-consent-control-artifact-verifier";

type ScanRow = {
  scanId: string;
  completedAt: string;
  hostname: string;
  url: string;
  processor: string | null;
  scanStatus: string;
  scanOutcome: string | null;
  artifactUri: string | null;
  artifactSha256: string | null;
  artifactSizeBytes: number | null;
  oldAccept: boolean | null;
  oldReject: boolean | null;
  oldOptions: boolean | null;
  oldCmp: string | null;
  localArtifactPath?: string;
};

type RowResult = {
  scanId: string;
  completedAt: string;
  hostname: string;
  url: string;
  status: "verified" | "legacy" | "artifact_unavailable" | "bundle_invalid" | "failed";
  geometryStatus: "complete_positive" | "complete_negative" | "document_mismatch" | "incomplete" | "missing";
  old: { accept: boolean | null; reject: boolean | null; options: boolean | null; cmp: string | null };
  current: { accept: boolean | null; reject: boolean | null; options: boolean | null; cmp: string | null };
  candidatePastErrors: string[];
  invariantViolations: string[];
  manualReviewReasons: string[];
  artifactBytes?: number;
  geometryPresent: boolean;
  ambiguousVisibleConsentControlCandidate: boolean;
  reconciledLegacyConsentModalCluster: boolean;
  reclassificationEligible: boolean;
  preconsentActivityObserved: boolean;
  error?: string;
};

type GeometrySummary = {
  firstLayerAccept?: boolean;
  firstLayerReject?: boolean;
  firstLayerOptions?: boolean;
  confidence?: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await selectScans(args.limit);
  await mkdir(args.out, { recursive: true });
  const results = await mapWithConcurrency(rows, args.concurrency, (row) => verifyScan(row));
  const report = buildReport({ args, rows, results });
  const outputPath = path.resolve(args.out, "ProdConsentControlArtifactVerification.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const markdownPath = path.resolve(args.out, "ProdConsentControlArtifactVerification.md");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({ outputPath, markdownPath, summary: report.summary }, null, 2));
}

async function selectScans(limit: number): Promise<ScanRow[]> {
  const root = path.resolve(process.env.CERTSCORE_LOCAL_ARTIFACT_ROOT ?? "artifacts");
  const artifactPaths = await findLocalBundlePaths(root);
  const rows = await mapWithConcurrency(artifactPaths, 32, async (localArtifactPath): Promise<ScanRow | null> => {
    try {
      const bundle = JSON.parse(await readFile(localArtifactPath, "utf8")) as Record<string, unknown>;
      const artifactBuffer = await readFile(localArtifactPath);
      const url = typeof bundle.url === "string" ? bundle.url : typeof bundle.normalizedUrl === "string" ? bundle.normalizedUrl : "https://unknown.invalid/";
      let hostname = "unknown";
      try { hostname = new URL(url).hostname || hostname; } catch { /* retain bounded fallback */ }
      const completedAt = typeof bundle.completedAt === "string" && bundle.completedAt
        ? bundle.completedAt
        : (await stat(localArtifactPath)).mtime.toISOString();
      return {
        scanId: typeof bundle.scanId === "string" ? bundle.scanId : path.basename(path.dirname(localArtifactPath)),
        completedAt: await completedAt,
        hostname,
        url,
        processor: "local-certscore-v2-dag-parallel-v1",
        scanStatus: "completed",
        scanOutcome: null,
        artifactUri: null,
        artifactSha256: createHash("sha256").update(artifactBuffer).digest("hex"),
        artifactSizeBytes: artifactBuffer.byteLength,
        oldAccept: null,
        oldReject: null,
        oldOptions: null,
        oldCmp: null,
        localArtifactPath,
      } satisfies ScanRow;
    } catch {
      return null;
    }
  });
  return rows.filter((row): row is ScanRow => Boolean(row))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, limit);
}

async function findLocalBundlePaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await findLocalBundlePaths(entryPath));
    else if (entry.isFile() && entry.name === "CanonicalEvidenceBundle.json") paths.push(entryPath);
  }
  return paths;
}

async function verifyScan(row: ScanRow): Promise<RowResult> {
  const base = {
    scanId: row.scanId,
    completedAt: row.completedAt,
    hostname: row.hostname,
    url: row.url,
    old: { accept: row.oldAccept, reject: row.oldReject, options: row.oldOptions, cmp: row.oldCmp },
    current: { accept: null, reject: null, options: null, cmp: null },
    candidatePastErrors: [] as string[],
    invariantViolations: [] as string[],
    manualReviewReasons: [] as string[],
    geometryPresent: false,
    ambiguousVisibleConsentControlCandidate: false,
    reconciledLegacyConsentModalCluster: false,
    reclassificationEligible: false,
    preconsentActivityObserved: false,
  };
  if (!row.artifactUri && !row.localArtifactPath) {
    return { ...base, status: "legacy", geometryStatus: "missing", error: "No verified v2 scan artifact pointer was retained." };
  }
  try {
    const bundleBuffer = row.localArtifactPath
      ? await readFile(row.localArtifactPath)
      : await readS3Artifact(row.artifactUri!, row.artifactSha256, row.artifactSizeBytes);
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(bundleBuffer.toString("utf8"))) as Record<string, unknown>;
    const geometryBuffer = row.localArtifactPath
      ? await readLocalGeometryArtifact(row.localArtifactPath)
      : await readS3ArtifactOptional(adjacentArtifactUri(row.artifactUri!, "ConsentControlGeometryEvidence.json"));
    if (!geometryBuffer) {
      return { ...base, status: "verified", geometryStatus: "missing", manualReviewReasons: ["geometry_artifact_missing"] };
    }
    const geometry = JSON.parse(geometryBuffer.toString("utf8")) as Record<string, unknown>;
    base.geometryPresent = true;
    const geometryStatus = assessGeometryStatus(bundle, geometry);
    const reconciledLegacyConsentModalCluster =
      reconciledConsentModalContainerIds(geometry).size > 0;
    const ambiguousVisibleConsentControlCandidate =
      hasAmbiguousVisibleConsentControlCandidate(geometry);
    const reclassificationEligible = isNarrowGeometryReclassificationEligible(bundle, geometry, geometryStatus);
    const preconsentActivityObserved = hasRetainedPreconsentActivity(bundle);
    const choices = summarizeLocalGeometryChoices(geometry, geometryStatus);
    const current = {
      accept: choices?.acceptControlObserved === true,
      reject: choices?.rejectControlObserved === true,
      options: choices?.managePreferencesControlObserved === true,
      cmp: typeof (geometry.summary as Record<string, unknown> | undefined)?.cmpName === "string"
        ? (geometry.summary as Record<string, unknown>).cmpName as string
        : null,
    };
    const invariantViolations = invariantChecks(geometry, choices, geometryStatus);
    const candidatePastErrors = historicalDisagreements(row, current, geometryStatus, invariantViolations);
    const manualReviewReasons = reviewReasons(row, geometryStatus, current, candidatePastErrors, invariantViolations);
    return {
      ...base,
      status: "verified",
      geometryStatus,
      current,
      candidatePastErrors,
      invariantViolations,
      manualReviewReasons,
      artifactBytes: bundleBuffer.byteLength,
      ambiguousVisibleConsentControlCandidate,
      reconciledLegacyConsentModalCluster,
      reclassificationEligible,
      preconsentActivityObserved,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const bundleInvalid = errorMessage.trimStart().startsWith("[") || errorMessage.includes("invalid_enum_value");
    return {
      ...base,
      status: bundleInvalid ? "bundle_invalid" : "failed",
      geometryStatus: "missing",
      error: errorMessage,
    };
  }
}

function isNarrowGeometryReclassificationEligible(
  bundle: Record<string, unknown>,
  geometry: Record<string, unknown>,
  geometryStatus: RowResult["geometryStatus"],
) {
  if (geometryStatus !== "complete_negative") return false;
  if (reconciledConsentModalContainerIds(geometry).size > 0) return false;
  if (hasAmbiguousVisibleConsentControlCandidate(geometry)) return false;
  const inspection = isRecord(bundle.consentSurfaceInspection)
    ? bundle.consentSurfaceInspection
    : isRecord(bundle.consent_surface_inspection)
      ? bundle.consent_surface_inspection
      : null;
  if (!inspection) return false;
  const alreadyComplete =
    inspection.inspectionCompleted === true &&
    inspection.coverageStatus === "complete";
  if (alreadyComplete) return false;
  const limitationKeys = Array.isArray(inspection.limitationKeys)
    ? inspection.limitationKeys.filter((value): value is string => typeof value === "string")
    : [];
  const resolvable = new Set([
    "cmp_runtime_without_actionable_surface",
    "consent_surface_inspection_settled_inventory_missing",
  ]);
  return limitationKeys.length > 0 && limitationKeys.every((key) => resolvable.has(key));
}

function hasAmbiguousVisibleConsentControlCandidate(geometry: Record<string, unknown>) {
  const canonicalActions = new Set([
    "accept_all",
    "reject_all",
    "manage_preferences",
    "save_preferences",
  ]);
  const candidates = Array.isArray(geometry.candidates)
    ? geometry.candidates.filter(isRecord)
    : [];
  const reconciledContainerIds = reconciledConsentModalContainerIds(geometry);
  return candidates.some((candidate) => {
    const style = isRecord(candidate.computedStyle) ? candidate.computedStyle : null;
    const box = isRecord(candidate.boundingBox) ? candidate.boundingBox : null;
    const opacity = typeof style?.opacity === "string"
      ? Number.parseFloat(style.opacity)
      : null;
    return (
      canonicalActions.has(typeof candidate.actionType === "string" ? candidate.actionType : "") &&
      candidate.layer !== "first_layer" &&
      (
        typeof candidate.containerId !== "string" ||
        !reconciledContainerIds.has(candidate.containerId)
      ) &&
      candidate.decisionStatus === "confirmed_visible" &&
      candidate.enabled !== false &&
      candidate.intersectsViewport === true &&
      typeof box?.width === "number" &&
      box.width > 0 &&
      typeof box.height === "number" &&
      box.height > 0 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      style?.pointerEvents !== "none" &&
      !(opacity !== null && Number.isFinite(opacity) && opacity <= 0.05) &&
      candidate.clippedByScrollableAncestor !== true
    );
  });
}

function reconciledConsentModalContainerIds(geometry: Record<string, unknown>) {
  const reconciled = new Set<string>();
  const containers = Array.isArray(geometry.containers)
    ? geometry.containers.filter(isRecord)
    : [];
  const containersById = new Map(containers.flatMap((container) =>
    typeof container.containerId === "string"
      ? [[container.containerId, container] as const]
      : []
  ));
  const candidates = Array.isArray(geometry.candidates)
    ? geometry.candidates.filter(isRecord)
    : [];
  const actionsByContainer = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (
      typeof candidate.containerId !== "string" ||
      candidate.layer !== "page_body" ||
      candidate.decisionStatus !== "confirmed_visible" ||
      !["accept_all", "reject_all", "manage_preferences"].includes(
        typeof candidate.actionType === "string" ? candidate.actionType : ""
      )
    ) {
      continue;
    }
    const actions = actionsByContainer.get(candidate.containerId) ?? new Set<string>();
    actions.add(candidate.actionType as string);
    actionsByContainer.set(candidate.containerId, actions);
  }
  for (const [containerId, actions] of actionsByContainer) {
    const container = containersById.get(containerId);
    if (!container) continue;
    const context = [
      container.selectorHint,
      container.id,
      container.classes,
      container.role,
      container.ariaLabel,
      container.textExcerpt,
      container.htmlExcerpt,
    ].filter((value): value is string => typeof value === "string").join(" ");
    const hasConsentContext =
      /cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|personal data/i.test(context);
    const hasModalSemantics =
      /\b(?:alert)?dialog\b|aria-modal\s*=\s*["']?true|data-borlabs-cookie-consent-required/i.test(context);
    const hasOverlayStyling =
      /(?:position\s*:\s*fixed|\bfixed\b|w-screen|h-screen|inset-0|z-max|dialog-backdrop|cookiebox)/i.test(context);
    if (
      hasConsentContext &&
      (hasModalSemantics || hasOverlayStyling) &&
      actions.has("accept_all") &&
      (actions.has("reject_all") || actions.has("manage_preferences"))
    ) {
      reconciled.add(containerId);
    }
  }
  return reconciled;
}

function hasRetainedPreconsentActivity(bundle: Record<string, unknown>) {
  const runtimeCoverage = isRecord(bundle.runtimeCoverage) ? bundle.runtimeCoverage : null;
  const counts = isRecord(runtimeCoverage?.observationCounts) ? runtimeCoverage.observationCounts : null;
  return (
    (typeof counts?.thirdPartyRequests === "number" && counts.thirdPartyRequests > 0) ||
    (typeof counts?.cookiesBeforeConsent === "number" && counts.cookiesBeforeConsent > 0)
  );
}

function summarizeLocalGeometryChoices(geometry: Record<string, unknown>, status: RowResult["geometryStatus"]): Record<string, unknown> | null {
  if (status !== "complete_positive" && status !== "complete_negative") return null;
  const summary = isRecord(geometry.summary) ? geometry.summary : {};
  return {
    acceptControlObserved: summary.firstLayerAccept === true,
    rejectControlObserved: summary.firstLayerReject === true,
    managePreferencesControlObserved: summary.firstLayerOptions === true,
  };
}

async function readLocalGeometryArtifact(bundlePath: string) {
  try {
    return await readFile(path.join(path.dirname(bundlePath), "ConsentControlGeometryEvidence.json"));
  } catch {
    return null;
  }
}

function assessGeometryStatus(bundle: Record<string, unknown>, geometry: Record<string, unknown>): RowResult["geometryStatus"] {
  const summary = isRecord(geometry.summary) ? geometry.summary as GeometrySummary : null;
  const geometryUrl = canonicalDocumentUrl(geometry.pageUrl);
  const finalUrl = finalDocumentUrl(bundle);
  const complete = Boolean(
    summary && typeof summary.firstLayerAccept === "boolean" &&
    typeof summary.firstLayerReject === "boolean" &&
    typeof summary.firstLayerOptions === "boolean" &&
    typeof summary.confidence === "number" && summary.confidence > 0 &&
    Array.isArray(geometry.candidates) && geometryUrl && finalUrl,
  );
  if (!complete) return "incomplete";
  if (geometryUrl !== finalUrl) return "document_mismatch";
  return summary.firstLayerAccept || summary.firstLayerReject || summary.firstLayerOptions
    ? "complete_positive"
    : "complete_negative";
}

function invariantChecks(geometry: Record<string, unknown>, choices: Record<string, unknown> | null, status: RowResult["geometryStatus"]): string[] {
  const violations: string[] = [];
  if (status === "complete_positive" || status === "complete_negative") {
    const summary = geometry.summary as GeometrySummary;
    const expected = {
      accept: summary.firstLayerAccept === true,
      reject: summary.firstLayerReject === true,
      options: summary.firstLayerOptions === true,
    };
    const actual = {
      accept: choices?.acceptControlObserved === true,
      reject: choices?.rejectControlObserved === true,
      options: choices?.managePreferencesControlObserved === true,
    };
    for (const key of ["accept", "reject", "options"] as const) {
      if (expected[key] !== actual[key]) violations.push(`geometry_summary_projection_mismatch:${key}`);
    }
  }
  if (status === "complete_negative" && choices && (
    choices.acceptControlObserved === true || choices.rejectControlObserved === true || choices.managePreferencesControlObserved === true
  )) {
    violations.push("complete_negative_geometry_projected_observed_control");
  }
  return violations;
}

function historicalDisagreements(row: ScanRow, current: RowResult["current"], status: RowResult["geometryStatus"], violations: string[]): string[] {
  if (status !== "complete_positive" && status !== "complete_negative") return [];
  const candidates: string[] = [];
  if (row.oldAccept !== null && row.oldAccept !== current.accept) candidates.push(row.oldAccept ? "old_accept_true_current_false" : "old_accept_false_current_true");
  if (row.oldReject !== null && row.oldReject !== current.reject) candidates.push(row.oldReject ? "old_reject_true_current_false" : "old_reject_false_current_true");
  if (row.oldOptions !== null && row.oldOptions !== current.options) candidates.push(row.oldOptions ? "old_options_true_current_false" : "old_options_false_current_true");
  if (violations.length > 0) candidates.push(...violations.map((value) => `implementation_invariant:${value}`));
  return candidates;
}

function reviewReasons(row: ScanRow, status: RowResult["geometryStatus"], current: RowResult["current"], disagreements: string[], violations: string[]): string[] {
  const reasons = [...disagreements];
  if (status === "document_mismatch") reasons.push("document_mismatch");
  if (status === "incomplete") reasons.push("incomplete_geometry");
  if (row.oldCmp && !current.cmp) reasons.push("historical_cmp_without_current_geometry_cmp_name");
  if (violations.length > 0) reasons.push("invariant_violation");
  return [...new Set(reasons)].slice(0, 12);
}

function buildReport(input: { args: ReturnType<typeof parseArgs>; rows: ScanRow[]; results: RowResult[] }) {
  const counts = (values: string[]) => values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
  const historicalCandidates = input.results.filter((row) => row.candidatePastErrors.length > 0);
  return {
    reportVersion: "certscore.local_consent_control_artifact_verification.1",
    generatedAt: new Date().toISOString(),
    policy: {
      liveScansExecuted: false,
      consentInteractionsExecuted: false,
      productionWritesExecuted: false,
      historicalDisagreementsAreCandidatesNotProof: true,
    },
    cohort: { requested: input.args.limit, selected: input.rows.length, source: "local_certscore_artifacts", ordering: "completedAt_desc_then_filesystem_mtime" },
    summary: {
      total: input.results.length,
      verified: input.results.filter((row) => row.status === "verified").length,
      legacy: input.results.filter((row) => row.status === "legacy").length,
      artifactUnavailable: input.results.filter((row) => row.status === "artifact_unavailable").length,
      bundleInvalid: input.results.filter((row) => row.status === "bundle_invalid").length,
      failed: input.results.filter((row) => row.status === "failed").length,
      geometry: counts(input.results.map((row) => row.geometryStatus)),
      ambiguousVisibleConsentControlCandidateScans: input.results.filter(
        (row) => row.ambiguousVisibleConsentControlCandidate
      ).length,
      completeNegativeWithAmbiguousVisibleConsentControlCandidateScans: input.results.filter(
        (row) =>
          row.geometryStatus === "complete_negative" &&
          row.ambiguousVisibleConsentControlCandidate
      ).length,
      reconciledLegacyConsentModalClusterScans: input.results.filter(
        (row) => row.reconciledLegacyConsentModalCluster
      ).length,
      candidatePastErrorScans: historicalCandidates.length,
      candidatePastErrorCounts: counts(historicalCandidates.flatMap((row) => row.candidatePastErrors)),
      invariantViolationScans: input.results.filter((row) => row.invariantViolations.length > 0).length,
      invariantViolationCounts: counts(input.results.flatMap((row) => row.invariantViolations)),
      narrowReclassificationScans: input.results.filter((row) => row.reclassificationEligible).length,
      narrowReclassificationWithPreconsentActivityScans: input.results.filter(
        (row) => row.reclassificationEligible && row.preconsentActivityObserved
      ).length,
      manualReviewScans: input.results.filter((row) => row.manualReviewReasons.length > 0).length,
      manualReviewReasonCounts: counts(input.results.flatMap((row) => row.manualReviewReasons)),
    },
    recommendations: recommendations(input.results),
    rows: input.results,
  };
}

function recommendations(results: RowResult[]) {
  const recommendations: string[] = [];
  const complete = results.filter((row) => row.geometryStatus === "complete_positive" || row.geometryStatus === "complete_negative");
  const mismatch = results.filter((row) => row.geometryStatus === "document_mismatch").length;
  const missing = results.filter((row) => row.geometryStatus === "missing" || row.geometryStatus === "incomplete").length;
  const invariant = results.filter((row) => row.invariantViolations.length > 0).length;
  const invalid = results.filter((row) => row.status === "bundle_invalid").length;
  if (invalid > 0) recommendations.push(`${invalid} retained bundles use an older or incompatible evidence schema; exclude them from consent-control accuracy conclusions or migrate them before expanding the baseline.`);
  if (complete.length === 0) recommendations.push("No complete geometry cohort was available; do not draw accuracy conclusions.");
  if (missing > 0) recommendations.push("Improve artifact retention or backfill geometry before using historical rates as an accuracy baseline.");
  if (mismatch > 0) recommendations.push("Review document-generation identity and navigation timing for redirect mismatches.");
  if (invariant > 0) recommendations.push("Block release until geometry-summary and projection invariants are resolved.");
  if (complete.length > 0 && invariant === 0) recommendations.push("The complete retained cohort is internally consistent with the new geometry-authoritative projection; manually adjudicate a stratified sample before calling historical disagreements true errors.");
  return recommendations;
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
  const s = report.summary;
  return [
    "# Local Consent-Control Artifact Verification",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This report reads retained artifacts only. It does not scan live sites, click consent controls, or write to production.",
    "",
    "## Summary",
    "",
    `- Cohort: ${report.cohort.selected} of ${report.cohort.requested} requested scans`,
    `- Verified bundles: ${s.verified}; legacy: ${s.legacy}; failed: ${s.failed}`,
    `- Candidate historical-error scans: ${s.candidatePastErrorScans}`,
    `- Invariant-violation scans: ${s.invariantViolationScans}`,
    `- Manual-review scans: ${s.manualReviewScans}`,
    "",
    "## Interpretation",
    "",
    "Historical disagreements are candidate past errors, not definitive errors: a site may have changed between scans, and legacy snapshot fields are not a gold label. Complete geometry with no invariant violations is evidence that the new approach is internally consistent, not proof of internet-wide accuracy.",
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
    "",
  ].join("\n");
}

async function readS3Artifact(uri: string, expectedSha256: string | null, expectedSizeBytes: number | null) {
  const buffer = await readS3ArtifactOptional(uri);
  if (!buffer) throw new Error(`Artifact unavailable: ${uri}`);
  if (expectedSizeBytes !== null && buffer.byteLength !== expectedSizeBytes) throw new Error(`Artifact size mismatch: ${uri}`);
  if (expectedSha256 && createHash("sha256").update(buffer).digest("hex") !== expectedSha256.toLowerCase()) throw new Error(`Artifact checksum mismatch: ${uri}`);
  return buffer;
}

async function readS3ArtifactOptional(uri: string) {
  try {
    const result = await execFileAsync("aws", ["s3", "cp", uri, "-", "--only-show-errors"], { maxBuffer: 64 * 1024 * 1024 });
    return Buffer.from(result.stdout);
  } catch {
    return null;
  }
}

function adjacentArtifactUri(uri: string, fileName: string) {
  return `${uri.slice(0, uri.lastIndexOf("/") + 1)}${fileName}`;
}

function finalDocumentUrl(bundle: Record<string, unknown>) {
  const snapshots = Array.isArray(bundle.domSnapshots) ? bundle.domSnapshots : [];
  const urls = snapshots.map((snapshot) => isRecord(snapshot) ? snapshot.url : null).filter((value): value is string => typeof value === "string");
  return canonicalDocumentUrl(urls.at(-1) ?? bundle.normalizedUrl ?? bundle.url);
}

function canonicalDocumentUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function mapWithConcurrency<T, U>(values: T[], concurrency: number, mapper: (value: T) => Promise<U>) {
  const results = new Array<U>(values.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function parseArgs(argv: string[]) {
  const args = { limit: DEFAULT_LIMIT, concurrency: DEFAULT_CONCURRENCY, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--limit" && value) { args.limit = Number(value); index += 1; }
    else if (flag === "--concurrency" && value) { args.concurrency = Number(value); index += 1; }
    else if (flag === "--out" && value) { args.out = value; index += 1; }
    else if (flag === "--help") { console.log("Usage: pnpm v2:verify-prod-consent-artifacts [--limit 3000] [--concurrency 16] [--out path]"); process.exit(0); }
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  if (!Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 10000) throw new Error("--limit must be an integer from 1 to 10000");
  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0 || args.concurrency > 32) throw new Error("--concurrency must be an integer from 1 to 32");
  return args;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
