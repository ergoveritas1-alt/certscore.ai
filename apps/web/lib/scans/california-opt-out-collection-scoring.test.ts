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
import {gpcResponseAssessmentSchema} from "@certscore/contracts";
import {californiaChoiceEnforcementPoints} from "./california-choice-enforcement-policy";
import {projectAdminScoringEntityCounts} from "../../server/admin/admin-scan-posture-score";
import {SCAN_REPORT_PROJECTION_VERSION} from "../../server/scans/scan-report-projection-contract";

function observed(mode="collection", urls?: string[], currentQualification = false) {
 const g=gpcProductionRuntimeFixture(),b=gpcRuntimeFixture({enabled:false});
 const r=g.networkEvents[1]!;
 r.requestUrl=r.url=mode === "library"?"https://connect.facebook.net/en_US/fbevents.js":"https://www.facebook.com/tr/?id=fixture&ev=PageView";
 r.collectionEndpointObserved=mode !== "library";
 g.networkEvents=[g.networkEvents[0]!, ...(urls ?? [r.requestUrl]).map((url,i)=>({...r,eventId:`collection-${i}`,requestId:`collection-${i}`,requestUrl:url,url}))];
 g.normalizedVendorObservations=g.networkEvents.slice(1).map(event=>resolveCanonicalVendor({type:"request",url:event.requestUrl,evidenceId:event.eventId,sourceScanner:"fixture",matchSource:"network_request"}).observation!);
 g.gpcSignalObservation!.prototypeCaptureBinding={captureId:g.gpcObservationSession!.captureId,documentToken:"fixture-loader",documentIdentitySource:"cdp_loader_id"};
 g.networkResponseEvents=mode === "no_response" ? [] : g.networkEvents.slice(1).map(event=>({...event,eventId:`response-${event.eventId}`,eventType:"network_response",responseUrl:event.requestUrl,status:mode === "http_error"?403:204})) as never;
 g.gpcObservationSession!.requests=g.networkEvents.map(event=>({eventId:event.eventId,timestampMs:event.timestampMs,urlSha256:createHash("sha256").update(event.requestUrl).digest("hex"),secGpc:"1"}));
 g.gpcObservationSession!.requestsObserved=g.networkEvents.length;
 if(mode === "partial") {g.gpcObservationSession!.requestsDropped=1;g.gpcObservationSession!.requestsObserved++;}
 g.gpcPrototypeSessionBinding!.sessionSha256=createHash("sha256").update(JSON.stringify(g.gpcObservationSession)).digest("hex");
 const bytes=Buffer.from(JSON.stringify(g));
 const pointer={uri:"s3://fixture/gpc.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length};
 const comparison=buildGpcResponseAssessment({baseline:b,gpc:g,baselineArtifact:{...pointer,uri:"s3://fixture/base.json"},gpcArtifact:pointer});
 const assessment = buildGpcProductionAssessment({scanId:g.scanId,comparison,source:{bytes,pointer}});
 // Existing v5 calibration cases remain historical. New v7 cases below retain
 // the explicit producer qualification rather than reinterpreting these rows.
 if (!currentQualification) { delete assessment.observation.requests.advertisingCollectionQualification; delete assessment.observation.requests.gppPropagation; }
 return assessment;
}

function publicGpcResponse(a: ReturnType<typeof observed>, deductionPoints: number) {
 const {evidenceRefs,...comparison}=a.comparison;
 const pointer=(p:NonNullable<typeof comparison.baselineArtifact | typeof comparison.gpcArtifact>)=>({lane:p.lane,sha256:p.sha256,sizeBytes:p.sizeBytes});
 return {contractVersion:a.contractVersion,observation:a.observation,status:a.status,findingTitle:a.findingTitle,
  summary:"Verified collection observed",scoreEffect:"none",legalInterpretation:"not_assessed",
  comparison:{...comparison,delivery:{status:comparison.delivery.status},baselineArtifact:pointer(comparison.baselineArtifact!),gpcArtifact:pointer(comparison.gpcArtifact!)},
  californiaPolicy:{applied:deductionPoints>0,deductionPoints},evidenceUrl:"https://example.test/evidence"};
}

test("only verified advertising collection qualifies; libraries and errors remain neutral",()=>{
 const a=observed();assert.equal(a.observation.requests.advertisingCollectionCount,1);
 assert.equal(a.observation.requests.advertisingCollectionRecipients!.rows.length,1);
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

test("v7 sale/sharing qualification survives persistence and drives canonical findings, CA score, API and Admin counts", () => {
 const urls = [
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&npa=0&gpp=DBABBg~BUoAAABA.YA&gpp_sid=8",
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=789.012&rdp=1",
  "https://securepubads.g.doubleclick.net/gampad/ads?iu=publisher&npa=1",
  "https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture",
  "https://www.facebook.com/tr/?id=publisher&ev=PageView&fbp=visitor-fixture&dpo=LDU",
  "https://fastlane.rubiconproject.com/a/api/fastlane.json?site_id=publisher",
 ];
 const a = observed("partial", urls, true);
 assert.equal(a.observation.requests.advertisingCollectionCount, 6, "all factual collection remains retained");
 const policy = deriveCaliforniaGpcResponsePolicy(a);
 assert.equal(policy.policyVersion, "california-gpc-response.v7-gpp");
 assert.equal(policy.deductionPoints, 25);
 assert.equal(policy.recipientIds?.length, 2);
 assert.deepEqual(policy.eligibleActivity.persistedUnderGpc, ["collection-0", "collection-3"]);
 assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a, 25)).success, true);
 assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a, 37)).success, false, "raw advertising entities cannot inflate API weights");
 const persisted = gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(a)));
 assert.deepEqual(deriveCaliforniaGpcResponsePolicy(persisted), policy);
 const f = californiaCoverageFixture(); f.bundle.scanId = a.observation.scanId!; f.policyEvidence.projection.scanId = f.bundle.scanId;
 f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
 f.bundle.policySurfaceObservations.forEach(row => { row.documentLanguage = "en"; });
 const child = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
 const parent = deriveConsentControlAssessment({ scan: { scanId: f.bundle.scanId, finalUrl: CA_FIXTURE_URL } }); parent.californiaPrivacyReview = child;
 const findings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
  runtimeArtifacts: { consentControlAssessment: parent, gpcResponseAssessment: persisted } });
 const gpc = findings.find(row => row.unifiedFindingId === "gpc_response")!;
 assert.equal(gpc.scoreEffects?.[0]?.deductionPoints, 25);
 assert.equal(gpc.scoreEffects?.[0]?.policyVersion, policy.policyVersion);
 assert.equal(gpc.scoreEffects?.some(effect => effect.appliesTo === "certscore_overall"), false);
 assert.equal(deriveCaliforniaRegulatoryScore({ assessment: child, checklistRows: [], unifiedFindings: findings }).score, 75);
 assert.equal(buildCanonicalGpcResponseProjection(findings)?.californiaDeductionPoints, 25);
 const snapshot = { report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION, report_projection_computed_at: f.bundle.completedAt,
  admin_canonical_score_input: { scanId: f.bundle.scanId, projectionScanId: f.bundle.scanId, assessment: child, gpcAssessment: persisted, unifiedFindings: findings, checklistRows: [] } };
 assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId, snapshot, false).gpc, 2);
 const bad = structuredClone(a); bad.observation.requests.advertisingCollectionQualification!.rows[0]!.evidenceId = "different-request";
 assert.equal(gpcResponseAssessmentSchema.safeParse(bad).success, false);
 assert.equal(deriveCaliforniaGpcResponsePolicy(bad).deductionPoints, 0);
 const roleMismatch = structuredClone(a);
 roleMismatch.observation.requests.advertisingCollectionQualification!.rows[2]!.activity = "identity_sync";
 assert.equal(gpcResponseAssessmentSchema.safeParse(roleMismatch).success, false, "an unresolved rule cannot manufacture an eligible role");
});

