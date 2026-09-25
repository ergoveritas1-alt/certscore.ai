import { gpcActivityComparisonSchema, type GpcResponseAssessment } from "@certscore/contracts";

/** Keep the measured projection attached to the exact response source pair. */
export function readGpcActivityComparison(value: unknown, assessment: GpcResponseAssessment, scanId?: string) {
  const parsed = gpcActivityComparisonSchema.safeParse(value);
  if (!parsed.success || (scanId !== undefined && parsed.data.scanId !== scanId) ||
    parsed.data.sourceHashes.baseline !== assessment.comparison.baselineArtifact?.sha256 ||
    parsed.data.sourceHashes.gpc !== assessment.comparison.gpcArtifact?.sha256) return undefined;
  return parsed.data;
}
