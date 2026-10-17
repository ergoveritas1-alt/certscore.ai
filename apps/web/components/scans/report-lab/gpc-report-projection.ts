import { buildCanonicalGpcResponseProjection } from "../../../lib/scans/gpc-response-projection";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import type { GpcResponseReportProjection } from "./shadow-report-data";

export function gpcSummaryLabel(projection: GpcResponseReportProjection): string {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") {
    return projection.headline;
  }
  const response = projection.assessment.status === "indeterminate"
    ? ""
    : projection.comparisonHeadline;
  return projection.assessment.observation.status === "complete"
    ? ["GPC signal observed", response].filter(Boolean).join(" · ")
    : [projection.headline, response].filter(Boolean).join(" · ");
}

export function gpcCardActivity(projection: GpcResponseReportProjection): string | null {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3" ||
    projection.assessment.observation.status === "unavailable") {
    return null;
  }
  const { requests } = projection.assessment.observation;
  const classified = requests.classifiedCount;
  const collection = requests.collectionCount;
  const complete = projection.assessment.observation.status === "complete" && requests.complete;
  if (classified === 0) return complete ? "No classified tracking requests were observed with GPC enabled." : null;
  const advertising = requests.advertisingCollectionCount;
  return `With GPC enabled, we observed ${classified} classified tracking request${classified === 1 ? "" : "s"}${collection > 0 ? `, including ${collection} collection request${collection === 1 ? "" : "s"}` : ""}.${advertising ? ` Verified advertising collection: ${advertising} request${advertising === 1 ? "" : "s"}.` : ""}${complete ? "" : " Capture was limited; these counts describe retained activity only."}`;
}

export function gpcCardResponse(projection: GpcResponseReportProjection): string {
  if (projection.assessment.status === "no_observable_response" && projection.assessment.comparison.comparable && projection.assessment.comparison.deltas.trackers.baselineCount === 0 &&
      projection.assessment.comparison.deltas.trackers.gpcCount === 0) return projection.coverageSummary;
  if (projection.assessment.status === "indeterminate") {
    return gpcCardActivity(projection) ?? "See retained GPC observations.";
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
