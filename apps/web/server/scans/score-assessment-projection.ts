import { createHash } from "node:crypto";
import type { VersionedScoreAssessmentInput } from "./score-assessment-repository";

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
  presentationDecision?: { status?: unknown } | null;
  unifiedFindingId?: unknown;
};

function boundedFindingIds(packets: UnifiedFindingPacket[]) {
  return [...new Set(packets.flatMap((packet) => {
    if (packet.presentationDecision?.status !== "surfaced") return [];
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
