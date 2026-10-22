import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalReportProjectionSchema } from "@certscore/contracts";
import { afterRejectClickProjection, afterRejectProjection } from "./test-fixtures/after-reject-scoring";
import { AFTER_REJECT_SCORING_POLICY, assessAfterRejectScoring, retainedAfterRejectScoringAssessment } from "./after-reject-scoring-policy";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyDeductionBreakdown, deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import {projectAdminScoringEntityCounts} from "../../server/admin/admin-scan-posture-score";
import {SCAN_REPORT_PROJECTION_VERSION} from "../../server/scans/scan-report-projection-contract";

export function cookieOnlyAfterReject() {
 const p=afterRejectClickProjection("measurement");
 p.scoringEvidence!.requests=[];p.afterActionRequests=[];p.afterActionCapture!.requestIds=[];p.afterActionCapture!.requestAncestry=[];
 const cookie={storageType:"cookie" as const,name:"_ga",hostname:"example.test",identityBasis:"cookie_name_domain_path_partition" as const,
  identityHash:"e".repeat(64),valueHash:"f".repeat(64),purpose:"analytics" as const,nonEssential:true};
 p.scoringEvidence!.preActionStorage=[cookie];p.scoringEvidence!.postActionStorage=[cookie];p.afterActionStorage=[cookie];
 return postRefusalReportProjectionSchema.parse(p);
}
function canonical(p:ReturnType<typeof afterRejectClickProjection>){
 const runtimeArtifacts=buildPostRefusalRuntimeProjection(p);
 const retained=JSON.parse(JSON.stringify(runtimeArtifacts));
 const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts:retained,reviewFindingCandidates:[],validationFindings:[]});
 const unifiedFindings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:retained,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 const coverageOutcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts:retained,normalizedConcerns,scanCompleted:true,coverageLimited:false});
 const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes,projectedFindings:[],unifiedFindings,scanCompleted:true,coverageLimited:false}).filter(r=>r.id==="post_reject_tracking_reduction");
 return{retained,normalizedConcerns,unifiedFindings,rows};
}
test("Admin Reject count deduplicates the same eligible entity across cookies and service requests",()=>{
 const p=afterRejectClickProjection("measurement"),cookie=cookieOnlyAfterReject();
 p.scoringEvidence!.preActionStorage=cookie.scoringEvidence!.preActionStorage;
 p.scoringEvidence!.postActionStorage=cookie.scoringEvidence!.postActionStorage;
 p.afterActionStorage=cookie.afterActionStorage;
 const result=canonical(postRefusalReportProjectionSchema.parse(p));
 const snapshot={report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:"2026-10-21T23:00:00.000Z",
  admin_canonical_score_input:{scanId:"fixture",projectionScanId:"fixture",rejectSourceHash:p.packetSha256,unifiedFindings:result.unifiedFindings,checklistRows:result.rows}};
 assert.equal(result.retained.afterRejectScoringAssessment?.entityEvidence?.observations.length,2);
 assert.equal(projectAdminScoringEntityCounts("fixture",snapshot,false).reject,1);
 assert.equal(projectAdminScoringEntityCounts("fixture",snapshot,true).reject,null);
 const changed=structuredClone(snapshot);changed.admin_canonical_score_input.checklistRows[0]!.criticalEvidence!.retainedEvidence!.sourcePacketSha256="a".repeat(64);
 assert.equal(projectAdminScoringEntityCounts("fixture",changed,false).reject,null,"Mismatched source proof cannot produce an eligible count");
});
test("canonical rule charges cookies alone, opaque analytics, measurement and service assets once after Reject",()=>{
 const cookies=cookieOnlyAfterReject(),opaque=afterRejectClickProjection("measurement"),performance=afterRejectClickProjection("performance");
 opaque.scoringEvidence!.requests[0]!.measurementEvidence=undefined;opaque.afterActionRequests![0]!.measurementEvidence=undefined;
 const assets=structuredClone(opaque);assets.scoringEvidence!.requests[0]!.resourceType="script";assets.afterActionRequests![0]!.resourceType="script";
 for(const p of [cookies,opaque,afterRejectClickProjection("measurement"),performance,assets]){
  const original=structuredClone(p),assessment=assessAfterRejectScoring(p)!;
  assert.equal(assessment.policyVersion,AFTER_REJECT_SCORING_POLICY);assert.equal(assessment.deductionPoints,15);assert.equal(assessment.registration,"unconfirmed");
  const result=canonical(p);assert.ok(result.normalizedConcerns.some(c=>c.promotionEligibility==="eligible"));
  assert.ok(result.unifiedFindings.some(f=>f.unifiedFindingId==="post_reject_click_tracking"));
  assert.equal(retainedAfterRejectScoringAssessment(result.retained)?.deductionPoints,15);
  assert.equal(deriveRegulatoryCoverageScore({framework:"gdpr_eprivacy",rows:result.rows}).score,85);
  assert.equal(deriveGdprEprivacyDeductionBreakdown([...result.rows,...result.rows]).reduce((n,d)=>n+d.deductionPoints,0),15);
  assert.equal(deriveGdprEprivacyDeductionBreakdown(result.rows,"gdpr-eprivacy-posture.v21").length,0);
  for(const f of result.unifiedFindings.filter(f=>f.unifiedFindingId==="post_reject_click_tracking"))
   assert.doesNotMatch([f.presentation.findingName,f.presentation.whyThisMatters,f.presentation.suggestedFix].join(" "),/deduction|points|confirmed refusal|refusal failed/i);
  assert.deepEqual(p,original);
 }
 assert.equal(assessAfterRejectScoring(cookies,"after_reject_measurement_tiers.v2")?.deductionPoints,0);
});
test("unknown/essential evidence, pre-click facts, missing source and failed paths stay neutral",()=>{
 for(const change of [
  (p:ReturnType<typeof cookieOnlyAfterReject>)=>{p.packetSha256=undefined;},
  p=>{p.afterActionCapture!.stopReason="target_changed";},p=>{p.captureCoverage!.requestsDroppedAfterAction=1;},
  p=>{p.interactionDiagnostics!.click.outcome="not_attempted";},p=>{p.scoringEvidence!.postActionStorage=[];p.afterActionStorage=[];},
  p=>{p.scoringEvidence!.postActionStorage[0]!.nonEssential=false;p.afterActionStorage![0]!.nonEssential=false;},
  p=>{p.scoringEvidence!.postActionStorage[0]!.purpose="unknown";p.afterActionStorage![0]!.purpose="unknown";},
  p=>{p.scoringEvidence!.postActionCapturedAtMs=100;},
 ] as Array<(p:ReturnType<typeof cookieOnlyAfterReject>)=>void>){const p=cookieOnlyAfterReject();change(p);assert.equal(assessAfterRejectScoring(p)?.deductionPoints??0,0);}
 const request=afterRejectClickProjection("measurement");request.afterActionCapture!.requestAncestry![0]!.rootStartedAtMs=100;
 assert.equal(assessAfterRejectScoring(request)?.deductionPoints,0);
 const runtime=canonical(cookieOnlyAfterReject()).retained;runtime.postRefusalEvidenceProjection.afterActionStorage=[];
 assert.equal(retainedAfterRejectScoringAssessment(runtime),null);
});

