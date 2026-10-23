import assert from "node:assert/strict";
import test from "node:test";
import {postRefusalReportProjectionSchema} from "@certscore/contracts";
import {afterRejectClickProjection} from "./test-fixtures/after-reject-scoring";
import {assessAfterRejectScoring,retainedAfterRejectScoringAssessment} from "./after-reject-scoring-policy";
import {buildPostRefusalRuntimeProjection} from "./post-refusal-runtime-projection";
import {buildNormalizedConcerns} from "./normalized-concerns";
import {buildUnifiedFindingDisplayPackets} from "./unified-findings";
import {deriveGdprEprivacyCoveragePolicyOutcomes} from "./gdpr-eprivacy-coverage-policy";
import {deriveGdprEprivacyCoverageChecklist} from "./gdpr-eprivacy-coverage-checklist";
import {deriveGdprEprivacyDeductionBreakdown} from "./regulatory-coverage-score";
import {describePostRejectFinding} from "./post-reject-finding-copy";
import {projectRejectPresenceDetails,factualCustomerEvidence} from "./reject-presence-details";
import {retainedRejectClickCapture} from "./retained-reject-click-capture";
import {deriveCanonicalOverallScoreExplanationForReport} from "../../server/scans/canonical-overall-score";

function fixture(names=["fundraiseup_stat","nmstat","SC_ANALYTICS_GLOBAL_COOKIE"]) {
  const p=afterRejectClickProjection("measurement");
  p.scoringEvidence!.requests=[];p.afterActionRequests=[];p.afterActionCapture!.requestIds=[];p.afterActionCapture!.requestAncestry=[];
  const cookies=names.map((name,i)=>({storageType:"cookie" as const,name,hostname:"example.test",identityBasis:"cookie_name_domain_path_partition" as const,
    identityHash:String(i+1).repeat(64),valueHash:"f".repeat(64),purpose:"unknown" as const,nonEssential:false}));
  p.scoringEvidence!.preActionStorage=structuredClone(cookies);p.scoringEvidence!.postActionStorage=structuredClone(cookies);p.afterActionStorage=structuredClone(cookies);
  return postRefusalReportProjectionSchema.parse(p);
}
function pipeline(p:ReturnType<typeof fixture>, policy?:Parameters<typeof assessAfterRejectScoring>[1]) {
 const projection={...buildPostRefusalRuntimeProjection(p),
  ...(policy?{afterRejectScoringAssessment:assessAfterRejectScoring(p,policy)}:{})};
 const runtime=JSON.parse(JSON.stringify(projection));
 const concerns=buildNormalizedConcerns({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[]});
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 const outcomes=deriveGdprEprivacyCoveragePolicyOutcomes({runtimeArtifacts:runtime,normalizedConcerns:concerns,scanCompleted:true,coverageLimited:false});
 const rows=deriveGdprEprivacyCoverageChecklist({coverageOutcomes:outcomes,projectedFindings:[],unifiedFindings:findings,scanCompleted:true,coverageLimited:false}).filter(r=>r.id==="post_reject_tracking_reduction");
 return {runtime,concerns,findings,rows};
}

test("C3 retained snapshots flow through persistence, concern, finding, details and v24 score without mutating evidence",()=>{
 const p=fixture(),before=structuredClone(p),result=pipeline(p),assessment=retainedAfterRejectScoringAssessment(result.runtime)!;
 assert.equal(assessment.policyVersion,"after_reject_nonessential_presence.v3-cookie-coverage");
 assert.equal(assessment.deductionPoints,23);assert.equal(assessment.entityEvidence?.entities.length,3);
 assert.equal(assessment.registration,"unconfirmed");assert.equal(assessment.sourcePacketSha256,p.packetSha256);
 assert.ok(result.concerns.some(c=>c.promotionEligibility==="eligible"));
 assert.ok(result.findings.some(f=>f.unifiedFindingId==="post_reject_click_tracking"));
 const row=result.rows[0]!;
 assert.equal(deriveGdprEprivacyDeductionBreakdown([...result.rows,...result.rows],"gdpr-eprivacy-posture.v24")[0]?.deductionPoints,23);
 assert.equal(deriveCanonicalOverallScoreExplanationForReport({scanRecord:{runtimeArtifacts:null},checklistRows:result.rows,unifiedFindings:result.findings})?.score,77);
 assert.equal(projectRejectPresenceDetails(row).length,3);
 assert.doesNotMatch(JSON.stringify(factualCustomerEvidence(row)),/deductionPoints|scoreEffect/);
 assert.match(describePostRejectFinding(row.criticalEvidence?.retainedEvidence)?.summary??"",/Fundraise Up/);
 assert.ok(retainedRejectClickCapture(assessment,p));
 assert.deepEqual(p,before);
 // Cookie recognition does not produce California collection proof or a GPC finding.
 assert.ok(!result.findings.some(f=>["california_post_reject_collection","gpc_response"].includes(f.unifiedFindingId)&&f.scoreEffects?.length));
 const changed=structuredClone(result.runtime);changed.postRefusalEvidenceProjection.scoringEvidence.postActionStorage[0].valueHash="a".repeat(64);
 assert.equal(retainedAfterRejectScoringAssessment(changed),null);
});

