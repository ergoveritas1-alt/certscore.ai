import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";

export type GdprEprivacyCoverageOutcomeStatus =
  | "Observed"
  | "Not observed"
  | "Not testable"
  | "Insufficient evidence";

export type GdprEprivacyCoverageOutcome = {
  evidenceRefs: string[];
  limitation: string;
  rowId: string;
  status: GdprEprivacyCoverageOutcomeStatus;
};

export type GdprEprivacyCoveragePolicyEvent = {
  eventType: string;
  metadataJson: unknown;
};

export type GdprEprivacyCoveragePolicyInput = {
  coverageLimited: boolean;
  events?: GdprEprivacyCoveragePolicyEvent[];
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

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
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

const CONSENT_PREFERENCE_CONTROL_PATTERN =
  /\b(?:ad\s+choices|cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|privacy\s+(?:settings|choices|preferences|rights)|manage\s+(?:consent|choices|cookies|preferences|settings)|consent\s+preferences?|preference\s+center|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|your\s+privacy\s+choices|your\s+privacy\s+rights|opt[-\s]?out(?:\s+of\s+targeted\s+advertising)?|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i;

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

function makeOutcome(
  rowId: string,
  status: GdprEprivacyCoverageOutcomeStatus,
  limitation: string,
  evidenceRefs: string[] = []
): GdprEprivacyCoverageOutcome {
  return {
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

function deriveConsentSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const firstLayerConsentChoices = getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const visibleChoiceLabels = getStringArray(firstLayerConsentChoices, ["visibleChoiceLabels", "visible_choice_labels"]);
  const layerInspected = getString(consentUiPathEvidence, ["layerInspected", "layer_inspected"]);
  const consentSurfaceObserved =
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true ||
    getBoolean(firstLayerConsentChoices, ["capturedBeforeInteraction", "captured_before_interaction"]) === true ||
    visibleChoiceLabels.length > 0 ||
    (layerInspected !== null && layerInspected !== "none" && layerInspected !== "unknown");

  if (consentSurfaceObserved) {
    return makeOutcome(
      "consent_surface_observed",
      "Observed",
      "A consent surface or first-layer consent controls were retained in the tested context.",
      [
        "Evidence: retained consent surface observation",
        ...visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 3),
        layerInspected ? `Layer inspected: ${layerInspected}` : null
      ].filter((value): value is string => Boolean(value))
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
      ["Evidence: retained consent surface observation"]
    );
  }

  return null;
}

function derivePreConsentCookieStorageOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const storageSummary = getHybridStorageSummary(input.runtimeArtifacts);
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
      "Insufficient evidence",
      "Cookie/storage inventory retained before-consent observations, but no eligible unified cookie/storage finding was projected for this row.",
      [
        `Observed before-consent cookie/storage count: ${cookiesBeforeConsentCount}`,
        "Evidence: hybrid runtime storage summary"
      ]
    );
  }

  if (cookiesSeenCount !== null || hasRuntimeCapture(input)) {
    return makeOutcome(
      "pre_consent_cookies_storage",
      "Not observed",
      "Cookie/storage inventory was retained for the tested context, and no eligible pre-consent cookie/storage finding was projected.",
      ["Evidence: hybrid runtime storage summary"]
    );
  }

  return null;
}

function deriveRejectPathOutcome(input: GdprEprivacyCoveragePolicyInput) {
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
    rejectAvailability === "available" ||
    rejectAvailability === "reject_available_first_layer";

  if (rejectPathAvailable) {
    const evidenceRefs = [
      "Evidence: reject path depth and availability",
      getString(rejectPath, ["layerInspected", "layer_inspected"])
        ? `Layer inspected: ${getString(rejectPath, ["layerInspected", "layer_inspected"])}`
        : null,
      getNumber(rejectPath, ["rejectClickDepth", "reject_click_depth", "observedRejectPathDepth", "observed_reject_path_depth"]) !== null
        ? `Reject click depth: ${getNumber(rejectPath, ["rejectClickDepth", "reject_click_depth", "observedRejectPathDepth", "observed_reject_path_depth"])}`
        : null,
      ...getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"])
        .filter((label) => /\b(?:decline|reject|refuse|deny|opt[-\s]?out)\b/i.test(label))
        .map((label) => `Visible choice: ${label}`)
    ].filter((value): value is string => Boolean(value));

    return makeOutcome(
      "reject_all_path_availability",
      "Observed",
      "A reject or equivalent refusal path was retained in the tested consent surface.",
      evidenceRefs
    );
  }

  if (
    attempted &&
    (rejectButtonCount === 0 || skipNegativeReasons.includes("complete_reject_choice_controls_not_detected"))
  ) {
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
      ].filter((value): value is string => Boolean(value))
    );
  }

  if (attempted) {
    return makeOutcome(
      "reject_all_path_availability",
      "Not observed",
      "Consent audit ran for the tested context, and no eligible reject-path availability finding was projected.",
      ["Evidence: consent audit attempted"]
    );
  }

  return null;
}