test("v7 restricted or unresolved collection stays neutral while verified CMP contradictions remain independent", () => {
 for (const url of [
  "https://securepubads.g.doubleclick.net/gampad/ads?iu=publisher&npa=1",
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&rdp=1",
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&us_privacy=1NYN",
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&gpp=opaque",
  "https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&gpp=DBABBg~BVWSSSVY.YA&gpp_sid=8",
  "https://px.ads.linkedin.com/collect?pid=publisher&pageLoadId=page-fixture",
 ]) {
  const a = observed("collection", [url], true);
  assert.equal(a.observation.requests.advertisingCollectionCount, 1);
  assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints, 0, url);
  assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a, 15)).success, false);
  a.observation.semanticProbe = "observed";
  a.observation.registration = { basis: "current_recorded_state", sale: "not_opted_out", sharing: "unknown", cmpGpcSignal: "received", causedByGpc: "not_established" };
  assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints, 15);
  assert.deepEqual(deriveCaliforniaGpcResponsePolicy(a).recipientIds, [], "contradiction does not manufacture a recipient");
  assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a, 15)).success, true);
 }
 const historical = observed("collection", ["https://securepubads.g.doubleclick.net/gampad/ads?iu=publisher&npa=1"]);
 assert.equal(deriveCaliforniaGpcResponsePolicy(historical).policyVersion, "california-gpc-response.v5-recipients");
 assert.equal(deriveCaliforniaGpcResponsePolicy(historical).deductionPoints, 15, "historical materializations are not silently reclassified");
});

