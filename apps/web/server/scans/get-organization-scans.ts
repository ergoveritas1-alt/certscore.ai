"use server";

import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { deriveScanQualitySummary, type ScanQualityLevel } from "../../lib/scans/scan-quality";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import { deriveScanExecutionSummary } from "../../lib/scans/scan-timeout-summary";
import { deriveUnverifiedHomepageReason } from "../../lib/scans/unverified-homepage-reason";
import { getHybridConsentAuditCompleted, withHybridRuntimeArtifactFallbacks } from "../../lib/scans/hybrid-runtime-evidence";
import { getScanFromDisplay } from "../../lib/scans/scan-from";
import { deriveDisplayCreatedAt } from "./display-state";
import { selectConfiguredCustomerGdprEprivacyScore } from "./customer-score-cutover-server";
import { loadLatestVersionedScoreAssessments } from "./score-assessment-repository";
import {
  loadOrganizationScanPageData,
  isMissingComplianceChangeEventsTable,
  type OrganizationChangeSummaryRow as ChangeSummaryRow,
  type OrganizationDomainCompletedScanRow as DomainCompletedScanRow,
  type OrganizationLatestDomainScanRow as LatestDomainScanRow,
  type OrganizationRuntimeArtifactRow as RuntimeArtifactRow,
  type OrganizationScanDiagnosticEventRow as ScanDiagnosticEventRow,
  type OrganizationScanDomainRow as DomainRow,
  type OrganizationScanQueryRow as ScanRow,
  type OrganizationScanSnapshotRow as SnapshotRow
} from "./repository";

export type OrganizationScanListItem = {
  accessPostureClass: AccessPostureClass | null;
  highestSuccessfulTier: ScanExecutionTier | null;
  id: string;
  domainActiveScanExists: boolean;
  domainHostname: string | null;
  domainId: string | null;
  domainLastScannedAt: string | null;
  certscoreOverall: number | null;
  scoreCoverageConfidence: "high" | "medium" | "low" | "insufficient" | null;
  scoreCoverageRatio: number | null;
  scoreLabel: "GDPR/ePrivacy evidence" | "GDPR/ePrivacy posture" | "Legacy scan score" | null;
  scoreScoredAt: string | null;
  scoreSource: string | null;
  scoreVersion: string | null;
  regulatoryScore: number | null;
  privacyScore: number | null;
  privacyPolicyPresent: boolean | null;
  consentScore: number | null;
  accessibilityScore: number | null;
  totalSignals: number | null;
  findingCount: number;
  topFindingCount: number | null;
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
  freshRescanRequested: boolean | null;
  scanFromLabel: string;
  scanFromValue: string;
  stopTier: ScanExecutionTier | null;
};

export type OrganizationScanPageResult = {
  items: OrganizationScanListItem[];
  page: number;
  pageCount: number;
  totalCount: number;
};

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

