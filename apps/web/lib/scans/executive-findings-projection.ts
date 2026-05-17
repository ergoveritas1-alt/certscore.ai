import {
  CERT_SCORE_FINDING_REGISTRY,
  type CertScoreFinding,
  type CertScoreFindingConfidence,
  type CertScoreFindingDirectness,
  type CertScoreFindingEvidenceDetails,
  type PreConsentTrackingEvidenceDetails,
  type CertScoreFindingSection,
  type CertScoreFindingSeverity
} from "./finding-registry";
import { getFindingSurfaceScore, rankFindings } from "./rank-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { evaluatePolicyBehaviorContradictionEvidence, getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import { isFindingProjectionEligible } from "./finding-evidence-contracts";
import {
  classifyRtbCookieSyncEvidenceRows,
  deriveFingerprintEvidenceTier,
  hasStrongFingerprintingEvidence
} from "./promotion-evidence-contracts";

const MAX_DISPLAY_SNIPPET_LENGTH = 240;

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  // Find the last space before maxLength so we don't cut a word in half
  const slicePoint = value.lastIndexOf(" ", maxLength);
  const endIndex = slicePoint > 0 ? slicePoint : maxLength;
  return `${value.slice(0, endIndex).trimEnd()}...`;
}

function truncateDisplaySnippet(value: string): string {
  return truncateAtWordBoundary(value, MAX_DISPLAY_SNIPPET_LENGTH);
}

const SECTION_ORDER: CertScoreFindingSection[] = [
  "Privacy & Tracking",
  "Consent Experience",
  "Cookies & Storage",
  "Vendors & Requests",
  "Fingerprinting",
  "Navigation & Redirects",
  "Runtime & Diagnostics",
  "Accessibility",
  "Financial & Claims"
];

const UNIFIED_FINDING_ID_TO_CERT_FINDING_ID: Record<string, keyof typeof CERT_SCORE_FINDING_REGISTRY> = {
  accept_more_prominent_than_reject: "asymmetric_consent_ui",
  accept_only_banner: "consent_dark_patterns_detected",
  dismiss_without_reject: "consent_dark_patterns_detected",
  fingerprinting_observed: "probable_fingerprinting",
  forced_consent_wall: "forced_consent_interaction",
  cookie_disclosure_gap: "cookie_disclosure_gap",
  cpra_cba_opt_out_missing: "cpra_cba_opt_out_missing",
  policy_behavior_conflict: "policy_behavior_contradiction_detected",
  policy_clarity_risk: "policy_clarity_risk",
  preconsent_tracking: "pre_consent_tracking_detected",
  reject_did_not_reduce_tracking: "reject_tracking_persists_after_reject",
  reject_button_missing: "reject_option_missing_or_hidden",
  rtb_cookie_sync_observed: "rtb_cookie_sync_observed",
  session_replay_observed: "session_recording_services_detected",
  session_replay_undisclosed: "session_recording_services_detected",
  video_content_tracking_exposure: "video_content_tracking_exposure"
};

const UMBRELLA_DARK_PATTERN_PACKET_IDS = new Set(["accept_only_banner", "dismiss_without_reject"]);

const FINGERPRINTING_CORROBORATING_TRACKING_IDS = new Set([
  "pre_consent_tracking_detected",
  "preconsent_tracking",
  "cross_domain_identifier_sharing_observed",
  "third_party_cookie_pre_consent"
]);

const FINGERPRINTING_PROBABLE_BLOCK_SURFACES = new Set([
  "adult_gate_probable",
  "auth_wall_probable",
  "captcha_probable",
  "empty_or_thin_block_page",
  "geo_block_probable",
  "login_wall_probable",
  "plain_origin_403",
  "unknown_block_page",
  "vendor_interstitial_probable"
]);

const CONTRADICTION_FINDING_IDS = new Set([
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "functional_misalignment",
  "missing_technical_disclosure",
  "policy_behavior_conflict",
  "privacy_cookie_policy_conflict",
  "privacy_terms_conflict"
]);

type CpraOptOutSubtype =
  | "opt_out_absent"
  | "partial_no_icon"
  | "generic_do_not_sell_only"
  | "control_present_but_cba_compliance_unclear";

const CANONICAL_EVIDENCE_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "rtb_cookie_sync_observed",
  "cpra_cba_opt_out_missing",
  "cross_domain_identifier_sharing_observed",
  "cookie_disclosure_gap",
  "third_party_cookie_pre_consent",
  "analytics_cookie_pre_consent",
  "adtech_cookie_pre_consent",
  "telemetry_rich_identification_observed",
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "blocking_overlay_observed",
  "content_obstructed_by_overlay",
  "repeated_consent_prompt",
  "multi_vendor_tracking_detected",
  "session_recording_services_detected",
  "possible_session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present",
  "sensitive_collection_surface_observed",
  "video_content_tracking_exposure",
  "pre_submit_text_capture_detected",
  "identifier_transmission_detected",
  "device_data_collection_detected",
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting",
  "non_cookie_tracking_detected",
  "high_request_density",
  "large_third_party_footprint",
  "collection_endpoints_detected",
  "consent_dark_patterns_detected",
  "policy_behavior_contradiction_detected",
  "policy_clarity_risk",
  "tracking_redirect_chain",
  "autoplay_before_consent",
  "popup_or_modal_present",
  "interstitial_detected",
  "focus_management_issue",
  "keyboard_navigation_accessibility_issue",
  "semantic_labeling_accessibility_issue",
  "text_alternative_accessibility_issue",
  "visual_contrast_accessibility_issue",
  "guaranteed_or_high_return_claims_present",
  "performance_claims_without_context",
  "high_risk_product_risk_disclosure_missing"
]);

const COOKIE_EVIDENCE_FINDING_IDS = new Set([
  "third_party_cookie_pre_consent",
  "analytics_cookie_pre_consent",
  "adtech_cookie_pre_consent",
  "non_cookie_tracking_detected",
  "cookie_disclosure_gap"
]);

const CONSENT_UI_EVIDENCE_FINDING_IDS = new Set([
  "reject_option_missing_or_hidden",
  "asymmetric_consent_ui",
  "forced_consent_interaction",
  "blocking_overlay_observed",
  "content_obstructed_by_overlay",
  "repeated_consent_prompt",
  "consent_dark_patterns_detected"
]);

const SENSITIVE_EVIDENCE_FINDING_IDS = new Set([
  "possible_session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present",
  "sensitive_collection_surface_observed",
  "video_content_tracking_exposure",
  "pre_submit_text_capture_detected"
]);

const TELEMETRY_EVIDENCE_FINDING_IDS = new Set([
  "identifier_transmission_detected",
  "device_data_collection_detected",
  "telemetry_rich_identification_observed",
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting",
  "collection_endpoints_detected"
]);

const FOOTPRINT_EVIDENCE_FINDING_IDS = new Set([
  "third_party_tracking_pre_consent",
  "cross_domain_identifier_sharing_observed",
  "multi_vendor_tracking_detected",
  "high_request_density",
  "large_third_party_footprint",
  "tracking_redirect_chain",
  "autoplay_before_consent",
  "popup_or_modal_present",
  "interstitial_detected"
]);

const FINANCIAL_EVIDENCE_FINDING_IDS = new Set([
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected",
  "guaranteed_or_high_return_claims_present",
  "performance_claims_without_context",
  "high_risk_product_risk_disclosure_missing"
]);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function uniqueCaseInsensitiveStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(trimmed);
  }
  return results;
}

function getEntityValues(packet: UnifiedFindingDisplayPacket, pattern: RegExp) {
  return uniqueStrings(
    Object.entries(packet.evidence?.entities ?? {}).flatMap(([key, values]) =>
      pattern.test(key) ? values : []
    )
  );
}

function getEntityUrlValues(packet: UnifiedFindingDisplayPacket, pattern: RegExp) {
  return getEntityValues(packet, pattern).filter((value) => /^https?:\/\//i.test(value));
}

function getEntityJsonObjects(packet: UnifiedFindingDisplayPacket, key: string): Array<Record<string, unknown>> {
  return (packet.evidence?.entities?.[key] ?? []).flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

function getRecordString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getRecordStringArray(row: Record<string, unknown> | undefined, keys: string[]) {
  if (!row) {
    return [];
  }
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
    }
  }
  return [];
}

function getRecordNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function getCountValue(packet: UnifiedFindingDisplayPacket, keys: string[]) {
  for (const key of keys) {
    const value = packet.evidence?.counts?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getFirstEntityJsonObject(packet: UnifiedFindingDisplayPacket, key: string): Record<string, unknown> | null {
  return getEntityJsonObjects(packet, key)[0] ?? null;
}

function mapConfidenceBandToExecutiveConfidence(
  band: UnifiedFindingDisplayPacket["confidenceBand"]
): CertScoreFindingConfidence {
  if (band === "high") {
    return "strong";
  }
  if (band === "moderate") {
    return "good";
  }
  return "moderate";
}

function mapExecutiveConfidence(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingConfidence {
  if (findingId === "reject_tracking_persists_after_reject" && !packet.evidence?.flags?.includes("reject_evidence_confirmed")) {
    return "moderate";
  }
  if (findingId === "policy_behavior_contradiction_detected") {
    return evaluatePolicyRuntimeConflictPresentation(packet).complete ? mapConfidenceBandToExecutiveConfidence(packet.confidenceBand) : "moderate";
  }
  return mapConfidenceBandToExecutiveConfidence(packet.confidenceBand);
}

function mapVerificationStateToDirectness(
  state: UnifiedFindingDisplayPacket["presentationDecision"]["verificationState"]
): CertScoreFindingDirectness {
  if (state === "verified" || state === "runtime") {
    return "direct";
  }
  if (state === "blocked") {
    return "inferred";
  }
  return "mixed";
}

function mapSeverity(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingSeverity {
  if (findingId === "pre_consent_tracking_detected" && packet.severity === "high") {
    return "critical";
  }
  if (
    findingId === "reject_tracking_persists_after_reject" &&
    packet.severity === "high" &&
    packet.evidence?.flags?.includes("reject_evidence_confirmed")
  ) {
    return "critical";
  }
  if (findingId === "reject_tracking_persists_after_reject" && !packet.evidence?.flags?.includes("reject_evidence_confirmed")) {
    return "medium";
  }
  if (findingId === "policy_behavior_contradiction_detected" && !isSpecificPolicyRuntimeContradiction(packet)) {
    return "medium";
  }
  if (findingId === "fingerprinting_related_signals_observed") {
    const tier = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier;
    return tier >= 2 ? "medium" : "low";
  }
  if (findingId === "probable_fingerprinting") {
    return deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier >= 3 ? "high" : "medium";
  }
  if (packet.severity === "high") {
    return "high";
  }
  if (packet.severity === "medium") {
    return "medium";
  }
  return "low";
}

function trimTrailingSentencePunctuation(value: string) {
  return value.trim().replace(/[.,;:!?]+$/g, "");
}

function getMappedFindingId(
  packet: UnifiedFindingDisplayPacket
): keyof typeof CERT_SCORE_FINDING_REGISTRY | null {
  if (packet.unifiedFindingId === "fingerprinting_observed") {
    const tier = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier;
    if (tier <= 0) {
      return null;
    }
    return tier >= 3 && !hasFingerprintingProbableAccessLimitation(packet)
      ? "probable_fingerprinting"
      : "fingerprinting_related_signals_observed";
  }
  if (packet.unifiedFindingId in CERT_SCORE_FINDING_REGISTRY) {
    return packet.unifiedFindingId as keyof typeof CERT_SCORE_FINDING_REGISTRY;
  }
  if (packet.unifiedFindingId in UNIFIED_FINDING_ID_TO_CERT_FINDING_ID) {
    return UNIFIED_FINDING_ID_TO_CERT_FINDING_ID[packet.unifiedFindingId] ?? null;
  }
  if (packet.details?.family === "contradiction" || CONTRADICTION_FINDING_IDS.has(packet.unifiedFindingId)) {
    return "policy_behavior_contradiction_detected";
  }
  return null;
}

function hasFingerprintingProbableAccessLimitation(packet: UnifiedFindingDisplayPacket) {
  if (
    packet.concernContext?.negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed") ||
    packet.concernContext?.negativeEvidenceFlags.includes("positive_surface_content_unverified")
  ) {
    return true;
  }

  const accessSurfaceValues = uniqueStrings([
    ...getEntityValues(packet, /block.*page.*classification|block.*classification|access.*block|access.*limitation|stop.*reason/i),
    ...(packet.evidence?.flags ?? []).filter((flag) => /block|captcha|interstitial|login|auth|403|thin|geo/i.test(flag))
  ]).map((value) => value.trim().toLowerCase());

  return accessSurfaceValues.some((value) => FINGERPRINTING_PROBABLE_BLOCK_SURFACES.has(value));
}

function hasFingerprintingRelatedReviewContext(packet: UnifiedFindingDisplayPacket) {
  const rawEvidence = buildFingerprintingRawEvidence(packet);
  const fingerprintEvidenceTier = deriveFingerprintEvidenceTier(rawEvidence);
  return (
    fingerprintEvidenceTier.strongFingerprintSignals.length > 0 ||
    fingerprintEvidenceTier.genericFingerprintSignals.length > 0 ||
    Array.isArray(rawEvidence.fingerprintRuntimeEvidence) && rawEvidence.fingerprintRuntimeEvidence.length > 0 ||
    uniqueStrings(rawEvidence.requestUrls as Array<string | null | undefined>).length > 0 ||
    uniqueStrings(rawEvidence.runtimeVendors as Array<string | null | undefined>).length > 0
  );
}

function buildFingerprintingRawEvidence(packet: UnifiedFindingDisplayPacket): Record<string, unknown> {
  const entities = packet.evidence?.entities ?? {};
  const fingerprintRuntimeEvidence = [
    ...(entities.fingerprintingRuntimeEvidence ?? []),
    ...(entities.fingerprintRuntimeEvidence ?? [])
  ].flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as Record<string, unknown>] : [];
    } catch {
      return [{ value }];
    }
  });
  const fingerprintAttributeCategories = uniqueStrings([
    ...(entities.fingerprintAttributeCategories ?? []),
    ...(entities.fingerprintingSignals ?? []),
    ...(entities.highEntropySignals ?? [])
  ]);
  const fingerprintTier = packet.evidence?.counts?.fingerprintTier;
  const identifierLikeRequestCount = packet.evidence?.counts?.identifierLikeRequestCount;
  const deviceDataLikeRequestCount = packet.evidence?.counts?.deviceDataLikeRequestCount;
  const entropyTransmissionObserved = packet.evidence?.counts?.entropyTransmissionObserved ?? entities.entropyTransmissionObserved?.[0];
  const entropyLinkedToIdentifier = packet.evidence?.counts?.entropyLinkedToIdentifier ?? entities.entropyLinkedToIdentifier?.[0];
  const crossContextLinkageObserved = packet.evidence?.counts?.crossContextLinkageObserved ?? entities.crossContextLinkageObserved?.[0];

  return {
    fingerprintAttributeCategories,
    fingerprintRuntimeEvidence,
    fingerprintSummary: {
      ...(typeof fingerprintTier === "number" ? { tier: fingerprintTier } : {}),
      ...(fingerprintAttributeCategories.length > 0 ? { fingerprintingSignals: fingerprintAttributeCategories } : {}),
      ...(typeof identifierLikeRequestCount === "number" ? { identifierLikeRequestCount } : {}),
      ...(typeof deviceDataLikeRequestCount === "number" ? { deviceDataLikeRequestCount } : {}),
      ...(typeof entropyTransmissionObserved === "boolean" ? { entropyTransmissionObserved } : {}),
      ...(typeof entropyLinkedToIdentifier === "boolean" ? { entropyLinkedToIdentifier } : {}),
      ...(typeof crossContextLinkageObserved === "boolean" ? { crossContextLinkageObserved } : {})
    },
    fingerprintTier,
    ...(typeof identifierLikeRequestCount === "number" ? { identifierLikeRequestCount } : {}),
    ...(typeof deviceDataLikeRequestCount === "number" ? { deviceDataLikeRequestCount } : {}),
    ...(typeof entropyTransmissionObserved === "boolean" ? { entropyTransmissionObserved } : {}),
    ...(typeof entropyLinkedToIdentifier === "boolean" ? { entropyLinkedToIdentifier } : {}),
    ...(typeof crossContextLinkageObserved === "boolean" ? { crossContextLinkageObserved } : {}),
    requestUrls: uniqueStrings([
      ...(packet.evidence?.sourceUrls ?? []),
      ...getEntityUrlValues(packet, /runtime.*request|request.*url|evidence.*url|fingerprint.*url/i),
      ...fingerprintRuntimeEvidence.flatMap((row) => [
        getRecordString(row, ["requestUrl", "request_url", "url", "redactedUrl", "redacted_url"]),
        ...getRecordStringArray(row, ["requestUrls", "request_urls", "urls"])
      ])
    ]),
    runtimeVendors: uniqueStrings([
      ...getEntityValues(packet, /runtime.*vendor|vendor/i),
      ...fingerprintRuntimeEvidence.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "vendor_name", "hostname", "host"]))
    ])
  };
}

