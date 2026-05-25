export const CONSENT_CONTROL_LIFECYCLE_SUBTYPE = "privacy_settings_control_not_observed" as const;

export type ConsentControlLifecycleEvidence = {
  privacySettingsControlObserved: boolean;
  cookiePreferencesLinkObserved: boolean;
  cmpReopenControlObserved: boolean;
  withdrawalTextObserved: boolean;
  footerPreferenceLinkObserved: boolean;
  preferenceCenterReachableAfterInitialLayer: boolean | null;
  initialConsentLayerObserved: boolean;
  consentDependentTrackingObserved: boolean;
  pagesChecked: string[];
  controlsSearched: string[];
  footerLinksInspected: string[];
  policyLinksInspected?: string[];
  coverageStatus: "usable" | "partial" | "blocked" | "insufficient";
  bannerDismissedOrInitialLayerUnavailable?: boolean;
  priorConsentStatePossible?: boolean;
  observedControls?: Array<Record<string, unknown>>;
  evidenceRefs?: string[];
};

export type ConsentControlLifecycleReview = {
  confidence: "strong" | "good" | "limited";
  disposition: "eligible" | "audit_only" | "suppress";
  evidence: ConsentControlLifecycleEvidence | null;
  negativeEvidenceFlags: string[];
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function hasRetainedPreferencePath(values: string[]) {
  return values.some((value) =>
    /\b(?:ad\s+choices|your\s+privacy\s+choices|privacy\s+choices|privacy\s+rights|cookie\s+(?:settings|preferences|choices)|customi[sz]e\s+cookies?|manage\s+(?:cookies|consent|choices|preferences|settings)|do\s+not\s+sell|do\s+not\s+share|opt[-\s]?out(?:\s+of\s+targeted\s+advertising)?)\b/i.test(
      value
    )
  );
}

function normalizeCoverage(value: unknown): ConsentControlLifecycleEvidence["coverageStatus"] {
  return value === "usable" || value === "partial" || value === "blocked" || value === "insufficient"
    ? value
    : "insufficient";
}

function normalizeEvidence(raw: Record<string, unknown>): ConsentControlLifecycleEvidence | null {
  const nested =
    getRecord(raw.consentControlLifecycleEvidence) ??
    getRecord(raw.consent_control_lifecycle_evidence) ??
    getRecord(getRecord(raw.hybridRuntimeEvidence)?.consentControlLifecycleEvidence) ??
    getRecord(getRecord(raw.hybrid_runtime_evidence)?.consent_control_lifecycle_evidence);
  const source = nested ?? raw;

  const pagesChecked = getStringArray(source.pagesChecked ?? source.pages_checked);
  const controlsSearched = getStringArray(source.controlsSearched ?? source.controls_searched);
  if (pagesChecked.length === 0 && controlsSearched.length === 0) {
    return null;
  }

  return {
    bannerDismissedOrInitialLayerUnavailable:
      getBoolean(source.bannerDismissedOrInitialLayerUnavailable ?? source.banner_dismissed_or_initial_layer_unavailable) ?? undefined,
    cmpReopenControlObserved: getBoolean(source.cmpReopenControlObserved ?? source.cmp_reopen_control_observed) === true,
    consentDependentTrackingObserved:
      getBoolean(source.consentDependentTrackingObserved ?? source.consent_dependent_tracking_observed) === true,
    controlsSearched,
    cookiePreferencesLinkObserved:
      getBoolean(source.cookiePreferencesLinkObserved ?? source.cookie_preferences_link_observed) === true,
    coverageStatus: normalizeCoverage(source.coverageStatus ?? source.coverage_status),
    evidenceRefs: getStringArray(source.evidenceRefs ?? source.evidence_refs),
    footerLinksInspected: getStringArray(source.footerLinksInspected ?? source.footer_links_inspected),
    footerPreferenceLinkObserved:
      getBoolean(source.footerPreferenceLinkObserved ?? source.footer_preference_link_observed) === true,
    initialConsentLayerObserved:
      getBoolean(source.initialConsentLayerObserved ?? source.initial_consent_layer_observed) === true,
    observedControls: Array.isArray(source.observedControls ?? source.observed_controls)
      ? ((source.observedControls ?? source.observed_controls) as unknown[]).filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
        )
      : [],
    pagesChecked,
    policyLinksInspected: getStringArray(source.policyLinksInspected ?? source.policy_links_inspected),
    preferenceCenterReachableAfterInitialLayer:
      getBoolean(source.preferenceCenterReachableAfterInitialLayer ?? source.preference_center_reachable_after_initial_layer),
    priorConsentStatePossible:
      getBoolean(source.priorConsentStatePossible ?? source.prior_consent_state_possible) ?? undefined,
    privacySettingsControlObserved:
      getBoolean(source.privacySettingsControlObserved ?? source.privacy_settings_control_observed) === true,
    withdrawalTextObserved:
      getBoolean(source.withdrawalTextObserved ?? source.withdrawal_text_observed) === true
  };
}

