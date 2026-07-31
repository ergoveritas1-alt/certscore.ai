import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  deriveGdprEprivacyCoverageChecklist,
  type GdprEprivacyCoverageChecklistInput,
  type GdprEprivacyCoverageChecklistItem
} from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
import type { RuntimeCookieEvidenceRow } from "../../lib/scans/runtime-cookie-evidence";
import type { ScanReportUnifiedFindingState } from "../../lib/scans/scan-report-unified-findings";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";

export function deriveSharedScanDetailGdprEprivacyCoverageChecklist(input: {
  coverageLimited: boolean;
  events?: ScanDetailResponse["events"];
  policyEnrichmentCount: number;
  normalizedConcerns?: ScanReportUnifiedFindingState["normalizedConcerns"];
  projectedFindings?: GdprEprivacyCoverageChecklistInput["projectedFindings"];
  runtimeArtifacts: ScanDetailResponse["runtimeArtifacts"];
  runtimeCookieRows?: RuntimeCookieEvidenceRow[];
  runtimeTrackerPriorityRows?: GdprEprivacyCoverageChecklistInput["runtimeTrackerPriorityRows"];
  scanCompleted: boolean;
  snapshot: ScanDetailResponse["snapshot"];
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): GdprEprivacyCoverageChecklistItem[] {
  const runtimeArtifactNormalizedConcerns = input.normalizedConcerns ?? buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: input.runtimeArtifacts,
    validationFindings: []
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: input.coverageLimited,
    events: input.events,
    normalizedConcerns: runtimeArtifactNormalizedConcerns,
    policyEnrichmentCount: input.policyEnrichmentCount,
    runtimeArtifacts: input.runtimeArtifacts,
    scanCompleted: input.scanCompleted,
    snapshot: input.snapshot
  });

  return deriveGdprEprivacyCoverageChecklist({
    coverageLimited: input.coverageLimited,
    coverageOutcomes,
    projectedFindings: input.projectedFindings,
    runtimeCookieRows: input.runtimeCookieRows,
    runtimeTrackerPriorityRows: input.runtimeTrackerPriorityRows,
    scanCompleted: input.scanCompleted,
    unifiedFindings: input.unifiedFindings
  });
}