function getRawFingerprintTier(rawEvidence: Record<string, unknown> | null | undefined) {
  if (!rawEvidence) {
    return null;
  }
  const directTier = getRecordNumber(rawEvidence, ["fingerprintTier", "fingerprint_tier"]);
  if (directTier !== null) {
    return directTier;
  }
  const summary = rawEvidence.fingerprintSummary ?? rawEvidence.fingerprint_summary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    return getRecordNumber(summary as Record<string, unknown>, ["tier"]);
  }
  return null;
}

function deriveRejectOptionSubtype(packet: UnifiedFindingDisplayPacket) {
  const rejectPath = getFirstEntityJsonObject(packet, "rejectPathDepthAndAvailability");
  const rejectDepthClass = getEntityValues(packet, /^rejectDepthClass$/i)[0] ?? null;
  const availability =
    getRecordString(rejectPath ?? {}, ["availability", "status", "outcome"]) ??
    (rejectDepthClass === "missing" ? "not_found" : rejectDepthClass === "hidden" ? "hidden" : null);
  const rejectAvailableOnFirstLayer =
    rejectPath?.rejectAvailableOnFirstLayer === true ||
    rejectPath?.reject_available_on_first_layer === true ||
    rejectDepthClass === "same_layer";
  const preferencesRequiredBeforeReject =
    rejectPath?.preferencesRequiredBeforeReject === true ||
    rejectPath?.preferences_required_before_reject === true ||
    rejectDepthClass === "second_layer";
  const choiceAsymmetry = getRecordString(rejectPath ?? {}, ["choiceAsymmetry", "choice_asymmetry"]);
  const acceptDepth = getRecordNumber(rejectPath ?? {}, ["acceptClickDepth", "accept_click_depth"]);
  const rejectDepth = getRecordNumber(rejectPath ?? {}, ["rejectClickDepth", "reject_click_depth", "depth"]);

  if (availability === "hidden" || rejectDepthClass === "hidden") {
    return "reject_present_but_visually_hidden";
  }
  if (preferencesRequiredBeforeReject || rejectDepthClass === "second_layer") {
    return "reject_requires_preferences_path";
  }
  if (availability === "not_found" || availability === "unavailable" || availability === "absent" || rejectDepthClass === "missing") {
    return "reject_absent_first_layer";
  }
  if (
    choiceAsymmetry === "material" ||
    choiceAsymmetry === "minor" ||
    (typeof acceptDepth === "number" && typeof rejectDepth === "number" && rejectDepth > acceptDepth)
  ) {
    return "reject_depth_asymmetry";
  }
  if (rejectAvailableOnFirstLayer === false) {
    return "reject_absent_first_layer";
  }
  return "reject_path_ambiguous";
}

function getFingerprintPromotionAnnotation(
  rawEvidence: Record<string, unknown> | null | undefined,
  tierResult: ReturnType<typeof deriveFingerprintEvidenceTier> | null
) {
  const rawTier = getRawFingerprintTier(rawEvidence);
  if (tierResult?.tier === 3 && rawTier === 2 && tierResult.knownFingerprintingVendorObserved) {
    return "tier_2_runtime_vendor_promoted";
  }
  return null;
}

const STRONG_FINGERPRINT_SIGNAL_LABELS: Record<string, string> = {
  audio: "audio environment access",
  audio_context: "audio environment access",
  canvas: "canvas/WebGL access",
  canvas_webgl: "canvas/WebGL access",
  font_metrics: "font metric collection",
  fonts: "font/plugin enumeration",
  fonts_plugins: "font/plugin enumeration",
  hardware: "hardware/device attribute collection",
  webgl: "canvas/WebGL access"
};

const GENERIC_FINGERPRINT_SIGNAL_LABELS: Record<string, string> = {
  input_touch: "touch/input capability",
  network_device_state: "network/device state",
  screen_viewport: "screen/viewport",
  storage: "storage capability",
  timezone_locale: "timezone/locale"
};

function normalizeFingerprintSignal(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function formatFingerprintSignalLabel(value: string) {
  const normalized = normalizeFingerprintSignal(value);
  return STRONG_FINGERPRINT_SIGNAL_LABELS[normalized] ??
    GENERIC_FINGERPRINT_SIGNAL_LABELS[normalized] ??
    normalized.replace(/_/g, " ");
}

function getFingerprintSignalGroups(packet: UnifiedFindingDisplayPacket) {
  const rawEvidence = buildFingerprintingRawEvidence(packet);
  const signals = Array.isArray(rawEvidence.fingerprintAttributeCategories)
    ? (rawEvidence.fingerprintAttributeCategories as string[])
    : [];
  const strongSignals = uniqueStrings(
    signals
      .map(normalizeFingerprintSignal)
      .filter((signal) => signal in STRONG_FINGERPRINT_SIGNAL_LABELS)
  );
  const genericSignals = uniqueStrings(
    signals
      .map(normalizeFingerprintSignal)
      .filter((signal) => !(signal in STRONG_FINGERPRINT_SIGNAL_LABELS))
  );

  return {
    genericSignals,
    genericSignalLabels: uniqueStrings(genericSignals.map(formatFingerprintSignalLabel)),
    strongSignals,
    strongSignalLabels: uniqueStrings(strongSignals.map(formatFingerprintSignalLabel))
  };
}

function hasConcreteConsentDarkPatternEvidence(packet: UnifiedFindingDisplayPacket) {
  const snippets = packet.evidence?.snippets ?? [];
  const hasSpecificUiSnippet = snippets.some((snippet) => {
    const normalized = snippet.trim();
    return (
      normalized.length > 0 &&
      !/promotional or choice architecture may need closer disclosure review/i.test(normalized) &&
      /accept|reject|dismiss|consent|banner|button|choice|layer|overlay|preference/i.test(normalized)
    );
  });
  if (hasSpecificUiSnippet) {
    return true;
  }

  const entities = packet.evidence?.entities ?? {};
  return Object.entries(entities).some(([key, values]) => {
    if (!/accept|reject|dismiss|consent|banner|button|choice|layer|overlay|preference|visual|ui/i.test(key)) {
      return false;
    }
    return values.some((value) => value.trim().length > 0);
  });
}

function hasThirdPartyCookiePreConsentEvidence(packet: UnifiedFindingDisplayPacket) {
  if (packet.unifiedFindingId !== "preconsent_tracking") {
    return false;
  }

  const details = buildPreConsentTrackingEvidenceDetails(packet);
  const cookieRows = getEntityJsonObjects(packet, "preconsent_cookie_evidence");
  const thirdPartyTrackingCookieRows = cookieRows.filter((row) => {
    const timingEvidence = getRecordString(row, ["timingEvidence", "timing_evidence"]);
    const party = getRecordString(row, ["party", "cookiePartyType", "cookie_party_type"]);
    const category = getRecordString(row, ["category", "cookieCategory", "cookie_category", "vendorCategory", "vendor_category"]);
    const promotionCategory = /analytics|advertising|marketing|retargeting|session_replay|dmp|personalization/i.test(category ?? "");
    const cookieName = getRecordString(row, ["cookieName", "cookie_name"]);
    const vendorOrHost = getRecordString(row, [
      "vendor",
      "cookieInitiatorVendor",
      "cookie_initiator_vendor",
      "responseHost",
      "response_host",
      "cookieInitiatorDomain",
      "cookie_initiator_domain",
      "domain"
    ]);
    const nonEssential = row.nonEssential === true || row.non_essential === true || promotionCategory;
    const beforeConsent =
      timingEvidence === "before_consent_cookie_write" ||
      (timingEvidence === null && (row.beforeConsent === true || row.before_consent === true));
    return (
      beforeConsent &&
      (party === "third_party" || row.thirdParty === true || row.third_party === true) &&
      nonEssential &&
      promotionCategory &&
      Boolean(cookieName && vendorOrHost)
    );
  });
  const preconsentCookieNames = getEntityValues(packet, /^preconsent_(?:nonessential_)?cookie_names$/i);
  const preconsentCookieCategories = getEntityValues(packet, /^preconsent_cookie_categories$/i);
  const preconsentCookieTimingEvidence = getEntityValues(packet, /^preconsent_cookie_timing_evidence$/i);
  const cookieCount =
    details?.counts?.preConsentTrackingCookies ??
    getCountValue(packet, [
      "preConsentTrackingCookies",
      "preconsentCookieCount",
      "preconsent_cookie_before_consent_count",
      "thirdPartyCookiePreConsentCount"
    ]) ??
    thirdPartyTrackingCookieRows.length;
  const hasNamedPreconsentTrackingCookie =
    thirdPartyTrackingCookieRows.length > 0 &&
    preconsentCookieNames.length > 0 &&
    preconsentCookieTimingEvidence.includes("before_consent_cookie_write") &&
    (
      preconsentCookieCategories.some((category) => /analytics|advertising|marketing|retargeting|session_replay|dmp|personalization/i.test(category)) ||
      (packet.evidence?.entities?.preconsent_nonessential_cookie_names?.length ?? 0) > 0
    );

  return (
    (typeof cookieCount === "number" && cookieCount > 0 && thirdPartyTrackingCookieRows.length > 0) ||
    hasNamedPreconsentTrackingCookie ||
    (thirdPartyTrackingCookieRows.length > 0 &&
      packet.evidence?.flags?.some((flag) => /third_party_cookie.*pre.?consent|third_party_cookie_set_before_consent/i.test(flag)) === true)
  );
}

function getMappedFindingIds(packet: UnifiedFindingDisplayPacket): Array<keyof typeof CERT_SCORE_FINDING_REGISTRY> {
  const primary = getMappedFindingId(packet);
  const ids = primary ? [primary] : [];

  if (
    primary === "consent_dark_patterns_detected" &&
    UMBRELLA_DARK_PATTERN_PACKET_IDS.has(packet.unifiedFindingId) &&
    !hasConcreteConsentDarkPatternEvidence(packet)
  ) {
    return [];
  }

  if (
    primary === "possible_session_replay_on_sensitive_input_surface" &&
    !ids.includes("sensitive_data_collection_with_third_party_tracking_present")
  ) {
    ids.push("sensitive_data_collection_with_third_party_tracking_present");
  }

  if (packet.unifiedFindingId === "reject_button_missing" && !ids.includes("consent_dark_patterns_detected")) {
    ids.push("consent_dark_patterns_detected");
  }

  if (hasThirdPartyCookiePreConsentEvidence(packet) && !ids.includes("third_party_cookie_pre_consent")) {
    ids.push("third_party_cookie_pre_consent");
  }

  return ids;
}

function buildEvidencePreview(packet: UnifiedFindingDisplayPacket, findingId?: keyof typeof CERT_SCORE_FINDING_REGISTRY) {
  const evidenceDetails = findingId ? buildExecutiveEvidenceDetails(packet, findingId) : null;

  if (findingId === "policy_behavior_contradiction_detected" && evidenceDetails?.policyRuntimeConflict) {
    const conflict = evidenceDetails.policyRuntimeConflict;
    const runtimeEvent = getPolicyRuntimeRepresentativeEvent(conflict);
    return uniqueStrings([
      conflict.policyAnchor.snippet ? `Policy claim: "${formatQuotedSnippet(conflict.policyAnchor.snippet)}"` : "Policy claim: not displayed from retained evidence.",
      conflict.policyAnchor.sourceUrl ? `Policy source: ${conflict.policyAnchor.sourceUrl}` : "Policy source: not retained.",
      runtimeEvent ? `Runtime event: ${runtimeEvent}` : "Runtime event: no concrete timed or consent-phased runtime event was retained.",
      conflict.conflictBridge.reasoning ? `Bridge: ${conflict.conflictBridge.reasoning}` : "Bridge: no explicit policy/runtime bridge was retained."
    ]).slice(0, 4);
  }

  if (findingId === "pre_consent_tracking_detected" && evidenceDetails) {
    const vendorNames = (evidenceDetails.vendors ?? []).map((vendor) => vendor.name).slice(0, 5);
    const firstRequest = evidenceDetails.representativeRequests?.[0];
    return uniqueStrings([
      vendorNames.length > 0
        ? `Before any consent choice was observed, third-party tracking requests were initiated to ${formatVendorList(vendorNames)}.`
        : packet.summary,
      evidenceDetails.consentState
        ? evidenceDetails.consentState.userConsentActionObserved
          ? "A consent action was observed, and tracking timing should be compared against that action."
          : "No accept, reject, manage, or close interaction was recorded before the tracking evidence."
        : null,
      typeof evidenceDetails.timing?.firstThirdPartyTrackingRequestMs === "number"
        ? `First classified third-party tracking request was observed at ${evidenceDetails.timing.firstThirdPartyTrackingRequestMs}ms.`
        : null,
      firstRequest ? `Representative pre-consent tracking request: ${firstRequest.url}` : null
    ]).slice(0, 4);
  }

  if (findingId === "cross_domain_identifier_sharing_observed" && evidenceDetails) {
    const rows = evidenceDetails.crossDomainIdentifierSharingEvidence ?? [];
    const destinations = uniqueStrings(
      rows.flatMap((row) => [
        getRecordString(row, ["destinationEtldPlusOne", "destination_etld_plus_one"]),
        getRecordString(row, ["destinationDomain", "destination_domain"])
      ])
    );
    const identifierKeys = uniqueStrings(rows.flatMap((row) => getRecordString(row, ["key"]) ?? []));
    const firstRequest = evidenceDetails.representativeRequests?.[0];
    return uniqueStrings([
      packet.summary,
      destinations.length > 0
        ? `Identifier-like request evidence was retained for ${destinations.slice(0, 3).join(", ")}.`
        : null,
      identifierKeys.length > 0 ? `Identifier query keys retained: ${identifierKeys.slice(0, 5).join(", ")}.` : null,
      firstRequest ? `Representative identifier-sharing request: ${firstRequest.url}` : null
    ]).slice(0, 4);
  }

  if (findingId === "probable_fingerprinting" || findingId === "fingerprinting_related_signals_observed") {
    const groups = getFingerprintSignalGroups(packet);
    const rawEvidence = buildFingerprintingRawEvidence(packet);
    const tierResult = deriveFingerprintEvidenceTier(rawEvidence);
    const promotionAnnotation = getFingerprintPromotionAnnotation(rawEvidence, tierResult);
    return uniqueStrings([
      findingId === "probable_fingerprinting"
        ? tierResult.knownFingerprintingVendorObserved
          ? "Why this surfaced: probable browser/device fingerprinting behavior was observed. The scan detected coordinated collection of high-entropy browser/device attributes and subsequent third-party network activity associated with a known bot-defense/fingerprinting vendor."
          : "Why this surfaced: probable browser/device fingerprinting behavior was observed. The scan detected coordinated collection of high-entropy browser/device attributes with runtime corroboration."
        : tierResult.tier >= 2
          ? "Why this surfaced: coordinated browser/device entropy collection was retained for review, with no retained proof of identity-oriented fingerprinting."
          : "Why this surfaced: elevated browser/device entropy collection was retained for review, with no retained proof of identity-oriented fingerprinting.",
      findingId === "probable_fingerprinting"
        ? "Purpose framing: this may be used for fraud prevention or security, but it can still create privacy review obligations depending on jurisdiction, disclosure, consent posture, and data sharing."
        : null,
      promotionAnnotation ? `Internal annotation: ${promotionAnnotation}.` : null,
      groups.strongSignalLabels.length > 0
        ? `Stronger retained primitives: ${groups.strongSignalLabels.join(", ")}.`
        : null,
      groups.genericSignalLabels.length > 0
        ? `Additional browser context: ${groups.genericSignalLabels.join(", ")}.`
        : null,
      findingId === "probable_fingerprinting"
        ? `Confidence basis: ${tierResult.confidenceExplanation}`
        : `Confidence basis: ${tierResult.confidenceExplanation}`,
      findingId === "probable_fingerprinting"
        ? null
        : "Observed signals may also appear in fraud prevention, performance optimization, or advanced analytics contexts.",
      findingId === "probable_fingerprinting"
        ? null
        : "Observed browser entropy collection alone does not establish cross-site identity tracking.",
      "This does not independently establish a legal determination."
    ]).slice(0, findingId === "probable_fingerprinting" ? 6 : 5);
  }

  return uniqueStrings([
    packet.summary,
    packet.observedValue,
    ...(evidenceDetails?.runtimeVendors ?? []).map((vendor) => `Runtime vendor: ${vendor}`),
    ...(evidenceDetails?.runtimeRequestUrls ?? []).slice(0, 2).map((url) => `Runtime request: ${url}`),
    findingId === "reject_tracking_persists_after_reject" && evidenceDetails?.consentInteraction
      ? `Reject action detected: ${String(evidenceDetails.consentInteraction.action_type ?? "unknown")} via ${String(evidenceDetails.consentInteraction.selector ?? "unknown selector")}.`
      : null,
    findingId === "reject_tracking_persists_after_reject" && evidenceDetails?.postRejectNonEssentialRequests
      ? `Post-reject non-essential request count: ${evidenceDetails.postRejectNonEssentialRequests.length}.`
      : null,
    ...(findingId === "reject_tracking_persists_after_reject"
      ? (evidenceDetails?.postRejectNonEssentialRequests ?? []).slice(0, 2).flatMap((row) => [
          typeof row.ms_after_reject === "number" ? `First post-reject tracker request: ${row.ms_after_reject}ms after reject.` : null,
          typeof row.url === "string" ? `Sample URL: ${row.url}` : null
        ])
      : []),
    ...(evidenceDetails?.offerSnippets ?? []).slice(0, 2).map((snippet) => `Offer: ${truncateDisplaySnippet(snippet)}`),
    ...(evidenceDetails?.disclosureFindings ?? []).slice(0, 2),
    ...(evidenceDetails?.sourceUrls ?? []).slice(0, 2).map((url) => `Source: ${url}`),
    ...(packet.evidence?.snippets ?? []).map((snippet) => truncateDisplaySnippet(snippet)),
    ...(packet.evidence?.sourceUrls ?? []).slice(0, 2),
    ...packet.sourceRefs.flatMap((sourceRef) => {
      if (sourceRef.kind === "signal") {
        return sourceRef.label ?? null;
      }
      if (sourceRef.kind === "validation") {
        return sourceRef.title ?? sourceRef.ruleKey;
      }
      return sourceRef.title ?? null;
    })
  ]).slice(0, 4);
}

function buildEvidenceRefs(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings([
    packet.primaryPageUrl,
    packet.referenceUrl,
    packet.sourceUrl,
    ...(packet.evidence?.pageUrls ?? []),
    ...(packet.evidence?.sourceUrls ?? [])
  ]).slice(0, 4);
}

const SESSION_REPLAY_VENDOR_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Microsoft Clarity", pattern: /microsoft\s+clarity|clarity\.ms|\bclarity\b/i },
  { label: "FullStory", pattern: /fullstory|fullstory\.com/i },
  { label: "Hotjar", pattern: /hotjar|hotjar\.com/i },
  { label: "Qualtrics SiteIntercept", pattern: /qualtrics|siteintercept/i },
  { label: "LogRocket", pattern: /logrocket|logrocket\.com/i },
  { label: "Mouseflow", pattern: /mouseflow|mouseflow\.com/i },
  { label: "Smartlook", pattern: /smartlook|smartlook\.com/i },
  { label: "Contentsquare", pattern: /contentsquare|contentsquare\.com/i },
  { label: "Quantum Metric", pattern: /quantum\s+metric|quantummetric\.com/i },
  { label: "Crazy Egg", pattern: /crazy\s*egg|crazyegg\.com/i },
  { label: "Inspectlet", pattern: /inspectlet|inspectlet\.com/i },
  { label: "Lucky Orange", pattern: /lucky\s+orange|luckyorange\.com/i },
  { label: "Glassbox", pattern: /glassbox|glassboxdigital\.io|glassboxcdn\.com/i }
];

