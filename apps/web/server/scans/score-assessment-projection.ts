import { createHash } from "node:crypto";
import type { VersionedScoreAssessmentInput } from "./score-assessment-repository";
import { GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION } from "../../lib/scans/regulatory-coverage-score";

export const CURRENT_GDPR_EPRIVACY_SCORE_VERSION = GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION;

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
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: unknown;
    retainedEvidence?: unknown;
  } | null;
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

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonemptyArray(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function boundedScoringEvidenceSemantics(rows: ChecklistRow[]) {
  return rows.flatMap((row) => {
    if (typeof row.id !== "string" || !row.id.trim()) return [];
    const retained = record(row.criticalEvidence?.retainedEvidence);
    const policyEvidenceAssessment = record(retained.policyEvidenceAssessment);
    return [{
      balancedAcceptDeclineWithoutFirstLayerSettings:
        retained.balancedAcceptDeclineWithoutFirstLayerSettings === true,
      id: row.id.trim().slice(0, 200),
      missingOrIncompleteSourceSignals:
        nonemptyArray(row.criticalEvidence?.missingOrIncompleteSourceSignals),
      nonEssentialItemsPersistingAfterRefusal:
        nonemptyArray(retained.nonEssentialItemsPersistingAfterRefusal),
      optionsControlProminence:
        typeof retained.optionsControlProminence === "string"
          ? retained.optionsControlProminence.slice(0, 100)
          : null,
      persistedVendors: nonemptyArray(retained.persistedVendors),
      policyScoreEffect:
        policyEvidenceAssessment.scoreEffect === "none" ? "none" : null,
      preConsentStorageNotCleared:
        retained.preConsentStorageNotCleared === true ||
        retained.pre_consent_storage_not_cleared === true,
      preConsentStorageNotClearedCount:
        typeof retained.preConsentStorageNotClearedCount === "number"
          ? retained.preConsentStorageNotClearedCount
          : typeof retained.pre_consent_storage_not_cleared_count === "number"
            ? retained.pre_consent_storage_not_cleared_count
            : null,
      promotionEligible:
        typeof retained.promotionEligible === "boolean"
          ? retained.promotionEligible
          : null,
      refusalConfirmed:
        retained.rejectInteractionConfirmed === true ||
        retained.refusalExercised === true,
      refusalSignalContradictsAction:
        retained.refusalSignalContradictsAction === true ||
        retained.refusal_signal_contradicts_action === true,
      scoreEffect: retained.scoreEffect === "none" ? "none" : null
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
  const scoringEvidenceSemantics = boundedScoringEvidenceSemantics(input.checklistRows);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    assessment: {
      coverageConfidence: input.assessment.coverageConfidence,
      coverageRatio: input.assessment.coverageRatio,
      score: input.assessment.score,
      scoreKind: input.assessment.scoreKind,
      scoreSource: input.assessment.scoreSource,
      scoreVersion: input.assessment.scoreVersion
    },
    checklistSemantics,
    inputFindingIds,
    scoringEvidenceSemantics
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
      ? { withholdingReason: `gdpr_eprivacy_posture_score_withheld:${input.assessment.coverageConfidence}` }
      : {})
  };
}
