import type { CertScoreFinding, CertScoreFindingDirectness } from "./finding-registry";

export type RuntimeTopFindingEligibility =
  | "top_candidate"
  | "high_confidence"
  | "surface_only"
  | "audit_only"
  | "suppress";

export type RuntimeEvidenceConfidence = "strong" | "good" | "review_signal";

export type TopFindingEligibilityDecision = {
  eligibility: RuntimeTopFindingEligibility;
  matchedCriteria: string[];
  missingCorroborators: string[];
  demotionReasons: string[];
  evidenceConfidence: RuntimeEvidenceConfidence;
  directVsInferred: CertScoreFindingDirectness;
};

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  }
  return true;
}

function getEvidenceConfidence(finding: CertScoreFinding): RuntimeEvidenceConfidence {
  if (finding.confidence === "strong") {
    return "strong";
  }
  if (finding.confidence === "good") {
    return "good";
  }
  return "review_signal";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.reduce<Array<Record<string, unknown>>>((rows, row) => {
        const record = asRecord(row);
        return record ? [...rows, record] : rows;
      }, [])
    : [];
}

function getBoolean(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "boolean" ? record[key] : null;
}

function getNumber(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "number" && Number.isFinite(record[key]) ? record[key] : null;
}

function getString(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "string" && record[key].trim().length > 0 ? record[key] : null;
}

function getStringFromKeys(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getString(record, key);
    if (value) {
      return value;
    }
  }
  return null;
}

