"use server";

import { buildCanonicalGdprEprivacyShadowProjection } from "../../lib/pulse/projection";
import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import {
  buildApprovedGdprEprivacyPostureVersionedAssessmentInput,
  buildLegacyGdprEprivacyVersionedAssessmentInput,
  buildShadowGdprEprivacyVersionedAssessmentInput,
  LEGACY_GDPR_EPRIVACY_SCORE_VERSION
} from "./score-assessment-projection";
import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel
} from "../../lib/scans/canonical-shadow-score-luna-decision";
import {
  hasVersionedScoreAssessment,
  persistVersionedScoreAssessment
} from "./score-assessment-repository";
import { classifyVersionedScoreLifecycleTime } from "./score-assessment-lifecycle-policy";

export async function persistCompletedLegacyGdprEprivacyAssessment(input: {
  organizationId: string | null;
  scanId: string;
  scoredAt?: string | null;
}) {
  if (input.scoredAt) {
    const disposition = classifyVersionedScoreLifecycleTime(input.scoredAt);
    if (disposition === "historical") {
      return { inserted: false, reason: "historical_scan_not_backfilled" as const };
    }
    if (disposition === "missing_or_invalid") {
      return { inserted: false, reason: "score_time_missing_or_invalid" as const };
    }
  }
  const legacyAlreadyPersisted = await hasVersionedScoreAssessment({
    scanId: input.scanId,
    scoreKind: "gdpr_eprivacy_evidence",
    scoreVersion: LEGACY_GDPR_EPRIVACY_SCORE_VERSION
  });
  const rawRecord = input.organizationId
    ? await getScanById({ organizationId: input.organizationId, scanId: input.scanId })
    : await getAnonymousScanById(input.scanId);
  if (!rawRecord || rawRecord.scan.status !== "completed") {
    return { inserted: false, reason: "scan_not_completed_or_missing" as const };
  }

  const scoredAt = input.scoredAt ?? rawRecord.scan.completedAt;
  if (!scoredAt) {
    return { inserted: false, reason: "score_time_missing_or_invalid" as const };
  }
  const disposition = classifyVersionedScoreLifecycleTime(scoredAt);
  if (disposition === "historical") {
    return { inserted: false, reason: "historical_scan_not_backfilled" as const };
  }
  if (disposition === "missing_or_invalid") {
    return { inserted: false, reason: "score_time_missing_or_invalid" as const };
  }

  const scanRecord = await materializeLocalV2DagScanDetail(rawRecord);
  const projection = buildCanonicalGdprEprivacyShadowProjection(scanRecord);
  const persisted = legacyAlreadyPersisted
    ? { createdAt: null, id: null, inserted: false }
    : await persistVersionedScoreAssessment(buildLegacyGdprEprivacyVersionedAssessmentInput({
        assessment: projection.legacyScoreAssessment,
        checklistRows: projection.checklistRows,
        scanId: input.scanId,
        scoredAt,
        unifiedFindings: projection.unifiedFindings
      }));

  let shadowInserted = false;
  let shadowModelVersion: string | null = null;
  let shadowReason: "already_persisted" | "inserted" | "persistence_failed" = "persistence_failed";
  let postureInserted = false;
  let postureReason: "approval_pending" | "already_persisted" | "inserted" = "approval_pending";
  try {
    const { buildMaterializedScanCanonicalShadowScore } = await import("./canonical-shadow-score-service");
    const { persistCanonicalShadowScoreComparison } = await import("./canonical-shadow-score-monitor-repository");
    const shadowArtifact = buildMaterializedScanCanonicalShadowScore(scanRecord, scoredAt);
    shadowModelVersion = shadowArtifact.candidate.modelVersion;
    const shadowAlreadyPersisted = await hasVersionedScoreAssessment({
      scanId: input.scanId,
      scoreKind: "gdpr_eprivacy_risk_shadow",
      scoreVersion: shadowArtifact.candidate.modelVersion
    });
    const shadowPersisted = shadowAlreadyPersisted
      ? { createdAt: null, id: null, inserted: false }
      : await persistVersionedScoreAssessment(buildShadowGdprEprivacyVersionedAssessmentInput({
          artifact: shadowArtifact,
          scoredAt
        }));
    shadowInserted = shadowPersisted.inserted;
    await persistCanonicalShadowScoreComparison(shadowArtifact);
    shadowReason = shadowPersisted.inserted ? "inserted" : "already_persisted";

    if (isLunaScoreDecisionApprovedForModel(
      GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
      shadowArtifact.candidate.modelVersion
    )) {
      const postureAlreadyPersisted = await hasVersionedScoreAssessment({
        scanId: input.scanId,
        scoreKind: "gdpr_eprivacy_posture",
        scoreVersion: shadowArtifact.candidate.modelVersion
      });
      const posturePersisted = postureAlreadyPersisted
        ? { createdAt: null, id: null, inserted: false }
        : await persistVersionedScoreAssessment(buildApprovedGdprEprivacyPostureVersionedAssessmentInput({
            artifact: shadowArtifact,
            scoredAt
          }));
      postureInserted = posturePersisted.inserted;
      postureReason = posturePersisted.inserted ? "inserted" : "already_persisted";
    }
  } catch (error) {
    console.error("[score-assessment] candidate shadow persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.scanId,
      scoreKind: "gdpr_eprivacy_risk_shadow"
    });
  }

  return {
    ...persisted,
    reason: persisted.inserted ? "inserted" as const : "already_persisted" as const,
    shadowInserted,
    shadowModelVersion,
    shadowReason,
    postureInserted,
    postureReason
  };
}
