import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalEvidenceBundleSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";
import { createGpcImpactCapture } from "./gpc-impact-capture";
import { buildGpcImpactAssessment } from "./gpc-impact-assessment";
import { buildGpcActivityComparison } from "./gpc-activity-comparison";
import { buildGpcResponseAssessment } from "./gpc-response-assessment";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import { gpcEndpointEvidence } from "./gpc-vendor-evidence";

function source(bundle: CanonicalEvidenceBundle) {
  const bytes = Buffer.from(JSON.stringify(bundle));
  return { bytes, pointer: { uri: "fixture.json", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } };
}
function fixture(enabled: boolean, names: string[], end = 1500) {
  const bundle = gpcRuntimeFixture({ enabled, vendors: names.map(name => ({ name })) });
  let now = 0;
  const capture = createGpcImpactCapture({ expectedEnabled: enabled, now: () => now });
  capture.documentRequested({ type: "Document", frameId: "main", loaderId: "loader", request: { url: bundle.url, headers: enabled ? { "Sec-GPC": "1" } : {} } }, "main");
  capture.recordRequest(bundle.networkEvents[0]!);
  now = 1;
  capture.documentCommitted({ loaderId: "loader", url: bundle.url });
  for (const event of bundle.networkEvents.slice(1)) capture.recordRequest(event);
  now = end;
  bundle.gpcSignalObservation!.capturedAtMs = end;
  bundle.gpcSignalObservation!.prototypeCaptureBinding = { captureId: "11111111-1111-4111-8111-111111111111", documentIdentitySource: "cdp_loader_id", documentToken: "loader" };
  capture.bindReadback("loader");
  bundle.gpcImpactCapture = capture.finish(bundle.gpcSignalObservation);
  bundle.completedAt = "2026-09-05T12:00:02.000Z";
  bundle.modulesRun[0]!.timingBreakdown![0]!.outcome = "timed_out";
  return canonicalEvidenceBundleSchema.parse(bundle);
}

test("canonical resolver preserves cookie association separately from endpoint match", () => {
  const observations = resolveVendorObservations([
    { type: "cookie", cookieName: "_ga", hostname: "example.test", evidenceId: "asset", matchSource: "request_cookie" },
    { type: "request", url: "https://www.google-analytics.com/g/collect", evidenceId: "collection" },
  ]);
  const vendor = observations.find(v => v.matchedEvidenceIds.includes("asset"));
  assert.ok(vendor);
  assert.equal(gpcEndpointEvidence(vendor, "asset"), "association_only");
  assert.ok(observations.some(v => gpcEndpointEvidence(v, "collection") === "verified"));
  assert.equal(gpcEndpointEvidence(vendor, "unrelated"), "unknown");
});

test("cookie transmission cannot impersonate endpoint activity in either GPC comparison", () => {
  const baseline = fixture(false, ["Cookie vendor"]), gpc = fixture(true, []);
  baseline.normalizedVendorObservations[0]!.matchSources = [{ source: "request_cookie", sourceEventId: "vendor_0", matchedField: "cookie_name", confidence: 1, resolverBasis: ["cookie_name_match"] }];
  baseline.normalizedVendorObservations[0]!.matchedCookieNames = ["_test_cookie"];
  const impact = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(impact.status, "measured");
  assert.equal(impact.activity?.trackers.outcome, "no_activity_observed");
  assert.equal(impact.activity?.trackers.baselineRequests, 0);
  for (const b of [baseline, gpc]) b.modulesRun[0]!.timingBreakdown![0]!.outcome = "completed";
  const response = buildGpcResponseAssessment({ baseline, baselineArtifact: source(baseline).pointer, gpc, gpcArtifact: source(gpc).pointer });
  assert.equal(response.status, "no_observable_response");
  assert.equal(response.comparison.deltas.trackers.baselineCount, 0);
  assert.deepEqual(baseline.normalizedVendorObservations[0]!.matchedCookieNames, ["_test_cookie"], "retain original cookie association");
});

test("endpoint purpose cannot leak between same-vendor request IDs", () => {
  const baseline = fixture(false, ["Vendor"]), gpc = fixture(true, []);
  const vendor = baseline.normalizedVendorObservations[0]!;
  vendor.matchedEvidenceIds.push("late_endpoint");
  vendor.matchSources = [{ source: "request_cookie", sourceEventId: "vendor_0", matchedField: "cookie_name", confidence: 1, resolverBasis: [] },
    { source: "network_request", sourceEventId: "late_endpoint", matchedField: "hostname", confidence: 1, resolverBasis: [] }];
  const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(result.activity?.trackers.baselineRequests, 0);
  vendor.matchSources.push({ source: "network_request", sourceEventId: "vendor_0", matchedField: "hostname", confidence: 1, resolverBasis: [] });
  const verified = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(verified.activity?.trackers.baselineRequests, 1, "independent endpoint evidence remains countable");
});

