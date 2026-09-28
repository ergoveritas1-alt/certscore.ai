import { buildCanonicalGpcResponseProjection } from "../../../lib/scans/gpc-response-projection";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import type { GpcResponseReportProjection } from "./shadow-report-data";

export function gpcSummaryLabel(projection: GpcResponseReportProjection): string {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") {
    return projection.headline;
  }
  const response = projection.assessment.status === "indeterminate"
    ? "Response not determined"
    : projection.comparisonHeadline;
  return projection.assessment.observation.status === "complete"
    ? `GPC signal observed · ${response}`
    : `${projection.headline} · ${response}`;
}

export function gpcCardActivity(projection: GpcResponseReportProjection): string | null {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3" ||
    projection.assessment.observation.status !== "complete") {
    return null;
  }
  const { requests } = projection.assessment.observation;
  if (!requests.complete) return null;
  const classified = requests.classifiedCount;
  const collection = requests.collectionCount;
  if (classified === 0) return "No classified tracking requests were observed with GPC enabled.";
  return `With GPC enabled, we observed ${classified} classified tracking request${classified === 1 ? "" : "s"}${collection > 0 ? `, including ${collection} collection request${collection === 1 ? "" : "s"}` : ""}.`;
}

export function gpcCardResponse(projection: GpcResponseReportProjection): string {
  if (projection.assessment.status === "indeterminate") {
    return "The paired scan could not determine whether classified tracking activity changed with GPC.";
  }
  return projection.assessment.status === "responsive"
    ? "The paired scan observed reduced classified tracking activity with GPC."
    : "The paired scan did not observe a qualifying reduction in classified tracking activity with GPC.";
}

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
    comparisonHeadline: projection.comparisonHeadline,
    coverageSummary: projection.coverageSummary,
    evidenceRefs: [
      assessment.comparison.baselineArtifact?.uri ?? "",
      assessment.comparison.gpcArtifact?.uri ?? "",
      ...assessment.comparison.evidenceRefs,
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index).slice(0, 32),
    headline: projection.headline,
    summary: projection.summary,
    observedFacts: projection.observedFacts,
    activityComparison: projection.activityComparison,
  };
}
