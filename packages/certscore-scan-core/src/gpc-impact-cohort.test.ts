import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildGpcImpactCohort } from "./gpc-impact-cohort";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { createGpcImpactCapture } from "./gpc-impact-capture";

test("cohort duration calibration includes verified five-second windows and keeps missing pairs in the denominator", () => {
  const source = (enabled: boolean) => {
    const bundle = gpcRuntimeFixture({enabled, vendors: []});
    bundle.region = "us-west-1";
    bundle.scanLaneRuns[0]!.region = "us-west-1";
    let now = 0;
    const capture = createGpcImpactCapture({expectedEnabled: enabled, now: () => now});
    capture.documentRequested({type: "Document", frameId: "main", loaderId: "loader", request: {url: bundle.url, headers: enabled ? {"Sec-GPC": "1"} : {}}}, "main");
    capture.recordRequest(bundle.networkEvents[0]!);
    now = 1; capture.documentCommitted({loaderId: "loader", url: bundle.url});
    now = 6000;
    bundle.gpcSignalObservation!.capturedAtMs = now;
    bundle.gpcSignalObservation!.prototypeCaptureBinding = {captureId: "11111111-1111-4111-8111-111111111111", documentIdentitySource: "cdp_loader_id", documentToken: "loader"};
    capture.bindReadback("loader");
    bundle.gpcImpactCapture = capture.finish(bundle.gpcSignalObservation);
    delete bundle.gpcImpactCapture.comparisonPolicy;
    bundle.completedAt = "2026-09-05T12:00:07.000Z";
    const bytes = Buffer.from(JSON.stringify(bundle));
    return {scanId: bundle.scanId, source: {bytes, pointer: {sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length}}};
  };
  const baseline = source(false), gpc = source(true);
  const report = buildGpcImpactCohort([{scanId: baseline.scanId, required: true, baseline: baseline.source, gpc: gpc.source}, {scanId: "missing", required: true, region: "us-west-1"}]);
  assert.equal(report.summary.windows[5000]?.pairs, 1, JSON.stringify(report.rows[0]!.impact));
  assert.deepEqual(report.byRegion["us-west-1"]?.pairedWindowCoverage, {measuredPairs: 1, belowThreeSeconds: 0, threeToFiveSeconds: 0, atLeastFiveSeconds: 1, unavailable: 1});
  assert.equal(report.productionProjectable, false);
  assert.equal(report.scoreEffect, "none");
});
test("cohort preserves failed/missing required scans, excludes ineligible scans and separates published/evidence completion",()=>{
  const b=gpcProductionRuntimeFixture();const bytes=Buffer.from(JSON.stringify(b));
  const source={bytes,pointer:{sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}};
  const result=buildGpcImpactCohort([{scanId:b.scanId,required:true,publishedObservation:'missing',revision:'new',gpc:source},
    {scanId:'missing',required:true,publishedObservation:'unavailable',revision:'old'}, {scanId:'excluded',required:false}]);
  assert.equal(result.summary.required,2);assert.equal(result.summary.legitimatelyExcluded,1);
  assert.equal(result.summary.publishedCompletion.numerator,0);
  assert.equal(result.summary.retainedEvidenceCompletion.numerator,1);
  assert.equal(result.summary.matchedWindowCoverage.numerator,0);
  assert.equal(result.summary.windows[1000]!.activity.trackers!.netReductionAmongBaselineActive.fraction,null);
  assert.equal(result.byRevision.new!.required,1);assert.equal(result.rows[0]!.impact.status,'insufficient_evidence');
  assert.throws(()=>buildGpcImpactCohort([{scanId:'same',required:true},{scanId:'same',required:true}]),/unique/);
  const bad=buildGpcImpactCohort([{scanId:b.scanId,required:true,gpc:{...source,pointer:{...source.pointer,sha256:'0'.repeat(64)}}}]);
  assert.equal(bad.summary.retainedEvidenceCompletion.numerator,0);
});

