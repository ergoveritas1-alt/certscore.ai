import test from "node:test";
import assert from "node:assert/strict";
import { buildGpcCmpStateComparison } from "./gpc-cmp-state-comparison";
import { buildGpcImpactAssessment } from "./gpc-impact-assessment";
import { cmpStatePairFixture, originalFixtureSource, fixtureHash } from "./test-fixtures/gpc-cmp-state-pair.cases";

const project = (p: ReturnType<typeof cmpStatePairFixture>) => buildGpcCmpStateComparison({scanId: p.gpc.scanId, targetUrl:p.baseline.url,
  baseline: originalFixtureSource(p.baseline), gpc: originalFixtureSource(p.gpc)});

test("independent original-byte snapshots preserve different/same/on/off states and supported section versions", () => {
  for (const [sectionId, sectionVersion] of [[7,1], [7,2], [8,1]] as const)
    for (const baselineSale of [1,2] as const) for (const baselineSharing of [1,2] as const)
      for (const gpcSale of [1,2] as const) for (const gpcSharing of [1,2] as const) {
        const p = cmpStatePairFixture({sectionId, sectionVersion, baselineSale, baselineSharing, gpcSale, gpcSharing});
        const packet = project(p);
        assert.ok(packet, JSON.stringify(buildGpcImpactAssessment({scanId:p.gpc.scanId,baseline:originalFixtureSource(p.baseline),gpc:originalFixtureSource(p.gpc)})));
        assert.equal(packet.baseline.sale, baselineSale === 1 ? "opted_out" : "not_opted_out");
        assert.equal(packet.gpc.sharing, gpcSharing === 1 ? "opted_out" : "not_opted_out");
        assert.equal(packet.sectionId, sectionId); assert.equal(packet.sectionVersion, sectionVersion);
        assert.equal(packet.gpc.observedAfterDocumentCommitMs, 899);
        assert.equal(packet.scoreEffect, "none"); assert.equal(packet.causedByGpc, "not_established");
        assert.notEqual(packet.sourceHashes.baseline,packet.sourceHashes.gpc);
      }
});

test("all prerequisites fail closed without changing response evidence", () => {
  const defects = ['size','hash','scan','lane','region','context','url','token','capture','session','state_hash','time','stale','header','navigator','blocked','failed','challenge','baseline_missing','version','unknown','notice','semantic_limitation','document','readback','local','insufficient','signal_binding'] as const;
  for (const defect of defects) {
    const p = cmpStatePairFixture(), g = p.gpc, b = p.baseline, semantic = g.gpcObservationSession!.semanticObservation!;
    if (defect === 'scan') g.scanId = 'foreign';
    if (defect === 'lane') g.scanLaneRuns[0]!.laneId = 'runtime_evidence';
    if (defect === 'region') g.region = 'eu-west-1';
    if (defect === 'context') g.gpcSignalObservation!.contextConfigSha256 = 'f'.repeat(64);
    if (defect === 'url') g.normalizedUrl = 'https://other.test/';
    if (defect === 'token') semantic.captureBinding!.documentToken = 'other';
    if (defect === 'capture') semantic.captureBinding!.captureId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    if (defect === 'session') g.gpcPrototypeSessionBinding!.sessionSha256 = 'f'.repeat(64);
    if (defect === 'state_hash') semantic.stateSha256 = 'f'.repeat(64);
    if (defect === 'time') semantic.capturedAtMs = 1001;
    if (defect === 'stale') semantic.capturedAtMs = 0;
    if (defect === 'header') g.networkEvents[0]!.requestHeaders = {};
    if (defect === 'navigator') g.gpcSignalObservation!.frames[0]!.navigatorValue = false;
    if (defect === 'blocked') g.scanLaneRuns[0]!.accessOutcome = 'access_denied';
    if (defect === 'failed') g.scanLaneRuns[0]!.executionOutcome = 'failed' as any;
    if (defect === 'challenge') g.scanLaneRuns[0]!.challengeDetected = true;
    if (defect === 'baseline_missing') delete b.gpcImpactSemanticObservation;
    if (defect === 'signal_binding') b.gpcImpactSemanticObservation!.captureBinding!.documentToken = 'foreign-baseline-loader';
    if (defect === 'version') {b.gpcImpactSemanticObservation!.usca = null; b.gpcImpactSemanticObservation!.usnat = {...semantic.usca!,sectionId:7,sectionVersion:2};}
    if (defect === 'unknown') semantic.usca!.saleOptOut = 0;
    if (defect === 'notice') semantic.usca!.sharingNotice = 2;
    if (defect === 'semantic_limitation') semantic.limitationKeys = ['document_changed'];
    if (defect === 'document') g.gpcObservationSession!.mainDocument!.documentUrlSha256 = 'f'.repeat(64);
    if (defect === 'readback') g.gpcImpactCapture!.readbackDocumentToken = 'other';
    if (defect === 'local') g.gpcImpactCapture!.localRetention = 'local_gpc_complete.v2';
    if (defect === 'insufficient') {g.gpcImpactCapture!.retentionStatus = 'incomplete';}
    // Mutations describe newly constructed synthetic sources; no historical receipts.
    if (defect !== 'session') g.gpcPrototypeSessionBinding!.sessionSha256 = fixtureHash(JSON.stringify(g.gpcObservationSession));
    const baseline = originalFixtureSource(b), gpc = originalFixtureSource(g);
    if (defect === 'size') gpc.pointer.sizeBytes++;
    if (defect === 'hash') gpc.pointer.sha256 = 'f'.repeat(64);
    assert.equal(buildGpcCmpStateComparison({scanId: 'gpc-fixture', targetUrl:b.url, baseline, gpc}), undefined, defect);
  }
});

