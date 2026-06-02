import {
  evaluatePolicyBehaviorContradictionEvidence,
  evaluatePolicyRuntimeAlignmentReviewEvidence,
  getAllowedConflictType,
  getContradictionEvidenceBundle
} from "./contradiction-evidence-contract";
import {
  hasConcreteSanitizedNetworkEvidence
} from "./sanitized-network-evidence";
import { isPromotionGradePreconsentRequestRow } from "./preconsent-public-evidence";

type ContractDecision = {
  allowedNarrativeTier: "weak" | "moderate" | "strong";
  externalSurfacingEligibility: "eligible" | "audit_only" | "suppress";
  negativeEvidenceFlags: string[];
  promotionEligibility: "eligible" | "internal_only" | "blocked";
};

export type ConsentSurfaceDecisionState =
  | "consent_surface_observed"
  | "consent_surface_not_present"
  | "prior_consent_or_suppressed_banner_suspected"
  | "consent_surface_unstable_or_not_evaluable"
  | "reject_present_first_layer"
  | "reject_absent_first_layer";

export type ConsentSurfaceGateDecision = {
  states: ConsentSurfaceDecisionState[];
  consentSurfaceObserved: boolean;
  retainedRejectPathEvidence: boolean;
  rejectAbsentFirstLayer: boolean;
  rejectPresentFirstLayer: boolean;
  stableRenderedState: boolean;
  visibleOrReachableSurface: boolean;
  sameSurfaceCandidates: boolean;
  preChoiceState: boolean;
  hasExplicitPromotionSuppressor: boolean;
  eligibleForConsentUxPromotion: boolean;
  eligibleForRetainedRejectPathPromotion: boolean;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      for (const entry of record[key] as unknown[]) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    } else if (typeof record?.[key] === "string" && String(record[key]).trim().length > 0) {
      values.push(String(record[key]).trim());
    }
  }

  return uniqueStrings(values);
}

function getObjectArrayValues(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: Array<Record<string, unknown>> = [];
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      values.push(
        ...value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      );
    }
  }

  return values;
}

