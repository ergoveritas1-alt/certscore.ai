import { readBoundGpcCollectionComparison, gpcActivityComparisonSchema, type GpcResponseAssessment } from "@certscore/contracts";

/** Keep the measured projection attached to the exact response source pair. */
export function readGpcActivityComparison(value: unknown, assessment: GpcResponseAssessment, scanId?: string) {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const { collectionComparison, ...core } = candidate;
  const parsed = gpcActivityComparisonSchema.safeParse(core);
  if (!parsed.success || (scanId !== undefined && parsed.data.scanId !== scanId) ||
    parsed.data.sourceHashes.baseline !== assessment.comparison.baselineArtifact?.sha256 ||
    parsed.data.sourceHashes.gpc !== assessment.comparison.gpcArtifact?.sha256) return undefined;
  const collection = readBoundGpcCollectionComparison(collectionComparison, assessment, scanId);
  const withCollection = collection && gpcActivityComparisonSchema.safeParse({ ...parsed.data, collectionComparison: collection });
  return withCollection && withCollection.success ? withCollection.data : parsed.data;
}
