import type { RegulatoryReviewArea, RegulatoryReviewOutput, RegulatoryReviewRow } from "@certscore/contracts";

export type V2GdprEprivacyChecklistStatus =
  | "Observed"
  | "Not confirmed"
  | "Not observed"
  | "Not testable"
  | "Gap observed"
  | "Review signal"
  | "Insufficient evidence"
  | "Out of scope";

export type V2GdprEprivacyAssessmentStatus =
  | "gap_observed"
  | "review_signal"
  | "checked"
  | "coverage_limitation"
  | "not_applicable";

export type V2GdprEprivacyEvidenceState = "observed" | "not_observed" | "not_testable" | "not_applicable";

export type V2RegulatoryChecklistDebugConfidence = {
  improveConfidence: string[];
  score: number;
};

export type V2RegulatoryChecklistSubcheck = {
  assessmentStatus: V2GdprEprivacyAssessmentStatus;
  evidenceRefs: string[];
  evidenceState: V2GdprEprivacyEvidenceState;
  id: string;
  label: string;
  note: string;
  status: V2GdprEprivacyChecklistStatus;
};

export type V2GdprEprivacyChecklistItem = {
  assessmentStatus: V2GdprEprivacyAssessmentStatus;
  criticalEvidence: V2GdprCriticalEvidence;
  debugConfidence: V2RegulatoryChecklistDebugConfidence;
  evidenceState: V2GdprEprivacyEvidenceState;
  id: string;
  label: string;
  note: string;
  status: V2GdprEprivacyChecklistStatus;
  tone: "neutral" | "review" | "warning" | "muted";
  explanation: string;
  evidenceRefs: string[];
  limitation?: string;
  subchecks?: V2RegulatoryChecklistSubcheck[];
};

export type V2CaliforniaPrivacyChecklistStatus =
  | "not_applicable"
  | "not_observed"
  | "not_testable"
  | "observed"
  | "potential_gap"
  | "review_signal";

export type V2CaliforniaPrivacyAssessmentStatus =
  | "checked"
  | "coverage_limitation"
  | "gap_observed"
  | "needs_evidence"
  | "review_signal";

export type V2CaliforniaPrivacyEvidenceState = "not_observed" | "not_testable" | "observed";

export type V2CaliforniaPrivacyChecklistItem = {
  assessmentStatus: V2CaliforniaPrivacyAssessmentStatus;
  criticalEvidence: V2CaliforniaCriticalEvidence;
  debugConfidence: V2RegulatoryChecklistDebugConfidence;
  evidenceState: V2CaliforniaPrivacyEvidenceState;
  id: string;
  label: string;
  note: string;
  status: V2CaliforniaPrivacyChecklistStatus;
  statusLabel: string;
  tone: "neutral" | "review" | "warning" | "muted";
  explanation: string;
  evidenceRefs: string[];
  limitation?: string;
};

export type V2RegulatoryReviewChecklistModel = {
  californiaPrivacyItems: V2CaliforniaPrivacyChecklistItem[];
  gdprEprivacyItems: V2GdprEprivacyChecklistItem[];
};

type V2SourceSignalGap = {
  actual: unknown;
  expected: unknown;
  field: string;
  source: "scanner" | "CertScore";
  whyNeeded: string;
};

type V2GdprCriticalEvidence = {
  missingOrIncompleteSourceSignals: V2SourceSignalGap[];
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

type V2CaliforniaCriticalEvidence = V2GdprCriticalEvidence & {
  evidenceFamily:
    | "notice_surface"
    | "collection_notice"
    | "sale_share_control"
    | "gpc_handling"
    | "adtech_sharing_runtime"
    | "disclosure_alignment"
    | "sensitive_pi"
    | "cipa_interaction_recording"
    | "cipa_communication_interception"
    | "opt_out_friction"
    | "post_opt_out_tracking"
    | "rights_methods"
    | "privacy_control_accessibility";
  pipeline: V2GdprCriticalEvidence["pipeline"] & {
    regulatoryReviewArea: "california_ccpa_cpra";
  };
};

const ALLOWED_GDPR_EPRIVACY_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking",
  "consent_surface_observed",
  "cookie_notice_availability",
  "reject_all_path_availability",
  "post_reject_tracking_reduction",
  "preference_withdrawal_control",
  "session_replay_fingerprinting_review",
  "policy_runtime_vendor_alignment_review",
  "cross_border_endpoint_review",
]);

