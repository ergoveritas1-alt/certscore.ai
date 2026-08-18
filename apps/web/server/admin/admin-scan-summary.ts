import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { buildPulseProjection } from "../../lib/pulse/projection";
import {
  projectAdminEvidenceMatrix,
  type AdminEvidenceMatrix,
  type AdminProjectionContext,
  type AdminScanSizeMetrics
} from "../../lib/scans/admin-evidence-matrix";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { getAnonymousScanById, getScanById } from "../scans/get-scan-by-id";
import type { PublicScanRecord } from "../scans/get-public-scan-record";
import { trancoRankFromScanConfig } from "../scans/tranco-rank-metadata";
import { publishCanonicalScanReportProjection } from "../scans/canonical-scan-report-publisher";
import { loadPersistedScanReportProjection } from "../scans/scan-report-projection";
import { getPersistedCanonicalReportProjection } from "../scans/persisted-canonical-report-projection";
import { projectAdminNoGo } from "./admin-no-go";
import { persistAdminScanSummary } from "./repository";

export type AdminScanSummary = {
  adminEvidenceMatrix: AdminEvidenceMatrix;
  cmpVendorName: string | null;
  industry: string | null;
  primaryLanguage: string | null;
  privacyPolicyPresent: boolean | null;
  scanOutcome: string | null;
  score: number | null;
  topFindingIds: string[];
  topFindingCount: number;
};

const summaryPromises = new Map<string, Promise<AdminScanSummary | null>>();

