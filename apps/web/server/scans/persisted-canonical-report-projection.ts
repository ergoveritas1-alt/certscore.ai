import type { ScanReportUnifiedFindingState } from "../../lib/scans/scan-report-unified-findings";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import type { GdprEprivacyCoverageChecklistItem } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { ScanDetailResponse } from "./get-scan-by-id";
import type { VersionedScoreAssessmentInput } from "./score-assessment-repository";
import type { ChecklistEvidenceIndex } from "../../lib/scans/checklist-evidence-index";
import {
  collectionSurfaceAssessmentSchema,
  preConsentBrowserStorageProjectionSchema,
  type CollectionSurfaceAssessment,
  type PreConsentBrowserStorageProjection,
} from "@certscore/contracts";
import {
  filterGdprEprivacyChecklistPresentationForReport,
  isGdprEprivacyChecklistPresentation,
  type GdprEprivacyChecklistPresentation,
} from "../../lib/scans/gdpr-eprivacy-checklist-presentation";

export const PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION =
  "persisted-canonical-report-projection-v7";
const LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V6 =
  "persisted-canonical-report-projection-v6";
const LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V5 =
  "persisted-canonical-report-projection-v5";
const LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V4 =
  "persisted-canonical-report-projection-v4";
const LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V3 =
  "persisted-canonical-report-projection-v3";
const LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V2 =
  "persisted-canonical-report-projection-v2";

export type PersistedCanonicalReportProjection = {
  artifactVersion:
    | typeof PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION
    | typeof LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V6
    | typeof LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V5
    | typeof LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V4
    | typeof LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V3
    | typeof LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V2;
  checklistPresentation?: GdprEprivacyChecklistPresentation;
  collectionSurfaceAssessment: CollectionSurfaceAssessment | null;
  preConsentBrowserStorageProjection?: PreConsentBrowserStorageProjection;
  checklistRows: GdprEprivacyCoverageChecklistItem[];
  derivedContext: ScanReportUnifiedFindingState["derivedContext"];
  evidenceIndex?: ChecklistEvidenceIndex;
  globalUnifiedFindings: UnifiedFindingDisplayPacket[];
  legacyScoreAssessmentInput: VersionedScoreAssessmentInput;
  normalizedConcerns: NonNullable<ScanReportUnifiedFindingState["normalizedConcerns"]>;
  ownerUnifiedFindingIds?: string[];
  ownerUnifiedFindings: UnifiedFindingDisplayPacket[];
  topFindingIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function reportChecklistPresentation(value: unknown) {
  return isGdprEprivacyChecklistPresentation(value)
    ? filterGdprEprivacyChecklistPresentationForReport(value)
    : undefined;
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
    (
      candidate.artifactVersion !== PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION &&
      candidate.artifactVersion !== LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V6 &&
      candidate.artifactVersion !== LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V5 &&
      candidate.artifactVersion !== LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V4 &&
      candidate.artifactVersion !== LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V3 &&
      candidate.artifactVersion !== LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V2
    ) ||
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

  const usesIndexedEvidence =
    candidate.artifactVersion === PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION ||
    candidate.artifactVersion === LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V6 ||
    candidate.artifactVersion === LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V5 ||
    candidate.artifactVersion === LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V4 ||
    candidate.artifactVersion === LEGACY_PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION_V3;
  if (
    usesIndexedEvidence &&
    (
      !isRecord(candidate.evidenceIndex) ||
      !Array.isArray(candidate.ownerUnifiedFindingIds) ||
      candidate.ownerUnifiedFindingIds.some((value) => typeof value !== "string")
    )
  ) {
    return null;
  }
  if (
    candidate.artifactVersion === PERSISTED_CANONICAL_REPORT_PROJECTION_VERSION &&
    (
      !isGdprEprivacyChecklistPresentation(candidate.checklistPresentation) ||
      !preConsentBrowserStorageProjectionSchema.safeParse(
        candidate.preConsentBrowserStorageProjection
      ).success ||
      !(
        candidate.collectionSurfaceAssessment === null ||
        collectionSurfaceAssessmentSchema.safeParse(candidate.collectionSurfaceAssessment).success
      )
    )
  ) {
    return null;
  }

  if (usesIndexedEvidence) {
    const globalById = new Map(
      (candidate.globalUnifiedFindings as UnifiedFindingDisplayPacket[]).map((finding) => [
        finding.unifiedFindingId,
        finding,
      ]),
    );
    if ((candidate.ownerUnifiedFindingIds as string[]).some((id) => !globalById.has(id))) {
      return null;
    }
    const ownerUnifiedFindings = (candidate.ownerUnifiedFindingIds as string[])
      .flatMap((id) => globalById.get(id) ?? []);
    return {
      ...candidate,
      checklistPresentation: reportChecklistPresentation(candidate.checklistPresentation),
      ownerUnifiedFindings,
    } as PersistedCanonicalReportProjection;
  }

  return {
    ...candidate,
    checklistPresentation: reportChecklistPresentation(candidate.checklistPresentation),
  } as PersistedCanonicalReportProjection;
}