const SESSION_REPLAY_PARENT_ROW_ID = "session_replay_fingerprinting_review";
const SESSION_REPLAY_CHILD_ROW_LABELS = new Map([
  ["session_replay_before_consent", "Before consent"],
  ["session_replay_disclosure_alignment", "Disclosure alignment"],
  ["session_replay_sensitive_surface", "Sensitive surfaces"],
  ["session_replay_after_refusal", "After refusal / opt-out"],
]);
const SESSION_REPLAY_CHILD_ROW_IDS = new Set(SESSION_REPLAY_CHILD_ROW_LABELS.keys());

const ALLOWED_CALIFORNIA_PRIVACY_ROW_IDS = new Set([
  "privacy_notice_availability",
  "notice_at_collection",
  "do_not_sell_share_availability",
  "gpc_opt_out_signal_handling",
  "targeted_advertising_signals",
  "post_opt_out_tracking_behavior",
]);

export function regulatoryReviewToProductionChecklistModel(
  regulatoryReview: RegulatoryReviewOutput | null | undefined,
): V2RegulatoryReviewChecklistModel {
  const californiaArea = regulatoryReview?.areas.find((area) => area.id === "california-privacy");
  const gdprArea = regulatoryReview?.areas.find((area) => area.id === "gdpr-eprivacy");
  return {
    californiaPrivacyItems: californiaRowsForArea(californiaArea).map((row) => californiaRowToChecklistItem(row)),
    gdprEprivacyItems: gdprRowsForArea(gdprArea).map((row) => gdprRowToChecklistItem(row)),
  };
}

export function regulatoryReviewToBetaChecklistAreas(
  regulatoryReview: RegulatoryReviewOutput | null | undefined,
): V2RegulatoryReviewChecklistModel {
  return regulatoryReviewToProductionChecklistModel(regulatoryReview);
}

function gdprRowToChecklistItem(row: RegulatoryReviewRow): V2GdprEprivacyChecklistItem {
  const mapped = mapGdprStatus(row);
  const subchecks = displaySubchecksForRow(row);
  return {
    assessmentStatus: mapped.assessmentStatus,
    criticalEvidence: gdprCriticalEvidence(row, mapped.status),
    debugConfidence: debugConfidenceForRow(row),
    evidenceState: mapped.evidenceState,
    id: row.id,
    label: row.label,
    note: row.note,
    status: mapped.status,
    tone: mapped.tone,
    explanation: row.note,
    evidenceRefs: displaySafeEvidenceRefs(row),
    limitation: mapped.evidenceState === "not_testable" ? row.note : undefined,
    ...(subchecks.length > 0 ? { subchecks } : {}),
  };
}

function gdprRowsForArea(area: RegulatoryReviewArea | undefined): RegulatoryReviewRow[] {
  if (!area) {
    return emptyGdprRows();
  }
  return collapseSessionReplayRows(area.rows)
    .filter((row) => ALLOWED_GDPR_EPRIVACY_ROW_IDS.has(row.id));
}

function californiaRowsForArea(area: RegulatoryReviewArea | undefined): RegulatoryReviewRow[] {
  return area
    ? area.rows.filter((row) => ALLOWED_CALIFORNIA_PRIVACY_ROW_IDS.has(row.id))
    : emptyCaliforniaRows();
}

type DisplayRegulatoryReviewRow = RegulatoryReviewRow & {
  displaySubchecks?: RegulatoryReviewRow[];
};

