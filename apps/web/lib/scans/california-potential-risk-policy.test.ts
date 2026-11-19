import {scoreCaliforniaCollectionReview,potentialRiskPoints,potentialRiskIncrement,CA_POTENTIAL_RISK_LEGACY_POLICY} from "./california-potential-risk-policy";
import {californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
import {projectAdminScoringEntityCounts} from "../../server/admin/admin-scan-posture-score";
import {SCAN_REPORT_PROJECTION_VERSION} from "../../server/scans/scan-report-projection-contract";
import {buildNormalizedConcerns} from "./normalized-concerns";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "./gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "./gdpr-eprivacy-coverage-checklist";
import {deriveRegulatoryCoverageScore} from "./regulatory-coverage-score";
import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {gpcProductionRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import {gpcRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import {buildGpcProductionAssessment} from "../../../../packages/certscore-scan-core/src/gpc-production-observation";
import {buildGpcResponseAssessment} from "../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import {deriveConsentControlAssessment,gpcObservationSessionSchema} from "@certscore/contracts";
import {inspectMeasurementRequest,resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {assessGpcPotentialRisk,assessRejectPotentialRisk,retainedPotentialRisk,CA_POTENTIAL_RISK_FINDING} from "./california-potential-risk-policy";
import {buildUnifiedFindingDisplayPackets} from "./unified-findings";
import {deriveCaliforniaRegulatoryScore} from "./california-regulatory-score";
import {projectCaliforniaRegulatoryPriorities} from "./california-regulatory-priorities";
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "../../server/scans/california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "../../server/scans/california-privacy-review-projection";
import {afterRejectClickProjection,withRetainedRejectContext} from "./test-fixtures/after-reject-scoring";
import {buildPostRefusalRuntimeProjection} from "./post-refusal-runtime-projection";
import {captureCaliforniaRejectRequest} from "../../../../packages/certscore-scan-core/src/california-reject-request";
const ga="https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture&sid=123&npa=1";
test("a transmitted measurement parameter requires a matching stored identifier", () => {
  const p = reject();
  const ledger = p.scoringEvidence!;
  const request = ledger.requests[0]!;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const url = "https://heapanalytics.com/h?a=123&u=987654321";
  const cookieName = "_hp2_id.123";
  const binding = {
    policyVersion: "measurement_cookie_identifier.v1", parameter: "u", cookieName,
    source: "pre_action_cookie_snapshot", targetSha256: p.sourceIdentity!.targetSha256,
    hostname: "example.test", identityHash: hash("cookie key"), valueHash: hash("cookie value"),
    identifierSha256: hash("987654321"), capturedAtMs: ledger.preActionCapturedAtMs!,
  } as const;
  request.method = "GET";
  request.sanitizedUrl = url.split("?")[0]!;
  request.hostname = "heapanalytics.com";
  request.nonEssential = false;
  request.googleConsentMode = undefined;
  request.measurementEvidence = inspectMeasurementRequest({
    url, method: "GET", requestId: request.requestId, timestampMs: request.startedAtMs,
    body: null, storedIdentifiers: [binding], hashIdentifier: hash,
  });
  p.afterActionRequests = [structuredClone(request)];
  ledger.preActionStorage = [{
    storageType: "cookie", name: cookieName, hostname: binding.hostname, nonEssential: true,
    identityBasis: "cookie_name_domain_path_partition", identityHash: binding.identityHash,
    valueHash: binding.valueHash, expiresAtEpochSeconds: 2000, capturedAtEpochSeconds: 1000,
  }];
  const transmission = assessRejectPotentialRisk(p)?.identifierTransmission;
  assert.ok(transmission && "basis" in transmission);
  assert.equal(transmission.basis, "bound_measurement_parameter");
  assert.equal(canonical(buildPostRefusalRuntimeProjection(p)).score.score, 97);
  ledger.preActionStorage[0]!.valueHash = hash("different cookie value");
  assert.equal(assessRejectPotentialRisk(p)?.identifierTransmission, undefined);
});
const ads="https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture";
const linkedin="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture";
function gpc(urls=[ga],status=204, method="GET", captureReviewPosts=false, body='{"event":"page_view"}') {
 const g=gpcProductionRuntimeFixture(),b=gpcRuntimeFixture({enabled:false}),event=g.networkEvents[1]!;
 g.networkEvents=[g.networkEvents[0]!,...urls.map((url,i)=>({...event,method,eventId:`collection-${i}`,requestId:`collection-${i}`,url,requestUrl:url,collectionEndpointObserved:!url.includes('.js')}))];
 g.normalizedVendorObservations=g.networkEvents.slice(1).map(e=>resolveCanonicalVendor({type:"request",url:e.requestUrl,evidenceId:e.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!);
 g.gpcSignalObservation!.prototypeCaptureBinding={captureId:g.gpcObservationSession!.captureId,documentToken:"fixture-loader",documentIdentitySource:"cdp_loader_id"};
 g.networkResponseEvents=g.networkEvents.slice(1).map(e=>({...e,eventId:`response-${e.eventId}`,eventType:"network_response",responseUrl:e.requestUrl,status})) as never;
 g.gpcObservationSession!.requests=g.networkEvents.map(e=>({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:createHash('sha256').update(e.requestUrl).digest('hex'),secGpc:"1"}));
 g.gpcObservationSession!.requestsObserved=g.networkEvents.length;
 if (captureReviewPosts) {
  const rows = g.networkEvents.slice(1).map(e => {
   const proof = captureCaliforniaRejectRequest({
    url:e.requestUrl, method, requestId:e.requestId!, startedAtMs:e.timestampMs, httpStatus:status,
    hasBody:true, body, headers:{"content-type":"application/json"},
   });
   assert.ok(proof);
   return {eventId:e.eventId, documentToken:"fixture-loader", capturedAtMs:900,
    proof:{...proof,contractVersion:"gpc_request_proof.v1" as const}};
  });
  g.gpcObservationSession!.requestProofCapture={contractVersion:"gpc_request_capture.v1",
   inspected:rows.length, skipped:0, pending:0, failed:0, retentionDropped:0, rows, restrictions:[]};
 }
 if (captureReviewPosts) g.gpcObservationSession=gpcObservationSessionSchema.parse(g.gpcObservationSession);
 g.gpcPrototypeSessionBinding!.sessionSha256=createHash('sha256').update(JSON.stringify(g.gpcObservationSession)).digest('hex');
 const bytes=Buffer.from(JSON.stringify(g)),pointer={uri:"s3://fixture/gpc.json",sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 return buildGpcProductionAssessment({scanId:g.scanId,comparison:buildGpcResponseAssessment({baseline:b,gpc:g,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"},gpcArtifact:pointer}),source:{bytes,pointer}});
}
function reject(status:number|undefined=204) {
 const p=afterRejectClickProjection('measurement');p.sourceIdentity={policyVersion:"post_reject_source_identity.v1",scanId:"gpc-fixture",targetSha256:p.actionControlProof!.authorizedTargetSha256!};
 for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!])r.httpStatus=status;
 return p;
}
test('Hotjar successful collector qualifies for potential risk on both paths with one recipient and no cookie match',()=>{
 const url='https://events.hotjar.io/',a=gpc([url]),p=reject();
 for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){
  r.sanitizedUrl=url;r.hostname='events.hotjar.io';r.purpose='session_replay';r.vendor='Hotjar';r.measurementEvidence=undefined;
  r.californiaCollection=captureCaliforniaRejectRequest({url,method:r.method!,requestId:r.requestId,startedAtMs:r.startedAtMs,httpStatus:204,
   hasBody:true,body:'{"uuid":"fixture"}\n{"events":[]}',headers:{'content-type':'text/plain'}})!;
 }
 const result=canonical(runtime(a,p)),g=assessGpcPotentialRisk(a)!,r=assessRejectPotentialRisk(p)!;
 assert.equal(g.rows[0]?.entityId,'ent_1426519b043f');assert.equal(r.rows[0]?.entityId,'ent_1426519b043f');
 assert.equal(g.rows[0]?.treatment,'potential_risk');assert.equal(r.rows[0]?.treatment,'potential_risk');
 assert.equal(result.score.score,89);assert.equal(result.score.deductions.length,1);
 for(const row of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){delete row.httpStatus;row.californiaCollection!.httpStatus=null;}
 assert.equal(assessRejectPotentialRisk(p)?.rows[0]?.presenceBasis,"service_request");assert.equal(assessRejectPotentialRisk(p)?.responseUnverified,1);
 assert.equal(assessGpcPotentialRisk(gpc([url],403))?.rows.every(row=>row.presenceBasis==='service_request'),true);
});
function canonical(runtime:Record<string,unknown>) {
 const f=californiaCoverageFixture();f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";f.bundle.policySurfaceObservations.forEach(r=>r.documentLanguage="en");
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{...JSON.parse(JSON.stringify(runtime)),consentControlAssessment:parent},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 return {assessment:child,findings,score:deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:findings})};
}
function runtime(a= gpc(),p=reject()) {
 const projection=buildPostRefusalRuntimeProjection(p);
 if(!("afterRejectScoringAssessment" in projection))throw Error("Missing Reject projection");
 return {gpcResponseAssessment:a,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(a),...projection};
}
test('positive unresolved collection on both paths survives persistence and receives one capped California risk effect',()=>{
 const r=runtime(),result=canonical(r),f=result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)!;
 assert.equal(f.title,"Non-essential activity after Reject click and under GPC");assert.equal(f.surfacingDecision?.reportable,true);assert.match(f.summary,/GPC visit start/);assert.match(f.summary,/after the Reject click/);
 assert.equal(result.score.score,86);assert.equal(result.score.policyVersion,'california-regulatory-posture.v26-verified-event');
 assert.equal(f.scoreEffects?.length,1);assert.equal(f.scoreEffects?.[0]?.appliesTo,'california_posture');
 assert.ok(projectCaliforniaRegulatoryPriorities(result.findings).some(f=>f.id===CA_POTENTIAL_RISK_FINDING));
 assert.equal(r.afterRejectScoringAssessment?.deductionPoints,15,'EU Reject presence remains independent');
 assert.doesNotMatch(f.summary,/deduct|points|compliant|violation observed/i);
});
test('highest treatment wins per recipient within each visit; different recipient still adds capped review effect',()=>{
 const same=canonical(runtime(gpc([ads])));assert.equal(same.score.score,78);assert.equal(same.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)?.title,"Non-essential activity after Reject click");
 const different=canonical(runtime(gpc([linkedin,ga])));assert.equal(different.score.score,71);assert.equal(different.score.deductions.filter(r=>r.findingId===CA_POTENTIAL_RISK_FINDING).length,1);
});
test('service presence survives missing collection proof while changed source invalidates the assessment',()=>{
 assert.equal(assessGpcPotentialRisk(gpc([ga],403))?.rows[0]?.presenceBasis,"service_request");
 assert.equal(assessGpcPotentialRisk(gpc(['https://www.googletagmanager.com/gtag/js?id=G-ABC']))?.rows.length,0);
 const p=reject();for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!])delete r.httpStatus;
 assert.equal(assessRejectPotentialRisk(p)?.rows[0]?.presenceBasis,"service_request");assert.equal(assessRejectPotentialRisk(p)?.responseUnverified,1);
 assert.equal(assessRejectPotentialRisk(reject(403))?.rows[0]?.presenceBasis,"service_request");
 const r=runtime();r.californiaGpcPotentialRiskAssessment!.sourceSha256='a'.repeat(64);r.californiaRejectPotentialRiskAssessment!.rows[0]!.msFromAnchor++;
 assert.equal(retainedPotentialRisk(r).length,0);assert.ok(!canonical(r).findings.some(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING));
});
test('NPA alone is context; declared RDP is retained without potential-risk promotion',()=>{
 const a=assessGpcPotentialRisk(gpc())!;assert.equal(a.rows[0]!.treatment,'potential_risk');assert.ok(a.rows[0]!.processingSignals.includes('google_npa'));
 const restricted=assessGpcPotentialRisk(gpc([ga+'&rdp=1']))!;assert.equal(restricted.rows[0]!.treatment,'declared_restriction');
});
test('historical GPC observations are not silently upgraded on read',()=>{
 const a=gpc();delete a.observation.requests.collectionReview;assert.equal(assessGpcPotentialRisk(a),null);
});

test('new Reject scope feeds potential risk once while historical scale policies retain the narrower scope',()=>{
 const p=withRetainedRejectContext(reject(),'Decline'),risk=assessRejectPotentialRisk(p)!;
 assert.equal(risk.policyVersion,'california.collection-review.v8-verified-event');assert.equal(risk.rows.length,1);
 assert.equal(assessRejectPotentialRisk(p,'california.collection-review.v2'),null);
 assert.equal(assessRejectPotentialRisk(p,CA_POTENTIAL_RISK_LEGACY_POLICY),null);
 const result=canonical(runtime(gpc(),p));assert.equal(result.score.score,86,'the same recipient counts independently on both visits');
 assert.equal(result.score.policyVersion,'california-regulatory-posture.v26-verified-event');
 const failed=structuredClone(p);delete failed.scoringEvidence!.requests[0]!.httpStatus;delete failed.afterActionRequests![0]!.httpStatus;
 assert.equal(assessRejectPotentialRisk(failed)?.rows[0]?.presenceBasis,"service_request");assert.equal(assessRejectPotentialRisk(failed)?.responseUnverified,1);
});

test('California risk findings do not change EU deductions or treat GPC as EU refusal',()=>{
 const r=runtime();
 function eu(runtimeArtifacts:Record<string,unknown>){
  const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  const unifiedFindings=buildUnifiedFindingDisplayPackets({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts,normalizedConcerns,scanCompleted:true,coverageLimited:false});
  const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,projectedFindings:[],unifiedFindings,scanCompleted:true,coverageLimited:false});
  return deriveRegulatoryCoverageScore({framework:"gdpr_eprivacy",rows});
 }
 const historical={...r,californiaGpcPotentialRiskAssessment:undefined,californiaRejectPotentialRiskAssessment:undefined};
 assert.deepEqual(eu(r),eu(historical));
 const a=gpc(),g={gpcResponseAssessment:a,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(a)};
 assert.deepEqual(eu(g),eu({gpcResponseAssessment:a}));
});

