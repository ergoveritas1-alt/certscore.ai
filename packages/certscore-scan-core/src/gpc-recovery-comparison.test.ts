import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {canonicalEvidenceBundleSchema, gpcNavigationRecoverySchema, type CanonicalEvidenceBundle} from "@certscore/contracts";
import {gpcRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import {createGpcNavigationRecovery,originalGpcCaptureHash,retainGpcRecoveryLedger} from "./gpc-navigation-recovery";
import {buildGpcImpactAssessment} from "./gpc-impact-assessment";
import {compactCanonicalEvidenceBundleForRetention} from "./index";
import {parseCanonicalEvidenceArtifact,serializeCanonicalEvidenceArtifact} from "../../certscore-contracts/src/canonical-evidence-artifact";
import {canonicalWideJourneyFixture} from "../../certscore-contracts/src/test-fixtures/canonical-wide-journeys";
const source=(bundle:CanonicalEvidenceBundle)=>{const bytes=Buffer.from(JSON.stringify(bundle));return {bytes,pointer:{sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};};
function fixture(enabled:boolean,recovered:boolean){
 const b=gpcRuntimeFixture({enabled,vendors:[{name:'Fixture ad'}]});let now=0;
 const c=createGpcNavigationRecovery({expectedEnabled:enabled,now:()=>now,deadlineMs:6000});
 const request=(token:string,url=b.url)=>c.documentRequested({type:'Document',frameId:'main',loaderId:token,request:{url,headers:enabled?{'Sec-GPC':'1'}:{}}},'main');
 if(recovered){request('initial','https://example.test/initial');now=1;c.documentCommitted({loaderId:'initial',url:'https://example.test/initial'});now=10;}
 request('loader');now=100;c.documentCommitted({loaderId:'loader',url:b.url});
 b.networkEvents[0]!.timestampMs=90;
 b.networkEvents[1]!.timestampMs=500;
 for(const e of b.networkEvents)c.recordRequest(e);
 now=4000;b.gpcSignalObservation!.capturedAtMs=now;
 b.gpcSignalObservation!.prototypeCaptureBinding={captureId:'11111111-1111-4111-8111-111111111111',documentIdentitySource:'cdp_loader_id',documentToken:'loader'};
 c.bindReadback('loader');b.gpcImpactCapture=c.finish(b.gpcSignalObservation);b.gpcNavigationRecovery=c.finishRecovery(b.gpcSignalObservation);
 b.completedAt='2026-09-05T12:00:05.000Z';
 return canonicalEvidenceBundleSchema.parse(b);
}
function compare(b:CanonicalEvidenceBundle,g:CanonicalEvidenceBundle,recovery=true){return buildGpcImpactAssessment({scanId:b.scanId,baseline:source(b),gpc:source(g),pageHttpOnly:true,navigationRecovery:recovery});}

test('stable/recovered and recovered/recovered are measured only by an explicitly selected protocol',()=>{
 for(const recovered of [false,true]){const b=fixture(false,recovered),g=fixture(true,true);const raw=JSON.stringify([b,g]);const a=compare(b,g);
 assert.equal(a.status,'measured',JSON.stringify(a.limitationKeys));assert.equal(a.durationMs,3000);assert.equal(a.comparisonProtocol,'certscore.local-final-document-recovery.v1');
 assert.deepEqual(a.requestAttempts,{baseline:1,gpc:1});assert.equal(a.scoreEffect,'none');assert.equal(a.causedByGpc,'not_established');
 assert.equal(a.sourceHashes.baseline,source(b).pointer.sha256);assert.equal(JSON.stringify([b,g]),raw);
 assert.equal(compare(b,g,false).status,'insufficient_evidence','legacy assessment still sees the original invalidated capture');
 }
});

test('legacy, mixed protocol, mutated original, wrong context, lost request and header proof cannot qualify',()=>{
 for(const defect of ['legacy','original','context','region','lost','header','readback','attribution','source','candidate_clock'] as const){const b=fixture(false,true),g=fixture(true,true);
 if(defect==='legacy')delete b.gpcNavigationRecovery;
 if(defect==='original')b.gpcImpactCapture!.captureStartedAtMs++;
 if(defect==='context')g.gpcSignalObservation!.contextConfigSha256='a'.repeat(64);
 if(defect==='region')g.region='eu-west-1' as any;
 if(defect==='lost')g.networkEvents.pop();
 if(defect==='header')delete g.networkEvents[1]!.requestHeaders;
 if(defect==='readback')g.gpcSignalObservation!.prototypeCaptureBinding!.documentToken='other';
 if(defect==='candidate_clock')g.gpcNavigationRecovery!.finalDocumentCapture!.document!.committedAtMs++;
 if(defect==='attribution')g.normalizedVendorObservations[0]!.matchSources=[];
 const result=defect==='source'?buildGpcImpactAssessment({scanId:b.scanId,baseline:source(b),gpc:{...source(g),pointer:{...source(g).pointer,sha256:'a'.repeat(64)}},pageHttpOnly:true,navigationRecovery:true}):compare(b,g);
 if(defect==='lost'||defect==='header')assert.notEqual(result.durationMs,3000,defect);
 else assert.equal(result.status,'insufficient_evidence',defect);
 }
});

test('independent candidate ledger preserves counts after compaction without changing original producer proof',()=>{
 const b=fixture(false,true),g=fixture(true,true);
 const originals=[b,g].map(x=>JSON.stringify(x.gpcImpactCapture));
 const retained=[b,g].map(x=>compactCanonicalEvidenceBundleForRetention(x));
 for(let i=0;i<2;i++){
  assert.equal(originalGpcCaptureHash(retained[i]!.gpcImpactCapture!),originalGpcCaptureHash(JSON.parse(originals[i]!)));
  const c=retained[i]!.gpcNavigationRecovery!.finalDocumentCapture!;assert.equal(c.requestLedger!.rows.length,1);
  retained[i]!.networkEvents=retained[i]!.networkEvents.filter(e=>e.isMainFrame);
  retained[i]!.normalizedVendorObservations=[];
 }
 assert.equal(compare(retained[0]!,retained[1]!).status,'measured');
 retained[1]!.gpcNavigationRecovery!.finalDocumentCapture!.requestLedger!.rows=[];
 assert.notEqual(compare(retained[0]!,retained[1]!).durationMs,3000,'missing ledger row never verifies the original long-window hash');
});

test('candidate compaction cannot manufacture completeness from an already capped network array',()=>{
 const b=fixture(false,true),g=fixture(true,true);g.networkEvents.pop();
 g.gpcNavigationRecovery=retainGpcRecoveryLedger(g);
 assert.deepEqual(g.gpcNavigationRecovery!.finalDocumentCapture!.requestLedger?.rows,[], 'only the independently complete empty short window survives');
 assert.notEqual(compare(b,g).durationMs,3000);
});

test('schema rejects multiple attempts, deadline overrun, score changes and adaptive candidates',()=>{
 const recovery=fixture(true,true).gpcNavigationRecovery!;
 for(const value of [{...recovery,attemptCount:2},{...recovery,deadlineMs:3000},{...recovery,scoreEffect:'positive'},
  {...recovery,finalDocumentCapture:{...recovery.finalDocumentCapture,localRetention:'local_gpc_complete.v2'}}]){
 assert.equal(gpcNavigationRecoverySchema.safeParse(value).success,false);
 }
});

test('the optional bounded packet cannot displace original retained evidence',()=>{
 const b=fixture(true,true),without=structuredClone(b);delete without.gpcNavigationRecovery;
 for(const budget of [400*1024,1024]){
  const withRecovery=compactCanonicalEvidenceBundleForRetention(b,budget),legacy=compactCanonicalEvidenceBundleForRetention(without,budget);
  delete withRecovery.gpcNavigationRecovery;
  assert.deepEqual(withRecovery,legacy);
 }
});

test('combined recovery and canonical encoding preserve verified original proof through a large retained artifact',()=>{
 const bundles=[fixture(false,true),fixture(true,true)].map(bundle=>{
  bundle.observedJourneys=canonicalWideJourneyFixture();
  return compactCanonicalEvidenceBundleForRetention(bundle);
 });
 const sources=bundles.map(bundle=>{
  const bytes=Buffer.from(serializeCanonicalEvidenceArtifact(bundle));
  assert.ok(JSON.parse(bytes.toString()).artifactFormat,'exercise encoded storage, not just legacy JSON');
  const decoded=canonicalEvidenceBundleSchema.parse(parseCanonicalEvidenceArtifact(bytes));
  assert.deepEqual(decoded,bundle);
  assert.equal(decoded.gpcNavigationRecovery!.originalCaptureSha256,originalGpcCaptureHash(decoded.gpcImpactCapture!));
  return {bytes,pointer:{sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
 });
 const input={scanId:bundles[0]!.scanId,baseline:sources[0],gpc:sources[1],pageHttpOnly:true};
 const recovered=buildGpcImpactAssessment({...input,navigationRecovery:true});
 assert.equal(recovered.status,'measured',JSON.stringify(recovered));
 assert.equal(recovered.sourceHashes.gpc,sources[1]!.pointer.sha256);
 assert.equal(buildGpcImpactAssessment(input).status,'insufficient_evidence','default consumer retains the original invalidation');
 assert.equal(buildGpcImpactAssessment({...input,navigationRecovery:true,gpc:{...sources[1]!,pointer:{...sources[1]!.pointer,sha256:'f'.repeat(64)}}}).status,'insufficient_evidence','encoded input still needs the authoritative source hash');
});

test('combined core-size accounting never lets recovery displace the large canonical evidence',()=>{
 const bundle=fixture(true,true);bundle.observedJourneys=canonicalWideJourneyFixture();
 const without=structuredClone(bundle);delete without.gpcNavigationRecovery;
 for(const cap of [400*1024,1024]){
  const combined=compactCanonicalEvidenceBundleForRetention(bundle,cap);
  const baseline=compactCanonicalEvidenceBundleForRetention(without,cap);
  assert.ok(combined.gpcNavigationRecovery);
  delete combined.gpcNavigationRecovery;
  assert.deepEqual(combined,baseline,'local recovery is excluded from the same logical and encoded core budget');
 }
});
