import type { CaliforniaPrivacyRegulatoryReviewArea } from "@website-signal-risk-scanner/shared";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { CertScoreFindingEvidenceDetails } from "./finding-registry";
import type {
  CaliforniaPrivacyCoverageCriticalEvidence,
  CaliforniaPrivacyCoverageOutcome,
  CaliforniaPrivacyCoverageOutcomeStatus,
  CaliforniaPrivacyCoverageSourceSignalGap
} from "./california-privacy-coverage-policy";
import { buildRegulatoryChecklistEvidenceHighlights } from "./regulatory-checklist-evidence-highlights";

const CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA: CaliforniaPrivacyRegulatoryReviewArea = "california_ccpa_cpra";

const CALIFORNIA_PRIVACY_STATUS_LABELS: Record<CaliforniaPrivacyCoverageChecklistStatus, string> = {
  not_applicable: "Not applicable",
  not_observed: "Not observed",
  not_testable: "Not testable",
  observed: "Observed",
  potential_gap: "Potential gap",
  review_signal: "Review signal"
};

function getCaliforniaPrivacyReviewStatusLabel(status: CaliforniaPrivacyCoverageChecklistStatus) {
  return CALIFORNIA_PRIVACY_STATUS_LABELS[status];
}

export type CaliforniaPrivacyCoverageChecklistStatus = CaliforniaPrivacyCoverageOutcomeStatus;
export type CaliforniaPrivacyCoverageAssessmentStatus =
  | "checked"
  | "coverage_limitation"
  | "gap_observed"
  | "needs_evidence"
  | "review_signal";
export type CaliforniaPrivacyCoverageEvidenceState = "not_observed" | "not_testable" | "observed";
export type CaliforniaPrivacyCoverageChecklistTone = "neutral" | "review" | "warning" | "muted";

export type CaliforniaPrivacyCoverageChecklistItem = {
  assessmentStatus: CaliforniaPrivacyCoverageAssessmentStatus;
  criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence;
  evidenceState: CaliforniaPrivacyCoverageEvidenceState;
  id: string;
  label: string;
  note: string;
  status: CaliforniaPrivacyCoverageChecklistStatus;
  statusLabel: string;
  tone: CaliforniaPrivacyCoverageChecklistTone;
  explanation: string;
  evidenceRefs: string[];
  limitation?: string;
};

type ChecklistRowDefinition = {
  id: string;
  label: string;
  explanation: string;
  findingIds: string[];
  defaultFindingStatus: Exclude<CaliforniaPrivacyCoverageChecklistStatus, "not_observed" | "not_testable" | "not_applicable">;
  notObservedText: string;
};

export type CaliforniaPrivacyCoverageChecklistInput = {
  coverageLimited: boolean;
  coverageOutcomes?: Record<string, CaliforniaPrivacyCoverageOutcome>;
  projectedFindings?: Array<{
    evidenceDetails?: CertScoreFindingEvidenceDetails;
    evidencePreview?: string[];
    id: string;
    label: string;
  }>;
  scanCompleted: boolean;
  unifiedFindings: UnifiedFindingDisplayPacket[];
  withholdDeepCheckOnlyRows?: boolean;
  withholdForNonRepresentativeScan?: boolean;
};

