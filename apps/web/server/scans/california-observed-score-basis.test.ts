import assert from "node:assert/strict";
import test from "node:test";
import { californiaPrivacyReviewSchema, consentControlAssessmentSchema, deriveConsentControlAssessment, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "./california-review-coverage.fixture";
import { projectCaliforniaObservedScoreBasis } from "./california-observed-score-basis";
import { projectCaliforniaPrivacyReview } from "./california-privacy-review-projection";
import { deriveCaliforniaRegulatoryScore } from "../../lib/scans/california-regulatory-score";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { buildApiV2PostureScores } from "../../lib/api-v2/posture-scores";
import { projectPrivacyAuditEvidence } from "./privacy-audit-projection";

function fixture() {
  const f=californiaCoverageFixture();
  f.bundle.policySurfaceInspection={californiaReviewPolicy:"california-privacy-review.v10"} as CanonicalEvidenceBundle["policySurfaceInspection"];
  f.bundle.policySurfaceObservations=[];
  f.bundle.runtimeMetadataSnapshots=[{artifactId:"runtime-dom",path:"/retained/runtime-dom.txt",url:CA_FIXTURE_URL,capturedAtMs:500,
    documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"},textExcerpt:"Usable starting page",pagePhase:"network_idle",consentStateAtTime:"pre_consent"}];
  f.bundle.scanLaneRuns=[{laneId:"runtime_evidence",executionOutcome:"success",accessOutcome:"representative_page",challengeDetected:false}] as CanonicalEvidenceBundle["scanLaneRuns"];
  f.policyEvidence.projection.documents=[];f.policyEvidence.texts=[];
  return f;
}

test("query and fragment identity survive typed California projection and parent persistence", () => {
  const f=fixture();
  const url=`${CA_FIXTURE_URL}?app=wos&return=%2Fhome#overview`;
  f.bundle.runtimeMetadataSnapshots![0]!.url=url;
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,url,f.policyEvidence)!;
  assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10");
  assert.equal(child.documentUrl,url);
  assert.equal(child.observedScoreBasis?.documentUrl,url);
  assert.equal(projectPrivacyAuditEvidence(f.bundle,CA_FIXTURE_SOURCE,url)?.documentUrl,CA_FIXTURE_URL);
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:url}});
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify({...parent,californiaPrivacyReview:child})));
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:[]}).score,100);
  for(const wrong of [CA_FIXTURE_URL,`${CA_FIXTURE_URL}?app=other`,`${url}-different`]) {
    assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,wrong),undefined);
    assert.equal(consentControlAssessmentSchema.safeParse({...parent,californiaPrivacyReview:{...child,documentUrl:wrong}}).success,false);
  }
  for(const invalid of ["https://user:secret@california-fixture.test/?app=wos","file:///tmp/retained",`https://example.test/?state=${"x".repeat(800)}`]) {
    assert.equal(californiaPrivacyReviewSchema.safeParse({...child,documentUrl:invalid,observedScoreBasis:{...child.observedScoreBasis,documentUrl:invalid}}).success,false);
  }
});

test("every usable report has a California score independently of policy, choices, region or eligible findings",()=>{
  for(const region of ["california","eu_de","eu_ie"] as const) {
    const f=fixture();f.bundle.region=region;
    const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10");
    assert.equal(child.observedScoreBasis?.policyVersion,"usable_starting_page_score.v1");
    assert.equal(child.reviewCoverage.scoreReady,false);
    assert.equal(child.reviewCoverage.captureCoverage.policyTextComplete,false);
    assert.equal(child.choiceSurface,"unknown");
    const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});
    parent.californiaPrivacyReview=child;
    const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
    const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{consentControlAssessment:persisted},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
    const score=deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:findings});
    assert.equal(score.policyVersion,"california-regulatory-posture.v12-observed");
    assert.equal(score.score,100);assert.equal(score.coverage,"limited");assert.deepEqual(score.deductions,[]);
    assert.equal(findings.length,0,"Score availability cannot manufacture findings or passes");
    assert.equal(buildApiV2PostureScores({score:93,californiaScore:score}).ccpaCpra.score,100);
    const historical=structuredClone(child);delete historical.observedScoreBasis;
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:historical,checklistRows:[],unifiedFindings:[]}).score,null);
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:historical,checklistRows:[],unifiedFindings:[]}).policyVersion,"california-regulatory-posture.v11-wcag");
    for(const patch of [{scanId:"different"},{documentUrl:"https://other.test/"},{sourceHash:"b".repeat(64)}])
      assert.equal(californiaPrivacyReviewSchema.safeParse({...child,observedScoreBasis:{...child.observedScoreBasis,...patch}}).success,false);
  }
});