function collapseSessionReplayRows(rows: RegulatoryReviewRow[]): RegulatoryReviewRow[] {
  const parent = rows.find((row) => row.id === SESSION_REPLAY_PARENT_ROW_ID);
  const children = rows.filter((row) => SESSION_REPLAY_CHILD_ROW_IDS.has(row.id));
  if (!parent || children.length === 0) {
    return rows.filter((row) => !SESSION_REPLAY_CHILD_ROW_IDS.has(row.id));
  }

  const childWithGap = children.find((row) => row.status === "gap_observed");
  const mergedStatus = childWithGap ? "gap_observed" : parent.status;
  const mergedNote = sessionReplayParentNote(parent, children, childWithGap);
  const mergedMissingSignals = mergedStatus === "gap_observed"
    ? parent.missingOrIncompleteSourceSignals
    : uniqueStrings([
      ...parent.missingOrIncompleteSourceSignals,
      ...children.flatMap((row) => row.missingOrIncompleteSourceSignals),
    ]);
  const mergedRow: DisplayRegulatoryReviewRow = {
    ...parent,
    evidenceRefs: uniqueStrings([
      ...parent.evidenceRefs,
      ...children.flatMap((row) => row.evidenceRefs),
    ]),
    missingOrIncompleteSourceSignals: mergedMissingSignals,
    note: mergedNote,
    sourceFindingKeys: uniqueStrings([
      ...parent.sourceFindingKeys,
      ...children.flatMap((row) => row.sourceFindingKeys),
    ]),
    status: mergedStatus,
    displaySubchecks: children,
  };

  return rows.map((row) => row.id === parent.id ? mergedRow : row)
    .filter((row) => !SESSION_REPLAY_CHILD_ROW_IDS.has(row.id));
}

function sessionReplayParentNote(
  parent: RegulatoryReviewRow,
  children: RegulatoryReviewRow[],
  childWithGap: RegulatoryReviewRow | undefined,
) {
  if (childWithGap?.id === "session_replay_before_consent") {
    return "Session replay or behavioral analytics was observed before a recorded consent action. Review disclosure, masking, sensitive-page coverage, and refusal behavior as supporting subchecks.";
  }
  if (childWithGap?.id === "session_replay_disclosure_alignment") {
    return "Session replay or behavioral analytics was observed and a disclosure-alignment gap was retained. Review whether the public notice clearly explains the observed replay vendor or domain.";
  }
  if (childWithGap?.id === "session_replay_sensitive_surface") {
    return "Session replay or behavioral analytics was observed on a retained sensitive surface. Review masking, exclusion rules, and collection minimization.";
  }
  if (childWithGap?.id === "session_replay_after_refusal") {
    return "Session replay or behavioral analytics persisted after a confirmed reject or opt-out action. Review whether refusal suppresses behavioral recording.";
  }

  const observedSubcheck = children.find((row) => row.status === "not_observed" || row.status === "checked");
  if (parent.status === "review_signal" || parent.status === "litigation_risk_signal") {
    return observedSubcheck
      ? "Session replay or behavioral analytics was observed. No strict session-replay gap was proven from the retained subchecks, but disclosure, masking, sensitive-page coverage, and refusal behavior still warrant review."
      : "Session replay or behavioral analytics was observed, but the retained scan context did not resolve the stricter timing, disclosure, sensitive-surface, or refusal subchecks.";
  }

  return parent.note;
}

function displaySubchecksForRow(row: RegulatoryReviewRow): V2RegulatoryChecklistSubcheck[] {
  const displayRow = row as DisplayRegulatoryReviewRow;
  return (displayRow.displaySubchecks ?? []).map((subcheck) => {
    const mapped = mapGdprStatus(subcheck);
    return {
      assessmentStatus: mapped.assessmentStatus,
      evidenceRefs: displaySafeEvidenceRefs(subcheck),
      evidenceState: mapped.evidenceState,
      id: subcheck.id,
      label: SESSION_REPLAY_CHILD_ROW_LABELS.get(subcheck.id) ?? subcheck.label,
      note: subcheck.note,
      status: mapped.status,
    };
  });
}

function californiaRowToChecklistItem(row: RegulatoryReviewRow): V2CaliforniaPrivacyChecklistItem {
  const mapped = mapCaliforniaStatus(row);
  return {
    assessmentStatus: mapped.assessmentStatus,
    criticalEvidence: californiaCriticalEvidence(row, mapped.status),
    debugConfidence: debugConfidenceForRow(row),
    evidenceState: mapped.evidenceState,
    id: row.id,
    label: row.label,
    note: row.note,
    status: mapped.status,
    statusLabel: californiaStatusLabel(mapped.status),
    tone: mapped.tone,
    explanation: row.note,
    evidenceRefs: displaySafeEvidenceRefs(row),
    limitation: mapped.evidenceState === "not_testable" ? row.note : undefined,
  };
}

