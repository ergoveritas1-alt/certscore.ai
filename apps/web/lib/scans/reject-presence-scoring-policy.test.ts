import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalReportProjectionSchema } from "@certscore/contracts";
import { afterRejectClickProjection, afterRejectProjection, highRiskAfterRejectAssessment } from "./test-fixtures/after-reject-scoring";
import { AFTER_REJECT_SCORING_POLICY, assessAfterRejectScoring, retainedAfterRejectScoringAssessment } from "./after-reject-scoring-policy";
import { buildPostRefusalRuntimeProjection } from "./post-refusal-runtime-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyDeductionBreakdown, deriveRegulatoryCoverageScore, getGdprEprivacyRowDeduction } from "./regulatory-coverage-score";
import {projectAdminScoringEntityCounts} from "../../server/admin/admin-scan-posture-score";
import {deriveCanonicalOverallScoreExplanationForReport} from "../../server/scans/canonical-overall-score";
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
test('Hotjar session and user cookies plus its service deduplicate through the persisted EU Reject pipeline',()=>{
 const p=cookieOnlyAfterReject(),cookie=p.scoringEvidence!.postActionStorage[0]!;
 const cookies=['_hjSession_1473729','_hjSessionUser_1473729'].map((name,i)=>({...cookie,name,purpose:'unknown' as const,nonEssential:false,identityHash:String(i+1).repeat(64)}));
 p.scoringEvidence!.postActionStorage=cookies;p.afterActionStorage=structuredClone(cookies);
 const service=afterRejectClickProjection('measurement');
 for(const r of [...service.scoringEvidence!.requests,...service.afterActionRequests!]){
  r.sanitizedUrl='https://events.hotjar.io/';r.hostname='events.hotjar.io';r.vendor='Hotjar';r.purpose='session_replay';r.measurementEvidence=undefined;
 }
 p.scoringEvidence!.requests=service.scoringEvidence!.requests;p.afterActionRequests=service.afterActionRequests;
 p.afterActionCapture!.requestIds=service.afterActionCapture!.requestIds;p.afterActionCapture!.requestAncestry=service.afterActionCapture!.requestAncestry;
 const result=canonical(postRefusalReportProjectionSchema.parse(p));
 assert.equal(result.retained.afterRejectScoringAssessment?.entityEvidence?.entities.length,1);
 assert.equal(result.retained.afterRejectScoringAssessment?.deductionPoints,15);
 assert.equal(deriveGdprEprivacyDeductionBreakdown(result.rows).reduce((n,r)=>n+r.deductionPoints,0),15);
 const legacy=structuredClone(p);legacy.scoringEvidence!.requests=[];legacy.afterActionRequests=[];
 legacy.afterActionCapture!.requestIds=[];legacy.afterActionCapture!.requestAncestry=[];
 assert.equal(assessAfterRejectScoring(legacy,'after_reject_nonessential_presence.v1')?.deductionPoints,0);
 const failed=structuredClone(p);failed.interactionDiagnostics!.click.outcome='not_attempted';
 assert.equal(assessAfterRejectScoring(failed)?.deductionPoints??0,0);
});
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
  p=>{p.scoringEvidence!.postActionStorage[0]!.purpose="unknown";p.scoringEvidence!.postActionStorage[0]!.name="unclassified_cookie";p.afterActionStorage=structuredClone(p.scoringEvidence!.postActionStorage);},
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
  // Historical v22 introduced the same 30-point presence family, before v23 vendor coverage.
  const legacy = assessAfterRejectScoring(p, "after_reject_nonessential_presence.v1")!;
  const legacyRows = structuredClone(result.rows);
  legacyRows[0]!.criticalEvidence!.retainedEvidence!.afterRejectScoringAssessment = legacy;
  assert.equal(legacy.deductionPoints, totals[count - 1]);
  for (const version of ["gdpr-eprivacy-posture.v22", "gdpr-eprivacy-posture.v23"] as const) {
   assert.equal(getGdprEprivacyRowDeduction(legacyRows[0]!, version), totals[count - 1]);
   assert.equal(deriveGdprEprivacyDeductionBreakdown([...legacyRows, ...legacyRows], version)[0]?.deductionPoints, totals[count - 1]);
   const explanation = deriveCanonicalOverallScoreExplanationForReport({scanRecord: {runtimeArtifacts: null},
    checklistRows: legacyRows, unifiedFindings: result.unifiedFindings, scorePolicyVersion: version});
   assert.equal(explanation?.score, 100 - totals[count - 1]!);
   assert.equal(explanation?.deductions.find(row => row.family === "post_refusal_enforcement")?.deductionPoints, totals[count - 1]);
  }
  assert.deepEqual(deriveGdprEprivacyDeductionBreakdown(legacyRows, "gdpr-eprivacy-posture.v21"), []);
  assert.deepEqual(deriveGdprEprivacyDeductionBreakdown(result.rows, "gdpr-eprivacy-posture.v22"), []);
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

test('vendor coverage reclassifies retained unknown cookies without altering source or double-counting one owner',()=>{
 const p=cookieOnlyAfterReject();
 p.scoringEvidence!.postActionStorage=['_clck','_clsk','hubspotutk'].map((name,i)=>({...p.scoringEvidence!.postActionStorage[0]!,name,identityHash:String(i+1).repeat(64),purpose:'unknown' as const,nonEssential:false}));
 p.afterActionStorage=structuredClone(p.scoringEvidence!.postActionStorage);
 const original=JSON.stringify(p),old=assessAfterRejectScoring(p,'after_reject_nonessential_presence.v1')!,current=assessAfterRejectScoring(p)!;
 assert.equal(old.deductionPoints,0);assert.equal(current.deductionPoints,20);assert.equal(current.entityEvidence?.entities.length,2);
 const c=canonical(p);assert.equal(retainedAfterRejectScoringAssessment(c.retained)?.deductionPoints,20);
 assert.equal(deriveGdprEprivacyDeductionBreakdown(c.rows,'gdpr-eprivacy-posture.v22').length,0,'new evidence interpretation does not rewrite v22');
 assert.equal(JSON.stringify(p),original);
});
test('historical presence assessments retain their evidence semantics and version on read',()=>{
 const p=cookieOnlyAfterReject(),old=assessAfterRejectScoring(p,'after_reject_nonessential_presence.v1')!;
 const runtime={postRefusalEvidenceProjection:p,afterRejectScoringAssessment:old};
 assert.equal(retainedAfterRejectScoringAssessment(runtime)?.policyVersion,'after_reject_nonessential_presence.v1');
 assert.equal(retainedAfterRejectScoringAssessment(runtime)?.deductionPoints,15);
});


test("pre-presence Reject policies retain their original 15-point family cap", () => {
 const rows = canonical(afterRejectProjection("advertising")).rows;
 rows[0]!.assessmentStatus = "gap_observed";
 rows[0]!.criticalEvidence!.retainedEvidence!.rejectInteractionConfirmed = true;
 rows[0]!.criticalEvidence!.retainedEvidence!.refusalSignalContradictsAction = true;
 rows[0]!.criticalEvidence!.retainedEvidence!.afterRejectScoringAssessment = highRiskAfterRejectAssessment();
 for (const version of ["gdpr-eprivacy-posture.v18", "gdpr-eprivacy-posture.v19", "gdpr-eprivacy-posture.v20", "gdpr-eprivacy-posture.v21"] as const) {
  const breakdown = deriveGdprEprivacyDeductionBreakdown([...rows, ...rows], version);
  assert.equal(breakdown.find(row => row.family === "post_refusal_enforcement")?.deductionPoints, 15, version);
 }
});
