"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { deriveScanQualitySummary, type ScanQualityLevel } from "../../lib/scans/scan-quality";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import { deriveUnverifiedHomepageReason } from "../../lib/scans/unverified-homepage-reason";
import { getHybridConsentAuditCompleted, withHybridRuntimeArtifactFallbacks } from "../../lib/scans/hybrid-runtime-evidence";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  summarizeLegacyChangeEvents,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";
import { repairFindingFamilyPacketEvents } from "./family-packet-event-repair";
import { loadMergedSignalsByScanId } from "./merged-signal-summary";

export type OrganizationScanListItem = {
  accessPostureClass: AccessPostureClass | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  id: string;
  domainActiveScanExists: boolean;
  domainHostname: string | null;
  domainId: string | null;
  domainLastScannedAt: string | null;
  certscoreOverall: number | null;
  regulatoryScore: number | null;
  privacyScore: number | null;
  consentScore: number | null;
  accessibilityScore: number | null;
  totalSignals: number | null;
  findingCount: number;
  cookieBannerPresent: boolean | null;
  cmpVendorName: string | null;
  consentAuditCompleted: boolean | null;
  consentRejectInteractionSucceeded: boolean | null;
  consentRejectReducedTracking: boolean | null;
  consentRejectReducedThirdPartyCookies: boolean | null;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  trackerDetectedCount: number;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  scanQualityLevel: ScanQualityLevel;
  scanQualityLabel: string;
  scanQualityWarning: string | null;
  scanCoverageRatio: number | null;
  interruptionLabel: string | null;
  interruptionReason: string | null;
  recoverableFindingClasses: RecoverableFindingClass[];
  stopTier: ScanExecutionTier | null;
};

export type OrganizationScanPageResult = {
  items: OrganizationScanListItem[];
  page: number;
  pageCount: number;
  totalCount: number;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type DomainRow = {
  hostname: string;
  id: string;
  last_scanned_at: string | null;
  latest_scan_id: string | null;
};

type LatestDomainScanRow = {
  id: string;
  status: string;
};

type DomainCompletedScanRow = {
  completed_at: string | null;
  domain_id: string | null;
};

type SnapshotRow = {
  access_posture_class: AccessPostureClass | null;
  auth_wall_detected: boolean | null;
  accessibility_score: number | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number | null;
  cmp_vendor_name: string | null;
  consent_score: number | null;
  cookie_banner_present: boolean | null;
  highest_successful_tier: ScanExecutionTier | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  privacy_score: number | null;
  recoverable_finding_classes: RecoverableFindingClass[] | null;
  regulatory_exposure_score: number | null;
  robots_allowed: boolean | null;
  robots_fetch_http_status: number | null;
  robots_fetch_status: string | null;
  scan_outcome: string | null;
  scan_id: string;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_http_status: number | null;
  stop_reason_label: string | null;
  stop_tier: ScanExecutionTier | null;
  report_finding_count: number | null;
  total_signals: number;
};

type RuntimeArtifactRow = {
  consent_audit_completed: boolean | null;
  consent_reject_interaction_succeeded: boolean | null;
  consent_reject_reduced_third_party_cookies: boolean | null;
  consent_reject_reduced_tracking: boolean | null;
  hybrid_runtime_evidence?: Record<string, unknown> | null;
  scan_id: string;
};

type ChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
};