function getRecordBoolean(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
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

function getFreshRescanRequested(requestContext: Record<string, unknown> | null) {
  return getRecordBoolean(requestContext, "bypassRecentScanReuse") ?? getRecordBoolean(requestContext, "forceNewScan");
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
    accessPostureClass: snapshot?.access_posture_class ?? null,
    authWallDetected: snapshot?.auth_wall_detected === true,
    blockedFlag: snapshot?.blocked_flag === true,
    captchaFlag: snapshot?.captcha_flag === true,
    homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
    normalizedBodyMissing: !snapshot?.normalized_body_hash,
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
  const {
    changeSummaries,
    changeSummariesError,
    count,
    diagnosticEvents,
    domainCompletedScans,
    domains,
    latestDomainScans,
    resolvedSnapshots,
    runtimeArtifacts,
    scanRows,
    signalCountMap,
    summaryScanIds
  } = await loadOrganizationScanPageData(organizationId, input);
  const [legacyScoreAssessmentMap, candidateScoreAssessmentMap] = await Promise.all([
    loadLatestVersionedScoreAssessments({
      scanIds: scanRows.map((scan) => scan.id),
      scoreKind: "gdpr_eprivacy_evidence"
    }),
    loadLatestVersionedScoreAssessments({
      scanIds: scanRows.map((scan) => scan.id),
      scoreKind: "gdpr_eprivacy_posture"
    })
  ]);

  const domainMap = new Map(domains.map((domain) => [domain.id, domain]));
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
  const runtimeArtifactMap = new Map(
    ((runtimeArtifacts ?? []) as RuntimeArtifactRow[]).map((artifact) => [
      artifact.scan_id,
      withHybridRuntimeArtifactFallbacks(artifact as Record<string, unknown>) as RuntimeArtifactRow
    ])
  );
  const diagnosticEventMap = new Map<string, ScanDiagnosticEventRow[]>();
  for (const diagnosticEvent of diagnosticEvents) {
    const existing = diagnosticEventMap.get(diagnosticEvent.scan_id) ?? [];
    existing.push(diagnosticEvent);
    diagnosticEventMap.set(diagnosticEvent.scan_id, existing);
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
    const displayDomainId = scan.display_domain_id ?? scan.domain_id;
    const domain = displayDomainId ? domainMap.get(displayDomainId) ?? null : null;
    const latestDomainScan =
      domain?.latest_scan_id ? latestDomainScanMap.get(domain.latest_scan_id) ?? null : null;
    const snapshot =
      snapshotMap.get(scan.id) ??
      (resolvedSnapshots.find((snapshotRow) => snapshotRow.scan_id === scan.id) ?? null);
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
    const displayCreatedAt = deriveDisplayCreatedAt({
      completedAt: scan.completed_at,
      createdAt: scan.created_at,
      startedAt: scan.started_at
    });
    const scanFromDisplay = getScanFromDisplay(scan.scan_config_json);
    const scoreSelection = selectConfiguredCustomerGdprEprivacyScore({
      candidateAssessment: candidateScoreAssessmentMap.get(scan.id) ?? null,
      legacyAssessment: legacyScoreAssessmentMap.get(scan.id) ?? null
    });
    const scoreAssessment = scoreSelection.assessment;
    const displayedScore = scoreAssessment
      ? scoreAssessment.scoreValue
      : snapshot?.certscore_overall ?? null;
    return {
        id: scan.id,
        domainActiveScanExists: latestDomainScan?.status === "queued" || latestDomainScan?.status === "running",
        domainHostname: domain?.hostname ?? scan.display_hostname ?? null,
        domainId: displayDomainId,
        domainLastScannedAt:
          (domain?.last_scanned_at ?? scan.display_last_scanned_at ?? (displayDomainId ? domainLastCompletedAtMap.get(displayDomainId) : null)) ??
          null,
        certscoreOverall: displayedScore,
        scoreCoverageConfidence: scoreAssessment?.coverageConfidence ?? null,
        scoreCoverageRatio: scoreAssessment?.coverageRatio ?? null,
        scoreLabel: scoreAssessment
          ? scoreSelection.label
          : displayedScore !== null
            ? "Legacy scan score"
            : null,
        scoreScoredAt: scoreAssessment?.scoredAt ?? null,
        scoreSource: scoreAssessment?.scoreSource ?? (displayedScore !== null ? "legacy.scan-snapshot" : null),
        scoreVersion: scoreAssessment?.scoreVersion ?? null,
        regulatoryScore: snapshot?.regulatory_exposure_score ?? null,
        privacyScore: snapshot?.privacy_score ?? null,
        consentScore: snapshot?.consent_score ?? null,
        accessibilityScore: snapshot?.accessibility_score ?? null,
        totalSignals,
        findingCount: snapshot?.report_finding_count ?? 0,
        topFindingCount: snapshot?.top_finding_count ?? null,
        privacyPolicyPresent: snapshot?.privacy_policy_present ?? null,
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
        createdAt: displayCreatedAt,
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
        recoverableFindingClasses: normalizedAccessPosture.recoverableFindingClasses,
        freshRescanRequested: getFreshRescanRequested(scan.request_context),
        scanFromLabel: scanFromDisplay.label,
        scanFromValue: scanFromDisplay.value
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
  const pageSize = Math.max(1, input?.pageSize ?? 20);
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
