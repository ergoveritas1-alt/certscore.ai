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
