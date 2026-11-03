import { buildGpcImpactAssessment, readVerifiedGpcImpactSource, type GpcImpactSource } from "./gpc-impact-assessment";
import { buildGpcActivityComparison } from "./gpc-activity-comparison";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { describeAccessReliability } from "./access-reliability";
import { comparePassiveLaneAccess } from "./cross-lane-access";
import { type CanonicalEvidenceBundle } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture";
import { readOriginalGpcCookieReadBinding } from "./gpc-cookie-read-binding";

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

/** Retained metadata inventory only. This does not qualify a cookie/storage
 * comparison, infer missing observations or create production evidence. */
function retainedStorageMetadata(bundle: CanonicalEvidenceBundle | null) {
  if (!bundle) return { source: "missing_or_unverified" as const, cookieSnapshots: 0, cookieSnapshotsWithCoverage: 0,
    cookieSnapshotsWithOwnDocumentBinding: 0, cookieReadIntervals: [] as { startedAfterCommitMs: number; completedAfterCommitMs: number }[],
    cookieReadIntervalsOmitted: 0, gpcCookieReadBindings: 0, gpcCookieReadIntervals: [] as { startedAfterCommitMs: number; completedAfterCommitMs: number }[],
    gpcCookieReadIntervalsOmitted: 0, storageSnapshots: 0, storageSnapshotsWithReadContext: 0, storageSnapshotsWithCompleteReads: 0 };
  const doc = bundle.gpcImpactCapture?.document;
  const workerDuration = Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt);
  const bound = bundle.cookieSnapshots.filter(snapshot => {
    const c = snapshot.captureCoverage;
    return c && doc && bundle.gpcImpactCapture?.limitationKeys.length === 0 && bundle.gpcImpactCapture.readbackDocumentToken === doc.token &&
      gpcDocumentHash(c.targetUrl) === gpcDocumentHash(bundle.url) &&
      c.documentToken === doc.token && gpcDocumentHash(c.documentUrl) === doc.urlSha256 &&
      c.startedAtMs >= doc.committedAtMs && c.completedAtMs <= workerDuration &&
      snapshot.capturedAtMs >= c.completedAtMs && snapshot.capturedAtMs <= workerDuration;
  });
  const gpcReads = bundle.cookieSnapshots.flatMap(snapshot => {
    const proof = readOriginalGpcCookieReadBinding(bundle, snapshot);
    return proof ? [proof] : [];
  });
  return { source: "original_bytes_verified" as const, cookieSnapshots: bundle.cookieSnapshots.length,
    cookieSnapshotsWithCoverage: bundle.cookieSnapshots.filter(s => s.captureCoverage).length,
    cookieSnapshotsWithOwnDocumentBinding: bound.length,
    cookieReadIntervals: bound.slice(0, 8).map(s => ({ startedAfterCommitMs: s.captureCoverage!.startedAtMs - doc!.committedAtMs,
      completedAfterCommitMs: s.captureCoverage!.completedAtMs - doc!.committedAtMs })),
    cookieReadIntervalsOmitted: Math.max(0, bound.length - 8), storageSnapshots: bundle.storageSnapshots.length,
    gpcCookieReadBindings: gpcReads.length,
    gpcCookieReadIntervals: gpcReads.slice(0, 8).map(proof => ({ startedAfterCommitMs: proof.startedAtMs - proof.documentCommittedAtMs,
      completedAfterCommitMs: proof.completedAtMs - proof.documentCommittedAtMs })),
    gpcCookieReadIntervalsOmitted: Math.max(0, gpcReads.length - 8),
    storageSnapshotsWithReadContext: bundle.storageSnapshots.filter(s => s.captureContext).length,
    storageSnapshotsWithCompleteReads: bundle.storageSnapshots.filter(s => s.captureContext?.localStorageReadComplete && s.captureContext.sessionStorageReadComplete).length };
}

function verifiedLane(b: CanonicalEvidenceBundle | null, scanId: string, lane: "runtime_evidence" | "gpc_observation") {
  return b?.scanId === scanId && b.scanLaneRuns.length === 1 && b.scanLaneRuns[0]?.laneId === lane &&
    b.scanLaneRuns[0]?.region === b.region ? b : null;
}

