import type { ScanReportUnifiedFindingState } from "../../lib/scans/scan-report-unified-findings";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { VersionedScoreAssessmentInput } from "./score-assessment-repository";

export const PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION =
  "persisted-canonical-report-projection-v1";

export type PersistedCanonicalReportProjection = {
  artifactVersion: typeof PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION;
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  derivedContext: ScanReportUnifiedFindingState["derivedContext"];
  globalUnifiedFindings: UnifiedFindingDisplayPacket[];
  legacyScoreAssessmentInput: VersionedScoreAssessmentInput;
  normalizedConcerns: NonNullable<ScanReportUnifiedFindingState["normalizedConcerns"]>;
  ownerUnifiedFindings: UnifiedFindingDisplayPacket[];
  topFindingIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Returns only a versioned, scan-bound canonical output packet. Consumers
 * must fail closed to their existing canonical derivation path when reading
 * an older projection that predates this packet.
 */
export function getPersistedCanonicalReportProjection(
  scanRecord: Pick<ScanDetailResponse, "scan"> | ScanDetailResponse,
): PersistedCanonicalReportProjection | null {
  const root = scanRecord as unknown as Record<string, unknown>;
  const candidate = root.canonicalReportProjection;
  if (
    !isRecord(candidate) ||
    candidate.artifactVersion !== PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION ||
    !Array.isArray(candidate.checklistRows) ||
    !isRecord(candidate.derivedContext) ||
    !Array.isArray(candidate.globalUnifiedFindings) ||
    !isRecord(candidate.legacyScoreAssessmentInput) ||
    candidate.legacyScoreAssessmentInput.scanId !== scanRecord.scan.id ||
    !Array.isArray(candidate.normalizedConcerns) ||
    !Array.isArray(candidate.ownerUnifiedFindings) ||
    !Array.isArray(candidate.topFindingIds) ||
    candidate.topFindingIds.some((value) => typeof value !== "string")
  ) {
    return null;
  }

  return candidate as PersistedCanonicalReportProjection;
}
