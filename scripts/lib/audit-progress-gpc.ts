/** Daily audit of returned, source-bound paired facts. No capture or inference. */
import { gpcBoundedObservationSchema } from "../../packages/certscore-api-contracts/src/gpc-bounded-observation";
import { gpcActivityComparisonSchema } from "../../packages/certscore-api-contracts/src/gpc-activity-comparison";
import { readBoundGpcCollectionComparison } from "../../packages/certscore-api-contracts/src/gpc-collection-comparison";
import { readBoundGpcCmpStateComparison } from "../../packages/certscore-api-contracts/src/gpc-cmp-state-comparison";
const denominator = "Readable reportable scans; missing/unbound paired evidence stays unavailable";
export const GPC_PAIR_METRICS = [
  ["pair", "GPC paired request evidence", ["measured"]],
  ["cmp", "GPC paired CMP state evidence", ["available"]],
  ["window", "GPC paired request window", []],
  ["collection", "GPC paired successful-collection evidence", ["retained_samples"]],
  ["identifiers", "GPC paired identifier evidence scope", []],
  ["sample_cap", "GPC collection sample cap", []],
].map(([id, label, success]) => ({ id: `detail.gpc.paired_${id}`, label: label as string, group: "GPC details", denominator, success: success as string[] }));
export const GPC_PAIR_QUANTITIES = [
  ["duration_ms", "GPC matched request interval", "milliseconds"],
  ...["baseline", "gpc"].flatMap(side => [
    [`${side}.advertising_requests`, `${side === "baseline" ? "Without" : "With"} GPC advertising/marketing requests`, "requests"],
    [`${side}.analytics_requests`, `${side === "baseline" ? "Without" : "With"} GPC analytics/replay requests`, "requests"],
    [`${side}.collection_sample`, `${side === "baseline" ? "Without" : "With"} GPC retained successful collection sample`, "requests"],
    [`${side}.identified_sample`, `${side === "baseline" ? "Without" : "With"} GPC retained identifier/audience sample`, "requests"],
  ]),
].map(([id, label, unit]) => ({ id: `gpc.paired.${id}`, label: label!, unit: unit!, path: "validated_gpc_pair_only" }));
export const GPC_SESSION_METRICS = [
  { id: "detail.gpc.session_collection", label: "Full GPC visit retained advertising collection", group: "GPC details", denominator, success: [] as string[] },
  { id: "detail.gpc.session_request_coverage", label: "Full GPC visit request coverage", group: "GPC details", denominator, success: [] as string[] },
];
export const GPC_SESSION_QUANTITIES = [
  ["advertising_collection", "Full GPC visit retained advertising collection", "requests"],
  ["classified_requests", "Full GPC visit retained classified requests", "requests"],
  ["through_ms", "Full GPC visit retained request horizon after document commit", "milliseconds"],
].map(([id, label, unit]) => ({ id: `gpc.session.${id}`, label: label!, unit: unit!, path: "validated_gpc_session_only" }));
export function pairedGpcAudit(report: Record<string, any>) {
  const g = report.gpcResponse ?? {}, value = g.activityComparison;
  const states: Record<string, string> = Object.fromEntries([...GPC_PAIR_METRICS, ...GPC_SESSION_METRICS].map(m => [m.id, "unavailable"]));
  const measurements: Record<string, number> = {};
  let sessionScope = "unavailable";
  const parsedObservation = gpcBoundedObservationSchema.safeParse(g.observation);
  if (g.cmpStateComparison !== undefined) states["detail.gpc.paired_cmp"] =
    g.comparison && parsedObservation.success && readBoundGpcCmpStateComparison(g.cmpStateComparison, { ...g, observation: parsedObservation.data }, report.scanId) ? "available" : "invalid_or_unbound";
  if (g.contractVersion === "certscore.gpc-response-assessment.v3" && parsedObservation.success) {
    const o = parsedObservation.data;
    if (o.scanId === report.scanId && o.sourceSha256 === g.comparison?.gpcArtifact?.sha256 && o.sessionSha256 && o.documentUrlSha256 &&
      o.positiveEvidence?.representativeDocument && o.delivery.httpHeaderRetained && o.delivery.mainNavigatorReadbackRetained) {
      const n = o.requests.advertisingCollectionCount;
      if (n !== undefined) {
        measurements["gpc.session.advertising_collection"] = n;
        states["detail.gpc.session_collection"] = n > 0 ? "positive_retained" : "no_positive_retained_in_sample";
      }
      measurements["gpc.session.classified_requests"] = o.requests.classifiedCount;
      if (o.requests.throughMs !== null && o.requests.documentCommittedAtMs !== null && o.requests.throughMs >= o.requests.documentCommittedAtMs)
        measurements["gpc.session.through_ms"] = o.requests.throughMs - o.requests.documentCommittedAtMs;
      states["detail.gpc.session_request_coverage"] = o.requests.complete ? "complete" : "limited";
      sessionScope = `${o.contractVersion}/${o.requests.advertisingCollectionQualification?.policyVersion ?? "unavailable"}/${o.requests.complete ? "complete" : "limited"}`;
    }
  }
  if (value === undefined) return { states, measurements, sessionScope, scope: "unavailable" };
  const { collectionComparison, ...core } = value && typeof value === "object" ? value : {};
  const parsed = gpcActivityComparisonSchema.safeParse(core);
  if (!parsed.success || parsed.data.scanId !== report.scanId ||
    parsed.data.sourceHashes.baseline !== g.comparison?.baselineArtifact?.sha256 ||
    parsed.data.sourceHashes.gpc !== g.comparison?.gpcArtifact?.sha256) {
    states["detail.gpc.paired_pair"] = "invalid_or_unbound"; return { states, measurements, sessionScope, scope: "unavailable" };
  }
  const p = parsed.data;
  states["detail.gpc.paired_pair"] = "measured";
  states["detail.gpc.paired_window"] = p.durationMs < 3000 ? "below_three_seconds" : p.durationMs < 5000 ? "three_to_five_seconds" : "at_least_five_seconds";
  measurements["gpc.paired.duration_ms"] = p.durationMs;
  for (const side of ["baseline", "gpc"] as const) {
    measurements[`gpc.paired.${side}.advertising_requests`] = p.activity.advertisingMarketing[side === "baseline" ? "baselineRequests" : "gpcRequests"];
    measurements[`gpc.paired.${side}.analytics_requests`] = p.activity.analyticsReplay[side === "baseline" ? "baselineRequests" : "gpcRequests"];
  }
  const candidate = readBoundGpcCollectionComparison(collectionComparison, g, report.scanId);
  const c = candidate && gpcActivityComparisonSchema.safeParse({ ...p, collectionComparison: candidate }).success ? candidate : undefined;
  if (c) {
    states["detail.gpc.paired_collection"] = "retained_samples";
    states["detail.gpc.paired_sample_cap"] = c.baseline.rowsTruncated || c.gpc.rowsTruncated ? "capped" : "not_capped";
    states["detail.gpc.paired_identifiers"] = `baseline_${c.baseline.identifierCoverage}__gpc_${c.gpc.identifierCoverage}`;
    for (const side of ["baseline", "gpc"] as const) {
      measurements[`gpc.paired.${side}.collection_sample`] = c[side].rows.length;
      measurements[`gpc.paired.${side}.identified_sample`] = c[side].rows.filter(r => r.identifierActivity !== "not_established").length;
    }
  } else if (collectionComparison) states["detail.gpc.paired_collection"] = "invalid_or_unbound";
  return { states, measurements, sessionScope,
    scope: `${p.contractVersion}/${p.evidencePolicy ?? "legacy"}/window_${p.durationMs}ms/${c?.contractVersion ?? "no_collection_packet"}` };
}