test("behavior review retains page-HTTP comparisons without CMP or full-context impact proof", () => {
  const source = (enabled: boolean) => {
    const bundle = gpcRuntimeFixture({ enabled, vendors: [{ name: "Observed endpoint" }] });
    let now = 0;
    const capture = createGpcImpactCapture({ expectedEnabled: enabled, now: () => now });
    capture.documentRequested({ type: "Document", frameId: "main", loaderId: enabled ? "own-gpc" : "own-baseline",
      request: { url: bundle.url, headers: enabled ? { "Sec-GPC": "1" } : {} } }, "main");
    now = 1; capture.documentCommitted({ loaderId: enabled ? "own-gpc" : "own-baseline", url: bundle.url });
    bundle.networkEvents.slice(1).forEach(event => capture.recordRequest(event));
    now = 6000; bundle.gpcSignalObservation!.capturedAtMs = now;
    // An observed worker keeps strict impact unavailable. The independent
    // approved page-HTTP measurement still has verified main-page delivery.
    bundle.gpcSignalObservation!.workerCount = 1;
    bundle.gpcSignalObservation!.limitationKeys = ["worker_navigator_delivery_unverified"];
    capture.bindReadback(enabled ? "own-gpc" : "own-baseline");
    bundle.gpcImpactCapture = capture.finish(bundle.gpcSignalObservation);
    bundle.completedAt = "2026-09-05T12:00:07.000Z";
    const bytes = Buffer.from(JSON.stringify(bundle));
    return { bytes, pointer: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length } };
  };
  const baseline = source(false), gpc = source(true);
  const input = { scanId: "gpc-fixture", required: true, baseline, gpc };
  const report = buildGpcImpactCohort([input, { scanId: "missing", required: true }, { scanId: "excluded", required: false }]);
  assert.equal(report.rows[0]!.impact.status, "insufficient_evidence");
  assert.equal(report.rows[0]!.activityComparison?.durationMs, 5000);
  assert.equal(report.summary.matchedWindowCoverage.numerator, 0, "strict historical metric stays unchanged");
  assert.deepEqual(report.summary.behavioralEvidence.measuredRequestComparisons, { numerator: 1, denominator: 2, fraction: 0.5 });
  assert.equal(report.summary.behavioralEvidence.measuredWithoutReadableCmp, 1);
  assert.deepEqual(report.summary.behavioralEvidence.byDurationMs[5000]?.advertisingMarketing, { baselineRequests: 1, gpcRequests: 1 });
  assert.equal(report.summary.behavioralEvidence.causedByGpc, "not_established");
  assert.equal(report.summary.behavioralEvidence.retainedGpcSession.zeroRetainedCountMeansNoCollection, false);
  assert.ok(Number.isFinite(report.summary.behavioralEvidence.retainedGpcSession.advertisingCollectionRequests));
  assert.ok(report.summary.behavioralEvidence.retainedGpcSession.visitsWithoutRetainedCollectionCount > 0,
    "missing observations remain distinguishable from an observed zero count");
  const bad = buildGpcImpactCohort([{ ...input, gpc: { ...gpc, pointer: { ...gpc.pointer, sha256: "0".repeat(64) } } }]);
  assert.equal(bad.summary.behavioralEvidence.measuredRequestComparisons.numerator, 0);
  const wrongScan = buildGpcImpactCohort([{ ...input, scanId: "different" }]);
  assert.equal(wrongScan.summary.behavioralEvidence.measuredRequestComparisons.numerator, 0);
});

async function storageMetadataFixture() {
  const { collectionPairFixture, collectionFixtureSource } = await import("./test-fixtures/gpc-collection-pair.cases");
  const pair = collectionPairFixture();
  for (const side of ["baseline", "gpc"] as const) {
    const b = pair[side], doc = b.gpcImpactCapture!.document!;
    const readAt = side === "baseline" ? 2000 : 4000;
    b.cookieSnapshots = [{ artifactId: "private-cookie-snapshot", capturedAtMs: readAt + 5, consentStateAtTime: "pre_consent",
      cookies: [{ name: "PRIVATE_COOKIE_NAME", domain: ".example.test", path: "/private-path" }], cookieNames: ["PRIVATE_COOKIE_NAME"], evidenceRefs: [],
      captureCoverage: { version: "bound_cookie_snapshot.v1", scope: "browser_context_point_in_time", documentBindingPolicy: "passive_final_document.v1",
        targetUrl: b.url, documentUrl: b.url, documentToken: doc.token, startedAtMs: readAt, completedAtMs: readAt + 5, status: "completed" } }];
    b.storageSnapshots = [{ artifactId: "private-storage-snapshot", capturedAtMs: readAt, consentStateAtTime: "pre_consent", url: b.url,
      captureContext: { contractVersion: "storage-capture-context.v1", origin: new URL(b.url).origin, localStorageReadComplete: true, sessionStorageReadComplete: true },
      localStorage: { PRIVATE_STORAGE_KEY: "PRIVATE_VALUE" }, sessionStorage: {}, localStorageKeys: ["PRIVATE_STORAGE_KEY"], sessionStorageKeys: [], valuesRedacted: true, evidenceRefs: [] }];
  }
  const input = () => ({ scanId: pair.gpc.scanId, required: true, baseline: collectionFixtureSource(pair.baseline), gpc: collectionFixtureSource(pair.gpc) });
  return { pair, input };
}