test("offline GPP decoding can qualify retained positive collection without upgrading historical v6 records", () => {
 const a=observed("collection",["https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&gpp=DBABBg~BUoAAABA.YA&gpp_sid=8"],true);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,15);
 assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a,15)).success,true);
 const old=structuredClone(a),qualification=old.observation.requests.advertisingCollectionQualification!;
 qualification.policyVersion="gpc_sale_sharing_evidence.v1";
 delete old.observation.requests.gppPropagation;
 for(const row of qualification.rows){delete row.gpp;row.processingSignals=["gpp_unresolved"];}
 assert.equal(deriveCaliforniaGpcResponsePolicy(old).policyVersion,"california-gpc-response.v6-sale-sharing");
 assert.equal(deriveCaliforniaGpcResponsePolicy(old).deductionPoints,0);
 const missing=structuredClone(a);delete missing.observation.requests.advertisingCollectionQualification!.rows[0]!.gpp;
 assert.equal(gpcResponseAssessmentSchema.safeParse(missing).success,false);
 const corrupt=structuredClone(a);corrupt.observation.requests.advertisingCollectionQualification!.rows[0]!.gpp!.sections[0]!.saleOptOut=1;
 assert.equal(deriveCaliforniaGpcResponsePolicy(corrupt).deductionPoints,0,"a missing derived restriction flag cannot promote an explicit opt-out");
});

test("recipient schedule includes the first recipient and caps at 47",()=>{
 for (let count=0;count<=12;count++) {
  const ids=Array.from({length:count},(_,i)=>`recipient-${i}`);
  const expected=[0,15,25,32,37,40,43,45,47][Math.min(count,8)];
  assert.equal(californiaChoiceEnforcementPoints([...ids,...ids],false),expected);
  assert.equal(californiaChoiceEnforcementPoints(ids,true),count?expected:15);
 }
});

test("measurement/security and sync bootstrap do not create GPC recipients; actual Adobe collection still scores",()=>{
 const support=["https://pixel.adsafeprotected.com/services/pub?sessionId=fixture", "https://pagead2.googlesyndication.com/pagead/sodar?id=sodar2", "https://ads.pubmatic.com/AdServer/js/user_sync.html?kdntuid=1&p=123"];
 const a=observed("collection",support);
 assert.equal(a.observation.requests.advertisingCollectionCount,0);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,0);
 const supported=observed("partial",[...support,"https://dpm.demdex.net/id?d_cid=fixture"]);
 assert.equal(supported.observation.requests.advertisingCollectionRecipients!.rows.length,1);
 assert.equal(deriveCaliforniaGpcResponsePolicy(supported).deductionPoints,15);
});

const threeRecipients=["https://dpm.demdex.net/id", "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/",
 "https://www.google.com/pagead/1p-user-list/123/", "https://config.aps.amazon-adsystem.com/configs/123", "https://pagead2.googlesyndication.com/pagead/ping"];
