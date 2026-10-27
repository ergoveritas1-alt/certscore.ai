import assert from "node:assert/strict";
import test from "node:test";
import { classifyPrivacySurface, policySurfaceObservationSchema } from "@certscore/contracts";
import {
  assessPolicyTextQuality, assessPolicyDocumentSubstance, assessGoverningPolicyBodyEvidence,
  assessPolicyDocumentRoleForChildSelection, classifyPolicyDocumentOwnership,
  fetchedPolicyBudgetCheckpoint, processPolicyCandidateBeforeDeadline,
  policyRenderedRecoveryDeadline, fetchRenderedPolicyDocumentText, policyInputAfterHomepageRedirect,
  type PolicySurfaceCandidate, type PolicySurfaceScannerInput,
} from "./scanners/policy-surface-scanner.js";
import retained from "./test-fixtures/policy-recovery-retained.json";

// Only the fixture's explicitly retained fields are historical evidence.
// IDs/confidence and all mocked timing/renderer behavior below are reconstructed.
function candidate(site: string): PolicySurfaceCandidate {
  const row = retained.cases.find(row => row.site === site)!;
  const summary = row.candidateSummary;
  const classification = classifyPrivacySurface({linkText: summary.linkText, url: summary.normalizedUrl});
  return { candidateId: "reconstructed", url: summary.normalizedUrl, normalizedUrl: summary.normalizedUrl,
    linkText: summary.linkText, linkSourcePageUrl: row.observation.linkSourcePageUrl ?? undefined,
    domLocation: "footer", sameOrigin: false, fetchable: true, clickable: true, observationOnly: false,
    mayLeadToConsentControls: false, deterministicSurfaceType: "privacy_policy", discoveryMethod: "footer_link",
    deterministicScore: classification.confidence, deterministicKeywordMatches: [],
    deterministicClassifierProvenance: "privacy_surface_classifier.v1", deterministicClassifierReasonCodes: classification.reasonCodes,
    deterministicMatchStrength: classification.matchStrength };
}
function checkpoint() {
  const row = retained.cases[0]!;
  const facts = row.successfulFetch!;
  return fetchedPolicyBudgetCheckpoint(candidate(row.site), {ok:true, status:facts.httpStatus, text:"", attempts: facts.attempts as never})!;
}
function processInput(signal?: AbortSignal): Parameters<typeof processPolicyCandidateBeforeDeadline>[0] {
  return { input: {url:"https://tujugada.com.ar/", normalizedUrl:"https://tujugada.com.ar/", scanStartedAtMs:Date.now(),
    internalBudgetMs:15_000, absoluteDeadlineAtMs:Date.now()+50, signal, artifactWriter:{} as never},
    candidate:candidate("tujugada.com.ar"), candidateIndex:0, moduleStartedAtMs:Date.now(),
    timingBreakdown:[], policySurfaceTextArtifactBudget:{remainingChars:1_000_000}, fetchCaches:{} as never };
}

test("Tujugada retained HTTP success stays fetched but unevaluated, with no body credit", () => {
  const result = checkpoint();
  assert.equal(result.observation.httpStatus,200);
  assert.equal(result.observation.documentFetchState,"fetched");
  assert.equal(result.observation.documentEvaluationState,"not_attempted");
  assert.equal(result.observation.status,"failed");
  assert.equal(result.observation.fetchFailureReason,"scan_budget_exhausted");
  assert.equal(result.observation.linkSourcePageUrl,"https://tujugada.com.ar/");
  assert.equal(result.observation.finalUrl,"https://tujugada.com.ar/terminos-privacidad.asp");
  assert.equal(result.observation.targetRelationship,undefined);
  assert.equal(result.observation.textExcerpt,undefined);
  assert.deepEqual(result.artifactRefs,[]);
  assert.equal(policySurfaceObservationSchema.safeParse(result.observation).success,true);
});

test("failed, observation-only and nonfetchable inputs cannot create a fetched checkpoint", () => {
  const c=candidate("tujugada.com.ar");
  assert.equal(fetchedPolicyBudgetCheckpoint(c,{ok:false,text:"",status:403}),undefined);
  for (const change of [{fetchable:false},{observationOnly:true}]) {
    assert.equal(fetchedPolicyBudgetCheckpoint({...c,...change},{ok:true,text:"",status:200}),undefined);
  }
});

