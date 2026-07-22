import type { CanonicalShadowScoreModel } from "./canonical-shadow-score";
import {
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL,
  GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL
} from "./canonical-shadow-score-model";

export type CanonicalShadowScoreModelProposal = {
  changedParameters: string[];
  model: CanonicalShadowScoreModel;
  proposalId: string;
  rationale: string;
};

export const GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS: CanonicalShadowScoreModelProposal[] = [
  {
    changedParameters: ["familyMaximumRiskPoints.rights_gap:25->30"],
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V3_MODEL,
    proposalId: "rights-family-maximum-30",
    rationale: "Makes a high-severity rights gap contribute the full configured high-severity risk value, moving the deterministic posture from Clear to Watch without adding a family-specific cap."
  },
  {
    changedParameters: ["criticalPostureCaps:+high-rights-gap-cap@54"],
    model: {
      ...GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL,
      approvalStatus: "pending_luna",
      criticalPostureCaps: [
        ...GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.criticalPostureCaps,
        {
          capId: "high-rights-gap-cap",
          family: "rights_gap",
          maxPostureScore: 54,
          minimumSeverity: "high"
        }
      ],
      version: "gdpr-eprivacy-shadow.candidate-v3b-rights-cap-54.pending-luna"
    },
    proposalId: "high-rights-gap-cap-54",
    rationale: "Keeps the current rights-family risk contribution but prevents a supported high-severity rights gap from scoring above Watch."
  },
  {
    changedParameters: ["criticalPostureCaps:+high-rights-gap-cap@49"],
    model: {
      ...GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL,
      approvalStatus: "pending_luna",
      criticalPostureCaps: [
        ...GDPR_EPRIVACY_SHADOW_CANDIDATE_V2_MODEL.criticalPostureCaps,
        {
          capId: "high-rights-gap-cap",
          family: "rights_gap",
          maxPostureScore: 49,
          minimumSeverity: "high"
        }
      ],
      version: "gdpr-eprivacy-shadow.candidate-v3c-rights-cap-49.pending-luna"
    },
    proposalId: "high-rights-gap-cap-49",
    rationale: "Keeps the current rights-family risk contribution and treats a supported high-severity rights gap as Action Needed, matching the existing contradiction and sensitive-data cap boundary."
  }
];