function parseObjectRow(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getObjectArrayValuesFromEvidenceAndEntities(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const entities = getObjectValue(record, ["entities"]);
  const values: Array<Record<string, unknown>> = [];

  for (const key of keys) {
    for (const source of [record, entities]) {
      const value = source?.[key];
      if (!Array.isArray(value)) {
        continue;
      }
      for (const entry of value) {
        const row = parseObjectRow(entry);
        if (row) {
          values.push(row);
        }
      }
    }
  }

  return values;
}

function getObjectValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getNestedObjectValue(record: Record<string, unknown> | null | undefined, paths: string[][]) {
  for (const path of paths) {
    let current: Record<string, unknown> | null | undefined = record;
    for (const key of path) {
      current = getObjectValue(current, [key]);
      if (!current) {
        break;
      }
    }
    if (current) {
      return current;
    }
  }
  return null;
}

function getBooleanFromSources(
  rawEvidence: Record<string, unknown> | null | undefined,
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
) {
  for (const source of [rawEvidence, ...sources]) {
    for (const key of keys) {
      if (typeof source?.[key] === "boolean") {
        return source[key] as boolean;
      }
    }
  }
  return null;
}

function getNumberFromSources(
  rawEvidence: Record<string, unknown> | null | undefined,
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
) {
  for (const source of [rawEvidence, ...sources]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

function getStringFromSources(
  rawEvidence: Record<string, unknown> | null | undefined,
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
) {
  for (const source of [rawEvidence, ...sources]) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

function getStringArrayFromSources(
  rawEvidence: Record<string, unknown> | null | undefined,
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
) {
  return uniqueStrings([rawEvidence, ...sources].flatMap((source) => getStringArrayValues(source, keys)));
}

function hasVisibleButtonCandidate(
  candidates: Array<Record<string, unknown>>,
  pattern: RegExp
) {
  return candidates.some((candidate) => {
    const label = typeof candidate.label === "string"
      ? candidate.label
      : typeof candidate.text === "string"
        ? candidate.text
        : "";
    const visible = candidate.visible === true || candidate.visibility === "visible";
    const interactable =
      candidate.interactable === true ||
      candidate.enabled === true ||
      candidate.clickable === true ||
      candidate.disabled === false;
    return pattern.test(label) && (visible || interactable);
  });
}

function getRejectPathUnavailableClassification(rejectPath: Record<string, unknown> | null | undefined) {
  const classification =
    typeof rejectPath?.rejectPathAvailabilityClassification === "string"
      ? rejectPath.rejectPathAvailabilityClassification
      : typeof rejectPath?.reject_path_availability_classification === "string"
        ? rejectPath.reject_path_availability_classification
        : null;
  const completeRejectPathDetected =
    rejectPath?.completeRejectPathDetected === false ||
    rejectPath?.complete_reject_path_detected === false;
  const completeRejectPathAvailable =
    rejectPath?.completeRejectPathAvailable === false ||
    rejectPath?.complete_reject_path_available === false;
  const rejectEquivalentFound =
    rejectPath?.rejectEquivalentFound === false ||
    rejectPath?.reject_equivalent_found === false;

  return (
    classification === "complete_reject_path_not_detected" ||
    classification === "reject_path_test_failed" ||
    completeRejectPathDetected ||
    completeRejectPathAvailable ||
    rejectEquivalentFound
  );
}

export function evaluateConsentSurfaceGate(
  rawEvidence: Record<string, unknown> | null | undefined
): ConsentSurfaceGateDecision {
  const consentSummary = getObjectValue(rawEvidence, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const consentVisual = getObjectValue(rawEvidence, ["hybridConsentVisual", "hybrid_consent_visual"]);
  const uiSummary = getObjectValue(rawEvidence, ["hybridUiSummary", "hybrid_ui_summary"]);
  const diagnostics = getObjectValue(rawEvidence, ["consentSurfaceDiagnostics", "consent_surface_diagnostics"]);
  const rejectPath = getObjectValue(rawEvidence, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  const consentUiPath =
    getObjectValue(rawEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]) ??
    getNestedObjectValue(rawEvidence, [
      ["hybridRuntimeEvidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consentUiPathEvidence"],
      ["hybrid_runtime_evidence", "consent_ui_path_evidence"]
    ]);
  const sources = [consentSummary, consentVisual, uiSummary, diagnostics, rejectPath, consentUiPath];
  const candidateButtons = [
    ...getObjectArrayValues(rawEvidence, ["candidateButtons", "candidate_buttons", "consentCandidateButtons", "consent_candidate_buttons"]),
    ...getObjectArrayValues(diagnostics, ["candidateButtons", "candidate_buttons", "buttons"]),
    ...getObjectArrayValues(consentSummary, ["candidateButtons", "candidate_buttons", "buttons"])
  ];

  const explicitStates = getStringArrayFromSources(rawEvidence, [diagnostics], [
    "consentSurfaceDecisionStates",
    "consent_surface_decision_states",
    "decisionStates",
    "decision_states",
    "consentSurfaceState",
    "consent_surface_state"
  ]).filter((state): state is ConsentSurfaceDecisionState =>
    [
      "consent_surface_observed",
      "consent_surface_not_present",
      "prior_consent_or_suppressed_banner_suspected",
      "consent_surface_unstable_or_not_evaluable",
      "reject_present_first_layer",
      "reject_absent_first_layer"
    ].includes(state)
  );

  const priorConsentSuspected =
    explicitStates.includes("prior_consent_or_suppressed_banner_suspected") ||
    getBooleanFromSources(rawEvidence, [diagnostics], [
      "priorConsentOrSuppressedBannerSuspected",
      "prior_consent_or_suppressed_banner_suspected",
      "priorConsentDetected",
      "prior_consent_detected",
      "suppressedBannerSuspected",
      "suppressed_banner_suspected",
      "storedConsentStateDetected",
      "stored_consent_state_detected",
      "consentPreferenceStoredBeforeScan",
      "consent_preference_stored_before_scan"
    ]) === true;

  const bannerRendered =
    getBooleanFromSources(rawEvidence, sources, [
      "bannerRendered",
      "banner_rendered",
      "bannerPresent",
      "banner_present",
      "consentSurfaceObserved",
      "consent_surface_observed",
      "cookieBannerPresent",
      "consentBannerPresent"
    ]);
  const consentSurfaceObserved = explicitStates.includes("consent_surface_observed") || bannerRendered === true;
  const explicitNotPresent = explicitStates.includes("consent_surface_not_present") || bannerRendered === false;

  const stableRenderedState =
    getBooleanFromSources(rawEvidence, sources, [
      "stableRenderedState",
      "stable_rendered_state",
      "renderedStateStable",
      "rendered_state_stable",
      "hydrationSettled",
      "hydration_settled",
      "settleWindowCompleted",
      "settle_window_completed"
    ]) === true ||
    getNumberFromSources(rawEvidence, [diagnostics], [
      "hydrationSettleWaitMs",
      "hydration_settle_wait_ms",
      "settleWaitMs",
      "settle_wait_ms"
    ]) !== null;

  const viewportStatus = getStringFromSources(rawEvidence, sources, [
    "viewportStatus",
    "viewport_status",
    "surfaceViewportStatus",
    "surface_viewport_status",
    "scrollReachability",
    "scroll_reachability"
  ]);
  const visibleOrReachableSurface =
    getBooleanFromSources(rawEvidence, sources, [
      "visibleInViewport",
      "visible_in_viewport",
      "bannerVisibleInViewport",
      "banner_visible_in_viewport",
      "reachableViaScroll",
      "reachable_via_scroll",
      "surfaceReachableViaScroll",
      "surface_reachable_via_scroll"
    ]) === true ||
    (viewportStatus !== null && /visible|viewport|reachable|scroll/i.test(viewportStatus));

  const acceptLabels = getStringArrayFromSources(rawEvidence, [consentSummary, diagnostics], [
    "acceptActionLabels",
    "accept_action_labels",
    "acceptLabels",
    "accept_labels"
  ]);
  const rejectLabels = getStringArrayFromSources(rawEvidence, [consentSummary, diagnostics], [
    "rejectActionLabels",
    "reject_action_labels",
    "rejectLabels",
    "reject_labels"
  ]);
  const manageLabels = getStringArrayFromSources(rawEvidence, [consentSummary, diagnostics], [
    "manageActionLabels",
    "manage_action_labels",
    "controlActionLabels",
    "control_action_labels",
    "manageLabels",
    "manage_labels"
  ]);
  const acceptPresent =
    getBooleanFromSources(rawEvidence, [consentSummary], ["acceptPresent", "accept_present"]) === true ||
    acceptLabels.length > 0 ||
    hasVisibleButtonCandidate(candidateButtons, /accept|allow|agree|ok/i);
  const rejectPresentFirstLayer =
    explicitStates.includes("reject_present_first_layer") ||
    getBooleanFromSources(rawEvidence, [consentSummary, rejectPath], [
      "rejectPresent",
      "reject_present",
      "rejectAvailableOnFirstLayer",
      "reject_available_on_first_layer"
    ]) === true ||
    rejectLabels.length > 0 ||
    hasVisibleButtonCandidate(candidateButtons, /reject|decline|deny|refuse/i);
  const managePresent =
    getBooleanFromSources(rawEvidence, [consentSummary], ["managePresent", "manage_present"]) === true ||
    manageLabels.length > 0 ||
    hasVisibleButtonCandidate(candidateButtons, /manage|settings|preferences|customi[sz]e|options|control/i);
  const acceptClickDepth = getNumberFromSources(rawEvidence, [rejectPath], [
    "acceptClickDepth",
    "accept_click_depth"
  ]);
  const rejectClickDepth = getNumberFromSources(rawEvidence, [rejectPath], [
    "rejectClickDepth",
    "reject_click_depth",
    "depth"
  ]);
  const preferencesRequiredBeforeReject =
    getBooleanFromSources(rawEvidence, [rejectPath], [
      "preferencesRequiredBeforeReject",
      "preferences_required_before_reject"
    ]) === true;
  const rejectAvailableOnFirstLayer =
    getBooleanFromSources(rawEvidence, [rejectPath], [
      "rejectAvailableOnFirstLayer",
      "reject_available_on_first_layer"
    ]);
  const layerInspected = typeof consentUiPath?.layerInspected === "string"
    ? consentUiPath.layerInspected
    : typeof consentUiPath?.layer_inspected === "string"
      ? consentUiPath.layer_inspected
      : null;
  const retainedRejectPathEvidence =
    consentSurfaceObserved &&
    (
      acceptClickDepth !== null ||
      rejectClickDepth !== null ||
      preferencesRequiredBeforeReject ||
      getRejectPathUnavailableClassification(rejectPath) ||
      layerInspected === "first_layer" ||
      layerInspected === "deeper_layer" ||
      rejectPath?.bannerLayerInspected === true ||
      rejectPath?.banner_layer_inspected === true ||
      rejectPath?.rejectPathTested === true ||
      rejectPath?.reject_path_tested === true
    );
  const retainedRejectPathShowsRejectAbsent =
    retainedRejectPathEvidence &&
    (
      rejectAvailableOnFirstLayer === false ||
      preferencesRequiredBeforeReject ||
      getRejectPathUnavailableClassification(rejectPath) ||
      layerInspected === "deeper_layer" ||
      (acceptClickDepth !== null && rejectClickDepth !== null && rejectClickDepth > acceptClickDepth)
    );
  const sameSurfaceCandidates =
    getBooleanFromSources(rawEvidence, [diagnostics, rejectPath], [
      "sameSurfaceCandidates",
      "same_surface_candidates",
      "candidateButtonsSameSurface",
      "candidate_buttons_same_surface",
      "bannerLayerInspected",
      "banner_layer_inspected"
    ]) === true ||
    retainedRejectPathEvidence ||
    (acceptPresent && (rejectPresentFirstLayer || managePresent || candidateButtons.length > 0));

  const preChoiceState =
    !priorConsentSuspected &&
    getBooleanFromSources(rawEvidence, [diagnostics], [
      "preChoiceState",
      "pre_choice_state",
      "scanInPreChoiceState",
      "scan_in_pre_choice_state"
    ]) !== false &&
    getBooleanFromSources(rawEvidence, [diagnostics], [
      "consentChoicePreviouslyStored",
      "consent_choice_previously_stored",
      "previouslyConsented",
      "previously_consented"
    ]) !== true;

  const unstableOrNotEvaluable =
    explicitStates.includes("consent_surface_unstable_or_not_evaluable") ||
    (
      consentSurfaceObserved &&
      !retainedRejectPathEvidence &&
      (!stableRenderedState || !visibleOrReachableSurface || !sameSurfaceCandidates)
    );
  const rejectAbsentFirstLayer =
    explicitStates.includes("reject_absent_first_layer") ||
    retainedRejectPathShowsRejectAbsent ||
    (
      consentSurfaceObserved &&
      stableRenderedState &&
      sameSurfaceCandidates &&
      acceptPresent &&
      !rejectPresentFirstLayer &&
      (
        getBooleanFromSources(rawEvidence, [consentSummary, consentVisual], [
          "rejectPresent",
          "reject_present"
        ]) === false ||
        getBooleanFromSources(rawEvidence, [rejectPath], [
          "rejectAvailableOnFirstLayer",
          "reject_available_on_first_layer"
        ]) === false ||
        rawEvidence?.reject_button_missing === true ||
        rawEvidence?.accept_only_banner === true ||
        consentVisual?.acceptOnly === true ||
        consentVisual?.accept_only === true ||
        consentVisual?.rejectHidden === true ||
        consentVisual?.reject_hidden === true ||
        consentSummary?.rejectDepthClass === "absent" ||
        consentSummary?.reject_depth_class === "absent"
      )
    );
  const hasExplicitPromotionSuppressor =
    explicitNotPresent ||
    priorConsentSuspected ||
    rejectPresentFirstLayer ||
    explicitStates.includes("consent_surface_unstable_or_not_evaluable");
  const eligibleForRetainedRejectPathPromotion =
    consentSurfaceObserved &&
    retainedRejectPathEvidence &&
    retainedRejectPathShowsRejectAbsent &&
    sameSurfaceCandidates &&
    preChoiceState &&
    !hasExplicitPromotionSuppressor;

  const states: ConsentSurfaceDecisionState[] = uniqueStrings([
    ...explicitStates,
    priorConsentSuspected ? "prior_consent_or_suppressed_banner_suspected" : null,
    consentSurfaceObserved ? "consent_surface_observed" : explicitNotPresent ? "consent_surface_not_present" : null,
    unstableOrNotEvaluable ? "consent_surface_unstable_or_not_evaluable" : null,
    rejectPresentFirstLayer ? "reject_present_first_layer" : rejectAbsentFirstLayer ? "reject_absent_first_layer" : null
  ]) as ConsentSurfaceDecisionState[];

  return {
    states,
    consentSurfaceObserved,
    retainedRejectPathEvidence,
    rejectAbsentFirstLayer,
    rejectPresentFirstLayer,
    stableRenderedState,
    visibleOrReachableSurface,
    sameSurfaceCandidates,
    preChoiceState,
    hasExplicitPromotionSuppressor,
    eligibleForConsentUxPromotion:
      consentSurfaceObserved &&
      stableRenderedState &&
      visibleOrReachableSurface &&
      sameSurfaceCandidates &&
      preChoiceState &&
      rejectAbsentFirstLayer &&
      !rejectPresentFirstLayer &&
      !priorConsentSuspected &&
      !unstableOrNotEvaluable,
    eligibleForRetainedRejectPathPromotion
  };
}

export function consentSurfaceGateAllowsConsentUxPromotion(gate: ConsentSurfaceGateDecision) {
  return gate.eligibleForConsentUxPromotion || gate.eligibleForRetainedRejectPathPromotion;
}

function getStringArrayValuesFromEvidenceAndEntities(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return uniqueStrings([
    ...getStringArrayValues(record, keys),
    ...getStringArrayValues(getObjectValue(record, ["entities"]), keys)
  ]);
}

function classifyCookieNameForPromotion(name: string) {
  const normalized = name.toLowerCase();
  if (/(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id|^_ali_s_|^yandex|^yuid|^cna$|^sca$)/i.test(normalized)) {
    return "analytics";
  }
  if (/(^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|doubleclick|criteo|cto_bundle|_mkto_trk|muid|fr\b|demdex|dpm\.demdex|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check|pubmatic|krtbcookie|pugt|spugt|bidswitch|tuuid|id5|casalemedia|cmid|cmps|cmpro|gumgum|3lift|tluid|tapad|adsrvr|tdid|rubiconproject|openx|scorecardresearch|quantserve|crwdcntrl|panoramaid|_pubcid|^yabs|^sync_cookie_csrf$|^ftid$|^bh$|^ad-privacy$)/i.test(normalized)) {
    return "advertising";
  }
  if (/(qsi_replaysession|qualtrics|siteintercept|hotjar|fullstory|clarity|contentsquare|mouseflow)/i.test(normalized)) {
    return "session_replay";
  }
  return "unknown";
}

function isPromotionGradeCookieCategory(value: string | null | undefined) {
  return Boolean(value && /analytics|advertising|marketing|retargeting|session_replay|personalization/i.test(value));
}

export type PreConsentCookieEvidenceDiagnostic =
  | "no_cookies_observed"
  | "cookies_observed_not_classified"
  | "cookies_observed_without_preconsent_phase"
  | "preconsent_cookies_suppressed_by_contract"
  | "preconsent_cookie_evidence_retained";

export function diagnosePreConsentCookieEvidence(rawEvidence: Record<string, unknown> | null | undefined): PreConsentCookieEvidenceDiagnostic {
  const initialCookieCount = getNumberValue(rawEvidence, ["initialCookieCount", "initial_cookie_count"]) ?? 0;
  const baselineCookieCount = getNumberValue(rawEvidence, ["consentBaselineCookieCount", "consent_baseline_cookie_count"]) ?? 0;
  const preconsentCookieCount =
    getNumberValue(rawEvidence, ["preconsentCookieCount", "preconsent_cookie_count", "consentPreconsentViolationCount", "consent_preconsent_violation_count"]) ?? 0;
  const cookieNames = getStringArrayValues(rawEvidence, [
    "preconsentCookieNames",
    "preconsent_cookie_names",
    "initialCookieNames",
    "initial_cookie_names",
    "consentBaselineCookieNames",
    "consent_baseline_cookie_names"
  ]);
  const cookieCategories = getStringArrayValues(rawEvidence, [
    "preconsentCookieCategories",
    "preconsent_cookie_categories",
    "preconsentNonessentialCookieCategories",
    "preconsent_nonessential_cookie_categories"
  ]);
  const hasPreconsentTiming =
    getNumberValue(rawEvidence, ["firstConsentActionMs", "first_consent_action_ms"]) !== null ||
    getNumberValue(rawEvidence, ["firstCmpVisibleMs", "first_cmp_visible_ms"]) !== null ||
    getNumberValue(getObjectValue(rawEvidence, ["consentTimeline", "consent_timeline"]), ["firstConsentActionMs", "first_consent_action_ms"]) !== null ||
    getNumberValue(getObjectValue(rawEvidence, ["consentTimeline", "consent_timeline"]), ["firstCmpVisibleMs", "first_cmp_visible_ms"]) !== null;
  const observedCookieCount = Math.max(initialCookieCount, baselineCookieCount, preconsentCookieCount, cookieNames.length);

  if (observedCookieCount === 0) {
    return "no_cookies_observed";
  }
  if (cookieCategories.length === 0 && cookieNames.length === 0) {
    return "cookies_observed_not_classified";
  }
  if (!hasPreconsentTiming && preconsentCookieCount === 0) {
    return "cookies_observed_without_preconsent_phase";
  }
  if (!cookieCategories.some(isPromotionGradeCookieCategory)) {
    return "preconsent_cookies_suppressed_by_contract";
  }
  return "preconsent_cookie_evidence_retained";
}

function isConcreteHttpEvidenceUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname.includes(".") &&
      !parsed.hostname.includes("_")
    );
  } catch {
    return false;
  }
}

function getEtldPlusOneFromHostname(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  const parts = hostname
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(-2).join(".");
}

function getRuntimeEvidenceHostname(row: { requestUrl?: unknown; vendorHost?: unknown }) {
  const vendorHost = typeof row.vendorHost === "string" ? row.vendorHost.trim().toLowerCase() : "";
  if (vendorHost.includes(".")) {
    return vendorHost;
  }

  if (typeof row.requestUrl !== "string") {
    return "";
  }

  try {
    return new URL(row.requestUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSessionReplayRuntimeHost(hostname: string) {
  return /(?:^|\.)((?:fullstory|hotjar|contentsquare|mouseflow|smartlook|logrocket|sessioncam|quantummetric|glassbox|clarity|qualtrics|decibelinsight)\.(?:com|io|net|co)|clarity\.ms)$/i.test(
    hostname
  );
}

function isTrackingRuntimeHost(hostname: string) {
  return (
    isSessionReplayRuntimeHost(hostname) ||
    /(?:doubleclick|googletagmanager|google-analytics|analytics\.google|googleadservices|facebook|connect\.facebook|linkedin|adsrvr|adnxs|criteo|demdex|rubiconproject|pubmatic|openx|taboola|outbrain|bing|bat\.bing|intellimize|optimizely|segment|amplitude|mixpanel|posthog)/i.test(
      hostname
    )
  );
}

function getSensitivePayloadRows(rawEvidence: Record<string, unknown> | null | undefined) {
  const rows = Array.isArray(rawEvidence?.sensitivePayloadViolations)
    ? rawEvidence.sensitivePayloadViolations
    : Array.isArray(rawEvidence?.sensitive_payload_violations)
      ? rawEvidence.sensitive_payload_violations
      : [];

  return rows.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object");
}

function hasSensitivePayloadRequestArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return getSensitivePayloadRows(rawEvidence).some((row) => {
    if (row.evidenceStrength === "detector_only") {
      return false;
    }

    const requestUrl = typeof row.requestUrl === "string" ? row.requestUrl : "";
    if (!/^https?:\/\//i.test(requestUrl)) {
      return false;
    }

    return (
      (typeof row.detectedType === "string" && row.detectedType.trim().length > 0) ||
      (typeof row.sourceField === "string" && row.sourceField.trim().length > 0) ||
      (typeof row.matchSnippet === "string" && row.matchSnippet.trim().length > 0)
    );
  });
}

function getStringArrayEvidence(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function hasRetainedSessionReplayRuntimeArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  if (rawEvidence.session_replay_runtime_detected === true || rawEvidence.sessionReplayRuntimeDetected === true) {
    return true;
  }
  if (rawEvidence.session_replay_vendor_artifact_present === true || rawEvidence.sessionReplayVendorArtifactPresent === true) {
    return true;
  }

  const artifacts = [
    ...getStringArrayEvidence(rawEvidence.session_replay_runtime_artifacts),
    ...getStringArrayEvidence(rawEvidence.sessionReplayRuntimeArtifacts),
    ...getStringArrayEvidence(rawEvidence.runtimeEvidenceArtifacts)
  ];
  if (artifacts.some((value) => /session_replay|session replay|fullstory|hotjar|clarity|contentsquare|mouseflow|logrocket/i.test(value))) {
    return true;
  }

  const vendors = [
    ...getStringArrayEvidence(rawEvidence.session_replay_runtime_vendors),
    ...getStringArrayEvidence(rawEvidence.sessionReplayRuntimeVendors),
    ...getStringArrayEvidence(rawEvidence.runtimeVendors)
  ];
  if (vendors.some((value) => /fullstory|hotjar|clarity|contentsquare|mouseflow|smartlook|logrocket|sessioncam|quantummetric|glassbox|qualtrics/i.test(value))) {
    return true;
  }

  const requestUrls = [
    ...getStringArrayEvidence(rawEvidence.session_replay_request_urls),
    ...getStringArrayEvidence(rawEvidence.sessionReplayRequestUrls),
    ...getStringArrayEvidence(rawEvidence.runtimeRequestUrls),
    ...getStringArrayEvidence(rawEvidence.runtime_request_urls)
  ];
  return requestUrls.some((value) => isSessionReplayRuntimeHost(getRuntimeEvidenceHostname({ requestUrl: value })));
}

function collectUrlEtldPlusOne(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const output = new Set<string>();
  const inspect = (candidate: string) => {
    try {
      const parsed = new URL(candidate);
      const etld = getEtldPlusOneFromHostname(parsed.hostname);
      if (etld) {
        output.add(etld);
      }
      for (const nestedValue of parsed.searchParams.values()) {
        if (/^https?:\/\//i.test(nestedValue)) {
          inspect(nestedValue);
        }
      }
    } catch {
      // Ignore malformed or redacted URL fragments.
    }
  };

  inspect(value);
  return [...output];
}

export type RtbCookieSyncEvidenceSubtype =
  | "identifier_query_sync"
  | "redirect_chain_sync"
  | "known_sync_endpoint"
  | "sync_path_only";

export type RtbCookieSyncEvidenceClassification = {
  row: Record<string, unknown>;
  subtype: RtbCookieSyncEvidenceSubtype;
  hostname: string;
  redirectTargetHost: string | null;
  queryKeys: string[];
  vendor: string | null;
  independentKey: string;
};

const RTB_IDENTIFIER_QUERY_KEY_PATTERN =
  /^(?:uid|uuid|guid|id|userid|user_id|partner|partnerid|uid2|euid|id5id|tdid|dclid|li_fat_id|fbclid|gclid|msclkid|redir|redirect)$/i;

const RTB_WEAK_CONTEXT_QUERY_KEY_PATTERN = /^(?:gdpr|gdpr_consent|us_privacy|gpp|gpp_sid)$/i;

function getRecordStringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function getRoughRegistrableDomain(hostname: string) {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return hostname.toLowerCase();
  }
  return parts.slice(-2).join(".");
}

function getKnownRtbSyncVendor(hostname: string, pathSample: string, urlSample: string) {
  const text = `${hostname} ${pathSample} ${urlSample}`.toLowerCase();
  if (/trafficjunky\.com/.test(text) && /idsync/.test(text)) {
    return "TrafficJunky";
  }
  return null;
}

export function classifyRtbCookieSyncEvidenceRow(row: Record<string, unknown>): RtbCookieSyncEvidenceClassification | null {
  const hostname = typeof row.hostname === "string" ? row.hostname.trim() : "";
  const pathSample = getRecordStringValue(row, ["pathSample", "path_sample"]);
  const urlSample = getRecordStringValue(row, ["urlSample", "url_sample", "requestUrl", "request_url"]);
  const reason = getRecordStringValue(row, ["reason"]);
  const category = getRecordStringValue(row, ["category", "destinationCategory", "destination_category"]);
  const vendor =
    getRecordStringValue(row, ["vendor", "vendorName", "vendor_name"]) ||
    getKnownRtbSyncVendor(hostname, pathSample, urlSample);
  const redirectTargetHost = getRecordStringValue(row, [
    "redirectTargetHost",
    "redirect_target_host",
    "redirectHostname",
    "redirect_hostname"
  ]) || null;
  const queryKeys = [
    ...getStringArrayValues(row, ["queryKeysSample", "query_keys_sample", "parameterKeys", "parameter_keys"])
  ];
  const syncEndpointPathShape =
    /(?:^|\/)(?:idsync|sync|usersync|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*|tap\.php|cmf)(?:\/|$|[?_])|(?:^|\/)match(?:\/|$|[?_])/i.test(
      pathSample
    );
  const hasSyncPattern =
    /sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid/i.test(`${hostname} ${urlSample}`) ||
    syncEndpointPathShape ||
    /redirect_sync|identifier_query|known_sync_host/i.test(reason);
  if (!hostname.includes(".") || !hasSyncPattern) {
    return null;
  }

  const hasStrongIdHints = queryKeys.some((key) => RTB_IDENTIFIER_QUERY_KEY_PATTERN.test(key));
  const hasOnlyWeakContextKeys = queryKeys.length > 0 && queryKeys.every((key) => RTB_WEAK_CONTEXT_QUERY_KEY_PATTERN.test(key));
  const hostnameEtld = getRoughRegistrableDomain(hostname);
  const redirectEtld = redirectTargetHost ? getRoughRegistrableDomain(redirectTargetHost) : null;
  const hasCrossDomainRedirect = Boolean(redirectEtld && redirectEtld !== hostnameEtld);
  const knownEndpointShape =
    syncEndpointPathShape ||
    /identifier_query/i.test(reason);
  const categorySupportsSync = /rtb|identity|ad|advertis/i.test(category);

  let subtype: RtbCookieSyncEvidenceSubtype | null = null;
  if (hasStrongIdHints && !hasOnlyWeakContextKeys) {
    subtype = "identifier_query_sync";
  } else if (hasCrossDomainRedirect && /redirect|sync|match|idsync|tap|getuid/i.test(`${pathSample} ${reason}`)) {
    subtype = "redirect_chain_sync";
  } else if (knownEndpointShape && (categorySupportsSync || /known_sync_(?:host|endpoint)|identifier_query/i.test(reason))) {
    subtype = "known_sync_endpoint";
  } else if (syncEndpointPathShape || /redirect_sync/i.test(reason)) {
    subtype = "sync_path_only";
  }

  if (!subtype) {
    return null;
  }

  return {
    row,
    subtype,
    hostname,
    redirectTargetHost,
    queryKeys,
    vendor,
    independentKey: vendor ?? hostnameEtld
  };
}

export function classifyRtbCookieSyncEvidenceRows(rows: Array<Record<string, unknown>>) {
  return rows.flatMap((row) => {
    const classification = classifyRtbCookieSyncEvidenceRow(row);
    return classification ? [classification] : [];
  });
}

export function hasProjectableRtbCookieSyncEvidenceRows(rows: Array<Record<string, unknown>>) {
  const classifications = classifyRtbCookieSyncEvidenceRows(rows);
  if (classifications.some((classification) => classification.subtype !== "sync_path_only")) {
    return true;
  }

  const weakIndependentKeys = uniqueStrings(
    classifications
      .filter((classification) => classification.subtype === "sync_path_only")
      .map((classification) => classification.independentKey)
  );
  return weakIndependentKeys.length >= 2;
}

export function hasConcreteRtbCookieSyncEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const rows = getObjectArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "rtbCookieSyncObservations",
    "rtb_cookie_sync_observations",
    "rtb_cookie_sync_evidence",
    "rtbCookieSyncEvidence"
  ]);
  if (hasProjectableRtbCookieSyncEvidenceRows(rows)) {
    return true;
  }

  const urls = getStringArrayValues(rawEvidence, ["runtimeRequestUrls", "requestUrls", "sourceUrls"]).filter(isConcreteHttpEvidenceUrl);
  return urls.some((url) => {
    try {
      const parsed = new URL(url);
      const text = `${parsed.hostname} ${parsed.pathname}`;
      return /sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid/i.test(text) &&
        [...parsed.searchParams.keys()].some((key) => RTB_IDENTIFIER_QUERY_KEY_PATTERN.test(key));
    } catch {
      return false;
    }
  });
}

