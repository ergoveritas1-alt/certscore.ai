import "server-only";

import { createHash } from "node:crypto";
import { buildCanonicalGdprEprivacyShadowProjection } from "../../lib/pulse/projection";
import {
  buildCanonicalShadowScoreInput,
  GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS,
  GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES
} from "../../lib/scans/canonical-shadow-score-input";
import { GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL } from "../../lib/scans/canonical-shadow-score-model";
import { runCanonicalShadowScore } from "../../lib/scans/canonical-shadow-score-run";
import { getPublicScanByIdForReadOnlyAnalysis } from "./get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "./local-v2-dag-report";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function projectionFingerprint(input: ReturnType<typeof buildCanonicalShadowScoreInput>) {
  return hash(JSON.stringify({
    coverageRows: [...input.coverageRows].sort((left, right) => left.rowId.localeCompare(right.rowId)),
    findings: [...input.findings].sort((left, right) =>
      left.family.localeCompare(right.family) || left.findingId.localeCompare(right.findingId)
    )
  }));
}

export async function buildStoredScanCanonicalShadowScore(scanId: string, generatedAt: string) {
  const storedRecord = await getPublicScanByIdForReadOnlyAnalysis(scanId);
  if (!storedRecord) return null;

  const materializedRecord = await materializeLocalV2DagScanDetail(storedRecord).catch(() => storedRecord);
  const projection = buildCanonicalGdprEprivacyShadowProjection(materializedRecord);
  const scoreInput = buildCanonicalShadowScoreInput({
    checklistRows: projection.checklistRows,
    unifiedFindings: projection.unifiedFindings
  });
  const domainKey = materializedRecord.scan.domainHostname
    ? hash(materializedRecord.scan.domainHostname.toLowerCase())
    : null;

  return runCanonicalShadowScore({
    context: {
      comparisonGroupKey: domainKey,
      region: materializedRecord.scan.provenance.lambdaAwsRegion,
      scanSource: materializedRecord.scan.scanFromValue
    },
    coverageRows: scoreInput.coverageRows,
    findings: scoreInput.findings,
    generatedAt,
    inputProjectionFingerprint: projectionFingerprint(scoreInput),
    legacy: {
      score: projection.legacyScoreAssessment.score,
      scoreKind: projection.legacyScoreAssessment.scoreKind,
      scoreSource: projection.legacyScoreAssessment.scoreSource,
      scoreVersion: projection.legacyScoreAssessment.scoreVersion
    },
    model: GDPR_EPRIVACY_SHADOW_CANDIDATE_V1_MODEL,
    scanId,
    scoreEligibleCoverageRowIds: [...GDPR_EPRIVACY_SHADOW_SCORE_COVERAGE_ROW_IDS],
    scoreEligibleFamilies: [...GDPR_EPRIVACY_SHADOW_SCORE_ELIGIBLE_FAMILIES]
  });
}