test("missing legacy endpoint provenance limits comparison rather than inventing zero activity", () => {
  const baseline = fixture(false, ["Legacy"]), gpc = fixture(true, []);
  baseline.normalizedVendorObservations[0]!.matchSources = [];
  const impact = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(impact.status, "insufficient_evidence");
  assert.ok(impact.limitationKeys.includes("baseline_endpoint_attribution_unverified"));
  for (const b of [baseline, gpc]) b.modulesRun[0]!.timingBreakdown![0]!.outcome = "completed";
  const response = buildGpcResponseAssessment({ baseline, baselineArtifact: source(baseline).pointer, gpc, gpcArtifact: source(gpc).pointer });
  assert.equal(response.status, "indeterminate");
  assert.ok(response.comparison.limitationKeys.includes("baseline_endpoint_attribution_unverified"));
});

test("frame-change diagnostics preserve insufficient paired delivery and neutral impact", () => {
  for (const reason of ["frame_attached_during_readback", "frame_detached_during_readback", "frame_url_changed_during_readback"]) {
    const baseline = fixture(false, []), gpc = fixture(true, []);
    for (const bundle of [baseline, gpc]) bundle.gpcSignalObservation!.limitationKeys = ["frames_changed_during_readback", reason];
    const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
    assert.equal(result.status, "insufficient_evidence");
    assert.deepEqual(result.delivery, { baselineVerified: false, gpcVerified: false });
    assert.equal(result.scoreEffect, "none");
    assert.equal(buildGpcActivityComparison({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) }), undefined);
  }
});

test("explicit retention loss remains neutral even when supplied events happen to match", () => {
  const baseline = fixture(false, []), gpc = fixture(true, []);
  gpc.gpcImpactCapture!.retentionStatus = "incomplete";
  const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(result.status, "insufficient_evidence");
  assert.ok(result.limitationKeys.includes("gpc_retained_request_set_incomplete"));
  assert.equal(result.scoreEffect, "none");
});

test("busy matched windows measure both directions without changing the legacy response", () => {
  for (const [baselineNames, gpcNames, outcome] of [[['A','B'],['A'],'lower'], [['A'],['A','B'],'higher'], [['A'],['A'],'unchanged'], [[],[],'no_activity_observed'], [[],['A'],'new_activity_observed']] as const) {
    const baseline = fixture(false, [...baselineNames]), gpc = fixture(true, [...gpcNames]);
    const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
    assert.equal(result.status, "measured", JSON.stringify(result));
    assert.equal(result.durationMs, 1000);
    assert.equal(result.activity!.trackers.outcome, outcome);
    assert.equal(result.activity!.trackers.relativeReduction, baselineNames.length ? (baselineNames.length - gpcNames.length) / baselineNames.length : null);
    assert.equal(result.productionProjectable, false);
    assert.equal(result.scoreEffect, "none");
    const production = buildGpcActivityComparison({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
    assert.equal(production?.contractVersion, "certscore.gpc-activity-comparison.v1");
    assert.deepEqual(production?.sourceHashes, result.sourceHashes);
    assert.equal(production?.durationMs, 1000);
    assert.equal(production?.activity.advertisingMarketing.baselineRequests, result.activity!.advertisingMarketing.baselineRequests);
    assert.equal(production?.activity.advertisingMarketing.gpcRequests, result.activity!.advertisingMarketing.gpcRequests);
    assert.equal(production?.scoreEffect, "none");
    assert.equal(production?.causedByGpc, "not_established");
    const legacy = buildGpcResponseAssessment({ baseline, baselineArtifact: source(baseline).pointer, gpc, gpcArtifact: source(gpc).pointer });
    assert.equal(legacy.status, "indeterminate");
    assert.ok(legacy.comparison.limitationKeys.includes("gpc_settle_not_completed"));
  }
});

test("the shorter shared horizon excludes late activity and preserves churn", () => {
  const baseline = fixture(false, ['A','B']), gpc = fixture(true, ['A','C'], 600);
  const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(gpc) });
  assert.equal(result.durationMs, 500);
  assert.equal(result.activity!.trackers.outcome, "unchanged");
  assert.equal(result.activity!.trackers.removedCount, 1);
  assert.equal(result.activity!.trackers.newCount, 1);
  assert.equal(result.requestAttempts!.baseline, 2, "navigation request is outside post-commit window");
  const short = fixture(true, ['A'], 300);
  const earlier = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: source(short) });
  assert.equal(earlier.durationMs, 250);
  assert.equal(earlier.activity!.trackers.outcome, "no_activity_observed", "late tags are not attributed to an earlier interval");
});