type SignalCountRow = {
  scan_id: string;
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

type SupabaseQueryError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
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

async function loadOrganizationScans(
  organizationId: string,
  input?: {
    from?: number;
    to?: number;
    limit?: number;
    includeCount?: boolean;
  }
) {
  const supabase = createAdminClient();
  let query = supabase
    .from("scans")
    .select("id, domain_id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at", input?.includeCount ? { count: "exact" } : undefined)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (typeof input?.from === "number" && typeof input?.to === "number") {
    query = query.range(input.from, input.to);
  } else if (typeof input?.limit === "number") {
    query = query.limit(input.limit);
  }

  const { data: scans, error, count } = await query;

  if (error) {
    throw new Error(`Failed to load organization scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const scanIds = scanRows.map((scan) => scan.id);
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const summaryScanIds = Array.from(
    scanRows.reduce((ids, scan) => {
      const key = scan.domain_id ?? `scan:${scan.id}`;
      if (!ids.has(key)) {
        ids.set(key, scan.id);
      }
      return ids;
    }, new Map<string, string>()).values()
  );

  const domainsWithLastScannedAtPromise = domainIds.length
    ? supabase
        .from("domains")
        .select("id, hostname, last_scanned_at, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as DomainRow[], error: null });
  const domainsWithoutLastScannedAtPromise = domainIds.length
    ? supabase
        .from("domains")
        .select("id, hostname, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as DomainRow[], error: null });
  const snapshotsPromise = summaryScanIds.length
    ? supabase
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, regulatory_exposure_score, privacy_score, consent_score, accessibility_score, cookie_banner_present, cmp_vendor_name, homepage_fetch_http_status, homepage_fetch_status, robots_allowed, robots_fetch_http_status, robots_fetch_status, blocked_flag, captcha_flag, auth_wall_detected, scan_outcome, stop_reason_code, stop_reason_label, stop_reason_detail, stop_reason_http_status, report_finding_count, access_posture_class, highest_successful_tier, stop_tier, recoverable_finding_classes"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as SnapshotRow[], error: null as SupabaseQueryError });
  const snapshotsFallbackPromise = summaryScanIds.length
    ? supabase
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, regulatory_exposure_score, privacy_score, consent_score, accessibility_score, cookie_banner_present, cmp_vendor_name, homepage_fetch_http_status, homepage_fetch_status, robots_allowed, robots_fetch_http_status, robots_fetch_status, blocked_flag, captcha_flag, auth_wall_detected, scan_outcome, stop_reason_code, stop_reason_label, stop_reason_detail, stop_reason_http_status, report_finding_count"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as SnapshotRow[], error: null as SupabaseQueryError });
  const runtimeArtifactsPromise = summaryScanIds.length
    ? supabase
        .from("scan_runtime_artifacts")
        .select(
          "scan_id, consent_audit_completed, consent_reject_interaction_succeeded, consent_reject_reduced_tracking, consent_reject_reduced_third_party_cookies, hybrid_runtime_evidence"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as RuntimeArtifactRow[], error: null as SupabaseQueryError });

  const [{ data: domainsWithLastScannedAt, error: domainsError }, { data: snapshots, error: snapshotsError }, { data: runtimeArtifacts, error: runtimeArtifactsError }] = await Promise.all([
    domainsWithLastScannedAtPromise,
    snapshotsPromise,
    runtimeArtifactsPromise
  ]);
  let domains = domainsWithLastScannedAt;
  if (domainsError && isMissingLastScannedAtColumn(domainsError)) {
    const fallback = await domainsWithoutLastScannedAtPromise;
    domains = (fallback.data ?? []).map((domain) => ({
      ...domain,
      last_scanned_at: null
    }));
  } else if (domainsError) {
    throw new Error(`Failed to load organization scans: ${domainsError.message}`);
  }
  let resolvedSnapshots = snapshots;
  if (snapshotsError && isMissingTieredSnapshotColumn(snapshotsError)) {
    const fallback = await snapshotsFallbackPromise;
    if (fallback.error) {
      throw new Error(`Failed to load organization scans: ${fallback.error.message}`);
    }
    resolvedSnapshots = (fallback.data ?? []).map((row) => ({
      ...(row as SnapshotRow),
      access_posture_class: null,
      highest_successful_tier: null,
      stop_tier: null,
      recoverable_finding_classes: []
    }));
  } else if (snapshotsError) {
    throw new Error(`Failed to load organization scans: ${snapshotsError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load organization scans: ${runtimeArtifactsError.message}`);
  }
  const changeSummaries: ChangeSummaryRow[] = [];
  let changeSummariesError: SupabaseQueryError = null;

  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("compliance_change_events")
        .select("scan_id_current, event_type")
        .eq("organization_id", organizationId)
        .in("scan_id_current", scanIdBatch);

      if (error) {
        changeSummariesError = error;
        break;
      }

      changeSummaries.push(...((data ?? []) as ChangeSummaryRow[]));
    }
  }

  const domainRows = (domains ?? []) as DomainRow[];
  const latestDomainScanIds = [...new Set(domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : [])))];
  const { data: domainCompletedScans, error: domainCompletedScansError } = domainIds.length
    ? await supabase
        .from("scans")
        .select("domain_id, completed_at")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .in("domain_id", domainIds)
        .order("completed_at", { ascending: false })
    : { data: [] as DomainCompletedScanRow[], error: null };
  const { data: latestDomainScans, error: latestDomainScansError } = latestDomainScanIds.length
    ? await supabase.from("scans").select("id, status").in("id", latestDomainScanIds)
    : { data: [] as LatestDomainScanRow[], error: null };

  if (domainCompletedScansError) {
    throw new Error(`Failed to load organization scans: ${domainCompletedScansError.message}`);
  }

  if (latestDomainScansError) {
    throw new Error(`Failed to load organization scans: ${latestDomainScansError.message}`);
  }

  const domainMap = new Map(domainRows.map((domain) => [domain.id, domain]));
  const domainLastCompletedAtMap = new Map<string, string>();
  for (const scan of (domainCompletedScans ?? []) as DomainCompletedScanRow[]) {
    if (!scan.domain_id || !scan.completed_at || domainLastCompletedAtMap.has(scan.domain_id)) {
      continue;
    }

    domainLastCompletedAtMap.set(scan.domain_id, scan.completed_at);
  }
  const latestDomainScanMap = new Map(
    ((latestDomainScans ?? []) as LatestDomainScanRow[]).map((scan) => [scan.id, scan])
  );
  const snapshotMap = new Map(((resolvedSnapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const zeroSignalScanIds = summaryScanIds
    .filter((scanId) => {
      const totalSignals = snapshotMap.get(scanId)?.total_signals ?? null;
      return totalSignals === null || totalSignals === 0;
    });
  const runtimeArtifactMap = new Map(
    ((runtimeArtifacts ?? []) as RuntimeArtifactRow[]).map((artifact) => [
      artifact.scan_id,
      withHybridRuntimeArtifactFallbacks(artifact as Record<string, unknown>) as RuntimeArtifactRow
    ])
  );
  const signalCountMap = new Map<string, number>();
  if (zeroSignalScanIds.length) {
    for (const scanIdBatch of chunkValues(zeroSignalScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: signalCountRows, error: signalCountError } = await supabase
        .from("scan_signals")
        .select("scan_id")
        .eq("population_source", "scanner")
        .in("scan_id", scanIdBatch);

      if (signalCountError) {
        throw new Error(`Failed to load organization scans: ${signalCountError.message}`);
      }

      for (const row of (signalCountRows ?? []) as SignalCountRow[]) {
        signalCountMap.set(row.scan_id, (signalCountMap.get(row.scan_id) ?? 0) + 1);
      }
    }
  }
  const validationRuns: ValidationRunSummaryRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: validationRunRows, error: validationRunsError } = await supabase
        .from("validation_runs")
        .select("id, scan_id, finding_count, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: false });

      if (validationRunsError) {
        throw new Error(`Failed to load organization scans: ${validationRunsError.message}`);
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
  const observedAtByScanId = new Map(
    scanRows.map((scan) => [scan.id, scan.completed_at ?? scan.started_at ?? scan.created_at] as const)
  );
  const diagnosticEvents: ScanDiagnosticEventRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: diagnosticEventRows, error: diagnosticEventsError } = await supabase
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (diagnosticEventsError) {
        throw new Error(`Failed to load organization scans: ${diagnosticEventsError.message}`);
      }

      diagnosticEvents.push(...((diagnosticEventRows ?? []) as ScanDiagnosticEventRow[]));
    }
  }
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    observedAtByScanId,
    scanIds: summaryScanIds,
    supabase
  });
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const existing = diagnosticEventMap.get(diagnosticEvent.scan_id) ?? [];
    existing.push(diagnosticEvent);
    diagnosticEventMap.set(diagnosticEvent.scan_id, existing);
  }
  const policyEnrichmentRows: PolicyEnrichmentRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: policyRows, error: policyRowsError } = await supabase
        .from("policy_enrichment")
        .select("*")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (policyRowsError) {
        throw new Error(`Failed to load organization scans: ${policyRowsError.message}`);
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
      const { data, error } = await supabase
        .from("validation_run_findings")
        .select(
          "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation )"
        )
        .in("validation_run_id", validationRunIdBatch);

      if (error) {
        throw new Error(`Failed to load organization scans: ${error.message}`);
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
  const changeMap = new Map<
    string,
    {
      addedCount: number;
      removedCount: number;
      changedCount: number;
      trackerDetectedCount: number;
    }
  >();

  if (changeSummariesError) {
    if (!isMissingComplianceChangeEventsTable(changeSummariesError)) {
      throw new Error(`Failed to load organization scans: ${changeSummariesError.message}`);
    }

    const legacyEvents: LegacyScanEventRow[] = [];
    let legacyEventsError: SupabaseQueryError = null;

    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("scan_events")
        .select("id, scan_id, event_type, message, metadata_json, created_at")
        .eq("organization_id", organizationId)
        .in("scan_id", scanIdBatch)
        .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
        .order("created_at", { ascending: false });

      if (error) {
        legacyEventsError = error;
        break;
      }

      legacyEvents.push(...((data ?? []) as LegacyScanEventRow[]));
    }

    if (legacyEventsError) {
      throw new Error(`Failed to load organization scans: ${legacyEventsError.message}`);
    }

    for (const [scanId, summary] of summarizeLegacyChangeEvents(legacyEvents)) {
      changeMap.set(scanId, {
        addedCount: summary.addedCount,
        removedCount: summary.removedCount,
        changedCount: summary.changedCount,
        trackerDetectedCount: summary.trackerDetectedCount
      });
    }
  } else {
    for (const event of changeSummaries) {
      const bucket = changeMap.get(event.scan_id_current) ?? {
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        trackerDetectedCount: 0
      };

      if (event.event_type === "tracker_vendor_added" || event.event_type === "session_replay_tracker_added") {
        bucket.trackerDetectedCount += 1;
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_added") || event.event_type === "field_added") {
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_removed") || event.event_type === "field_removed") {
        bucket.removedCount += 1;
      } else {
        bucket.changedCount += 1;
      }

      changeMap.set(event.scan_id_current, bucket);
    }
  }

  return {
    items: scanRows.map((scan) => {
    const domain = scan.domain_id ? domainMap.get(scan.domain_id) ?? null : null;
    const latestDomainScan =
      domain?.latest_scan_id ? latestDomainScanMap.get(domain.latest_scan_id) ?? null : null;
    const snapshot =
      snapshotMap.get(scan.id) ??
      (((snapshots ?? []) as SnapshotRow[]).find((snapshotRow) => snapshotRow.scan_id === scan.id) ?? null);
    const derivedState = deriveScanStateExplanation(
      scan,
      snapshot,
      diagnosticEventMap.get(scan.id) ?? []
    );
    const totalSignals =
      (typeof snapshot?.total_signals === "number" ? snapshot.total_signals : null) ??
      signalCountMap.get(scan.id) ??
      null;
    const normalizedAccessPosture = normalizeAccessPostureSummary({
      accessPostureClass: snapshot?.access_posture_class ?? null,
      highestSuccessfulTier: snapshot?.highest_successful_tier ?? null,
      homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
      homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
      pagesScanned: scan.pages_scanned,
      recoverableFindingClasses: snapshot?.recoverable_finding_classes ?? [],
      stopTier: snapshot?.stop_tier ?? null,
      totalSignals
    });
    const accessPosture = deriveAccessPosturePresentation({
      accessPostureClass: normalizedAccessPosture.accessPostureClass,
      highestSuccessfulTier: normalizedAccessPosture.highestSuccessfulTier,
      stopTier: normalizedAccessPosture.stopTier,
      totalSignals,
      pagesScanned: scan.pages_scanned,
      recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses
    });
    const interruptionLabel =
      (typeof snapshot?.stop_reason_label === "string" && snapshot.stop_reason_label.trim().length > 0
        ? snapshot.stop_reason_label.trim()
        : null) ?? accessPosture.label ?? derivedState.interruptionLabel;
    const interruptionReason =
      (typeof snapshot?.stop_reason_detail === "string" && snapshot.stop_reason_detail.trim().length > 0
        ? snapshot.stop_reason_detail.trim()
        : null) ?? accessPosture.reason ?? derivedState.interruptionReason;
    const qualitySummary = deriveScanQualitySummary({
      interruptionReason,
      pagesRequested: scan.pages_requested,
      pagesScanned: scan.pages_scanned,
      status: scan.status
    });
    return {
        id: scan.id,
        domainActiveScanExists: latestDomainScan?.status === "queued" || latestDomainScan?.status === "running",
        domainHostname: domain?.hostname ?? null,
        domainId: scan.domain_id,
        domainLastScannedAt: (domain?.last_scanned_at ?? (scan.domain_id ? domainLastCompletedAtMap.get(scan.domain_id) : null)) ?? null,
        certscoreOverall: snapshot?.certscore_overall ?? null,
        regulatoryScore: snapshot?.regulatory_exposure_score ?? null,
        privacyScore: snapshot?.privacy_score ?? null,
        consentScore: snapshot?.consent_score ?? null,
        accessibilityScore: snapshot?.accessibility_score ?? null,
        totalSignals,
        findingCount: Math.max(
          snapshot?.report_finding_count ?? 0,
          findingCountMap.get(scan.id) ?? 0,
          surfacedFindingCountMap.get(scan.id) ?? 0
        ),
        cookieBannerPresent: snapshot?.cookie_banner_present ?? null,
        cmpVendorName: snapshot?.cmp_vendor_name ?? null,
        consentAuditCompleted:
          runtimeArtifactMap.get(scan.id)?.consent_audit_completed ??
          getHybridConsentAuditCompleted(runtimeArtifactMap.get(scan.id) as Record<string, unknown> | null),
        consentRejectInteractionSucceeded:
          runtimeArtifactMap.get(scan.id)?.consent_reject_interaction_succeeded ?? null,
        consentRejectReducedTracking: runtimeArtifactMap.get(scan.id)?.consent_reject_reduced_tracking ?? null,
        consentRejectReducedThirdPartyCookies:
          runtimeArtifactMap.get(scan.id)?.consent_reject_reduced_third_party_cookies ?? null,
        addedCount: changeMap.get(scan.id)?.addedCount ?? 0,
        removedCount: changeMap.get(scan.id)?.removedCount ?? 0,
        changedCount: changeMap.get(scan.id)?.changedCount ?? 0,
        trackerDetectedCount: changeMap.get(scan.id)?.trackerDetectedCount ?? 0,
        scanType: scan.scan_type,
        status: scan.status,
        pagesRequested: scan.pages_requested,
        pagesScanned: scan.pages_scanned,
        createdAt: scan.created_at,
        startedAt: scan.started_at,
        completedAt: scan.completed_at,
        scanQualityLevel: qualitySummary.level,
        scanQualityLabel: qualitySummary.label,
        scanQualityWarning: qualitySummary.warning,
        scanCoverageRatio: qualitySummary.coverageRatio,
        interruptionLabel,
        interruptionReason,
        accessPostureClass: normalizedAccessPosture.accessPostureClass,
        highestSuccessfulTier: normalizedAccessPosture.highestSuccessfulTier,
        stopTier: normalizedAccessPosture.stopTier,
        recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses
    } satisfies OrganizationScanListItem;
    }),
    totalCount: count ?? scanRows.length
  };
}

export async function getOrganizationScans(organizationId: string, limit?: number) {
  const result = await loadOrganizationScans(organizationId, { limit });
  return result.items;
}

export async function getOrganizationScansPage(
  organizationId: string,
  input?: {
    page?: number;
    pageSize?: number;
  }
) {
  const pageSize = Math.max(1, input?.pageSize ?? 25);
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const result = await loadOrganizationScans(organizationId, {
    from,
    to,
    includeCount: true
  });

  return {
    items: result.items,
    page,
    pageCount: Math.ceil(result.totalCount / pageSize),
    totalCount: result.totalCount
  } satisfies OrganizationScanPageResult;
}