const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|fullstory\.com|hotjar\.com|qualtrics|siteintercept|logrocket\.com|mouseflow\.com|smartlook\.com|contentsquare\.com|quantummetric\.com|crazyegg\.com|inspectlet\.com|luckyorange\.com|glassboxdigital\.io|glassboxcdn\.com/i;

function getUrlHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function getUrlQueryKeysSample(value: string) {
  try {
    return [...new URL(value).searchParams.keys()].slice(0, 8);
  } catch {
    return [];
  }
}

const IDENTIFIER_QUERY_KEY_PATTERN =
  /^(?:uid|uuid|user_id|userid|visitor|visitor_id|client_id|cid|fbp|fbc|gclid|msclkid|ttclid|rdt_uuid|email|hashed|hash|identity|id|partnerid|partner_uid|partner_id|uid2|euid|id5id|tdid)$/i;

function getRepresentativeRequestDetails(urls: string[], vendors: string[]) {
  return urls.slice(0, 8).map((url, index) => {
    const hostname = getUrlHostname(url) ?? url;
    const vendor = inferVendorNameFromUrl(url, vendors) ?? vendors[index] ?? null;
    return {
      url,
      hostname,
      vendor,
      category: classifyTrackingCategory(`${vendor ?? ""} ${hostname} ${url}`),
      resourceType: /\.js(?:[?#]|$)|\/gtm\.js|script/i.test(url) ? "script" : null,
      firstSeenMs: null,
      thirdParty: true,
      preConsent: false,
      identifierLike: isLikelyIdentifierRequest(url),
      deviceDataLike: isLikelyDeviceDataRequest(url),
      queryKeysSample: getUrlQueryKeysSample(url)
    };
  });
}

function getVendorDetails(vendors: string[], representativeRequests: Array<{ vendor: string | null; url: string; firstSeenMs: number | null; category: string | null }>) {
  return vendors.slice(0, 8).map((name) => {
    const matchingRequest = representativeRequests.find((request) => request.vendor === name);
    return {
      name,
      category: matchingRequest?.category ?? classifyTrackingCategory(name),
      preConsent: false,
      representativeUrl: matchingRequest?.url ?? null,
      firstSeenMs: matchingRequest?.firstSeenMs ?? null
    };
  });
}

function getNumberFromRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getStringFromRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function buildIdentifierEvidence(representativeRequests: Array<{ identifierLike: boolean; deviceDataLike: boolean }>) {
  const identifierLikeRequestCount = representativeRequests.filter((request) => request.identifierLike).length;
  const deviceDataLikeRequestCount = representativeRequests.filter((request) => request.deviceDataLike).length;
  return {
    addressingOrSignalingTransmittedByRequest: representativeRequests.length > 0,
    basis: representativeRequests.length > 0
      ? ["third_party_http_requests", "ip_address_transmitted_by_network_request"]
      : [],
    interpretation: "Standard browser HTTP requests to third-party domains transmit network-level addressing information required for routing.",
    identifierLikeRequestCount,
    deviceDataLikeRequestCount
  };
}

function classifyTrackingCategory(value: string) {
  const normalized = value.toLowerCase();
  if (/tagmanager|gtm|tealium|ensighten|launch/i.test(normalized)) {
    return "tag_manager";
  }
  if (/clarity|hotjar|fullstory|session|replay|mouseflow|smartlook|contentsquare|qualtrics/i.test(normalized)) {
    return "session_replay";
  }
  if (/facebook|meta|doubleclick|googleadservices|ads|adnxs|rubicon|pubmatic|taboola|reddit|linkedin|licdn|tiktok|snap|bing|trade.?desk|adsrvr|rlcdn|demdex|pixel/i.test(normalized)) {
    return "advertising";
  }
  if (/hubspot|klaviyo|marketo|pardot|mailchimp|intentsify/i.test(normalized)) {
    return "marketing_automation";
  }
  if (/analytics|heap|amplitude|segment|mixpanel|google-analytics|googletagmanager/i.test(normalized)) {
    return "analytics";
  }
  return "tracking";
}

function isLikelyIdentifierRequest(url: string) {
  try {
    return [...new URL(url).searchParams.keys()].some((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key));
  } catch {
    return /[?&](?:uid|uuid|user_id|userid|visitor|visitor_id|client_id|cid|fbp|fbc|gclid|msclkid|ttclid|rdt_uuid|email|hashed|hash|identity|id|partnerid|partner_uid|partner_id|uid2|euid|id5id|tdid)=/i.test(url);
  }
}

function isLikelyDeviceDataRequest(url: string) {
  return /[?&](?:ua|user_agent|screen|viewport|resolution|device|browser|os|language|timezone|tz)=/i.test(url);
}

function normalizeVendorMatchKey(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function inferVendorNameFromUrl(url: string, vendors: string[]) {
  const normalizedUrl = normalizeVendorMatchKey(url);
  return vendors.find((vendor) => {
    const normalizedVendor = normalizeVendorMatchKey(vendor);
    if (!normalizedVendor) {
      return false;
    }
    return normalizedUrl.includes(normalizedVendor) ||
      (normalizedVendor.includes("google") && /googletagmanager|googleadservices|doubleclick/i.test(url)) ||
      (normalizedVendor.includes("hubspot") && /hs-scripts|hubspot/i.test(url)) ||
      (normalizedVendor.includes("linkedin") && /licdn|linkedin/i.test(url)) ||
      (normalizedVendor.includes("reddit") && /reddit/i.test(url)) ||
      (normalizedVendor.includes("microsoftclarity") && /clarity\.ms/i.test(url)) ||
      (normalizedVendor.includes("meta") && /facebook|fbevents/i.test(url));
  }) ?? null;
}

function sortRepresentativeRequestsByVendorCoverage<
  T extends { url: string; vendor: string | null; firstSeenMs: number | null }
>(requests: T[], vendors: string[]) {
  const selected: T[] = [];
  const usedUrls = new Set<string>();

  for (const vendor of vendors) {
    const match = requests.find((request) => {
      if (usedUrls.has(request.url)) {
        return false;
      }
      return request.vendor === vendor || inferVendorNameFromUrl(request.url, [vendor]) === vendor;
    });
    if (match) {
      usedUrls.add(match.url);
      selected.push(match);
    }
  }

  for (const request of requests) {
    if (!usedUrls.has(request.url)) {
      selected.push(request);
      usedUrls.add(request.url);
    }
  }

  return selected.slice(0, 8);
}

function buildPreConsentTimingAnalysis(input: {
  cmpVisibleMs: number | null;
  firstThirdPartyTrackingRequestMs: number | null;
  userConsentActionObserved: boolean;
  consentChoiceAtMs: number | null;
}) {
  const trackingBeforeConsentWindow =
    input.firstThirdPartyTrackingRequestMs !== null &&
    (!input.userConsentActionObserved ||
      input.consentChoiceAtMs === null ||
      input.firstThirdPartyTrackingRequestMs < input.consentChoiceAtMs);

  if (input.firstThirdPartyTrackingRequestMs === null) {
    return {
      trackingBeforeConsentWindow,
      basis: "Third-party tracking request timing was not retained, but no consent interaction was recorded before the tracking evidence."
    };
  }

  if (input.cmpVisibleMs === null) {
    return {
      trackingBeforeConsentWindow,
      basis: `First third-party tracking request (${input.firstThirdPartyTrackingRequestMs}ms) occurred before any recorded consent interaction.`
    };
  }

  return {
    trackingBeforeConsentWindow,
    basis: `First third-party tracking request (${input.firstThirdPartyTrackingRequestMs}ms) occurred after CMP became visible (${input.cmpVisibleMs}ms) and before any recorded consent interaction.`
  };
}

function buildPreConsentTrackingEvidenceDetails(
  packet: UnifiedFindingDisplayPacket
): CertScoreFindingEvidenceDetails | undefined {
  const vendorRows = getEntityJsonObjects(packet, "preconsent_tracker_vendor_evidence");
  const cookieRows = getEntityJsonObjects(packet, "preconsent_cookie_evidence");
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...getEntityUrlValues(packet, /^(?:preconsent_tracker_evidence_urls|runtimeRequestUrls|requestUrls|runtimeEvidenceUrls)$/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...(packet.evidence?.sourceUrls ?? []).filter((url) => /tag|pixel|collect|track|analytics|ads|clarity|hubspot|linkedin|facebook|reddit|tiktok|google/i.test(url))
  ]).slice(0, 8);
  const vendors = uniqueStrings([
    ...getEntityValues(packet, /^(?:preconsent_tracker_vendors|runtimeVendors)$/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.vendors ?? []) : []),
    ...vendorRows.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "name", "label"])),
    ...cookieRows.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "cookieInitiatorVendor", "cookie_initiator_vendor"]))
  ]).filter(isDisplayVendorName);

  const firstRequestMs = getCountValue(packet, ["firstRequestMs"]);
  const firstThirdPartyRequestMs = getCountValue(packet, ["firstThirdPartyTrackingRequestMs", "firstThirdPartyRequestMs"]);
  const cmpVisibleMs = getCountValue(packet, ["cmpVisibleMs", "consentBannerDetectedMs"]);
  const consentChoiceAtMs = getCountValue(packet, ["consentChoiceAtMs", "consentAcceptedAtMs", "consentRejectedAtMs"]);
  const userConsentActionObserved = consentChoiceAtMs !== null;
  const consentActionType =
    getEntityValues(packet, /consentActionType|consent_action_type/i)[0] ??
    (getCountValue(packet, ["consentRejectedAtMs"]) !== null
      ? "reject"
      : getCountValue(packet, ["consentAcceptedAtMs"]) !== null
        ? "accept"
        : null);

  const allRepresentativeRequests = requestUrls.map((url, index) => {
    const hostname = getUrlHostname(url) ?? url;
    const matchedRow = vendorRows.find((row) => {
      const rowUrl = getRecordString(row, ["url", "requestUrl", "representativeUrl", "urlSample"]);
      const rowHost = getRecordString(row, ["hostname", "host", "domain"]);
      return rowUrl === url || (rowHost !== null && hostname.includes(rowHost.replace(/^www\./, "").toLowerCase()));
    });
    const vendor = getRecordString(matchedRow ?? {}, ["vendor", "vendorName", "name", "label"]) ??
      inferVendorNameFromUrl(url, vendors) ??
      vendors[index] ??
      null;
    const category = getRecordString(matchedRow ?? {}, ["category", "vendorCategory", "classification"]) ?? classifyTrackingCategory(`${vendor ?? ""} ${hostname} ${url}`);
    return {
      url,
      hostname,
      vendor,
      category,
      resourceType: getRecordString(matchedRow ?? {}, ["resourceType", "type"]) ?? (/\.js(?:[?#]|$)|\/gtm\.js/i.test(url) ? "script" : null),
      firstSeenMs: getRecordNumber(matchedRow ?? {}, ["firstSeenMs", "first_seen_ms", "ms", "timestampMs"]) ?? firstThirdPartyRequestMs,
      thirdParty: true,
      preConsent: true,
      identifierLike: isLikelyIdentifierRequest(url),
      deviceDataLike: isLikelyDeviceDataRequest(url),
      queryKeysSample: getUrlQueryKeysSample(url)
    };
  });
  const representativeRequests = sortRepresentativeRequestsByVendorCoverage(allRepresentativeRequests, vendors);

  const vendorDetails = vendors.slice(0, 8).map((name) => {
    const matchingRequest = representativeRequests.find((request) =>
      request.vendor === name || classifyTrackingCategory(`${name} ${request.hostname}`) === request.category
    );
    return {
      name,
      category: matchingRequest?.category ?? classifyTrackingCategory(name),
      preConsent: true,
      representativeUrl: matchingRequest?.url ?? null,
      firstSeenMs: matchingRequest?.firstSeenMs ?? null
    };
  });

  const identifierLikeRequestCount = representativeRequests.filter((request) => request.identifierLike).length;
  const deviceDataLikeRequestCount = representativeRequests.filter((request) => request.deviceDataLike).length;
  const firstThirdPartyTrackingRequestMs = representativeRequests
    .map((request) => request.firstSeenMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right)[0] ?? firstThirdPartyRequestMs;

  const details: CertScoreFindingEvidenceDetails = {
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: false
    },
    consentState: {
      cmpDetected: cmpVisibleMs !== null ? true : null,
      cmpVisibleMs,
      userConsentActionObserved,
      consentActionType,
      trackingOccurredBeforeConsentChoice: !userConsentActionObserved ||
        (firstThirdPartyTrackingRequestMs !== null &&
          consentChoiceAtMs !== null &&
          firstThirdPartyTrackingRequestMs < consentChoiceAtMs)
    },
    consentBasis: "No accept, reject, manage, or close interaction was recorded before the listed tracking requests.",
    timingAnalysis: buildPreConsentTimingAnalysis({
      cmpVisibleMs,
      firstThirdPartyTrackingRequestMs,
      userConsentActionObserved,
      consentChoiceAtMs
    }),
    timing: {
      pageStartMs: 0,
      firstRequestMs,
      firstThirdPartyRequestMs,
      firstThirdPartyTrackingRequestMs,
      firstCookieSeenMs: getCountValue(packet, ["firstCookieSeenMs"]),
      firstTrackingCookieSeenMs: getCountValue(packet, ["firstTrackingCookieSeenMs", "firstPreConsentTrackingCookieSeenMs"])
    },
    counts: {
      totalPreConsentThirdPartyTrackingRequests:
        getCountValue(packet, ["preConsentThirdPartyTrackingRequests", "preconsentViolationCount", "preconsent_violation_count"]) ??
        representativeRequests.length,
      representativePreConsentTrackingRequests: representativeRequests.length,
      uniquePreConsentTrackingVendorsObserved:
        getCountValue(packet, ["preConsentTrackingVendors", "total_vendor_count", "preConsentVendorCount"]) ?? vendorDetails.length,
      preConsentTrackingCookies:
        getCountValue(packet, ["preConsentTrackingCookies", "preconsent_cookie_before_consent_count"]) ??
        (cookieRows.length > 0
          ? cookieRows.length
          : getEntityValues(packet, /^preconsent_(?:nonessential_)?cookie_names$/i).length),
      identifierLikeRequests: identifierLikeRequestCount
    },
    requestSelectionNote: "Representative requests are capped examples and are not exhaustive.",
    vendors: vendorDetails,
    representativeRequests,
    identifierEvidence: {
      addressingOrSignalingTransmittedByRequest: representativeRequests.length > 0,
      basis: representativeRequests.length > 0
        ? ["third_party_http_requests", "ip_address_transmitted_by_network_request"]
        : [],
      interpretation: "Standard browser HTTP requests to third-party domains transmit network-level addressing information required for routing.",
      identifierLikeRequestCount,
      deviceDataLikeRequestCount
    },
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: representativeRequests.length > 0 ? "supportive_runtime_signal" : "not_evaluated",
      gdprEprivacyConsentSupport: representativeRequests.length > 0 ? "strong_consent_timing_signal" : "not_evaluated",
      cpraSharingSupport: vendorDetails.some((vendor) => /advertising|retargeting|identity/i.test(vendor.category ?? ""))
        ? "possible"
        : "not_evaluated",
      ftcDarkPatternOrDeceptionSupport: "support_only"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "Network requests show browser-to-third-party communication, not the full downstream use of data."
    ]
  };

  return Object.keys(details).length > 0 ? details : undefined;
}

function buildRejectTrackingEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails {
  const consentInteraction = getFirstEntityJsonObject(packet, "consentInteraction");
  const promotionDecision = getFirstEntityJsonObject(packet, "promotionDecision");
  const rejectEvidenceDiff = getFirstEntityJsonObject(packet, "rejectEvidenceDiff");
  const postRejectNonEssentialRequests = getEntityJsonObjects(packet, "postRejectNonEssentialRequests");
  const suppressionChecks = getFirstEntityJsonObject(packet, "suppressionChecks");
  const confidenceRisks = getEntityValues(packet, /^confidenceRisks$/i);
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...getEntityUrlValues(packet, /runtime.*request|request.*url/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...postRejectNonEssentialRequests.flatMap((row) => getRecordString(row, ["url", "requestUrl", "urlSample"])),
    ...(packet.evidence?.sourceUrls ?? [])
  ]);
  const runtimeVendors = uniqueStrings([
    ...getRejectTrackingVendors(packet),
    ...postRejectNonEssentialRequests.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "name"]))
  ]).filter(isDisplayVendorName);
  const representativeRequests = postRejectNonEssentialRequests.length > 0
    ? postRejectNonEssentialRequests.slice(0, 8).map((row, index) => {
        const url = getRecordString(row, ["url", "requestUrl", "urlSample"]) ?? requestUrls[index] ?? "";
        const hostname = getRecordString(row, ["hostname", "host", "domain"]) ?? getUrlHostname(url) ?? null;
        const vendor = getRecordString(row, ["vendor", "vendorName", "name"]) ?? inferVendorNameFromUrl(url, runtimeVendors);
        return {
          url,
          hostname: hostname ?? "",
          vendor,
          category: getRecordString(row, ["category", "vendorCategory", "classification"]) ?? classifyTrackingCategory(`${vendor ?? ""} ${hostname ?? ""} ${url}`),
          resourceType: getRecordString(row, ["resourceType", "resource_type", "type"]),
          firstSeenMs: getRecordNumber(row, ["ts_ms", "firstSeenMs", "timestampMs"]),
          thirdParty: true,
          preConsent: false,
          identifierLike: isLikelyIdentifierRequest(url),
          deviceDataLike: isLikelyDeviceDataRequest(url),
          queryKeysSample: url ? getUrlQueryKeysSample(url) : []
        };
      })
    : getRepresentativeRequestDetails(requestUrls, runtimeVendors).map((request) => ({ ...request, preConsent: false }));
  const counts = Object.fromEntries(
    Object.entries(packet.evidence?.counts ?? {}).filter(([, value]) => Number.isFinite(value))
  );

  return {
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: true
    },
    consentState: {
      cmpDetected: null,
      cmpVisibleMs: null,
      userConsentActionObserved: Boolean(consentInteraction) || getCountValue(packet, ["consentOptOutClicks"]) !== null,
      consentActionType: getRecordString(consentInteraction ?? {}, ["action_type", "actionType"]) ?? "reject",
      trackingOccurredBeforeConsentChoice: false
    },
    rejectInteraction: consentInteraction ?? {
      observed: getCountValue(packet, ["consentOptOutClicks"]) !== null,
      actionType: "reject"
    },
    postRejectEvidence: {
      trackingPersistedAfterReject: packet.evidence?.flags?.includes("reject_evidence_confirmed") === true,
      postRejectNonEssentialRequestCount: representativeRequests.length,
      basis: packet.evidence?.flags?.includes("reject_evidence_confirmed")
        ? "A reject interaction and post-reject non-essential tracking evidence were retained."
        : "Tracking requests were retained during the consent flow, but post-reject timing was incomplete."
    },
    requestSelectionNote: "Representative post-reject requests are capped examples and are not exhaustive.",
    vendors: getVendorDetails(runtimeVendors, representativeRequests),
    representativeRequests,
    identifierEvidence: buildIdentifierEvidence(representativeRequests),
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: "not_evaluated",
      gdprEprivacyConsentSupport: "possible",
      cpraSharingSupport: "not_evaluated",
      ftcDarkPatternOrDeceptionSupport: "support_only"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "Post-reject evidence depends on the retained reject interaction and observation window."
    ],
    runtimeRequestUrls: requestUrls,
    runtimeVendors,
    evidenceFlags: uniqueStrings([...(packet.evidence?.flags ?? []), "reject_path_tracking_not_reduced"]),
    ...(consentInteraction ? { consentInteraction } : {}),
    ...(promotionDecision ? { promotionDecision } : {}),
    ...(rejectEvidenceDiff ? { rejectEvidenceDiff } : {}),
    ...(postRejectNonEssentialRequests.length > 0 ? { postRejectNonEssentialRequests: postRejectNonEssentialRequests.slice(0, 20) } : {}),
    ...(confidenceRisks.length > 0 ? { confidenceRisks } : {}),
    ...(suppressionChecks ? { suppressionChecks } : {})
  };
}

function buildSessionReplayEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails {
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...getSessionReplayRequestUrls(packet),
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|evidence.*url/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...(packet.evidence?.sourceUrls ?? [])
  ]);
  const vendors = uniqueStrings(getSessionReplayVendors(packet)).filter(isDisplayVendorName);
  const representativeRequests = getRepresentativeRequestDetails(requestUrls, vendors).map((request) => ({
    ...request,
    preConsent: false,
    category: "session_replay"
  }));
  const firstPartyProxyObserved = hasFirstPartyProxySessionReplayEvidence(packet, requestUrls);

  return {
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: false
    },
    counts: {
      representativeSessionReplayRequests: representativeRequests.length,
      sessionReplayVendorsObserved: vendors.length,
      firstPartyProxyEndpointsObserved: firstPartyProxyObserved ? 1 : 0
    },
    sessionReplayEvidence: {
      observed: true,
      firstPartyProxyObserved,
      basis: firstPartyProxyObserved
        ? "Session recording collection appears proxied through the scanned first-party host."
        : "Session recording vendor or request evidence was retained during runtime collection."
    },
    inputSurfaceEvidence: { evaluated: false },
    requestSelectionNote: "Representative session recording requests are capped examples and are not exhaustive.",
    vendors: getVendorDetails(vendors, representativeRequests),
    representativeRequests,
    identifierEvidence: buildIdentifierEvidence(representativeRequests),
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: "possible",
      gdprEprivacyConsentSupport: "possible",
      cpraSharingSupport: "not_evaluated",
      ftcDarkPatternOrDeceptionSupport: "support_only"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "Session recording detection identifies collection services, not the full contents captured by the vendor."
    ],
    runtimeRequestUrls: requestUrls,
    runtimeVendors: vendors,
    evidenceFlags: uniqueStrings([
      ...(packet.evidence?.flags ?? []),
      ...(firstPartyProxyObserved ? ["session_replay_first_party_proxy_collection"] : [])
    ]),
    ...(firstPartyProxyObserved
      ? { evidenceSnippets: ["FullStory collection appears proxied through the scanned first-party domain."] }
      : {})
  };
}

function buildRtbCookieSyncEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails {
  const syncRows = getEntityJsonObjects(packet, "rtbCookieSyncEvidence");
  const syncClassifications = classifyRtbCookieSyncEvidenceRows(syncRows);
  const subtypeCounts = syncClassifications.reduce<Record<string, number>>((counts, classification) => {
    counts[classification.subtype] = (counts[classification.subtype] ?? 0) + 1;
    return counts;
  }, {});
  const strongSubtypeCount = syncClassifications.filter((classification) => classification.subtype !== "sync_path_only").length;
  const weakSubtypeCount = syncClassifications.filter((classification) => classification.subtype === "sync_path_only").length;
  const detailRequestUrls = packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : [];
  const detailVendors = packet.details?.family === "consent_tracking" ? (packet.details.vendors ?? []) : [];
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|evidence.*url/i),
    ...detailRequestUrls,
    ...syncRows.flatMap((row) => getRecordString(row, ["url", "urlSample", "requestUrl"])),
    ...(packet.evidence?.sourceUrls ?? [])
  ]);
  const vendors = uniqueStrings([
    ...getEntityValues(packet, /rtb.*domain|runtime.*vendor|vendor/i),
    ...detailVendors
  ]).filter(isDisplayVendorName);
  const representativeRequests = getRepresentativeRequestDetails(requestUrls, vendors).map((request) => ({
    ...request,
    preConsent: packet.evidence?.flags?.some((flag) => /preconsent/i.test(flag)) === true
  })).map((request) => {
    const matchingRow = syncRows.find((row) => {
      const rowUrl = getRecordString(row, ["url", "urlSample", "requestUrl"]);
      const rowHost = getRecordString(row, ["hostname", "host", "domain"]);
      return rowUrl === request.url || (rowHost !== null && request.hostname.includes(rowHost));
    });
    const queryKeysSample = getRecordStringArray(matchingRow, ["queryKeysSample", "query_keys_sample"]).slice(0, 8);
    const effectiveQueryKeysSample = queryKeysSample.length > 0 ? queryKeysSample : request.queryKeysSample;
    return {
      ...request,
      queryKeysSample: effectiveQueryKeysSample,
      identifierLike: request.identifierLike || effectiveQueryKeysSample.some((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key))
    };
  });

  return {
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: false
    },
    counts: {
      totalRtbCookieSyncObservations:
        getCountValue(packet, ["rtb_cookie_sync_observation_count", "rtbCookieSyncObservationCount"]) ?? syncRows.length,
      representativeSyncRequests: representativeRequests.length,
      uniqueSyncVendorsObserved: vendors.length,
      identifierLikeRequests: representativeRequests.filter((request) => request.identifierLike).length,
      strongSyncEvidenceRows: strongSubtypeCount,
      syncPathOnlyRows: weakSubtypeCount
    },
    syncEvidence: {
      observed: true,
      basis: strongSubtypeCount > 0
        ? "Retained request evidence included identifier-query, cross-domain redirect, or known RTB/identity-sync endpoint patterns."
        : "Retained request evidence included multiple independent RTB/identity-sync endpoint patterns without retained identifier transfer.",
      subtypes: subtypeCounts,
      examples: syncRows.slice(0, 8)
    },
    cookieEvidence: { evaluated: false },
    requestSelectionNote: "Representative sync requests are capped examples and are not exhaustive.",
    vendors: getVendorDetails(vendors, representativeRequests),
    representativeRequests,
    identifierEvidence: buildIdentifierEvidence(representativeRequests),
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: "possible",
      gdprEprivacyConsentSupport: "possible",
      cpraSharingSupport: "possible",
      ftcDarkPatternOrDeceptionSupport: "not_evaluated"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "RTB and identity-sync patterns indicate request-level sharing signals, not the full downstream use of identifiers."
    ],
    runtimeRequestUrls: requestUrls,
    runtimeVendors: vendors,
    rtbCookieSyncEvidence: syncRows.slice(0, 12),
    rtbCookieSyncSubtypeCounts: subtypeCounts,
    rtbCookieSyncEvidenceSubtypes: uniqueStrings(syncClassifications.map((classification) => classification.subtype)),
    rtbCookieSyncRedirectTargets: uniqueStrings(
      syncClassifications.map((classification) => classification.redirectTargetHost).filter(Boolean)
    ),
    rtbCookieSyncIdentifierQueryKeys: uniqueStrings(syncClassifications.flatMap((classification) => classification.queryKeys))
      .filter((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key))
      .slice(0, 12),
    rtbCookieSyncWeakObservationCount: weakSubtypeCount,
    evidenceFlags: uniqueStrings(packet.evidence?.flags ?? [])
  };
}

function buildCpraCbaOptOutEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails {
  const vendors = uniqueStrings([
    ...getEntityValues(packet, /cba.*vendor|vendor|runtime.*vendor/i),
    ...getEntityValues(packet, /cbaVendorTier|advertisingSharingVendors/i)
  ]).filter(isDisplayVendorName);
  const optOutUiResult = uniqueStrings(getEntityValues(packet, /optOutUiResult|opt_out_ui_result/i))[0] ?? null;
  const optOutControlFound = parseBooleanEntity(getEntityValues(packet, /optOutControlFound|opt_out_control_found/i)[0]);
  const choiceControlsInspected = parseBooleanEntity(getEntityValues(packet, /choiceControlsInspected|choice_controls_inspected/i)[0]);
  const policyCbaLanguage = uniqueStrings(getEntityValues(packet, /policyCbaLanguage|policy_cba_language/i))[0] ?? null;
  const policyUiCongruent = parseBooleanEntity(getEntityValues(packet, /policyUiCongruent|policy_ui_congruent/i)[0]);
  const optOutSubtype = deriveCpraOptOutSubtype({ optOutControlFound, optOutUiResult });
  const snippets = uniqueStrings(packet.evidence?.snippets ?? []).map((snippet) => truncateDisplaySnippet(snippet)).slice(0, 3);
  const missingOrAbsent = optOutSubtype === "opt_out_absent";
  const basis = buildCpraOptOutBasis({
    fallbackSnippet: snippets[0],
    optOutSubtype,
    optOutUiResult,
    vendors
  });

  return {
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: false
    },
    counts: {
      cbaVendorsObserved: vendors.length,
      optOutControlsObserved: missingOrAbsent ? 0 : 1
    },
    jurisdictionOrPolicyContext: {
      framework: "CPRA",
      evaluatedSignal: "cross_context_behavioral_advertising_opt_out",
      policyCbaLanguage,
      policyEvidenceEvaluated: policyCbaLanguage !== null,
      policyUiCongruent
    },
    optOutControlEvidence: {
      evaluated: true,
      optOutSubtype,
      result: optOutUiResult,
      optOutControlFound,
      choiceControlsInspected,
      missingOrAbsent,
      incompleteOrUnconfirmed: !missingOrAbsent,
      basis
    },
    trackingOrSharingContext: {
      cbaVendorEvidenceObserved: vendors.length > 0,
      vendors: vendors.slice(0, 8)
    },
    vendors: vendors.slice(0, 8).map((name) => ({
      name,
      category: "advertising",
      preConsent: false,
      representativeUrl: null,
      firstSeenMs: null
    })),
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: "not_evaluated",
      gdprEprivacyConsentSupport: "not_evaluated",
      cpraSharingSupport: "possible",
      ftcDarkPatternOrDeceptionSupport: "support_only"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "Opt-out control detection may miss controls that require deeper navigation, geolocation, account state, or manual review."
    ],
    evidenceSnippets: snippets,
    evidenceFlags: uniqueStrings(packet.evidence?.flags ?? [])
  };
}

function parseBooleanEntity(value: string | null | undefined) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function deriveCpraOptOutSubtype(input: {
  optOutControlFound: boolean | null;
  optOutUiResult: string | null;
}): CpraOptOutSubtype {
  if (input.optOutControlFound === false || input.optOutUiResult === "absent") {
    return "opt_out_absent";
  }
  if (input.optOutUiResult === "partial_no_icon") {
    return "partial_no_icon";
  }
  if (input.optOutUiResult === "generic_do_not_sell") {
    return "generic_do_not_sell_only";
  }
  return "control_present_but_cba_compliance_unclear";
}

function buildCpraOptOutBasis(input: {
  fallbackSnippet: string | null | undefined;
  optOutSubtype: CpraOptOutSubtype;
  optOutUiResult: string | null;
  vendors: string[];
}) {
  const vendorText = input.vendors.length > 0 ? ` for ${formatVendorList(input.vendors.slice(0, 3))}` : "";
  switch (input.optOutSubtype) {
    case "opt_out_absent":
      return input.fallbackSnippet ?? `CBA vendor evidence was retained${vendorText}, and no CPRA-specific opt-out control was confirmed.`;
    case "partial_no_icon":
      return `A privacy choice control was retained${vendorText}, but the CPRA privacy-choice treatment was incomplete or not confirmed.`;
    case "generic_do_not_sell_only":
      return `A generic Do Not Sell control was retained${vendorText}, but Do Not Share or CBA-specific coverage was not confirmed.`;
    case "control_present_but_cba_compliance_unclear":
      return `A privacy choice control was retained${vendorText}, but complete CPRA CBA opt-out coverage was not confirmed${input.optOutUiResult ? `; opt-out UI result: ${input.optOutUiResult.replace(/_/g, " ")}` : ""}.`;
  }
}

function getPacketCounts(packet: UnifiedFindingDisplayPacket) {
  return Object.fromEntries(
    Object.entries(packet.evidence?.counts ?? {}).filter(([, value]) => Number.isFinite(value))
  );
}

function getPacketSourceSignals(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings(
    packet.sourceRefs.flatMap((sourceRef) => {
      if (sourceRef.kind !== "signal") {
        return [];
      }
      return sourceRef.label ? `${sourceRef.key}: ${sourceRef.label}` : sourceRef.key;
    })
  );
}

function getPacketRuntimeRequestUrls(packet: UnifiedFindingDisplayPacket) {
  return uniqueCaseInsensitiveStrings([
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|evidence.*url|collection.*endpoint|redirect.*url/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...(packet.evidence?.sourceUrls ?? [])
  ]);
}

function getPacketRuntimeVendors(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings([
    ...getEntityValues(packet, /runtime.*vendor|vendor|relatedVendors|third.*party.*domain|request.*domain/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.vendors ?? []) : [])
  ]).filter(isDisplayVendorName);
}

function getPacketEvidenceSnippets(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings(packet.evidence?.snippets ?? []).map((snippet) => truncateDisplaySnippet(snippet)).slice(0, 5);
}

function buildGenericCanonicalEvidenceDetails(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingEvidenceDetails {
  const runtimeRequestUrls = getPacketRuntimeRequestUrls(packet);
  const runtimeVendors = getPacketRuntimeVendors(packet);
  const representativeRequests = getRepresentativeRequestDetails(runtimeRequestUrls, runtimeVendors);
  const evidenceSnippets = getPacketEvidenceSnippets(packet);
  const sourceSignals = getPacketSourceSignals(packet);
  const evidenceFlags = uniqueStrings(packet.evidence?.flags ?? []);
  const sourceUrls = uniqueStrings(packet.evidence?.sourceUrls ?? []);
  const pageUrls = uniqueStrings([
    packet.primaryPageUrl,
    packet.sourceUrl,
    ...(packet.evidence?.pageUrls ?? [])
  ]);
  const counts = getPacketCounts(packet);
  const details: CertScoreFindingEvidenceDetails = {
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
    scanContext: {
      pageUrl: packet.primaryPageUrl,
      scanMode: "initial_page_load",
      interactionBeforeFinding: CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)
    },
    policyEvidence: { evaluated: false },
    legalRelevance: {
      cipaPenRegisterTheorySupport: TELEMETRY_EVIDENCE_FINDING_IDS.has(findingId) || SENSITIVE_EVIDENCE_FINDING_IDS.has(findingId)
        ? "possible"
        : "not_evaluated",
      gdprEprivacyConsentSupport: COOKIE_EVIDENCE_FINDING_IDS.has(findingId) || FOOTPRINT_EVIDENCE_FINDING_IDS.has(findingId) || CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)
        ? "possible"
        : "not_evaluated",
      cpraSharingSupport: TELEMETRY_EVIDENCE_FINDING_IDS.has(findingId) || SENSITIVE_EVIDENCE_FINDING_IDS.has(findingId) || FOOTPRINT_EVIDENCE_FINDING_IDS.has(findingId)
        ? "possible"
        : "not_evaluated",
      ftcDarkPatternOrDeceptionSupport: CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId) || FINANCIAL_EVIDENCE_FINDING_IDS.has(findingId)
        ? "support_only"
        : "not_evaluated"
    },
    limitations: [
      "Automated scan does not determine legal status.",
      "Representative evidence is capped and should be reviewed with the full scan record before final conclusions."
    ]
  };

  if (runtimeRequestUrls.length > 0) {
    details.runtimeRequestUrls = runtimeRequestUrls;
    details.representativeRequests = representativeRequests;
    details.requestSelectionNote = "Representative requests are capped examples and are not exhaustive.";
  }
  if (runtimeVendors.length > 0) {
    details.runtimeVendors = runtimeVendors;
    details.vendors = getVendorDetails(runtimeVendors, representativeRequests);
  }
  if (representativeRequests.length > 0) {
    details.identifierEvidence = buildIdentifierEvidence(representativeRequests);
  }
  if (evidenceSnippets.length > 0) {
    details.evidenceSnippets = evidenceSnippets;
  }
  if (pageUrls.length > 0) {
    details.pageUrls = pageUrls;
  }
  if (sourceUrls.length > 0) {
    details.sourceUrls = sourceUrls;
  }
  if (sourceSignals.length > 0) {
    details.sourceSignals = sourceSignals;
  }
  if (evidenceFlags.length > 0) {
    details.evidenceFlags = evidenceFlags;
  }

  if (COOKIE_EVIDENCE_FINDING_IDS.has(findingId)) {
    details.cookieEvidence = {
      observed: true,
      basis: evidenceSnippets[0] ?? "Cookie or storage evidence was retained for this finding.",
      preConsentContext: /pre_consent|preconsent/i.test(findingId)
    };
  }

  if (CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)) {
    const rejectOptionSubtype = findingId === "reject_option_missing_or_hidden"
      ? deriveRejectOptionSubtype(packet)
      : null;
    details.consentUiEvidence = {
      observed: true,
      pattern: findingId,
      ...(rejectOptionSubtype ? { rejectOptionSubtype } : {}),
      basis: evidenceSnippets[0] ?? packet.summary,
      userChoiceImpact: findingId === "reject_option_missing_or_hidden"
        ? rejectOptionSubtype === "reject_requires_preferences_path"
          ? "Reject choice was retained behind an additional preferences or manage-choices path."
          : rejectOptionSubtype === "reject_present_but_visually_hidden"
            ? "Reject choice was retained but visually hidden or materially hard to perceive."
            : rejectOptionSubtype === "reject_depth_asymmetry"
              ? "Reject choice required materially more interaction than the accept path."
              : rejectOptionSubtype === "reject_absent_first_layer"
                ? "Reject choice was not retained as visible or equivalent on the first observed consent layer."
                : "Reject path evidence was retained, but the exact reject availability subtype is ambiguous."
        : "Consent UI evidence may affect how easily users can exercise a choice."
    };
  }

  if (SENSITIVE_EVIDENCE_FINDING_IDS.has(findingId)) {
    const packetDataTypes =
      packet.details?.family === "sensitive_data" && "dataTypes" in packet.details
        ? packet.details.dataTypes
        : [];
    const sensitiveDataTypes = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*data.*type/i),
      ...(Array.isArray(packetDataTypes) ? packetDataTypes : [])
    ]).map(formatSensitiveDataType);
    const sensitiveFieldContexts = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*source.*field/i).map((value) => `field:${value}`),
      ...getEntityValues(packet, /sensitive.*source.*location/i).map((value) => `location:${formatSensitiveSourceLocation(value)}`)
    ]);
    details.sensitiveDataEvidence = {
      observed: true,
      dataTypes: sensitiveDataTypes,
      fieldContexts: sensitiveFieldContexts,
      basis: evidenceSnippets[0] ?? packet.summary
    };
    if (sensitiveDataTypes.length > 0) {
      details.sensitiveDataTypes = sensitiveDataTypes;
    }
    if (sensitiveFieldContexts.length > 0) {
      details.sensitiveFieldContexts = sensitiveFieldContexts;
    }
  }

  if (TELEMETRY_EVIDENCE_FINDING_IDS.has(findingId)) {
    const fingerprintingRawEvidence = findingId === "fingerprinting_related_signals_observed" || findingId === "probable_fingerprinting"
      ? buildFingerprintingRawEvidence(packet)
      : null;
    const fingerprintTierResult = fingerprintingRawEvidence ? deriveFingerprintEvidenceTier(fingerprintingRawEvidence) : null;
    const fingerprintPromotionAnnotation = getFingerprintPromotionAnnotation(fingerprintingRawEvidence, fingerprintTierResult);
    const fingerprintSignals = Array.isArray(fingerprintingRawEvidence?.fingerprintAttributeCategories)
      ? (fingerprintingRawEvidence.fingerprintAttributeCategories as string[])
      : [];
    const fingerprintSignalGroups = findingId === "fingerprinting_related_signals_observed" || findingId === "probable_fingerprinting"
      ? getFingerprintSignalGroups(packet)
      : null;
    details.telemetryEvidence = {
      observed: true,
      basis: findingId === "fingerprinting_related_signals_observed"
        ? (fingerprintTierResult?.tier ?? 0) >= 2
        ? "Fingerprinting-related browser telemetry was retained for review, but identity-oriented fingerprinting was not established."
        : "Elevated browser/device entropy collection was retained for review, but identity-oriented fingerprinting was not established."
        : findingId === "probable_fingerprinting"
          ? "Probable browser/device fingerprinting behavior was observed. The retained evidence shows coordinated high-entropy browser/device collection with runtime corroboration."
        : evidenceSnippets[0] ?? packet.summary,
      identifierLikeRequestCount: representativeRequests.filter((request) => request.identifierLike).length,
      deviceDataLikeRequestCount: representativeRequests.filter((request) => request.deviceDataLike).length,
      ...(fingerprintSignals.length > 0 ? { fingerprintSignals } : {}),
      ...(fingerprintSignalGroups?.strongSignals.length
        ? {
            strongFingerprintSignals: fingerprintSignalGroups.strongSignals,
            strongFingerprintSignalLabels: fingerprintSignalGroups.strongSignalLabels
          }
        : {}),
      ...(fingerprintSignalGroups?.genericSignals.length
        ? {
            genericFingerprintSignals: fingerprintSignalGroups.genericSignals,
            genericFingerprintSignalLabels: fingerprintSignalGroups.genericSignalLabels
          }
        : {}),
      ...(fingerprintTierResult
        ? {
            crossContextLinkageObserved: fingerprintTierResult.crossContextLinkageObserved,
            entropyLinkedToIdentifier: fingerprintTierResult.entropyLinkedToIdentifier,
            entropyTransmissionObserved: fingerprintTierResult.entropyTransmissionObserved,
            fingerprintConfidenceTier: fingerprintTierResult.tier,
            fingerprintConfidenceTierLabel: fingerprintTierResult.label,
            knownFingerprintingVendorObserved: fingerprintTierResult.knownFingerprintingVendorObserved
          }
        : {}),
      ...(findingId === "probable_fingerprinting"
        ? {
            confidenceExplanation: fingerprintTierResult?.confidenceExplanation ?? "Probable browser/device fingerprinting behavior observed.",
            fingerprintPurposeFraming: "security_or_bot_defense_possible",
            ...(fingerprintPromotionAnnotation ? { fingerprintPromotionAnnotation } : {})
          }
        : findingId === "fingerprinting_related_signals_observed"
          ? {
              confidenceExplanation: fingerprintTierResult?.confidenceExplanation ?? "Browser/device entropy collection retained without identity-oriented fingerprinting evidence.",
              limitations: [
                "Observed signals may also appear in fraud prevention, performance optimization, or advanced analytics contexts.",
                "Observed browser entropy collection alone does not establish cross-site identity tracking."
              ]
            }
          : {})
    };
  }

  if (FOOTPRINT_EVIDENCE_FINDING_IDS.has(findingId)) {
    details.trackingEvidence = {
      observed: true,
      basis: evidenceSnippets[0] ?? packet.summary,
      runtimeRequestCount: runtimeRequestUrls.length,
      runtimeVendorCount: runtimeVendors.length
    };
  }

  if (findingId === "cross_domain_identifier_sharing_observed") {
    const rows = getEntityJsonObjects(packet, "crossDomainIdentifierSharingEvidence");
    const destinations = uniqueStrings([
      ...getEntityValues(packet, /crossDomainIdentifierSharingDestinations/i),
      ...rows.flatMap((row) => [
        getRecordString(row, ["destinationEtldPlusOne", "destination_etld_plus_one"]),
        getRecordString(row, ["destinationDomain", "destination_domain"])
      ])
    ]);
    const categories = uniqueStrings([
      ...getEntityValues(packet, /crossDomainIdentifierSharingCategories/i),
      ...rows.flatMap((row) => getRecordString(row, ["destinationClassification", "destination_classification"]) ?? [])
    ]);
    const identifierKeys = uniqueStrings(rows.flatMap((row) => getRecordString(row, ["key"]) ?? []));
    const identifierClasses = uniqueStrings(rows.flatMap((row) => getRecordString(row, ["identifierClass", "identifier_class"]) ?? []));
    const redactedRequestUrls = uniqueCaseInsensitiveStrings(
      rows.flatMap((row) => getRecordString(row, ["requestUrlRedacted", "request_url_redacted"]) ?? [])
    );
    const representativeIdentifierRequests = getRepresentativeRequestDetails(redactedRequestUrls, destinations).map((request) => {
      const matchingRow = rows.find((row) => {
        const rowUrl = getRecordString(row, ["requestUrlRedacted", "request_url_redacted"]);
        const rowHost = getRecordString(row, ["destinationDomain", "destination_domain"]);
        return rowUrl === request.url || (rowHost !== null && request.hostname.includes(rowHost));
      });
      const rowKey = matchingRow ? getRecordString(matchingRow, ["key"]) : null;
      const rowClass = matchingRow ? getRecordString(matchingRow, ["identifierClass", "identifier_class"]) : null;
      return {
        ...request,
        category: rowClass ?? request.category,
        queryKeysSample: rowKey ? uniqueStrings([rowKey, ...request.queryKeysSample]).slice(0, 8) : request.queryKeysSample,
        identifierLike: true
      };
    });

    details.counts = {
      ...(details.counts ?? {}),
      crossDomainIdentifierEvidenceRows: rows.length,
      crossDomainIdentifierDestinations: destinations.length,
      crossDomainIdentifierKeys: identifierKeys.length
    };
    details.trackingEvidence = {
      ...(details.trackingEvidence ?? {}),
      observed: true,
      basis: rows.length > 0
        ? "Retained request-level evidence shows identifier-like query values sent to external identity, RTB, or adtech destinations."
        : details.trackingEvidence?.basis ?? packet.summary,
      destinationCategories: categories.slice(0, 8),
      destinationDomains: destinations.slice(0, 12),
      identifierClasses: identifierClasses.slice(0, 8),
      identifierKeys: identifierKeys.slice(0, 8),
      redactedRequestUrls: redactedRequestUrls.slice(0, 8)
    };
    if (rows.length > 0) {
      details.crossDomainIdentifierSharingEvidence = rows.slice(0, 12);
    }
    if (redactedRequestUrls.length > 0) {
      details.runtimeRequestUrls = uniqueCaseInsensitiveStrings([...(details.runtimeRequestUrls ?? []), ...redactedRequestUrls]).slice(0, 8);
      details.representativeRequests = representativeIdentifierRequests;
      details.requestSelectionNote = "Representative identifier-sharing requests are capped examples with query values redacted.";
      details.identifierEvidence = {
        addressingOrSignalingTransmittedByRequest: true,
        basis: ["retained_identifier_query_evidence", "redacted_request_url_evidence"],
        interpretation: "Identifier-like query keys were retained with redacted values for review; automated evidence does not determine downstream use.",
        identifierLikeRequestCount: representativeIdentifierRequests.length,
        deviceDataLikeRequestCount: representativeIdentifierRequests.filter((request) => request.deviceDataLike).length
      };
    }
  }

  if (
    findingId === "focus_management_issue" ||
    findingId === "keyboard_navigation_accessibility_issue" ||
    findingId === "semantic_labeling_accessibility_issue" ||
    findingId === "text_alternative_accessibility_issue" ||
    findingId === "visual_contrast_accessibility_issue"
  ) {
    details.accessibilityEvidence = {
      observed: true,
      basis: evidenceSnippets[0] ?? packet.summary,
      representativeExamplesRetained: evidenceSnippets.length
    };
  }

  if (findingId === "policy_clarity_risk") {
    details.policyEvidenceDetails = {
      evaluated: true,
      basis: evidenceSnippets[0] ?? packet.summary,
      clarityRiskObserved: true
    };
    details.policyEvidence = { evaluated: true, cookieOrPrivacyPolicyFound: true, relevantDisclosureFound: false, disclosureGapObserved: true, policyUrl: null, snippet: evidenceSnippets[0] ?? null };
  }

  if (findingId === "policy_behavior_contradiction_detected") {
    const policyRuntimeConflict = buildPolicyRuntimeConflictDetails(packet);
    const presentation = evaluatePolicyRuntimeConflictPresentation(packet);
    if (policyRuntimeConflict) {
      details.policyRuntimeConflict = policyRuntimeConflict;
      details.policyEvidence = policyRuntimeConflict.policyAnchor.snippet || policyRuntimeConflict.policyAnchor.sourceUrl
        ? {
            evaluated: true,
            cookieOrPrivacyPolicyFound: Boolean(policyRuntimeConflict.policyAnchor.sourceUrl),
            relevantDisclosureFound: Boolean(policyRuntimeConflict.policyAnchor.snippet),
            disclosureGapObserved: !presentation.complete,
            policyUrl: policyRuntimeConflict.policyAnchor.sourceUrl,
            snippet: policyRuntimeConflict.policyAnchor.snippet
          }
        : { evaluated: false };
      details.policyEvidenceDetails = {
        evaluated: Boolean(policyRuntimeConflict.policyAnchor.snippet && policyRuntimeConflict.policyAnchor.sourceUrl),
        basis: policyRuntimeConflict.conflictBridge.reasoning ?? packet.summary,
        conflictType: policyRuntimeConflict.conflictBridge.conflictType,
        policySnippet: policyRuntimeConflict.policyAnchor.snippet,
        policySourceUrl: policyRuntimeConflict.policyAnchor.sourceUrl,
        runtimeEvent: getPolicyRuntimeRepresentativeEvent(policyRuntimeConflict),
        missingAnchors: presentation.missing
      };
      details.limitations = [
        ...(!policyRuntimeConflict.policyAnchor.snippet ? ["The policy claim could not be displayed from retained evidence."] : []),
        ...(!policyRuntimeConflict.policyAnchor.sourceUrl ? ["The policy source URL could not be displayed from retained evidence."] : []),
        ...(presentation.missing.includes("missing_runtime_timing_or_phase")
          ? ["The runtime event did not include retained timing or consent-relative phase evidence."]
          : [])
      ];
    }
  }

  if (FINANCIAL_EVIDENCE_FINDING_IDS.has(findingId)) {
    const offerSnippets = getFinancialPromotionOfferSnippets(packet).slice(0, 3);
    const disclosureFindings = uniqueStrings([
      ...getEntityValues(packet, /responsibleGamblingDisclosureAdjacent|termsDisclosureAdjacent/i).map((value) => {
        if (/^true$/i.test(value)) {
          return "Relevant disclosure evidence appears near the retained offer snippet.";
        }
        if (/^false$/i.test(value)) {
          return "Clear adjacent disclosure evidence was not retained with the offer snippet.";
        }
        return null;
      }),
      ...getEntityValues(packet, /responsibleGamblingSnippets|termsSnippets/i)
    ]).slice(0, 5);
    details.financialClaimsEvidence = {
      observed: true,
      claimType: findingId,
      basis: offerSnippets[0] ?? evidenceSnippets[0] ?? packet.summary
    };
    details.disclosureEvidence = {
      evaluated: disclosureFindings.length > 0,
      findings: disclosureFindings
    };
    if (offerSnippets.length > 0) {
      details.offerSnippets = offerSnippets;
    }
    if (disclosureFindings.length > 0) {
      details.disclosureFindings = disclosureFindings;
    }
  }

  return details;
}

