import {
  buildAgencyMappings,
  getScannerExecutionSummary,
  PREVIEW_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  type AgencyMapping,
  type PreviewEarlyResultItem,
  type PreviewBuildPhaseSummary,
  type PreviewIssueCounts,
  type PreviewScanPayload,
  type PreviewScanEvent,
  type PreviewScanStatusResponse,
  type ScanSnapshot,
  type ScanStatus,
  type ScanType
} from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import { buildEventActivityFeed } from "../../lib/scans/activity-feed";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { deriveDisplayCreatedAt } from "../scans/display-state";
import {
  createPreviewScanRecord,
  findOrCreateAnonymousPreviewDomain,
  getAllPreviewScanEvents,
  getLatestPreviewScanEvent,
  getPreviewRuntimeArtifacts,
  getPreviewScanRecord,
  getRecentPreviewScanEvents,
  insertPreviewScanEvent as insertScanEvent,
  loadPreviewScanSnapshotRecord,
  setPreviewDomainLatestScan as setDomainLatestScan,
  type PreviewDomainRow as DomainRow,
  type PreviewRuntimeArtifactsRow as RuntimeArtifactsRow,
  type PreviewScanEventRow as ScanEventRow,
  type PreviewScanRow as ScanRow,
  type PreviewSnapshotRow as SnapshotRow,
  updatePreviewScan
} from "./db";
export {
  createPreviewScanRecord,
  findOrCreateAnonymousPreviewDomain,
  getAllPreviewScanEvents,
  getLatestPreviewScanEvent,
  getPreviewRuntimeArtifacts,
  getPreviewScanRecord,
  getRecentPreviewScanEvents,
  updatePreviewScan
} from "./db";

export type { ScanRow };

type ScanConfig = {
  hostname?: string;
  normalizedUrl?: string;
  post403Policy?: {
    maxHomepageRetriesAfter403?: number;
    maxPassiveVerificationFetchesAfter403?: number;
    passiveOnlyAfter403?: boolean;
    stopOnHomepage403?: boolean;
    verifiedSurfaceTargetsAfter403?: string[];
  };
  previewPayload?: PreviewScanPayload;
  processor?: string;
};

const PREVIEW_STALE_RUNNING_MS = 60_000;

function isPresentationOnlyEvent(eventType: string) {
  return eventType.startsWith("presentation.");
}

function getRecordValue(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  return (record as Record<string, unknown>)[key];
}

function getStringValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getNumberValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getBooleanValue(record: unknown, ...keys: string[]) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function titleCaseWords(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildLiveEarlyResults(input: {
  events: ScanEventRow[];
  executionSummary: ReturnType<typeof getScannerExecutionSummary>;
}): PreviewEarlyResultItem[] {
  const stageMetadata = new Map(
    (input.executionSummary?.stages ?? [])
      .filter((stage) => stage.metadata && typeof stage.metadata === "object" && !Array.isArray(stage.metadata))
      .map((stage) => [stage.stage, stage.metadata as Record<string, unknown>])
  );
  const baselineMetadata = stageMetadata.get("baseline_lookup") ?? null;
  const crawlMetadata = stageMetadata.get("crawl_discovery") ?? null;
  const runtimeMetadata = stageMetadata.get("runtime_snapshot_capture") ?? null;
  const eventMetadata = [...input.events]
    .reverse()
    .map((event) => event.metadata_json)
    .filter((metadata): metadata is Record<string, unknown> => Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata)));
  const sourceRecords = [runtimeMetadata, crawlMetadata, baselineMetadata, ...eventMetadata];
  const items: PreviewEarlyResultItem[] = [];
  const push = (label: string, value: string | null) => {
    if (!value || items.some((item) => item.label === label)) {
      return;
    }
    items.push({ label, value });
  };

  push("Host", getStringValue(baselineMetadata, "resolvedHostname", "hostname", "canonicalHost"));
  push("TLS issuer", getStringValue(baselineMetadata, "tlsIssuer", "certificateIssuer"));

  for (const record of sourceRecords) {
    push("Tier", getStringValue(record, "tier"));
    const homepageStatus = getNumberValue(record, "homepageFetchHttpStatus", "httpStatus", "statusCode");
    if (homepageStatus !== null) {
      push("Homepage", `HTTP ${homepageStatus}`);
    }
    push("Final URL", getStringValue(record, "finalUrl", "url"));
    push("Server", getStringValue(record, "serverHeader", "server"));
    push("Block vendor", getStringValue(record, "blockVendorGuess"));
    const accessPosture = getStringValue(record, "accessPostureClass");
    if (accessPosture) {
      push("Access posture", titleCaseWords(accessPosture));
    }
    const verifiedSurfaces = getNumberValue(record, "verifiedPublicSurfacesCount");
    if (verifiedSurfaces !== null) {
      push("Verified surfaces", String(verifiedSurfaces));
    }
    push("CMP", getStringValue(record, "cmpVendorName"));
    const consentSurface = getBooleanValue(record, "cookieBannerPresent", "consentSurfaceObserved");
    if (consentSurface === true) {
      push("Consent surface", "Observed");
    }
    const thirdPartyRequests = getNumberValue(record, "thirdPartyRequestCount");
    if (thirdPartyRequests !== null) {
      push("3P requests", String(thirdPartyRequests));
    }
    const initialCookies = getNumberValue(record, "initialCookieCount", "cookieCountTotal");
    if (initialCookies !== null) {
      push("Initial cookies", String(initialCookies));
    }
    const blocked = getBooleanValue(record, "blockedFlag");
    if (blocked === true) {
      push("Front door", "Blocked");
    }
    const challenge = getBooleanValue(record, "challengeSuspected");
    if (challenge === true) {
      push("Challenge", "Suspected");
    }
  }

  return items.slice(0, 12);
}

function getStatusMessage(status: ScanStatus) {
  if (status === "queued") {
    return "Queued.";
  }

  if (status === "running") {
    return "Scanning a lightweight site surface and assembling preview findings.";
  }

  if (status === "completed") {
    return "Preview scan complete.";
  }

  return "The preview scan could not be completed.";
}

function toIsoTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "");
}

function getLatestEventCreatedAt(events: ScanEventRow[], eventTypes: string[]) {
  const matches = events
    .filter((event) => eventTypes.includes(event.event_type))
    .map((event) => toIsoTimestamp(event.created_at))
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return matches.at(-1) ?? null;
}

function getEarliestEventCreatedAt(events: ScanEventRow[], eventTypes: string[]) {
  const matches = events
    .filter((event) => eventTypes.includes(event.event_type))
    .map((event) => toIsoTimestamp(event.created_at))
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return matches[0] ?? null;
}

function getComparableTimestampMs(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const now = Date.now();
  const futureDeltaMs = parsed - now;
  if (futureDeltaMs <= 60 * 60 * 1000) {
    return parsed;
  }

  const hourMs = 60 * 60 * 1000;
  const roundedHourDelta = Math.round(futureDeltaMs / hourMs);
  return parsed - roundedHourDelta * hourMs;
}

function derivePreviewDisplayState(scan: ScanRow, events: ScanEventRow[]) {
  const lifecycleEvents = events.filter((event) => !isPresentationOnlyEvent(event.event_type));

  if (lifecycleEvents.length === 0) {
    return {
      completedAt: scan.completed_at,
      startedAt: scan.started_at,
      status: scan.status
    };
  }

  const completedAt =
    scan.completed_at ??
    getLatestEventCreatedAt(lifecycleEvents, [PREVIEW_SCAN_EVENT_TYPES.completed]);
  const failedAt =
    scan.status === "failed"
      ? scan.updated_at
      : getLatestEventCreatedAt(lifecycleEvents, [PREVIEW_SCAN_EVENT_TYPES.failed]);
  const latestEventAt = getLatestEventCreatedAt(
    lifecycleEvents,
    [...new Set(lifecycleEvents.map((event) => event.event_type))]
  );
  const startedAt =
    scan.started_at ??
    getEarliestEventCreatedAt(lifecycleEvents, [PREVIEW_SCAN_EVENT_TYPES.started]);
  const staleRunning =
    !completedAt &&
    !failedAt &&
    Boolean(startedAt) &&
    (() => {
      const comparableLatestEventAtMs = getComparableTimestampMs(latestEventAt);
      return comparableLatestEventAtMs !== null && Date.now() - comparableLatestEventAtMs > PREVIEW_STALE_RUNNING_MS;
    })();

  const status =
    failedAt || staleRunning ? "failed" :
    completedAt ? "completed" :
    startedAt ? "running" :
    scan.status;

  return {
    completedAt,
    startedAt,
    status
  };
}