test('Admin GPC count includes the distinct recipient receiving the potential-risk effect',()=>{
 const r=runtime(gpc([linkedin,ga])),result=canonical(r);
 const snapshot={report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:"2026-10-22T20:00:00.000Z",
  admin_canonical_score_input:{scanId:"gpc-fixture",projectionScanId:"gpc-fixture",assessment:result.assessment,gpcAssessment:r.gpcResponseAssessment,unifiedFindings:result.findings,checklistRows:[]}};
 assert.equal(projectAdminScoringEntityCounts("gpc-fixture",snapshot,false).gpc,2);
 assert.equal(projectAdminScoringEntityCounts("gpc-fixture",snapshot,true).gpc,null);
});

test('decoded GPP restrictions remain observation-only when a redundant signal flag is missing',()=>{
 const a=gpc(),q=a.observation.requests.collectionReview!.rows[0]!.qualification;
 q.processingSignals=[];
 q.gpp={policyVersion:"gpp_request_decode.v1",decoderVersion:"@iabgpp/cmpapi@3.2.0",status:"decoded",sectionIds:[8],applicableSections:[8],
  sections:[{sectionId:8,version:1,saleNotice:1,sharingNotice:1,saleOptOut:1,sharingOptOut:1,targetedAdvertisingOptOut:null,serviceProviderMode:1,gpc:true}],
  requestSignals:"consistent",cmpComparison:"not_compared",reasons:[]};
 assert.equal(assessGpcPotentialRisk(a)?.rows[0]?.treatment,"declared_restriction");
});