test("Admin GPC count includes only applied canonical recipient entities, deduplicating repeated requests",()=>{
 for(const mode of ["collection","library"]){
  const gpc=observed(mode,mode==="collection"?[...threeRecipients,...threeRecipients]:undefined);
  const f=californiaCoverageFixture();f.bundle.scanId=gpc.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
  const assessment=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=assessment;
  const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:gpc},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const snapshot={report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:f.bundle.completedAt,
    admin_canonical_score_input:{scanId:f.bundle.scanId,projectionScanId:f.bundle.scanId,assessment,gpcAssessment:gpc,unifiedFindings:findings,checklistRows:[]}};
  assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,snapshot,false).gpc,mode==="collection"?2:0);
  assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,snapshot,true).gpc,null);
  assert.equal(projectAdminScoringEntityCounts("other",snapshot,false).gpc,null);
  if(mode==="collection")assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,{...snapshot,admin_canonical_score_input:{...snapshot.admin_canonical_score_input,unifiedFindings:[]}},false).gpc,null,"Unapplied evidence cannot become a qualifying entity count");
 }
});
test("eight captured recipients reach 47 through the source-bound API contract",()=>{
 const urls=[threeRecipients[0]!,threeRecipients[1]!,"https://gum.criteo.com/r/d","https://www.facebook.com/tr/?id=fixture&ev=PageView","https://px.ads.linkedin.com/collect/",
  "https://bat.bing.com/action/0?ti=123","https://analytics.tiktok.com/api/v2/pixel/track","https://ct.pinterest.com/ct.html"];
 for(let count=1;count<=8;count++) {
  const a=observed("collection",[...urls.slice(0,count),...urls.slice(0,count)]);
  const points=[0,15,25,32,37,40,43,45,47][count]!;
  assert.equal(deriveCaliforniaGpcResponsePolicy(a).recipientIds!.length,count);
  assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,points);
  assert.ok(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a,points)).success);
 }
 const analytics=observed("collection",["https://www.google-analytics.com/g/collect?v=2&tid=G-FIXTURE"]);
 assert.equal(deriveCaliforniaGpcResponsePolicy(analytics).deductionPoints,0);
});
test("configuration and support requests do not inflate the two retained collection recipients",()=>{
 const a=observed("collection",threeRecipients);
 assert.equal(a.observation.requests.advertisingCollectionCount,3);
 const rows=a.observation.requests.advertisingCollectionRecipients!.rows;
 assert.equal(new Set(rows.map(row=>row.entityId)).size,2);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,25);
 assert.equal(deriveCaliforniaGpcResponsePolicy(gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(a)))).deductionPoints,25,"Persisted typed evidence preserves recipient effects");
 assert.ok(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a,25)).success);
 assert.equal(apiV2GpcResponseSchema.safeParse(publicGpcResponse(a,47)).success,false,"Public weights cannot exceed retained recipient support");
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:a}});
 assert.equal(packets.find(row=>row.unifiedFindingId === "gpc_response")!.scoreEffects![0]!.deductionPoints,25);
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets}).score,75);
 const limited=observed("partial",threeRecipients);
 assert.equal(deriveCaliforniaGpcResponsePolicy(limited).deductionPoints,25);
 assert.ok(apiV2GpcResponseSchema.safeParse(publicGpcResponse(limited,25)).success,"Partial comparisons retain verified recipient scoring through API and SDK contracts");
 limited.observation.semanticProbe="observed";
 limited.observation.registration={basis:"current_recorded_state",sale:"not_opted_out",sharing:"unknown",cmpGpcSignal:"received",causedByGpc:"not_established"};
 assert.equal(deriveCaliforniaGpcResponsePolicy(limited).deductionPoints,25,"Contradiction does not add another initial effect");
 const invalidTime=structuredClone(a);
 invalidTime.observation.requests.advertisingCollectionRecipients!.rows[0]!.observedAtMs=invalidTime.observation.requests.throughMs!+1;
 assert.equal(gpcResponseAssessmentSchema.safeParse(invalidTime).success,false,"Recipient timing must be inside the retained visit window");
 const bad=structuredClone(a);bad.observation.requests.advertisingCollectionRecipients!.rows[0]!.evidenceId="unretained-event";
 assert.equal(gpcResponseAssessmentSchema.safeParse(bad).success,false);
 assert.equal(deriveCaliforniaGpcResponsePolicy(bad).deductionPoints,0);
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
 const multi=observed("collection",threeRecipients);
 const unionPackets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:multi}});
 const union=deriveCaliforniaRegulatoryScore({assessment:both,checklistRows:[],unifiedFindings:unionPackets});
 assert.equal(union.score,68,"Two GPC recipients and a distinct explicit opt-out recipient use the three-recipient total");
 assert.equal(union.deductions.length,1);
 const repeated=structuredClone(both);
 repeated.optOutObservation!.evidence.requests.push({...repeated.optOutObservation!.evidence.requests[0]!});
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:repeated,checklistRows:[],unifiedFindings:unionPackets}).score,68);
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