function mapGdprStatus(row: RegulatoryReviewRow): {
  assessmentStatus: V2GdprEprivacyAssessmentStatus;
  evidenceState: V2GdprEprivacyEvidenceState;
  status: V2GdprEprivacyChecklistStatus;
  tone: V2GdprEprivacyChecklistItem["tone"];
} {
  switch (row.status) {
    case "gap_observed":
      return { assessmentStatus: "gap_observed", evidenceState: "observed", status: "Gap observed", tone: "warning" };
    case "review_signal":
    case "litigation_risk_signal":
      return { assessmentStatus: "review_signal", evidenceState: "observed", status: "Review signal", tone: "review" };
    case "checked":
      return { assessmentStatus: "checked", evidenceState: "observed", status: "Observed", tone: "neutral" };
    case "not_observed":
      return { assessmentStatus: "checked", evidenceState: "not_observed", status: "Not observed", tone: "neutral" };
    case "not_applicable":
      return { assessmentStatus: "not_applicable", evidenceState: "not_applicable", status: "Out of scope", tone: "muted" };
    case "not_testable":
    default:
      return { assessmentStatus: "coverage_limitation", evidenceState: "not_testable", status: "Not testable", tone: "muted" };
  }
}

function mapCaliforniaStatus(row: RegulatoryReviewRow): {
  assessmentStatus: V2CaliforniaPrivacyAssessmentStatus;
  evidenceState: V2CaliforniaPrivacyEvidenceState;
  status: V2CaliforniaPrivacyChecklistStatus;
  tone: V2CaliforniaPrivacyChecklistItem["tone"];
} {
  switch (row.status) {
    case "gap_observed":
      return { assessmentStatus: "gap_observed", evidenceState: "observed", status: "potential_gap", tone: "warning" };
    case "review_signal":
    case "litigation_risk_signal":
      return { assessmentStatus: "review_signal", evidenceState: "observed", status: "review_signal", tone: "review" };
    case "checked":
      return { assessmentStatus: "checked", evidenceState: "observed", status: "observed", tone: "neutral" };
    case "not_observed":
      return { assessmentStatus: "checked", evidenceState: "not_observed", status: "not_observed", tone: "neutral" };
    case "not_applicable":
      return { assessmentStatus: "checked", evidenceState: "not_observed", status: "not_applicable", tone: "muted" };
    case "not_testable":
    default:
      return { assessmentStatus: "needs_evidence", evidenceState: "not_testable", status: "not_testable", tone: "muted" };
  }
}

function gdprCriticalEvidence(row: RegulatoryReviewRow, status: V2GdprEprivacyChecklistStatus): V2GdprCriticalEvidence {
  return {
    missingOrIncompleteSourceSignals: sourceSignalGaps(row),
    pipeline: {
      concernPolicyKey: `v2.regulatory_review.${row.id}`,
      projectionStage: "coverage_policy",
      wc01NormalizedConcernKey: row.sourceFindingKeys[0] ?? row.id,
      ws01EvidenceRole: "v2 scan-core observed evidence interpreted by review-engine",
    },
    projectedFindings: row.sourceFindingKeys.map((key) => ({ id: key, label: key.replaceAll("_", " ") })),
    retainedEvidence: {
      evidenceRefs: row.evidenceRefs,
      regulatoryMapping: row.regulatoryMapping,
      sourceFindingKeys: row.sourceFindingKeys,
      status,
    },
    statusBasis: row.note,
  };
}

function californiaCriticalEvidence(row: RegulatoryReviewRow, status: V2CaliforniaPrivacyChecklistStatus): V2CaliforniaCriticalEvidence {
  return {
    ...gdprCriticalEvidence(row, statusLabelAsGdpr(status)),
    evidenceFamily: californiaEvidenceFamily(row.id),
    pipeline: {
      concernPolicyKey: `v2.regulatory_review.${row.id}`,
      projectionStage: "coverage_policy",
      regulatoryReviewArea: "california_ccpa_cpra",
      wc01NormalizedConcernKey: row.sourceFindingKeys[0] ?? row.id,
      ws01EvidenceRole: "v2 scan-core observed evidence interpreted by review-engine",
    },
  };
}

function sourceSignalGaps(row: RegulatoryReviewRow): V2SourceSignalGap[] {
  return row.missingOrIncompleteSourceSignals.map((signal) => ({
    actual: "not retained in this v2 artifact",
    expected: "bounded source evidence sufficient for this checklist row",
    field: row.id,
    source: signal.includes("CertScore") ? "CertScore" : "scanner",
    whyNeeded: signal,
  }));
}