function getNumberFromKeys(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getNumber(record, key);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function hasBooleanKey(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return keys.some((key) => typeof record?.[key] === "boolean");
}

function hasConcreteAxeNodeEvidence(row: Record<string, unknown>) {
  const nodes = [
    ...asRows(row.representativeNodes),
    ...asRows(row.representative_nodes)
  ];
  return nodes.some((node) => {
    const selectors = [
      ...asRows(node.selectors).flatMap((selectorRow) => Object.values(selectorRow).filter((value): value is string => typeof value === "string")),
      ...(Array.isArray(node.selectors) ? node.selectors.filter((value): value is string => typeof value === "string") : []),
      getString(node, "selector")
    ].filter((value): value is string => Boolean(value));
    const htmlSnippet =
      getStringFromKeys(node, ["htmlSnippet", "html_snippet", "sanitizedHtmlSnippet", "sanitized_html_snippet"]);
    const failureSummary = getStringFromKeys(node, ["failureSummary", "failure_summary"]);
    return selectors.length > 0 && Boolean(htmlSnippet && failureSummary);
  });
}

function hasPromotionGradeKeyboardAxeEvidence(accessibilityEvidence: Record<string, unknown> | null | undefined) {
  const axeRows = [
    ...asRows(accessibilityEvidence?.axeEvidence),
    ...asRows(accessibilityEvidence?.accessibilityAxeEvidence)
  ];
  if (axeRows.some(hasConcreteAxeNodeEvidence)) {
    return true;
  }

  const exampleRows = [
    ...asRows(accessibilityEvidence?.ruleExamples),
    ...asRows(accessibilityEvidence?.accessibilityRuleExamples)
  ];
  return exampleRows.some(hasConcreteAxeNodeEvidence);
}

function isSemanticLabelingRuleId(ruleId: string | null) {
  return Boolean(
    ruleId &&
      /^(?:aria-command-name|aria-input-field-name|aria-toggle-field-name|aria-tooltip-name|aria-treeitem-name|button-name|input-button-name|label|link-name|select-name)$/i.test(
        ruleId
      )
  );
}

function hasPromotionGradeSemanticAxeEvidence(accessibilityEvidence: Record<string, unknown> | null | undefined) {
  const axeRows = [
    ...asRows(accessibilityEvidence?.axeEvidence),
    ...asRows(accessibilityEvidence?.accessibilityAxeEvidence)
  ];
  if (
    axeRows.some((row) => {
      const ruleId = getStringFromKeys(row, ["ruleId", "rule_id", "ruleCode", "rule_code"]);
      return isSemanticLabelingRuleId(ruleId) && hasConcreteAxeNodeEvidence(row);
    })
  ) {
    return true;
  }

  const exampleRows = [
    ...asRows(accessibilityEvidence?.ruleExamples),
    ...asRows(accessibilityEvidence?.accessibilityRuleExamples)
  ];
  return exampleRows.some((row) => {
    const ruleId = getStringFromKeys(row, ["ruleId", "rule_id", "ruleCode", "rule_code"]);
    return isSemanticLabelingRuleId(ruleId) && hasConcreteAxeNodeEvidence(row);
  });
}

function includesAny(values: unknown, pattern: RegExp) {
  if (Array.isArray(values)) {
    return values.some((value) => typeof value === "string" && pattern.test(value));
  }
  return typeof values === "string" && pattern.test(values);
}

function isCredibleRejectLabel(label: string | null) {
  if (!label) {
    return false;
  }
  if (/stream|subscribe|sign\s*in|log\s*in|continue|accept|agree|allow/i.test(label)) {
    return false;
  }
  if (label.length > 50 && !/cookie|privacy|consent|preference|choice|optional|necessary|essential/i.test(label)) {
    return false;
  }
  return /reject|decline\s+(?:all|optional|non[-\s]?essential|cookies)|deny|refuse|opt\s*out|save\s+settings|confirm\s+choices|manage\s+preferences|necessary only|essential only|only necessary/i.test(label);
}

function isGenericPreferenceSaveLabel(label: string | null) {
  return Boolean(label && /^(save\s+settings|save\s+preferences|confirm\s+choices|submit\s+preferences)$/i.test(label.trim()));
}

function hasRejectPreferenceStateEvidence(...records: Array<Record<string, unknown> | null | undefined>) {
  return records.some((record) => {
    if (!record) {
      return false;
    }
    if (
      [
        "advertisingDisabled",
        "advertising_disabled",
        "analyticsDisabled",
        "analytics_disabled",
        "marketingDisabled",
        "marketing_disabled",
        "nonEssentialCategoriesDisabled",
        "non_essential_categories_disabled",
        "optionalCategoriesDisabled",
        "optional_categories_disabled",
        "preferenceStateChanged",
        "preference_state_changed",
        "rejectPreferenceStateObserved",
        "reject_preference_state_observed"
      ].some((key) => record[key] === true)
    ) {
      return true;
    }

    const rows = [
      ...asRows(record.categoryStates),
      ...asRows(record.category_states),
      ...asRows(record.preferenceCategoryStates),
      ...asRows(record.preference_category_states),
      ...asRows(record.preferenceStateEvidence),
      ...asRows(record.preference_state_evidence)
    ];
    return rows.some((row) => {
      const category = getStringFromKeys(row, ["category", "purpose", "name", "label"]) ?? "";
      const enabled = getBoolean(row, "enabled");
      const active = getBoolean(row, "active");
      const checked = getBoolean(row, "checked");
      const selected = getBoolean(row, "selected");
      const state = getStringFromKeys(row, ["state", "value", "choice", "action"]) ?? "";
      return (
        /advertising|ads|analytics|marketing|target|sale|sharing|non[-\s]?essential|optional/i.test(category) &&
        (enabled === false ||
          active === false ||
          checked === false ||
          selected === false ||
          /off|disabled|rejected|denied|opt(?:ed)?[-\s]?out|essential_only/i.test(state))
      );
    });
  });
}

function hasCredibleRejectInteraction(details: Record<string, unknown>) {
  const consentInteraction = asRecord(details.consentInteraction);
  const rejectInteraction = asRecord(details.rejectInteraction);
  const attribution = asRecord(details.rejectInteractionAttribution);
  const source = attribution ?? consentInteraction ?? rejectInteraction;
  const actionType = getStringFromKeys(source, ["action_type", "actionType", "consentActionType"]);
  const label = getStringFromKeys(source, ["clicked_label", "clickedLabel", "clickedText", "controlText", "control_text", "text", "visibleText"]);
  if (getBoolean(source, "finalUrlHostChanged") === true || getBoolean(source, "final_url_host_changed") === true) {
    return false;
  }
  if (label) {
    return isGenericPreferenceSaveLabel(label)
      ? hasRejectPreferenceStateEvidence(source, attribution, consentInteraction, rejectInteraction, details)
      : isCredibleRejectLabel(label);
  }
  const controlRole = getStringFromKeys(source, ["controlRole", "control_role"]);
  const controlSource = getStringFromKeys(source, ["controlSource", "control_source"]);
  const consentSurfaceDetected =
    getBoolean(source, "consentSurfaceDetected") === true ||
    getBoolean(source, "consent_surface_detected") === true ||
    /cmp_|consent|cookie|privacy/i.test(controlSource ?? "");
  if (consentSurfaceDetected && /^(reject|toggle|save)$/i.test(controlRole ?? "")) {
    return true;
  }
  return /^(reject_all|opt_out|essential_only|save_preferences)$/i.test(actionType ?? "");
}

function hasConsentChoicePathEvidence(runtimePath: Record<string, unknown> | null) {
  const acceptDepth = getNumberFromKeys(runtimePath, ["observedAcceptPathDepth", "acceptClickDepth", "accept_click_depth"]);
  const rejectDepth = getNumberFromKeys(runtimePath, ["observedRejectPathDepth", "rejectClickDepth", "reject_click_depth"]);
  const preferenceLayers = getNumberFromKeys(runtimePath, ["observedPreferenceLayerCount", "preferenceLayerCount", "preference_layer_count"]);
  const visualHierarchyScore = getNumberFromKeys(runtimePath, ["visualHierarchyScore", "visual_hierarchy_score"]);
  const availability = getStringFromKeys(runtimePath, ["availability", "rejectAvailability", "reject_availability", "status", "outcome"]);
  const hasRejectAvailabilityFact = hasBooleanKey(runtimePath, [
    "rejectAvailableOnFirstLayer",
    "reject_available_on_first_layer",
    "preferencesRequiredBeforeReject",
    "preferences_required_before_reject"
  ]);
  const hasChoiceAsymmetry = getStringFromKeys(runtimePath, ["choiceAsymmetry", "choice_asymmetry"]) !== null;
  return (
    acceptDepth !== null ||
    rejectDepth !== null ||
    preferenceLayers !== null ||
    (visualHierarchyScore !== null && visualHierarchyScore > 0) ||
    hasRejectAvailabilityFact ||
    hasChoiceAsymmetry ||
    Boolean(availability && ["available", "hidden", "not_found", "unavailable", "failed", "untested"].includes(availability))
  );
}

function hasSameSurfaceReplayMaskingEvidence(inputSurfaceEvidence: unknown) {
  const inputSurface = asRecord(inputSurfaceEvidence);
  const rows = asRows(inputSurface?.sensitivePayloadViolations);
  return rows.some((row) => {
    const linkage = asRecord(row.sameFlowLinkage);
    const masking = asRecord(linkage?.replayMaskingEvidence);
    return getBoolean(masking, "maskingOrExclusionObserved") === true;
  });
}

function hasSamePageOrFlowReplayLinkage(inputSurfaceEvidence: unknown) {
  const inputSurface = asRecord(inputSurfaceEvidence);
  const rows = [
    ...asRows(inputSurface?.sensitivePayloadViolations),
    ...asRows(inputSurface?.sensitiveSessionReplayCooccurrenceEvidence)
  ];
  return rows.some((row) => {
    const linkage = asRecord(row.sameFlowLinkage) ?? asRecord(row.same_flow_linkage);
    return (
      getBoolean(row, "samePage") === true ||
      getBoolean(row, "same_page") === true ||
      getBoolean(row, "sameFlow") === true ||
      getBoolean(row, "same_flow") === true ||
      getBoolean(linkage, "samePageOrFlow") === true ||
      getBoolean(linkage, "same_page_or_flow") === true
    );
  });
}

function hasExplicitReplayMaskingState(details: Record<string, unknown>) {
  const sessionReplayEvidence = asRecord(details.sessionReplayEvidence);
  const replaySummary = asRecord(sessionReplayEvidence?.runtimeSummary);
  if (typeof replaySummary?.maskingOrExclusionObserved === "boolean" || replaySummary?.maskingOrExclusionObserved === null) {
    return true;
  }
  if (typeof replaySummary?.masking_or_exclusion_observed === "boolean" || replaySummary?.masking_or_exclusion_observed === null) {
    return true;
  }

  const inputSurface = asRecord(details.inputSurfaceEvidence);
  const rows = [
    ...asRows(inputSurface?.sensitivePayloadViolations),
    ...asRows(inputSurface?.sensitiveSessionReplayCooccurrenceEvidence)
  ];
  return rows.some((row) => {
    const linkage = asRecord(row.sameFlowLinkage) ?? asRecord(row.same_flow_linkage);
    const masking = asRecord(linkage?.replayMaskingEvidence) ?? asRecord(linkage?.replay_masking_evidence);
    return (
      typeof row.maskingOrExclusionObserved === "boolean" ||
      typeof row.masking_or_exclusion_observed === "boolean" ||
      typeof masking?.maskingOrExclusionObserved === "boolean" ||
      typeof masking?.masking_or_exclusion_observed === "boolean"
    );
  });
}

const REJECT_TRACKING_CONFIRMATION_MIN_MS = 250;

function hasPromotionGradePostRejectRequest(details: Record<string, unknown>) {
  const rows = asRows(details.postRejectNonEssentialRequests);
  return rows.some((row) => {
    const category = getString(row, "category") ?? "";
    const url = getStringFromKeys(row, ["url", "requestUrl", "request_url"]) ?? "";
    const vendor = getString(row, "vendor") ?? "";
    const msAfterReject = getNumberFromKeys(row, ["ms_after_reject", "msAfterReject"]);
    const tsMs = getNumberFromKeys(row, ["ts_ms", "tsMs"]);

    return (
      tsMs !== null &&
      msAfterReject !== null &&
      msAfterReject >= REJECT_TRACKING_CONFIRMATION_MIN_MS &&
      /^(advertising|analytics|session_replay|marketing_automation|tag_manager)$/i.test(category) &&
      vendor.trim().length > 0 &&
      /^https?:\/\//i.test(url)
    );
  });
}

function hasRuntimeRequestAnchor(details: Record<string, unknown>) {
  if (hasMeaningfulValue(details.runtimeRequestUrls)) {
    return true;
  }
  return asRows(details.representativeRequests).some((row) =>
    Boolean(getStringFromKeys(row, ["requestUrl", "request_url", "url", "href"]))
  );
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function finalize(input: {
  finding: CertScoreFinding;
  matchedCriteria: string[];
  missingCorroborators?: string[];
  demotionReasons?: string[];
  forceEligibility?: RuntimeTopFindingEligibility;
}): TopFindingEligibilityDecision {
  const missingCorroborators = input.missingCorroborators ?? [];
  const demotionReasons = input.demotionReasons ?? [];
  const hasRuntimeEvidence =
    hasMeaningfulValue(input.finding.evidenceDetails) ||
    hasMeaningfulValue(input.finding.evidencePreview) ||
    hasMeaningfulValue(input.finding.evidenceRefs);
  const eligibility =
    input.forceEligibility ??
    (!hasRuntimeEvidence
      ? "audit_only"
      : demotionReasons.length > 0
        ? "surface_only"
        : input.finding.severity === "critical" || input.finding.severity === "high"
          ? "top_candidate"
          : input.finding.confidence === "strong" || input.finding.confidence === "good"
            ? "high_confidence"
            : "surface_only");

  return {
    demotionReasons,
    directVsInferred: input.finding.directVsInferred,
    eligibility,
    evidenceConfidence: getEvidenceConfidence(input.finding),
    matchedCriteria: input.matchedCriteria,
    missingCorroborators
  };
}

export function evaluateTopFindingEligibility(finding: CertScoreFinding): TopFindingEligibilityDecision {
  const details = finding.evidenceDetails ?? {};
  const matchedCriteria: string[] = [];
  const missingCorroborators: string[] = [];
  const demotionReasons: string[] = [];
  let forceEligibility: RuntimeTopFindingEligibility | undefined;

  if (hasMeaningfulValue(details.timing) || hasMeaningfulValue(details.timingAnalysis)) {
    matchedCriteria.push("runtime_timing");
  }
  if (hasRuntimeRequestAnchor(details)) {
    matchedCriteria.push("runtime_request_anchor");
  }
  if (hasMeaningfulValue(details.consentUiEvidence) || hasMeaningfulValue(details.rejectInteraction)) {
    matchedCriteria.push("consent_ui_or_interaction_evidence");
  }
  if (hasMeaningfulValue(details.consentUiEvidence?.runtimePath)) {
    matchedCriteria.push("observed_consent_path_depth");
  }
  if (hasMeaningfulValue(details.accessibilityEvidence)) {
    matchedCriteria.push("accessibility_rule_evidence");
  }
  if (hasMeaningfulValue(details.accessibilityEvidence?.focusManagementEvidence)) {
    matchedCriteria.push("keyboard_focus_traversal_evidence");
  }
  if (hasMeaningfulValue(details.telemetryEvidence)) {
    matchedCriteria.push("telemetry_or_fingerprint_evidence");
  }
  if (hasMeaningfulValue(details.telemetryEvidence?.fingerprintClusterSummary)) {
    matchedCriteria.push("fingerprint_cluster_summary");
  }
  if (hasMeaningfulValue(details.sessionReplayEvidence?.runtimeSummary)) {
    matchedCriteria.push("session_replay_runtime_summary");
  }

  switch (finding.id) {
    case "pre_consent_tracking_detected":
      if (!hasMeaningfulValue(details.timing) && !hasMeaningfulValue(details.timingAnalysis)) {
        missingCorroborators.push("consent_timeline_sequence");
      }
      if (!hasMeaningfulValue(details.representativeRequests) && !hasMeaningfulValue(details.runtimeRequestUrls)) {
        missingCorroborators.push("classified_runtime_request_anchor");
      }
      if (
        includesAny(details.runtimeVendors, /tag manager/i) &&
        !includesAny(details.runtimeVendors, /clarity|hotjar|fullstory|bing|doubleclick|meta|facebook|ads|advert|rtb|sync/i)
      ) {
        demotionReasons.push("tag_manager_only_preconsent_context");
      }
      if (
        hasMeaningfulValue(details.identifierEvidence) ||
        includesAny(details.runtimeVendors, /clarity|hotjar|fullstory|bing|doubleclick|meta|facebook|ads|advert|rtb|sync/i)
      ) {
        pushUnique(matchedCriteria, "preconsent_adtech_replay_or_identifier_context");
      }
      break;
    case "cpra_cba_opt_out_missing":
      if (hasMeaningfulValue(details.trackingOrSharingContext)) {
        pushUnique(matchedCriteria, "cba_vendor_runtime_context");
      }
      if (!hasMeaningfulValue(details.optOutControlEvidence)) {
        missingCorroborators.push("privacy_choice_search_scope");
      }
      {
        const optOut = asRecord(details.optOutControlEvidence);
        const missingOrAbsent = getBoolean(optOut, "missingOrAbsent");
        const incompleteOrUnconfirmed = getBoolean(optOut, "incompleteOrUnconfirmed");
        const choiceControlsInspected = getBoolean(optOut, "choiceControlsInspected");
        const gpcScanStateSent = getBoolean(optOut, "gpcScanStateSent");
        const gpcHandlingObserved = getString(optOut, "gpcHandlingObserved");
        const privacyChoiceCompletenessSubtype = getString(optOut, "privacyChoiceCompletenessSubtype");
        const result = getString(optOut, "result");

        if (choiceControlsInspected === true) {
          pushUnique(matchedCriteria, "privacy_choice_control_search_scope");
        }
        if (missingOrAbsent === true || privacyChoiceCompletenessSubtype === "missing" || result === "absent") {
          pushUnique(matchedCriteria, "privacy_choice_control_missing");
        }
        if (missingOrAbsent === false || incompleteOrUnconfirmed === true) {
          pushUnique(matchedCriteria, "privacy_choice_control_observed");
        }
        if (incompleteOrUnconfirmed === true || privacyChoiceCompletenessSubtype === "incomplete_or_unconfirmed") {
          pushUnique(matchedCriteria, "cpra_completeness_not_confirmed");
          pushUnique(missingCorroborators, "cpra_icon_or_privacy_choices_presentation_confirmation");
          pushUnique(missingCorroborators, "opt_out_flow_completion_result");
          pushUnique(missingCorroborators, "vendor_suppression_after_opt_out");
        }
        if (gpcScanStateSent !== true || !gpcHandlingObserved || gpcHandlingObserved === "not_determined") {
          pushUnique(missingCorroborators, "gpc_handling_test");
        }
      }
      if (details.optOutControlEvidence?.gpcScanStateSent === true) {
        matchedCriteria.push("gpc_specific_scan_state_sent");
      }
      if (details.optOutControlEvidence?.gpcHandlingObserved && details.optOutControlEvidence.gpcHandlingObserved !== "not_determined") {
        matchedCriteria.push("gpc_handling_observed");
      }
      if (!hasMeaningfulValue(details.trackingOrSharingContext)) {
        missingCorroborators.push("advertising_or_sharing_context");
      }
      if (hasMeaningfulValue(details.optOutControlEvidence) && hasMeaningfulValue(details.trackingOrSharingContext)) {
        forceEligibility = "top_candidate";
      }
      if (
        details.optOutControlEvidence?.gpcScanStateSent === true &&
        details.optOutControlEvidence?.gpcHandlingObserved === "ignored" &&
        hasMeaningfulValue(details.trackingOrSharingContext)
      ) {
        forceEligibility = "top_candidate";
        pushUnique(matchedCriteria, "gpc_ignored_with_advertising_or_sharing_context");
      }
      break;
    case "long_lived_cookie_retention_review":
      if (hasMeaningfulValue(details.cookieEvidence?.retainedRuntimeCookies)) {
        pushUnique(matchedCriteria, "runtime_cookie_expiry_evidence");
        pushUnique(matchedCriteria, "cookie_retention_review_threshold");
      } else {
        pushUnique(missingCorroborators, "runtime_cookie_expiry_evidence");
        pushUnique(demotionReasons, "missing_cookie_duration");
        forceEligibility = "audit_only";
      }
      if (finding.confidence === "moderate" && finding.severity !== "high") {
        forceEligibility = "surface_only";
      }
      break;
    case "session_recording_services_detected":
    case "session_replay_present_with_sensitive_surfaces_observed":
    case "possible_session_replay_on_sensitive_input_surface":
      if (!hasMeaningfulValue(details.sessionReplayEvidence)) {
        missingCorroborators.push("session_replay_runtime_artifact");
      }
      {
        const replaySummary = asRecord(details.sessionReplayEvidence?.runtimeSummary);
        const collectionEndpointObserved = getBoolean(replaySummary, "collectionEndpointObserved");
        const libraryOnly = getBoolean(replaySummary, "libraryOnly");
        const maskingOrExclusionObserved = getBoolean(replaySummary, "maskingOrExclusionObserved");
        if (collectionEndpointObserved === true) {
          matchedCriteria.push("session_replay_collection_endpoint_observed");
        }
        if (maskingOrExclusionObserved === true) {
          matchedCriteria.push("session_replay_masking_or_exclusion_observed");
        }
        if (libraryOnly === true && collectionEndpointObserved !== true) {
          demotionReasons.push("session_replay_library_only_without_collection_endpoint");
        }
        if (maskingOrExclusionObserved === true) {
          demotionReasons.push("session_replay_masking_or_exclusion_observed");
        }
        if (
          finding.id === "session_recording_services_detected" &&
          collectionEndpointObserved === true &&
          maskingOrExclusionObserved !== true
        ) {
          forceEligibility = "top_candidate";
        }
      }
      if (
        finding.id === "possible_session_replay_on_sensitive_input_surface" &&
        !hasMeaningfulValue(details.inputSurfaceEvidence) &&
        !hasMeaningfulValue(details.sensitiveDataEvidence)
      ) {
        missingCorroborators.push("same_scope_sensitive_surface");
      }
      if (
        finding.id === "session_replay_present_with_sensitive_surfaces_observed" &&
        !hasMeaningfulValue(details.inputSurfaceEvidence) &&
        !hasMeaningfulValue(details.sensitiveDataEvidence) &&
        !hasMeaningfulValue(details.sensitiveFieldContexts)
      ) {
        missingCorroborators.push("scan_level_sensitive_surface");
      }
      if (finding.id === "possible_session_replay_on_sensitive_input_surface") {
        const replaySummary = asRecord(details.sessionReplayEvidence?.runtimeSummary);
        const collectionEndpointObserved = getBoolean(replaySummary, "collectionEndpointObserved");
        const maskingOrExclusionObserved = getBoolean(replaySummary, "maskingOrExclusionObserved");
        const sameSurfaceMaskingOrExclusionObserved = hasSameSurfaceReplayMaskingEvidence(details.inputSurfaceEvidence);
        const samePageOrFlowReplayLinkage = hasSamePageOrFlowReplayLinkage(details.inputSurfaceEvidence);
        const explicitMaskingState = hasExplicitReplayMaskingState(details);
        const sameScopeSensitiveEvidence =
          hasMeaningfulValue(details.inputSurfaceEvidence) ||
          hasMeaningfulValue(details.sensitiveDataEvidence) ||
          hasMeaningfulValue(details.sensitiveFieldContexts);
        if (sameScopeSensitiveEvidence) {
          pushUnique(matchedCriteria, "same_scope_sensitive_surface");
        }
        if (samePageOrFlowReplayLinkage) {
          pushUnique(matchedCriteria, "same_page_or_same_flow_replay_linkage");
        } else {
          pushUnique(missingCorroborators, "same_page_or_same_flow_replay_linkage");
          pushUnique(demotionReasons, "missing_same_page_or_same_flow_replay_linkage");
        }
        if (!explicitMaskingState) {
          pushUnique(missingCorroborators, "session_replay_masking_state");
          pushUnique(demotionReasons, "missing_session_replay_masking_state");
        }
        if (sameSurfaceMaskingOrExclusionObserved) {
          pushUnique(matchedCriteria, "same_surface_replay_masking_or_exclusion_observed");
          pushUnique(demotionReasons, "same_surface_replay_masking_or_exclusion_observed");
        }
        if (
          collectionEndpointObserved === true &&
          sameScopeSensitiveEvidence &&
          samePageOrFlowReplayLinkage &&
          explicitMaskingState &&
          maskingOrExclusionObserved !== true &&
          !sameSurfaceMaskingOrExclusionObserved
        ) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "replay_collection_endpoint_on_sensitive_surface");
        }
      }
      if (finding.id === "session_replay_present_with_sensitive_surfaces_observed") {
        const replaySummary = asRecord(details.sessionReplayEvidence?.runtimeSummary);
        const collectionEndpointObserved = getBoolean(replaySummary, "collectionEndpointObserved");
        const samePageOrFlowReplayLinkage = hasSamePageOrFlowReplayLinkage(details.inputSurfaceEvidence);
        const explicitMaskingState = hasExplicitReplayMaskingState(details);
        const scanLevelSensitiveEvidence =
          hasMeaningfulValue(details.inputSurfaceEvidence) ||
          hasMeaningfulValue(details.sensitiveDataEvidence) ||
          hasMeaningfulValue(details.sensitiveFieldContexts);
        if (scanLevelSensitiveEvidence) {
          pushUnique(matchedCriteria, "scan_level_sensitive_surface");
        }
        if (samePageOrFlowReplayLinkage) {
          pushUnique(matchedCriteria, "same_page_or_same_flow_replay_linkage");
        } else {
          pushUnique(missingCorroborators, "same_page_or_same_flow_replay_linkage");
          pushUnique(demotionReasons, "missing_same_page_or_same_flow_replay_linkage");
        }
        if (!explicitMaskingState) {
          pushUnique(missingCorroborators, "session_replay_masking_state");
          pushUnique(demotionReasons, "missing_session_replay_masking_state");
        }
        if (collectionEndpointObserved === true && scanLevelSensitiveEvidence && samePageOrFlowReplayLinkage && explicitMaskingState) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "session_replay_collection_with_sensitive_surface_linkage");
        }
      }
      break;
    case "fingerprinting_related_signals_observed":
      forceEligibility = "surface_only";
      {
        const cluster = asRecord(details.telemetryEvidence?.fingerprintClusterSummary);
        const clusterStrength = getString(cluster, "clusterStrength");
        const identifierLinkageContext = getString(cluster, "identifierLinkageContext");
        const clusterSize = getNumber(cluster, "clusterSize");
        if (clusterStrength === "strong" || clusterStrength === "moderate" || (clusterSize ?? 0) >= 2) {
          pushUnique(matchedCriteria, "fingerprint_multi_signal_cluster");
        }
        if (identifierLinkageContext && identifierLinkageContext !== "none") {
          pushUnique(matchedCriteria, "fingerprint_identifier_or_network_linkage");
        } else {
          pushUnique(missingCorroborators, "fingerprint_identifier_or_network_linkage");
          pushUnique(demotionReasons, "review_signal_without_identifier_or_network_linkage");
        }
      }
      if (!hasMeaningfulValue(details.telemetryEvidence?.fingerprintClusterSummary) && !hasMeaningfulValue(details.telemetryEvidence)) {
        missingCorroborators.push("fingerprint_or_device_telemetry_cluster");
      }
      break;
    case "probable_fingerprinting":
      {
        const cluster = asRecord(details.telemetryEvidence?.fingerprintClusterSummary);
        const clusterStrength = getString(cluster, "clusterStrength");
        const identifierLinkageContext = getString(cluster, "identifierLinkageContext");
        const clusterSize = getNumber(cluster, "clusterSize");
        if (clusterStrength === "strong" || clusterStrength === "moderate" || (clusterSize ?? 0) >= 2) {
          pushUnique(matchedCriteria, "fingerprint_multi_signal_cluster");
        }
        if (identifierLinkageContext && identifierLinkageContext !== "none") {
          pushUnique(matchedCriteria, "fingerprint_identifier_or_network_linkage");
        }
        if (
          finding.id === "probable_fingerprinting" &&
          (clusterStrength === "strong" || (clusterSize ?? 0) >= 3) &&
          identifierLinkageContext &&
          identifierLinkageContext !== "none"
        ) {
          forceEligibility = "top_candidate";
        }
      }
      if (!hasMeaningfulValue(details.telemetryEvidence?.fingerprintClusterSummary) && !hasMeaningfulValue(details.telemetryEvidence)) {
        missingCorroborators.push("fingerprint_or_device_telemetry_cluster");
      }
      break;
    case "visual_contrast_accessibility_issue":
    case "semantic_labeling_accessibility_issue":
    case "text_alternative_accessibility_issue":
    case "keyboard_navigation_accessibility_issue":
    case "focus_management_issue":
      if (!hasMeaningfulValue(details.accessibilityEvidence)) {
        missingCorroborators.push("representative_accessibility_evidence");
      }
      if (
        finding.id === "focus_management_issue" &&
        !hasMeaningfulValue(details.accessibilityEvidence?.focusManagementEvidence)
      ) {
        missingCorroborators.push("keyboard_traversal_trace");
        demotionReasons.push("missing_keyboard_traversal_trace");
      }
      if (finding.id === "keyboard_navigation_accessibility_issue" || finding.id === "focus_management_issue") {
        const accessibilityEvidence = asRecord(details.accessibilityEvidence);
        const focusRows = asRows(details.accessibilityEvidence?.focusManagementEvidence);
        const hasTraversal = focusRows.some((row) =>
          hasMeaningfulValue(row.keyboardTraversalEvidence) ||
          hasMeaningfulValue(row.keyboardTraversalTrace) ||
          hasMeaningfulValue(row.focusPathEvidence) ||
          hasMeaningfulValue(row.focusTrace)
        );
        const hasBehaviorReproduced = focusRows.some((row) => getString(row, "evidenceStrength") === "behavior_reproduced");
        const hasFocusEscape = focusRows.some((row) => {
          const traversal =
            asRecord(row.keyboardTraversalEvidence) ??
            asRecord(row.keyboardTraversalTrace) ??
            asRecord(row.focusPathEvidence);
          return getBoolean(traversal, "backgroundFocusEscaped") === true;
        });
        if (hasTraversal) {
          pushUnique(matchedCriteria, "keyboard_traversal_trace");
        } else if (
          finding.id === "keyboard_navigation_accessibility_issue" &&
          hasPromotionGradeKeyboardAxeEvidence(accessibilityEvidence)
        ) {
          pushUnique(matchedCriteria, "automated_keyboard_accessibility_rule_evidence");
        } else if (finding.id === "keyboard_navigation_accessibility_issue") {
          forceEligibility = "surface_only";
          pushUnique(missingCorroborators, "axe_rule_id");
          pushUnique(missingCorroborators, "affected_node_selector");
          pushUnique(missingCorroborators, "sanitized_html_snippet");
          pushUnique(missingCorroborators, "failure_summary");
          pushUnique(demotionReasons, "missing_concrete_keyboard_axe_node_evidence");
        }
        if (hasFocusEscape) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "keyboard_focus_escape_or_trap_evidence");
        }
        if (finding.id === "focus_management_issue" && hasBehaviorReproduced && hasTraversal) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "behavior_reproduced_focus_management_evidence");
        } else if (finding.id === "focus_management_issue") {
          forceEligibility = "surface_only";
          if (!hasTraversal) {
            pushUnique(missingCorroborators, "keyboard_traversal_trace");
            pushUnique(demotionReasons, "missing_keyboard_traversal_trace");
          }
          if (!hasBehaviorReproduced) {
            pushUnique(missingCorroborators, "behavior_reproduced_focus_management_evidence");
            pushUnique(demotionReasons, "missing_behavior_reproduced_focus_management_evidence");
          }
        }
      }
      if (finding.id === "semantic_labeling_accessibility_issue") {
        const accessibilityEvidence = asRecord(details.accessibilityEvidence);
        if (hasPromotionGradeSemanticAxeEvidence(accessibilityEvidence)) {
          pushUnique(matchedCriteria, "automated_semantic_accessibility_rule_evidence");
        } else {
          forceEligibility = "surface_only";
          pushUnique(missingCorroborators, "axe_rule_ids");
          pushUnique(missingCorroborators, "affected_node_selectors");
          pushUnique(missingCorroborators, "sanitized_html_snippets");
          pushUnique(missingCorroborators, "failure_summaries");
          pushUnique(demotionReasons, "missing_concrete_semantic_axe_node_evidence");
        }
      }
      break;
    case "forced_consent_interaction":
    case "reject_option_missing_or_hidden":
    case "asymmetric_consent_ui":
    case "consent_dark_patterns_detected": {
      const lifecycleReview = asRecord(details.consentUiEvidence?.lifecycleReview);
      if (lifecycleReview) {
        const coverageStatus = getString(lifecycleReview, "coverageStatus");
        if (coverageStatus === "usable") {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "consent_revisit_control_absence_evidence");
        } else {
          forceEligibility = "audit_only";
          pushUnique(demotionReasons, "limited_consent_revisit_control_coverage");
        }
        break;
      }
      const runtimePath = asRecord(details.consentUiEvidence?.runtimePath);
      const overlayClassifier = getString(runtimePath, "unrelatedOverlayClassifier");
      const acceptDepth = getNumber(runtimePath, "observedAcceptPathDepth") ?? getNumber(runtimePath, "acceptClickDepth");
      const rejectDepth = getNumber(runtimePath, "observedRejectPathDepth") ?? getNumber(runtimePath, "rejectClickDepth");
      const preferenceLayers = getNumber(runtimePath, "observedPreferenceLayerCount");
      const visualHierarchyScore = getNumber(runtimePath, "visualHierarchyScore");
      const hasChoicePathEvidence = hasConsentChoicePathEvidence(runtimePath);

      if (overlayClassifier && /paywall|bot_challenge|age_gate|login_wall/.test(overlayClassifier)) {
        forceEligibility = "suppress";
        demotionReasons.push(`unrelated_overlay_${overlayClassifier}`);
      }
      if (!hasChoicePathEvidence && forceEligibility !== "suppress") {
        forceEligibility = "audit_only";
        pushUnique(missingCorroborators, "consent_path_depth_or_choice_structure_evidence");
        pushUnique(demotionReasons, "overlay_only_without_consent_path_evidence");
      }
      if (acceptDepth !== null || rejectDepth !== null || preferenceLayers !== null) {
        pushUnique(matchedCriteria, "consent_path_depth_observed");
      }
      if (acceptDepth === 1 && (rejectDepth === null || rejectDepth > 1 || (preferenceLayers ?? 0) > 0)) {
        pushUnique(matchedCriteria, "accept_one_step_reject_missing_or_nested");
      }
      if ((visualHierarchyScore ?? 0) > 0) {
        pushUnique(matchedCriteria, "accept_reject_visual_hierarchy_imbalance");
      }
      if (
        finding.id === "asymmetric_consent_ui" &&
        acceptDepth === 1 &&
        rejectDepth !== null &&
        rejectDepth > acceptDepth &&
        (visualHierarchyScore ?? 0) > 0
      ) {
        forceEligibility = "top_candidate";
      }
      if (
        (finding.id === "reject_option_missing_or_hidden" || finding.id === "consent_dark_patterns_detected") &&
        acceptDepth === 1 &&
        (rejectDepth === null || rejectDepth > 1 || (preferenceLayers ?? 0) > 0)
      ) {
        forceEligibility = "top_candidate";
      }
      break;
    }
    case "sensitive_data_collection_with_third_party_tracking_present":
      if (!hasMeaningfulValue(details.sensitiveDataEvidence) && !hasMeaningfulValue(details.sensitiveFieldContexts)) {
        missingCorroborators.push("sensitive_surface_context");
      }
      if (!hasMeaningfulValue(details.trackingEvidence) && !hasMeaningfulValue(details.runtimeRequestUrls)) {
        missingCorroborators.push("same_surface_tracking_artifact");
      }
      if (hasMeaningfulValue(details.sensitiveFieldContexts) && hasMeaningfulValue(details.runtimeRequestUrls)) {
        pushUnique(matchedCriteria, "sensitive_surface_with_runtime_tracking");
      }
      break;
    case "rtb_cookie_sync_observed": {
      const rows = asRows(details.rtbCookieSyncEvidence);
      const hasRedirect = rows.some((row) => getNumber(row, "redirectHopCount") !== null || getString(row, "redirectChainId"));
      const hasIdentifierKeys = hasMeaningfulValue(details.rtbCookieSyncIdentifierQueryKeys);
      const weakCount = typeof details.rtbCookieSyncWeakObservationCount === "number" ? details.rtbCookieSyncWeakObservationCount : 0;
      if (rows.length === 0) {
        missingCorroborators.push("sync_like_request_or_redirect");
      }
      if (hasRedirect) {
        pushUnique(matchedCriteria, "rtb_redirect_chain_provenance");
      }
      if (hasIdentifierKeys) {
        pushUnique(matchedCriteria, "rtb_identifier_like_query_keys");
      }
      if (rows.length > 0 && rows.length === weakCount && !hasIdentifierKeys && !hasRedirect) {
        demotionReasons.push("rtb_sync_path_only_without_identifier_or_redirect_context");
      }
      if ((hasIdentifierKeys || hasRedirect) && rows.length > 0) {
        forceEligibility = "top_candidate";
      }
      break;
    }
    case "cross_domain_identifier_sharing_observed": {
      const rows = asRows(details.crossDomainIdentifierSharingEvidence);
      if (rows.length === 0) {
        missingCorroborators.push("redacted_cross_domain_identifier_rows");
      }
      const hasKnownDestination = rows.some((row) => getString(row, "destinationDomain") || getString(row, "destinationEtldPlusOne"));
      const hasRedactedRequest = rows.some((row) => getString(row, "requestUrlRedacted"));
      const hasRedirect = rows.some((row) => getNumber(row, "redirectHopCount") !== null || getString(row, "redirectChainId"));
      if (hasKnownDestination) {
        pushUnique(matchedCriteria, "cross_domain_identifier_destination");
      }
      if (hasRedactedRequest) {
        pushUnique(matchedCriteria, "redacted_identifier_request");
      }
      if (hasRedirect) {
        pushUnique(matchedCriteria, "identifier_redirect_chain_provenance");
      }
      if (!hasKnownDestination) {
        demotionReasons.push("identifier_destination_unknown");
      }
      if (hasKnownDestination && hasRedactedRequest) {
        forceEligibility = "top_candidate";
      }
      break;
    }
    case "reject_tracking_persists_after_reject":
      if (!hasMeaningfulValue(details.consentInteraction)) {
        missingCorroborators.push("reject_interaction_click");
      }
      if (!hasCredibleRejectInteraction(details)) {
        missingCorroborators.push("credible_reject_control_attribution");
        demotionReasons.push("missing_credible_reject_control_attribution");
      }
      if (!hasPromotionGradePostRejectRequest(details)) {
        missingCorroborators.push("post_reject_non_essential_artifact");
      }
      if (hasMeaningfulValue(details.consentInteraction) && hasCredibleRejectInteraction(details) && hasPromotionGradePostRejectRequest(details)) {
        forceEligibility = "top_candidate";
        pushUnique(matchedCriteria, "reject_click_plus_post_reject_non_essential_request");
      }
      break;
  }

  if (missingCorroborators.length > 0 && finding.confidence !== "strong" && finding.id !== "cpra_cba_opt_out_missing") {
    demotionReasons.push("missing_top_finding_corroborator");
  }

  return finalize({
    demotionReasons,
    finding,
    forceEligibility,
    matchedCriteria,
    missingCorroborators
  });
}