test("score availability requires the original usable runtime visit; failed, blocked, stale and missing proof stay neutral",()=>{
 const f=fixture();
 assert.ok(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL));
 const changes:Array<(b:CanonicalEvidenceBundle)=>void>=[
   b=>{b.runtimeMetadataSnapshots=[];},
   b=>{b.runtimeMetadataSnapshots![0]!.documentIdentity=undefined;},
   b=>{b.runtimeMetadataSnapshots![0]!.url="https://different.test/";},
   b=>{b.scanLaneRuns![0]!.executionOutcome="failed";},
   b=>{b.scanLaneRuns![0]!.accessOutcome="bot_challenge";},
   b=>{b.scanLaneRuns![0]!.challengeDetected=true;},
   b=>{b.scanLaneRuns=[];},
   b=>{b.runtimeCoverage!.coverageStatus="limited_none";},
   b=>{b.scanNoGoAssessment={decision:"no_go"} as CanonicalEvidenceBundle["scanNoGoAssessment"];},
   b=>{b.scan_no_go_assessment={decision:"no_go"} as CanonicalEvidenceBundle["scanNoGoAssessment"];},
 ];
 for(const change of changes){const b=structuredClone(f.bundle);change(b);assert.equal(projectCaliforniaObservedScoreBasis(b,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);}
 assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,{...CA_FIXTURE_SOURCE,verificationStatus:"unverified"},CA_FIXTURE_URL),undefined);
 assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,{...CA_FIXTURE_SOURCE,sha256:"invalid"},CA_FIXTURE_URL),undefined);
});

test("verified runtime title supplies visit proof when the bounded text excerpt is empty", () => {
  const f=fixture();const snapshot=f.bundle.runtimeMetadataSnapshots![0]!;
  snapshot.textExcerpt="";
  snapshot.siteMetadata={contractVersion:"certscore.site-metadata.v1",title:"Statistikmyndigheten SCB"} as NonNullable<typeof snapshot.siteMetadata>;
  assert.ok(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL));
  snapshot.siteMetadata.title=" ";
  assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);
});

test("partial inventory does not erase positively verified original navigation and runtime document", () => {
  const f=fixture();const lane=f.bundle.scanLaneRuns![0]!;
  f.bundle.runtimeCoverage!.coverageStatus="limited_partial";
  lane.executionOutcome="degraded";
  lane.navigationAttempts=[{sequence:1,mode:"initial_https_navigation",outcome:"success",httpStatus:200,durationMs:100,effectiveUrl:CA_FIXTURE_URL}];
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  assert.equal(child.contractVersion,"certscore.california-privacy-review.v10");
  assert.ok(child.observedScoreBasis);
  assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:[]}).score,100);
  lane.navigationAttempts=[];
  assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);
  lane.navigationAttempts=[{sequence:1,mode:"initial_https_navigation",outcome:"success",httpStatus:403,durationMs:100,effectiveUrl:CA_FIXTURE_URL}];
  assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);
});

test("an earlier usable runtime snapshot cannot supply a basis after a later empty or different document", () => {
 const f=fixture();const original=f.bundle.runtimeMetadataSnapshots![0]!;
 for(const later of [
   {...original,capturedAtMs:600,textExcerpt:"",siteMetadata:undefined},
   {...original,capturedAtMs:600,url:"https://different.test/",documentIdentity:{source:"cdp_loader_id" as const,token:"later-loader"}},
   {...original,documentIdentity:{source:"cdp_loader_id" as const,token:"ambiguous-loader"}},
 ]) {
   const b=structuredClone(f.bundle);b.runtimeMetadataSnapshots!.push(later);
   assert.equal(projectCaliforniaObservedScoreBasis(b,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined);
 }
});

test("independent ordinary visits retain their separate exact identities for score availability", () => {
  for (const runtimeUrl of ["https://california-fixture.test/th/home", "https://california-fixture.test/login?state=runtime-session"]) {
    const f=fixture();
    const reportUrl=runtimeUrl.includes("login") ? "https://california-fixture.test/login?state=consent-session" : "https://california-fixture.test/th";
    f.bundle.runtimeMetadataSnapshots![0]!.url=runtimeUrl;
    f.bundle.domSnapshots=[{...f.bundle.runtimeMetadataSnapshots![0]!,url:reportUrl,documentIdentity:{source:"cdp_loader_id",token:"consent-loader"}}];
    f.bundle.scanLaneRuns![0]!.navigationAttempts=[{sequence:1,mode:"initial_https_navigation",outcome:"success",httpStatus:200,durationMs:10,effectiveUrl:f.bundle.normalizedUrl}];
    const before=JSON.stringify(f.bundle);
    const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,reportUrl,f.policyEvidence)!;
    assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10");
    assert.equal(child?.observedScoreBasis?.policyVersion,"usable_starting_page_score.v2-independent-visit");
    assert.equal(child.documentUrl,reportUrl);
    assert.equal(child.observedScoreBasis?.documentUrl,reportUrl);
    assert.equal(child.observedScoreBasis?.documentToken,"runtime-loader");
    assert.ok(!JSON.stringify(child.observedScoreBasis).includes("runtime-session"));
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:[]}).score,100);
    assert.equal(JSON.stringify(f.bundle),before);
    assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,reportUrl+"-other"),undefined);
    for (const mutate of [
      ()=>{f.bundle.scanLaneRuns![0]!.navigationAttempts=[];},
      ()=>{f.bundle.runtimeMetadataSnapshots![0]!.url="https://unrelated.test/";},
      ()=>{f.bundle.runtimeMetadataSnapshots![0]!.documentIdentity=undefined;},
      ()=>{f.bundle.runtimeMetadataSnapshots![0]!.textExcerpt="OOPS!!!\nWE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION.";},
    ]) {
      const saved=structuredClone(f.bundle);mutate();
      assert.equal(projectCaliforniaObservedScoreBasis(f.bundle,CA_FIXTURE_SOURCE,reportUrl),undefined);
      Object.assign(f.bundle,saved);
    }
  }
});