export class CanonicalScanReportProjectionNotReadyError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Canonical report projection is not ready: ${reason}`);
    this.name = "CanonicalScanReportProjectionNotReadyError";
    this.reason = reason;
  }
}

async function timedAdminPersistencePhase<T>(
  scanId: string,
  phase: "report_projection" | "admin_summary",
  operation: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.info("[scan-materialization] phase completed", {
      durationMs: Date.now() - startedAt,
      phase,
      scanId,
    });
    return result;
  } catch (error) {
    console.error("[scan-materialization] phase failed", {
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      phase,
      scanId,
    });
    throw error;
  }
}

function recordString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordBoolean(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function recordNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordObject(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function projectAdminProjectionContext(scanRecord: PublicScanRecord): AdminProjectionContext {
  const scanConfig = scanRecord.scan.scanConfigJson;
  const execution = recordObject(scanConfig, "execution");
  const parallel = recordObject(execution, "v2DagParallel");
  const lambda = recordObject(execution, "v2DagLambda");
  const configuredProjection = recordObject(parallel, "wc01ProductionProjection");
  const materializedProjection = recordObject(scanRecord.runtimeArtifacts, "wc01ProductionProjection");
  const projection = materializedProjection ?? configuredProjection;
  const build = recordObject(lambda, "scannerBuildProvenance");
  const status = recordString(lambda, "scannerBuildProvenanceStatus");
  return {
    scannerBuildProvenanceStatus:
      status === "complete" || status === "partial" ? status : "unavailable",
    scannerExecutionMode:
      recordString(lambda, "scannerExecutionMode") ??
      recordString(parallel, "executionMode"),
    scannerGitSha: recordString(build, "gitSha"),
    wc01ProjectionMode: recordString(projection, "mode"),
    wc01ProjectionVersion: recordString(projection, "version"),
  };
}

function nonnegativeInteger(record: Record<string, unknown> | null, key: string) {
  const value = recordNumber(record, key);
  return value !== null && Number.isInteger(value) && value >= 0 ? value : null;
}

function projectAdminScanSizeMetrics(input: {
  networkSummary: Record<string, unknown> | null;
  policyDisclosureSummary: Record<string, unknown> | null;
}): AdminScanSizeMetrics {
  const websiteSource = recordObject(input.networkSummary, "siteResourceSizeSummary");
  const websiteTotalBytes = nonnegativeInteger(websiteSource, "totalTransferBytes");
  const websiteCompleteness = recordString(websiteSource, "completeness");
  const website = websiteSource && websiteTotalBytes !== null &&
    ["complete", "partial", "unavailable"].includes(websiteCompleteness ?? "")
    ? {
        measurementScope: "pre_consent_initial_navigation" as const,
        completeness: websiteCompleteness as "complete" | "partial" | "unavailable",
        responseCount: nonnegativeInteger(websiteSource, "responseCount") ?? 0,
        responsesWithSize: nonnegativeInteger(websiteSource, "responsesWithSize") ?? 0,
        responseBodyBytes: nonnegativeInteger(websiteSource, "responseBodyBytes") ?? 0,
        responseHeaderBytes: nonnegativeInteger(websiteSource, "responseHeaderBytes") ?? 0,
        totalBytes: websiteTotalBytes,
        megabytes: Math.round((websiteTotalBytes / (1024 * 1024)) * 1000) / 1000,
      }
    : null;
  const policySource = recordObject(input.policyDisclosureSummary, "privacyPolicySize");
  const compressedBytes = nonnegativeInteger(policySource, "compressedBytes");
  const decompressedBytes = nonnegativeInteger(policySource, "decompressedBytes");
  const policyUrl = recordString(policySource, "url");
  const policyCompleteness = recordString(policySource, "completeness");
  const privacyPolicy = policySource && policyUrl && policyUrl.length <= 500 &&
    ["complete", "unavailable"].includes(policyCompleteness ?? "")
    ? {
        measurementScope: "selected_usable_privacy_policy" as const,
        completeness: policyCompleteness as "complete" | "unavailable",
        url: policyUrl,
        documentFormat: (recordString(policySource, "documentFormat") ?? "unknown").slice(0, 40),
        compressedBytes,
        compressedKilobytes: compressedBytes === null ? null : Math.round((compressedBytes / 1024) * 100) / 100,
        decompressedBytes,
        decompressedKilobytes: decompressedBytes === null ? null : Math.round((decompressedBytes / 1024) * 100) / 100,
      }
    : null;
  return { website, privacyPolicy };
}

export async function persistAdminScanSummaryForPublishedRecord(
  scanRecord: PublicScanRecord,
): Promise<AdminScanSummary | null> {
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    return null;
  }
  const scanId = scanRecord.scan.id;
  const canonicalScanRecord = scanRecord;
  const persistedCanonicalProjection = getPersistedCanonicalReportProjection(canonicalScanRecord);
  let reportSummary: Record<string, unknown> | null = null;
  let resultDisposition: string | null = null;
  let checklistRows: GdprEprivacyCoverageChecklistItem[] = persistedCanonicalProjection?.checklistRows ?? [];
  let topFindingIds = persistedCanonicalProjection?.topFindingIds ?? [];
  if (!persistedCanonicalProjection) {
    const reportProjection = buildPulseProjection({
      detail: "evidence",
      format: "json",
      freshnessMode: "latest",
      pulseRequestId: `admin:${scanId}`,
      requestedUrl: canonicalScanRecord.scan.domainHostname ? `https://${canonicalScanRecord.scan.domainHostname}` : null,
      resolutionMode: "admin_projection",
      scanRecord: canonicalScanRecord,
      waitSeconds: 0
    });
    const reportProjectionRecord = reportProjection as unknown as Record<string, unknown>;
    reportSummary = recordObject(reportProjectionRecord, "summary");
    const surfacedResults = recordObject(reportProjectionRecord, "surfacedResults");
    const reportTopFindings = Array.isArray(surfacedResults?.gdprEprivacyFindings)
      ? surfacedResults.gdprEprivacyFindings
      : [];
    const checklistPacket = recordObject(reportProjectionRecord, "gdprEprivacyChecklistRows");
    checklistRows = Array.isArray(checklistPacket?.items)
      ? checklistPacket.items.filter((row): row is GdprEprivacyCoverageChecklistItem => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      : [];
    resultDisposition = recordString(reportProjectionRecord, "resultDisposition");
    topFindingIds = reportTopFindings.flatMap((finding) => {
      if (!finding || typeof finding !== "object" || Array.isArray(finding)) return [];
      const id = (finding as Record<string, unknown>).id;
      return typeof id === "string" && id.trim() ? [id.trim()] : [];
    });
  }
  const snapshot = canonicalScanRecord.snapshot;
  const runtimeArtifacts = canonicalScanRecord.runtimeArtifacts;
  const scanNoGoAssessment = recordObject(runtimeArtifacts, "scan_no_go_assessment") ??
    recordObject(runtimeArtifacts, "scanNoGoAssessment");
  const visualAccessReview = recordObject(runtimeArtifacts, "visual_access_review") ??
    recordObject(runtimeArtifacts, "visualAccessReview");
  const noGo = projectAdminNoGo({
    responseDisposition: resultDisposition,
    runtimeAssessment: scanNoGoAssessment,
    snapshotRuntimeAssessment: recordObject(snapshot, "scan_no_go_assessment"),
    snapshotOutcome: recordString(snapshot, "scan_outcome"),
    visualAccessReview,
    snapshotVisualAccessReview: recordObject(snapshot, "visual_access_review")
  });
  const visualEvidenceArtifacts = Array.isArray(runtimeArtifacts?.visual_evidence_artifacts)
    ? runtimeArtifacts.visual_evidence_artifacts
    : null;
  const cmpVendorName = noGo.isNoGo ? null : recordString(snapshot, "cmp_vendor_name");
  const policyDisclosureSummary = recordObject(runtimeArtifacts, "policyDisclosureSummary") ??
    recordObject(runtimeArtifacts, "policy_disclosure_summary");
  const networkSummary = recordObject(runtimeArtifacts, "networkSummary");
  const adminEvidenceMatrix = projectAdminEvidenceMatrix({
    checklistRows,
    cmpVendorName,
    policyDisclosureSummary,
    projectionContext: projectAdminProjectionContext(canonicalScanRecord),
    sizeMetrics: projectAdminScanSizeMetrics({ networkSummary, policyDisclosureSummary }),
    sourceProjectionVersion: recordString(snapshot, "report_projection_version")
  });
  const summary: AdminScanSummary = {
    adminEvidenceMatrix,
    cmpVendorName,
    industry: canonicalScanRecord.domainBenchmark?.industry ?? null,
    primaryLanguage: recordString(snapshot, "site_language_primary"),
    privacyPolicyPresent: noGo.isNoGo ? null : recordBoolean(snapshot, "privacy_policy_present"),
    scanOutcome:
      recordString(snapshot, "scan_outcome") ??
      (resultDisposition === "no_go" ? null : "completed_partial"),
    score: noGo.isNoGo ? null : recordNumber(reportSummary, "score") ?? recordNumber(snapshot, "certscore_overall"),
    topFindingIds: noGo.isNoGo ? [] : topFindingIds,
    topFindingCount: noGo.isNoGo ? 0 : topFindingIds.length
  };

  await timedAdminPersistencePhase(scanId, "admin_summary", () =>
    persistAdminScanSummary({
      scanId,
      ...summary,
      topFindingCount: summary.topFindingCount,
      trancoRank: trancoRankFromScanConfig(canonicalScanRecord.scan.scanConfigJson),
      scanNoGoAssessment,
      visualAccessReview,
      visualEvidenceArtifacts
    })
  );
  return {
    ...summary,
    score: summary.score,
    topFindingCount: summary.topFindingCount
  };
}

