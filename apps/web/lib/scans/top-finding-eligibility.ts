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

function includesAny(values: unknown, pattern: RegExp) {
  if (Array.isArray(values)) {
    return values.some((value) => typeof value === "string" && pattern.test(value));
  }
  return typeof values === "string" && pattern.test(values);
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
      if (!hasMeaningfulValue(details.optOutControlEvidence)) {
        missingCorroborators.push("privacy_choice_search_scope");
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
      if (
        details.optOutControlEvidence?.gpcScanStateSent === true &&
        details.optOutControlEvidence?.gpcHandlingObserved === "ignored" &&
        hasMeaningfulValue(details.trackingOrSharingContext)
      ) {
        forceEligibility = "top_candidate";
        pushUnique(matchedCriteria, "gpc_ignored_with_advertising_or_sharing_context");
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
        }
        if (sameSurfaceMaskingOrExclusionObserved) {
          pushUnique(matchedCriteria, "same_surface_replay_masking_or_exclusion_observed");
          pushUnique(demotionReasons, "same_surface_replay_masking_or_exclusion_observed");
        }
        if (
          collectionEndpointObserved === true &&
          sameScopeSensitiveEvidence &&
          samePageOrFlowReplayLinkage &&
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
        const scanLevelSensitiveEvidence =
          hasMeaningfulValue(details.inputSurfaceEvidence) ||
          hasMeaningfulValue(details.sensitiveDataEvidence) ||
          hasMeaningfulValue(details.sensitiveFieldContexts);
        if (scanLevelSensitiveEvidence) {
          pushUnique(matchedCriteria, "scan_level_sensitive_surface");
        }
        if (collectionEndpointObserved === true && scanLevelSensitiveEvidence) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "session_replay_collection_with_scan_level_sensitive_surface");
          pushUnique(missingCorroborators, "same_page_or_same_flow_replay_linkage");
        }
      }
      break;
    case "probable_fingerprinting":
    case "fingerprinting_related_signals_observed":
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
      }
      if (finding.id === "keyboard_navigation_accessibility_issue" || finding.id === "focus_management_issue") {
        const focusRows = asRows(details.accessibilityEvidence?.focusManagementEvidence);
        const hasTraversal = focusRows.some((row) => hasMeaningfulValue(row.keyboardTraversalEvidence));
        const hasBehaviorReproduced = focusRows.some((row) => getString(row, "evidenceStrength") === "behavior_reproduced");
        const hasFocusEscape = focusRows.some((row) => {
          const traversal = asRecord(row.keyboardTraversalEvidence);
          return getBoolean(traversal, "backgroundFocusEscaped") === true;
        });
        if (hasTraversal) {
          pushUnique(matchedCriteria, "keyboard_traversal_trace");
        } else if (finding.id === "keyboard_navigation_accessibility_issue" && hasMeaningfulValue(details.accessibilityEvidence)) {
          pushUnique(matchedCriteria, "automated_keyboard_accessibility_rule_evidence");
        }
        if (hasFocusEscape) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "keyboard_focus_escape_or_trap_evidence");
        }
        if (finding.id === "focus_management_issue" && hasBehaviorReproduced && hasTraversal) {
          forceEligibility = "top_candidate";
          pushUnique(matchedCriteria, "behavior_reproduced_focus_management_evidence");
        }
      }
      break;
    case "forced_consent_interaction":
    case "reject_option_missing_or_hidden":
    case "asymmetric_consent_ui":
    case "consent_dark_patterns_detected": {
      const runtimePath = asRecord(details.consentUiEvidence?.runtimePath);
      const overlayClassifier = getString(runtimePath, "unrelatedOverlayClassifier");
      const acceptDepth = getNumber(runtimePath, "observedAcceptPathDepth") ?? getNumber(runtimePath, "acceptClickDepth");
      const rejectDepth = getNumber(runtimePath, "observedRejectPathDepth") ?? getNumber(runtimePath, "rejectClickDepth");
      const preferenceLayers = getNumber(runtimePath, "observedPreferenceLayerCount");
      const visualHierarchyScore = getNumber(runtimePath, "visualHierarchyScore");

      if (overlayClassifier && /paywall|bot_challenge|age_gate|login_wall/.test(overlayClassifier)) {
        forceEligibility = "suppress";
        demotionReasons.push(`unrelated_overlay_${overlayClassifier}`);
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
      if (!hasPromotionGradePostRejectRequest(details)) {
        missingCorroborators.push("post_reject_non_essential_artifact");
      }
      if (hasMeaningfulValue(details.consentInteraction) && hasPromotionGradePostRejectRequest(details)) {
        forceEligibility = "top_candidate";
        pushUnique(matchedCriteria, "reject_click_plus_post_reject_non_essential_request");
      }
      break;
  }

  if (missingCorroborators.length > 0 && finding.confidence !== "strong") {
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