function formatVendorList(vendors: string[]) {
  if (vendors.length <= 1) {
    return vendors[0] ?? "";
  }
  if (vendors.length === 2) {
    return `${vendors[0]} and ${vendors[1]}`;
  }
  return `${vendors.slice(0, -1).join(", ")}, and ${vendors[vendors.length - 1]}`;
}

function isDisplayVendorName(value: string) {
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 80 &&
    !/^[\[{]/.test(normalized) &&
    !/^https?:\/\//i.test(normalized) &&
    !/[{}[\]"]/g.test(normalized)
  );
}

function getRejectTrackingVendors(packet: UnifiedFindingDisplayPacket) {
  const directVendorValues = uniqueStrings([
    ...getEntityValues(packet, /^(?:runtimeVendors|persisted_tracker_vendors|post_reject_tracker_vendors)$/i),
    ...getEntityValues(packet, /^postRejectNonEssentialRequests$/i).flatMap((value) => {
      try {
        const parsed: unknown = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? typeof (parsed as { vendor?: unknown }).vendor === "string"
            ? (parsed as { vendor: string }).vendor
            : null
          : null;
      } catch {
        return null;
      }
    })
  ]);

  return directVendorValues.filter(isDisplayVendorName);
}

function getSessionReplayVendors(packet: UnifiedFindingDisplayPacket) {
  const entityValues = getEntityValues(packet, /vendor/i);
  const reviewerVisibleText = uniqueStrings([
    packet.observedValue,
    packet.summary,
    ...(packet.evidence?.snippets ?? []),
    ...entityValues
  ]).join(" ");

  return SESSION_REPLAY_VENDOR_PATTERNS.flatMap(({ label, pattern }) =>
    pattern.test(reviewerVisibleText) ? [label] : []
  );
}

function getSessionReplayRequestUrls(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings([
    ...(packet.evidence?.sourceUrls ?? []),
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|evidence.*url|source.*url/i)
  ]).filter((url) => SESSION_REPLAY_URL_PATTERN.test(url));
}

function hasFirstPartyProxySessionReplayEvidence(packet: UnifiedFindingDisplayPacket, requestUrls: string[]) {
  const vendors = getSessionReplayVendors(packet);
  if (!vendors.some((vendor) => vendor === "FullStory")) {
    return false;
  }

  const artifactText = uniqueStrings([
    ...(packet.evidence?.snippets ?? []),
    ...(packet.evidence?.flags ?? []),
    ...getEntityValues(packet, /runtime.*artifact|session.*replay|endpoint|relationship/i)
  ]).join(" ");
  if (/first[_ -]?party(?:_collection)?[_ -]?proxy|collection_endpoint:first_party_collection_proxy|relationship:first_party/i.test(artifactText)) {
    return true;
  }

  const pageHosts = new Set(
    uniqueStrings([packet.primaryPageUrl, packet.sourceUrl, ...(packet.evidence?.pageUrls ?? [])])
      .map(getUrlHostname)
      .filter((host): host is string => Boolean(host))
  );
  if (pageHosts.size === 0) {
    return false;
  }

  return requestUrls.some((url) => {
    if (SESSION_REPLAY_URL_PATTERN.test(url)) {
      return false;
    }
    const requestHost = getUrlHostname(url);
    return Boolean(requestHost && pageHosts.has(requestHost));
  });
}

function getFinancialPromotionOfferSnippets(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings([
    ...getEntityValues(packet, /offer.*snippet|promotion.*snippet|claim.*snippet|matched.*snippet|primary.*offer/i),
    ...(packet.evidence?.snippets ?? [])
  ]).filter((value) =>
    /\b(?:bonus\s+bets?|free\s+bet|risk[- ]free|sportsbook|sports betting|wager|casino|gambl|\$\s?\d[\d,]*(?:\.\d{2})?)\b/i.test(value)
  );
}

function buildPolicyRuntimeConflictDetails(packet: UnifiedFindingDisplayPacket) {
  if (packet.details?.family !== "contradiction") {
    return null;
  }

  const bundle = getContradictionEvidenceBundle({
    contradictionEvidence: {
      claim: packet.details.claim ?? null,
      contradictionBasis: packet.details.contradictionBasis ?? null,
      conflictBridge: {
        conflictType: packet.details.conflictType ?? null,
        reasoning: packet.details.conflictBridgeReasoning ?? null,
        supportsPromotion: packet.details.conflictSupportsPromotion === true,
        provenance: {
          bridgeRuleId: packet.details.bridgeRuleId ?? null,
          generatedBy: packet.details.bridgeGeneratedBy ?? null,
          mappingType: packet.details.bridgeMappingType ?? null,
          mappingVersion: packet.details.bridgeMappingVersion ?? null,
          policyAnchorRef: packet.details.policyAnchorRef ?? null,
          runtimeAnchorRef: packet.details.runtimeAnchorRef ?? null,
          sourceEvidenceIds: packet.details.sourceEvidenceIds ?? []
        }
      },
      evidenceSufficiency: {
        conflictBridgePresent: packet.details.conflictType != null && packet.details.conflictSupportsPromotion === true,
        policyAnchorPresent: Boolean(packet.details.policyClaimType && packet.details.policySourceUrl && packet.details.policySnippet),
        promotionEligible: packet.details.contradictionPromotionEligible === true,
        reviewStatus: packet.details.contradictionReviewStatus ?? null,
        runtimeAnchorPresent: Boolean(packet.details.runtimeObservationType && (packet.details.runtimeEvidenceArtifacts?.length ?? 0) > 0)
      },
      policyAnchor: {
        claimType: packet.details.policyClaimType ?? null,
        confidence: getNumberFromRecord(packet.evidence?.entities ?? {}, ["policyConfidence", "policy_confidence"]) ?? 0.72,
        extractionStatus: getStringFromRecord(packet.evidence?.entities ?? {}, ["policyExtractionStatus", "policy_extraction_status"]) ?? "fetched",
        normalizedClaim: packet.details.claim ?? packet.details.policySnippet ?? null,
        snippet: packet.details.policySnippet ?? null,
        sourceUrl: packet.details.policySourceUrl ?? null
      },
      policySnippet: packet.details.policySnippet ?? null,
      policySourceUrl: packet.details.policySourceUrl ?? null,
      runtimeAnchor: {
        confidence: getNumberFromRecord(packet.evidence?.entities ?? {}, ["runtimeConfidence", "runtime_confidence"]) ?? 0.82,
        observationType: packet.details.runtimeObservationType ?? null,
        phase: packet.details.runtimePhase ?? "unknown",
        requests: packet.details.runtimeEvidenceArtifacts ?? [],
        vendors: packet.details.vendors ?? []
      },
      runtimeEvidenceArtifacts: packet.details.runtimeEvidenceArtifacts ?? [],
      runtimeSummary: packet.details.observedBehavior ?? null,
      runtimeVendors: packet.details.vendors ?? [],
      sourceUrls: [...(packet.evidence?.pageUrls ?? []), ...(packet.evidence?.sourceUrls ?? [])],
      supportingSignals: []
    }
  });
  const policySourceUrls = uniqueStrings([
    packet.details.policySourceUrl,
    ...(packet.evidence?.pageUrls ?? []),
    ...(packet.evidence?.sourceUrls ?? []).filter((url) => !getEntityUrlValues(packet, /runtime.*request|request.*url/i).includes(url))
  ]).filter((url) => /^https?:\/\//i.test(url));
  const runtimeRequestUrls = uniqueStrings([
    ...(packet.details.runtimeEvidenceArtifacts ?? []),
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|preconsent.*tracker.*evidence|evidence.*url/i)
  ]).filter((url) => /^https?:\/\//i.test(url));
  const runtimeVendors = uniqueStrings([
    ...(packet.details.vendors ?? []),
    ...getEntityValues(packet, /runtime.*vendor|vendor|preconsent.*tracker.*vendor|relatedVendors/i)
  ]).filter(isDisplayVendorName);
  const validationRuleKeys = uniqueStrings(
    packet.sourceRefs.flatMap((sourceRef) => (sourceRef.kind === "validation" ? [sourceRef.ruleKey] : []))
  );
  const runtimeArtifacts = getPolicyRuntimeArtifacts(packet);
  const firstRuntimeArtifact = runtimeArtifacts[0] ?? null;
  const phase = bundle?.runtimeAnchor.phase ?? packet.details.runtimePhase ?? null;
  const firstSeenMs = firstRuntimeArtifact
    ? getNumberFromRecord(firstRuntimeArtifact, ["timestampMs", "timestamp_ms", "firstSeenMs", "first_seen_ms"])
    : null;
  const runtimeHost = firstRuntimeArtifact
    ? getStringFromRecord(firstRuntimeArtifact, ["host", "hostname", "domain"])
    : null;

  return {
    policyAnchor: {
      claimType: bundle?.policyAnchor.claimType ?? packet.details.policyClaimType ?? null,
      sourceUrl: packet.details.policySourceUrl ?? bundle?.policyAnchor.sourceUrl ?? null,
      snippet: packet.details.policySnippet ? truncateDisplaySnippet(packet.details.policySnippet) : null
    },
    runtimeAnchor: {
      observationType: bundle?.runtimeAnchor.observationType ?? packet.details.runtimeObservationType ?? null,
      phase,
      firstSeenMs,
      host: runtimeHost ?? (runtimeRequestUrls[0] ? getUrlHostname(runtimeRequestUrls[0]) : null),
      requestUrls: runtimeRequestUrls.slice(0, 5),
      vendors: runtimeVendors.slice(0, 8)
    },
    conflictBridge: {
      conflictType: packet.details.conflictType ?? null,
      reasoning: packet.details.conflictBridgeReasoning ?? packet.details.contradictionBasis ?? null,
      supportsPromotion: packet.details.conflictSupportsPromotion === true
    },
    evidenceSufficiency: {
      reviewStatus: bundle?.evidenceSufficiency.reviewStatus ?? packet.details.contradictionReviewStatus ?? null,
      promotionEligible: evaluatePolicyRuntimeConflictPresentation(packet).complete
    },
    references: {
      policySourceUrls: policySourceUrls.slice(0, 3),
      runtimeRequestUrls: runtimeRequestUrls.slice(0, 5),
      validationRuleKeys
    }
  };
}

function getPolicyRuntimeArtifacts(packet: UnifiedFindingDisplayPacket) {
  const entities = (packet.evidence?.entities ?? {}) as Record<string, unknown>;
  const raw =
    entities.runtimeBehaviorArtifacts ??
    entities.runtime_behavior_artifacts ??
    entities.runtimeBehaviorArtifact ??
    entities.runtime_behavior_artifact;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return [raw as Record<string, unknown>];
  }
  return [];
}

function evaluatePolicyRuntimeConflictPresentation(packet: UnifiedFindingDisplayPacket) {
  if (packet.details?.family !== "contradiction") {
    return { complete: false, missing: ["missing_contradiction_bridge"] };
  }
  const policySnippet = packet.details.policySnippet?.trim() ?? "";
  const policySourceUrl = packet.details.policySourceUrl?.trim() ?? "";
  const runtimeArtifacts = getPolicyRuntimeArtifacts(packet);
  const runtimeHasTiming = runtimeArtifacts.some((artifact) =>
    getNumberFromRecord(artifact, ["timestampMs", "timestamp_ms", "firstSeenMs", "first_seen_ms"]) !== null
  );
  const runtimePhase = packet.details.runtimePhase ?? null;
  const runtimeHasConsentRelativePhase = runtimePhase === "pre_consent" || runtimePhase === "after_reject" || runtimePhase === "gpc_enabled";
  const runtimeRequestUrls = uniqueStrings([
    ...(packet.details.runtimeEvidenceArtifacts ?? []),
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|preconsent.*tracker.*evidence|evidence.*url/i)
  ]);
  const runtimeEventPresent =
    Boolean(packet.details.runtimeObservationType) &&
    runtimeRequestUrls.length > 0 &&
    (runtimeHasTiming || runtimeHasConsentRelativePhase);
  const bridgePresent = Boolean(packet.details.conflictType && packet.details.conflictBridgeReasoning && packet.details.conflictSupportsPromotion === true);
  const contractEligible = evaluatePolicyBehaviorContradictionEvidence({
    contradictionEvidence: {
      claim: packet.details.claim ?? null,
      contradictionBasis: packet.details.contradictionBasis ?? null,
      conflictBridge: {
        conflictType: packet.details.conflictType ?? null,
        reasoning: packet.details.conflictBridgeReasoning ?? null,
        supportsPromotion: packet.details.conflictSupportsPromotion === true,
        provenance: {
          bridgeRuleId: packet.details.bridgeRuleId ?? null,
          generatedBy: packet.details.bridgeGeneratedBy ?? null,
          mappingType: packet.details.bridgeMappingType ?? null,
          mappingVersion: packet.details.bridgeMappingVersion ?? null,
          policyAnchorRef: packet.details.policyAnchorRef ?? null,
          runtimeAnchorRef: packet.details.runtimeAnchorRef ?? null,
          sourceEvidenceIds: packet.details.sourceEvidenceIds ?? []
        }
      },
      policyAnchor: {
        claimType: packet.details.policyClaimType ?? null,
        confidence: getNumberFromRecord(packet.evidence?.entities ?? {}, ["policyConfidence", "policy_confidence"]) ?? 0.72,
        extractionStatus: getStringFromRecord(packet.evidence?.entities ?? {}, ["policyExtractionStatus", "policy_extraction_status"]) ?? "fetched",
        normalizedClaim: packet.details.claim ?? packet.details.policySnippet ?? null,
        snippet: policySnippet || null,
        sourceUrl: policySourceUrl || null
      },
      runtimeAnchor: {
        confidence: getNumberFromRecord(packet.evidence?.entities ?? {}, ["runtimeConfidence", "runtime_confidence"]) ?? 0.82,
        observationType: packet.details.runtimeObservationType ?? null,
        phase: runtimePhase ?? "unknown",
        requests: runtimeRequestUrls,
        vendors: packet.details.vendors ?? []
      }
    }
  }).eligible;
  const missing = [
    policySnippet ? null : "missing_policy_snippet",
    /^https?:\/\//i.test(policySourceUrl) ? null : "missing_policy_source_url",
    runtimeEventPresent ? null : "missing_runtime_timing_or_phase",
    bridgePresent ? null : "missing_conflict_bridge",
    contractEligible ? null : "policy_behavior_contract_not_strong"
  ].filter((value): value is string => Boolean(value));
  return { complete: missing.length === 0, missing };
}