test("candidate timeout returns transport checkpoint; no completed evaluation is invented", async () => {
  const result=await processPolicyCandidateBeforeDeadline(processInput(), async input => {
    input.processingProgress!.documentFetched=true;
    input.processingProgress!.fetchedCheckpoint=checkpoint();
    return new Promise(resolve=>input.input.signal!.addEventListener("abort",()=>resolve(checkpoint()),{once:true}));
  });
  assert.deepEqual(result,checkpoint());
});

test("parent cancellation during analysis preserves the already fetched checkpoint", async () => {
  const parent=new AbortController();
  const result=await processPolicyCandidateBeforeDeadline(processInput(parent.signal), async input => {
    input.processingProgress!.documentFetched=true;
    input.processingProgress!.fetchedCheckpoint=checkpoint();
    parent.abort();
    throw new Error("analysis aborted");
  });
  assert.equal(result.observation.documentFetchState,"fetched");
  assert.equal(result.observation.documentEvaluationState,"not_attempted");
});

test("never-started and unsuccessful candidates still time out without fetched credit", async () => {
  const parent=new AbortController();parent.abort();
  const result=await processPolicyCandidateBeforeDeadline(processInput(parent.signal),async()=>{throw new Error("must not execute");});
  assert.equal(result.observation.documentFetchState,"skipped_budget");
  const failed=await processPolicyCandidateBeforeDeadline(processInput(),async input=>new Promise(resolve=>{
    input.input.signal!.addEventListener("abort",()=>resolve(checkpoint()),{once:true});
  }));
  assert.equal(failed.observation.documentFetchState,"skipped_budget");
});

test("render recovery clamps existing timeout to lane publication reserve and candidate cutoff", () => {
  assert.equal(policyRenderedRecoveryDeadline({nowMs:1000,timeoutMs:6000}),7000);
  assert.equal(policyRenderedRecoveryDeadline({nowMs:1000,timeoutMs:6000,absoluteDeadlineAtMs:5000}),3500);
  assert.equal(policyRenderedRecoveryDeadline({nowMs:1000,timeoutMs:6000,absoluteDeadlineAtMs:5000,candidateRecoveryDeadlineAtMs:2500}),2500);
  assert.equal(policyRenderedRecoveryDeadline({nowMs:1000,timeoutMs:6000,hardDeadlineAtMs:2000}),2000);
});

test("exhausted recovery reserve starts no browser or retry", async () => {
  const result=await fetchRenderedPolicyDocumentText({input:{absoluteDeadlineAtMs:Date.now()+1000} as PolicySurfaceScannerInput,
    url:"https://example.test/privacy",timeoutMs:6000,
    browserRuntime:{getBrowser:async()=>{throw new Error("browser must not start");},close:async()=>{}}});
  assert.equal(result.ok,false);
  assert.equal(result.attempts?.[0]?.outcome,"timeout");
});

test("YY exact retained excerpt recognizes reviewed title variants without claiming full recovery", () => {
  const row=retained.cases.find(row=>row.site==="yy.com")!;
  assert.equal(row.textCoverage,"excerpt_only");assert.equal(row.text!.length,6000);
  assert.equal(assessPolicyTextQuality(row.text!).usable,true);
  for(const label of ["隐私权保护政策","隐私协议"]) {
    assert.equal(classifyPrivacySurface({linkText:label}).matchStrength,"direct");
  }
  const body=assessGoverningPolicyBodyEvidence({candidate:candidate(row.site), text:row.text!,title:row.observation.title!,
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text:row.text!}),documentTextChars:6000,
    documentTextCoverageStatus:"partial",targetRelationship:"target_controller",evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
  assert.notEqual(body.state,"substantive");
});

test("YY reconstructed complete-body case retains supplemental links without becoming an index", () => {
  const row=retained.cases.find(row=>row.site==="yy.com")!, text=row.text!;
  const c=candidate(row.site);
  // Counterfactual complete source made from the retained excerpt. Not a recovered YY policy.
  const body=assessGoverningPolicyBodyEvidence({candidate:c,text,title:row.observation.title!,
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text}),documentTextChars:text.length,
    documentTextCoverageStatus:"complete",targetRelationship:"target_controller",evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
  assert.equal(body.state,"substantive");
  const children=["basic-func-privacy","child-privacy"].map(path=>({...c,normalizedUrl:`https://www.yy.com/web/duty/${path}.html`}));
  assert.equal(assessPolicyDocumentRoleForChildSelection(c,{fetchCandidates:[],observedChildCandidates:children},{governingPolicyBodyAssessment:body}).role,"policy_document");
  assert.equal(assessPolicyDocumentRoleForChildSelection(c,{fetchCandidates:[],observedChildCandidates:children}).role,"policy_index");
});