test("approved confirmed positive early completion keeps its canonical effect",()=>{
 const p=afterRejectProjection("advertising");
 p.interactionDiagnostics={navigation:{outcome:"completed",documentCommitted:true,finalUrlAuthorized:true},
  click:{outcome:"completed",reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}};
 p.registeredObservationCompletion={...p.registeredObservationCompletion!,completedAtMs:230,termination:"evidence_satisfied"};
 p.scoringEvidence!.postActionCapturedAtMs=225;
 assert.equal(assessAfterRejectScoring(postRefusalReportProjectionSchema.parse(p))?.deductionPoints,15);
});

test("distinct canonical entities use the approved diminishing schedule, deduplicated across cookies and services",()=>{
 const urls=["https://www.google-analytics.com/g/collect","https://www.facebook.com/tr/","https://heapanalytics.com/h",
  "https://js.hs-scripts.com/123.js","https://cdn.segment.com/analytics.js/v1/key/analytics.min.js","https://api.mixpanel.com/track",
  "https://static.hotjar.com/c/hotjar-123.js","https://www.clarity.ms/tag/123","https://dpm.demdex.net/id"];
 const totals=[15,20,23,25,27,28,29,30,30];
 for(let count=1;count<=urls.length;count++){
  const p=cookieOnlyAfterReject(),template=afterRejectClickProjection("measurement").scoringEvidence!.requests[0]!;
  const requests=urls.slice(0,count).map((url,i)=>({...template,requestId:`entity-${i}`,sanitizedUrl:url,hostname:new URL(url).hostname,
   startedAtMs:200+i,rootStartedAtMs:200+i,vendor:undefined,measurementEvidence:undefined,googleConsentMode:undefined}));
  p.scoringEvidence!.requests=requests;p.afterActionRequests=structuredClone(requests);
  p.afterActionCapture!.requestIds=requests.map(r=>r.requestId);p.afterActionCapture!.requestAncestry=requests.map(r=>({requestId:r.requestId,rootStartedAtMs:r.rootStartedAtMs!}));
  const assessment=assessAfterRejectScoring(p)!;
  assert.equal(assessment.entityEvidence?.entities.length,count,JSON.stringify(assessment.entityEvidence));
  assert.equal(assessment.deductionPoints,totals[count-1]);
  const result=canonical(p);
  assert.equal(deriveRegulatoryCoverageScore({framework:"gdpr_eprivacy",rows:result.rows}).score,100-totals[count-1]!);
  assert.equal(deriveGdprEprivacyDeductionBreakdown([...result.rows,...result.rows])[0]?.deductionPoints,totals[count-1]);
  const stored=structuredClone(result.retained);stored.afterRejectScoringAssessment!.entityEvidence!.observations[0]!.msAfterClick++;
  assert.equal(retainedAfterRejectScoringAssessment(stored),null,"Timing drift invalidates the stored assessment");
 }
});

