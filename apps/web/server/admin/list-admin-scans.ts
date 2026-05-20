"use server";

import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import { deriveDisplayCreatedAt } from "../scans/display-state";
import { loadMergedSignalsByScanId } from "../scans/merged-signal-summary";
import { repairFindingFamilyPacketEvents } from "../scans/family-packet-event-repair";
import {
  loadAdminScanOverviewCounts,
  loadAdminScanListPageData,
  loadAdminScanRequestRows,
  loadBlockedRunTelemetryRows,
  type AdminBlockedRunTelemetryRow,
  type AdminPolicyEnrichmentRow as PolicyEnrichmentRow,
  type AdminScanDiagnosticEventRow as ScanDiagnosticEventRow,
  type AdminScanDomainRow as DomainRow,
  type AdminScanOrganizationRow as OrganizationRow,
  type AdminScanQueryRow as ScanRow,
  type AdminScanRequestRow as ScanRequestRow,
  type AdminScanSnapshotRow as SnapshotRow,
  type AdminValidationFindingSummaryRow as ValidationFindingSummaryRow,
  type AdminValidationRunSummaryRow as ValidationRunSummaryRow,
  type AdminValidationVerdictRow as ValidationVerdictRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanListItem = {
  accessPostureClass: AccessPostureClass | null;
  activityAt: string;
  activityId: string;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  certscoreOverall: number | null;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  domainId: string | null;
  findingCount: number | null;
  firstGeneratedAt: string | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  homepageFetchHttpStatus: number | null;
  interruptionLabel: string | null;
  interruptionReason: string | null;
  linkedScanId: string | null;
  organizationName: string | null;
  pagesScanned: number;
  recoverableFindingClasses: RecoverableFindingClass[];
  robotsFetchHttpStatus: number | null;
  scanId: string;
  requesterIp: string | null;
  requestPublicId: string | null;
  requestChannel: string | null;
  requestResolutionMode: string | null;
  requestedUrl: string | null;
  reusedCompletedAt: string | null;
  reuseWindowHours: number | null;
  rowKind: "scan" | "request";
  scanViewHref: string;
  scanType: string;
  source: string | null;
  status: string;
  stopTier: ScanExecutionTier | null;
  totalSignals: number | null;
  topFindingCount: number | null;
};

export type AdminScanOverviewMetrics = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
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

export async function listAdminScans(limit = 50, offset = 0): Promise<AdminScanListItem[]> {
  await requirePlatformAdminContext();
  const activityWindowLimit = Math.max(limit + offset, limit);
  const [scanPageData, scanRequestRows] = await Promise.all([
    loadAdminScanListPageData(activityWindowLimit, 0),
    loadAdminScanRequestRows(activityWindowLimit)
  ]);
  const {
    diagnosticEvents,
    domains,
    organizations,
    policyEnrichmentRows,
    resolvedSnapshots,
    scanRows,
    validationFindingRows,
    validationRuns,
    verdictByFindingId
  } = scanPageData;

  const domainMap = new Map(domains.flatMap((domain) => (domain.id ? [[domain.id, domain] as const] : [])));
  const organizationMap = new Map(organizations.flatMap((organization) => (organization.id ? [[organization.id, organization] as const] : [])));
  const snapshotMap = new Map(
    resolvedSnapshots.flatMap((snapshot) => (snapshot.scan_id ? [[snapshot.scan_id, snapshot] as const] : []))
  );
  const findingCountMap = new Map<string, number>();
  for (const validationRun of validationRuns) {
    if (!findingCountMap.has(validationRun.scan_id)) {
      findingCountMap.set(validationRun.scan_id, validationRun.finding_count ?? 0);
    }
  }
  const latestValidationRunByScanId = new Map<string, string>();
  for (const validationRun of validationRuns) {
    if (!latestValidationRunByScanId.has(validationRun.scan_id)) {
      latestValidationRunByScanId.set(validationRun.scan_id, validationRun.id);
    }
  }
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const existing = diagnosticEventMap.get(diagnosticEvent.scan_id) ?? [];
    existing.push(diagnosticEvent);
    diagnosticEventMap.set(diagnosticEvent.scan_id, existing);
  }
  const policyEnrichmentMap = new Map<string, Array<Record<string, unknown>>>();
  for (const row of policyEnrichmentRows) {
    const scanId = typeof row.scan_id === "string" ? row.scan_id : null;
    if (!scanId) {
      continue;
    }

    const existing = policyEnrichmentMap.get(scanId) ?? [];
    existing.push(row);
    policyEnrichmentMap.set(scanId, existing);
  }
  const validationFindingsByRunId = new Map<string, ScanValidationFinding[]>();
  for (const row of validationFindingRows) {
    const latestVerdict = verdictByFindingId.get(row.id) ?? null;
    const verdictRows = Array.isArray(row.validation_verdicts)
      ? row.validation_verdicts
      : latestVerdict
        ? [latestVerdict]
        : [];
    const verdict = verdictRows[0];
    const existing = validationFindingsByRunId.get(row.validation_run_id) ?? [];
    existing.push({
      agreementScore: verdict?.agreement_score ?? null,
      category: row.category,
      description: row.description,
      evidence: row.evidence_json ?? null,
      findingFamily: row.finding_family,
      findingScope: row.finding_scope,
      findingSource: row.finding_source,
      findingSubject: row.finding_subject,
      id: row.id,
      model: verdict?.model ?? null,
      modelConfidence: verdict?.confidence ?? null,
      pageUrl: row.page_url,
      promptVersion: verdict?.prompt_version ?? null,
      rationale: verdict?.rationale ?? null,
      ruleKey: row.rule_key,
      severity: row.severity,
      subtype: row.subtype,
      systemConfidenceBand: verdict?.system_confidence_band ?? null,
      systemConfidenceExplanation: verdict?.system_confidence_explanation ?? null,
      systemConfidenceScore: verdict?.system_confidence_score ?? null,
      title: row.title,
      verdict: verdict?.verdict ?? null
    });
    validationFindingsByRunId.set(row.validation_run_id, existing);
  }
  const observedAtByScanId = new Map(
    scanRows.map((scan) => [scan.id, scan.completed_at ?? scan.created_at] as const)
  );
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    observedAtByScanId,
    scanIds: scanRows.map((scan) => scan.id)
  });
  const surfacedFindingCountMap = new Map<string, number>();
  const topFindingCountMap = new Map<string, number>();
  for (const scan of scanRows) {
    const scanEvents = diagnosticEventMap.get(scan.id) ?? [];
    const repairedEvents = repairFindingFamilyPacketEvents({
      events: scanEvents.map((event) => ({
        createdAt: event.created_at,
        eventType: event.event_type,
        id: `${scan.id}:${event.created_at}:${event.event_type}`,
        message: event.message,
        metadataJson: event.metadata_json
      })),
      policyEnrichment: policyEnrichmentMap.get(scan.id) ?? []
    });
    const validationRunId = latestValidationRunByScanId.get(scan.id) ?? null;
    const validationFindings = validationRunId ? validationFindingsByRunId.get(validationRunId) ?? [] : [];
    const validationFindingLookup = new Map(validationFindings.map((finding) => [finding.ruleKey, finding] as const));
    const displayPackets = buildUnifiedFindingDisplayPackets({
      coverageSummary: {
        legalCoverageScore: snapshotMap.get(scan.id)?.legal_coverage_score ?? null,
        pagesScanned: scan.pages_scanned,
        policyEnrichmentCount: (policyEnrichmentMap.get(scan.id) ?? []).length,
        verifiedPublicSurfacesCount: snapshotMap.get(scan.id)?.verified_public_surfaces_count ?? null
      },
      mergedSignals: mergedSignalsByScanId.get(scan.id) ?? [],
      policyEnrichment: policyEnrichmentMap.get(scan.id) ?? [],
      reviewFindingCandidates: [],
      scanEvents: repairedEvents,
      validationFindings,
      validationFindingLookup
    });
    surfacedFindingCountMap.set(
      scan.id,
      displayPackets.filter((finding) => finding.presentationDecision.status !== "suppress").length
    );
    topFindingCountMap.set(scan.id, projectExecutiveFindingsFromUnifiedPackets(displayPackets).topFindings.length);
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
    const linkedRequest = requestByLinkedScanId.get(scan.id) ?? null;
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

    return {
      activityAt: displayCreatedAt,
      activityId: `scan:${scan.id}`,
      scanId: scan.id,
      rowKind: "scan",
      linkedScanId: scan.id,
      requestPublicId: linkedRequest?.public_id ?? null,
      requestChannel: linkedRequest?.request_channel ?? null,
      requestResolutionMode: linkedRequest?.resolution_mode ?? null,
      requestedUrl: linkedRequest?.requested_url ?? null,
      reusedCompletedAt: linkedRequest?.reused_completed_at ?? null,
      reuseWindowHours: linkedRequest?.reuse_window_hours ?? null,
      domainId: scan.domain_id,
      domainHostname: scan.domain_id ? domainMap.get(scan.domain_id)?.hostname ?? null : null,
      organizationName: scan.organization_id ? organizationMap.get(scan.organization_id)?.name ?? null : null,
      requesterIp: selectRequesterIp(diagnosticEventMap.get(scan.id) ?? []),
      scanViewHref: scan.organization_id ? `/app/scans/${scan.id}` : `/scan/${scan.id}`,
      scanType: scan.scan_type,
      source: typeof scan.scan_config_json?.source === "string" ? scan.scan_config_json.source : null,
      status: scan.status,
      createdAt: displayCreatedAt,
      firstGeneratedAt: scan.created_at,
      completedAt: scan.completed_at,
      pagesScanned: scan.pages_scanned,
      totalSignals: snapshot?.total_signals ?? null,
      topFindingCount: topFindingCountMap.get(scan.id) ?? null,
      findingCount: Math.max(
        snapshot?.report_finding_count ?? 0,
        findingCountMap.get(scan.id) ?? 0,
        surfacedFindingCountMap.get(scan.id) ?? 0
      ),
      certscoreOverall: snapshot?.certscore_overall ?? null,
      homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
      robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
      blockedFlag: snapshot?.blocked_flag ?? null,
      captchaFlag: snapshot?.captcha_flag ?? null,
      accessPostureClass: normalizedAccessPosture.accessPostureClass,
      highestSuccessfulTier: normalizedAccessPosture.highestSuccessfulTier,
      stopTier: normalizedAccessPosture.stopTier,
      recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses,
      interruptionLabel: accessPosture.label,
      interruptionReason: accessPosture.reason
    };
  });

  const requestItems: AdminScanListItem[] = scanRequestRows
    .filter((request) => !getLinkedScanIdForRequest(request) || request.resolution_mode === "reused_existing_scan")
    .map((request) => mapScanRequestRow(request));

  return [...scanItems, ...requestItems]
    .sort((left, right) => new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime())
    .slice(offset, offset + limit);
}

