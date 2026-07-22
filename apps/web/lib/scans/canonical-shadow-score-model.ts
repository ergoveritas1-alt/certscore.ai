import type { CanonicalShadowScoreModel } from "./canonical-shadow-score";

export const GDPR_EPRIVACY_SHADOW_CANDIDATE_V0_MODEL = {
  approvalStatus: "pending_luna",
  criticalPostureCaps: [
    {
      capId: "high-consent-tracking-cap",
      family: "consent_tracking",
      maxPostureScore: 54,
      minimumSeverity: "high"
    },
    {
      capId: "high-policy-runtime-contradiction-cap",
      family: "contradiction",
      maxPostureScore: 49,
      minimumSeverity: "high"
    }
  ],
  familyMaximumRiskPoints: {
    consent_tracking: 40,
    contradiction: 35,
    policy_extraction: 15,
    rights_gap: 25
  },
  minimumCoverageRatioForPostureScore: 0.7,
  postureBands: [
    { actionLabel: "Monitor", minimumScore: 75, posture: "Clear" },
    { actionLabel: "Review", minimumScore: 50, posture: "Watch" },
    { actionLabel: "Act", minimumScore: 0, posture: "Action Needed" }
  ],
  severityRiskPoints: {
    high: 30,
    medium: 15,
    low: 5
  },
  version: "gdpr-eprivacy-shadow.candidate-v0.pending-luna"
} as const satisfies CanonicalShadowScoreModel;
