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
import { getFindingSurfaceScore, isExecutiveSummaryTopFindingId, rankFindings } from "./rank-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { evaluatePolicyBehaviorContradictionEvidence, getContradictionEvidenceBundle } from "./contradiction-evidence-contract";
import { isFindingProjectionEligible } from "./finding-evidence-contracts";
import {
  classifyRtbCookieSyncEvidenceRows,
  deriveFingerprintEvidenceTier,
  hasStrongFingerprintingEvidence
} from "./promotion-evidence-contracts";
import { evaluateTopFindingEligibility, type TopFindingEligibilityDecision } from "./top-finding-eligibility";
import { evaluateCookieRetentionReview, COOKIE_RETENTION_THRESHOLDS } from "./cookie-retention-review";
import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";
import { getConsentControlLifecycleEvidence } from "./consent-control-lifecycle";
import { getConsentGovernanceDisclosureEvidence } from "./consent-governance-disclosure";
import { buildPromotionGradePreconsentRequests } from "./preconsent-public-evidence";
import { getReportFacingScannedPageUrl, getReportFacingScannedPageUrls } from "./report-facing-page-url";

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
  consent_control_not_reopenable: "consent_dark_patterns_detected",
  dismiss_without_reject: "consent_dark_patterns_detected",
  fingerprinting_observed: "probable_fingerprinting",
  forced_consent_wall: "forced_consent_interaction",
  cookie_disclosure_gap: "cookie_disclosure_gap",
  cpra_cba_opt_out_missing: "cpra_cba_opt_out_missing",
  policy_behavior_conflict: "policy_behavior_contradiction_detected",
  policy_clarity_risk: "policy_clarity_risk",
  preconsent_tracking: "pre_consent_tracking_detected",
  cookie_retention_lifetime_review_signal: "long_lived_cookie_retention_review",
  reject_did_not_reduce_tracking: "reject_tracking_persists_after_reject",
  reject_button_missing: "reject_option_missing_or_hidden",
  rtb_cookie_sync_observed: "rtb_cookie_sync_observed",
  session_replay_observed: "session_recording_services_detected",
  session_replay_undisclosed: "session_recording_services_detected",
  session_replay_present_with_sensitive_surfaces_observed: "session_replay_present_with_sensitive_surfaces_observed",
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

type CpraPrivacyChoiceCompletenessSubtype =
  | "missing"
  | "incomplete_or_unconfirmed";

const CANONICAL_EVIDENCE_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "reject_tracking_persists_after_reject",
  "third_party_tracking_pre_consent",
  "rtb_cookie_sync_observed",
  "cpra_cba_opt_out_missing",
  "cross_domain_identifier_sharing_observed",
  "cookie_disclosure_gap",
  "third_party_cookie_pre_consent",
  "long_lived_cookie_retention_review",
  "consent_dark_patterns_detected",
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
  "session_replay_present_with_sensitive_surfaces_observed",
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
  "long_lived_cookie_retention_review",
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
  "session_replay_present_with_sensitive_surfaces_observed",
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

function getEntityBooleanValue(packet: UnifiedFindingDisplayPacket, pattern: RegExp) {
  const value = getEntityValues(packet, pattern)[0];
  if (/^true$/i.test(value ?? "")) {
    return true;
  }
  if (/^false$/i.test(value ?? "")) {
    return false;
  }
  return null;
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

function getRecordObjectArray(row: Record<string, unknown> | undefined, keys: string[]) {
  if (!row) {
    return [];
  }
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      );
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

function getRecordBoolean(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (/^true$/i.test(value.trim())) {
        return true;
      }
      if (/^false$/i.test(value.trim())) {
        return false;
      }
    }
  }
  return null;
}

function getRecordObject(row: Record<string, unknown> | undefined, keys: string[]) {
  if (!row) {
    return null;
  }
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getFocusManagementEvidenceRows(packet: UnifiedFindingDisplayPacket) {
  return getEntityJsonObjects(packet, "focusManagementEvidence");
}

function hasFocusTraversalEvidence(row: Record<string, unknown>) {
  if (getRecordObject(row, [
    "keyboardTraversalEvidence",
    "keyboard_traversal_evidence",
    "focusPathEvidence",
    "focus_path_evidence"
  ])) {
    return true;
  }
  for (const key of ["keyboardTraversalTrace", "keyboard_traversal_trace", "focusTrace", "focus_trace"]) {
    const value = row[key];
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
  }
  return false;
}

function hasBehaviorReproducedFocusManagementEvidence(rows: Array<Record<string, unknown>>) {
  return rows.some((row) =>
    getRecordString(row, ["evidenceStrength", "evidence_strength"]) === "behavior_reproduced" &&
    hasFocusTraversalEvidence(row)
  );
}

function buildFocusManagementAccessibilityBasis(rows: Array<Record<string, unknown>>) {
  if (hasBehaviorReproducedFocusManagementEvidence(rows)) {
    return "WS01 reproduced the focus-management behavior with keyboard interaction tracing.";
  }
  if (rows.length > 0) {
    return "Focus-management review evidence was retained, but this packet does not include behavior-reproduced keyboard traversal evidence.";
  }
  return "Focus-management review context was retained, but this packet does not include behavior-reproduced keyboard traversal evidence.";
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
  if (findingId === "long_lived_cookie_retention_review") {
    const review = evaluateCookieRetentionReview({
      cookieRetentionEvidence: getEntityJsonObjects(packet, "cookieRetentionEvidence")
    });
    return review.confidence === "strong" ? "strong" : review.confidence === "good" ? "good" : "moderate";
  }
  if (findingId === "reject_tracking_persists_after_reject" && !packet.evidence?.flags?.includes("reject_evidence_confirmed")) {
    return "moderate";
  }
  if (findingId === "policy_behavior_contradiction_detected") {
    return evaluatePolicyRuntimeConflictPresentation(packet).complete ? mapConfidenceBandToExecutiveConfidence(packet.confidenceBand) : "moderate";
  }
  if (findingId === "focus_management_issue") {
    const focusRows = getFocusManagementEvidenceRows(packet);
    return hasBehaviorReproducedFocusManagementEvidence(focusRows)
      ? mapConfidenceBandToExecutiveConfidence(packet.confidenceBand)
      : "moderate";
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
  if (findingId === "long_lived_cookie_retention_review") {
    return evaluateCookieRetentionReview({
      cookieRetentionEvidence: getEntityJsonObjects(packet, "cookieRetentionEvidence")
    }).severity;
  }
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
  if (packet.unifiedFindingId === "blocking_overlay_observed") {
    return null;
  }
  if (packet.unifiedFindingId === "policy_clarity_risk") {
    return null;
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
  const rejectPath = getConsentUiPathEvidence(packet);
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

function getConsentUiPathEvidence(packet: UnifiedFindingDisplayPacket) {
  return getFirstEntityJsonObject(packet, "consentUiPathEvidence") ??
    getFirstEntityJsonObject(packet, "rejectPathDepthAndAvailability") ??
    getFirstEntityJsonObject(packet, "reject_path_depth_and_availability") ??
    (packet.unifiedFindingId === "blocking_overlay_observed" ? getBlockingOverlayPathEvidence(packet) : null);
}

function getBlockingOverlayPathEvidence(packet: UnifiedFindingDisplayPacket) {
  const evidence = getFirstEntityJsonObject(packet, "blockingOverlayEvidence");
  if (!evidence) {
    return null;
  }

  const rejectDepthClass = getRecordString(evidence, ["rejectDepthClass", "reject_depth_class"]);
  const acceptPresent = getRecordBoolean(evidence, ["acceptPresent", "accept_present"]);
  const rejectPresent = getRecordBoolean(evidence, ["rejectPresent", "reject_present"]);
  const managePresent = getRecordBoolean(evidence, ["managePresent", "manage_present"]);
  const interactionBlocked = getRecordBoolean(evidence, ["interactionBlocked", "interaction_blocked"]);
  const pageAccessBlockedUntilChoice = getRecordBoolean(evidence, [
    "pageAccessBlockedUntilChoice",
    "page_access_blocked_until_choice"
  ]);
  const rejectClickDepth = rejectDepthClass === "second_layer"
    ? 2
    : rejectDepthClass === "missing" || rejectPresent === false
      ? null
      : rejectPresent === true
        ? 1
        : null;
  const result: Record<string, unknown> = {
    availability: rejectPresent === false ? "absent" : rejectDepthClass ?? null,
    surfaceType: getRecordString(evidence, ["overlayType", "overlay_type"]),
    acceptLabel: acceptPresent === true ? "Accept" : null,
    rejectLabel: rejectPresent === true ? "Reject" : null,
    manageChoicesLabel: managePresent === true ? "Manage choices" : null,
    rejectAvailableOnFirstLayer: rejectPresent === true && rejectDepthClass === "same_layer",
    preferencesRequiredBeforeReject: rejectDepthClass === "second_layer" || (managePresent === true && rejectPresent !== true),
    acceptClickDepth: acceptPresent === true ? 1 : null,
    rejectClickDepth,
    choiceAsymmetry:
      acceptPresent === true && (rejectPresent === false || rejectDepthClass === "second_layer")
        ? "material"
        : null,
    blockedPageInteraction: interactionBlocked === true || pageAccessBlockedUntilChoice === true,
    pageAccessBlockedUntilChoice,
    visualHierarchyBasis: "blocking_overlay_runtime_evidence"
  };

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== null && value !== undefined)
  );
}

function buildConsentUiRuntimePathEvidence(row: Record<string, unknown>) {
  const acceptClickDepth = getRecordNumber(row, ["acceptClickDepth", "accept_click_depth"]);
  const rejectClickDepth = getRecordNumber(row, ["rejectClickDepth", "reject_click_depth", "depth"]);
  const evidenceRefs = getRecordStringArray(row, ["evidenceRefs", "evidence_refs", "artifactRefs", "artifact_refs"]);
  const result: Record<string, unknown> = {
    availability: getRecordString(row, ["availability", "status", "outcome"]),
    surfaceType: getRecordString(row, ["surfaceType", "surface_type", "overlayKind", "overlay_kind"]),
    acceptLabel: getRecordString(row, ["acceptLabel", "accept_label"]),
    rejectLabel: getRecordString(row, ["rejectLabel", "reject_label"]),
    manageChoicesLabel: getRecordString(row, ["manageChoicesLabel", "manage_choices_label", "preferencesLabel", "preferences_label"]),
    rejectAvailableOnFirstLayer: getRecordBoolean(row, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]),
    preferencesRequiredBeforeReject: getRecordBoolean(row, ["preferencesRequiredBeforeReject", "preferences_required_before_reject"]),
    acceptClickDepth,
    rejectClickDepth,
    choiceAsymmetry: getRecordString(row, ["choiceAsymmetry", "choice_asymmetry"]),
    scrollRequired: getRecordBoolean(row, ["scrollRequired", "scroll_required"]),
    blockedPageInteraction: getRecordBoolean(row, [
      "blockedPageInteraction",
      "blocked_page_interaction",
      "pageInteractionBlocked",
      "page_interaction_blocked"
    ]),
    pageAccessBlockedUntilChoice: getRecordBoolean(row, [
      "pageAccessBlockedUntilChoice",
      "page_access_blocked_until_choice"
    ]),
    forcedActionRequired: getRecordBoolean(row, ["forcedActionRequired", "forced_action_required"]),
    scrollLocked: getRecordBoolean(row, ["scrollLocked", "scroll_locked"]),
    contentObstructed: getRecordBoolean(row, ["contentObstructed", "content_obstructed"]),
    blockingEvidenceSource: getRecordString(row, ["blockingEvidenceSource", "blocking_evidence_source"]),
    visualHierarchyBasis: getRecordString(row, ["visualHierarchyBasis", "visual_hierarchy_basis"]),
    screenshotArtifactAvailable: evidenceRefs.some((ref) => /screen|image|png|jpeg|jpg/i.test(ref)),
    domDigestAvailable: Boolean(getRecordString(row, ["domDigest", "dom_digest", "domEvidenceDigest", "dom_evidence_digest"])),
    evidenceRefs
  };

  if (acceptClickDepth !== null && rejectClickDepth !== null) {
    result.pathDepthDelta = rejectClickDepth - acceptClickDepth;
  }

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined
    )
  );
}

function getConsentUiFirstLayerControls(diagnostics: Record<string, unknown> | null) {
  return getRecordObjectArray(diagnostics ?? undefined, ["candidateButtons", "candidate_buttons", "firstLayerControls", "first_layer_controls"])
    .map((row) => {
      const label = getRecordString(row, ["label", "text", "visibleText", "visible_text", "name"]);
      if (!label) {
        return null;
      }
      return {
        label,
        visible: getRecordBoolean(row, ["visible", "isVisible", "is_visible"]),
        interactable: getRecordBoolean(row, ["interactable", "isInteractable", "is_interactable"]),
        role: getRecordString(row, ["role", "controlRole", "control_role"])
      };
    })
    .filter((row): row is { label: string; visible: boolean | null; interactable: boolean | null; role: string | null } => row !== null)
    .slice(0, 8);
}

function getConsentUiControlsFromRuntimePath(runtimePath: Record<string, unknown> | null) {
  if (!runtimePath) {
    return [];
  }
  return [
    { label: getRecordString(runtimePath, ["acceptLabel", "accept_label"]), role: "button" },
    { label: getRecordString(runtimePath, ["rejectLabel", "reject_label"]), role: "button" },
    { label: getRecordString(runtimePath, ["manageChoicesLabel", "manage_choices_label"]), role: "button" }
  ]
    .filter((row): row is { label: string; role: string } => typeof row.label === "string" && row.label.trim().length > 0)
    .map((row) => ({
      label: row.label,
      visible: true,
      interactable: true,
      role: row.role
    }))
    .slice(0, 8);
}