test('new schedule deduplicates recipients, caps at 15 and preserves historical flat scoring',()=>{
 for(const [n,points] of [0,7,11,13,15,15,15].entries())assert.equal(potentialRiskPoints(Array.from({length:n},(_,i)=>`recipient-${i}`)),points);
 assert.equal(potentialRiskPoints(['same','same']),7);
 assert.equal(potentialRiskPoints(['one','two'],CA_POTENTIAL_RISK_LEGACY_POLICY),5);
 const r=runtime();r.californiaGpcPotentialRiskAssessment=assessGpcPotentialRisk(r.gpcResponseAssessment,CA_POTENTIAL_RISK_LEGACY_POLICY);
 r.californiaRejectPotentialRiskAssessment=assessRejectPotentialRisk(r.postRefusalEvidenceProjection,CA_POTENTIAL_RISK_LEGACY_POLICY);
 assert.equal(canonical(r).score.score,95);assert.equal(canonical(r).score.policyVersion,'california-regulatory-posture.v15-collection-review');
 const prior=runtime();prior.californiaGpcPotentialRiskAssessment=assessGpcPotentialRisk(prior.gpcResponseAssessment,'california.collection-review.v2');
 prior.californiaRejectPotentialRiskAssessment=assessRejectPotentialRisk(prior.postRefusalEvidenceProjection,'california.collection-review.v2');
 assert.equal(canonical(prior).score.score,93);assert.equal(canonical(prior).score.policyVersion,'california-regulatory-posture.v16-collection-review');
});
test('stronger recipient proof never improves the score and the combined family stays capped',()=>{
 const ids=Array.from({length:65},(_,i)=>`recipient-${i}`);
 for(let f=0;f<=32;f++)for(let p=0;p<=32;p++){
  const full=ids.slice(0,f),potential=ids.slice(f,f+p),base=californiaChoiceEnforcementPoints(full,f>0);
  const total=base+potentialRiskIncrement(full,potential,f>0);
  assert.ok(total<=47);assert.ok(potentialRiskIncrement(full,potential,f>0)<=15);
  if(p){const stronger=ids.slice(0,f+1),rest=ids.slice(f+1,f+p);
   assert.ok(californiaChoiceEnforcementPoints(stronger,true)+potentialRiskIncrement(stronger,rest,true)>=total,`promotion ${f}/${p}`);
  }
 }
 assert.equal(potentialRiskIncrement(['a','b','c'],['d'],true),5,'32 + 5 equals the full four-recipient total of 37');
 assert.equal(potentialRiskIncrement(['a'],['a'],true),0,'same recipient never adds risk points');
});