function hasConcreteCrossDomainIdentifierSharingRow(row: Record<string, unknown>) {
  const requestUrl = typeof row.requestUrlRedacted === "string"
    ? row.requestUrlRedacted
    : typeof row.request_url_redacted === "string"
      ? row.request_url_redacted
      : "";
  const key = typeof row.key === "string" ? row.key.trim() : "";
  const valueHash = typeof row.valueHash === "string"
    ? row.valueHash
    : typeof row.value_hash === "string"
      ? row.value_hash
      : "";
  const destinationEtld = typeof row.destinationEtldPlusOne === "string"
    ? row.destinationEtldPlusOne
    : typeof row.destination_etld_plus_one === "string"
      ? row.destination_etld_plus_one
      : "";
  const destinationDomain = typeof row.destinationDomain === "string"
    ? row.destinationDomain
    : typeof row.destination_domain === "string"
      ? row.destination_domain
      : "";
  const repeatedAcrossEtlds = getStringArrayValues(row, ["repeatedAcrossEtlds", "repeated_across_etlds"]);
  const sourcePageUrl = typeof row.sourcePageUrl === "string"
    ? row.sourcePageUrl
    : typeof row.source_page_url === "string"
      ? row.source_page_url
      : "";
  const involvedEtlds = uniqueStrings([
    destinationEtld,
    ...repeatedAcrossEtlds,
    ...collectUrlEtldPlusOne(sourcePageUrl),
    ...collectUrlEtldPlusOne(requestUrl)
  ]);
  const destinationClassification = typeof row.destinationClassification === "string"
    ? row.destinationClassification
    : typeof row.destination_classification === "string"
      ? row.destination_classification
      : "";
  const identifierClass = typeof row.identifierClass === "string"
    ? row.identifierClass
    : typeof row.identifier_class === "string"
      ? row.identifier_class
      : "";
  const hasPromotionVendor =
    /adtech|affiliate|analytics|identity_graph|rtb|marketing/i.test(destinationClassification) ||
    /(?:mobilefuse|undertone|bidswitch|adnxs|rlcdn|criteo|rubiconproject|pubmatic|openx|casalemedia|adsrvr|yahoo|ay\.delivery)\./i.test(
      `${destinationDomain} ${destinationEtld}`
    ) ||
    involvedEtlds.some((etld) => /(?:casalemedia|ay\.delivery|yahoo|bidswitch|mobilefuse|undertone)\.com|ay\.delivery/i.test(etld));
  const hasDurableIdentifier = /durable_id|cookie_id|affiliate_click_id|session_id|unknown_identifier/i.test(identifierClass);
  const knownSyncDestination = /(?:taboola|adnxs|demdex|id5-sync|id5|liveramp|pubmatic|rlcdn|rubiconproject|openx|adsrvr|3lift|crwdcntrl)(?:\.|$)/i.test(
    `${destinationDomain} ${destinationEtld} ${requestUrl}`
  );
  const namedIdentitySyncKey = /^(?:partner_?id|uid2|euid|id5id|tdid)$/i.test(key);
  const isStrongSingleDestinationIdentitySync =
    (/^(?:rtb|identity_graph)$/i.test(destinationClassification) ||
      /(?:identity|id5|demdex|rlcdn|liveramp|uidapi|crwdcntrl|adnxs|pubmatic|openx|rubicon|bidswitch|casalemedia|adsrvr)/i.test(
        `${destinationDomain} ${destinationEtld}`
      )) &&
    /^(?:durable_id|cookie_id)$/i.test(identifierClass) &&
    /^(?:uid|uuid|user_?id|visitor_?id|external_?id|identity|guid|sync_?id|match_?id|partner_?(?:uid|id)|buyeruid|bkuid|d_uuid|uid2|euid|id5id|tdid)$/i.test(key) &&
    ((knownSyncDestination && namedIdentitySyncKey) ||
      /(?:^|\/|[-_:])(?:sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*)(?:\/|[-_:]|[?#&]|$)|\/tap\.php$|\/track\/cmf(?:\/|$)|\/ibs:dpid/i.test(
        requestUrl
      ));
  return (
    key.length > 0 &&
    /^[a-f0-9]{32,}$/i.test(valueHash) &&
    destinationEtld.includes(".") &&
    (involvedEtlds.length >= 2 || isStrongSingleDestinationIdentitySync) &&
    hasPromotionVendor &&
    hasDurableIdentifier &&
    (requestUrl.includes("[redacted]") || requestUrl.includes("%5Bredacted%5D"))
  );
}

export function hasConcreteCrossDomainIdentifierSharingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const rows = getObjectArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "crossDomainIdentifierSharingEvidence",
    "cross_domain_identifier_sharing_evidence"
  ]);
  if (!rows.some(hasConcreteCrossDomainIdentifierSharingRow)) {
    return false;
  }

  const categories = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "crossDomainIdentifierSharingDestinationCategories",
    "cross_domain_identifier_sharing_destination_categories"
  ]);
  const destinationEtlds = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "crossDomainIdentifierSharingDestinationEtlds",
    "cross_domain_identifier_sharing_destination_etlds"
  ]);
  const rowEtlds = uniqueStrings(
    rows.flatMap((row) => [
      typeof row.destinationEtldPlusOne === "string" ? row.destinationEtldPlusOne : null,
      typeof row.destination_etld_plus_one === "string" ? row.destination_etld_plus_one : null,
      ...getStringArrayValues(row, ["repeatedAcrossEtlds", "repeated_across_etlds"]),
      ...collectUrlEtldPlusOne(typeof row.sourcePageUrl === "string" ? row.sourcePageUrl : typeof row.source_page_url === "string" ? row.source_page_url : null),
      ...collectUrlEtldPlusOne(typeof row.requestUrlRedacted === "string" ? row.requestUrlRedacted : typeof row.request_url_redacted === "string" ? row.request_url_redacted : null)
    ])
  );
  const hasStrongSingleDestinationIdentitySync = rows.some((row) => {
    const requestUrl = typeof row.requestUrlRedacted === "string"
      ? row.requestUrlRedacted
      : typeof row.request_url_redacted === "string"
        ? row.request_url_redacted
        : "";
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const destinationClassification = typeof row.destinationClassification === "string"
      ? row.destinationClassification
      : typeof row.destination_classification === "string"
        ? row.destination_classification
        : "";
    const destinationDomain = typeof row.destinationDomain === "string"
      ? row.destinationDomain
      : typeof row.destination_domain === "string"
        ? row.destination_domain
        : "";
    const destinationEtld = typeof row.destinationEtldPlusOne === "string"
      ? row.destinationEtldPlusOne
      : typeof row.destination_etld_plus_one === "string"
        ? row.destination_etld_plus_one
        : "";
    const identifierClass = typeof row.identifierClass === "string"
      ? row.identifierClass
      : typeof row.identifier_class === "string"
        ? row.identifier_class
        : "";
    const knownSyncDestination = /(?:taboola|adnxs|demdex|id5-sync|id5|liveramp|pubmatic|rlcdn|rubiconproject|openx|adsrvr|3lift|crwdcntrl)(?:\.|$)/i.test(
      `${destinationDomain} ${destinationEtld} ${requestUrl}`
    );
    const namedIdentitySyncKey = /^(?:partner_?id|uid2|euid|id5id|tdid)$/i.test(key);
    return (
      (/^(?:rtb|identity_graph)$/i.test(destinationClassification) ||
        /(?:identity|id5|demdex|rlcdn|liveramp|uidapi|crwdcntrl|adnxs|pubmatic|openx|rubicon|bidswitch|casalemedia|adsrvr)/i.test(
          `${destinationDomain} ${destinationEtld}`
        )) &&
      /^(?:durable_id|cookie_id)$/i.test(identifierClass) &&
      /^(?:uid|uuid|user_?id|visitor_?id|external_?id|identity|guid|sync_?id|match_?id|partner_?(?:uid|id)|buyeruid|bkuid|d_uuid|uid2|euid|id5id|tdid)$/i.test(key) &&
      ((knownSyncDestination && namedIdentitySyncKey) ||
        /(?:^|\/|[-_:])(?:sync|idsync|match|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*)(?:\/|[-_:]|[?#&]|$)|\/tap\.php$|\/track\/cmf(?:\/|$)|\/ibs:dpid/i.test(
          requestUrl
        ))
    );
  });
  return (
    (uniqueStrings([...destinationEtlds, ...rowEtlds]).length >= 2 || hasStrongSingleDestinationIdentitySync) &&
    (
      categories.some((category) => /adtech|affiliate|analytics|identity_graph|rtb|marketing/i.test(category)) ||
      rowEtlds.some((etld) => /(?:casalemedia|ay\.delivery|yahoo|bidswitch|mobilefuse|undertone)\.com|ay\.delivery/i.test(etld))
    )
  );
}

function hasPromotionGradePreconsentCookieEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const cookieRows = getObjectArrayValuesFromEvidenceAndEntities(rawEvidence, ["preconsent_cookie_evidence", "preconsentCookieEvidence"]);
  const promotionGradeRows = cookieRows.filter((row) => {
    const timingEvidence = typeof row.timingEvidence === "string" ? row.timingEvidence : typeof row.timing_evidence === "string" ? row.timing_evidence : null;
    const party = typeof row.party === "string" ? row.party : typeof row.cookiePartyType === "string" ? row.cookiePartyType : typeof row.cookie_party_type === "string" ? row.cookie_party_type : null;
    const thirdParty = row.thirdParty === true || row.third_party === true || party === "third_party";
    const category =
      typeof row.category === "string"
        ? row.category
        : typeof row.cookieCategory === "string"
          ? row.cookieCategory
          : typeof row.cookie_category === "string"
            ? row.cookie_category
            : typeof row.vendorCategory === "string"
              ? row.vendorCategory
              : typeof row.vendor_category === "string"
                ? row.vendor_category
                : null;
    const cookieName = typeof row.cookieName === "string" ? row.cookieName : typeof row.cookie_name === "string" ? row.cookie_name : null;
    const inferredCategory = cookieName ? classifyCookieNameForPromotion(cookieName) : "unknown";
    const promotionCategory = isPromotionGradeCookieCategory(category) || isPromotionGradeCookieCategory(inferredCategory);
    const firstPartyTrackingCookie =
      party === "first_party" &&
      (isPromotionGradeCookieCategory(category) || isPromotionGradeCookieCategory(inferredCategory));
    const nonEssential = row.nonEssential === true || row.non_essential === true || promotionCategory;
    const beforeConsent =
      timingEvidence === "before_consent_cookie_write" ||
      timingEvidence === "initial_cookie_snapshot_with_visible_cmp" ||
      (timingEvidence === null && row.beforeConsent === true) ||
      (timingEvidence === null && row.before_consent === true);
    const namedEvidence = Boolean(cookieName);
    return (thirdParty || firstPartyTrackingCookie) && promotionCategory && nonEssential && beforeConsent && namedEvidence;
  });
  return promotionGradeRows.length > 0;
}

function collectStrings(value: unknown, acc: string[], depth = 0) {
  if (depth > 3 || acc.length >= 80) {
    return;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    acc.push(value.trim());
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, acc, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, acc, depth + 1);
    }
  }
}

function hasBlockingContradictionMetaSignal(rawEvidence: Record<string, unknown> | null | undefined) {
  const strings: string[] = [];
  collectStrings(rawEvidence, strings);
  return strings.some((value) =>
    /insufficient policy content fetched|insufficient policy content|model suspicion|possible mismatch only|semantic review incomplete/i.test(
      value
    )
  );
}

function getPreconsentClassifiedNonEssentialRequests(rawEvidence: Record<string, unknown> | null | undefined, input: { minConfidence?: number } = {}) {
  return getObjectArrayValues(rawEvidence, [
    "requestPurposeClassificationConfidence",
    "request_purpose_classification_confidence"
  ]).filter((row) => {
    if (!isPromotionGradePreconsentRequestRow(row)) {
      return false;
    }
    if (typeof input.minConfidence !== "number") {
      return true;
    }
    const confidence =
      typeof row.confidence === "number"
        ? row.confidence
        : typeof row.score === "number"
          ? row.score
          : null;
    return confidence === null || confidence >= input.minConfidence;
  });
}

export function hasConcretePreconsentArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);
  const classifiedNonEssentialRequests = getPreconsentClassifiedNonEssentialRequests(rawEvidence);

  return (
    vendors.length > 0 ||
    urls.length > 0 ||
    classifiedNonEssentialRequests.length > 0 ||
    hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" })
  );
}

export function hasStrongPreconsentRuntimeEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_vendors",
    "relatedVendors",
    "runtimeVendors",
    "runtime_vendors"
  ]);
  const urls = getStringArrayValuesFromEvidenceAndEntities(rawEvidence, [
    "preconsent_tracker_evidence_urls",
    "requestUrls",
    "runtimeRequestUrls",
    "runtime_request_urls",
    "runtimeEvidenceUrls",
    "runtime_evidence_urls",
    "sourceUrls"
  ]).filter(isConcreteHttpEvidenceUrl);
  const classifiedNonEssentialRequests = getPreconsentClassifiedNonEssentialRequests(rawEvidence, { minConfidence: 0.7 });

  return (
    hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
    (
      classifiedNonEssentialRequests.length > 0 &&
      hasPreconsentSequenceEvidence(rawEvidence)
    )
  );
}