function debugConfidenceForRow(row: RegulatoryReviewRow): V2RegulatoryChecklistDebugConfidence {
  return {
    improveConfidence: improveConfidenceForRow(row),
    score: confidenceScoreForRow(row),
  };
}

function confidenceScoreForRow(row: RegulatoryReviewRow) {
  let score = 4;
  const scannerCoverageGapCount = missingScannerCoverageKinds(row).length;
  if (row.status === "not_testable") {
    score = 2;
  } else if (row.status === "gap_observed" || row.status === "review_signal" || row.status === "litigation_risk_signal") {
    score = row.evidenceRefs.length > 0 ? 7 : 5;
  } else if (row.status === "checked") {
    score = row.evidenceRefs.length > 0 ? 8 : 6;
  } else if (row.status === "not_observed") {
    score = row.evidenceRefs.length > 0 ? 6 : 4;
  } else if (row.status === "not_applicable") {
    score = 5;
  }

  if (row.evidenceCapability === "near_term_supported") {
    score -= 1;
  }
  if (scannerCoverageGapCount > 0) {
    score -= row.evidenceRefs.length > 0 ? 2 : 3;
  }
  if (row.missingOrIncompleteSourceSignals.length > 0) {
    score -= Math.min(3, Math.max(0, row.missingOrIncompleteSourceSignals.length - scannerCoverageGapCount));
  }
  if (row.evidenceRefs.length >= 2 && row.missingOrIncompleteSourceSignals.length === 0) {
    score += 1;
  }
  if (isCompletePostOptOutTrackingReviewSignal(row)) {
    score = Math.max(score, 9);
  }
  return Math.max(1, Math.min(10, score));
}

function isCompletePostOptOutTrackingReviewSignal(row: RegulatoryReviewRow) {
  if (
    row.id !== "post_opt_out_tracking_behavior" ||
    row.status !== "review_signal" ||
    !row.sourceFindingKeys.includes("post_opt_out_targeted_advertising_behavior_signal") ||
    row.missingOrIncompleteSourceSignals.length > 0
  ) {
    return false;
  }

  const evidence = row.evidenceRefs.join(" ").toLowerCase();
  const hasOptOutProof =
    /do not sell|do not share|opt[-\s]?out.*proof|action proof|gpc probe|global privacy control|\bgpc\b/.test(evidence);
  const hasDisplayLabeledAdvertisingComparison =
    /post[-\s]?opt[-\s]?out.*advertising.*comparison|advertising.*suppression comparison|advertising.*persist/i.test(evidence) ||
    /advertising.*comparison/.test(evidence);
  const hasDisplayLabeledAdtechSignal =
    /advertising|adtech|doubleclick|googleads|targeted/.test(evidence);
  const hasSourceKeyComparisonProof = row.sourceFindingKeys.includes("post_opt_out_targeted_advertising_behavior_signal");

  return hasOptOutProof && (
    (hasDisplayLabeledAdvertisingComparison && hasDisplayLabeledAdtechSignal) ||
    hasSourceKeyComparisonProof
  );
}

function improveConfidenceForRow(row: RegulatoryReviewRow) {
  const suggestions = [
    ...scannerCoverageImprovements(row),
    ...row.missingOrIncompleteSourceSignals.map((signal) => cleanImprovementText(row.id, signal)),
    ...rowSpecificConfidenceImprovements(row.id),
  ];
  if (row.evidenceRefs.length === 0 && scannerCoverageImprovements(row).length === 0) {
    suggestions.unshift("Retain display-safe source evidence for this row");
  }
  if (row.evidenceCapability === "near_term_supported") {
    suggestions.push("Tighten the scanner evidence contract for this coverage area");
  }
  return uniqueStrings(suggestions.filter((value) => value.length > 0)).slice(0, 3);
}