test('verified collection scale steps reach persisted canonical findings and California scores',()=>{
 for(let n=1;n<=9;n++){
  const a=gpc(Array.from({length:n},()=>ga));
  a.observation.requests.collectionReview!.rows.forEach((r,i)=>{r.entityId=`ent_${String(i+1).padStart(12,'0')}`;r.label=`Fixture recipient ${i+1}`;});
  const result=canonical({gpcResponseAssessment:a,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(a)});
  const expected=[0,7,11,13,15,15,15,15,15,15][n]!;
  assert.equal(result.score.score,100-expected);
  assert.equal(result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)?.scoreEffects?.[0]?.deductionPoints,expected);
 }
});

test('mixed-family headroom is applied through the canonical scorer',()=>{
 const a=gpc([ads,linkedin,'https://www.facebook.com/tr/?id=fixture&ev=PageView&fbp=visitor-fixture','https://track.hubspot.com/__ptc.gif?vi=visitor-fixture']);
 const result=canonical({gpcResponseAssessment:a,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(a)});
 const full=result.score.deductions.find(r=>r.policyKey==='california.choice_enforcement.recipients');
 const risk=result.score.deductions.find(r=>r.findingId===CA_POTENTIAL_RISK_FINDING);
 assert.equal(full?.points,32);assert.equal(risk?.points,5);assert.equal(result.score.score,63);
});