export function hasPreconsentSequenceEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  if (hasPromotionGradePreconsentCookieEvidence(rawEvidence)) {
    return true;
  }

  const timeline = getObjectValue(rawEvidence, ["consentTimeline", "consent_timeline"]);
  if (!timeline) {
    return false;
  }

  const firstNonEssentialRequestMs = typeof timeline?.firstNonEssentialRequestMs === "number"
    ? timeline.firstNonEssentialRequestMs
    : typeof timeline?.first_non_essential_request_ms === "number"
      ? timeline.first_non_essential_request_ms
      : null;
  const firstTrackingCookieSetMs = typeof timeline?.firstTrackingCookieSetMs === "number"
    ? timeline.firstTrackingCookieSetMs
    : typeof timeline?.first_tracking_cookie_set_ms === "number"
      ? timeline.first_tracking_cookie_set_ms
      : null;
  const firstCmpVisibleMs = typeof timeline?.firstCmpVisibleMs === "number"
    ? timeline.firstCmpVisibleMs
    : typeof timeline?.first_cmp_visible_ms === "number"
      ? timeline.first_cmp_visible_ms
      : null;
  const firstConsentActionMs = typeof timeline?.firstConsentActionMs === "number"
    ? timeline.firstConsentActionMs
    : typeof timeline?.first_consent_action_ms === "number"
      ? timeline.first_consent_action_ms
      : null;
  const firstRejectActionMs = typeof timeline?.firstRejectActionMs === "number"
    ? timeline.firstRejectActionMs
    : typeof timeline?.first_reject_action_ms === "number"
      ? timeline.first_reject_action_ms
      : null;
  const firstAcceptActionMs = typeof timeline?.firstAcceptActionMs === "number"
    ? timeline.firstAcceptActionMs
    : typeof timeline?.first_accept_action_ms === "number"
      ? timeline.first_accept_action_ms
      : null;
  const firstUserActionMs = typeof timeline?.firstUserActionMs === "number"
    ? timeline.firstUserActionMs
    : typeof timeline?.first_user_action_ms === "number"
      ? timeline.first_user_action_ms
      : null;
  const consentSurfaceObserved =
    getBooleanValue(rawEvidence, ["consentSurfaceObserved", "consent_surface_observed", "cookieBannerPresent", "consentBannerPresent"]) ??
    getBooleanValue(getObjectValue(rawEvidence, ["entities"]), ["consentSurfaceObserved", "consent_surface_observed"]);
  const consentActionableChoiceObserved =
    getBooleanValue(rawEvidence, [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed",
      "consentRejectInteractionSucceeded",
      "consentAcceptInteractionSucceeded"
    ]) ??
    getBooleanValue(getObjectValue(rawEvidence, ["entities"]), [
      "consentActionableChoiceObserved",
      "consent_actionable_choice_observed"
    ]);
  const firstPreconsentRuntimeMs = typeof firstNonEssentialRequestMs === "number"
    ? firstNonEssentialRequestMs
    : hasPromotionGradePreconsentCookieEvidence(rawEvidence) && typeof firstTrackingCookieSetMs === "number"
      ? firstTrackingCookieSetMs
      : null;
  const hasTimelineSequence =
    typeof firstPreconsentRuntimeMs === "number" &&
    ((typeof firstCmpVisibleMs === "number" && firstPreconsentRuntimeMs < firstCmpVisibleMs) ||
      (typeof firstConsentActionMs === "number" && firstPreconsentRuntimeMs < firstConsentActionMs));
  const hasNoRecordedChoiceSequence =
    typeof firstPreconsentRuntimeMs === "number" &&
    (hasPromotionGradePreconsentCookieEvidence(rawEvidence) ||
      (consentSurfaceObserved === true && consentActionableChoiceObserved === true)) &&
    firstConsentActionMs === null &&
    firstRejectActionMs === null &&
    firstAcceptActionMs === null &&
    firstUserActionMs === null;
  return hasTimelineSequence || hasNoRecordedChoiceSequence;
}

function getNumberValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (typeof record?.[key] === "number" && Number.isFinite(record[key])) {
      return record[key] as number;
    }
  }

  return null;
}

function getRecordValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return null;
}

function getBooleanValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record?.[key] === true) {
      return true;
    }
    if (record?.[key] === false) {
      return false;
    }
  }

  return null;
}

function getOverlayKind(record: Record<string, unknown> | null | undefined) {
  const overlayEvidence = getRecordValue(record, ["overlayEvidence", "overlay_evidence"]);
  const consentSummary = getRecordValue(record, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const uiSummary = getRecordValue(record, ["hybridUiSummary", "hybrid_ui_summary"]);
  return (
    getStringArrayValues(record, ["overlayKind", "overlay_kind", "overlayType", "overlay_type", "blockerType", "blocker_type"])[0] ??
    getStringArrayValues(overlayEvidence, ["overlayKind", "overlay_kind", "overlayType", "overlay_type", "blockerType", "blocker_type"])[0] ??
    getStringArrayValues(consentSummary, ["overlayKind", "overlay_kind", "overlayType", "overlay_type"])[0] ??
    getStringArrayValues(uiSummary, ["overlayKind", "overlay_kind", "overlayType", "overlay_type"])[0] ??
    null
  );
}

function isKnownNonConsentOverlayKind(value: string | null | undefined) {
  return Boolean(value && /bot|challenge|captcha|login|auth|paywall|subscribe|subscription|newsletter|age|regional|region|geo|app_install|install/i.test(value));
}

function hasIndependentConsentSurfaceText(record: Record<string, unknown> | null | undefined) {
  const consentSummary = getRecordValue(record, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const uiSummary = getRecordValue(record, ["hybridUiSummary", "hybrid_ui_summary"]);
  const labels = [
    ...getStringArrayValues(record, ["overlayActionLabels", "overlay_action_labels", "consentActionLabels", "consent_action_labels", "buttonLabels", "button_labels"]),
    ...getStringArrayValues(consentSummary, ["acceptActionLabels", "accept_action_labels", "rejectActionLabels", "reject_action_labels", "manageActionLabels", "manage_action_labels", "closeActionLabels", "close_action_labels"]),
    ...getStringArrayValues(uiSummary, ["buttonLabels", "button_labels", "actionLabels", "action_labels"])
  ];
  const snippets = [
    ...getEvidenceSnippets(record),
    ...getStringArrayValues(consentSummary, ["bannerTextSnippet", "banner_text_snippet", "textSnippet", "text_snippet"]),
    ...getStringArrayValues(uiSummary, ["textSnippet", "text_snippet", "overlayText", "overlay_text"])
  ];
  return [...labels, ...snippets].some((value) =>
    /accept all|reject all|decline|manage (?:options|preferences|choices)|cookie|cookies|consent|privacy|tracking|preferences?/i.test(value)
  );
}

export function hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const overlayKind = getOverlayKind(rawEvidence);
  return isKnownNonConsentOverlayKind(overlayKind) && !hasIndependentConsentSurfaceText(rawEvidence);
}

function getArtifactRefs(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "artifactRefs",
    "runtimeEvidenceArtifacts",
    "runtime_evidence_artifacts",
    "sourceArtifactRefs",
    "source_artifact_refs"
  ]);
}

function getEvidenceUrls(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "attemptedUrls",
    "evidenceUrls",
    "keyPageAttemptedUrls",
    "pageUrl",
    "pageUrls",
    "requestUrls",
    "runtimeEvidenceUrls",
    "sourceUrl",
    "sourceUrls"
  ]).filter((value) => /^https?:\/\//i.test(value));
}

function getEvidenceSnippets(record: Record<string, unknown> | null | undefined) {
  return getStringArrayValues(record, [
    "claim",
    "description",
    "matchedSnippet",
    "observedBehavior",
    "policySnippet",
    "policySnippets",
    "policySummary",
    "policy_summary",
    "snippet",
    "snippets",
    "sourceEvidence",
    "summary"
  ]);
}

function getUrlAssessment(record: Record<string, unknown> | null | undefined) {
  const value = getRecordValue(record, ["urlAssessment", "url_assessment"]);
  return typeof value?.assessment === "string" ? value.assessment : null;
}

const HIGH_ENTROPY_FINGERPRINTING_CATEGORIES = new Set([
  "audio",
  "audio_context",
  "canvas",
  "canvas_readback",
  "canvas_webgl",
  "device_memory",
  "font_metrics",
  "fonts",
  "fonts_plugins",
  "media_devices",
  "webgl"
]);

const RENDERING_FINGERPRINTING_CATEGORIES = new Set([
  "canvas",
  "canvas_readback",
  "canvas_webgl",
  "webgl"
]);

const CORROBORATING_FINGERPRINTING_CATEGORIES = new Set([
  "audio",
  "audio_context",
  "device_memory",
  "font_metrics",
  "fonts",
  "fonts_plugins",
  "media_devices"
]);

const GENERIC_BROWSER_TELEMETRY_CATEGORIES = new Set([
  "input_touch",
  "locale",
  "network_device_state",
  "screen_viewport",
  "storage",
  "timezone",
  "timezone_locale",
  "viewport"
]);

const MODERATE_ENTROPY_FINGERPRINTING_CATEGORIES = new Set([
  "audio",
  "audio_context",
  "canvas",
  "canvas_readback",
  "device_memory",
  "hardware",
  "hardware_concurrency",
  "webgl"
]);

const KNOWN_FINGERPRINTING_VENDOR_PATTERN =
  /fingerprintjs|fpjs|fingerprint\.com|iovation|threatmetrix|lexisnexis|perimeterx|px-cloud|datadome|arkose|humansecurity|kasada|shape security|akamai bot|cloudflare bot|device intelligence|device graph|devicegraph|identity resolution|id resolution|fingerprint/i;

function normalizeFingerprintingCategory(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getFingerprintingAttributeCategories(rawEvidence: Record<string, unknown> | null | undefined) {
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  const summaryCategoryRows = getObjectArrayValues(summary, ["attributeCategories", "attribute_categories"])
    .map((row) => (typeof row.name === "string" ? row.name : null))
    .filter((value): value is string => Boolean(value));
  const runtimeEvidenceCategoryRows = getObjectArrayValues(rawEvidence, [
    "fingerprintRuntimeEvidence",
    "fingerprint_runtime_evidence",
    "fingerprintingRuntimeEvidence",
    "fingerprinting_runtime_evidence"
  ]).flatMap((row) =>
    getStringArrayValues(row, ["attributeCategories", "attribute_categories", "signals"])
  );

  return uniqueStrings([
    ...getStringArrayValues(rawEvidence, [
      "fingerprintAttributeCategories",
      "fingerprint_attribute_categories",
      "fingerprintingSignals",
      "fingerprinting_signals",
      "highEntropySignals",
      "high_entropy_signals"
    ]),
    ...getStringArrayValues(summary, ["fingerprintingSignals", "fingerprinting_signals", "highEntropySignals", "high_entropy_signals"]),
    ...summaryCategoryRows,
    ...runtimeEvidenceCategoryRows
  ]).map(normalizeFingerprintingCategory);
}

function hasExplicitFingerprintingVendorEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const vendorValues = getStringArrayValues(rawEvidence, [
    "runtimeVendors",
    "runtime_vendors",
    "vendors",
    "vendorNames",
    "vendor_names"
  ]);
  const runtimeVendorValues = getObjectArrayValues(rawEvidence, [
    "fingerprintRuntimeEvidence",
    "fingerprint_runtime_evidence",
    "fingerprintingRuntimeEvidence",
    "fingerprinting_runtime_evidence"
  ]).flatMap((row) => getStringArrayValues(row, ["vendor", "vendorName", "vendor_name", "hostname", "host", "requestUrl", "request_url", "url"]));

  return [...vendorValues, ...runtimeVendorValues].some((value) =>
    KNOWN_FINGERPRINTING_VENDOR_PATTERN.test(value)
  );
}

function hasConcreteFingerprintingRequestEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const requestValues = uniqueStrings([
    ...getStringArrayValues(rawEvidence, ["requestUrls", "request_urls", "runtimeRequestUrls", "runtime_request_urls", "sourceUrls", "source_urls"]),
    ...getObjectArrayValues(rawEvidence, [
      "fingerprintRuntimeEvidence",
      "fingerprint_runtime_evidence",
      "fingerprintingRuntimeEvidence",
      "fingerprinting_runtime_evidence"
    ]).flatMap((row) => getStringArrayValues(row, ["requestUrl", "request_url", "url", "redactedUrl", "redacted_url"]))
  ]);

  return requestValues.some((value) =>
    /^https?:\/\//i.test(value) &&
    /fingerprint|fingerprintjs|fpjs|\/fp(?:[/?#.]|$)|[?&#](?:fp|fingerprint|device_?fingerprint)=|entropy|canvas|webgl|audio_context|device_?hash|visitor_?id|stable_?id|bot_?score|risk_?score/i.test(value)
  );
}

function getFingerprintingRuntimeRows(rawEvidence: Record<string, unknown> | null | undefined) {
  return getObjectArrayValues(rawEvidence, [
    "fingerprintRuntimeEvidence",
    "fingerprint_runtime_evidence",
    "fingerprintingRuntimeEvidence",
    "fingerprinting_runtime_evidence"
  ]);
}

function hasRuntimeBoolean(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  if (getBooleanValue(rawEvidence, keys) === true) {
    return true;
  }
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  if (getBooleanValue(summary, keys) === true) {
    return true;
  }
  return getFingerprintingRuntimeRows(rawEvidence).some((row) => getBooleanValue(row, keys) === true);
}

function hasIdentifierLinkageEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const count =
    getNumberValue(rawEvidence, ["identifierLikeRequestCount", "identifier_like_request_count"]) ??
    getNumberValue(getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]), [
      "identifierLikeRequestCount",
      "identifier_like_request_count"
    ]) ??
    0;
  if (count > 0) {
    return true;
  }
  return hasRuntimeBoolean(rawEvidence, [
    "entropyLinkedToIdentifier",
    "entropy_linked_to_identifier",
    "identifierLinkageObserved",
    "identifier_linkage_observed",
    "cookieSyncLinkageObserved",
    "cookie_sync_linkage_observed"
  ]);
}

function hasEntropyTransmissionEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  const count =
    getNumberValue(rawEvidence, ["deviceDataLikeRequestCount", "device_data_like_request_count"]) ??
    getNumberValue(getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]), [
      "deviceDataLikeRequestCount",
      "device_data_like_request_count"
    ]) ??
    0;
  if (count > 0 || hasConcreteFingerprintingRequestEvidence(rawEvidence)) {
    return true;
  }
  return hasRuntimeBoolean(rawEvidence, [
    "entropyTransmissionObserved",
    "entropy_transmission_observed",
    "networkAfterCollection",
    "network_after_collection",
    "thirdPartyAfterCollection",
    "third_party_after_collection"
  ]);
}

function hasCrossContextLinkageEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return hasRuntimeBoolean(rawEvidence, [
    "crossContextLinkageObserved",
    "cross_context_linkage_observed",
    "crossContextIdentifierBehavior",
    "cross_context_identifier_behavior"
  ]);
}

export type FingerprintEvidenceTier = 0 | 1 | 2 | 3;

export interface FingerprintEvidenceTierResult {
  tier: FingerprintEvidenceTier;
  label: string;
  confidenceExplanation: string;
  strongFingerprintSignals: string[];
  genericFingerprintSignals: string[];
  entropyTransmissionObserved: boolean;
  entropyLinkedToIdentifier: boolean;
  crossContextLinkageObserved: boolean;
  knownFingerprintingVendorObserved: boolean;
}

export function deriveFingerprintEvidenceTier(rawEvidence: Record<string, unknown> | null | undefined): FingerprintEvidenceTierResult {
  const summary = getRecordValue(rawEvidence, ["fingerprintSummary", "fingerprint_summary"]);
  const upstreamTier = getNumberValue(summary, ["tier"]) ?? getNumberValue(rawEvidence, ["fingerprintTier", "fingerprint_tier"]) ?? 0;
  const categories = getFingerprintingAttributeCategories(rawEvidence);
  const strongSignals = uniqueStrings(categories.filter((category) => !GENERIC_BROWSER_TELEMETRY_CATEGORIES.has(category)));
  const genericSignals = uniqueStrings(categories.filter((category) => GENERIC_BROWSER_TELEMETRY_CATEGORIES.has(category)));
  const highEntropyCategoryCount = categories.filter((category) => HIGH_ENTROPY_FINGERPRINTING_CATEGORIES.has(category)).length;
  const moderateEntropyCategoryCount = categories.filter((category) => MODERATE_ENTROPY_FINGERPRINTING_CATEGORIES.has(category)).length;
  const hasRenderingFingerprinting = categories.some((category) => RENDERING_FINGERPRINTING_CATEGORIES.has(category));
  const hasCorroboratingFingerprinting = categories.some((category) => CORROBORATING_FINGERPRINTING_CATEGORIES.has(category));
  const hasRepeatedReads = hasRuntimeBoolean(rawEvidence, ["repeatedEntropyReads", "repeated_entropy_reads", "repeatCollectionSequencing", "repeat_collection_sequencing"]);
  const entropyTransmissionObserved = hasEntropyTransmissionEvidence(rawEvidence);
  const entropyLinkedToIdentifier = hasIdentifierLinkageEvidence(rawEvidence);
  const crossContextLinkageObserved = hasCrossContextLinkageEvidence(rawEvidence);
  const knownFingerprintingVendorObserved = hasExplicitFingerprintingVendorEvidence(rawEvidence);
  const hasIdentityOrientation =
    entropyLinkedToIdentifier ||
    knownFingerprintingVendorObserved ||
    entropyTransmissionObserved ||
    hasRepeatedReads ||
    crossContextLinkageObserved;
  const coordinatedHighEntropy =
    highEntropyCategoryCount >= 2 ||
    (hasRenderingFingerprinting && hasCorroboratingFingerprinting) ||
    hasRepeatedReads ||
    upstreamTier >= 2;
  const moderateEntropyObserved = moderateEntropyCategoryCount > 0 || upstreamTier >= 1;
  const tier: FingerprintEvidenceTier = hasIdentityOrientation && (coordinatedHighEntropy || knownFingerprintingVendorObserved)
    ? 3
    : coordinatedHighEntropy
      ? 2
      : moderateEntropyObserved
        ? 1
        : 0;

  return {
    tier,
    label: tier === 3
      ? "Probable browser/device fingerprinting behavior"
      : tier === 2
        ? "Fingerprinting-related browser telemetry observed"
        : tier === 1
          ? "Elevated browser/device entropy collection observed"
          : "Generic browser telemetry observed",
    confidenceExplanation: tier === 3
      ? "High-entropy browser/device collection is corroborated by identifier linkage, outbound entropy transmission, known bot-defense/fingerprinting vendor attribution, repeat sequencing, or cross-context linkage. This may be fraud prevention or security behavior, but can still require privacy review."
      : tier === 2
        ? "Coordinated high-entropy browser/device collection was observed, but retained evidence does not establish identity-oriented fingerprinting."
        : tier === 1
          ? "Moderate browser/device entropy collection was observed without coordinated identity-oriented corroboration."
          : "Only generic browser telemetry was retained.",
    crossContextLinkageObserved,
    entropyLinkedToIdentifier,
    entropyTransmissionObserved,
    genericFingerprintSignals: genericSignals,
    knownFingerprintingVendorObserved,
    strongFingerprintSignals: strongSignals
  };
}

function hasFingerprintingRuntimeAnchor(rawEvidence: Record<string, unknown> | null | undefined) {
  return getObjectArrayValues(rawEvidence, [
    "fingerprintRuntimeEvidence",
    "fingerprint_runtime_evidence",
    "fingerprintingRuntimeEvidence",
    "fingerprinting_runtime_evidence"
  ]).some((row) => {
    const anchorValues = getStringArrayValues(row, [
      "artifactRef",
      "artifact_ref",
      "requestUrl",
      "request_url",
      "url",
      "redactedUrl",
      "redacted_url",
      "sourceUrl",
      "source_url",
      "scriptUrl",
      "script_url",
      "sourceScriptUrl",
      "source_script_url",
      "vendor",
      "vendorName",
      "vendor_name",
      "hostname",
      "host"
    ]);
    return anchorValues.some((value) => value.trim().length > 0);
  });
}

export function hasStrongFingerprintingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return deriveFingerprintEvidenceTier(rawEvidence).tier >= 3 && hasFingerprintingRuntimeAnchor(rawEvidence);
}

export function hasStrongAccessibilitySupportPathMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const contactMethodPresent = getBooleanValue(rawEvidence, [
    "accessibilityContactMethodPresent",
    "accessibility_contact_method_present"
  ]);
  const statementPresent = getBooleanValue(rawEvidence, [
    "accessibilityStatementPresent",
    "accessibility_statement_present"
  ]);
  if (contactMethodPresent === true || statementPresent === true) {
    return false;
  }

  const signalValue = getBooleanValue(rawEvidence, ["signalValue", "accessibilitySupportPathMissing"]);
  const explicitAbsence = contactMethodPresent === false || statementPresent === false || signalValue === true;
  const attemptedUrls = getStringArrayValues(rawEvidence, ["keyPageAttemptedUrls", "attemptedUrls"]);
  const attemptCount = getNumberValue(rawEvidence, ["keyPageAttemptCount", "key_page_attempt_count"]) ?? attemptedUrls.length;
  const discoverySource =
    typeof rawEvidence.keyPageDiscoverySource === "string"
      ? rawEvidence.keyPageDiscoverySource
      : typeof rawEvidence.key_page_discovery_source === "string"
        ? rawEvidence.key_page_discovery_source
        : null;
  const stableDiscoverySource = [
    "footer_link",
    "header_link",
    "body_link",
    "legal_hub",
    "second_hop_legal_hub"
  ].includes(discoverySource ?? "");
  const reviewerVisibleSurface =
    getArtifactRefs(rawEvidence).length > 0 ||
    getUrlAssessment(rawEvidence) === "supports_promotion" ||
    getEvidenceUrls(rawEvidence).some((value) => /accessibility|contact|help|support/i.test(value)) ||
    getEvidenceSnippets(rawEvidence).some((value) => /accessibility|accommodation|assistive|caption|support|contact/i.test(value));

  return Boolean(
    explicitAbsence &&
      (reviewerVisibleSurface || (attemptCount >= 2 && stableDiscoverySource) || (attemptCount >= 3 && attemptedUrls.length >= 2))
  );
}

export function hasStrongSaleSharingControlsMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const doNotSellLinkPresent = getBooleanValue(rawEvidence, [
    "doNotSellLinkPresent",
    "do_not_sell_link_present"
  ]);
  const targetedAdvertisingChoicesPresent = getBooleanValue(rawEvidence, [
    "targetedAdvertisingChoicesPresent",
    "targeted_advertising_choices_present"
  ]);
  const missingChoicePath =
    doNotSellLinkPresent === false ||
    targetedAdvertisingChoicesPresent === false ||
    getBooleanValue(rawEvidence, ["signalValue", "saleSharingControlsMissing", "sale_sharing_controls_missing"]) === true;
  if (!missingChoicePath || doNotSellLinkPresent === true || targetedAdvertisingChoicesPresent === true) {
    return false;
  }

  const policyAnchor = getRecordValue(rawEvidence, ["policyAnchor", "policy_anchor"]);
  const anchorClaimType = typeof policyAnchor?.claimType === "string" ? policyAnchor.claimType : "";
  const anchorSnippet = typeof policyAnchor?.snippet === "string" ? policyAnchor.snippet : "";
  const policyAnchorSupportsBehavior =
    /sale|sharing|share|targeted|advertis|cross-context|personalized/i.test(`${anchorClaimType} ${anchorSnippet}`) &&
    typeof policyAnchor?.sourceUrl === "string" &&
    policyAnchor.sourceUrl.length > 0;
  const disclosureSignals =
    getBooleanValue(rawEvidence, [
      "targetedAdvertisingDisclosurePresent",
      "targeted_advertising_disclosure_present",
      "thirdPartyAdvertisingDisclosurePresent",
      "third_party_advertising_disclosure_present",
      "trackingTechnologiesDisclosurePresent",
      "tracking_technologies_disclosure_present"
    ]) === true;
  const policyTextSupportsBehavior = getEvidenceSnippets(rawEvidence).some((value) =>
    /do not sell|do not share|sale or sharing|sell or share|targeted advertising|cross-context behavioral|personalized ads?|advertising partners/i.test(
      value
    )
  );
  const runtimeSupportsBehavior =
    hasConcreteRetargetingArtifact(rawEvidence) ||
    getStringArrayValues(rawEvidence, [
      "retargetingVendors",
      "runtimeVendors",
      "runtime_vendors",
      "vendorCategories",
      "vendor_categories"
    ]).some((value) => /advertis|retarget|marketing|adtech|social/i.test(value));
  const reviewerVisibleAnchor =
    policyAnchorSupportsBehavior ||
    getUrlAssessment(rawEvidence) === "supports_promotion" ||
    (getEvidenceUrls(rawEvidence).length > 0 && (policyTextSupportsBehavior || runtimeSupportsBehavior)) ||
    getArtifactRefs(rawEvidence).length > 0;

  return Boolean(
    missingChoicePath &&
      reviewerVisibleAnchor &&
      (policyAnchorSupportsBehavior || disclosureSignals || policyTextSupportsBehavior || runtimeSupportsBehavior)
  );
}

export function hasStrongCpraCbaOptOutMissingEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }
  const cpraEvidence = getRecordValue(rawEvidence, ["cpraCbaOptOutEvidence", "cpra_cba_opt_out_evidence"]);
  const tier1 = getStringArrayValues(rawEvidence, ["cbaVendorTier1", "cba_vendor_tier1"]);
  const tier2 = getStringArrayValues(rawEvidence, ["cbaVendorTier2", "cba_vendor_tier2"]);
  const nestedTier1 = getStringArrayValues(cpraEvidence, ["cbaVendorTier1", "cba_vendor_tier1", "advertisingSharingVendors", "advertising_sharing_vendors"]);
  const nestedTier2 = getStringArrayValues(cpraEvidence, ["cbaVendorTier2", "cba_vendor_tier2"]);
  const optOutUiResult =
    getStringArrayValues(cpraEvidence, ["optOutUiResult", "opt_out_ui_result"])[0] ??
    getStringArrayValues(rawEvidence, ["optOutUiResult", "opt_out_ui_result"])[0] ??
    null;
  const policyCbaLanguage =
    getStringArrayValues(cpraEvidence, ["policyCbaLanguage", "policy_cba_language"])[0] ??
    getStringArrayValues(rawEvidence, ["policyCbaLanguage", "policy_cba_language"])[0] ??
    null;
  const scanOriginGeo =
    getStringArrayValues(cpraEvidence, ["scanOriginGeo", "scan_origin_geo"])[0] ??
    getStringArrayValues(rawEvidence, ["scanOriginGeo", "scan_origin_geo"])[0] ??
    null;
  const suppressorApplied =
    getStringArrayValues(cpraEvidence, ["suppressorApplied", "suppressor_applied"])[0] ??
    getStringArrayValues(rawEvidence, ["suppressorApplied", "suppressor_applied"])[0] ??
    null;
  const choiceControlsInspected =
    cpraEvidence?.choiceControlsInspected === true ||
    cpraEvidence?.choice_controls_inspected === true ||
    rawEvidence.choiceControlsInspected === true ||
    rawEvidence.choice_controls_inspected === true ||
    getStringArrayValues(rawEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "gpcOptOutDiscoveryAttemptUrls", "gpc_opt_out_discovery_attempt_urls"]).length > 0;
  const vendorThresholdMet = tier1.length >= 1 || tier2.length >= 2 || nestedTier1.length >= 1 || nestedTier2.length >= 2;
  const missingOrPartialControl =
    optOutUiResult === "absent" ||
    optOutUiResult === "generic_do_not_sell" ||
    optOutUiResult === "partial_no_icon";
  const cpraRelevantContext =
    Boolean(policyCbaLanguage && policyCbaLanguage !== "absent") ||
    optOutUiResult === "generic_do_not_sell" ||
    optOutUiResult === "partial_no_icon" ||
    /\b(?:ca|california)\b/i.test(scanOriginGeo ?? "") ||
    getStringArrayValues(rawEvidence, ["privacyChoiceSearchUrls", "privacy_choice_search_urls", "gpcOptOutDiscoveryAttemptUrls", "gpc_opt_out_discovery_attempt_urls"]).length > 0;

  return vendorThresholdMet && choiceControlsInspected && missingOrPartialControl && cpraRelevantContext && !suppressorApplied;
}

export function hasVerifiedConsentUiEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }
  if (hasNonConsentOverlayWithoutIndependentConsentEvidence(rawEvidence)) {
    return false;
  }

  const consentSurfaceGate = evaluateConsentSurfaceGate(rawEvidence);
  const consentSummary = getRecordValue(rawEvidence, ["hybridConsentSummary", "hybrid_consent_summary"]);
  const consentVisual = getRecordValue(rawEvidence, ["hybridConsentVisual", "hybrid_consent_visual"]);
  const uiSummary = getRecordValue(rawEvidence, ["hybridUiSummary", "hybrid_ui_summary"]);
  const artifactRefs = getStringArrayValues(rawEvidence, [
    "consentUiArtifactRefs",
    "consent_ui_artifact_refs",
    "runtimeEvidenceArtifacts",
    "runtime_evidence_artifacts"
  ]);
  const explicitSurface =
    rawEvidence.consentSurfaceObserved === true ||
    rawEvidence.consent_surface_observed === true ||
    consentSummary?.bannerPresent === true;
  const specificUiFact = Boolean(
    rawEvidence.reject_button_missing === true ||
      rawEvidence.forced_consent_wall === true ||
      rawEvidence.accept_more_prominent_than_reject === true ||
      rawEvidence.asymmetric_consent_ui === true ||
      rawEvidence.accept_only_banner === true ||
      rawEvidence.dismiss_without_reject === true ||
      consentVisual?.ctaImbalanceDetected === true ||
      consentVisual?.acceptOnly === true ||
      consentVisual?.rejectHidden === true ||
      consentVisual?.contrastAsymmetryDetected === true ||
      consentSummary?.rejectDepthClass === "absent" ||
      consentSummary?.pageInteractionBlocked === true ||
      uiSummary?.forcedActionRequired === true
  );

  return (
    explicitSurface &&
    specificUiFact &&
    artifactRefs.length > 0 &&
    consentSurfaceGate.consentSurfaceObserved &&
    consentSurfaceGate.sameSurfaceCandidates &&
    consentSurfaceGate.preChoiceState &&
    !consentSurfaceGate.hasExplicitPromotionSuppressor &&
    consentSurfaceGateAllowsConsentUxPromotion(consentSurfaceGate)
  );
}

export function hasConcreteRuntimeArtifact(rawEvidence: Record<string, unknown> | null | undefined, keys: string[]) {
  return getStringArrayValues(rawEvidence, keys).length > 0;
}

export function hasConcreteRetargetingArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasConcreteRuntimeArtifact(rawEvidence, [
      "runtimeEvidence",
      "runtimeEvidenceArtifacts",
      "runtime_evidence_artifacts",
      "retargetingEvidenceUrls",
      "retargeting_evidence_urls",
      "runtimeEvidenceUrls"
    ]) ||
    rawEvidence?.retargetingPixelArtifactPresent === true ||
    rawEvidence?.retargeting_pixel_artifact_present === true
  );
}

export function hasConcreteReplayArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return (
    hasConcreteRuntimeArtifact(rawEvidence, [
      "session_replay_runtime_artifacts",
      "runtimeEvidence"
    ]) ||
    rawEvidence?.sessionReplayVendorArtifactPresent === true ||
    rawEvidence?.session_replay_vendor_artifact_present === true
  );
}

export function hasStrongRightsFrictionArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return false;
  }

  const optInClicks =
    typeof rawEvidence.consentOptInClicks === "number"
      ? rawEvidence.consentOptInClicks
      : typeof rawEvidence.consent_accept_click_count === "number"
        ? rawEvidence.consent_accept_click_count
        : null;
  const optOutClicks =
    typeof rawEvidence.consentOptOutClicks === "number"
      ? rawEvidence.consentOptOutClicks
      : typeof rawEvidence.consent_reject_click_count === "number"
        ? rawEvidence.consent_reject_click_count
        : null;
  const frictionDelta =
    typeof rawEvidence.consentFrictionDelta === "number" ? rawEvidence.consentFrictionDelta : null;
  const blockerText =
    typeof rawEvidence.consentBlockerTextSnippet === "string"
      ? rawEvidence.consentBlockerTextSnippet.trim()
      : null;
  const evidencePassCount =
    typeof rawEvidence.consentEvidencePassCount === "number" ? rawEvidence.consentEvidencePassCount : null;
  const policyRightsSignals = getStringArrayValues(rawEvidence, ["policyRightsSignals", "policy_rights_signals"]);

  return Boolean(
    (rawEvidence.consentRedirectOrAuthRequired === true && (evidencePassCount ?? 0) >= 2) ||
      ((rawEvidence.consentBlockerType || rawEvidence.consentBlockerUrl) &&
        (evidencePassCount ?? 0) >= 2 &&
        (blockerText?.length ?? 0) >= 40) ||
      (typeof frictionDelta === "number" &&
        frictionDelta >= 2 &&
        typeof optOutClicks === "number" &&
        optOutClicks >= 2) ||
      (typeof optInClicks === "number" &&
        typeof optOutClicks === "number" &&
        optOutClicks > optInClicks &&
        policyRightsSignals.length === 0)
  );
}

export function hasConcreteSensitivePayloadArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return getSensitivePayloadRows(rawEvidence).some((row) => {
    if (row.evidenceStrength === "detector_only") {
      return false;
    }

    const requestUrl = typeof row.requestUrl === "string" ? row.requestUrl : "";
    if (requestUrl.length > 0) {
      return true;
    }

    const evidenceStrength = typeof row.evidenceStrength === "string" ? row.evidenceStrength : "";
    const hasFieldEvidence =
      typeof row.detectedType === "string" &&
      row.detectedType.trim().length > 0 &&
      ((typeof row.matchSnippet === "string" && row.matchSnippet.trim().length > 0) ||
        (typeof row.sourceField === "string" && row.sourceField.trim().length > 0));

    return hasFieldEvidence && /form_field_signal|matched_signal_text|confirmed|suspected/i.test(evidenceStrength);
  });
}

export function hasConcreteSensitiveSessionReplayArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return getSensitivePayloadRows(rawEvidence).some((row) => {
    const typedRow = row as {
      evidenceSource?: unknown;
      evidenceStrength?: unknown;
      requestUrl?: unknown;
      vendorHost?: unknown;
    };
    if (typedRow.evidenceStrength === "detector_only") {
      return false;
    }

    const hostname = getRuntimeEvidenceHostname(typedRow);
    return (
      (typedRow.evidenceSource === "sensitive_field_session_replay_correlation" || isSessionReplayRuntimeHost(hostname)) &&
      typeof typedRow.requestUrl === "string" &&
      typedRow.requestUrl.trim().length > 0 &&
      hostname.length > 0
    );
  });
}

function getSamePageOrFlowReplayLinkage(row: Record<string, unknown>) {
  const sameFlowLinkage = getObjectValue(row, ["sameFlowLinkage", "same_flow_linkage"]);
  return (
    row.samePage === true ||
    row.same_page === true ||
    row.sameFlow === true ||
    row.same_flow === true ||
    sameFlowLinkage?.samePageOrFlow === true ||
    sameFlowLinkage?.same_page_or_flow === true
  );
}

function hasSensitiveReplaySamePageOrFlowLinkage(rawEvidence: Record<string, unknown> | null | undefined) {
  return getSensitivePayloadRows(rawEvidence).some((row) =>
    hasConcreteSensitiveSessionReplayArtifact({ sensitivePayloadViolations: [row] }) &&
    getSamePageOrFlowReplayLinkage(row)
  );
}

export function hasSensitiveSessionReplaySurfaceCooccurrenceArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return hasSensitiveReplaySamePageOrFlowLinkage(rawEvidence);
}

export function hasScanLevelSensitiveSessionReplayCoPresenceArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  const hasSensitiveSurface =
    hasConcreteSensitivePayloadArtifact(rawEvidence) ||
    getObjectArrayValues(rawEvidence, [
      "sensitiveFieldEvidence",
      "sensitive_field_evidence",
      "sensitiveInputSurfaceEvidence",
      "sensitive_input_surface_evidence",
      "sensitivePayloadEvidence",
      "sensitive_payload_evidence"
    ]).length > 0 ||
    getStringArrayValues(rawEvidence, [
      "sensitiveDataTypes",
      "sensitive_data_types",
      "sensitiveFieldContexts",
      "sensitive_field_contexts",
      "sensitiveFieldLabels",
      "sensitive_field_labels"
    ]).length > 0;

  return hasSensitiveSurface && hasRetainedSessionReplayRuntimeArtifact(rawEvidence) && hasSensitiveReplaySamePageOrFlowLinkage(rawEvidence);
}

