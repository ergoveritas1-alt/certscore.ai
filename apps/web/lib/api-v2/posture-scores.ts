import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { getPersistedCanonicalReportProjection } from "../../server/scans/persisted-canonical-report-projection";
import { retainedConsentAssessment } from "../scans/after-action-report-eligibility";
import { readCaliforniaPrivacyReviewFromConsent } from "@certscore/contracts";
import { deriveCaliforniaRegulatoryScore } from "../scans/california-regulatory-score";
import { apiV2PostureScoresSchema, type ApiV2PostureScores } from "@certscore/api-contracts";
import {
  CALIFORNIA_REGULATORY_SCORE_VERSION,
  type CaliforniaRegulatoryScore,
} from "../scans/california-regulatory-score";

/** Labels the existing EU-weighted score and the independently derived California score. */
export function buildApiV2PostureScores(input: {
  score: number | null;
  scoreExplanation?: { score: number; policyVersion: string } | null;
  californiaScore?: CaliforniaRegulatoryScore | null;
}): ApiV2PostureScores {
  const california = input.californiaScore;
  return apiV2PostureScoresSchema.parse({
    contractVersion: "certscore.posture-scores.v1",
    gdprEprivacy: {
      posture: "gdpr_eprivacy",
      score: input.score,
      policyVersion: input.score !== null && input.scoreExplanation?.score === input.score
        ? input.scoreExplanation.policyVersion : null,
      coverage: input.score === null ? "unavailable" : "scored",
      scope: "starting_page",
    },
    ccpaCpra: {
      posture: "ccpa_cpra",
      score: california?.score ?? null,
      policyVersion: california?.policyVersion ?? CALIFORNIA_REGULATORY_SCORE_VERSION,
      coverage: california?.coverage ?? "unavailable",
      scope: "starting_page",
      ...(california?.reviewCoverage ? {coverageSummary:{postureBasis:california.reviewCoverage.postureBasis,
        evidenceFamilies:california.reviewCoverage.families.filter(row=>row.status !== "unknown").length,
        totalFamilies:6,scoreReady:california.reviewCoverage.scoreReady,
        families:california.reviewCoverage.families.map(row=>({id:row.id,status:row.status,...("assessmentState" in row?{assessmentState:row.assessmentState,followUp:row.followUp}:{})})),
      }} : {}),
    },
  });
}

/** Both API resources and Pulse summaries consume the same persisted assessment. */
export function projectScanPostureScores(scanRecord: ScanDetailResponse, score: number | null,
  scoreExplanation?: { score: number; policyVersion: string } | null): ApiV2PostureScores {
  const canonical = getPersistedCanonicalReportProjection(scanRecord);
  const california = deriveCaliforniaRegulatoryScore({
    assessment: canonical ? readCaliforniaPrivacyReviewFromConsent(retainedConsentAssessment(scanRecord)) : null,
    checklistRows: canonical?.checklistRows ?? [], unifiedFindings: canonical?.ownerUnifiedFindings ?? [],
  });
  return buildApiV2PostureScores({ score, scoreExplanation, californiaScore: california });
}