function cleanImprovementText(rowId: string, value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (isScannerCoverageGap(normalized)) {
    return "";
  }

  const token = normalized.toLowerCase();
  if (token === "contextual_notice_at_collection_surface") {
    return "Retain a collection-context notice surface near data-entry evidence";
  }
  if (rowId === "notice_at_collection" && token === "policy_topic:notice_at_collection") {
    return "Retain a dedicated Notice at Collection surface or topic";
  }
  if (token === "bounded_privacy_notice_excerpt") {
    return "Retain a bounded privacy notice excerpt";
  }
  if (token === "bounded_cookie_notice_excerpt" || token === "bounded_cookie_policy_excerpt") {
    return "Retain a bounded cookie notice or cookie policy excerpt";
  }
  if (rowId === "cookie_notice_availability" && token === "cookie_policy_surface") {
    return "Retain a cookie notice or cookie policy surface";
  }
  if (rowId === "cookie_notice_availability" && token === "bounded_cookie_policy_or_cookie_notice") {
    return "Retain a bounded cookie notice or cookie policy excerpt";
  }
  if (rowId === "cookie_notice_availability" && token === "cookie_specific_notice_surface") {
    return "Retain a cookie-specific notice surface";
  }
  if (token === "endpoint_geography_location_not_retained") {
    return "Retain endpoint geography/location evidence";
  }
  if (token === "reject_control_observed_or_not_observed") {
    return "Retain a visible reject/decline control observation";
  }
  if (token === "reject_action_succeeded_or_not_testable") {
    return "Retain proof that the reject path completed or was not testable";
  }
  if (token === "do_not_sell_or_share_link_observed") {
    return "Retain an explicit Do Not Sell/Share or privacy choices path";
  }
  if (rowId === "do_not_sell_share_availability" && token === "do_not_sell_or_share_surface") {
    return "Retain an explicit Do Not Sell/Share or privacy choices path";
  }
  if (rowId === "do_not_sell_share_availability" && token === "sale_share_or_opt_out_context") {
    return "Retain sale/share or opt-out context for the privacy choices path";
  }
  if (token === "gpc_runtime_probe_with_disclosure_observed") {
    return "Retain a GPC disclosure plus bounded GPC-enabled runtime probe";
  }
  if (rowId === "gpc_opt_out_signal_handling" && (
    token === "gpc_policy_disclosure" ||
    token === "policy_topic:global_privacy_control"
  )) {
    return "Retain a bounded GPC policy disclosure";
  }
  if (rowId === "gpc_opt_out_signal_handling" && token === "bounded_gpc_disclosure_excerpt") {
    return "Retain a bounded GPC disclosure excerpt";
  }
  if (rowId === "gpc_opt_out_signal_handling" && token === "gpc_enabled_runtime_probe") {
    return "Retain a GPC-enabled runtime probe";
  }
  if (rowId === "gpc_opt_out_signal_handling" && token === "gpc_request_header_marker") {
    return "Retain the GPC request header marker";
  }
  if (rowId === "gpc_opt_out_signal_handling" && token === "gpc_handling_recognition_proof") {
    return "Retain bounded GPC handling or recognition proof";
  }
  if (token === "targeted_advertising_runtime_signal") {
    return "Retain advertising-purpose runtime evidence with vendor attribution";
  }
  if (token === "post_opt_out_targeted_advertising_behavior_signal") {
    return "Retain comparable post-opt-out advertising request evidence";
  }
  if (rowId === "cookie_notice_availability" && /cookie/i.test(normalized)) {
    return "Retain cookie-specific notice or policy evidence";
  }

  return normalized
    .replace(/^Missing or incomplete\s+/i, "Add ")
    .replace(/\s+coverage\.$/i, " coverage")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function scannerCoverageImprovements(row: RegulatoryReviewRow) {
  return missingScannerCoverageKinds(row).map((kind) => {
    if (kind === "policySurfaceScanner") {
      return policySurfaceScannerImprovement(row.id);
    }
    if (kind === "consentFlowRuntimeScanner") {
      return consentFlowScannerImprovement(row.id);
    }
    if (kind === "preConsentRuntimeScanner") {
      return preConsentScannerImprovement(row.id);
    }
    return "Run the missing source module and retain bounded row evidence";
  });
}

function missingScannerCoverageKinds(row: RegulatoryReviewRow) {
  const missingText = row.missingOrIncompleteSourceSignals.join(" ").toLowerCase();
  const kinds: Array<"policySurfaceScanner" | "consentFlowRuntimeScanner" | "preConsentRuntimeScanner"> = [];
  if (/policysurfacescanner|policy-surface scanner|policy surface scanner/.test(missingText)) {
    kinds.push("policySurfaceScanner");
  }
  if (/consentflowruntimescanner|consent-flow runtime scanner|consent flow runtime scanner/.test(missingText)) {
    kinds.push("consentFlowRuntimeScanner");
  }
  if (/preconsentruntimescanner|pre-consent runtime scanner|pre consent runtime scanner/.test(missingText)) {
    kinds.push("preConsentRuntimeScanner");
  }
  return kinds;
}

function isScannerCoverageGap(value: string) {
  return (
    value === "required_source_module_not_run" ||
    /required.*module.*not.*run/i.test(value) ||
    /scanner did not run/i.test(value) ||
    /scanner coverage/i.test(value) ||
    /policysurfacescanner/i.test(value) ||
    /consentflowruntimescanner/i.test(value) ||
    /preconsentruntimescanner/i.test(value)
  );
}

function policySurfaceScannerImprovement(rowId: string) {
  switch (rowId) {
    case "cookie_notice_availability":
      return "Run policy-surface coverage for cookie notice or cookie policy evidence";
    case "policy_runtime_vendor_alignment_review":
      return "Run policy-surface coverage for policy/runtime vendor comparison";
    case "privacy_notice_availability":
      return "Run policy-surface coverage for privacy notice evidence";
    case "notice_at_collection":
      return "Run policy-surface coverage for notice-at-collection evidence";
    case "do_not_sell_share_availability":
      return "Run policy-surface coverage for sale/share opt-out evidence";
    case "gpc_opt_out_signal_handling":
      return "Run policy-surface coverage for GPC disclosure evidence";
    default:
      return "Run policy-surface coverage and retain bounded policy evidence";
  }
}

function consentFlowScannerImprovement(rowId: string) {
  switch (rowId) {
    case "reject_all_path_availability":
      return "Use internal retained/replay review for reject/decline path evidence";
    case "post_reject_tracking_reduction":
      return "Use internal retained/replay review for before/after reject comparison";
    case "preference_withdrawal_control":
      return "Use internal retained/replay review for preference reopening evidence";
    case "post_opt_out_tracking_behavior":
      return "Use internal retained/replay review for post-choice tracking comparison";
    case "gpc_opt_out_signal_handling":
      return "Run GPC-enabled runtime coverage for opt-out signal handling";
    default:
      return "Use internal retained/replay review and retain bounded interaction evidence";
  }
}

function preConsentScannerImprovement(rowId: string) {
  switch (rowId) {
    case "pre_consent_cookies_storage":
      return "Run pre-consent runtime coverage for cookie/storage evidence";
    case "pre_consent_third_party_tracking":
      return "Run pre-consent runtime coverage for third-party request timing";
    case "targeted_advertising_signals":
      return "Run runtime coverage for advertising-purpose third-party requests";
    default:
      return "Run pre-consent runtime coverage and retain bounded request evidence";
  }
}

function rowSpecificConfidenceImprovements(rowId: string) {
  switch (rowId) {
    case "pre_consent_cookies_storage":
      return ["Retain cookie/storage party and purpose classification", "Capture pre-consent and post-choice storage snapshots"];
    case "pre_consent_third_party_tracking":
      return ["Retain request timing relative to consent state", "Resolve vendor and purpose for third-party endpoints"];
    case "consent_surface_observed":
      return ["Retain bounded consent UI text and screenshot evidence", "Capture visible accept and reject controls"];
    case "cookie_notice_availability":
      return ["Retain a bounded cookie notice or cookie policy excerpt", "Retain the cookie notice URL and link text"];
    case "reject_all_path_availability":
      return ["Retain internal reject-path proof when already available", "Retain visible first-layer reject-path availability without clicking"];
    case "post_reject_tracking_reduction":
      return ["Use retained before/after reject request deltas when already available", "Classify persisted vendors and cookies after reject"];
    case "preference_withdrawal_control":
      return ["Retain evidence that preferences can be reopened after initial choice"];
    case "session_replay_fingerprinting_review":
      return ["Retain collection-endpoint evidence, not only library detection", "Resolve behavioral analytics vendor purpose"];
    case "policy_runtime_vendor_alignment_review":
      return ["Fetch policy surfaces with vendor mentions", "Resolve runtime vendor attribution for tracking endpoints"];
    case "cross_border_endpoint_review":
      return ["Retain endpoint geography or transfer-relevant vendor context"];
    case "privacy_notice_availability":
      return ["Retain bounded public privacy notice content"];
    case "notice_at_collection":
      return ["Capture collection-context page evidence near forms or data-entry surfaces"];
    case "do_not_sell_share_availability":
      return ["Retain an explicit Do Not Sell/Share or privacy choices path"];
    case "gpc_opt_out_signal_handling":
      return ["Retain a GPC-enabled scan comparison and disclosure evidence"];
    case "targeted_advertising_signals":
      return ["Retain adtech vendor purpose and third-party request evidence"];
    case "post_opt_out_tracking_behavior":
      return ["Use retained opt-out proof and post-choice tracking deltas when already available"];
    default:
      return ["Retain bounded evidence refs and module coverage for this row"];
  }
}

function displaySafeEvidenceRefs(row: RegulatoryReviewRow) {
  return [
    ...row.evidenceRefs,
    ...row.missingOrIncompleteSourceSignals.map((signal) => `Coverage note: ${signal}`),
  ].map((value) => value.replace(/\s+/g, " ").trim().slice(0, 220)).slice(0, 8);
}

function californiaEvidenceFamily(rowId: string): V2CaliforniaCriticalEvidence["evidenceFamily"] {
  switch (rowId) {
    case "privacy_notice_availability":
      return "notice_surface";
    case "notice_at_collection":
      return "collection_notice";
    case "do_not_sell_share_availability":
      return "sale_share_control";
    case "gpc_opt_out_signal_handling":
      return "gpc_handling";
    case "targeted_advertising_signals":
      return "adtech_sharing_runtime";
    case "post_opt_out_tracking_behavior":
      return "post_opt_out_tracking";
    case "privacy_control_accessibility":
      return "privacy_control_accessibility";
    default:
      return "adtech_sharing_runtime";
  }
}

function californiaStatusLabel(status: V2CaliforniaPrivacyChecklistStatus) {
  switch (status) {
    case "not_applicable":
      return "Not applicable";
    case "not_observed":
      return "Not observed";
    case "not_testable":
      return "Not testable";
    case "observed":
      return "Observed";
    case "potential_gap":
      return "Potential gap";
    case "review_signal":
      return "Review signal";
  }
}

function statusLabelAsGdpr(status: V2CaliforniaPrivacyChecklistStatus): V2GdprEprivacyChecklistStatus {
  switch (status) {
    case "potential_gap":
      return "Gap observed";
    case "review_signal":
      return "Review signal";
    case "observed":
      return "Observed";
    case "not_observed":
      return "Not observed";
    case "not_applicable":
      return "Out of scope";
    case "not_testable":
      return "Not testable";
  }
}

function emptyGdprRows(): RegulatoryReviewRow[] {
  return [{
    evidenceCapability: "currently_supported",
    evidenceRefs: [],
    id: "v2_gdpr_eprivacy_unavailable",
    label: "GDPR / ePrivacy review unavailable",
    missingOrIncompleteSourceSignals: ["Regulatory review is not available for this v2 scan artifact."],
    note: "Regulatory review is not available for this v2 scan artifact.",
    regulatoryMapping: [],
    sourceFindingKeys: [],
    status: "not_testable",
  }];
}

function emptyCaliforniaRows(): RegulatoryReviewRow[] {
  return [{
    evidenceCapability: "currently_supported",
    evidenceRefs: [],
    id: "v2_california_privacy_unavailable",
    label: "California privacy review unavailable",
    missingOrIncompleteSourceSignals: ["Regulatory review is not available for this v2 scan artifact."],
    note: "Regulatory review is not available for this v2 scan artifact.",
    regulatoryMapping: [],
    sourceFindingKeys: [],
    status: "not_testable",
  }];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function areaToBetaChecklistArea(area: RegulatoryReviewArea): V2RegulatoryReviewChecklistModel {
  return regulatoryReviewToProductionChecklistModel({
    reviewVersion: "certscore.v2.regulatory_review.1",
    generatedAt: new Date(0).toISOString(),
    sourceReviewId: "single_area",
    scanId: "single_area",
    url: "",
    areas: [area],
    notes: [],
  });
}