test("missing, changed or incomplete retained evidence cannot become a measured effect", () => {
  const baseline = fixture(false, ['A']);
  for (const defect of ["checksum", "historical", "dropped_request", "duplicate_request", "wrong_loader", "different_page", "overflow", "navigator", "workers", "wrong_scan", "wrong_region", "blocked", "short", "after_completion"]) {
    const gpc = fixture(true, ['A']);
    if (defect === 'historical') delete gpc.gpcImpactCapture;
    if (defect === 'dropped_request') gpc.networkEvents.pop();
    if (defect === 'duplicate_request') gpc.networkEvents.push(gpc.networkEvents.at(-1)!);
    if (defect === 'wrong_loader') gpc.gpcImpactCapture!.readbackDocumentToken = 'different';
    if (defect === 'different_page') gpc.gpcImpactCapture!.document!.urlSha256 = '0'.repeat(64);
    if (defect === 'overflow') gpc.gpcImpactCapture!.requestsDropped = 1;
    if (defect === 'navigator') gpc.gpcSignalObservation!.frames[0]!.navigatorValue = false;
    if (defect === 'workers') gpc.gpcSignalObservation!.workerCount = 1;
    if (defect === 'wrong_scan') gpc.scanId = 'other';
    if (defect === 'wrong_region') gpc.region = 'eu-west-1';
    if (defect === 'blocked') gpc.scanLaneRuns[0]!.accessOutcome = 'access_denied';
    if (defect === 'short') { gpc.gpcImpactCapture!.windows = []; gpc.gpcImpactCapture!.limitationKeys = ['short']; }
    if (defect === 'after_completion') gpc.completedAt = gpc.startedAt;
    const gs = source(gpc);
    if (defect === 'checksum') gs.pointer.sha256 = '0'.repeat(64);
    const result = buildGpcImpactAssessment({ scanId: baseline.scanId, baseline: source(baseline), gpc: gs });
    assert.equal(result.status, 'insufficient_evidence', defect);
    assert.equal(result.activity, null, defect);
    assert.equal(buildGpcActivityComparison({ scanId: baseline.scanId, baseline: source(baseline), gpc: gs }), undefined, defect);
  }
});

test("capture is bounded and navigation invalidates the interval", () => {
  const b = fixture(false, ['A']);
  assert.ok(Buffer.byteLength(JSON.stringify(b.gpcImpactCapture)) < 2048);
  let now = 0;
  const c = createGpcImpactCapture({ expectedEnabled: false, now: () => now });
  c.documentRequested({ type: 'Document', frameId: 'main', loaderId: 'loader', request: { url:b.url, headers:{} } },'main');
  now = 1; c.documentCommitted({ loaderId:'loader',url:b.url });
  for (let i=0;i<5001;i++) c.recordRequest({...b.networkEvents[0]!,eventId:`r${i}`,timestampMs:2});
  now = 1500;
  assert.equal(c.finish(b.gpcSignalObservation).requestsDropped,1);
  assert.equal(c.finish().windows.length,0);
  const d = createGpcImpactCapture({ expectedEnabled:false,now:()=>0 });
  d.invalidate();
  assert.equal(d.finish().windows.length,0);
});

test("verified current CMP choice remains useful when the activity comparison is unavailable", () => {
  const gpc=gpcProductionRuntimeFixture();
  const session=gpc.gpcObservationSession!, semantic=session.semanticObservation!;
  semantic.gppStatus='observed';
  semantic.usca={apiVersion:'1.1',sectionId:8,sectionVersion:1,cmpStatus:'loaded',signalStatus:'ready',saleNotice:1,sharingNotice:1,saleOptOut:1,sharingOptOut:1,gpc:true};
  semantic.stateSha256=createHash('sha256').update(JSON.stringify(semantic.usca)).digest('hex');
  gpc.gpcPrototypeSessionBinding!.sessionSha256=createHash('sha256').update(JSON.stringify(session)).digest('hex');
  const r=buildGpcImpactAssessment({scanId:gpc.scanId,baseline:source(gpcRuntimeFixture({enabled:false})),gpc:source(gpc)});
  assert.equal(r.status,'insufficient_evidence');
  assert.equal(r.cmpRecordedState.received,'received');
  assert.equal(r.cmpRecordedState.sale,'opted_out');
  assert.equal(r.cmpRecordedState.baselineState,'not_captured');
  assert.equal(r.causedByGpc,'not_established');
});
