export const CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID = "consent_governance_disclosure_gap" as const;

export type ConsentGovernanceDisclosureEvidence = {
  concernId: typeof CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID;
  relevanceTriggers: {
    consentBannerObserved?: boolean;
    cmpObserved?: boolean;
    preferenceCenterObserved?: boolean;
    consentDependentTrackingObserved?: boolean;
    consentDependentCookieObserved?: boolean;
    policyClaimsConsentForTracking?: boolean;
  };
  missingOrWeakDisclosureSignals: {
    withdrawalProcessNotClearlyExplained?: boolean;
    preferenceReopenPathNotObserved?: boolean;
    consentRetentionOrExpiryNotClearlyExplained?: boolean;
    consentRecordHandlingNotClearlyExplained?: boolean;
    consentRenewalOrRefreshNotClearlyExplained?: boolean;
  };
  supportingAnchors: {
    policyUrls?: string[];
    cookiePolicyUrls?: string[];
    preferenceCenterUrls?: string[];
    observedControls?: string[];
    observedConsentVendors?: string[];
    observedTrackingVendors?: string[];
    runtimeAnchors?: string[];
    textAnchors?: Array<{
      url: string;
      label?: string;
      snippet?: string;
      confidence?: "weak" | "moderate" | "good" | "strong";
    }>;
  };
  coverage: {
    policyPageReviewed?: boolean;
    cookiePolicyReviewed?: boolean;
    preferenceCenterReviewed?: boolean;
    footerOrHeaderLinksReviewed?: boolean;
    scanCoverageLimited?: boolean;
    regionOrConsentSurfaceUncertain?: boolean;
    materiallyBlocked?: boolean;
    strictlyNecessaryStorageOnly?: boolean;
    tagManagerOnlyWithoutConsentContext?: boolean;
  };
};

export type ConsentGovernanceDisclosureReview = {
  confidence: "strong" | "good" | "moderate" | "weak";
  disposition: "eligible" | "audit_only" | "suppress";
  evidence: ConsentGovernanceDisclosureEvidence | null;
  negativeEvidenceFlags: string[];
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getBoolean(value: unknown): boolean | null {
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

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function getNestedRecord(raw: Record<string, unknown>) {
  return (
    getRecord(raw.consentGovernanceDisclosureEvidence) ??
    getRecord(raw.consent_governance_disclosure_evidence) ??
    getRecord(raw.consentGovernanceDisclosureGapEvidence) ??
    getRecord(raw.consent_governance_disclosure_gap_evidence) ??
    getRecord(getRecord(raw.hybridRuntimeEvidence)?.consentGovernanceDisclosureEvidence) ??
    getRecord(getRecord(raw.hybridRuntimeEvidence)?.consent_governance_disclosure_evidence) ??
    getRecord(getRecord(raw.hybrid_runtime_evidence)?.consentGovernanceDisclosureEvidence) ??
    getRecord(getRecord(raw.hybrid_runtime_evidence)?.consent_governance_disclosure_evidence) ??
    getRecord(raw.signalValue) ??
    raw
  );
}

function readBoolean(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getBoolean(source[key]);
    if (value !== null) {
      return value;
    }
  }
  return undefined;
}

function readStringArray(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getStringArray(source[key]);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

function parseTextAnchors(value: unknown): ConsentGovernanceDisclosureEvidence["supportingAnchors"]["textAnchors"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = getRecord(entry);
    const url = record ? getString(record.url) : null;
    if (!record || !url) {
      return [];
    }
    const anchor: NonNullable<ConsentGovernanceDisclosureEvidence["supportingAnchors"]["textAnchors"]>[number] = { url };
    const label = getString(record.label);
    const snippet = getString(record.snippet);
    const confidence = getString(record.confidence);
    if (label) {
      anchor.label = label;
    }
    if (snippet) {
      anchor.snippet = snippet.slice(0, 280);
    }
    if (confidence === "weak" || confidence === "moderate" || confidence === "good" || confidence === "strong") {
      anchor.confidence = confidence;
    }
    return [anchor];
  });
}

