import { buildGpcImpactAssessment, readVerifiedGpcImpactSource, type GpcImpactSource } from "./gpc-impact-assessment";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { describeAccessReliability } from "./access-reliability";
import { comparePassiveLaneAccess } from "./cross-lane-access";

export type GpcCohortInput = {
  scanId: string; required: boolean;
  /** Operational metadata from the cohort export, not inferred from worker success. */
  publishedObservation?: "complete" | "limited" | "unavailable" | "missing";
  revision?: string; region?: string;
  baseline?: GpcImpactSource; gpc?: GpcImpactSource;
  consent?: GpcImpactSource; policy?: GpcImpactSource;
};
const count = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v => v === k).length]));
const rate = (numerator: number, denominator: number) => ({ numerator, denominator, fraction: denominator ? numerator / denominator : null });

export function buildGpcImpactCohort(input: GpcCohortInput[]) {
  if (input.length > 10000 || new Set(input.map(r => r.scanId)).size !== input.length) throw Error("Cohort requires at most 10,000 unique scan IDs.");
  return summarizeGpcImpactCohort(input.map(assessGpcCohortRow));
}
export function assessGpcCohortRow(r: GpcCohortInput) {
    const raw = readVerifiedGpcImpactSource(r.gpc);
    const gpc = raw?.scanId === r.scanId ? raw : null;
    const impact = buildGpcImpactAssessment(r);
    const observation = buildGpcProductionObservation({ scanId: r.scanId, source: r.gpc ? { ...r.gpc, pointer: { ...r.gpc.pointer, uri: "local-retained-worker" } } : undefined });
    const cmps = [...new Set(gpc?.normalizedVendorObservations.filter(v => v.purpose === "consent_management").map(v => `${v.vendor}|${v.product ?? "unspecified"}`) ?? [])].sort();
    return { scanId: r.scanId, required: r.required, publishedObservation: r.publishedObservation ?? "missing",
      revision: r.revision ?? "unknown", region: gpc?.region ?? r.region ?? "unknown", cmps,
      observation, impact, access: describeAccessReliability(gpc),
      crossLaneAccess: comparePassiveLaneAccess(r.scanId, { runtime_evidence: r.baseline, gpc_observation: r.gpc,
        consent_proof: r.consent, policy_evidence: r.policy }),
      requestGapOutcomes: count(gpc?.gpcObservationSession?.requestDiagnostics?.missingHeaders.map(x => `${x.failure}:${x.failureCode}`) ?? []),
    };
}
export function summarizeGpcImpactCohort(rows: ReturnType<typeof assessGpcCohortRow>[]) {
  if (rows.length > 10000 || new Set(rows.map(r => r.scanId)).size !== rows.length) throw Error("Cohort requires at most 10,000 unique scan IDs.");
  type Row = typeof rows[number];
  const summarize = (rs: Row[]) => {
    const required = rs.filter(r => r.required), measured = required.filter(r => r.impact.status === "measured");
    const accessible = required.filter(r => r.access.positiveAccess);
    return { required: required.length, legitimatelyExcluded: rs.length - required.length,
      publishedCompletion: rate(required.filter(r => r.publishedObservation === "complete").length, required.length),
      publishedOutcomes: count(required.map(r => r.publishedObservation)),
      retainedSourceCoverage: rate(required.filter(r => r.access.reason !== "source_unverified").length, required.length),
      retainedEvidenceCompletion: rate(required.filter(r => r.observation.status === "complete").length, required.length),
      verifiedDelivery: rate(required.filter(r => r.observation.delivery.httpHeaderRetained && r.observation.delivery.mainNavigatorReadbackRetained).length, required.length),
      completionOnPositivelyVerifiedAccessiblePages: rate(accessible.filter(r => r.observation.status === "complete").length, accessible.length),
      matchedWindowCoverage: rate(measured.length, required.length),
      // Operational calibration only. Short or missing comparisons never
      // change independently verified positive collection or scoring policy.
      pairedWindowCoverage: {
        measuredPairs: measured.length,
        belowThreeSeconds: measured.filter(r => r.impact.durationMs! < 3000).length,
        threeToFiveSeconds: measured.filter(r => r.impact.durationMs! >= 3000 && r.impact.durationMs! < 5000).length,
        atLeastFiveSeconds: measured.filter(r => r.impact.durationMs! >= 5000).length,
        unavailable: required.length - measured.length,
      },
      windows: Object.fromEntries([...new Set([250, 500, 1000, ...measured.map(r => r.impact.durationMs!)])].sort((a,b) => a-b).map(ms => {
        const group = measured.filter(r => r.impact.durationMs === ms);
        return [ms, { pairs: group.length, activity: Object.fromEntries((["trackers", "advertisingMarketing", "analyticsReplay"] as const).map(key => {
          const active = group.filter(r => r.impact.activity![key].baselineCount > 0);
          return [key, { outcomes: count(group.map(r => r.impact.activity![key].outcome)),
            netReductionAmongBaselineActive: rate(active.filter(r => r.impact.activity![key].netChange < 0).length, active.length),
            pureReductionAmongBaselineActive: rate(active.filter(r => r.impact.activity![key].removedCount > 0 && r.impact.activity![key].newCount === 0).length, active.length),
            baselineRequests: group.reduce((n, r) => n + r.impact.activity![key].baselineRequests, 0),
            gpcRequests: group.reduce((n, r) => n + r.impact.activity![key].gpcRequests, 0),
          }];
        })) }];
      })),
      cmp: { received: required.filter(r => r.impact.cmpRecordedState.received === "received").length,
        pairedReadable: required.filter(r => r.impact.cmpComparison?.comparable).length,
        saleChanges: count(required.map(r => r.impact.cmpComparison?.saleChange ?? "unknown")),
        sharingChanges: count(required.map(r => r.impact.cmpComparison?.sharingChange ?? "unknown")) },
      accessReasons: count(required.map(r => r.access.reason)),
      crossLaneAccessPatterns: count(required.map(r => r.crossLaneAccess.pattern)),
      accessClassifierDisagreements: required.filter(r => r.access.contradictoryAccessLabels).length,
      semanticDiagnosticCodes: count(required.flatMap(r => r.access.semanticDiagnosticCodes)),
      comparisonLimitations: count(required.flatMap(r => r.impact.limitationKeys)),
    };
  };
  const grouped = (key: (r: Row) => string) => Object.fromEntries([...new Set(rows.map(key))].sort().map(k => [k, summarize(rows.filter(r => key(r) === k))]));
  return { contractVersion: "certscore.gpc-impact-cohort.v1", mode: "internal_only", productionProjectable: false,
    scoreEffect: "none", causedByGpc: "not_established", operationalMetadataSource: "caller_cohort_manifest",
    summary: summarize(rows), byRevision: grouped(r => r.revision), byRegion: grouped(r => r.region),
    byCmpSet: grouped(r => r.cmps.length ? JSON.stringify(r.cmps) : "unknown"), rows };
}
