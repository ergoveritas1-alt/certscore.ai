import {
  auditCanonicalShadowScoreModel,
  deriveCanonicalShadowScore,
  type CanonicalShadowCoverageRow,
  type CanonicalShadowScoreFinding,
  type CanonicalShadowScoreModel
} from "./canonical-shadow-score";
import { buildCanonicalShadowScoreComparisonArtifact } from "./canonical-shadow-score-artifact";
import { buildCanonicalShadowScoreProjectionComponents } from "./canonical-shadow-score-projection-fingerprint";
import {
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  getLunaAcceptedScoreComparisonDifferences
} from "./canonical-shadow-score-luna-decision";

export type CanonicalShadowScoreRunInput = {
  context?: {
    comparisonGroupKey?: string | null;
    comparisonTargetKey?: string | null;
    region?: string | null;
    scanSource?: string | null;
  };
  coverageRows: CanonicalShadowCoverageRow[];
  findings: CanonicalShadowScoreFinding[];
  generatedAt: string;
  inputProjectionFingerprint: string;
  legacy: {
    coverageConfidence: string;
    coverageRatio: number;
    reportInScopeRowCount: number;
    reportUsableEvidenceRatio: number;
    reportUsableRowCount: number;
    score: number | null;
    scoreKind: string;
    scoreSource: string;
    scoreVersion: string;
  };
  model: CanonicalShadowScoreModel;
  scanId: string;
  scoreEligibleCoverageRowIds: string[];
  scoreEligibleFamilies: string[];
};

export function runCanonicalShadowScore(input: CanonicalShadowScoreRunInput) {
  const modelAudit = auditCanonicalShadowScoreModel({
    model: input.model,
    scoreEligibleCoverageRowIds: input.scoreEligibleCoverageRowIds,
    scoreEligibleFamilies: input.scoreEligibleFamilies
  });
  const auditIssues = Object.values(modelAudit).flat();
  if (auditIssues.length > 0) {
    throw new Error(`Canonical shadow score model audit failed: ${auditIssues.join(", ")}`);
  }

  const candidate = deriveCanonicalShadowScore({
    coverageRows: input.coverageRows,
    findings: input.findings,
    model: input.model
  });
  return buildCanonicalShadowScoreComparisonArtifact({
    acceptedComparisonDifferences: getLunaAcceptedScoreComparisonDifferences(
      GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
      input.model.version
    ),
    candidate,
    context: input.context,
    generatedAt: input.generatedAt,
    inputProjectionFingerprint: input.inputProjectionFingerprint,
    inputProjectionComponents: buildCanonicalShadowScoreProjectionComponents({
      coverageRows: input.coverageRows,
      findings: input.findings
    }),
    legacy: input.legacy,
    scanId: input.scanId
  });
}
