import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {postRefusalReportProjectionSchema,deriveConsentControlAssessment} from "@certscore/contracts";
import {captureCaliforniaRejectRequest} from "../../../../packages/certscore-scan-core/src/california-reject-request";
import {assessCaliforniaPostReject,retainedCaliforniaPostReject} from "./california-post-reject-policy";
import {afterRejectClickProjection} from "./test-fixtures/after-reject-scoring";
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
function canonical(p:ReturnType<typeof projection>,withGpc=false) {
 const f=californiaCoverageFixture();f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const runtime=JSON.parse(JSON.stringify({...buildPostRefusalRuntimeProjection(p),consentControlAssessment:parent,...(withGpc?{gpcResponseAssessment:gpc()}:{})}));
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 return {runtime,findings,score:deriveCaliforniaRegulatoryScore({assessment:child,unifiedFindings:findings,checklistRows:[]})};
}
test("California post-Reject request evidence persists canonically and unions recipients with GPC without a registration gate",()=>{
 const p=projection(),a=assessCaliforniaPostReject(p)!;assert.equal(p.registrationStatus,"unconfirmed");
 assert.equal(a.status,"qualified_collection");assert.equal(a.recipientIds.length,1);
 const first=canonical(p);assert.equal(first.score.score,85);assert.equal(first.score.policyVersion,"california-regulatory-posture.v14-reject");
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