const CHECKLIST_ROWS: ChecklistRowDefinition[] = [
  {
    id: "privacy_notice_availability",
    label: "Privacy notice availability",
    explanation: "Whether a public privacy notice or privacy policy was observed and reachable from the tested context.",
    findingIds: ["privacy_policy_present", "privacy_policy_missing_surface", "privacy_policy_unavailable"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No privacy notice finding was surfaced in this scan context."
  },
  {
    id: "notice_at_collection",
    label: "Notice at collection",
    explanation: "Whether public collection-context surfaces included nearby privacy notice or disclosure cues.",
    findingIds: ["privacy_policy_missing_surface", "policy_clarity_risk"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No notice-at-collection issue was surfaced in this scan context."
  },
  {
    id: "do_not_sell_share_availability",
    label: "Do Not Sell or Share availability",
    explanation: "Whether an equivalent opt-out path was observed when sale/share or targeted-advertising signals were present.",
    findingIds: ["cpra_cba_opt_out_missing", "sale_sharing_controls_missing", "targeted_advertising_choices_present"],
    defaultFindingStatus: "potential_gap",
    notObservedText: "No Do Not Sell or Share availability issue was surfaced in this scan context."
  },
  {
    id: "gpc_opt_out_signal_handling",
    label: "GPC / opt-out signal handling",
    explanation: "Whether an opt-out preference signal such as GPC was sent and appeared honored or recognized.",
    findingIds: ["gpc_signal_not_honored", "gpc_disclosure_present"],
    defaultFindingStatus: "potential_gap",
    notObservedText: "No GPC handling issue was surfaced in this scan context."
  },
  {
    id: "targeted_advertising_signals",
    label: "Targeted advertising signals",
    explanation: "Whether advertising, retargeting, social pixel, or cross-context tracking signals were observed.",
    findingIds: ["cpra_cba_opt_out_missing", "sale_sharing_controls_missing", "targeted_advertising_disclosure_present"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No targeted advertising or cross-context tracking signal was surfaced in this scan context."
  },
  {
    id: "sale_share_disclosure_alignment",
    label: "Sale/share disclosure alignment",
    explanation: "Whether observed runtime adtech or sale/share-like signals aligned with reviewed public disclosures.",
    findingIds: ["do_not_sell_sharing_disclosure_conflict", "policy_behavior_conflict", "policy_behavior_contradiction_detected", "third_party_recipient_disclosure_missing", "targeted_advertising_disclosure_present"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No sale/share disclosure-alignment finding was surfaced in this scan context."
  },
  {
    id: "limit_use_sensitive_pi",
    label: "Limit Use of Sensitive Personal Information",
    explanation: "Whether a Limit Use path was observed when sensitive personal information context was detected.",
    findingIds: ["sensitive_collection_surface_observed", "sensitive_data_collection_with_third_party_tracking_present"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No Limit Use or sensitive PI applicability issue was surfaced in this scan context."
  },
  {
    id: "opt_out_friction_dark_patterns",
    label: "Opt-out friction / choice balance",
    explanation: "Whether privacy choice flows created friction, imbalance, confusing labels, or reduced refusal visibility.",
    findingIds: ["accept_more_prominent_than_reject", "consent_dark_patterns_detected", "dismiss_without_reject", "forced_consent_wall", "reject_option_missing_or_hidden"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No opt-out friction finding was surfaced in this scan context."
  },
  {
    id: "post_opt_out_tracking_behavior",
    label: "Post-opt-out tracking behavior",
    explanation: "Whether targeted advertising, sale/share, or non-essential tracking decreased after opt-out or reject.",
    findingIds: ["reject_did_not_reduce_tracking", "reject_tracking_persists_after_reject", "reject_did_not_reduce_third_party_cookies"],
    defaultFindingStatus: "potential_gap",
    notObservedText: "No post-opt-out tracking persistence finding was surfaced in this scan context."
  },
  {
    id: "sensitive_forms_third_party_tracking",
    label: "Sensitive forms with third-party tracking",
    explanation: "Whether sensitive forms or high-risk collection contexts appeared alongside third-party tracking.",
    findingIds: ["sensitive_data_collection_with_third_party_tracking_present", "possible_session_replay_on_sensitive_input_surface"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No sensitive form and third-party tracking correlation was surfaced in this scan context."
  },
  {
    id: "cipa_sensitive_interaction_recording",
    label: "CIPA-sensitive interaction recording",
    explanation: "Whether retained runtime evidence showed session replay, behavioral analytics, or interaction recording signals relevant to California CIPA-sensitive review.",
    findingIds: ["cipa_sensitive_interaction_recording_signal"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No CIPA-sensitive interaction recording signal was surfaced in this scan context."
  },
  {
    id: "cipa_sensitive_communication_interception",
    label: "CIPA-sensitive third-party communication interception",
    explanation: "Whether retained runtime evidence showed third-party receipt or tracking during public communication, search, form, chat, or support flows.",
    findingIds: ["cipa_sensitive_communication_interception_signal"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No CIPA-sensitive communication interception signal was surfaced in this scan context."
  },
  {
    id: "consumer_rights_request_methods",
    label: "Consumer rights request methods",
    explanation: "Whether public privacy materials exposed a consumer rights request method or equivalent privacy request path.",
    findingIds: ["privacy_rights_path_present", "privacy_contact_channel_missing", "privacy_contact_path_present"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No consumer rights request-method evidence was surfaced in this scan context."
  },
  {
    id: "privacy_control_accessibility",
    label: "Privacy control accessibility",
    explanation: "Whether privacy-choice controls produced basic automated accessibility signals.",
    findingIds: ["focus_management_issue", "keyboard_navigation_accessibility_issue", "semantic_labeling_accessibility_issue", "visual_contrast_accessibility_issue"],
    defaultFindingStatus: "review_signal",
    notObservedText: "No privacy-control accessibility issue was surfaced in this scan context."
  }
];

const DEEP_CHECK_ONLY_ROW_IDS = new Set(["gpc_opt_out_signal_handling", "post_opt_out_tracking_behavior"]);

function getChecklistTone(status: CaliforniaPrivacyCoverageChecklistStatus): CaliforniaPrivacyCoverageChecklistTone {
  switch (status) {
    case "potential_gap":
    case "review_signal":
      return "warning";
    case "not_applicable":
    case "not_testable":
      return "muted";
    default:
      return "neutral";
  }
}

function getAssessmentStatus(status: CaliforniaPrivacyCoverageChecklistStatus): CaliforniaPrivacyCoverageAssessmentStatus {
  switch (status) {
    case "potential_gap":
      return "gap_observed";
    case "review_signal":
      return "review_signal";
    case "not_testable":
      return "needs_evidence";
    case "not_applicable":
    case "not_observed":
    case "observed":
    default:
      return "checked";
  }
}

function getAssessmentStatusForRow(
  rowId: string,
  status: CaliforniaPrivacyCoverageChecklistStatus
): CaliforniaPrivacyCoverageAssessmentStatus {
  if (
    status === "observed" &&
    (rowId === "cipa_sensitive_interaction_recording" || rowId === "cipa_sensitive_communication_interception")
  ) {
    return "review_signal";
  }
  return getAssessmentStatus(status);
}

function getChecklistToneForRow(
  rowId: string,
  status: CaliforniaPrivacyCoverageChecklistStatus
): CaliforniaPrivacyCoverageChecklistTone {
  if (
    status === "observed" &&
    (rowId === "cipa_sensitive_interaction_recording" || rowId === "cipa_sensitive_communication_interception")
  ) {
    return "warning";
  }
  return getChecklistTone(status);
}

function getStatusLabelForRow(rowId: string, status: CaliforniaPrivacyCoverageChecklistStatus) {
  if (rowId === "privacy_control_accessibility" && status === "observed") {
    return "Control observed";
  }
  if (
    status === "observed" &&
    (rowId === "cipa_sensitive_interaction_recording" || rowId === "cipa_sensitive_communication_interception")
  ) {
    return "Observed - Review signal";
  }
  return getCaliforniaPrivacyReviewStatusLabel(status);
}

function hasRetainedEvidenceValue(
  retainedEvidence: Record<string, unknown>,
  keys: string[],
  expected: unknown
) {
  return keys.some((key) => retainedEvidence[key] === expected);
}

function getPotentialGapEvidenceState(rowId: string, criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence): CaliforniaPrivacyCoverageEvidenceState {
  const retainedEvidence = criticalEvidence.retainedEvidence;

  switch (rowId) {
    case "privacy_notice_availability":
      return hasRetainedEvidenceValue(retainedEvidence, ["privacyNoticeObserved", "noticeSurfaceObserved"], false)
        ? "not_observed"
        : "observed";
    case "notice_at_collection":
      return hasRetainedEvidenceValue(retainedEvidence, ["nearbyNoticeCueObserved", "noticeAtCollectionCueObserved"], false)
        ? "not_observed"
        : "observed";
    case "do_not_sell_share_availability":
      return hasRetainedEvidenceValue(retainedEvidence, ["doNotSellSharePathObserved", "privacyChoicesPathObserved", "optOutPathObserved"], false)
        ? "not_observed"
        : "observed";
    case "gpc_opt_out_signal_handling":
      return hasRetainedEvidenceValue(retainedEvidence, ["gpcHonored", "gpcRecognized", "optOutPreferenceSignalHonored"], false)
        ? "not_observed"
        : "observed";
    case "limit_use_sensitive_pi":
      return hasRetainedEvidenceValue(retainedEvidence, ["limitUsePathObserved", "limitUseControlObserved"], false)
        ? "not_observed"
        : "observed";
    case "consumer_rights_request_methods":
      return hasRetainedEvidenceValue(retainedEvidence, ["rightsRequestMethodObserved", "consumerRightsMethodObserved"], false)
        ? "not_observed"
        : "observed";
    default:
      return "observed";
  }
}

function getEvidenceState(input: {
  criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence;
  rowId: string;
  status: CaliforniaPrivacyCoverageChecklistStatus;
}): CaliforniaPrivacyCoverageEvidenceState {
  const retainedEvidence = input.criticalEvidence.retainedEvidence;

  switch (input.status) {
    case "not_testable":
      return "not_testable";
    case "not_applicable":
    case "not_observed":
      return "not_observed";
    case "potential_gap":
      return getPotentialGapEvidenceState(input.rowId, input.criticalEvidence);
    case "review_signal":
      if (
        input.rowId === "do_not_sell_share_availability" &&
        retainedEvidence.doNotSellSharePathObserved === false &&
        retainedEvidence.runtimeThirdPartyAdtechObserved === false &&
        retainedEvidence.runtimeVendorRequestUrlCoherence === "mismatch"
      ) {
        return "not_observed";
      }
      if (
        input.rowId === "targeted_advertising_signals" &&
        retainedEvidence.runtimeThirdPartyAdtechObserved === false &&
        retainedEvidence.runtimeVendorRequestUrlCoherence === "mismatch"
      ) {
        return "not_observed";
      }
      return "observed";
    case "observed":
    default:
      return "observed";
  }
}

function withChecklistPosture(input: {
  criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  explanation: string;
  id: string;
  label: string;
  limitation?: string;
  status: CaliforniaPrivacyCoverageChecklistStatus;
}): CaliforniaPrivacyCoverageChecklistItem {
  const assessmentStatus = getAssessmentStatusForRow(input.id, input.status);
  const evidenceState = getEvidenceState({
    criticalEvidence: input.criticalEvidence,
    rowId: input.id,
    status: input.status
  });
  const note = input.limitation ?? input.criticalEvidence.statusBasis;

  return {
    assessmentStatus,
    criticalEvidence: input.criticalEvidence,
    evidenceRefs: input.evidenceRefs,
    evidenceState,
    explanation: input.explanation,
    id: input.id,
    label: input.label,
    limitation: input.limitation,
    note,
    status: input.status,
    statusLabel: getStatusLabelForRow(input.id, input.status),
    tone: getChecklistToneForRow(input.id, input.status)
  };
}

function getEvidenceFamilyForRow(rowId: string): CaliforniaPrivacyCoverageCriticalEvidence["evidenceFamily"] {
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
    case "sale_share_disclosure_alignment":
      return "disclosure_alignment";
    case "limit_use_sensitive_pi":
      return "sensitive_pi";
    case "opt_out_friction_dark_patterns":
      return "opt_out_friction";
    case "post_opt_out_tracking_behavior":
      return "post_opt_out_tracking";
    case "consumer_rights_request_methods":
      return "rights_methods";
    case "privacy_control_accessibility":
      return "privacy_control_accessibility";
    default:
      return "adtech_sharing_runtime";
  }
}

function makeSourceSignalGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "scanner" | "CertScore" = "CertScore"
): CaliforniaPrivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function getEvidenceRefs(findings: UnifiedFindingDisplayPacket[]) {
  return findings.flatMap((finding) => [
    finding.presentation?.findingName || finding.title,
    ...(finding.evidence?.flags ?? []).map((flag) => `Evidence flag: ${flag}`).slice(0, 3)
  ]).slice(0, 6);
}

function getFindingEntityPreview(finding: UnifiedFindingDisplayPacket) {
  const entities = finding.evidence?.entities ?? {};
  return Object.fromEntries(
    Object.entries(entities)
      .filter(([, values]) => Array.isArray(values) && values.length > 0)
      .slice(0, 5)
      .map(([key, values]) => [key, values.slice(0, 5)])
  );
}

function getUnifiedFindingCriticalEvidence(
  status: CaliforniaPrivacyCoverageChecklistStatus,
  statusBasis: string,
  rowId: string,
  findings: UnifiedFindingDisplayPacket[],
  projectedFindings: NonNullable<CaliforniaPrivacyCoverageChecklistInput["projectedFindings"]> = []
): CaliforniaPrivacyCoverageCriticalEvidence {
  return {
    evidenceFamily: getEvidenceFamilyForRow(rowId),
    missingOrIncompleteSourceSignals: [],
    pipeline: {
      concernPolicyKey: `california_privacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
      projectionStage: "unified_finding",
      regulatoryReviewArea: CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA,
      wc01NormalizedConcernKey: `california_privacy.coverage.${rowId}`,
      ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
    },
    projectedFindings: findings.map((finding) => ({
      id: finding.unifiedFindingId,
      label: finding.presentation?.findingName || finding.title,
      severity: finding.severity
    })),
    retainedEvidence: {
      evidenceHighlights: projectedFindings.flatMap(buildRegulatoryChecklistEvidenceHighlights).slice(0, 3),
      evidenceRefs: getEvidenceRefs(findings),
      findingEntities: findings.map((finding) => ({
        id: finding.unifiedFindingId,
        entities: getFindingEntityPreview(finding),
        evidenceFlags: (finding.evidence?.flags ?? []).slice(0, 5)
      })),
      status
    },
    statusBasis
  };
}

function getFallbackCriticalEvidence(
  status: CaliforniaPrivacyCoverageChecklistStatus,
  statusBasis: string,
  rowId: string,
  missingOrIncompleteSourceSignals: CaliforniaPrivacyCoverageSourceSignalGap[] = []
): CaliforniaPrivacyCoverageCriticalEvidence {
  return {
    evidenceFamily: getEvidenceFamilyForRow(rowId),
    missingOrIncompleteSourceSignals,
    pipeline: {
      concernPolicyKey: `california_privacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
      projectionStage: "coverage_fallback",
      regulatoryReviewArea: CALIFORNIA_PRIVACY_REGULATORY_REVIEW_AREA,
      wc01NormalizedConcernKey: `california_privacy.coverage.${rowId}`,
      ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
    },
    projectedFindings: [],
    retainedEvidence: { status },
    statusBasis
  };
}

export function deriveCaliforniaPrivacyCoverageChecklist(
  input: CaliforniaPrivacyCoverageChecklistInput
): CaliforniaPrivacyCoverageChecklistItem[] {
  if (input.withholdForNonRepresentativeScan) {
    return [];
  }

  const findingsById = new Map(input.unifiedFindings.map((finding) => [finding.unifiedFindingId, finding]));
  const projectedFindingsById = new Map((input.projectedFindings ?? []).map((finding) => [finding.id, finding]));
  const publicCoverageIsTestable = input.scanCompleted && !input.coverageLimited;
  const checklistRows = input.withholdDeepCheckOnlyRows
    ? CHECKLIST_ROWS.filter((definition) => !DEEP_CHECK_ONLY_ROW_IDS.has(definition.id))
    : CHECKLIST_ROWS;

  return checklistRows.map((definition) => {
    const matchingFindings = definition.findingIds.flatMap((id) => {
      const finding = findingsById.get(id);
      return finding ? [finding] : [];
    });
    const matchingProjectedFindings = definition.findingIds.flatMap((id) => {
      const finding = projectedFindingsById.get(id);
      return finding ? [finding] : [];
    });
    const policyOutcome = input.coverageOutcomes?.[definition.id];

    if (policyOutcome) {
      return withChecklistPosture({
        criticalEvidence: policyOutcome.criticalEvidence,
        evidenceRefs: policyOutcome.evidenceRefs,
        explanation: definition.explanation,
        id: definition.id,
        label: definition.label,
        limitation: policyOutcome.limitation,
        status: policyOutcome.status
      });
    }

    if (matchingFindings.length > 0) {
      const status = definition.defaultFindingStatus;
      const statusBasis = `Canonical unified finding evidence was retained for this California row: ${matchingFindings.map((finding) => finding.presentation?.findingName || finding.title).join(", ")}.`;
      return withChecklistPosture({
        criticalEvidence: getUnifiedFindingCriticalEvidence(status, statusBasis, definition.id, matchingFindings, matchingProjectedFindings),
        evidenceRefs: getEvidenceRefs(matchingFindings),
        explanation: definition.explanation,
        id: definition.id,
        label: definition.label,
        limitation: statusBasis,
        status
      });
    }

    const status = publicCoverageIsTestable ? "not_observed" : "not_testable";
    const statusBasis = publicCoverageIsTestable
      ? definition.notObservedText
      : "Public-web coverage was limited, so this California row was not testable.";
    return withChecklistPosture({
      criticalEvidence: getFallbackCriticalEvidence(
        status,
        statusBasis,
        definition.id,
        publicCoverageIsTestable
          ? []
          : [
              makeSourceSignalGap(
                "scanner.californiaPrivacyEvidence",
                "completed California evidence packet",
                "missing_or_limited",
                "Required to evaluate this California checklist row.",
                "scanner"
              )
            ]
      ),
      evidenceRefs: [],
      explanation: definition.explanation,
      id: definition.id,
      label: definition.label,
      limitation: statusBasis,
      status
    });
  });
}
