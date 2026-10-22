import { buildCanonicalGpcResponseProjection, describeMeasuredGpcActivity } from "../../../lib/scans/gpc-response-projection";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import type { GpcResponseReportProjection } from "./shadow-report-data";
import type { ActionTimelineProjection } from "../../../lib/scans/action-timeline-projection";

/** Timing from the canonical finding's verified observation, never from raw lane signals. */
export function projectGpcTimeline(projection: GpcResponseReportProjection | null | undefined): ActionTimelineProjection | null {
  if (projection?.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") return null;
  const observation = projection.assessment.observation;
  if (observation.status === "unavailable" || !observation.delivery.httpHeaderRetained || !observation.delivery.mainNavigatorReadbackRetained) return null;
  const requests = observation.requests;
  const eligibleIds = new Set(requests.advertisingCollectionEvidenceIds ?? []);
  const events: ActionTimelineProjection["events"] = [{ at: "0s", atMs: 0, label: "GPC visit", detail: "GPC verified on the page request and in the browser", tone: "positive" }];
  const recipients = new Map<string, { label: string; atMs: number }>();
  for (const row of requests.advertisingCollectionRecipients?.rows ?? []) {
    if (!eligibleIds.has(row.evidenceId) || row.observedAtMs === undefined || !Number.isFinite(row.observedAtMs) || row.observedAtMs < 0 ||
        requests.throughMs != null && row.observedAtMs > requests.throughMs) continue;
    const existing = recipients.get(row.entityId);
    if (!existing || row.observedAtMs < existing.atMs) recipients.set(row.entityId, { label: row.label, atMs: row.observedAtMs });
  }
  for (const { label, atMs } of recipients.values()) events.push({ at: `${Math.round(atMs / 10) / 100}s`, atMs,
    label: "Advertising collection", detail: label, vendor: label, tone: "concern" });
  if (requests.throughMs != null && requests.throughMs > 0) events.push({ at: `${Math.round(requests.throughMs / 10) / 100}s`,
    atMs: requests.throughMs, label: "Observation end", detail: "Retained GPC visit closed", tone: "neutral" });
  if (events.length < 2) return null;
  events.sort((a, b) => a.atMs - b.atMs);
  return { clockLabel: "Times from GPC visit start", coverage: observation.status === "complete" && requests.complete ? "complete" : "limited", events };
}

export function gpcSummaryLabel(projection: GpcResponseReportProjection): string {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") {
    return projection.headline;
  }
  const response = projection.activityComparison ? describeMeasuredGpcActivity(projection.activityComparison)!.headline : projection.assessment.status === "indeterminate"
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
  if (classified === 0) return complete ? "No classified tracking requests were identified in the retained GPC sample." : null;
  const advertising = requests.advertisingCollectionCount;
  return `Retained GPC request sample: ${classified} classified tracking request${classified === 1 ? "" : "s"}${collection > 0 ? `, including ${collection} collection request${collection === 1 ? "" : "s"}` : ""}.${advertising ? ` Verified advertising collection: ${advertising} request${advertising === 1 ? "" : "s"}.` : ""}${complete ? "" : " Capture was limited; these counts describe retained activity only."}`;
}

export function gpcCardResponse(projection: GpcResponseReportProjection): string {
  const measured = describeMeasuredGpcActivity(projection.activityComparison);
  if (measured) return measured.summary;
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
    vendorFindings: projection.vendorFindings,
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

/** Describes only recipients already attributed to qualifying canonical evidence.
 * Grouping and timing never create a finding or alter policy eligibility. */
export function gpcCollectionRecipients(projection: GpcResponseReportProjection) {
  if (projection.assessment.contractVersion !== "certscore.gpc-response-assessment.v3") return [];
  const rows = projection.assessment.observation.requests.advertisingCollectionRecipients?.rows ?? [];
  const qualified = new Set(projection.vendorFindings?.flatMap(row => row.evidenceIds) ?? []);
  const groups = new Map<string, {entityId: string; label: string; count: number; identifiedCount: number; firstMs?: number; lastMs?: number}>();
  for (const row of rows) {
    const group = groups.get(row.entityId) ?? {entityId: row.entityId, label: row.label, count: 0, identifiedCount: 0};
    group.count++;
    if (qualified.has(row.evidenceId)) group.identifiedCount++;
    if (row.observedAtMs !== undefined) {
      group.firstMs = Math.min(group.firstMs ?? row.observedAtMs, row.observedAtMs);
      group.lastMs = Math.max(group.lastMs ?? row.observedAtMs, row.observedAtMs);
    }
    groups.set(row.entityId, group);
  }
  return [...groups.values()];
}