test('expanded collector matrix persists GPC and Reject findings with one CA recipient and independent EU presence',()=>{
 const urls=['https://analytics.tiktok.com/api/v2/pixel','https://ct.pinterest.com/v3/','https://tr.snapchat.com/p','https://alb.reddit.com/rp','https://a.klaviyo.com/api/track','https://track.hubspot.com/__ptc.gif'];
 for(const url of urls){
  const a=gpc([url]),p=reject();
  const vendor=resolveCanonicalVendor({type:'request',url,matchSource:'network_request'}).observation!;
  for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){
   r.method='POST';r.sanitizedUrl=url;r.hostname=new URL(url).hostname;r.purpose=vendor.purpose as typeof r.purpose;r.nonEssential=true;r.vendor=vendor.vendor;r.measurementEvidence=undefined;
   r.californiaCollection=captureCaliforniaRejectRequest({url,method:'POST',requestId:r.requestId,startedAtMs:r.startedAtMs,httpStatus:204,hasBody:true,body:undefined,headers:{'content-type':'application/json'}})!;
  }
  const r=runtime(a,p),result=canonical(r),retained=retainedPotentialRisk(JSON.parse(JSON.stringify(r)));
  assert.equal(retained.length,2,url);assert.ok(retained.every(x=>x.rows.some(row=>row.entityId===vendor.registryAttribution!.entityId)),url);
  assert.equal(result.score.score,89,url);assert.equal(result.score.deductions.length,1,'one capped family row containing both visit effects');
  assert.equal(r.afterRejectScoringAssessment?.deductionPoints,15,'EU uses presence independently');
  const finding=result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)!;
  assert.equal(finding.surfacingDecision?.reportable,true);assert.match(finding.summary,/GPC visit start/);assert.match(finding.summary,/after the Reject click/);
  assert.doesNotMatch(finding.summary,/deduct|points|violation observed/i);
  for(const request of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){delete request.httpStatus;request.californiaCollection!.httpStatus=null;}
  assert.equal(assessRejectPotentialRisk(p)?.rows[0]?.presenceBasis,"service_request",'missing successful response cannot be repaired by recognition');
  assert.equal(assessGpcPotentialRisk(gpc([url],403))?.rows.every(row=>row.presenceBasis==='service_request'),true);
 }
});

test('source-reviewed pixel identity recipes reach the full CA family once per visit',()=>{
 const protocols=[
 ['https://analytics.tiktok.com/api/v2/pixel',{pixel_code:'publisher',event:'PageView',ttp:'visitor-fixture'}],
 ['https://tr.snapchat.com/p',{pid:'publisher',ev:'PAGE_VIEW',u_c1:'visitor-fixture'}],
 ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',epik:'visitor-fixture'}],
 ['https://alb.reddit.com/rp',{id:'publisher',event:'PageVisit',uuid:'visitor-fixture'}],
 ]as const;
 for(const[url,fields]of protocols){
  const a=gpc([url+'?'+new URLSearchParams(fields)]),p=reject();
  const vendor=resolveCanonicalVendor({type:'request',url,matchSource:'network_request'}).observation!;
  for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){
   r.method='POST';r.sanitizedUrl=url;r.hostname=new URL(url).hostname;r.purpose='advertising';r.nonEssential=true;r.vendor=vendor.vendor;r.measurementEvidence=undefined;
   r.californiaCollection=captureCaliforniaRejectRequest({url,method:'POST',requestId:r.requestId,startedAtMs:r.startedAtMs,httpStatus:204,hasBody:true,body:JSON.stringify(fields),headers:{'content-type':'application/json'}})!;
  }
  const persisted=JSON.parse(JSON.stringify(runtime(a,p))),result=canonical(persisted);
  assert.equal(result.score.score,70,url);assert.equal(result.score.deductions.length,1,'one capped family row containing both visit effects');
  assert.ok(result.findings.some(f=>f.unifiedFindingId==='gpc_response'&&f.surfacingDecision?.reportable));
  assert.ok(result.findings.some(f=>f.unifiedFindingId==='california_post_reject_collection'&&f.surfacingDecision?.reportable));
  assert.equal(persisted.afterRejectScoringAssessment.deductionPoints,15,'EU presence stays independent of CA role');
 }
});

