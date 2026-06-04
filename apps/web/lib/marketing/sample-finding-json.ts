export type SampleFindingJson = {
  findingId: string;
  label: string;
  sourceLabel: string;
  payload: Record<string, unknown>;
};

type EvidenceConfidence = "strong" | "good" | "review_signal";
type DirectVsInferred =
  | "direct_observation"
  | "correlated_observation"
  | "absence_observation"
  | "clustered_inference";

const SAMPLE_EVIDENCE_PROFILE: Record<string, { evidenceConfidence: EvidenceConfidence; directVsInferred: DirectVsInferred }> = {
  asymmetric_consent_ui: { evidenceConfidence: "good", directVsInferred: "correlated_observation" },
  consent_dark_patterns_detected: { evidenceConfidence: "good", directVsInferred: "correlated_observation" },
  cpra_cba_opt_out_missing: { evidenceConfidence: "review_signal", directVsInferred: "absence_observation" },
  cross_domain_identifier_sharing_observed: { evidenceConfidence: "review_signal", directVsInferred: "direct_observation" },
  fingerprinting_related_signals_observed: { evidenceConfidence: "review_signal", directVsInferred: "direct_observation" },
  forced_consent_interaction: { evidenceConfidence: "good", directVsInferred: "direct_observation" },
  keyboard_navigation_accessibility_issue: { evidenceConfidence: "good", directVsInferred: "direct_observation" },
  long_lived_cookie_retention_review: { evidenceConfidence: "strong", directVsInferred: "direct_observation" },
  possible_session_replay_on_sensitive_input_surface: { evidenceConfidence: "review_signal", directVsInferred: "correlated_observation" },
  session_replay_present_with_sensitive_surfaces_observed: {
    evidenceConfidence: "review_signal",
    directVsInferred: "correlated_observation"
  },
  pre_consent_tracking_detected: { evidenceConfidence: "strong", directVsInferred: "direct_observation" },
  probable_fingerprinting: { evidenceConfidence: "review_signal", directVsInferred: "clustered_inference" },
  reject_option_missing_or_hidden: { evidenceConfidence: "good", directVsInferred: "absence_observation" },
  reject_tracking_persists_after_reject: { evidenceConfidence: "good", directVsInferred: "direct_observation" },
  rtb_cookie_sync_observed: { evidenceConfidence: "review_signal", directVsInferred: "direct_observation" },
  semantic_labeling_accessibility_issue: { evidenceConfidence: "good", directVsInferred: "direct_observation" },
  sensitive_data_collection_with_third_party_tracking_present: {
    evidenceConfidence: "review_signal",
    directVsInferred: "correlated_observation"
  },
  session_recording_services_detected: { evidenceConfidence: "review_signal", directVsInferred: "direct_observation" },
  text_alternative_accessibility_issue: { evidenceConfidence: "good", directVsInferred: "direct_observation" },
  third_party_cookie_pre_consent: { evidenceConfidence: "review_signal", directVsInferred: "direct_observation" },
  visual_contrast_accessibility_issue: { evidenceConfidence: "good", directVsInferred: "direct_observation" }
};

const SAMPLE_TOP_FINDING_CALIBRATION: Record<string, Record<string, string[]>> = {
  pre_consent_tracking_detected: {
    minimumToSurface: ["Classified non-essential request/storage before observed consent."],
    highConfidenceRequires: ["Usable coverage.", "Purpose classification.", "Runtime anchor."],
    criticalOrTopRankingRequires: ["Advertising/replay/identifier-sync or sensitive-surface context."],
    demoteOrSuppressWhen: ["Tag manager only.", "Strict necessity.", "Blocked scan.", "Unreliable timing."]
  },
  visual_contrast_accessibility_issue: {
    minimumToSurface: ["Automated contrast rule with selector/page/WCAG ref."],
    highConfidenceRequires: ["Color pair or ratio.", "Element state.", "Meaningful visible content."],
    criticalOrTopRankingRequires: ["Repeated component.", "Critical user path.", "Control/focus indicator."],
    demoteOrSuppressWhen: ["Decorative/inactive/logo/incidental without context review."]
  },
  semantic_labeling_accessibility_issue: {
    minimumToSurface: ["Automated label/name/role rule with selector/page/WCAG ref."],
    highConfidenceRequires: ["Visible-label/accessibility-name/role context."],
    criticalOrTopRankingRequires: ["Required or sensitive form field.", "Repeated component.", "Blocking control."],
    demoteOrSuppressWhen: ["Selector only.", "ARIA attribute only.", "No affected element."]
  },
  fingerprinting_related_signals_observed: {
    minimumToSurface: ["Retained high-entropy signal with script/request context."],
    highConfidenceRequires: ["Multiple categories or known signal script with runtime context."],
    criticalOrTopRankingRequires: ["Cluster plus identifier/cross-domain/pre-consent context."],
    demoteOrSuppressWhen: ["Isolated common environment read.", "Vendor name only.", "Generic analytics."]
  },
  session_recording_services_detected: {
    minimumToSurface: ["Replay-related script/request/vendor artifact."],
    highConfidenceRequires: ["Endpoint or service classification plus page/timing/vendor context."],
    criticalOrTopRankingRequires: ["Collection endpoint.", "Sensitive page.", "Pre-consent/post-reject.", "No masking/exclusion observed."],
    demoteOrSuppressWhen: ["Vendor name only.", "Generic analytics.", "Policy text only."]
  },
  third_party_cookie_pre_consent: {
    minimumToSurface: ["Third-party cookie/storage artifact before consent."],
    highConfidenceRequires: ["Domain/scope/timing plus purpose or vendor classification."],
    criticalOrTopRankingRequires: ["Advertising/identity/sync persistent storage or repeated pages."],
    demoteOrSuppressWhen: ["Request only.", "Cookie name only.", "Unknown timing.", "Blocked scan."]
  },
  long_lived_cookie_retention_review: {
    minimumToSurface: ["Runtime cookie name/domain/page/classification plus retained expiry, Max-Age, or computed duration."],
    highConfidenceRequires: ["Known tracking, advertising, marketing, or identity classification.", "365-day CertScore review threshold met.", "Vendor or source URL context."],
    criticalOrTopRankingRequires: ["Long-lived adtech/marketing/identity cookie evidence.", "Multiple long-lived adtech cookies.", "730-day severe review threshold."],
    demoteOrSuppressWhen: ["Policy text only.", "Cookie count only.", "Missing duration/page attribution.", "Essential/session cookies only.", "Same cookie evidence already supports a stronger consent-timing finding."]
  },
  rtb_cookie_sync_observed: {
    minimumToSurface: ["Sync/match/adtech identity-like request or redirect."],
    highConfidenceRequires: ["Origin/path.", "Vendor/category.", "Identifier-like keys.", "Redaction."],
    criticalOrTopRankingRequires: ["Multi-hop redirect.", "Repeated sync endpoints.", "Pre-consent.", "Cross-domain identifier sharing."],
    demoteOrSuppressWhen: ["Generic ad script.", "Ad impression.", "Vendor name only."]
  },
  text_alternative_accessibility_issue: {
    minimumToSurface: ["Automated alt/text alternative rule with selector/page/WCAG ref."],
    highConfidenceRequires: ["Element purpose context and accessible-name context."],
    criticalOrTopRankingRequires: ["Functional control.", "Important chart/graphic.", "Repeated CMS/template issue."],
    demoteOrSuppressWhen: ["Decorative/redundant/logo context without manual review."]
  },
  consent_dark_patterns_detected: {
    minimumToSurface: ["Concrete consent-surface choice architecture signal or retained consent-control lifecycle absence evidence with consent/tracking context."],
    highConfidenceRequires: ["Two or more signals retained, or usable pages/controls/footer search evidence for the preference-revisitability subtype."],
    criticalOrTopRankingRequires: ["Forced interaction plus missing/nested reject or repeated prompt."],
    demoteOrSuppressWhen: ["CMP name only.", "Banner presence only.", "Unrelated modal.", "Prior consent state or blocked/shallow lifecycle coverage."]
  },
  cpra_cba_opt_out_missing: {
    minimumToSurface: [
      "Advertising, cross-context behavioral advertising, or sale/share review signal plus retained public-surface search with no opt-out path observed."
    ],
    highConfidenceRequires: ["Footer, policy, CMP, state-rights, and preference-center coverage."],
    criticalOrTopRankingRequires: [
      "GPC scan state sent plus likely cross-context behavioral advertising or sale/share context plus no handling/path."
    ],
    demoteOrSuppressWhen: ["Adtech vendor only.", "No link coverage.", "No policy coverage.", "No region/context."]
  },
  forced_consent_interaction: {
    minimumToSurface: ["Consent UI artifact plus blocking/interruption signal."],
    highConfidenceRequires: ["Scroll/content/focus blocking plus visible controls and unrelated interruptions excluded."],
    criticalOrTopRankingRequires: ["Full blocking with no equivalent non-accept path."],
    demoteOrSuppressWhen: ["Generic modal.", "Paywall.", "Bot challenge.", "Age gate.", "Login wall."]
  },
  reject_option_missing_or_hidden: {
    minimumToSurface: ["Accept visible plus reject/refusal not observed or nested."],
    highConfidenceRequires: ["Visible controls retained plus preference path inspected."],
    criticalOrTopRankingRequires: ["Accept one step and reject unavailable or materially harder."],
    demoteOrSuppressWhen: ["Labels not retained.", "Scan did not reach consent surface.", "Unrelated overlay."]
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    minimumToSurface: ["Retained sensitive surface plus retained third-party tracking on same page/flow."],
    highConfidenceRequires: ["Field/surface context plus vendor category, timing, and coverage."],
    criticalOrTopRankingRequires: ["Sensitive page plus advertising/replay/measurement plus consent concern or event-capture signal."],
    demoteOrSuppressWhen: ["Sensitive field alone.", "Vendor elsewhere on site.", "No same-surface runtime artifact."]
  },
  asymmetric_consent_ui: {
    minimumToSurface: ["Retained accept/refusal relationship."],
    highConfidenceRequires: ["Step count, layer, and labels retained."],
    criticalOrTopRankingRequires: ["Materially higher refusal effort plus visual hierarchy imbalance."],
    demoteOrSuppressWhen: ["Button color alone.", "Accept button alone.", "No refusal path context."]
  },
  keyboard_navigation_accessibility_issue: {
    minimumToSurface: ["Automated keyboard/focus rule with selector/page/WCAG ref."],
    highConfidenceRequires: ["Keyboard path/focus/interaction state context."],
    criticalOrTopRankingRequires: ["Trap.", "Primary nav blocked.", "Form submit blocked.", "Repeated component."],
    demoteOrSuppressWhen: ["Selector only.", "Inactive/hidden/decorative element."]
  },
  cross_domain_identifier_sharing_observed: {
    minimumToSurface: ["Identifier-like key/value pattern in outbound cross-domain request."],
    highConfidenceRequires: ["Source/destination plus redacted key and vendor/category."],
    criticalOrTopRankingRequires: ["Persistent/scoped identifier to adtech/identity destination or pre-consent/post-reject."],
    demoteOrSuppressWhen: ["Generic query key.", "Destination unknown.", "Unredacted identifiers."]
  },
  reject_tracking_persists_after_reject: {
    minimumToSurface: ["Reject interaction plus post-reject classified non-essential request/storage."],
    highConfidenceRequires: ["Reject success.", "Pre/post sequence.", "Artifact classification."],
    criticalOrTopRankingRequires: ["Post-reject advertising/replay/identifier sync or repeated post-reject artifacts."],
    demoteOrSuppressWhen: ["Reject button present but not clicked.", "Unknown essentiality.", "Queued pre-reject beacon likely."]
  },
  possible_session_replay_on_sensitive_input_surface: {
    minimumToSurface: ["Replay signal plus sensitive surface in same observed scope."],
    highConfidenceRequires: ["Replay collection endpoint or strong replay runtime signal plus sensitive field/page context."],
    criticalOrTopRankingRequires: ["Collection endpoint plus sensitive form plus no masking/exclusion observed or consent concern."],
    demoteOrSuppressWhen: ["Replay library only.", "Global script only.", "Sensitive field not same page/flow.", "Masking/page exclusion observed."]
  },
  session_replay_present_with_sensitive_surfaces_observed: {
    minimumToSurface: ["Replay runtime evidence plus sensitive input surface evidence retained in the same scan."],
    highConfidenceRequires: ["Replay collection endpoint or strong replay runtime signal plus sensitive field/page context."],
    criticalOrTopRankingRequires: ["Replay collection endpoint and sensitive-surface evidence with no retained masking or page-exclusion signal."],
    demoteOrSuppressWhen: ["Replay library only.", "Sensitive surface not retained.", "Material coverage block.", "Same-page or same-flow linkage is required for the stronger possible sensitive replay finding."]
  },
  probable_fingerprinting: {
    minimumToSurface: ["Multi-signal high-entropy cluster."],
    highConfidenceRequires: ["Cluster plus script/request and tier/context."],
    criticalOrTopRankingRequires: ["Cluster plus identifier/cross-domain/pre-consent/adtech context."],
    demoteOrSuppressWhen: ["Single common attribute.", "Vendor name only.", "Security script without retained cluster."]
  }
};