test("C3 assessment cannot be charged by historical score policies; historical v1/v2 retain original unknowns",()=>{
 const p=fixture();
 for(const policy of ["after_reject_nonessential_presence.v1","after_reject_nonessential_presence.v2-vendor-coverage"] as const){
  const a=assessAfterRejectScoring(p,policy)!;assert.equal(a.deductionPoints,0);assert.equal(a.cookieRefs?.length,0);
  assert.deepEqual(retainedAfterRejectScoringAssessment({postRefusalEvidenceProjection:p,afterRejectScoringAssessment:JSON.parse(JSON.stringify(a))}),a);
 }
 const {rows}=pipeline(p);
 for(const version of ["gdpr-eprivacy-posture.v20","gdpr-eprivacy-posture.v21","gdpr-eprivacy-posture.v22","gdpr-eprivacy-posture.v23"] as const)
  assert.deepEqual(deriveGdprEprivacyDeductionBreakdown(rows,version),[]);
 const old=fixture(["_ga"]),legacy=assessAfterRejectScoring(old,"after_reject_nonessential_presence.v2-vendor-coverage")!;
 assert.equal(legacy.deductionPoints,15);assert.ok(retainedRejectClickCapture(legacy,old));
 assert.ok(describePostRejectFinding({afterRejectScoringAssessment:legacy}));
 const historical=pipeline(old,"after_reject_nonessential_presence.v2-vendor-coverage");
 assert.ok(historical.findings.some(f=>f.unifiedFindingId==="post_reject_click_tracking" && f.presentationDecision.status==="surface"));
 assert.equal(deriveGdprEprivacyDeductionBreakdown(historical.rows,"gdpr-eprivacy-posture.v23")[0]?.deductionPoints,15);
});

test("security, consent, missing proof, changed target and explicit essentiality remain neutral",()=>{
 assert.equal(assessAfterRejectScoring(fixture(["fundraiseup_cid","szcib","SC_TRACKING_CONSENT"]))?.deductionPoints,0);
 for(const mutate of [
  (p:ReturnType<typeof fixture>)=>{p.packetSha256=undefined;},
  p=>{p.interactionDiagnostics!.click.outcome="not_attempted";},
  p=>{p.afterActionCapture!.stopReason="target_changed";},
  p=>{p.captureCoverage!.requestsDroppedAfterAction=1;},
  p=>{p.scoringEvidence!.postActionCapturedAtMs=100;},
  p=>{for(const c of p.scoringEvidence!.postActionStorage)c.purposeAssessment={version:"action_storage_purpose.v1",essentiality:"essential"};p.afterActionStorage=structuredClone(p.scoringEvidence!.postActionStorage);},
 ] as Array<(p:ReturnType<typeof fixture>)=>void>){const p=fixture();mutate(p);assert.equal(assessAfterRejectScoring(p)?.deductionPoints??0,0);}
});

test("same canonical cookie owner and its service are deduplicated",()=>{
 const p=fixture(["nmstat","nmstat","SC_ANALYTICS_GLOBAL_COOKIE"]),source=afterRejectClickProjection("measurement");
 const r={...source.scoringEvidence!.requests[0]!,sanitizedUrl:"https://siteimproveanalytics.com/js/siteanalyze_123.js",hostname:"siteimproveanalytics.com",vendor:"Siteimprove",googleConsentMode:undefined,measurementEvidence:undefined};
 p.scoringEvidence!.requests=[r];p.afterActionRequests=[structuredClone(r)];p.afterActionCapture!.requestIds=[r.requestId];p.afterActionCapture!.requestAncestry=[{requestId:r.requestId,rootStartedAtMs:r.rootStartedAtMs!}];
 const a=assessAfterRejectScoring(p)!;assert.equal(a.entityEvidence?.entities.length,2);assert.equal(a.deductionPoints,20);
});
