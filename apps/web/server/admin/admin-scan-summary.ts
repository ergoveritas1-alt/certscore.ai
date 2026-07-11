import "server-only";

import { buildPulseProjection } from "../../lib/pulse/projection";
import { getScanById } from "../scans/get-scan-by-id";
import { getPublicScanRecord } from "../scans/get-public-scan-record";
import { materializeLocalV2DagScanDetail } from "../scans/local-v2-dag-report";
import { persistAdminScanSummary } from "./repository";

export type AdminScanSummary = {
  cmpVendorName: string | null;
  industry: string | null;
  primaryLanguage: string | null;
  privacyPolicyPresent: boolean | null;
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

async function buildAndPersistAdminScanSummary(scanId: string, organizationId: string | null): Promise<AdminScanSummary | null> {
  const scanRecord = organizationId
    ? await getScanById({ organizationId, scanId }).then((record) => record ? materializeLocalV2DagScanDetail(record) : null)
    : await getPublicScanRecord(scanId, { logPrefix: "[admin-scan-summary]" });
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    return null;
  }

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
  const topFindingIds = reportTopFindings.flatMap((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return [];
    const id = (finding as Record<string, unknown>).id;
    return typeof id === "string" && id.trim() ? [id.trim()] : [];
  });
  const snapshot = scanRecord.snapshot;
  const summary: AdminScanSummary = {
    cmpVendorName: recordString(snapshot, "cmp_vendor_name"),
    industry: scanRecord.domainBenchmark?.industry ?? null,
    primaryLanguage: recordString(snapshot, "site_language_primary"),
    privacyPolicyPresent: recordBoolean(snapshot, "privacy_policy_present"),
    score: recordNumber(reportSummary, "score") ?? recordNumber(snapshot, "certscore_overall"),
    topFindingIds,
    topFindingCount: topFindingIds.length
  };

  await persistAdminScanSummary({ scanId, ...summary });
  return summary;
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
      const summary = await materializeAdminScanSummary(scan.scanId, scan.organizationId);
      if (summary) results.set(scan.scanId, summary);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, scans.length) }, () => worker()));
  return results;
}