function buildRejectPathConsentUiBasis(input: {
  runtimePath: Record<string, unknown> | null;
  rejectOptionSubtype: string | null;
}) {
  const rejectAvailableOnFirstLayer = getRecordBoolean(input.runtimePath ?? {}, [
    "rejectAvailableOnFirstLayer",
    "reject_available_on_first_layer"
  ]);
  const preferencesRequiredBeforeReject = getRecordBoolean(input.runtimePath ?? {}, [
    "preferencesRequiredBeforeReject",
    "preferences_required_before_reject"
  ]);
  const acceptDepth = getRecordNumber(input.runtimePath ?? {}, ["acceptClickDepth", "accept_click_depth"]);
  const rejectDepth = getRecordNumber(input.runtimePath ?? {}, ["rejectClickDepth", "reject_click_depth", "depth"]);

  if (rejectAvailableOnFirstLayer === false && preferencesRequiredBeforeReject === true && rejectDepth !== null) {
    return `Retained consent UI path evidence showed no first-layer reject/refusal action; reject required the preferences path and was observed at click depth ${rejectDepth}.`;
  }
  if (preferencesRequiredBeforeReject === true && rejectDepth !== null) {
    return `Retained consent UI path evidence showed the reject/refusal path required opening preferences and was observed at click depth ${rejectDepth}.`;
  }
  if (rejectAvailableOnFirstLayer === false) {
    return "Retained consent UI path evidence showed no visible or equivalent reject/refusal action on the first observed consent layer.";
  }
  if (acceptDepth !== null && rejectDepth !== null && rejectDepth > acceptDepth) {
    return `Retained consent UI path evidence showed a materially deeper reject/refusal path than accept (${rejectDepth} steps vs ${acceptDepth}).`;
  }
  if (input.rejectOptionSubtype === "reject_present_but_visually_hidden") {
    return "Retained consent UI path evidence showed the reject/refusal option was present but visually hidden or materially hard to perceive.";
  }
  return "Retained consent UI path evidence showed the reject/refusal choice was not visible or equivalent on the first observed consent layer.";
}

function buildAsymmetricConsentUiBasis(runtimePath: Record<string, unknown> | null) {
  const preferencesRequiredBeforeReject = getRecordBoolean(runtimePath ?? {}, [
    "preferencesRequiredBeforeReject",
    "preferences_required_before_reject"
  ]);
  const acceptDepth = getRecordNumber(runtimePath ?? {}, ["acceptClickDepth", "accept_click_depth"]);
  const rejectDepth = getRecordNumber(runtimePath ?? {}, ["rejectClickDepth", "reject_click_depth", "depth"]);
  const choiceAsymmetry = getRecordString(runtimePath ?? {}, ["choiceAsymmetry", "choice_asymmetry"]);
  const scrollRequired = getRecordBoolean(runtimePath ?? {}, ["scrollRequired", "scroll_required"]);

  if (acceptDepth !== null && rejectDepth !== null && rejectDepth > acceptDepth) {
    return `Retained consent UI path evidence showed acceptance was available with materially lower interaction cost than refusal; accept required ${acceptDepth} step(s), while reject required ${rejectDepth}.`;
  }
  if (preferencesRequiredBeforeReject === true && rejectDepth !== null) {
    return `Retained consent UI path evidence showed acceptance was easier than refusal; reject required the preferences path and was observed at click depth ${rejectDepth}.`;
  }
  if (scrollRequired === true && choiceAsymmetry === "material") {
    return "Retained consent UI path evidence showed materially imbalanced consent choices, including a reject/refusal path that required scrolling.";
  }
  if (choiceAsymmetry === "material" || choiceAsymmetry === "minor") {
    return `Retained consent UI path evidence classified the accept and reject paths as ${choiceAsymmetry}ly imbalanced.`;
  }
  return "Retained consent UI path evidence showed accept and reject choices were not equivalent in visibility, prominence, or interaction cost.";
}

function buildConsentUiBasis(input: {
  evidenceSnippets: string[];
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY;
  rejectOptionSubtype: string | null;
  runtimePath: Record<string, unknown> | null;
  summary: string;
}) {
  if (input.findingId === "reject_option_missing_or_hidden") {
    return buildRejectPathConsentUiBasis({
      runtimePath: input.runtimePath,
      rejectOptionSubtype: input.rejectOptionSubtype
    });
  }
  if (input.findingId === "asymmetric_consent_ui") {
    return buildAsymmetricConsentUiBasis(input.runtimePath);
  }
  return input.evidenceSnippets[0] ?? input.summary;
}

function buildConsentUiUserChoiceImpact(input: {
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY;
  rejectOptionSubtype: string | null;
}) {
  if (input.findingId === "asymmetric_consent_ui") {
    return "Accept and reject choices were retained with materially different visibility, emphasis, or interaction cost.";
  }
  if (input.findingId !== "reject_option_missing_or_hidden") {
    return "Consent UI evidence may affect how easily users can exercise a choice.";
  }
  return input.rejectOptionSubtype === "reject_requires_preferences_path"
    ? "Reject choice was retained behind an additional preferences or manage-choices path."
    : input.rejectOptionSubtype === "reject_present_but_visually_hidden"
      ? "Reject choice was retained but visually hidden or materially hard to perceive."
      : input.rejectOptionSubtype === "reject_depth_asymmetry"
        ? "Reject choice required materially more interaction than the accept path."
        : input.rejectOptionSubtype === "reject_absent_first_layer"
          ? "Reject choice was not retained as visible or equivalent on the first observed consent layer."
          : "Reject path evidence was retained, but the exact reject availability subtype is ambiguous.";
}

function sanitizeRequestClassificationAnchor(row: Record<string, unknown>) {
  const url =
    getRecordString(row, ["url", "requestUrl", "request_url", "redactedUrl", "redacted_url", "urlSample", "url_sample"]) ??
    null;
  const hostname =
    getRecordString(row, ["hostname", "host", "domain"]) ??
    getUrlHostname(url);
  const result: Record<string, unknown> = {
    ...(url ? { requestUrl: url } : {}),
    hostname,
    ...(url ? { registrableDomain: getUrlHostname(url)?.split(".").slice(-2).join(".") ?? hostname } : {}),
    vendor: getRecordString(row, ["vendor", "vendorName", "vendor_name", "matchedVendorName", "matched_vendor_name"]),
    category: getRecordString(row, ["category", "vendorCategory", "vendor_category", "classification", "purpose"]),
    essentiality: getRecordString(row, ["essentiality", "classificationEssentiality", "classification_essentiality"]),
    confidence: getRecordString(row, ["confidence", "classificationConfidence", "classification_confidence"]),
    phase: getRecordString(row, ["phase", "runtimePhase", "runtime_phase", "timingStatus", "timing_status"]),
    firstObservedMs: getRecordNumber(row, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms", "timestampMs", "timestamp_ms"]),
    evidenceSource: getRecordString(row, ["evidenceSource", "evidence_source", "source"]),
    vendorAttributionBasis: getRecordString(row, [
      "vendorAttributionBasis",
      "vendor_attribution_basis",
      "classificationBasis",
      "classification_basis",
      "matchedSignatureId",
      "matched_signature_id",
      "evidenceSource",
      "evidence_source",
      "source"
    ])
  };

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== null && value !== undefined)
  );
}

function sanitizeAccessibilityAxeEvidence(row: Record<string, unknown>) {
  const representativeSelectors = uniqueStrings([
    ...getRecordStringArray(row, ["representativeSelectors", "representative_selectors", "selectors"]),
    getRecordString(row, ["selector", "target"])
  ]);
  const representativeNodes = [
    ...getRecordObjectArray(row, ["representativeNodes", "representative_nodes"])
  ].map((node) => {
    const selectors = uniqueStrings([
      ...getRecordStringArray(node, ["selectors", "target", "targets"]),
      getRecordString(node, ["selector"])
    ]).slice(0, 5);
    const colorContrast = getRecordObjectArray(node, ["colorContrast", "color_contrast"])[0] ??
      (node.colorContrast && typeof node.colorContrast === "object" && !Array.isArray(node.colorContrast)
        ? node.colorContrast as Record<string, unknown>
        : node.color_contrast && typeof node.color_contrast === "object" && !Array.isArray(node.color_contrast)
          ? node.color_contrast as Record<string, unknown>
          : null);
    const checks = getRecordObjectArray(node, ["checks"]).slice(0, 5).map((check) =>
      Object.fromEntries(
        Object.entries({
          id: getRecordString(check, ["id"]),
          message: getRecordString(check, ["message"]),
          data: check.data && typeof check.data === "object" && !Array.isArray(check.data)
            ? check.data as Record<string, unknown>
            : null
        }).filter(([, value]) => value !== null && value !== undefined)
      )
    ).filter((check) => Object.keys(check).length > 0);
    return Object.fromEntries(
      Object.entries({
        selectors,
        failureSummary: getRecordString(node, ["failureSummary", "failure_summary"]),
        htmlSnippet: getRecordString(node, ["htmlSnippet", "html_snippet", "sanitizedHtmlSnippet", "sanitized_html_snippet"]),
        textSnippet: getRecordString(node, ["textSnippet", "text_snippet"]),
        ...(colorContrast ? { colorContrast } : {}),
        ...(checks.length > 0 ? { checks } : {})
      }).filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)
    );
  }).filter((node) => Object.keys(node).length > 0);
  const result: Record<string, unknown> = {
    ruleId: getRecordString(row, ["ruleId", "rule_id", "id"]),
    impact: getRecordString(row, ["impact", "severity"]),
    nodeCount: getRecordNumber(row, ["nodeCount", "node_count", "affectedNodeCount", "affected_node_count", "count"]),
    description: getRecordString(row, ["description", "help"]),
    helpUrl: getRecordString(row, ["helpUrl", "help_url"]),
    pageUrl: getRecordString(row, ["pageUrl", "page_url", "url"]),
    componentOrTemplate: getRecordString(row, ["componentOrTemplate", "component_or_template", "template", "component"]),
    representativeNodes: representativeNodes.slice(0, 5),
    representativeSelectors: representativeSelectors.slice(0, 8)
  };

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined
    )
  );
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