export async function persistAdminScanSummaryForRecord(
  scanRecord: PublicScanRecord,
  _source: { snapshot?: unknown; runtimeArtifacts?: unknown } = {}
): Promise<AdminScanSummary | null> {
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    return null;
  }
  const scanId = scanRecord.scan.id;
  const organizationId = (await queryOne<{ organization_id: string | null }>(
    "select organization_id::text from scans where id = $1::uuid limit 1",
    [scanId],
    { readOnly: true }
  ))?.organization_id ?? null;
  const publication = await timedAdminPersistencePhase(scanId, "report_projection", () =>
    publishCanonicalScanReportProjection({
      organizationId,
      scanId
    })
  );
  if (publication.status !== "ready") {
    throw new CanonicalScanReportProjectionNotReadyError(publication.reason);
  }
  const canonicalScanRecord = await loadPersistedScanReportProjection({
    organizationId,
    scanId
  });
  if (!canonicalScanRecord) {
    throw new Error("Canonical report projection could not be verified after publication.");
  }
  return persistAdminScanSummaryForPublishedRecord(canonicalScanRecord);
}

async function buildAndPersistAdminScanSummary(scanId: string, organizationId: string | null): Promise<AdminScanSummary | null> {
  const resolvedOrganizationId = organizationId ?? (await queryOne<{ organization_id: string | null }>(
    "select organization_id::text from scans where id = $1::uuid limit 1",
    [scanId],
    { readOnly: true }
  ))?.organization_id ?? null;
  const rawRecord = resolvedOrganizationId
    ? await getScanById({ organizationId: resolvedOrganizationId, scanId })
    : await getAnonymousScanById(scanId);
  if (!rawRecord) {
    return null;
  }
  return persistAdminScanSummaryForRecord(rawRecord);
}

export function materializeAdminScanSummary(scanId: string, organizationId: string | null) {
  const cacheKey = `${organizationId ?? "public"}:${scanId}`;
  const existing = summaryPromises.get(cacheKey);
  if (existing) {
    return existing;
  }
  const pending = buildAndPersistAdminScanSummary(scanId, organizationId).finally(() => {
    summaryPromises.delete(cacheKey);
  });
  summaryPromises.set(cacheKey, pending);
  return pending;
}

export async function materializeAdminScanSummaries(scans: Array<{ organizationId: string | null; scanId: string }>, concurrency = 3) {
  const results = new Map<string, AdminScanSummary>();
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < scans.length) {
      const scan = scans[nextIndex];
      nextIndex += 1;
      if (!scan) continue;
      try {
        const summary = await materializeAdminScanSummary(scan.scanId, scan.organizationId);
        if (summary) results.set(scan.scanId, summary);
      } catch (error) {
        console.error("[admin-scan-summary] bounded summary repair failed", {
          error: error instanceof Error ? error.message : String(error),
          scanId: scan.scanId
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, scans.length) }, () => worker()));
  return results;
}