export function getConsentControlLifecycleEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
): ConsentControlLifecycleEvidence | null {
  if (!rawEvidence) {
    return null;
  }
  return normalizeEvidence(rawEvidence);
}

function hasConsentOrTrackingContext(evidence: ConsentControlLifecycleEvidence, rawEvidence: Record<string, unknown>) {
  return (
    evidence.initialConsentLayerObserved ||
    evidence.consentDependentTrackingObserved ||
    getBoolean(rawEvidence.consentSurfaceObserved ?? rawEvidence.consent_surface_observed) === true ||
    getBoolean(rawEvidence.cookieBannerPresent ?? rawEvidence.cookie_banner_present) === true ||
    getBoolean(rawEvidence.preconsentTrackingDetected ?? rawEvidence.preconsent_tracking_detected) === true ||
    getBoolean(rawEvidence.tracking_before_consent_detected) === true
  );
}

export function evaluateConsentControlLifecycleEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
): ConsentControlLifecycleReview {
  const evidence = getConsentControlLifecycleEvidence(rawEvidence);
  const negativeEvidenceFlags: string[] = [];
  if (!rawEvidence || !evidence) {
    return {
      confidence: "limited",
      disposition: "suppress",
      evidence: null,
      negativeEvidenceFlags: ["missing_consent_control_lifecycle_evidence"]
    };
  }

  if (!hasConsentOrTrackingContext(evidence, rawEvidence)) {
    negativeEvidenceFlags.push("missing_consent_tracking_context");
  }
  if (evidence.coverageStatus === "blocked" || evidence.coverageStatus === "insufficient") {
    negativeEvidenceFlags.push("incomplete_consent_control_lifecycle_coverage");
  }
  if (evidence.pagesChecked.length === 0 || evidence.controlsSearched.length === 0) {
    negativeEvidenceFlags.push("missing_consent_control_lifecycle_evidence");
  }
  if (evidence.pagesChecked.length <= 1 && evidence.footerLinksInspected.length === 0) {
    negativeEvidenceFlags.push("shallow_consent_control_search_scope");
  }
  if (evidence.priorConsentStatePossible === true) {
    negativeEvidenceFlags.push("prior_consent_state_may_hide_control");
  }
  if (
    evidence.privacySettingsControlObserved ||
    evidence.cookiePreferencesLinkObserved ||
    evidence.cmpReopenControlObserved ||
    evidence.withdrawalTextObserved ||
    evidence.footerPreferenceLinkObserved ||
    evidence.preferenceCenterReachableAfterInitialLayer === true ||
    (evidence.observedControls?.length ?? 0) > 0 ||
    hasRetainedPreferencePath(evidence.footerLinksInspected) ||
    hasRetainedPreferencePath(evidence.policyLinksInspected ?? [])
  ) {
    negativeEvidenceFlags.push("consent_revisit_control_observed");
  }

  if (negativeEvidenceFlags.includes("consent_revisit_control_observed")) {
    return { confidence: "good", disposition: "suppress", evidence, negativeEvidenceFlags };
  }
  if (
    negativeEvidenceFlags.includes("missing_consent_tracking_context") ||
    negativeEvidenceFlags.includes("missing_consent_control_lifecycle_evidence") ||
    negativeEvidenceFlags.includes("incomplete_consent_control_lifecycle_coverage") ||
    negativeEvidenceFlags.includes("prior_consent_state_may_hide_control")
  ) {
    return { confidence: "limited", disposition: "audit_only", evidence, negativeEvidenceFlags };
  }
  if (negativeEvidenceFlags.includes("shallow_consent_control_search_scope") || evidence.coverageStatus === "partial") {
    return { confidence: "limited", disposition: "audit_only", evidence, negativeEvidenceFlags };
  }

  return {
    confidence: evidence.footerLinksInspected.length > 0 && (evidence.evidenceRefs?.length ?? 0) > 0 ? "strong" : "good",
    disposition: "eligible",
    evidence,
    negativeEvidenceFlags
  };
}

export function hasConsentControlLifecycleEvidence(rawEvidence: Record<string, unknown> | null | undefined) {
  return evaluateConsentControlLifecycleEvidence(rawEvidence).disposition === "eligible";
}