function getPolicyRuntimeRepresentativeEvent(conflict: NonNullable<CertScoreFindingEvidenceDetails["policyRuntimeConflict"]>) {
  const url = conflict.runtimeAnchor.requestUrls[0] ?? null;
  const vendor = conflict.runtimeAnchor.vendors[0] ?? "Runtime request";
  const host = typeof conflict.runtimeAnchor.host === "string" && conflict.runtimeAnchor.host.length > 0
    ? conflict.runtimeAnchor.host
    : url
      ? getUrlHostname(url)
      : null;
  const firstSeenMs = typeof conflict.runtimeAnchor.firstSeenMs === "number" ? conflict.runtimeAnchor.firstSeenMs : null;
  const phase = typeof conflict.runtimeAnchor.phase === "string" ? conflict.runtimeAnchor.phase : null;
  if (!url && !host && conflict.runtimeAnchor.vendors.length === 0) {
    return null;
  }
  const target = [vendor, host].filter(Boolean).join(" at ");
  if (firstSeenMs !== null && phase === "pre_consent") {
    return `${target} fired at ${firstSeenMs}ms before consent interaction.`;
  }
  if (firstSeenMs !== null) {
    return `${target} fired at ${firstSeenMs}ms during ${formatRuntimePhase(phase)}.`;
  }
  if (phase === "pre_consent") {
    return `${target} fired during the pre-consent phase.`;
  }
  return `${target} was observed during the scan.`;
}

function formatRuntimePhase(phase: string | null) {
  switch (phase) {
    case "pre_consent":
      return "the pre-consent phase";
    case "after_reject":
      return "the post-reject phase";
    case "gpc_enabled":
      return "the GPC-enabled phase";
    case "post_consent":
      return "the post-consent phase";
    default:
      return "the scan";
  }
}

function formatQuotedSnippet(snippet: string) {
  const normalized = snippet.replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? truncateAtWordBoundary(normalized, 137) : normalized;
}

function formatSensitiveDataType(value: string) {
  return value.replace(/_detected$/i, "").replace(/_/g, " ").trim();
}

function formatSensitiveSourceLocation(value: string) {
  return value.replace(/_/g, " ").trim();
}