test("Google GPC page views count once under collection review with a declared sale opt-out", () => {
 const endpoint = "https://pagead2.googlesyndication.com/ccm/collect?en=page_view&dl=https://example.test/&npa=1&us_privacy=1-Y-";
 const capture = gpc([endpoint, endpoint],200,"POST");
 const result = assessGpcPotentialRisk(capture,"california.collection-review.v7-presence")!;
 assert.equal(scoreCaliforniaCollectionReview([assessGpcPotentialRisk(capture)!]).reviewPoints,0);
 assert.equal(result.rows.length,2);
 for (const row of result.rows) {
   assert.equal(row.treatment,"potential_risk");
   assert.ok(row.processingSignals.includes("us_privacy_sale_opt_out"));
 }
 const projected = canonical({gpcResponseAssessment:capture,californiaGpcPotentialRiskAssessment:result});
 const legacyReject = reject();
 const mixed = canonical({...runtime(capture,legacyReject), californiaGpcPotentialRiskAssessment:result, californiaRejectPotentialRiskAssessment:assessRejectPotentialRisk(legacyReject,"california.collection-review.v3-retained-scope")});
 assert.equal(mixed.score.deductions.find(d=>d.findingId===CA_POTENTIAL_RISK_FINDING)?.points,11);
 assert.equal(projected.score.potentialRiskRecipientIds?.length,1);
 assert.equal(projected.score.deductions.find(d=>d.findingId===CA_POTENTIAL_RISK_FINDING)?.points,4);
 assert.equal(assessGpcPotentialRisk(capture,"california.collection-review.v3-retained-scope")?.rows[0]?.treatment,"declared_restriction");
 for (const value of [endpoint.replace("en=page_view","en=consent"),endpoint.replace("https://example.test/","https://other.test/"),endpoint+"&en=page_view"]) {
   assert.deepEqual(assessGpcPotentialRisk(gpc([value],200,"POST"))?.rows,[]);
 }
 assert.deepEqual(assessGpcPotentialRisk(gpc([endpoint],200,"GET"))?.rows,[]);
 assert.equal(assessGpcPotentialRisk(gpc([endpoint],403,"POST"))?.rows[0]?.presenceBasis,"service_request");
 assert.equal(assessGpcPotentialRisk(gpc([endpoint+"&rdp=1"],200,"POST"))?.rows[0]?.treatment,"declared_restriction");
});

test("identifier transmission is one California review effect, and stronger same-event evidence absorbs it", () => {
 const p=reject();
 const request=p.scoringEvidence!.requests[0]!;
 const name="rl_anonymous_id";
 const witness={packetSha256:p.packetSha256!,graphSha256:"e".repeat(64),requestNodeId:"beacon",
   requestId:request.requestId,endpoint:"https://www.google-analytics.com/g/collect",startedAtMs:request.startedAtMs,
   httpStatus:204,cookieName:name,cookieDomain:"google-analytics.com"};
 p.sentIdentifierWitness=witness;
 // This same request is already attributed to Google Analytics by the stronger rule.
 let risk=assessRejectPotentialRisk(p)!;
 assert.equal(risk.identifierTransmission,undefined);
 assert.equal(risk.rows.length,1);
 assert.equal(canonical(buildPostRefusalRuntimeProjection(p)).score.deductions.find(d=>d.findingId===CA_POTENTIAL_RISK_FINDING)?.points,7);
 for(const row of [...p.scoringEvidence!.requests,...p.afterActionRequests!]) {
   row.nonEssential=false;row.purpose="unknown";row.method="POST";row.resourceType="ping";row.hostname="example.test";
   row.sanitizedUrl="https://example.test/batch";delete row.measurementEvidence;
 }
 witness.endpoint="https://example.test/batch";witness.cookieDomain="example.test";
 risk=assessRejectPotentialRisk(p)!;
 assert.deepEqual(risk.identifierTransmission,witness);
 assert.equal(assessRejectPotentialRisk(p,"california.collection-review.v4-google-page-view")?.identifierTransmission,undefined);
 let score=canonical(buildPostRefusalRuntimeProjection(p)).score;
 assert.equal(score.score,97);
 assert.equal(score.potentialRiskRecipientIds?.length??0,0);
 score=canonical(runtime(gpc(),p)).score;
 assert.equal(score.score,90);
 for (const change of [{packetSha256:"9".repeat(64)},{startedAtMs:0},{requestId:"wrong"},{httpStatus:201},{cookieName:"rl_page_init_referrer"}]) {
   assert.equal(assessRejectPotentialRisk({...p,sentIdentifierWitness:{...witness,...change}})?.identifierTransmission,undefined);
 }
});

