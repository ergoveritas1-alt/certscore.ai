"use server";

import {
  type AccessPostureClass,
  type RecoverableFindingClass,
  type ScanExecutionTier
} from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { getScanFromDisplay } from "../../lib/scans/scan-from";
import { inferPrimaryLanguage, type PrimaryLanguageConfidence, type PrimaryLanguageSource } from "../../lib/scans/primary-language";
import {
  mergeRequesterIpAttributions,
  requesterIpAttributionFromContext,
  requesterIpAttributionFromEvents,
  requesterIpAttributionFromRequest,
  type RequesterIpAttributionSource
} from "../../lib/admin/requester-ip-attribution";
import { deriveDisplayCreatedAt } from "../scans/display-state";
import {
  loadAdminScanOverviewCounts,
  loadAdminScanActivityPageRefs,
  loadAdminScanListPageData,
  loadAdminPulseScanAttributionRows,
  loadAdminScanRequestRows,
  loadBlockedRunTelemetryRows,
  type AdminBlockedRunTelemetryRow,
  type AdminScanDiagnosticEventRow as ScanDiagnosticEventRow,
  type AdminScanRequestRow as ScanRequestRow
} from "./repository";
import { projectAdminNoGo, type AdminNoGoProjection } from "./admin-no-go";
import { getAdminAuthenticatedScanHref } from "./admin-scan-links";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanListItem = {
  accessPostureClass: AccessPostureClass | null;
  adminSummaryGeneratedAt: string | null;
  activityAt: string;
  activityId: string;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  noGoFlag: boolean;
  noGoReason: string | null;
  noGoSource: AdminNoGoProjection["source"];
  certscoreOverall: number | null;
  cmpVendorName: string | null;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  domainId: string | null;
  findingCount: number | null;
  firstGeneratedAt: string | null;
  freshRescanRequested: boolean | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  homepageFetchHttpStatus: number | null;
  interruptionLabel: string | null;
  interruptionReason: string | null;
  industry: string | null;
  linkedScanId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  pagesScanned: number;
  privacyPolicyPresent: boolean | null;
  primaryLanguage: string | null;
  primaryLanguageConfidence: PrimaryLanguageConfidence | null;
  primaryLanguageSource: PrimaryLanguageSource | null;
  recoverableFindingClasses: RecoverableFindingClass[];
  robotsFetchHttpStatus: number | null;
  scanId: string;
  requesterIp: string | null;
  requesterIpHash: string | null;
  requesterIpSource: RequesterIpAttributionSource;
  requesterEmail: string | null;
  requesterName: string | null;
  requestPublicId: string | null;
  requestedAt: string | null;
  requestChannel: string | null;
  requestResolutionMode: string | null;
  requestedUrl: string | null;
  reusedCompletedAt: string | null;
  reuseWindowHours: number | null;
  rowKind: "scan" | "request";
  scanViewHref: string;
  scanType: string;
  scanFromLabel: string;
  scanFromValue: string;
  source: string | null;
  status: string;
  startedAt: string | null;
  stopTier: ScanExecutionTier | null;
  totalSignals: number | null;
  topFindingCount: number | null;
};

export type AdminScanOverviewMetrics = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
  scanFromCounts: Array<{ count: number; label: string; value: string }>;
  totalPhysicalScans: number;
  totalScanRequests: number;
  totalScans: number;
};

export type BlockedRunTelemetry = {
  blockedCountByAsn: Array<{ asn: string; count: number }>;
  blockedCountByEgress: Array<{ egress: string; count: number }>;
  blockedCountByHomepageStatus: Array<{ homepageStatus: string; count: number }>;
  blockedCountByHour: Array<{ hour: string; count: number }>;
  blockedCountByVendorGuess: Array<{ vendorGuess: string; count: number }>;
  repeatedNormalizedBlockPageHashClusters: Array<{ count: number; normalizedBodyHash: string }>;
  successRateByEgress: Array<{ egress: string; successRate: number; total: number }>;
};

export type AdminScanListStatus = "any" | "no_go" | "failed" | "running" | "queued" | "limited" | "completed";

export async function listAdminScans(limit = 50, offset = 0, filters?: { email?: string | null; query?: string | null; status?: AdminScanListStatus }): Promise<AdminScanListItem[]> {
  return (await listAdminScansPage(limit, offset, filters)).items;
}