function derivePostRejectOutcome(input: GdprEprivacyCoveragePolicyInput) {
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

  if (reductionStatus === "not_testable") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not testable",
      "Reject-path audit did not retain a confirmed reject action, so post-reject tracking reduction could not be evaluated.",
      reductionEvidenceRefs
    );
  }

  if (reductionStatus === "insufficient_evidence") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Insufficient evidence",
      "A reject action was retained, but the post-reject comparison window or request evidence was incomplete.",
      reductionEvidenceRefs
    );
  }

  if (reductionStatus === "reduced" || reductionStatus === "no_post_reject_non_essential_observed") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action and post-reject comparison evidence were retained, and no eligible post-reject tracking persistence finding was projected.",
      reductionEvidenceRefs
    );
  }

  if (reductionStatus === "not_reduced") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Insufficient evidence",
      "Post-reject persistence evidence was retained, but no eligible unified post-reject tracking finding was projected for this row.",
      reductionEvidenceRefs
    );
  }

  if (attempted && !rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not testable",
      "Reject-path audit ran, but no reject action was confirmed, so post-reject tracking reduction cannot be evaluated for this scan.",
      [
        "Evidence: reject persistence diagnostic",
        ...getStringArray(rejectDiagnostic, ["negativeReasonCodes"])
      ]
    );
  }

  if (rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action was retained, and no eligible post-reject tracking persistence finding was projected.",
      ["Evidence: reject interaction retained"]
    );
  }

  return null;
}

function derivePreferenceWithdrawalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  if (!lifecycle) {
    return null;
  }

  const coverageStatus = getString(lifecycle, ["coverageStatus", "coverage_status"]);
  const observedControlLabels = getObservedPreferenceControlLabels(lifecycle).slice(0, 3);
  const explicitControlObserved =
    getBoolean(lifecycle, ["privacySettingsControlObserved", "privacy_settings_control_observed"]) === true ||
    getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
    getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
    getBoolean(lifecycle, ["footerPreferenceLinkObserved", "footer_preference_link_observed"]) === true;
  const controlObserved =
    explicitControlObserved ||
    (
      getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true &&
      observedControlLabels.length > 0
    ) ||
    (
      getBoolean(lifecycle, [
        "preferenceCenterReachableAfterInitialLayer",
        "preference_center_reachable_after_initial_layer"
      ]) === true &&
      observedControlLabels.length > 0
    ) ||
    observedControlLabels.length > 0;
  const evidenceRefs = [
    "Evidence: consent control lifecycle",
    ...getStringArray(lifecycle, ["evidenceRefs", "evidence_refs"]),
    ...observedControlLabels.map((label) => `Observed control: ${label}`)
  ];

  if (controlObserved) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Observed",
      "A cookie preferences, privacy settings, CMP reopen, or consent-withdrawal control was retained in lifecycle evidence.",
      evidenceRefs
    );
  }

  if (coverageStatus === "usable") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Not observed",
      "Consent-control lifecycle evidence was retained, and no reopen or withdrawal control was observed in the tested context.",
      evidenceRefs
    );
  }

  if (coverageStatus === "partial") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Insufficient evidence",
      "Consent-control lifecycle evidence was retained, but coverage was partial, so absence of a reopen or withdrawal control is not treated as complete.",
      evidenceRefs
    );
  }

  return makeOutcome(
    "preference_withdrawal_control",
    "Not testable",
    "Consent-control lifecycle evidence was missing or insufficient for the tested context.",
    evidenceRefs
  );
}

function deriveVendorDisclosureOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const trackerVendorCount = getNumber(input.snapshot, ["tracker_vendor_count", "tracker_count_total"]) ??
    getStringArray(input.runtimeArtifacts, ["preconsent_tracker_vendors", "tracker_vendors"]).length;
  const hasPolicySurface =
    getBoolean(input.snapshot, ["privacy_policy_present"]) === true ||
    getBoolean(input.snapshot, ["cookie_policy_present"]) === true;
  const disclosureEvidence = getRuntimeVendorDisclosureEvidence(input.runtimeArtifacts);
  const unmatchedCount = disclosureEvidence.reduce(
    (sum, row) => sum + Math.max(row.unmatchedRuntimeVendors.length, row.unmatchedRuntimeDomains.length),
    0
  );

  if (trackerVendorCount > 0 && !hasPolicySurface) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      "Not testable",
      "Runtime vendors were observed, but no privacy or cookie policy surface was retained, so disclosure alignment cannot be evaluated.",
      [`Runtime vendor count: ${trackerVendorCount}`]
    );
  }

  if (trackerVendorCount > 0 && hasPolicySurface && disclosureEvidence.length === 0) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      "Insufficient evidence",
      "Runtime vendors and policy surfaces were retained, but no canonical vendor-disclosure comparison artifact was retained for this scan.",
      [`Runtime vendor count: ${trackerVendorCount}`]
    );
  }

  if (trackerVendorCount > 0 && hasPolicySurface) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      unmatchedCount > 0 ? "Insufficient evidence" : "Not observed",
      unmatchedCount > 0
        ? "Runtime vendor disclosure comparison evidence was retained, but no eligible disclosure-alignment finding was projected."
        : "Runtime vendor disclosure comparison evidence was retained, and no eligible disclosure-alignment finding was projected.",
      [
        `Runtime vendor count: ${trackerVendorCount}`,
        `Disclosure comparison rows: ${disclosureEvidence.length}`,
        unmatchedCount > 0 ? `Unmatched runtime vendor/domain count: ${unmatchedCount}` : null
      ].filter((value): value is string => Boolean(value))
    );
  }

  return null;
}

function deriveSensitiveSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const correlation = getEventMetadata(input.events, "sensitive_third_party_tracking_correlation");
  const status = getString(correlation, ["status"]);
  const eligibleSensitiveFieldCount = getNumber(correlation, ["eligibleSensitiveFieldCount"]);
  const rawSensitiveFieldCount = getNumber(correlation, ["rawSensitiveFieldCount"]);

  if (status === "ok") {
    const count = eligibleSensitiveFieldCount ?? rawSensitiveFieldCount ?? 0;
    if (count <= 0) {
      return makeOutcome(
        "sensitive_surfaces_third_party_tracking",
        "Not observed",
        "Sensitive-field correlation completed for the tested context and did not retain eligible sensitive fields alongside third-party tracking.",
        ["Evidence: sensitive third-party tracking correlation completed"]
      );
    }

    return makeOutcome(
      "sensitive_surfaces_third_party_tracking",
      "Insufficient evidence",
      "Sensitive-field correlation retained candidate fields, but no eligible sensitive-surface tracking unified finding was projected.",
      [`Eligible sensitive fields: ${count}`]
    );
  }

  return null;
}

function deriveSessionReplayFingerprintingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayCount =
    getNumber(input.snapshot, ["session_replay_tracker_count"]) ??
    getNumber(input.snapshot, ["session_replay_count"]);
  const sessionReplayObserved =
    getBoolean(input.snapshot, ["session_replay_tool_detected", "session_replay_detected"]) === true ||
    (sessionReplayCount !== null && sessionReplayCount > 0);
  const fingerprintingObserved =
    getBoolean(input.snapshot, ["fingerprinting_or_identity_vendor_detected", "fingerprinting_detected"]) === true;

  if (sessionReplayObserved || fingerprintingObserved) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Insufficient evidence",
      "Replay or fingerprinting-like runtime evidence was retained, but no eligible replay/fingerprinting unified finding was projected.",
      [
        sessionReplayObserved ? "Session replay signal observed" : null,
        fingerprintingObserved ? "Fingerprinting or identity vendor signal observed" : null
      ].filter((value): value is string => Boolean(value))
    );
  }

  if (hasRuntimeCapture(input) || sessionReplayCount !== null) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Not observed",
      "Runtime vendor/fingerprinting checks completed for the tested context, and no eligible replay or fingerprinting finding was projected.",
      ["Evidence: runtime capture completed"]
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
      "Not observed",
      "Endpoint jurisdiction evidence was retained, and no eligible cross-border endpoint finding was projected.",
      [
        `Endpoint jurisdiction rows: ${endpointJurisdictionRows.length}`,
        transferReviewRows > 0 ? `Transfer review signal rows: ${transferReviewRows}` : null
      ].filter((value): value is string => Boolean(value))
    );
  }

  if (thirdPartyDomainCount !== null && thirdPartyDomainCount > 0) {
    return makeOutcome(
      "cross_border_endpoint_review",
      "Not testable",
      "Third-party endpoint inventory was retained, but endpoint jurisdiction or transfer-region evidence was not retained for this scan.",
      [`Third-party endpoint domains observed: ${thirdPartyDomainCount}`]
    );
  }

  return null;
}

export function deriveGdprEprivacyCoveragePolicyOutcomes(input: GdprEprivacyCoveragePolicyInput) {
  const outcomes = [
    deriveConsentSurfaceOutcome(input),
    derivePreConsentCookieStorageOutcome(input),
    deriveRejectPathOutcome(input),
    derivePostRejectOutcome(input),
    derivePreferenceWithdrawalOutcome(input),
    deriveVendorDisclosureOutcome(input),
    deriveSensitiveSurfaceOutcome(input),
    deriveSessionReplayFingerprintingOutcome(input),
    deriveCrossBorderOutcome(input)
  ];

  return Object.fromEntries(
    outcomes
      .filter((outcome): outcome is GdprEprivacyCoverageOutcome => Boolean(outcome))
      .map((outcome) => [outcome.rowId, outcome])
  );
}
