import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";
import { derivePolicyCoverageContext, getWeakPolicyEvidenceLimitation } from "./policy-coverage-context";
import { classifyConsentControlLabel } from "@certscore/contracts";
import type { NormalizedConcern } from "./normalized-concerns";

export type GdprEprivacyCoverageOutcomeStatus =
  | "Gap observed"
  | "Observed"
  | "Not confirmed"
  | "Not observed"
  | "Not testable"
  | "Review signal"
  | "Insufficient evidence";

export type GdprEprivacyCoverageSourceSignalGap = {
  actual: unknown;
  expected: unknown;
  field: string;
  source: "scanner" | "CertScore";
  whyNeeded: string;
};

export type GdprEprivacyCoverageCriticalEvidence = {
  missingOrIncompleteSourceSignals: GdprEprivacyCoverageSourceSignalGap[];
  pipeline: {
    concernPolicyKey: string;
    projectionStage: "coverage_policy" | "unified_finding" | "executive_projection" | "coverage_fallback";
    wc01NormalizedConcernKey: string;
    ws01EvidenceRole: string;
  };
  projectedFindings: Array<{
    id: string;
    label: string;
    severity?: string;
  }>;
  retainedEvidence: Record<string, unknown>;
  statusBasis: string;
};

export type GdprEprivacyCoverageOutcome = {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  limitation: string;
  rowId: string;
  status: GdprEprivacyCoverageOutcomeStatus;
};

export type GdprEprivacyCoveragePolicyEvent = {
  createdAt?: string;
  eventType: string;
  metadataJson: unknown;
};

export type GdprEprivacyCoveragePolicyInput = {
  coverageLimited: boolean;
  events?: GdprEprivacyCoveragePolicyEvent[];
  normalizedConcerns?: NormalizedConcern[];
  policyEnrichmentCount?: number | null;
  runtimeArtifacts?: Record<string, unknown> | null;
  scanCompleted: boolean;
  snapshot?: Record<string, unknown> | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === true || value === false) {
      return value;
    }
  }

  return null;
}

function getBooleanAnyTrue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  let observedFalse = false;

  for (const key of keys) {
    const value = record?.[key];
    if (value === true) {
      return true;
    }
    if (value === false) {
      observedFalse = true;
    }
  }

  return observedFalse ? false : null;
}

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

const MAX_RUNTIME_ELAPSED_MS = 10 * 60 * 1000;
const POST_CHOICE_FLOW_DEFERRED_FROM_PRODUCTION_CORE: boolean = true;

function normalizeRuntimeElapsedMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >= 0 && value <= MAX_RUNTIME_ELAPSED_MS ? value : null;
}

function getRuntimeElapsedMs(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeRuntimeElapsedMs(getNumber(record, [key]));
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];

  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        values.push(entry.trim());
      }
    }
  }

  return [...new Set(values)];
}

function getRawValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record && Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }

  return null;
}

function getObject(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getRecord(record?.[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getObjectArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(getRecord(entry)));
    }
  }

  return [];
}

function compactArray<T>(values: T[], limit = 5) {
  return values.filter((value) => value !== null && value !== undefined).slice(0, limit);
}

function formatInlineList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0 || key.endsWith("EvidenceCauses");
      }
      return true;
    })
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))];
}

function sourceGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "scanner" | "CertScore" = "scanner"
): GdprEprivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function getEventMetadata(events: GdprEprivacyCoveragePolicyEvent[] | undefined, phase: string) {
  const matches = (events ?? [])
    .map((event) => getRecord(event.metadataJson))
    .filter((metadata): metadata is Record<string, unknown> => Boolean(metadata))
    .filter((metadata) => getString(metadata, ["phase"]) === phase);

  return matches.at(-1) ?? null;
}

function getTransportSecuritySummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, ["transportSecuritySummary", "transport_security_summary"]);
}

function transportEvidenceRef(summary: Record<string, unknown> | null | undefined) {
  return getStringArray(summary, ["evidenceRefs", "evidence_refs"]).slice(0, 6);
}

function transportEvidenceMissingGap(rowId: string) {
  return sourceGap(
    `runtimeArtifacts.transportSecuritySummary.${rowId}`,
    "typed transport security observation",
    "missing",
    "Required to evaluate this transport-security checklist row from retained scanner evidence rather than URL display inference."
  );
}

function transportOutcomeFromBoolean(input: {
  falseStatus: GdprEprivacyCoverageOutcomeStatus;
  falseText: string;
  nullStatus?: GdprEprivacyCoverageOutcomeStatus;
  nullText: string;
  retainedEvidence: Record<string, unknown>;
  rowId: string;
  trueStatus: GdprEprivacyCoverageOutcomeStatus;
  trueText: string;
  value: boolean | null;
}) {
  const evidenceRefs = transportEvidenceRef(input.retainedEvidence);
  if (input.value === true) {
    return makeOutcome(input.rowId, input.trueStatus, input.trueText, evidenceRefs, {
      retainedEvidence: input.retainedEvidence,
    });
  }
  if (input.value === false) {
    return makeOutcome(input.rowId, input.falseStatus, input.falseText, evidenceRefs, {
      retainedEvidence: input.retainedEvidence,
    });
  }
  return makeOutcome(input.rowId, input.nullStatus ?? "Not testable", input.nullText, evidenceRefs, {
    missingOrIncompleteSourceSignals: [transportEvidenceMissingGap(input.rowId)],
    retainedEvidence: input.retainedEvidence,
  });
}

function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, ["hybridRuntimeEvidence", "hybrid_runtime_evidence"]);
}

function getHybridStorageSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["storageSummary", "storage_summary"]);
}

function getHybridNetworkSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["networkSummary", "network_summary"]);
}

function getHybridConsentOutcomeSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["consentOutcomeSummary", "consent_outcome_summary"]);
}

function getHybridTimelineMarkers(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["timelineMarkers", "timeline_markers"]);
}

type RuntimePurposeRiskBucket =
  | "advertising"
  | "retargeting"
  | "marketingAnalytics"
  | "performanceRum"
  | "securityBotMitigation"
  | "cdnEdgeDelivery"
  | "functional"
  | "sessionReplay"
  | "tagManagement"
  | "unknown";

const HIGH_RISK_RUNTIME_PURPOSES = new Set<RuntimePurposeRiskBucket>([
  "advertising",
  "retargeting",
  "marketingAnalytics",
  "sessionReplay"
]);

function getRuntimePurposeRowText(row: Record<string, unknown>) {
  const category = [
    getString(row, ["category"]),
    getString(row, ["vendorCategory", "vendor_category"]),
    getString(row, ["purpose"]),
    getString(row, ["vendorPurpose", "vendor_purpose"]),
    ...getStringArray(row, ["regulatoryRelevance", "regulatory_relevance"])
  ].filter(Boolean).join(" ").toLowerCase();
  const label = [
    getString(row, ["name"]),
    getString(row, ["vendor"]),
    getString(row, ["vendorName", "vendor_name"]),
    getString(row, ["product"]),
    getString(row, ["domain", "host", "hostname"]),
    getString(row, ["requestUrl", "request_url", "representativeUrl", "representative_url", "url"])
  ].filter(Boolean).join(" ").toLowerCase();
  return { category, label };
}

function classifyRuntimePurposeRisk(row: Record<string, unknown>): RuntimePurposeRiskBucket {
  const { category, label } = getRuntimePurposeRowText(row);
  const categoryHas = (pattern: RegExp) => pattern.test(category);
  const labelHas = (pattern: RegExp) => pattern.test(label);

  if (labelHas(/security|fraud|bot|bot manager|akamai bot|perimeterx|human bot|datadome|forter|cloudflare bot|infrastructure|_abck|bm_sz|ak_bmsc/)) {
    return "securityBotMitigation";
  }
  if (labelHas(/mpulse|go-mpulse|boomerang|performance|rum|real user monitoring|new relic|datadog|sentry/)) {
    return "performanceRum";
  }
  if (labelHas(/cdn|edge|delivery|akamai edge|cloudfront|fastly/)) {
    return "cdnEdgeDelivery";
  }
  if (labelHas(/functional|strictly necessary|necessary|consent_management|cmp|customer_support/)) {
    return "functional";
  }
  if (labelHas(/google tag manager|googletagmanager|\bgtm\b/) || categoryHas(/tag[_ -]?management|tag[_ -]?manager/)) {
    return "tagManagement";
  }
  if (labelHas(/session_replay|session replay|behavioral_analytics|contentsquare|fullstory|hotjar|logrocket|clarity/) || categoryHas(/session_replay|session replay|behavioral_analytics/)) {
    return "sessionReplay";
  }
  if (
    labelHas(/retarget|remarket|identity sync|idsync|audience|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag/) ||
    categoryHas(/retarget|remarket|cross_site_tracking|identity_resolution|audience_management|audience_segmentation|audience_matching|profile_activation/)
  ) {
    return "retargeting";
  }
  if (labelHas(/advertis|adtech|targeting|marketing_pixel|social_pixel|doubleclick|google ads|meta pixel|facebook pixel|linkedin insight|tiktok|reddit pixel/) || categoryHas(/advertis|adtech|targeting|marketing_pixel|social_pixel/)) {
    return "advertising";
  }
  if (labelHas(/google analytics|adobe analytics|mixpanel|amplitude|posthog|customer_data_platform|marketing analytics/) || categoryHas(/marketing analytics|customer_data_platform/)) {
    return "marketingAnalytics";
  }
  if (categoryHas(/analytics|measurement|performance|rum|real user monitoring/)) {
    return "performanceRum";
  }
  if (categoryHas(/security|fraud|bot|infrastructure/)) {
    return "securityBotMitigation";
  }
  if (categoryHas(/cdn|edge|delivery|functional|strictly necessary|necessary|consent_management|cmp/)) {
    return "functional";
  }
  return "unknown";
}

function getRuntimePurposeVendor(row: Record<string, unknown>) {
  return getString(row, ["name"]) ??
    getString(row, ["vendor", "vendorName", "vendor_name"]) ??
    getString(row, ["product"]) ??
    getString(row, ["domain", "host", "hostname"]) ??
    getString(row, ["requestUrl", "request_url", "representativeUrl", "representative_url", "url"]);
}

function createPurposeRowFromVendorName(name: string): Record<string, unknown> {
  return { name };
}

function buildPreconsentPurposeRiskMix(rows: Record<string, unknown>[]) {
  const mix: Record<RuntimePurposeRiskBucket, string[]> = {
    advertising: [],
    retargeting: [],
    marketingAnalytics: [],
    performanceRum: [],
    securityBotMitigation: [],
    cdnEdgeDelivery: [],
    functional: [],
    sessionReplay: [],
    tagManagement: [],
    unknown: []
  };

  for (const row of rows) {
    const bucket = classifyRuntimePurposeRisk(row);
    const vendor = getRuntimePurposeVendor(row);
    mix[bucket] = uniqueStrings([...mix[bucket], vendor]).slice(0, 8);
  }

  return mix;
}

function hasHighRiskPurpose(mix: Record<RuntimePurposeRiskBucket, string[]>) {
  return Array.from(HIGH_RISK_RUNTIME_PURPOSES).some((bucket) => mix[bucket].length > 0);
}

function normalizeRuntimeObservedMs(value: number | null | undefined, navigationStartMs: number | null) {
  const elapsed = normalizeRuntimeElapsedMs(value);
  if (elapsed !== null) {
    return elapsed;
  }
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    typeof navigationStartMs === "number" &&
    Number.isFinite(navigationStartMs)
  ) {
    return normalizeRuntimeElapsedMs(value - navigationStartMs);
  }
  return null;
}

function getRuntimeObservedMs(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
  navigationStartMs: number | null
) {
  for (const key of keys) {
    const normalized = normalizeRuntimeObservedMs(getNumber(record, [key]), navigationStartMs);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function getSortedUniqueMs(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))]
    .sort((left, right) => left - right);
}

function rowHasPreconsentTimingEvidence(row: Record<string, unknown>) {
  return (
    getBoolean(row, ["beforeConsent", "before_consent", "preConsent", "pre_consent"]) === true ||
    /before[_ -]?consent|pre[_ -]?consent/i.test(getString(row, ["timingEvidence", "timing_evidence", "runtimePhase", "runtime_phase"]) ?? "")
  );
}

function getPreconsentCookieStorageTimingSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const timelineMarkers = getHybridTimelineMarkers(runtimeArtifacts);
  const storageSummary = getHybridStorageSummary(runtimeArtifacts);
  const navigationStartMs = getNumber(timelineMarkers, ["navigationStartMs", "navigation_start_ms"]);
  const beforeConsentCookieRows = [
    ...getObjectArray(hybridRuntimeEvidence, ["cookieWriteObservations", "cookie_write_observations"]),
    ...getObjectArray(hybridRuntimeEvidence, ["preconsentCookieEvidence", "preconsent_cookie_evidence"])
  ].filter(rowHasPreconsentTimingEvidence);
  const observedMs = getSortedUniqueMs([
    ...beforeConsentCookieRows.map((row) =>
      getRuntimeObservedMs(row, [
        "setAtMs",
        "set_at_ms",
        "firstObservedAtMs",
        "first_observed_at_ms",
        "firstObservedMs",
        "first_observed_ms",
        "firstSeenMs",
        "first_seen_ms",
        "tsMs",
        "ts_ms",
        "timestampMs",
        "timestamp_ms"
      ], navigationStartMs)
    ),
    getRuntimeObservedMs(timelineMarkers, ["firstCookieSeenMs", "first_cookie_seen_ms"], navigationStartMs),
    getRuntimeObservedMs(timelineMarkers, ["firstStorageWriteMs", "first_storage_write_ms"], navigationStartMs),
    getRuntimeObservedMs(storageSummary, ["firstCookieSeenMs", "first_cookie_seen_ms"], navigationStartMs),
    getRuntimeObservedMs(storageSummary, ["firstStorageWriteMs", "first_storage_write_ms"], navigationStartMs)
  ]);
  const cookiesBeforeConsentCount = getNumber(storageSummary, ["cookiesBeforeConsentCount", "cookies_before_consent_count"]) ?? 0;
  const initialInventoryObserved = observedMs.length === 0 && (beforeConsentCookieRows.length > 0 || cookiesBeforeConsentCount > 0);

  return compactRecord({
    firstPreconsentCookieOrStorageObservedMs: observedMs[0] ?? null,
    firstPreconsentCookieOrStorageObservationBasis: initialInventoryObserved
      ? "initial_preconsent_cookie_inventory"
      : observedMs.length > 0
        ? "runtime_cookie_or_storage_timing"
        : null,
    preconsentCookieOrStorageExactTimingRetained: observedMs.length > 0,
    preconsentCookieOrStorageInitialInventoryObserved: initialInventoryObserved,
    preconsentCookieOrStorageObservedMs: compactArray(observedMs, 6),
    preconsentCookieOrStorageTimedObservationCount: observedMs.length,
    preconsentCookieOrStorageUntimedObservationCount: Math.max(beforeConsentCookieRows.length - observedMs.length, 0)
  });
}

function getPreconsentThirdPartyTrackingTimingSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const timelineMarkers = getHybridTimelineMarkers(runtimeArtifacts);
  const networkSummary = getHybridNetworkSummary(runtimeArtifacts);
  const navigationStartMs = getNumber(timelineMarkers, ["navigationStartMs", "navigation_start_ms"]);
  const state0Rows = getObjectArray(hybridRuntimeEvidence, [
    "preconsentState0RequestObservations",
    "preconsent_state0_request_observations"
  ]);
  const classifiedRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const requestRows = getObjectArray(hybridRuntimeEvidence, ["requestObservations", "request_observations"]);
  const preconsentThirdPartyCount =
    getNumber(networkSummary, ["preConsentThirdPartyRequestCount", "pre_consent_third_party_request_count"]) ?? 0;
  const rows = [
    ...state0Rows,
    ...classifiedRows.filter(rowHasPreconsentTimingEvidence),
    ...requestRows.filter((row) =>
      getBoolean(row, ["thirdParty", "third_party"]) === true &&
      (rowHasPreconsentTimingEvidence(row) || preconsentThirdPartyCount > 0)
    )
  ];
  const observedMs = getSortedUniqueMs([
    ...rows.map((row) =>
      getRuntimeObservedMs(row, [
        "firstSeenMs",
        "first_seen_ms",
        "firstRequestMs",
        "first_request_ms",
        "firstObservedMs",
        "first_observed_ms",
        "tsMs",
        "ts_ms",
        "timestampMs",
        "timestamp_ms"
      ], navigationStartMs)
    ),
    getRuntimeObservedMs(timelineMarkers, [
      "firstThirdPartyTrackingRequestMs",
      "first_third_party_tracking_request_ms",
      "firstThirdPartyRequestMs",
      "first_third_party_request_ms"
    ], navigationStartMs),
    getRuntimeObservedMs(networkSummary, [
      "firstThirdPartyTrackingRequestMs",
      "first_third_party_tracking_request_ms",
      "firstThirdPartyRequestMs",
      "first_third_party_request_ms"
    ], navigationStartMs)
  ]);

  return compactRecord({
    firstPreconsentThirdPartyTrackingObservedMs: observedMs[0] ?? null,
    firstPreconsentThirdPartyTrackingObservationBasis: observedMs.length > 0
      ? "runtime_third_party_request_timing"
      : null,
    preconsentThirdPartyTrackingObservedMs: compactArray(observedMs, 6),
    preconsentThirdPartyTrackingTimedObservationCount: observedMs.length
  });
}

function getPreconsentTimingRetainedEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const cookieOrStorage = getPreconsentCookieStorageTimingSummary(runtimeArtifacts);
  const thirdPartyTracking = getPreconsentThirdPartyTrackingTimingSummary(runtimeArtifacts);
  return compactRecord({
    ...cookieOrStorage,
    ...thirdPartyTracking,
    preconsentTimingEvidence: compactRecord({
      cookieOrStorage,
      thirdPartyTracking
    })
  });
}

function formatPreconsentObservedMsRef(label: string, observedMs: unknown, basis: unknown) {
  if (basis === "initial_preconsent_cookie_inventory") {
    return "Pre-consent cookie/storage observed in initial inventory; exact observation/write time not retained";
  }
  if (typeof observedMs !== "number" || !Number.isFinite(observedMs)) {
    return null;
  }
  return `${label}: ${formatElapsedSeconds(observedMs)} after scan start`;
}

function formatElapsedSeconds(value: number) {
  const seconds = Math.max(0, value) / 1000;
  return `${seconds.toPrecision(3)}s`;
}

function getPostRejectTrackingReductionEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, [
    "postRejectTrackingReductionEvidence",
    "post_reject_tracking_reduction_evidence"
  ]);
}

function getRejectPathDepthAndAvailability(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, [
    "rejectPathDepthAndAvailability",
    "reject_path_depth_and_availability"
  ]);
}

function getConsentControlLifecycleEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  return (
    getObject(hybridRuntimeEvidence, ["consentControlLifecycleEvidence", "consent_control_lifecycle_evidence"]) ??
    getObject(runtimeArtifacts, ["consentControlLifecycleEvidence", "consent_control_lifecycle_evidence"])
  );
}

function isPrivacyChoiceSurfaceOnly(lifecycle: Record<string, unknown> | null) {
  const surfacePurpose = getString(lifecycle, ["surfacePurpose", "surface_purpose"]);
  const placement = getString(lifecycle, ["privacyControlPlacement", "privacy_control_placement"]);
  const layerInspected = getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const initialConsentLayerObserved = getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]);
  const contaminationDetected = getBoolean(lifecycle, [
    "consentSurfaceContaminationDetected",
    "consent_surface_contamination_detected"
  ]);

  return (
    initialConsentLayerObserved !== true &&
    surfacePurpose !== "cookie_consent" &&
    (
      layerInspected === "footer_link" ||
      placement === "footer" ||
      surfacePurpose === "sale_share_opt_out" ||
      surfacePurpose === "targeted_ads_opt_out" ||
      surfacePurpose === "ad_choices" ||
      surfacePurpose === "privacy_policy" ||
      contaminationDetected === true
    )
  );
}

const SIMPLE_COOKIE_NOTICE_TEXT_PATTERN =
  /\b(?:uses?|use|using)\s+(?:of\s+)?cookies?\b|\bcookie\s+notice\b|\bcookie\s+consent\b|\bcookie\s+(?:settings|preferences|choices|center)\b|\bmanage\s+cookies\b/i;
const SIMPLE_ACCEPT_LABEL_PATTERN = /\b(?:accept|accept all|allow|agree|i accept)\b/i;
const SIMPLE_REJECT_LABEL_PATTERN = /\b(?:decline|decline all|reject|reject all|deny|refuse|necessary only|essential only)\b/i;
const LEGAL_PRIVACY_NOTICE_GATE_TEXT_PATTERN =
  /\b(?:legal\s+terms|privacy|terms\s+of\s+service|privacy\s+policy)\b/i;
const COOKIE_PIXEL_VENDOR_NOTICE_TEXT_PATTERN =
  /\b(?:cookies?|pixels?|similar\s+technolog(?:y|ies)|third[-\s]?party\s+vendors?|collect\s+and\s+use\s+your\s+information|partners?\s+also\s+use\s+tools|tools?.{0,80}(?:analytics|marketing|advertising|personaliz(?:e|ation)))\b/i;
const CONTINUE_ONLY_ACTION_LABEL_PATTERN = /^\s*(?:continue|got it|ok|okay|i understand)\s*$/i;
const PRIVACY_CHOICE_ACTION_LABEL_PATTERN =
  /\b(?:your\s+privacy\s+choices|privacy\s+choices|u\.?s\.?\s+privacy|ad\s+choices|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|targeted\s+advertising\s+choices)\b/i;
const MANAGE_CHOICE_LABEL_PATTERN =
  /\b(?:manage|settings|preferences?|customi[sz]e|choices?|options?|cookie center|preference center)\b/i;

function getEvidenceText(record: Record<string, unknown> | null | undefined) {
  return [
    getString(record, [
      "bannerTextSnippet",
      "banner_text_snippet",
      "textExcerpt",
      "text_excerpt",
      "textSnippet",
      "text_snippet",
      "text",
      "bodyText",
      "body_text"
    ]),
    ...getStringArray(record, [
      "evidenceRefs",
      "evidence_refs",
      "footerLinksInspected",
      "footer_links_inspected",
      "textSnippets",
      "text_snippets",
      "snippets"
    ])
  ].filter((value): value is string => Boolean(value));
}

function getFirstLayerConsentChoicesFromArtifacts(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const rejectPath = getRejectPathDepthAndAvailability(runtimeArtifacts);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  return getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(runtimeArtifacts, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
}

function getConsentPathControlLabels(
  consentUiPath: Record<string, unknown> | null,
  rejectPath: Record<string, unknown> | null
) {
  const rejectPathFirstLayer =
    getString(rejectPath, ["layerInspected", "layer_inspected"]) === "first_layer" ||
    getBoolean(rejectPath, ["bannerLayerInspected", "banner_layer_inspected"]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true;
  const consentUiPathFirstLayer =
    getString(consentUiPath, ["layerInspected", "layer_inspected"]) === "first_layer" ||
    getBoolean(consentUiPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true;

  return {
    acceptLabels: consentUiPathFirstLayer
      ? getStringArray(consentUiPath, ["acceptLabels", "accept_labels"])
      : [],
    preferenceLabels: consentUiPathFirstLayer
      ? getStringArray(consentUiPath, ["preferenceLabels", "preference_labels"])
      : [],
    rejectLabels: uniqueStrings([
      ...(consentUiPathFirstLayer ? getStringArray(consentUiPath, ["rejectLabels", "reject_labels"]) : []),
      ...(rejectPathFirstLayer
        ? getStringArray(rejectPath, ["evidenceRefs", "evidence_refs"])
            .filter((label) => SIMPLE_REJECT_LABEL_PATTERN.test(label))
        : [])
    ])
  };
}

function getFirstLayerConsentChoiceEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentSummary = getObject(hybridRuntimeEvidence, ["consentSummary", "consent_summary"]);
  const consentUiPath = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const consentPathControlLabels = getConsentPathControlLabels(consentUiPath, rejectPath);
  const visibleChoiceLabels = uniqueStrings([
    ...getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]),
    ...consentPathControlLabels.acceptLabels,
    ...consentPathControlLabels.preferenceLabels,
    ...consentPathControlLabels.rejectLabels
  ]);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]) ??
    getString(consentUiPath, ["layerInspected", "layer_inspected"]) ??
    getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const surfaceText = [
    ...getEvidenceText(firstLayerChoices),
    ...getEvidenceText(consentSummary),
    ...getEvidenceText(consentUiPath),
    ...getEvidenceText(rejectPath),
    ...getEvidenceText(lifecycle)
  ];
  const bannerLikeSurfaceObserved =
    layerInspected === "first_layer" ||
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(firstLayerChoices, ["capturedBeforeInteraction", "captured_before_interaction"]) === true ||
    getBoolean(consentSummary, ["bannerPresent", "banner_present"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true;
  const acceptControlObserved =
    getBoolean(firstLayerChoices, ["acceptControlObserved", "accept_control_observed", "acceptVisibleOnFirstLayer", "accept_visible_on_first_layer"]) === true ||
    consentPathControlLabels.acceptLabels.some((label) => SIMPLE_ACCEPT_LABEL_PATTERN.test(label)) ||
    visibleChoiceLabels.some((label) => SIMPLE_ACCEPT_LABEL_PATTERN.test(label));
  const rejectControlObserved =
    getBoolean(firstLayerChoices, ["rejectControlObserved", "reject_control_observed", "rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true ||
    consentPathControlLabels.rejectLabels.some((label) => SIMPLE_REJECT_LABEL_PATTERN.test(label)) ||
    visibleChoiceLabels.some((label) => SIMPLE_REJECT_LABEL_PATTERN.test(label));
  const cookieNoticeTextObserved =
    surfaceText.some((text) => SIMPLE_COOKIE_NOTICE_TEXT_PATTERN.test(text)) ||
    (
      getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent"]) === true &&
      visibleChoiceLabels.some((label) => /cookies?/i.test(label))
    );

  return {
    acceptControlObserved,
    bannerLikeSurfaceObserved,
    cookieNoticeTextObserved,
    firstLayerChoices,
    layerInspected,
    rejectControlObserved,
    surfaceText: compactArray(surfaceText, 4),
    visibleChoiceLabels: compactArray(visibleChoiceLabels, 8)
  };
}

function hasSimpleFirstLayerCookieNoticeWithAcceptReject(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getFirstLayerConsentChoiceEvidence(input);
  return (
    evidence.bannerLikeSurfaceObserved &&
    evidence.cookieNoticeTextObserved &&
    evidence.acceptControlObserved &&
    evidence.rejectControlObserved
  );
}

function getStructuredFirstLayerChoiceControls(firstLayerChoices: Record<string, unknown> | null | undefined) {
  return getObjectArray(firstLayerChoices, ["controls"]).filter((control) =>
    getBoolean(control, ["visible"]) !== false
  );
}

function getControlLabel(control: Record<string, unknown>) {
  return getString(control, ["label", "labelText", "label_text", "text", "visibleText", "visible_text"]);
}

function isCanonicalOptionsControl(control: Record<string, unknown>) {
  const actionType = getString(control, ["actionType", "action_type"]);
  const classifierReasonCodes = getStringArray(control, ["classifierReasonCodes", "classifier_reason_codes"]);
  const hasClassifierOptionsMetadata = classifierReasonCodes.includes("matched_options") ||
    getString(control, ["matchedTerm", "matched_term"]) !== null;
  if (
    (actionType === "manage_preferences" || actionType === "save_preferences") &&
    hasClassifierOptionsMetadata
  ) {
    return true;
  }

  const label = getControlLabel(control);
  if (!label) {
    return false;
  }
  const classification = classifyConsentControlLabel({
    label,
    hasConsentContext: true,
    hasPreferenceContext: actionType === "save_preferences"
  });
  return classification.intent === "options" &&
    (actionType === null || actionType === "manage_preferences" || actionType === "save_preferences");
}

function isCanonicalAcceptControl(control: Record<string, unknown>) {
  const actionType = getString(control, ["actionType", "action_type"]);
  const classifierReasonCodes = getStringArray(control, ["classifierReasonCodes", "classifier_reason_codes"]);
  const hasClassifierAcceptMetadata = classifierReasonCodes.includes("matched_accept") ||
    getString(control, ["matchedTerm", "matched_term"]) !== null;
  if (actionType === "accept_all" && hasClassifierAcceptMetadata) {
    return true;
  }

  const label = getControlLabel(control);
  if (!label) {
    return false;
  }
  const classification = classifyConsentControlLabel({
    label,
    hasConsentContext: true
  });
  return classification.intent === "accept" && (actionType === null || actionType === "accept_all");
}

function serializeConsentControlEvidence(control: Record<string, unknown>) {
  return {
    actionType: getString(control, ["actionType", "action_type"]),
    classifierReasonCodes: getStringArray(control, ["classifierReasonCodes", "classifier_reason_codes"]),
    label: getControlLabel(control),
    matchedLocale: getString(control, ["matchedLocale", "matched_locale"]),
    matchedTerm: getString(control, ["matchedTerm", "matched_term"]),
    matchStrength: getString(control, ["matchStrength", "match_strength"]),
    variant: getString(control, ["classifierVariant", "classifier_variant", "variant"])
  };
}

function getFirstLayerAcceptControlEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]);
  const controls = getStructuredFirstLayerChoiceControls(firstLayerChoices);
  const acceptControls = controls.filter(isCanonicalAcceptControl);
  const labels = uniqueStrings(acceptControls
    .map((control) => getControlLabel(control))
    .filter((label): label is string => Boolean(label)));

  return {
    acceptControlObserved: acceptControls.length > 0,
    acceptControls: acceptControls.slice(0, 6).map(serializeConsentControlEvidence),
    firstLayerChoices,
    firstLayerCookieConsentBannerObserved: getExplicitFirstLayerGdprConsentBannerConfirmed(input),
    layerInspected,
    structuredControlInventoryRetained: controls.length > 0,
    visibleAcceptLabels: labels,
    visibleChoiceLabels: getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"])
  };
}

function getFirstLayerOptionsControlEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]);
  const controls = getStructuredFirstLayerChoiceControls(firstLayerChoices);
  const optionsControls = controls.filter(isCanonicalOptionsControl);
  const labels = uniqueStrings(optionsControls
    .map((control) => getControlLabel(control))
    .filter((label): label is string => Boolean(label)));

  return {
    firstLayerChoices,
    firstLayerCookieConsentBannerObserved: getExplicitFirstLayerGdprConsentBannerConfirmed(input),
    layerInspected,
    optionsControlObserved: optionsControls.length > 0,
    optionsControls: optionsControls.slice(0, 6).map(serializeConsentControlEvidence),
    structuredControlInventoryRetained: controls.length > 0,
    visibleChoiceLabels: getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]),
    visibleOptionsLabels: labels
  };
}

function getFirstLayerNoticeGateEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getFirstLayerConsentChoiceEvidence(input);
  const visibleChoiceLabels = evidence.visibleChoiceLabels;
  const textMatchesNoticeGate =
    evidence.surfaceText.some((text) => LEGAL_PRIVACY_NOTICE_GATE_TEXT_PATTERN.test(text)) &&
    evidence.surfaceText.some((text) => COOKIE_PIXEL_VENDOR_NOTICE_TEXT_PATTERN.test(text));
  const continueLabels = visibleChoiceLabels.filter((label) => CONTINUE_ONLY_ACTION_LABEL_PATTERN.test(label));
  const privacyChoiceLabels = visibleChoiceLabels.filter((label) => PRIVACY_CHOICE_ACTION_LABEL_PATTERN.test(label));
  const granularManageLabels = visibleChoiceLabels.filter((label) =>
    MANAGE_CHOICE_LABEL_PATTERN.test(label) &&
    !PRIVACY_CHOICE_ACTION_LABEL_PATTERN.test(label)
  );
  const managePreferencesObserved = granularManageLabels.length > 0;
  const onlyContinueActionObserved =
    continueLabels.length > 0 &&
    visibleChoiceLabels.every((label) => CONTINUE_ONLY_ACTION_LABEL_PATTERN.test(label));
  const continueWithPrivacyChoicesObserved =
    continueLabels.length > 0 &&
    privacyChoiceLabels.length > 0 &&
    visibleChoiceLabels.every((label) =>
      CONTINUE_ONLY_ACTION_LABEL_PATTERN.test(label) ||
      PRIVACY_CHOICE_ACTION_LABEL_PATTERN.test(label)
    );
  const gateObserved =
    evidence.bannerLikeSurfaceObserved &&
    textMatchesNoticeGate &&
    (onlyContinueActionObserved || continueWithPrivacyChoicesObserved) &&
    !evidence.acceptControlObserved &&
    !evidence.rejectControlObserved &&
    !managePreferencesObserved;

  return {
    ...evidence,
    classification: gateObserved
      ? continueWithPrivacyChoicesObserved
        ? "forced_continue_notice_with_privacy_choices"
        : "forced_continue_notice"
      : null,
    continueWithPrivacyChoicesObserved,
    gateObserved,
    legalPrivacyNoticeGateObserved: gateObserved,
    managePreferencesObserved,
    noticeOnlyPrivacyInterstitialObserved: gateObserved && !continueWithPrivacyChoicesObserved,
    onlyContinueActionObserved,
    privacyChoiceLabels,
    privacyNoticeGateWithPrivacyChoicesObserved: gateObserved && continueWithPrivacyChoicesObserved,
    surfacePurpose: gateObserved ? "legal_privacy_notice_gate" : null,
    visibleContinueLabels: continueLabels
  };
}

function hasRetainedInitialCookieConsentLayerEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getFirstLayerConsentChoiceEvidence(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const initialConsentLayerObserved = getBoolean(lifecycle, [
    "initialConsentLayerObserved",
    "initial_consent_layer_observed"
  ]);
  const preferenceCenterReachable =
    getBooleanAnyTrue(lifecycle, [
      "cmpReopenControlObserved",
      "cmp_reopen_control_observed",
      "preferenceCenterReachableAfterInitialLayer",
      "preference_center_reachable_after_initial_layer"
    ]) === true;
  const actionableCookieChoiceObserved =
    evidence.acceptControlObserved ||
    evidence.rejectControlObserved ||
    evidence.visibleChoiceLabels.length > 0 ||
    preferenceCenterReachable;

  return (
    initialConsentLayerObserved === true &&
    evidence.cookieNoticeTextObserved &&
    actionableCookieChoiceObserved &&
    !noticeGateEvidence.gateObserved
  );
}

function getExplicitFirstLayerGdprConsentBannerConfirmed(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPath = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const sources = [lifecycle, consentUiPath, rejectPath, input.runtimeArtifacts, input.snapshot];
  const firstLayerObserved = sources
    .map((source) => getBoolean(source, ["firstLayerCookieConsentBannerObserved", "first_layer_cookie_consent_banner_observed"]))
    .find((value): value is boolean => typeof value === "boolean");
  const gdprSurfaceObserved = sources
    .map((source) => getRawValue(source, ["gdprEprivacyConsentSurfaceObserved", "gdpr_eprivacy_consent_surface_observed"]))
    .find((value) => typeof value === "boolean" || typeof value === "string");
  const simpleCookieNoticeWithChoice = hasSimpleFirstLayerCookieNoticeWithAcceptReject(input);
  const retainedInitialCookieConsentLayerEvidence = hasRetainedInitialCookieConsentLayerEvidence(input);

  if (
    simpleCookieNoticeWithChoice ||
    retainedInitialCookieConsentLayerEvidence ||
    (
      firstLayerObserved === true &&
      (
        gdprSurfaceObserved === true ||
        gdprSurfaceObserved === "true" ||
        gdprSurfaceObserved === "confirmed"
      )
    )
  ) {
    return true;
  }

  if (
    firstLayerObserved === false ||
    gdprSurfaceObserved === false ||
    gdprSurfaceObserved === "false" ||
    gdprSurfaceObserved === "unconfirmed" ||
    gdprSurfaceObserved === "unknown" ||
    isPrivacyChoiceSurfaceOnly(lifecycle)
  ) {
    return false;
  }

  return null;
}

function getConsentLifecycleAuditLimitation(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const structuredLimitation = getObject(hybridRuntimeEvidence, ["consentLifecycleAudit", "consent_lifecycle_audit"]);
  const consentAuditCompleted = getBoolean(runtimeArtifacts, ["consentAuditCompleted", "consent_audit_completed"]);
  const blockerTextSnippet = getString(runtimeArtifacts, ["consentBlockerTextSnippet", "consent_blocker_text_snippet"]);
  const structuredReason = getString(structuredLimitation, ["reason"]);
  const inferredPreviewShortCircuit =
    consentAuditCompleted === false &&
    blockerTextSnippet !== null &&
    /preflight.*verified|lean scan path|stopped before homepage setup/i.test(blockerTextSnippet);

  if (!structuredLimitation && !inferredPreviewShortCircuit) {
    return null;
  }

  const reason = structuredReason ?? (inferredPreviewShortCircuit ? "preview_preflight_short_circuit" : "scan_coverage_limited");

  return {
    actionableChoiceObserved:
      getBoolean(structuredLimitation, ["actionableChoiceObserved", "actionable_choice_observed"]) ??
      getBoolean(runtimeArtifacts, ["consentActionableChoiceObserved", "consent_actionable_choice_observed"]),
    attempted: getBoolean(structuredLimitation, ["attempted"]) ?? consentAuditCompleted ?? false,
    blockerTextSnippet: getString(structuredLimitation, ["blockerTextSnippet", "blocker_text_snippet"]) ?? blockerTextSnippet,
    consentAuditCompleted,
    consentSurfaceObserved:
      getBoolean(structuredLimitation, ["consentSurfaceObserved", "consent_surface_observed"]) ??
      getBoolean(runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]),
    reason,
    requiredFullRuntimeAudit:
      getBoolean(structuredLimitation, ["requiredFullRuntimeAudit", "required_full_runtime_audit"]) ?? true
  };
}

function makeConsentLifecycleLimitedOutcome(rowId: string, retainedLimitation: ReturnType<typeof getConsentLifecycleAuditLimitation>) {
  if (!retainedLimitation) {
    return null;
  }

  const rowLabel =
    rowId === "reject_all_path_availability"
      ? "reject-path availability"
      : rowId === "post_reject_tracking_reduction"
        ? "post-reject tracking reduction"
        : "post-choice preference or withdrawal controls";

  return makeOutcome(
    rowId,
    "Not testable",
    `The retained scanner runtime evidence shows this scan did not run consent lifecycle interaction testing, so ${rowLabel} cannot be evaluated from this scan.`,
    [
      "Evidence: consent lifecycle audit limitation",
      retainedLimitation.reason ? `Limitation reason: ${retainedLimitation.reason}` : null
    ].filter((value): value is string => Boolean(value)),
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scanner.consentLifecycleAudit.attempted",
          true,
          retainedLimitation.attempted,
          "Required to evaluate consent lifecycle rows from retained interaction evidence."
        )
      ],
      retainedEvidence: retainedLimitation
    }
  );
}

const CONSENT_PREFERENCE_CONTROL_PATTERN =
    /\b(?:ad\s+choices|cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|privacy\s+(?:settings|choices|preferences|rights)|manage\s+(?:consent|choices|cookies|preferences|settings)|consent\s+preferences?|preference\s+center|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|your\s+privacy\s+choices|your\s+privacy\s+rights|opt[-\s]?out(?:\s+of\s+targeted\s+advertising)?|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i;
const COOKIE_CONSENT_WITHDRAWAL_CONTROL_PATTERN =
  /\b(?:cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|manage\s+(?:consent|cookies|preferences)|consent\s+preferences?|preference\s+center|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i;
const NON_WITHDRAWAL_CONTROL_ACTION_PATTERN =
  /\b(?:close|dismiss|cancel|back|continue|learn\s+more|privacy\s+policy|terms|notice)\b/i;
const PRIVACY_AD_CHOICE_ONLY_CONTROL_PATTERN =
  /\b(?:ad\s+choices|your\s+privacy\s+choices|privacy\s+(?:choices|rights)|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|targeted\s+ads?|targeted\s+advertising|google\s+analytics\s+opt[-\s]?out|vendor\s+opt[-\s]?out|opt[-\s]?out)\b/i;

function isCookieConsentWithdrawalControlLabel(label: string) {
  const normalized = label.trim();
  return (
    COOKIE_CONSENT_WITHDRAWAL_CONTROL_PATTERN.test(normalized) &&
    !NON_WITHDRAWAL_CONTROL_ACTION_PATTERN.test(normalized)
  );
}

function getObservedPreferenceControlLabels(lifecycle: Record<string, unknown>) {
  return getObjectArray(lifecycle, ["observedControls", "observed_controls"])
    .map((control) => {
      const text = getString(control, ["text", "label"]);
      const href = getString(control, ["href", "url"]);
      const haystack = `${text ?? ""} ${href ?? ""}`;
      return text && CONSENT_PREFERENCE_CONTROL_PATTERN.test(haystack) ? text : null;
    })
    .filter((value): value is string => Boolean(value));
}

function hasAmbiguousPreferenceControlEvidence(
  lifecycle: Record<string, unknown>,
  observedControlLabels: string[]
) {
  const observedControls = getObjectArray(lifecycle, ["observedControls", "observed_controls"]);
  return (
    observedControlLabels.length === 0 &&
    (
      getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true ||
      getBoolean(lifecycle, [
        "preferenceCenterReachableAfterInitialLayer",
        "preference_center_reachable_after_initial_layer"
      ]) === true ||
      observedControls.length > 0
    )
  );
}

function makeOutcome(
  rowId: string,
  status: GdprEprivacyCoverageOutcomeStatus,
  limitation: string,
  evidenceRefs: string[] = [],
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: GdprEprivacyCoverageSourceSignalGap[];
    retainedEvidence?: Record<string, unknown>;
  }
): GdprEprivacyCoverageOutcome {
  return {
    criticalEvidence: {
      missingOrIncompleteSourceSignals: criticalEvidence?.missingOrIncompleteSourceSignals ?? [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${rowId}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: compactRecord({
        evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
        ...(criticalEvidence?.retainedEvidence ?? {})
      }),
      statusBasis: limitation
    },
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
    limitation,
    rowId,
    status
  };
}

function hasRuntimeCapture(input: GdprEprivacyCoveragePolicyInput) {
  const localEvidence = getEventMetadata(input.events, "hybrid_auto_local_evidence");
  const runtimeCapture = getEventMetadata(input.events, "browser_runtime_capture");

  return (
    getString(localEvidence, ["status"]) === "ok" ||
    getString(runtimeCapture, ["status"]) === "ok" ||
    getNumber(input.snapshot, ["pages_scanned"]) !== null
  );
}

function deriveTransportSecurityOutcomes(input: GdprEprivacyCoveragePolicyInput) {
  const summary = getTransportSecuritySummary(input.runtimeArtifacts);
  const evidenceRetained = getBoolean(summary, ["evidenceRetained", "evidence_retained"]) === true;
  const retainedEvidence = compactRecord({
    evidenceRefs: transportEvidenceRef(summary),
    finalScheme: getString(summary, ["finalScheme", "final_scheme"]),
    finalUrl: getString(summary, ["finalUrl", "final_url"]),
    formTransportCount: getNumber(summary, ["formTransportCount", "form_transport_count"]),
    httpProbeAttempted: getBoolean(summary, ["httpProbeAttempted", "http_probe_attempted"]),
    httpProbeFinalUrl: getString(summary, ["httpProbeFinalUrl", "http_probe_final_url"]),
    httpRedirectsToHttps: getBoolean(summary, ["httpRedirectsToHttps", "http_redirects_to_https"]),
    insecureFormTransportObserved: getBoolean(summary, ["insecureFormTransportObserved", "insecure_form_transport_observed"]),
    insecureFormTransports: getObjectArray(summary, ["insecureFormTransports", "insecure_form_transports"]).slice(0, 12),
    mixedContentObserved: getBoolean(summary, ["mixedContentObserved", "mixed_content_observed"]),
    mixedContentObservedCount: getNumber(summary, ["mixedContentObservedCount", "mixed_content_observed_count"]),
    mixedContentSamples: getObjectArray(summary, ["mixedContentSamples", "mixed_content_samples"]).slice(0, 12),
    pageHttpsObserved: getBoolean(summary, ["pageHttpsObserved", "page_https_observed"]),
    sampledPageUrls: getStringArray(summary, ["sampledPageUrls", "sampled_page_urls"]).slice(0, 20),
    tlsProbeAttempted: getBoolean(summary, ["tlsProbeAttempted", "tls_probe_attempted"]),
    tlsProbeErrorCategory: getString(summary, ["tlsProbeErrorCategory", "tls_probe_error_category"]),
    validTlsCertificate: getBoolean(summary, ["validTlsCertificate", "valid_tls_certificate"]),
  });

  if (!evidenceRetained) {
    return [
      "transport_security_https_delivery",
      "transport_security_tls_certificate",
      "transport_security_http_redirect",
      "transport_security_mixed_content",
      "transport_security_form_transport",
    ].map((rowId) =>
      makeOutcome(rowId, "Not testable", "No typed transport-security observation was retained for this scan context.", [], {
        missingOrIncompleteSourceSignals: [transportEvidenceMissingGap(rowId)],
        retainedEvidence,
      })
    );
  }

  return [
    transportOutcomeFromBoolean({
      falseStatus: "Gap observed",
      falseText: "The retained scanner evidence did not show the scanned page being served over HTTPS.",
      nullText: "The retained transport observation did not include a final page scheme.",
      retainedEvidence,
      rowId: "transport_security_https_delivery",
      trueStatus: "Observed",
      trueText: "The scanned page was served over HTTPS in the retained transport observation.",
      value: getBoolean(summary, ["pageHttpsObserved", "page_https_observed"]),
    }),
    transportOutcomeFromBoolean({
      falseStatus: "Gap observed",
      falseText: "The strict TLS probe did not verify a valid certificate for the HTTPS origin.",
      nullText: "The strict TLS probe was not retained or did not complete.",
      retainedEvidence,
      rowId: "transport_security_tls_certificate",
      trueStatus: "Observed",
      trueText: "The strict TLS probe verified the HTTPS origin certificate.",
      value: getBoolean(summary, ["validTlsCertificate", "valid_tls_certificate"]),
    }),
    transportOutcomeFromBoolean({
      falseStatus: "Gap observed",
      falseText: "The explicit HTTP-origin probe did not redirect to HTTPS.",
      nullText: "The explicit HTTP-origin redirect probe was not retained or did not complete.",
      retainedEvidence,
      rowId: "transport_security_http_redirect",
      trueStatus: "Observed",
      trueText: "The explicit HTTP-origin probe redirected to HTTPS.",
      value: getBoolean(summary, ["httpRedirectsToHttps", "http_redirects_to_https"]),
    }),
    transportOutcomeFromBoolean({
      falseStatus: "Observed",
      falseText: "No mixed-content HTTP subresources were retained for the scanned HTTPS page.",
      nullText: "The mixed-content observation was not retained.",
      retainedEvidence,
      rowId: "transport_security_mixed_content",
      trueStatus: "Gap observed",
      trueText: "HTTP subresources were retained on an HTTPS page.",
      value: getBoolean(summary, ["mixedContentObserved", "mixed_content_observed"]),
    }),
    transportOutcomeFromBoolean({
      falseStatus: "Observed",
      falseText: "No insecure observed form transport was retained for the scanned page.",
      nullText: "Observed form transport evidence was not retained.",
      retainedEvidence,
      rowId: "transport_security_form_transport",
      trueStatus: "Gap observed",
      trueText: "An observed form resolved to insecure HTTP transport or was on an HTTP page.",
      value: getBoolean(summary, ["insecureFormTransportObserved", "insecure_form_transport_observed"]),
    }),
  ];
}

function getEmbeddedContentEvidenceSummary(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  return (
    getObject(hybrid, ["embeddedContentSummary", "embedded_content_summary"]) ??
    getObject(input.runtimeArtifacts, ["embeddedContentSummary", "embedded_content_summary"])
  );
}

function getSessionReplayEvidenceSummary(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  return (
    getObject(hybrid, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"]) ??
    getObject(input.runtimeArtifacts, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"])
  );
}

function getFingerprintingEvidenceSummary(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  return (
    getObject(hybrid, ["fingerprintingEvidenceSummary", "fingerprinting_evidence_summary"]) ??
    getObject(input.runtimeArtifacts, ["fingerprintingEvidenceSummary", "fingerprinting_evidence_summary"])
  );
}

function hasEmbeddedContentRuntimeCoverage(input: GdprEprivacyCoveragePolicyInput) {
  const summary = getEmbeddedContentEvidenceSummary(input);
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const iframeSummary = getObject(hybridRuntimeEvidence, ["iframeSummary", "iframe_summary"]);
  return (
    getBoolean(summary, ["coverageRetained", "coverage_retained"]) === true ||
    Boolean(iframeSummary)
  );
}

function hasSessionReplayRuntimeCoverage(input: GdprEprivacyCoveragePolicyInput) {
  const summary = getSessionReplayEvidenceSummary(input);
  return (
    getBoolean(summary, ["coverageRetained", "coverage_retained"]) === true ||
    getNumber(summary, ["artifactCount", "artifact_count"]) !== null
  );
}

function hasFingerprintingRuntimeCoverage(input: GdprEprivacyCoveragePolicyInput) {
  const summary = getFingerprintingEvidenceSummary(input);
  return (
    getBoolean(summary, ["coverageRetained", "coverage_retained", "apiProbeRetained", "api_probe_retained"]) === true ||
    getNumber(summary, ["artifactCount", "artifact_count"]) !== null ||
    getObjectArray(input.runtimeArtifacts, ["fingerprintingRuntimeEvidence", "fingerprinting_runtime_evidence"]).length > 0 ||
    getObjectArray(getHybridRuntimeEvidence(input.runtimeArtifacts), ["fingerprintingRuntimeEvidence", "fingerprinting_runtime_evidence"]).length > 0
  );
}

function deriveConsentSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentControlLifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPathEvidence = getObject(input.runtimeArtifacts, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  const firstLayerConsentChoices = getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const visibleChoiceLabels = getStringArray(firstLayerConsentChoices, ["visibleChoiceLabels", "visible_choice_labels"]);
  const layerInspected = getString(consentUiPathEvidence, ["layerInspected", "layer_inspected"]);
  const simpleCookieNoticeEvidence = getFirstLayerConsentChoiceEvidence(input);
  const simpleCookieNoticeWithChoice = hasSimpleFirstLayerCookieNoticeWithAcceptReject(input);
  const retainedInitialCookieConsentLayerEvidence = hasRetainedInitialCookieConsentLayerEvidence(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const structuredDemotionReasons = [
    ...getStringArray(consentControlLifecycle, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"]),
    ...getStringArray(consentUiPathEvidence, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"]),
    ...getStringArray(rejectPathEvidence, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"])
  ];
  const structuredContaminationDetected =
    getBoolean(consentControlLifecycle, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true ||
    getBoolean(consentUiPathEvidence, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true ||
    getBoolean(rejectPathEvidence, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true;
  const privacyChoiceSurfaceOnly =
    isPrivacyChoiceSurfaceOnly(consentControlLifecycle) ||
    (structuredContaminationDetected && !simpleCookieNoticeWithChoice && !retainedInitialCookieConsentLayerEvidence);
  const consentSurfaceObserved =
    (!privacyChoiceSurfaceOnly || simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence) &&
    (
      simpleCookieNoticeWithChoice ||
      retainedInitialCookieConsentLayerEvidence ||
      getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
      getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
      getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true ||
      getBoolean(firstLayerConsentChoices, ["capturedBeforeInteraction", "captured_before_interaction"]) === true ||
      visibleChoiceLabels.length > 0 ||
      layerInspected === "first_layer"
    );

  if (noticeGateEvidence.gateObserved) {
    return makeOutcome(
      "consent_surface_observed",
      "Not confirmed",
      noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved
        ? "Privacy notice gate with privacy-choice link observed; GDPR/ePrivacy consent surface not confirmed. The retained first-layer surface disclosed analytics, marketing, advertising, or partner tracking, but did not show a clear same-layer reject or granular cookie-choice flow."
        : "Legal/privacy notice gate observed; GDPR/ePrivacy consent surface not confirmed. The retained first-layer surface disclosed cookie, pixel, or vendor use but did not show same-layer reject or granular preference controls.",
      [
        "Evidence: first-layer legal/privacy notice gate",
        ...noticeGateEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        noticeGateEvidence.layerInspected ? `Layer inspected: ${noticeGateEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          consentSurfaceObserved: false,
          consentSurfaceDecisionStates: [
            "legal_privacy_notice_gate",
            noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved
              ? "privacy_notice_gate_with_privacy_choices"
              : "notice_only_privacy_interstitial",
            noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved
              ? "forced_continue_notice_with_privacy_choices"
              : "forced_continue_notice"
          ],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          legalPrivacyNoticeGateObserved: true,
          layerInspected: noticeGateEvidence.layerInspected,
          managePreferencesObserved: false,
          noticeOnlyPrivacyInterstitialObserved: noticeGateEvidence.noticeOnlyPrivacyInterstitialObserved,
          onlyContinueActionObserved: true,
          privacyChoiceLabels: noticeGateEvidence.privacyChoiceLabels,
          privacyNoticeGateWithPrivacyChoicesObserved: noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved,
          rejectControlObserved: false,
          surfacePurpose: "legal_privacy_notice_gate",
          visibleChoiceLabels: noticeGateEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (consentSurfaceObserved) {
    const retainedLayerInspected = simpleCookieNoticeEvidence.layerInspected ?? layerInspected;
    const evidenceRefs = [
      "Evidence: retained consent surface observation",
      ...(
        simpleCookieNoticeEvidence.visibleChoiceLabels.length > 0
          ? simpleCookieNoticeEvidence.visibleChoiceLabels
          : visibleChoiceLabels
      ).map((label) => `Visible choice: ${label}`).slice(0, 3),
      retainedLayerInspected ? `Layer inspected: ${retainedLayerInspected}` : null
    ].filter((value): value is string => Boolean(value));
    return makeOutcome(
      "consent_surface_observed",
      "Observed",
      simpleCookieNoticeWithChoice
        ? "A first-layer cookie notice was observed with actionable Accept and Decline controls."
        : retainedInitialCookieConsentLayerEvidence
          ? "A first-layer cookie consent surface was retained with actionable choice or preference controls."
          : "A consent surface or first-layer consent controls were retained in the tested context.",
      evidenceRefs,
      {
        retainedEvidence: {
          acceptControlObserved: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? simpleCookieNoticeEvidence.acceptControlObserved
            : undefined,
          consentSurfaceContaminationDetected: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? false
            : undefined,
          consentSurfaceDecisionStates: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? ["first_layer_cookie_notice_observed"]
            : undefined,
          consentSurfaceObserved: true,
          firstLayerCookieConsentBannerObserved: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? true
            : undefined,
          gdprEprivacyConsentSurfaceObserved: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? true
            : undefined,
          layerInspected: retainedLayerInspected,
          privacyControlPlacement: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? retainedLayerInspected === "first_layer" ? "first_layer" : "banner"
            : undefined,
          rejectControlObserved: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? simpleCookieNoticeEvidence.rejectControlObserved
            : undefined,
          surfacePurpose: simpleCookieNoticeWithChoice || retainedInitialCookieConsentLayerEvidence
            ? "cookie_consent"
            : undefined,
          visibleChoiceLabels: compactArray(
            simpleCookieNoticeEvidence.visibleChoiceLabels.length > 0
              ? simpleCookieNoticeEvidence.visibleChoiceLabels
              : visibleChoiceLabels,
            5
          )
        }
      }
    );
  }

    if (privacyChoiceSurfaceOnly && hasRuntimeCapture(input)) {
      return makeOutcome(
        "consent_surface_observed",
        "Not confirmed",
        "Privacy/ad-choice surface observed; GDPR consent banner not confirmed.",
        [
          "Evidence: consent control lifecycle",
        getString(consentControlLifecycle, ["surfacePurpose", "surface_purpose"]) ? `Surface purpose: ${getString(consentControlLifecycle, ["surfacePurpose", "surface_purpose"])}` : null,
        getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"]) ? `Placement: ${getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"])}` : null,
        ...visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        layerInspected ? `Layer inspected: ${layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          adChoicesLinkObserved:
            getBoolean(consentControlLifecycle, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            getBoolean(consentUiPathEvidence, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            getBoolean(rejectPathEvidence, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            false,
          consentSurfaceContaminationDetected:
            getBoolean(consentControlLifecycle, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            getBoolean(consentUiPathEvidence, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            getBoolean(rejectPathEvidence, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            false,
          consentSurfaceDemotionReasons: [...new Set(structuredDemotionReasons)],
          consentSurfaceObserved: false,
          consentSurfaceDecisionStates: ["privacy_choice_surface_only"],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          privacyControlPlacement:
            getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"]) ??
            getString(consentUiPathEvidence, ["privacyControlPlacement", "privacy_control_placement"]) ??
            getString(rejectPathEvidence, ["privacyControlPlacement", "privacy_control_placement"]) ??
            "unknown",
          consentControlLifecycleEvidence: consentControlLifecycle ?? undefined,
          layerInspected,
          visibleChoiceLabels: compactArray(visibleChoiceLabels, 5)
        }
      }
    );
  }

  const consentSurfaceNotObserved =
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === false ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === false ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === false;

  if (consentSurfaceNotObserved && hasRuntimeCapture(input)) {
    return makeOutcome(
      "consent_surface_observed",
      "Not observed",
      "Runtime consent-surface checks completed for the tested context and did not retain an actionable consent surface.",
      ["Evidence: retained consent surface observation"],
      {
        retainedEvidence: {
          consentSurfaceObserved: false,
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function derivePreConsentCookieStorageOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const storageSummary = getHybridStorageSummary(input.runtimeArtifacts);
  const preconsentTimingEvidence = getPreconsentTimingRetainedEvidence(input.runtimeArtifacts);
  const firstObservedMsRef = formatPreconsentObservedMsRef(
    "First pre-consent cookie/storage observation",
    preconsentTimingEvidence.firstPreconsentCookieOrStorageObservedMs,
    preconsentTimingEvidence.firstPreconsentCookieOrStorageObservationBasis
  );
  const cookiesBeforeConsentCount =
    getNumber(storageSummary, ["cookiesBeforeConsentCount", "cookies_before_consent_count"]) ??
    (getBoolean(input.snapshot, ["first_party_cookie_set_before_consent", "third_party_cookie_set_before_consent"]) === true
      ? 1
      : null);
  const cookiesSeenCount =
    getNumber(storageSummary, ["cookiesSeenCount", "cookies_seen_count"]) ??
    getNumber(input.snapshot, ["cookie_count_total"]);

  if (cookiesBeforeConsentCount !== null && cookiesBeforeConsentCount > 0) {
    return makeOutcome(
      "pre_consent_cookies_storage",
      "Observed",
      "Cookie/storage inventory retained before-consent observations. CertScore reports this as an observed runtime signal; whether the storage is essential or creates a regulatory gap remains review context.",
      [
        firstObservedMsRef,
        `Observed before-consent cookie/storage count: ${cookiesBeforeConsentCount}`,
        "Evidence: hybrid runtime storage summary"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          cookiesBeforeConsentCount,
          cookiesSeenCount,
          eligibleNonEssentialCookieStorageFindingProjected: false,
          observedRuntimeSignalOnly: true,
          ...preconsentTimingEvidence,
          storageSummaryRetained: Boolean(storageSummary)
        }
      }
    );
  }

  if (cookiesSeenCount !== null || hasRuntimeCapture(input)) {
    return makeOutcome(
      "pre_consent_cookies_storage",
      "Not observed",
      "Cookie/storage inventory was retained for the tested context, and no eligible pre-consent cookie/storage finding was projected.",
      [
        firstObservedMsRef,
        "Evidence: hybrid runtime storage summary"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          cookiesBeforeConsentCount: cookiesBeforeConsentCount ?? 0,
          cookiesSeenCount,
          ...preconsentTimingEvidence,
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          storageSummaryRetained: Boolean(storageSummary)
        }
      }
    );
  }

  return null;
}

function deriveCmpFrameworkSignalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const cmpEvidence = getCmpFrameworkSignalEvidence(input);
  const cmpVendorName = cmpEvidence.cmpVendorName;
  const cmpSignals = cmpEvidence.cmpSignals;
  const cmpObserved = cmpEvidence.cmpObserved;

  if (cmpObserved) {
    return makeOutcome(
      "cmp_framework_signal_observed",
      "Observed",
      cmpVendorName
        ? `A consent-management framework signal was retained: ${cmpVendorName}.`
        : "A consent-management framework or CMP runtime signal was retained in the tested context.",
      [
        cmpVendorName ? `CMP: ${cmpVendorName}` : null,
        ...cmpSignals.map((signal) => `CMP signal: ${signal}`).slice(0, 5),
        "Evidence: pre-consent CMP runtime observation"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          cmpFrameworkSignalObserved: true,
          cmpRuntimeSignalLabels: compactArray(cmpSignals, 8),
          cmpVendorName
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "cmp_framework_signal_observed",
      "Not observed",
      "Runtime consent/CMP checks completed for the tested context and did not retain a CMP framework signal.",
      ["Evidence: runtime capture completed"],
      {
        retainedEvidence: {
          cmpFrameworkSignalObserved: false,
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function getCmpFrameworkSignalEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentSummary = getObject(hybridRuntimeEvidence, ["consentSummary", "consent_summary"]);
  const cmpVendorName = getString(input.snapshot, ["cmp_vendor_name", "cmpVendorName"]) ??
    getString(input.runtimeArtifacts, ["cmp_vendor_name", "cmpVendorName"]);
  const cmpSignals = getStringArray(input.runtimeArtifacts, [
    "cmp_runtime_signal_labels",
    "cmpRuntimeSignalLabels"
  ]);
  const cmpObserved =
    Boolean(cmpVendorName) ||
    cmpSignals.length > 0 ||
    getBoolean(input.runtimeArtifacts, ["cmpFrameworkSignalObserved", "cmp_framework_signal_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["cmpFrameworkSignalObserved", "cmp_framework_signal_observed"]) === true ||
    getBoolean(consentSummary, ["cmpFrameworkSignalObserved", "cmp_framework_signal_observed"]) === true;

  return {
    cmpObserved,
    cmpSignals,
    cmpVendorName
  };
}

function deriveCookieNoticePolicyAvailabilityOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentSummary = getObject(hybridRuntimeEvidence, ["consentSummary", "consent_summary"]);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const policyDisclosureSummary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const policySurfaceUrls = [
    ...getStringArray(input.runtimeArtifacts, ["cookiePolicyUrls", "cookie_policy_urls", "cookieNoticeUrls", "cookie_notice_urls"]),
    ...getStringArray(policyDisclosureSummary, ["cookiePolicyUrls", "cookie_policy_urls", "policySurfaceUrls", "policy_surface_urls", "privacyPolicyUrls", "privacy_policy_urls"])
  ];
  const policySurfaceText = [
    getString(policyDisclosureSummary, ["retainedCookiePolicyTextExcerpt", "retained_cookie_policy_text_excerpt"]),
    getString(policyDisclosureSummary, ["retainedPrivacyPolicyTextExcerpt", "retained_privacy_policy_text_excerpt"])
  ].filter(Boolean).join("\n");
  const policySurfaceTopics = getStringArray(policyDisclosureSummary, ["observedTopics", "observed_topics"]);
  const policySurfaceControls = getStringArray(policyDisclosureSummary, ["mentionedControls", "mentioned_controls"]);
  const policySurfaceAvailable =
    getBoolean(input.snapshot, ["cookie_policy_present", "cookiePolicyPresent"]) === true ||
    getBoolean(input.runtimeArtifacts, ["cookiePolicyPresent", "cookie_policy_present"]) === true ||
    getBoolean(policyDisclosureSummary, ["cookiePolicyPresent", "cookie_policy_present"]) === true ||
    policySurfaceTopics.some((topic) => /cookies?|cookie_notice|cookie_policy|consent_withdrawal/i.test(topic)) ||
    policySurfaceControls.some((control) => /cookie|consent_withdrawal/i.test(control)) ||
    policySurfaceUrls.some((url) => /cookie|preference|privacy[-_ ]?center|settings/i.test(url)) ||
    /cookie (policy|notice|declaration|table|settings)|privacy choices|manage cookies|cookie preference/i.test(policySurfaceText);
  const bannerOnlyCookieNotice =
    getBoolean(input.runtimeArtifacts, ["cookieNoticeObserved", "cookie_notice_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["cookieNoticeObserved", "cookie_notice_observed"]) === true ||
    getBoolean(consentSummary, ["cookieNoticeObserved", "cookie_notice_observed", "bannerPresent", "banner_present"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent"]) === true ||
    getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]).some((label) => /cookies?/i.test(label));
  const storageSummary = getHybridStorageSummary(input.runtimeArtifacts);
  const cookiesBeforeConsentCount = getNumber(storageSummary, ["cookiesBeforeConsentCount", "cookies_before_consent_count"]) ?? 0;
  const preConsentRuntimeEvidence =
    cookiesBeforeConsentCount > 0 ||
    getBoolean(input.snapshot, ["first_party_cookie_set_before_consent", "third_party_cookie_set_before_consent", "preconsent_tracking_detected"]) === true ||
    getStringArray(input.runtimeArtifacts, [
      "preconsent_tracker_vendors",
      "consent_baseline_tracker_vendor_names",
      "tracker_vendors",
      "advertising_retargeting_vendor_names",
      "analytics_vendor_names"
    ]).length > 0;

  if (policySurfaceAvailable) {
    return makeOutcome(
      "cookie_notice_policy_availability",
      "Observed",
      "A cookie policy, cookie notice, cookie settings, or durable cookie disclosure surface was retained in the tested context.",
      [
        "Evidence: cookie policy or cookie disclosure surface retained",
        ...policySurfaceUrls.map((url) => `Policy URL: ${url}`).slice(0, 2)
      ],
      {
        retainedEvidence: {
          cookieNoticeObserved: true,
          cookiePolicyPresent: true,
          cookiePolicyUrls: compactArray(policySurfaceUrls, 4),
          observedPolicyControls: compactArray(policySurfaceControls, 6),
          observedPolicyTopics: compactArray(policySurfaceTopics, 6)
        }
      }
    );
  }

  if (bannerOnlyCookieNotice) {
    return makeOutcome(
      "cookie_notice_policy_availability",
      "Review signal",
      "A first-layer cookie/consent banner was retained, but no durable cookie policy, cookie notice, settings, declaration, or cookie table surface was retained. Manual review should confirm whether cookie disclosure is available outside the banner.",
      ["Evidence: cookie or consent banner retained", "Missing evidence: durable cookie policy/notice surface"],
      {
        retainedEvidence: {
          bannerOnlyCookieNotice: true,
          cookieNoticeObserved: true,
          cookiePolicyPresent: false,
          preConsentRuntimeEvidence
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || input.policyEnrichmentCount !== null) {
    return makeOutcome(
      "cookie_notice_policy_availability",
      preConsentRuntimeEvidence ? "Gap observed" : "Not observed",
      preConsentRuntimeEvidence
        ? "Pre-consent cookie/tracking evidence was retained, but no cookie notice, cookie policy, cookie-settings, declaration, or cookie table disclosure surface was retained."
        : "Runtime and policy-surface checks did not retain a cookie notice, cookie policy, cookie-settings, declaration, or cookie table disclosure surface.",
      ["Evidence: retained runtime/policy surface checks"],
      {
        retainedEvidence: {
          cookieNoticeObserved: false,
          cookiePolicyPresent: false,
          preConsentRuntimeEvidence,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  return null;
}

function derivePreConsentThirdPartyTrackingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const preconsentTimingEvidence = getPreconsentTimingRetainedEvidence(input.runtimeArtifacts);
  const firstObservedMsRef = formatPreconsentObservedMsRef(
    "First pre-consent 3rd party tracking request observation",
    preconsentTimingEvidence.firstPreconsentThirdPartyTrackingObservedMs,
    preconsentTimingEvidence.firstPreconsentThirdPartyTrackingObservationBasis
  );
  const trackerVendors = getStringArray(input.runtimeArtifacts, [
    "preconsent_tracker_vendors",
    "consent_baseline_tracker_vendor_names",
    "tracker_vendors"
  ]);
  const trackerEvidenceUrls = getStringArray(input.runtimeArtifacts, [
    "preconsent_tracker_evidence_urls",
    "consent_baseline_tracker_evidence_urls",
    "tracker_evidence_urls"
  ]);
  const preconsentTrackingDetected =
    getBoolean(input.snapshot, ["preconsent_tracking_detected", "tracking_before_consent_detected"]) === true ||
    trackerVendors.length > 0 ||
    trackerEvidenceUrls.length > 0;
  const trackerVendorCount =
    trackerVendors.length ||
    getNumber(input.snapshot, ["tracker_vendor_count", "tracker_count_total"]) ||
    0;
  const concreteTrackerEvidenceRetained = trackerVendors.length > 0 || trackerEvidenceUrls.length > 0;
  const preconsentPurposeRiskMix = buildPreconsentPurposeRiskMix([
    ...trackerVendors.map(createPurposeRowFromVendorName),
    ...trackerEvidenceUrls.map((url) => ({ url }))
  ]);
  const highRiskPurposeRetained = hasHighRiskPurpose(preconsentPurposeRiskMix);

  if (preconsentTrackingDetected) {
    return makeOutcome(
      "pre_consent_third_party_tracking",
      concreteTrackerEvidenceRetained ? "Review signal" : "Insufficient evidence",
      concreteTrackerEvidenceRetained
        ? highRiskPurposeRetained
          ? "Concrete pre-consent tracker vendor or request evidence was retained, but no eligible unified tracking finding was projected for this row. Manual review should confirm whether the retained request sequence supports a GDPR/ePrivacy tracking gap."
          : "Pre-consent 3rd party timing evidence was retained, but the retained purpose mix is limited to lower-risk or unresolved infrastructure categories. Manual review should confirm essentiality without treating the evidence as adtech or retargeting by itself."
        : "Pre-consent 3rd party tracking evidence was retained, but no eligible unified tracking finding was projected for this row.",
      [
        firstObservedMsRef,
        "Evidence: pre-consent tracking runtime signal",
        trackerVendorCount > 0 ? `Pre-consent tracker vendors: ${trackerVendorCount}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: concreteTrackerEvidenceRetained
          ? []
          : [
              sourceGap(
                "CertScore.unifiedFindings.preConsentTrackingFinding",
                "eligible projected unified finding when retained pre-consent tracking evidence satisfies policy gates",
                "missing",
                "Required to classify retained pre-consent tracker observations as a canonical gap.",
                "CertScore"
              )
            ],
        retainedEvidence: {
          concreteTrackerEvidenceRetained,
          ...preconsentTimingEvidence,
          preconsentTrackingDetected,
          preconsentPurposeRiskMix,
          trackerEvidenceUrls: compactArray(trackerEvidenceUrls, 3),
          trackerVendorCount,
          trackerVendors: compactArray(trackerVendors, 5)
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "pre_consent_third_party_tracking",
      "Not observed",
      "Runtime tracking checks completed for the tested context, and no eligible pre-consent 3rd party tracking finding was projected.",
      [
        firstObservedMsRef,
        "Evidence: runtime capture completed"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          ...preconsentTimingEvidence,
          preconsentTrackingDetected: false,
          runtimeCaptureCompleted: true,
          trackerVendorCount
        }
      }
    );
  }

  return null;
}

function hasObservedPreconsentCookieOrTrackingActivity(input: GdprEprivacyCoveragePolicyInput) {
  const storageSummary = getHybridStorageSummary(input.runtimeArtifacts);
  const networkSummary = getHybridNetworkSummary(input.runtimeArtifacts);
  const cookiesBeforeConsentCount =
    getNumber(storageSummary, ["cookiesBeforeConsentCount", "cookies_before_consent_count"]) ??
    (getBoolean(input.snapshot, ["first_party_cookie_set_before_consent", "third_party_cookie_set_before_consent"]) === true
      ? 1
      : 0);
  const thirdPartyRequestCount =
    getNumber(networkSummary, ["preConsentThirdPartyRequestCount", "pre_consent_third_party_request_count"]) ??
    getNumber(input.snapshot, ["third_party_request_count", "third_party_requests_count"]) ??
    0;
  const trackerVendors = getStringArray(input.runtimeArtifacts, [
    "preconsent_tracker_vendors",
    "consent_baseline_tracker_vendor_names",
    "tracker_vendors",
    "advertising_retargeting_vendor_names",
    "analytics_vendor_names"
  ]);

  return (
    cookiesBeforeConsentCount > 0 ||
    thirdPartyRequestCount > 0 ||
    trackerVendors.length > 0 ||
    getBoolean(input.snapshot, ["preconsent_tracking_detected", "tracking_before_consent_detected"]) === true
  );
}

function rowHasVendorCategory(row: Record<string, unknown>, categories: string[]) {
  const category = getString(row, ["category", "vendorCategory", "vendor_category", "purpose"]);
  return Boolean(category && categories.includes(category));
}

function rowHasPurposeRisk(row: Record<string, unknown>, buckets: RuntimePurposeRiskBucket[]) {
  return buckets.includes(classifyRuntimePurposeRisk(row));
}

function getRuntimeRowObservedMs(rows: Record<string, unknown>[], runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const timelineMarkers = getHybridTimelineMarkers(runtimeArtifacts);
  const navigationStartMs = getNumber(timelineMarkers, ["navigationStartMs", "navigation_start_ms"]);
  return getSortedUniqueMs(rows.map((row) =>
    getRuntimeObservedMs(row, [
      "firstSeenMs",
      "first_seen_ms",
      "firstObservedMs",
      "first_observed_ms",
      "firstObservedAtMs",
      "first_observed_at_ms",
      "observedAtMs",
      "observed_at_ms",
      "timestampMs",
      "timestamp_ms",
      "tsMs",
      "ts_ms"
    ], navigationStartMs)
  ));
}

function buildRuntimePurposeEvidenceCauses(rows: Record<string, unknown>[], buckets: RuntimePurposeRiskBucket[]) {
  return compactArray(
    rows
      .filter((row) => rowHasPurposeRisk(row, buckets))
      .map((row) => compactRecord({
        bucket: classifyRuntimePurposeRisk(row),
        category: getString(row, ["category", "vendorCategory", "vendor_category", "purpose", "vendorPurpose", "vendor_purpose"]),
        domain: getString(row, ["domain", "host", "hostname"]),
        firstSeenMs: getNumber(row, [
          "firstSeenMs",
          "first_seen_ms",
          "firstObservedMs",
          "first_observed_ms",
          "firstObservedAtMs",
          "first_observed_at_ms",
          "observedAtMs",
          "observed_at_ms",
          "timestampMs",
          "timestamp_ms",
          "tsMs",
          "ts_ms"
        ]),
        representativeUrl: getString(row, ["requestUrl", "request_url", "representativeUrl", "representative_url", "url"]),
        vendor: getRuntimePurposeVendor(row)
      })),
    8
  );
}

function deriveAdvertisingRetargetingVendorSignalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const vendorSummary = getObject(hybridRuntimeEvidence, ["vendorSummary", "vendor_summary"]);
  const vendorCategoryCounts = getObject(vendorSummary, ["vendorCategoryCounts", "vendor_category_counts"]);
  const adCategories = ["advertising", "adtech", "marketing"];
  const requestRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const rawAdvertisingRequestRows = requestRows.filter((row) => rowHasVendorCategory(row, adCategories));
  const advertisingRequestRows = requestRows.filter((row) => rowHasPurposeRisk(row, ["advertising"]));
  const observedMs = getRuntimeRowObservedMs(advertisingRequestRows, input.runtimeArtifacts);
  const categoryCount = adCategories.reduce((sum, category) => sum + (getNumber(vendorCategoryCounts, [category]) ?? 0), 0);
  const requestCategoryCount = advertisingRequestRows.length;
  const rawAdvertisingVendors = getStringArray(input.runtimeArtifacts, [
    "advertising_vendor_names",
    "advertisingVendorNames",
    "adtech_vendor_names",
    "adtechVendorNames",
    "advertising_retargeting_vendor_names",
    "advertisingRetargetingVendorNames"
  ]);
  const advertisingVendorRows = rawAdvertisingVendors
    .map(createPurposeRowFromVendorName)
    .filter((row) => rowHasPurposeRisk(row, ["advertising"]));
  const advertisingVendors = uniqueStrings([
    ...advertisingRequestRows.map(getRuntimePurposeVendor),
    ...advertisingVendorRows.map(getRuntimePurposeVendor)
  ]);
  const advertisingEvidenceCauses = buildRuntimePurposeEvidenceCauses([
    ...requestRows,
    ...rawAdvertisingVendors.map(createPurposeRowFromVendorName)
  ], ["advertising"]);
  const retainedPurposeMix = buildPreconsentPurposeRiskMix([
    ...requestRows,
    ...rawAdvertisingVendors.map(createPurposeRowFromVendorName)
  ]);
  const filteredNonAdVendors = uniqueStrings([
    ...rawAdvertisingRequestRows.filter((row) => !rowHasPurposeRisk(row, ["advertising"])).map(getRuntimePurposeVendor),
    ...rawAdvertisingVendors
      .map(createPurposeRowFromVendorName)
      .filter((row) => !rowHasPurposeRisk(row, ["advertising"]))
      .map(getRuntimePurposeVendor)
  ]);
  const fallbackCategoryCount =
    requestRows.length === 0 && rawAdvertisingVendors.length === 0
      ? categoryCount
      : 0;
  const rawAdvertisingVendorCount =
    getNumber(input.runtimeArtifacts, ["advertising_vendor_count", "advertisingVendorCount"]) ??
    getNumber(input.runtimeArtifacts, ["advertising_retargeting_vendor_count", "advertisingRetargetingVendorCount"]) ??
    0;
  const advertisingVendorCount =
    requestRows.length > 0 || rawAdvertisingVendors.length > 0
      ? Math.max(requestCategoryCount, advertisingVendors.length)
      : Math.max(fallbackCategoryCount, rawAdvertisingVendorCount);

  if (advertisingVendorCount > 0 || advertisingVendors.length > 0) {
    return makeOutcome(
      "advertising_retargeting_vendor_signal_observed",
      "Review signal",
      "Advertising infrastructure vendor evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm purpose and consent relevance.",
      [
        advertisingVendorCount > 0 ? `Advertising vendor/category count: ${advertisingVendorCount}` : null,
        ...advertisingVendors.map((vendor) => `Advertising vendor: ${vendor}`).slice(0, 5),
        "Evidence: retained runtime vendor summary"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          advertisingVendorCount,
          advertisingVendorObservedMs: compactArray(observedMs, 6),
          advertisingVendors: compactArray(advertisingVendors, 8),
          advertisingRetargetingVendorCount: advertisingVendorCount,
          advertisingRetargetingEvidenceCauses: advertisingEvidenceCauses,
          advertisingRetargetingVendorObservedMs: compactArray(observedMs, 6),
          advertisingRetargetingVendors: compactArray(advertisingVendors, 8),
          filteredNonAdvertisingRetargetingVendors: compactArray(filteredNonAdVendors, 8),
          firstAdvertisingRetargetingVendorObservedMs: observedMs[0] ?? null,
          observedRuntimeSignalOnly: true,
          preconsentPurposeRiskMix: retainedPurposeMix
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || vendorSummary || requestRows.length > 0 || rawAdvertisingVendors.length > 0) {
    return makeOutcome(
      "advertising_retargeting_vendor_signal_observed",
      "Not observed",
      "Runtime vendor checks completed for the tested context and did not retain an advertising infrastructure vendor classification.",
      ["Evidence: retained runtime vendor summary"],
      {
        retainedEvidence: {
          advertisingVendorCount: 0,
          advertisingRetargetingVendorCount: 0,
          advertisingRetargetingEvidenceCauses: [],
          filteredNonAdvertisingRetargetingVendors: compactArray(filteredNonAdVendors, 8),
          preconsentPurposeRiskMix: retainedPurposeMix,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  return null;
}

function deriveRetargetingBehavioralAdvertisingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const vendorSummary = getObject(hybridRuntimeEvidence, ["vendorSummary", "vendor_summary"]);
  const vendorCategoryCounts = getObject(vendorSummary, ["vendorCategoryCounts", "vendor_category_counts"]);
  const requestRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const rawRetargetingRequestRows = requestRows.filter((row) => rowHasVendorCategory(row, ["retargeting"]));
  const retargetingRequestRows = requestRows.filter((row) => rowHasPurposeRisk(row, ["retargeting"]));
  const observedMs = getRuntimeRowObservedMs(retargetingRequestRows, input.runtimeArtifacts);
  const rawRetargetingVendors = getStringArray(input.runtimeArtifacts, [
    "retargeting_behavioral_advertising_vendor_names",
    "retargetingBehavioralAdvertisingVendorNames",
    "retargeting_vendor_names",
    "retargetingVendorNames"
  ]);
  const retargetingVendorRows = rawRetargetingVendors
    .map(createPurposeRowFromVendorName)
    .filter((row) => rowHasPurposeRisk(row, ["retargeting"]));
  const retargetingVendors = uniqueStrings([
    ...retargetingRequestRows.map(getRuntimePurposeVendor),
    ...retargetingVendorRows.map(getRuntimePurposeVendor)
  ]);
  const retargetingEvidenceCauses = buildRuntimePurposeEvidenceCauses([
    ...requestRows,
    ...rawRetargetingVendors.map(createPurposeRowFromVendorName)
  ], ["retargeting"]);
  const retainedPurposeMix = buildPreconsentPurposeRiskMix([
    ...requestRows,
    ...rawRetargetingVendors.map(createPurposeRowFromVendorName)
  ]);
  const filteredNonRetargetingVendors = uniqueStrings([
    ...rawRetargetingRequestRows.filter((row) => !rowHasPurposeRisk(row, ["retargeting"])).map(getRuntimePurposeVendor),
    ...rawRetargetingVendors
      .map(createPurposeRowFromVendorName)
      .filter((row) => !rowHasPurposeRisk(row, ["retargeting"]))
      .map(getRuntimePurposeVendor)
  ]);
  const fallbackCategoryCount =
    requestRows.length === 0 && rawRetargetingVendors.length === 0
      ? getNumber(vendorCategoryCounts, ["retargeting"]) ?? 0
      : 0;
  const rawRetargetingVendorCount =
    getNumber(input.runtimeArtifacts, ["retargeting_behavioral_advertising_vendor_count", "retargetingBehavioralAdvertisingVendorCount"]) ??
    getNumber(input.runtimeArtifacts, ["retargeting_vendor_count", "retargetingVendorCount"]) ??
    0;
  const retargetingVendorCount =
    requestRows.length > 0 || rawRetargetingVendors.length > 0
      ? Math.max(retargetingRequestRows.length, retargetingVendors.length)
      : Math.max(fallbackCategoryCount, rawRetargetingVendorCount);

  if (retargetingVendorCount > 0 || retargetingVendors.length > 0) {
    return makeOutcome(
      "retargeting_behavioral_advertising_signal_observed",
      "Review signal",
      "Retargeting or behavioral advertising evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm whether the retained signal reflects cross-site profiling, audience matching, identity sync, or remarketing.",
      [
        retargetingVendorCount > 0 ? `Retargeting/behavioral advertising vendor count: ${retargetingVendorCount}` : null,
        ...retargetingVendors.map((vendor) => `Retargeting/behavioral advertising vendor: ${vendor}`).slice(0, 5),
        "Evidence: retained runtime vendor summary"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          filteredNonRetargetingBehavioralAdvertisingVendors: compactArray(filteredNonRetargetingVendors, 8),
          firstRetargetingBehavioralAdvertisingVendorObservedMs: observedMs[0] ?? null,
          observedRuntimeSignalOnly: true,
          preconsentPurposeRiskMix: retainedPurposeMix,
          retargetingBehavioralAdvertisingEvidenceCauses: retargetingEvidenceCauses,
          retargetingBehavioralAdvertisingVendorCount: retargetingVendorCount,
          retargetingBehavioralAdvertisingVendorObservedMs: compactArray(observedMs, 6),
          retargetingBehavioralAdvertisingVendors: compactArray(retargetingVendors, 8)
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || vendorSummary || requestRows.length > 0 || rawRetargetingVendors.length > 0) {
    return makeOutcome(
      "retargeting_behavioral_advertising_signal_observed",
      "Not observed",
      "Runtime vendor checks completed for the tested context and did not retain a retargeting or behavioral advertising vendor classification.",
      ["Evidence: retained runtime vendor summary"],
      {
        retainedEvidence: {
          filteredNonRetargetingBehavioralAdvertisingVendors: compactArray(filteredNonRetargetingVendors, 8),
          preconsentPurposeRiskMix: retainedPurposeMix,
          retargetingBehavioralAdvertisingEvidenceCauses: [],
          retargetingBehavioralAdvertisingVendorCount: 0,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  return null;
}

function deriveAnalyticsVendorObservedOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const vendorSummary = getObject(hybridRuntimeEvidence, ["vendorSummary", "vendor_summary"]);
  const vendorCategoryCounts = getObject(vendorSummary, ["vendorCategoryCounts", "vendor_category_counts"]);
  const requestRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const rawAnalyticsRequestRows = requestRows.filter((row) =>
    ["analytics", "measurement"].includes(getString(row, ["category", "vendorCategory", "vendor_category"]) ?? "")
  );
  const marketingAnalyticsRequestRows = requestRows.filter((row) => rowHasPurposeRisk(row, ["marketingAnalytics"]));
  const performanceRumRequestRows = requestRows.filter((row) => rowHasPurposeRisk(row, ["performanceRum"]));
  const analyticsRequestRows = [...marketingAnalyticsRequestRows, ...performanceRumRequestRows];
  const observedMs = getRuntimeRowObservedMs(analyticsRequestRows, input.runtimeArtifacts);
  const rawAnalyticsVendors = getStringArray(input.runtimeArtifacts, [
    "analytics_vendor_names",
    "analyticsVendorNames"
  ]);
  const marketingAnalyticsVendorRows = rawAnalyticsVendors
    .map(createPurposeRowFromVendorName)
    .filter((row) => rowHasPurposeRisk(row, ["marketingAnalytics"]));
  const performanceRumVendorRows = rawAnalyticsVendors
    .map(createPurposeRowFromVendorName)
    .filter((row) => rowHasPurposeRisk(row, ["performanceRum"]));
  const analyticsVendors = uniqueStrings([
    ...marketingAnalyticsRequestRows.map(getRuntimePurposeVendor),
    ...performanceRumRequestRows.map(getRuntimePurposeVendor),
    ...marketingAnalyticsVendorRows.map(getRuntimePurposeVendor),
    ...performanceRumVendorRows.map(getRuntimePurposeVendor)
  ]);
  const performanceRumVendors = uniqueStrings([
    ...performanceRumRequestRows.map(getRuntimePurposeVendor),
    ...performanceRumVendorRows.map(getRuntimePurposeVendor)
  ]);
  const retainedPurposeMix = buildPreconsentPurposeRiskMix([
    ...requestRows,
    ...rawAnalyticsVendors.map(createPurposeRowFromVendorName)
  ]);
  const rawAnalyticsCount = getNumber(vendorCategoryCounts, ["analytics", "measurement"]) ?? 0;
  const analyticsCount =
    requestRows.length > 0 || rawAnalyticsVendors.length > 0
      ? analyticsVendors.length
      : rawAnalyticsCount;

  if (analyticsCount > 0 || analyticsVendors.length > 0) {
    return makeOutcome(
      "analytics_vendor_observed",
      "Review signal",
      performanceRumVendors.length > 0 && marketingAnalyticsRequestRows.length === 0 && marketingAnalyticsVendorRows.length === 0
        ? "Performance/RUM analytics evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm whether this activity is essential under the applicable consent model."
        : "Analytics or measurement vendor evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm purpose and consent relevance.",
      [
        analyticsCount > 0 ? `Analytics vendor/category count: ${analyticsCount}` : null,
        ...performanceRumVendors.map((vendor) => `Performance/RUM vendor: ${vendor}`).slice(0, 5),
        ...analyticsVendors.map((vendor) => `Analytics vendor: ${vendor}`).slice(0, 5)
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          analyticsVendorCount: analyticsCount,
          analyticsVendorObservedMs: compactArray(observedMs, 6),
          firstAnalyticsVendorObservedMs: observedMs[0] ?? null,
          analyticsVendors: compactArray(analyticsVendors, 8),
          performanceRumVendors: compactArray(performanceRumVendors, 8),
          preconsentPurposeRiskMix: retainedPurposeMix
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || vendorSummary || requestRows.length > 0 || rawAnalyticsVendors.length > 0) {
    return makeOutcome(
      "analytics_vendor_observed",
      "Not observed",
      "Runtime vendor checks completed for the tested context and did not retain an analytics or measurement vendor classification.",
      ["Evidence: retained runtime vendor summary"],
      {
        retainedEvidence: {
          analyticsVendorCount: 0,
          filteredNonMarketingAnalyticsVendors: compactArray(uniqueStrings([
            ...rawAnalyticsRequestRows
              .filter((row) => !rowHasPurposeRisk(row, ["marketingAnalytics", "performanceRum"]))
              .map(getRuntimePurposeVendor),
            ...rawAnalyticsVendors
              .map(createPurposeRowFromVendorName)
              .filter((row) => !rowHasPurposeRisk(row, ["marketingAnalytics", "performanceRum"]))
              .map(getRuntimePurposeVendor)
          ]), 8),
          preconsentPurposeRiskMix: retainedPurposeMix,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  return null;
}

const EMBEDDED_CONTENT_HOST_PATTERNS = [
  /(^|\.)youtube(?:-nocookie)?\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)google\.[a-z.]+$/i,
  /(^|\.)googleapis\.com$/i,
  /(^|\.)openstreetmap\.org$/i,
  /(^|\.)spotify\.com$/i,
  /(^|\.)soundcloud\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)typeform\.com$/i,
  /(^|\.)calendly\.com$/i,
  /(^|\.)hubspot(?:usercontent)?\.com$/i
];

function getHostnameFromMaybeUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").replace(/^www\./i, "").toLowerCase() || null;
  }
}

function isLikelyCmpLocatorFrame(row: Record<string, unknown>) {
  const text = [
    getString(row, ["frameName", "frame_name"]),
    getString(row, ["frameUrl", "frame_url", "url"]),
    getString(row, ["hostname"])
  ].filter(Boolean).join(" ");
  return /about:blank|__tcfapiLocator|__uspapiLocator|__pb_locator__|onetrust|optanon|sourcepoint|privacy-center|consent/i.test(text);
}

function isKnownEmbeddedThirdPartyFrame(row: Record<string, unknown>) {
  if (isLikelyCmpLocatorFrame(row)) {
    return false;
  }
  const frameUrl = getString(row, ["frameUrl", "frame_url", "url"]);
  const hostname = getHostnameFromMaybeUrl(getString(row, ["hostname"]) ?? frameUrl);
  const thirdParty = getBoolean(row, ["thirdParty", "third_party"]) === true;
  const preConsent = getBoolean(row, ["preConsent", "pre_consent"]) !== false &&
    getString(row, ["consentStateAtTime", "consent_state_at_time", "runtimePhase", "runtime_phase"]) !== "post_consent";
  const pathText = frameUrl ?? "";
  const knownHost = Boolean(hostname && EMBEDDED_CONTENT_HOST_PATTERNS.some((pattern) => pattern.test(hostname)));
  const knownEmbedPath = /\/embed\/|\/plugins\/|\/maps\/embed|\/widgets?\//i.test(pathText);
  return preConsent && thirdParty && knownHost && (knownEmbedPath || !/google\.[a-z.]+$/i.test(hostname ?? ""));
}

function classifyEmbeddedContentPurpose(hostname: string | null | undefined, url?: string | null) {
  const text = `${hostname ?? ""} ${url ?? ""}`.toLowerCase();
  if (/imasdk\.googleapis\.com|ima3\.js|googletagservices\.com|gampad|doubleclick\.net|googleads\.g\.doubleclick\.net|brightline\.tv|freewheel|ad[-.]tech|video.*ad|ad.*video/.test(text)) {
    return "videoAdSdk";
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|typekit\.net|use\.typekit\.net/.test(text)) {
    return "fontStaticResource";
  }
  if (/youtube(?:-nocookie)?\.com|youtu\.be|ytimg\.com|vimeo\.com|spotify\.com|soundcloud\.com/.test(text)) {
    return "mediaEmbed";
  }
  if (/maps\/embed|google\.[a-z.]+\/maps|openstreetmap\.org/.test(text)) {
    return "mapEmbed";
  }
  if (/facebook\.com|connect\.facebook\.net|instagram\.com|tiktok\.com|analytics\.tiktok\.com|linkedin\.com|px\.ads\.linkedin\.com|twitter\.com|x\.com|platform\.twitter\.com|pinterest\.com|assets\.pinterest\.com|reddit\.com|redditstatic\.com|disqus\.com/.test(text)) {
    return "socialEmbed";
  }
  if (/typeform\.com|calendly\.com|hubspot(?:usercontent)?\.com|chat|widget/.test(text)) {
    return "formOrChatWidget";
  }
  return "otherEmbeddedContent";
}

function isSocialMediaEmbeddedContentBucket(bucket: string) {
  return bucket === "mediaEmbed" || bucket === "socialEmbed";
}

function isStaticSocialMediaAssetInitiator(initiatorType: string | null) {
  return Boolean(initiatorType && /^(?:image|img|stylesheet|css|font|icon|other)$/i.test(initiatorType));
}

function isStrongSocialMediaEmbedInitiator(initiatorType: string | null) {
  return Boolean(initiatorType && /^(?:iframe|script|embed|object|pixel|beacon|fetch|xhr|xmlhttprequest|subdocument)$/i.test(initiatorType));
}

function getRuntimeObservationUrl(row: Record<string, unknown>) {
  return getString(row, [
    "frameUrl",
    "frame_url",
    "requestUrl",
    "request_url",
    "representativeUrl",
    "representative_url",
    "scriptUrl",
    "script_url",
    "url"
  ]);
}

function getRuntimeObservationHost(row: Record<string, unknown>) {
  return getHostnameFromMaybeUrl(
    getString(row, ["hostname", "host", "domain", "registrableDomain", "registrable_domain"]) ??
      getRuntimeObservationUrl(row)
  );
}

function getRuntimeObservationInitiatorType(row: Record<string, unknown>, fallback: string | null = null) {
  return getString(row, [
    "initiatorType",
    "initiator_type",
    "resourceType",
    "resource_type",
    "requestType",
    "request_type",
    "elementType",
    "element_type"
  ]) ?? fallback;
}

function rowHasPostConsentState(row: Record<string, unknown>) {
  if (getBoolean(row, ["preConsent", "pre_consent", "beforeConsent", "before_consent"]) === false) {
    return true;
  }
  return /post[_ -]?consent|post[_ -]?accept|after[_ -]?consent|after[_ -]?accept/i.test([
    getString(row, ["consentStateAtTime", "consent_state_at_time", "consentState", "consent_state"]),
    getString(row, ["runtimePhase", "runtime_phase", "pagePhase", "page_phase"])
  ].filter(Boolean).join(" "));
}

function rowHasUserActionBeforeLoad(row: Record<string, unknown>) {
  return getBoolean(row, ["userActionBeforeLoad", "user_action_before_load", "userActionOccurredBeforeLoad", "user_action_occurred_before_load"]) === true;
}

function hostMatchesSocialMediaProvider(host: string | null, providerDomain: string) {
  return Boolean(host && (host === providerDomain || host.endsWith(`.${providerDomain}`)));
}

function getSocialMediaProviderName(host: string | null) {
  if (hostMatchesSocialMediaProvider(host, "youtube.com") || hostMatchesSocialMediaProvider(host, "youtube-nocookie.com") || hostMatchesSocialMediaProvider(host, "youtu.be") || hostMatchesSocialMediaProvider(host, "ytimg.com")) {
    return "YouTube";
  }
  if (hostMatchesSocialMediaProvider(host, "vimeo.com")) return "Vimeo";
  if (hostMatchesSocialMediaProvider(host, "facebook.com") || hostMatchesSocialMediaProvider(host, "connect.facebook.net")) return "Meta/Facebook";
  if (hostMatchesSocialMediaProvider(host, "instagram.com") || hostMatchesSocialMediaProvider(host, "cdninstagram.com")) return "Instagram";
  if (hostMatchesSocialMediaProvider(host, "tiktok.com") || hostMatchesSocialMediaProvider(host, "analytics.tiktok.com") || hostMatchesSocialMediaProvider(host, "tiktokw.us")) return "TikTok";
  if (hostMatchesSocialMediaProvider(host, "linkedin.com") || hostMatchesSocialMediaProvider(host, "px.ads.linkedin.com") || hostMatchesSocialMediaProvider(host, "dc.ads.linkedin.com")) return "LinkedIn";
  if (hostMatchesSocialMediaProvider(host, "twitter.com") || hostMatchesSocialMediaProvider(host, "x.com") || hostMatchesSocialMediaProvider(host, "platform.twitter.com") || hostMatchesSocialMediaProvider(host, "static.ads-twitter.com") || hostMatchesSocialMediaProvider(host, "analytics.twitter.com") || hostMatchesSocialMediaProvider(host, "t.co")) return "X/Twitter";
  if (hostMatchesSocialMediaProvider(host, "pinterest.com") || hostMatchesSocialMediaProvider(host, "assets.pinterest.com") || hostMatchesSocialMediaProvider(host, "ct.pinterest.com")) return "Pinterest";
  if (hostMatchesSocialMediaProvider(host, "reddit.com") || hostMatchesSocialMediaProvider(host, "redditstatic.com") || hostMatchesSocialMediaProvider(host, "pixel-config.reddit.com") || hostMatchesSocialMediaProvider(host, "alb.reddit.com")) return "Reddit";
  if (hostMatchesSocialMediaProvider(host, "disqus.com") || hostMatchesSocialMediaProvider(host, "ssp.disqus.com")) return "Disqus";
  if (hostMatchesSocialMediaProvider(host, "spotify.com") || hostMatchesSocialMediaProvider(host, "pixels.spotify.com") || hostMatchesSocialMediaProvider(host, "pixel.byspotify.com")) return "Spotify";
  if (hostMatchesSocialMediaProvider(host, "soundcloud.com")) return "SoundCloud";
  return null;
}

function rowHasSocialMediaPixelPurpose(row: Record<string, unknown>) {
  const host = getRuntimeObservationHost(row);
  if (!getSocialMediaProviderName(host)) {
    return false;
  }
  const text = [
    getString(row, ["category", "vendorCategory", "vendor_category", "purpose", "vendorPurpose", "vendor_purpose"]),
    getString(row, ["name", "vendor", "vendorName", "vendor_name", "product"]),
    host,
    getRuntimeObservationUrl(row)
  ].filter(Boolean).join(" ").toLowerCase();
  return /social[_ -]?pixel|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag|reddit pixel|twitter pixel|x pixel|spotify pixel|pixel-config\.reddit|redditstatic\.com\/ads\/pixel|connect\.facebook\.net\/.*fbevents|px\.ads\.linkedin\.com|analytics\.tiktok\.com|ct\.pinterest\.com|static\.ads-twitter\.com|analytics\.twitter\.com|t\.co\/.*adsct|pixels?\.spotify\.com/.test(text);
}

function buildSocialMediaEmbedObservation(row: Record<string, unknown>, source: string, fallbackInitiatorType: string | null = null) {
  if (rowHasPostConsentState(row) || rowHasUserActionBeforeLoad(row)) {
    return null;
  }
  const requestUrl = getRuntimeObservationUrl(row);
  const host = getRuntimeObservationHost(row);
  if (!host && !requestUrl) {
    return null;
  }
  const provider = getSocialMediaProviderName(host);
  if (!provider) {
    return null;
  }
  const providerCategory = rowHasSocialMediaPixelPurpose(row)
    ? "social_pixel"
    : classifyEmbeddedContentPurpose(host, requestUrl);
  const socialMediaProvider =
    providerCategory === "social_pixel" ||
    isSocialMediaEmbeddedContentBucket(providerCategory);
  if (!socialMediaProvider) {
    return null;
  }
  const initiatorType = getRuntimeObservationInitiatorType(row, fallbackInitiatorType);
  const cookiesSet = getStringArray(row, ["cookiesSet", "cookies_set", "cookieNamesSet", "cookie_names_set"]);
  const setCookieMetadata = getObjectArray(row, ["setCookieMetadata", "set_cookie_metadata"]);
  const storageTouched =
    getBoolean(row, ["storageTouched", "storage_touched", "localStorageTouched", "local_storage_touched", "sessionStorageTouched", "session_storage_touched"]) === true;
  const placeholderDetected =
    getBoolean(row, ["placeholderDetected", "placeholder_detected", "consentPlaceholderDetected", "consent_placeholder_detected"]) === true;
  const firstSeenMs = getNumber(row, [
    "firstSeenMs",
    "first_seen_ms",
    "firstObservedMs",
    "first_observed_ms",
    "observedAtMs",
    "observed_at_ms",
    "timestampMs",
    "timestamp_ms",
    "tsMs",
    "ts_ms"
  ]);
  const strongInitiator =
    isStrongSocialMediaEmbedInitiator(initiatorType) ||
    providerCategory === "social_pixel" ||
    rowHasSocialMediaPixelPurpose(row);
  const staticAssetOnly =
    !strongInitiator &&
    isStaticSocialMediaAssetInitiator(initiatorType) &&
    cookiesSet.length === 0 &&
    setCookieMetadata.length === 0 &&
    !storageTouched;

  return compactRecord({
    cookiesSet: compactArray(cookiesSet, 6),
    domain: host,
    firstSeenMs,
    initiatorType,
    pageUrlSharedViaReferrer: getBoolean(row, ["pageUrlSharedViaReferrer", "page_url_shared_via_referrer"]),
    placeholderDetected,
    placeholderIneffective: placeholderDetected,
    provider,
    providerCategory,
    referrerSent: getBoolean(row, ["referrerSent", "referrer_sent"]),
    requestUrl,
    setCookieMetadataCount: setCookieMetadata.length,
    source,
    staticAssetOnly,
    storageTouched,
    strongInitiator,
    userActionBeforeLoad: false,
    visibleElement: getBoolean(row, ["visibleElement", "visible_element"])
  });
}

function buildEmbeddedContentPurposeBuckets(rows: Record<string, unknown>[], hosts: string[]) {
  const buckets: Record<string, string[]> = {
    fontStaticResource: [],
    formOrChatWidget: [],
    mapEmbed: [],
    mediaEmbed: [],
    otherEmbeddedContent: [],
    socialEmbed: [],
    videoAdSdk: []
  };
  const addBucketHost = (bucket: string, host: string) => {
    if (bucket === "otherEmbeddedContent") {
      const alreadyClassified = Object.entries(buckets).some(([existingBucket, existingHosts]) =>
        existingBucket !== "otherEmbeddedContent" && existingHosts.includes(host)
      );
      if (alreadyClassified) {
        return;
      }
    } else {
      buckets.otherEmbeddedContent = (buckets.otherEmbeddedContent ?? []).filter((existingHost) => existingHost !== host);
    }
    buckets[bucket] = uniqueStrings([...(buckets[bucket] ?? []), host]);
  };
  for (const row of rows) {
    const url = getString(row, ["frameUrl", "frame_url", "requestUrl", "request_url", "url"]);
    const host = getHostnameFromMaybeUrl(getString(row, ["hostname", "host", "domain"]) ?? url);
    if (!host) {
      continue;
    }
    const bucket = classifyEmbeddedContentPurpose(host, url);
    addBucketHost(bucket, host);
  }
  for (const host of hosts) {
    const bucket = classifyEmbeddedContentPurpose(host);
    addBucketHost(bucket, host);
  }
  return buckets;
}

function getEmbeddedPurposeBucketEntries(buckets: Record<string, unknown> | null | undefined) {
  return Object.entries(buckets ?? {})
    .flatMap(([bucket, hosts]) =>
      Array.isArray(hosts)
        ? hosts
          .filter((host): host is string => typeof host === "string" && host.trim().length > 0)
          .map((host) => ({ bucket, host }))
        : []
    );
}

function isHighConfidenceThirdPartyServiceBucket(bucket: string) {
  return [
    "formOrChatWidget",
    "mapEmbed",
    "mediaEmbed",
    "socialEmbed",
    "videoAdSdk"
  ].includes(bucket);
}

function getEmbeddedThirdPartyEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const embeddedSummary = getEmbeddedContentEvidenceSummary(input);
  const iframeSummary = getObject(hybridRuntimeEvidence, ["iframeSummary", "iframe_summary"]);
  const iframeRows = [
    ...getObjectArray(iframeSummary, ["iframeEvents", "iframe_events"]),
    ...getObjectArray(input.runtimeArtifacts, ["iframeEvents", "iframe_events"])
  ];
  const embeddedRows = iframeRows.filter(isKnownEmbeddedThirdPartyFrame);
  const summaryObservations = getObjectArray(embeddedSummary, ["observations"]);
  const eligibleSummaryObservations = summaryObservations.filter((row) => {
    const url = getString(row, ["frameUrl", "frame_url", "requestUrl", "request_url", "url"]);
    const host = getHostnameFromMaybeUrl(getString(row, ["hostname", "host", "domain"]) ?? url);
    return classifyEmbeddedContentPurpose(host, url) !== "fontStaticResource";
  });
  const preConsentIframeCount =
    getNumber(iframeSummary, ["preConsentIframeCount", "pre_consent_iframe_count"]) ??
    iframeRows.filter((row) => getBoolean(row, ["preConsent", "pre_consent"]) === true).length;
  const embeddedHosts = uniqueStrings([
    ...embeddedRows.map((row) =>
      getHostnameFromMaybeUrl(getString(row, ["hostname"]) ?? getString(row, ["frameUrl", "frame_url", "url"]))
    ),
    ...getStringArray(embeddedSummary, ["embeddedContentHosts", "embedded_content_hosts"]),
    ...summaryObservations.map((row) =>
      getHostnameFromMaybeUrl(getString(row, ["hostname"]) ?? getString(row, ["frameUrl", "frame_url", "requestUrl", "request_url", "url"]))
    )
  ]);
  const observedMs = getSortedUniqueMs([
    ...getRuntimeRowObservedMs([...embeddedRows, ...summaryObservations], input.runtimeArtifacts),
    getRuntimeObservedMs(embeddedSummary, [
      "firstEmbeddedContentObservedMs",
      "first_embedded_content_observed_ms",
      "firstObservedMs",
      "first_observed_ms",
      "firstSeenMs",
      "first_seen_ms",
      "observedAtMs",
      "observed_at_ms"
    ], getNumber(getHybridTimelineMarkers(input.runtimeArtifacts), ["navigationStartMs", "navigation_start_ms"]))
  ]);
  const purposeBuckets = getObject(embeddedSummary, ["embeddedContentPurposeBuckets", "embedded_content_purpose_buckets"]) ??
    buildEmbeddedContentPurposeBuckets([...embeddedRows, ...summaryObservations], embeddedHosts);
  const contentPurposeEntries = getEmbeddedPurposeBucketEntries(purposeBuckets)
    .filter((entry) => entry.bucket !== "fontStaticResource");
  const summaryObserved = embeddedRows.length > 0 ||
    eligibleSummaryObservations.length > 0 ||
    contentPurposeEntries.length > 0;
  const purposeEntries = getEmbeddedPurposeBucketEntries(purposeBuckets);
  const highConfidenceServiceHosts = uniqueStrings(
    purposeEntries
      .filter((entry) => isHighConfidenceThirdPartyServiceBucket(entry.bucket))
      .map((entry) => entry.host)
  );
  const highConfidenceObservations = [...embeddedRows, ...summaryObservations].filter((row) => {
    const url = getString(row, ["frameUrl", "frame_url", "requestUrl", "request_url", "url"]);
    const host = getHostnameFromMaybeUrl(getString(row, ["hostname", "host", "domain"]) ?? url);
    if (!host) {
      return false;
    }
    return isHighConfidenceThirdPartyServiceBucket(classifyEmbeddedContentPurpose(host, url));
  });
  return {
    embeddedHosts,
    embeddedRows,
    highConfidenceObservations,
    highConfidenceServiceHosts,
    iframeRows,
    observedMs,
    preConsentIframeCount,
    purposeBuckets,
    contentPurposeEntries,
    eligibleSummaryObservations,
    summaryObservations,
    summaryObserved
  };
}

function getSocialMediaEmbedPreConsentEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const embeddedEvidence = getEmbeddedThirdPartyEvidence(input);
  const embeddedSummary = getEmbeddedContentEvidenceSummary(input);
  const requestRows = [
    ...getObjectArray(hybridRuntimeEvidence, [
      "requestPurposeClassificationConfidence",
      "request_purpose_classification_confidence"
    ]),
    ...getObjectArray(hybridRuntimeEvidence, [
      "preconsentState0RequestObservations",
      "preconsent_state0_request_observations"
    ]),
    ...getObjectArray(hybridRuntimeEvidence, [
      "requestObservations",
      "request_observations"
    ])
  ];
  const observations = [
    ...embeddedEvidence.embeddedRows.map((row) => buildSocialMediaEmbedObservation(row, "iframe_inventory", "iframe")),
    ...embeddedEvidence.summaryObservations.map((row) => buildSocialMediaEmbedObservation(row, "embedded_content_summary")),
    ...requestRows.map((row) => buildSocialMediaEmbedObservation(row, "preconsent_request_classification"))
  ].filter((row): row is Record<string, unknown> => Boolean(row));
  const deduped = Array.from(
    observations
      .reduce((map, row) => {
        const key = getString(row, ["requestUrl", "domain", "provider"]) ?? JSON.stringify(row);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, row);
          return map;
        }
        map.set(key, {
          ...existing,
          ...row,
          strongInitiator: getBoolean(existing, ["strongInitiator"]) === true || getBoolean(row, ["strongInitiator"]) === true,
          staticAssetOnly: getBoolean(existing, ["staticAssetOnly"]) === true && getBoolean(row, ["staticAssetOnly"]) === true
        });
        return map;
      }, new Map<string, Record<string, unknown>>())
      .values()
  );
  const strongObservations = deduped.filter((row) => getBoolean(row, ["strongInitiator"]) === true);
  const staticAssetObservations = deduped.filter((row) => getBoolean(row, ["staticAssetOnly"]) === true);
  const placeholderDetected =
    getBoolean(embeddedSummary, ["placeholderDetected", "placeholder_detected", "socialMediaPlaceholderDetected", "social_media_placeholder_detected"]) === true ||
    deduped.some((row) => getBoolean(row, ["placeholderDetected"]) === true);
  const observedMs = getSortedUniqueMs([
    ...deduped.map((row) => getNumber(row, ["firstSeenMs", "first_seen_ms"]))
  ]);
  const providerCategories = uniqueStrings(
    deduped.map((row) => getString(row, ["providerCategory", "provider_category"]))
  );
  const providers = uniqueStrings(deduped.map((row) => getString(row, ["provider"])));
  const domains = uniqueStrings(deduped.map((row) => getString(row, ["domain"])));
  return {
    domains,
    observedMs,
    observations: deduped,
    placeholderDetected,
    providerCategories,
    providers,
    staticAssetObservations,
    strongObservations
  };
}

function formatSocialMediaEmbedEvidencePhrase(input: {
  domains: string[];
  observedMs: number[];
  providers: string[];
}) {
  const names = compactArray(input.providers.length > 0 ? input.providers : input.domains, 5);
  const providers = names.length > 0
    ? ` Providers/domains observed: ${names.join(", ")}`
    : "";
  const timing = input.observedMs[0] !== undefined
    ? `${names.length > 0 ? "; first" : " First"} seen ${formatElapsedSeconds(input.observedMs[0])} after scan start`
    : "";
  return providers || timing ? `${providers}${timing}.` : "";
}

function deriveSocialMediaEmbedPreConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getSocialMediaEmbedPreConsentEvidence(input);
  const evidencePhrase = formatSocialMediaEmbedEvidencePhrase(evidence);
  const retainedEvidence = {
    firstSocialMediaEmbedObservedMs: evidence.observedMs[0] ?? null,
    placeholderDetected: evidence.placeholderDetected,
    providerCategories: compactArray(evidence.providerCategories, 8),
    providers: compactArray(evidence.providers, 8),
    socialMediaEmbedDomains: compactArray(evidence.domains, 8),
    socialMediaEmbedObservedMs: compactArray(evidence.observedMs, 6),
    socialMediaEmbedObservations: compactArray(evidence.observations, 8)
  };

  if (evidence.strongObservations.length > 0) {
    return makeOutcome(
      "social_media_embed_pre_consent",
      "Gap observed",
      evidence.placeholderDetected
        ? `A social/media embed, plugin, widget, or pixel provider loaded before a recorded consent action even though placeholder-style blocking evidence was retained.${evidencePhrase}`
        : `A social/media embed, plugin, widget, or pixel provider loaded before any recorded consent choice in retained network/runtime evidence.${evidencePhrase}`,
      [
        `Social/media provider observations: ${evidence.strongObservations.length}`,
        ...evidence.providers.map((provider) => `Provider: ${provider}`).slice(0, 5),
        ...evidence.domains.map((domain) => `Domain: ${domain}`).slice(0, 5),
        "Evidence: retained pre-consent social/media network or iframe observation"
      ],
      {
        retainedEvidence: {
          ...retainedEvidence,
          placeholderIneffective: evidence.placeholderDetected
        }
      }
    );
  }

  if (evidence.staticAssetObservations.length > 0) {
    return makeOutcome(
      "social_media_embed_pre_consent",
      "Review signal",
      `A 3rd party social/media asset request was retained before consent, but the retained evidence did not show an iframe, script, plugin, pixel, cookie/storage write, or other stronger embed behavior.${evidencePhrase}`,
      [
        `Static social/media asset observations: ${evidence.staticAssetObservations.length}`,
        ...evidence.providers.map((provider) => `Provider: ${provider}`).slice(0, 5),
        "Evidence: retained pre-consent social/media asset request"
      ],
      {
        retainedEvidence
      }
    );
  }

  if (hasEmbeddedContentRuntimeCoverage(input)) {
    return makeOutcome(
      "social_media_embed_pre_consent",
      "Not observed",
      evidence.placeholderDetected
        ? "Retained embedded-content checks found placeholder-style blocking and did not retain a social/media provider request before consent."
        : "Retained embedded-content checks did not show a social/media embed, plugin, widget, or pixel provider request before consent. Plain outbound links are not treated as evidence for this row.",
      ["Evidence: retained pre-consent embedded-content inventory"],
      {
        retainedEvidence: {
          placeholderDetected: evidence.placeholderDetected,
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          socialMediaEmbedObservationCount: 0
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "social_media_embed_pre_consent",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include enough row-specific social/media embed request, timing, or initiator evidence.",
      ["Evidence gap: social/media embed inventory not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.embeddedContentSummary",
            "row-specific social/media embed request, timing, and initiator evidence",
            "missing",
            "Required to determine whether social/media embeds or plugins loaded before consent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveEmbeddedThirdPartyContentPreConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const {
    embeddedHosts,
    embeddedRows,
    eligibleSummaryObservations,
    observedMs,
    preConsentIframeCount,
    purposeBuckets,
    summaryObserved
  } = getEmbeddedThirdPartyEvidence(input);

  if (embeddedRows.length > 0 || summaryObserved) {
    return makeOutcome(
      "embedded_content_pre_consent",
      "Observed",
      "Concrete 3rd party embedded content was retained before consent in iframe/runtime evidence.",
      [
        `Embedded 3rd party content observations: ${Math.max(embeddedRows.length, eligibleSummaryObservations.length)}`,
        ...embeddedHosts.map((host) => `Embedded host: ${host}`).slice(0, 5),
        "Evidence: retained pre-consent embedded-content observations"
      ],
      {
        retainedEvidence: {
          embeddedContentHosts: compactArray(embeddedHosts, 8),
          embeddedContentObservedMs: compactArray(observedMs, 6),
          embeddedContentObservationCount:
            Math.max(embeddedRows.length, eligibleSummaryObservations.length),
          embeddedContentPurposeBuckets: purposeBuckets,
          firstEmbeddedContentObservedMs: observedMs[0] ?? null,
          observedRuntimeSignalOnly: true
        }
      }
    );
  }

  if (hasEmbeddedContentRuntimeCoverage(input)) {
    return makeOutcome(
      "embedded_content_pre_consent",
      "Not observed",
      "Iframe/runtime checks completed for the tested context and did not retain a concrete 3rd party embedded-content iframe before consent.",
      ["Evidence: retained pre-consent embedded-content inventory"],
      {
        retainedEvidence: {
          embeddedContentObservationCount: 0,
          preConsentIframeCount: preConsentIframeCount ?? 0,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "embedded_content_pre_consent",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include row-specific embedded-content iframe/request inventory.",
      ["Evidence gap: embedded-content inventory not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.embeddedContentSummary",
            "row-specific embedded-content iframe/request inventory",
            "missing",
            "Required to determine whether 3rd party embedded content loaded before consent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveThirdPartyIframePreConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getEmbeddedThirdPartyEvidence(input);
  const observedCount = evidence.embeddedRows.length;

  if (observedCount > 0) {
    return makeOutcome(
      "third_party_iframe_pre_consent",
      "Gap observed",
      "Known 3rd party iframe embeds were retained before a recorded consent action on the scanned page.",
      [
        `3rd party iframe observations: ${observedCount}`,
        ...evidence.embeddedHosts.map((host) => `Iframe host: ${host}`).slice(0, 5),
        "Evidence: retained pre-consent iframe inventory"
      ],
      {
        retainedEvidence: {
          embeddedContentHosts: compactArray(evidence.embeddedHosts, 8),
          embeddedContentObservedMs: compactArray(evidence.observedMs, 6),
          embeddedContentPurposeBuckets: evidence.purposeBuckets,
          firstEmbeddedContentObservedMs: evidence.observedMs[0] ?? null,
          iframeObservationCount: observedCount,
          preConsentIframeCount: evidence.preConsentIframeCount ?? observedCount
        }
      }
    );
  }

  if (hasEmbeddedContentRuntimeCoverage(input)) {
    return makeOutcome(
      "third_party_iframe_pre_consent",
      "Not observed",
      "Retained iframe inventory did not show known 3rd party iframe embeds before a recorded consent action.",
      ["Evidence: retained pre-consent iframe inventory"],
      {
        retainedEvidence: {
          iframeObservationCount: 0,
          preConsentIframeCount: evidence.preConsentIframeCount ?? 0,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "third_party_iframe_pre_consent",
      "Not testable",
      "Runtime capture completed, but row-specific 3rd party iframe inventory was not retained.",
      ["Evidence gap: 3rd party iframe inventory not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.hybridRuntimeEvidence.iframeSummary",
            "row-specific 3rd party iframe inventory",
            "missing",
            "Required to determine whether known 3rd party iframes loaded before consent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveThirdPartyServiceConnectionPreConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getEmbeddedThirdPartyEvidence(input);
  const observedCount = evidence.highConfidenceObservations.length;

  if (observedCount > 0) {
    return makeOutcome(
      "third_party_service_connection_pre_consent",
      "Gap observed",
      "Known embedded 3rd party service connections were retained before a recorded consent action on the scanned page.",
      [
        `3rd party service observations: ${observedCount}`,
        ...evidence.highConfidenceServiceHosts.map((host) => `Service host: ${host}`).slice(0, 5),
        "Evidence: retained pre-consent embedded-service requests/iframes"
      ],
      {
        retainedEvidence: {
          embeddedContentHosts: compactArray(evidence.highConfidenceServiceHosts, 8),
          embeddedContentObservedMs: compactArray(evidence.observedMs, 6),
          embeddedContentPurposeBuckets: evidence.purposeBuckets,
          firstEmbeddedContentObservedMs: evidence.observedMs[0] ?? null,
          serviceConnectionObservationCount: observedCount
        }
      }
    );
  }

  if (hasEmbeddedContentRuntimeCoverage(input)) {
    return makeOutcome(
      "third_party_service_connection_pre_consent",
      "Not observed",
      "Retained iframe/request inventory did not show known embedded 3rd party service connections before a recorded consent action.",
      ["Evidence: retained pre-consent embedded-service inventory"],
      {
        retainedEvidence: {
          embeddedContentObservationCount: 0,
          runtimeCaptureCompleted: hasRuntimeCapture(input)
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "third_party_service_connection_pre_consent",
      "Not testable",
      "Runtime capture completed, but row-specific embedded-service request/iframe inventory was not retained.",
      ["Evidence gap: embedded-service inventory not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.embeddedContentSummary",
            "row-specific embedded-service request/iframe inventory",
            "missing",
            "Required to determine whether known 3rd party services connected before consent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveRejectPathOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const cmpEvidence = getCmpFrameworkSignalEvidence(input);
  const consentAuditEntry = getEventMetadata(input.events, "consent_audit_entry");
  const rejectDiagnostic = getEventMetadata(input.events, "reject_persistence_diagnostic");
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const attempted = getBoolean(consentAuditEntry, ["shouldAttemptConsentAudit"]) === true;
  const rejectButtonCount = getNumber(input.snapshot, ["consent_reject_button_count"]);
  const preferenceButtonCount = getNumber(input.snapshot, ["consent_preferences_button_count"]);
  const interactionModel = getString(input.snapshot, ["consent_interaction_model"]);
  const skipNegativeReasons = getStringArray(consentAuditEntry, ["consentInteractionSkipNegativeReasonCodes"]);
  const diagnosticNegativeReasons = getStringArray(rejectDiagnostic, ["negativeReasonCodes"]);
  const visibleRejectLabels = getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"])
    .filter((label) => /\b(?:decline|reject|refuse|deny|opt[-\s]?out|necessary only|only necessary|essential only|only essential|essential cookies only|accept essential|accept necessary)\b/i.test(label));
  const rejectAvailability = getString(rejectPath, [
    "availability",
    "status",
    "outcome",
    "rejectPathAvailabilityClassification",
    "reject_path_availability_classification"
  ]);
  const rejectInteractionSucceeded =
    getBoolean(rejectPath, ["rejectInteractionSucceeded", "reject_interaction_succeeded"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consent_reject_interaction_succeeded"]) === true;
  const rejectPathAvailable =
    rejectInteractionSucceeded ||
    getBoolean(rejectPath, ["completeRejectPathAvailable", "complete_reject_path_available"]) === true ||
    getBoolean(rejectPath, ["completeRejectPathDetected", "complete_reject_path_detected"]) === true ||
    getBoolean(rejectPath, ["rejectEquivalentFound", "reject_equivalent_found"]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true ||
    getBoolean(firstLayerChoices, ["rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) === true ||
    visibleRejectLabels.length > 0 ||
    rejectAvailability === "available" ||
    rejectAvailability === "reject_available_first_layer";
  const firstLayerGdprBannerConfirmed = getExplicitFirstLayerGdprConsentBannerConfirmed(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const firstLayerChoiceEvidence = getFirstLayerConsentChoiceEvidence(input);
  const firstLayerAcceptWithoutRejectObserved =
    firstLayerChoiceEvidence.bannerLikeSurfaceObserved &&
    firstLayerChoiceEvidence.cookieNoticeTextObserved &&
    firstLayerChoiceEvidence.acceptControlObserved &&
    !firstLayerChoiceEvidence.rejectControlObserved;
  
  if (noticeGateEvidence.gateObserved) {
    return makeOutcome(
      "reject_all_path_availability",
      "Gap observed",
      noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved
        ? "The retained first-layer privacy notice did not display a visible reject, decline, or reject-all option. Visible actions were privacy choices and Continue."
        : "The retained first-layer privacy notice did not display a visible reject or decline option. The only visible action was Continue.",
      [
        "Evidence: first-layer legal/privacy notice gate",
        ...noticeGateEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        noticeGateEvidence.layerInspected ? `Layer inspected: ${noticeGateEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          firstLayerPrivacyNoticeGateObserved: true,
          legalPrivacyNoticeGateObserved: true,
          managePreferencesObserved: false,
          onlyContinueActionObserved: true,
          privacyChoiceLabels: noticeGateEvidence.privacyChoiceLabels,
          privacyNoticeGateWithPrivacyChoicesObserved: noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved,
          rejectControlObserved: false,
          visibleChoiceLabels: noticeGateEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (firstLayerAcceptWithoutRejectObserved) {
    return makeOutcome(
      "reject_all_path_availability",
      "Gap observed",
      "A first-layer GDPR/ePrivacy cookie consent surface was retained with an accept option and non-essential cookie/purpose text, but no same-layer reject, decline, refuse, or continue-without-accepting option was retained. This is a first-layer availability signal only; CertScore did not run a consent flow.",
      [
        "Evidence: retained first-layer consent controls",
        ...firstLayerChoiceEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        firstLayerChoiceEvidence.layerInspected ? `Layer inspected: ${firstLayerChoiceEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          acceptControlObserved: true,
          firstLayerCookieConsentBannerObserved: true,
          gdprEprivacyConsentSurfaceObserved: "confirmed",
          layerInspected: firstLayerChoiceEvidence.layerInspected,
          rejectControlObserved: false,
          visibleChoiceLabels: firstLayerChoiceEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (firstLayerGdprBannerConfirmed === false) {
    const preconsentCookieOrTrackingActivityObserved = hasObservedPreconsentCookieOrTrackingActivity(input);
    if (
      !firstLayerChoiceEvidence.bannerLikeSurfaceObserved &&
      !preconsentCookieOrTrackingActivityObserved
    ) {
      return makeOutcome(
        "reject_all_path_availability",
        "Not observed",
        "No first-layer GDPR/ePrivacy consent banner was retained, and no non-essential cookie/tracking activity was observed in the tested context. Reject-option availability is therefore treated as neutral for this scan.",
        [
          "Evidence: no confirmed first-layer cookie consent banner",
          "Evidence: no retained non-essential cookie/tracking activity"
        ],
        {
          retainedEvidence: {
            firstLayerCookieConsentBannerObserved: false,
            gdprEprivacyConsentSurfaceObserved: "unconfirmed",
            preconsentCookieOrTrackingActivityObserved: false,
            reason: "no_banner_and_no_nonessential_activity"
          }
        }
      );
    }

    if (preconsentCookieOrTrackingActivityObserved) {
      return makeOutcome(
        "reject_all_path_availability",
        "Review signal",
        "CertScore scanned the page and retained pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer reject, decline, refuse, or continue-without-accepting option. Treat this as a partial concern unless retained first-layer controls also show an accept path without an equally available refusal path.",
        [
          "Evidence: retained pre-consent cookie/tracking activity",
          "Evidence: no structured first-layer reject option retained",
          "Reason: no_confirmed_first_layer_cookie_consent_banner"
        ],
        {
          retainedEvidence: {
            cmpSignalObserved: cmpEvidence.cmpObserved,
            cmpVendorName: cmpEvidence.cmpVendorName,
            consentSurfaceObserved: cmpEvidence.cmpObserved,
            firstLayerCookieConsentBannerObserved: false,
            gdprEprivacyConsentSurfaceObserved: "unconfirmed",
            preconsentCookieOrTrackingActivityObserved: true,
            reason: "no_reject_option_retained_with_preconsent_activity",
            rejectControlObserved: false,
            rejectPathAvailabilityEvidenceRetained: false
          }
        }
      );
    }

    return makeOutcome(
      "reject_all_path_availability",
      "Not confirmed",
      "A first-layer GDPR/ePrivacy cookie consent banner was not confirmed, so CertScore did not confirm an accept/reject consent surface for reject-path review. Footer privacy/ad-choice controls may still be relevant review context, but they do not establish a same-layer GDPR/ePrivacy reject path.",
      [
        "Evidence: consent surface demotion",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            false,
            "Required before CertScore can evaluate first-layer accept/reject availability."
          )
        ],
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          reason: "no_confirmed_first_layer_cookie_consent_banner"
        }
      }
    );
  }
  
  if (rejectPathAvailable) {
    const rejectClickDepth = getNumber(rejectPath, [
      "rejectClickDepth",
      "reject_click_depth",
      "observedRejectPathDepth",
      "observed_reject_path_depth"
    ]);
    const layerInspected = getString(rejectPath, ["layerInspected", "layer_inspected"]);
    const sameLayerDeclineObserved =
      layerInspected === "first_layer" &&
      visibleRejectLabels.some((label) => /\bdecline\b/i.test(label));
    const evidenceRefs = [
      "Evidence: reject path depth and availability",
      layerInspected
        ? `Layer inspected: ${layerInspected}`
        : null,
      rejectClickDepth !== null
        ? `Reject click depth: ${rejectClickDepth}`
        : null,
      ...visibleRejectLabels.map((label) => `Visible choice: ${label}`)
    ].filter((value): value is string => Boolean(value));
  
    return makeOutcome(
      "reject_all_path_availability",
      "Observed",
      sameLayerDeclineObserved
        ? "A Decline control was observed on the same first-layer cookie notice as Accept."
        : "A reject or equivalent refusal path was retained in the tested consent surface.",
      evidenceRefs,
      {
        retainedEvidence: {
          completeRejectPathAvailable: getBoolean(rejectPath, [
            "completeRejectPathAvailable",
            "complete_reject_path_available"
          ]),
          layerInspected,
          rejectClickDepth,
          rejectInteractionSucceeded,
          visibleRejectLabels: compactArray(visibleRejectLabels, 5)
        }
      }
    );
  }

  if (
    attempted &&
    (rejectButtonCount === 0 || skipNegativeReasons.includes("complete_reject_choice_controls_not_detected"))
  ) {
    if (firstLayerGdprBannerConfirmed === true) {
      return makeOutcome(
        "reject_all_path_availability",
        "Gap observed",
        "A first-layer GDPR/ePrivacy cookie consent surface was confirmed, and retained consent-audit evidence did not confirm a complete reject-all or equivalent refusal path.",
        [
          "Evidence: consent audit attempted",
          "Evidence: confirmed first-layer GDPR/ePrivacy consent surface",
          rejectButtonCount !== null ? `Reject controls observed: ${rejectButtonCount}` : null,
          preferenceButtonCount !== null ? `Preference controls observed: ${preferenceButtonCount}` : null,
          interactionModel ? `Consent interaction model: ${interactionModel}` : null,
          ...skipNegativeReasons,
          ...diagnosticNegativeReasons
        ].filter((value): value is string => Boolean(value)),
        {
          retainedEvidence: {
            attempted,
            diagnosticNegativeReasons: compactArray(diagnosticNegativeReasons, 5),
            firstLayerCookieConsentBannerObserved: true,
            gdprEprivacyConsentSurfaceObserved: "confirmed",
            interactionModel,
            preferenceButtonCount,
            rejectButtonCount,
            skipNegativeReasons: compactArray(skipNegativeReasons, 5)
          }
        }
      );
    }

    return makeOutcome(
      "reject_all_path_availability",
      "Insufficient evidence",
      "Consent audit retained evidence that no complete reject-all control was detected, but no eligible reject-path unified finding was projected.",
      [
        "Evidence: consent audit attempted",
        rejectButtonCount !== null ? `Reject controls observed: ${rejectButtonCount}` : null,
        preferenceButtonCount !== null ? `Preference controls observed: ${preferenceButtonCount}` : null,
        interactionModel ? `Consent interaction model: ${interactionModel}` : null,
        ...skipNegativeReasons,
        ...diagnosticNegativeReasons
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "hybridRuntimeEvidence.rejectPathDepthAndAvailability.completeRejectPathAvailable",
            true,
            getRawValue(rejectPath, ["completeRejectPathAvailable", "complete_reject_path_available"]),
            "Required to prove a complete reject-all or equivalent refusal path."
          ),
          sourceGap(
            "scanSnapshots.consent_reject_button_count",
            "greater than 0 or explicit complete-reject negative reason",
            rejectButtonCount,
            "Required to distinguish missing reject controls from incomplete reject-path testing.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          attempted,
          diagnosticNegativeReasons: compactArray(diagnosticNegativeReasons, 5),
          interactionModel,
          preferenceButtonCount,
          rejectButtonCount,
          skipNegativeReasons: compactArray(skipNegativeReasons, 5)
        }
      }
    );
  }

  if (attempted) {
    return makeOutcome(
      "reject_all_path_availability",
      "Not observed",
      "Consent audit ran for the tested context, and no eligible reject-path availability finding was projected.",
      ["Evidence: consent audit attempted"],
      {
        retainedEvidence: {
          attempted,
          completeRejectPathAvailable: false,
          rejectButtonCount,
          rejectInteractionSucceeded: false
        }
      }
    );
  }

  if (
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true
  ) {
    if (hasObservedPreconsentCookieOrTrackingActivity(input)) {
      return makeOutcome(
        "reject_all_path_availability",
        "Review signal",
        "CertScore retained a consent/CMP surface signal and pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer reject, decline, refuse, or continue-without-accepting option. Treat this as a partial concern unless retained first-layer controls also show an accept path without an equally available refusal path.",
        [
          "Evidence: consent surface observed",
          "Evidence: retained pre-consent cookie/tracking activity",
          "Evidence: no structured first-layer reject option retained"
        ],
        {
          retainedEvidence: {
            consentSurfaceObserved: true,
            cmpSignalObserved: cmpEvidence.cmpObserved,
            cmpVendorName: cmpEvidence.cmpVendorName,
            firstLayerCookieConsentBannerObserved: false,
            gdprEprivacyConsentSurfaceObserved: "unconfirmed",
            preconsentCookieOrTrackingActivityObserved: true,
            reason: "no_reject_option_retained_with_preconsent_activity",
            rejectControlObserved: false,
            rejectPathAvailabilityEvidenceRetained: false
          }
        }
      );
    }

    return makeOutcome(
      "reject_all_path_availability",
      "Not observed",
      "A consent/CMP surface was observed, but the retained runtime evidence did not include a structured first-layer reject, decline, or equivalent refusal control. CertScore does not infer reject availability from screenshot pixels.",
      [
        "Evidence: consent surface observed",
        "Result: no structured first-layer reject/equivalent control retained"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerConsentChoices.visibleChoiceLabels",
            "structured first-layer accept/reject/preference control labels",
            getRawValue(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]) ?? "missing",
            "Required to evaluate reject option availability without post-consent flow automation or screenshot-only inference."
          )
        ],
        retainedEvidence: {
          consentSurfaceObserved: true,
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          rejectControlObserved: false,
          rejectPathAvailabilityEvidenceRetained: false
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "reject_all_path_availability",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

function deriveOptionsSettingsPreferencesControlOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const cmpEvidence = getCmpFrameworkSignalEvidence(input);
  const evidence = getFirstLayerOptionsControlEvidence(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const preconsentCookieOrTrackingActivityObserved = hasObservedPreconsentCookieOrTrackingActivity(input);
  const evidenceRefs = [
    "Evidence: first-layer options/settings/preferences control",
    ...evidence.visibleOptionsLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
    evidence.layerInspected ? `Layer inspected: ${evidence.layerInspected}` : null
  ].filter((value): value is string => Boolean(value));

  if (noticeGateEvidence.gateObserved) {
    return makeOutcome(
      "options_settings_preferences_control",
      "Gap observed",
      "The retained first-layer privacy notice did not display a structured options, settings, or preferences control for cookie-consent choices.",
      [
        "Evidence: first-layer legal/privacy notice gate",
        ...noticeGateEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        noticeGateEvidence.layerInspected ? `Layer inspected: ${noticeGateEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          firstLayerPrivacyNoticeGateObserved: true,
          legalPrivacyNoticeGateObserved: true,
          optionsControlObserved: false,
          privacyNoticeGateWithPrivacyChoicesObserved: noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved,
          visibleChoiceLabels: noticeGateEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (evidence.optionsControlObserved) {
    return makeOutcome(
      "options_settings_preferences_control",
      "Observed",
      "A structured options, settings, or preferences control was observed on the retained first-layer consent surface.",
      evidenceRefs,
      {
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: evidence.firstLayerCookieConsentBannerObserved,
          layerInspected: evidence.layerInspected,
          optionsControlObserved: true,
          optionsControls: evidence.optionsControls,
          structuredControlInventoryRetained: evidence.structuredControlInventoryRetained,
          visibleOptionsLabels: compactArray(evidence.visibleOptionsLabels, 5)
        }
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved === false) {
    if (!preconsentCookieOrTrackingActivityObserved) {
      return makeOutcome(
        "options_settings_preferences_control",
        "Not observed",
        "No first-layer GDPR/ePrivacy consent banner was retained, and no non-essential cookie/tracking activity was observed in the tested context. Options/settings/preferences control availability is therefore treated as neutral for this scan.",
        [
          "Evidence: no confirmed first-layer cookie consent banner",
          "Evidence: no retained non-essential cookie/tracking activity"
        ],
        {
          retainedEvidence: {
            firstLayerCookieConsentBannerObserved: false,
            gdprEprivacyConsentSurfaceObserved: "unconfirmed",
            optionsControlObserved: false,
            preconsentCookieOrTrackingActivityObserved: false,
            reason: "no_banner_and_no_nonessential_activity"
          }
        }
      );
    }

    return makeOutcome(
      "options_settings_preferences_control",
      "Review signal",
      "CertScore scanned the page and retained pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer options, settings, or preferences control.",
      [
        "Evidence: retained pre-consent cookie/tracking activity",
        "Evidence: no structured first-layer options/settings/preferences control retained",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        retainedEvidence: {
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          consentSurfaceObserved: cmpEvidence.cmpObserved,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          optionsControlObserved: false,
          optionsControlEvidenceRetained: false,
          preconsentCookieOrTrackingActivityObserved: true,
          reason: "no_options_control_retained_with_preconsent_activity"
        }
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved !== true) {
    return makeOutcome(
      "options_settings_preferences_control",
      "Not confirmed",
      "A first-layer GDPR/ePrivacy cookie consent banner was not confirmed, so CertScore did not confirm an options/settings/preferences control for cookie-consent choices.",
      [
        "Evidence: consent surface demotion",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            evidence.firstLayerCookieConsentBannerObserved,
            "Required before CertScore can evaluate first-layer options/settings/preferences control availability."
          )
        ],
        retainedEvidence: {
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          firstLayerCookieConsentBannerObserved: evidence.firstLayerCookieConsentBannerObserved,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          optionsControlObserved: false,
          reason: "no_confirmed_first_layer_cookie_consent_banner"
        }
      }
    );
  }

  if (evidence.structuredControlInventoryRetained) {
    return makeOutcome(
      "options_settings_preferences_control",
      "Gap observed",
      "A first-layer GDPR/ePrivacy cookie consent surface was confirmed, but retained structured controls did not include an options, settings, or preferences control.",
      [
        "Evidence: confirmed first-layer GDPR/ePrivacy consent surface",
        "Evidence: structured first-layer control inventory retained",
        "Result: no options/settings/preferences control retained"
      ],
      {
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: true,
          layerInspected: evidence.layerInspected,
          optionsControlObserved: false,
          structuredControlInventoryRetained: true,
          visibleChoiceLabels: compactArray(evidence.visibleChoiceLabels, 8)
        }
      }
    );
  }

  if (
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true
  ) {
    return makeOutcome(
      "options_settings_preferences_control",
      preconsentCookieOrTrackingActivityObserved ? "Review signal" : "Not observed",
      preconsentCookieOrTrackingActivityObserved
        ? "CertScore retained a consent/CMP surface signal and pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer options, settings, or preferences control."
        : "A consent/CMP surface was observed, but the retained runtime evidence did not include a structured first-layer options, settings, or preferences control. CertScore does not infer options availability from screenshot pixels.",
      [
        "Evidence: consent surface observed",
        ...(preconsentCookieOrTrackingActivityObserved ? ["Evidence: retained pre-consent cookie/tracking activity"] : []),
        "Evidence: no structured first-layer options/settings/preferences control retained"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerConsentChoices.controls",
            "structured first-layer controls classified through canonical consent-control registry",
            getRawValue(evidence.firstLayerChoices, ["controls"]) ?? "missing",
            "Required to evaluate options/settings/preferences control availability without screenshot-only inference."
          )
        ],
        retainedEvidence: {
          consentSurfaceObserved: true,
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          optionsControlObserved: false,
          optionsControlEvidenceRetained: false,
          preconsentCookieOrTrackingActivityObserved
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "options_settings_preferences_control",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

function deriveAcceptConsentControlOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const cmpEvidence = getCmpFrameworkSignalEvidence(input);
  const evidence = getFirstLayerAcceptControlEvidence(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const preconsentCookieOrTrackingActivityObserved = hasObservedPreconsentCookieOrTrackingActivity(input);
  const evidenceRefs = [
    "Evidence: first-layer accept consent control",
    ...evidence.visibleAcceptLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
    evidence.layerInspected ? `Layer inspected: ${evidence.layerInspected}` : null
  ].filter((value): value is string => Boolean(value));

  if (noticeGateEvidence.gateObserved) {
    return makeOutcome(
      "accept_consent_control",
      "Gap observed",
      "The retained first-layer privacy notice did not display a structured accept, accept-all, or allow-all consent control.",
      [
        "Evidence: first-layer legal/privacy notice gate",
        ...noticeGateEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        noticeGateEvidence.layerInspected ? `Layer inspected: ${noticeGateEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          acceptControlObserved: false,
          firstLayerPrivacyNoticeGateObserved: true,
          legalPrivacyNoticeGateObserved: true,
          privacyNoticeGateWithPrivacyChoicesObserved: noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved,
          visibleChoiceLabels: noticeGateEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (evidence.acceptControlObserved) {
    return makeOutcome(
      "accept_consent_control",
      "Observed",
      "A structured accept, accept-all, or allow-all consent control was observed on the retained first-layer consent surface.",
      evidenceRefs,
      {
        retainedEvidence: {
          acceptControlObserved: true,
          acceptControls: evidence.acceptControls,
          firstLayerCookieConsentBannerObserved: evidence.firstLayerCookieConsentBannerObserved,
          layerInspected: evidence.layerInspected,
          structuredControlInventoryRetained: evidence.structuredControlInventoryRetained,
          visibleAcceptLabels: compactArray(evidence.visibleAcceptLabels, 5)
        }
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved === false) {
    if (!preconsentCookieOrTrackingActivityObserved) {
      return makeOutcome(
        "accept_consent_control",
        "Not observed",
        "No first-layer GDPR/ePrivacy consent banner was retained, and no non-essential cookie/tracking activity was observed in the tested context. Accept-control availability is therefore treated as neutral for this scan.",
        [
          "Evidence: no confirmed first-layer cookie consent banner",
          "Evidence: no retained non-essential cookie/tracking activity"
        ],
        {
          retainedEvidence: {
            acceptControlObserved: false,
            firstLayerCookieConsentBannerObserved: false,
            gdprEprivacyConsentSurfaceObserved: "unconfirmed",
            preconsentCookieOrTrackingActivityObserved: false,
            reason: "no_banner_and_no_nonessential_activity"
          }
        }
      );
    }

    return makeOutcome(
      "accept_consent_control",
      "Review signal",
      "CertScore scanned the page and retained pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer accept, accept-all, or allow-all control.",
      [
        "Evidence: retained pre-consent cookie/tracking activity",
        "Evidence: no structured first-layer accept consent control retained",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        retainedEvidence: {
          acceptControlObserved: false,
          acceptControlEvidenceRetained: false,
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          consentSurfaceObserved: cmpEvidence.cmpObserved,
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          preconsentCookieOrTrackingActivityObserved: true,
          reason: "no_accept_control_retained_with_preconsent_activity"
        }
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved !== true) {
    return makeOutcome(
      "accept_consent_control",
      "Not confirmed",
      "A first-layer GDPR/ePrivacy cookie consent banner was not confirmed, so CertScore did not confirm an accept consent control for cookie-consent choices.",
      [
        "Evidence: consent surface demotion",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            evidence.firstLayerCookieConsentBannerObserved,
            "Required before CertScore can evaluate first-layer accept-control availability."
          )
        ],
        retainedEvidence: {
          acceptControlObserved: false,
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          firstLayerCookieConsentBannerObserved: evidence.firstLayerCookieConsentBannerObserved,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          reason: "no_confirmed_first_layer_cookie_consent_banner"
        }
      }
    );
  }

  if (evidence.structuredControlInventoryRetained) {
    return makeOutcome(
      "accept_consent_control",
      "Gap observed",
      "A first-layer GDPR/ePrivacy cookie consent surface was confirmed, but retained structured controls did not include an accept, accept-all, or allow-all control.",
      [
        "Evidence: confirmed first-layer GDPR/ePrivacy consent surface",
        "Evidence: structured first-layer control inventory retained",
        "Result: no accept consent control retained"
      ],
      {
        retainedEvidence: {
          acceptControlObserved: false,
          firstLayerCookieConsentBannerObserved: true,
          layerInspected: evidence.layerInspected,
          structuredControlInventoryRetained: true,
          visibleChoiceLabels: compactArray(evidence.visibleChoiceLabels, 8)
        }
      }
    );
  }

  if (
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true
  ) {
    return makeOutcome(
      "accept_consent_control",
      preconsentCookieOrTrackingActivityObserved ? "Review signal" : "Not observed",
      preconsentCookieOrTrackingActivityObserved
        ? "CertScore retained a consent/CMP surface signal and pre-consent cookie or tracking activity, but did not retain structured evidence of a first-layer accept consent control."
        : "A consent/CMP surface was observed, but the retained runtime evidence did not include a structured first-layer accept consent control. CertScore does not infer accept availability from screenshot pixels.",
      [
        "Evidence: consent surface observed",
        ...(preconsentCookieOrTrackingActivityObserved ? ["Evidence: retained pre-consent cookie/tracking activity"] : []),
        "Evidence: no structured first-layer accept consent control retained"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerConsentChoices.controls",
            "structured first-layer controls classified through canonical consent-control registry",
            getRawValue(evidence.firstLayerChoices, ["controls"]) ?? "missing",
            "Required to evaluate accept-control availability without screenshot-only inference."
          )
        ],
        retainedEvidence: {
          acceptControlObserved: false,
          acceptControlEvidenceRetained: false,
          cmpSignalObserved: cmpEvidence.cmpObserved,
          cmpVendorName: cmpEvidence.cmpVendorName,
          consentSurfaceObserved: true,
          preconsentCookieOrTrackingActivityObserved
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "accept_consent_control",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

const ACCEPT_LABEL_PATTERN = /\b(?:accept|agree|allow|ok|got it|i accept|yes)\b/i;
const REJECT_LABEL_PATTERN = /\b(?:decline|reject|refuse|deny|opt[-\s]?out|essential only|necessary only)\b/i;
const MANAGE_PREFERENCES_LABEL_PATTERN =
  /\b(?:manage|settings|preferences?|customi[sz]e|choices?|options?|cookie center|preference center)\b/i;

function getConsentChoiceQualityEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getFirstLayerConsentChoicesFromArtifacts(input.runtimeArtifacts);
  const consentPathControlLabels = getConsentPathControlLabels(consentUiPathEvidence, rejectPath);
  const visibleChoiceLabels = uniqueStrings([
    ...getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]),
    ...consentPathControlLabels.acceptLabels,
    ...consentPathControlLabels.preferenceLabels,
    ...consentPathControlLabels.rejectLabels
  ]);
  const firstLayerCookieConsentBannerObserved = getExplicitFirstLayerGdprConsentBannerConfirmed(input);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]) ??
    getString(consentUiPathEvidence, ["layerInspected", "layer_inspected"]) ??
    getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const acceptControlObserved =
    getBoolean(firstLayerChoices, [
      "acceptControlObserved",
      "accept_control_observed",
      "acceptVisibleOnFirstLayer",
      "accept_visible_on_first_layer"
    ]) === true ||
    consentPathControlLabels.acceptLabels.some((label) => ACCEPT_LABEL_PATTERN.test(label)) ||
    visibleChoiceLabels.some((label) => ACCEPT_LABEL_PATTERN.test(label));
  const rejectControlObserved =
    getBoolean(firstLayerChoices, [
      "rejectControlObserved",
      "reject_control_observed",
      "rejectVisibleOnFirstLayer",
      "reject_visible_on_first_layer"
    ]) === true ||
    getBoolean(rejectPath, [
      "rejectEquivalentFound",
      "reject_equivalent_found",
      "completeRejectPathAvailable",
      "complete_reject_path_available"
    ]) === true ||
    consentPathControlLabels.rejectLabels.some((label) => REJECT_LABEL_PATTERN.test(label)) ||
    visibleChoiceLabels.some((label) => REJECT_LABEL_PATTERN.test(label));
  const rejectClickDepth = getNumber(rejectPath, [
    "rejectClickDepth",
    "reject_click_depth",
    "observedRejectPathDepth",
    "observed_reject_path_depth"
  ]);
  const sameLayerRejectObserved =
    getBoolean(firstLayerChoices, [
      "sameLayerRejectObserved",
      "same_layer_reject_observed",
      "rejectVisibleOnFirstLayer",
      "reject_visible_on_first_layer"
    ]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true ||
    (rejectControlObserved === true && (layerInspected === "first_layer" || rejectClickDepth === 0 || rejectClickDepth === 1));
  const observedControlLabels = lifecycle ? getObservedPreferenceControlLabels(lifecycle) : [];
  const explicitManagePreferencesObserved =
    getBoolean(firstLayerChoices, [
      "managePreferencesObserved",
      "manage_preferences_observed",
      "managePreferencesControlObserved",
      "manage_preferences_control_observed",
      "preferencesControlObserved",
      "preferences_control_observed"
    ]) ??
    getBooleanAnyTrue(lifecycle, [
      "cookiePreferencesLinkObserved",
      "cookie_preferences_link_observed",
      "manageConsentSurfaceObserved",
      "manage_consent_surface_observed",
      "manageCookiesSurfaceObserved",
      "manage_cookies_surface_observed",
      "preferenceCenterReachableAfterInitialLayer",
      "preference_center_reachable_after_initial_layer"
    ]);
  const managePreferencesObserved =
    explicitManagePreferencesObserved ??
    (
      visibleChoiceLabels.some((label) => MANAGE_PREFERENCES_LABEL_PATTERN.test(label)) ||
      observedControlLabels.some((label) => MANAGE_PREFERENCES_LABEL_PATTERN.test(label))
    );
  const purposeCategoryControlsObserved =
    getBoolean(firstLayerChoices, ["purposeCategoryControlsObserved", "purpose_category_controls_observed"]) ??
    getBoolean(lifecycle, ["confirmedCookieCategoryControlsObserved", "confirmed_cookie_category_controls_observed"]);
  const vendorControlsObserved =
    getBoolean(firstLayerChoices, ["vendorControlsObserved", "vendor_controls_observed"]) ??
    getBoolean(lifecycle, ["vendorControlsObserved", "vendor_controls_observed"]);
  const defaultToggleStatesObserved =
    getBoolean(firstLayerChoices, ["defaultToggleStatesObserved", "default_toggle_states_observed"]) ??
    getBoolean(lifecycle, ["defaultToggleStatesObserved", "default_toggle_states_observed"]);
  const nonEssentialDefaultsOff =
    getBoolean(firstLayerChoices, ["nonEssentialDefaultsOff", "non_essential_defaults_off"]) ??
    getBoolean(lifecycle, ["nonEssentialDefaultsOff", "non_essential_defaults_off"]);
  const defaultTogglePurposeLabels = uniqueStrings([
    ...getStringArray(firstLayerChoices, ["defaultTogglePurposeLabels", "default_toggle_purpose_labels"]),
    ...getStringArray(lifecycle, ["defaultTogglePurposeLabels", "default_toggle_purpose_labels"])
  ]);
  const precheckedOptionalPurposeLabels = uniqueStrings([
    ...getStringArray(firstLayerChoices, ["precheckedOptionalPurposeLabels", "prechecked_optional_purpose_labels"]),
    ...getStringArray(lifecycle, ["precheckedOptionalPurposeLabels", "prechecked_optional_purpose_labels"])
  ]);
  const visualParityEvidenceObserved =
    getBoolean(firstLayerChoices, ["visualParityEvidenceObserved", "visual_parity_evidence_observed"]) ??
    getBoolean(rejectPath, ["visualParityEvidenceObserved", "visual_parity_evidence_observed"]);
  const acceptRejectProminenceComparison =
    getString(firstLayerChoices, ["acceptRejectProminenceComparison", "accept_reject_prominence_comparison"]) ??
    getString(rejectPath, ["acceptRejectProminenceComparison", "accept_reject_prominence_comparison"]);
  const preferenceCenterOpened =
    getBoolean(firstLayerChoices, ["preferenceCenterOpened", "preference_center_opened"]) ??
    (
      getString(
        getRecord(getRawValue(lifecycle, [
          "postChoicePreferenceControlClickOutcome",
          "post_choice_preference_control_click_outcome"
        ])),
        ["outcome"]
      ) === "opened_preference_center"
    );
  const saveChoicesObserved =
    getBoolean(firstLayerChoices, ["saveChoicesObserved", "save_choices_observed"]) ??
    getBoolean(lifecycle, ["saveChoicesObserved", "save_choices_observed"]);
  const selectedEvidenceArtifactId =
    getString(firstLayerChoices, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    getString(rejectPath, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    getString(lifecycle, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    "consentChoiceQualityEvidence";
  const selectedEvidenceStrength =
    getString(firstLayerChoices, ["selectedEvidenceStrength", "selected_evidence_strength"]) ??
    getString(rejectPath, ["selectedEvidenceStrength", "selected_evidence_strength"]) ??
    getString(lifecycle, ["selectedEvidenceStrength", "selected_evidence_strength"]);

  return {
    acceptControlObserved,
    acceptRejectProminenceComparison,
    defaultTogglePurposeLabels: compactArray(defaultTogglePurposeLabels, 8),
    defaultToggleStatesObserved,
    firstLayerCookieConsentBannerObserved,
    layerInspected,
    managePreferencesObserved,
    nonEssentialDefaultsOff,
    preferenceCenterOpened,
    precheckedOptionalPurposeLabels: compactArray(precheckedOptionalPurposeLabels, 8),
    purposeCategoryControlsObserved,
    rejectClickDepth,
    rejectControlObserved,
    sameLayerRejectObserved,
    saveChoicesObserved,
    selectedEvidenceArtifactId,
    selectedEvidenceStrength,
    vendorControlsObserved,
    visibleChoiceLabels: compactArray(visibleChoiceLabels, 8),
    visualParityEvidenceObserved
  };
}

function deriveConsentChoiceQualityOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getConsentChoiceQualityEvidence(input);
  const noticeGateEvidence = getFirstLayerNoticeGateEvidence(input);
  const missingEvidenceNeeded = [
    evidence.managePreferencesObserved === true ? null : "cookie preference center or manage/preferences/settings control",
    evidence.purposeCategoryControlsObserved === true ? null : "purpose or cookie-category choices",
    evidence.vendorControlsObserved === true ? null : "vendor-level choices when applicable",
    evidence.defaultToggleStatesObserved === true ? null : "default toggle state evidence",
    evidence.nonEssentialDefaultsOff === true ? null : "non-essential defaults observed off",
    evidence.saveChoicesObserved === true ? null : "save or confirm choices control",
    evidence.visualParityEvidenceObserved === true ? null : "accept/reject visual parity evidence"
  ].filter((value): value is string => Boolean(value));
  const evidenceRefs = [
    "Evidence: consent choice quality",
    ...evidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
    evidence.layerInspected ? `Layer inspected: ${evidence.layerInspected}` : null,
    evidence.acceptRejectProminenceComparison ? `Prominence comparison: ${evidence.acceptRejectProminenceComparison}` : null
  ].filter((value): value is string => Boolean(value));
  const retainedEvidence = {
    ...evidence,
    missingEvidenceNeeded
  };
  const visibleChoicePhrase = evidence.visibleChoiceLabels.length > 0
    ? ` Retained first-layer controls included ${formatInlineList(evidence.visibleChoiceLabels.slice(0, 4))}.`
    : "";

  if (noticeGateEvidence.gateObserved) {
    return makeOutcome(
      "consent_choice_quality",
      "Gap observed",
      noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved
        ? "CertScore observed a first-layer privacy notice gate with visible actions for privacy choices and Continue. No same-layer reject, decline, reject-all, or granular cookie-category controls were visible in retained evidence."
        : "CertScore observed a first-layer legal/privacy notice with a single Continue action. No same-layer reject, manage-preferences, or granular cookie-choice control was visible in retained evidence.",
      [
        "Evidence: first-layer legal/privacy notice gate",
        ...noticeGateEvidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        noticeGateEvidence.layerInspected ? `Layer inspected: ${noticeGateEvidence.layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          ...retainedEvidence,
          firstLayerCookieConsentBannerObserved: false,
          firstLayerPrivacyNoticeGateObserved: true,
          legalPrivacyNoticeGateObserved: true,
          managePreferencesObserved: false,
          noticeOnlyPrivacyInterstitialObserved: noticeGateEvidence.noticeOnlyPrivacyInterstitialObserved,
          onlyContinueActionObserved: true,
          privacyChoiceLabels: noticeGateEvidence.privacyChoiceLabels,
          privacyNoticeGateWithPrivacyChoicesObserved: noticeGateEvidence.privacyNoticeGateWithPrivacyChoicesObserved,
          rejectControlObserved: false,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "strong",
          surfacePurpose: "legal_privacy_notice_gate",
          visibleChoiceLabels: noticeGateEvidence.visibleChoiceLabels
        }
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved === false) {
    return makeOutcome(
      "consent_choice_quality",
      "Not confirmed",
      "Consent choice quality was not confirmed because no first-layer GDPR/ePrivacy cookie consent surface was confirmed in retained evidence.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            false,
            "Required before CertScore can evaluate first-layer consent choice quality."
          )
        ],
        retainedEvidence
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved !== true) {
    return makeOutcome(
      "consent_choice_quality",
      "Not testable",
      "Consent choice quality could not be evaluated because no first-layer GDPR/ePrivacy cookie consent surface was confirmed.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            evidence.firstLayerCookieConsentBannerObserved,
            "Required before CertScore can evaluate first-layer consent choice quality."
          )
        ],
        retainedEvidence
      }
    );
  }

  const directGapReasons = [
    evidence.acceptControlObserved === true && evidence.sameLayerRejectObserved !== true ? "accept_without_same_layer_reject" : null,
    evidence.rejectClickDepth !== null && evidence.rejectClickDepth > 1 ? "reject_buried_behind_additional_clicks" : null,
    evidence.defaultToggleStatesObserved === true && evidence.nonEssentialDefaultsOff === false ? "non_essential_toggles_default_on" : null,
    evidence.acceptRejectProminenceComparison && /accept.*(?:more|primary|prominent|emphasized)|reject.*(?:less|secondary|muted)/i.test(evidence.acceptRejectProminenceComparison)
      ? "accept_materially_more_prominent_than_reject"
      : null
  ].filter((value): value is string => Boolean(value));

  if (directGapReasons.length > 0) {
    const directGapDetails = [
      directGapReasons.includes("accept_without_same_layer_reject")
        ? "an accept/accept-all control was retained, but no same-layer reject, decline, reject-all, or essential-only control was retained"
        : null,
      directGapReasons.includes("reject_buried_behind_additional_clicks")
        ? `the retained reject path required ${evidence.rejectClickDepth} clicks`
        : null,
      directGapReasons.includes("non_essential_toggles_default_on")
        ? "optional or non-essential purposes appeared selected by default"
        : null,
      directGapReasons.includes("accept_materially_more_prominent_than_reject")
        ? "retained visual evidence suggested accept was materially more prominent than reject"
        : null
    ].filter((value): value is string => Boolean(value));
    return makeOutcome(
      "consent_choice_quality",
      "Gap observed",
      `Retained first-layer consent-surface evidence indicated a consent choice-quality issue: ${formatInlineList(directGapDetails)}.${visibleChoicePhrase}`,
      [...evidenceRefs, ...directGapReasons.map((reason) => `Reason: ${reason}`)],
      {
        retainedEvidence: {
          ...retainedEvidence,
          directGapReasons,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "strong"
        }
      }
    );
  }

  if (
    evidence.acceptControlObserved === true &&
    evidence.sameLayerRejectObserved === true &&
    evidence.managePreferencesObserved === true
  ) {
    const strongNoDarkPatternSupport = [
      evidence.purposeCategoryControlsObserved === true,
      evidence.vendorControlsObserved === true,
      evidence.defaultToggleStatesObserved === true && evidence.nonEssentialDefaultsOff === true,
      evidence.saveChoicesObserved === true,
      evidence.visualParityEvidenceObserved === true
    ].filter(Boolean).length >= 3;
    return makeOutcome(
      "consent_choice_quality",
      "Not observed",
      `No obvious cookie-banner dark-pattern signal was observed in retained first-layer consent controls.${visibleChoicePhrase} CertScore observed same-layer accept, reject/refusal, and settings/preferences controls; deeper preference-center default states and visual-parity review were not used as standalone dark-pattern findings.`,
      evidenceRefs,
      {
        retainedEvidence: {
          ...retainedEvidence,
          darkPatternSignalObserved: false,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? (strongNoDarkPatternSupport ? "strong" : "moderate")
        }
      }
    );
  }

  const strongQualitySignals = [
    evidence.acceptControlObserved === true,
    evidence.sameLayerRejectObserved === true,
    evidence.managePreferencesObserved === true,
    evidence.purposeCategoryControlsObserved === true,
    evidence.vendorControlsObserved === true,
    evidence.defaultToggleStatesObserved === true && evidence.nonEssentialDefaultsOff === true,
    evidence.saveChoicesObserved === true,
    evidence.visualParityEvidenceObserved === true
  ].filter(Boolean).length;

  if (strongQualitySignals >= 6) {
    return makeOutcome(
      "consent_choice_quality",
      "Observed",
      "Retained evidence supports same-layer accept/reject choice, granular preferences, default-state review, save choices, and no obvious accept/reject visual imbalance.",
      evidenceRefs,
      {
        retainedEvidence: {
          ...retainedEvidence,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "strong",
          strongQualitySignals
        }
      }
    );
  }

  if (
    evidence.acceptControlObserved === true &&
    evidence.sameLayerRejectObserved === true &&
    evidence.managePreferencesObserved !== true &&
    evidence.purposeCategoryControlsObserved !== true &&
    evidence.vendorControlsObserved !== true &&
    evidence.preferenceCenterOpened !== true
  ) {
    return makeOutcome(
      "consent_choice_quality",
      "Review signal",
      "Basic same-layer Accept and Decline controls were observed, but CertScore did not confirm granular cookie preferences, purpose/vendor choices, default toggle states, or a cookie preference center.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.consentChoiceQuality.granularPreferenceEvidence",
            "granular cookie preferences, purpose/vendor choices, default toggle states, or cookie preference center",
            "missing",
            "Required before CertScore can mark consent choice quality as checked."
          )
        ],
        retainedEvidence: {
          ...retainedEvidence,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "limited"
        }
      }
    );
  }

  return makeOutcome(
    "consent_choice_quality",
    "Review signal",
    "Consent choice quality requires review because retained consent-surface evidence did not confirm most choice-quality criteria.",
    evidenceRefs,
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scanner.consentChoiceQuality.completeQualityEvidence",
          "same-layer accept/reject plus granular preferences, default-state evidence, save choices, and visual parity",
          "partial",
          "Required before CertScore can mark consent choice quality as checked."
        )
      ],
      retainedEvidence: {
        ...retainedEvidence,
        selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "limited"
      }
    }
  );
}

function getPostRejectFailureReason(failureClass: string | null) {
  switch (failureClass) {
    case "consent_surface_not_observed":
      return "Scanner did not retain an observed consent surface during the reject-path audit.";
    case "reject_control_not_found":
      return "Scanner observed a consent surface but did not retain a reject, essential-only, or opt-out control to click.";
    case "reject_click_failed":
      return "Scanner retained a reject-like control candidate, but the reject click was not confirmed.";
    case "reject_clicked_no_state_change":
      return "Scanner clicked a reject-like control, but did not retain enough state change to confirm a valid after-reject state.";
    case "reject_navigation_or_auth_ambiguous":
      return "Scanner clicked a reject-like control, but navigation, redirect, or auth-wall behavior made the after-reject state ambiguous.";
    case "consent_audit_not_completed":
      return "Consent interaction audit was enabled, but no completed reject-path audit was retained.";
    case "consent_audit_not_attempted":
      return "Consent interaction audit was not attempted for this scan.";
    default:
      return null;
  }
}

function getRetainedConsentSurfaceObserved(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  if (isPrivacyChoiceSurfaceOnly(lifecycle)) {
    return false;
  }
  return (
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true
  );
}

function normalizePostRejectFailureClass(
  input: GdprEprivacyCoveragePolicyInput,
  failureClass: string | null
) {
  if (
    failureClass === "consent_surface_not_observed" &&
    getExplicitFirstLayerGdprConsentBannerConfirmed(input) !== false &&
    getRetainedConsentSurfaceObserved(input)
  ) {
    return "reject_control_not_found";
  }

  return failureClass;
}

function getPostRejectNonEssentialRows(record: Record<string, unknown> | null | undefined) {
  return [
    ...getObjectArray(record, [
      "postRejectNonEssentialRequests",
      "post_reject_non_essential_requests",
      "consentRejectPostRejectNonEssentialRequests",
      "consent_reject_post_reject_non_essential_requests"
    ]),
    ...getObjectArray(record, [
      "postRejectNonEssentialCookies",
      "post_reject_non_essential_cookies",
      "postRejectNonEssentialStorage",
      "post_reject_non_essential_storage"
    ])
  ];
}

function getPostRejectRowCategory(row: Record<string, unknown>) {
  return getString(row, [
    "category",
    "purposeCategory",
    "purpose_category",
    "vendorCategory",
    "vendor_category",
    "classification",
    "classifiedCategory",
    "classified_category"
  ]);
}

function hasConcretePostRejectNonEssentialDetail(row: Record<string, unknown>) {
  const vendorOrDomain =
    getString(row, ["vendor", "vendorName", "vendor_name", "postRejectVendor", "post_reject_vendor", "domain", "host", "hostname"]) !== null;
  const requestOrStorageArtifact =
    getString(row, [
      "url",
      "requestUrl",
      "request_url",
      "responseUrl",
      "response_url",
      "cookieName",
      "cookie_name",
      "storageKey",
      "storage_key"
    ]) !== null;
  const category = getPostRejectRowCategory(row);
  const eligibleCategory = category
    ? /analytics|advertising|tracking|marketing|measurement|adtech|session[_\s-]?replay/i.test(category)
    : false;
  const timingOrCounts =
    getNumber(row, ["msAfterReject", "ms_after_reject", "timestampMs", "timestamp_ms", "requestCount", "request_count"]) !== null ||
    getNumber(row, ["baselineCount", "baseline_count", "postRejectCount", "post_reject_count"]) !== null;
  const consentState = getString(row, ["consentState", "consent_state", "phase", "timingEvidence", "timing_evidence"]);
  const afterReject = consentState ? /after[_\s-]?reject|post[_\s-]?reject|reject/i.test(consentState) : false;
  const nonEssentialReason =
    getString(row, [
      "nonEssentialReason",
      "non_essential_reason",
      "classificationReason",
      "classification_reason",
      "reason",
      "reasonClassifiedNonEssential",
      "reason_classified_non_essential"
    ]) !== null ||
    getBoolean(row, ["nonEssential", "non_essential", "eligibleNonEssential", "eligible_non_essential"]) === true;

  return vendorOrDomain && requestOrStorageArtifact && eligibleCategory && timingOrCounts && afterReject && nonEssentialReason;
}

function derivePostRejectOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const rejectDiagnostic = getEventMetadata(input.events, "reject_persistence_diagnostic");
  const consentOutcomeSummary = getHybridConsentOutcomeSummary(input.runtimeArtifacts);
  const reductionEvidence = getPostRejectTrackingReductionEvidence(input.runtimeArtifacts);
  const attempted = getBoolean(rejectDiagnostic, ["shouldAttemptConsentAudit"]) === true;
  const reductionStatus = getString(reductionEvidence, ["reductionEvaluationStatus", "reduction_evaluation_status"]);
  const rejectInteractionSucceeded =
    getBoolean(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]) === true ||
    getBoolean(rejectDiagnostic, ["rejectInteractionSucceeded"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consent_reject_interaction_succeeded"]) === true ||
    getBoolean(consentOutcomeSummary, ["rejectInteractionSucceeded", "reject_interaction_succeeded"]) === true;
  const reductionEvidenceRefs = [
    "Evidence: post-reject tracking reduction evidence",
    ...getStringArray(reductionEvidence, ["reasonCodes", "reason_codes"]),
    ...getStringArray(reductionEvidence, ["negativeReasonCodes", "negative_reason_codes"])
  ];
  const baselineVendors = getStringArray(reductionEvidence, [
    "baselineVendors",
    "baseline_vendors",
    "baselineTrackerVendors",
    "baseline_tracker_vendors"
  ]);
  const postRejectVendors = getStringArray(reductionEvidence, [
    "postRejectVendors",
    "post_reject_vendors",
    "postRejectTrackerVendors",
    "post_reject_tracker_vendors"
  ]);
  const persistedVendors = getStringArray(reductionEvidence, [
    "persistedVendors",
    "persisted_vendors",
    "persistedTrackerVendors",
    "persisted_tracker_vendors"
  ]);
  const postRejectWindowAvailable = getBoolean(reductionEvidence, [
    "postRejectWindowAvailable",
    "post_reject_window_available"
  ]);
  const postRejectRequestRecordsObserved = getBoolean(reductionEvidence, [
    "postRejectRequestRecordsObserved",
    "post_reject_request_records_observed"
  ]);
  const postRejectNonEssentialRequestsRetained =
    getBoolean(reductionEvidence, [
      "postRejectNonEssentialRequestsRetained",
      "post_reject_non_essential_requests_retained",
      "postRejectNonEssentialActivityRetained",
      "post_reject_non_essential_activity_retained"
    ]) ??
    getStringArray(reductionEvidence, ["reasonCodes", "reason_codes"]).some((reason) =>
      reason === "post_reject_non_essential_requests_retained"
    );
  const postRejectNonEssentialRows = getPostRejectNonEssentialRows(reductionEvidence);
  const concretePostRejectNonEssentialRows = postRejectNonEssentialRows.filter(hasConcretePostRejectNonEssentialDetail);
  const retainedRejectInteractionFailureClass =
    getString(reductionEvidence, ["rejectInteractionFailureClass", "reject_interaction_failure_class"]) ??
      getStringArray(reductionEvidence, ["negativeReasonCodes", "negative_reason_codes"]).find((reason) =>
        /^(?:consent_surface_not_observed|reject_control_not_found|reject_click_failed|reject_clicked_no_state_change|reject_navigation_or_auth_ambiguous|consent_audit_not_completed|consent_audit_not_attempted)$/.test(reason)
      ) ??
      null;
  const rejectInteractionFailureClass = normalizePostRejectFailureClass(input, retainedRejectInteractionFailureClass);
  const rejectInteractionFailureReason =
    rejectInteractionFailureClass === retainedRejectInteractionFailureClass
      ? getString(reductionEvidence, ["rejectInteractionFailureReason", "reject_interaction_failure_reason"]) ??
        getPostRejectFailureReason(rejectInteractionFailureClass)
      : getPostRejectFailureReason(rejectInteractionFailureClass);
  const postRejectRetainedEvidence = {
    baselineVendors: compactArray(baselineVendors, 5),
    concretePostRejectNonEssentialDetailsRetained: concretePostRejectNonEssentialRows.length > 0,
    persistedVendors: compactArray(persistedVendors, 5),
    postRejectNonEssentialActivityRetained: postRejectNonEssentialRequestsRetained,
    postRejectNonEssentialRequestCount: postRejectNonEssentialRows.length,
    postRejectNonEssentialRequests: compactArray(postRejectNonEssentialRows, 5),
    postRejectRequestRecordsObserved,
    postRejectVendors: compactArray(postRejectVendors, 5),
    postRejectWindowAvailable,
    reductionEvaluationStatus: reductionStatus,
    rejectInteractionFailureClass,
    rejectInteractionFailureReason,
    rejectInteractionConfirmed: rejectInteractionSucceeded
  };

  if (POST_CHOICE_FLOW_DEFERRED_FROM_PRODUCTION_CORE) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not testable",
      "Post-choice consent-flow automation is deferred from the current production core scanner. Retained reject-path or post-reject evidence may remain available for analyst review, but CertScore does not currently report a production gap or success conclusion for post-choice tracking reduction.",
      reductionEvidenceRefs,
      {
        retainedEvidence: {
          ...postRejectRetainedEvidence,
          productionPosture: "post_choice_flow_deferred_from_core"
        }
      }
    );
  }

  const postRejectMissingSignals = [
    rejectInteractionSucceeded
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.rejectInteractionConfirmed",
          true,
          getRawValue(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]),
          "Required to establish a valid after-reject state."
        ),
    postRejectWindowAvailable === true
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.postRejectWindowAvailable",
          true,
          postRejectWindowAvailable,
          "Required to compare baseline tracking against the post-reject window."
        ),
    postRejectRequestRecordsObserved === true || reductionStatus === "no_post_reject_non_essential_observed"
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.postRejectRequestRecordsObserved",
          true,
          postRejectRequestRecordsObserved,
          "Required to prove whether non-essential requests persisted after reject."
        )
  ].filter((value): value is GdprEprivacyCoverageSourceSignalGap => Boolean(value));
  const firstLayerGdprBannerConfirmed = getExplicitFirstLayerGdprConsentBannerConfirmed(input);

  if (reductionStatus === "not_testable") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not confirmed",
      firstLayerGdprBannerConfirmed === false
        ? "Post-reject tracking reduction was not confirmed because no first-layer GDPR/ePrivacy consent banner and no valid reject action were confirmed. Footer privacy/ad-choice controls were observed, but they do not establish a reject state for comparison."
        : rejectInteractionFailureReason
        ? `${rejectInteractionFailureReason} Because no valid after-reject state was retained, post-reject tracking reduction was not confirmed.`
        : "Reject-path audit did not retain a confirmed reject action, so post-reject tracking reduction was not confirmed.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: firstLayerGdprBannerConfirmed === false
          ? [
              sourceGap(
                "scanner.firstLayerCookieConsentBannerObserved",
                true,
                false,
                "Required before CertScore can establish a GDPR/ePrivacy reject state for post-choice tracking comparison."
              ),
              ...postRejectMissingSignals
            ]
          : postRejectMissingSignals,
        retainedEvidence: {
          ...postRejectRetainedEvidence,
          ...(firstLayerGdprBannerConfirmed === false
            ? {
                firstLayerCookieConsentBannerObserved: false,
                gdprEprivacyConsentSurfaceObserved: "unconfirmed",
                reason: "no_confirmed_first_layer_cookie_consent_banner"
              }
            : {})
        }
      }
    );
  }

  if (reductionStatus === "insufficient_evidence") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Insufficient evidence",
      "A reject action was retained, but the post-reject comparison window or request evidence was incomplete.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: postRejectMissingSignals,
        retainedEvidence: postRejectRetainedEvidence
      }
    );
  }

  if (reductionStatus === "reduced" || reductionStatus === "no_post_reject_non_essential_observed") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action and post-reject comparison evidence were retained, and no eligible post-reject tracking persistence finding was projected.",
      reductionEvidenceRefs,
      {
        retainedEvidence: postRejectRetainedEvidence
      }
    );
  }

  if (reductionStatus === "not_reduced") {
    const hasConcretePostRejectPersistenceEvidence =
      postRejectNonEssentialRequestsRetained === true &&
      concretePostRejectNonEssentialRows.length > 0;
    const projectionSuppressionReason = hasConcretePostRejectPersistenceEvidence
      ? null
      : "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state were not retained.";
    return makeOutcome(
      "post_reject_tracking_reduction",
      hasConcretePostRejectPersistenceEvidence ? "Gap observed" : "Review signal",
      hasConcretePostRejectPersistenceEvidence
        ? "A reject action and post-reject comparison window were retained, and eligible non-essential tracking activity persisted after reject."
        : "A reject action and post-reject comparison window were retained, and post-reject non-essential activity was observed, but CertScore did not retain enough canonical detail to project a post-reject persistence gap.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: hasConcretePostRejectPersistenceEvidence
          ? []
          : [
              sourceGap(
                "postRejectTrackingReductionEvidence.postRejectNonEssentialRequests",
                "eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state",
                postRejectNonEssentialRows.length,
                "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state."
              )
            ],
        retainedEvidence: {
          ...postRejectRetainedEvidence,
          ...(hasConcretePostRejectPersistenceEvidence
            ? {}
            : {
                missingEvidenceNeeded: [
                  "Eligible post-reject non-essential vendor/request/cookie details with category, URL/domain, timing, and consent state."
                ],
                projectionSuppressed: true,
                projectionSuppressionReason
              })
        }
      }
    );
  }

  if (attempted && !rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not confirmed",
      "Reject-path audit ran, but no reject action was confirmed, so post-reject tracking reduction was not confirmed for this scan.",
      [
        "Evidence: reject persistence diagnostic",
        ...getStringArray(rejectDiagnostic, ["negativeReasonCodes"])
      ],
      {
        missingOrIncompleteSourceSignals: postRejectMissingSignals,
        retainedEvidence: {
          attempted,
          rejectInteractionConfirmed: false,
          rejectPersistenceDiagnosticReasons: compactArray(getStringArray(rejectDiagnostic, ["negativeReasonCodes"]), 5)
        }
      }
    );
  }

  if (rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action was retained, and no eligible post-reject tracking persistence finding was projected.",
      ["Evidence: reject interaction retained"],
      {
        retainedEvidence: {
          rejectInteractionConfirmed: true
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "post_reject_tracking_reduction",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

function derivePreferenceWithdrawalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  if (!lifecycle) {
    const consentAuditCompleted = getBoolean(input.runtimeArtifacts, ["consentAuditCompleted", "consent_audit_completed"]);
    const consentSurfaceObserved = getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]);
    if (
      (consentLifecycleLimitation?.consentAuditCompleted === true || consentAuditCompleted === true) &&
      (consentLifecycleLimitation?.consentSurfaceObserved === true || consentSurfaceObserved === true)
    ) {
      return makeOutcome(
        "preference_withdrawal_control",
        "Not confirmed",
        "A consent interaction audit completed and observed a consent surface, but retained evidence did not confirm a post-choice cookie preference or consent-withdrawal control.",
        [
          "Evidence: consent audit completed",
          "Evidence: consent surface observed",
          consentLifecycleLimitation?.reason ? `Limitation reason: ${consentLifecycleLimitation.reason}` : null
        ].filter((value): value is string => Boolean(value)),
        {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "scan_runtime_artifacts.hybrid_runtime_evidence.consentControlLifecycleEvidence",
              "retained post-choice consent control lifecycle evidence",
              "missing",
              "Required before CertScore can confirm whether a post-choice GDPR/ePrivacy consent withdrawal control was available."
            )
          ],
          retainedEvidence: {
            consentActionableChoiceObserved:
              consentLifecycleLimitation?.actionableChoiceObserved ??
              getBoolean(input.runtimeArtifacts, ["consentActionableChoiceObserved", "consent_actionable_choice_observed"]),
            consentAuditCompleted: consentLifecycleLimitation?.consentAuditCompleted ?? consentAuditCompleted,
            consentLifecycleLimitationReason: consentLifecycleLimitation?.reason ?? null,
            consentSurfaceObserved: consentLifecycleLimitation?.consentSurfaceObserved ?? consentSurfaceObserved
          }
        }
      );
    }

    return makeConsentLifecycleLimitedOutcome(
      "preference_withdrawal_control",
      consentLifecycleLimitation
    );
  }

  const coverageStatus = getString(lifecycle, ["coverageStatus", "coverage_status"]);
  const initialLayerObserved =
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true;
  const observedControlLabels = getObservedPreferenceControlLabels(lifecycle).slice(0, 3);
  const postChoiceClickOutcome = getRecord(
    getRawValue(lifecycle, [
      "postChoicePreferenceControlClickOutcome",
      "post_choice_preference_control_click_outcome"
    ])
  );
  const postChoiceOutcome = getString(postChoiceClickOutcome, ["outcome"]);
  const postChoiceOutcomeDecisive =
    postChoiceOutcome === "opened_preference_center" ||
    postChoiceOutcome === "navigated_to_policy_or_notice";
  const postChoiceOutcomeCleanAbsence = postChoiceOutcome === "no_qualifying_control_observed";
  const postChoiceOutcomeIncomplete =
    Boolean(postChoiceClickOutcome) &&
    !postChoiceOutcomeDecisive &&
    !postChoiceOutcomeCleanAbsence;
    const explicitControlObserved =
      getBoolean(lifecycle, ["privacySettingsControlObserved", "privacy_settings_control_observed"]) === true ||
      getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
      getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
      getBoolean(lifecycle, ["footerPreferenceLinkObserved", "footer_preference_link_observed"]) === true;
    const cookieConsentControlLabels = observedControlLabels.filter(isCookieConsentWithdrawalControlLabel);
    const openedCookieConsentPreferenceCenter =
      postChoiceOutcome === "opened_preference_center" &&
      getExplicitFirstLayerGdprConsentBannerConfirmed(input) !== false &&
      (
        getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
        getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
        getBoolean(lifecycle, ["confirmedCookieCategoryControlsObserved", "confirmed_cookie_category_controls_observed"]) === true ||
        getBoolean(lifecycle, ["manageConsentSurfaceObserved", "manage_consent_surface_observed"]) === true ||
        getBoolean(lifecycle, ["manageCookiesSurfaceObserved", "manage_cookies_surface_observed"]) === true ||
        cookieConsentControlLabels.length > 0
      );
    const cookieConsentWithdrawalControlObserved =
      openedCookieConsentPreferenceCenter ||
      getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
      getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
      (
        getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true &&
        cookieConsentControlLabels.length > 0
      ) ||
      (
        getBoolean(lifecycle, [
          "preferenceCenterReachableAfterInitialLayer",
          "preference_center_reachable_after_initial_layer"
        ]) === true &&
        cookieConsentControlLabels.length > 0
      );
    const privacyAdChoiceOnlyControlObserved =
      !cookieConsentWithdrawalControlObserved &&
      (
        isPrivacyChoiceSurfaceOnly(lifecycle) ||
        getExplicitFirstLayerGdprConsentBannerConfirmed(input) === false ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "targeted_ads_opt_out" ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "sale_share_opt_out" ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "ad_choices" ||
        (
          observedControlLabels.length > 0 &&
          observedControlLabels.every((label) => PRIVACY_AD_CHOICE_ONLY_CONTROL_PATTERN.test(label))
        )
      ) &&
      (explicitControlObserved || observedControlLabels.length > 0 || postChoiceOutcome === "navigated_to_policy_or_notice");
    const controlObserved =
      !postChoiceOutcomeIncomplete &&
      !postChoiceOutcomeCleanAbsence &&
      cookieConsentWithdrawalControlObserved;
  const ambiguousControlEvidence =
    !postChoiceOutcomeCleanAbsence && hasAmbiguousPreferenceControlEvidence(lifecycle, observedControlLabels);
  const evidenceRefs = [
    "Evidence: consent control lifecycle",
    ...getStringArray(lifecycle, ["evidenceRefs", "evidence_refs"]),
    ...observedControlLabels.map((label) => `Observed control: ${label}`),
    postChoiceOutcome ? `Post-choice control outcome: ${postChoiceOutcome}` : null,
    ambiguousControlEvidence ? "Ambiguous control evidence retained" : null
  ].filter((value): value is string => Boolean(value));
    const lifecycleRetainedEvidence = {
    confirmedCookieCategoryControlsObserved: getBoolean(lifecycle, [
      "confirmedCookieCategoryControlsObserved",
      "confirmed_cookie_category_controls_observed"
    ]),
    cmpReopenControlObserved: getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]),
    cookiePreferencesLinkObserved: getBoolean(lifecycle, [
      "cookiePreferencesLinkObserved",
      "cookie_preferences_link_observed"
    ]),
    coverageStatus,
    footerPreferenceLinkObserved: getBoolean(lifecycle, [
      "footerPreferenceLinkObserved",
      "footer_preference_link_observed"
    ]),
    cookieConsentControlLabels,
    observedControlLabels,
    openedCookieConsentPreferenceCenter,
    manageConsentSurfaceObserved: getBoolean(lifecycle, ["manageConsentSurfaceObserved", "manage_consent_surface_observed"]),
    manageCookiesSurfaceObserved: getBoolean(lifecycle, ["manageCookiesSurfaceObserved", "manage_cookies_surface_observed"]),
    postChoicePreferenceControlClickOutcome: postChoiceClickOutcome,
    preferenceCenterReachableAfterInitialLayer: getBoolean(lifecycle, [
      "preferenceCenterReachableAfterInitialLayer",
      "preference_center_reachable_after_initial_layer"
    ]),
    trackingRequiringConsentReviewObserved: getBoolean(lifecycle, [
      "trackingRequiringConsentReviewObserved",
      "tracking_requiring_consent_review_observed",
      "consentRelevantTrackingObserved",
      "consent_relevant_tracking_observed",
      "consentDependentTrackingObserved",
      "consent_dependent_tracking_observed"
    ]),
    privacySettingsControlObserved: getBoolean(lifecycle, [
      "privacySettingsControlObserved",
      "privacy_settings_control_observed"
    ]),
    withdrawalTextObserved: getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"])
  };
  const lifecycleAmbiguousGap = sourceGap(
    "consentControlLifecycleEvidence.postChoicePreferenceControlClickOutcome",
    "tested usable preference or withdrawal control",
    postChoiceOutcome ?? "ambiguous CMP/post-choice signal without a qualifying control label",
    "Required to prove that the retained control actually reopens or changes consent preferences."
  );

    if (controlObserved) {
      return makeOutcome(
      "preference_withdrawal_control",
      "Observed",
      "CertScore observed a post-choice consent or preference control in the tested context.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
    }
  
    if (privacyAdChoiceOnlyControlObserved) {
      return makeOutcome(
        "preference_withdrawal_control",
        "Review signal",
        "Footer privacy/ad-choice and vendor opt-out links were observed, but CertScore did not confirm a GDPR/ePrivacy cookie preference center or consent-withdrawal control.",
        evidenceRefs,
        {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "consentControlLifecycleEvidence.cookiePreferencesLinkObserved",
              true,
              getRawValue(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) ?? false,
              "Required before CertScore can treat post-choice GDPR/ePrivacy consent withdrawal as checked."
            )
          ],
          retainedEvidence: {
            ...lifecycleRetainedEvidence,
            privacyAdChoiceOnlyControlObserved: true
          }
        }
      );
    }
  
  if (!initialLayerObserved) {
    const lifecycleUsable = coverageStatus === "usable";
    return makeOutcome(
      "preference_withdrawal_control",
      lifecycleUsable ? "Not confirmed" : "Not testable",
      lifecycleUsable
        ? "A first-layer GDPR/ePrivacy cookie consent surface was not confirmed in the retained scan context, so CertScore did not confirm whether a post-choice cookie preference or consent-withdrawal control was available."
        : "Post-choice consent controls were not testable because no initial consent surface was observed in the retained scan context.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: lifecycleUsable
          ? []
          : [
              sourceGap(
                "consentControlLifecycleEvidence.initialConsentLayerObserved",
                true,
                initialLayerObserved,
                "Required before CertScore can evaluate whether post-choice consent controls were available."
              )
            ],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable" && (ambiguousControlEvidence || postChoiceOutcomeIncomplete)) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Review signal",
      "Post-choice consent controls require review because the retained lifecycle evidence was incomplete or ambiguous.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [lifecycleAmbiguousGap],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable" && postChoiceOutcomeCleanAbsence) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Not observed",
      "CertScore did not retain a qualifying post-choice cookie preference or withdrawal control after the initial consent action.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Gap observed",
      "CertScore observed an initial consent surface, but did not observe an obvious cookie preferences, privacy settings, or consent-preference reopen control on the tested public pages. Review whether users can later change or withdraw consent through another path.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "partial") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Review signal",
      "Post-choice consent controls require review because the retained lifecycle evidence was incomplete or ambiguous.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "consentControlLifecycleEvidence.coverageStatus",
            "usable",
            coverageStatus,
            "Required to treat absence of a preference or withdrawal control as a clean tested observation."
          )
        ],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  return makeOutcome(
    "preference_withdrawal_control",
    "Not testable",
    "Consent-control lifecycle evidence was missing or insufficient for the tested context.",
    evidenceRefs,
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "consentControlLifecycleEvidence.coverageStatus",
          "usable or partial lifecycle evidence",
          coverageStatus,
          "Required to evaluate whether a preference or withdrawal control was available."
        )
      ],
      retainedEvidence: lifecycleRetainedEvidence
    }
  );
}

type PolicyDisclosureRowConfig = {
  disclosureType?: string;
  label: string;
  rowId: string;
  signalKeys: string[];
  textPattern: RegExp;
};

const GDPR_TRANSPARENCY_ARTICLE13_TOPIC_TO_ROW_ID: Record<string, string> = {
  automated_decision_making_or_profiling: "automated_decision_making_profiling_disclosure",
  controller_contact: "controller_contact_disclosure",
  data_retention: "retention_disclosure_observed",
  data_subject_rights: "data_subject_rights_disclosure",
  dpo_contact: "dpo_contact_point_disclosure",
  international_transfers: "international_transfers_disclosure",
  legal_basis: "legal_basis_disclosure_observed",
  processing_purposes: "processing_purposes_disclosure",
  recipients_or_vendor_categories: "recipients_vendor_categories_disclosure",
  supervisory_authority: "supervisory_authority_complaint_disclosure"
};

type PolicySectionChunk = {
  charEnd?: number;
  charStart?: number;
  heading?: string;
  navPenalty: number;
  rowMatchScore?: number;
  sourceUrl: string;
  substantiveScore: number;
  text: string;
};

const LEGAL_BASIS_DISCLOSURE_PATTERN =
  /(?:legal|lawful)\s+basis|article\s*6|legitimate interests?|legal obligation|when required by law|vital interests?|public task|performance of (?:a )?contract|contractual necessity|(?:basis for processing|we rely on|based on).{0,160}\b(?:consent|contract|legal obligation|legitimate interest)\b|\bwith your consent\b|\bconsent\b.{0,140}\b(?:personal data|personal information|processing|lawful|legal basis)\b/i;

const RECIPIENTS_VENDOR_CATEGORIES_DISCLOSURE_PATTERN =
  /recipient|third[- ]part(?:y|ies)|service providers?|vendors?|processors?|subprocessors?|business partners?|advertising partners?|analytics providers?|payment processors?|hosting providers?|cloud providers?|affiliates?|empfänger|dienstleister|auftragsverarbeiter|destinataires?|prestataires?|sous-traitants?|destinatarios?|proveedores?|encargados?|destinatari|fornitori|responsabili|ontvangers|dienstverleners|verwerkers|odbiorcy|dostawcy|podmioty przetwarzające/i;

const RECIPIENT_VENDOR_CATEGORY_TERMS =
  /service providers?|vendors?|processors?|subprocessors?|business partners?|advertising partners?|analytics providers?|payment processors?|hosting providers?|cloud providers?|affiliates?|group companies|social networks?|platforms?|law enforcement|regulators?|third[- ]part(?:y|ies)|recipients?|empfänger|dienstleister|auftragsverarbeiter|destinataires?|prestataires?|sous-traitants?|destinatarios?|proveedores?|encargados?|destinatari|fornitori|responsabili|ontvangers|dienstverleners|verwerkers|odbiorcy|dostawcy|podmioty przetwarzające/i;

const RECIPIENT_DISCLOSURE_VERBS =
  /share|shared|sharing|disclose|disclosed|disclosing|sell|sold|transfer|transferred|make available|made available|provide|provided|providing|receive|receives|received|access|accessed|handle|handled|process|processed|processing|teilen|weitergeben|übermitteln|erhalten|verarbeiten|communiqu|partage|transmis|transfér|trait|compart|comunic|transmit|tratar|condivid|comunicat|trasferit|tratt|delen|verstrekken|ontvangen|verwerken|udostęp|przekaz|przetwarz/i;

const CONTROLLER_CONTACT_DISCLOSURE_PATTERN =
  /data controller|\bcontroller\b|privacy (?:contact|office|team|questions|rights)|data protection(?: office| officer)?|contact (?:our )?(?:privacy|data protection)|contact (?:google|us).{0,80}(?:privacy|data protection)|privacy@/i;

const PROCESSING_PURPOSES_DISCLOSURE_PATTERN =
  /purpose(?:s)? (?:of|for|we|to)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)|(?:use|processing) of (?:your )?(?:personal )?(?:data|information)|provide (?:our )?services|personalize (?:content|ads|advertising|services|experience)|tailored search results|measure (?:performance|advertising)|perform analytics/i;

const RETENTION_DISCLOSURE_PATTERN =
  /retaining your information|retain(?:ing)? (?:the |your |personal )?(?:data|information)|retained for|deleted or anonymized|deletion|retention periods?|legal purposes|fraud and abuse prevention|retention criteria|storage period|retain.{0,120}(?:as long as necessary|required by law|for the purposes|until|unless|legal purposes|fraud|abuse)|delete your information.{0,120}(?:retention|retain|retained|deleted|anonymized)|keep your.{0,100}(?:as long as necessary|required by law|for)|stored for|kept for|how long|expires?|as long as necessary|speicherdauer|aufbewahrung|solange|gespeichert|durée de conservation|conserv(?:é|e|és|ées)|durée conforme|dispositions légales|plazo de conservación|conservamos|periodo di conservazione|conserviamo|bewaartermijn|bewaren|okres przechowywania|przechowujemy/i;

const RETENTION_STRONG_HEADING_PATTERN =
  /\b(?:how long (?:we )?(?:keep|retain)|retention(?: period)?|data retention|storage period|retaining your information|speicherdauer|aufbewahrung|durée de conservation|combien de temps|plazo de conservación|periodo di conservazione|bewaartermijn|okres przechowywania)\b/i;

const RETENTION_ROW_SPECIFIC_HEADING_PATTERN =
  /\b(?:how long (?:we )?(?:keep|retain)|retention period|storage period|speicherdauer|aufbewahrung|durée de conservation|combien de temps|plazo de conservación|periodo di conservazione|bewaartermijn|okres przechowywania)\b/i;

const RETENTION_EXPLICIT_LIFECYCLE_PATTERN =
  /\b(?:how long (?:we )?(?:keep|retain)|retention periods?|storage period|stored for|kept for|kept until|retained for|retained until|retain(?:ed|ing)? .{0,120}(?:as long as necessary|no longer than necessary|required by law|legal obligations?|legal disputes?|for \d+|for (?:one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|months?|years?)|until)|until you unsubscribe|deleted|removed|erased|anonymiz(?:ed|e|ation)|no longer than necessary|cctv recordings? (?:are )?kept|speicherdauer|aufbewahrung|gespeichert.{0,120}(?:solange|erforderlich|gesetzlich)|conserv(?:é|e|és|ées).{0,160}(?:durée|finalités|dispositions légales|nécessaire|proportionnelles?)|durée.{0,160}(?:conforme|nécessaire|conservation)|plazo de conservación|conservamos.{0,120}(?:necesario|finalidades|legal)|periodo di conservazione|conserviamo.{0,120}(?:necessario|finalità|legge)|bewaartermijn|bewaren.{0,120}(?:noodzakelijk|wettelijk)|okres przechowywania|przechowujemy.{0,120}(?:niezbędny|prawny))\b/i;

const RETENTION_SECURITY_SAFEGUARD_PATTERN =
  /\b(?:how we keep your personal information safe|protect your personal information|security|safeguards?|encryption|confidential|unauthori[sz]ed access|loss|destruction)\b/i;

const DATA_SUBJECT_RIGHTS_DISCLOSURE_PATTERN =
  /your rights|data subject rights|right to (?:access|delete|erase|erasure|rectif|object|restrict|port)|rights? to (?:access|delete|erase|erasure|rectif|object|restrict|port)|access.{0,80}(?:your )?(?:personal )?(?:data|information)|delete your information|delete.{0,80}(?:your )?(?:personal )?(?:data|information)|erasure|correct (?:your )?(?:personal )?(?:data|information)|rectif|portability|object to|restrict (?:the )?processing|export.{0,80}(?:your )?(?:data|information)|review and update|my activity|google takeout|request to remove content|privacy controls|download a copy/i;

const INTERNATIONAL_TRANSFERS_DISCLOSURE_PATTERN =
  /data transfers?|international transfer|cross-border transfer|transfer.{0,120}(?:personal data|personal information|information|data).{0,160}(?:outside|international|across countries|other countries|third countr(?:y|ies)|foreign countr(?:y|ies))|(?:personal data|personal information|information|data).{0,120}(?:transfer|transferred|stored|processed|accessed|shared|protected).{0,180}(?:outside|international|across countries|other countries|third countr(?:y|ies)|foreign countr(?:y|ies)|united states|usa|eea|european economic area|uk|united kingdom)|(?:third parties|third-party|service providers?|business partners?|partners?|vendors?|processors?|subprocessors?|affiliates?|recipients?).{0,240}(?:outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|foreign countr(?:y|ies)|other countries)|agreements?.{0,240}(?:personal data|personal information|information|data).{0,240}(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union))|(?:stored|processed|accessed|shared).{0,120}(?:in|from).{0,80}(?:united states|usa|other countries|countries outside|third countries|foreign countries)|servers around the world|processed on servers located outside|outside of the country where you live|legal frameworks relating to the transfer of data|standard contractual|contractual clauses|sccs?|adequacy|adequacy decisions?|adequate level of protection|uk idta|international data transfer agreement|transfer mechanisms?|data transfer framework|dpf|privacy shield/i;

const SUPERVISORY_AUTHORITY_DISCLOSURE_PATTERN =
  /supervisory authority|data protection authority|local data protection authorit(?:y|ies)|lodge a complaint|formal written complaints?|resolve any complaints?|complain(?:t)? with (?:your )?(?:local )?(?:supervisory|data protection) authority|regulatory authorities|regulators?|ico|cnil|dpc/i;

const AUTOMATED_DECISION_PROFILING_DISCLOSURE_PATTERN =
  /automated decision(?:-making| making)?|solely automated (?:processing|decision)|automated systems?|meaningful information about the logic involved|legal or similarly significant effects|similarly significant effects|\bprofiling\b|personalized ads|personalized advertising|customized search results|tailored search results|tailored|algorithms?|recognize patterns/i;

const ARTICLE_22_AUTOMATED_DECISION_DISCLOSURE_PATTERN =
  /solely (?:on )?automated (?:processing|decision)|automated decision(?:-making| making)?.{0,160}(?:legal or similarly significant effects|similarly significant effects|meaningful information about the logic involved)|(?:legal or similarly significant effects|similarly significant effects).{0,160}(?:automated decision|solely (?:on )?automated|profiling)/i;

const GENERAL_AUTOMATED_PROCESSING_DISCLOSURE_PATTERN =
  /automated systems?|personalized ads|personalized advertising|targeted advertising|customized search results|tailored search results|tailored|algorithms?|recognize patterns|\bprofiling\b/i;

const POLICY_DISCLOSURE_ROWS: PolicyDisclosureRowConfig[] = [
  {
    rowId: "privacy_notice_availability",
    label: "Privacy notice",
    signalKeys: ["privacyPolicyPresent", "privacy_policy_present"],
    textPattern: /privacy policy|privacy notice|privacy center/i
  },
  {
    rowId: "controller_contact_disclosure",
    label: "Controller/contact disclosure",
    disclosureType: "controller_contact",
    signalKeys: ["controllerContactDisclosureObserved", "controller_contact_disclosure_observed"],
    textPattern: CONTROLLER_CONTACT_DISCLOSURE_PATTERN
  },
  {
    rowId: "processing_purposes_disclosure",
    label: "Processing purposes disclosure",
    disclosureType: "processing_purposes",
    signalKeys: ["processingPurposesDisclosureObserved", "processing_purposes_disclosure_observed"],
    textPattern: PROCESSING_PURPOSES_DISCLOSURE_PATTERN
  },
  {
    rowId: "legal_basis_disclosure_observed",
    label: "Legal basis disclosure",
    disclosureType: "legal_basis",
    signalKeys: ["legalBasisDisclosureObserved", "legal_basis_disclosure_observed"],
    textPattern: LEGAL_BASIS_DISCLOSURE_PATTERN
  },
  {
    rowId: "recipients_vendor_categories_disclosure",
    label: "Recipients/vendor categories disclosure",
    disclosureType: "recipients_or_vendor_categories",
    signalKeys: ["recipientsVendorCategoriesDisclosureObserved", "recipients_vendor_categories_disclosure_observed"],
    textPattern: RECIPIENTS_VENDOR_CATEGORIES_DISCLOSURE_PATTERN
  },
  {
    rowId: "retention_disclosure_observed",
    label: "Retention disclosure",
    disclosureType: "data_retention",
    signalKeys: ["retentionDisclosureObserved", "retention_disclosure_observed"],
    textPattern: RETENTION_DISCLOSURE_PATTERN
  },
  {
    rowId: "data_subject_rights_disclosure",
    label: "Data subject rights disclosure",
    disclosureType: "data_subject_rights",
    signalKeys: ["dataSubjectRightsDisclosureObserved", "data_subject_rights_disclosure_observed"],
    textPattern: DATA_SUBJECT_RIGHTS_DISCLOSURE_PATTERN
  },
  {
    rowId: "international_transfers_disclosure",
    label: "International transfer disclosure",
    disclosureType: "international_transfers",
    signalKeys: ["internationalTransfersDisclosureObserved", "international_transfers_disclosure_observed"],
    textPattern: INTERNATIONAL_TRANSFERS_DISCLOSURE_PATTERN
  },
  {
    rowId: "dpo_contact_point_disclosure",
    label: "DPO / privacy contact point disclosure",
    disclosureType: "dpo_contact",
    signalKeys: ["dpoContactPointDisclosureObserved", "dpo_contact_point_disclosure_observed"],
    textPattern: /data protection officer|dpo|privacy office|privacy contact|privacy team|data protection contact/i
  },
  {
    rowId: "supervisory_authority_complaint_disclosure",
    label: "Supervisory authority complaint disclosure",
    disclosureType: "supervisory_authority",
    signalKeys: ["supervisoryAuthorityComplaintDisclosureObserved", "supervisory_authority_complaint_disclosure_observed"],
    textPattern: SUPERVISORY_AUTHORITY_DISCLOSURE_PATTERN
  },
  {
    rowId: "automated_decision_making_profiling_disclosure",
    label: "Automated decision-making/profiling disclosure",
    disclosureType: "automated_decision_making_or_profiling",
    signalKeys: ["automatedDecisionMakingProfilingDisclosureObserved", "automated_decision_making_profiling_disclosure_observed"],
    textPattern: AUTOMATED_DECISION_PROFILING_DISCLOSURE_PATTERN
  }
];

const MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13 = 2_500;

function getPolicyDisclosureSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, ["policyDisclosureSummary", "policy_disclosure_summary"]);
}

function getGdprTransparencyArticle13ChecklistConcern(
  input: GdprEprivacyCoveragePolicyInput,
  rowId: string
) {
  return (input.normalizedConcerns ?? [])
    .filter((concern) => {
      const rawEvidence = concern.evidenceBundle.rawEvidence;
      const topic = getString(rawEvidence, [
        "gdprTransparencyArticle13Topic",
        "gdpr_transparency_article13_topic"
      ]);
      return concern.originKey === `gdpr_transparency.article13.${topic}` &&
        concern.originType === "runtime_artifact" &&
        concern.promotionEligibility === "internal_only" &&
        concern.externalSurfacingEligibility === "audit_only" &&
        rawEvidence?.gdprTransparencyArticle13Evidence === true &&
        rawEvidence.productionCredit === true &&
        getString(rawEvidence, ["productionCreditProfile", "production_credit_profile"]) ===
          "gdpr_transparency_multilingual_article13_v1" &&
        getString(rawEvidence, ["classifierProvenance", "classifier_provenance"]) ===
          "gdpr_transparency_topic_classifier.v1" &&
        topic !== null &&
        GDPR_TRANSPARENCY_ARTICLE13_TOPIC_TO_ROW_ID[topic] === rowId;
    })
    .sort((left, right) =>
      gdprTransparencyChecklistEligibilityScore(right.regulatoryChecklistEligibility) -
      gdprTransparencyChecklistEligibilityScore(left.regulatoryChecklistEligibility)
    )[0] ?? null;
}

function gdprTransparencyChecklistEligibilityScore(value: unknown) {
  return value === "observed" ? 2 : value === "review_signal" ? 1 : 0;
}

function buildGdprTransparencyArticle13ConcernOutcome(
  input: GdprEprivacyCoveragePolicyInput,
  config: PolicyDisclosureRowConfig
) {
  const concern = getGdprTransparencyArticle13ChecklistConcern(input, config.rowId);
  if (!concern || concern.regulatoryChecklistEligibility === "none") {
    return null;
  }

  const rawEvidence = concern.evidenceBundle.rawEvidence ?? {};
  const topic = getString(rawEvidence, [
    "gdprTransparencyArticle13Topic",
    "gdpr_transparency_article13_topic"
  ]) ?? config.disclosureType ?? "unknown";
  const sourceUrl = getString(rawEvidence, ["sourceUrl", "source_url"]);
  const locale = getString(rawEvidence, ["matchedLocale", "matched_locale"]);
  const state = getString(rawEvidence, [
    "gdprTransparencyArticle13ConcernState",
    "gdpr_transparency_article13_concern_state"
  ]) ?? concern.observedValue ?? "ambiguous";
  const evidenceRefs = [
    `Evidence: ${config.label}`,
    locale ? `Locale: ${locale}` : null,
    sourceUrl ? `Policy URL: ${sourceUrl}` : null
  ].filter((value): value is string => Boolean(value));
  const retainedEvidence = {
    article13Signal: {
      classifierProvenance: rawEvidence.classifierProvenance,
      classifierReasonCodes: rawEvidence.classifierReasonCodes,
      confidence: rawEvidence.confidence,
      disclosureType: topic,
      evidenceSource: "normalized_gdpr_transparency_article13_concern",
      matchStrength: rawEvidence.matchStrength,
      matchedLocale: locale,
      productionCredit: rawEvidence.productionCredit,
      productionCreditProfile: rawEvidence.productionCreditProfile,
      selectedEvidenceStrength: rawEvidence.selectedEvidenceStrength,
      source: "normalized_concern",
      status: concern.regulatoryChecklistEligibility === "observed" ? "observed" : "partial"
    },
    gdprTransparencyArticle13Concern: {
      canonicalConcernKey: concern.canonicalConcernKey,
      originKey: concern.originKey,
      regulatoryChecklistEligibility: concern.regulatoryChecklistEligibility,
      state,
      topic
    },
    signalObserved: concern.regulatoryChecklistEligibility === "observed" ? true : "partial"
  };

  if (concern.regulatoryChecklistEligibility === "observed") {
    return makeOutcome(
      config.rowId,
      "Observed",
      `${config.label} evidence was retained through adapter-approved multilingual GDPR Transparency Article 13 evidence.`,
      evidenceRefs,
      {
        retainedEvidence
      }
    );
  }

  return makeOutcome(
    config.rowId,
    "Review signal",
    `${config.label} was partially observed through adapter-approved multilingual GDPR Transparency Article 13 evidence and needs review before Observed credit.`,
    evidenceRefs,
    {
      retainedEvidence
    }
  );
}

function getPolicyDisclosureText(summary: Record<string, unknown> | null | undefined) {
  return getString(summary, ["retainedPrivacyPolicyTextExcerpt", "retained_privacy_policy_text_excerpt"]) ?? "";
}

function getPolicyTextExtractionHealth(summary: Record<string, unknown> | null | undefined) {
  const explicit = getObject(summary, ["policyTextExtractionHealth", "policy_text_extraction_health"]);
  if (explicit) {
    return explicit;
  }

  const privacyPolicyPresent = getBoolean(summary, ["privacyPolicyPresent", "privacy_policy_present"]) === true;
  const extractedTextLength = getNumber(summary, ["privacyPolicyTextCharacterCount", "privacy_policy_text_character_count"]) ?? 0;
  const processingErrorObserved = getBoolean(summary, ["processingErrorObserved", "processing_error_observed"]) === true;
  const retainedText = getPolicyDisclosureText(summary);
  const policyTextExtractionStatus =
    !privacyPolicyPresent
      ? "not_attempted"
      : processingErrorObserved
        ? "errored"
        : looksLikeCodeOrConfigText(retainedText)
          ? "low_quality_extracted_code_or_config"
        : extractedTextLength >= MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13
          ? "ok"
          : "thin";
  return {
    extractedTextLength,
    extractionFailureReason: policyTextExtractionStatus === "ok"
      ? undefined
      : policyTextExtractionStatus === "not_attempted"
        ? "privacy_policy_surface_not_observed"
        : policyTextExtractionStatus === "errored"
          ? "privacy_policy_text_processing_error"
          : policyTextExtractionStatus === "low_quality_extracted_code_or_config"
            ? "privacy_policy_text_low_quality_or_non_policy_content"
            : "privacy_policy_text_below_minimum_length",
    minimumTextLengthRequired: MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13,
    nanoInvoked: false,
    nanoSkipReason: policyTextExtractionStatus === "ok" ? undefined : "policy_text_input_limited",
    policySurfaceObserved: privacyPolicyPresent,
    policyTextExtractionStatus,
    policyUrlRetained: getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).length > 0,
  };
}

function policyTextExtractionStatus(summary: Record<string, unknown> | null | undefined) {
  return getString(getPolicyTextExtractionHealth(summary), ["policyTextExtractionStatus", "policy_text_extraction_status"]);
}

function policyTextExtractionIsOk(summary: Record<string, unknown> | null | undefined) {
  if (policyTextExtractionStatus(summary) !== "ok") {
    return false;
  }
  const text = getPolicyDisclosureText(summary);
  return !looksLikeCodeOrConfigText(text);
}

function getPolicyArticle13DisclosureSignals(summary: Record<string, unknown> | null | undefined) {
  return getObjectArray(summary, ["article13DisclosureSignals", "article13_disclosure_signals"]);
}

function getPolicyArticle13DisclosureSignal(
  summary: Record<string, unknown> | null | undefined,
  disclosureType: string | undefined
) {
  if (!disclosureType) {
    return null;
  }

  const candidates = getPolicyArticle13DisclosureSignals(summary).filter((signal) =>
    getString(signal, ["disclosureType", "disclosure_type"]) === disclosureType
  );
  if (candidates.length === 0) {
    return null;
  }
  const sanitizedCandidates = candidates
    .map((signal) => sanitizePolicyArticle13Signal(signal))
    .filter((signal) => isPolicyDisclosureEvidenceUsable(
      getString(signal, ["evidenceText", "evidence_text"]) ?? "",
      disclosureType
    ));
  if (sanitizedCandidates.length === 0) {
    return null;
  }
  return sanitizedCandidates
    .sort((left, right) =>
      scorePolicyDisclosureEvidenceText(
        getString(right, ["evidenceText", "evidence_text"]) ?? "",
        disclosureType
      ) - scorePolicyDisclosureEvidenceText(
        getString(left, ["evidenceText", "evidence_text"]) ?? "",
        disclosureType
      )
    )[0] ?? null;
}

function getRetainedArticle13SectionEvidence(
  summary: Record<string, unknown> | null | undefined,
  disclosureType: string | undefined
) {
  if (!disclosureType) {
    return null;
  }
  const candidates = getObjectArray(summary, ["retainedArticle13SectionEvidence", "retained_article13_section_evidence"])
    .filter((evidence) => getString(evidence, ["coverageArea", "coverage_area"]) === disclosureType)
    .map((evidence) => ({
      ...evidence,
      selectedPolicySectionExcerpt: cleanPolicyDisclosureEvidenceText(
        getString(evidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? ""
      )
    }))
    .filter((evidence) => rowSpecificSectionEvidenceIsObserved(evidence, disclosureType));
  return candidates
    .sort((left, right) =>
      selectedEvidenceStrengthScore(getString(right, ["selectedEvidenceStrength", "selected_evidence_strength"])) -
      selectedEvidenceStrengthScore(getString(left, ["selectedEvidenceStrength", "selected_evidence_strength"]))
    )[0] ?? null;
}

function selectedEvidenceStrengthScore(value: string | null | undefined) {
  switch (value) {
    case "strong":
      return 3;
    case "moderate":
      return 2;
    default:
      return 0;
  }
}

function selectedEvidenceStrengthIsCreditworthy(value: string | null | undefined) {
  return value === "strong" || value === "moderate";
}

function article13SignalEvidenceStrengthIsCreditworthy(signal: Record<string, unknown> | null | undefined) {
  const selectedEvidenceStrength = getString(signal, ["selectedEvidenceStrength", "selected_evidence_strength"]);
  if (selectedEvidenceStrengthIsCreditworthy(selectedEvidenceStrength)) {
    return true;
  }

  const confidence = getNumber(signal, ["confidence"]);
  return confidence !== null && confidence >= 0.8;
}

function inferredArticle13SignalEvidenceStrength(signal: Record<string, unknown> | null | undefined) {
  const selectedEvidenceStrength = getString(signal, ["selectedEvidenceStrength", "selected_evidence_strength"]);
  if (selectedEvidenceStrength) {
    return selectedEvidenceStrength;
  }

  const confidence = getNumber(signal, ["confidence"]);
  if (confidence !== null && confidence >= 0.9) {
    return "strong";
  }
  if (confidence !== null && confidence >= 0.8) {
    return "moderate";
  }
  return selectedEvidenceStrength;
}

function rowSpecificSectionEvidenceIsObserved(evidence: Record<string, unknown>, disclosureType: string | undefined) {
  const signalObserved = getString(evidence, ["signalObserved", "signal_observed"]);
  const selectedEvidenceStrength = getString(evidence, ["selectedEvidenceStrength", "selected_evidence_strength"]);
  const excerpt = getString(evidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? "";
  if (
    signalObserved !== "observed" ||
    !selectedEvidenceStrengthIsCreditworthy(selectedEvidenceStrength) ||
    !excerpt ||
    !isPolicyDisclosureEvidenceUsable(excerpt, disclosureType)
  ) {
    return false;
  }
  return true;
}

function getValidatedRowSpecificPolicyEvidence(
  summary: Record<string, unknown> | null | undefined,
  disclosureType: string | undefined
) {
  const hasRetainedSectionEvidence =
    getObjectArray(summary, ["retainedArticle13SectionEvidence", "retained_article13_section_evidence"]).length > 0 ||
    getObjectArray(summary, ["retainedPolicySections", "retained_policy_sections"]).length > 0;
  if (
    !disclosureType ||
    (
      getString(summary, ["policyTextCoverageMode", "policy_text_coverage_mode"]) !== "section_targeted" &&
      !hasRetainedSectionEvidence
    )
  ) {
    return null;
  }

  const retainedPolicySectionEvidence = getRetainedPolicySectionEvidence(summary, disclosureType);
  if (
    disclosureType === "data_retention" &&
    retainedPolicySectionEvidence &&
    getString(retainedPolicySectionEvidence, ["selectedEvidenceStrength", "selected_evidence_strength"]) === "strong"
  ) {
    return buildRetainedPolicySectionEvidenceResult(retainedPolicySectionEvidence, disclosureType);
  }

  const article13Signal = getPolicyArticle13DisclosureSignal(summary, disclosureType);
  const article13SignalStatus = getString(article13Signal, ["status"]);
  const article13SelectedStrength = inferredArticle13SignalEvidenceStrength(article13Signal);
  const article13SectionExcerpt = cleanPolicyDisclosureEvidenceText(
    getString(article13Signal, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ??
    getString(article13Signal, ["evidenceText", "evidence_text"]) ??
    ""
  );
  if (
    article13SignalStatus === "observed" &&
    article13SignalEvidenceStrengthIsCreditworthy(article13Signal) &&
    article13SectionExcerpt &&
    isPolicyDisclosureEvidenceUsable(article13SectionExcerpt, disclosureType)
  ) {
    return {
      article13Signal,
      evidenceText: article13SectionExcerpt,
      evidenceType: "article13DisclosureSignals",
      sectionEvidence: null,
      selectedEvidenceStrength: article13SelectedStrength,
      selectedPolicySectionHeading: getString(article13Signal, ["selectedPolicySectionHeading", "selected_policy_section_heading"]),
      selectedPolicySectionUrl: getString(article13Signal, ["selectedPolicySectionUrl", "selected_policy_section_url"])
    };
  }

  const sectionEvidence = getRetainedArticle13SectionEvidence(summary, disclosureType);
  if (!sectionEvidence) {
    if (!retainedPolicySectionEvidence) {
      return null;
    }
    return buildRetainedPolicySectionEvidenceResult(retainedPolicySectionEvidence, disclosureType);
  }
  return {
    article13Signal: {
      disclosureType,
      evidenceText: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
      selectedEvidenceStrength: getString(sectionEvidence, ["selectedEvidenceStrength", "selected_evidence_strength"]),
      selectedPolicySectionExcerpt: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
      selectedPolicySectionHeading: getString(sectionEvidence, ["selectedPolicySectionHeading", "selected_policy_section_heading"]),
      selectedPolicySectionUrl: getString(sectionEvidence, ["selectedPolicySectionUrl", "selected_policy_section_url"]),
      source: getString(sectionEvidence, ["evidenceSource", "evidence_source"]) ?? "section_targeted_policy_extraction",
      status: "observed"
    },
    evidenceText: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? "",
    evidenceType: "retainedArticle13SectionEvidence",
    sectionEvidence,
    selectedEvidenceStrength: getString(sectionEvidence, ["selectedEvidenceStrength", "selected_evidence_strength"]),
    selectedPolicySectionHeading: getString(sectionEvidence, ["selectedPolicySectionHeading", "selected_policy_section_heading"]),
    selectedPolicySectionUrl: getString(sectionEvidence, ["selectedPolicySectionUrl", "selected_policy_section_url"])
  };
}

function buildRetainedPolicySectionEvidenceResult(
  sectionEvidence: Record<string, unknown>,
  disclosureType: string
) {
  return {
    article13Signal: {
      disclosureType,
      evidenceText: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
      selectedEvidenceStrength: getString(sectionEvidence, ["selectedEvidenceStrength", "selected_evidence_strength"]),
      selectedPolicySectionExcerpt: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
      selectedPolicySectionHeading: getString(sectionEvidence, ["selectedPolicySectionHeading", "selected_policy_section_heading"]),
      selectedPolicySectionUrl: getString(sectionEvidence, ["selectedPolicySectionUrl", "selected_policy_section_url"]),
      source: "retained_policy_sections",
      status: "observed"
    },
    evidenceText: getString(sectionEvidence, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? "",
    evidenceType: "retainedPolicySections",
    sectionEvidence,
    selectedEvidenceStrength: getString(sectionEvidence, ["selectedEvidenceStrength", "selected_evidence_strength"]),
    selectedPolicySectionHeading: getString(sectionEvidence, ["selectedPolicySectionHeading", "selected_policy_section_heading"]),
    selectedPolicySectionUrl: getString(sectionEvidence, ["selectedPolicySectionUrl", "selected_policy_section_url"])
  };
}

function getRetainedPolicySectionEvidence(
  summary: Record<string, unknown> | null | undefined,
  disclosureType: string | undefined
) {
  if (disclosureType !== "data_retention") {
    return null;
  }
  const candidates = getObjectArray(summary, ["retainedPolicySections", "retained_policy_sections"])
    .map((section) => {
      const heading = cleanPolicyDisclosureEvidenceText(getString(section, ["heading"]) ?? "");
      const excerpt = cleanPolicyDisclosureEvidenceText(getString(section, ["textExcerpt", "text_excerpt"]) ?? "");
      const evidenceText = policySectionEvidenceText(heading, excerpt);
      const selectedEvidenceStrength = retentionPolicySectionEvidenceStrength(heading, excerpt);
      return {
        evidenceSource: "retained_policy_sections",
        selectedEvidenceStrength,
        selectedPolicySectionExcerpt: evidenceText,
        selectedPolicySectionHeading: heading || undefined,
        selectedPolicySectionUrl: getString(section, ["sourceUrl", "source_url"]),
        signalObserved: selectedEvidenceStrength ? "observed" : "not_observed"
      };
    })
    .filter((evidence) => rowSpecificSectionEvidenceIsObserved(evidence, disclosureType));
  return candidates
    .sort((left, right) =>
      selectedEvidenceStrengthScore(getString(right, ["selectedEvidenceStrength", "selected_evidence_strength"])) -
      selectedEvidenceStrengthScore(getString(left, ["selectedEvidenceStrength", "selected_evidence_strength"])) ||
      scorePolicyDisclosureEvidenceText(
        getString(right, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? "",
        disclosureType
      ) - scorePolicyDisclosureEvidenceText(
        getString(left, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]) ?? "",
        disclosureType
      )
    )[0] ?? null;
}

function retentionPolicySectionEvidenceStrength(heading: string, excerpt: string) {
  const candidateText = policySectionEvidenceText(heading, excerpt);
  if (!candidateText || !hasSubstantiveRetentionDisclosure(candidateText)) {
    return null;
  }
  if (RETENTION_STRONG_HEADING_PATTERN.test(heading) && RETENTION_EXPLICIT_LIFECYCLE_PATTERN.test(candidateText)) {
    return "strong";
  }
  return "moderate";
}

function policySectionEvidenceText(heading: string, excerpt: string) {
  if (!heading) {
    return cleanPolicyDisclosureEvidenceText(excerpt);
  }
  if (!excerpt) {
    return cleanPolicyDisclosureEvidenceText(heading);
  }
  if (new RegExp(`^${escapeRegExp(heading)}\\b`, "i").test(excerpt)) {
    return cleanPolicyDisclosureEvidenceText(excerpt);
  }
  return cleanPolicyDisclosureEvidenceText(`${heading}. ${excerpt}`);
}

function getPolicyObservedTopics(summary: Record<string, unknown> | null | undefined) {
  return getStringArray(summary, ["observedTopics", "observed_topics"]);
}

function policyTextMatchEvidence(text: string, pattern: RegExp, disclosureType?: string, sourceUrl = "retained-policy-text") {
  if (!text) {
    return null;
  }
  const normalized = cleanPolicyDisclosureEvidenceText(text);
  const chunks = buildPolicySectionChunks(normalized, sourceUrl);
  const matches = chunks.flatMap((chunk) => {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    return [...chunk.text.matchAll(regex)].map((match) => {
      const index = match.index ?? 0;
      const start = Math.max(0, index - 180);
      let excerpt = cleanPolicyDisclosureEvidenceText(chunk.text.slice(start, start + 520));
      if (chunk.heading && !new RegExp(`^${escapeRegExp(chunk.heading)}\\b`, "i").test(excerpt)) {
        excerpt = cleanPolicyDisclosureEvidenceText(`${chunk.heading}. ${excerpt}`).slice(0, 620).trimEnd();
      }
      return {
        chunk,
        excerpt,
        score: scorePolicyDisclosureEvidenceText(excerpt, disclosureType) +
          scorePolicySectionChunkForDisclosure(chunk, disclosureType, pattern)
      };
    });
  });
  if (matches.length === 0) {
    return null;
  }

  const substantiveMatches = matches.filter((match) =>
    !isNavigationDominatedPolicyChunk(match.chunk) &&
    isPolicyDisclosureEvidenceUsable(match.excerpt, disclosureType)
  );
  const bestMatch = (substantiveMatches.length > 0 ? substantiveMatches : matches)
    .sort((left, right) => right.score - left.score)[0];
  if (
    !bestMatch ||
    isNavigationDominatedPolicyChunk(bestMatch.chunk) ||
    !isPolicyDisclosureEvidenceUsable(bestMatch.excerpt, disclosureType)
  ) {
    return null;
  }
  return bestMatch?.excerpt ?? null;
}

function buildPolicySectionChunks(text: string, sourceUrl: string): PolicySectionChunk[] {
  const normalized = cleanPolicyDisclosureEvidenceText(text);
  if (!normalized) {
    return [];
  }

  const headingPattern = policySectionHeadingPattern();
  const headingMatches = [...normalized.matchAll(headingPattern)]
    .map((match) => ({
      heading: cleanPolicyDisclosureEvidenceText(match[1] ?? match[0] ?? ""),
      index: match.index ?? 0
    }))
    .filter((match, index, all) =>
      match.heading.length > 0 &&
      (index === 0 || match.index !== all[index - 1]?.index)
    );

  const chunks: PolicySectionChunk[] = [];
  if (headingMatches.length >= 1) {
    for (let index = 0; index < headingMatches.length; index += 1) {
      const current = headingMatches[index];
      if (!current) {
        continue;
      }
      const next = headingMatches[index + 1];
      const chunkStart = current.index;
      const chunkEnd = next?.index ?? normalized.length;
      const chunkText = cleanPolicyDisclosureEvidenceText(normalized.slice(chunkStart, chunkEnd));
      if (chunkText.length < 40) {
        continue;
      }
      chunks.push(createPolicySectionChunk({
        charEnd: chunkEnd,
        charStart: chunkStart,
        heading: current.heading,
        sourceUrl,
        text: chunkText
      }));
    }
  }

  for (const chunk of buildSlidingPolicyTextChunks(normalized, sourceUrl)) {
    chunks.push(chunk);
  }

  if (chunks.length === 0 || normalized.length < 1_000) {
    const fallbackText = normalized.slice(0, Math.min(normalized.length, 1_000)).trimEnd();
    if (fallbackText.length > 0) {
      chunks.push(createPolicySectionChunk({
        charEnd: fallbackText.length,
        charStart: 0,
        sourceUrl,
        text: fallbackText
      }));
    }
  }

  return chunks.sort((left, right) =>
    right.substantiveScore - left.substantiveScore ||
    left.navPenalty - right.navPenalty ||
    (left.charStart ?? 0) - (right.charStart ?? 0)
  );
}

function policySectionHeadingPattern() {
  const headings = [
    "Information Google collects",
    "Why Google collects data",
    "Retaining your information",
    "Data transfers",
    "Exporting and deleting your information",
    "Your privacy controls",
    "Compliance and cooperation with regulatory authorities",
    "Contact us",
    "Data controller",
    "Controller",
    "Data protection officer",
    "Privacy office",
    "Privacy contact",
    "Legal basis",
    "Lawful basis",
    "How we use information",
    "How we use personal data",
    "How we share information",
    "Who we share information with",
    "Recipients",
    "Service providers",
    "Retention",
    "International transfers",
    "Transfer of data",
    "Your rights",
    "Your choices",
    "Complaints",
    "Supervisory authority",
    "Regulatory authorities",
    "Automated decision-making",
    "Automated processing",
    "Profiling"
  ];
  return new RegExp(`(?:^|[.!?]\\s+|\\n+)(${headings.map(escapeRegExp).join("|")})(?:[.:\\-–—]?\\s+)`, "gi");
}

function buildSlidingPolicyTextChunks(text: string, sourceUrl: string): PolicySectionChunk[] {
  const chunks: PolicySectionChunk[] = [];
  const maxChunkChars = 900;
  const strideChars = 520;
  for (let start = 0; start < text.length; start += strideChars) {
    const end = Math.min(text.length, start + maxChunkChars);
    const sliceStart = start === 0 ? 0 : Math.max(0, text.lastIndexOf(". ", start) + 2 || start);
    const sliceEnd = end >= text.length ? text.length : Math.max(end, text.indexOf(". ", end));
    const chunkText = cleanPolicyDisclosureEvidenceText(text.slice(sliceStart, sliceEnd > sliceStart ? sliceEnd + 1 : end));
    if (chunkText.length < 80) {
      continue;
    }
    chunks.push(createPolicySectionChunk({
      charEnd: sliceEnd > sliceStart ? sliceEnd + 1 : end,
      charStart: sliceStart,
      sourceUrl,
      text: chunkText
    }));
    if (end >= text.length) {
      break;
    }
  }
  return chunks;
}

function createPolicySectionChunk(input: {
  charEnd?: number;
  charStart?: number;
  heading?: string;
  sourceUrl: string;
  text: string;
}): PolicySectionChunk {
  const navPenalty = policyChunkNavigationPenalty(input.text, input.heading);
  const substantiveScore = policyChunkSubstantiveScore(input.text, input.heading) - navPenalty;
  return {
    charEnd: input.charEnd,
    charStart: input.charStart,
    heading: input.heading,
    navPenalty,
    sourceUrl: input.sourceUrl,
    substantiveScore,
    text: input.text
  };
}

function policyChunkNavigationPenalty(text: string, heading?: string) {
  const lower = `${heading ?? ""} ${text}`.toLowerCase();
  let penalty = 0;
  const navTerms = lower.match(/\b(?:privacy & terms|overview|privacy policy|terms of service|technologies|faq|introduction|google account)\b/g)?.length ?? 0;
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  const shortLabelCount = lower.match(/\b(?:privacy|terms|overview|faq|technologies|account|help|about)\b/g)?.length ?? 0;
  if (navTerms >= 4) {
    penalty += 12;
  } else if (navTerms >= 2) {
    penalty += 5;
  }
  if (shortLabelCount >= 8 && sentenceCount <= 1) {
    penalty += 12;
  }
  if (/^(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)(?:\s+(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)){2,}/i.test(text)) {
    penalty += 16;
  }
  if (sentenceCount === 0 && text.length > 160) {
    penalty += 5;
  }
  return penalty;
}

function policyChunkSubstantiveScore(text: string, heading?: string) {
  const lower = `${heading ?? ""} ${text}`.toLowerCase();
  let score = Math.min(text.length, 1_200) / 120;
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  score += Math.min(sentenceCount, 5) * 2;
  const substantiveTerms = lower.match(/\b(?:collect|use|process|retain|delete|anonymize|export|access|update|correct|transfer|share|contact|complain|object|restrict|personalize|automated|algorithm|recognize|rights|controller|legal basis|lawful basis|service providers|processors|supervisory authority|data protection authority)\b/g)?.length ?? 0;
  score += Math.min(substantiveTerms, 12);
  if (heading && policyChunkNavigationPenalty(heading) < 4) {
    score += 3;
  }
  return score;
}

function scorePolicySectionChunkForDisclosure(
  chunk: PolicySectionChunk,
  disclosureType: string | undefined,
  pattern: RegExp
) {
  const lower = `${chunk.heading ?? ""} ${chunk.text}`.toLowerCase();
  let score = chunk.substantiveScore;
  pattern.lastIndex = 0;
  if (chunk.heading) {
    score += 6;
  }
  if (chunk.heading && pattern.test(chunk.heading)) {
    score += 10;
  }
  const hints = disclosureType ? policyDisclosureSectionHints(disclosureType) : [];
  for (const hint of hints) {
    if (hint.test(lower)) {
      score += 4;
    }
  }
  return score;
}

function policyDisclosureSectionHints(disclosureType: string): RegExp[] {
  switch (disclosureType) {
    case "controller_contact":
      return [/contact/, /controller/, /data protection/, /privacy office/, /privacy contact/, /google llc/];
    case "processing_purposes":
      return [/why .*collects? data/, /how we use/, /purpose/, /provide .*services/, /personalize/];
    case "legal_basis":
      return [/legal basis/, /lawful basis/, /legitimate interests?/, /consent/, /contract/, /article 6/];
    case "recipients_or_vendor_categories":
      return [/share/, /recipients?/, /service providers?/, /processors?/, /partners?/, /affiliates?/];
    case "data_retention":
      return [/how long (?:we )?(?:keep|retain)/, /retaining your information/, /retention periods?/, /storage period/, /stored for/, /kept for/, /kept until/, /until you unsubscribe/, /deleted|removed|erased/, /anonymiz/, /no longer than necessary/, /legal obligations?/, /legal disputes?/, /cctv recordings? (?:are )?kept/];
    case "data_subject_rights":
      return [/your rights/, /privacy controls/, /access/, /review/, /update/, /correct/, /delete/, /export/, /download a copy/, /object/, /restrict/, /request/];
    case "international_transfers":
      return [/data transfers?/, /servers around the world/, /outside of the country where you live/, /legal frameworks relating to the transfer of data/, /data protection laws vary among countries/, /data privacy framework/, /standard contractual clauses/];
    case "dpo_contact":
      return [/data protection officer/, /\bdpo\b/, /privacy office/, /privacy contact/, /data protection contact/];
    case "supervisory_authority":
      return [/regulatory authorities/, /local data protection authorities/, /supervisory authority/, /data protection authority/, /formal written complaints?/, /resolve any complaints?/, /complaint/];
    case "automated_decision_making_or_profiling":
      return [/automated systems?/, /personalized ads/, /customized search results/, /tailored/, /algorithms?/, /recognize patterns/, /profiling/, /solely automated/, /legal or similarly significant effects/];
    default:
      return [];
  }
}

function isNavigationDominatedPolicyChunk(chunk: PolicySectionChunk) {
  return chunk.navPenalty >= 12 && chunk.substantiveScore < 8;
}

function isPolicyDisclosureEvidenceUsable(value: string, disclosureType: string | undefined) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  if (text.length < 35) {
    return false;
  }
  if (looksLikeCodeOrConfigText(text) || !hasMinimumPolicyProseQuality(text)) {
    return false;
  }
  if (isPolicyChromeOrTocExcerpt(text)) {
    return false;
  }
  if (disclosureType === "data_retention" && !hasSubstantiveRetentionDisclosure(text)) {
    return false;
  }
  if (disclosureType === "controller_contact" && !hasSubstantiveControllerContactDisclosure(text)) {
    return false;
  }
  if (disclosureType === "data_subject_rights" && !hasSubstantiveDataSubjectRightsDisclosure(text)) {
    return false;
  }
  if (disclosureType === "recipients_or_vendor_categories" && !hasSubstantiveRecipientsVendorCategoriesDisclosure(text)) {
    return false;
  }
  if (disclosureType === "international_transfers" && !hasSubstantiveInternationalTransferDisclosure(text)) {
    return false;
  }
  return true;
}

function isPolicyChromeOrTocExcerpt(value: string) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  const lower = text.toLowerCase();
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  const chromeTermCount = lower.match(/\b(?:skip to main content|privacy policy|privacy & terms|overview|terms of service|technologies|faq|introduction|google account)\b/g)?.length ?? 0;
  const substantiveVerbCount = lower.match(/\b(?:collect|use|process|retain|delete|share|transfer|contact|complain|access|correct|object|restrict|personalize)\b/g)?.length ?? 0;
  const headingSequence =
    /privacy policy\s+privacy & terms|privacy & terms\s+privacy policy|overview\s+terms of service\s+technologies\s+faq|information google collects\s+why google collects data\s+your privacy controls|terms of service\s+technologies\s+faq/i.test(text);
  const repeatedShortLabels = lower.match(/\b(?:privacy|terms|overview|faq|technologies|introduction)\b/g)?.length ?? 0;
  if (headingSequence && sentenceCount <= 1) {
    return true;
  }
  if (chromeTermCount >= 4 && sentenceCount <= 1 && substantiveVerbCount < 3) {
    return true;
  }
  if (repeatedShortLabels >= 7 && sentenceCount <= 1) {
    return true;
  }
  if (/^(?:skip to main content\s+)?(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)(?:\s+(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)){2,}/i.test(text)) {
    return substantiveVerbCount >= 3 && sentenceCount >= 2 ? false : true;
  }
  return false;
}

function disclosureEvidenceBodyAfterHeading(value: string, headings: RegExp[]) {
  let text = cleanPolicyDisclosureEvidenceText(value);
  text = text.replace(/^(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction|skip to main content)(?:\s+(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction))*[.:;\-–—]?\s*/i, "");
  for (const heading of headings) {
    text = text.replace(heading, "");
  }
  return text.trim();
}

function hasSubstantiveRetentionDisclosure(value: string) {
  const body = disclosureEvidenceBodyAfterHeading(value, [
    /^(?:retaining your information|retention|data retention|how long (?:we )?(?:keep|retain)(?: your)?(?: personal)?(?: data| information)?(?: collected through cookies)?)[.:;\-–—]?\s*/i
  ]);
  const fullCandidate = cleanPolicyDisclosureEvidenceText(value);
  const hasExplicitLifecycleSignal = RETENTION_EXPLICIT_LIFECYCLE_PATTERN.test(fullCandidate) ||
    /\b(?:retain|retained|retention|keep|kept|stored|storage)\b.{0,120}\b(?:\d+\s+(?:days?|weeks?|months?|years?)|one (?:day|week|month|year)|two (?:days?|weeks?|months?|years?)|three (?:days?|weeks?|months?|years?)|four (?:days?|weeks?|months?|years?)|legal obligations?|legal disputes?)\b/i.test(fullCandidate) ||
    /\b(?:\d+\s+(?:days?|weeks?|months?|years?)|one (?:day|week|month|year)|two (?:days?|weeks?|months?|years?)|three (?:days?|weeks?|months?|years?)|four (?:days?|weeks?|months?|years?)|legal obligations?|legal disputes?)\b.{0,120}\b(?:retain|retained|retention|keep|kept|stored|storage)\b/i.test(fullCandidate);
  if (RETENTION_SECURITY_SAFEGUARD_PATTERN.test(fullCandidate) && !hasExplicitLifecycleSignal) {
    return false;
  }
  const genericStorageOnly =
    (
      /\b(?:collect|store|storage|cookies?|local storage|databases?|server logs)\b/i.test(body) ||
      /(?:collect(?:é|e|és|ées)|recogid[ao]s?|raccolt[oi]|verzameld|zbierane)/i.test(body)
    ) &&
    !(
      /\b(?:retain|retained|retention|retention period|how long|delet(?:e|ed|ion)|eras(?:e|ed|ure)|anonymiz(?:e|ed|ation)|remove|expires?|kept for|kept until|stored for|as long as|as long as necessary|no longer than necessary|required by law|legal purposes|legal obligations?|legal disputes?|fraud and abuse prevention|no longer needed|no engagement period)\b/i.test(body) ||
      /(?:speicherdauer|aufbewahrung|gespeichert|solange|erforderlich|gesetzlich|conservation|conservons|conserv(?:é|e|és|ées)|durée|dispositions légales|finalités|conservación|conservamos|plazo|conservazione|conserviamo|periodo|bewaren|bewaartermijn|noodzakelijk|przechowywania|przechowujemy|okres)/i.test(body)
    );
  if (genericStorageOnly) {
    return false;
  }
  return RETENTION_ROW_SPECIFIC_HEADING_PATTERN.test(fullCandidate) ||
    hasExplicitLifecycleSignal ||
    /\b(?:retain|retained|retention|retention period|how long|kept for|kept until|stored for|as long as|as long as necessary|no longer than necessary|required by law|legal purposes|fraud and abuse prevention|no longer needed|no engagement period|expires?)\b/i.test(body) ||
    /(?:speicherdauer|aufbewahrung|gespeichert.{0,120}(?:solange|erforderlich|gesetzlich)|conserv(?:é|e|és|ées).{0,160}(?:durée|finalités|dispositions légales|nécessaire|proportionnelles?)|durée.{0,160}(?:conforme|nécessaire|conservation)|plazo de conservación|conservamos.{0,120}(?:necesario|finalidades|legal)|periodo di conservazione|conserviamo.{0,120}(?:necessario|finalità|legge)|bewaartermijn|bewaren.{0,120}(?:noodzakelijk|wettelijk)|okres przechowywania|przechowujemy.{0,120}(?:niezbędny|prawny))/i.test(body) ||
    /\b(?:delet(?:e|ed|ion)|eras(?:e|ed|ure)|anonymiz(?:e|ed|ation)|remove)\b.{0,120}\b(?:automatically|after|when|once|period|retention|no longer|settings|account|inactive|engagement|unsubscribe)\b/i.test(body) ||
    /\b(?:automatically|after|when|once|period|retention|no longer|settings|account|inactive|engagement|unsubscribe)\b.{0,120}\b(?:delet(?:e|ed|ion)|eras(?:e|ed|ure)|anonymiz(?:e|ed|ation)|remove)\b/i.test(body);
}

function hasSubstantiveControllerContactDisclosure(value: string) {
  const body = disclosureEvidenceBodyAfterHeading(value, [
    /^(?:contact us|data controller|controller|privacy contact|privacy office|data protection officer)[.:;\-–—]?\s*/i
  ]);
  return /\b(?:data controller|controller.{0,80}(?:contact|privacy|data protection)|google llc|contact google about privacy questions|contact (?:us|google).{0,120}(?:privacy|data protection)|contact form|privacy office|data protection office|data protection officer|privacy@|postal address|registered address)\b/i.test(body);
}

function hasSubstantiveDataSubjectRightsDisclosure(value: string) {
  const body = disclosureEvidenceBodyAfterHeading(value, [
    /^(?:your rights|data subject rights|privacy controls|exporting and deleting your information)[.:;\-–—]?\s*/i
  ]);
  const rightsVerbMatches = body.match(/\b(?:see|access|take it with you|export|download|correct(?:ions?)?|rectif(?:y|ication)|withdraw consent|opt out|object|restrict|eras(?:e|ed|ure)|delete|remove|exercise (?:your )?privacy rights|exercise (?:your )?rights)\b/gi) ?? [];
  return rightsVerbMatches.length >= 2 ||
    /\b(?:right to (?:access|delete|erasure|rectification|object|restrict|portability)|rights? to (?:access|delete|erasure|rectification|object|restrict|portability)|exercise (?:your )?(?:privacy )?rights|privacy controls|take it with you|withdraw consent|opt out|download a copy|export (?:your )?(?:data|information)|delete (?:your )?(?:data|information)|erase (?:your )?(?:data|information)|access (?:your )?(?:personal )?(?:data|information)|correct(?:ions?)? (?:to )?(?:your )?(?:personal )?(?:data|information)|request to (?:remove|delete|erase|access|correct))\b/i.test(body);
}

function hasSubstantiveRecipientsVendorCategoriesDisclosure(value: string) {
  const body = disclosureEvidenceBodyAfterHeading(value, [
    /^(?:recipients|third parties|sharing(?: your)? information|how we share|vendors|service providers|categories of third parties)[.:;\-–—]?\s*/i
  ]);
  const hasRecipientCategory = RECIPIENT_VENDOR_CATEGORY_TERMS.test(body);
  if (!hasRecipientCategory) {
    return false;
  }

  const sessionReplayOrCollectedDataContext =
    /\b(?:record users?'? interactions|recording users?'? interactions|mouse clicks|mouse movements|page scrolling|keystrokes?|key touches|session replay|interaction recording|usage data|information about your use|collecting information about your use|cookies?|pixels?|sdks?)\b/i.test(body);
  const broadRecipientDisclosure =
    /\b(?:share|shared|sharing|disclose|disclosed|disclosing|sell|sold|transfer|transferred|make available|made available|categories of (?:third parties|recipients)|third parties with whom we share|recipients of (?:personal )?(?:data|information))\b/i.test(body);
  if (sessionReplayOrCollectedDataContext && !broadRecipientDisclosure) {
    return false;
  }

  return /\b(?:share|shared|sharing|disclose|disclosed|disclosing|sell|sold|transfer|transferred|make available|made available|provide|provided|providing)\b.{0,180}\b(?:personal data|personal information|information|data)\b.{0,240}\b(?:service providers?|vendors?|processors?|subprocessors?|affiliates?|group companies|advertising partners?|analytics providers?|payment processors?|business partners?|social networks?|platforms?|law enforcement|regulators?|third[- ]part(?:y|ies)|recipients?)\b/i.test(body) ||
    /\b(?:personal data|personal information|information|data)\b.{0,180}\b(?:share|shared|sharing|disclose|disclosed|disclosing|sell|sold|transfer|transferred|make available|made available|provide|provided|providing)\b.{0,240}\b(?:service providers?|vendors?|processors?|subprocessors?|affiliates?|group companies|advertising partners?|analytics providers?|payment processors?|business partners?|social networks?|platforms?|law enforcement|regulators?|third[- ]part(?:y|ies)|recipients?)\b/i.test(body) ||
    /\b(?:service providers?|vendors?|processors?|subprocessors?)\b.{0,80}\b(?:will|may|can|to)?\s*(?:process|receive|access|handle)\b.{0,180}\b(?:personal data|personal information|information|data)\b.{0,180}\b(?:as (?:a )?data processor|under (?:our )?instructions?|on (?:our )?behalf|for us)\b/i.test(body) ||
    /\b(?:personal data|personal information|information|data)\b.{0,180}\b(?:processed|handled|accessed|received)\b.{0,180}\b(?:by|with)\b.{0,80}\b(?:service providers?|vendors?|processors?|subprocessors?)\b.{0,180}\b(?:under (?:our )?instructions?|on (?:our )?behalf|for us)\b/i.test(body) ||
    /\b(?:categories of (?:third parties|recipients)|third parties with whom we share|recipients of (?:personal )?(?:data|information)|service providers? (?:that|who) (?:process|receive|access|handle|provide|perform|assist)|processors? (?:that|who) process|vendors? (?:that|who) (?:process|receive|access|handle|provide)|affiliates? (?:that|who)? (?:receive|process|access|use|share)|business partners? (?:that|who)? (?:receive|process|access|use|share)|process (?:personal data|personal information|information|data) on our behalf|on our behalf)\b/i.test(body) ||
    /(?:données personnelles|datos personales|dati personali|persoonsgegevens|dane osobowe|personenbezogene daten).{0,180}(?:communiqu|partage|transmis|transfér|compart|comunic|condivid|trasferit|delen|verstrekken|udostęp|przekaz|teilen|weitergeben|übermitteln).{0,240}(?:prestataires?|sous-traitants?|destinataires?|proveedores?|encargados?|destinatarios?|fornitori|responsabili|destinatari|dienstverleners|verwerkers|ontvangers|dostawcy|odbiorcy|empfänger|dienstleister|auftragsverarbeiter)/i.test(body) ||
    /(?:prestataires?|sous-traitants?|destinataires?|proveedores?|encargados?|destinatarios?|fornitori|responsabili|destinatari|dienstverleners|verwerkers|ontvangers|dostawcy|odbiorcy|empfänger|dienstleister|auftragsverarbeiter).{0,220}(?:trait|tratar|tratt|verwerken|przetwarz|verarbeiten|process).{0,220}(?:données personnelles|datos personales|dati personali|persoonsgegevens|dane osobowe|personenbezogene daten)/i.test(body);
}

function hasSubstantiveInternationalTransferDisclosure(value: string) {
  const body = disclosureEvidenceBodyAfterHeading(value, [
    /^(?:international transfers?|data transfers?|transfers of (?:personal )?(?:data|information)|global processing)[.:;\-–—]?\s*/i
  ]);
  const geographyOnlyConsentOrRights =
    /\b(?:laws?|requirements?|consent|adult|parent|guardian|child|children|minor|privacy rights?|jurisdiction|region|country)\b/i.test(body) &&
    !/\b(?:transfer|transferred|transfers|store|stored|process|processed|access|accessed|share|shared|host|hosted|servers?|standard contractual clauses?|sccs?|adequacy|adequate level|uk idta|international data transfer agreement|data transfer framework|dpf|privacy shield|transfer mechanism)\b/i.test(body);
  if (geographyOnlyConsentOrRights) {
    return false;
  }
  const recipientOutsideRegionContext =
    /\b(?:third parties|third-party|service providers?|business partners?|partners?|vendors?|processors?|subprocessors?|affiliates?|recipients?)\b.{0,260}\b(?:outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|outside (?:your|the user's|the users?|their) countr(?:y|ies)|third countr(?:y|ies)|foreign countr(?:y|ies)|other countries|countries outside)\b/i.test(body);
  const personalDataMovementOrProtectionContext =
    /\b(?:personal data|personal information|information|data)\b/i.test(body) &&
    /\b(?:transfer|transferred|transfers|store|stored|process|processed|access|accessed|share|shared|host|hosted|protect|protected|safeguard|safeguards?|agreements?|contracts?)\b/i.test(body);
  if (recipientOutsideRegionContext && personalDataMovementOrProtectionContext) {
    return true;
  }
  return /\b(?:transfer|transferred|transfers|store|stored|process|processed|access|accessed|share|shared|host|hosted)\b.{0,180}\b(?:personal data|personal information|information|data)\b.{0,220}\b(?:outside|international|across countries|other countries|third countries|foreign countries|united states|usa|eea|european economic area|uk|united kingdom)\b/i.test(body) ||
    /\b(?:personal data|personal information|information|data)\b.{0,180}\b(?:transfer|transferred|transfers|store|stored|process|processed|access|accessed|share|shared|host|hosted)\b.{0,220}\b(?:outside|international|across countries|other countries|third countries|foreign countries|united states|usa|eea|european economic area|uk|united kingdom)\b/i.test(body) ||
    /\b(?:stored|processed|accessed|shared|hosted)\b.{0,120}\b(?:in|from)\b.{0,120}\b(?:united states|usa|other countries|countries outside|third countries|foreign countries)\b/i.test(body) ||
    /\b(?:standard contractual clauses?|sccs?|adequacy decisions?|adequate level of protection|uk idta|international data transfer agreement|data transfer framework|dpf|privacy shield|transfer mechanisms?|legal frameworks relating to the transfer of data)\b/i.test(body);
}

function looksLikeCodeOrConfigText(value: string) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  if (!text) {
    return false;
  }
  const codeSignalCount = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /_\.[A-Za-z_$][\w$]*\s*=/,
    /Object\.definePropert(?:y|ies)/
  ].reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  const sentenceCount = naturalPolicySentenceCount(text);
  const symbolRatio = (text.match(/[{}[\];=<>]/g) ?? []).length / Math.max(text.length, 1);
  const escapedUrlCount = (text.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (text.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? []).length;
  return /\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(text) ||
    (codeSignalCount >= 2 && sentenceCount < 3) ||
    (symbolRatio > 0.12 && sentenceCount < 4) ||
    (escapedUrlCount >= 8 && sentenceCount < 3) ||
    (minifiedTokenCount >= 2 && sentenceCount < 4);
}

function hasMinimumPolicyProseQuality(value: string) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  if (text.length < 500) {
    return true;
  }
  const totalTokens = text.split(/\s+/).filter(Boolean).length;
  const alphabeticWordRatio = (text.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? []).length / Math.max(totalTokens, 1);
  const policyTermCount = new Set((text.toLowerCase().match(/\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\b/g) ?? [])).size;
  return alphabeticWordRatio >= 0.42 && (policyTermCount >= 2 || naturalPolicySentenceCount(text) >= 2);
}

function naturalPolicySentenceCount(value: string) {
  return (value.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePolicyArticle13Signal(signal: Record<string, unknown>) {
  const evidenceText = getString(signal, ["evidenceText", "evidence_text"]);
  if (!evidenceText) {
    return signal;
  }
  return {
    ...signal,
    evidenceText: cleanPolicyDisclosureEvidenceText(evidenceText)
  };
}

function cleanPolicyDisclosureEvidenceText(value: string) {
  return value
    .replace(/\\r|\\n|\\t/g, " ")
    .replace(/\r|\n|\t/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, "\"")
    .replace(/\bBack to Top\b/gi, " ")
    .replace(/\bSkip To Main Content\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function extractSupervisoryAuthoritySupportingContactContext(value: string) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  if (
    !/\b(?:supervisory authority|data protection authorit(?:y|ies)|privacy regulator|regulatory authority|lodge a complaint|right to complain|right to contact)\b/i.test(text) ||
    !/\b(?:further details|more information|help|contact(?:ing)? us|privacy center|contact form|privacy team|data protection officer|dpo)\b/i.test(text)
  ) {
    return null;
  }
  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch?.[0]) {
    return emailMatch[0];
  }
  const contactMatch = text.match(/\b(?:privacy center|privacy team|data protection officer|dpo|contact form|contacting us by email|contact us)\b.{0,180}/i);
  return contactMatch?.[0] ? contactMatch[0].trim() : null;
}

function extractInternationalTransferSupportingSafeguardsContext(value: string) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  const match = text.match(
    /\b(?:agreements?|contracts?|safeguards?|protect(?:ed)?|protection)\b.{0,260}\b(?:personal data|personal information|information|data)\b.{0,260}\b(?:protect|protected|safeguard|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|foreign countr(?:y|ies))\b/i
  ) ?? text.match(
    /\b(?:personal data|personal information|information|data)\b.{0,260}\b(?:agreements?|contracts?|safeguards?|protect(?:ed)?|protection)\b.{0,260}\b(?:outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|foreign countr(?:y|ies))\b/i
  );
  return match?.[0] ? cleanPolicyDisclosureEvidenceText(match[0]).slice(0, 520) : null;
}

function scorePolicyDisclosureEvidenceText(value: string, disclosureType: string | undefined) {
  const text = cleanPolicyDisclosureEvidenceText(value);
  const lower = text.toLowerCase();
  let score = Math.min(text.length, 420) / 100;
  if (/^(united states|u\.s\. department of commerce|cookie policy \||terms & conditions \||accessibility\b)/i.test(text)) {
    score -= 8;
  }
  const boilerplateMatches = lower.match(/\b(?:privacy & terms|overview|technologies|faq|terms of service|privacy policy|introduction)\b/g)?.length ?? 0;
  if (boilerplateMatches >= 4) {
    score -= 6;
  } else if (boilerplateMatches >= 2) {
    score -= 2;
  }
  if (/\b(?:we|you|your|personal data|personal information|retain|transfer|rights|legal basis|controller|data protection|automated)\b/i.test(text)) {
    score += 2;
  }
  if (/\b(?:privacy policy|privacy & terms|overview|faq|terms of service)\b(?:\s+\b(?:privacy policy|privacy & terms|overview|faq|terms of service)\b){2,}/i.test(text)) {
    score -= 8;
  }
  if (/^(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)(?:\s+(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)){2,}/i.test(text)) {
    score -= 8;
  }
  const repeatedMenuLabels = lower.match(/\b(?:privacy|terms|overview|faq|technologies|introduction)\b/g) ?? [];
  if (repeatedMenuLabels.length >= 7 && !/[.!?]\s+[A-Z"']/.test(text)) {
    score -= 6;
  }
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  if (sentenceCount >= 2) {
    score += 2;
  } else if (sentenceCount === 0 && text.length > 140) {
    score -= 3;
  }
  if (/\b(?:retain|delete|export|transfer|process|contact|complain|object|access|correct|review|update|personalize|automated|algorithm|regulator|authority)\b/i.test(text)) {
    score += 2;
  }
  if (/^(?:privacy policy|privacy & terms|overview|technologies|faq|terms of service|introduction)\b/i.test(text) && !/\b(?:we|you|your|our)\b/i.test(text.slice(0, 160))) {
    score -= 5;
  }
  if (/mcdonald.?s restaurants of ireland limited|data protection commissioner|dataprotection\.ie|data protection officer|local data protection offices|article 6|standard contractual clauses|commission implementing decision \(eu\) 2021\/914/i.test(text)) {
    score += 6;
  }
  if (disclosureType === "legal_basis" && LEGAL_BASIS_DISCLOSURE_PATTERN.test(lower)) {
    score += 4;
  }
  if (disclosureType === "recipients_or_vendor_categories" && hasSubstantiveRecipientsVendorCategoriesDisclosure(text)) {
    score += 4;
  }
  if (disclosureType === "controller_contact" && CONTROLLER_CONTACT_DISCLOSURE_PATTERN.test(lower)) {
    score += 4;
  }
  if (disclosureType === "processing_purposes" && PROCESSING_PURPOSES_DISCLOSURE_PATTERN.test(lower)) {
    score += 4;
  }
  if (disclosureType === "data_retention" && /retaining your information|retention|retain|retained|deleted or anonymized|duration|as long as|fraud and abuse prevention|legal purposes|how long|kept for|expires?/i.test(lower)) {
    score += 4;
  }
  if (disclosureType === "data_retention" && RETENTION_STRONG_HEADING_PATTERN.test(lower)) {
    score += 5;
  }
  if (
    disclosureType === "data_retention" &&
    RETENTION_SECURITY_SAFEGUARD_PATTERN.test(lower) &&
    !RETENTION_EXPLICIT_LIFECYCLE_PATTERN.test(lower)
  ) {
    score -= 8;
  }
  if (disclosureType === "data_subject_rights" && DATA_SUBJECT_RIGHTS_DISCLOSURE_PATTERN.test(lower)) {
    score += 4;
  }
  if (disclosureType === "international_transfers" && hasSubstantiveInternationalTransferDisclosure(lower)) {
    score += 4;
  }
  if (disclosureType === "supervisory_authority" && /data protection commissioner|supervisory authority|data protection authorit|regulatory authorit|regulator|complaint/i.test(lower)) {
    score += 4;
  }
  if (disclosureType === "automated_decision_making_or_profiling" && AUTOMATED_DECISION_PROFILING_DISCLOSURE_PATTERN.test(lower)) {
    score += 4;
  }
  if (/<[^>]+>|\\r|\\n|back to top/i.test(value)) {
    score -= 2;
  }
  return score;
}

function policySurfaceIsThinOrErrored(summary: Record<string, unknown> | null | undefined) {
  if (!summary) {
    return false;
  }
  const status = policyTextExtractionStatus(summary);
  if (status) {
    return status !== "ok" || looksLikeCodeOrConfigText(getPolicyDisclosureText(summary));
  }
  const charCount = getNumber(summary, ["privacyPolicyTextCharacterCount", "privacy_policy_text_character_count"]) ?? 0;
  return getBoolean(summary, ["processingErrorObserved", "processing_error_observed"]) === true ||
    looksLikeCodeOrConfigText(getPolicyDisclosureText(summary)) ||
    charCount < MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13;
}

function globalExtractionStatusIsDiagnosticOnly(summary: Record<string, unknown> | null | undefined) {
  const status = policyTextExtractionStatus(summary);
  if (status === "ok") {
    return false;
  }
  const health = getPolicyTextExtractionHealth(summary);
  const policyTextQuality = getObject(health, ["policyTextQuality", "policy_text_quality"]);
  const policySectionCount = getNumber(summary, ["policySectionCount", "policy_section_count"]) ?? 0;
  return (
    status === "errored" &&
    getBoolean(policyTextQuality, ["usable"]) === true &&
    (getNumber(policyTextQuality, ["codeSignalCount", "code_signal_count"]) ?? 0) === 0 &&
    policySectionCount > 0 &&
    getObjectArray(summary, ["retainedPolicySections", "retained_policy_sections"]).length > 0
  );
}

function policySurfaceHasSubstantialRetainedText(summary: Record<string, unknown> | null | undefined) {
  if (!summary || policySurfaceIsThinOrErrored(summary)) {
    return false;
  }
  const charCount = getNumber(summary, ["privacyPolicyTextCharacterCount", "privacy_policy_text_character_count"]) ?? 0;
  return charCount >= MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13;
}

function hasWeakPrivacyNoticeAttribution(summary: Record<string, unknown> | null | undefined) {
  if (!summary) {
    return false;
  }
  if (getBoolean(summary, ["keyPageGuessedOnly", "key_page_guessed_only", "privacyPolicyGuessedOnly", "privacy_policy_guessed_only"]) === true) {
    return true;
  }
  const presentationDecision = getObject(summary, ["presentationDecision", "presentation_decision"]);
  const statusText = [
    getString(summary, ["presentationDecisionStatus", "presentation_decision_status"]),
    getString(presentationDecision, ["status"]),
    getString(summary, ["presentationDecision", "presentation_decision"]),
    getString(summary, ["discoveryMethod", "discovery_method"]),
    getString(summary, ["stopReason", "stop_reason"]),
    getString(summary, ["source", "source_kind"])
  ].join(" ");
  return /guessed_only|common_path_guess|guessed path|fallback guess/i.test(statusText);
}

function policyDisclosureRequiresRowEvidence(rowId: string) {
  return rowId !== "privacy_notice_availability";
}

function hasRetainedControllerOrPrivacyContactDisclosure(
  summary: Record<string, unknown> | null | undefined,
  text: string
) {
  const controllerSignal = getPolicyArticle13DisclosureSignal(summary, "controller_contact");
  const controllerSignalStatus = getString(controllerSignal, ["status"]);
  const controllerSignalEvidenceText = getString(controllerSignal, ["evidenceText", "evidence_text"]) ?? "";
  const controllerSignalMatches =
    controllerSignalStatus === "observed" &&
    Boolean(policyTextMatchEvidence(controllerSignalEvidenceText, CONTROLLER_CONTACT_DISCLOSURE_PATTERN, "controller_contact"));
  return controllerSignalMatches ||
    (
      getBoolean(summary, ["controllerContactDisclosureObserved", "controller_contact_disclosure_observed"]) === true &&
      Boolean(policyTextMatchEvidence(text, CONTROLLER_CONTACT_DISCLOSURE_PATTERN, "controller_contact"))
    ) ||
    Boolean(policyTextMatchEvidence(text, CONTROLLER_CONTACT_DISCLOSURE_PATTERN, "controller_contact"));
}

function derivePolicyDisclosureOutcome(input: GdprEprivacyCoveragePolicyInput, config: PolicyDisclosureRowConfig) {
  const gdprTransparencyConcernOutcome = buildGdprTransparencyArticle13ConcernOutcome(input, config);
  if (gdprTransparencyConcernOutcome) {
    return gdprTransparencyConcernOutcome;
  }

  const summary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const privacyPolicyPresent =
    getBoolean(summary, ["privacyPolicyPresent", "privacy_policy_present"]) === true ||
    getBoolean(input.snapshot, ["privacy_policy_present", "privacyPolicyPresent"]) === true;
  const extractionHealth = getPolicyTextExtractionHealth(summary);
  const extractionOk = policyTextExtractionIsOk(summary);
  const text = getPolicyDisclosureText(summary);
  const directSignal = getBoolean(summary, config.signalKeys);
  const article13Signal = getPolicyArticle13DisclosureSignal(summary, config.disclosureType);
  const rowSpecificSectionEvidence = config.rowId === "automated_decision_making_profiling_disclosure"
    ? null
    : getValidatedRowSpecificPolicyEvidence(summary, config.disclosureType);
  const article13SignalStatus = getString(article13Signal, ["status"]);
  const requiresRowSpecificEvidence = policyDisclosureRequiresRowEvidence(config.rowId);
  const article13SignalEvidenceText = getString(article13Signal, ["evidenceText", "evidence_text"]) ?? "";
  const automatedArticle13SignalEvidenceMatches =
    config.rowId === "automated_decision_making_profiling_disclosure"
      ? Boolean(policyTextMatchEvidence(article13SignalEvidenceText, ARTICLE_22_AUTOMATED_DECISION_DISCLOSURE_PATTERN, config.disclosureType))
      : false;
  const article13SignalEvidenceMatches =
    !requiresRowSpecificEvidence ||
    (
      config.rowId === "automated_decision_making_profiling_disclosure"
        ? automatedArticle13SignalEvidenceMatches
        : Boolean(policyTextMatchEvidence(article13SignalEvidenceText, config.textPattern, config.disclosureType))
    );
  const article13SignalObserved = extractionOk && article13SignalStatus === "observed" && article13SignalEvidenceMatches;
  const article13SignalPartial =
    extractionOk && article13SignalStatus === "partial";
  const article13SignalUnmatched =
    extractionOk && article13SignalStatus === "observed" && !article13SignalEvidenceMatches;
  const topicObserved =
    extractionOk &&
    config.disclosureType !== undefined &&
    getPolicyObservedTopics(summary).includes(config.disclosureType);
  const textMatchEvidence = extractionOk ? policyTextMatchEvidence(text, config.textPattern, config.disclosureType) : null;
  const automatedArticle22TextMatchEvidence =
    config.rowId === "automated_decision_making_profiling_disclosure" && extractionOk
      ? policyTextMatchEvidence(text, ARTICLE_22_AUTOMATED_DECISION_DISCLOSURE_PATTERN, config.disclosureType)
      : null;
  const automatedGeneralTextMatchEvidence =
    config.rowId === "automated_decision_making_profiling_disclosure" && extractionOk
      ? policyTextMatchEvidence(text, GENERAL_AUTOMATED_PROCESSING_DISCLOSURE_PATTERN, config.disclosureType)
      : null;
  const observed =
    config.rowId === "automated_decision_making_profiling_disclosure"
      ? (
          (directSignal === true && (Boolean(automatedArticle22TextMatchEvidence) || article13SignalObserved)) ||
          article13SignalObserved ||
          Boolean(automatedArticle22TextMatchEvidence)
        )
      : (
          (directSignal === true && (!requiresRowSpecificEvidence || Boolean(textMatchEvidence) || article13SignalObserved)) ||
          Boolean(rowSpecificSectionEvidence) ||
          article13SignalObserved ||
          Boolean(textMatchEvidence)
        );

  if (observed || (config.rowId === "privacy_notice_availability" && privacyPolicyPresent)) {
    if (config.rowId === "privacy_notice_availability" && hasWeakPrivacyNoticeAttribution(summary)) {
      return makeOutcome(
        config.rowId,
        "Review signal",
        "A privacy-policy surface was retained, but the retained attribution was weak or guessed. Manual review should confirm this is the site privacy notice.",
        [
          "Evidence: privacy policy surface retained with weak attribution",
          ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
        ],
        {
          retainedEvidence: {
            article13Signal,
            policySurfaceSummary: summary,
            signalObserved: "partial"
          }
        }
      );
    }
    const effectiveTextMatchEvidence = config.rowId === "automated_decision_making_profiling_disclosure"
      ? automatedArticle22TextMatchEvidence
      : rowSpecificSectionEvidence?.evidenceText ?? textMatchEvidence;
    const effectiveArticle13Signal = rowSpecificSectionEvidence?.article13Signal ?? article13Signal ?? (effectiveTextMatchEvidence && config.disclosureType
      ? {
          disclosureType: config.disclosureType,
          evidenceText: effectiveTextMatchEvidence,
          source: "wc01_retained_policy_text_match",
          status: "observed"
        }
      : null);
    const supportingContactContext = config.rowId === "supervisory_authority_complaint_disclosure"
      ? (
          getString(effectiveArticle13Signal, ["supportingContactContext", "supporting_contact_context"]) ??
          extractSupervisoryAuthoritySupportingContactContext(
            [
              getString(effectiveArticle13Signal, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
              effectiveTextMatchEvidence,
              getString(effectiveArticle13Signal, ["evidenceText", "evidence_text"])
            ].filter(Boolean).join(" ")
          )
        )
      : null;
    const supportingTransferSafeguardsContext = config.rowId === "international_transfers_disclosure"
      ? (
          getString(effectiveArticle13Signal, ["supportingTransferSafeguardsContext", "supporting_transfer_safeguards_context"]) ??
          extractInternationalTransferSupportingSafeguardsContext(
            [
              getString(effectiveArticle13Signal, ["selectedPolicySectionExcerpt", "selected_policy_section_excerpt"]),
              effectiveTextMatchEvidence,
              getString(effectiveArticle13Signal, ["evidenceText", "evidence_text"])
            ].filter(Boolean).join(" ")
          )
        )
      : null;
    const retainedArticle13Signal = effectiveArticle13Signal
      ? {
          ...effectiveArticle13Signal,
          ...(supportingContactContext
            ? {
                supportingContactContext,
                supporting_contact_context: supportingContactContext
              }
            : {}),
          ...(supportingTransferSafeguardsContext
            ? {
                supportingTransferSafeguardsContext,
                supporting_transfer_safeguards_context: supportingTransferSafeguardsContext
              }
            : {})
        }
      : effectiveArticle13Signal;
    return makeOutcome(
      config.rowId,
      "Observed",
      config.rowId === "international_transfers_disclosure"
        ? "International transfer disclosure evidence was retained: the excerpt describes cross-border data transfer, storage, processing, access, sharing, or transfer safeguards."
        : config.rowId === "supervisory_authority_complaint_disclosure" && supportingContactContext
          ? "Supervisory authority complaint disclosure evidence was retained: authority/regulator complaint language confirms the row, with nearby privacy contact context retained as supporting context."
        : `${config.label} evidence was retained in public policy-surface evidence.`,
      [
        config.rowId === "privacy_notice_availability"
          ? "Evidence: privacy policy surface retained"
          : config.rowId === "international_transfers_disclosure"
            ? "Evidence: international data movement or transfer safeguard disclosure"
            : config.rowId === "supervisory_authority_complaint_disclosure"
              ? "Evidence: authority/regulator complaint language"
            : `Evidence: ${config.label}`,
        effectiveTextMatchEvidence ? `Excerpt: ${effectiveTextMatchEvidence}` : null,
        supportingContactContext ? `Supporting contact context: ${supportingContactContext}` : null,
        supportingTransferSafeguardsContext ? `Supporting transfer safeguards context: ${supportingTransferSafeguardsContext}` : null,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          article13Signal: retainedArticle13Signal,
          policySurfaceSummary: summary,
          rowSpecificSectionEvidence: rowSpecificSectionEvidence?.sectionEvidence ?? undefined,
          selectedEvidenceStrength: rowSpecificSectionEvidence?.selectedEvidenceStrength ?? undefined,
          selectedPolicySectionHeading: rowSpecificSectionEvidence?.selectedPolicySectionHeading ?? undefined,
          supportSource: rowSpecificSectionEvidence?.evidenceType ?? undefined,
          signalObserved: true
        }
      }
    );
  }

  if (config.rowId === "automated_decision_making_profiling_disclosure" && automatedGeneralTextMatchEvidence) {
    return makeOutcome(
      config.rowId,
      "Review signal",
      "Automated processing or personalization language was observed, but an Article 22-style solely automated decision-making disclosure was not confirmed.",
      [
        "Evidence: automated processing or personalization language",
        `Excerpt: ${automatedGeneralTextMatchEvidence}`,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ],
      {
        retainedEvidence: {
          article13Signal: {
            disclosureType: config.disclosureType,
            evidenceText: automatedGeneralTextMatchEvidence,
            source: "wc01_retained_policy_text_match",
            status: "partial"
          },
          policySurfaceSummary: summary,
          signalObserved: "partial_automated_processing_without_article22_disclosure"
        }
      }
    );
  }

  if (article13SignalPartial) {
    return makeOutcome(
      config.rowId,
      "Review signal",
      `${config.label} was partially observed in retained public policy-surface evidence and needs review.`,
      [
        `Evidence: partial ${config.label}`,
        getString(article13Signal, ["evidenceText", "evidence_text"])
          ? `Excerpt: ${getString(article13Signal, ["evidenceText", "evidence_text"])}`
          : null,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          article13Signal,
          policySurfaceSummary: summary,
          signalObserved: "partial"
        }
      }
    );
  }

  if (
    article13SignalUnmatched ||
    topicObserved ||
    (directSignal === true && requiresRowSpecificEvidence && !textMatchEvidence && !article13SignalObserved)
  ) {
    const missingReason = config.rowId === "retention_disclosure_observed"
      ? "A privacy-policy surface was retained, but retention-period, deletion, anonymization, or data-lifecycle disclosure text was not confidently extracted."
      : config.rowId === "international_transfers_disclosure"
        ? "A privacy-policy surface was retained, but row-specific international-transfer disclosure text was not confidently extracted."
        : config.rowId === "recipients_vendor_categories_disclosure"
          ? "A privacy-policy surface was retained, but row-specific recipient/vendor-category disclosure text was not confidently extracted. Service-provider mentions in collection, cookie, SDK, or session-replay contexts do not confirm this row unless the excerpt clearly describes sharing, disclosure, recipient categories, or providers processing personal information on the company's behalf."
          : "Policy topic signals suggested this area may be covered, but row-specific disclosure text was not retained. Manual review is needed before treating this as observed or as a gap.";
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      missingReason,
      [
        article13SignalUnmatched
          ? `Evidence: extractor signaled ${config.label} without a row-specific excerpt`
          : directSignal === true
            ? `Evidence: extractor signaled ${config.label}`
            : `Evidence: policy topic mentions ${config.disclosureType}`,
        getString(article13Signal, ["evidenceText", "evidence_text"])
          ? `Excerpt: ${getString(article13Signal, ["evidenceText", "evidence_text"])}`
          : null,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.policyDisclosureExtraction.rowSpecificSignal",
            `row-specific ${config.label.toLowerCase()} evidence`,
            "not confidently extracted",
            "Required before treating topic-level policy evidence as observed or as a transparency gap.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed_row_specific_extraction",
          supportSource: article13SignalUnmatched
            ? "article13DisclosureSignals"
            : directSignal === true
              ? "extractorSignal"
              : "observedTopics"
        }
      }
    );
  }

  if (!privacyPolicyPresent) {
    return makeOutcome(
      config.rowId,
      "Not testable",
      `No privacy-policy surface was retained, so ${config.label.toLowerCase()} could not be evaluated.`,
      ["Missing evidence: privacy policy surface"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.policySurfaceObservations.privacy_policy",
            "reachable retained privacy policy surface",
            "missing",
            `Required to evaluate ${config.label.toLowerCase()}.`
          )
        ],
        retainedEvidence: { policySurfaceSummary: summary }
      }
    );
  }

  if (policySurfaceIsThinOrErrored(summary)) {
    const limitation = policyTextExtractionLimitationMessage(summary);
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      limitation,
      ["Evidence: privacy policy surface retained", "Limitation: policy text extraction was not usable for Article 13 disclosure review"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.policySurfaceObservations.privacy_policy.textExcerpt",
            `${MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13}+ usable retained privacy policy text characters for Article 13 disclosure review`,
            text ? `${text.length} characters` : "missing",
            `Required to evaluate ${config.label.toLowerCase()}.`
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          signalObserved: "not_confirmed_extraction_limited"
        }
      }
    );
  }

  if (!extractionOk && config.rowId !== "privacy_notice_availability") {
    const limitation = policyTextExtractionLimitationMessage(summary);
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      limitation,
      ["Evidence: privacy policy surface retained", "Limitation: policy text extraction was not usable for Article 13 disclosure review"],
      {
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          signalObserved: false
        }
      }
    );
  }

  if (config.rowId === "international_transfers_disclosure") {
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      "A privacy-policy surface was retained, but row-specific international-transfer disclosure text was not confidently extracted. Geography, consent-law, child/guardian-consent, jurisdictional-rights, or generic country references do not confirm this row unless they disclose cross-border data movement or transfer safeguards.",
      [
        "Evidence: retained privacy policy text reviewed",
        "Missing evidence: cross-border transfer, storage, processing, access, sharing, or transfer-safeguard disclosure"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.policyDisclosureExtraction.rowSpecificSignal",
            "row-specific international transfer disclosure evidence",
            "not confidently extracted",
            "Required before treating a retained privacy-policy surface as observed or as an international-transfer transparency gap.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      }
    );
  }

  if (config.rowId === "recipients_vendor_categories_disclosure") {
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      "A privacy-policy surface was retained, but row-specific recipient/vendor-category disclosure text was not confidently extracted. Collected-data, usage-data, cookie, SDK, or session-replay descriptions do not confirm this row unless they clearly disclose categories of third parties or recipients that receive, process, access, or handle personal information.",
      [
        "Evidence: retained privacy policy text reviewed",
        "Missing evidence: 3rd party or recipient categories tied to sharing, disclosure, transfer, access, or processing of personal information"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.policyDisclosureExtraction.rowSpecificSignal",
            "row-specific recipient/vendor category disclosure evidence",
            "not confidently extracted",
            "Required before treating a retained privacy-policy surface as observed or as a recipient/vendor-category transparency gap.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      }
    );
  }

  if (config.rowId === "dpo_contact_point_disclosure" && hasRetainedControllerOrPrivacyContactDisclosure(summary, text)) {
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      "A controller/contact surface was retained, but no separate DPO, privacy contact point, or data-protection contact point was confidently extracted from retained privacy-policy evidence. Manual review is needed before treating this as a transparency gap.",
      ["Evidence: controller/contact disclosure retained", "Missing evidence: DPO, privacy contact point, or data-protection contact point"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.policyDisclosureExtraction.rowSpecificSignal",
            "row-specific DPO or privacy contact point evidence",
            "not confidently extracted",
            "Required before treating controller/contact evidence as a DPO/privacy-contact disclosure.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          selectedEvidenceStrength: "limited",
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      }
    );
  }

  if (
    config.rowId !== "privacy_notice_availability" &&
    config.rowId !== "automated_decision_making_profiling_disclosure" &&
    policySurfaceHasSubstantialRetainedText(summary)
  ) {
    return makeOutcome(
      config.rowId,
      "Not confirmed",
      "A privacy-policy surface was retained, but row-specific disclosure was not confidently extracted. Manual review is needed before treating this as a transparency gap.",
      ["Evidence: substantial privacy-policy text retained", `Missing evidence: row-specific ${config.label.toLowerCase()} signal`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.policyDisclosureExtraction.rowSpecificSignal",
            `row-specific ${config.label.toLowerCase()} evidence`,
            "not confidently extracted",
            "Required before treating a mature retained privacy-policy surface as a transparency gap.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          article13Signal,
          policyTextExtractionHealth: extractionHealth,
          policySurfaceSummary: summary,
          signalObserved: "not_confirmed_row_specific_extraction"
        }
      }
    );
  }

  return makeOutcome(
    config.rowId,
    config.rowId === "automated_decision_making_profiling_disclosure" ? "Not observed" : "Gap observed",
    config.rowId === "automated_decision_making_profiling_disclosure"
      ? `${config.label} was not observed in retained privacy-policy evidence.`
      : `${config.label} was expected for Article 13 transparency review but was not observed in retained privacy-policy evidence.`,
    ["Evidence: retained privacy policy text reviewed"],
    {
      retainedEvidence: {
        article13Signal,
        policySurfaceSummary: summary,
        signalObserved: false
      }
    }
  );
}

function derivePolicyDisclosureOutcomes(input: GdprEprivacyCoveragePolicyInput) {
  return [
    ...POLICY_DISCLOSURE_ROWS.map((config) => derivePolicyDisclosureOutcome(input, config)),
    derivePolicyTextExtractionOutcome(input),
  ];
}

function derivePolicyTextExtractionOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const summary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const privacyPolicyPresent =
    getBoolean(summary, ["privacyPolicyPresent", "privacy_policy_present"]) === true ||
    getBoolean(input.snapshot, ["privacy_policy_present", "privacyPolicyPresent"]) === true;
  const health = getPolicyTextExtractionHealth(summary);
  const status = getString(health, ["policyTextExtractionStatus", "policy_text_extraction_status"]);
  if (!privacyPolicyPresent) {
    return makeOutcome(
      "policy_text_extraction",
      "Not testable",
      "No privacy-policy surface was retained, so policy text extraction could not be evaluated.",
      ["Missing evidence: privacy policy surface"],
      { retainedEvidence: { policyTextExtractionHealth: health, policySurfaceSummary: summary } }
    );
  }

  if (status === "ok") {
    return makeOutcome(
      "policy_text_extraction",
      "Observed",
      "Enough usable privacy-policy text was extracted to evaluate individual GDPR Transparency disclosures.",
      [
        `Evidence: ${getNumber(health, ["extractedTextLength", "extracted_text_length"]) ?? "usable"} policy-text characters retained`,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ],
      { retainedEvidence: { policyTextExtractionHealth: health, policySurfaceSummary: summary, signalObserved: true } }
    );
  }

  if (globalExtractionStatusIsDiagnosticOnly(summary)) {
    return makeOutcome(
      "policy_text_extraction",
      "Review signal",
      "Policy text extraction reported a global processing error, but usable section-targeted policy evidence was retained for row-level review.",
      [
        `Diagnostic: policy text extraction ${status ?? "not usable"}`,
        `Retained sections: ${getNumber(summary, ["policySectionCount", "policy_section_count"]) ?? getObjectArray(summary, ["retainedPolicySections", "retained_policy_sections"]).length}`,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ],
      {
        retainedEvidence: {
          policyTextExtractionHealth: health,
          policySurfaceSummary: summary,
          signalObserved: "diagnostic_warning_section_evidence_retained"
        }
      }
    );
  }

  return makeOutcome(
    "policy_text_extraction",
    "Not testable",
    policyTextExtractionLimitationMessage(summary),
    [
      `Limitation: policy text extraction ${status ?? "not usable"}`,
      `Extracted text: ${getNumber(health, ["extractedTextLength", "extracted_text_length"]) ?? 0} characters`,
      `Required text: ${getNumber(health, ["minimumTextLengthRequired", "minimum_text_length_required"]) ?? MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13} characters`,
      ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
    ],
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scanner.policySurfaceObservations.privacy_policy.textExcerpt",
          `${MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13}+ usable retained privacy policy text characters`,
          `${getNumber(health, ["extractedTextLength", "extracted_text_length"]) ?? 0} characters`,
          "Required to evaluate individual Article 13 transparency disclosures."
        )
      ],
      retainedEvidence: {
        policyTextExtractionHealth: health,
        policySurfaceSummary: summary,
        signalObserved: "technical_limit"
      }
    }
  );
}

function policyTextExtractionLimitationMessage(summary: Record<string, unknown> | null | undefined) {
  const status = policyTextExtractionStatus(summary);
  if (status === "low_quality_extracted_code_or_config" || looksLikeCodeOrConfigText(getPolicyDisclosureText(summary))) {
    return "A privacy-policy surface was found, but the retained text was low-quality or non-policy content, so row-specific disclosure extraction could not be completed.";
  }
  return "A privacy-policy surface was found, but CertScore did not extract enough usable policy text to confirm this disclosure from retained evidence.";
}

function deriveSensitiveSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const correlation = getEventMetadata(input.events, "sensitive_third_party_tracking_correlation");
  const status = getString(correlation, ["status"]);
  const eligibleSensitiveFieldCount = getNumber(correlation, ["eligibleSensitiveFieldCount"]);
  const rawSensitiveFieldCount = getNumber(correlation, ["rawSensitiveFieldCount"]);
  const evaluation = evaluateSensitiveFormsWithThirdPartyTracking(correlation, input.runtimeArtifacts);

  if (evaluation.status === "Not testable") {
    return makeOutcome(
      "sensitive_surfaces_third_party_tracking",
      "Not testable",
      evaluation.reason,
      evaluation.evidenceRefs,
      {
        missingOrIncompleteSourceSignals: evaluation.missingOrIncompleteSourceSignals,
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (status === "ok" || evaluation.coverageUsable) {
    if (evaluation.status === "Gap observed" || evaluation.status === "Review signal") {
      return makeOutcome(
        "sensitive_surfaces_third_party_tracking",
        evaluation.status,
        evaluation.reason,
        evaluation.evidenceRefs,
        {
          retainedEvidence: evaluation.retainedEvidence
        }
      );
    }

    const count = eligibleSensitiveFieldCount ?? rawSensitiveFieldCount ?? 0;
      if (count <= 0) {
        return makeOutcome(
          "sensitive_surfaces_third_party_tracking",
          "Not observed",
          "Sensitive-field correlation completed for the tested context and did not retain eligible sensitive fields alongside 3rd party tracking.",
          ["Evidence: sensitive 3rd party tracking correlation completed"],
        {
          retainedEvidence: {
            eligibleSensitiveFieldCount: count,
            rawSensitiveFieldCount,
            sensitiveThirdPartyTrackingCorrelationStatus: status
          }
        }
        );
      }
  
      return makeOutcome(
        "sensitive_surfaces_third_party_tracking",
        "Insufficient evidence",
        "Sensitive-field correlation retained candidate fields, but no eligible sensitive-surface tracking unified finding was projected.",
        [`Eligible sensitive fields: ${count}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.sensitiveThirdPartyTrackingFinding",
            "eligible projected unified finding when sensitive-field correlation satisfies policy gates",
            "missing",
            "Required to classify retained sensitive-field tracking correlation as a canonical review signal.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          eligibleSensitiveFieldCount: count,
          rawSensitiveFieldCount,
          sensitiveThirdPartyTrackingCorrelationStatus: status
        }
      }
      );
    }

  return null;
}

function evaluateSensitiveFormsWithThirdPartyTracking(
  correlation: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null | undefined
) {
  const sensitiveFieldSelectors = getStringArray(correlation, ["sensitiveFieldSelectors", "sensitive_field_selectors"]);
  const sensitiveFieldLabels = getStringArray(correlation, ["sensitiveFieldLabels", "sensitive_field_labels"]);
  const sensitiveFieldTypes = getStringArray(correlation, ["sensitiveFieldTypes", "sensitive_field_types"]);
  const sensitiveFormUrls = getStringArray(correlation, ["sensitiveFormUrls", "sensitive_form_urls", "sensitiveFormPageUrls", "sensitive_form_page_urls"]);
  const sensitivePayloadRows = uniqueSensitivePayloadRows([
    ...getObjectArray(correlation, ["sensitivePayloadViolations", "sensitive_payload_violations"]),
    ...getObjectArray(runtimeArtifacts, ["sensitivePayloadViolations", "sensitive_payload_violations"])
  ]);
  const thirdPartyTrackingVendors = getStringArray(correlation, ["thirdPartyTrackingVendors", "third_party_tracking_vendors"]);
  const thirdPartyTrackingDomains = getStringArray(correlation, ["thirdPartyTrackingDomains", "third_party_tracking_domains"]);
  const thirdPartyTrackingCategories = getStringArray(correlation, ["thirdPartyTrackingCategories", "third_party_tracking_categories"]);
  const infrastructureOnlyVendors = getStringArray(correlation, ["infrastructureOnlyVendors", "infrastructure_only_vendors"]);
  const thirdPartyTrackingRequestCount = getNumber(correlation, ["thirdPartyTrackingRequestCount", "third_party_tracking_request_count"]);
  const requestTimingRelativeToForm = getString(correlation, ["requestTimingRelativeToForm", "request_timing_relative_to_form"]);
  const coverageStatus = getString(correlation, ["coverageStatus", "coverage_status"]);
    const evidenceConfidence = getString(correlation, ["evidenceConfidence", "evidence_confidence"]);
    const directVsInferred = getString(correlation, ["directVsInferred", "direct_vs_inferred"]);
    const evidenceStrengthFlags = getStringArray(correlation, ["evidenceStrengthFlags", "evidence_strength_flags"]);
  const sensitiveDirect =
    getBoolean(correlation, ["sensitiveCollectionSurfaceObserved", "sensitive_collection_surface_observed"]) === true ||
    getBoolean(correlation, ["highSensitivityDataCollectionDetected", "high_sensitivity_data_collection_detected"]) === true ||
    sensitiveFieldSelectors.length > 0 ||
    sensitiveFieldLabels.length > 0 ||
    sensitiveFieldTypes.length > 0 ||
    sensitiveFormUrls.length > 0;
  const trackingObserved =
    getBoolean(correlation, ["samePageTrackingObserved", "same_page_tracking_observed"]) === true ||
    getBoolean(correlation, ["sameFlowTrackingObserved", "same_flow_tracking_observed"]) === true ||
    getBoolean(correlation, ["behavioralAnalyticsObserved", "behavioral_analytics_observed"]) === true ||
    getBoolean(correlation, ["sessionReplayObserved", "session_replay_observed"]) === true ||
    getBoolean(correlation, ["advertisingPixelObserved", "advertising_pixel_observed"]) === true ||
    getBoolean(correlation, ["analyticsObserved", "analytics_observed"]) === true ||
    getBoolean(correlation, ["tagManagerObserved", "tag_manager_observed"]) === true ||
    thirdPartyTrackingVendors.length > 0 ||
    thirdPartyTrackingDomains.length > 0 ||
    (thirdPartyTrackingRequestCount ?? 0) > 0 ||
    thirdPartyTrackingCategories.some((category) => /advertising|analytics|behavioral|measurement|replay|tag[_ -]?manager|tracking/i.test(category));
  const sameContext =
    getBoolean(correlation, ["samePageTrackingObserved", "same_page_tracking_observed"]) === true ||
    getBoolean(correlation, ["sameFlowTrackingObserved", "same_flow_tracking_observed"]) === true ||
    getBoolean(correlation, ["samePageOrFlow", "same_page_or_flow"]) === true ||
    getBoolean(correlation, [
      "thirdPartyTrackingActiveInSameContext",
      "third_party_tracking_active_in_same_context"
    ]) === true ||
    requestTimingRelativeToForm === "before_form" ||
    requestTimingRelativeToForm === "during_form" ||
    requestTimingRelativeToForm === "after_form";
  const infrastructureOnly =
    thirdPartyTrackingVendors.length > 0 &&
    thirdPartyTrackingVendors.every((vendor) =>
      infrastructureOnlyVendors.some((infraVendor) => infraVendor.toLowerCase() === vendor.toLowerCase())
    );
    const payloadEvidenceRows = sensitivePayloadRows.filter(hasThirdPartyRequestOrVendorRetained);
    const payloadExposureObserved = payloadEvidenceRows.some(payloadExposureObservedInRow);
    const sensitiveValueInThirdPartyRequest = payloadEvidenceRows.some(hasRetainedSensitiveOrPersonalValueInThirdPartyRequest);
    const payloadGapObserved = payloadExposureObserved || sensitiveValueInThirdPartyRequest;
    const fallbackOrPolicyOnly =
      (
        evidenceStrengthFlags.some((flag) => flag === "fallback_only" || flag === "policy_text") ||
        sensitivePayloadRows.some((row) => {
          const strength = getPayloadRowString(row, ["evidenceStrength", "evidence_strength"]);
          const source = getPayloadRowString(row, ["evidenceSource", "evidence_source"]);
          return /fallback|policy/i.test(`${strength} ${source}`);
        })
      ) &&
      !evidenceStrengthFlags.some((flag) => flag === "direct_runtime" || flag === "concrete_payload") &&
      !payloadEvidenceRows.some((row) => {
        const strength = getPayloadRowString(row, ["evidenceStrength", "evidence_strength"]);
          return /concrete|confirmed|direct/i.test(strength ?? "");
      });
  const coverageUsable =
    coverageStatus === "usable" ||
    evidenceConfidence === "high" ||
    evidenceConfidence === "moderate" ||
    getString(correlation, ["status"]) === "ok";
  const retainedEvidence = {
    collectionContextConfidence: getString(correlation, ["collectionContextConfidence", "collection_context_confidence"]),
    collectionContextType: getString(correlation, ["collectionContextType", "collection_context_type"]),
    consentStateAtTime: getString(correlation, ["consentStateAtTime", "consent_state_at_time"]),
    coverageStatus,
    directVsInferred,
    evidenceConfidence,
      evidenceStrengthFlags,
      fallbackOrPolicyOnly,
    correlationMethod: getString(correlation, ["correlationMethod", "correlation_method"]),
    eligibleSensitiveFieldObserved:
      getBoolean(correlation, ["eligibleSensitiveFieldObserved", "eligible_sensitive_field_observed"]) ??
      (sensitiveDirect ? true : null),
    eligibleSensitiveFieldCount: getNumber(correlation, ["eligibleSensitiveFieldCount", "eligible_sensitive_field_count"]),
    fieldLevelPayloadEvidenceObserved: getBoolean(correlation, ["fieldLevelPayloadEvidenceObserved", "field_level_payload_evidence_observed"]),
    infrastructureOnlyVendors,
    payloadEvidenceRows: payloadEvidenceRows.slice(0, 5),
    payloadExposureObserved,
    payloadPersonalDataObserved: getBoolean(correlation, ["payloadPersonalDataObserved", "payload_personal_data_observed"]),
    requestTimingRelativeToForm,
    retainedDomEvidenceRef: getString(correlation, ["retainedDomEvidenceRef", "retained_dom_evidence_ref"]),
    retainedScreenshotRef: getString(correlation, ["retainedScreenshotRef", "retained_screenshot_ref"]),
    sameContext,
    samePageOrFlow: sameContext,
    sensitiveDirect,
    sensitiveFieldLabels: sensitiveFieldLabels.slice(0, 5),
    sensitiveFieldSelectors: sensitiveFieldSelectors.slice(0, 5),
    sensitiveFieldTypes: sensitiveFieldTypes.slice(0, 5),
    sensitiveFormUrls: sensitiveFormUrls.slice(0, 5),
    sensitivePayloadViolationRows: sensitivePayloadRows.slice(0, 5),
    sensitiveValueInThirdPartyRequest,
    thirdPartyTrackingCategories: thirdPartyTrackingCategories.slice(0, 5),
    thirdPartyTrackingDomains: thirdPartyTrackingDomains.slice(0, 5),
    thirdPartyTrackingRequestCount,
    thirdPartyTrackingActiveInSameContext: sameContext && trackingObserved,
    thirdPartyTrackingVendors: thirdPartyTrackingVendors.slice(0, 5),
    trackingObserved
  };
  const evidenceRefs = [
    sensitiveDirect ? "Sensitive collection surface observed" : null,
    payloadGapObserved ? "Sensitive collection with 3rd party payload evidence observed" : null,
    sameContext ? "Same-page or same-flow tracking correlation retained" : null,
    ...thirdPartyTrackingVendors.slice(0, 3).map((vendor) => `Runtime vendor: ${vendor}`),
    ...thirdPartyTrackingDomains.slice(0, 3).map((domain) => `Runtime domain: ${domain}`),
    ...sensitiveFormUrls.slice(0, 2).map((url) => `Sensitive form URL: ${url}`)
  ].filter((value): value is string => Boolean(value));

    if (!coverageUsable) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "sensitiveThirdPartyTrackingCorrelation.coverageStatus",
          "usable retained form and runtime tracking evidence",
          coverageStatus ?? "missing",
          "Required to evaluate sensitive-form tracking correlation from retained evidence."
        )
      ],
      reason: "The retained scan context did not include usable form and runtime tracking evidence.",
      retainedEvidence,
      status: "Not testable" as const
    };
    }
  
    if (fallbackOrPolicyOnly && sensitiveDirect && trackingObserved) {
      return {
        coverageUsable,
        evidenceRefs,
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "sensitiveThirdPartyTrackingCorrelation.directSameContextRuntimeCorrelation",
            "direct or moderate same-context runtime correlation",
            "fallback_only_or_policy_text",
            "Required before CertScore can project sensitive-surface tracking as a GDPR/ePrivacy gap."
          )
        ],
        reason:
          "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and 3rd party tracking, but does not conclusively establish same-context sensitive payload exposure.",
        retainedEvidence,
        status: "Review signal" as const
      };
    }
  
    if (payloadGapObserved) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "CertScore retained evidence of a sensitive or personal-data value associated with a 3rd party request in the tested context. Review whether this data flow is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  const correlationMethod = getString(correlation, ["correlationMethod", "correlation_method"]);
  const directOrModerateCorrelation =
    directVsInferred !== "inferred" &&
    (
      correlationMethod === "direct" ||
      correlationMethod === "moderate" ||
      evidenceConfidence === "high" ||
      evidenceConfidence === "moderate"
    );

  if (sensitiveDirect && trackingObserved && sameContext && !infrastructureOnly && directOrModerateCorrelation) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "CertScore observed a sensitive or high-risk collection surface in the same tested page or flow as 3rd party tracking or measurement scripts. Review whether the tracking is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  if (sensitiveDirect && trackingObserved) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and 3rd party tracking, but does not conclusively establish same-context sensitive payload exposure.",
      retainedEvidence,
      status: "Review signal" as const
    };
  }

  return {
    coverageUsable,
    evidenceRefs,
    missingOrIncompleteSourceSignals: [],
    reason: "",
    retainedEvidence,
    status: "Not observed" as const
  };
}

function uniqueSensitivePayloadRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPayloadRowString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getPayloadRowObject(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getSensitivePayloadRequestUrl(row: Record<string, unknown>) {
  return getPayloadRowString(row, ["requestUrl", "request_url", "url"]);
}

function getSensitivePayloadVendorHost(row: Record<string, unknown>) {
  const explicitHost = getPayloadRowString(row, [
    "vendorHost",
    "vendor_host",
    "thirdPartyHost",
    "third_party_host",
    "requestHost",
    "request_host",
    "hostname"
  ]);
  if (explicitHost) {
    return explicitHost.toLowerCase();
  }

  return hostFromUrl(getSensitivePayloadRequestUrl(row));
}

function hasThirdPartyRequestOrVendorRetained(row: Record<string, unknown>) {
  const requestUrl = getSensitivePayloadRequestUrl(row);
  const vendorHost = getSensitivePayloadVendorHost(row);
  const thirdParty =
    row.thirdParty === true ||
    row.third_party === true ||
    row.isThirdParty === true ||
    row.is_third_party === true ||
    Boolean(vendorHost && vendorHost.includes("."));

  return thirdParty && (Boolean(vendorHost) || /^https?:\/\//i.test(requestUrl ?? ""));
}

function payloadExposureObservedInRow(row: Record<string, unknown>) {
  const sameFlowLinkage = getPayloadRowObject(row, ["sameFlowLinkage", "same_flow_linkage"]);
  return (
    row.payloadExposureObserved === true ||
    row.payload_exposure_observed === true ||
    row.userValueObserved === true ||
    row.user_value_observed === true ||
    sameFlowLinkage?.userValueObserved === true ||
    sameFlowLinkage?.user_value_observed === true
  );
}

function hasRetainedSensitiveOrPersonalValueInThirdPartyRequest(row: Record<string, unknown>) {
  const detectedType = getPayloadRowString(row, ["detectedType", "detected_type", "valueType", "value_type"]);
  const sourceField = getPayloadRowString(row, ["sourceField", "source_field", "fieldName", "field_name"]);
  const retainedValue = getPayloadRowString(row, [
    "payloadValue",
    "payload_value",
    "observedValue",
    "observed_value",
    "matchedValue",
    "matched_value",
    "userValue",
    "user_value",
    "sensitiveValue",
    "sensitive_value",
    "personalDataValue",
    "personal_data_value",
    "matchSnippet",
    "match_snippet"
  ]);
  const haystack = [detectedType, sourceField, retainedValue].filter(Boolean).join(" ");

  return (
    payloadExposureObservedInRow(row) ||
    /email|e-mail|user[_ -]?value|sensitive[_ -]?value|personal[_ -]?data|personal[_ -]?info|phone|address|ssn|passport|government[_ -]?id|health|medical|financial|payment/i.test(
      haystack
    ) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(retainedValue ?? "")
  );
}

const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|hotjar\.com|hotjar\.io|fullstory\.com|logrocket\.com|mouseflow\.com|contentsquare\.(?:com|net)|smartlook\.com|inspectlet\.com|luckyorange\.com|quantummetric\.com|sessioncam\.com/i;
const SESSION_REPLAY_VENDOR_PATTERN =
  /microsoft clarity|clarity|hotjar|fullstory|logrocket|mouseflow|contentsquare|smartlook|inspectlet|lucky orange|quantum metric|sessioncam/i;
const NON_REPLAY_ANALYTICS_VENDOR_PATTERN =
  /google analytics|google tag manager|\bgtm\b|googletagmanager|google-analytics|analytics\.google/i;

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isCollectionEndpointUrl(value: string) {
  return /(?:^|[./-])(?:collect|collection|record|recorder|session|events?|track|ingest|c\.gif|data)(?:[./?_-]|$)/i.test(value) ||
    /(?:^|\.)c\.clarity\.ms$/i.test(hostFromUrl(value) ?? "");
}

function isSessionReplayEvidenceRow(row: Record<string, unknown>) {
  const category = getString(row, ["category", "vendorCategory", "vendor_category", "purpose"]);
  const vendor = getString(row, ["vendor", "vendorName", "vendor_name"]);
  const requestUrl = getString(row, ["requestUrl", "request_url", "url"]);
  const vendorAndUrl = `${vendor ?? ""} ${requestUrl ?? ""}`;

  if (NON_REPLAY_ANALYTICS_VENDOR_PATTERN.test(vendorAndUrl)) {
    return false;
  }

  return (
    /session_replay|session replay|behavioral|recording/i.test(category ?? "") ||
    SESSION_REPLAY_VENDOR_PATTERN.test(vendor ?? "") ||
    SESSION_REPLAY_URL_PATTERN.test(requestUrl ?? "")
  );
}

function getSessionReplayTiming(row: Record<string, unknown>) {
  return (
    getRuntimeElapsedMs(row, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms", "tsMs", "ts_ms"]) ??
    getRuntimeElapsedMs(row, ["timestampMs", "timestamp_ms"]) ??
    null
  );
}

function buildSessionReplayRuntimeEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const summary =
    getObject(hybrid, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"]) ??
    getObject(input.runtimeArtifacts, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"]);
  const classificationRows = [
    ...getObjectArray(input.runtimeArtifacts, [
      "requestPurposeClassificationConfidence",
      "request_purpose_classification_confidence"
    ]),
    ...getObjectArray(hybrid, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"])
  ].filter(isSessionReplayEvidenceRow);
  const postAcceptEvidenceUrls = getStringArray(input.runtimeArtifacts, [
    "consentPostAcceptTrackerEvidenceUrls",
    "consent_post_accept_tracker_evidence_urls"
  ]).filter((url) => SESSION_REPLAY_URL_PATTERN.test(url));
  const postAcceptVendors = getStringArray(input.runtimeArtifacts, [
    "consentAcceptNewTrackerVendorNames",
    "consent_accept_new_tracker_vendor_names",
    "consentPostAcceptTrackerVendorNames",
    "consent_post_accept_tracker_vendor_names"
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const requestUrls = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["requestUrl", "request_url", "url"])),
    ...getStringArray(summary, ["requestUrls", "request_urls"]),
    ...postAcceptEvidenceUrls
  ]);
  const vendors = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["vendor", "vendorName", "vendor_name"])),
    ...postAcceptVendors,
    ...getStringArray(summary, ["vendors"]),
    ...getStringArray(input.snapshot, ["session_replay_vendor_names", "sessionReplayVendorNames"]),
    ...getStringArray(input.snapshot, ["session_replay_runtime_vendors", "sessionReplayRuntimeVendors"])
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const snapshotRuntimeArtifacts = getStringArray(input.snapshot, [
    "session_replay_runtime_artifacts",
    "sessionReplayRuntimeArtifacts"
  ]);
  const summaryFirstSeenMs = getRuntimeElapsedMs(summary, ["firstSeenMs", "first_seen_ms"]);
  const firstSeenMsValues = [
    ...classificationRows.map(getSessionReplayTiming),
    summaryFirstSeenMs
  ]
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const consentStates = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["runtimePhase", "runtime_phase", "timingStatus", "timing_status"])),
    ...getStringArray(summary, ["consentStates", "consent_states"]),
    getBoolean(summary, ["preConsentObserved", "pre_consent_observed"]) === true ? "pre_consent" : null,
    postAcceptEvidenceUrls.length > 0 || postAcceptVendors.length > 0 ? "post_accept" : null
  ]);
  const disclosureRows = getRuntimeVendorDisclosureEvidence(input.runtimeArtifacts).filter((row) =>
    [...row.observedRuntimeVendors, ...row.unmatchedRuntimeVendors].some((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor)) ||
    [...row.observedRuntimeDomains, ...row.unmatchedRuntimeDomains].some((domain) => SESSION_REPLAY_URL_PATTERN.test(domain))
  );
  const policySurfacesSearched = uniqueStrings(disclosureRows.flatMap((row) =>
    row.policySurfacesSearched.map((surface) => surface.url ?? null)
  ));
  const matchedDisclosureCount = disclosureRows.reduce((sum, row) => sum + row.matchedVendorDisclosureCount, 0);
  const unmatchedDisclosureCount = disclosureRows.reduce((sum, row) => sum + row.unmatchedVendorDisclosureCount, 0);
  const postChoiceControls = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const artifactCount = getNumber(summary, ["artifactCount", "artifact_count"]);

  if (
    vendors.length === 0 &&
    requestUrls.length === 0 &&
    snapshotRuntimeArtifacts.length === 0 &&
    (artifactCount ?? 0) === 0
  ) {
    return null;
  }

  return compactRecord({
    acceptInteractionConfirmed: getBoolean(input.runtimeArtifacts, [
      "consentAcceptInteractionSucceeded",
      "consent_accept_interaction_succeeded"
    ]),
    collectionEndpointObserved:
      getBoolean(summary, ["collectionEndpointObserved", "collection_endpoint_observed"]) === true ||
      requestUrls.some(isCollectionEndpointUrl),
    consentStates,
    firstSeenMs: firstSeenMsValues[0] ?? null,
    libraryLoadObserved:
      getBoolean(summary, ["libraryOnly", "library_only"]) === true ||
      requestUrls.some((url) => /(?:script|tag|recorder|clarity\.ms\/tag|hotjar|fullstory|logrocket)/i.test(url)),
    maskingOrExclusionObserved: getBoolean(summary, [
      "maskingOrExclusionObserved",
      "masking_or_exclusion_observed"
    ]),
    postAcceptObserved: consentStates.some((state) => /post.?accept|post.?consent/i.test(state)),
    postChoiceConsentControlsObserved:
      getBoolean(postChoiceControls, [
        "preferenceCenterReachableAfterInitialLayer",
        "preference_center_reachable_after_initial_layer",
        "cmpReopenControlObserved",
        "cmp_reopen_control_observed",
        "withdrawalTextObserved",
        "withdrawal_text_observed"
      ]) === true,
    preConsentObserved:
      getBoolean(summary, ["preConsentObserved", "pre_consent_observed"]) === true ||
      consentStates.some((state) => /pre.?consent/i.test(state)),
    requestUrls: compactArray(requestUrls, 5),
    runtimeArtifacts: compactArray(snapshotRuntimeArtifacts, 5),
    sensitiveSurfaceOverlap: getBoolean(summary, ["sensitiveSurfaceOverlap", "sensitive_surface_overlap"]),
    vendorDisclosed: matchedDisclosureCount > 0 && unmatchedDisclosureCount === 0,
    vendorDisclosureComparisonObserved: disclosureRows.length > 0,
    vendorDisclosureGap: unmatchedDisclosureCount > 0,
    vendorDisclosureMatchedCount: matchedDisclosureCount,
    vendorDisclosureUnmatchedCount: unmatchedDisclosureCount,
    policySurfacesSearched: compactArray(policySurfacesSearched, 5),
    vendors: compactArray(vendors, 5)
  });
}

function sessionReplayObservedFromEvidence(sessionReplayEvidence: Record<string, unknown> | null) {
  return (
    getStringArray(sessionReplayEvidence, ["vendors"]).length > 0 ||
    getStringArray(sessionReplayEvidence, ["requestUrls", "request_urls"]).length > 0 ||
    getStringArray(sessionReplayEvidence, ["runtimeArtifacts", "runtime_artifacts"]).length > 0 ||
    getBoolean(sessionReplayEvidence, ["collectionEndpointObserved", "collection_endpoint_observed"]) === true ||
    getBoolean(sessionReplayEvidence, ["libraryLoadObserved", "library_load_observed"]) === true
  );
}

function sessionReplayEvidenceRefs(sessionReplayEvidence: Record<string, unknown> | null, lead: string) {
  const firstSeenMs = getNumber(sessionReplayEvidence, ["firstSeenMs", "first_seen_ms"]);
  return [
    lead,
    typeof firstSeenMs === "number" ? `First session replay signal: ${formatElapsedSeconds(firstSeenMs)} after scan start` : null,
    ...getStringArray(sessionReplayEvidence, ["vendors"]).map((vendor) => `Runtime vendor: ${vendor}`),
    ...getStringArray(sessionReplayEvidence, ["requestUrls", "request_urls"]).slice(0, 2).map((url) => `Runtime endpoint: ${url}`),
    ...getStringArray(sessionReplayEvidence, ["consentStates", "consent_states"]).map((state) => `Consent state: ${state}`)
  ].filter((value): value is string => Boolean(value));
}

function sessionReplayMissingEvidence(field: string, whyNeeded: string, actual: unknown = "missing") {
  return sourceGap(field, true, actual, whyNeeded);
}

function getPostRejectSessionReplayEvidence(input: GdprEprivacyCoveragePolicyInput, sessionReplayEvidence: Record<string, unknown> | null) {
  const reductionEvidence = getPostRejectTrackingReductionEvidence(input.runtimeArtifacts);
  const consentOutcomeSummary = getHybridConsentOutcomeSummary(input.runtimeArtifacts);
  const rejectInteractionConfirmed =
    getBoolean(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consent_reject_interaction_succeeded"]) === true ||
    getBoolean(consentOutcomeSummary, ["rejectInteractionSucceeded", "reject_interaction_succeeded"]) === true;
  const postRejectWindowAvailable = getBoolean(reductionEvidence, ["postRejectWindowAvailable", "post_reject_window_available"]);
  const reductionStatus = getString(reductionEvidence, ["reductionEvaluationStatus", "reduction_evaluation_status"]);
  const rows = getPostRejectNonEssentialRows(reductionEvidence).filter((row) => {
    if (isSessionReplayEvidenceRow(row)) {
      return true;
    }
    const vendor = getString(row, ["vendor", "vendorName", "vendor_name", "postRejectVendor", "post_reject_vendor"]);
    const url = getString(row, ["url", "requestUrl", "request_url", "responseUrl", "response_url", "domain", "host", "hostname"]);
    return SESSION_REPLAY_VENDOR_PATTERN.test(vendor ?? "") || SESSION_REPLAY_URL_PATTERN.test(url ?? "");
  });
  const sessionReplayVendors = uniqueStrings([
    ...rows.map((row) => getString(row, ["vendor", "vendorName", "vendor_name", "postRejectVendor", "post_reject_vendor"])),
    ...getStringArray(reductionEvidence, ["persistedVendors", "persisted_vendors", "postRejectVendors", "post_reject_vendors"])
      .filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor)),
    ...getStringArray(sessionReplayEvidence, ["vendors"]).filter((vendor) =>
      rows.length > 0 || reductionStatus === "not_reduced"
        ? SESSION_REPLAY_VENDOR_PATTERN.test(vendor)
        : false
    )
  ]);
  const sessionReplayRequestUrls = uniqueStrings([
    ...rows.map((row) => getString(row, ["url", "requestUrl", "request_url", "responseUrl", "response_url"])),
  ]).filter((url) => SESSION_REPLAY_URL_PATTERN.test(url) || isCollectionEndpointUrl(url));
  const postRejectObserved = rows.length > 0 || sessionReplayVendors.length > 0 || sessionReplayRequestUrls.length > 0;

  return compactRecord({
    postRejectObserved,
    postRejectRequestCount: rows.length,
    postRejectRequestUrls: compactArray(sessionReplayRequestUrls, 5),
    postRejectSessionReplayRows: compactArray(rows, 5),
    postRejectWindowAvailable,
    reductionEvaluationStatus: reductionStatus,
    rejectInteractionConfirmed,
    vendors: compactArray(sessionReplayVendors, 5)
  });
}

function buildBrowserDeviceEntropyReviewEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const rows = [
    ...getObjectArray(hybrid, ["fingerprintingRuntimeEvidence", "fingerprinting_runtime_evidence"]),
    ...getObjectArray(input.runtimeArtifacts, ["fingerprintingRuntimeEvidence", "fingerprinting_runtime_evidence"])
  ];
  const summary =
    getObject(hybrid, ["fingerprintingEvidenceSummary", "fingerprinting_evidence_summary"]) ??
    getObject(input.runtimeArtifacts, ["fingerprintingEvidenceSummary", "fingerprinting_evidence_summary"]);
  const entropyTransmissionObserved =
    getBoolean(summary, ["entropyTransmissionObserved", "entropy_transmission_observed"]) ??
    rows.map((row) => getBoolean(row, ["entropyTransmissionObserved", "entropy_transmission_observed"]))
      .find((value): value is boolean => typeof value === "boolean");
  const entropyLinkedToIdentifier =
    getBoolean(summary, ["entropyLinkedToIdentifier", "entropy_linked_to_identifier"]) ??
    rows.map((row) => getBoolean(row, ["entropyLinkedToIdentifier", "entropy_linked_to_identifier"]))
      .find((value): value is boolean => typeof value === "boolean");
  const knownFingerprintLibraryMatch =
    getString(summary, ["knownFingerprintLibraryMatch", "known_fingerprint_library_match"]) ??
    rows.map((row) => getString(row, ["knownFingerprintLibraryMatch", "known_fingerprint_library_match"]))
      .find((value): value is string => Boolean(value)) ??
    null;
  const deviceDataLikeRequestCount =
    getNumber(summary, ["deviceDataLikeRequestCount", "device_data_like_request_count"]) ??
    rows.map((row) => getNumber(row, ["deviceDataLikeRequestCount", "device_data_like_request_count"]))
      .find((value): value is number => typeof value === "number") ??
    null;
  const hosts = uniqueStrings([
    ...rows.map((row) => getString(row, ["host", "hostname", "scriptHost", "script_host", "domain"])),
    ...getStringArray(summary, ["hosts", "hostnames", "scriptHosts", "script_hosts"])
  ]);
  const observedMs = uniqueNumbers([
    ...rows.map((row) => getNumber(row, ["timestampMs", "timestamp_ms", "firstSeenMs", "first_seen_ms", "observedMs", "observed_ms"])),
    getNumber(summary, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms"])
  ]).sort((left, right) => left - right);
  const browserApiSignals = uniqueStrings([
    ...rows.flatMap((row) => getStringArray(row, [
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ])),
    ...getStringArray(summary, [
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ])
  ]);
  const entropyCategories = uniqueStrings([
    ...rows.flatMap((row) => getStringArray(row, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories"
    ])),
    ...getStringArray(summary, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories"
    ])
  ]);
  const signals = uniqueStrings([...browserApiSignals, ...entropyCategories]);
  const strongCorroboratorObserved =
    Boolean(knownFingerprintLibraryMatch) ||
    entropyTransmissionObserved === true ||
    entropyLinkedToIdentifier === true ||
    (deviceDataLikeRequestCount ?? 0) > 0;

  if (rows.length === 0 && signals.length === 0 && hosts.length === 0 && !strongCorroboratorObserved) {
    return null;
  }

  const securityBotTelemetryObserved =
    hosts.length > 0 &&
    hosts.every((host) => classifyRuntimePurposeRisk({ host }) === "securityBotMitigation");

  return compactRecord({
    deviceDataLikeRequestCount,
    entropyLinkedToIdentifier,
    entropyTransmissionObserved,
    firstObservedMs: observedMs[0] ?? null,
    browserApiSignals: compactArray(browserApiSignals, 8),
    fingerprintingRuntimeEvidenceCount: rows.length,
    highEntropySignals: compactArray(signals, 8),
    hosts: compactArray(hosts, 5),
    knownFingerprintLibraryMatch,
    observedMs: compactArray(observedMs, 8),
    securityBotTelemetryObserved: securityBotTelemetryObserved ? true : null,
    strongCorroboratorObserved
  });
}

function deriveSessionReplayFingerprintingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const browserDeviceEntropyEvidence = buildBrowserDeviceEntropyReviewEvidence(input);
  const sessionReplayVendors = getStringArray(sessionReplayEvidence, ["vendors"]);
  const sessionReplayConsentStates = getStringArray(sessionReplayEvidence, ["consentStates"]);
  const sessionReplayPreConsentObserved = getBoolean(sessionReplayEvidence, ["preConsentObserved", "pre_consent_observed"]) === true;
  const sessionReplayPostAcceptObserved = getBoolean(sessionReplayEvidence, ["postAcceptObserved"]) === true;
  const sessionReplayFirstSeenMs = getNumber(sessionReplayEvidence, ["firstSeenMs", "first_seen_ms", "firstObservedMs", "first_observed_ms"]);
  const sessionReplayCount =
    getNumber(input.snapshot, ["session_replay_tracker_count"]) ??
    getNumber(input.snapshot, ["session_replay_count"]);
  const sessionReplayObserved =
    getBoolean(input.snapshot, ["session_replay_tool_detected", "session_replay_detected"]) === true ||
    (sessionReplayCount !== null && sessionReplayCount > 0) ||
    sessionReplayVendors.length > 0;
  const fingerprintingObserved =
    getBoolean(input.snapshot, ["fingerprinting_or_identity_vendor_detected", "fingerprinting_detected"]) === true ||
    Boolean(browserDeviceEntropyEvidence);

  if (sessionReplayPostAcceptObserved || (sessionReplayObserved && sessionReplayEvidence)) {
    const sessionReplayTimingRef = typeof sessionReplayFirstSeenMs === "number"
      ? `First session replay signal: ${formatElapsedSeconds(sessionReplayFirstSeenMs)} after scan start`
      : null;
    return makeOutcome(
      "session_replay_fingerprinting_review",
      sessionReplayPreConsentObserved ? "Review signal" : "Observed",
      sessionReplayPreConsentObserved
        ? `Session replay or behavioral analytics were observed before any recorded consent choice${typeof sessionReplayFirstSeenMs === "number" ? `; first seen ${formatElapsedSeconds(sessionReplayFirstSeenMs)} after scan start` : ""}.`
        : sessionReplayPostAcceptObserved
        ? "Session replay or behavioral analytics were retained only after a recorded accept/consent state; no pre-consent replay evidence was retained."
        : "Session replay or behavioral analytics were observed during the scan, but retained evidence does not confirm the signal fired before consent.",
      [
        sessionReplayPreConsentObserved
          ? "Session replay signal observed before consent"
          : sessionReplayPostAcceptObserved
          ? "Session replay signal observed after consent"
          : "Session replay signal observed; pre-consent timing not confirmed",
        sessionReplayTimingRef,
        ...sessionReplayVendors.map((vendor) => `Runtime vendor: ${vendor}`),
        ...(
          sessionReplayConsentStates.length > 0
            ? sessionReplayConsentStates.map((state) => `Consent state: ${state}`)
            : [sessionReplayPreConsentObserved
                ? "Consent timing: before recorded consent"
                : "Consent timing: not confirmed as pre-consent"
              ]
        )
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          gapCapableRows: [
            "session_replay_before_consent",
            "session_replay_disclosure_alignment",
            "session_replay_sensitive_surface",
            "session_replay_after_refusal"
          ],
          sessionReplayEvidence
        }
      }
    );
  }

  if (!sessionReplayObserved && fingerprintingObserved) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Review signal",
      "Browser/device entropy review signal. Retained evidence showed browser or device entropy access, but no session replay vendor, entropy transmission, identifier linkage, known fingerprinting library, or device-data-like request payload was retained.",
      [
        "Browser/device entropy review signal",
        ...getStringArray(browserDeviceEntropyEvidence, ["hosts"]).map((host) => `Observed host: ${host}`).slice(0, 3)
      ],
      {
        retainedEvidence: {
          browserDeviceEntropyEvidence,
          fingerprintingObserved: true,
          sessionReplayEvidence,
          sessionReplayObserved: false
        }
      }
    );
  }

  if (sessionReplayObserved || fingerprintingObserved) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Insufficient evidence",
      "Replay or fingerprinting-like runtime evidence was retained, but no eligible replay/fingerprinting unified finding was projected.",
      [
        sessionReplayObserved ? "Session replay signal observed" : null,
        fingerprintingObserved ? "Fingerprinting or identity vendor signal observed" : null
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.sessionReplayFingerprintingFinding",
            "eligible projected unified finding when retained replay/fingerprinting evidence satisfies policy gates",
            "missing",
            "Required to classify retained replay or fingerprinting-like runtime evidence as a canonical review signal.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          fingerprintingObserved,
          sessionReplayCount,
          sessionReplayEvidence,
          sessionReplayObserved
        }
      }
    );
  }

  if (hasSessionReplayRuntimeCoverage(input) || hasFingerprintingRuntimeCoverage(input) || sessionReplayCount !== null) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Not observed",
      "Runtime vendor/fingerprinting checks completed for the tested context, and no eligible replay or fingerprinting finding was projected.",
      ["Evidence: retained session replay / fingerprinting coverage summary"],
      {
        retainedEvidence: {
          fingerprintingObserved: false,
          fingerprintingRuntimeCoverageRetained: hasFingerprintingRuntimeCoverage(input),
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          sessionReplayCount: sessionReplayCount ?? 0,
          sessionReplayRuntimeCoverageRetained: hasSessionReplayRuntimeCoverage(input),
          sessionReplayObserved: false
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include row-specific session replay or fingerprinting coverage evidence.",
      ["Evidence gap: session replay / fingerprinting coverage not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.sessionReplayEvidenceSummary",
            "row-specific session replay evidence summary",
            "missing",
            "Required to determine whether session replay or behavioral analytics was inspected and absent."
          ),
          sourceGap(
            "runtimeArtifacts.fingerprintingEvidenceSummary",
            "row-specific browser API / fingerprinting evidence summary",
            "missing",
            "Required to determine whether device-identification or fingerprinting signals were inspected and absent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveDeviceFingerprintingSignalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const browserDeviceEntropyEvidence = buildBrowserDeviceEntropyReviewEvidence(input);
  const fingerprintingObserved =
    getBoolean(input.snapshot, ["fingerprinting_or_identity_vendor_detected", "fingerprinting_detected"]) === true ||
    Boolean(browserDeviceEntropyEvidence);

  if (fingerprintingObserved) {
    const securityBotTelemetryObserved = getBoolean(browserDeviceEntropyEvidence, ["securityBotTelemetryObserved", "security_bot_telemetry_observed"]) === true;
    const highEntropySignals = getStringArray(browserDeviceEntropyEvidence, ["highEntropySignals", "high_entropy_signals"]);
    const browserApiSignals = getStringArray(browserDeviceEntropyEvidence, ["browserApiSignals", "browser_api_signals"]);
    const descriptorSignals = browserApiSignals.length > 0 ? browserApiSignals : highEntropySignals;
    const firstObservedMs = getNumber(browserDeviceEntropyEvidence, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms"]);
    const signalPhrase = descriptorSignals.length > 0
      ? ` Retained API signals: ${formatInlineList(descriptorSignals.slice(0, 4))}${typeof firstObservedMs === "number" ? `; first observed around ${formatElapsedSeconds(firstObservedMs)} after scan start` : ""}.`
      : "";
    return makeOutcome(
      "device_identification_fingerprinting_signal_observed",
      "Review signal",
      securityBotTelemetryObserved
        ? "Security/bot-detection telemetry with device-identification-like attributes was retained for review. This is preserved as runtime evidence but is not classified as marketing fingerprinting by itself."
        : `Browser/device entropy, fingerprinting, or identifier-like device collection evidence was retained for review.${signalPhrase}`,
      [
        securityBotTelemetryObserved
          ? "Security/bot telemetry signal observed"
          : "Fingerprinting or device-identification signal observed",
        ...descriptorSignals.map((signal) =>
          typeof firstObservedMs === "number"
            ? `Browser API access: ${signal}; first observed around ${formatElapsedSeconds(firstObservedMs)} after scan start`
            : `Browser API access: ${signal}`
        ).slice(0, 4),
        ...getStringArray(browserDeviceEntropyEvidence, ["hosts"]).map((host) => `Observed host: ${host}`).slice(0, 3)
      ],
      {
        retainedEvidence: {
          browserDeviceEntropyEvidence,
          fingerprintingObserved: true,
          securityBotTelemetryObserved
        }
      }
    );
  }

  if (hasFingerprintingRuntimeCoverage(input)) {
    return makeOutcome(
      "device_identification_fingerprinting_signal_observed",
      "Not observed",
      "Runtime fingerprinting/device-identification checks completed for the tested context and did not retain an eligible signal.",
      ["Evidence: retained fingerprinting/browser API coverage summary"],
      {
        retainedEvidence: {
          fingerprintingObserved: false,
          fingerprintingRuntimeCoverageRetained: true,
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          runtimeEvidenceRetained: Boolean(hybridRuntimeEvidence)
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || Boolean(hybridRuntimeEvidence)) {
    return makeOutcome(
      "device_identification_fingerprinting_signal_observed",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include row-specific browser API or fingerprinting coverage evidence.",
      ["Evidence gap: fingerprinting/browser API coverage not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.fingerprintingEvidenceSummary",
            "row-specific browser API / fingerprinting evidence summary",
            "missing",
            "Required to determine whether device-identification or fingerprinting signals were inspected and absent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          runtimeEvidenceRetained: Boolean(hybridRuntimeEvidence)
        }
      }
    );
  }

  return null;
}

function deriveSessionReplayBeforeConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const observed = sessionReplayObservedFromEvidence(sessionReplayEvidence);
  const preConsentObserved = getBoolean(sessionReplayEvidence, ["preConsentObserved", "pre_consent_observed"]) === true;

  if (preConsentObserved) {
    return makeOutcome(
      "session_replay_before_consent",
      "Gap observed",
      "Session replay or behavioral recording collection was retained before a recorded consent action.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay signal observed before consent"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (observed) {
    return makeOutcome(
      "session_replay_before_consent",
      "Not observed",
      "Session replay was observed, but retained evidence did not show session replay collection before a recorded consent action.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "No pre-consent session replay collection retained"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (hasSessionReplayRuntimeCoverage(input)) {
    return makeOutcome(
      "session_replay_before_consent",
      "Not observed",
      "Runtime capture completed for the tested context, and no pre-consent session replay collection signal was retained.",
      ["Evidence: retained session replay coverage summary"],
      {
        retainedEvidence: {
          sessionReplayObserved: false
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "session_replay_before_consent",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include row-specific session replay coverage evidence.",
      ["Evidence gap: session replay coverage not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeArtifacts.sessionReplayEvidenceSummary",
            "row-specific session replay evidence summary",
            "missing",
            "Required to determine whether session replay collection happened before consent."
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveSessionReplayDisclosureAlignmentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const observed = sessionReplayObservedFromEvidence(sessionReplayEvidence);
  const comparisonObserved = getBoolean(sessionReplayEvidence, [
    "vendorDisclosureComparisonObserved",
    "vendor_disclosure_comparison_observed"
  ]) === true;
  const vendorDisclosureGap = getBoolean(sessionReplayEvidence, ["vendorDisclosureGap", "vendor_disclosure_gap"]) === true;
  const vendorDisclosed = getBoolean(sessionReplayEvidence, ["vendorDisclosed", "vendor_disclosed"]) === true;

  if (!observed) {
    return hasSessionReplayRuntimeCoverage(input)
      ? makeOutcome(
          "session_replay_disclosure_alignment",
          "Not observed",
          "No session replay runtime signal was retained, so no session replay disclosure mismatch was observed.",
          ["Evidence: retained session replay coverage summary"],
          { retainedEvidence: { sessionReplayObserved: false } }
        )
      : hasRuntimeCapture(input)
        ? makeOutcome(
            "session_replay_disclosure_alignment",
            "Not testable",
            "Runtime capture completed, but the retained scanner context did not include row-specific session replay coverage evidence.",
            ["Evidence gap: session replay coverage not retained"],
            {
              missingOrIncompleteSourceSignals: [
                sessionReplayMissingEvidence(
                  "runtimeArtifacts.sessionReplayEvidenceSummary",
                  "Required to determine whether a session replay disclosure-alignment comparison is applicable.",
                  "missing"
                )
              ],
              retainedEvidence: { runtimeCaptureCompleted: true }
            }
          )
        : null;
  }

  if (vendorDisclosureGap) {
    return makeOutcome(
      "session_replay_disclosure_alignment",
      "Gap observed",
      "Session replay or behavioral analytics runtime evidence was retained, but reviewed privacy/cookie surfaces did not clearly disclose the observed replay vendor or domain.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay vendor disclosure mismatch observed"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (vendorDisclosed) {
    return makeOutcome(
      "session_replay_disclosure_alignment",
      "Observed",
      "Session replay or behavioral analytics runtime evidence was retained and matched to reviewed disclosure evidence.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay vendor disclosure matched"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  return makeOutcome(
    "session_replay_disclosure_alignment",
    "Not testable",
    "Session replay was observed, but retained policy/cookie disclosure comparison evidence was not available for this scan context.",
    sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay observed; disclosure comparison unavailable"),
    {
      missingOrIncompleteSourceSignals: [
        sessionReplayMissingEvidence(
          "sessionReplayEvidence.vendorDisclosureComparisonObserved",
          "Required to decide whether observed session replay vendors were disclosed.",
          comparisonObserved
        )
      ],
      retainedEvidence: {
        sessionReplayEvidence
      }
    }
  );
}

function deriveSessionReplaySensitiveSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const observed = sessionReplayObservedFromEvidence(sessionReplayEvidence);
  const sensitiveSurfaceOverlap = getBoolean(sessionReplayEvidence, [
    "sensitiveSurfaceOverlap",
    "sensitive_surface_overlap"
  ]) === true;

  if (observed && sensitiveSurfaceOverlap) {
    return makeOutcome(
      "session_replay_sensitive_surface",
      "Gap observed",
      "Session replay or behavioral analytics was observed in the same retained page or flow as a sensitive collection surface.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay observed on sensitive surface"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (observed) {
    return makeOutcome(
      "session_replay_sensitive_surface",
      "Not observed",
      "Session replay was observed, but retained evidence did not show same-context sensitive-surface overlap.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "No same-context sensitive-surface session replay retained"),
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (hasSessionReplayRuntimeCoverage(input)) {
    return makeOutcome(
      "session_replay_sensitive_surface",
      "Not observed",
      "Runtime capture completed for the tested context, and no sensitive-surface session replay signal was retained.",
      ["Evidence: retained session replay coverage summary"],
      {
        retainedEvidence: {
          sessionReplayObserved: false
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "session_replay_sensitive_surface",
      "Not testable",
      "Runtime capture completed, but the retained scanner context did not include row-specific session replay coverage evidence.",
      ["Evidence gap: session replay coverage not retained"],
      {
        missingOrIncompleteSourceSignals: [
          sessionReplayMissingEvidence(
            "runtimeArtifacts.sessionReplayEvidenceSummary",
            "Required to determine whether session replay overlapped with sensitive collection surfaces.",
            "missing"
          )
        ],
        retainedEvidence: {
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function deriveSessionReplayAfterRefusalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const observed = sessionReplayObservedFromEvidence(sessionReplayEvidence);
  const postRejectEvidence = getPostRejectSessionReplayEvidence(input, sessionReplayEvidence);
  const rejectInteractionConfirmed = getBoolean(postRejectEvidence, [
    "rejectInteractionConfirmed",
    "reject_interaction_confirmed"
  ]) === true;
  const postRejectObserved = getBoolean(postRejectEvidence, ["postRejectObserved", "post_reject_observed"]) === true;
  const postRejectWindowAvailable = getBoolean(postRejectEvidence, [
    "postRejectWindowAvailable",
    "post_reject_window_available"
  ]);

  if (POST_CHOICE_FLOW_DEFERRED_FROM_PRODUCTION_CORE) {
    return makeOutcome(
      "session_replay_after_refusal",
      "Not testable",
      "Post-choice consent-flow automation is deferred from the current production core scanner. CertScore evaluates session replay and behavioral analytics through pre-consent, sensitive-surface, and disclosure-alignment evidence, not after-refusal persistence conclusions.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay post-choice comparison deferred"),
      {
        retainedEvidence: {
          postRejectEvidence,
          productionPosture: "post_choice_flow_deferred_from_core",
          sessionReplayEvidence
        }
      }
    );
  }

  if (rejectInteractionConfirmed && postRejectObserved) {
    return makeOutcome(
      "session_replay_after_refusal",
      "Gap observed",
      "A reject or opt-out action was confirmed, and session replay or behavioral analytics evidence persisted in the retained post-choice comparison window.",
      [
        "Reject/opt-out action proof succeeded",
        ...sessionReplayEvidenceRefs(postRejectEvidence, "Session replay observed after refusal / opt-out")
      ],
      {
        retainedEvidence: {
          postRejectEvidence,
          sessionReplayEvidence
        }
      }
    );
  }

  if (rejectInteractionConfirmed) {
    return makeOutcome(
      "session_replay_after_refusal",
      "Not observed",
      "A reject or opt-out action was confirmed, and no post-choice session replay persistence signal was retained.",
      ["Reject/opt-out action proof succeeded"],
      {
        retainedEvidence: {
          postRejectEvidence,
          sessionReplayEvidence
        }
      }
    );
  }

  if (observed || postRejectWindowAvailable !== null) {
    return makeOutcome(
      "session_replay_after_refusal",
      "Not testable",
      "Session replay after refusal was not testable because no successful reject or opt-out action proof was retained for comparison.",
      sessionReplayEvidenceRefs(sessionReplayEvidence, "Session replay observed; post-refusal comparison not action-proofed"),
      {
        missingOrIncompleteSourceSignals: [
          sessionReplayMissingEvidence(
            "postRejectTrackingReductionEvidence.rejectInteractionConfirmed",
            "Required before CertScore can compare session replay behavior after refusal or opt-out.",
            rejectInteractionConfirmed
          )
        ],
        retainedEvidence: {
          postRejectEvidence,
          sessionReplayEvidence
        }
      }
    );
  }

  return null;
}

function deriveCrossBorderOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const endpointJurisdictionRows = [
    ...getObjectArray(input.runtimeArtifacts, [
      "endpointJurisdictionEvidence",
      "endpoint_jurisdiction_evidence",
      "crossBorderEndpointEvidence",
      "cross_border_endpoint_evidence"
    ]),
    ...getObjectArray(hybridRuntimeEvidence, [
      "endpointJurisdictionEvidence",
      "endpoint_jurisdiction_evidence",
      "crossBorderEndpointEvidence",
      "cross_border_endpoint_evidence"
    ])
  ];
  const networkSummary = getHybridNetworkSummary(input.runtimeArtifacts);
  const thirdPartyDomainCount =
    getNumber(networkSummary, ["thirdPartyDomainCount", "third_party_domain_count"]) ??
    getNumber(input.snapshot, ["third_party_script_domain_count"]);

  if (endpointJurisdictionRows.length > 0) {
    const transferReviewRows = endpointJurisdictionRows.filter((row) =>
      getBoolean(row, ["transferReviewSignal", "transfer_review_signal"]) === true
    ).length;
      return makeOutcome(
        "cross_border_endpoint_review",
        transferReviewRows > 0 ? "Review signal" : "Not observed",
        transferReviewRows > 0
          ? "Endpoint geography creates a transfer-review signal. The gap status is based on retained disclosure mismatch for transfer-relevant advertising, analytics, or tag-management vendors."
          : "Endpoint jurisdiction evidence was retained, and no eligible cross-border endpoint finding was projected.",
      [
        `Endpoint jurisdiction rows: ${endpointJurisdictionRows.length}`,
        transferReviewRows > 0 ? `Transfer review signal rows: ${transferReviewRows}` : null
        ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: transferReviewRows > 0
          ? [
              sourceGap(
                "CertScore.unifiedFindings.crossBorderVendorDisclosureGap",
                "eligible projected unified finding when retained transfer-relevant endpoint evidence intersects with vendor-disclosure mismatch evidence",
                "missing",
                "Required before CertScore can classify endpoint geography as a disclosure gap rather than a transfer-review signal.",
                "CertScore"
              )
            ]
          : [],
        retainedEvidence: {
          endpointJurisdictionRows: endpointJurisdictionRows.length,
          transferReviewSignalRows: transferReviewRows
        }
      }
      );
    }

  if (thirdPartyDomainCount !== null && thirdPartyDomainCount > 0) {
    return makeOutcome(
        "cross_border_endpoint_review",
        "Not testable",
        "3rd party endpoint inventory was retained, but endpoint jurisdiction or transfer-region evidence was not retained for this scan.",
        [`3rd party endpoint domains observed: ${thirdPartyDomainCount}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "hybridRuntimeEvidence.endpointJurisdictionEvidence",
            "one or more endpoint jurisdiction evidence rows",
            endpointJurisdictionRows.length,
            "Required to evaluate whether observed 3rd party endpoints create a transfer-region review signal."
          )
        ],
        retainedEvidence: {
          endpointJurisdictionRows: 0,
          thirdPartyDomainCount
        }
      }
      );
    }

  return null;
}

function deriveAccessibilityConsentControlsOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const visualAccessReview = getObject(input.runtimeArtifacts, ["visualAccessReview", "visual_access_review"]);
  const axeEvidenceRows = getObjectArray(input.runtimeArtifacts, ["accessibilityAxeEvidence", "accessibility_axe_evidence"]);
  const californiaPrivacyEvidence = getObject(input.runtimeArtifacts, ["californiaPrivacyEvidence", "california_privacy_evidence"]);
  const controlAccessibilityIssueObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyControlAccessibilityIssueObserved",
    "privacy_control_accessibility_issue_observed"
  ]);
  const controlAccessibilitySignals = getStringArray(californiaPrivacyEvidence, [
    "privacyControlAccessibilitySignals",
    "privacy_control_accessibility_signals"
  ]);
  const keyboardIssueCount = getNumber(input.snapshot, ["wcag_keyboard_navigation_issue_count"]);
  const focusIssueCount = getNumber(input.snapshot, ["wcag_focus_indicator_issue_count"]);
  const ariaIssueCount = getNumber(input.snapshot, ["wcag_aria_error_count"]);
  const labelIssueCount = getNumber(input.snapshot, ["wcag_form_label_error_count"]);
  const retainedIssueCount =
    (keyboardIssueCount ?? 0) +
    (focusIssueCount ?? 0) +
    (ariaIssueCount ?? 0) +
    (labelIssueCount ?? 0);
  const accessibilityEvidenceRetained =
    Boolean(visualAccessReview) ||
    axeEvidenceRows.length > 0 ||
    retainedIssueCount > 0 ||
    controlAccessibilityIssueObserved !== null;
  const gdprCookieConsentSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "gdprCookieConsentSurfaceObserved",
    "gdpr_cookie_consent_surface_observed"
  ]);
  const privacyAdChoiceSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyAdChoiceSurfaceObserved",
    "privacy_ad_choice_surface_observed"
  ]);
  const privacyChoiceSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyChoiceSurfaceObserved",
    "privacy_choice_surface_observed"
  ]);
  const rawConsentSurfaceObserved =
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) ??
    getBoolean(getHybridRuntimeEvidence(input.runtimeArtifacts), ["consentSurfaceObserved", "consent_surface_observed"]) ??
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]);
  const consentSurfaceObserved =
    gdprCookieConsentSurfaceObserved === false &&
    (privacyChoiceSurfaceObserved === true || privacyAdChoiceSurfaceObserved === true)
      ? false
      : rawConsentSurfaceObserved;
  const evaluation = evaluateConsentControlAccessibility({
    accessibilityAuditRan: accessibilityEvidenceRetained,
    affectedControlLabels: getStringArray(californiaPrivacyEvidence, ["affectedControlLabels", "affected_control_labels"]),
    affectedControlRoles: getStringArray(californiaPrivacyEvidence, ["affectedControlRoles", "affected_control_roles"]),
    affectedControlTypes: getStringArray(californiaPrivacyEvidence, ["affectedControlTypes", "affected_control_types"]),
    affectedSelectors: getStringArray(californiaPrivacyEvidence, ["affectedSelectors", "affected_selectors"]),
    affectedUrls: getStringArray(californiaPrivacyEvidence, ["affectedUrls", "affected_urls"]),
    ariaIssueCount,
    axeEvidenceRows: axeEvidenceRows.length,
    buttonNameIssueCount: getNumber(californiaPrivacyEvidence, ["buttonNameIssueCount", "button_name_issue_count"]),
    consentControlsObserved: getStringArray(californiaPrivacyEvidence, ["consentControlsObserved", "consent_controls_observed"]),
    consentSurfaceObserved,
    contrastIssueCount: getNumber(californiaPrivacyEvidence, ["contrastIssueCount", "contrast_issue_count"]),
    controlAccessibilityIssueCount: getNumber(californiaPrivacyEvidence, ["controlAccessibilityIssueCount", "control_accessibility_issue_count"]),
    controlAccessibilityIssueObserved,
    controlAccessibilitySignals,
    controlScopeConfidence: getString(californiaPrivacyEvidence, ["controlScopeConfidence", "control_scope_confidence"]),
    cookieConsentAccessibilityIssueObserved: getBoolean(californiaPrivacyEvidence, [
      "cookieConsentAccessibilityIssueObserved",
      "cookie_consent_accessibility_issue_observed"
    ]),
    coverageStatus: getString(californiaPrivacyEvidence, ["coverageStatus", "coverage_status"]),
    directVsInferred: getString(californiaPrivacyEvidence, ["directVsInferred", "direct_vs_inferred"]),
    evidenceConfidence: getString(californiaPrivacyEvidence, ["evidenceConfidence", "evidence_confidence"]),
    examplesAreGeneralPageOnly: getBoolean(californiaPrivacyEvidence, ["examplesAreGeneralPageOnly", "examples_are_general_page_only"]),
    focusIssueCount,
    gdprCookieConsentSurfaceObserved,
    generalPageAccessibilityIssuesObserved: retainedIssueCount > 0 || axeEvidenceRows.length > 0,
    keyboardIssueCount,
    labelIssueCount,
    linkNameIssueCount: getNumber(californiaPrivacyEvidence, ["linkNameIssueCount", "link_name_issue_count"]),
    privacyAdChoiceSurfaceObserved,
    privacyChoiceAccessibilityIssueObserved: getBoolean(californiaPrivacyEvidence, [
      "privacyChoiceAccessibilityIssueObserved",
      "privacy_choice_accessibility_issue_observed"
    ]),
    privacyChoiceSurfaceObserved,
    privacyControlObserved: getBoolean(californiaPrivacyEvidence, ["privacyControlObserved", "privacy_control_observed"]),
    privacyControlsObserved: getStringArray(californiaPrivacyEvidence, ["privacyControlsObserved", "privacy_controls_observed"]),
    retainedDomEvidenceRef: getString(californiaPrivacyEvidence, ["retainedDomEvidenceRef", "retained_dom_evidence_ref"]),
    retainedScreenshotRef: getString(californiaPrivacyEvidence, ["retainedScreenshotRef", "retained_screenshot_ref"]),
    visualAccessReviewRetained: Boolean(visualAccessReview)
  });

  if (evaluation.status === "Gap observed") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Gap observed",
      "CertScore retained basic automated accessibility evidence for consent or privacy controls, including button-name, link-name, color-contrast, ARIA, focus, or keyboard-related issues. Review whether users can perceive, understand, and operate the consent or privacy-choice controls, including with keyboard navigation and assistive technology.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Review signal") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Review signal",
      "Automated accessibility issues were observed in the tested page context, but the retained examples are not clearly tied to consent or privacy-choice controls. Review whether the consent banner, preference center, or related controls are affected.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Not observed") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Not observed",
      evaluation.retainedEvidence.examplesAreGeneralPageOnly === true
        ? "Automated accessibility issues were retained for the tested page context, such as a general page or navigation control, but scanner did not tie the retained examples to the observed consent banner, preference center, or privacy-choice controls."
        : "No basic automated accessibility issue was retained for the observed consent or privacy controls in the tested context.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Not testable") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Not testable",
      "Consent/privacy control accessibility was not testable because no usable consent/privacy-control accessibility evidence was retained.",
      evaluation.evidenceRefs,
      {
        missingOrIncompleteSourceSignals: evaluation.missingOrIncompleteSourceSignals,
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  return null;
}

function evaluateConsentControlAccessibility(input: {
  accessibilityAuditRan: boolean;
  affectedControlLabels: string[];
  affectedControlRoles: string[];
  affectedControlTypes: string[];
  affectedSelectors: string[];
  affectedUrls: string[];
  ariaIssueCount: number | null;
  axeEvidenceRows: number;
  buttonNameIssueCount: number | null;
  consentControlsObserved: string[];
  consentSurfaceObserved: boolean | null;
  contrastIssueCount: number | null;
  controlAccessibilityIssueCount: number | null;
  controlAccessibilityIssueObserved: boolean | null;
  controlAccessibilitySignals: string[];
  controlScopeConfidence: string | null;
  cookieConsentAccessibilityIssueObserved: boolean | null;
  coverageStatus: string | null;
  directVsInferred: string | null;
  evidenceConfidence: string | null;
  examplesAreGeneralPageOnly: boolean | null;
  focusIssueCount: number | null;
  gdprCookieConsentSurfaceObserved: boolean | null;
  generalPageAccessibilityIssuesObserved: boolean;
  keyboardIssueCount: number | null;
  labelIssueCount: number | null;
  linkNameIssueCount: number | null;
  privacyAdChoiceSurfaceObserved: boolean | null;
  privacyChoiceAccessibilityIssueObserved: boolean | null;
  privacyChoiceSurfaceObserved: boolean | null;
  privacyControlObserved: boolean | null;
  privacyControlsObserved: string[];
  retainedDomEvidenceRef: string | null;
  retainedScreenshotRef: string | null;
  visualAccessReviewRetained: boolean;
}) {
  const controlObserved =
    input.gdprCookieConsentSurfaceObserved === true ||
    input.privacyChoiceSurfaceObserved === true ||
    input.privacyAdChoiceSurfaceObserved === true ||
    input.consentSurfaceObserved === true ||
    input.privacyControlObserved === true ||
    input.consentControlsObserved.length > 0 ||
    input.privacyControlsObserved.length > 0 ||
    input.controlAccessibilityIssueObserved !== null ||
    input.controlAccessibilitySignals.length > 0;
  const issueCount =
    input.controlAccessibilityIssueCount ??
    (input.controlAccessibilitySignals.length > 0
      ? input.controlAccessibilitySignals.length
      : (input.ariaIssueCount ?? 0) + (input.focusIssueCount ?? 0) + (input.keyboardIssueCount ?? 0) + (input.labelIssueCount ?? 0));
  const controlScopedIssue =
    (input.cookieConsentAccessibilityIssueObserved === true ||
      input.privacyChoiceAccessibilityIssueObserved === true ||
      (input.cookieConsentAccessibilityIssueObserved === null &&
        input.privacyChoiceAccessibilityIssueObserved === null &&
        input.controlAccessibilityIssueObserved === true)) &&
    input.examplesAreGeneralPageOnly !== true &&
    (
      input.controlScopeConfidence === "high" ||
      input.controlScopeConfidence === "moderate" ||
      input.controlAccessibilitySignals.length > 0 ||
      input.affectedControlTypes.length > 0 ||
      input.affectedControlLabels.length > 0 ||
      input.affectedSelectors.length > 0
    );
  const evidenceRefs = [
    "Evidence: accessibility audit context",
    issueCount > 0 ? `Accessibility issue count: ${issueCount}` : null,
    ...input.controlAccessibilitySignals.slice(0, 6).map((signal) => `Control accessibility signal: ${signal}`),
    ...input.affectedControlTypes.slice(0, 3).map((type) => `Affected control type: ${type}`),
    ...input.affectedControlLabels.slice(0, 3).map((label) => `Affected control label: ${label}`),
    ...input.affectedUrls.slice(0, 2).map((url) => `Affected URL: ${url}`)
  ].filter((value): value is string => Boolean(value));
  const retainedEvidence = {
    affectedControlLabels: input.affectedControlLabels,
    affectedControlRoles: input.affectedControlRoles,
    affectedControlTypes: input.affectedControlTypes,
    affectedSelectors: input.affectedSelectors,
    affectedUrls: input.affectedUrls,
    ariaIssueCount: input.ariaIssueCount ?? 0,
    axeEvidenceRows: input.axeEvidenceRows,
    buttonNameIssueCount: input.buttonNameIssueCount,
    consentControlsObserved: input.consentControlsObserved,
    consentSurfaceObserved: input.consentSurfaceObserved,
    contrastIssueCount: input.contrastIssueCount,
    controlAccessibilityIssueCount: issueCount,
    controlAccessibilityIssueObserved: input.controlAccessibilityIssueObserved,
    controlAccessibilitySignals: input.controlAccessibilitySignals,
    controlScopeConfidence: input.controlScopeConfidence,
    cookieConsentAccessibilityIssueObserved: input.cookieConsentAccessibilityIssueObserved,
    coverageStatus: input.coverageStatus,
    directVsInferred: input.directVsInferred,
    evidenceConfidence: input.evidenceConfidence,
    examplesAreGeneralPageOnly: input.examplesAreGeneralPageOnly,
    focusIssueCount: input.focusIssueCount ?? 0,
    gdprCookieConsentSurfaceObserved: input.gdprCookieConsentSurfaceObserved,
    keyboardIssueCount: input.keyboardIssueCount ?? 0,
    labelIssueCount: input.labelIssueCount ?? 0,
    linkNameIssueCount: input.linkNameIssueCount,
    privacyAdChoiceSurfaceObserved: input.privacyAdChoiceSurfaceObserved,
    privacyChoiceAccessibilityIssueObserved: input.privacyChoiceAccessibilityIssueObserved,
    privacyChoiceSurfaceObserved: input.privacyChoiceSurfaceObserved,
    privacyControlObserved: input.privacyControlObserved,
    privacyControlsObserved: input.privacyControlsObserved,
    retainedDomEvidenceRef: input.retainedDomEvidenceRef,
    retainedScreenshotRef: input.retainedScreenshotRef,
    visualAccessReviewRetained: input.visualAccessReviewRetained
  };

  if (!input.accessibilityAuditRan || !controlObserved) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [
        !input.accessibilityAuditRan
          ? sourceGap(
              "accessibilityAuditRan",
              true,
              input.accessibilityAuditRan,
              "Required before CertScore can evaluate consent/privacy-control accessibility evidence."
            )
          : null,
        !controlObserved
          ? sourceGap(
              "consentPrivacyControlObserved",
              true,
              controlObserved,
              "Required before CertScore can evaluate accessibility evidence for consent or privacy-choice controls."
            )
          : null
      ].filter((value): value is GdprEprivacyCoverageSourceSignalGap => Boolean(value)),
      retainedEvidence,
      status: "Not testable" as const
    };
  }

  if (controlScopedIssue) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  if (input.examplesAreGeneralPageOnly === true && input.controlAccessibilityIssueObserved === false) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Not observed" as const
    };
  }

  if (input.generalPageAccessibilityIssuesObserved) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Review signal" as const
    };
  }

  return {
    evidenceRefs,
    missingOrIncompleteSourceSignals: [],
    retainedEvidence,
    status: "Not observed" as const
  };
}

export function deriveGdprEprivacyCoveragePolicyOutcomes(input: GdprEprivacyCoveragePolicyInput) {
  const policyCoverageContext = derivePolicyCoverageContext({
    events: input.events,
    policyEnrichmentCount: input.policyEnrichmentCount,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const outcomes = [
    deriveConsentSurfaceOutcome(input),
    deriveCmpFrameworkSignalOutcome(input),
    deriveCookieNoticePolicyAvailabilityOutcome(input),
    derivePreConsentCookieStorageOutcome(input),
    derivePreConsentThirdPartyTrackingOutcome(input),
    deriveAdvertisingRetargetingVendorSignalOutcome(input),
    deriveRetargetingBehavioralAdvertisingOutcome(input),
    deriveAnalyticsVendorObservedOutcome(input),
    deriveRejectPathOutcome(input),
    deriveAcceptConsentControlOutcome(input),
    deriveOptionsSettingsPreferencesControlOutcome(input),
    deriveConsentChoiceQualityOutcome(input),
    derivePostRejectOutcome(input),
    derivePreferenceWithdrawalOutcome(input),
    ...derivePolicyDisclosureOutcomes(input),
    deriveSensitiveSurfaceOutcome(input),
    deriveSessionReplayFingerprintingOutcome(input),
    deriveDeviceFingerprintingSignalOutcome(input),
    deriveThirdPartyServiceConnectionPreConsentOutcome(input),
    deriveThirdPartyIframePreConsentOutcome(input),
    deriveSocialMediaEmbedPreConsentOutcome(input),
    deriveEmbeddedThirdPartyContentPreConsentOutcome(input),
    ...deriveTransportSecurityOutcomes(input),
    deriveSessionReplayBeforeConsentOutcome(input),
    deriveSessionReplayDisclosureAlignmentOutcome(input),
    deriveSessionReplaySensitiveSurfaceOutcome(input),
    deriveSessionReplayAfterRefusalOutcome(input),
    deriveCrossBorderOutcome(input),
    deriveAccessibilityConsentControlsOutcome(input)
  ];

  const byRow = Object.fromEntries(
    outcomes
      .filter((outcome): outcome is GdprEprivacyCoverageOutcome => Boolean(outcome))
      .map((outcome) => [outcome.rowId, outcome])
  );
  const weakPolicyLimitation = getWeakPolicyEvidenceLimitation(policyCoverageContext);
  if (!weakPolicyLimitation || !input.coverageLimited) {
    return byRow;
  }

  for (const rowId of ["cross_border_endpoint_review"]) {
    const existing = byRow[rowId];
    if (existing && (existing.status === "Gap observed" || existing.status === "Observed")) {
      continue;
    }
    byRow[rowId] = makeOutcome(rowId, "Not testable", weakPolicyLimitation, [], {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scan_document_sources.policyDocumentCount",
          "usable retained policy document evidence",
          policyCoverageContext.policyDocumentCount ?? "missing",
          "Required to evaluate policy-dependent GDPR/ePrivacy disclosure rows."
        )
      ],
      retainedEvidence: {
        policyCoverageContext
      }
    });
  }

  return byRow;
}