function formatCount(value: unknown, singular: string, plural = `${singular}s`) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value} ${value === 1 ? singular : plural}`;
}

function getPersistenceFinalizationStage(executionSummary: ReturnType<typeof getScannerExecutionSummary>) {
  return executionSummary?.stages.find((stage) => stage.stage === "persistence_diff_finalization") ?? null;
}

export function hasPersistedSignalsMismatch(input: {
  executionSummary: ReturnType<typeof getScannerExecutionSummary>;
  latestEvent: ScanEventRow | null;
}) {
  const persistenceStage = getPersistenceFinalizationStage(input.executionSummary);
  const persistenceMessage = persistenceStage?.message ?? "";

  return (
    input.latestEvent?.event_type === SCAN_EVENT_TYPES.signalsPersisted &&
    persistenceStage?.outcome === "degraded" &&
    /persist scan signals/i.test(persistenceMessage)
  );
}

function buildActivityTailParts(
  scan: ScanRow,
  latestEvent: ScanEventRow | null,
  executionSummary: ReturnType<typeof getScannerExecutionSummary> = null
) {
  const metadata = latestEvent?.metadata_json ?? null;
  const fragments: string[] = [];
  const hasPersistedSignalsDegradation = hasPersistedSignalsMismatch({
    executionSummary,
    latestEvent
  });

  if (scan.status === "queued") {
    fragments.push("mode=lightweight-preview");
    const requestedPages = formatCount(scan.pages_requested, "page");
    if (requestedPages) {
      fragments.push(`target=${requestedPages}`);
    }
  }

  if (latestEvent?.event_type === "crawl.started") {
    const requestedPages = formatCount(metadata?.requestedPageCount, "page");
    if (requestedPages) {
      fragments.push(`requested=${requestedPages}`);
    }
    fragments.push("steps=robots+homepage+discovery");
  }

  if (latestEvent?.event_type === "crawl.page_discovery_completed") {
    if (typeof metadata?.scanPlanProfile === "string" && metadata.scanPlanProfile.length > 0) {
      fragments.push(`profile=${metadata.scanPlanProfile}`);
    }
    const pagesScanned = formatCount(metadata?.pagesScanned, "page");
    if (pagesScanned) {
      fragments.push(`surface=${pagesScanned}`);
    }
    const trackers = formatCount(metadata?.trackerCountTotal, "tracker");
    if (trackers) {
      fragments.push(`trackers=${trackers}`);
    }
    if (typeof metadata?.partialScan === "boolean") {
      fragments.push(metadata.partialScan ? "coverage=partial" : "coverage=full");
    }
  }

  if (latestEvent?.event_type === "signals.persisted") {
    if (hasPersistedSignalsDegradation) {
      fragments.push("signals=not-saved");
    } else {
      const totalSignals = formatCount(metadata?.totalSignals, "signal");
      if (totalSignals) {
        fragments.push(`saved=${totalSignals}`);
      }
    }
    const pagesPersisted = formatCount(metadata?.pagesPersisted, "page");
    if (pagesPersisted) {
      fragments.push(`pages=${pagesPersisted}`);
    }
    const vendorRows = formatCount(metadata?.trackerRowsPersisted, "vendor row");
    if (vendorRows) {
      fragments.push(`vendors=${vendorRows}`);
    }
  }

  if (latestEvent?.event_type === "signals.changes_computed") {
    if (typeof metadata?.isBaseline === "boolean") {
      fragments.push(metadata.isBaseline ? "diff=baseline" : "diff=compared");
    }
    const added = formatCount(metadata?.addedCount, "add");
    const changed = formatCount(metadata?.changedCount, "change");
    const removed = formatCount(metadata?.removedCount, "removal");
    if (added) {
      fragments.push(`added=${added}`);
    }
    if (changed) {
      fragments.push(`changed=${changed}`);
    }
    if (removed) {
      fragments.push(`removed=${removed}`);
    }
  }

  if (scan.status === "running" && fragments.length === 0) {
    const pagesScanned = formatCount(scan.pages_scanned, "page");
    if (pagesScanned) {
      fragments.push(`progress=${pagesScanned}`);
    }
    fragments.push("live-checks=active");
  }

  return fragments;
}

function buildActivityLine(scan: ScanRow, latestEvent: ScanEventRow | null) {
  return buildActivityLineWithExecutionSummary(scan, latestEvent, null);
}

export function buildActivityLineWithExecutionSummary(
  scan: ScanRow,
  latestEvent: ScanEventRow | null,
  executionSummary: ReturnType<typeof getScannerExecutionSummary>
) {
  if (scan.status === "failed") {
    return scan.error_message ? `Preview failed: ${scan.error_message}` : "The preview scan did not complete.";
  }

  if (
    hasPersistedSignalsMismatch({
      executionSummary,
      latestEvent
    })
  ) {
    return "Stage 7 completed with degraded signal persistence; snapshot, page metadata, and vendor rows were saved, but canonical scan signals were not fully persisted.";
  }

  if (scan.status === "queued") {
    return "Waiting for a worker to pick up this lightweight live preview. · mode=lightweight-preview · target=1 page";
  }

  if (latestEvent?.message) {
    return latestEvent.message;
  }

  if (scan.status === "running") {
    return "Scanning the site surface and collecting observable accessibility, privacy, and disclosure signals. · live-checks=active";
  }

  if (scan.status === "completed") {
    return "Preview results were assembled from the latest saved snapshot.";
  }
  return null;
}

function buildActivityDetails(
  scan: ScanRow,
  latestEvent: ScanEventRow | null,
  executionSummary: ReturnType<typeof getScannerExecutionSummary> = null
) {
  const details = buildActivityTailParts(scan, latestEvent, executionSummary);
  const lines: string[] = [];

  if (latestEvent && scan.status !== "queued") {
    lines.push(`evt=${latestEvent.event_type}`);
  }

  if (details.length > 0) {
    for (let index = 0; index < details.length; index += 3) {
      lines.push(details.slice(index, index + 3).join(" · "));
    }
  } else if (scan.status === "queued") {
    lines.push("mode=lightweight-preview · target=1 page");
  } else if (scan.status === "running") {
    lines.push("live-checks=active · evidence=collecting");
  } else if (scan.status === "completed") {
    lines.push("snapshot=ready · preview=derived");
  }

  if (scan.started_at) {
    lines.push(`ts=${scan.started_at}`);
  }

  return lines;
}

function buildActivityFeed(scan: ScanRow, events: ScanEventRow[]) {
  const stepLabel = scan.status === "queued" ? "step[1/3]" : scan.status === "running" ? "step[2/3]" : "step[3/3]";

  return buildEventActivityFeed({
    events: events.map((event) => ({
      eventType: event.event_type,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    fallbackLines:
      scan.status === "queued"
        ? ["step[1/3] event> Preview scan queued.", "data> evt=preview_scan.queued · mode=lightweight-preview"]
        : ["step[2/3] event> Preview activity feed is initializing.", "data> evt=preview.feed.pending"],
    latestLabel: stepLabel,
    maxEvents: 16
  });
}

function buildActivityRef(scanId: string, latestEvent: ScanEventRow | null) {
  if (!latestEvent) {
    return null;
  }

  const createdAt = toIsoTimestamp(latestEvent.created_at);

  const digest = createHash("sha256")
    .update(scanId)
    .update(latestEvent.event_type)
    .update(createdAt)
    .update(latestEvent.message)
    .digest("hex");

  return `${digest.slice(0, 4)}...${digest.slice(-4)}`;
}

function getPreviewPayload(scan: ScanRow): PreviewScanPayload | null {
  const config = scan.scan_config_json as ScanConfig;
  return config.previewPayload ?? null;
}

export async function getPreviewScanSnapshot(scanId: string): Promise<SnapshotRow | null> {
  const data = await loadPreviewScanSnapshotRecord(scanId);
  if (!data) {
    return null;
  }

  const row = data as unknown as Record<string, unknown>;

  return {
    totalSignals: Number(row.total_signals ?? 0),
    pagesScanned: Number(row.pages_scanned ?? 0),
    authWallDetected: typeof row.auth_wall_detected === "boolean" ? (row.auth_wall_detected as boolean) : null,
    authWallSuspected: typeof row.auth_wall_suspected === "boolean" ? (row.auth_wall_suspected as boolean) : null,
    blockPageClassification:
      typeof row.block_page_classification === "string" ? (row.block_page_classification as ScanSnapshot["blockPageClassification"]) : null,
    blockVendorGuess: typeof row.block_vendor_guess === "string" ? (row.block_vendor_guess as ScanSnapshot["blockVendorGuess"]) : null,
    blockedFlag: typeof row.blocked_flag === "boolean" ? (row.blocked_flag as boolean) : null,
    captchaFlag: typeof row.captcha_flag === "boolean" ? (row.captcha_flag as boolean) : null,
    challengeSuspected: typeof row.challenge_suspected === "boolean" ? (row.challenge_suspected as boolean) : null,
    coverageLevel: typeof row.coverage_level === "string" ? (row.coverage_level as string) : null,
    fingerprintBlockSuspected:
      typeof row.fingerprint_block_suspected === "boolean" ? (row.fingerprint_block_suspected as boolean) : null,
    homepageFetchStatus: typeof row.homepage_fetch_status === "string" ? (row.homepage_fetch_status as ScanSnapshot["homepageFetchStatus"]) : null,
    homepageFetchHttpStatus:
      typeof row.homepage_fetch_http_status === "number" ? (row.homepage_fetch_http_status as number) : null,
    finalUrl: typeof row.final_url === "string" ? (row.final_url as string) : null,
    geoBlockSuspected: typeof row.geo_block_suspected === "boolean" ? (row.geo_block_suspected as boolean) : null,
    registeredDomain: typeof row.registered_domain === "string" ? (row.registered_domain as string) : null,
    passiveVerificationAttemptCount:
      typeof row.passive_verification_attempt_count === "number" ? (row.passive_verification_attempt_count as number) : null,
    passiveVerificationAttempted:
      typeof row.passive_verification_attempted === "boolean" ? (row.passive_verification_attempted as boolean) : null,
    redirectCount: Number(row.redirect_count ?? 0),
    partialScan: typeof row.partial_scan === "boolean" ? (row.partial_scan as boolean) : false,
    rateLimitSuspected: typeof row.rate_limit_suspected === "boolean" ? (row.rate_limit_suspected as boolean) : null,
    robotsAllowed: typeof row.robots_allowed === "boolean" ? (row.robots_allowed as boolean) : null,
    robotsFetchHttpStatus: typeof row.robots_fetch_http_status === "number" ? (row.robots_fetch_http_status as number) : null,
    robotsFetchStatus: typeof row.robots_fetch_status === "string" ? (row.robots_fetch_status as ScanSnapshot["robotsFetchStatus"]) : null,
    certscoreOverall: Number(row.certscore_overall ?? 0),
    privacyScore: Number(row.privacy_score ?? 0),
    accessibilityScore: Number(row.accessibility_score ?? 0),
    cmpVendorName: typeof row.cmp_vendor_name === "string" ? (row.cmp_vendor_name as string) : null,
    consentInteractionModel:
      typeof row.consent_interaction_model === "string" ? (row.consent_interaction_model as ScanSnapshot["consentInteractionModel"]) : null,
    privacyPolicyPresent: Boolean(row.privacy_policy_present),
    termsOfServicePresent: Boolean(row.terms_of_service_present),
    contactPagePresent: Boolean(row.contact_page_present),
    privacyContactMethodPresent: Boolean(row.privacy_contact_method_present),
    privacyEmailSpecificPresent: Boolean(row.privacy_email_specific_present),
    cookieBannerPresent: Boolean(row.cookie_banner_present),
    rejectAllPresent: Boolean(row.reject_all_present),
    granularPreferencesPresent: Boolean(row.granular_preferences_present),
    trackingBeforeConsentDetected:
      typeof row.tracking_before_consent_detected === "boolean" ? (row.tracking_before_consent_detected as boolean) : null,
    preconsentTrackingDetected: Boolean(row.preconsent_tracking_detected),
    thirdPartyCookieSetBeforeConsent:
      typeof row.third_party_cookie_set_before_consent === "boolean"
        ? (row.third_party_cookie_set_before_consent as boolean)
        : null,
    policyBehaviorConflictDetected: Boolean(row.policy_behavior_conflict_detected),
    sessionReplayWithoutDisclosureDetected: Boolean(row.session_replay_without_disclosure_detected),
    sessionReplayTrackerCount: Number(row.session_replay_tracker_count ?? 0),
    advertisingTrackerCount: Number(row.advertising_tracker_count ?? 0),
    affiliateDisclosurePresent: Boolean(row.affiliate_disclosure_present),
    advertisingDisclosurePresent: Boolean(row.advertising_disclosure_present),
    testimonialOrReviewDisclosurePresent: Boolean(row.testimonial_or_review_disclosure_present),
    consumerProtectionScore: Number(row.consumer_protection_score ?? 0),
    californiaExposureLikely: Boolean(row.california_exposure_likely),
    cancellationPolicyPresent: Boolean(row.cancellation_policy_present),
    consentMaturityScore: Number(row.consent_maturity_score ?? 0),
    crossBorderTransferMechanismDetected: Boolean(row.cross_border_transfer_mechanism_detected),
    dataAccessRequestPresent: Boolean(row.data_access_request_present),
    dataDeletionRequestPresent: Boolean(row.data_deletion_request_present),
    doNotSellLinkPresent: Boolean(row.do_not_sell_link_present),
    dsarRequestMechanismPresent: Boolean(row.dsar_request_mechanism_present),
    ecommerceSiteLikely: Boolean(row.ecommerce_site_likely),
    freeTrialDetected: Boolean(row.free_trial_detected),
    mentionsCcpaOrCpra: Boolean(row.mentions_ccpa_or_cpra),
    mentionsCrossBorderTransfer: Boolean(row.mentions_cross_border_transfer),
    mentionsDataRetention: Boolean(row.mentions_data_retention),
    mentionsDataSaleOrSharing: Boolean(row.mentions_data_sale_or_sharing),
    mentionsGdpr: Boolean(row.mentions_gdpr),
    mentionsSensitiveData: Boolean(row.mentions_sensitive_data),
    mentionsUnder13: Boolean(row.mentions_under_13),
    mentionsUnder16: Boolean(row.mentions_under_16),
    privacyRequestFormPresent: Boolean(row.privacy_request_form_present),
    subprocessorListPresent: Boolean(row.subprocessor_list_present),
    subscriptionOfferDetected: Boolean(row.subscription_offer_detected),
    trackerRegulatoryRiskScore: Number(row.tracker_regulatory_risk_score ?? 0),
    accessibilityStatementPresent: Boolean(row.accessibility_statement_present),
    accessibilityClaimMismatchDetected: Boolean(row.accessibility_claim_mismatch_detected),
    accessibilityLitigationRiskScore: Number(row.accessibility_litigation_risk_score ?? 0),
    adaDemandLetterProbability: Number(row.ada_demand_letter_probability ?? 0),
    wcagErrorCountTotal: Number(row.wcag_error_count_total ?? 0),
    wcagMissingAltCount: Number(row.wcag_missing_alt_count ?? 0),
    wcagFormLabelErrorCount: Number(row.wcag_form_label_error_count ?? 0),
    wcagKeyboardNavigationIssueCount: Number(row.wcag_keyboard_navigation_issue_count ?? 0)
  };
}

function serializePreviewEvents(events: ScanEventRow[]): PreviewScanEvent[] {
  return events.map((event) => ({
    createdAt: event.created_at,
    eventType: event.event_type,
    message: event.message,
    metadataJson: event.metadata_json
  }));
}

function serializeBuildPhaseSummaries(runtimeArtifacts: RuntimeArtifactsRow): PreviewBuildPhaseSummary[] {
  const rows = runtimeArtifacts?.build_phase_summaries;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    attempts: typeof row.attempts === "number" ? row.attempts : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    error: typeof row.error === "string" ? row.error : null,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    phase: typeof row.phase === "string" ? row.phase : "unknown",
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null
  }));
}

export function serializePreviewScan(input: {
  agencyMappings?: AgencyMapping[];
  domain: DomainRow | null;
  events?: ScanEventRow[];
  latestEvent?: ScanEventRow | null;
  recentEvents?: ScanEventRow[];
  regulatoryRisk?: PreviewScanStatusResponse["regulatoryRisk"];
  runtimeArtifacts?: RuntimeArtifactsRow;
  scan: ScanRow;
}): PreviewScanStatusResponse {
  const payload = getPreviewPayload(input.scan);
  const events = input.events ?? input.recentEvents ?? [];
  const executionSummary = getScannerExecutionSummary(input.scan.scan_config_json);
  const displayState = derivePreviewDisplayState(input.scan, events);
  const displayScan = {
    ...input.scan,
    completed_at: displayState.completedAt,
    started_at: displayState.startedAt,
    status: displayState.status
  };
  const displayCreatedAt = deriveDisplayCreatedAt({
    completedAt: displayState.completedAt,
    createdAt: input.scan.created_at,
    startedAt: displayState.startedAt
  });

  return {
    scanId: input.scan.id,
    domainId: input.scan.domain_id,
    hostname: input.domain?.hostname ?? ((input.scan.scan_config_json as ScanConfig).hostname ?? "Unknown"),
    normalizedUrl:
      input.domain?.normalized_url ?? ((input.scan.scan_config_json as ScanConfig).normalizedUrl ?? ""),
    status: displayState.status,
    scanType: input.scan.scan_type,
    createdAt: displayCreatedAt,
    updatedAt: input.scan.updated_at,
    startedAt: displayState.startedAt,
    completedAt: displayState.completedAt,
    pagesRequested: input.scan.pages_requested,
    pagesScanned: input.scan.pages_scanned,
    errorMessage: input.scan.error_message,
    statusMessage: getStatusMessage(displayState.status),
    activityLine: buildActivityLineWithExecutionSummary(displayScan, input.latestEvent ?? null, executionSummary),
    activityDetails: buildActivityDetails(displayScan, input.latestEvent ?? null, executionSummary),
    activityFeed: buildActivityFeed(displayScan, input.recentEvents ?? []),
    activityRef: buildActivityRef(input.scan.id, input.latestEvent ?? null),
    events: serializePreviewEvents(events),
    executionSummary,
    buildPhaseSummaries: serializeBuildPhaseSummaries(input.runtimeArtifacts ?? null),
    liveEarlyResults: buildLiveEarlyResults({
      events,
      executionSummary
    }),
    agencyMappings: input.agencyMappings ?? [],
    regulatoryRisk: input.regulatoryRisk ?? null,
    previewPayload: payload
  };
}