export function buildGpcImpactCohort(input: GpcCohortInput[]) {
  if (input.length > 10000 || new Set(input.map(r => r.scanId)).size !== input.length) throw Error("Cohort requires at most 10,000 unique scan IDs.");
  return summarizeGpcImpactCohort(input.map(assessGpcCohortRow));
}
export function assessGpcCohortRow(r: GpcCohortInput) {
    const raw = readVerifiedGpcImpactSource(r.gpc);
    const gpc = raw?.scanId === r.scanId ? raw : null;
    const metadataGpc = verifiedLane(gpc, r.scanId, "gpc_observation");
    const baseline = verifiedLane(readVerifiedGpcImpactSource(r.baseline), r.scanId, "runtime_evidence");
    const impact = buildGpcImpactAssessment(r);
    const observation = buildGpcProductionObservation({ scanId: r.scanId, source: r.gpc ? { ...r.gpc, pointer: { ...r.gpc.pointer, uri: "local-retained-worker" } } : undefined });
    const impactCommit = metadataGpc?.gpcImpactCapture?.document?.committedAtMs;
    const observationCommit = observation.requests.documentCommittedAtMs;
    const commitDifference = impactCommit !== undefined && observationCommit !== null ? observationCommit - impactCommit : null;
    const cmps = [...new Set(gpc?.normalizedVendorObservations.filter(v => v.purpose === "consent_management").map(v => `${v.vendor}|${v.product ?? "unspecified"}`) ?? [])].sort();
    return { scanId: r.scanId, required: r.required, publishedObservation: r.publishedObservation ?? "missing",
      revision: r.revision ?? "unknown", region: gpc?.region ?? r.region ?? "unknown", cmps,
      activityComparison: buildGpcActivityComparison({ ...r, observation }),
      collectionTimingMetadata: { recordedCommitTimes: commitDifference === null ? "unavailable" as const : commitDifference === 0 ? "aligned" as const : "different" as const,
        observationMinusImpactCommitMs: commitDifference !== null && Math.abs(commitDifference) <= 120_000 ? commitDifference : null,
        exactProducerGateChanged: false as const },
      // Original sources only; never use merged GPC/baseline arrays or attach
      // these diagnostics to historical customer reports.
      pairedStorageMetadata: { baseline: retainedStorageMetadata(baseline), gpc: retainedStorageMetadata(metadataGpc),
        comparison: "not_assessed" as const, matchedRequestHorizon: "not_established" as const,
        storageDocumentBinding: "not_retained_in_snapshot_contract" as const },
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
    const behavioral = required.filter(r => r.activityComparison);
    const accessible = required.filter(r => r.access.positiveAccess);
    const samples = behavioral.filter(r => r.activityComparison!.collectionComparison);
    return { required: required.length, legitimatelyExcluded: rs.length - required.length,
      publishedCompletion: rate(required.filter(r => r.publishedObservation === "complete").length, required.length),
      publishedOutcomes: count(required.map(r => r.publishedObservation)),
      retainedSourceCoverage: rate(required.filter(r => r.access.reason !== "source_unverified").length, required.length),
      retainedEvidenceCompletion: rate(required.filter(r => r.observation.status === "complete").length, required.length),
      verifiedDelivery: rate(required.filter(r => r.observation.delivery.httpHeaderRetained && r.observation.delivery.mainNavigatorReadbackRetained).length, required.length),
      completionOnPositivelyVerifiedAccessiblePages: rate(accessible.filter(r => r.observation.status === "complete").length, accessible.length),
      matchedWindowCoverage: rate(measured.length, required.length),
      // Keep approved page-HTTP behavior coverage independent of strict internal
      // full-context impact and CMP readability. Neither repairs the other.
      behavioralEvidence: {
        measuredRequestComparisons: rate(behavioral.length, required.length),
        measuredWithoutReadableCmp: behavioral.filter(r => r.observation.semanticProbe !== "observed").length,
        unavailableRequestComparisons: required.length - behavioral.length,
        collectionSamples: {
          packets: rate(samples.length, required.length),
          measuredRequestPairsWithoutPacket: behavioral.length - samples.length,
          // A missing optional packet is not evidence of no collection.
          missingPacketMeansNoCollection: false as const,
          commitClockMetadata: count(required.map(r => r.collectionTimingMetadata.recordedCommitTimes)),
          byScope: Object.fromEntries([...new Set(samples.map(r => {
            const a = r.activityComparison!, c = a.collectionComparison!;
            return JSON.stringify([a.evidencePolicy ?? "legacy", a.durationMs, c.contractVersion, c.baseline.identifierCoverage, c.gpc.identifierCoverage]);
          }))].sort().map(scope => {
            const group = samples.filter(r => { const a = r.activityComparison!, c = a.collectionComparison!;
              return JSON.stringify([a.evidencePolicy ?? "legacy", a.durationMs, c.contractVersion, c.baseline.identifierCoverage, c.gpc.identifierCoverage]) === scope; });
            return [scope, { pairs: group.length,
              baselineRows: group.reduce((n, r) => n + r.activityComparison!.collectionComparison!.baseline.rows.length, 0),
              gpcRows: group.reduce((n, r) => n + r.activityComparison!.collectionComparison!.gpc.rows.length, 0),
              cappedPairs: group.filter(r => { const c = r.activityComparison!.collectionComparison!; return c.baseline.rowsTruncated || c.gpc.rowsTruncated; }).length }];
          })),
        },
        retainedStorageMetadata: {
          bySide: Object.fromEntries((["baseline", "gpc"] as const).map(side => {
            const snapshots = required.map(r => r.pairedStorageMetadata[side]);
            return [side, {
              verifiedSources: rate(snapshots.filter(s => s.source === "original_bytes_verified").length, required.length),
              visitsWithCookieSnapshots: snapshots.filter(s => s.cookieSnapshots > 0).length,
              visitsWithCookieCoverageMetadata: snapshots.filter(s => s.cookieSnapshotsWithCoverage > 0).length,
              visitsWithOwnDocumentCookieMetadata: snapshots.filter(s => s.cookieSnapshotsWithOwnDocumentBinding > 0).length,
              visitsWithGpcCookieReadBinding: snapshots.filter(s => s.gpcCookieReadBindings > 0).length,
              visitsWithStorageReadContexts: snapshots.filter(s => s.storageSnapshotsWithReadContext > 0).length,
              visitsWithCompleteStorageReadDeclarations: snapshots.filter(s => s.storageSnapshotsWithCompleteReads > 0).length,
            }];
          })),
          bothSourcesVerified: rate(required.filter(r => [r.pairedStorageMetadata.baseline, r.pairedStorageMetadata.gpc].every(s => s.source === "original_bytes_verified")).length, required.length),
          bothHaveCookieCoverageMetadata: rate(required.filter(r => [r.pairedStorageMetadata.baseline, r.pairedStorageMetadata.gpc].every(s => s.cookieSnapshotsWithCoverage > 0)).length, required.length),
          bothHaveOwnDocumentCookieMetadata: rate(required.filter(r => [r.pairedStorageMetadata.baseline, r.pairedStorageMetadata.gpc].every(s => s.cookieSnapshotsWithOwnDocumentBinding > 0)).length, required.length),
          baselineAndGpcHaveOwnReadMetadata: rate(required.filter(r => r.pairedStorageMetadata.baseline.cookieSnapshotsWithOwnDocumentBinding > 0 &&
            r.pairedStorageMetadata.gpc.gpcCookieReadBindings > 0).length, required.length),
          bothHaveStorageReadContexts: rate(required.filter(r => [r.pairedStorageMetadata.baseline, r.pairedStorageMetadata.gpc].every(s => s.storageSnapshotsWithReadContext > 0)).length, required.length),
          bothHaveCompleteStorageReadDeclarations: rate(required.filter(r => [r.pairedStorageMetadata.baseline, r.pairedStorageMetadata.gpc].every(s => s.storageSnapshotsWithCompleteReads > 0)).length, required.length),
          comparison: "not_assessed" as const, matchedRequestHorizon: "not_established" as const,
          storageDocumentBinding: "not_retained_in_snapshot_contract" as const,
          rawNamesValuesAndTokensExported: false as const,
        },
        byDurationMs: Object.fromEntries([...new Set(behavioral.map(r => r.activityComparison!.durationMs))].sort((a, b) => a - b).map(ms => {
          const group = behavioral.filter(r => r.activityComparison!.durationMs === ms);
          return [ms, { pairs: group.length,
            advertisingMarketing: {
              baselineRequests: group.reduce((n, r) => n + r.activityComparison!.activity.advertisingMarketing.baselineRequests, 0),
              gpcRequests: group.reduce((n, r) => n + r.activityComparison!.activity.advertisingMarketing.gpcRequests, 0),
            },
            analyticsReplay: {
              baselineRequests: group.reduce((n, r) => n + r.activityComparison!.activity.analyticsReplay.baselineRequests, 0),
              gpcRequests: group.reduce((n, r) => n + r.activityComparison!.activity.analyticsReplay.gpcRequests, 0),
            },
          }];
        })),
        // Full-session positive observations are not counts at the matched
        // horizon. Missing/limited observations cannot establish zero activity.
        retainedGpcSession: {
          visitsWithAdvertisingCollection: required.filter(r => (r.observation.requests.advertisingCollectionCount ?? 0) > 0).length,
          advertisingCollectionRequests: required.reduce((n, r) => n + (r.observation.requests.advertisingCollectionCount ?? 0), 0),
          visitsWithoutRetainedCollectionCount: required.filter(r => r.observation.status === "unavailable" || r.observation.requests.advertisingCollectionCount === undefined).length,
          observationStatuses: count(required.map(r => r.observation.status)),
          zeroRetainedCountMeansNoCollection: false as const,
        },
        causedByGpc: "not_established" as const,
      },
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