function normalizeEvidence(rawEvidence: Record<string, unknown>): ConsentGovernanceDisclosureEvidence | null {
  const source = getNestedRecord(rawEvidence);
  const concernId = getString(source.concernId ?? source.concern_id ?? source.subtype ?? source.findingSubtype);
  const signalKey = getString(source.signalKey ?? source.signal_key);
  if (
    concernId &&
    concernId !== CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID &&
    signalKey !== CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID
  ) {
    return null;
  }

  const relevanceSource = getRecord(source.relevanceTriggers ?? source.relevance_triggers) ?? source;
  const missingSource = getRecord(source.missingOrWeakDisclosureSignals ?? source.missing_or_weak_disclosure_signals) ?? source;
  const anchorsSource = getRecord(source.supportingAnchors ?? source.supporting_anchors) ?? source;
  const coverageSource = getRecord(source.coverage) ?? source;

  const evidence: ConsentGovernanceDisclosureEvidence = {
    concernId: CONSENT_GOVERNANCE_DISCLOSURE_CONCERN_ID,
    relevanceTriggers: {
      cmpObserved: readBoolean(relevanceSource, ["cmpObserved", "cmp_observed"]),
      consentBannerObserved: readBoolean(relevanceSource, ["consentBannerObserved", "consent_banner_observed", "cookieBannerPresent", "cookie_banner_present", "consentSurfaceObserved", "consent_surface_observed"]),
      consentDependentCookieObserved: readBoolean(relevanceSource, ["consentDependentCookieObserved", "consent_dependent_cookie_observed"]),
      consentDependentTrackingObserved: readBoolean(relevanceSource, ["consentDependentTrackingObserved", "consent_dependent_tracking_observed", "preconsentTrackingDetected", "preconsent_tracking_detected", "tracking_before_consent_detected"]),
      policyClaimsConsentForTracking: readBoolean(relevanceSource, ["policyClaimsConsentForTracking", "policy_claims_consent_for_tracking", "consentGatingClaimObserved", "consent_gating_claim_observed"]),
      preferenceCenterObserved: readBoolean(relevanceSource, ["preferenceCenterObserved", "preference_center_observed", "granularPreferencesPresent", "granular_preferences_present"])
    },
    missingOrWeakDisclosureSignals: {
      consentRecordHandlingNotClearlyExplained: readBoolean(missingSource, ["consentRecordHandlingNotClearlyExplained", "consent_record_handling_not_clearly_explained"]),
      consentRenewalOrRefreshNotClearlyExplained: readBoolean(missingSource, ["consentRenewalOrRefreshNotClearlyExplained", "consent_renewal_or_refresh_not_clearly_explained"]),
      consentRetentionOrExpiryNotClearlyExplained: readBoolean(missingSource, ["consentRetentionOrExpiryNotClearlyExplained", "consent_retention_or_expiry_not_clearly_explained"]),
      preferenceReopenPathNotObserved: readBoolean(missingSource, ["preferenceReopenPathNotObserved", "preference_reopen_path_not_observed"]),
      withdrawalProcessNotClearlyExplained: readBoolean(missingSource, ["withdrawalProcessNotClearlyExplained", "withdrawal_process_not_clearly_explained"])
    },
    supportingAnchors: {
      cookiePolicyUrls: readStringArray(anchorsSource, ["cookiePolicyUrls", "cookie_policy_urls"]),
      observedConsentVendors: readStringArray(anchorsSource, ["observedConsentVendors", "observed_consent_vendors"]),
      observedControls: readStringArray(anchorsSource, ["observedControls", "observed_controls"]),
      observedTrackingVendors: readStringArray(anchorsSource, ["observedTrackingVendors", "observed_tracking_vendors", "runtimeVendors", "runtime_vendors"]),
      policyUrls: readStringArray(anchorsSource, ["policyUrls", "policy_urls", "privacyPolicyUrls", "privacy_policy_urls"]),
      preferenceCenterUrls: readStringArray(anchorsSource, ["preferenceCenterUrls", "preference_center_urls"]),
      runtimeAnchors: readStringArray(anchorsSource, ["runtimeAnchors", "runtime_anchors", "runtimeEvidenceArtifacts", "runtime_evidence_artifacts"]),
      textAnchors: parseTextAnchors(anchorsSource.textAnchors ?? anchorsSource.text_anchors)
    },
    coverage: {
      cookiePolicyReviewed: readBoolean(coverageSource, ["cookiePolicyReviewed", "cookie_policy_reviewed"]),
      footerOrHeaderLinksReviewed: readBoolean(coverageSource, ["footerOrHeaderLinksReviewed", "footer_or_header_links_reviewed"]),
      materiallyBlocked: readBoolean(coverageSource, ["materiallyBlocked", "materially_blocked", "blocked"]),
      policyPageReviewed: readBoolean(coverageSource, ["policyPageReviewed", "policy_page_reviewed", "privacyPolicyReviewed", "privacy_policy_reviewed"]),
      preferenceCenterReviewed: readBoolean(coverageSource, ["preferenceCenterReviewed", "preference_center_reviewed"]),
      regionOrConsentSurfaceUncertain: readBoolean(coverageSource, ["regionOrConsentSurfaceUncertain", "region_or_consent_surface_uncertain"]),
      scanCoverageLimited: readBoolean(coverageSource, ["scanCoverageLimited", "scan_coverage_limited"]),
      strictlyNecessaryStorageOnly: readBoolean(coverageSource, ["strictlyNecessaryStorageOnly", "strictly_necessary_storage_only"]),
      tagManagerOnlyWithoutConsentContext: readBoolean(coverageSource, ["tagManagerOnlyWithoutConsentContext", "tag_manager_only_without_consent_context"])
    }
  };

  const hasAnyStructuredSignal =
    Object.values(evidence.relevanceTriggers).some((value) => value === true) ||
    Object.values(evidence.missingOrWeakDisclosureSignals).some((value) => value === true) ||
    Object.values(evidence.coverage).some((value) => value === true) ||
    Object.values(evidence.supportingAnchors).some((value) => Array.isArray(value) && value.length > 0);

  return hasAnyStructuredSignal ? evidence : null;
}

export function getConsentGovernanceDisclosureEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
): ConsentGovernanceDisclosureEvidence | null {
  if (!rawEvidence) {
    return null;
  }
  return normalizeEvidence(rawEvidence);
}

function hasRelevanceTrigger(evidence: ConsentGovernanceDisclosureEvidence) {
  return Object.values(evidence.relevanceTriggers).some((value) => value === true);
}

function hasMissingOrWeakSignal(evidence: ConsentGovernanceDisclosureEvidence) {
  return Object.values(evidence.missingOrWeakDisclosureSignals).some((value) => value === true);
}

function hasCoverageAnchor(evidence: ConsentGovernanceDisclosureEvidence) {
  return (
    evidence.coverage.policyPageReviewed === true ||
    evidence.coverage.cookiePolicyReviewed === true ||
    evidence.coverage.preferenceCenterReviewed === true ||
    evidence.coverage.footerOrHeaderLinksReviewed === true ||
    (evidence.supportingAnchors.policyUrls?.length ?? 0) > 0 ||
    (evidence.supportingAnchors.cookiePolicyUrls?.length ?? 0) > 0 ||
    (evidence.supportingAnchors.preferenceCenterUrls?.length ?? 0) > 0 ||
    (evidence.supportingAnchors.textAnchors?.length ?? 0) > 0
  );
}