export async function listAdminScansPage(
  limit = 50,
  offset = 0,
  filters?: { email?: string | null; query?: string | null; status?: AdminScanListStatus }
): Promise<{ items: AdminScanListItem[]; totalCount: number }> {
  await requirePlatformAdminContext();
  const requesterEmail = filters?.email?.trim().slice(0, 160) || null;
  const page = await loadAdminScanActivityPageRefs(limit, offset, {
    query: filters?.query ?? requesterEmail,
    status: filters?.status
  });
  const selectedScanIds = [...new Set(page.rows.flatMap((row) => row.scan_id ? [row.scan_id] : []))];
  const selectedRequestIds = page.rows.flatMap((row) => row.request_public_id ? [row.request_public_id] : []);
  const [scanPageData, scanRequestRows] = await Promise.all([
    loadAdminScanListPageData(Math.max(selectedScanIds.length, 1), 0, null, selectedScanIds),
    selectedScanIds.length || selectedRequestIds.length
      ? loadAdminScanRequestRows(100_000, null, { publicIds: selectedRequestIds, scanIds: selectedScanIds })
      : Promise.resolve([])
  ]);
  const {
    diagnosticEvents,
    domains,
    organizations,
    resolvedSnapshots,
    runtimeArtifacts,
    scanRows
  } = scanPageData;
  const pulseAttributionRows = await loadAdminPulseScanAttributionRows(scanRows.map((scan) => scan.id), null);
  const pulseAttributionMap = new Map(pulseAttributionRows.map((row) => [row.scan_id, row] as const));

  const domainMap = new Map(domains.flatMap((domain) => (domain.id ? [[domain.id, domain] as const] : [])));
  const organizationMap = new Map(organizations.flatMap((organization) => (organization.id ? [[organization.id, organization] as const] : [])));
  const snapshotMap = new Map(
    resolvedSnapshots.flatMap((snapshot) => (snapshot.scan_id ? [[snapshot.scan_id, snapshot] as const] : []))
  );
  const runtimeArtifactMap = new Map(runtimeArtifacts.map((artifact) => [artifact.scan_id, artifact] as const));
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const existing = diagnosticEventMap.get(diagnosticEvent.scan_id) ?? [];
    existing.push(diagnosticEvent);
    diagnosticEventMap.set(diagnosticEvent.scan_id, existing);
  }

  const requestByLinkedScanId = new Map<string, ScanRequestRow>();
  for (const request of scanRequestRows) {
    const linkedScanId = getLinkedScanIdForRequest(request);
    if (linkedScanId && request.resolution_mode !== "reused_existing_scan" && !requestByLinkedScanId.has(linkedScanId)) {
      requestByLinkedScanId.set(linkedScanId, request);
    }
  }

  const scanItems: AdminScanListItem[] = scanRows.map((scan) => {
    const snapshot = snapshotMap.get(scan.id) ?? null;
    const runtimeArtifact = runtimeArtifactMap.get(scan.id) ?? null;
    const linkedRequest = requestByLinkedScanId.get(scan.id) ?? null;
    const pulseAttribution = pulseAttributionMap.get(scan.id) ?? null;
    const normalizedAccessPosture = normalizeAccessPostureSummary({
      accessPostureClass: snapshot?.access_posture_class ?? null,
      highestSuccessfulTier: snapshot?.highest_successful_tier ?? null,
      homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
      homepageFetchStatus: null,
      pagesScanned: scan.pages_scanned,
      recoverableFindingClasses: snapshot?.recoverable_finding_classes ?? [],
      stopTier: snapshot?.stop_tier ?? null,
      totalSignals: snapshot?.total_signals ?? null
    });
    const accessPosture = deriveAccessPosturePresentation({
      accessPostureClass: normalizedAccessPosture.accessPostureClass,
      highestSuccessfulTier: normalizedAccessPosture.highestSuccessfulTier,
      stopTier: normalizedAccessPosture.stopTier,
      totalSignals: snapshot?.total_signals ?? null,
      pagesScanned: scan.pages_scanned,
      recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses
    });

    const displayCreatedAt = deriveDisplayCreatedAt({
      completedAt: scan.completed_at,
      createdAt: scan.created_at,
      startedAt: null
    });
    const requesterIpAttribution = mergeRequesterIpAttributions(
      requesterIpAttributionFromRequest(linkedRequest),
      requesterIpAttributionFromContext(pulseAttribution?.request_context ?? null, "pulse_context"),
      requesterIpAttributionFromEvents(diagnosticEventMap.get(scan.id) ?? [])
    );
    const primaryLanguage = inferPrimaryLanguage({
      declaredLanguages: [scan.page_language, ...(scan.page_languages ?? [])],
      persistedPrimaryLanguages: [snapshot?.site_language_primary],
      matchedLocales: [snapshot?.site_language_primary],
      urls: [
        scan.domain_id ? domainMap.get(scan.domain_id)?.hostname : null,
        linkedRequest?.requested_url,
        pulseAttribution?.normalized_url
      ]
    });
    const noGo = projectAdminNoGo({
      accessPostureClass: normalizedAccessPosture.accessPostureClass,
      blockedFlag: snapshot?.blocked_flag,
      captchaFlag: snapshot?.captcha_flag,
      runtimeAssessment: runtimeArtifact?.scan_no_go_assessment,
      snapshotOutcome: snapshot?.scan_outcome,
      visualAccessReview: runtimeArtifact?.visual_access_review
    });

    return {
      activityAt: displayCreatedAt,
      activityId: `scan:${scan.id}`,
      adminSummaryGeneratedAt: snapshot?.admin_summary_generated_at ?? null,
      scanId: scan.id,
      rowKind: "scan",
      linkedScanId: scan.id,
      requestPublicId: linkedRequest?.public_id ?? pulseAttribution?.public_id ?? null,
      requestedAt: linkedRequest?.requested_at ?? pulseAttribution?.requested_at ?? scan.created_at,
      requestChannel: linkedRequest?.request_channel ?? pulseAttribution?.request_channel ?? null,
      requestResolutionMode: linkedRequest?.resolution_mode ?? pulseAttribution?.resolution_mode ?? null,
      requestedUrl: linkedRequest?.requested_url ?? pulseAttribution?.normalized_url ?? null,
      reusedCompletedAt: linkedRequest?.reused_completed_at ?? null,
      reuseWindowHours: linkedRequest?.reuse_window_hours ?? null,
      domainId: scan.domain_id,
      domainHostname: scan.domain_id ? domainMap.get(scan.domain_id)?.hostname ?? null : null,
      organizationName: scan.organization_id ? organizationMap.get(scan.organization_id)?.name ?? null : null,
      organizationId: scan.organization_id,
      requesterIp: requesterIpAttribution.sourceIp,
      requesterIpHash: requesterIpAttribution.ipHash,
      requesterIpSource: requesterIpAttribution.source,
      requesterEmail: linkedRequest?.requester_email ?? pulseAttribution?.requester_email ?? null,
      requesterName: linkedRequest?.requester_name ?? pulseAttribution?.requester_name ?? null,
      scanViewHref: getAdminAuthenticatedScanHref(scan.id),
      scanType: scan.scan_type,
      scanFromLabel: getScanFromDisplay(scan.scan_config_json).label,
      scanFromValue: getScanFromDisplay(scan.scan_config_json).value,
      source: typeof scan.scan_config_json?.source === "string" ? scan.scan_config_json.source : null,
      status: scan.status,
      createdAt: displayCreatedAt,
      firstGeneratedAt: scan.created_at,
      completedAt: scan.completed_at,
      startedAt: scan.started_at,
      pagesScanned: scan.pages_scanned,
      totalSignals: snapshot?.total_signals ?? null,
      topFindingCount: snapshot?.certscore_overall === null || snapshot?.certscore_overall === undefined
        ? null
        : snapshot.top_finding_count ?? null,
      findingCount: snapshot?.report_finding_count ?? null,
      freshRescanRequested: getFreshRescanRequested(linkedRequest?.request_context ?? pulseAttribution?.request_context ?? null),
      certscoreOverall: snapshot?.certscore_overall ?? null,
      cmpVendorName: snapshot?.cmp_vendor_name ?? null,
      privacyPolicyPresent: snapshot?.privacy_policy_present ?? null,
      primaryLanguage: primaryLanguage?.locale ?? null,
      primaryLanguageConfidence: primaryLanguage?.confidence ?? null,
      primaryLanguageSource: primaryLanguage?.source ?? null,
      industry: snapshot?.admin_industry_label ?? null,
      homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
      robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
      blockedFlag: snapshot?.blocked_flag ?? null,
      captchaFlag: snapshot?.captcha_flag ?? null,
      accessPostureClass: normalizedAccessPosture.accessPostureClass,
      highestSuccessfulTier: normalizedAccessPosture.highestSuccessfulTier,
      stopTier: normalizedAccessPosture.stopTier,
      recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses,
      interruptionLabel: accessPosture.label,
      interruptionReason: accessPosture.reason,
      noGoFlag: noGo.isNoGo,
      noGoReason: noGo.reason,
      noGoSource: noGo.source
    };
  });

  const scansById = new Map(scanItems.map((scan) => [scan.scanId, scan] as const));
  const requestItems: AdminScanListItem[] = scanRequestRows
    .filter((request) => !getLinkedScanIdForRequest(request) || request.resolution_mode === "reused_existing_scan")
    .map((request) => {
      const linkedScanId = getLinkedScanIdForRequest(request);
      return mapScanRequestRow(request, linkedScanId ? scansById.get(linkedScanId) ?? null : null);
    });

  const scanItemMap = new Map(scanItems.map((item) => [item.scanId, item] as const));
  const requestItemMap = new Map(requestItems.map((item) => [item.requestPublicId, item] as const));
  const items = page.rows.flatMap((row) => {
    const item = row.row_kind === "scan"
      ? (row.scan_id ? scanItemMap.get(row.scan_id) : null)
      : (row.request_public_id ? requestItemMap.get(row.request_public_id) : null);
    return item ? [item] : [];
  });
  return { items, totalCount: page.totalCount };
}