export async function getAdminScanOverviewMetrics(): Promise<AdminScanOverviewMetrics> {
  await requirePlatformAdminContext();
  return await loadAdminScanOverviewCounts();
}

function mapScanRequestRow(request: ScanRequestRow): AdminScanListItem {
  const linkedScanId = getLinkedScanIdForRequest(request);
  const organizationName =
    request.organization_name ?? (request.organization_id || request.scan_organization_id ? "Unknown workspace" : "Public / anonymous");
  const requestContext = getNestedMetadataObject(request.request_context);
  const requestedBy = getNestedMetadataObject(request.requested_by);
  const provenance = requestContext ? getNestedMetadataObject(requestContext.provenance) : null;
  const requesterIp =
    (provenance ? getStringMetadataValue(provenance.originIp) : null) ??
    (requestContext ? getStringMetadataValue(requestContext.originIp) : null) ??
    (requestedBy ? getStringMetadataValue(requestedBy.ipHash) : null);

  return {
    accessPostureClass: null,
    activityAt: request.requested_at,
    activityId: `request:${request.public_id}`,
    blockedFlag: null,
    captchaFlag: null,
    certscoreOverall: null,
    completedAt: request.reused_completed_at,
    createdAt: request.requested_at,
    domainHostname: request.scan_domain_hostname ?? request.normalized_domain,
    domainId: null,
    findingCount: null,
    firstGeneratedAt: request.scan_created_at ?? request.reused_completed_at ?? null,
    highestSuccessfulTier: null,
    homepageFetchHttpStatus: null,
    interruptionLabel: null,
    interruptionReason: request.error_message,
    linkedScanId,
    organizationName,
    pagesScanned: 0,
    recoverableFindingClasses: [],
    requestChannel: request.request_channel,
    requestPublicId: request.public_id,
    requestResolutionMode: request.resolution_mode,
    requestedUrl: request.requested_url,
    requesterIp,
    reusedCompletedAt: request.reused_completed_at,
    reuseWindowHours: request.reuse_window_hours,
    robotsFetchHttpStatus: null,
    rowKind: "request",
    scanId: linkedScanId ?? request.public_id,
    scanType: request.request_type,
    scanViewHref: linkedScanId
      ? request.organization_id || request.scan_organization_id
        ? `/app/scans/${linkedScanId}`
        : `/scan/${linkedScanId}`
      : "",
    source: request.request_channel,
    status: request.status,
    stopTier: null,
    totalSignals: null,
    topFindingCount: null
  };
}

function getLinkedScanIdForRequest(request: ScanRequestRow) {
  return request.fulfilled_by_scan_id ?? request.scan_id ?? null;
}

function getStringMetadataValue(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function getNestedMetadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function selectRequesterIp(events: ScanDiagnosticEventRow[]) {
  for (const event of events) {
    const metadata = event.metadata_json;
    if (!metadata) {
      continue;
    }

    const directOriginIp = getStringMetadataValue(metadata.originIp);
    if (directOriginIp) {
      return directOriginIp;
    }

    const provenance = getNestedMetadataObject(metadata.provenance);
    const provenanceOriginIp = provenance ? getStringMetadataValue(provenance.originIp) : null;
    if (provenanceOriginIp) {
      return provenanceOriginIp;
    }
  }

  return null;
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