test("repeated requests share one recipient inside each visit and the review cap covers both visits", () => {
  const capture = gpc([ga, ga]);
  const replay = runtime(capture);
  assert.equal(canonical(replay).score.score, 86);
  const g = replay.californiaGpcPotentialRiskAssessment!;
  const r = replay.californiaRejectPotentialRiskAssessment!;
  const original = r.rows[0]!;
  const twoAfterReject = {...r, rows: [...r.rows, {...original, evidenceId:"second-entity", entityId:"ent_000000000001"}]};
  assert.equal(scoreCaliforniaCollectionReview([g, twoAfterReject]).reviewPoints, 15);
  const full = {gpc:new Set([original.entityId]), reject:new Set<string>(), explicitOptOut:new Set<string>(), supported:true};
  assert.equal(scoreCaliforniaCollectionReview([g,r],full).reviewPoints, 7);
  full.reject.add(original.entityId);
  assert.equal(scoreCaliforniaCollectionReview([g,r],full).reviewPoints, 0);
  full.gpc = new Set(Array.from({length:3},(_,i)=>`ent_${String(i).padStart(12,"0")}`));
  assert.equal(scoreCaliforniaCollectionReview([g,twoAfterReject],full).reviewPoints, 0, "32 plus 15 exhausts the shared 47-point cap");
});
test("historical scaled review assessments retain the shared recipient effect", () => {
  const replay = runtime();
  const previous = "california.collection-review.v4-google-page-view";
  replay.californiaGpcPotentialRiskAssessment = assessGpcPotentialRisk(replay.gpcResponseAssessment, previous);
  replay.californiaRejectPotentialRiskAssessment = assessRejectPotentialRisk(replay.postRefusalEvidenceProjection, previous);
  assert.equal(canonical(replay).score.score, 93);
});

test("Google and OpenAI event receipts score once per recipient on each eligible visit", () => {
 const document = gpcProductionRuntimeFixture().url;
 for (const route of ["https://bzr.openai.com/v1/sdk/events","https://pagead2.googlesyndication.com/ccm/collect"]) {
  const google = route.includes("googlesyndication");
  const url = google ? route + "?en=page_view&dl=" + encodeURIComponent(document) : route;
  const p = reject(200);
  p.sourceIdentity!.targetSha256 = p.actionControlProof!.authorizedTargetSha256 = createHash("sha256").update(document).digest("hex");
  for (const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!]) {
   r.sanitizedUrl=route; r.hostname=new URL(url).hostname; r.vendor=google?"Google":"OpenAI"; r.purpose="advertising"; r.measurementEvidence=undefined;
   r.californiaCollection=captureCaliforniaRejectRequest({url,method:"POST",startedAtMs:r.startedAtMs,requestId:r.requestId,httpStatus:200,
    hasBody:!google,body:google?null:'{"event":"page_view"}',headers:google?{}:{"content-type":"application/json"}})!;
  }
  assert.deepEqual(assessRejectPotentialRisk(p)?.rows.map(r=>r.treatment),["potential_risk"]);
  const serviceOnly = assessGpcPotentialRisk(gpc([url],200,"POST",false))!;
  if (!google) assert.equal(serviceOnly.rows[0]?.presenceBasis,"service_request");
  const bothVisits = gpc([url,url],200,"POST",true);
  assert.equal(canonical(buildPostRefusalRuntimeProjection(p)).score.score,google?93:96);
  assert.equal(assessGpcPotentialRisk(bothVisits)?.rows.length,2);
  assert.equal(canonical(runtime(bothVisits,p)).score.score,google?86:92);
  assert.deepEqual(assessRejectPotentialRisk(p,"california.collection-review.v4-google-page-view")?.rows,[]);
  for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!]) delete r.californiaCollection!.reviewEvent;
  assert.equal(assessRejectPotentialRisk(p)?.rows[0]?.presenceBasis,"service_request");
 }
});