function buildExecutiveEvidenceDetails(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingEvidenceDetails | undefined {
  if (findingId === "pre_consent_tracking_detected") {
    return buildPreConsentTrackingEvidenceDetails(packet);
  }
  if (findingId === "reject_tracking_persists_after_reject") {
    return buildRejectTrackingEvidenceDetails(packet);
  }
  if (findingId === "session_recording_services_detected") {
    return buildSessionReplayEvidenceDetails(packet);
  }
  if (findingId === "rtb_cookie_sync_observed") {
    return buildRtbCookieSyncEvidenceDetails(packet);
  }
  if (findingId === "cpra_cba_opt_out_missing") {
    return buildCpraCbaOptOutEvidenceDetails(packet);
  }
  if (CANONICAL_EVIDENCE_FINDING_IDS.has(findingId)) {
    return buildGenericCanonicalEvidenceDetails(packet, findingId);
  }

  const runtimeVendors = uniqueStrings([
    ...getEntityValues(packet, /runtime.*vendor|vendor|preconsent.*tracker.*vendor|relatedVendors/i),
    ...(findingId === "session_recording_services_detected" ? getSessionReplayVendors(packet) : [])
  ]);
  const genericRuntimeRequestUrls = uniqueStrings([
    ...getEntityUrlValues(packet, /runtime.*request|request.*url|preconsent.*tracker.*evidence|evidence.*url/i),
    ...((packet.details?.family === "consent_tracking" || findingId === "pre_consent_tracking_detected")
      ? (packet.evidence?.sourceUrls ?? [])
      : [])
  ]);
  const runtimeRequestUrls =
    findingId === "session_recording_services_detected"
      ? uniqueStrings([...getSessionReplayRequestUrls(packet), ...genericRuntimeRequestUrls])
      : genericRuntimeRequestUrls;
  const sourceUrls = uniqueStrings(packet.evidence?.sourceUrls ?? []);
  const pageUrls = uniqueStrings([
    packet.primaryPageUrl,
    packet.sourceUrl,
    ...(packet.evidence?.pageUrls ?? [])
  ]).filter((url) =>
    findingId === "reject_tracking_persists_after_reject" ? !runtimeRequestUrls.includes(url) : true
  );
  const evidenceSnippets = uniqueStrings(packet.evidence?.snippets ?? []).map((snippet) => truncateDisplaySnippet(snippet)).slice(0, 5);
  const sourceSignals = uniqueStrings(
    packet.sourceRefs.flatMap((sourceRef) => {
      if (sourceRef.kind !== "signal") {
        return [];
      }
      return sourceRef.label ? `${sourceRef.key}: ${sourceRef.label}` : sourceRef.key;
    })
  );
  const evidenceFlags = uniqueStrings(packet.evidence?.flags ?? []);
  const counts = Object.fromEntries(
    Object.entries(packet.evidence?.counts ?? {}).filter(([, value]) => Number.isFinite(value))
  );
  const details: CertScoreFindingEvidenceDetails = {};

  if (Object.keys(counts).length > 0) {
    details.counts = counts;
  }
  if (findingId === "policy_behavior_contradiction_detected") {
    const policyRuntimeConflict = buildPolicyRuntimeConflictDetails(packet);
    if (policyRuntimeConflict) {
      details.policyRuntimeConflict = policyRuntimeConflict;
    }
  }
  if (evidenceSnippets.length > 0) {
    details.evidenceSnippets = evidenceSnippets;
  }
  if (pageUrls.length > 0) {
    details.pageUrls = pageUrls;
  }
  if (runtimeVendors.length > 0) {
    details.runtimeVendors = runtimeVendors;
  }
  if (runtimeRequestUrls.length > 0) {
    details.runtimeRequestUrls = runtimeRequestUrls;
  }
  if (
    findingId === "sensitive_data_collection_with_third_party_tracking_present" ||
    findingId === "possible_session_replay_on_sensitive_input_surface"
  ) {
    const packetDataTypes =
      packet.details?.family === "sensitive_data" && "dataTypes" in packet.details
        ? packet.details.dataTypes
        : [];
    const sensitiveDataTypes = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*data.*type/i),
      ...(Array.isArray(packetDataTypes) ? packetDataTypes : [])
    ])
      .map(formatSensitiveDataType)
      .filter((value) => value.length > 0);
    const sensitiveFieldContexts = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*source.*field/i).map((value) => `field:${value}`),
      ...getEntityValues(packet, /sensitive.*source.*location/i).map(
        (value) => `location:${formatSensitiveSourceLocation(value)}`
      )
    ]);
    if (sensitiveDataTypes.length > 0) {
      details.sensitiveDataTypes = sensitiveDataTypes;
    }
    if (sensitiveFieldContexts.length > 0) {
      details.sensitiveFieldContexts = sensitiveFieldContexts;
    }
  }
  if (sourceSignals.length > 0) {
    details.sourceSignals = sourceSignals;
  }
  if (evidenceFlags.length > 0) {
    details.evidenceFlags = evidenceFlags;
  }
  if (findingId === "session_recording_services_detected" && hasFirstPartyProxySessionReplayEvidence(packet, runtimeRequestUrls)) {
    details.evidenceFlags = uniqueStrings([
      ...(details.evidenceFlags ?? []),
      "session_replay_first_party_proxy_collection"
    ]);
    details.evidenceSnippets = uniqueStrings([
      ...(details.evidenceSnippets ?? []),
      "FullStory collection appears proxied through the scanned first-party domain."
    ]).slice(0, 5);
  }
  if (sourceUrls.length > 0) {
    details.sourceUrls = sourceUrls;
  }
  if (findingId === "pre_consent_tracking_detected") {
    const timing: Record<string, number | null> = {};
    for (const key of ["firstRequestMs", "firstThirdPartyRequestMs", "firstCookieSeenMs", "cmpVisibleMs"]) {
      const value = packet.evidence?.counts?.[key];
      if (value !== undefined && (typeof value === "number" || value === null)) {
        timing[key] = value;
      }
    }
    if (Object.keys(timing).length > 0) {
      details.timing = timing;
    }
  }

  if (findingId === "rtb_cookie_sync_observed") {
    const rows = getEntityJsonObjects(packet, "rtbCookieSyncEvidence");
    if (rows.length > 0) {
      const classifications = classifyRtbCookieSyncEvidenceRows(rows);
      details.rtbCookieSyncEvidence = rows.slice(0, 12);
      details.rtbCookieSyncEvidenceSubtypes = uniqueStrings(classifications.map((classification) => classification.subtype));
      details.rtbCookieSyncSubtypeCounts = classifications.reduce<Record<string, number>>((counts, classification) => {
        counts[classification.subtype] = (counts[classification.subtype] ?? 0) + 1;
        return counts;
      }, {});
      details.rtbCookieSyncRedirectTargets = uniqueStrings(classifications.map((classification) => classification.redirectTargetHost));
      details.rtbCookieSyncIdentifierQueryKeys = uniqueStrings(classifications.flatMap((classification) => classification.queryKeys))
        .filter((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key))
        .slice(0, 12);
      details.rtbCookieSyncWeakObservationCount = classifications.filter(
        (classification) => classification.subtype === "sync_path_only"
      ).length;
    }
  }

  if (findingId === "reject_tracking_persists_after_reject") {
    const consentInteraction = getFirstEntityJsonObject(packet, "consentInteraction");
    const promotionDecision = getFirstEntityJsonObject(packet, "promotionDecision");
    const rejectEvidenceDiff = getFirstEntityJsonObject(packet, "rejectEvidenceDiff");
    const postRejectNonEssentialRequests = getEntityJsonObjects(packet, "postRejectNonEssentialRequests");
    const suppressionChecks = getFirstEntityJsonObject(packet, "suppressionChecks");
    const confidenceRisks = getEntityValues(packet, /^confidenceRisks$/i);
    if (consentInteraction) {
      details.consentInteraction = consentInteraction;
    }
    if (promotionDecision) {
      details.promotionDecision = promotionDecision;
    }
    if (rejectEvidenceDiff) {
      details.rejectEvidenceDiff = rejectEvidenceDiff;
    }
    if (postRejectNonEssentialRequests.length > 0) {
      details.postRejectNonEssentialRequests = postRejectNonEssentialRequests.slice(0, 20);
    }
    if (confidenceRisks.length > 0) {
      details.confidenceRisks = confidenceRisks;
    }
    if (suppressionChecks) {
      details.suppressionChecks = suppressionChecks;
    }
    details.evidenceFlags = uniqueStrings([
      ...(details.evidenceFlags ?? []),
      "reject_path_tracking_not_reduced"
    ]);
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function buildExecutiveShortSummary(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
) {
  if (findingId === "pre_consent_tracking_detected") {
    const evidenceDetails = buildPreConsentTrackingEvidenceDetails(packet);
    const vendors = (evidenceDetails?.vendors ?? []).map((vendor) => vendor.name).slice(0, 3);
    const timing = evidenceDetails?.timing?.firstThirdPartyTrackingRequestMs;
    const timingText = typeof timing === "number"
      ? ` The first classified tracking request occurred at ${timing}ms`
      : "";
    const vendorText = vendors.length > 0
      ? `, with representative vendors including ${formatVendorList(vendors)}`
      : "";
    return `${trimTrailingSentencePunctuation(
      `Observed runtime behavior showed third-party tracking before any recorded consent choice.${timingText}${vendorText}`
    )}.`;
  }

  if (findingId === "possible_session_replay_on_sensitive_input_surface") {
    const vendors = getSessionReplayVendors(packet);
    const vendorText = vendors.length > 0 ? `${formatVendorList(vendors)} session replay` : "Session replay";
    return `${vendorText} may be present alongside a sensitive input surface in the same runtime session; this does not by itself show field-value transmission.`;
  }

  if (findingId === "sensitive_data_collection_with_third_party_tracking_present") {
    const packetDataTypes =
      packet.details?.family === "sensitive_data" && "dataTypes" in packet.details
        ? packet.details.dataTypes
        : [];
    const dataTypes = uniqueStrings(
      Array.isArray(packetDataTypes) ? packetDataTypes : []
    )
      .map((value) => value.replace(/_/g, " "))
      .slice(0, 2);
    const requestDomains = uniqueStrings([
      ...getEntityValues(packet, /request.*domain|third.*party.*domain|vendor/i)
    ]).slice(0, 2);

    const dataTypeText = dataTypes.length > 0 ? `${formatVendorList(dataTypes)} ` : "";
    const domainText = requestDomains.length > 0 ? ` alongside requests to ${formatVendorList(requestDomains)}` : "";
    return `Sensitive ${dataTypeText}input evidence was retained${domainText}; review whether any field values are transmitted before treating this as payload exposure.`;
  }

  if (findingId === "session_recording_services_detected") {
    const vendors = getSessionReplayVendors(packet);
    const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
    if (hasFirstPartyProxySessionReplayEvidence(packet, evidenceDetails?.runtimeRequestUrls ?? [])) {
      return "FullStory session recording appears proxied through the scanned first-party domain, which can make the collection endpoint harder to identify or block at the network level.";
    }

    if (vendors.length > 0) {
      const vendorList = formatVendorList(vendors);
      return vendors.length === 1
        ? `${vendorList} session recording was observed during runtime collection.`
        : `${vendorList} session recording services were observed during runtime collection.`;
    }

    return "Session recording services were observed during runtime collection.";
  }

  if (findingId === "rtb_cookie_sync_observed") {
    const hosts = uniqueStrings([
      ...getEntityValues(packet, /rtb.*domain|runtime.*vendor|vendor/i)
    ]).slice(0, 3);
    const subtypes = classifyRtbCookieSyncEvidenceRows(getEntityJsonObjects(packet, "rtbCookieSyncEvidence")).map(
      (classification) => classification.subtype
    );
    const hostText = hosts.length > 0 ? ` involving ${formatVendorList(hosts)}` : "";
    if (subtypes.some((subtype) => subtype === "identifier_query_sync" || subtype === "redirect_chain_sync")) {
      return `Request-level RTB or identity-sync evidence with retained identifier or redirect-chain support was retained${hostText}.`;
    }
    return `Request-level RTB or identity-sync endpoint evidence was retained${hostText}.`;
  }

  if (findingId === "cpra_cba_opt_out_missing") {
    const vendors = uniqueStrings([
      ...getEntityValues(packet, /cba.*vendor|vendor|runtime.*vendor/i),
      ...getEntityValues(packet, /cbaVendorTier|advertisingSharingVendors/i)
    ]).filter(isDisplayVendorName);
    const optOutUiResult = uniqueStrings(getEntityValues(packet, /optOutUiResult|opt_out_ui_result/i))[0];
    const optOutControlFound = parseBooleanEntity(getEntityValues(packet, /optOutControlFound|opt_out_control_found/i)[0]);
    const optOutSubtype = deriveCpraOptOutSubtype({ optOutControlFound, optOutUiResult: optOutUiResult ?? null });
    const vendorText = vendors.length > 0 ? ` involving ${formatVendorList(vendors.slice(0, 3))}` : "";
    if (optOutSubtype === "opt_out_absent") {
      const uiText = optOutUiResult ? `; opt-out UI result: ${optOutUiResult.replace(/_/g, " ")}` : "";
      return `Cross-context behavioral advertising vendor evidence was retained${vendorText}, and no CPRA-specific opt-out control was confirmed${uiText}.`;
    }
    const subtypeText = optOutSubtype.replace(/_/g, " ");
    const uiText = optOutUiResult ? `; opt-out UI result: ${optOutUiResult.replace(/_/g, " ")}` : "";
    return `Cross-context behavioral advertising vendor evidence was retained${vendorText}, and the CPRA opt-out control was incomplete or not confirmed as CPRA-complete (${subtypeText})${uiText}.`;
  }

  if (findingId === "reject_tracking_persists_after_reject") {
    const vendors = getRejectTrackingVendors(packet).slice(0, 3);
    const vendorText = vendors.length > 0 ? ` for ${formatVendorList(vendors)}` : "";
    if (packet.evidence?.flags?.includes("reject_evidence_confirmed")) {
      return `Non-essential tracking requests fired after the reject interaction${vendorText}.`;
    }
    return "Tracking requests were observed during the consent flow, but post-reject timing was not retained.";
  }

  if (findingId === "probable_fingerprinting") {
    const tierResult = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet));
    const vendorClause = tierResult.knownFingerprintingVendorObserved
      ? " and subsequent third-party network activity associated with a known bot-defense/fingerprinting vendor"
      : " and runtime corroboration";
    return `Probable browser/device fingerprinting behavior was observed. The scan detected coordinated collection of high-entropy browser/device attributes${vendorClause}. This may be used for fraud prevention or security, but it can still create privacy review obligations depending on jurisdiction, disclosure, consent posture, and data sharing.`;
  }

  if (findingId === "consent_dark_patterns_detected") {
    return "The retained consent interaction structure shows reject was not available on the first layer.";
  }

  if (findingId === "fingerprinting_related_signals_observed") {
    const tier = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier;
    return tier >= 2
      ? "Fingerprinting-related browser telemetry was observed, but retained evidence does not establish identity-oriented fingerprinting."
      : "Elevated browser/device entropy collection was observed, but retained evidence does not establish identity-oriented fingerprinting.";
  }

  if (findingId === "policy_behavior_contradiction_detected") {
    const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
    const conflict = evidenceDetails?.policyRuntimeConflict;
    const runtimeEvent = conflict ? getPolicyRuntimeRepresentativeEvent(conflict) : null;
    if (conflict?.policyAnchor.snippet && runtimeEvent && evaluatePolicyRuntimeConflictPresentation(packet).complete) {
      return `${trimTrailingSentencePunctuation(
        `Public disclosures describe cookie, device, or third-party data collection, while runtime evidence observed ${runtimeEvent}`
      )}. Review whether the implementation, consent flow, and disclosures align.`;
    }
  }

  return packet.summary;
}

function isSpecificPolicyRuntimeContradiction(packet: UnifiedFindingDisplayPacket) {
  if (packet.unifiedFindingId === "policy_behavior_conflict" || !evaluatePolicyRuntimeConflictPresentation(packet).complete) {
    return false;
  }

  const details = packet.details as Record<string, unknown> | null | undefined;
  const conflictType = typeof details?.conflictType === "string" ? details.conflictType : "";
  const policyClaimType = typeof details?.policyClaimType === "string" ? details.policyClaimType : "";
  const policySnippet = typeof details?.policySnippet === "string" ? details.policySnippet : "";
  const haystack = `${conflictType} ${policyClaimType} ${policySnippet}`;

  return /only\s+after|after\s+(?:you\s+)?(?:set\s+)?(?:cookie\s+)?preferences|after\s+consent|consent(?:ed|ing)?|consent[- ]?gated|reject(?:ion)?\s+(?:disables|stops|prevents|turns off|suppresses)|disabled\s+after\s+reject|only\s+necessary|necessary\s+cookies?\s+only|no\s+(?:sale|share|sharing|marketing|advertis(?:ing|er)|third[- ]party advertising)|declared_no_|declared_only_necessary|declared_tracking_disabled_after_reject/i.test(
    haystack
  );
}

function buildExecutiveFinding(packet: UnifiedFindingDisplayPacket, findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY) {
  const definition = CERT_SCORE_FINDING_REGISTRY[findingId]!;
  const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
  return {
    id: definition.id,
    label:
      findingId === "policy_behavior_contradiction_detected" && isSpecificPolicyRuntimeContradiction(packet)
        ? "Policy/runtime behavior conflict"
        : definition.label,
    section: definition.section,
    defaultSurfacePriority: definition.defaultSurfacePriority,
    whyItMatters: definition.whyItMatters,
    remediation: definition.remediation,
    confidence: findingId === "fingerprinting_related_signals_observed"
      ? "moderate"
      : mapExecutiveConfidence(packet, findingId),
    directVsInferred: mapVerificationStateToDirectness(packet.presentationDecision.verificationState),
    ...(evidenceDetails ? { evidenceDetails } : {}),
    evidencePreview: buildEvidencePreview(packet, findingId),
    evidenceRefs: buildEvidenceRefs(packet),
    ...(CANONICAL_EVIDENCE_FINDING_IDS.has(findingId) ? { evidenceVersion: "1.1" } : {}),
    severity: mapSeverity(packet, findingId),
    shortSummary: buildExecutiveShortSummary(packet, findingId)
  } satisfies CertScoreFinding;
}

function dedupeExecutiveFindings(findings: CertScoreFinding[]) {
  const byId = new Map<string, CertScoreFinding>();

  for (const finding of findings) {
    const existing = byId.get(finding.id);
    if (!existing || getFindingSurfaceScore(finding) > getFindingSurfaceScore(existing)) {
      byId.set(finding.id, finding);
    }
  }

  return [...byId.values()];
}

function deriveExecutivePosture(findings: CertScoreFinding[]) {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "Action Needed" as const;
  }
  if (findings.some((finding) => finding.severity === "medium")) {
    return "Watch" as const;
  }
  return "Clear" as const;
}

export type ExecutiveFindingsProjection = {
  surfacedPackets: UnifiedFindingDisplayPacket[];
  findings: CertScoreFinding[];
  groupedFindings: Array<{ section: CertScoreFindingSection; findings: CertScoreFinding[] }>;
  posture: "Clear" | "Watch" | "Action Needed";
  topFindings: CertScoreFinding[];
  trace: {
    packets: Array<{
      executiveFindingId: string | null;
      inExecutiveFindings: boolean;
      inRegulatoryLensInput: boolean;
      inTopFindings: boolean;
      presentationStatus: UnifiedFindingDisplayPacket["presentationDecision"]["status"];
      reportLane: UnifiedFindingDisplayPacket["surfacingDecision"]["reportLane"];
      sourceRefs: UnifiedFindingDisplayPacket["sourceRefs"];
      surfacingDecisionState: UnifiedFindingDisplayPacket["surfacingDecision"]["decisionState"];
      unifiedFindingId: string;
    }>;
    surfacedPacketIds: string[];
    projectedFindingIds: string[];
    unmappedSurfacedPacketIds: string[];
  };
};

type ExecutiveProjectionPacketRow = {
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY | null;
  packet: UnifiedFindingDisplayPacket;
};

function hasFingerprintingCorroboratingTrackingFinding(packets: UnifiedFindingDisplayPacket[]) {
  return packets.some((packet) => {
    if (FINGERPRINTING_CORROBORATING_TRACKING_IDS.has(packet.unifiedFindingId)) {
      return true;
    }
    return getMappedFindingIds(packet).some((findingId) => FINGERPRINTING_CORROBORATING_TRACKING_IDS.has(findingId));
  });
}

export function projectExecutiveFindingsFromUnifiedPackets(
  packets: UnifiedFindingDisplayPacket[]
): ExecutiveFindingsProjection {
  const surfacedPackets = packets.filter((packet) =>
    packet.presentationDecision.status === "surface" &&
    isFindingProjectionEligible({ lane: "executive", packet })
  );
  const mappedPacketRows: ExecutiveProjectionPacketRow[] = [];
  const hasCorroboratingTrackingFinding = hasFingerprintingCorroboratingTrackingFinding(surfacedPackets);
  for (const packet of surfacedPackets) {
    const findingIds = getMappedFindingIds(packet);
    const executiveEligibleFindingIds = findingIds.filter((findingId) => {
      if (packet.unifiedFindingId !== "fingerprinting_observed") {
        return true;
      }
      const tier = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier;
      if (findingId === "fingerprinting_related_signals_observed" && hasFingerprintingProbableAccessLimitation(packet)) {
        return hasFingerprintingRelatedReviewContext(packet);
      }
      return tier >= 3 || (tier >= 2 && hasCorroboratingTrackingFinding);
    });
    if (executiveEligibleFindingIds.length > 0) {
      mappedPacketRows.push(...executiveEligibleFindingIds.map((findingId) => ({ packet, findingId })));
    } else {
      mappedPacketRows.push({ packet, findingId: null });
    }
  }
  const findings = dedupeExecutiveFindings(
    mappedPacketRows.flatMap(({ packet, findingId }) => (findingId ? [buildExecutiveFinding(packet, findingId)] : []))
  );
  const findingIds = new Set(findings.map((finding) => finding.id));
  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findings
      .filter((finding) => finding.section === section)
      .sort((left, right) => getFindingSurfaceScore(right) - getFindingSurfaceScore(left))
  })).filter((group) => group.findings.length > 0);
  const topFindings = rankFindings(findings);
  const topFindingIds = new Set(topFindings.map((finding) => finding.id));

  return {
    surfacedPackets,
    findings,
    groupedFindings,
    posture: deriveExecutivePosture(findings),
    topFindings,
    trace: {
      packets: mappedPacketRows.map(({ packet, findingId }) => ({
        executiveFindingId: findingId,
        inExecutiveFindings: findingId ? findingIds.has(findingId) : false,
        inRegulatoryLensInput: findingId ? findingIds.has(findingId) : false,
        inTopFindings: findingId ? topFindingIds.has(findingId) : false,
        presentationStatus: packet.presentationDecision.status,
        reportLane: packet.surfacingDecision.reportLane,
        sourceRefs: packet.sourceRefs,
        surfacingDecisionState: packet.surfacingDecision.decisionState,
        unifiedFindingId: packet.unifiedFindingId
      })),
      surfacedPacketIds: surfacedPackets.map((packet) => packet.unifiedFindingId),
      projectedFindingIds: findings.map((finding) => finding.id),
      unmappedSurfacedPacketIds: mappedPacketRows
        .filter(({ findingId }) => !findingId)
        .map(({ packet }) => packet.unifiedFindingId)
    }
  };
}
