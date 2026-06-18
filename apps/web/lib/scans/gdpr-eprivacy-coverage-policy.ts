import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";
import { derivePolicyCoverageContext, getWeakPolicyEvidenceLimitation } from "./policy-coverage-context";

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
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return true;
    })
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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
  return `${label}: ${Math.round(observedMs)}ms after scan start`;
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
  /\b(?:uses?|use|using)\s+cookies?\b|\bcookie\s+notice\b|\bcookie\s+consent\b|\bcookie\s+(?:settings|preferences|choices|center)\b|\bmanage\s+cookies\b/i;
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
    getString(record, ["bannerTextSnippet", "banner_text_snippet", "textSnippet", "text_snippet", "text", "bodyText", "body_text"]),
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
  const firstLayerChoices =
    getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
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
    (firstLayerObserved === true && (gdprSurfaceObserved === true || gdprSurfaceObserved === "true"))
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

function deriveCookieNoticePolicyAvailabilityOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentSummary = getObject(hybridRuntimeEvidence, ["consentSummary", "consent_summary"]);
  const firstLayerChoices = getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const policyDisclosureSummary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const policySurfaceUrls = [
    ...getStringArray(input.runtimeArtifacts, ["cookiePolicyUrls", "cookie_policy_urls", "cookieNoticeUrls", "cookie_notice_urls"]),
    ...getStringArray(policyDisclosureSummary, ["cookiePolicyUrls", "cookie_policy_urls", "policySurfaceUrls", "policy_surface_urls", "privacyPolicyUrls", "privacy_policy_urls"])
  ];
  const policySurfaceText = [
    getString(policyDisclosureSummary, ["retainedCookiePolicyTextExcerpt", "retained_cookie_policy_text_excerpt"]),
    getString(policyDisclosureSummary, ["retainedPrivacyPolicyTextExcerpt", "retained_privacy_policy_text_excerpt"])
  ].filter(Boolean).join("\n");
  const policySurfaceAvailable =
    getBoolean(input.snapshot, ["cookie_policy_present", "cookiePolicyPresent"]) === true ||
    getBoolean(input.runtimeArtifacts, ["cookiePolicyPresent", "cookie_policy_present"]) === true ||
    getBoolean(policyDisclosureSummary, ["cookiePolicyPresent", "cookie_policy_present"]) === true ||
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
          cookiePolicyUrls: compactArray(policySurfaceUrls, 4)
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
    "First pre-consent third-party tracking request observation",
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

  if (preconsentTrackingDetected) {
    return makeOutcome(
      "pre_consent_third_party_tracking",
      concreteTrackerEvidenceRetained ? "Review signal" : "Insufficient evidence",
      concreteTrackerEvidenceRetained
        ? "Concrete pre-consent tracker vendor or request evidence was retained, but no eligible unified tracking finding was projected for this row. Manual review should confirm whether the retained request sequence supports a GDPR/ePrivacy tracking gap."
        : "Pre-consent third-party tracking evidence was retained, but no eligible unified tracking finding was projected for this row.",
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
      "Runtime tracking checks completed for the tested context, and no eligible pre-consent third-party tracking finding was projected.",
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

function rowHasVendorCategory(row: Record<string, unknown>, categories: string[]) {
  const category = getString(row, ["category", "vendorCategory", "vendor_category", "purpose"]);
  return Boolean(category && categories.includes(category));
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

function deriveAdvertisingRetargetingVendorSignalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const vendorSummary = getObject(hybridRuntimeEvidence, ["vendorSummary", "vendor_summary"]);
  const vendorCategoryCounts = getObject(vendorSummary, ["vendorCategoryCounts", "vendor_category_counts"]);
  const adCategories = ["advertising", "retargeting", "adtech", "marketing"];
  const requestRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]);
  const advertisingRequestRows = requestRows.filter((row) => rowHasVendorCategory(row, adCategories));
  const observedMs = getRuntimeRowObservedMs(advertisingRequestRows, input.runtimeArtifacts);
  const categoryCount = adCategories.reduce((sum, category) => sum + (getNumber(vendorCategoryCounts, [category]) ?? 0), 0);
  const requestCategoryCount = advertisingRequestRows.length;
  const advertisingVendors = getStringArray(input.runtimeArtifacts, [
    "advertising_retargeting_vendor_names",
    "advertisingRetargetingVendorNames",
    "adtech_vendor_names",
    "adtechVendorNames"
  ]);
  const advertisingVendorCount =
    getNumber(input.runtimeArtifacts, ["advertising_retargeting_vendor_count", "advertisingRetargetingVendorCount"]) ??
    Math.max(categoryCount, requestCategoryCount, advertisingVendors.length);

  if (advertisingVendorCount > 0 || advertisingVendors.length > 0) {
    return makeOutcome(
      "advertising_retargeting_vendor_signal_observed",
      "Review signal",
      "Advertising, retargeting, or adtech vendor evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm purpose and consent relevance.",
      [
        advertisingVendorCount > 0 ? `Advertising/retargeting vendor/category count: ${advertisingVendorCount}` : null,
        ...advertisingVendors.map((vendor) => `Advertising/retargeting vendor: ${vendor}`).slice(0, 5),
        "Evidence: retained runtime vendor summary"
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          advertisingRetargetingVendorCount: advertisingVendorCount,
          advertisingRetargetingVendorObservedMs: compactArray(observedMs, 6),
          advertisingRetargetingVendors: compactArray(advertisingVendors, 8),
          firstAdvertisingRetargetingVendorObservedMs: observedMs[0] ?? null,
          observedRuntimeSignalOnly: true
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || vendorSummary) {
    return makeOutcome(
      "advertising_retargeting_vendor_signal_observed",
      "Not observed",
      "Runtime vendor checks completed for the tested context and did not retain an advertising, retargeting, or adtech vendor classification.",
      ["Evidence: retained runtime vendor summary"],
      {
        retainedEvidence: {
          advertisingRetargetingVendorCount: 0,
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
  const analyticsCount =
    getNumber(vendorCategoryCounts, ["analytics", "measurement"]) ??
    getObjectArray(hybridRuntimeEvidence, [
      "requestPurposeClassificationConfidence",
      "request_purpose_classification_confidence"
    ]).filter((row) => getString(row, ["category", "vendorCategory", "vendor_category"]) === "analytics").length;
  const analyticsRequestRows = getObjectArray(hybridRuntimeEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]).filter((row) =>
    ["analytics", "measurement"].includes(getString(row, ["category", "vendorCategory", "vendor_category"]) ?? "")
  );
  const observedMs = getRuntimeRowObservedMs(analyticsRequestRows, input.runtimeArtifacts);
  const analyticsVendors = getStringArray(input.runtimeArtifacts, [
    "analytics_vendor_names",
    "analyticsVendorNames"
  ]);

  if (analyticsCount > 0 || analyticsVendors.length > 0) {
    return makeOutcome(
      "analytics_vendor_observed",
      "Review signal",
      "Analytics or measurement vendor evidence was retained in the pre-consent/public-web runtime context. Manual review should confirm purpose and consent relevance.",
      [
        analyticsCount > 0 ? `Analytics vendor/category count: ${analyticsCount}` : null,
        ...analyticsVendors.map((vendor) => `Analytics vendor: ${vendor}`).slice(0, 5)
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          analyticsVendorCount: analyticsCount,
          analyticsVendorObservedMs: compactArray(observedMs, 6),
          firstAnalyticsVendorObservedMs: observedMs[0] ?? null,
          analyticsVendors: compactArray(analyticsVendors, 8)
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || vendorSummary) {
    return makeOutcome(
      "analytics_vendor_observed",
      "Not observed",
      "Runtime vendor checks completed for the tested context and did not retain an analytics or measurement vendor classification.",
      ["Evidence: retained runtime vendor summary"],
      {
        retainedEvidence: {
          analyticsVendorCount: 0,
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

function deriveEmbeddedThirdPartyContentPreConsentOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const embeddedSummary = getEmbeddedContentEvidenceSummary(input);
  const iframeSummary = getObject(hybridRuntimeEvidence, ["iframeSummary", "iframe_summary"]);
  const iframeRows = [
    ...getObjectArray(iframeSummary, ["iframeEvents", "iframe_events"]),
    ...getObjectArray(input.runtimeArtifacts, ["iframeEvents", "iframe_events"])
  ];
  const embeddedRows = iframeRows.filter(isKnownEmbeddedThirdPartyFrame);
  const summaryObservations = getObjectArray(embeddedSummary, ["observations"]);
  const summaryObserved = getBoolean(embeddedSummary, ["embeddedContentObserved", "embedded_content_observed"]) === true ||
    (getNumber(embeddedSummary, ["embeddedContentObservationCount", "embedded_content_observation_count"]) ?? 0) > 0 ||
    summaryObservations.length > 0;
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

  if (embeddedRows.length > 0 || summaryObserved) {
    return makeOutcome(
      "embedded_content_pre_consent",
      "Observed",
      "Concrete third-party embedded content was retained before consent in iframe/runtime evidence.",
      [
        `Embedded third-party content observations: ${Math.max(embeddedRows.length, summaryObservations.length)}`,
        ...embeddedHosts.map((host) => `Embedded host: ${host}`).slice(0, 5),
        "Evidence: retained pre-consent embedded-content observations"
      ],
      {
        retainedEvidence: {
          embeddedContentHosts: compactArray(embeddedHosts, 8),
          embeddedContentObservedMs: compactArray(observedMs, 6),
          embeddedContentObservationCount:
            getNumber(embeddedSummary, ["embeddedContentObservationCount", "embedded_content_observation_count"]) ??
            Math.max(embeddedRows.length, summaryObservations.length),
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
      "Iframe/runtime checks completed for the tested context and did not retain a concrete third-party embedded-content iframe before consent.",
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
            "Required to determine whether third-party embedded content loaded before consent."
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
  const consentAuditEntry = getEventMetadata(input.events, "consent_audit_entry");
  const rejectDiagnostic = getEventMetadata(input.events, "reject_persistence_diagnostic");
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
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

  if (firstLayerGdprBannerConfirmed === false) {
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

const ACCEPT_LABEL_PATTERN = /\b(?:accept|agree|allow|ok|got it|i accept|yes)\b/i;
const REJECT_LABEL_PATTERN = /\b(?:decline|reject|refuse|deny|opt[-\s]?out|essential only|necessary only)\b/i;
const MANAGE_PREFERENCES_LABEL_PATTERN =
  /\b(?:manage|settings|preferences?|customi[sz]e|choices?|options?|cookie center|preference center)\b/i;

function getConsentChoiceQualityEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices =
    getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
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
    getBoolean(firstLayerChoices, ["managePreferencesObserved", "manage_preferences_observed", "preferencesControlObserved", "preferences_control_observed"]) ??
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
    defaultToggleStatesObserved,
    firstLayerCookieConsentBannerObserved,
    layerInspected,
    managePreferencesObserved,
    nonEssentialDefaultsOff,
    preferenceCenterOpened,
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
    return makeOutcome(
      "consent_choice_quality",
      "Gap observed",
      "Retained consent-surface evidence directly indicates poor consent choice quality.",
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
    textPattern: /data controller|controller|privacy contact|contact us|privacy office|privacy team|data protection/i
  },
  {
    rowId: "processing_purposes_disclosure",
    label: "Processing purposes disclosure",
    disclosureType: "processing_purposes",
    signalKeys: ["processingPurposesDisclosureObserved", "processing_purposes_disclosure_observed"],
    textPattern: /purpose(?:s)? (?:of|for|we|to)|we (?:use|process) (?:your )?(?:personal )?(?:data|information) (?:to|for)|(?:use|processing) of (?:your )?(?:personal )?(?:data|information)|provide (?:our )?services|personalize (?:content|services|experience)/i
  },
  {
    rowId: "legal_basis_disclosure_observed",
    label: "Legal basis disclosure",
    disclosureType: "legal_basis",
    signalKeys: ["legalBasisDisclosureObserved", "legal_basis_disclosure_observed"],
    textPattern: /legal basis|legitimate interest|consent|contract|legal obligation|vital interests|public task/i
  },
  {
    rowId: "recipients_vendor_categories_disclosure",
    label: "Recipients/vendor categories disclosure",
    disclosureType: "recipients_or_vendor_categories",
    signalKeys: ["recipientsVendorCategoriesDisclosureObserved", "recipients_vendor_categories_disclosure_observed"],
    textPattern: /recipient|third part|service provider|vendor|partner|affiliate|advertising partner|analytics provider/i
  },
  {
    rowId: "retention_disclosure_observed",
    label: "Retention disclosure",
    disclosureType: "data_retention",
    signalKeys: ["retentionDisclosureObserved", "retention_disclosure_observed"],
    textPattern: /retention period|retention criteria|storage period|retain.{0,80}(?:as long as necessary|required by law|for the purposes|until|unless)|keep your.{0,80}(?:as long as necessary|required by law|for)|stored for|kept for|as long as necessary/i
  },
  {
    rowId: "data_subject_rights_disclosure",
    label: "Data subject rights disclosure",
    disclosureType: "data_subject_rights",
    signalKeys: ["dataSubjectRightsDisclosureObserved", "data_subject_rights_disclosure_observed"],
    textPattern: /your rights|data subject rights|access|delete|erasure|correct|rectif|portability|object|restrict/i
  },
  {
    rowId: "international_transfers_disclosure",
    label: "International transfer disclosure",
    disclosureType: "international_transfers",
    signalKeys: ["internationalTransfersDisclosureObserved", "international_transfers_disclosure_observed"],
    textPattern: /international transfer|transfer.*outside|outside.*(?:eea|european economic area|eu|european union|uk|united kingdom)|(?:eea|european economic area|eu|european union|uk|united kingdom).*outside|standard contractual|contractual clauses|sccs?|adequacy|cross-border|data transfer framework|dpf|privacy shield|third countr(?:y|ies)|foreign countr(?:y|ies)|global(?:ly)? transfer/i
  },
  {
    rowId: "dpo_contact_point_disclosure",
    label: "DPO/contact point disclosure",
    disclosureType: "dpo_contact",
    signalKeys: ["dpoContactPointDisclosureObserved", "dpo_contact_point_disclosure_observed"],
    textPattern: /data protection officer|dpo|privacy office|data protection contact/i
  },
  {
    rowId: "supervisory_authority_complaint_disclosure",
    label: "Supervisory authority complaint disclosure",
    disclosureType: "supervisory_authority",
    signalKeys: ["supervisoryAuthorityComplaintDisclosureObserved", "supervisory_authority_complaint_disclosure_observed"],
    textPattern: /supervisory authority|data protection authority|complain|complaint|ico|cnil|dpc/i
  },
  {
    rowId: "automated_decision_making_profiling_disclosure",
    label: "Automated decision-making/profiling disclosure",
    disclosureType: "automated_decision_making_or_profiling",
    signalKeys: ["automatedDecisionMakingProfilingDisclosureObserved", "automated_decision_making_profiling_disclosure_observed"],
    textPattern: /automated decision|automated processing|profiling/i
  }
];

function getPolicyDisclosureSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, ["policyDisclosureSummary", "policy_disclosure_summary"]);
}

function getPolicyDisclosureText(summary: Record<string, unknown> | null | undefined) {
  return getString(summary, ["retainedPrivacyPolicyTextExcerpt", "retained_privacy_policy_text_excerpt"]) ?? "";
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

  return getPolicyArticle13DisclosureSignals(summary).find((signal) =>
    getString(signal, ["disclosureType", "disclosure_type"]) === disclosureType
  ) ?? null;
}

function getPolicyObservedTopics(summary: Record<string, unknown> | null | undefined) {
  return getStringArray(summary, ["observedTopics", "observed_topics"]);
}

function policyTextMatchEvidence(text: string, pattern: RegExp) {
  if (!text) {
    return null;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(pattern);
  if (!match?.index && match?.index !== 0) {
    return null;
  }
  const start = Math.max(0, match.index - 180);
  return normalized.slice(start, start + 420);
}

function policySurfaceIsThinOrErrored(summary: Record<string, unknown> | null | undefined) {
  if (!summary) {
    return false;
  }
  const charCount = getNumber(summary, ["privacyPolicyTextCharacterCount", "privacy_policy_text_character_count"]) ?? 0;
  return getBoolean(summary, ["processingErrorObserved", "processing_error_observed"]) === true || charCount < 1_000;
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

function derivePolicyDisclosureOutcome(input: GdprEprivacyCoveragePolicyInput, config: PolicyDisclosureRowConfig) {
  const summary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const privacyPolicyPresent =
    getBoolean(summary, ["privacyPolicyPresent", "privacy_policy_present"]) === true ||
    getBoolean(input.snapshot, ["privacy_policy_present", "privacyPolicyPresent"]) === true;
  const text = getPolicyDisclosureText(summary);
  const directSignal = getBoolean(summary, config.signalKeys);
  const article13Signal = getPolicyArticle13DisclosureSignal(summary, config.disclosureType);
  const article13SignalStatus = getString(article13Signal, ["status"]);
  const article13SignalObserved = article13SignalStatus === "observed";
  const article13SignalPartial = article13SignalStatus === "partial";
  const topicObserved =
    config.disclosureType !== undefined &&
    getPolicyObservedTopics(summary).includes(config.disclosureType);
  const textMatchEvidence = policyTextMatchEvidence(text, config.textPattern);
  const observed =
    directSignal === true ||
    article13SignalObserved ||
    Boolean(textMatchEvidence);

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
    const effectiveArticle13Signal = article13Signal ?? (textMatchEvidence && config.disclosureType
      ? {
          disclosureType: config.disclosureType,
          evidenceText: textMatchEvidence,
          source: "wc01_retained_policy_text_match",
          status: "observed"
        }
      : null);
    return makeOutcome(
      config.rowId,
      "Observed",
      `${config.label} evidence was retained in public policy-surface evidence.`,
      [
        config.rowId === "privacy_notice_availability" ? "Evidence: privacy policy surface retained" : `Evidence: ${config.label}`,
        textMatchEvidence ? `Excerpt: ${textMatchEvidence}` : null,
        ...getStringArray(summary, ["privacyPolicyUrls", "privacy_policy_urls"]).map((url) => `Policy URL: ${url}`).slice(0, 2)
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          article13Signal: effectiveArticle13Signal,
          policySurfaceSummary: summary,
          signalObserved: true
        }
      }
    );
  }

  if (article13SignalPartial || topicObserved) {
    return makeOutcome(
      config.rowId,
      "Review signal",
      article13SignalPartial
        ? `${config.label} was partially observed in retained public policy-surface evidence and needs review.`
        : `${config.label} was indicated by retained policy topics, but no row-specific disclosure evidence was retained. Manual review is needed.`,
      [
        article13SignalPartial ? `Evidence: partial ${config.label}` : `Evidence: policy topic mentions ${config.disclosureType}`,
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
    return makeOutcome(
      config.rowId,
      "Review signal",
      `A privacy-policy surface was retained, but extracted text was thin or errored and no structured ${config.label.toLowerCase()} signal was retained. Manual review is needed.`,
      ["Evidence: privacy policy surface retained", "Limitation: thin or errored policy extraction"],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.policySurfaceObservations.privacy_policy.textExcerpt",
            "usable retained privacy policy text for Article 13 disclosure review",
            text ? `${text.length} characters` : "missing",
            `Required to evaluate ${config.label.toLowerCase()}.`
          )
        ],
        retainedEvidence: {
          article13Signal,
          policySurfaceSummary: summary,
          signalObserved: false
        }
      }
    );
  }

  if (config.rowId === "international_transfers_disclosure") {
    return makeOutcome(
      config.rowId,
      "Review signal",
      "A privacy-policy surface was retained, but no row-specific international transfer disclosure signal was retained. Manual review is needed before treating this as a potential transparency gap.",
      ["Evidence: retained privacy policy text reviewed", "Missing evidence: row-specific international transfer disclosure signal"],
      {
        retainedEvidence: {
          article13Signal,
          policySurfaceSummary: summary,
          signalObserved: false
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
  return POLICY_DISCLOSURE_ROWS.map((config) => derivePolicyDisclosureOutcome(input, config));
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
          "Sensitive-field correlation completed for the tested context and did not retain eligible sensitive fields alongside third-party tracking.",
          ["Evidence: sensitive third-party tracking correlation completed"],
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
    payloadGapObserved ? "Sensitive collection with third-party payload evidence observed" : null,
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
          "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and third-party tracking, but does not conclusively establish same-context sensitive payload exposure.",
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
        "CertScore retained evidence of a sensitive or personal-data value associated with a third-party request in the tested context. Review whether this data flow is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
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
        "CertScore observed a sensitive or high-risk collection surface in the same tested page or flow as third-party tracking or measurement scripts. Review whether the tracking is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
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
        "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and third-party tracking, but does not conclusively establish same-context sensitive payload exposure.",
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
    typeof firstSeenMs === "number" ? `First session replay signal: ${Math.round(firstSeenMs)}ms after scan start` : null,
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
  const signals = uniqueStrings([
    ...rows.flatMap((row) => getStringArray(row, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories",
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ])),
    ...getStringArray(summary, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories",
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ])
  ]);
  const strongCorroboratorObserved =
    Boolean(knownFingerprintLibraryMatch) ||
    entropyTransmissionObserved === true ||
    entropyLinkedToIdentifier === true ||
    (deviceDataLikeRequestCount ?? 0) > 0;

  if (rows.length === 0 && signals.length === 0 && !strongCorroboratorObserved) {
    return null;
  }

  return compactRecord({
    deviceDataLikeRequestCount,
    entropyLinkedToIdentifier,
    entropyTransmissionObserved,
    fingerprintingRuntimeEvidenceCount: rows.length,
    highEntropySignals: compactArray(signals, 8),
    hosts: compactArray(hosts, 5),
    knownFingerprintLibraryMatch,
    strongCorroboratorObserved
  });
}

function deriveSessionReplayFingerprintingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const browserDeviceEntropyEvidence = buildBrowserDeviceEntropyReviewEvidence(input);
  const sessionReplayVendors = getStringArray(sessionReplayEvidence, ["vendors"]);
  const sessionReplayConsentStates = getStringArray(sessionReplayEvidence, ["consentStates"]);
  const sessionReplayPostAcceptObserved = getBoolean(sessionReplayEvidence, ["postAcceptObserved"]) === true;
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
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Observed",
      sessionReplayPostAcceptObserved
        ? "Session replay or behavioral analytics were retained only after a recorded accept/consent state; no pre-consent replay evidence was retained."
        : "Session replay or behavioral analytics were retained in runtime evidence, with no pre-consent replay evidence retained for the tested context.",
      [
        sessionReplayPostAcceptObserved
          ? "Session replay signal observed after consent"
          : "Session replay signal observed; pre-consent replay not retained",
        ...sessionReplayVendors.map((vendor) => `Runtime vendor: ${vendor}`),
        ...(
          sessionReplayConsentStates.length > 0
            ? sessionReplayConsentStates.map((state) => `Consent state: ${state}`)
            : ["Consent timing: no pre-consent replay evidence retained"]
        )
      ],
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
    return makeOutcome(
      "device_identification_fingerprinting_signal_observed",
      "Review signal",
      "Browser/device entropy, fingerprinting, or identifier-like device collection evidence was retained for review.",
      [
        "Fingerprinting or device-identification signal observed",
        ...getStringArray(browserDeviceEntropyEvidence, ["hosts"]).map((host) => `Observed host: ${host}`).slice(0, 3)
      ],
      {
        retainedEvidence: {
          browserDeviceEntropyEvidence,
          fingerprintingObserved: true
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
        "Third-party endpoint inventory was retained, but endpoint jurisdiction or transfer-region evidence was not retained for this scan.",
        [`Third-party endpoint domains observed: ${thirdPartyDomainCount}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "hybridRuntimeEvidence.endpointJurisdictionEvidence",
            "one or more endpoint jurisdiction evidence rows",
            endpointJurisdictionRows.length,
            "Required to evaluate whether observed third-party endpoints create a transfer-region review signal."
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
    deriveAnalyticsVendorObservedOutcome(input),
    deriveRejectPathOutcome(input),
    deriveConsentChoiceQualityOutcome(input),
    derivePostRejectOutcome(input),
    derivePreferenceWithdrawalOutcome(input),
    ...derivePolicyDisclosureOutcomes(input),
    deriveSensitiveSurfaceOutcome(input),
    deriveSessionReplayFingerprintingOutcome(input),
    deriveDeviceFingerprintingSignalOutcome(input),
    deriveEmbeddedThirdPartyContentPreConsentOutcome(input),
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
