import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel,
  type CanonicalShadowScoreLunaDecision
} from "./canonical-shadow-score-luna-decision";

export const CUSTOMER_GDPR_EPRIVACY_SCORE_MODE_ENV = "CERTSCORE_GDPR_EPRIVACY_SCORE_MODE";
export const CUSTOMER_GDPR_EPRIVACY_POSTURE_SCORE_KIND = "gdpr_eprivacy_posture" as const;

export type CustomerScoreAssessment = {
  coverageConfidence: "high" | "insufficient" | "low" | "medium";
  coverageRatio: number;
  scanId: string;
  scoreKind: string;
  scoreSource: string;
  scoreStatus: "scored" | "withheld";
  scoreValue: number | null;
  scoreVersion: string;
  scoredAt: string;
  withholdingReason: string | null;
};

export type CustomerGdprEprivacyScoreMode = "approved_candidate" | "legacy";
export type CustomerGdprEprivacyScoreSelectionReason =
  | "approved_candidate_selected"
  | "candidate_assessment_missing"
  | "candidate_kind_mismatch"
  | "candidate_version_mismatch"
  | "invalid_mode_fell_back_to_legacy"
  | "legacy_mode"
  | "luna_approval_missing";

export type CustomerGdprEprivacyScoreSelection = {
  assessment: CustomerScoreAssessment | null;
  effectiveMode: CustomerGdprEprivacyScoreMode;
  label: "GDPR/ePrivacy evidence" | "GDPR/ePrivacy posture";
  overallScoreStatus: "withheld_unmodeled_domains";
  requestedMode: CustomerGdprEprivacyScoreMode;
  selectionReason: CustomerGdprEprivacyScoreSelectionReason;
};

function requestedMode(rawMode: string | null | undefined) {
  const normalized = rawMode?.trim().toLowerCase();
  if (!normalized || normalized === "legacy") {
    return { invalid: false, mode: "legacy" as const };
  }
  if (normalized === "approved_candidate") {
    return { invalid: false, mode: "approved_candidate" as const };
  }
  return { invalid: true, mode: "legacy" as const };
}

export function selectCustomerGdprEprivacyScore(input: {
  candidateAssessment: CustomerScoreAssessment | null;
  decision?: CanonicalShadowScoreLunaDecision;
  legacyAssessment: CustomerScoreAssessment | null;
  rawMode?: string | null;
}): CustomerGdprEprivacyScoreSelection {
  const configured = requestedMode(input.rawMode);
  const legacy = (selectionReason: CustomerGdprEprivacyScoreSelectionReason): CustomerGdprEprivacyScoreSelection => ({
    assessment: input.legacyAssessment,
    effectiveMode: "legacy",
    label: "GDPR/ePrivacy evidence",
    overallScoreStatus: "withheld_unmodeled_domains",
    requestedMode: configured.mode,
    selectionReason
  });

  if (configured.invalid) return legacy("invalid_mode_fell_back_to_legacy");
  if (configured.mode === "legacy") return legacy("legacy_mode");

  const decision = input.decision ?? GDPR_EPRIVACY_SHADOW_LUNA_DECISION;
  if (!isLunaScoreDecisionApprovedForModel(decision, decision.modelVersion)) {
    return legacy("luna_approval_missing");
  }
  const candidate = input.candidateAssessment;
  if (!candidate) return legacy("candidate_assessment_missing");
  if (candidate.scoreKind !== CUSTOMER_GDPR_EPRIVACY_POSTURE_SCORE_KIND) {
    return legacy("candidate_kind_mismatch");
  }
  if (candidate.scoreVersion !== decision.modelVersion) {
    return legacy("candidate_version_mismatch");
  }

  return {
    assessment: candidate,
    effectiveMode: "approved_candidate",
    label: "GDPR/ePrivacy posture",
    overallScoreStatus: "withheld_unmodeled_domains",
    requestedMode: configured.mode,
    selectionReason: "approved_candidate_selected"
  };
}