test("a nested OpenAI measurement earns verified credit under GPC and a redirect earns only presence", () => {
  const url = "https://bzr.openai.com/v1/sdk/events?pid=fixture&ec=1";
  const body = JSON.stringify({events:[{type:"page_viewed", data:{type:"contents"}}]});
  const assessment = assessGpcPotentialRisk(gpc([url,url],202,"POST",true,body))!;
  assert.ok(assessment.rows.some(row => row.verifiedCollection));
  assert.equal(scoreCaliforniaCollectionReview([assessment]).reviewPoints,7);
  const redirect = assessGpcPotentialRisk(gpc([ga],302))!;
  assert.equal(scoreCaliforniaCollectionReview([redirect]).reviewPoints,4);
});

test("presence tiers score 7, 14 and 19 while preserving historical per-visit scores", () => {
  const r = assessRejectPotentialRisk(reject())!;
  const first = {...r.rows[0]!, verifiedCollection:undefined, presenceBasis:"service_request" as const};
  const second = {...first, entityId:"ent_000000000011", evidenceId:"second"};
  const partial = {...r, rows:[first,second,{...second,evidenceId:"repeat"}]};
  assert.equal(scoreCaliforniaCollectionReview([partial]).reviewPoints,7);
  const mixed = {...partial, rows:[r.rows[0]!, second]};
  assert.equal(scoreCaliforniaCollectionReview([mixed]).reviewPoints,10);
  assert.equal(scoreCaliforniaCollectionReview([partial,{...partial,path:"gpc"}]).reviewPoints,14);
  const full = {gpc:new Set<string>(),reject:new Set([first.entityId]),explicitOptOut:new Set<string>(),supported:true};
  assert.equal(californiaChoiceEnforcementPoints([...full.reject],true)+scoreCaliforniaCollectionReview([partial],full).reviewPoints,19);
  const many = {...r,rows:Array.from({length:9},(_,i)=>({...first,entityId:"ent_"+String(i).padStart(12,"0"),evidenceId:String(i)}))};
  assert.equal(scoreCaliforniaCollectionReview([many,{...many,path:"gpc"}]).reviewPoints,15);
  const old = "california.collection-review.v6-per-visit";
  const replay=runtime();
  replay.californiaGpcPotentialRiskAssessment=assessGpcPotentialRisk(replay.gpcResponseAssessment,old);
  replay.californiaRejectPotentialRiskAssessment=assessRejectPotentialRisk(replay.postRefusalEvidenceProjection,old);
  assert.equal(canonical(replay).score.score,86);
});

test("Reject cookie presence alone earns partial credit with factual snapshot wording", () => {
  const p=reject();
  p.scoringEvidence!.requests=[];
  p.afterActionRequests=[];
  p.afterActionCapture!.requestAncestry=[];
  p.afterActionCapture!.requestIds=[];
  const cookies=[{storageType:"cookie" as const,name:"nmstat",hostname:"example.test",valueHash:"f".repeat(64),
    purpose:"unknown" as const,nonEssential:false}];
  p.afterActionStorage=cookies;
  p.scoringEvidence!.postActionStorage=cookies;
  const runtime=buildPostRefusalRuntimeProjection(p);
  const result=canonical(runtime);
  assert.equal(result.score.score,96);
  const finding=result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)!;
  assert.equal(finding.title,"Non-essential activity after Reject click");
  assert.match(finding.summary,/cookie snapshot/);
  assert.doesNotMatch(finding.summary,/collection was observed|retained requests/i);
  p.afterActionCapture!.storageSnapshotRetained=false;
  assert.equal(assessRejectPotentialRisk(p),null);
});

test("a bound GPC cookie alone reaches the California score through the persisted finding", () => {
  const capture=gpc([]);
  const o=capture.observation;
  o.presenceEvidence=[{presenceBasis:"cookie_snapshot",evidenceId:"cookie:"+"e".repeat(64),entity:"Fixture recipient",
    entityId:"ent_000000000001",purpose:"analytics",msFromAnchor:o.requests.throughMs!,processingSignals:[]}];
  const risk=assessGpcPotentialRisk(capture);
  const result=canonical({gpcResponseAssessment:capture,californiaGpcPotentialRiskAssessment:risk});
  assert.equal(result.score.score,96);
  const finding=result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)!;
  assert.equal(finding.title,"Non-essential activity under GPC");
  assert.match(finding.summary,/cookie snapshot observation under GPC/);
  o.delivery.httpHeaderRetained=false;
  assert.equal(assessGpcPotentialRisk(capture),null);
});