export async function getAdminScanOverviewMetrics(): Promise<AdminScanOverviewMetrics> {
  await requirePlatformAdminContext();
  return await loadAdminScanOverviewCounts();
}

function mapScanRequestRow(request: ScanRequestRow, linkedScan: AdminScanListItem | null = null): AdminScanListItem {
  const linkedScanId = getLinkedScanIdForRequest(request);
  const organizationName =
    request.organization_name ?? (request.organization_id || request.scan_organization_id ? "Unknown workspace" : "Public / anonymous");
  const requestContext = getNestedMetadataObject(request.request_context);
  const scanConfig = getNestedMetadataObject(request.scan_config_json);
  const scanFromDisplay = getScanFromDisplay(requestContext ?? scanConfig);
  const requesterIpAttribution = requesterIpAttributionFromRequest(request);
  const primaryLanguage = linkedScan?.primaryLanguage
    ? {
        confidence: linkedScan.primaryLanguageConfidence,
        locale: linkedScan.primaryLanguage,
        source: linkedScan.primaryLanguageSource
      }
    : inferPrimaryLanguage({ urls: [request.scan_domain_hostname, request.normalized_domain, request.requested_url] });

  return {
    accessPostureClass: null,
    adminSummaryGeneratedAt: null,
    activityAt: request.requested_at,
    activityId: `request:${request.public_id}`,
    blockedFlag: null,
    captchaFlag: null,
    noGoFlag: linkedScan?.noGoFlag ?? false,
    noGoReason: linkedScan?.noGoReason ?? null,
    noGoSource: linkedScan?.noGoSource ?? null,
    certscoreOverall: linkedScan?.certscoreOverall ?? null,
    cmpVendorName: linkedScan?.cmpVendorName ?? null,
    completedAt: request.reused_completed_at,
    createdAt: request.requested_at,
    domainHostname: request.scan_domain_hostname ?? request.normalized_domain,
    domainId: null,
    findingCount: linkedScan?.findingCount ?? null,
    firstGeneratedAt: request.scan_created_at ?? request.reused_completed_at ?? null,
    freshRescanRequested: getFreshRescanRequested(request.request_context),
    highestSuccessfulTier: null,
    homepageFetchHttpStatus: null,
    interruptionLabel: null,
    interruptionReason: request.error_message,
    industry: linkedScan?.industry ?? null,
    linkedScanId,
    organizationName,
    organizationId: request.organization_id ?? request.scan_organization_id,
    pagesScanned: 0,
    privacyPolicyPresent: linkedScan?.privacyPolicyPresent ?? null,
    primaryLanguage: primaryLanguage?.locale ?? null,
    primaryLanguageConfidence: primaryLanguage?.confidence ?? null,
    primaryLanguageSource: primaryLanguage?.source ?? null,
    recoverableFindingClasses: [],
    requestChannel: request.request_channel,
    requestPublicId: request.public_id,
    requestedAt: request.requested_at,
    requestResolutionMode: request.resolution_mode,
    requestedUrl: request.requested_url,
    requesterIp: requesterIpAttribution.sourceIp,
    requesterIpHash: requesterIpAttribution.ipHash,
    requesterIpSource: requesterIpAttribution.source,
    requesterEmail: request.requester_email,
    requesterName: request.requester_name,
    reusedCompletedAt: request.reused_completed_at,
    reuseWindowHours: request.reuse_window_hours,
    robotsFetchHttpStatus: null,
    rowKind: "request",
    scanId: linkedScanId ?? request.public_id,
    scanType: request.request_type,
    scanFromLabel: scanFromDisplay.label,
    scanFromValue: scanFromDisplay.value,
    scanViewHref: getAdminAuthenticatedScanHref(linkedScanId),
    source: request.request_channel,
    status: request.status,
    startedAt: request.scan_created_at,
    stopTier: null,
    totalSignals: linkedScan?.totalSignals ?? null,
    topFindingCount: linkedScan?.topFindingCount ?? null
  };
}