test("retained metadata audit keeps independent cookie intervals separate from request and storage comparisons", async () => {
  const f = await storageMetadataFixture();
  const report = buildGpcImpactCohort([f.input(), { scanId: "missing-required", required: true }, { scanId: "excluded", required: false }]);
  const metadata = report.rows[0]!.pairedStorageMetadata, summary = report.summary.behavioralEvidence;
  assert.equal(metadata.baseline.cookieSnapshotsWithOwnDocumentBinding, 1);
  assert.equal(metadata.gpc.cookieSnapshotsWithOwnDocumentBinding, 1);
  assert.deepEqual(metadata.baseline.cookieReadIntervals, [{ startedAfterCommitMs: 1999, completedAfterCommitMs: 2004 }]);
  assert.deepEqual(metadata.gpc.cookieReadIntervals, [{ startedAfterCommitMs: 3999, completedAfterCommitMs: 4004 }]);
  assert.equal(metadata.matchedRequestHorizon, "not_established");
  assert.equal(metadata.comparison, "not_assessed");
  assert.equal(metadata.storageDocumentBinding, "not_retained_in_snapshot_contract");
  assert.deepEqual(summary.retainedStorageMetadata.bothHaveOwnDocumentCookieMetadata, { numerator: 1, denominator: 2, fraction: 0.5 });
  assert.deepEqual(summary.retainedStorageMetadata.bothHaveCompleteStorageReadDeclarations, { numerator: 1, denominator: 2, fraction: 0.5 });
  assert.deepEqual(summary.collectionSamples.packets, { numerator: 1, denominator: 2, fraction: 0.5 });
  assert.equal(summary.collectionSamples.missingPacketMeansNoCollection, false);
  assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE_|private-cookie|private-path|fixture-loader|independent-baseline|https?:/);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_COOKIE_NAME|PRIVATE_STORAGE_KEY|PRIVATE_VALUE|private-cookie-snapshot|private-storage-snapshot/);
  assert.equal(report.productionProjectable, false); assert.equal(report.scoreEffect, "none");
});

test("retained cookie metadata rejects wrong own document, target and times without removing the request comparison", async () => {
  const mutations = [
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.captureCoverage!.documentToken = f.pair.baseline.gpcImpactCapture!.document!.token; },
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.captureCoverage!.documentUrl = "https://different.test/"; },
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.captureCoverage!.targetUrl = "https://wrong-target.test/"; },
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.captureCoverage!.startedAtMs = 0; },
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.captureCoverage!.completedAtMs = 8000; f.pair.gpc.cookieSnapshots[0]!.capturedAtMs = 8000; },
    (f: Awaited<ReturnType<typeof storageMetadataFixture>>) => { f.pair.gpc.cookieSnapshots[0]!.capturedAtMs = 3999; },
  ];
  for (const mutate of mutations) {
    const f = await storageMetadataFixture(); mutate(f);
    const r = buildGpcImpactCohort([f.input()]);
    assert.equal(r.rows[0]!.pairedStorageMetadata.gpc.cookieSnapshotsWithOwnDocumentBinding, 0);
    assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.bothHaveOwnDocumentCookieMetadata.numerator, 0);
    assert.equal(r.summary.behavioralEvidence.measuredRequestComparisons.numerator, 1);
    assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.comparison, "not_assessed");
  }
});

