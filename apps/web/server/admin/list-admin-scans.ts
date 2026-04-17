"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import { loadMergedSignalsByScanId } from "../scans/merged-signal-summary";
import { repairFindingFamilyPacketEvents } from "../scans/family-packet-event-repair";
import {
  loadAdminScanListPageData,
  type AdminPolicyEnrichmentRow as PolicyEnrichmentRow,
  type AdminScanDiagnosticEventRow as ScanDiagnosticEventRow,
  type AdminScanDomainRow as DomainRow,
  type AdminScanOrganizationRow as OrganizationRow,
  type AdminScanQueryRow as ScanRow,
  type AdminScanSnapshotRow as SnapshotRow,
  type AdminValidationFindingSummaryRow as ValidationFindingSummaryRow,
  type AdminValidationRunSummaryRow as ValidationRunSummaryRow,
  type AdminValidationVerdictRow as ValidationVerdictRow
} from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanListItem = {
  accessPostureClass: AccessPostureClass | null;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  certscoreOverall: number | null;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  domainId: string | null;
  findingCount: number | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  homepageFetchHttpStatus: number | null;
  interruptionLabel: string | null;
  interruptionReason: string | null;
  organizationName: string | null;
  pagesScanned: number;
  recoverableFindingClasses: RecoverableFindingClass[];
  robotsFetchHttpStatus: number | null;
  scanId: string;
  scanType: string;
  status: string;
  stopTier: ScanExecutionTier | null;
  totalSignals: number | null;
};

export type AdminScanOverviewMetrics = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
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

export async function listAdminScans(limit = 50): Promise<AdminScanListItem[]> {
  await requirePlatformAdminContext();
  const db = createDatabaseClient();
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
  } = await loadAdminScanListPageData(limit);

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
    scanIds: scanRows.map((scan) => scan.id),
    db
  });
  const surfacedFindingCountMap = new Map<string, number>();
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
  }

  return scanRows.map((scan) => {
    const snapshot = snapshotMap.get(scan.id) ?? null;
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

    return {
      scanId: scan.id,
      domainId: scan.domain_id,
      domainHostname: scan.domain_id ? domainMap.get(scan.domain_id)?.hostname ?? null : null,
      organizationName: scan.organization_id ? organizationMap.get(scan.organization_id)?.name ?? null : null,
      scanType: scan.scan_type,
      status: scan.status,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
      pagesScanned: scan.pages_scanned,
      totalSignals: snapshot?.total_signals ?? null,
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
}

export async function getAdminScanOverviewMetrics(): Promise<AdminScanOverviewMetrics> {
  await requirePlatformAdminContext();
  const db = createDatabaseClient();

  const [
    { count: totalScans, error: totalScansError },
    { count: http403Count, error: http403Error },
    { count: http429Count, error: http429Error },
    { count: blockedOrCaptchaCount, error: blockedOrCaptchaError },
  ] = await Promise.all([
    db.from("scans").select("id", { count: "exact", head: true }),
    db
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.403,robots_fetch_http_status.eq.403"),
    db
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.429,robots_fetch_http_status.eq.429"),
    db
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("blocked_flag.eq.true,captcha_flag.eq.true"),
  ]);

  if (totalScansError) {
    throw new Error(`Failed to load scan count: ${totalScansError.message}`);
  }
  if (http403Error) {
    throw new Error(`Failed to load 403 scan count: ${http403Error.message}`);
  }
  if (http429Error) {
    throw new Error(`Failed to load 429 scan count: ${http429Error.message}`);
  }
  if (blockedOrCaptchaError) {
    throw new Error(`Failed to load blocked scan count: ${blockedOrCaptchaError.message}`);
  }

  return {
    totalScans: totalScans ?? 0,
    http403Count: http403Count ?? 0,
    http429Count: http429Count ?? 0,
    blockedOrCaptchaCount: blockedOrCaptchaCount ?? 0,
  };
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export async function getBlockedRunTelemetry(hours = 72): Promise<BlockedRunTelemetry> {
  await requirePlatformAdminContext();
  const db = createDatabaseClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("scan_snapshots")
    .select(
      "scan_id, scan_timestamp, scan_outcome, homepage_fetch_http_status, egress_id, egress_type, asn, block_vendor_guess, normalized_body_hash"
    )
    .gte("scan_timestamp", since)
    .order("scan_timestamp", { ascending: true });

  if (error) {
    throw new Error(`Failed to load blocked run telemetry: ${error.message}`);
  }

  const rows = (data ?? []) as SnapshotRow[];
  const blockedRows = rows.filter((row) => String(row.scan_outcome ?? "").startsWith("reachability_blocked") || row.scan_outcome === "robots_restricted" || row.scan_outcome === "unknown_access_limitation");
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