export function evaluateConsentGovernanceDisclosureEvidence(
  rawEvidence: Record<string, unknown> | null | undefined
): ConsentGovernanceDisclosureReview {
  const evidence = getConsentGovernanceDisclosureEvidence(rawEvidence);
  const negativeEvidenceFlags: string[] = [];
  if (!evidence) {
    return {
      confidence: "weak",
      disposition: "suppress",
      evidence: null,
      negativeEvidenceFlags: ["missing_consent_governance_disclosure_evidence"]
    };
  }

  if (!hasRelevanceTrigger(evidence)) {
    negativeEvidenceFlags.push("missing_consent_governance_relevance_trigger");
  }
  if (!hasMissingOrWeakSignal(evidence)) {
    negativeEvidenceFlags.push("missing_consent_governance_gap_signal");
  }
  if (!hasCoverageAnchor(evidence)) {
    negativeEvidenceFlags.push("missing_consent_governance_coverage_anchor");
  }
  if (evidence.coverage.materiallyBlocked === true) {
    negativeEvidenceFlags.push("blocked_or_interstitial_evidence_observed");
  }
  if (evidence.coverage.strictlyNecessaryStorageOnly === true) {
    negativeEvidenceFlags.push("strictly_necessary_storage_only");
  }
  if (evidence.coverage.tagManagerOnlyWithoutConsentContext === true) {
    negativeEvidenceFlags.push("tag_manager_only_without_consent_context");
  }
  if (evidence.coverage.regionOrConsentSurfaceUncertain === true) {
    negativeEvidenceFlags.push("consent_surface_unstable_or_not_evaluable");
  }

  const hasRuntimeOrConsentSurface =
    evidence.relevanceTriggers.cmpObserved === true ||
    evidence.relevanceTriggers.consentBannerObserved === true ||
    evidence.relevanceTriggers.preferenceCenterObserved === true ||
    evidence.relevanceTriggers.consentDependentTrackingObserved === true ||
    evidence.relevanceTriggers.consentDependentCookieObserved === true;
  const hasPolicyOnlyClaim = evidence.relevanceTriggers.policyClaimsConsentForTracking === true && !hasRuntimeOrConsentSurface;
  if (hasPolicyOnlyClaim && (evidence.supportingAnchors.runtimeAnchors?.length ?? 0) === 0) {
    negativeEvidenceFlags.push("consent_governance_absence_only");
  }

  if (
    negativeEvidenceFlags.includes("missing_consent_governance_relevance_trigger") ||
    negativeEvidenceFlags.includes("strictly_necessary_storage_only") ||
    negativeEvidenceFlags.includes("blocked_or_interstitial_evidence_observed") ||
    negativeEvidenceFlags.includes("tag_manager_only_without_consent_context")
  ) {
    return { confidence: "weak", disposition: "suppress", evidence, negativeEvidenceFlags };
  }

  if (
    negativeEvidenceFlags.includes("missing_consent_governance_gap_signal") ||
    negativeEvidenceFlags.includes("missing_consent_governance_coverage_anchor") ||
    negativeEvidenceFlags.includes("consent_governance_absence_only") ||
    evidence.coverage.scanCoverageLimited === true ||
    evidence.coverage.regionOrConsentSurfaceUncertain === true
  ) {
    return { confidence: "weak", disposition: "audit_only", evidence, negativeEvidenceFlags };
  }

  const strongCoverage =
    (evidence.coverage.policyPageReviewed === true || evidence.coverage.cookiePolicyReviewed === true) &&
    evidence.coverage.footerOrHeaderLinksReviewed === true &&
    (evidence.supportingAnchors.textAnchors?.length ?? 0) > 0;
  return {
    confidence: strongCoverage && hasRuntimeOrConsentSurface ? "strong" : hasRuntimeOrConsentSurface ? "good" : "moderate",
    disposition: "eligible",
    evidence,
    negativeEvidenceFlags
  };
}
