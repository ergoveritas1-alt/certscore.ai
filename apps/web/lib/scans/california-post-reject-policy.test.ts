import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {postRefusalReportProjectionSchema,deriveConsentControlAssessment,canonicalEvidenceBundleSchema,gpcObservationSessionSchema} from "@certscore/contracts";
import {captureCaliforniaRejectRequest} from "../../../../packages/certscore-scan-core/src/california-reject-request";
import {assessCaliforniaPostReject,retainedCaliforniaPostReject} from "./california-post-reject-policy";
import {afterRejectClickProjection,withRetainedRejectContext} from "./test-fixtures/after-reject-scoring";
import {buildPostRefusalRuntimeProjection} from "./post-refusal-runtime-projection";
import {buildUnifiedFindingDisplayPackets} from "./unified-findings";
import {deriveCaliforniaRegulatoryScore} from "./california-regulatory-score";
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "../../server/scans/california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "../../server/scans/california-privacy-review-projection";
import {gpcProductionRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import {gpcRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import {buildGpcProductionAssessment} from "../../../../packages/certscore-scan-core/src/gpc-production-observation";
import {buildGpcResponseAssessment} from "../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {magniteAuctionBody,magniteAuctionUrl} from "../../../../packages/certscore-contracts/src/test-fixtures/magnite-auction";
import {indexAuctionBody,indexAuctionUrl} from "../../../../packages/certscore-contracts/src/test-fixtures/index-auction";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {extractPropertySaleSharingSource} from "@certscore/vendor-resolver/property-sale-sharing";
const linkedin="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture";
const google="https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC&cid=visitor-fixture";
function projection(urls=[linkedin]) {
 const p=afterRejectClickProjection();p.sourceIdentity={policyVersion:"post_reject_source_identity.v1",scanId:"gpc-fixture",targetSha256:p.actionControlProof!.authorizedTargetSha256!};
 const template=p.scoringEvidence!.requests[0]!;
 const requests=urls.map((url,i)=>({...template,requestId:`request-${i}`,sanitizedUrl:new URL(url).origin+new URL(url).pathname,hostname:new URL(url).hostname,
  method:"GET",startedAtMs:200+i,rootStartedAtMs:200+i,measurementEvidence:undefined,googleConsentMode:undefined,
  californiaCollection:captureCaliforniaRejectRequest({url,method:"GET",requestId:`request-${i}`,startedAtMs:200+i,httpStatus:204,hasBody:false})!}));
 p.scoringEvidence!.requests=requests;p.afterActionRequests=structuredClone(requests);
 p.afterActionCapture!.requestIds=requests.map(r=>r.requestId);p.afterActionCapture!.requestAncestry=requests.map(r=>({requestId:r.requestId,rootStartedAtMs:r.rootStartedAtMs!}));
 return postRefusalReportProjectionSchema.parse(p);
}
function gpc() {
 const g=gpcProductionRuntimeFixture(),event=g.networkEvents[1]!;
 event.requestUrl=event.url=linkedin;event.collectionEndpointObserved=true;
 g.networkResponseEvents=[{...event,eventId:"response",eventType:"network_response",responseUrl:linkedin,status:204,setCookieHeaders:[],setCookieMetadata:[],cookieNamesSet:[],cacheHeaders:{},accessControlHeaders:{}}];
 g.normalizedVendorObservations=[resolveCanonicalVendor({type:"request",url:linkedin,evidenceId:event.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!];
 g.gpcObservationSession!.requests.find(r=>r.eventId===event.eventId)!.urlSha256=createHash("sha256").update(linkedin).digest("hex");
 g.gpcPrototypeSessionBinding!.sessionSha256=createHash("sha256").update(JSON.stringify(g.gpcObservationSession)).digest("hex");
 const bytes=Buffer.from(JSON.stringify(g)),pointer={uri:"s3://fixture/gpc.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length};
 const comparison=buildGpcResponseAssessment({baseline:gpcRuntimeFixture({enabled:false}),gpc:g,gpcArtifact:pointer,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"}});
 return buildGpcProductionAssessment({scanId:g.scanId,comparison,source:{bytes,pointer}});
}
function canonical(p:ReturnType<typeof projection>,withGpc=false,gpcOverride?:ReturnType<typeof gpc>) {
 const f=californiaCoverageFixture();f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const runtime=JSON.parse(JSON.stringify({...buildPostRefusalRuntimeProjection(p),consentControlAssessment:parent,...(withGpc?{gpcResponseAssessment:gpcOverride??gpc()}:{})}));
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 return {runtime,findings,score:deriveCaliforniaRegulatoryScore({assessment:child,unifiedFindings:findings,checklistRows:[]})};
}

type AuctionRequest={url:string;body:Record<string,unknown>};
const indexRequests=():AuctionRequest[]=>[{url:indexAuctionUrl,body:indexAuctionBody()}];
const magniteRequests=():AuctionRequest[]=>[{url:magniteAuctionUrl,body:magniteAuctionBody()}];
function auctionProjection(regs?:unknown,inputs=indexRequests()){
 const p=projection(),template=p.scoringEvidence!.requests[0]!;
 const requests=inputs.map((input,i)=>{
  const row={...template,requestId:`auction-${i}`,method:"POST",startedAtMs:200+i,rootStartedAtMs:200+i,
   sanitizedUrl:new URL(input.url).origin+new URL(input.url).pathname,hostname:new URL(input.url).hostname};
  row.californiaCollection=captureCaliforniaRejectRequest({url:input.url,method:"POST",body:JSON.stringify({...input.body,...(regs?{regs}:{})}),
   headers:{"content-type":"text/plain"},hasBody:true,requestId:row.requestId,startedAtMs:row.startedAtMs,httpStatus:200})!;
  return row;
 });
 p.scoringEvidence!.requests=requests;p.afterActionRequests=structuredClone(requests);
 p.afterActionCapture!.requestIds=requests.map(r=>r.requestId);p.afterActionCapture!.requestAncestry=requests.map(r=>({requestId:r.requestId,rootStartedAtMs:r.rootStartedAtMs!}));
 return postRefusalReportProjectionSchema.parse(p);
}
function auctionGpc(regs?:unknown,mode?:"failed_response"|"missing_signal"|"wrong_hash",inputs=indexRequests()){
 const b=gpcProductionRuntimeFixture(),template=b.networkEvents[1]!,s=b.gpcObservationSession!;
 const events=inputs.map((input,i)=>({...template,eventId:`vendor_${i}`,requestId:`vendor_${i}`,timestampMs:500+i,
  requestUrl:input.url,url:input.url,method:"POST",collectionEndpointObserved:true}));
 b.networkEvents=[b.networkEvents[0]!,...events];
 b.networkResponseEvents=events.map(event=>({...event,eventType:"network_response",eventId:event.eventId+"_response",responseUrl:event.requestUrl,
  status:mode==="failed_response"?500:200,setCookieHeaders:[],setCookieMetadata:[],cookieNamesSet:[],cacheHeaders:{},accessControlHeaders:{}}));
 b.normalizedVendorObservations=events.map(event=>resolveCanonicalVendor({type:"request",url:event.requestUrl,evidenceId:event.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!);
 s.requests=[s.requests[0]!,...events.map(event=>({eventId:event.eventId,timestampMs:event.timestampMs,urlSha256:createHash("sha256").update(event.requestUrl).digest("hex"),secGpc:mode==="missing_signal"?null:"1" as const}))];
 s.requestsObserved=s.requests.length;
 s.requestProofCapture={contractVersion:"gpc_request_capture.v1",inspected:events.length,skipped:0,pending:0,failed:0,retentionDropped:0,restrictions:[],rows:events.map((event,i)=>{
  const fact=captureCaliforniaRejectRequest({url:event.requestUrl,method:"POST",body:JSON.stringify({...inputs[i]!.body,...(regs?{regs}:{})}),hasBody:true,
   requestId:event.requestId,startedAtMs:event.timestampMs,httpStatus:200,headers:{"content-type":"text/plain"},qualificationContext:{gpcDelivered:true}})!;
  return {eventId:event.eventId,documentToken:s.mainDocument!.documentToken,capturedAtMs:event.timestampMs+1,proof:{...fact,contractVersion:"gpc_request_proof.v1" as const}};
 })};
 b.gpcObservationSession=gpcObservationSessionSchema.parse(s);
 b.gpcPrototypeSessionBinding!.sessionSha256=createHash("sha256").update(JSON.stringify(b.gpcObservationSession)).digest("hex");
 canonicalEvidenceBundleSchema.parse(b);
 const bytes=Buffer.from(JSON.stringify(b)),pointer={uri:"s3://fixture/auction.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length};
 const comparison=buildGpcResponseAssessment({baseline:gpcRuntimeFixture({enabled:false}),gpc:b,gpcArtifact:pointer,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"}});
 return buildGpcProductionAssessment({scanId:b.scanId,comparison,source:{bytes,pointer:mode==="wrong_hash"?{...pointer,sha256:"f".repeat(64)}:pointer}});
}
test("versioned Index auction evidence reaches canonical GPC and Reject findings with shared recipient deduplication",()=>{
 const p=auctionProjection(),a=assessCaliforniaPostReject(p)!,g=auctionGpc();
 assert.equal(a.policyVersion,"california-post-reject.v5-index-auction");assert.equal(a.status,"qualified_collection");
 assert.equal(assessCaliforniaPostReject(p,"california-post-reject.v4-retained-scope")?.status,"no_eligible_collection","old policy cannot acquire the new basis");
 const policy=deriveCaliforniaGpcResponsePolicy(g);
 assert.equal(policy.policyVersion,"california-gpc-response.v11-index-auction");assert.equal(policy.scoreEffect,"deduction");
 assert.deepEqual(policy.recipientIds,a.recipientIds);
 const result=canonical(p,true,g);
 assert.equal(result.score.score,85);assert.equal(result.score.policyVersion,"california-regulatory-posture.v17-reject-scope");
 assert.deepEqual(retainedCaliforniaPostReject(result.runtime),a);
 assert.ok(result.findings.some(f=>f.unifiedFindingId==="california_post_reject_collection"&&f.presentationDecision.status==="surface"));
 assert.equal(result.score.deductions.filter(d=>d.policyKey==="california.choice_enforcement.recipients").length,1);
});
test("invalid Index GPP keeps classified purpose and propagation evidence without full recipient eligibility",()=>{
 const regs={gpp:"DBAA",gpp_sid:[7]},p=auctionProjection(regs),a=assessCaliforniaPostReject(p)!,g=auctionGpc(regs);
 assert.equal(a.requests[0]?.diagnostics?.purpose,"supported");assert.equal(a.status,"insufficient_evidence");assert.deepEqual(a.recipientIds,[]);
 assert.equal(g.contractVersion,"certscore.gpc-response-assessment.v3");
 if(g.contractVersion!=="certscore.gpc-response-assessment.v3")return;
 const q=g.observation.requests.advertisingCollectionQualification!;
 assert.equal(q.policyVersion,"gpc_sale_sharing_evidence.v6-index-auction",JSON.stringify(g.observation));assert.equal(q.rows[0]?.activity,"identified_advertising_collection");
 assert.equal(q.rows[0]?.gpp?.status,"invalid");assert.equal(g.observation.requests.gppPropagation?.rows.length,1);
 assert.equal(deriveCaliforniaGpcResponsePolicy(g).scoreEffect,"none");
 const result=canonical(p,true,g);
 assert.ok(!result.score.deductions.some(d=>d.policyKey==="california.choice_enforcement.recipients"));
 assert.equal(result.score.deductions.filter(d=>d.findingId==="gpp_propagation_inconsistency").length,1);
});
test("Index role cannot replace successful response, delivered signal or original source binding",()=>{
 for(const mode of ["failed_response","missing_signal"] as const){
  const g=auctionGpc(undefined,mode);assert.equal(deriveCaliforniaGpcResponsePolicy(g).scoreEffect,"none",mode);
 }
 assert.throws(()=>auctionGpc(undefined,"wrong_hash"),/verified GPC worker source hash/);
 const p=auctionProjection();for(const row of [p.scoringEvidence!.requests[0]!,p.afterActionRequests![0]!])row.californiaCollection!.httpStatus=500;
 assert.equal(assessCaliforniaPostReject(p)?.requests[0]?.reason,"response_unverified");
 assert.equal(assessCaliforniaPostReject(p)?.recipientIds.length,0);
});

test("Magnite auction evidence reaches canonical findings and preserves historical policy meanings",()=>{
 const p=auctionProjection(undefined,magniteRequests()),a=assessCaliforniaPostReject(p)!,g=auctionGpc(undefined,undefined,magniteRequests());
 assert.equal(a.policyVersion,"california-post-reject.v6-auctions");assert.equal(a.status,"qualified_collection");
 assert.equal(assessCaliforniaPostReject(p,"california-post-reject.v5-index-auction")?.status,"no_eligible_collection");
 const policy=deriveCaliforniaGpcResponsePolicy(g);
 assert.equal(policy.policyVersion,"california-gpc-response.v12-auctions");assert.equal(policy.scoreEffect,"deduction");assert.deepEqual(policy.recipientIds,a.recipientIds);
 const result=canonical(p,true,g);assert.equal(result.score.score,85);assert.equal(result.score.policyVersion,"california-regulatory-posture.v17-reject-scope");
 assert.deepEqual(retainedCaliforniaPostReject(result.runtime),a);
 assert.ok(result.findings.some(f=>f.unifiedFindingId==="california_post_reject_collection"&&f.presentationDecision.status==="surface"));
 assert.ok(!result.findings.some(f=>/deduct|points/i.test(f.summary)));
});
test("mixed Index and Magnite auctions keep distinct versioned roles and deduplicate recipients across requests and paths",()=>{
 const inputs=[...indexRequests(),...magniteRequests(),...magniteRequests()],p=auctionProjection(undefined,inputs),g=auctionGpc(undefined,undefined,inputs);
 assert.equal(g.contractVersion,"certscore.gpc-response-assessment.v3");if(g.contractVersion!=="certscore.gpc-response-assessment.v3")return;
 const q=g.observation.requests.advertisingCollectionQualification!;
 assert.equal(q.policyVersion,"gpc_sale_sharing_evidence.v7-auctions");assert.equal(q.rows.length,3);
 assert.deepEqual(new Set(q.rows.map(r=>r.policyVersion)),new Set(["ca_sale_sharing_qualification.v4-index-auction","ca_sale_sharing_qualification.v5-magnite-auction"]));
 const a=assessCaliforniaPostReject(p)!;assert.equal(a.recipientIds.length,2);assert.equal(a.requests.length,3);
 const result=canonical(p,true,g);assert.equal(result.score.score,75);
 assert.equal(result.score.deductions.filter(d=>d.policyKey==="california.choice_enforcement.recipients").length,1);
});
test("Magnite GPP limitations remain factual and separate from full recipient eligibility",()=>{
 const regs={gpp:"DBAA",gpp_sid:[7]},inputs=[...indexRequests(),...magniteRequests(),...magniteRequests()];
 const p=auctionProjection(regs,inputs),g=auctionGpc(regs,undefined,inputs),a=assessCaliforniaPostReject(p)!;
 assert.equal(a.status,"insufficient_evidence");assert.deepEqual(a.recipientIds,[]);assert.ok(a.requests.every(r=>r.diagnostics?.purpose==="supported"));
 assert.equal(g.contractVersion,"certscore.gpc-response-assessment.v3");if(g.contractVersion!=="certscore.gpc-response-assessment.v3")return;
 assert.equal(g.observation.requests.gppPropagation?.rows.length,3);assert.ok(g.observation.requests.advertisingCollectionQualification?.rows.every(r=>r.activity==="identified_advertising_collection"&&r.gpp?.status==="invalid"));
 assert.equal(deriveCaliforniaGpcResponsePolicy(g).scoreEffect,"none");
 const result=canonical(p,true,g);assert.ok(!result.score.deductions.some(d=>d.policyKey==="california.choice_enforcement.recipients"));
 assert.equal(result.score.deductions.filter(d=>d.findingId==="gpp_propagation_inconsistency").length,1);
});
test("Magnite purpose classification cannot replace response, GPC or original source proof",()=>{
 for(const mode of ["failed_response","missing_signal"] as const)assert.equal(deriveCaliforniaGpcResponsePolicy(auctionGpc(undefined,mode,magniteRequests())).scoreEffect,"none",mode);
 assert.throws(()=>auctionGpc(undefined,"wrong_hash",magniteRequests()),/verified GPC worker source hash/);
 const p=auctionProjection(undefined,magniteRequests());
 for(const row of [p.scoringEvidence!.requests[0]!,p.afterActionRequests![0]!])row.californiaCollection!.httpStatus=500;
 assert.equal(assessCaliforniaPostReject(p)?.requests[0]?.reason,"response_unverified");assert.equal(assessCaliforniaPostReject(p)?.recipientIds.length,0);
});
test("California post-Reject request evidence persists canonically and unions recipients with GPC without a registration gate",()=>{
 const p=projection(),a=assessCaliforniaPostReject(p)!;assert.equal(p.registrationStatus,"unconfirmed");
 assert.equal(a.status,"qualified_collection");assert.equal(a.recipientIds.length,1);
 const first=canonical(p);assert.equal(first.score.score,85);assert.equal(first.score.policyVersion,"california-regulatory-posture.v17-reject-scope");
 assert.deepEqual(retainedCaliforniaPostReject(first.runtime),a);
 const finding=first.findings.find(f=>f.unifiedFindingId==="california_post_reject_collection")!;
 assert.equal(finding.presentationDecision.status,"surface");assert.equal(finding.scoreEffects?.[0]?.deductionPoints,15);
 assert.ok(!finding.scoreEffects?.some(e=>e.appliesTo==="certscore_overall"));assert.ok(!/deduct|points/i.test(finding.summary));
 assert.equal(canonical(p,true).score.score,85,"same LinkedIn recipient across GPC and Reject is counted once");
 const two=canonical(projection([linkedin,google]),true);assert.equal(two.score.score,75,"union is two recipients, not summed standalone deductions");
 assert.equal(two.score.deductions.filter(d=>d.policyKey==="california.choice_enforcement.recipients").length,1);
 const drift=structuredClone(first.runtime);drift.californiaPostRejectAssessment.requests[0].msAfterClick++;
 assert.equal(retainedCaliforniaPostReject(drift),null);
 assert.ok(!buildUnifiedFindingDisplayPackets({runtimeArtifacts:drift,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()}).some(f=>f.unifiedFindingId==="california_post_reject_collection"));
});

test('retained CMP/action context qualifies exact Reject variants without registration and preserves historical scope',()=>{
 for(const label of ['Reject','Decline','Reject Optional Cookies']){
  const p=withRetainedRejectContext(projection(),label),a=assessCaliforniaPostReject(p)!;
  assert.equal(a.scope,'cookie_tracking_rejection',label);assert.equal(a.status,'qualified_collection');
  assert.equal(a.scopeEvidence?.basis,'bound_canonical_reject_context');
  assert.equal(assessCaliforniaPostReject(p,'california-post-reject.v3-property-bound')?.scope,'unknown');
  assert.equal(assessCaliforniaPostReject(p,'california-post-reject.v2-qualified-disclosure')?.scope,'unknown');
  const result=canonical(p,true);assert.equal(result.score.score,85,'same recipient across GPC and Reject is charged once');
  assert.equal(result.score.policyVersion,'california-regulatory-posture.v17-reject-scope');
  assert.equal(retainedCaliforniaPostReject(result.runtime)?.scope,'cookie_tracking_rejection');
  result.runtime.californiaPostRejectAssessment.scopeEvidence.selectorSha256='0'.repeat(64);
  assert.equal(retainedCaliforniaPostReject(result.runtime),null,'persisted scope cannot drift from retained proof');
 }
});

test('bare labels, unrelated CMP names, partial choices and mismatched scope bindings remain unknown',()=>{
 const original=withRetainedRejectContext(projection(),'Decline');
 for(const change of [
  (p:typeof original)=>{p.interactionDiagnostics!.resolver=undefined;},
  p=>{p.actionControlProof!.classifierReasonCodes=['matched_reject'];},
  p=>{p.actionControlProof!.classifierConfidence=.89;},
  p=>{p.actionControlProof!.selectorHint='#other';},
  p=>{p.interactionDiagnostics!.resolver!.snapshots[0]!.binding!.frameIdentitySha256='0'.repeat(64);},
  p=>{p.interactionDiagnostics!.resolver!.snapshots[0]!.binding!.labelSources=['aria_label'];},
  p=>{p.interactionDiagnostics!.resolver!.snapshots[0]!.controlLabels=['Accept'];},
  p=>{p.interactionDiagnostics!.navigation.finalUrlAuthorized=false;},
  p=>{p.sourceIdentity!.targetSha256='0'.repeat(64);},
  p=>{p.actionControlProof!.contractVersion='certscore.consent_action_control_proof.v1';},
  p=>{p.actionControlProof!.accessibleLabel='Decline analytics only';},
  p=>{p.actionControlProof!.accessibleLabel='Do not sell or share';},
  p=>{p.actionControlProof!.accessibleLabel='Reject and subscribe';},
 ] as Array<(p:typeof original)=>void>){
  const p=structuredClone(original);change(p);assert.equal(assessCaliforniaPostReject(p)?.scope??'unknown','unknown');
 }
 const bare=projection();bare.actionControlProof!.accessibleLabel='Reject';bare.actionControlProof!.cmpId='OneTrust';
 assert.equal(assessCaliforniaPostReject(bare)?.scope,'unknown','a CMP name is not retained control context');
 const failed=structuredClone(original);failed.interactionDiagnostics!.click.outcome='not_attempted';
 assert.equal(assessCaliforniaPostReject(failed)?.recipientIds.length??0,0);
 const explicit=projection(),historic=assessCaliforniaPostReject(explicit,'california-post-reject.v3-property-bound')!;
 const stored={...buildPostRefusalRuntimeProjection(explicit),californiaPostRejectAssessment:historic};
 assert.deepEqual(retainedCaliforniaPostReject(stored),historic,'historical v3 rederives without adding new scope fields');
});
test("unknown scope, absent historical request metadata, restrictions and bad source/action/response proof remain neutral",()=>{
 for(const mode of ["scope","history","restriction","body","response","target","failed","query_drift"]){
  const p=projection(mode==="restriction"?[linkedin+"&us_privacy=1NYN"]:undefined);
  const request=p.scoringEvidence!.requests[0]!;
  if(mode==="scope")p.actionControlProof!.accessibleLabel="Reject analytics";
  if(mode==="history"){delete request.californiaCollection;delete p.afterActionRequests![0]!.californiaCollection;}
  if(mode==="body"){request.californiaCollection!.payload="uninspected_body";p.afterActionRequests![0]!.californiaCollection!.payload="uninspected_body";}
  if(mode==="response"){request.californiaCollection!.httpStatus=500;p.afterActionRequests![0]!.californiaCollection!.httpStatus=500;}
  if(mode==="target")p.sourceIdentity!.targetSha256="f".repeat(64);
  if(mode==="failed")p.interactionDiagnostics!.click.outcome="failed_before_dispatch";
  if(mode==="query_drift")p.afterActionRequests![0]!.californiaCollection!.qualification.processingSignals=["us_privacy_sale_opt_out"];
  assert.notEqual(assessCaliforniaPostReject(p)?.status,"qualified_collection",mode);
 }
 const bad=projection();bad.scoringEvidence!.requests[0]!.californiaCollection!.startedAtMs++;
 assert.equal(postRefusalReportProjectionSchema.safeParse(bad).success,false);
});

test("v2 POST/body/header proof reaches California scoring and restricted or security-only requests stay neutral",()=>{
 for(const mode of ["body","header","restricted","security","unknown_body"]){
  const p=projection(),row=p.scoringEvidence!.requests[0]!;
  const body=mode==="body"?"pid=123&li_adsid=private-body-id":mode==="restricted"?"li_adsid=private-body-id&us_privacy=1NYN":mode==="unknown_body"?'{"event":{"li_adsid":"private"}}':null;
  const headers:Record<string,string>={"content-type":"application/x-www-form-urlencoded",...(mode==="header"?{cookie:"li_sugr=private-header-id"}:mode==="security"?{cookie:"bcookie=security-id; lidc=route"}:{})};
  const fact=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/",method:"POST",requestId:row.requestId,startedAtMs:row.startedAtMs,httpStatus:204,hasBody:body!==null,body,headers})!;
  Object.assign(row,{method:"POST",sanitizedUrl:"https://px.ads.linkedin.com/wa/",californiaCollection:fact});p.afterActionRequests=structuredClone(p.scoringEvidence!.requests);
  const assessment=assessCaliforniaPostReject(p)!;
  assert.equal(assessment.status==="qualified_collection",mode==="body"||mode==="header",mode);
  if(mode==="body"||mode==="header")assert.equal(canonical(p,true).score.score,85,"same recipient across POST Reject and GPC counts once");
 }
});

test("decoded LinkedIn POST proof passes canonical assessment and score while neutral and restricted events do not",()=>{
 for(const mode of ["identified","no_identifier","restricted"]){
  const p=projection(),row=p.scoringEvidence!.requests[0]!;
  const body=gzipSync(JSON.stringify({pids:[123],signalType:"CLICK",liFatId:mode==="no_identifier"?null:"fixture-advertising-id",...(mode==="restricted"?{us_privacy:"1NYN"}:{})})).toString("base64");
  const fact=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?fmt=g",method:"POST",requestId:row.requestId,startedAtMs:row.startedAtMs,httpStatus:204,hasBody:true,body,headers:{"content-type":"text/plain"}})!;
  Object.assign(row,{method:"POST",sanitizedUrl:"https://px.ads.linkedin.com/wa/",californiaCollection:fact});p.afterActionRequests=structuredClone(p.scoringEvidence!.requests);
  assert.equal(fact.payload,"inspected_body");assert.equal(assessCaliforniaPostReject(p)!.status==="qualified_collection",mode==="identified");
  if(mode==="identified"){assert.equal(canonical(p).score.score,85);assert.equal(canonical(p,true).score.score,85,"shared GPC recipient is deduplicated");}
 }
});

test("vendor findings retain both paths while matching hashes share one California recipient effect",()=>{
 const p=projection(),row=p.scoringEvidence!.requests[0]!;
 const body=gzipSync(JSON.stringify({signalType:"CLICK",hem:"a1".repeat(32)})).toString("base64");
 const fact=captureCaliforniaRejectRequest({url:"https://px.ads.linkedin.com/wa/?fmt=g",method:"POST",requestId:row.requestId,startedAtMs:row.startedAtMs,httpStatus:204,hasBody:true,body,headers:{"content-type":"text/plain"}})!;
 Object.assign(row,{method:"POST",sanitizedUrl:"https://px.ads.linkedin.com/wa/",californiaCollection:fact,vendor:"LinkedIn",purpose:"advertising",nonEssential:true});
 p.afterActionRequests=structuredClone(p.scoringEvidence!.requests);
 const result=canonical(p,true);
 assert.equal(result.score.score,85);
 assert.equal(result.runtime.californiaPostRejectAssessment.recipientIds.length,1);
 const gpcFinding=result.findings.find(f=>f.unifiedFindingId==="gpc_response")!;
 const rejectFinding=result.findings.find(f=>f.unifiedFindingId==="post_reject_click_tracking")!;
 assert.match(gpcFinding.summary,/LinkedIn Corporation.*first observed \+\d+ ms from GPC visit start/);
 assert.match(rejectFinding.summary,/LinkedIn Corporation.*first observed \+\d+ ms after Reject click/);
 assert.ok(gpcFinding.details?.family==="privacy_signal" && gpcFinding.details.vendorFindings?.some(v=>v.entity==="LinkedIn Corporation"));
 assert.doesNotMatch(gpcFinding.summary+rejectFinding.summary,/deduction|points|legal violation/i);
 const restricted=projection([linkedin+"&us_privacy=1NYN"]);
 restricted.scoringEvidence!.requests[0]!.vendor="LinkedIn";restricted.scoringEvidence!.requests[0]!.purpose="advertising";
 restricted.afterActionRequests=structuredClone(restricted.scoringEvidence!.requests);
 const restrictedResult=canonical(restricted,true);
 assert.equal(restrictedResult.runtime.californiaPostRejectAssessment.recipientIds.length,0);
 assert.ok(restrictedResult.findings.some(f=>f.unifiedFindingId==="post_reject_click_tracking" && /LinkedIn/.test(f.summary)),"EU presence remains visible when CA collection does not qualify");
});

test('NPA alone no longer vetoes supported advertising collection; cookie match is unnecessary and historical reads stay stable',()=>{
 const p=projection([google+'&npa=1']);
 const legacy=assessCaliforniaPostReject(p,'california-post-reject.v1')!;
 assert.equal(legacy.status,'no_eligible_collection');
 const revised=assessCaliforniaPostReject(p)!;assert.equal(revised.status,'qualified_collection');
 assert.equal(revised.policyVersion,'california-post-reject.v4-retained-scope');
 const historicalRuntime={postRefusalEvidenceProjection:p,californiaPostRejectAssessment:legacy};
 assert.deepEqual(retainedCaliforniaPostReject(historicalRuntime),legacy);
 const result=canonical(p,true);assert.equal(result.score.score,75,'LinkedIn GPC plus Google Reject: two unique recipients');
 assert.equal(result.runtime.californiaPostRejectAssessment?.recipientIds.length,1);
 const combined=canonical(projection([linkedin,google+'&npa=1']),true);assert.equal(combined.score.score,75,'same LinkedIn on both paths does not add another recipient');
 for(const suffix of ['&npa=1&rdp=1','&npa=1&ltd=1','&npa=1&us_privacy=1NYN'])assert.notEqual(assessCaliforniaPostReject(projection([google+suffix]))?.status,'qualified_collection');
});

test("Google audience and identity-sync Reject requests independently qualify and deduplicate with advertising collection", () => {
 const urls = [
  "https://www.google.com/pagead/1p-user-list/123/?cid=visitor-fixture&npa=1",
  "https://cm.g.doubleclick.net/pixel?google_nid=publisher&google_cm&npa=1",
 ];
 for (const url of urls) {
  const result = canonical(projection([url]));
  assert.equal(result.score.score, 85);
  assert.deepEqual(result.runtime.californiaPostRejectAssessment.recipientIds, ["ent_7509263a9ab6"]);
 }
 const combined = canonical(projection([...urls, google + "&npa=1"]), true);
 assert.equal(combined.score.score, 75, "one Google recipient plus LinkedIn GPC, regardless of Google's three roles");
 assert.equal(combined.score.deductions.filter(d => d.policyKey === "california.choice_enforcement.recipients").length, 1);
});

test("property-bound sale/sharing reaches canonical CA findings, preserves EU evidence and deduplicates Google",()=>{
 const url="https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=123.456&npa=1";
 const p=projection([linkedin]),row=p.scoringEvidence!.requests[0]!;
 const fact=captureCaliforniaRejectRequest({url,method:"GET",requestId:row.requestId,startedAtMs:row.startedAtMs,httpStatus:204,hasBody:false,body:null,headers:{}})!;
 assert.ok(fact.propertyBinding);assert.equal(fact.qualification.activity,"unresolved");
 Object.assign(row,{sanitizedUrl:"https://www.google-analytics.com/g/collect",hostname:"www.google-analytics.com",californiaCollection:fact});p.afterActionRequests=structuredClone(p.scoringEvidence!.requests);
 const source=extractPropertySaleSharingSource({scanId:p.sourceIdentity!.scanId,targetUrl:"https://fixture.test/",sourceBundleSha256:"a".repeat(64),observations:[{
  observationId:"privacy",surfaceType:"privacy_policy",url:"https://fixture.test/privacy",status:"fetched",documentFetchState:"fetched",documentEvaluationState:"usable",documentRole:"policy_document",targetRelationship:"target_controller",ownershipConfidence:.98,httpStatus:200,documentLanguage:"en",
  textExcerpt:"We share data collected through Google Analytics property G-ABC123 with Google for cross-context behavioral advertising."}]});
 source.targetSha256=p.sourceIdentity!.targetSha256;p.propertySaleSharingSource=source;
 const a=assessCaliforniaPostReject(p)!;assert.equal(a.status,"qualified_collection");assert.deepEqual(a.recipientIds,["ent_7509263a9ab6"]);assert.ok(a.requests[0]?.propertyEvidence);
 const projected=canonical(p);assert.equal(projected.score.score,85);assert.ok(projected.findings.find(f=>f.unifiedFindingId==="california_post_reject_collection")?.scoreEffects?.length);
 assert.deepEqual(retainedCaliforniaPostReject(projected.runtime),a);
 const old=assessCaliforniaPostReject(p,"california-post-reject.v2-qualified-disclosure")!;assert.equal(old.recipientIds.length,0);assert.equal(old.requests[0]?.reason,"qualification_unresolved");
 const runtime=buildPostRefusalRuntimeProjection(p),before=(runtime as Record<string,unknown>).afterRejectScoringAssessment;
 const neutral=structuredClone(p);delete neutral.propertySaleSharingSource;
 assert.deepEqual((buildPostRefusalRuntimeProjection(neutral) as Record<string,unknown>).afterRejectScoringAssessment,before,"static CA purpose evidence does not alter EU presence evidence");
 assert.equal(assessCaliforniaPostReject(neutral)!.requests[0]?.reason,"sale_sharing_purpose_unresolved");
 for(const mode of ["wrong_property","source_tamper","restriction","binding_absent","response"]){
  const bad=structuredClone(p);
  if(mode==="wrong_property")bad.scoringEvidence!.requests[0]!.californiaCollection!.propertyBinding!.propertyIdSha256="f".repeat(64);
  if(mode==="source_tamper")bad.propertySaleSharingSource!.declarations[0]!.clause="We use Google Analytics.";
  if(mode==="restriction")bad.scoringEvidence!.requests[0]!.californiaCollection!.qualification.processingSignals=["google_rdp"];
  if(mode==="binding_absent")delete bad.scoringEvidence!.requests[0]!.californiaCollection!.propertyBinding;
  if(mode==="response")bad.scoringEvidence!.requests[0]!.californiaCollection!.httpStatus=500;
  bad.afterActionRequests=structuredClone(bad.scoringEvidence!.requests);
  assert.notEqual(assessCaliforniaPostReject(bad)?.status,"qualified_collection",mode);
 }
});

test("Magnite v14 larger body reaches the canonical pipeline while GPP and successful response remain independent",()=>{
 const b=magniteAuctionBody(),inputs=[{url:magniteAuctionUrl.replace("&s=1","&s=3"),
  body:{...b,imp:Array.from({length:3},(_,i)=>({...structuredClone(b.imp[0]!),id:"large-"+i,
   banner:{format:Array.from({length:12},()=>({w:300,h:250}))}}))}}];
 const p=auctionProjection(undefined,inputs),g=auctionGpc(undefined,undefined,inputs);
 const proof=p.scoringEvidence!.requests[0]!.californiaCollection!.proof!;
 assert.equal(proof.policyVersion,"bounded_ca_request_proof.v14");assert.equal(proof.bodyStatus,"complete");
 assert.equal(assessCaliforniaPostReject(p)?.status,"qualified_collection");
 assert.equal(assessCaliforniaPostReject(p,"california-post-reject.v5-index-auction")?.status,"no_eligible_collection");
 const full=canonical(p,true,g);assert.equal(full.score.score,85);
 assert.equal(full.score.deductions.filter(d=>d.policyKey==="california.choice_enforcement.recipients").length,1);
 assert.ok(full.findings.some(f=>f.unifiedFindingId==="california_post_reject_collection"&&f.presentationDecision.status==="surface"));
 const regs={gpp:"DBAA",gpp_sid:[7]},limited=auctionProjection(regs,inputs),lg=auctionGpc(regs,undefined,inputs);
 assert.deepEqual(assessCaliforniaPostReject(limited)?.recipientIds,[]);assert.equal(deriveCaliforniaGpcResponsePolicy(lg).scoreEffect,"none");
 assert.ok(!canonical(limited,true,lg).score.deductions.some(d=>d.policyKey==="california.choice_enforcement.recipients"));
 assert.equal(deriveCaliforniaGpcResponsePolicy(auctionGpc(undefined,"failed_response",inputs)).scoreEffect,"none");
 assert.equal(deriveCaliforniaGpcResponsePolicy(auctionGpc(undefined,"missing_signal",inputs)).scoreEffect,"none");
});
