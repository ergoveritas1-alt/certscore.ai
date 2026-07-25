import { createHash } from "node:crypto";
import type { VersionedScoreAssessmentInput } from "./score-assessment-repository";
import type { CanonicalShadowScoreComparisonArtifact } from "../../lib/scans/canonical-shadow-score-artifact";
import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel,
  type CanonicalShadowScoreLunaDecision
} from "../../lib/scans/canonical-shadow-score-luna-decision";
import { CUSTOMER_GDPR_EPRIVACY_POSTURE_SCORE_SOURCE } from "../../lib/scans/customer-score-cutover";

export const LEGACY_GDPR_EPRIVACY_SCORE_VERSION = "gdpr-eprivacy-evidence.legacy-v1";
export const CANONICAL_GDPR_EPRIVACY_POSTURE_SCORE_SOURCE = CUSTOMER_GDPR_EPRIVACY_POSTURE_SCORE_SOURCE;

type LegacyGdprEprivacyScoreAssessment = {
  coverageConfidence: VersionedScoreAssessmentInput["coverageConfidence"];
  coverageRatio: number;
  score: number | null;
  scoreKind: VersionedScoreAssessmentInput["scoreKind"];
  scoreSource: string;
  scoreVersion: string;
};

type ChecklistRow = {
  assessmentStatus?: unknown;
  evidenceState?: unknown;
  id?: unknown;
  status?: unknown;
};

type UnifiedFindingPacket = {
  presentationDecision?: { status?: "surface" | "audit_only" | "suppress" } | null;
  unifiedFindingId?: unknown;
};

function boundedFindingIds(packets: UnifiedFindingPacket[]) {
  return [...new Set(packets.flatMap((packet) => {
    if (packet.presentationDecision?.status !== "surface") return [];
    const id = packet.unifiedFindingId;
    return typeof id === "string" && id.trim() ? [id.trim().slice(0, 200)] : [];
  }))].sort().slice(0, 256);
}

function boundedChecklistSemantics(rows: ChecklistRow[]) {
  return rows.flatMap((row) => {
    if (typeof row.id !== "string" || !row.id.trim()) return [];
    return [{
      assessmentStatus: typeof row.assessmentStatus === "string" ? row.assessmentStatus : null,
      evidenceState: typeof row.evidenceState === "string" ? row.evidenceState : null,
      id: row.id.trim().slice(0, 200),
      status: typeof row.status === "string" ? row.status : null
    }];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function buildLegacyGdprEprivacyVersionedAssessmentInput(input: {
  assessment: LegacyGdprEprivacyScoreAssessment;
  checklistRows: ChecklistRow[];
  scanId: string;
  scoredAt: string;
  unifiedFindings: UnifiedFindingPacket[];
}): VersionedScoreAssessmentInput {
  const inputFindingIds = boundedFindingIds(input.unifiedFindings);
  const checklistSemantics = boundedChecklistSemantics(input.checklistRows);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    checklistSemantics,
    inputFindingIds
  })).digest("hex");

  return {
    coverageConfidence: input.assessment.coverageConfidence,
    coverageRatio: input.assessment.coverageRatio,
    inputFindingIds,
    inputProjectionFingerprint: `sha256:${fingerprint}`,
    scanId: input.scanId,
    scoreKind: input.assessment.scoreKind,
    scoreSource: input.assessment.scoreSource,
    scoreValue: input.assessment.score,
    scoreVersion: input.assessment.scoreVersion,
    scoredAt: input.scoredAt,
    ...(input.assessment.score === null
      ? { withholdingReason: `legacy_evidence_score_withheld:${input.assessment.coverageConfidence}` }
      : {})
  };
}

export function buildShadowGdprEprivacyVersionedAssessmentInput(input: {
  artifact: CanonicalShadowScoreComparisonArtifact;
  scoredAt: string;
}): VersionedScoreAssessmentInput {
  const candidate = input.artifact.candidate;
  return {
    coverageConfidence: candidate.coverageConfidence,
    coverageRatio: candidate.coverageRatio,
    inputFindingIds: candidate.inputFindingIds,
    inputProjectionFingerprint: input.artifact.inputProjectionFingerprint,
    scanId: input.artifact.scanId,
    scoreKind: "gdpr_eprivacy_risk_shadow",
    scoreSource: candidate.scoreSource,
    scoreValue: candidate.postureScore,
    scoreVersion: candidate.modelVersion,
    scoredAt: input.scoredAt,
    ...(candidate.postureScore === null
      ? {
          withholdingReason: candidate.withheldReasons.length > 0
            ? candidate.withheldReasons.join(",").slice(0, 500)
            : "candidate_posture_withheld"
        }
      : {})
  };
}

function customerCoverageConfidence(coverageRatio: number, inScopeRowCount: number) {
  if (inScopeRowCount === 0) return "insufficient" as const;
  if (coverageRatio >= 0.9) return "high" as const;
  if (coverageRatio >= 0.7) return "medium" as const;
  return "low" as const;
}

export function buildApprovedGdprEprivacyPostureVersionedAssessmentInput(input: {
  artifact: CanonicalShadowScoreComparisonArtifact;
  decision?: CanonicalShadowScoreLunaDecision;
  scoredAt: string;
}): VersionedScoreAssessmentInput {
  const decision = input.decision ?? GDPR_EPRIVACY_SHADOW_LUNA_DECISION;
  const candidate = input.artifact.candidate;
  if (!isLunaScoreDecisionApprovedForModel(decision, candidate.modelVersion)) {
    throw new Error("The exact candidate model is not fully approved by Luna.");
  }
  if (candidate.modelApprovalStatus !== "approved_by_luna" || !input.artifact.cutoverEligible) {
    throw new Error("The candidate artifact is not eligible for customer cutover.");
  }
  if (decision.coverageSemantics.selectedCustomerFacingMetric !== "report_usable_evidence") {
    throw new Error("The approved customer coverage metric is not report usable evidence.");
  }
  const coverage = input.artifact.comparison.coverage;
  return {
    coverageConfidence: customerCoverageConfidence(
      coverage.reportUsableEvidenceRatio,
      coverage.reportInScopeRowCount
    ),
    coverageRatio: coverage.reportUsableEvidenceRatio,
    inputFindingIds: candidate.inputFindingIds,
    inputProjectionFingerprint: input.artifact.inputProjectionFingerprint,
    scanId: input.artifact.scanId,
    scoreKind: "gdpr_eprivacy_posture",
    scoreSource: CANONICAL_GDPR_EPRIVACY_POSTURE_SCORE_SOURCE,
    scoreValue: candidate.postureScore,
    scoreVersion: candidate.modelVersion,
    scoredAt: input.scoredAt,
    ...(candidate.postureScore === null
      ? {
          withholdingReason: candidate.withheldReasons.length > 0
            ? candidate.withheldReasons.join(",").slice(0, 500)
            : "candidate_posture_withheld"
        }
      : {})
  };
}