test("Criteo first-party collection endpoints count once with verified responses, including partial comparisons",()=>{
 const urls=["https://gum.criteo.com/fpm/init?first_party_id=fixture", "https://gum.us.criteo.com/fpm/sid?first_party_id=fixture"];
 const a=observed("partial",urls);
 assert.equal(a.observation.requests.advertisingCollectionCount,2);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).recipientIds?.length,1);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,15);
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:a}});
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets}).score,85);
 const noResponse=observed("no_response",urls);
 assert.equal(noResponse.observation.requests.advertisingCollectionCount,0);
 assert.equal(deriveCaliforniaGpcResponsePolicy(noResponse).deductionPoints,0,"Unverified transport must not become a successful collection event");
});

test('verified Google matching and Amazon identity endpoints enter the canonical recipient scale',()=>{
 const urls=['https://cm.g.doubleclick.net/pixel?google_nid=fixture','https://s.amazon-adsystem.com/iu3?d=fixture','https://aax.amazon-adsystem.com/e/dtb/bid/123/0/prebid'];
 const a=observed('partial',urls);
 assert.equal(a.observation.requests.advertisingCollectionCount,3);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).recipientIds?.length,2);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,25);
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
 f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage='en';});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:a}});
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets}).score,75);
 assert.equal(deriveCaliforniaGpcResponsePolicy(observed('no_response',urls)).deductionPoints,0);
 const support=observed('collection',['https://cm.g.doubleclick.net/partnerpixels?gpp=fixture','https://s.amazon-adsystem.com/iu30','https://c.amazon-adsystem.com/aax2/apstag.js']);
 assert.equal(deriveCaliforniaGpcResponsePolicy(support).deductionPoints,0);
});

test("GPT ad calls and Lotame profile mapping reach the canonical California score without support downloads", () => {
 const urls=["https://securepubads.g.doubleclick.net/gampad/ads?iu=fixture", "https://bcp.crwdcntrl.net/6/map?xcid=fixture",
  "https://securepubads.g.doubleclick.net/pagead/managed/dict/m202610200101/gpt", "https://pagead2.googlesyndication.com/ccm/collect"];
 const a=observed("collection",urls);
 assert.deepEqual(a.observation.requests.advertisingCollectionEvidenceIds,["collection-0","collection-1"]);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).recipientIds?.length,2);
 assert.equal(deriveCaliforniaGpcResponsePolicy(a).deductionPoints,25);
 const persisted=gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(a)));
 assert.ok(persisted.contractVersion === "certscore.gpc-response-assessment.v3");
 assert.ok(apiV2GpcResponseSchema.safeParse(publicGpcResponse(persisted,25)).success);
 const f=californiaCoverageFixture();f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:persisted}});
 assert.equal(buildCanonicalGpcResponseProjection(packets)?.californiaDeductionPoints,25);
 const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets});
 assert.equal(score.score,75);assert.equal(score.deductions.length,1);
 assert.equal(deriveCaliforniaGpcResponsePolicy(observed("no_response",urls)).deductionPoints,0);
});