test("missing coverage, partial reads and invalid original source bindings never become storage comparison proof", async () => {
  const f = await storageMetadataFixture();
  delete f.pair.gpc.cookieSnapshots[0]!.captureCoverage;
  f.pair.gpc.storageSnapshots[0]!.captureContext!.sessionStorageReadComplete = false;
  const input = f.input(), r = buildGpcImpactCohort([input]);
  assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.bothHaveCookieCoverageMetadata.numerator, 0);
  assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.bothHaveStorageReadContexts.numerator, 1);
  assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.bothHaveCompleteStorageReadDeclarations.numerator, 0);
  for (const source of [
    { ...input.gpc, pointer: { ...input.gpc.pointer, sha256: "0".repeat(64) } },
    { ...input.gpc, pointer: { ...input.gpc.pointer, sizeBytes: 1 } },
  ]) {
    const bad = buildGpcImpactCohort([{ ...input, gpc: source }]);
    assert.equal(bad.rows[0]!.pairedStorageMetadata.gpc.source, "missing_or_unverified");
  }
  assert.equal(buildGpcImpactCohort([{ ...input, scanId: "foreign" }]).rows[0]!.pairedStorageMetadata.baseline.source, "missing_or_unverified");
  f.pair.gpc.scanLaneRuns[0]!.laneId = "runtime_evidence";
  assert.equal(buildGpcImpactCohort([f.input()]).rows[0]!.pairedStorageMetadata.gpc.source, "missing_or_unverified");
  assert.equal(buildGpcImpactCohort([f.input()]).rows[0]!.collectionTimingMetadata.recordedCommitTimes, "unavailable");
});

test("collection audit groups successful retained samples by exact duration and identifier scope", async () => {
  const { collectionPairFixture, collectionFixtureSource } = await import("./test-fixtures/gpc-collection-pair.cases");
  const inputs = [1000, 5000].map(ms => {
    const pair = collectionPairFixture(undefined, `collection-${ms}`);
    for (const b of [pair.baseline, pair.gpc]) b.gpcImpactCapture!.windows = b.gpcImpactCapture!.windows.filter(w => w.durationMs <= ms);
    return { scanId: pair.gpc.scanId, required: true, baseline: collectionFixtureSource(pair.baseline), gpc: collectionFixtureSource(pair.gpc) };
  });
  const report = buildGpcImpactCohort(inputs), summary = report.summary.behavioralEvidence.collectionSamples;
  assert.deepEqual(summary.packets, { numerator: 2, denominator: 2, fraction: 1 });
  assert.equal(Object.keys(summary.byScope).length, 2);
  assert.ok(Object.values(summary.byScope).every(g => g.pairs === 1 && g.baselineRows === 1 && g.gpcRows === 1));
  assert.ok(Object.keys(summary.byScope).every(k => k.includes("url_only") && k.includes("canonical_qualification")));
});

test("cohort reports a one-millisecond commit-clock mismatch without relaxing the collection producer gate", async () => {
  const f = await storageMetadataFixture();
  f.pair.gpc.gpcImpactCapture!.document!.committedAtMs += 1;
  const r = buildGpcImpactCohort([f.input()]);
  assert.equal(r.rows[0]!.activityComparison?.durationMs, 5000);
  assert.equal(r.rows[0]!.activityComparison?.collectionComparison, undefined);
  assert.deepEqual(r.rows[0]!.collectionTimingMetadata, { recordedCommitTimes: "different", observationMinusImpactCommitMs: -1, exactProducerGateChanged: false });
  assert.equal(r.summary.behavioralEvidence.collectionSamples.commitClockMetadata.different, 1);
  assert.equal(r.summary.behavioralEvidence.collectionSamples.packets.numerator, 0);
  assert.equal(r.rows[0]!.observation.requests.advertisingCollectionCount, 1);
});

test("future GPC cookie bindings enter only the separate private metadata audit", async () => {
  const { gpcCookieReadFixture } = await import("./test-fixtures/gpc-cookie-read.cases");
  const { buildGpcCookieReadBinding } = await import("./gpc-cookie-read-binding");
  const { collectionFixtureSource } = await import("./test-fixtures/gpc-collection-pair.cases");
  const baseline = await storageMetadataFixture(), f = gpcCookieReadFixture();
  f.bundle.cookieSnapshots[0]!.gpcReadBinding = buildGpcCookieReadBinding(f.input)!;
  const r = buildGpcImpactCohort([{ scanId: f.bundle.scanId, required: true, baseline: baseline.input().baseline, gpc: collectionFixtureSource(f.bundle) }]);
  const metadata = r.rows[0]!.pairedStorageMetadata.gpc;
  assert.equal(metadata.gpcCookieReadBindings, 1); assert.equal(metadata.cookieSnapshotsWithCoverage, 0);
  assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.baselineAndGpcHaveOwnReadMetadata.numerator, 1);
  assert.equal(r.summary.behavioralEvidence.retainedStorageMetadata.bothHaveOwnDocumentCookieMetadata.numerator, 0);
  assert.equal(r.rows[0]!.pairedStorageMetadata.comparison, "not_assessed");
  assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE_COOKIE|fixture-loader|documentToken|captureId|https?:/);
});