test("apex/www availability requires the original retained HTTPS recovery and both exact document identities", () => {
  const f = fixture();
  const reportUrl = "https://example.com/", runtimeUrl = "https://www.example.com/";
  f.bundle.url = reportUrl; f.bundle.normalizedUrl = reportUrl;
  f.bundle.runtimeMetadataSnapshots![0]!.url = runtimeUrl;
  f.bundle.domSnapshots = [{ ...f.bundle.runtimeMetadataSnapshots![0]!, url: reportUrl,
    documentIdentity: { source: "cdp_loader_id", token: "consent-loader" } }];
  f.bundle.scanLaneRuns![0]!.navigationAttempts = [
    { sequence: 1, mode: "initial_https_navigation", outcome: "transport_error", httpStatus: null, durationMs: 10, effectiveUrl: reportUrl },
    { sequence: 2, mode: "https_apex_www_recovery", outcome: "success", httpStatus: 200, durationMs: 10, effectiveUrl: runtimeUrl },
  ];
  const original = structuredClone(f.bundle);
  const proof = projectCaliforniaObservedScoreBasis(f.bundle, CA_FIXTURE_SOURCE, reportUrl);
  assert.equal(proof?.policyVersion, "usable_starting_page_score.v3-apex-www-recovery");
  const child = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, reportUrl, f.policyEvidence)!;
  assert.equal(deriveCaliforniaRegulatoryScore({ assessment: child, checklistRows: [], unifiedFindings: [] }).score, 100);
  const parent = deriveConsentControlAssessment({ scan: { scanId: f.bundle.scanId, finalUrl: reportUrl } });
  assert.ok(consentControlAssessmentSchema.safeParse({ ...parent, californiaPrivacyReview: child }).success);
  assert.deepEqual(f.bundle, original);
  for (const mutate of [
    () => { f.bundle.normalizedUrl = "https://unrelated.com/"; },
    () => { f.bundle.scanLaneRuns![0]!.navigationAttempts![1]!.mode = "initial_https_navigation"; },
    () => { f.bundle.scanLaneRuns![0]!.navigationAttempts![1]!.httpStatus = 403; },
    () => { f.bundle.scanLaneRuns![0]!.navigationAttempts![1]!.effectiveUrl = reportUrl; },
    () => { f.bundle.domSnapshots[0]!.documentIdentity = undefined; },
    () => { f.bundle.domSnapshots[0]!.documentIdentity!.token = "runtime-loader"; },
    () => { f.bundle.runtimeMetadataSnapshots![0]!.documentIdentity = undefined; },
    () => { f.bundle.runtimeMetadataSnapshots![0]!.textExcerpt = "OOPS!!! WE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION."; },
  ]) {
    mutate(); assert.equal(projectCaliforniaObservedScoreBasis(f.bundle, CA_FIXTURE_SOURCE, reportUrl), undefined);
    Object.assign(f.bundle, structuredClone(original));
  }
  for (const [apex, www] of [
    ["https://tenant.github.io/", "https://www.tenant.github.io/"],
    ["https://example.unknownsuffix/", "https://www.example.unknownsuffix/"],
    ["http://example.com/", "http://www.example.com/"],
    ["https://example.com:444/", "https://www.example.com:444/"],
    ["https://example.com/path", "https://www.example.com/path"],
    ["https://example.com/#section", "https://www.example.com/#section"],
    ["https://user:secret@example.com/", "https://www.example.com/"],
    ["https://127.0.0.1/", "https://www.127.0.0.1/"],
    ["https://example.com/", "https://other.example.com/"],
    ["https://example.com/?state=one", "https://www.example.com/?state=two"],
  ]) {
    Object.assign(f.bundle, structuredClone(original));
    f.bundle.url = apex!; f.bundle.normalizedUrl = apex!; f.bundle.domSnapshots[0]!.url = apex!;
    f.bundle.runtimeMetadataSnapshots![0]!.url = www!;
    f.bundle.scanLaneRuns![0]!.navigationAttempts![1]!.effectiveUrl = www!;
    assert.equal(projectCaliforniaObservedScoreBasis(f.bundle, CA_FIXTURE_SOURCE, apex!), undefined, apex);
  }
});
