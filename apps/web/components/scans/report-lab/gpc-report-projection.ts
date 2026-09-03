import { buildCanonicalGpcResponseProjection } from "../../../lib/scans/gpc-response-projection";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import type { GpcResponseReportProjection } from "./shadow-report-data";

export function buildGpcResponseReportProjection(
  findings: UnifiedFindingDisplayPacket[],
): GpcResponseReportProjection | null {
  const projection = buildCanonicalGpcResponseProjection(findings);
  if (!projection) {
    return null;
  }
  const assessment = projection.assessment;

  return {
    assessment,
    californiaDeductionPoints: projection.californiaDeductionPoints,
    evidenceRefs: [
      assessment.comparison.baselineArtifact.uri,
      assessment.comparison.gpcArtifact.uri,
      ...assessment.comparison.evidenceRefs,
    ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 32),
    summary: projection.summary,
  };
}