export function hasConcreteSensitiveThirdPartyTrackingArtifact(rawEvidence: Record<string, unknown> | null | undefined) {
  return getSensitivePayloadRows(rawEvidence).some((row) => {
    const typedRow = row as {
      evidenceSource?: unknown;
      evidenceStrength?: unknown;
      requestUrl?: unknown;
      vendorHost?: unknown;
    };
    if (typedRow.evidenceStrength === "detector_only") {
      return false;
    }

    const sameFlowLinkage = getObjectValue(row, ["sameFlowLinkage", "same_flow_linkage"]);
    if (
      row.samePage !== true &&
      row.same_page !== true &&
      row.sameFlow !== true &&
      row.same_flow !== true &&
      sameFlowLinkage?.samePageOrFlow !== true &&
      sameFlowLinkage?.same_page_or_flow !== true
    ) {
      return false;
    }

    const hostname = getRuntimeEvidenceHostname(typedRow);
    if (typedRow.evidenceSource !== "sensitive_field_third_party_tracking_correlation" && !isTrackingRuntimeHost(hostname)) {
      return false;
    }

    if (hostname.length > 0) {
      return true;
    }

    if (typeof typedRow.requestUrl !== "string") {
      return false;
    }

    try {
      const parsed = new URL(typedRow.requestUrl);
      return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname.includes(".");
    } catch {
      return false;
    }
  });
}

export function evaluatePolicyBehaviorConflictContract(rawEvidence: Record<string, unknown> | null | undefined): ContractDecision | null {
  const recomputedDecision = evaluatePolicyBehaviorContradictionEvidence(rawEvidence);
  if (!recomputedDecision.eligible) {
    const alignmentDecision = evaluatePolicyRuntimeAlignmentReviewEvidence(rawEvidence);
    if (alignmentDecision.eligible) {
      return {
        allowedNarrativeTier: "moderate",
        externalSurfacingEligibility: "eligible",
        negativeEvidenceFlags: ["policy_runtime_alignment_review_signal"],
        promotionEligibility: "eligible"
      };
    }

    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: recomputedDecision.negativeEvidenceFlags,
      promotionEligibility: "internal_only"
    };
  }

  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  if (!contradictionEvidence) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [
        "missing_behavior_side_evidence",
        "missing_policy_side_evidence",
        "missing_contradiction_mapping",
        "missing_explicit_contradiction_basis",
        "insufficient_evidence_for_policy_behavior_conflict"
      ],
      promotionEligibility: "internal_only"
    };
  }

  const negativeEvidenceFlags = new Set<string>();
  const policyAnchor = contradictionEvidence.policyAnchor;
  const runtimeAnchor = contradictionEvidence.runtimeAnchor;
  const conflictBridge = contradictionEvidence.conflictBridge;
  const allowedConflictType = getAllowedConflictType(policyAnchor.claimType, runtimeAnchor.observationType);
  const policyFetched = policyAnchor.extractionStatus === "fetched";
  const policyAnchorConfidenceOk = typeof policyAnchor.confidence === "number" && policyAnchor.confidence >= 0.55;
  const runtimeAnchorConfidenceOk = typeof runtimeAnchor.confidence === "number" && runtimeAnchor.confidence >= 0.55;
  const runtimeArtifactsPresent =
    runtimeAnchor.vendors.length > 0 ||
    runtimeAnchor.requests.length > 0 ||
    runtimeAnchor.cookies.length > 0 ||
    runtimeAnchor.storageArtifacts.length > 0 ||
    contradictionEvidence.runtimeEvidenceArtifacts.length > 0 ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: runtimeAnchor.phase });
  const policyAnchorPresent = Boolean(
    contradictionEvidence.evidenceSufficiency.policyAnchorPresent &&
      policyAnchor.claimType &&
      policyAnchor.sourceUrl &&
      policyAnchor.snippet &&
      policyFetched &&
      policyAnchorConfidenceOk
  );
  const runtimeAnchorPresent = Boolean(
    contradictionEvidence.evidenceSufficiency.runtimeAnchorPresent &&
      runtimeAnchor.observationType &&
      runtimeArtifactsPresent &&
      runtimeAnchor.phase !== "unknown" &&
      runtimeAnchorConfidenceOk
  );
  const conflictBridgePresent = Boolean(
    contradictionEvidence.evidenceSufficiency.conflictBridgePresent &&
      conflictBridge.conflictType &&
      allowedConflictType &&
      conflictBridge.conflictType === allowedConflictType &&
      conflictBridge.reasoning &&
      conflictBridge.supportsPromotion
  );

  if (!policyFetched) {
    negativeEvidenceFlags.add("policy_semantic_review_incomplete");
  }
  if (!policyAnchorPresent) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
    negativeEvidenceFlags.add("missing_specific_policy_anchor");
  }
  if (!runtimeAnchorPresent) {
    negativeEvidenceFlags.add("missing_behavior_side_evidence");
    negativeEvidenceFlags.add("missing_specific_runtime_anchor");
    negativeEvidenceFlags.add("runtime_tracking_review_incomplete");
  }
  if (!allowedConflictType || !conflictBridgePresent) {
    negativeEvidenceFlags.add("missing_contradiction_mapping");
  }
  if (allowedConflictType === null && runtimeAnchor.observationType && policyAnchor.claimType) {
    negativeEvidenceFlags.add("unsupported_contradiction_mapping");
  }
  if (!conflictBridge.conflictType || !conflictBridge.supportsPromotion) {
    negativeEvidenceFlags.add("missing_explicit_contradiction_basis");
  }
  if (hasBlockingContradictionMetaSignal(rawEvidence)) {
    negativeEvidenceFlags.add("model_suspicion_without_structured_support");
  }
  if (
    contradictionEvidence.evidenceSufficiency.reviewStatus !== "complete" ||
    contradictionEvidence.evidenceSufficiency.promotionEligible !== true
  ) {
    negativeEvidenceFlags.add(contradictionEvidence.evidenceSufficiency.reviewStatus);
  }

  if (negativeEvidenceFlags.size > 0) {
    negativeEvidenceFlags.add("possible_policy_runtime_mismatch");
    negativeEvidenceFlags.add("insufficient_evidence_for_policy_behavior_conflict");
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  return {
    allowedNarrativeTier: "strong",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [],
    promotionEligibility: "eligible"
  };
}

export function evaluateConsentGatedTrackingConflictContract(rawEvidence: Record<string, unknown> | null | undefined): ContractDecision | null {
  const recomputedDecision = evaluatePolicyBehaviorContradictionEvidence(rawEvidence);
  if (!recomputedDecision.eligible) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: recomputedDecision.negativeEvidenceFlags,
      promotionEligibility: "internal_only"
    };
  }

  const contradictionEvidence = getContradictionEvidenceBundle(rawEvidence);
  if (!contradictionEvidence) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [
        "missing_behavior_side_evidence",
        "missing_policy_side_evidence",
        "missing_contradiction_mapping",
        "missing_explicit_contradiction_basis",
        "insufficient_evidence_for_policy_behavior_conflict"
      ],
      promotionEligibility: "internal_only"
    };
  }

  const negativeEvidenceFlags = new Set<string>();
  const { policyAnchor, runtimeAnchor, conflictBridge } = contradictionEvidence;
  const allowedConflictType = getAllowedConflictType(policyAnchor.claimType, runtimeAnchor.observationType);
  const consentGatingClaim =
    policyAnchor.claimType === "cookie_preferences_available" ||
    policyAnchor.claimType === "only_necessary_cookies_before_choice" ||
    policyAnchor.claimType === "no_marketing_tracking_before_consent";
  const preconsentRuntime =
    runtimeAnchor.phase === "pre_consent" &&
    (runtimeAnchor.observationType === "marketing_vendor_fired_pre_consent" ||
      runtimeAnchor.observationType === "analytics_vendor_fired_pre_consent");
  const hasRuntimeRequests =
    runtimeAnchor.requests.some((value) => /^https?:\/\//i.test(value)) ||
    hasConcreteSanitizedNetworkEvidence(rawEvidence, { runtimePhase: "pre_consent" });
  const hasRuntimeVendors = runtimeAnchor.vendors.length > 0;
  const policyFetched = policyAnchor.extractionStatus === "fetched";
  const policyConfidenceOk = typeof policyAnchor.confidence !== "number" || policyAnchor.confidence >= 0.55;
  const runtimeConfidenceOk = typeof runtimeAnchor.confidence !== "number" || runtimeAnchor.confidence >= 0.55;
  const bridgeOk = Boolean(
    conflictBridge.conflictType &&
      allowedConflictType &&
      conflictBridge.conflictType === allowedConflictType &&
      conflictBridge.supportsPromotion
  );

  if (!policyFetched || !consentGatingClaim || !policyAnchor.sourceUrl || !policyAnchor.snippet || !policyConfidenceOk) {
    negativeEvidenceFlags.add("missing_policy_side_evidence");
    negativeEvidenceFlags.add("missing_specific_policy_anchor");
  }
  if (!preconsentRuntime || !hasRuntimeVendors || !runtimeConfidenceOk) {
    negativeEvidenceFlags.add("missing_behavior_side_evidence");
    negativeEvidenceFlags.add("missing_specific_runtime_anchor");
    negativeEvidenceFlags.add("runtime_tracking_review_incomplete");
  }
  if (!hasRuntimeRequests) {
    negativeEvidenceFlags.add("missing_runtime_request_url_evidence");
  }
  if (!bridgeOk) {
    negativeEvidenceFlags.add("missing_contradiction_mapping");
    negativeEvidenceFlags.add("missing_explicit_contradiction_basis");
  }
  if (hasBlockingContradictionMetaSignal(rawEvidence)) {
    negativeEvidenceFlags.add("model_suspicion_without_structured_support");
  }

  if (negativeEvidenceFlags.size > 0) {
    negativeEvidenceFlags.add("possible_policy_runtime_mismatch");
    negativeEvidenceFlags.add("insufficient_evidence_for_policy_behavior_conflict");
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "audit_only",
      negativeEvidenceFlags: [...negativeEvidenceFlags],
      promotionEligibility: "internal_only"
    };
  }

  return {
    allowedNarrativeTier: "strong",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [],
    promotionEligibility: "eligible"
  };
}

export function evaluateConcreteRuntimeContract(input: {
  allowAuditOnlyWithoutArtifact?: boolean;
  missingFlag: string;
  originType: string;
  rawEvidence: Record<string, unknown> | null | undefined;
  hasConcreteArtifact: boolean;
}) {
  if (input.originType === "validation_rule") {
    return null;
  }

  if (!input.hasConcreteArtifact) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: input.allowAuditOnlyWithoutArtifact === false ? "suppress" : "audit_only",
      negativeEvidenceFlags: [input.missingFlag],
      promotionEligibility: input.allowAuditOnlyWithoutArtifact === false ? "blocked" : "internal_only"
    } satisfies ContractDecision;
  }

  return {
    allowedNarrativeTier: "moderate",
    externalSurfacingEligibility: "eligible",
    negativeEvidenceFlags: [],
    promotionEligibility: "eligible"
  } satisfies ContractDecision;
}

export function evaluateStrongEvidenceContract(input: {
  blockedFlag?: string;
  missingFlag: string;
  originType: string;
  meetsThreshold: boolean;
}) {
  if (input.originType === "validation_rule") {
    return null;
  }

  if (!input.meetsThreshold) {
    return {
      allowedNarrativeTier: "weak",
      externalSurfacingEligibility: "suppress",
      negativeEvidenceFlags: uniqueStrings([input.missingFlag, input.blockedFlag ?? null]),
      promotionEligibility: "blocked"
    } satisfies ContractDecision;
  }

  return null;
}