test("Chinese footer-only privacy mentions, code and challenge remain unusable", () => {
  assert.equal(assessPolicyTextQuality("今天我们介绍旅游景点和商品，这是一个普通的商店页面。".repeat(45)+"隐私协议").usable,false);
  assert.equal(assessPolicyTextQuality("隐私协议 SPDX-License-Identifier const config = {};").usable,false);
  assert.equal(assessPolicyTextQuality("隐私协议 Client challenge. Please check your connection. captcha").usable,false);
});

test("Radcom static routing never changes the original ownership target or rendered link source", () => {
  const row=retained.cases.find(row=>row.site==="radcom.hosting")!;
  const input=policyInputAfterHomepageRedirect({url:row.originalTarget,normalizedUrl:row.originalTarget},row.effectiveStaticTarget);
  assert.equal(input.url,row.originalTarget);assert.equal(input.normalizedUrl,"http://dnslake.com/");
  const c=candidate(row.site);
  assert.equal(c.linkSourcePageUrl,"https://www.radcom.co/");
  const ownership=classifyPolicyDocumentOwnership({targetUrl:input.url,documentUrl:row.observation.finalUrl!,
    documentTitle:row.observation.title!,text:row.text!,directlyLinkedFromScannedPage:true,linkSourcePageUrl:c.linkSourcePageUrl});
  assert.equal(ownership.targetRelationship,"unknown");
  const body=assessGoverningPolicyBodyEvidence({candidate:c,text:row.text!,title:row.observation.title!,
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text:row.text!}),documentTextChars:row.text!.length,
    documentTextCoverageStatus:"complete",targetRelationship:ownership.targetRelationship,evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
  assert.equal(body.state,"insufficient");
});

test("redirected third-party links cannot supply direct-target binding; canonical same-site ownership survives", () => {
  const context={targetUrl:"https://example.com/",documentUrl:"https://notices.test/privacy?brand=example",text:"Privacy choices",directlyLinkedFromScannedPage:true};
  assert.equal(classifyPolicyDocumentOwnership({...context,linkSourcePageUrl:"https://unrelated.test/"}).targetRelationship,"unknown");
  assert.equal(classifyPolicyDocumentOwnership({...context,linkSourcePageUrl:"https://www.example.com/"}).targetRelationship,"first_party_brand");
  const routed=policyInputAfterHomepageRedirect({url:"https://example.com/",normalizedUrl:"https://example.com/"},"https://www.example.com/");
  assert.equal(classifyPolicyDocumentOwnership({targetUrl:routed.url,documentUrl:"https://www.example.com/privacy",text:"Privacy"}).targetRelationship,"target_controller");
});


test("render setup, navigation and readiness share one deadline without a real browser", async t => {
  let now=1000;
  t.mock.method(Date,"now",()=>now);
  const waits: Array<[string,number]> = [];
  let captures=0,closed=0;
  const page={
    goto:async (_url:string,options:{timeout:number})=>{waits.push(["navigation",options.timeout]);now+=900;return {};},
    waitForLoadState:async (_state:string,options:{timeout:number})=>{waits.push(["network",options.timeout]);now+=options.timeout;},
    waitForFunction:async (_fn:unknown,_arg:unknown,options:{timeout:number})=>{waits.push(["readiness",options.timeout]);now+=options.timeout;},
    waitForTimeout:async()=>{throw new Error("must stop before another wait");},
    content:async()=>{captures++;return "";},
  };
  const context={route:async()=>{},newPage:async()=>page,close:async()=>{closed++;}};
  const result=await fetchRenderedPolicyDocumentText({
    input:{} as PolicySurfaceScannerInput,url:"https://example.test/privacy",timeoutMs:3000,
    browserRuntime:{getBrowser:async()=>{now+=800;return {newContext:async()=>context} as never;},close:async()=>{}},
  });
  assert.equal(result.ok,false);
  assert.equal(result.attempts?.[0]?.failureStage,"document_readiness");
  assert.equal(result.attempts?.[0]?.outcome,"timeout");
  assert.deepEqual(waits,[["navigation",2200],["network",1000],["readiness",300]]);
  assert.equal(now,4000);assert.equal(captures,0);assert.ok(closed>=1);
});