const INTERNAL_PUBLIC_SAMPLE_KEYS = new Set([
  "appeared_in_executive_summary",
  "conflict_bridge",
  "concern_policy_rule_ids",
  "coverage_limitation_evidence",
  "normalized_concern_ids",
  "policy_anchors",
  "regulatory_lanes",
  "scan_id",
  "surface_priority"
]);

function redactSampleString(value: string, primaryDomain: string | null) {
  const withoutIds = value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "redacted-id");
  const withoutInternalRules = withoutIds.replace(/\b(?:privacy|accessibility|commerce)\.[a-z0-9_.-]+\b/gi, "public_evidence_signal");
  const withoutQueries = withoutInternalRules.replace(/https?:\/\/[^\s"']+\?[^\s"']+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname} [query_redacted=true]`;
    } catch {
      return "[url_query_redacted]";
    }
  });

  return primaryDomain
    ? withoutQueries.replace(new RegExp(primaryDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "example.com")
    : withoutQueries;
}

function sanitizeSampleValue(value: unknown, primaryDomain: string | null): unknown {
  if (typeof value === "string") {
    return redactSampleString(value, primaryDomain);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSampleValue(entry, primaryDomain));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      if (INTERNAL_PUBLIC_SAMPLE_KEYS.has(key)) {
        return [];
      }

      if (key === "cookie_value" || key === "cookieValue" || key === "payloadBody" || key === "sensitivePayload") {
        return [[key, "[redacted]"]];
      }

      return [[key, sanitizeSampleValue(entry, primaryDomain)]];
    })
  );
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getEvidenceRecord(payload: Record<string, unknown>) {
  return getRecord(payload.evidence);
}

function getCountsRecord(payload: Record<string, unknown>) {
  return getRecord(getEvidenceRecord(payload).counts);
}

function getFirstStringArrayValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string").slice(0, 6);
    }
  }

  return [];
}

function getFirstNumberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function buildCategoryEvidenceBlocks(findingId: string, payload: Record<string, unknown>) {
  const evidence = getEvidenceRecord(payload);
  const counts = getCountsRecord(payload);
  const requestSamples = Array.isArray(evidence.request_samples) ? evidence.request_samples.slice(0, 3) : [];
  const cookieSamples = Array.isArray(evidence.cookie_samples) ? evidence.cookie_samples.slice(0, 3) : [];
  const runtimeAnchors = getFirstStringArrayValue(evidence, ["runtime_anchors", "evidence_snippets"]);
  const vendorCategory = getFirstStringArrayValue(evidence, ["vendors"])[0] ?? "manual_review_recommended";
  const blocks: Record<string, unknown> = {};

  if (
    findingId === "pre_consent_tracking_detected" ||
    findingId === "third_party_cookie_pre_consent" ||
    findingId === "reject_tracking_persists_after_reject"
  ) {
    blocks.consentTimeline = {
      firstRequestMs: getFirstNumberValue(counts, ["firstRequestMs"]),
      firstThirdPartyRequestMs: getFirstNumberValue(counts, ["firstThirdPartyRequestMs"]),
      firstCookieSeenMs: getFirstNumberValue(counts, ["firstCookieSeenMs"]),
      consentActionObservedBeforeFirstSignal: false,
      consentStateBasis: "observed_scan_scope",
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "pre_consent_tracking_detected" ||
    findingId === "third_party_cookie_pre_consent" ||
    findingId === "long_lived_cookie_retention_review" ||
    findingId === "rtb_cookie_sync_observed" ||
    findingId === "cross_domain_identifier_sharing_observed" ||
    findingId === "reject_tracking_persists_after_reject"
  ) {
    blocks.networkEvidence = {
      artifactRefs: requestSamples.length > 0 ? requestSamples : runtimeAnchors.slice(0, 3),
      cookieOrStorageArtifacts: cookieSamples,
      vendorCategory,
      queryStringsRedacted: true,
      valuesRedacted: true,
      manualReviewNeeded: true
    };
  }

  if (findingId === "long_lived_cookie_retention_review") {
    blocks.cookieRetentionEvidence = {
      retainedRuntimeCookies: [
        {
          name: "_fbp",
          domain: ".example.com",
          pageUrl: "https://example.com/",
          classification: "advertising_marketing",
          vendor: "Meta",
          durationDays: 540,
          thresholdBasis: "duration_days >= 365 CertScore product review threshold",
          valueRetained: false
        }
      ],
      longestObservedCookie: {
        name: "_fbp",
        domain: ".example.com",
        durationDays: 540,
        classification: "advertising_marketing"
      },
      reviewThresholdDays: 365,
      statutoryThreshold: false,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "forced_consent_interaction" ||
    findingId === "reject_option_missing_or_hidden" ||
    findingId === "asymmetric_consent_ui" ||
    findingId === "consent_dark_patterns_detected" ||
    findingId === "cpra_cba_opt_out_missing"
  ) {
    blocks.uiEvidence = {
      observedSurface: findingId === "cpra_cba_opt_out_missing" || findingId === "consent_dark_patterns_detected"
        ? "footer_policy_cmp_preference_center_scope"
        : "consent_surface",
      retainedControlContext: true,
      labelsOrPathsRetained: true,
      absenceObservationRequiresCoverage:
        findingId === "reject_option_missing_or_hidden" ||
        findingId === "cpra_cba_opt_out_missing" ||
        findingId === "consent_dark_patterns_detected",
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "visual_contrast_accessibility_issue" ||
    findingId === "semantic_labeling_accessibility_issue" ||
    findingId === "text_alternative_accessibility_issue" ||
    findingId === "keyboard_navigation_accessibility_issue"
  ) {
    blocks.accessibilityEvidence = {
      ruleId: "representative_automated_rule",
      selector: "redacted_selector_reference",
      pageUrl: "https://example.com/",
      impact: payload.criticality ?? "review",
      wcagRefs: ["WCAG-oriented automated review reference"],
      elementType: "user_visible_element",
      elementState: "observed_state",
      repeatedInstanceCount: getFirstNumberValue(counts, ["representativeAxeExampleCount"]) ?? 1,
      componentOrTemplateScope: "manual_review_recommended",
      exceptionContext: "not_determined",
      manualReviewNeeded: true
    };
  }

  if (findingId === "session_recording_services_detected" || findingId === "possible_session_replay_on_sensitive_input_surface") {
    blocks.sessionReplayEvidence = {
      replayArtifactObserved: true,
      replayCollectionEndpointObserved: findingId === "possible_session_replay_on_sensitive_input_surface" ? "not_determined" : "unknown",
      maskingOrPageExclusionObserved: "not_determined",
      captureOrRetentionDetermined: false,
      manualReviewNeeded: true
    };
  }

  if (
    findingId === "sensitive_data_collection_with_third_party_tracking_present" ||
    findingId === "possible_session_replay_on_sensitive_input_surface"
  ) {
    blocks.sensitiveSurfaceEvidence = {
      sensitiveSurfaceObserved: true,
      surfaceCategory: "sensitive_or_high_risk_context_review",
      article9SpecialCategoryDetermined: false,
      samePageOrFlowRuntimeContextRequired: true,
      userEnteredValuesRetained: false,
      manualReviewNeeded: true
    };
  }

  if (findingId === "fingerprinting_related_signals_observed" || findingId === "probable_fingerprinting") {
    blocks.fingerprintEvidence = {
      clusterSize: findingId === "probable_fingerprinting" ? "multi_signal_cluster" : "related_signal",
      entropyTiers: findingId === "probable_fingerprinting" ? ["high", "medium"] : ["review"],
      clusterStrength: findingId === "probable_fingerprinting" ? "probable_review_signal" : "related_signal_not_probable",
      identifierLinkageContext: "manual_review_recommended",
      possibleSecurityOrFraudPurpose: "not_determined",
      rawDeviceValuesRetained: false,
      manualReviewNeeded: true
    };
  }

  return blocks;
}

function normalizeSamplePayload(findingId: string, label: string, payload: Record<string, unknown>) {
  const profile = SAMPLE_EVIDENCE_PROFILE[findingId] ?? {
    evidenceConfidence: payload.evidenceConfidence === "strong" || payload.evidenceConfidence === "good"
      ? payload.evidenceConfidence
      : "review_signal",
    directVsInferred:
      payload.directVsInferred === "correlated_observation" ||
      payload.directVsInferred === "absence_observation" ||
      payload.directVsInferred === "clustered_inference"
        ? payload.directVsInferred
        : "direct_observation"
  };
  const coverageFlags = Array.isArray(payload.coverage_flags)
    ? payload.coverage_flags.filter((entry): entry is string => typeof entry === "string")
    : [];
  const evidence = getEvidenceRecord(payload);
  const artifacts = {
    runtimeAnchors: getFirstStringArrayValue(evidence, ["runtime_anchors", "evidence_snippets"]),
    requestSamples: Array.isArray(evidence.request_samples) ? evidence.request_samples.slice(0, 3) : [],
    cookieOrStorageSamples: Array.isArray(evidence.cookie_samples) ? evidence.cookie_samples.slice(0, 3) : [],
    policyAnchors: getFirstStringArrayValue(evidence, ["policy_anchors"]),
    rawValuesRetained: false
  };

  return {
    ...payload,
    finding_id: typeof payload.finding_id === "string" ? payload.finding_id : findingId,
    finding_label: typeof payload.finding_label === "string" ? payload.finding_label : label,
    evidenceVersion: "2.0",
    evidenceConfidence: profile.evidenceConfidence,
    directVsInferred: profile.directVsInferred,
    scanContext: {
      domain: typeof payload.domain === "string" ? payload.domain : "example.com",
      requestedUrl: typeof payload.requested_url === "string" ? payload.requested_url : "https://example.com/",
      finalUrl: typeof payload.final_url === "string" ? payload.final_url : "https://example.com/",
      publicWebObservation: true,
      legalConclusion: false
    },
    artifacts,
    classification: {
      section: typeof payload.section === "string" ? payload.section : "Review signal",
      criticality: typeof payload.criticality === "string" ? payload.criticality : "review",
      evidenceConfidence: profile.evidenceConfidence,
      directVsInferred: profile.directVsInferred,
      legalStatusDetermined: false
    },
    coverage: {
      coverageFlags,
      coverageReliableForTopRanking: coverageFlags.length === 0,
      notDetectedMeans: "not_observed_in_scan_scope",
      manualReviewNeeded: true
    },
    topFindingCalibration: SAMPLE_TOP_FINDING_CALIBRATION[findingId] ?? {
      minimumToSurface: ["Retained evidence supports the finding under the canonical concern/policy/unified-finding pipeline."],
      highConfidenceRequires: ["Corroborated retained evidence and usable coverage."],
      criticalOrTopRankingRequires: ["Stronger directness, corroboration, affected surface, and review relevance."],
      demoteOrSuppressWhen: ["Evidence is ambiguous, unsupported, blocked, or audit-only."]
    },
    automationLimits: Array.isArray(payload.automationLimits)
      ? payload.automationLimits
      : [
          "Automated public-web observations do not determine legal status, compliance status, proof that a law was breached, proof of data capture, or tracking lawfulness.",
          "Manual review is needed to confirm purpose, necessity, jurisdiction, configuration, exemptions, and remediation quality."
        ],
    redaction: {
      rawIdentifiersRetained: false,
      storageValueContentsRetained: false,
      completeQueryStringsRetained: false,
      requestBodiesRetained: false,
      renderedPageImagesRetained: false,
      sourceMarkupRetained: false,
      userEnteredValuesRetained: false
    },
    selectionReason: typeof payload.selectionReason === "string"
      ? payload.selectionReason
      : typeof payload.selection_reason === "string"
        ? payload.selection_reason
        : "Illustrative public sample selected to show retained evidence, directness, limits, and top-finding calibration.",
    ...buildCategoryEvidenceBlocks(findingId, payload)
  };
}

function makePublicSample(sample: SampleFindingJson): SampleFindingJson {
  const primaryDomain = typeof sample.payload.domain === "string" ? sample.payload.domain : null;
  const sanitizedPayload = sanitizeSampleValue(sample.payload, primaryDomain) as Record<string, unknown>;

  if (primaryDomain) {
    sanitizedPayload.domain = "example.com";
  }

  if (typeof sanitizedPayload.requested_url === "string") {
    sanitizedPayload.requested_url = "https://example.com/";
  }

  if (typeof sanitizedPayload.final_url === "string") {
    sanitizedPayload.final_url = "https://example.com/";
  }

  return {
    ...sample,
    sourceLabel: sample.sourceLabel.includes("Production") ? "Redacted illustrative example" : sample.sourceLabel,
    payload: normalizeSamplePayload(sample.findingId, sample.label, sanitizedPayload)
  };
}

const accessibilityRiskScore = {
  "example_type": "positive",
  "scan_id": "a0f2621b-a25f-4392-8be6-b1ce09d43e8a",
  "domain": "chime.com",
  "requested_url": "https://chime.com",
  "final_url": "https://chime.com/",
  "created_at": "2026-03-26T22:35:06.747Z",
  "scanned_at": "2026-03-26T22:35:52.641Z",
  "finding_id": "accessibility_risk_score",
  "finding_label": "Representative accessibility barriers detected",
  "section": "Accessibility",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "surface_priority": 72,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": [],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": ["accessibility.wcag_contrast_failures_count"],
  "evidence": {
    "counts": {
      "count": 1,
      "representativeAxeExampleCount": 1,
      "representativeAxePageCount": 1,
      "representativeAxeRuleCount": 1
    },
    "evidence_snippets": [
      "Axe example: color-contrast/color on https://chime.com/; selector footer > p; nodes 1; impact Low-vision users may struggle to read text or distinguish controls.; severity high; help: Elements must meet minimum color contrast ratio thresholds.",
      "Representative axe examples: 1 rule across 1 page; max impact: Low-vision users may struggle to read text or distinguish controls.."
    ],
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "preconsent_tracking_detected": false,
      "banner_present": false,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": ["partial_scan", "blocked", "incomplete_pages"],
  "coverage_limitation_evidence": {
    "coverageFlags": ["partial_scan", "blocked", "incomplete_pages"],
    "coverageLevel": "limited_partial",
    "explanation": "Scan coverage limitations may have prevented full page-text evidence capture.",
    "finalUrl": "https://chime.com/",
    "homepageHttpStatus": null,
    "runtimeSignalsRetained": {
      "cookieCount": 1,
      "preconsentEvidenceUrlCount": 0,
      "requestDomainSamples": [],
      "scriptTagCount": 0,
      "thirdPartyRequestCount": 0,
      "trackerVendorSamples": []
    }
  },
  "known_limitations": [
    "Scan coverage issue: partial_scan",
    "Scan coverage issue: blocked",
    "Scan coverage issue: incomplete_pages"
  ],
  "selection_reason": "Surfaced finding with strong support. Mapped to executive finding accessibility_risk_score (good, direct). Evidence richness score: 9."
} satisfies Record<string, unknown>;

const preConsentTrackingDetected = {
  "example_type": "positive",
  "domain": "example.com",
  "requested_url": "https://example.com/",
  "final_url": "https://example.com/",
  "created_at": "2026-05-18T18:20:10.442Z",
  "scanned_at": "2026-05-18T18:20:18.912Z",
  "finding_id": "pre_consent_tracking_detected",
  "finding_label": "Third-party tracking observed before recorded consent",
  "section": "Privacy & Tracking",
  "evidenceConfidence": "strong",
  "directVsInferred": "direct_observation",
  "evidence": {
    "counts": {
      "firstRequestMs": 1137,
      "firstThirdPartyRequestMs": 3405,
      "firstCookieSeenMs": 3468,
      "total_cookie_count": 3,
      "total_vendor_count": 2,
      "total_request_count": 12,
      "total_tracker_count": 1,
      "third_party_cookie_count": 0,
      "third_party_request_count": 2,
      "preConsentTrackingRequestCount": 1,
      "preConsentTrackingSignalCount": 2
    },
    "evidence_snippets": [
      "Example Tag Manager",
      "Example Analytics",
      "tagmanager.example",
      "analytics.example",
      "script_host:tagmanager.example",
      "request:https://analytics.example/g/collect [query_redacted=true]",
      "cookie:_ga [value_redacted=true]"
    ],
    "vendors": [
      "Example Tag Manager",
      "Example Analytics"
    ],
    "request_domains": ["tagmanager.example", "analytics.example"],
    "request_samples": [
      {
        "artifactRef": "req_001",
        "role": "supporting_context_only",
        "origin": "https://tagmanager.example",
        "path": "/gtm.js",
        "queryRedacted": true,
        "timestampMs": 1137
      },
      {
        "artifactRef": "req_002",
        "role": "finding_supporting_artifact",
        "origin": "https://analytics.example",
        "path": "/g/collect",
        "queryRedacted": true,
        "timestampMs": 3405,
        "essentiality": "non_essential",
        "purposeCategory": "analytics_measurement"
      }
    ],
    "cookie_samples": [
      {
        "artifactRef": "storage_001",
        "role": "finding_supporting_artifact",
        "name": "_ga",
        "valueRedacted": true,
        "timestampMs": 3468,
        "essentiality": "non_essential",
        "purposeCategory": "analytics_identifier"
      }
    ],
    "consent_summary": {
      "cmp_vendor": "Example CMP",
      "preconsent_tracking_detected": true,
      "banner_present": true,
      "consent_state_observed": "no_choice_observed",
      "consent_action_observed_before_first_signal": false,
      "observed_prior_consent_state_for_purpose": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "runtime_anchors": [
      "req_002:https://analytics.example/g/collect [query_redacted=true]",
      "storage_001:_ga [value_redacted=true]"
    ]
  },
  "coverage_flags": [],
  "known_limitations": [
    "Illustrative public sample with redacted query strings and cookie values.",
    "Review consent state, vendor purpose, regional configuration, and exemptions before taking action."
  ],
  "selection_reason": "Illustrative public sample with consent timeline, classified non-essential runtime anchors, and usable coverage."
} satisfies Record<string, unknown>;

const rejectTrackingPersistsAfterReject = {
  "example_type": "positive",
  "domain": "abc.com",
  "requested_url": "https://abc.com",
  "finding_id": "reject_tracking_persists_after_reject",
  "finding_label": "Non-essential tracking continued after reject",
  "section": "Privacy & Tracking",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "evidence_source": "Production scan corpus",
  "evidence_summary": "Scan ID: 6375819a-dc84-4da8-8eba-0a415059255f, vendors: Adobe Analytics + Google Ads, confidence: good, direct evidence",
  "verification_method": "Kimi-reviewed runtime artifact",
  "verified_at": "2026-04-30"
} satisfies Record<string, unknown>;

const rtbCookieSyncObserved = {
  "example_type": "positive",
  "scan_id": "de34f407-7f3f-4ea0-b598-c8874f431e63",
  "domain": "www.betterment.com",
  "requested_url": "https://betterment.com/",
  "final_url": "https://www.betterment.com/",
  "created_at": "2026-04-29T15:48:39.215Z",
  "scanned_at": "2026-04-29T15:49:46.818Z",
  "finding_id": "rtb_cookie_sync_observed",
  "finding_label": "Adtech identity sync-like request observed",
  "section": "Vendors & Requests",
  "evidenceConfidence": "strong",
  "directVsInferred": "direct_observation",
  "surface_priority": 94,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": [],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": [],
  "evidence": {
    "counts": {
      "third_party_request_count": 210,
      "rtb_cookie_sync_domain_count": 15,
      "third_party_request_domain_count": 95
    },
    "evidence_snippets": [
      "Adobe Audience Manager",
      "Bidswitch",
      "DoubleClick",
      "DoubleClick / Floodlight",
      "Index Exchange",
      "LiveRamp",
      "OpenX",
      "PubMatic",
      "Rubicon Project",
      "The Trade Desk",
      "TripleLift",
      "adsmeasurement.com",
      "alb.reddit.com",
      "amplify.outbrain.com",
      "analytics-ipv6.tiktokw.us",
      "analytics.google.com",
      "analytics.tiktok.com",
      "api.hubapi.com",
      "api.segment.io",
      "app.hubspot.com",
      "b2bjsstore.s3.us-west-2.amazonaws.com",
      "browser.sentry-cdn.com",
      "c.amazon-adsystem.com",
      "cdn.ketchjs.com",
      "cdn.mxpnl.com",
      "cdn.segment.com",
      "cdnjs.cloudflare.com",
      "cm.g.doubleclick.net",
      "cm.teads.tv",
      "collector-35199.us.tvsquared.com",
      "collector-55161.us.tvsquared.com",
      "connect.facebook.net",
      "ct.pinterest.com",
      "cta-service-cms2.hubspot.com",
      "d.adroll.com",
      "d2hrivdxn8ekm8.cloudfront.net",
      "dpm.demdex.net",
      "dsum-sec.casalemedia.com",
      "eb2.3lift.com",
      "f.hubspotusercontent20.net",
      "fast.wistia.com",
      "global.ketchcdn.com",
      "googleads.g.doubleclick.net",
      "grsm.io",
      "i.pretected.com",
      "ib.adnxs.com",
      "idsync.rlcdn.com",
      "image2.pubmatic.com",
      "insight.adsrvr.org",
      "jadserve.postrelease.com",
      "js.hs-analytics.net",
      "js.hs-banner.com",
      "js.hsadspixel.net",
      "js.hubspot.com",
      "js.partnerstack.com",
      "match.adsrvr.org",
      "maxcdn.bootstrapcdn.com",
      "ml314.com",
      "mpp.vindicosuite.com",
      "no-cache.hubspot.com",
      "p.teads.tv",
      "partnerlinks.io",
      "perf-na1.hsforms.com",
      "perf.hsforms.com",
      "ping.pdst.fm",
      "pippio.com",
      "pixel-config.reddit.com",
      "pixel.rubiconproject.com",
      "pixel.tapad.com",
      "pixelads.yahoo.com",
      "ps.eyeota.net",
      "pubads.g.doubleclick.net",
      "px.adentifi.com",
      "px.ads.linkedin.com",
      "px.mountain.com",
      "s.adroll.com",
      "s.amazon-adsystem.com",
      "s.pinimg.com",
      "s.yimg.com",
      "sc-static.net",
      "script.hotjar.com",
      "secure.adnxs.com",
      "segment.prod.bidr.io",
      "static.hotjar.com",
      "stats.g.doubleclick.net",
      "storage.googleapis.com",
      "sync.outbrain.com",
      "sync.taboola.com",
      "tags.srv.stackadapt.com",
      "tags.w55c.net",
      "tk0x1.com",
      "tr.outbrain.com",
      "tr.snapchat.com",
      "tte-prod.telemetry.vaultdcr.com",
      "ttip-ipv4-prod.telemetry.vaultdcr.com",
      "ttip-ipv6-prod.telemetry.vaultdcr.com",
      "tvspix.com",
      "us-u.openx.net",
      "wave.outbrain.com",
      "www.facebook.com",
      "www.google-analytics.com",
      "www.google.com",
      "www.googletagmanager.com",
      "www.nextinsure.com",
      "www.redditstatic.com",
      "x.bidswitch.net"
    ],
    "vendors": [
      "Adobe Audience Manager",
      "Bidswitch",
      "DoubleClick",
      "DoubleClick / Floodlight",
      "Index Exchange",
      "LiveRamp",
      "OpenX",
      "PubMatic",
      "Rubicon Project",
      "The Trade Desk",
      "TripleLift"
    ],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "preconsent_tracking_detected": true,
      "banner_present": true,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [
      "Runtime vendors: Adobe Audience Manager, Bidswitch, DoubleClick, DoubleClick / Floodlight, Index Exchange"
    ],
    "conflict_bridge": null
  },
  "coverage_flags": ["partial_scan", "incomplete_pages"],
  "known_limitations": [
    "Scan coverage issue: partial_scan",
    "Scan coverage issue: incomplete_pages",
    "Runtime signals were retained before or during limited page coverage."
  ],
  "selection_reason": "Surfaced finding with strong support. Evidence richness score: 148."
} satisfies Record<string, unknown>;

const sessionRecordingServicesDetected = {
  "example_type": "positive",
  "scan_id": "0f1782a7-4a5c-4e29-98ce-672830bbaa63",
  "domain": "www.google.com",
  "requested_url": "https://www.google.com",
  "final_url": "https://www.google.com/",
  "created_at": "2026-03-30T00:59:42.069Z",
  "scanned_at": "2026-03-30T01:01:03.193Z",
  "finding_id": "session_recording_services_detected",
  "finding_label": "Session replay service signal observed",
  "section": "Privacy & Tracking",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "surface_priority": 89,
  "appeared_in_executive_summary": true,
  "regulatory_lanes": ["CCPA/CPRA", "COPPA"],
  "normalized_concern_ids": ["eligible"],
  "concern_policy_rule_ids": [
    "privacy.session_replay_runtime_detected",
    "privacy.session_replay_runtime_vendors",
    "commerce.session_replay_tool_detected"
  ],
  "evidence": {
    "counts": {},
    "evidence_snippets": [
      "tracker_vendor:Hotjar",
      "vendor_category:session_replay",
      "matched_signature:hotjar",
      "collection_endpoint:unknown",
      "tracker_confidence:0.95",
      "Hotjar"
    ],
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "consent_summary": {
      "cmp_vendor": "TrustArc",
      "preconsent_tracking_detected": true,
      "banner_present": false,
      "reject_all_present": false
    },
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": false,
      "device_signal_vendor_detected": null
    },
    "policy_anchors": [],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "coverage_limitation_evidence": null,
  "known_limitations": [],
  "selection_reason": "Surfaced finding with strong support. Mapped to executive finding session_recording_services_detected (good, direct). Evidence richness score: 10. Scan completed without coverage issues."
} satisfies Record<string, unknown>;

const thirdPartyCookiePreConsent = {
  "example_type": "positive",
  "domain": "marketwatch.com",
  "requested_url": "https://marketwatch.com",
  "finding_id": "third_party_cookie_pre_consent",
  "finding_label": "Third-party cookie or storage observed before consent",
  "section": "Cookies & Storage",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "evidence_source": "Production scan corpus",
  "evidence_summary": "icu@.adnxs.com, TDID@.adsrvr.org, ad-id@.amazon-adsystem.com, cto_bundle@.criteo.com, demdex@.demdex.net, IDE@.doubleclick.net",
  "verification_method": "Kimi-reviewed runtime artifact",
  "verified_at": "2026-04-30"
} satisfies Record<string, unknown>;

const cookieBannerRequirements = {
  "example_type": "positive",
  "scan_id": "6a8d2f65-78ef-4b36-a1ed-0b0c2f42d4a3",
  "domain": "example-retail.com",
  "requested_url": "https://example-retail.com/",
  "final_url": "https://example-retail.com/",
  "created_at": "2026-04-29T16:12:19.420Z",
  "scanned_at": "2026-04-29T16:13:02.114Z",
  "finding_id": "cookie_banner_control_gap",
  "finding_label": "Cookie banner lacks an obvious reject control",
  "section": "Cookies & Storage",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "surface_priority": 86,
  "appeared_in_executive_summary": true,
  "evidence": {
    "counts": {
      "banner_text_snippet_count": 3,
      "accept_button_count": 1,
      "reject_button_count": 0,
      "preference_link_count": 1
    },
    "evidence_snippets": [
      "Cookie banner detected with accept action and preference link.",
      "No visible reject-all control detected in the initial consent surface.",
      "CMP vendor signal: OneTrust"
    ],
    "consent_summary": {
      "banner_present": true,
      "reject_all_present": false,
      "cmp_vendor": "OneTrust",
      "consent_action_observed": "none"
    },
    "vendors": ["OneTrust"],
    "request_domains": ["cdn.cookielaw.org"],
    "request_samples": [],
    "cookie_samples": [],
    "policy_anchors": [],
    "runtime_anchors": ["Consent surface: banner_present=true, reject_all_present=false"],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "known_limitations": [],
  "selection_reason": "Representative consent-control finding with direct banner evidence."
} satisfies Record<string, unknown>;

const privacyPolicySignals = {
  "example_type": "positive",
  "scan_id": "1f3a62e7-835c-41e2-9988-d37b38ef0f87",
  "domain": "example-services.com",
  "requested_url": "https://example-services.com/",
  "final_url": "https://example-services.com/",
  "created_at": "2026-04-29T17:04:20.612Z",
  "scanned_at": "2026-04-29T17:05:11.219Z",
  "finding_id": "privacy_policy_thin_coverage",
  "finding_label": "Privacy policy topic coverage appears limited",
  "section": "Privacy & Disclosures",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "surface_priority": 74,
  "appeared_in_executive_summary": true,
  "evidence": {
    "counts": {
      "policy_page_count": 1,
      "topic_signal_count": 2,
      "missing_topic_count": 3
    },
    "evidence_snippets": [
      "Privacy policy page detected from footer link.",
      "Observed topic signals: cookies, third_party.",
      "Thin coverage: expected personal-data, contact, and opt-out language were not observed in the retained policy text."
    ],
    "policy_summary": {
      "policy_page_detected": true,
      "topic_signals": ["cookies", "third_party"],
      "thin_coverage": true
    },
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "policy_anchors": ["/privacy-policy"],
    "runtime_anchors": [],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "known_limitations": [],
  "selection_reason": "Representative policy-page finding with retained topic-signal evidence."
} satisfies Record<string, unknown>;

const disclosureSignals = {
  "example_type": "positive",
  "scan_id": "4e55d4d1-2c1a-47bd-8f82-aea25c4cf906",
  "domain": "example-reviews.com",
  "requested_url": "https://example-reviews.com/best-tools",
  "final_url": "https://example-reviews.com/best-tools",
  "created_at": "2026-04-29T18:11:08.003Z",
  "scanned_at": "2026-04-29T18:11:52.774Z",
  "finding_id": "endorsement_disclosure_gap",
  "finding_label": "Endorsement-style content lacks obvious disclosure language",
  "section": "Privacy & Disclosures",
  "evidenceConfidence": "good",
  "directVsInferred": "correlated_observation",
  "surface_priority": 68,
  "appeared_in_executive_summary": true,
  "evidence": {
    "counts": {
      "endorsement_signal_count": 4,
      "disclosure_language_count": 0,
      "affiliate_link_count": 2
    },
    "evidence_snippets": [
      "Endorsement signals detected: recommended, top pick, partner offer, affiliate-style outbound link.",
      "No nearby disclosure language detected in retained page text.",
      "Disclosure review should confirm whether promotional relationships are clearly explained."
    ],
    "disclosure_summary": {
      "endorsement_signals_detected": true,
      "disclosure_language_present": false,
      "affiliate_link_signals": true
    },
    "vendors": [],
    "request_domains": [],
    "request_samples": [],
    "cookie_samples": [],
    "policy_anchors": [],
    "runtime_anchors": ["Page text signals: recommended, top pick, partner offer"],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "known_limitations": [],
  "selection_reason": "Representative disclosure finding with retained page-text snippets."
} satisfies Record<string, unknown>;

const fingerprintingSignals = {
  "example_type": "positive",
  "scan_id": "32c4b31d-f4a5-4715-8f33-bf4c5ff228ad",
  "domain": "example-media.com",
  "requested_url": "https://example-media.com/",
  "final_url": "https://example-media.com/",
  "created_at": "2026-04-29T19:01:18.445Z",
  "scanned_at": "2026-04-29T19:02:03.901Z",
  "finding_id": "fingerprinting_or_device_signals_detected",
  "finding_label": "Fingerprinting-related device signals detected",
  "section": "Privacy & Tracking",
  "evidenceConfidence": "good",
  "directVsInferred": "correlated_observation",
  "surface_priority": 82,
  "appeared_in_executive_summary": true,
  "evidence": {
    "counts": {
      "fingerprinting_signal_count": 3,
      "device_signal_vendor_count": 1,
      "script_host_count": 2
    },
    "evidence_snippets": [
      "Fingerprinting-related API signal observed: canvas_readback.",
      "Device signal vendor detected in script host sample.",
      "Review whether the behavior is expected and consent-gated where appropriate."
    ],
    "fingerprinting_or_device_signals": {
      "fingerprinting_vendor_detected": true,
      "device_signal_vendor_detected": "FingerprintJS",
      "signals": ["canvas_readback", "webgl_capability", "device_entropy"]
    },
    "vendors": ["FingerprintJS"],
    "request_domains": ["metrics.example-cdn.com"],
    "request_samples": [],
    "cookie_samples": [],
    "policy_anchors": [],
    "runtime_anchors": ["script_host:metrics.example-cdn.com"],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "known_limitations": [],
  "selection_reason": "Representative fingerprinting-related signal with retained runtime evidence."
} satisfies Record<string, unknown>;

const websiteScanningBasics = {
  "example_type": "positive",
  "scan_id": "9300865d-5568-41dd-88ef-05d124df1fd6",
  "domain": "example-business.com",
  "requested_url": "https://example-business.com/",
  "final_url": "https://example-business.com/",
  "created_at": "2026-04-29T20:16:22.012Z",
  "scanned_at": "2026-04-29T20:17:08.840Z",
  "finding_id": "website_signal_review_summary",
  "finding_label": "Website scan surfaced multiple review signals",
  "section": "Website Signals",
  "evidenceConfidence": "good",
  "directVsInferred": "direct_observation",
  "surface_priority": 70,
  "appeared_in_executive_summary": true,
  "evidence": {
    "counts": {
      "finding_count": 4,
      "privacy_tracking_count": 1,
      "cookie_storage_count": 1,
      "accessibility_count": 1,
      "policy_disclosure_count": 1
    },
    "evidence_snippets": [
      "Scan completed for homepage and selected linked pages.",
      "Findings grouped across privacy tracking, cookies, accessibility, and policy/disclosure review.",
      "Use finding-level JSON to inspect each retained evidence payload."
    ],
    "vendors": ["Google Analytics"],
    "request_domains": ["www.google-analytics.com"],
    "request_samples": [],
    "cookie_samples": [],
    "policy_anchors": ["/privacy"],
    "runtime_anchors": ["homepage_status:200", "linked_pages_sampled:3"],
    "conflict_bridge": null
  },
  "coverage_flags": [],
  "known_limitations": [],
  "selection_reason": "Representative overview payload for a completed website signal scan."
} satisfies Record<string, unknown>;

const illustrativeThirdPartyCookiePreConsent = {
  finding_id: "third_party_cookie_pre_consent",
  finding_label: "Third-party cookie or storage observed before consent",
  category: "Cookies",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "direct_observation",
  observed:
    "Retained runtime evidence showed a third-party cookie or storage artifact observed before CertScore recorded a consent action or a prior consent state associated with that purpose.",
  evidence: {
    summary:
      "Retained runtime evidence showed a third-party cookie or storage artifact observed before CertScore recorded a consent action or a prior consent state associated with that purpose.",
    examples: [
      {
        title: "Third-party cookie timing example",
        lines: [
          "artifact=storage_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "type=cookie_observed",
          "cookie_name=example_id",
          "value_redacted=true",
          "cookie_domain=.ads.example",
          "cookie_scope=third_party",
          "first_seen_ms=1840",
          "consent_action_observed_before_first_seen=false",
          "prior_consent_state_for_purpose=false",
          "purpose_category=advertising_or_measurement [manual_review_recommended]"
        ]
      }
    ],
    automationLimits: [
      "Automated storage evidence may not determine purpose, necessity, exemption status, or legal status.",
      "Manual review is needed to confirm cookie purpose, consent state, regional configuration, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeLongLivedCookieRetentionReview = {
  finding_id: "long_lived_cookie_retention_review",
  finding_label: "Long-lived cookie retention review",
  category: "Cookies",
  criticality: "high",
  evidenceConfidence: "strong",
  directVsInferred: "direct_observation",
  observed:
    "Retained runtime cookie evidence showed persistent tracking or unclassified cookies whose observed expiry or computed duration met CertScore retention review thresholds: 365 days or longer for main review, or 180-364 days for source-attributed or multiple tracking-cookie review context.",
  evidence: {
    summary:
      "Retained runtime cookie evidence showed persistent tracking or unclassified cookies whose observed expiry or computed duration met CertScore retention review thresholds: 365 days or longer for main review, or 180-364 days for source-attributed or multiple tracking-cookie review context.",
    examples: [
      {
        title: "Long-lived runtime cookie evidence",
        lines: [
          "artifact=cookie_retention_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "cookie_name=_fbp",
          "cookie_domain=.example.com",
          "value_retained=false",
          "classification=advertising_marketing",
          "vendor=Meta",
          "source_request_url=https://connect.example/fbevents.js [query_redacted=true]",
          "duration_days=540",
          "threshold_basis=duration_days >= 365 CertScore product review threshold",
          "review_caveat=manual review should confirm purpose, vendor ownership, consent state, opt-out behavior, retention disclosure, and minimization"
        ]
      },
      {
        title: "Unclassified cookie review context",
        lines: [
          "artifact=cookie_retention_002",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "cookie_name=xbc",
          "cookie_domain=.example.com",
          "value_retained=false",
          "classification=unknown_unclassified",
          "duration_days=399",
          "threshold_basis=duration_days >= 365 CertScore product review threshold",
          "classification_review_needed=true"
        ]
      }
    ],
    automationLimits: [
      "Automated public-web observations do not determine legal status, consent validity, necessity, or compliance status. The 365-day threshold is a CertScore product review threshold, not a statutory threshold.",
      "Manual review is needed to confirm cookie purpose, vendor ownership, classification, consent state, opt-out behavior, retention disclosures, and remediation quality."
    ],
    cookie_samples: [
      "cookie_name=_fbp; cookie_domain=.example.com; classification=advertising_marketing; duration_days=540; value_retained=false",
      "cookie_name=xbc; cookie_domain=.example.com; classification=unknown_unclassified; duration_days=399; value_retained=false"
    ],
    request_samples: ["https://connect.example/fbevents.js [query_redacted=true]"],
    runtime_anchors: [
      "privacy.cookie_retention_lifetime_review_signal",
      "cookie_retention_001 duration_days=540 threshold_basis=CertScore product review threshold"
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeRejectTrackingPersistsAfterReject = {
  finding_id: "reject_tracking_persists_after_reject",
  finding_label: "Non-essential tracking continued after reject",
  category: "Consent / tracking",
  criticality: "high",
  evidenceConfidence: "good",
  directVsInferred: "direct_observation",
  observed:
    "Retained runtime evidence showed a reject-style consent interaction followed by classified non-essential request or storage activity in the observed scan scope.",
  evidence: {
    summary:
      "Retained runtime evidence showed a reject-style consent interaction followed by classified non-essential request or storage activity in the observed scan scope.",
    examples: [
      {
        title: "Post-reject runtime artifact",
        lines: [
          "artifact=req_002",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "reject_action_timestamp_ms=2600",
          "reject_action_observed=true",
          "post_reject_request_timestamp_ms=4120",
          "request_origin=https://analytics.example",
          "request_path=/collect [query_redacted=true]",
          "vendor_category=analytics",
          "essentiality=non_essential",
          "review_caveat=manual review should confirm reject success, queued-beacon timing, purpose, necessity, and CMP/vendor configuration"
        ]
      }
    ],
    automationLimits: [
      "Automated evidence may not fully determine reject success, queued beacons, vendor responsibility, consent validity, or legal status.",
      "Manual review is needed to confirm timing, purpose, CMP propagation, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeRtbCookieSyncObserved = {
  finding_id: "rtb_cookie_sync_observed",
  finding_label: "Adtech identity sync-like request observed",
  category: "Third-party tracking",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "direct_observation",
  observed:
    "Retained network evidence showed adtech, RTB, sync, match, redirect, or identifier-like request patterns that may be relevant to cookie/tracker, advertising, consent, transparency, sale/share, and vendor-governance review.",
  evidence: {
    summary:
      "Retained network evidence showed adtech, RTB, sync, match, redirect, or identifier-like request patterns that may be relevant to cookie/tracker, advertising, consent, transparency, sale/share, and vendor-governance review.",
    examples: [
      {
        title: "Adtech sync request example",
        lines: [
          "artifact=req_003",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "request_origin=https://sync.ads.example",
          "request_path=/user_sync [query_redacted=true]",
          "resource_type=image_or_redirect",
          "vendor_category=adtech_or_exchange",
          "detected_pattern=identity_sync_like_request",
          "identifier_like_keys=uid, partner_id [values_redacted=true]",
          "timestamp_ms=2860",
          "review_caveat=manual review should confirm endpoint purpose, identifier scope, consent timing, redirects, jurisdiction, and server-side behavior"
        ]
      }
    ],
    automationLimits: [
      "Automated network evidence does not confirm cookie syncing, infer a complete identity graph, or determine personal identity.",
      "Manual review is needed to confirm endpoint purpose, identifier scope, consent timing, and server-side behavior."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeCrossDomainIdentifierSharingObserved = {
  finding_id: "cross_domain_identifier_sharing_observed",
  finding_label: "Identifier-like values observed across domains",
  category: "Third-party tracking",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "direct_observation",
  observed:
    "Retained outbound request evidence showed identifier-like keys or values moving to a different domain or third-party context within the observed scan scope.",
  evidence: {
    summary:
      "Retained outbound request evidence showed identifier-like keys or values moving to a different domain or third-party context within the observed scan scope.",
    examples: [
      {
        title: "Cross-domain identifier request example",
        lines: [
          "artifact=req_004",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "initiator_origin=https://example.com",
          "destination_origin=https://measure.example",
          "request_path=/collect [query_redacted=true]",
          "third_party_context=true",
          "identifier_like_keys=client_id, campaign_id [values_redacted=true]",
          "timestamp_ms=3180",
          "vendor_category=analytics_or_ad_measurement",
          "review_caveat=manual review should confirm purpose, identifier scope, consent timing, destination role, and whether the value is pseudonymous, scoped, hashed, or otherwise limited"
        ]
      }
    ],
    automationLimits: [
      "Automated request evidence does not determine personal identity, identity resolution, or a complete identity graph.",
      "Manual review is needed to confirm purpose, identifier scope, consent relevance, and downstream data use."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeSessionRecordingServicesDetected = {
  finding_id: "session_recording_services_detected",
  finding_label: "Session replay service signal observed",
  category: "Third-party tracking",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "direct_observation",
  observed:
    "Retained runtime evidence showed a script, request, or vendor pattern associated with session replay, heatmaps, recording, or behavior analytics in the observed public-page scope.",
  evidence: {
    summary:
      "Retained runtime evidence showed a script, request, or vendor pattern associated with session replay, heatmaps, recording, or behavior analytics in the observed public-page scope.",
    examples: [
      {
        title: "Session replay service signal",
        lines: [
          "artifact=req_005",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "request_origin=https://replay.example",
          "request_path=/recorder.js [query_redacted=true]",
          "resource_type=script",
          "vendor_category=session_replay_or_behavior_analytics",
          "detected_pattern=replay_library_or_collection_endpoint",
          "consent_timing_context=manual_review_recommended",
          "review_caveat=manual review should confirm active collection, masking, sampling, consent state, page exclusions, and vendor configuration"
        ]
      }
    ],
    automationLimits: [
      "Automated replay evidence does not determine keystroke capture, sensitive-value capture, visual capture, full recording retention, or legal status.",
      "Manual review is needed to confirm active collection, masking, sampling, consent state, payload contents, and page exclusions."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativePossibleSessionReplaySensitiveSurface = {
  finding_id: "possible_session_replay_on_sensitive_input_surface",
  finding_label: "Possible session replay near sensitive input surface",
  category: "Third-party tracking",
  criticality: "critical",
  evidenceConfidence: "review_signal",
  directVsInferred: "correlated_observation",
  observed:
    "Retained runtime and page-surface evidence showed session-replay-related signals on or near a form, flow, or page surface that may collect sensitive information.",
  evidence: {
    summary:
      "Retained runtime and page-surface evidence showed session-replay-related signals on or near a form, flow, or page surface that may collect sensitive information.",
    examples: [
      {
        title: "Replay near sensitive surface",
        lines: [
          "artifact=replay_sensitive_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/apply",
          "replay_request_origin=https://replay.example",
          "replay_request_path=/collect [query_redacted=true]",
          "surface_context=application_form",
          "sensitive_field_context=financial_or_identity_high_risk_context [values_not_retained; not_article_9_by_itself]",
          "detected_pattern=replay_runtime_on_sensitive_surface",
          "review_caveat=manual review should confirm active collection, masking, visual-capture settings, keystroke capture, payload contents, consent state, and page exclusions"
        ]
      }
    ],
    automationLimits: [
      "Co-occurrence of replay-related runtime evidence and sensitive surface context does not determine that sensitive values, keystrokes, form contents, visual captures, or recordings were captured, or that GDPR Article 9 applies.",
      "Manual review is needed to confirm masking, sampling, payload contents, page exclusions, consent state, and vendor configuration."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeSensitiveTrackingSurface = {
  finding_id: "sensitive_data_collection_with_third_party_tracking_present",
  finding_label: "Sensitive input surface with third-party tracking context",
  category: "Third-party tracking",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "correlated_observation",
  observed:
    "Retained page and runtime evidence showed a sensitive-input or sensitive-context surface alongside third-party tracking, analytics, advertising, replay, or measurement context in the observed scan scope.",
  evidence: {
    summary:
      "Retained page and runtime evidence showed a sensitive-input or sensitive-context surface alongside third-party tracking, analytics, advertising, replay, or measurement context in the observed scan scope.",
    examples: [
      {
        title: "Sensitive surface tracking context",
        lines: [
          "artifact=sensitive_tracking_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/apply",
          "surface_context=application_form",
          "sensitive_field_context=financial_or_identity_high_risk_context [values_not_retained; not_article_9_by_itself]",
          "third_party_request_origin=https://analytics.example",
          "third_party_request_path=/collect [query_redacted=true]",
          "vendor_category=analytics_or_measurement",
          "detected_pattern=third_party_tracking_on_sensitive_surface",
          "review_caveat=manual review should confirm data sensitivity, payload contents, purpose, consent state, minimization, and page-level exclusions"
        ]
      }
    ],
    automationLimits: [
      "Co-occurrence of sensitive surface context and third-party tracking evidence does not determine that sensitive values were transmitted, captured, read, linked to a third party, or that GDPR Article 9 applies.",
      "Manual review is needed to confirm data sensitivity, payload contents, purpose, consent state, minimization, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeFingerprintingRelatedSignals = {
  finding_id: "fingerprinting_related_signals_observed",
  finding_label: "Fingerprinting-related browser/device signals observed",
  category: "Fingerprinting",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "direct_observation",
  observed:
    "Retained runtime evidence showed browser, device, canvas, storage, or other high-entropy environment signals that may be relevant to fingerprinting review, without enough retained context to treat the cluster as probable fingerprinting.",
  evidence: {
    summary:
      "Retained runtime evidence showed browser, device, canvas, storage, or other high-entropy environment signals that may be relevant to fingerprinting review, without enough retained context to treat the cluster as probable fingerprinting.",
    examples: [
      {
        title: "Fingerprinting-related signal example",
        lines: [
          "artifact=fingerprint_related_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "script_origin=https://signals.example",
          "signal_categories=canvas_or_webgl, storage [raw_values_not_retained]",
          "request_path=/collect [query_redacted=true]",
          "vendor_category=security_or_measurement [manual_review_recommended]",
          "fingerprint_cluster_strength=related_signal_not_probable",
          "review_caveat=manual review should confirm purpose, entropy, necessity, consent state, vendor role, and whether the signal is linked to identifiers"
        ]
      }
    ],
    automationLimits: [
      "Automated evidence does not determine persistent fingerprint creation, personal identity, identity resolution, user singling-out, legal status, or consent validity.",
      "Manual review is needed to confirm purpose, entropy, necessity, consent state, vendor role, and downstream use."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeProbableFingerprinting = {
  finding_id: "probable_fingerprinting",
  finding_label: "Probable browser/device fingerprinting review signal",
  category: "Fingerprinting",
  criticality: "critical",
  evidenceConfidence: "review_signal",
  directVsInferred: "clustered_inference",
  observed:
    "Retained runtime evidence showed a clustered high-entropy browser/device signal pattern that may warrant probable fingerprinting review.",
  evidence: {
    summary:
      "Retained runtime evidence showed a clustered high-entropy browser/device signal pattern that may warrant probable fingerprinting review.",
    examples: [
      {
        title: "Probable fingerprinting cluster example",
        lines: [
          "artifact=fingerprint_cluster_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "script_origin=https://signals.example",
          "signal_categories=canvas_or_webgl, audio, storage, screen_locale [raw_values_not_retained]",
          "fingerprint_tier=probable_review_signal",
          "request_path=/collect [query_redacted=true]",
          "identifier_linkage_context=manual_review_recommended",
          "review_caveat=manual review should confirm purpose, necessity, consent state, identity linkage, endpoint role, and security or fraud-prevention context"
        ]
      }
    ],
    automationLimits: [
      "Automated evidence does not determine persistent fingerprint creation, personal identity, identity resolution, user singling-out, complete identity graph, legal status, or consent validity.",
      "Manual review is needed to confirm purpose, necessity, consent state, identifier linkage, security context, and downstream use."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeCookieDisclosureGap = {
  finding_id: "cookie_disclosure_gap",
  finding_label: "Cookie disclosure gap",
  category: "Disclosure gaps",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "correlated_observation",
  observed:
    "Retained runtime cookie/storage evidence showed an observed vendor or domain that was not clearly reflected in retained cookie, CMP, or disclosure evidence.",
  evidence: {
    summary:
      "Runtime cookie/storage vendors or domains observed during the scan were not clearly reflected in retained cookie, CMP, or privacy disclosure evidence.",
    runtimeVendorDisclosure: {
      subtype: "runtime_vendor_not_disclosed",
      observedRuntimeVendors: ["Example Ads"],
      observedRuntimeDomains: ["ads.example"],
      unmatchedRuntimeVendors: ["Example Ads"],
      unmatchedRuntimeDomains: ["ads.example"],
      policySurfacesSearched: [
        {
          type: "cookie_policy",
          url: "https://example.com/cookie-policy",
          reached: true,
          retainedEvidenceRef: "policy_enrichment_cookie_001",
          searchedTerms: ["Example Ads", "ads.example", "example_id"],
          matchedVendorNames: ["Example Analytics"],
          unmatchedVendorNames: ["Example Ads"]
        }
      ],
      cookiePolicyUrl: "https://example.com/cookie-policy",
      matchedVendorDisclosureCount: 1,
      unmatchedVendorDisclosureCount: 1,
      mismatchRationale:
        "Observed runtime cookie/storage vendor or domain did not clearly match retained cookie disclosure evidence.",
      coverageStatus: "usable",
      evidenceConfidence: "moderate",
      directVsInferred: "direct"
    },
    consentGovernanceDisclosure: {
      role: "supporting_disclosure_context",
      subtype: "consent_governance_disclosure_gap",
      relevanceTriggers: ["cmpObserved", "consentRelevantTrackingObserved"],
      missingSignals: ["withdrawalProcessNotClearlyExplained", "consentRetentionOrExpiryNotClearlyExplained"],
      reviewedSurfaces: ["cookie_policy", "footer_links"],
      evidenceLine:
        "Reviewed public privacy, cookie, or preference materials did not clearly explain how users can revisit or withdraw consent choices."
    },
    examples: [
      {
        title: "Runtime vendor disclosure alignment",
        lines: [
          "artifact=cookie_disclosure_001",
          "subtype=runtime_vendor_not_disclosed",
          "runtime_cookie_name=example_id",
          "runtime_cookie_domain=.ads.example",
          "observed_runtime_vendor=Example Ads",
          "policy_surface_type=cookie_policy",
          "policy_surface_reached=true",
          "mismatch_rationale=not clearly reflected in retained disclosure evidence",
          "supporting_consent_governance_context=preferences_and_withdrawal_process_not_clearly_explained"
        ]
      }
    ],
    automationLimits: [
      "Automated evidence does not determine legal adequacy, compliance status, provider ownership, or policy completeness.",
      "Manual review is needed to confirm purpose, vendor ownership, regional variants, disclosure scope, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativePolicyRuntimeAlignmentReview = {
  finding_id: "policy_behavior_contradiction_detected",
  finding_label: "Policy/runtime alignment review",
  category: "Consumer protection",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "correlated_observation",
  observed:
    "Retained runtime evidence showed a third-party vendor or domain that was not clearly reflected in retained public privacy or downstream-sharing disclosure evidence.",
  evidence: {
    summary:
      "Runtime third-party vendors or domains observed during the scan were not clearly reflected in retained public disclosure evidence.",
    runtimeVendorDisclosure: {
      subtype: "runtime_vendor_not_disclosed",
      observedRuntimeVendors: ["Example Ads"],
      observedRuntimeDomains: ["ads.example"],
      unmatchedRuntimeVendors: ["Example Ads"],
      unmatchedRuntimeDomains: ["ads.example"],
      policySurfacesSearched: [
        {
          type: "privacy_policy",
          url: "https://example.com/privacy",
          reached: true,
          retainedEvidenceRef: "policy_enrichment_privacy_001",
          searchedTerms: ["Example Ads", "ads.example"],
          matchedVendorNames: ["Example Analytics"],
          unmatchedVendorNames: ["Example Ads"]
        }
      ],
      privacyPolicyUrl: "https://example.com/privacy",
      matchedVendorDisclosureCount: 1,
      unmatchedVendorDisclosureCount: 1,
      mismatchRationale:
        "Observed runtime vendor/domain did not clearly match retained privacy or downstream-sharing disclosure evidence.",
      coverageStatus: "usable",
      evidenceConfidence: "moderate",
      directVsInferred: "direct"
    },
    strongerFindingHandling: {
      sameVendorOrDomainStrongerFinding: "rtb_cookie_sync_observed",
      topCardBehavior: "demote_runtime_vendor_not_disclosed_to_supporting_detail",
      supportingDetailPreserved: true
    },
    automationLimits: [
      "Automated evidence is a disclosure-alignment review signal, not a legal conclusion or compliance determination.",
      "Manual review is needed to confirm disclosure scope, provider ownership, applicability, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const illustrativeCpraPrivacyChoiceOptOut = {
  finding_id: "cpra_cba_opt_out_missing",
  finding_label: "CPRA / privacy choice opt-out review signal",
  category: "Disclosure gaps",
  criticality: "high",
  evidenceConfidence: "review_signal",
  directVsInferred: "absence_observation",
  observed:
    "Retained public-surface and runtime evidence showed advertising, cross-context behavioral advertising, or sale/share-related review signals without a clearly observed California privacy choice, Do Not Sell or Share, opt-out, or comparable privacy-choice path in the observed scan scope.",
  evidence: {
    summary:
      "Retained public-surface and runtime evidence showed advertising, cross-context behavioral advertising, or sale/share-related review signals without a clearly observed California privacy choice, Do Not Sell or Share, opt-out, or comparable privacy-choice path in the observed scan scope.",
    examples: [
      {
        title: "Privacy choice review signal",
        lines: [
          "artifact=privacy_choice_001",
          "role=finding_supporting_artifact",
          "url=https://example.com/",
          "observed_surface=footer_and_privacy_links",
          "advertising_or_cross_context_signal=true [manual_review_recommended]",
          "do_not_sell_or_share_link_observed=false",
          "state_privacy_choice_link_observed=false",
          "privacy_policy_url=https://example.com/privacy",
          "gpc_specific_request_state=not_sent_or_not_retained",
          "gpc_handling=not_determined",
          "review_caveat=manual review should confirm CPRA applicability, sale/share or cross-context behavioral advertising status, opt-out path availability, GPC-specific scan state, exemptions, and regional configuration"
        ]
      }
    ],
    automationLimits: [
      "Automated public-surface evidence does not determine CPRA applicability, sale/share status, cross-context behavioral advertising status, GPC handling, opt-out sufficiency, legal status, or compliance status. GPC handling is not determined unless a GPC-specific request state was sent and retained.",
      "Manual review is needed to confirm organization scope, privacy-choice paths, exemptions, regional configuration, and remediation quality."
    ]
  }
} satisfies Record<string, unknown>;

const PRE_CONSENT_TRACKING_SAMPLE: SampleFindingJson = {
  findingId: "pre_consent_tracking_detected",
  label: "Third-party tracking observed before recorded consent",
  sourceLabel: "Illustrative public evidence sample",
  payload: preConsentTrackingDetected
};

const THIRD_PARTY_COOKIE_SAMPLE: SampleFindingJson = {
  findingId: "third_party_cookie_pre_consent",
  label: "Third-party cookie or storage observed before consent",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeThirdPartyCookiePreConsent
};

const COOKIE_DISCLOSURE_GAP_SAMPLE: SampleFindingJson = {
  findingId: "cookie_disclosure_gap",
  label: "Cookie disclosure gap",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeCookieDisclosureGap
};

const LONG_LIVED_COOKIE_RETENTION_SAMPLE: SampleFindingJson = {
  findingId: "long_lived_cookie_retention_review",
  label: "Long-lived cookie retention review",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeLongLivedCookieRetentionReview
};

const REJECT_TRACKING_SAMPLE: SampleFindingJson = {
  findingId: "reject_tracking_persists_after_reject",
  label: "Non-essential tracking continued after reject",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeRejectTrackingPersistsAfterReject
};

const RTB_COOKIE_SYNC_SAMPLE: SampleFindingJson = {
  findingId: "rtb_cookie_sync_observed",
  label: "Adtech identity sync-like request observed",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeRtbCookieSyncObserved
};

const CROSS_DOMAIN_IDENTIFIER_SAMPLE: SampleFindingJson = {
  findingId: "cross_domain_identifier_sharing_observed",
  label: "Identifier-like values observed across domains",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeCrossDomainIdentifierSharingObserved
};

const SESSION_REPLAY_SAMPLE: SampleFindingJson = {
  findingId: "session_recording_services_detected",
  label: "Session replay service signal observed",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeSessionRecordingServicesDetected
};

const POSSIBLE_SESSION_REPLAY_SENSITIVE_SURFACE_SAMPLE: SampleFindingJson = {
  findingId: "possible_session_replay_on_sensitive_input_surface",
  label: "Possible session replay near sensitive input surface",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativePossibleSessionReplaySensitiveSurface
};

const SESSION_REPLAY_WITH_SENSITIVE_SURFACES_SAMPLE: SampleFindingJson = {
  findingId: "session_replay_present_with_sensitive_surfaces_observed",
  label: "Session replay observed with sensitive input surfaces",
  sourceLabel: "Illustrative public evidence sample",
  payload: {
    ...illustrativePossibleSessionReplaySensitiveSurface,
    finding_id: "session_replay_present_with_sensitive_surfaces_observed",
    finding_label: "Session replay observed with sensitive input surfaces",
    label: "Session replay observed with sensitive input surfaces",
    title: "Session replay observed with sensitive input surfaces",
    criticality: "high",
    observed:
      "Retained runtime and page-surface evidence showed session-replay-related signals and sensitive input surfaces in the same observed scan scope, without retained same-page or same-flow replay linkage.",
    top_finding_calibration: SAMPLE_TOP_FINDING_CALIBRATION.session_replay_present_with_sensitive_surfaces_observed,
    summary:
      "Replay runtime evidence and sensitive-surface evidence were observed in the same scan. This sample does not claim field-value transmission or same-flow replay linkage."
  }
};

const SENSITIVE_TRACKING_SURFACE_SAMPLE: SampleFindingJson = {
  findingId: "sensitive_data_collection_with_third_party_tracking_present",
  label: "Sensitive input surface with third-party tracking context",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeSensitiveTrackingSurface
};

const POLICY_RUNTIME_ALIGNMENT_SAMPLE: SampleFindingJson = {
  findingId: "policy_behavior_contradiction_detected",
  label: "Policy/runtime alignment review",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativePolicyRuntimeAlignmentReview
};

const ACCESSIBILITY_SAMPLE: SampleFindingJson = {
  findingId: "accessibility_risk_score",
  label: "Representative accessibility barriers detected",
  sourceLabel: "Production finding corpus, 2026-04-29",
  payload: accessibilityRiskScore
};

const COOKIE_BANNER_SAMPLE: SampleFindingJson = {
  findingId: "cookie_banner_control_gap",
  label: "Cookie banner lacks an obvious reject control",
  sourceLabel: "Production scan corpus",
  payload: cookieBannerRequirements
};

const PRIVACY_POLICY_SAMPLE: SampleFindingJson = {
  findingId: "privacy_policy_thin_coverage",
  label: "Privacy policy topic coverage appears limited",
  sourceLabel: "Production scan corpus",
  payload: privacyPolicySignals
};

const DISCLOSURE_SAMPLE: SampleFindingJson = {
  findingId: "endorsement_disclosure_gap",
  label: "Endorsement-style content lacks obvious disclosure language",
  sourceLabel: "Production scan corpus",
  payload: disclosureSignals
};

const FINGERPRINTING_SAMPLE: SampleFindingJson = {
  findingId: "fingerprinting_or_device_signals_detected",
  label: "Fingerprinting-related device signals detected",
  sourceLabel: "Production scan corpus",
  payload: fingerprintingSignals
};

const FINGERPRINTING_RELATED_SAMPLE: SampleFindingJson = {
  findingId: "fingerprinting_related_signals_observed",
  label: "Fingerprinting-related browser/device signals observed",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeFingerprintingRelatedSignals
};

const PROBABLE_FINGERPRINTING_SAMPLE: SampleFindingJson = {
  findingId: "probable_fingerprinting",
  label: "Probable browser/device fingerprinting review signal",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeProbableFingerprinting
};

const CPRA_PRIVACY_CHOICE_SAMPLE: SampleFindingJson = {
  findingId: "cpra_cba_opt_out_missing",
  label: "CPRA / privacy choice opt-out review signal",
  sourceLabel: "Illustrative public evidence sample",
  payload: illustrativeCpraPrivacyChoiceOptOut
};

const WEBSITE_SCAN_SAMPLE: SampleFindingJson = {
  findingId: "website_signal_review_summary",
  label: "Website scan surfaced multiple review signals",
  sourceLabel: "Production scan corpus",
  payload: websiteScanningBasics
};

const SAMPLE_FINDINGS_BY_ID: Record<string, SampleFindingJson> = {
  accessibility_risk_score: ACCESSIBILITY_SAMPLE,
  cookie_banner_control_gap: COOKIE_BANNER_SAMPLE,
  cookie_disclosure_gap: COOKIE_DISCLOSURE_GAP_SAMPLE,
  cpra_cba_opt_out_missing: CPRA_PRIVACY_CHOICE_SAMPLE,
  cross_domain_identifier_sharing_observed: CROSS_DOMAIN_IDENTIFIER_SAMPLE,
  endorsement_disclosure_gap: DISCLOSURE_SAMPLE,
  fingerprinting_or_device_signals_detected: FINGERPRINTING_SAMPLE,
  fingerprinting_related_signals_observed: FINGERPRINTING_RELATED_SAMPLE,
  long_lived_cookie_retention_review: LONG_LIVED_COOKIE_RETENTION_SAMPLE,
  possible_session_replay_on_sensitive_input_surface: POSSIBLE_SESSION_REPLAY_SENSITIVE_SURFACE_SAMPLE,
  policy_behavior_contradiction_detected: POLICY_RUNTIME_ALIGNMENT_SAMPLE,
  session_replay_present_with_sensitive_surfaces_observed: SESSION_REPLAY_WITH_SENSITIVE_SURFACES_SAMPLE,
  pre_consent_tracking_detected: PRE_CONSENT_TRACKING_SAMPLE,
  probable_fingerprinting: PROBABLE_FINGERPRINTING_SAMPLE,
  privacy_policy_thin_coverage: PRIVACY_POLICY_SAMPLE,
  reject_tracking_persists_after_reject: REJECT_TRACKING_SAMPLE,
  rtb_cookie_sync_observed: RTB_COOKIE_SYNC_SAMPLE,
  sensitive_data_collection_with_third_party_tracking_present: SENSITIVE_TRACKING_SURFACE_SAMPLE,
  session_recording_services_detected: SESSION_REPLAY_SAMPLE,
  third_party_cookie_pre_consent: THIRD_PARTY_COOKIE_SAMPLE,
  website_signal_review_summary: WEBSITE_SCAN_SAMPLE
};

export function getSampleFindingById(findingId: string): SampleFindingJson | null {
  const sample = SAMPLE_FINDINGS_BY_ID[findingId];

  return sample ? makePublicSample(sample) : null;
}

export function getGuideSampleFindings(input: { path?: string; title: string }): SampleFindingJson[] {
  const haystack = `${input.path ?? ""} ${input.title}`.toLowerCase();

  if (haystack.includes("accessibility")) {
    return [ACCESSIBILITY_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("wcag") || haystack.includes("ada")) {
    return [ACCESSIBILITY_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("session-replay") || haystack.includes("session replay")) {
    return [SESSION_REPLAY_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("fingerprinting") || haystack.includes("device signal")) {
    return [FINGERPRINTING_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("disclosure") || haystack.includes("endorsement")) {
    return [DISCLOSURE_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("privacy-policy") || haystack.includes("privacy policy") || haystack.includes("policy signal")) {
    return [PRIVACY_POLICY_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("rtb") || haystack.includes("cookie syncing")) {
    return [RTB_COOKIE_SYNC_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("cookie-banner") || haystack.includes("cookie banner")) {
    return [COOKIE_BANNER_SAMPLE, THIRD_PARTY_COOKIE_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("third-party-cookie") || haystack.includes("third-party cookie") || haystack.includes("cookie checker")) {
    return [THIRD_PARTY_COOKIE_SAMPLE, PRE_CONSENT_TRACKING_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("consent") || haystack.includes("cmp") || haystack.includes("tracking before")) {
    return [PRE_CONSENT_TRACKING_SAMPLE, REJECT_TRACKING_SAMPLE, THIRD_PARTY_COOKIE_SAMPLE].map(makePublicSample);
  }

  if (haystack.includes("website-scanning") || haystack.includes("website scanning") || haystack.includes("website signal")) {
    return [WEBSITE_SCAN_SAMPLE, ACCESSIBILITY_SAMPLE, PRIVACY_POLICY_SAMPLE].map(makePublicSample);
  }

  return [WEBSITE_SCAN_SAMPLE].map(makePublicSample);
}
