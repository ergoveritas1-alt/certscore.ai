import {potentialRiskPoints,potentialRiskIncrement,CA_POTENTIAL_RISK_LEGACY_POLICY} from "./california-potential-risk-policy";
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
import {deriveConsentControlAssessment} from "@certscore/contracts";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
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
const ads="https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=visitor-fixture";
const linkedin="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture";
function gpc(urls=[ga],status=204) {
 const g=gpcProductionRuntimeFixture(),b=gpcRuntimeFixture({enabled:false}),event=g.networkEvents[1]!;
 g.networkEvents=[g.networkEvents[0]!,...urls.map((url,i)=>({...event,eventId:`collection-${i}`,requestId:`collection-${i}`,url,requestUrl:url,collectionEndpointObserved:!url.includes('.js')}))];
 g.normalizedVendorObservations=g.networkEvents.slice(1).map(e=>resolveCanonicalVendor({type:"request",url:e.requestUrl,evidenceId:e.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!);
 g.gpcSignalObservation!.prototypeCaptureBinding={captureId:g.gpcObservationSession!.captureId,documentToken:"fixture-loader",documentIdentitySource:"cdp_loader_id"};
 g.networkResponseEvents=g.networkEvents.slice(1).map(e=>({...e,eventId:`response-${e.eventId}`,eventType:"network_response",responseUrl:e.requestUrl,status})) as never;
 g.gpcObservationSession!.requests=g.networkEvents.map(e=>({eventId:e.eventId,timestampMs:e.timestampMs,urlSha256:createHash('sha256').update(e.requestUrl).digest('hex'),secGpc:"1"}));
 g.gpcObservationSession!.requestsObserved=g.networkEvents.length;
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
 assert.equal(result.score.score,93);assert.equal(result.score.deductions.length,1);
 for(const row of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){delete row.httpStatus;row.californiaCollection!.httpStatus=null;}
 assert.equal(assessRejectPotentialRisk(p)?.rows.length,0);assert.equal(assessRejectPotentialRisk(p)?.responseUnverified,1);
 assert.equal(assessGpcPotentialRisk(gpc([url],403))?.rows.length,0);
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
 assert.ok(f);assert.equal(f.surfacingDecision?.reportable,true);assert.match(f.summary,/GPC visit start/);assert.match(f.summary,/after the Reject click/);
 assert.equal(result.score.score,93);assert.equal(result.score.policyVersion,'california-regulatory-posture.v17-reject-scope');
 assert.equal(f.scoreEffects?.length,1);assert.equal(f.scoreEffects?.[0]?.appliesTo,'california_posture');
 assert.ok(projectCaliforniaRegulatoryPriorities(result.findings).some(f=>f.id===CA_POTENTIAL_RISK_FINDING));
 assert.equal(r.afterRejectScoringAssessment?.deductionPoints,15,'EU Reject presence remains independent');
 assert.doesNotMatch(f.summary,/deduct|points|compliant|violation observed/i);
});
test('highest treatment wins per recipient across GPC and Reject; different recipient still adds capped review effect',()=>{
 const same=canonical(runtime(gpc([ads])));assert.equal(same.score.score,85);assert.ok(same.findings.some(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING),'Reject finding remains visible');
 const different=canonical(runtime(gpc([linkedin,ga])));assert.equal(different.score.score,78);assert.equal(different.score.deductions.filter(r=>r.findingId===CA_POTENTIAL_RISK_FINDING).length,1);
});
test('failed response, script download, missing response proof and changed source do not become positive review deductions',()=>{
 assert.equal(assessGpcPotentialRisk(gpc([ga],403))?.rows.length,0);
 assert.equal(assessGpcPotentialRisk(gpc(['https://www.googletagmanager.com/gtag/js?id=G-ABC']))?.rows.length,0);
 const p=reject();for(const r of [...p.scoringEvidence!.requests,...p.afterActionRequests!])delete r.httpStatus;
 assert.equal(assessRejectPotentialRisk(p)?.rows.length,0);assert.equal(assessRejectPotentialRisk(p)?.responseUnverified,1);
 assert.equal(assessRejectPotentialRisk(reject(403))?.rows.length,0);
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
 assert.equal(risk.policyVersion,'california.collection-review.v3-retained-scope');assert.equal(risk.rows.length,1);
 assert.equal(assessRejectPotentialRisk(p,'california.collection-review.v2'),null);
 assert.equal(assessRejectPotentialRisk(p,CA_POTENTIAL_RISK_LEGACY_POLICY),null);
 const result=canonical(runtime(gpc(),p));assert.equal(result.score.score,93,'same potential recipient on both paths counts once');
 assert.equal(result.score.policyVersion,'california-regulatory-posture.v17-reject-scope');
 const failed=structuredClone(p);delete failed.scoringEvidence!.requests[0]!.httpStatus;delete failed.afterActionRequests![0]!.httpStatus;
 assert.equal(assessRejectPotentialRisk(failed)?.rows.length,0);assert.equal(assessRejectPotentialRisk(failed)?.responseUnverified,1);
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

test('all four scale steps reach persisted canonical findings and California scores',()=>{
 for(let n=1;n<=5;n++){
  const a=gpc(Array.from({length:n},()=>ga));
  a.observation.requests.collectionReview!.rows.forEach((r,i)=>{r.entityId=`ent_${String(i+1).padStart(12,'0')}`;r.label=`Fixture recipient ${i+1}`;});
  const r=runtime(a,reject(403)),result=canonical(r);
  const expected=[0,7,11,13,15,15][n]!;
  assert.equal(result.score.score,100-expected);
  assert.equal(result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)?.scoreEffects?.[0]?.deductionPoints,expected);
 }
});

test('mixed-family headroom is applied through the canonical scorer',()=>{
 const a=gpc([ads,linkedin,'https://www.facebook.com/tr/?id=fixture&ev=PageView&fbp=visitor-fixture','https://track.hubspot.com/__ptc.gif?vi=visitor-fixture']);
 const result=canonical(runtime(a,reject(403)));
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
  assert.equal(result.score.score,93,url);assert.equal(result.score.deductions.length,1,'one CA recipient across GPC and Reject');
  assert.equal(r.afterRejectScoringAssessment?.deductionPoints,15,'EU uses presence independently');
  const finding=result.findings.find(f=>f.unifiedFindingId===CA_POTENTIAL_RISK_FINDING)!;
  assert.equal(finding.surfacingDecision?.reportable,true);assert.match(finding.summary,/GPC visit start/);assert.match(finding.summary,/after the Reject click/);
  assert.doesNotMatch(finding.summary,/deduct|points|violation observed/i);
  for(const request of [...p.scoringEvidence!.requests,...p.afterActionRequests!]){delete request.httpStatus;request.californiaCollection!.httpStatus=null;}
  assert.equal(assessRejectPotentialRisk(p)?.rows.length,0,'missing successful response cannot be repaired by recognition');
  assert.equal(assessGpcPotentialRisk(gpc([url],403))?.rows.length,0);
 }
});

test('source-reviewed pixel identity recipes reach the full CA family once across both paths',()=>{
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
  assert.equal(result.score.score,85,url);assert.equal(result.score.deductions.length,1,'full recipient union is charged once');
  assert.ok(result.findings.some(f=>f.unifiedFindingId==='gpc_response'&&f.surfacingDecision?.reportable));
  assert.ok(result.findings.some(f=>f.unifiedFindingId==='california_post_reject_collection'&&f.surfacingDecision?.reportable));
  assert.equal(persisted.afterRejectScoringAssessment.deductionPoints,15,'EU presence stays independent of CA role');
 }
});
