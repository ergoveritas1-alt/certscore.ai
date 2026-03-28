"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { deriveScanQualitySummary, type ScanQualityLevel } from "../../lib/scans/scan-quality";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import { deriveUnverifiedHomepageReason } from "../../lib/scans/unverified-homepage-reason";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  summarizeLegacyChangeEvents,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";
import { repairFindingFamilyPacketEvents } from "../scans/family-packet-event-repair";

export type DomainHistoryItem = {
  completedAt: string | null;
  createdAt: string;
  id: string;
  pagesRequested: number;
  pagesScanned: number;
  totalSignals: number | null;
  findingCount: number;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  scanType: string;
  startedAt: string | null;
  status: string;
  scanQualityLevel: ScanQualityLevel;
  scanQualityLabel: string;
  scanQualityWarning: string | null;
  scanCoverageRatio: number | null;
  interruptionLabel: string | null;
  interruptionReason: string | null;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type SnapshotRow = {
  auth_wall_detected: boolean | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  robots_allowed: boolean | null;
  robots_fetch_http_status: number | null;
  robots_fetch_status: string | null;
  scan_outcome: string | null;
  scan_id: string;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_http_status: number | null;
  stop_reason_label: string | null;
  report_finding_count: number | null;
  total_signals: number;
};

type ChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
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

type ValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
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

type SupabaseQueryError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getRecordString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecordNumberLike(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function deriveLoggedInterruptionReason(scanEvents: ScanDiagnosticEventRow[]) {
  for (const event of [...scanEvents].reverse()) {
    const metadata = event.metadata_json;
    const explicitHttpStatus =
      getRecordNumberLike(metadata, "httpStatus") ??
      getRecordNumberLike(metadata, "statusCode") ??
      getRecordNumberLike(metadata, "homepageFetchHttpStatus") ??
      getRecordNumberLike(metadata, "homepage_fetch_http_status");
    const combinedText = [
      event.message,
      getRecordString(metadata, "error"),
      getRecordString(metadata, "navigationError"),
      getRecordString(metadata, "reason")
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");

    if (explicitHttpStatus === 403 || /\bhttp\s*403\b|\b403\b|forbidden|access denied/i.test(combinedText)) {
      return "Reason: homepage request was blocked with HTTP 403.";
    }
  }

  const shortCircuitEvent = [...scanEvents].reverse().find((event) => event.event_type === "runtime.build_phase_diagnostic" && (
    getRecordString(event.metadata_json, "phase") === "scan_short_circuit" ||
    getRecordString(event.metadata_json, "stepKey") === "scan_short_circuit"
  ));

  if (shortCircuitEvent) {
    const reason = getRecordString(shortCircuitEvent.metadata_json, "reason");
    const homepageFetchHttpStatus = getRecordNumberLike(shortCircuitEvent.metadata_json, "homepageFetchHttpStatus");

    if (reason === "robots_disallowed") {
      return "Reason: robots.txt disallowed scanner access to the homepage.";
    }
    if (reason === "homepage_blocked") {
      return typeof homepageFetchHttpStatus === "number"
        ? `Reason: homepage request was blocked with HTTP ${homepageFetchHttpStatus}.`
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
    if (reason === "homepage_timeout") {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (reason === "homepage_not_found") {
      return typeof homepageFetchHttpStatus === "number"
        ? `Reason: homepage returned HTTP ${homepageFetchHttpStatus} Not Found.`
        : "Reason: homepage returned a not-found response.";
    }
    if (reason === "homepage_unreachable") {
      return "Reason: homepage could not be reached reliably because of a connection, DNS, TLS, or other transport failure.";
    }
  }

  const browserDiagnostic = [...scanEvents].reverse().find((event) => event.event_type === "runtime.browser_pass_diagnostic");
  const browserError =
    getRecordString(browserDiagnostic?.metadata_json ?? null, "error") ??
    getRecordString(browserDiagnostic?.metadata_json ?? null, "navigationError") ??
    browserDiagnostic?.message ??
    null;
  const browserHttpStatus =
    getRecordNumberLike(browserDiagnostic?.metadata_json ?? null, "httpStatus") ??
    getRecordNumberLike(browserDiagnostic?.metadata_json ?? null, "statusCode") ??
    getRecordNumberLike(browserDiagnostic?.metadata_json ?? null, "homepageFetchHttpStatus");

  if (browserError) {
    if (/err_name_not_resolved|dns|name not resolved/i.test(browserError)) {
      return "Reason: homepage could not be reached because the domain failed DNS resolution.";
    }
    if (/ssl|tls|certificate|protocol/i.test(browserError)) {
      return "Reason: homepage could not be reached because the connection failed during TLS or SSL setup.";
    }
    if (/timeout|timed out/i.test(browserError)) {
      return "Reason: homepage navigation timed out before the scanner could verify a usable page surface.";
    }
    if (browserHttpStatus === 403 || /403|forbidden|access denied|blocked/i.test(browserError)) {
      return browserHttpStatus === 403 || /\b403\b/i.test(browserError)
        ? "Reason: homepage request was blocked with HTTP 403."
        : "Reason: homepage request was blocked by bot protection, access controls, or a forbidden response.";
    }
  }

  return null;
}

function deriveInterruptionSummary(scan: ScanRow, snapshot: SnapshotRow | null, diagnosticEvents: ScanDiagnosticEventRow[]) {
  const loggedReason = deriveLoggedInterruptionReason(diagnosticEvents);
  const stopReason = deriveScanStopReason({
    authWallDetected: snapshot?.auth_wall_detected === true,
    blockedFlag: snapshot?.blocked_flag === true,
    captchaFlag: snapshot?.captcha_flag === true,
    homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
    pagesScanned: scan.pages_scanned,
    robotsAllowed: snapshot?.robots_allowed ?? null,
    robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
    robotsFetchStatus: snapshot?.robots_fetch_status ?? null
  });
  const reason = loggedReason ?? (stopReason ? stopReason.reason : null) ?? null;

  if (!reason) {
    return {
      interruptionLabel: null,
      interruptionReason: null
    };
  }

  let interruptionLabel = stopReason ? stopReason.outcomeTitle : "Interrupted";
  if (/dns resolution/i.test(reason)) {
    interruptionLabel = "DNS failure";
  } else if (/http 403/i.test(reason)) {
    interruptionLabel = "HTTP 403";
  } else if (/robots\.txt/i.test(reason)) {
    interruptionLabel = "Robots blocked";
  } else if (/captcha|bot challenge/i.test(reason)) {
    interruptionLabel = "Captcha";
  } else if (/authentication wall/i.test(reason)) {
    interruptionLabel = "Auth wall";
  } else if (/tls|ssl/i.test(reason)) {
    interruptionLabel = "TLS failure";
  } else if (/timed out/i.test(reason)) {
    interruptionLabel = "Timeout";
  } else if (/transport failure|connection/i.test(reason)) {
    interruptionLabel = "Transport failure";
  }

  return {
    interruptionLabel,
    interruptionReason: reason.replace(/^Reason:\s*/i, "")
  };
}

function deriveScanStateExplanation(scan: ScanRow, snapshot: SnapshotRow | null, diagnosticEvents: ScanDiagnosticEventRow[]) {
  const interruption = deriveInterruptionSummary(scan, snapshot, diagnosticEvents);
  const canonicalReason =
    typeof snapshot?.stop_reason_detail === "string" && snapshot.stop_reason_detail.trim().length > 0
      ? snapshot.stop_reason_detail.trim()
      : null;
  if (canonicalReason) {
    return {
      interruptionLabel: interruption.interruptionLabel ?? "Access limited by site protections",
      interruptionReason: canonicalReason
    };
  }

  const homepageReason = snapshot
    ? deriveUnverifiedHomepageReason({
        canonicalStopReasonDetail: snapshot.stop_reason_detail,
        authWallDetected: snapshot.auth_wall_detected === true,
        blockedFlag: snapshot.blocked_flag === true,
        captchaFlag: snapshot.captcha_flag === true,
        homepageFetchHttpStatus: snapshot.homepage_fetch_http_status,
        homepageFetchStatus: snapshot.homepage_fetch_status,
        pagesScanned: scan.pages_scanned,
        robotsAllowed: snapshot.robots_allowed,
        robotsFetchHttpStatus: snapshot.robots_fetch_http_status,
        robotsFetchStatus: snapshot.robots_fetch_status,
        scanEvents: diagnosticEvents.map((event) => ({
          eventType: event.event_type,
          message: event.message,
          metadataJson: event.metadata_json ?? undefined
        }))
      }).replace(/^Reason:\s*/i, "")
    : null;
  const snapshotHttpStatus =
    typeof snapshot?.homepage_fetch_http_status === "number" && Number.isFinite(snapshot.homepage_fetch_http_status)
      ? snapshot.homepage_fetch_http_status
      : null;
  if (snapshotHttpStatus === 403) {
    return {
      interruptionLabel: interruption.interruptionLabel ?? "Access limited by site protections",
      interruptionReason: "homepage request was blocked with HTTP 403."
    };
  }

  if (interruption.interruptionReason) {
    return interruption;
  }

  if (
    homepageReason &&
    !/the scanner could not verify a usable homepage surface|no specific reachability blocker was retained for this run/i.test(
      homepageReason
    )
  ) {
    return {
      interruptionLabel: interruption.interruptionLabel,
      interruptionReason: homepageReason
    };
  }

  const executionSummary = deriveScanExecutionSummary({
    authWallDetected: snapshot?.auth_wall_detected ?? null,
    blockedFlag: snapshot?.blocked_flag ?? null,
    captchaFlag: snapshot?.captcha_flag ?? null,
    events: diagnosticEvents.map((event) => ({
      eventType: event.event_type,
      message: event.message,
      metadataJson: event.metadata_json ?? undefined
    })),
    homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
    pagesRequested: scan.pages_requested,
    pagesScanned: scan.pages_scanned,
    robotsAllowed: snapshot?.robots_allowed ?? null,
    robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
    robotsFetchStatus: snapshot?.robots_fetch_status ?? null,
    status: scan.status
  });
  const specificDetail =
    executionSummary.details.find((detail) =>
      /http\s*\d{3}|forbidden|blocked|access controls|dns|name resolved|tls|ssl|certificate|timed out|timeout|captcha|bot challenge|robots|authentication wall|connection/i.test(
        detail
      )
    ) ?? null;
  const stopLine =
    executionSummary.details.find((detail) => detail.startsWith("Scan interpretation stopped. ")) ??
    null;
  const selectedLine = specificDetail ?? stopLine;

  if (!selectedLine) {
    return interruption;
  }

  return {
    interruptionLabel: interruption.interruptionLabel,
    interruptionReason: selectedLine.replace(/^Scan interpretation stopped\.\s*/i, "")
  };
}

export async function getDomainScanHistory(input: { domainId: string; organizationId: string }): Promise<DomainHistoryItem[]> {
  const supabase = createAdminClient();
  const { data: scans, error } = await supabase
    .from("scans")
    .select("id, scan_type, status, created_at, started_at, completed_at, pages_requested, pages_scanned")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load domain scan history: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const scanIds = scanRows.map((scan) => scan.id);

  if (scanIds.length === 0) {
    return [];
  }

  const [{ data: snapshots, error: snapshotsError }, changeEventsResult] = await Promise.all([
    supabase
      .from("scan_snapshots")
      .select("*")
      .in("scan_id", scanIds),
    (async () => {
      const rows: ChangeSummaryRow[] = [];
      let queryError: SupabaseQueryError = null;

      for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
        const { data, error: batchError } = await supabase
          .from("compliance_change_events")
          .select("scan_id_current, event_type")
          .eq("organization_id", input.organizationId)
          .eq("domain_id", input.domainId)
          .in("scan_id_current", scanIdBatch);

        if (batchError) {
          queryError = batchError;
          break;
        }

        rows.push(...((data ?? []) as ChangeSummaryRow[]));
      }

      return { data: rows, error: queryError };
    })()
  ]);
  if (snapshotsError) {
    throw new Error(`Failed to load domain scan history: ${snapshotsError.message}`);
  }
  const changeEvents = changeEventsResult.data;
  const changeEventsError = changeEventsResult.error;
  const diagnosticEvents: ScanDiagnosticEventRow[] = [];
  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data: diagnosticEventRows, error: diagnosticEventsError } = await supabase
      .from("scan_events")
      .select("scan_id, event_type, message, metadata_json, created_at")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: true });

    if (diagnosticEventsError) {
      throw new Error(`Failed to load domain scan history: ${diagnosticEventsError.message}`);
    }

    diagnosticEvents.push(...((diagnosticEventRows ?? []) as ScanDiagnosticEventRow[]));
  }

  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((row) => [row.scan_id, row]));
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const event of diagnosticEvents) {
    const list = diagnosticEventMap.get(event.scan_id) ?? [];
    list.push(event);
    diagnosticEventMap.set(event.scan_id, list);
  }
  const validationRuns: ValidationRunSummaryRow[] = [];
  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data: validationRunRows, error: validationRunsError } = await supabase
      .from("validation_runs")
      .select("id, scan_id, finding_count, created_at")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: false });

    if (validationRunsError) {
      throw new Error(`Failed to load domain scan history: ${validationRunsError.message}`);
    }

    validationRuns.push(...((validationRunRows ?? []) as ValidationRunSummaryRow[]));
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
  const policyEnrichmentRows: PolicyEnrichmentRow[] = [];
  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data: policyRows, error: policyRowsError } = await supabase
      .from("policy_enrichment")
      .select("*")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: true });

    if (policyRowsError) {
      throw new Error(`Failed to load domain scan history: ${policyRowsError.message}`);
    }

    policyEnrichmentRows.push(...((policyRows ?? []) as PolicyEnrichmentRow[]));
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
      const { data, error } = await supabase
        .from("validation_run_findings")
        .select(
          "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation )"
        )
        .in("validation_run_id", validationRunIdBatch);

      if (error) {
        throw new Error(`Failed to load domain scan history: ${error.message}`);
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
  const changeMap = new Map<string, { addedCount: number; removedCount: number; changedCount: number }>();

  if (changeEventsError) {
    if (!isMissingComplianceChangeEventsTable(changeEventsError)) {
      throw new Error(`Failed to load domain scan history: ${changeEventsError.message}`);
    }

    const legacyEvents: LegacyScanEventRow[] = [];
    let legacyEventsError: SupabaseQueryError = null;

    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error: batchError } = await supabase
        .from("scan_events")
        .select("id, scan_id, event_type, message, metadata_json, created_at")
        .eq("organization_id", input.organizationId)
        .eq("domain_id", input.domainId)
        .in("scan_id", scanIdBatch)
        .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
        .order("created_at", { ascending: false });

      if (batchError) {
        legacyEventsError = batchError;
        break;
      }

      legacyEvents.push(...((data ?? []) as LegacyScanEventRow[]));
    }

    if (legacyEventsError) {
      throw new Error(`Failed to load domain scan history: ${legacyEventsError.message}`);
    }

    for (const [scanId, summary] of summarizeLegacyChangeEvents(legacyEvents)) {
      changeMap.set(scanId, {
        addedCount: summary.addedCount,
        removedCount: summary.removedCount,
        changedCount: summary.changedCount
      });
    }
  } else {
    for (const event of changeEvents) {
      const bucket = changeMap.get(event.scan_id_current) ?? {
        addedCount: 0,
        removedCount: 0,
        changedCount: 0
      };

      if (event.event_type.endsWith("_added") || event.event_type === "field_added") {
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_removed") || event.event_type === "field_removed") {
        bucket.removedCount += 1;
      } else {
        bucket.changedCount += 1;
      }

      changeMap.set(event.scan_id_current, bucket);
    }
  }

  return scanRows.map((scan) => {
    const snapshot =
      snapshotMap.get(scan.id) ??
      (((snapshots ?? []) as SnapshotRow[]).find((snapshotRow) => snapshotRow.scan_id === scan.id) ?? null);
    const derivedState = deriveScanStateExplanation(
      scan,
      snapshot,
      diagnosticEventMap.get(scan.id) ?? []
    );
    const interruptionLabel =
      (typeof snapshot?.stop_reason_label === "string" && snapshot.stop_reason_label.trim().length > 0
        ? snapshot.stop_reason_label.trim()
        : null) ?? derivedState.interruptionLabel;
    const interruptionReason =
      (typeof snapshot?.stop_reason_detail === "string" && snapshot.stop_reason_detail.trim().length > 0
        ? snapshot.stop_reason_detail.trim()
        : null) ?? derivedState.interruptionReason;
    const qualitySummary = deriveScanQualitySummary({
      interruptionReason,
      pagesRequested: scan.pages_requested,
      pagesScanned: scan.pages_scanned,
      status: scan.status
    });

    return {
      id: scan.id,
      scanType: scan.scan_type,
      status: scan.status,
      createdAt: scan.created_at,
      startedAt: scan.started_at,
      completedAt: scan.completed_at,
      pagesRequested: scan.pages_requested,
      pagesScanned: scan.pages_scanned,
      totalSignals: (typeof snapshot?.total_signals === "number" ? snapshot.total_signals : null) ?? null,
      findingCount: Math.max(
        snapshot?.report_finding_count ?? 0,
        findingCountMap.get(scan.id) ?? 0,
        surfacedFindingCountMap.get(scan.id) ?? 0
      ),
      addedCount: changeMap.get(scan.id)?.addedCount ?? 0,
      removedCount: changeMap.get(scan.id)?.removedCount ?? 0,
      changedCount: changeMap.get(scan.id)?.changedCount ?? 0,
      scanQualityLevel: qualitySummary.level,
      scanQualityLabel: qualitySummary.label,
      scanQualityWarning: qualitySummary.warning,
      scanCoverageRatio: qualitySummary.coverageRatio,
      interruptionLabel,
      interruptionReason
    };
  });
}