test("separate GPP propagation family survives persistence, caps at five, and never inflates GPC entities or EU scoring",()=>{
 const a=observed("collection",[
  "https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN",
  "https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN&slot=2",
  "https://bcp.crwdcntrl.net/6/map?xcid=fixture",
 ],true);
 assert.equal(a.observation.requests.gppPropagation?.rows.length,2);
 const persisted=gpcResponseAssessmentSchema.parse(JSON.parse(JSON.stringify(a)));
 assert.equal(persisted.contractVersion,"certscore.gpc-response-assessment.v3");
 if(persisted.contractVersion!=="certscore.gpc-response-assessment.v3")throw Error("Expected v3");
 assert.equal(deriveCaliforniaGpcResponsePolicy(persisted).deductionPoints,15);
 assert.equal(deriveCaliforniaGpcResponsePolicy(persisted).recipientIds?.length,1);
 const f=californiaCoverageFixture();f.bundle.scanId=a.observation.scanId!;f.policyEvidence.projection.scanId=f.bundle.scanId;
 f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
 f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
 const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
 const findings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
  runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:persisted}});
 const propagation=findings.find(row=>row.unifiedFindingId==="gpp_propagation_inconsistency")!;
 assert.ok(propagation);assert.equal(propagation.presentationDecision.status,"surface",JSON.stringify({presentation:propagation.presentationDecision,surfacing:propagation.surfacingDecision,concern:propagation.concernContext}));assert.equal(propagation.surfacingDecision?.reportable,true);
 assert.equal(propagation.scoreEffects?.length,1);
 assert.equal(propagation.scoreEffects![0]!.deductionPoints,5);
 assert.equal(propagation.scoreEffects![0]!.policyVersion,"california-gpp-propagation.v1");
 assert.equal(propagation.scoreEffects!.some(effect=>effect.appliesTo==="certscore_overall"),false);
 assert.ok(!/points|deduct/i.test(propagation.summary));
 const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:[...findings,propagation]});
 assert.equal(score.score,80);assert.equal(score.policyVersion,"california-regulatory-posture.v13-gpp");
 assert.equal(score.deductions.filter(row=>row.findingId==="gpp_propagation_inconsistency").length,1);
 const snapshot={report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:f.bundle.completedAt,
  admin_canonical_score_input:{scanId:f.bundle.scanId,projectionScanId:f.bundle.scanId,assessment:child,gpcAssessment:persisted,unifiedFindings:findings,checklistRows:[]}};
 assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,snapshot,false).gpc,1);
 assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,snapshot,false).gpp,1,"two affected requests to one entity count once");
 assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,snapshot,true).gpp,null);
 const old=structuredClone(persisted);delete old.observation.requests.gppPropagation;
 assert.equal(projectAdminScoringEntityCounts(f.bundle.scanId,{...snapshot,
  admin_canonical_score_input:{...snapshot.admin_canonical_score_input,gpcAssessment:old}},false).gpp,null,"historical assessments were not assessed for propagation");
 const oldFindings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
  runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:old}});
 assert.ok(!oldFindings.some(row=>row.unifiedFindingId==="gpp_propagation_inconsistency"));
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:oldFindings}).score,85);
 for(const mode of ["request","timestamp","section","source","navigator","representative"]){
  const bad=structuredClone(persisted);
  if(mode==="request")bad.observation.requests.gppPropagation!.rows[0]!.evidenceId="different-request";
  if(mode==="timestamp")bad.observation.requests.gppPropagation!.rows[0]!.observedAtMs++;
  if(mode==="section")bad.observation.requests.gppPropagation!.rows[0]!.applicableSections=[7];
  if(mode==="source")bad.observation.sourceSha256="b".repeat(64);
  if(mode==="navigator")bad.observation.delivery.mainNavigatorReadbackRetained=false;
  if(mode==="representative")bad.observation.positiveEvidence!.representativeDocument=false;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
   runtimeArtifacts:{consentControlAssessment:parent,gpcResponseAssessment:bad}});
  assert.ok(!packets.some(row=>row.unifiedFindingId==="gpp_propagation_inconsistency"),mode);
 }
 const badEffect=structuredClone(propagation);badEffect.scoreEffects![0]!.deductionPoints=15;
 assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:[...findings.filter(row=>row.unifiedFindingId!=="gpp_propagation_inconsistency"),badEffect]}).score,85);
 const wrongScan=structuredClone(child);wrongScan.scanId="other-scan";
 assert.ok(!deriveCaliforniaRegulatoryScore({assessment:wrongScan,checklistRows:[],unifiedFindings:[propagation]}).deductions.length);
});