test("unattributed positive presence gets the initial effect without invented increments",()=>{
 const p=cookieOnlyAfterReject(),cookie=p.scoringEvidence!.postActionStorage[0]!;
 cookie.name="unattributed_analytics";cookie.vendor=undefined;p.afterActionStorage=structuredClone(p.scoringEvidence!.postActionStorage);
 const assessment=assessAfterRejectScoring(p)!;
 assert.equal(assessment.deductionPoints,15);assert.equal(assessment.entityEvidence?.entities.length,0);
 assert.equal(assessment.entityEvidence?.observations[0]?.entityId,undefined);
});

test('fresh domain-scoped CreativeCDN cookie classification survives persistence and canonical Reject scoring without registration',async()=>{
 const {resolveCanonicalActionStoragePurpose}=await import('@certscore/vendor-resolver');
 const p=cookieOnlyAfterReject();
 const before=p.scoringEvidence!.postActionStorage[0]!;
 const item={...before,name:'ts',hostname:'creativecdn.com',...resolveCanonicalActionStoragePurpose({storageType:'cookie',name:'ts',hostname:'creativecdn.com'})};
 p.scoringEvidence!.preActionStorage=[item];p.scoringEvidence!.postActionStorage=[item];p.afterActionStorage=[item];
 const result=canonical(postRefusalReportProjectionSchema.parse(p));
 const score=retainedAfterRejectScoringAssessment(result.retained)!;
 assert.equal(score.deductionPoints,15);assert.equal(score.registration,'unconfirmed');
 assert.equal(score.entityEvidence?.entities[0]?.entityId,'ent_f3a0ce7ab768');
 assert.equal(deriveGdprEprivacyDeductionBreakdown(result.rows)[0]?.deductionPoints,15);
 assert.ok(result.unifiedFindings.some(f=>f.unifiedFindingId==='post_reject_click_tracking'));
 assert.equal(score.entityEvidence?.observations[0]?.kind,'cookie_snapshot');
 for(const hostname of ['example.test','creativecdn.com.evil.test'])assert.equal(resolveCanonicalActionStoragePurpose({storageType:'cookie',name:'ts',hostname}).nonEssential,false);
});