function getLinkedScanIdForRequest(request: ScanRequestRow) {
  return request.fulfilled_by_scan_id ?? request.scan_id ?? null;
}

function getBooleanMetadataValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function getFreshRescanRequested(requestContext: unknown) {
  const context = getNestedMetadataObject(requestContext);
  return getBooleanMetadataValue(context?.bypassRecentScanReuse) ?? getBooleanMetadataValue(context?.forceNewScan);
}

function getNestedMetadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function getBlockedRunTelemetry(hours = 72): Promise<BlockedRunTelemetry> {
  await requirePlatformAdminContext();
  const rows = (await loadBlockedRunTelemetryRows(hours)) as AdminBlockedRunTelemetryRow[];
  const blockedRows = rows.filter(
    (row) =>
      String(row.scan_outcome ?? "").startsWith("reachability_blocked") ||
      row.scan_outcome === "robots_restricted" ||
      row.scan_outcome === "unknown_access_limitation" ||
      row.scan_outcome === "content_capture_degraded"
  );
  const blockedByHour = new Map<string, number>();
  const blockedByEgress = new Map<string, number>();
  const blockedByAsn = new Map<string, number>();
  const blockedByVendor = new Map<string, number>();
  const blockedByHomepageStatus = new Map<string, number>();
  const blockHashClusters = new Map<string, number>();
  const egressTotals = new Map<string, { success: number; total: number }>();

  for (const row of rows) {
    const egress = row.egress_id ?? row.egress_type ?? "unknown";
    const egressSummary = egressTotals.get(egress) ?? { success: 0, total: 0 };
    egressSummary.total += 1;
    if (row.scan_outcome === "completed_successfully" || row.scan_outcome === "completed_partial") {
      egressSummary.success += 1;
    }
    egressTotals.set(egress, egressSummary);
  }

  for (const row of blockedRows) {
    const hour = typeof row.scan_timestamp === "string" ? row.scan_timestamp.slice(0, 13) + ":00:00Z" : "unknown";
    const egress = row.egress_id ?? row.egress_type ?? "unknown";
    incrementCount(blockedByHour, hour);
    incrementCount(blockedByEgress, egress);
    incrementCount(blockedByAsn, row.asn ? String(row.asn) : "unknown");
    incrementCount(blockedByVendor, row.block_vendor_guess ?? "unknown");
    incrementCount(blockedByHomepageStatus, row.homepage_fetch_http_status ? String(row.homepage_fetch_http_status) : "unknown");
    if (typeof row.normalized_body_hash === "string" && row.normalized_body_hash.length > 0) {
      incrementCount(blockHashClusters, row.normalized_body_hash);
    }
  }

  return {
    blockedCountByHour: [...blockedByHour.entries()].map(([hour, count]) => ({ hour, count })),
    blockedCountByEgress: [...blockedByEgress.entries()].map(([egress, count]) => ({ egress, count })).sort((a, b) => b.count - a.count),
    blockedCountByAsn: [...blockedByAsn.entries()].map(([asn, count]) => ({ asn, count })).sort((a, b) => b.count - a.count),
    blockedCountByVendorGuess: [...blockedByVendor.entries()].map(([vendorGuess, count]) => ({ vendorGuess, count })).sort((a, b) => b.count - a.count),
    blockedCountByHomepageStatus: [...blockedByHomepageStatus.entries()].map(([homepageStatus, count]) => ({ homepageStatus, count })).sort((a, b) => b.count - a.count),
    repeatedNormalizedBlockPageHashClusters: [...blockHashClusters.entries()]
      .filter(([, count]) => count > 1)
      .map(([normalizedBodyHash, count]) => ({ normalizedBodyHash, count }))
      .sort((a, b) => b.count - a.count),
    successRateByEgress: [...egressTotals.entries()]
      .map(([egress, summary]) => ({
        egress,
        successRate: summary.total > 0 ? summary.success / summary.total : 0,
        total: summary.total
      }))
      .sort((a, b) => a.successRate - b.successRate)
  };
}