function getThirdPartyCookiePreConsentRows(packet: UnifiedFindingDisplayPacket) {
  const cookieRows = getEntityJsonObjects(packet, "preconsent_cookie_evidence");
  return cookieRows.filter((row) => {
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
}

function hasThirdPartyCookiePreConsentEvidence(packet: UnifiedFindingDisplayPacket) {
  const details = packet.unifiedFindingId === "preconsent_tracking"
    ? buildPreConsentTrackingEvidenceDetails(packet)
    : null;
  const thirdPartyTrackingCookieRows = getThirdPartyCookiePreConsentRows(packet);
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

function getRecordValueAsBoolean(row: Record<string, unknown> | null | undefined, keys: string[]) {
  return getRecordBoolean(row ?? {}, keys);
}

function hasRejectPersistencePromotionEvidence(packet: UnifiedFindingDisplayPacket) {
  if (packet.unifiedFindingId !== "reject_did_not_reduce_tracking") {
    return true;
  }

  const promotionDecision = getFirstEntityJsonObject(packet, "promotionDecision");
  if (getRecordValueAsBoolean(promotionDecision, ["promoted"]) === false) {
    return false;
  }

  const suppressionChecks = getFirstEntityJsonObject(packet, "suppressionChecks");
  const navigationOrReloadAmbiguous = getRecordValueAsBoolean(suppressionChecks, [
    "navigation_or_reload_ambiguous",
    "navigationOrReloadAmbiguous",
    "redirect_or_auth_wall_ambiguous",
    "redirectOrAuthWallAmbiguous"
  ]);
  const postRejectWindowAvailable = getRecordValueAsBoolean(suppressionChecks, [
    "post_reject_window_available",
    "postRejectWindowAvailable"
  ]);
  const rejectClickConfirmed = getRecordValueAsBoolean(suppressionChecks, [
    "reject_click_confirmed",
    "rejectClickConfirmed"
  ]);
  const nonEssentialVendorAfterReject = getRecordValueAsBoolean(suppressionChecks, [
    "non_essential_vendor_after_reject",
    "nonEssentialVendorAfterReject"
  ]);
  if (navigationOrReloadAmbiguous === true || postRejectWindowAvailable === false) {
    return false;
  }
  if (rejectClickConfirmed === false || nonEssentialVendorAfterReject === false) {
    return false;
  }

  const postRejectRequests = getEntityJsonObjects(packet, "postRejectNonEssentialRequests");
  const hasTimedPostRejectRequest = postRejectRequests.some((row) =>
    getRecordNumber(row, ["ms_after_reject", "msAfterReject"]) !== null ||
    getRecordNumber(row, ["ts_ms", "timestampMs", "firstSeenMs"]) !== null
  );
  const hasConfirmedFlag = packet.evidence?.flags?.includes("reject_evidence_confirmed") === true;

  return hasConfirmedFlag && hasTimedPostRejectRequest;
}

function getMappedFindingIds(packet: UnifiedFindingDisplayPacket): Array<keyof typeof CERT_SCORE_FINDING_REGISTRY> {
  const primary = getMappedFindingId(packet);
  const ids = primary ? [primary] : [];

  if (primary === "reject_tracking_persists_after_reject" && !hasRejectPersistencePromotionEvidence(packet)) {
    return [];
  }

  if (packet.unifiedFindingId === "blocking_overlay_observed") {
    const overlayEvidence = getFirstEntityJsonObject(packet, "blockingOverlayEvidence");
    const overlayType = getRecordString(overlayEvidence ?? {}, ["overlayType", "overlay_type"]);
    const rejectPresent = getRecordBoolean(overlayEvidence ?? {}, ["rejectPresent", "reject_present"]);
    const pageAccessBlockedUntilChoice = getRecordBoolean(overlayEvidence ?? {}, [
      "pageAccessBlockedUntilChoice",
      "page_access_blocked_until_choice"
    ]);
    const interactionBlocked = getRecordBoolean(overlayEvidence ?? {}, ["interactionBlocked", "interaction_blocked"]);
    if ((overlayType === "cookie_wall" || pageAccessBlockedUntilChoice === true) && (interactionBlocked === true || pageAccessBlockedUntilChoice === true)) {
      ids.push("forced_consent_interaction");
    }
    if (rejectPresent === false) {
      ids.push("reject_option_missing_or_hidden");
      ids.push("consent_dark_patterns_detected");
    }
  }

  if (
    primary === "third_party_cookie_pre_consent" &&
    !hasThirdPartyCookiePreConsentEvidence(packet)
  ) {
    return [];
  }

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

  if (
    primary === "session_replay_present_with_sensitive_surfaces_observed" &&
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

  if ((findingId === "cookie_disclosure_gap" || findingId === "policy_behavior_contradiction_detected") && evidenceDetails?.runtimeVendorDisclosure) {
    const disclosure = evidenceDetails.runtimeVendorDisclosure as Record<string, unknown>;
    const unmatchedVendors = Array.isArray(disclosure.unmatchedVendors) ? disclosure.unmatchedVendors.filter((value): value is string => typeof value === "string") : [];
    const unmatchedDomains = Array.isArray(disclosure.unmatchedDomains) ? disclosure.unmatchedDomains.filter((value): value is string => typeof value === "string") : [];
    const policySurfaces = Array.isArray(disclosure.policySurfacesSearched)
      ? disclosure.policySurfacesSearched.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      : [];
    return uniqueStrings([
      unmatchedVendors.length > 0
        ? `${unmatchedVendors.length} observed runtime vendor${unmatchedVendors.length === 1 ? "" : "s"} did not clearly match retained disclosure evidence.`
        : unmatchedDomains.length > 0
          ? `${unmatchedDomains.length} observed runtime domain${unmatchedDomains.length === 1 ? "" : "s"} did not clearly match retained disclosure evidence.`
          : null,
      unmatchedVendors[0] ? `Example vendor: ${unmatchedVendors[0]}.` : unmatchedDomains[0] ? `Example domain: ${unmatchedDomains[0]}.` : null,
      policySurfaces.length > 0
        ? `Disclosure surfaces searched: ${policySurfaces.map((surface) => String(surface.type ?? "policy")).slice(0, 3).join(", ")}.`
        : null,
      typeof disclosure.coverageStatus === "string" ? `Coverage status: ${disclosure.coverageStatus}.` : null
    ]).slice(0, 4);
  }

  if (
    (findingId === "cookie_disclosure_gap" ||
      findingId === "policy_behavior_contradiction_detected" ||
      findingId === "consent_dark_patterns_detected") &&
    evidenceDetails?.consentGovernanceDisclosure
  ) {
    const governance = evidenceDetails.consentGovernanceDisclosure as Record<string, unknown>;
    const missingSignals = Array.isArray(governance.missingSignals)
      ? governance.missingSignals.filter((value): value is string => typeof value === "string")
      : [];
    const policyUrls = [
      ...(Array.isArray(governance.policyUrls) ? governance.policyUrls : []),
      ...(Array.isArray(governance.cookiePolicyUrls) ? governance.cookiePolicyUrls : []),
      ...(Array.isArray(governance.preferenceCenterUrls) ? governance.preferenceCenterUrls : [])
    ].filter((value): value is string => typeof value === "string");
    return uniqueStrings([
      "Consent preferences and withdrawal process were not clearly explained in retained public materials.",
      missingSignals.length > 0 ? `Gap signals: ${missingSignals.slice(0, 3).join(", ")}.` : null,
      policyUrls.length > 0 ? `Reviewed surface: ${policyUrls[0]}.` : null,
      "Automated public-web observation; manual review should confirm current policy, cookie, and preference-center materials."
    ]).slice(0, 4);
  }

  if (findingId === "pre_consent_tracking_detected" && evidenceDetails) {
    const vendorNames = getPreconsentRepresentativeVendorNames(evidenceDetails).slice(0, 5);
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

  if (findingId === "long_lived_cookie_retention_review" && evidenceDetails?.cookieEvidence) {
    const cookieEvidence = evidenceDetails.cookieEvidence as Record<string, unknown>;
    const retainedCookies = Array.isArray(cookieEvidence.retainedRuntimeCookies)
      ? cookieEvidence.retainedRuntimeCookies.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      : [];
    const longest = cookieEvidence.longestObservedCookie && typeof cookieEvidence.longestObservedCookie === "object"
      ? cookieEvidence.longestObservedCookie as Record<string, unknown>
      : retainedCookies[0];
    const trackingCount = evidenceDetails.counts?.longLivedTrackingCookieCount ?? 0;
    const unknownCount = evidenceDetails.counts?.longLivedUnclassifiedCookieCount ?? 0;
    return uniqueStrings([
      trackingCount > 0
        ? `${trackingCount} long-lived tracking cookies exceeded the ${COOKIE_RETENTION_THRESHOLDS.mainReviewDays}-day review threshold.`
        : null,
      unknownCount > 0
        ? `${unknownCount} unclassified cookies exceeded the ${COOKIE_RETENTION_THRESHOLDS.mainReviewDays}-day review threshold and may need classification.`
        : null,
      longest
        ? `Longest observed cookie: ${String(longest.name ?? "unknown")} on ${String(longest.domain ?? "unknown domain")}, ${Math.round(Number(longest.durationDays ?? 0))} days, ${String(longest.classification ?? longest.category ?? "unclassified")}.`
        : null
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

function isSameAuditHost(value: string, auditedUrl: string | null) {
  const valueHost = getUrlHostname(value);
  const auditedHost = getUrlHostname(auditedUrl);
  return Boolean(valueHost && auditedHost && (valueHost === auditedHost || valueHost.endsWith(`.${auditedHost}`) || auditedHost.endsWith(`.${valueHost}`)));
}

function getAuditPageUrlCandidates(packet: UnifiedFindingDisplayPacket) {
  const initialCandidates = uniqueCaseInsensitiveStrings([
    ...getReportFacingScannedPageUrls(packet),
    getReportFacingScannedPageUrl(packet),
    packet.sourceUrl && getReportFacingScannedPageUrl({
      evidence: {
        pageUrls: [],
        sourceUrls: [packet.sourceUrl]
      },
      primaryPageUrl: null
    })
  ]);
  const auditedUrl = initialCandidates.find((url) => url === packet.primaryPageUrl) ?? initialCandidates[0] ?? null;
  return initialCandidates.filter((url) => !auditedUrl || isSameAuditHost(url, auditedUrl));
}

function getScannedPageUrl(packet: UnifiedFindingDisplayPacket) {
  return getAuditPageUrlCandidates(packet)[0] ?? null;
}

function getScannedPageUrls(packet: UnifiedFindingDisplayPacket) {
  return getAuditPageUrlCandidates(packet);
}

function getUrlQueryKeysSample(value: string) {
  const redactedQueryKeys = /\bquery_keys=([^\]\s]+)/i.exec(value)?.[1]
    ?.split(",")
    .map((key) => key.trim())
    .filter(Boolean) ?? [];
  try {
    return uniqueStrings([...new URL(stripRedactionAnnotation(value)).searchParams.keys(), ...redactedQueryKeys]).slice(0, 8);
  } catch {
    return uniqueStrings(redactedQueryKeys).slice(0, 8);
  }
}

const IDENTIFIER_QUERY_KEY_PATTERN =
  /^(?:uid|uuid|user_id|userid|visitor|visitor_id|client_id|cid|fbp|fbc|gclid|msclkid|ttclid|rdt_uuid|email|hashed|hash|identity|id|partnerid|partner_uid|partner_id|uid2|euid|id5id|tdid|ttd_pid|ttd_tpi|ttd_puid)$/i;

type RuntimeRequestEvidenceRow = {
  url: string;
  hostname: string;
  vendor: string | null;
  category: string | null;
  resourceType?: string | null;
  firstSeenMs?: number | null;
  thirdParty: boolean;
  preConsent: boolean;
  identifierLike: boolean;
  deviceDataLike: boolean;
  queryKeysSample: string[];
  runtimePhase?: string | null;
  confidence?: number | string | null;
  vendorAttributionBasis?: string | null;
  matchedSignatureId?: string | null;
  scannedPageUrl?: string | null;
};

function getRequestPurposeClassificationRows(packet: UnifiedFindingDisplayPacket) {
  return [
    ...getEntityJsonObjects(packet, "requestPurposeClassificationConfidence"),
    ...getEntityJsonObjects(packet, "request_purpose_classification_confidence")
  ];
}

function urlsMatch(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }
  return left === right || stripUrlQuery(left) === stripUrlQuery(right);
}

function stripUrlQuery(value: string) {
  const base = value.replace(/\s+\[(?:query_redacted|redacted|query_keys)=[^\]]+\]$/i, "").trim();
  const queryIndex = base.indexOf("?");
  return queryIndex >= 0 ? base.slice(0, queryIndex) : base;
}

function stripRedactionAnnotation(value: string) {
  return value.replace(/\s+\[(?:query_redacted|redacted|query_keys)=[^\]]+\]$/i, "").trim();
}

function findRequestPurposeRow(url: string, rows: Record<string, unknown>[]) {
  const hostname = getUrlHostname(url);
  return rows.find((row) => {
    const requestUrl = getRecordString(row, ["requestUrl", "request_url", "url"]);
    if (urlsMatch(requestUrl, url)) {
      return true;
    }
    const rowHost = getRecordString(row, ["hostname", "domain", "requestDomain", "request_domain"]);
    return Boolean(hostname && rowHost === hostname);
  });
}

function compactRequestEvidenceRow(row: RuntimeRequestEvidenceRow) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  ) as RuntimeRequestEvidenceRow;
}

function compactEvidenceObject<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  ) as Partial<T>;
}

function getRepresentativeRequestDetails(urls: string[], vendors: string[], requestPurposeRows: Record<string, unknown>[] = []) {
  return urls.slice(0, 8).map((url, index) => {
    const requestPurposeRow = findRequestPurposeRow(url, requestPurposeRows);
    const hostname = getUrlHostname(url) ?? url;
    const vendor =
      getRecordString(requestPurposeRow ?? {}, ["vendor", "vendorName", "vendor_name"]) ??
      inferVendorNameFromUrl(url, vendors) ??
      vendors[index] ??
      null;
    const category =
      getRecordString(requestPurposeRow ?? {}, ["category", "vendorCategory", "vendor_category"]) ??
      normalizeVendorCategory(vendor, url, classifyTrackingCategory(`${vendor ?? ""} ${hostname} ${url}`));
    const timingStatus = getRecordString(requestPurposeRow ?? {}, ["timingStatus", "timing_status", "runtimePhase", "runtime_phase"]);
    const requestUrl = getRecordString(requestPurposeRow ?? {}, ["requestUrl", "request_url", "url"]) ?? url;
    return compactRequestEvidenceRow({
      url: requestUrl,
      hostname,
      vendor,
      category,
      resourceType:
        getRecordString(requestPurposeRow ?? {}, ["resourceType", "resource_type", "type"]) ??
        (/\.js(?:[?#]|$)|\/gtm\.js|script/i.test(url) ? "script" : null),
      firstSeenMs: getRecordNumber(requestPurposeRow ?? {}, ["firstObservedMs", "first_observed_ms", "timestampMs", "timestamp_ms", "tsMs", "ts_ms"]),
      thirdParty: true,
      preConsent: timingStatus === "pre_consent",
      identifierLike: isLikelyIdentifierRequest(requestUrl),
      deviceDataLike: isLikelyDeviceDataRequest(requestUrl),
      queryKeysSample: getUrlQueryKeysSample(requestUrl),
      runtimePhase: timingStatus,
      confidence: getRecordNumber(requestPurposeRow ?? {}, ["confidence"]),
      vendorAttributionBasis: getRecordString(requestPurposeRow ?? {}, ["vendorAttributionBasis", "vendor_attribution_basis", "classificationBasis", "classification_basis"]),
      matchedSignatureId: getRecordString(requestPurposeRow ?? {}, ["matchedSignatureId", "matched_signature_id"]),
      scannedPageUrl: getRecordString(requestPurposeRow ?? {}, ["pageUrl", "page_url", "scannedPageUrl", "scanned_page_url"])
    });
  });
}

function getVendorDetails(vendors: string[], representativeRequests: Array<{ vendor: string | null; url: string; firstSeenMs?: number | null; category: string | null }>) {
  return vendors.slice(0, 8).map((name) => {
    const matchingRequest = representativeRequests.find((request) =>
      request.vendor === name || inferVendorNameFromUrl(request.url, [name]) === name
    );
    return {
      name,
      category: normalizeVendorCategory(name, matchingRequest?.url ?? null, matchingRequest?.category ?? classifyTrackingCategory(name)),
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

function normalizeVendorCategory(
  vendor: string | null | undefined,
  url: string | null | undefined,
  category: string | null | undefined
) {
  const normalized = `${vendor ?? ""} ${url ?? ""}`.toLowerCase();
  if (/microsoft\s+clarity|clarity\.ms|\bclarity\b/i.test(normalized)) {
    return "session_replay";
  }
  if (/google\s+tag\s+manager|googletagmanager\.com|gtm\.js|\bgtm\b/i.test(normalized)) {
    return "tag_manager";
  }
  if (/microsoft\s+advertising|bing\s+uet|bat\.bing\.com|\buet\b|\bbing\b/i.test(normalized)) {
    return "advertising_measurement";
  }
  return category ?? classifyTrackingCategory(`${vendor ?? ""} ${url ?? ""}`);
}

function inferEndpointVendorNameFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  if (/c?\.?bing\.com|bat\.bing\.com/i.test(url)) {
    return "Microsoft Advertising / Bing UET";
  }
  if (/clarity\.ms|c\.clarity\.ms/i.test(url)) {
    return "Microsoft Clarity";
  }
  if (/googletagmanager\.com/i.test(url)) {
    return "Google Tag Manager";
  }
  return null;
}

function getPreconsentCookieExamples(cookieRows: Record<string, unknown>[], consentTimeline?: Record<string, unknown> | null) {
  const consentActionMs = getRecordNumber(consentTimeline ?? {}, ["firstConsentActionMs", "first_consent_action_ms", "consentActionMs", "consent_action_ms"]);
  return cookieRows
    .map((row) => {
      const cookieName = getRecordString(row, ["cookieName", "cookie_name", "name"]);
      const timingEvidence = getRecordString(row, ["timingEvidence", "timing_evidence"]);
      const setAtMs = getRecordNumber(row, ["setAtMs", "set_at_ms", "firstObservedAtMs", "first_observed_at_ms"]);
      const rawExpiresDays = getRecordNumber(row, ["expiresDays", "expires_days", "durationDays", "duration_days", "maxAgeDays", "max_age_days"]);
      const sourceRequestUrl = getCookieEvidenceSourceRequestUrl(row);
      const setBeforeConsent =
        timingEvidence === "before_consent_cookie_write" ||
        row.beforeConsent === true ||
        row.before_consent === true;

      if (!cookieName && !setBeforeConsent) {
        return null;
      }

      return {
        cookieName,
        domain: getRecordString(row, ["domain", "cookieDomain", "cookie_domain"]),
        category: getRecordString(row, ["category", "cookieCategory", "cookie_category", "vendorCategory", "vendor_category"]),
        setAtMs,
        ...(rawExpiresDays !== null ? { expiresDays: rawExpiresDays } : {}),
        sourceVendor: getRecordString(row, [
          "sourceVendor",
          "source_vendor",
          "vendor",
          "vendorName",
          "cookieInitiatorVendor",
          "cookie_initiator_vendor",
          "initiatorVendor",
          "initiator_vendor"
        ]),
        ...(sourceRequestUrl ? { sourceRequestUrl } : {}),
        initiatorUrl: getRecordString(row, ["initiatorUrl", "initiator_url", "sourceUrl", "source_url", "responseUrl", "response_url"]),
        consentActionMs,
        noConsentActionObserved: consentActionMs === null,
        setBeforeConsent,
        timingEvidence
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 8);
}

function getCookieEvidenceTimingStatus(row: Record<string, unknown>) {
  const timingStatus = getRecordString(row, ["timingStatus", "timing_status"]);
  const timingEvidence = getRecordString(row, ["timingEvidence", "timing_evidence"]);
  if (
    timingStatus === "pre_consent" ||
    timingEvidence === "before_consent_cookie_write" ||
    row.beforeConsent === true ||
    row.before_consent === true
  ) {
    return "pre_consent";
  }
  if (timingStatus === "post_consent") {
    return "post_consent";
  }
  return timingStatus ?? "unknown";
}

function getCookieEvidenceSourceRequestUrl(row: Record<string, unknown>) {
  return getRecordString(row, [
    "sourceRequestUrl",
    "source_request_url",
    "responseUrl",
    "response_url",
    "url",
    "requestUrl",
    "request_url",
    "initiatorUrl",
    "initiator_url",
    "cookieInitiatorUrl",
    "cookie_initiator_url"
  ]);
}

function isPreconsentTimingStatus(value: string | null | undefined) {
  return value === "pre_consent" || value === "before_consent_cookie_write";
}

function classifyEndpointCategory(url: string | null | undefined, fallback: string | null | undefined) {
  if (!url) {
    return fallback ?? "sync_or_measurement";
  }
  if (/c\.bing\.com|bat\.bing\.com/i.test(url)) {
    return "advertising_measurement";
  }
  if (/c\.clarity\.ms/i.test(url)) {
    return "session_replay_sync";
  }
  return fallback ?? "sync_or_measurement";
}

function isLikelyIdentifierRequest(url: string) {
  const queryKeys = getUrlQueryKeysSample(url);
  if (queryKeys.some((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key))) {
    return true;
  }
  if (/\/(?:getuidj|track\/cmf|sync|idsync|match)(?:[/?#]|$)/i.test(stripUrlQuery(url))) {
    return true;
  }
  try {
    return [...new URL(stripRedactionAnnotation(url)).searchParams.keys()].some((key) => IDENTIFIER_QUERY_KEY_PATTERN.test(key));
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
  T extends {
    url: string;
    vendor: string | null;
    firstSeenMs: number | null;
    category?: string | null;
    collectionEndpointType?: string | null;
    firstPartyOrThirdParty?: string | null;
    hostname?: string | null;
    scannedPageUrl?: string | null;
  }
>(requests: T[], vendors: string[]) {
  const getRequestPriority = (request: T) => {
    const directThirdParty =
      request.collectionEndpointType === "direct_third_party" ||
      request.firstPartyOrThirdParty === "third_party" ||
      (request.firstPartyOrThirdParty !== "first_party" && getUrlHostname(stripUrlQuery(request.url)) !== getUrlHostname(request.scannedPageUrl));
    const category = request.category ?? "";
    const identifierLike = isLikelyIdentifierRequest(request.url);
    if (directThirdParty && (identifierLike || /advertising|identity|sale_share|tracking/i.test(category))) {
      return 0;
    }
    if (directThirdParty) {
      return 1;
    }
    if (request.collectionEndpointType === "first_party_collection_proxy" || request.firstPartyOrThirdParty === "first_party") {
      return 2;
    }
    return 3;
  };
  const sortedRequests = [...requests].sort((left, right) =>
    getRequestPriority(left) - getRequestPriority(right) ||
    (left.firstSeenMs ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenMs ?? Number.MAX_SAFE_INTEGER)
  );
  const selected: T[] = [];
  const usedUrls = new Set<string>();

  for (const vendor of vendors) {
    const match = sortedRequests.find((request) => {
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

  for (const request of sortedRequests) {
    if (!usedUrls.has(request.url)) {
      selected.push(request);
      usedUrls.add(request.url);
    }
  }

  return selected
    .sort((left, right) =>
      getRequestPriority(left) - getRequestPriority(right) ||
      (left.firstSeenMs ?? Number.MAX_SAFE_INTEGER) - (right.firstSeenMs ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, 8);
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

function getPreconsentRepresentativeVendorNames(evidenceDetails: CertScoreFindingEvidenceDetails | undefined) {
  const representativeVendors = uniqueStrings(
    (evidenceDetails?.representativeRequests ?? []).flatMap((request) => [
      request.vendor,
      typeof request.vendorName === "string" ? request.vendorName : null
    ])
  ).filter(isDisplayVendorName);

  return representativeVendors.length > 0
    ? representativeVendors
    : uniqueStrings((evidenceDetails?.vendors ?? []).map((vendor) => vendor.name)).filter(isDisplayVendorName);
}

function buildPreConsentTrackingEvidenceDetails(
  packet: UnifiedFindingDisplayPacket
): CertScoreFindingEvidenceDetails | undefined {
  const vendorRows = getEntityJsonObjects(packet, "preconsent_tracker_vendor_evidence");
  const cookieRows = getEntityJsonObjects(packet, "preconsent_cookie_evidence");
  const consentTimeline = getFirstEntityJsonObject(packet, "consentTimeline");
  const requestClassificationAnchors = getEntityJsonObjects(packet, "requestPurposeClassificationConfidence")
    .map(sanitizeRequestClassificationAnchor)
    .filter((row) => Object.keys(row).length > 0)
    .slice(0, 12);
  const scannedPageUrl = getScannedPageUrl(packet);
  const vendors = uniqueStrings([
    ...getEntityValues(packet, /^(?:preconsent_tracker_vendors|runtimeVendors)$/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.vendors ?? []) : []),
    ...vendorRows.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "name", "label"])),
    ...cookieRows.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "cookieInitiatorVendor", "cookie_initiator_vendor"]))
  ]).filter(isDisplayVendorName);

  const firstRequestMs = getCountValue(packet, ["firstRequestMs"]);
  const firstThirdPartyRequestMs =
    getCountValue(packet, ["firstThirdPartyTrackingRequestMs", "firstThirdPartyRequestMs"]) ??
    getRecordNumber(consentTimeline ?? {}, ["firstNonEssentialRequestMs", "first_non_essential_request_ms"]);
  const cmpVisibleMs =
    getCountValue(packet, ["cmpVisibleMs", "consentBannerDetectedMs"]) ??
    getRecordNumber(consentTimeline ?? {}, ["firstCmpVisibleMs", "first_cmp_visible_ms"]);
  const consentSurfaceObserved =
    getEntityBooleanValue(packet, /^(?:consentSurfaceObserved|consent_surface_observed)$/i) ??
    getRecordBoolean(consentTimeline ?? {}, ["consentSurfaceObserved", "consent_surface_observed"]) ??
    (cmpVisibleMs !== null ? true : null);
  const consentChoiceAtMs =
    getCountValue(packet, ["consentChoiceAtMs", "consentAcceptedAtMs", "consentRejectedAtMs"]) ??
    getRecordNumber(consentTimeline ?? {}, ["firstConsentActionMs", "first_consent_action_ms"]);
  const userConsentActionObserved = consentChoiceAtMs !== null;
  const consentActionType =
    getEntityValues(packet, /consentActionType|consent_action_type/i)[0] ??
    (getCountValue(packet, ["consentRejectedAtMs"]) !== null
      ? "reject"
      : getCountValue(packet, ["consentAcceptedAtMs"]) !== null
        ? "accept"
        : null);
  const promotionGradePreconsentRequests = buildPromotionGradePreconsentRequests({
    rows: [
      ...getEntityJsonObjects(packet, "requestPurposeClassificationConfidence"),
      ...getEntityJsonObjects(packet, "request_purpose_classification_confidence")
    ],
    scannedPageUrl,
    consentSurfaceObserved,
    consentTimeline,
    maxItems: 8
  });
  const promotionGradeScannedPageUrl =
    promotionGradePreconsentRequests.find((request) => request.scannedPageUrl)?.scannedPageUrl ?? scannedPageUrl;
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...promotionGradePreconsentRequests.map((request) => request.requestUrl),
    ...getEntityUrlValues(packet, /^(?:preconsent_tracker_evidence_urls|runtimeRequestUrls|requestUrls|runtimeEvidenceUrls)$/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...(packet.evidence?.sourceUrls ?? []).filter((url) => /tag|pixel|collect|track|analytics|ads|clarity|hubspot|linkedin|facebook|reddit|tiktok|google/i.test(url))
  ]).slice(0, 8);

  const promotionGradeRepresentativeRequests = promotionGradePreconsentRequests.map((request) => {
    const endpointVendor = inferEndpointVendorNameFromUrl(request.requestUrl);
    const displayVendor = endpointVendor ?? request.vendorName;
    const isFirstPartyProxy = request.collectionEndpointType === "first_party_collection_proxy";
    return {
      url: request.requestUrl,
      requestUrl: request.requestUrl,
      hostname: request.hostname,
      vendor: displayVendor,
      vendorName: displayVendor,
      endpointVendor,
      initiatingVendor: endpointVendor && request.vendorName && endpointVendor !== request.vendorName ? request.vendorName : null,
      category: classifyEndpointCategory(request.requestUrl, normalizeVendorCategory(displayVendor, request.requestUrl, request.vendorCategory)),
      vendorCategory: classifyEndpointCategory(request.requestUrl, normalizeVendorCategory(displayVendor, request.requestUrl, request.vendorCategory)),
      resourceType: /\.js(?:[?#]|$)|\/gtm\.js|script/i.test(request.requestUrl) ? "script" : null,
      firstSeenMs: request.firstSeenMs ?? firstThirdPartyRequestMs,
      thirdParty: request.firstPartyOrThirdParty === "third_party" || !isFirstPartyProxy,
      firstPartyOrThirdParty: request.firstPartyOrThirdParty ?? (isFirstPartyProxy ? "first_party" : "third_party"),
      collectionEndpointType: request.collectionEndpointType,
      ...(isFirstPartyProxy ? { firstPartyProxyObserved: true, proxiedVendor: request.vendorName } : {}),
      preConsent: true,
      identifierLike: isLikelyIdentifierRequest(request.requestUrl),
      deviceDataLike: isLikelyDeviceDataRequest(request.requestUrl),
      queryKeysSample: getUrlQueryKeysSample(request.requestUrl),
      scannedPageUrl: request.scannedPageUrl ?? promotionGradeScannedPageUrl,
      registrableDomain: request.registrableDomain,
      vendorAttributionBasis: endpointVendor && endpointVendor !== request.vendorName
        ? `${request.vendorAttributionBasis ?? "request_url"}:endpoint_vendor`
        : request.vendorAttributionBasis,
      classificationBasis: request.classificationBasis,
      matchedSignatureId: request.matchedSignatureId,
      consentActionMs: request.consentActionMs,
      noConsentActionObserved: request.noConsentActionObserved,
      consentSurfaceObserved: request.consentSurfaceObserved,
      consentInteractionRecorded: request.consentInteractionRecorded,
      confidence: request.confidence,
      runtimePhase: request.runtimePhase
    };
  });
  const fallbackRepresentativeRequests = requestUrls.map((url, index) => {
    const hostname = getUrlHostname(url) ?? url;
    const matchedRow = vendorRows.find((row) => {
      const rowUrl = getRecordString(row, ["url", "requestUrl", "representativeUrl", "urlSample"]);
      const rowHost = getRecordString(row, ["hostname", "host", "domain"]);
      return rowUrl === url || (rowHost !== null && hostname.includes(rowHost.replace(/^www\./, "").toLowerCase()));
    });
    const rowVendor = getRecordString(matchedRow ?? {}, ["vendor", "vendorName", "name", "label"]) ??
      inferVendorNameFromUrl(url, vendors) ??
      vendors[index] ??
      null;
    const endpointVendor = inferEndpointVendorNameFromUrl(url);
    const vendor = endpointVendor ?? rowVendor;
    const category = normalizeVendorCategory(
      vendor,
      url,
      getRecordString(matchedRow ?? {}, ["category", "vendorCategory", "classification"]) ??
        classifyTrackingCategory(`${vendor ?? ""} ${hostname} ${url}`)
    );
    return {
      url,
      hostname,
      vendor,
      endpointVendor,
      initiatingVendor: endpointVendor && rowVendor && endpointVendor !== rowVendor ? rowVendor : null,
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
  const allRepresentativeRequests = promotionGradeRepresentativeRequests.length > 0
    ? promotionGradeRepresentativeRequests
    : fallbackRepresentativeRequests;
  const representativeRequests = sortRepresentativeRequestsByVendorCoverage(allRepresentativeRequests, vendors);
  const preConsentCookieExamples = getPreconsentCookieExamples(cookieRows, consentTimeline);

  const vendorDetails = vendors.slice(0, 8).map((name) => {
    const matchingRequest = representativeRequests.find((request) =>
      request.vendor === name || inferVendorNameFromUrl(request.url, [name]) === name
    );
    return {
      name,
      category: normalizeVendorCategory(name, matchingRequest?.url ?? null, matchingRequest?.category ?? classifyTrackingCategory(name)),
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
  const firstCmpVisibleMs = getRecordNumber(consentTimeline ?? {}, ["firstCmpVisibleMs", "first_cmp_visible_ms"]);
  const firstConsentActionMs = getRecordNumber(consentTimeline ?? {}, ["firstConsentActionMs", "first_consent_action_ms"]);
  const firstCookieSetMs = getRecordNumber(consentTimeline ?? {}, ["firstCookieSetMs", "first_cookie_set_ms"]);
  const firstNonEssentialRequestMs = getRecordNumber(consentTimeline ?? {}, ["firstNonEssentialRequestMs", "first_non_essential_request_ms"]);

  const details: CertScoreFindingEvidenceDetails = {
    scanContext: {
      pageUrl: promotionGradeScannedPageUrl,
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
      pageStartMs: getRecordNumber(consentTimeline ?? {}, ["navigationStartMs", "navigation_start_ms"]) ?? 0,
      firstRequestMs,
      firstThirdPartyRequestMs,
      firstThirdPartyTrackingRequestMs,
      firstCookieSeenMs: getCountValue(packet, ["firstCookieSeenMs"]),
      firstTrackingCookieSeenMs: getCountValue(packet, ["firstTrackingCookieSeenMs", "firstPreConsentTrackingCookieSeenMs"]),
      ...(firstCmpVisibleMs !== null ? { firstCmpVisibleMs } : {}),
      ...(firstConsentActionMs !== null ? { firstConsentActionMs } : {}),
      ...(firstCookieSetMs !== null ? { firstCookieSetMs } : {}),
      ...(firstNonEssentialRequestMs !== null ? { firstNonEssentialRequestMs } : {})
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
    ...(requestClassificationAnchors.length > 0 ? { requestClassificationAnchors } : {}),
    ...(preConsentCookieExamples.length > 0 ? { preConsentCookieExamples } : {}),
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

function buildCookieRetentionReviewEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails | undefined {
  const review = evaluateCookieRetentionReview({
    cookieRetentionEvidence: getEntityJsonObjects(packet, "cookieRetentionEvidence")
  });
  if (review.evidence.length === 0) {
    return undefined;
  }

  const longestCookie = [...review.evidence].sort((left, right) => (right.durationDays ?? 0) - (left.durationDays ?? 0))[0];
  return {
    counts: {
      longLivedCookieCount: review.evidence.length,
      longLivedTrackingCookieCount: review.evidence.filter((cookie) => cookie.category === "tracking" || cookie.category === "analytics").length,
      longLivedUnclassifiedCookieCount: review.evidence.filter((cookie) => cookie.category === "unknown" || cookie.category === "other").length,
      longestCookieDurationDays: Math.round(longestCookie?.durationDays ?? 0),
      cookieRetentionReviewThresholdDays: COOKIE_RETENTION_THRESHOLDS.mainReviewDays
    },
    cookieEvidence: {
      observed: true,
      reviewThresholdDays: COOKIE_RETENTION_THRESHOLDS.mainReviewDays,
      thresholdBasis:
        "365 days is a CertScore product review threshold for automated public-web observations, not a statutory cookie-lifetime limit.",
      retainedRuntimeCookies: review.evidence.slice(0, 12),
      longestObservedCookie: longestCookie ?? null
    },
    pageUrls: uniqueStrings(review.evidence.map((cookie) => cookie.pageUrl)),
    runtimeRequestUrls: uniqueStrings(review.evidence.flatMap((cookie) => cookie.sourceRequestUrl ? [cookie.sourceRequestUrl] : [])),
    runtimeVendors: uniqueStrings(review.evidence.flatMap((cookie) => cookie.vendor ? [cookie.vendor] : [])),
    evidenceFlags: ["automated_observation", "review_signal", "not_legal_advice", "not_compliance_determination"]
  };
}

function getStringArrayFromRecord(row: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!row) {
    return [];
  }
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  }
  return [];
}

function buildRejectSuppressionOutcome(input: {
  rejectEvidenceDiff: Record<string, unknown> | null;
  postRejectNonEssentialRequests: Array<Record<string, unknown>>;
  suppressionChecks: Record<string, unknown> | null;
}) {
  const baselineRequestCount = getRecordNumber(input.rejectEvidenceDiff ?? {}, ["baseline_request_count", "baselineRequestCount"]);
  const postRejectRequestCount = getRecordNumber(input.rejectEvidenceDiff ?? {}, ["post_reject_request_count", "postRejectRequestCount"]);
  const baselineVendors = getStringArrayFromRecord(input.rejectEvidenceDiff, ["baseline_vendors", "baselineVendors"]);
  const postRejectVendors = getStringArrayFromRecord(input.rejectEvidenceDiff, ["post_reject_vendors", "postRejectVendors"]);
  const persistingVendors = uniqueStrings([
    ...getStringArrayFromRecord(input.rejectEvidenceDiff, [
      "persisting_after_reject_vendors",
      "persistingAfterRejectVendors",
      "persisted_tracker_vendors",
      "persistedTrackerVendors"
    ]),
    ...input.postRejectNonEssentialRequests.flatMap((row) => getRecordString(row, ["vendor", "vendorName", "name"]))
  ]).filter(isDisplayVendorName);
  const firstPostRejectNonEssentialRequestMs = input.postRejectNonEssentialRequests
    .map((row) => getRecordNumber(row, ["ms_after_reject", "msAfterReject"]))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)[0] ?? null;
  const overallTrackingReducedAfterReject =
    baselineRequestCount !== null && postRejectRequestCount !== null
      ? postRejectRequestCount < baselineRequestCount
      : baselineVendors.length > 0 && postRejectVendors.length > 0
        ? postRejectVendors.length < baselineVendors.length
        : null;
  const nonEssentialVendorsPersistedAfterReject =
    getRecordBoolean(input.suppressionChecks ?? {}, [
      "non_essential_vendor_after_reject",
      "nonEssentialVendorAfterReject"
    ]) ?? (persistingVendors.length > 0 || input.postRejectNonEssentialRequests.length > 0);

  return {
    overallTrackingReducedAfterReject,
    nonEssentialVendorsPersistedAfterReject,
    persistingNonEssentialVendors: persistingVendors,
    postRejectNonEssentialRequestCount: input.postRejectNonEssentialRequests.length,
    firstPostRejectNonEssentialRequestMs,
    interpretation: overallTrackingReducedAfterReject === true && nonEssentialVendorsPersistedAfterReject
      ? "Reject reduced some tracking overall, but at least one classified non-essential vendor still fired after reject."
      : nonEssentialVendorsPersistedAfterReject
        ? "At least one classified non-essential vendor still fired after reject."
        : "Reject-path suppression outcome was retained, but no classified post-reject non-essential vendor persisted in this packet."
  };
}

function normalizeRejectPersistenceEvidenceFlags(input: {
  flags: string[];
  rejectSuppressionOutcome: Record<string, unknown>;
}) {
  const conflictingLegacyFlags = new Set([
    "reject_did_not_reduce_tracking",
    "consent_reject_reduced_tracking",
    "reject_path_tracking_not_reduced"
  ]);
  return uniqueStrings([
    ...input.flags.filter((flag) => !conflictingLegacyFlags.has(flag)),
    input.rejectSuppressionOutcome.overallTrackingReducedAfterReject === true &&
      input.rejectSuppressionOutcome.nonEssentialVendorsPersistedAfterReject === true
      ? "reject_reduced_some_tracking_but_nonessential_vendor_persisted"
      : null,
    input.rejectSuppressionOutcome.nonEssentialVendorsPersistedAfterReject === true
      ? "nonessential_vendor_persisted_after_reject"
      : null
  ]);
}

function buildRejectTrackingEvidenceDetails(packet: UnifiedFindingDisplayPacket): CertScoreFindingEvidenceDetails {
  const consentInteraction = getFirstEntityJsonObject(packet, "consentInteraction");
  const promotionDecision = getFirstEntityJsonObject(packet, "promotionDecision");
  const rejectEvidenceDiff = getFirstEntityJsonObject(packet, "rejectEvidenceDiff");
  const postRejectNonEssentialRequests = getEntityJsonObjects(packet, "postRejectNonEssentialRequests");
  const suppressionChecks = getFirstEntityJsonObject(packet, "suppressionChecks");
  const retainedRejectSuppressionOutcome = getFirstEntityJsonObject(packet, "rejectSuppressionOutcome");
  const rejectSuppressionOutcome = retainedRejectSuppressionOutcome ?? buildRejectSuppressionOutcome({
    rejectEvidenceDiff,
    postRejectNonEssentialRequests,
    suppressionChecks
  });
  const confidenceRisks = getEntityValues(packet, /^confidenceRisks$/i);
  const requestUrls = uniqueCaseInsensitiveStrings([
    ...getEntityUrlValues(packet, /runtime.*request|request.*url/i),
    ...(packet.details?.family === "consent_tracking" ? (packet.details.requestUrls ?? []) : []),
    ...postRejectNonEssentialRequests.flatMap((row) => getRecordString(row, ["url", "requestUrl", "urlSample"])),
    ...(packet.evidence?.sourceUrls ?? [])
  ]);
  const requestPurposeRows = getRequestPurposeClassificationRows(packet);
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
    : getRepresentativeRequestDetails(requestUrls, runtimeVendors, requestPurposeRows).map((request) => ({ ...request, preConsent: false }));
  const counts = Object.fromEntries(
    Object.entries(packet.evidence?.counts ?? {}).filter(([, value]) => Number.isFinite(value))
  );

  return {
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
    scanContext: {
      pageUrl: getScannedPageUrl(packet),
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
    evidenceFlags: normalizeRejectPersistenceEvidenceFlags({
      flags: packet.evidence?.flags ?? [],
      rejectSuppressionOutcome
    }),
    rejectSuppressionOutcome,
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
  const requestPurposeRows = getRequestPurposeClassificationRows(packet);
  const representativeRequests = getRepresentativeRequestDetails(requestUrls, vendors, requestPurposeRows).map((request) => ({
    ...request,
    preConsent: false,
    category: "session_replay"
  }));
  const firstPartyProxyObserved = hasFirstPartyProxySessionReplayEvidence(packet, requestUrls);
  const sessionReplaySummary = getFirstEntityJsonObject(packet, "sessionReplayEvidenceSummary");
  const collectionEndpointObserved = sessionReplaySummary
    ? getRecordBoolean(sessionReplaySummary, ["collectionEndpointObserved", "collection_endpoint_observed"])
    : null;
  const libraryOnly = sessionReplaySummary
    ? getRecordBoolean(sessionReplaySummary, ["libraryOnly", "library_only"])
    : null;
  const maskingOrExclusionObserved = sessionReplaySummary
    ? getRecordBoolean(sessionReplaySummary, ["maskingOrExclusionObserved", "masking_or_exclusion_observed"])
    : null;
  const sensitiveSurfaceOverlap = sessionReplaySummary
    ? getRecordBoolean(sessionReplaySummary, ["sensitiveSurfaceOverlap", "sensitive_surface_overlap"])
    : null;

  return {
    scanContext: {
      pageUrl: getScannedPageUrl(packet),
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
      ...(sessionReplaySummary
        ? {
            runtimeSummary: sessionReplaySummary,
            ...(collectionEndpointObserved !== null ? { collectionEndpointObserved } : {}),
            ...(libraryOnly !== null ? { libraryOnly } : {}),
            ...(maskingOrExclusionObserved !== null
              ? {
                  maskingOrExclusionObserved,
                  maskingOrExclusionEvidenceRetained: maskingOrExclusionObserved,
                  maskingOrExclusionEvidenceStatus: maskingOrExclusionObserved
                    ? "retained"
                    : "not_retained_in_packet"
                }
              : {}),
            ...(sensitiveSurfaceOverlap !== null ? { sensitiveSurfaceOverlap } : {})
          }
        : {}),
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

function normalizeVendorNameForComparison(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sameVendorName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeVendorNameForComparison(left);
  const normalizedRight = normalizeVendorNameForComparison(right);
  return normalizedLeft.length > 0 && normalizedRight.length > 0 && normalizedLeft === normalizedRight;
}

function enrichSessionReplayConsentContext(findings: CertScoreFinding[]) {
  const preconsentFinding = findings.find((finding) => finding.id === "pre_consent_tracking_detected");
  const preconsentVendorNames = uniqueStrings([
    ...(preconsentFinding?.evidenceDetails?.vendors ?? []).flatMap((vendor) => vendor.preConsent ? [vendor.name] : []),
    ...(preconsentFinding?.evidenceDetails?.representativeRequests ?? []).flatMap((request) => request.preConsent ? [request.vendor] : [])
  ]);

  if (preconsentVendorNames.length === 0) {
    return findings;
  }

  return findings.map((finding) => {
    if (finding.id !== "session_recording_services_detected" || !finding.evidenceDetails) {
      return finding;
    }

    const replayVendorNames = uniqueStrings([
      ...(finding.evidenceDetails.vendors ?? []).map((vendor) => vendor.name),
      ...(finding.evidenceDetails.runtimeVendors ?? []),
      ...(finding.evidenceDetails.representativeRequests ?? []).flatMap((request) => request.vendor)
    ]);
    const preconsentReplayVendors = replayVendorNames.filter((vendor) =>
      preconsentVendorNames.some((preconsentVendor) => sameVendorName(preconsentVendor, vendor))
    );

    if (preconsentReplayVendors.length === 0) {
      return finding;
    }

    const preconsentVendorMatches = (vendor: string | null | undefined) =>
      preconsentReplayVendors.some((preconsentVendor) => sameVendorName(preconsentVendor, vendor));
    const evidenceDetails: CertScoreFindingEvidenceDetails = {
      ...finding.evidenceDetails,
      sessionReplayEvidence: {
        ...(finding.evidenceDetails.sessionReplayEvidence ?? {}),
        consentPhase: "pre_consent_observed_same_scan",
        preConsentVendorContext: preconsentReplayVendors
      },
      vendors: (finding.evidenceDetails.vendors ?? []).map((vendor) => ({
        ...vendor,
        preConsent: vendor.preConsent || preconsentVendorMatches(vendor.name)
      })),
      representativeRequests: (finding.evidenceDetails.representativeRequests ?? []).map((request) => ({
        ...request,
        preConsent: request.preConsent || preconsentVendorMatches(request.vendor)
      }))
    };

    return {
      ...finding,
      evidenceDetails
    };
  });
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
  const requestPurposeRows = getRequestPurposeClassificationRows(packet);
  const representativeRequests = getRepresentativeRequestDetails(requestUrls, vendors, requestPurposeRows).map((request) => ({
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
      pageUrl: getScannedPageUrl(packet),
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
  const gpcClientSignalObserved = parseBooleanEntity(getEntityValues(packet, /gpcClientSignalObserved|gpc_client_signal_observed/i)[0]);
  const gpcHandlingObserved = uniqueStrings(getEntityValues(packet, /gpcHandlingObserved|gpc_handling_observed/i))[0] ?? null;
  const gpcRequestHeadersApplied = parseBooleanEntity(getEntityValues(packet, /gpcRequestHeadersApplied|gpc_request_headers_applied/i)[0]);
  const gpcScanStateSent = parseBooleanEntity(getEntityValues(packet, /gpcScanStateSent|gpc_scan_state_sent/i)[0]);
  const policyCbaLanguage = uniqueStrings(getEntityValues(packet, /policyCbaLanguage|policy_cba_language/i))[0] ?? null;
  const policyUiCongruent = parseBooleanEntity(getEntityValues(packet, /policyUiCongruent|policy_ui_congruent/i)[0]);
  const optOutSubtype = deriveCpraOptOutSubtype({ optOutControlFound, optOutUiResult });
  const snippets = uniqueStrings(packet.evidence?.snippets ?? []).map((snippet) => truncateDisplaySnippet(snippet)).slice(0, 3);
  const missingOrAbsent = optOutSubtype === "opt_out_absent";
  const incompleteOrUnconfirmed = !missingOrAbsent;
  const privacyChoiceCompletenessSubtype = deriveCpraPrivacyChoiceCompletenessSubtype({
    missingOrAbsent
  });
  const policyEvidenceEvaluated = policyCbaLanguage !== null || policyUiCongruent !== null;
  const gpcHandlingBasis =
    gpcScanStateSent === true
      ? "gpc_specific_scan_state"
      : "not_tested";
  const basis = buildCpraOptOutBasis({
    fallbackSnippet: snippets[0],
    optOutSubtype,
    optOutUiResult,
    vendors
  });

  return {
    scanContext: {
      pageUrl: getScannedPageUrl(packet),
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
      policyEvidenceEvaluated,
      policyUiCongruent,
      gpcScanStateSent: gpcScanStateSent === true,
      gpcHandlingObserved: gpcHandlingObserved ?? "not_determined",
      gpcHandlingBasis,
      privacyChoiceCompletenessSubtype
    },
    optOutControlEvidence: {
      evaluated: true,
      optOutSubtype,
      privacyChoiceCompletenessSubtype,
      result: optOutUiResult,
      optOutControlFound,
      choiceControlsInspected,
      gpcClientSignalObserved,
      gpcHandlingObserved,
      gpcRequestHeadersApplied,
      gpcScanStateSent,
      missingOrAbsent,
      incompleteOrUnconfirmed,
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
    policyEvidence: {
      evaluated: policyEvidenceEvaluated,
      framework: "CPRA",
      evaluatedSignal: "cross_context_behavioral_advertising_opt_out",
      policyCbaLanguage,
      policyUiCongruent,
      policyUiCongruentObserved: policyUiCongruent === true,
      gpcScanStateSent: gpcScanStateSent === true,
      gpcHandlingObserved: gpcHandlingObserved ?? "not_determined",
      gpcHandlingBasis
    },
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

function deriveCpraPrivacyChoiceCompletenessSubtype(input: {
  missingOrAbsent: boolean;
}): CpraPrivacyChoiceCompletenessSubtype {
  return input.missingOrAbsent ? "missing" : "incomplete_or_unconfirmed";
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

function sanitizeFingerprintReviewText(value: string) {
  return value
    .replace(/\bconsistent with likely fingerprinting\b/gi, "retained as a potential fingerprinting review signal")
    .replace(/\blikely fingerprinting\b/gi, "potential fingerprinting review signal")
    .replace(/\bprobable fingerprinting\b/gi, "fingerprinting review signal")
    .replace(/\bprobable browser\/device fingerprinting behavior\b/gi, "browser/device telemetry retained for fingerprinting review");
}

function buildGenericCanonicalEvidenceDetails(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingEvidenceDetails {
  const runtimeRequestUrls = getPacketRuntimeRequestUrls(packet);
  const runtimeVendors = getPacketRuntimeVendors(packet);
  const requestPurposeRows = getRequestPurposeClassificationRows(packet);
  const representativeRequests = getRepresentativeRequestDetails(runtimeRequestUrls, runtimeVendors, requestPurposeRows);
  const evidenceSnippets = getPacketEvidenceSnippets(packet)
    .filter((snippet) =>
      CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)
        ? !/Consent governance disclosure note/i.test(snippet)
        : true
    )
    .map((snippet) =>
      findingId === "fingerprinting_related_signals_observed" ? sanitizeFingerprintReviewText(snippet) : snippet
    );
  const sourceSignals = getPacketSourceSignals(packet);
  const evidenceFlags = uniqueStrings(packet.evidence?.flags ?? []);
  const sourceUrls = uniqueStrings(packet.evidence?.sourceUrls ?? []);
  const pageUrls = getScannedPageUrls(packet);
  const counts = getPacketCounts(packet);
  if (CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)) {
    delete counts.consentGovernancePolicySurfaceCount;
  }
  const isCookieEvidenceFinding = COOKIE_EVIDENCE_FINDING_IDS.has(findingId);
  const details: CertScoreFindingEvidenceDetails = {
    ...(Object.keys(counts).length > 0 ? { counts } : {}),
    scanContext: {
      pageUrl: getScannedPageUrl(packet),
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
    details.requestSelectionNote = "Representative requests are capped examples and are not exhaustive.";
    if (!isCookieEvidenceFinding) {
      details.representativeRequests = representativeRequests;
    }
  }
  if (runtimeVendors.length > 0) {
    details.runtimeVendors = runtimeVendors;
    details.vendors = getVendorDetails(runtimeVendors, representativeRequests);
  }
  if (representativeRequests.length > 0 && !isCookieEvidenceFinding) {
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

  if (isCookieEvidenceFinding) {
    const cookieRows = getEntityJsonObjects(packet, "preconsent_cookie_evidence");
    const consentTimeline = getFirstEntityJsonObject(packet, "consentTimeline");
    const consentActionMs = getRecordNumber(consentTimeline ?? {}, ["firstConsentActionMs", "first_consent_action_ms", "consentActionMs", "consent_action_ms"]);
    const cookieNames = uniqueStrings([
      ...getEntityValues(packet, /^preconsent_(?:nonessential_)?cookie_names$/i),
      ...cookieRows.flatMap((row) => getRecordString(row, ["cookieName", "cookie_name", "name"]))
    ]);
    const cookieWriteEvidence = cookieRows.slice(0, 12).map((row) => {
      const sourceRequestUrl = getCookieEvidenceSourceRequestUrl(row);
      const timingStatus = getCookieEvidenceTimingStatus(row);
      const vendor = getRecordString(row, ["vendor", "vendorName", "cookieInitiatorVendor", "cookie_initiator_vendor", "initiatorVendor", "initiator_vendor"]);
      const setAtMs = getRecordNumber(row, ["setAtMs", "set_at_ms", "firstObservedAtMs", "first_observed_at_ms"]);
      return compactEvidenceObject({
        cookieName: getRecordString(row, ["cookieName", "cookie_name", "name"]),
        domain: getRecordString(row, ["domain", "cookieDomain", "cookie_domain"]),
        vendor,
        category: normalizeVendorCategory(
          vendor,
          sourceRequestUrl,
          getRecordString(row, ["category", "vendorCategory", "classification"])
        ),
        setAtMs,
        consentActionMs,
        noConsentActionObserved: consentActionMs === null,
        initiatorDomain: getRecordString(row, ["initiatorDomain", "initiator_domain", "cookieInitiatorDomain", "cookie_initiator_domain"]),
        initiatorUrl: getRecordString(row, ["initiatorUrl", "initiator_url", "cookieInitiatorUrl", "cookie_initiator_url"]),
        sourceRequestUrl,
        sourceRequestFirstSeenMs: getRecordNumber(row, ["sourceRequestFirstSeenMs", "source_request_first_seen_ms", "responseFirstSeenMs", "response_first_seen_ms", "firstRequestMs", "first_request_ms"]),
        timingStatus,
        setBeforeConsent: timingStatus === "pre_consent",
        cookieValueRedacted: true
      });
    });
    const preconsentCookieVendors = uniqueStrings(
      cookieWriteEvidence.flatMap((row) => row.timingStatus === "pre_consent" && row.vendor ? [row.vendor] : [])
    );
    const relatedRuntimeRequests = representativeRequests.map((request) => {
      const endpointVendor = inferEndpointVendorNameFromUrl(request.url);
      const initiatingVendor =
        endpointVendor && request.vendor && endpointVendor !== request.vendor ? request.vendor : null;
      const category = classifyEndpointCategory(request.url, request.category);
      const relatedTimingStatus = request.preConsent === true ? "pre_consent" : "unknown";
      return compactRequestEvidenceRow({
        ...request,
        vendor: endpointVendor ?? request.vendor,
        endpointVendor,
        initiatingVendor,
        category,
        evidenceRole: "related_vendor_request",
        timingStatus: relatedTimingStatus,
        preConsent: relatedTimingStatus === "pre_consent" ? true : undefined
      } as RuntimeRequestEvidenceRow & {
        endpointVendor?: string | null;
        initiatingVendor?: string | null;
        evidenceRole: string;
        timingStatus: string;
      });
    });
    const representativePreConsentRequests = representativeRequests
      .filter((request) => request.preConsent === true)
      .map((request) => ({
        ...request,
        timingStatus: "pre_consent"
      }));
    details.cookieEvidence = {
      observed: true,
      cookieCount:
        getCountValue(packet, ["preConsentTrackingCookies", "preconsent_cookie_before_consent_count", "preconsentCookieCount"]) ??
        (cookieNames.length > 0 ? cookieNames.length : undefined),
      trackingCookieWritesBeforeConsent:
        getCountValue(packet, ["preConsentTrackingCookies", "preconsent_cookie_before_consent_count", "preconsentCookieCount"]) ??
        (cookieNames.length > 0 ? cookieNames.length : undefined),
      totalUniqueCookiesObserved: getCountValue(packet, ["total_cookie_count", "totalCookieCount"]),
      basis: evidenceSnippets[0] ?? "Cookie or storage evidence was retained for this finding.",
      preConsentContext: /pre_consent|preconsent/i.test(findingId),
      ...(cookieNames.length > 0 ? { cookieNames: cookieNames.slice(0, 12) } : {}),
      ...(cookieWriteEvidence.length > 0 ? { cookieWriteEvidence, storageEvidence: cookieWriteEvidence } : {}),
      ...(relatedRuntimeRequests.length > 0 ? { relatedRuntimeRequests } : {}),
      ...(representativePreConsentRequests.length > 0 ? { representativePreConsentRequests } : {})
    };
    if (runtimeVendors.length > 0) {
      details.vendors = runtimeVendors.slice(0, 8).map((name) => {
        const matchingCookie = cookieWriteEvidence.find((row) => row.vendor === name);
        const matchingRequest = representativeRequests.find((request) =>
          request.vendor === name || inferVendorNameFromUrl(request.url, [name]) === name
        );
        const preConsent = preconsentCookieVendors.includes(name) || representativePreConsentRequests.some((request) => request.vendor === name);
        return {
          name,
          category: normalizeVendorCategory(
            name,
            matchingCookie?.sourceRequestUrl ?? matchingRequest?.url ?? null,
            matchingCookie?.category ?? matchingRequest?.category ?? classifyTrackingCategory(name)
          ),
          preConsent,
          representativeUrl: matchingCookie?.sourceRequestUrl ?? matchingRequest?.url ?? null,
          firstSeenMs: matchingCookie?.setAtMs ?? matchingRequest?.firstSeenMs ?? null
        };
      });
    }
  }

  if (CONSENT_UI_EVIDENCE_FINDING_IDS.has(findingId)) {
    const rejectOptionSubtype = findingId === "reject_option_missing_or_hidden"
      ? deriveRejectOptionSubtype(packet)
      : null;
    const consentSurfaceDecisionStates = getEntityValues(packet, /^consentSurfaceDecisionStates$/i);
    const consentSurfaceDiagnostics = getFirstEntityJsonObject(packet, "consentSurfaceDiagnostics");
    const consentUiRuntimePath = getConsentUiPathEvidence(packet);
    const runtimePath = consentUiRuntimePath ? buildConsentUiRuntimePathEvidence(consentUiRuntimePath) : null;
    const firstLayerControls = getConsentUiFirstLayerControls(consentSurfaceDiagnostics);
    const pathControls = getConsentUiControlsFromRuntimePath(runtimePath);
    const retainedFirstLayerControls = firstLayerControls.length > 0 ? firstLayerControls : pathControls;
    details.consentUiEvidence = {
      observed: true,
      pattern: findingId,
      ...(rejectOptionSubtype ? { rejectOptionSubtype } : {}),
      ...(consentSurfaceDecisionStates.length > 0 ? { consentSurfaceDecisionStates } : {}),
      ...(consentSurfaceDiagnostics ? { consentSurfaceDiagnostics } : {}),
      ...(retainedFirstLayerControls.length > 0 ? { firstLayerControls: retainedFirstLayerControls } : {}),
      ...(runtimePath && Object.keys(runtimePath).length > 0 ? { runtimePath } : {}),
      basis: buildConsentUiBasis({
        evidenceSnippets,
        findingId,
        rejectOptionSubtype,
        runtimePath,
        summary: packet.summary
      }),
      userChoiceImpact: buildConsentUiUserChoiceImpact({ findingId, rejectOptionSubtype })
    };
    const lifecycleEvidence = getConsentControlLifecycleEvidence({
      consentControlLifecycleEvidence: getFirstEntityJsonObject(packet, "consentControlLifecycleEvidence")
    });
    if (lifecycleEvidence) {
      const hasObservedReopenControl =
        lifecycleEvidence.privacySettingsControlObserved ||
        lifecycleEvidence.cookiePreferencesLinkObserved ||
        lifecycleEvidence.cmpReopenControlObserved ||
        lifecycleEvidence.footerPreferenceLinkObserved;
      details.consentUiEvidence.lifecycleReview = {
        subtype: hasObservedReopenControl
          ? "privacy_settings_control_observed"
          : "privacy_settings_control_not_observed",
        coverageStatus: lifecycleEvidence.coverageStatus,
        pagesChecked: lifecycleEvidence.pagesChecked,
        controlsSearched: lifecycleEvidence.controlsSearched,
        footerLinksInspected: lifecycleEvidence.footerLinksInspected.slice(0, 5),
        observedControls: (lifecycleEvidence.observedControls ?? []).slice(0, 5),
        evidenceLine: hasObservedReopenControl
          ? "A cookie preferences, privacy settings, or consent-preference reopen control was observed separately from the first-layer reject-path evidence."
          : "No obvious cookie preferences, privacy settings, or consent-preference reopen control was observed on the scanned public pages."
      };
    }
  }

  if (SENSITIVE_EVIDENCE_FINDING_IDS.has(findingId)) {
    const sensitivePayloadRows = getEntityJsonObjects(packet, "sensitivePayloadViolations").slice(0, 10);
    const sensitiveInputSamples = sensitivePayloadRows
      .map((row) => {
        const linkage = getRecordObject(row, ["sameFlowLinkage", "same_flow_linkage"]);
        const fieldPageUrl = getRecordString(linkage ?? row, ["fieldPageUrl", "field_page_url", "pageUrl", "page_url"]);
        const requestPageUrl = getRecordString(linkage ?? row, ["requestPageUrl", "request_page_url"]);
        return {
          detectedType: getRecordString(row, ["detectedType", "detected_type"]),
          sourceField: getRecordString(row, ["sourceField", "source_field"]),
          sourceLocation: getRecordString(row, ["sourceLocation", "source_location"]),
          sourcePattern: getRecordString(row, ["sourcePattern", "source_pattern"]),
          matchSnippet: getRecordString(row, ["matchSnippet", "match_snippet"]),
          pageUrl: getRecordString(row, ["pageUrl", "page_url"]) ?? fieldPageUrl,
          fieldPageUrl,
          requestPageUrl,
          samePageOrFlow: getRecordBoolean(linkage ?? row, ["samePageOrFlow", "same_page_or_flow", "samePage", "same_page", "sameFlow", "same_flow"]),
          userValueObserved: getRecordBoolean(linkage ?? row, ["userValueObserved", "user_value_observed"])
        };
      })
      .filter((row) =>
        Object.values(row).some((value) => value !== null && value !== undefined && value !== false)
      )
      .slice(0, 5);
    const sensitiveRequestSamples = sensitivePayloadRows
      .map((row) => ({
        requestUrl: getRecordString(row, ["requestUrl", "request_url"]),
        requestMethod: getRecordString(row, ["requestMethod", "request_method"]),
        vendorHost: getRecordString(row, ["vendorHost", "vendor_host"]),
        vendorName: getRecordString(row, ["vendorName", "vendor_name"]),
        evidenceSource: getRecordString(row, ["evidenceSource", "evidence_source"]),
        evidenceStrength: getRecordString(row, ["evidenceStrength", "evidence_strength"]),
        maskingOrExclusionObserved: getRecordBoolean(row, ["maskingOrExclusionObserved", "masking_or_exclusion_observed"]),
        rawValuesRetained: getRecordBoolean(row, ["rawValuesRetained", "raw_values_retained"]),
        payloadExposureObserved: getRecordBoolean(row, ["payloadExposureObserved", "payload_exposure_observed"])
      }))
      .filter((row) => row.requestUrl || row.vendorHost || row.vendorName)
      .slice(0, 5);
    const packetDataTypes =
      packet.details?.family === "sensitive_data" && "dataTypes" in packet.details
        ? packet.details.dataTypes
        : [];
    const sensitiveDataTypes = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*data.*type/i),
      ...(Array.isArray(packetDataTypes) ? packetDataTypes : []),
      ...sensitiveInputSamples.map((row) => row.detectedType).filter((value): value is string => Boolean(value))
    ]).map(formatSensitiveDataType);
    const sensitiveFieldContexts = uniqueStrings([
      ...getEntityValues(packet, /sensitive.*source.*field/i).map((value) => `field:${value}`),
      ...getEntityValues(packet, /sensitive.*source.*location/i).map((value) => `location:${formatSensitiveSourceLocation(value)}`),
      ...sensitiveInputSamples.flatMap((row) => [
        row.sourceField ? `field:${row.sourceField}` : null,
        row.sourceLocation ? `location:${formatSensitiveSourceLocation(row.sourceLocation)}` : null
      ]).filter((value): value is string => Boolean(value))
    ]);
    const thirdPartyDomains = uniqueStrings([
      ...getEntityValues(packet, /third.*party.*domains?|request.*domains?|vendor/i),
      ...sensitiveRequestSamples.map((row) => row.vendorHost).filter((value): value is string => Boolean(value))
    ]).slice(0, 12);
    const samePageOrFlowLinked = parseBooleanEntity(getEntityValues(packet, /^samePageOrFlowLinked$|^same_page_or_flow_linked$/i)[0]) ?? false;
    const payloadExposureObserved =
      parseBooleanEntity(getEntityValues(packet, /^payloadExposureObserved$|^payload_exposure_observed$/i)[0]) ??
      sensitiveRequestSamples.some((row) => row.payloadExposureObserved === true);
    const rawValuesRetained =
      parseBooleanEntity(getEntityValues(packet, /^rawValuesRetained$|^raw_values_retained$/i)[0]) ??
      sensitiveRequestSamples.some((row) => row.rawValuesRetained === true);
    const runtimeRequestUrlsForSensitiveEvidence = uniqueStrings([
      ...getEntityValues(packet, /runtime.*request.*urls?|request.*urls?/i),
      ...sensitiveRequestSamples.map((row) => row.requestUrl).filter((value): value is string => Boolean(value))
    ]);
    const retainedSamePageOrFlowLinkage = samePageOrFlowLinked || sensitiveInputSamples.some((row) => row.samePageOrFlow === true);
    const sameFlowBasis = retainedSamePageOrFlowLinkage
      ? "same_page_or_navigation_flow"
      : sensitiveFieldContexts.length > 0 && runtimeRequestUrlsForSensitiveEvidence.length > 0
        ? "scan_level_only"
        : "not_determined";
    const evidenceBasisType = sensitiveFieldContexts.length > 0 && runtimeRequestUrlsForSensitiveEvidence.length > 0
      ? "form_field_metadata_plus_runtime_request_context"
      : thirdPartyDomains.length > 0
        ? "tracker_vendor_context"
        : "form_field_metadata";
    details.sensitiveDataEvidence = {
      observed: true,
      evidenceBasisType,
      dataTypes: sensitiveDataTypes,
      fieldTypes: sensitiveDataTypes,
      fieldContexts: sensitiveFieldContexts,
      thirdPartyDomains,
      samePageOrFlowLinked: retainedSamePageOrFlowLinkage,
      sameFlowBasis,
      rawValuesRetained,
      payloadExposureObserved,
      ...(sensitiveInputSamples.length > 0 ? { sensitiveInputs: sensitiveInputSamples } : {}),
      ...(sensitiveRequestSamples.length > 0 ? { runtimeRequestEvidence: sensitiveRequestSamples } : {}),
      maskingOrExclusionObserved: sensitiveRequestSamples.some((row) => row.maskingOrExclusionObserved === true)
        ? true
        : sensitiveRequestSamples.some((row) => row.maskingOrExclusionObserved === false)
          ? false
          : "unknown",
      basis: sensitiveInputSamples.length > 0 && runtimeRequestUrlsForSensitiveEvidence.length > 0
        ? "Retained sensitive input metadata was linked to third-party runtime request evidence on the same page or flow. Field values were not retained."
        : evidenceSnippets.find((snippet) => /sensitive|input|field|form|tracking|request|session replay/i.test(snippet)) ?? packet.summary
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
        ? "Multi-signal browser/device telemetry was retained for fingerprinting review, but identity-oriented fingerprinting was not established."
        : "Potential fingerprinting review signals were retained, but identity-oriented fingerprinting was not established."
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
              confidenceExplanation: sanitizeFingerprintReviewText(
                fingerprintTierResult?.confidenceExplanation ??
                  "Browser/device entropy collection retained without identity-oriented fingerprinting evidence."
              ),
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
    const requestPurposeRows = getRequestPurposeClassificationRows(packet);
    const representativeIdentifierRequests = getRepresentativeRequestDetails(redactedRequestUrls, destinations, requestPurposeRows).map((request) => {
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
    const accessibilityRuleCodes = uniqueStrings(getEntityValues(packet, /accessibilityRuleCodes|axeRuleId|ruleCode/i));
    const accessibilityImpacts = uniqueStrings([
      ...getEntityValues(packet, /accessibilityImpacts|axeImpact/i),
      ...getEntityValues(packet, /maxAxeImpact/i)
    ]);
    const accessibilitySeverities = uniqueStrings(getEntityValues(packet, /accessibilitySeverities|severity/i));
    const axeEvidence = getEntityJsonObjects(packet, "accessibilityAxeEvidence")
      .map(sanitizeAccessibilityAxeEvidence)
      .filter((row) => Object.keys(row).length > 0)
      .slice(0, 8);
    const focusManagementEvidence = getFocusManagementEvidenceRows(packet);
    details.accessibilityEvidence = {
      observed: true,
      basis: findingId === "focus_management_issue"
        ? buildFocusManagementAccessibilityBasis(focusManagementEvidence)
        : evidenceSnippets[0] ?? packet.summary,
      representativeExamplesRetained: evidenceSnippets.length,
      affectedNodes: getCountValue(packet, ["representativeAxeExampleCount", "wcagErrorCountTotal"]),
      pageCount: getCountValue(packet, ["representativeAxePageCount"]),
      ...(accessibilityRuleCodes[0] ? { axeRuleId: accessibilityRuleCodes[0], ruleCodes: accessibilityRuleCodes.slice(0, 8) } : {}),
      ...(accessibilityImpacts[0] ? { impact: accessibilityImpacts[0], impacts: accessibilityImpacts.slice(0, 8) } : {}),
      ...(accessibilitySeverities[0] ? { severity: accessibilitySeverities[0] } : {}),
      ...(axeEvidence.length > 0 ? { axeEvidence } : {}),
      ...(focusManagementEvidence.length > 0 ? { focusManagementEvidence: focusManagementEvidence.slice(0, 12) } : {})
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
  const artifactPreConsentValues = runtimeArtifacts
    .map((artifact) => getRecordBoolean(artifact, ["preConsent", "pre_consent"]))
    .filter((value): value is boolean => value !== null);
  const allArtifactsExplicitlyNotPreConsent =
    artifactPreConsentValues.length > 0 && artifactPreConsentValues.every((value) => value === false);
  const rawPhase = bundle?.runtimeAnchor.phase ?? packet.details.runtimePhase ?? null;
  const phase = rawPhase === "pre_consent" && allArtifactsExplicitlyNotPreConsent ? "unknown" : rawPhase;
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

function attachRuntimeVendorDisclosureDetails(
  details: CertScoreFindingEvidenceDetails,
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
) {
  if (findingId !== "cookie_disclosure_gap" && findingId !== "policy_behavior_contradiction_detected") {
    return;
  }

  const runtimeVendorDisclosureEvidence = getRuntimeVendorDisclosureEvidence({
    runtimeVendorDisclosureEvidence: getEntityJsonObjects(packet, "runtimeVendorDisclosureEvidence")
  });
  if (runtimeVendorDisclosureEvidence.length === 0) {
    return;
  }

  const unmatchedVendors = uniqueStrings(runtimeVendorDisclosureEvidence.flatMap((row) => row.unmatchedRuntimeVendors)).slice(0, 8);
  const unmatchedDomains = uniqueStrings(runtimeVendorDisclosureEvidence.flatMap((row) => row.unmatchedRuntimeDomains)).slice(0, 8);
  const policySurfaces = runtimeVendorDisclosureEvidence.flatMap((row) => row.policySurfacesSearched).slice(0, 8);
  details.runtimeVendorDisclosure = {
    subtype: "runtime_vendor_not_disclosed",
    summary:
      "Disclosure alignment note: observed runtime vendors/domains in this evidence cluster were not clearly reflected in retained disclosure surfaces.",
    unmatchedVendors,
    unmatchedDomains,
    observedRuntimeDomains: uniqueStrings(runtimeVendorDisclosureEvidence.flatMap((row) => row.observedRuntimeDomains)).slice(0, 12),
    policySurfacesSearched: policySurfaces,
    mismatchRationale: runtimeVendorDisclosureEvidence[0]?.mismatchRationale ?? null,
    coverageStatus: runtimeVendorDisclosureEvidence[0]?.coverageStatus ?? "unknown",
    evidenceConfidence: runtimeVendorDisclosureEvidence[0]?.evidenceConfidence ?? "limited",
    directVsInferred: runtimeVendorDisclosureEvidence[0]?.directVsInferred ?? "mixed"
  };
}

function attachConsentGovernanceDisclosureDetails(
  details: CertScoreFindingEvidenceDetails,
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
) {
  if (
    findingId !== "cookie_disclosure_gap" &&
    findingId !== "policy_behavior_contradiction_detected" &&
    findingId !== "consent_dark_patterns_detected"
  ) {
    return;
  }

  const evidence = getConsentGovernanceDisclosureEvidence({
    consentGovernanceDisclosureEvidence: getFirstEntityJsonObject(packet, "consentGovernanceDisclosureEvidence")
  });
  if (!evidence) {
    return;
  }

  const missingSignals = Object.entries(evidence.missingOrWeakDisclosureSignals)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const relevanceTriggers = Object.entries(evidence.relevanceTriggers)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const governanceDetails = {
    subtype: "consent_governance_disclosure_gap",
    summary:
      "Consent governance disclosure note: retained public materials did not clearly explain how users can revisit, change, withdraw, retain, renew, expire, or understand consent choices.",
    relevanceTriggers,
    missingSignals,
    policyUrls: evidence.supportingAnchors.policyUrls ?? [],
    cookiePolicyUrls: evidence.supportingAnchors.cookiePolicyUrls ?? [],
    preferenceCenterUrls: evidence.supportingAnchors.preferenceCenterUrls ?? [],
    observedConsentVendors: evidence.supportingAnchors.observedConsentVendors ?? [],
    observedTrackingVendors: evidence.supportingAnchors.observedTrackingVendors ?? [],
    coverage: evidence.coverage,
    evidenceLine:
      "Reviewed public privacy, cookie, or preference materials did not clearly explain how users can revisit or withdraw consent choices."
  };
  details.consentGovernanceDisclosure = governanceDetails;
  if (findingId === "consent_dark_patterns_detected") {
    details.consentUiEvidence = {
      ...(details.consentUiEvidence ?? {}),
      consentGovernanceDisclosure: governanceDetails
    };
  } else {
    details.disclosureEvidence = {
      ...(details.disclosureEvidence ?? {}),
      consentGovernanceDisclosure: governanceDetails
    };
  }
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
  if (findingId === "long_lived_cookie_retention_review") {
    return buildCookieRetentionReviewEvidenceDetails(packet);
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
    const details = buildGenericCanonicalEvidenceDetails(packet, findingId);
    attachConsentGovernanceDisclosureDetails(details, packet, findingId);
    attachRuntimeVendorDisclosureDetails(details, packet, findingId);
    return details;
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

  if (findingId === "reject_option_missing_or_hidden") {
    delete counts.consentGovernancePolicySurfaceCount;
  }
  if (Object.keys(counts).length > 0) {
    details.counts = counts;
  }
  if (findingId === "policy_behavior_contradiction_detected") {
    const policyRuntimeConflict = buildPolicyRuntimeConflictDetails(packet);
    if (policyRuntimeConflict) {
      details.policyRuntimeConflict = policyRuntimeConflict;
    }
  }
  attachRuntimeVendorDisclosureDetails(details, packet, findingId);
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
    findingId === "session_replay_present_with_sensitive_surfaces_observed" ||
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
    const sensitivePayloadRows = getEntityJsonObjects(packet, "sensitivePayloadViolations");
    if (sensitivePayloadRows.length > 0) {
      details.inputSurfaceEvidence = {
        ...(details.inputSurfaceEvidence ?? {}),
        sensitivePayloadViolations: sensitivePayloadRows.slice(0, 10)
      };
    }
    const sessionReplaySummary = getFirstEntityJsonObject(packet, "sessionReplayEvidenceSummary");
    if (
      (findingId === "possible_session_replay_on_sensitive_input_surface" ||
        findingId === "session_replay_present_with_sensitive_surfaces_observed") &&
      sessionReplaySummary
    ) {
      details.sessionReplayEvidence = {
        ...(details.sessionReplayEvidence ?? {}),
        observed: true,
        runtimeSummary: sessionReplaySummary
      };
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

  const consentUiPathEvidence = getFirstEntityJsonObject(packet, "consentUiPathEvidence") ??
    (packet.unifiedFindingId === "blocking_overlay_observed" ? getBlockingOverlayPathEvidence(packet) : null);
  if (
    consentUiPathEvidence &&
    (
      findingId === "forced_consent_interaction" ||
      findingId === "reject_option_missing_or_hidden" ||
      findingId === "asymmetric_consent_ui" ||
      findingId === "consent_dark_patterns_detected"
    )
  ) {
    details.consentUiEvidence = {
      ...(details.consentUiEvidence ?? {}),
      runtimePath: consentUiPathEvidence
    };
  }

  const fingerprintClusterSummary = getFirstEntityJsonObject(packet, "fingerprintClusterSummary");
  if (
    fingerprintClusterSummary &&
    (findingId === "probable_fingerprinting" || findingId === "fingerprinting_related_signals_observed")
  ) {
    details.telemetryEvidence = {
      ...(details.telemetryEvidence ?? {}),
      fingerprintClusterSummary
    };
  }

  const focusManagementEvidence = getFocusManagementEvidenceRows(packet);
  if (
    focusManagementEvidence.length > 0 &&
    (findingId === "keyboard_navigation_accessibility_issue" || findingId === "focus_management_issue")
  ) {
    details.accessibilityEvidence = {
      ...(details.accessibilityEvidence ?? {}),
      focusManagementEvidence: focusManagementEvidence.slice(0, 12)
    };
  }

  if (
    findingId === "keyboard_navigation_accessibility_issue" ||
    findingId === "semantic_labeling_accessibility_issue" ||
    findingId === "text_alternative_accessibility_issue" ||
    findingId === "visual_contrast_accessibility_issue"
  ) {
    const axeEvidence = getEntityJsonObjects(packet, "accessibilityAxeEvidence")
      .map(sanitizeAccessibilityAxeEvidence)
      .filter((row) => Object.keys(row).length > 0)
      .slice(0, 8);
    if (axeEvidence.length > 0) {
      details.accessibilityEvidence = {
        ...(details.accessibilityEvidence ?? {}),
        axeEvidence
      };
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
  const retainedRejectSuppressionOutcome = getFirstEntityJsonObject(packet, "rejectSuppressionOutcome");
  const rejectSuppressionOutcome = retainedRejectSuppressionOutcome ?? buildRejectSuppressionOutcome({
    rejectEvidenceDiff,
    postRejectNonEssentialRequests,
    suppressionChecks
  });
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
    details.rejectSuppressionOutcome = rejectSuppressionOutcome;
    details.evidenceFlags = normalizeRejectPersistenceEvidenceFlags({
      flags: details.evidenceFlags ?? [],
      rejectSuppressionOutcome
    });
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function buildExecutiveShortSummary(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
) {
  if (findingId === "pre_consent_tracking_detected") {
    const evidenceDetails = buildPreConsentTrackingEvidenceDetails(packet);
    const vendors = getPreconsentRepresentativeVendorNames(evidenceDetails).slice(0, 3);
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

  if (findingId === "session_replay_present_with_sensitive_surfaces_observed") {
    const vendors = getSessionReplayVendors(packet);
    const vendorText = vendors.length > 0 ? `${formatVendorList(vendors)} session replay` : "Session replay";
    return `${vendorText} was observed in the same scan as sensitive input surfaces; retained evidence does not show same-page or same-flow replay linkage.`;
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

  if (findingId === "focus_management_issue") {
    const focusManagementEvidence = getFocusManagementEvidenceRows(packet);
    return hasBehaviorReproducedFocusManagementEvidence(focusManagementEvidence)
      ? "Behavior-reproduced focus-management evidence was retained from WS01 keyboard interaction tracing."
      : "Focus-management review context was retained, but the packet does not include behavior-reproduced keyboard traversal evidence.";
  }

  if (findingId === "long_lived_cookie_retention_review") {
    const details = buildCookieRetentionReviewEvidenceDetails(packet);
    const longest = details?.cookieEvidence?.longestObservedCookie as Record<string, unknown> | null | undefined;
    const count = details?.counts?.longLivedCookieCount ?? 0;
    const trackingCount = details?.counts?.longLivedTrackingCookieCount ?? 0;
    const unknownCount = details?.counts?.longLivedUnclassifiedCookieCount ?? 0;
    const longestText = longest
      ? ` Longest observed cookie: ${String(longest.name ?? "unknown")} on ${String(longest.domain ?? "unknown domain")} for about ${Math.round(Number(longest.durationDays ?? 0))} days.`
      : "";
    const subject = trackingCount > 0
      ? `${trackingCount} persistent tracking or analytics cookie${trackingCount === 1 ? "" : "s"}`
      : unknownCount > 0
        ? `${unknownCount} persistent unclassified cookie${unknownCount === 1 ? "" : "s"}`
        : `${count} persistent cookie${count === 1 ? "" : "s"}`;
    return `CertScore observed ${subject} with retained expiry evidence above the ${COOKIE_RETENTION_THRESHOLDS.mainReviewDays}-day review threshold. Review whether these lifetimes match stated retention, minimization, consent, opt-out, and disclosure practices.${longestText}`;
  }

  if (findingId === "consent_dark_patterns_detected") {
    const lifecycleEvidence = getConsentControlLifecycleEvidence({
      consentControlLifecycleEvidence: getFirstEntityJsonObject(packet, "consentControlLifecycleEvidence")
    });
    if (lifecycleEvidence) {
      return "CertScore observed consent or tracking context and did not observe an obvious cookie preferences, privacy settings, or consent-preference reopen control in retained public-page evidence.";
    }
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
        ? `${vendorList} session replay service signals were observed during runtime collection.`
        : `${vendorList} session replay service signals were observed during runtime collection.`;
    }

    return "Session replay service signals were observed during runtime collection.";
  }

  if (findingId === "rtb_cookie_sync_observed") {
    const syncRows = getEntityJsonObjects(packet, "rtbCookieSyncEvidence");
    const rowVendors = uniqueStrings(syncRows.flatMap((row) =>
      [getRecordString(row, ["vendorName", "vendor"]), getRecordString(row, ["endpointVendor", "hostname"])]
    )).filter(isDisplayVendorName);
    const packetVendors = uniqueStrings([
      ...getEntityValues(packet, /rtb.*domain|runtime.*vendor|vendor/i)
    ]).filter(isDisplayVendorName);
    const hosts = (rowVendors.length > 0 ? rowVendors : packetVendors).slice(0, 3);
    const subtypes = classifyRtbCookieSyncEvidenceRows(syncRows).map(
      (classification) => classification.subtype
    );
    const hostText = hosts.length > 0 ? ` involving ${formatVendorList(hosts)}` : "";
    if (subtypes.some((subtype) => subtype === "identifier_query_sync" || subtype === "redirect_chain_sync")) {
      return `Request-level real-time bidding (RTB) or identity-sync evidence with retained identifier or redirect-chain support was retained${hostText}.`;
    }
    return `Request-level real-time bidding (RTB) or identity-sync endpoint evidence was retained${hostText}.`;
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
    const lifecycleEvidence = getConsentControlLifecycleEvidence({
      consentControlLifecycleEvidence: getFirstEntityJsonObject(packet, "consentControlLifecycleEvidence")
    });
    if (lifecycleEvidence) {
      return "No obvious cookie preferences, privacy settings, or consent-preference reopen control was observed on the scanned public pages.";
    }
    return "The retained consent interaction structure shows reject was not available on the first layer.";
  }

  if (findingId === "fingerprinting_related_signals_observed") {
    const tier = deriveFingerprintEvidenceTier(buildFingerprintingRawEvidence(packet)).tier;
    return tier >= 2
      ? "Multi-signal browser/device telemetry was retained for fingerprinting review, but retained evidence does not establish identity-oriented fingerprinting."
      : "Potential fingerprinting review signals were retained, but retained evidence does not establish identity-oriented fingerprinting.";
  }

  if (findingId === "policy_behavior_contradiction_detected") {
    const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
    const runtimeVendorDisclosure = evidenceDetails?.runtimeVendorDisclosure as Record<string, unknown> | undefined;
    if (runtimeVendorDisclosure) {
      const unmatchedVendors = Array.isArray(runtimeVendorDisclosure.unmatchedVendors)
        ? runtimeVendorDisclosure.unmatchedVendors.filter((value): value is string => typeof value === "string")
        : [];
      const unmatchedDomains = Array.isArray(runtimeVendorDisclosure.unmatchedDomains)
        ? runtimeVendorDisclosure.unmatchedDomains.filter((value): value is string => typeof value === "string")
        : [];
      const examples = unmatchedVendors.length > 0 ? unmatchedVendors : unmatchedDomains;
      const exampleText = examples[0] ? ` including ${examples.slice(0, 2).join(", ")}` : "";
      return `Runtime third-party vendors or domains${exampleText} were not clearly reflected in retained public disclosure evidence. Review policy, cookie, CMP, and downstream-sharing disclosures against the retained runtime evidence.`;
    }
    const conflict = evidenceDetails?.policyRuntimeConflict;
    const runtimeEvent = conflict ? getPolicyRuntimeRepresentativeEvent(conflict) : null;
    if (conflict?.policyAnchor.snippet && runtimeEvent && evaluatePolicyRuntimeConflictPresentation(packet).complete) {
      return `${trimTrailingSentencePunctuation(
        `Public disclosures describe cookie, device, or third-party data collection, while runtime evidence observed ${runtimeEvent}`
      )}. Review whether the implementation, consent flow, and disclosures align.`;
    }
  }

  if (findingId === "cookie_disclosure_gap") {
    const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
    const runtimeVendorDisclosure = evidenceDetails?.runtimeVendorDisclosure as Record<string, unknown> | undefined;
    if (runtimeVendorDisclosure) {
      const unmatchedVendors = Array.isArray(runtimeVendorDisclosure.unmatchedVendors)
        ? runtimeVendorDisclosure.unmatchedVendors.filter((value): value is string => typeof value === "string")
        : [];
      const unmatchedDomains = Array.isArray(runtimeVendorDisclosure.unmatchedDomains)
        ? runtimeVendorDisclosure.unmatchedDomains.filter((value): value is string => typeof value === "string")
        : [];
      const examples = unmatchedVendors.length > 0 ? unmatchedVendors : unmatchedDomains;
      const exampleText = examples[0] ? ` including ${examples.slice(0, 2).join(", ")}` : "";
      return `Runtime cookie or storage vendors/domains${exampleText} were not clearly reflected in retained cookie, CMP, or privacy disclosure evidence. This may warrant disclosure alignment review.`;
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
        : findingId === "consent_dark_patterns_detected" &&
            packet.unifiedFindingId === "consent_control_not_reopenable"
          ? "Consent controls may be hard to revisit"
        : findingId === "long_lived_cookie_retention_review"
          ? evaluateCookieRetentionReview({ cookieRetentionEvidence: getEntityJsonObjects(packet, "cookieRetentionEvidence") }).label
        : definition.label,
    section: definition.section,
    defaultSurfacePriority: definition.defaultSurfacePriority,
    whyItMatters: definition.whyItMatters,
    remediation: definition.remediation,
    confidence: findingId === "fingerprinting_related_signals_observed"
      ? "moderate"
      : mapExecutiveConfidence(packet, findingId),
    directVsInferred: findingId === "long_lived_cookie_retention_review"
      ? "direct"
      : mapVerificationStateToDirectness(packet.presentationDecision.verificationState),
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
  topFindingEligibility: Record<string, TopFindingEligibilityDecision>;
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
  const findings = enrichSessionReplayConsentContext(dedupeExecutiveFindings(
    mappedPacketRows.flatMap(({ packet, findingId }) => (findingId ? [buildExecutiveFinding(packet, findingId)] : []))
  ));
  const findingIds = new Set(findings.map((finding) => finding.id));
  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findings
      .filter((finding) => finding.section === section)
      .sort((left, right) => getFindingSurfaceScore(right) - getFindingSurfaceScore(left))
  })).filter((group) => group.findings.length > 0);
  const topFindingEligibility = Object.fromEntries(
    findings.map((finding) => [finding.id, evaluateTopFindingEligibility(finding)])
  );
  const topFindings = rankFindings(findings).filter((finding) => {
    if (!isExecutiveSummaryTopFindingId(finding.id)) {
      return false;
    }
    const eligibility = topFindingEligibility[finding.id]?.eligibility;
    if (finding.id === "focus_management_issue" && eligibility === "surface_only") {
      return false;
    }
    return eligibility !== "suppress" && eligibility !== "audit_only";
  });
  const topFindingIds = new Set(topFindings.map((finding) => finding.id));

  return {
    surfacedPackets,
    findings,
    groupedFindings,
    posture: deriveExecutivePosture(findings),
    topFindings,
    topFindingEligibility,
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
