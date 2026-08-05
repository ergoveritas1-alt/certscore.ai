"use server";

import { buildCanonicalGdprEprivacyShadowProjection } from "../../lib/pulse/projection";
import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import type { PublicScanRecord } from "./get-public-scan-record";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import {
  buildLegacyGdprEprivacyVersionedAssessmentInput,
  LEGACY_GDPR_EPRIVACY_SCORE_VERSION
} from "./score-assessment-projection";
import {
  hasVersionedScoreAssessment,
  persistVersionedScoreAssessment
} from "./score-assessment-repository";
import { classifyVersionedScoreLifecycleTime } from "./score-assessment-lifecycle-policy";

function scoreLifecyclePhaseError(phase: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Score lifecycle ${phase} failed: ${message}`, { cause: error });
}

async function runScoreLifecyclePhase<T>(scanId: string, phase: string, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.info(JSON.stringify({
      durationMs: Date.now() - startedAt,
      event: "scan.score_materialization.phase",
      phase,
      scanId,
    }));
    return result;
  } catch (error) {
    throw scoreLifecyclePhaseError(phase, error);
  }
}

function runSynchronousScoreLifecyclePhase<T>(scanId: string, phase: string, operation: () => T): T {
  const startedAt = Date.now();
  try {
    const result = operation();
    console.info(JSON.stringify({
      durationMs: Date.now() - startedAt,
      event: "scan.score_materialization.phase",
      phase,
      scanId,
    }));
    return result;
  } catch (error) {
    throw scoreLifecyclePhaseError(phase, error);
  }
}

export async function persistCompletedLegacyGdprEprivacyAssessment(input: {
  organizationId: string | null;
  scanRecord?: PublicScanRecord;
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
  const legacyAlreadyPersisted = await runScoreLifecyclePhase(input.scanId, "legacy-existence-check", () =>
    hasVersionedScoreAssessment({
      scanId: input.scanId,
      scoreKind: "gdpr_eprivacy_evidence",
      scoreVersion: LEGACY_GDPR_EPRIVACY_SCORE_VERSION
    })
  );
  const rawRecord = input.scanRecord ?? await runScoreLifecyclePhase(input.scanId, "scan-load", () => input.organizationId
    ? getScanById({ organizationId: input.organizationId, scanId: input.scanId })
    : getAnonymousScanById(input.scanId));
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

  const scanRecord = input.scanRecord ?? await runScoreLifecyclePhase(input.scanId, "scan-materialization", () =>
    materializeLocalV2DagScanDetail(rawRecord)
  );
  const projection = runSynchronousScoreLifecyclePhase(input.scanId, "canonical-projection", () =>
    buildCanonicalGdprEprivacyShadowProjection(scanRecord)
  );
  const persisted = legacyAlreadyPersisted
    ? { createdAt: null, id: null, inserted: false }
    : await runScoreLifecyclePhase(input.scanId, "legacy-persistence", () =>
        persistVersionedScoreAssessment(buildLegacyGdprEprivacyVersionedAssessmentInput({
          assessment: projection.legacyScoreAssessment,
          checklistRows: projection.checklistRows,
          scanId: input.scanId,
          scoredAt,
          unifiedFindings: projection.unifiedFindings
        }))
      );

  return {
    ...persisted,
    reason: persisted.inserted ? "inserted" as const : "already_persisted" as const
  };
}
