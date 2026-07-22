import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { buildPulseProjection } from "../../lib/pulse/projection";
import { getAnonymousScanById, getScanById } from "../scans/get-scan-by-id";
import type { PublicScanRecord } from "../scans/get-public-scan-record";
import { materializeLocalV2DagScanDetail } from "../scans/local-v2-dag-report";
import { trancoRankFromScanConfig } from "../scans/tranco-rank-metadata";
import { projectAdminNoGo } from "./admin-no-go";
import { persistAdminScanSummary } from "./repository";

export type AdminScanSummary = {
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

export async function persistAdminScanSummaryForRecord(scanRecord: PublicScanRecord): Promise<AdminScanSummary | null> {
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    return null;
  }
  const scanId = scanRecord.scan.id;

  const reportProjection = buildPulseProjection({
    detail: "summary",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: `admin:${scanId}`,
    requestedUrl: scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null,
    resolutionMode: "admin_projection",
    scanRecord,
    waitSeconds: 0
  });
  const reportProjectionRecord = reportProjection as unknown as Record<string, unknown>;
  const reportSummary = reportProjectionRecord.summary && typeof reportProjectionRecord.summary === "object"
    ? reportProjectionRecord.summary as Record<string, unknown>
    : null;
  const reportTopFindings = Array.isArray(reportProjectionRecord.topFindings) ? reportProjectionRecord.topFindings : [];
  const resultDisposition = recordString(reportProjectionRecord, "resultDisposition");
  const topFindingIds = reportTopFindings.flatMap((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return [];
    const id = (finding as Record<string, unknown>).id;
    return typeof id === "string" && id.trim() ? [id.trim()] : [];
  });
  const snapshot = scanRecord.snapshot;
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
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
  const summary: AdminScanSummary = {
    cmpVendorName: noGo.isNoGo ? null : recordString(snapshot, "cmp_vendor_name"),
    industry: scanRecord.domainBenchmark?.industry ?? null,
    primaryLanguage: recordString(snapshot, "site_language_primary"),
    privacyPolicyPresent: noGo.isNoGo ? null : recordBoolean(snapshot, "privacy_policy_present"),
    scanOutcome:
      recordString(snapshot, "scan_outcome") ??
      (resultDisposition === "no_go" ? null : "completed_partial"),
    score: noGo.isNoGo ? null : recordNumber(reportSummary, "score") ?? recordNumber(snapshot, "certscore_overall"),
    topFindingIds: noGo.isNoGo ? [] : topFindingIds,
    topFindingCount: noGo.isNoGo ? 0 : topFindingIds.length
  };

  await persistAdminScanSummary({
    scanId,
    ...summary,
    trancoRank: trancoRankFromScanConfig(scanRecord.scan.scanConfigJson),
    scanNoGoAssessment,
    visualAccessReview,
    visualEvidenceArtifacts
  });
  return summary;
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
  const scanRecord = rawRecord ? await materializeLocalV2DagScanDetail(rawRecord) : null;
  return scanRecord ? persistAdminScanSummaryForRecord(scanRecord) : null;
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
