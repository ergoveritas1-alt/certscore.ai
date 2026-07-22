"use server";

import { buildCanonicalGdprEprivacyShadowProjection } from "../../lib/pulse/projection";
import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import {
  buildLegacyGdprEprivacyVersionedAssessmentInput,
  LEGACY_GDPR_EPRIVACY_SCORE_VERSION
} from "./score-assessment-projection";
import {
  hasVersionedScoreAssessment,
  persistVersionedScoreAssessment
} from "./score-assessment-repository";

export async function persistCompletedLegacyGdprEprivacyAssessment(input: {
  organizationId: string | null;
  scanId: string;
  scoredAt?: string | null;
}) {
  if (await hasVersionedScoreAssessment({
    scanId: input.scanId,
    scoreKind: "gdpr_eprivacy_evidence",
    scoreVersion: LEGACY_GDPR_EPRIVACY_SCORE_VERSION
  })) {
    return { inserted: false, reason: "already_persisted" as const };
  }
  const rawRecord = input.organizationId
    ? await getScanById({ organizationId: input.organizationId, scanId: input.scanId })
    : await getAnonymousScanById(input.scanId);
  if (!rawRecord || rawRecord.scan.status !== "completed") {
    return { inserted: false, reason: "scan_not_completed_or_missing" as const };
  }

  const scanRecord = await materializeLocalV2DagScanDetail(rawRecord);
  const projection = buildCanonicalGdprEprivacyShadowProjection(scanRecord);
  const scoredAt = input.scoredAt ?? scanRecord.scan.completedAt ?? new Date().toISOString();
  const persisted = await persistVersionedScoreAssessment(buildLegacyGdprEprivacyVersionedAssessmentInput({
    assessment: projection.legacyScoreAssessment,
    checklistRows: projection.checklistRows,
    scanId: input.scanId,
    scoredAt,
    unifiedFindings: projection.unifiedFindings
  }));
  return { ...persisted, reason: persisted.inserted ? "inserted" as const : "already_persisted" as const };
}
