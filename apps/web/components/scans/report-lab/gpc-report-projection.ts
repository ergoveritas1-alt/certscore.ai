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
  if (projection.assessment.status === "responsive") {
    const activity = projection.activityComparison?.activity;
    if (activity && activity.advertisingMarketing.baselineRequests > 0 &&
      activity.advertisingMarketing.gpcRequests === 0 &&
      activity.analyticsReplay.gpcRequests > 0 &&
      activity.analyticsReplay.baselineRequests === activity.analyticsReplay.gpcRequests) {
      const advertising = activity.advertisingMarketing.baselineRequests;
      const remaining = activity.analyticsReplay.gpcRequests;
      return `Advertising/marketing request${advertising === 1 ? "" : "s"} fell from ${advertising} to 0 with GPC; ${remaining} analytics/replay request${remaining === 1 ? "" : "s"} remained.`;
    }
    const baselineRequests = activity
      ? activity.advertisingMarketing.baselineRequests + activity.analyticsReplay.baselineRequests
      : null;
    const gpcRequests = activity
      ? activity.advertisingMarketing.gpcRequests + activity.analyticsReplay.gpcRequests
      : null;
    return baselineRequests !== null && gpcRequests !== null && gpcRequests > 0 && gpcRequests < baselineRequests
      ? "The paired scan observed a partial reduction in classified tracking activity with GPC."
      : "The paired scan observed reduced classified tracking activity with GPC.";
  }
  return "The paired scan did not observe a qualifying reduction in classified tracking activity with GPC.";
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
