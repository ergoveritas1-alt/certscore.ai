"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import { loadMergedSignalsByScanId } from "../scans/merged-signal-summary";
import { repairFindingFamilyPacketEvents } from "../scans/family-packet-event-repair";
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

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_scanned: number;
  scan_type: string;
  status: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type SnapshotRow = {
  access_posture_class?: AccessPostureClass | null;
  asn?: number | null;
  block_vendor_guess?: string | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number;
  egress_id?: string | null;
  egress_type?: string | null;
  highest_successful_tier?: ScanExecutionTier | null;
  homepage_fetch_http_status: number | null;
  normalized_body_hash?: string | null;
  report_finding_count?: number | null;
  recoverable_finding_classes?: RecoverableFindingClass[] | null;
  scan_outcome?: string | null;
  scan_timestamp?: string | null;
  robots_fetch_http_status: number | null;
  scan_id: string;
  stop_tier?: ScanExecutionTier | null;
  total_signals: number;
};

type ValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
};

type ScanDiagnosticEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string;
};

type PolicyEnrichmentRow = Record<string, unknown> & {
  scan_id?: string;
};

type ValidationFindingSummaryRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
  validation_run_id: string;
  validation_verdicts:
    | {
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }
    | Array<{
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }>
    | null;
};

const CHANGE_EVENT_BATCH_SIZE = 50;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function isMissingTieredSnapshotColumn(error: { message?: string; code?: string } | null) {
  const message = `${error?.message ?? ""}`.toLowerCase();
  return (
    `${error?.code ?? ""}` === "42703" ||
    message.includes("access_posture_class") ||
    message.includes("highest_successful_tier") ||
    message.includes("stop_tier") ||
    message.includes("recoverable_finding_classes")
  );
}

export async function listAdminScans(limit = 50): Promise<AdminScanListItem[]> {
  await requirePlatformAdminContext();
  const supabase = createAdminClient();
  const { data: scans, error } = await supabase
    .from("scans")
    .select("id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_scanned")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const organizationIds = [...new Set(scanRows.flatMap((scan) => (scan.organization_id ? [scan.organization_id] : [])))];
  const scanIds = scanRows.map((scan) => scan.id);

  const snapshotsPromise = scanIds.length
    ? supabase
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status, robots_fetch_http_status, blocked_flag, captcha_flag, access_posture_class, highest_successful_tier, stop_tier, recoverable_finding_classes"
        )
        .in("scan_id", scanIds)
    : Promise.resolve({ data: [] as SnapshotRow[], error: null });
  const snapshotsFallbackPromise = scanIds.length
    ? supabase
        .from("scan_snapshots")
        .select("scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status, robots_fetch_http_status, blocked_flag, captcha_flag")
        .in("scan_id", scanIds)
    : Promise.resolve({ data: [] as SnapshotRow[], error: null });

  const [{ data: domains }, { data: organizations }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    domainIds.length ? supabase.from("domains").select("id, hostname").in("id", domainIds) : Promise.resolve({ data: [] as DomainRow[] }),
    organizationIds.length
      ? supabase.from("organizations").select("id, name").in("id", organizationIds)
      : Promise.resolve({ data: [] as OrganizationRow[] }),
    snapshotsPromise
  ]);
  let resolvedSnapshots = snapshots;
  if (snapshotsError && isMissingTieredSnapshotColumn(snapshotsError)) {
    const fallback = await snapshotsFallbackPromise;
    if (fallback.error) {
      throw new Error(`Failed to load scans: ${fallback.error.message}`);
    }
    resolvedSnapshots = (fallback.data ?? []).map((row) => ({
      ...(row as SnapshotRow),
      access_posture_class: null,
      highest_successful_tier: null,
      stop_tier: null,
      recoverable_finding_classes: []
    }));
  } else if (snapshotsError) {
    throw new Error(`Failed to load scans: ${snapshotsError.message}`);
  }

  const domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain]));
  const organizationMap = new Map(((organizations ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]));
  const snapshotMap = new Map(((resolvedSnapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const validationRuns: ValidationRunSummaryRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: validationRunRows, error: validationRunsError } = await supabase
        .from("validation_runs")
        .select("id, scan_id, finding_count, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: false });

      if (validationRunsError) {
        throw new Error(`Failed to load scans: ${validationRunsError.message}`);
      }

      validationRuns.push(...((validationRunRows ?? []) as ValidationRunSummaryRow[]));
    }
  }
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
  const diagnosticEvents: ScanDiagnosticEventRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: diagnosticEventRows, error: diagnosticEventsError } = await supabase
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (diagnosticEventsError) {
        throw new Error(`Failed to load scans: ${diagnosticEventsError.message}`);
      }

      diagnosticEvents.push(...((diagnosticEventRows ?? []) as ScanDiagnosticEventRow[]));
    }
  }
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const existing = diagnosticEventMap.get(diagnosticEvent.scan_id) ?? [];
    existing.push(diagnosticEvent);
    diagnosticEventMap.set(diagnosticEvent.scan_id, existing);
  }
  const policyEnrichmentRows: PolicyEnrichmentRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: policyRows, error: policyRowsError } = await supabase
        .from("policy_enrichment")
        .select("*")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (policyRowsError) {
        throw new Error(`Failed to load scans: ${policyRowsError.message}`);
      }

      policyEnrichmentRows.push(...((policyRows ?? []) as PolicyEnrichmentRow[]));
    }
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
  const latestValidationRunIds = [
    ...new Set(
      [...latestValidationRunByScanId.values()].filter(
        (validationRunId): validationRunId is string =>
          typeof validationRunId === "string" && validationRunId.trim().length > 0
      )
    )
  ];
  const validationFindingRows: ValidationFindingSummaryRow[] = [];
  if (latestValidationRunIds.length) {
    for (const validationRunIdBatch of chunkValues(latestValidationRunIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error: validationFindingsError } = await supabase
        .from("validation_run_findings")
        .select(
          "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation )"
        )
        .in("validation_run_id", validationRunIdBatch);

      if (validationFindingsError) {
        throw new Error(`Failed to load scans: ${validationFindingsError.message}`);
      }

      validationFindingRows.push(...((data ?? []) as ValidationFindingSummaryRow[]));
    }
  }
  const validationFindingsByRunId = new Map<string, ScanValidationFinding[]>();
  for (const row of validationFindingRows) {
    const verdictRows = Array.isArray(row.validation_verdicts)
      ? row.validation_verdicts
      : row.validation_verdicts
        ? [row.validation_verdicts]
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
    supabase
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
  const supabase = createAdminClient();

  const [
    { count: totalScans, error: totalScansError },
    { count: http403Count, error: http403Error },
    { count: http429Count, error: http429Error },
    { count: blockedOrCaptchaCount, error: blockedOrCaptchaError },
  ] = await Promise.all([
    supabase.from("scans").select("id", { count: "exact", head: true }),
    supabase
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.403,robots_fetch_http_status.eq.403"),
    supabase
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.429,robots_fetch_http_status.eq.429"),
    supabase
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
  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
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