test("Chinese recognition cannot override vendor ownership or incomplete body eligibility", () => {
  const row=retained.cases.find(row=>row.site==="yy.com")!;
  for(const targetRelationship of ["service_provider","unrelated","unknown"] as const) {
    const body=assessGoverningPolicyBodyEvidence({candidate:candidate(row.site),text:row.text!,title:row.observation.title!,
      documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text:row.text!}),documentTextChars:6000,
      documentTextCoverageStatus:"complete",targetRelationship,evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
    assert.notEqual(body.state,"substantive");
  }
});


test("completed candidate evaluation wins over an earlier transport checkpoint", async () => {
  const result=await processPolicyCandidateBeforeDeadline(processInput(),async input=>{
    input.processingProgress!.documentFetched=true;
    input.processingProgress!.fetchedCheckpoint=checkpoint();
    return {...checkpoint(),observation:{...checkpoint().observation,
      documentEvaluationState:"insufficient",fetchFailureReason:"insufficient_policy_text"}};
  });
  assert.equal(result.observation.documentEvaluationState,"insufficient");
  assert.equal(result.observation.fetchFailureReason,"insufficient_policy_text");
});

test("borrowed recovery page closes on expiry without closing its shared context or retrying", async () => {
  let finishLookup: (value:boolean)=>void = ()=>{};
  let pageCloses=0,contextCloses=0,navigations=0;
  const locator={count:async()=>1,getAttribute:async()=>"/privacy",evaluate:()=>new Promise<boolean>(resolve=>{finishLookup=resolve;})};
  const page={isClosed:()=>false,url:()=>"https://example.test/",getByRole:()=>locator,locator:()=>locator,
    goto:async()=>{navigations++;throw new Error("must not navigate");},
    close:async()=>{pageCloses++;finishLookup(false);},context:()=>({close:async()=>{contextCloses++;}})};
  const result=await fetchRenderedPolicyDocumentText({
    input:{renderedRecoveryPage:page} as unknown as PolicySurfaceScannerInput,
    linkContext:{href:"/privacy",linkText:"Privacy Policy",pageUrl:"https://example.test/"},
    url:"https://example.test/privacy",timeoutMs:30,
    browserRuntime:{getBrowser:async()=>({}) as never,close:async()=>{}},
  });
  assert.equal(result.ok,false);assert.equal(result.attempts?.[0]?.outcome,"timeout");
  assert.equal(pageCloses,1);assert.equal(contextCloses,0);assert.equal(navigations,0);
});

test("observed link lookup consumes navigation allowance without a new one-second minimum", async t => {
  let now=1000;
  t.mock.method(Date,"now",()=>now);
  const clickTimeouts:number[]=[];
  const locator={count:async()=>1,getAttribute:async()=>{now+=200;return "/privacy";},
    evaluate:async()=>{now+=50;return true;},click:async(options:{timeout:number})=>{clickTimeouts.push(options.timeout);}};
  const page={isClosed:()=>false,url:()=>"https://example.test/",getByRole:()=>locator,locator:()=>locator,
    waitForNavigation:async(options:{timeout:number})=>{clickTimeouts.push(options.timeout);return null;},
    waitForLoadState:async(_state:string,options:{timeout:number})=>{now+=options.timeout;},
    waitForFunction:async()=>{throw new Error("expired");},close:async()=>{}};
  const result=await fetchRenderedPolicyDocumentText({
    input:{renderedRecoveryPage:page} as unknown as PolicySurfaceScannerInput,
    linkContext:{href:"/privacy",linkText:"Privacy Policy",pageUrl:"https://example.test/"},
    url:"https://example.test/privacy",timeoutMs:300,
    browserRuntime:{getBrowser:async()=>({}) as never,close:async()=>{}},
  });
  assert.equal(result.ok,false);assert.deepEqual(clickTimeouts,[50,50]);assert.equal(now,1300);
});
