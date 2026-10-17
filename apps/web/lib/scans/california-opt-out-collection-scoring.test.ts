import {projectCaliforniaRegulatoryPriorities} from "./california-regulatory-priorities";
import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {gpcProductionRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-production";
import {gpcRuntimeFixture} from "../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import {buildGpcProductionAssessment} from "../../../../packages/certscore-scan-core/src/gpc-production-observation";
import {buildGpcResponseAssessment} from "../../../../packages/certscore-scan-core/src/gpc-response-assessment";
import {resolveCanonicalVendor} from "@certscore/vendor-resolver";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {buildUnifiedFindingDisplayPackets} from "./unified-findings";
import {deriveCaliforniaRegulatoryScore} from "./california-regulatory-score";
import {deriveConsentControlAssessment} from "@certscore/contracts";
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "../../server/scans/california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "../../server/scans/california-privacy-review-projection";
import {buildCanonicalGpcResponseProjection} from "./gpc-response-projection";
import {apiV2GpcResponseSchema} from "@certscore/api-contracts";

function observed(mode="collection") {
 const g=gpcProductionRuntimeFixture(),b=gpcRuntimeFixture({enabled:false});
 const r=g.networkEvents[1]!;
 r.requestUrl=r.url=mode === "library"?"https://connect.facebook.net/en_US/fbevents.js":"https://www.facebook.com/tr/?id=fixture&ev=PageView";
 r.collectionEndpointObserved=mode !== "library";
 const v=resolveCanonicalVendor({type:"request",url:r.requestUrl,evidenceId:r.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!;
 g.normalizedVendorObservations=[v];
 g.gpcSignalObservation!.prototypeCaptureBinding={captureId:g.gpcObservationSession!.captureId,documentToken:"fixture-loader",documentIdentitySource:"cdp_loader_id"};
 g.networkResponseEvents=[{...r,eventId:"response_1",eventType:"network_response",responseUrl:r.requestUrl,requestId:r.requestId,status:mode === "http_error"?403:204}] as never;
 g.gpcObservationSession!.requests[1]!.urlSha256=createHash("sha256").update(r.requestUrl).digest("hex");
 if(mode === "partial") {g.gpcObservationSession!.requestsDropped=1;g.gpcObservationSession!.requestsObserved++;}
 g.gpcPrototypeSessionBinding!.sessionSha256=createHash("sha256").update(JSON.stringify(g.gpcObservationSession)).digest("hex");
 const bytes=Buffer.from(JSON.stringify(g));
 const pointer={uri:"s3://fixture/gpc.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length};
 const comparison=buildGpcResponseAssessment({baseline:b,gpc:g,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"},gpcArtifact:pointer});
 return buildGpcProductionAssessment({scanId:g.scanId,comparison,source:{bytes,pointer}});
}

test("only verified advertising collection qualifies; libraries and errors remain neutral",()=>{
 const a=observed();assert.equal(a.observation.requests.advertisingCollectionCount,1);
 const partialSource=observed("partial");
 assert.equal(partialSource.observation.status,"limited");
 assert.equal(partialSource.observation.requests.complete,false);
 assert.equal(deriveCaliforniaGpcResponsePolicy(partialSource).deductionPoints,15,"A source-bound positive event survives a dropped unrelated request");
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,15);
 for(const mode of ["library","http_error"]){const a=observed(mode);assert.equal(a.observation.requests.advertisingCollectionCount,0);assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,0);}
 const limited=observed();limited.comparison.coverage.status="limited";
 assert.equal(deriveCaliforniaGpcResponsePolicy(limited).deductionPoints,0);
 const incomplete=observed();incomplete.observation.status="limited";incomplete.observation.requests.complete=false;incomplete.observation.limitationKeys=["capture_incomplete"];
 assert.equal(deriveCaliforniaGpcResponsePolicy(incomplete).deductionPoints,15,"Verified positive collection survives unrelated incomplete capture");
 incomplete.observation.delivery.fullContextVerified=false;
 assert.equal(deriveCaliforniaGpcResponsePolicy(incomplete).deductionPoints,15,"Worker/frame coverage does not veto main-document request proof");
 incomplete.observation.positiveEvidence!.representativeDocument=false;
 assert.equal(deriveCaliforniaGpcResponsePolicy(incomplete).deductionPoints,0);
 const contradiction=observed("library");contradiction.observation.semanticProbe="observed";
 contradiction.observation.registration={basis:"current_recorded_state",sale:"not_opted_out",sharing:"unknown",cmpGpcSignal:"received",causedByGpc:"not_established"};
 assert.equal(deriveCaliforniaGpcResponsePolicy(contradiction).deductionPoints,15);
 assert.equal(deriveCaliforniaGpcResponsePolicy(contradiction).reasonCode,"verified_gpc_choice_contradiction");
 contradiction.observation.registration.cmpGpcSignal="unknown";
 assert.equal(deriveCaliforniaGpcResponsePolicy(contradiction).deductionPoints,0);
 const legacy=observed();delete legacy.observation.requests.advertisingCollectionCount;delete legacy.observation.requests.advertisingCollectionEvidenceIds;
 assert.equal(deriveCaliforniaGpcResponsePolicy(legacy).deductionPoints,0);
});

test("GPC collection scores only the CA posture through canonical concern/policy/findings; overlapping opt-out charges once",()=>{
 const a=observed(),f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 assert.ok(child.contractVersion === "certscore.california-privacy-review.v10");
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:a}});
 const gpc=packets.find(row=>row.unifiedFindingId === "gpc_response")!;
 assert.equal(gpc.scoreEffects?.[0]?.appliesTo,"california_posture");
 assert.ok(!gpc.scoreEffects?.some(row=>row.appliesTo === "certscore_overall"));
 assert.equal(buildCanonicalGpcResponseProjection(packets)?.californiaDeductionPoints,15);
 const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets});
 assert.ok(projectCaliforniaRegulatoryPriorities(packets).some(row=>row.id === "gpc_response"));
 assert.equal(score.score,85);assert.equal(score.deductions.length,1);
 child.reviewCoverage.scoreReady=false;child.reviewCoverage.runtimeCoverage="limited";
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets}).score,85,"Supported deductions stay visible with incomplete unrelated CA coverage");
 const partial=observed("partial");
 partial.status="indeterminate";partial.findingTitle="GPC response";
 partial.comparison.comparable=false;partial.comparison.coverage.status="limited";
 partial.comparison.responseBasis="insufficient_evidence";partial.comparison.limitationKeys=["gpc_settle_not_completed"];
 const partialPackets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:partial}});
 assert.equal(buildCanonicalGpcResponseProjection(partialPackets)?.californiaDeductionPoints,15);
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:partialPackets}).score,85,"Partial pair and unrelated CA limits cannot hide a canonical positive deduction");
 child.reviewCoverage.scoreReady=true;child.reviewCoverage.runtimeCoverage="complete";
 const evidence={contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:f.bundle.scanId,parentDispatchSha256:"a".repeat(64),targetUrl:CA_FIXTURE_URL,
 documentToken:"choice-loader",startedAt:"2026-10-17T12:00:00.000Z",completedAt:"2026-10-17T12:00:01.500Z",status:"complete",recipeVersion:"fixture.v1",provider:"OneTrust",actionCount:2,submitted:true,registration:"confirmed",confirmedAt:"2026-10-17T12:00:00.500Z",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,
 requests:[{hostname:"www.facebook.com",vendor:"Meta",purpose:"advertising",httpStatus:204,msAfterConfirmation:300,collectionEvidence:{contractVersion:"canonical_advertising_collection.v1",endpointSha256:"d".repeat(64),registryVersion:"fixture",ruleIds:["meta_pixel_endpoint_or_cookie"]}}],limitations:[]};
 const bytes=Buffer.from(JSON.stringify(evidence));
 f.bundle.saleSharingOptOut={evidence,verificationStatus:"verified",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length} as never;
 const both=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;parent.californiaPrivacyReview=both;
 const bothPackets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:a}});
 const grouped=deriveCaliforniaRegulatoryScore({assessment:both,checklistRows:[],unifiedFindings:bothPackets});
 assert.equal(grouped.score,85);assert.equal(grouped.deductions.length,1,"GPC and clicked opt-out share one 15-point family cap");
 const explicitOnly=bothPackets.filter(row=>row.unifiedFindingId !== "gpc_response");
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:both,checklistRows:[],unifiedFindings:explicitOnly}).score,85);
 const wrongScan=structuredClone(a);wrongScan.observation.scanId="another-scan";
 const wrongPackets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:{...parent,californiaPrivacyReview:child},gpcResponseAssessment:wrongScan}});
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:wrongPackets}).score,100);
 // Public response retains the same policy weight and rejects score/coverage drift.
 const c=a.comparison;
 const publicResponse={contractVersion:a.contractVersion,observation:a.observation,status:a.status,findingTitle:a.findingTitle,summary:"Verified collection observed",scoreEffect:"none",legalInterpretation:"not_assessed",
  comparison:{...c,delivery:{status:c.delivery.status},baselineArtifact:{lane:"runtime_evidence",sha256:c.baselineArtifact!.sha256,sizeBytes:c.baselineArtifact!.sizeBytes},gpcArtifact:{lane:"gpc_observation",sha256:c.gpcArtifact!.sha256,sizeBytes:c.gpcArtifact!.sizeBytes}},
  californiaPolicy:{applied:true,deductionPoints:15},evidenceUrl:"https://example.test/evidence"};
 const {evidenceRefs,...publicComparison}=publicResponse.comparison;
 assert.ok(apiV2GpcResponseSchema.safeParse({...publicResponse,comparison:publicComparison}).success);
});