test("an internally comparable CMP pair is still omitted for insufficient impact and incomplete semantics", () => {
  const p = cmpStatePairFixture();p.gpc.gpcImpactCapture!.retentionStatus = 'incomplete';
  const input = {scanId:p.gpc.scanId,targetUrl:p.baseline.url,baseline:originalFixtureSource(p.baseline),gpc:originalFixtureSource(p.gpc)};
  const impact = buildGpcImpactAssessment(input);
  assert.equal(impact.cmpComparison?.comparable,true); assert.equal(impact.status,'insufficient_evidence');
  assert.equal(buildGpcCmpStateComparison(input),undefined);
});

test("ready snapshots require exact supported section versions and both explicit applicable axes",()=>{
  for(const axis of ['sale','sharing'] as const)for(const field of ['Notice','OptOut'] as const)for(const value of field==='Notice'?[0,2]:[0]){
    const p=cmpStatePairFixture();
    (p.gpc.gpcObservationSession!.semanticObservation!.usca! as any)[`${axis}${field}`]=value;
    p.gpc.gpcObservationSession!.semanticObservation!.stateSha256=fixtureHash(JSON.stringify(p.gpc.gpcObservationSession!.semanticObservation!.usca));
    p.gpc.gpcPrototypeSessionBinding!.sessionSha256=fixtureHash(JSON.stringify(p.gpc.gpcObservationSession));
    assert.equal(project(p),undefined,`${axis}${field}=${value}`);
  }
  for(const status of ['unavailable','unsupported','not_ready','invalid'] as const){
    const p=cmpStatePairFixture(),s=p.gpc.gpcObservationSession!.semanticObservation!;
    s.gppStatus=status;s.usca=null;s.stateSha256=null;
    p.gpc.gpcPrototypeSessionBinding!.sessionSha256=fixtureHash(JSON.stringify(p.gpc.gpcObservationSession));
    assert.equal(project(p),undefined,status);
  }
  const p=cmpStatePairFixture({sectionId:7,sectionVersion:1});
  p.baseline.gpcImpactSemanticObservation!.usnat!.sectionVersion=2;
  p.baseline.gpcImpactSemanticObservation!.stateSha256=fixtureHash(JSON.stringify(p.baseline.gpcImpactSemanticObservation!.usnat));
  const input={scanId:p.gpc.scanId,targetUrl:p.baseline.url,baseline:originalFixtureSource(p.baseline),gpc:originalFixtureSource(p.gpc)};
  assert.equal(buildGpcImpactAssessment(input).cmpComparison?.comparable,true);
  assert.equal(buildGpcCmpStateComparison(input),undefined,'matching section ID alone is insufficient');
});

test("baseline semantic state binds to its own original impact loader without a GPC producer-session binding",()=>{
  const p=cmpStatePairFixture();delete p.baseline.gpcSignalObservation!.prototypeCaptureBinding;
  assert.ok(project(p));
  assert.notEqual(p.baseline.gpcImpactSemanticObservation!.captureBinding!.documentToken,p.gpc.gpcObservationSession!.mainDocument!.documentToken);
});

test("paired target must match the original coordinator dispatch",()=>{
  const p=cmpStatePairFixture();
  assert.equal(buildGpcCmpStateComparison({scanId:p.gpc.scanId,targetUrl:'https://foreign.test/',baseline:originalFixtureSource(p.baseline),gpc:originalFixtureSource(p.gpc)}),undefined);
});
