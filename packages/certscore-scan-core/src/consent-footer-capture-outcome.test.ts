import assert from "node:assert/strict";
import test from "node:test";
import type {Page} from "playwright";
import {captureConsentFooterOptOutWithOutcome,footerCaptureStopped} from "./consent-footer-opt-out.js";
import {consentFooterOptOutCaptureSchema} from "@certscore/contracts";

const url="https://original.test/", identity={source:"cdp_loader_id" as const,token:"original"};
const changed={url,documentIdentity:{...identity,token:"different"}};
const original={url,documentIdentity:identity};
const snapshot={...original,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent" as const,capturedAtMs:20};
const good={coverage:"complete",limitations:[],viewport:[1200,800],inspectedControls:1,footerCount:1,candidates:[]};
type Input=Parameters<typeof captureConsentFooterOptOutWithOutcome>[0];
function input(evaluate:()=>Promise<unknown>, changes: Partial<Input> = {}): Input {
  return {page:{isClosed:()=>false,url:()=>url,mainFrame:()=>({evaluate})} as unknown as Page,
    snapshot,readBinding:()=>original,scanStartedAtMs:Date.now()-100,budgetMs:175,...changes};
}
test("footer completion, skipped work, timeout, exception and validation failures remain distinct",async()=>{
  let unexpected=0;const noRead=async()=>{unexpected++;return good;};
  for(const [reason,override] of [
    ["no_budget",{budgetMs:0}],["aborted",{signal:AbortSignal.abort()}],
    ["source_unavailable",{snapshot:{...snapshot,documentIdentity:undefined}}],
    ["page_closed",{page:{isClosed:()=>true} as Page}],
  ] as const) {
    const result=await captureConsentFooterOptOutWithOutcome(input(noRead,override));
    assert.equal(result.footerOptOutCapture?.outcome,reason);assert.equal(result.footerOptOutCapture.attempts,0);
    assert.equal(result.footerOptOutObservation,undefined);
  }
  assert.equal(unexpected,0);
  assert.equal(footerCaptureStopped(snapshot,Date.now()-100).footerOptOutCapture?.outcome,"lane_stopped");
  const timeout=await captureConsentFooterOptOutWithOutcome(input(()=>new Promise(()=>{}),{budgetMs:12}));
  assert.equal(timeout.footerOptOutCapture?.outcome,"timed_out");assert.equal(timeout.footerOptOutCapture.attempts,1);
  const invalid=await captureConsentFooterOptOutWithOutcome(input(async()=>({fake:"captured"})));
  assert.equal(invalid.footerOptOutCapture?.outcome,"invalid_packet");assert.equal(invalid.footerOptOutObservation,undefined);
  const failure=await captureConsentFooterOptOutWithOutcome(input(async()=>{throw Error("sensitive browser text");}));
  assert.equal(failure.footerOptOutCapture?.outcome,"read_failed");assert.equal(failure.footerOptOutCapture.attempts,2);
  assert.doesNotMatch(JSON.stringify(failure),/sensitive/);
});
test("one original-page retry remains bounded and yields a typed capture receipt",async()=>{
  let reads=0;
  const result=await captureConsentFooterOptOutWithOutcome(input(async()=>++reads===1?undefined:good));
  assert.equal(reads,2);assert.equal(result.footerOptOutCapture?.outcome,"captured");
  assert.equal(result.footerOptOutCapture.recovery,"same_document_retry");assert.equal(result.footerOptOutCapture.attempts,2);
  assert.equal(result.footerOptOutObservation?.documentToken,identity.token);
  assert.ok(consentFooterOptOutCaptureSchema.safeParse(result.footerOptOutCapture).success);
});
test("a stale cached loader needs exact original CDP proof on both sides of a recovered read",async()=>{
  let verifies=0, reads=0;
  const result=await captureConsentFooterOptOutWithOutcome(input(async()=>{reads++;return good;},{readBinding:()=>changed,
    verifyOpenMainFrame:async()=>{verifies++;return original;}}));
  assert.equal(reads,1);assert.equal(verifies,2);assert.equal(result.footerOptOutCapture?.recovery,"original_loader_verified");
  assert.equal(result.footerOptOutCapture.outcome,"captured");assert.equal(result.footerOptOutObservation?.documentToken,"original");
  for (const second of [changed,{url:"https://else.test/",documentIdentity:identity}]) {
    let count=0;
    const bad=await captureConsentFooterOptOutWithOutcome(input(async()=>good,{readBinding:()=>changed,
      verifyOpenMainFrame:async()=>++count===1?original:second}));
    assert.equal(bad.footerOptOutCapture?.outcome,"document_mismatch");assert.equal(bad.footerOptOutCapture.mismatch?.stage,"after_read");
    assert.equal(bad.footerOptOutObservation,undefined);
  }
  const bad=await captureConsentFooterOptOutWithOutcome(input(async()=>{throw Error("must not run")},{readBinding:()=>changed,verifyOpenMainFrame:async()=>changed}));
  assert.equal(bad.footerOptOutCapture?.attempts,0);assert.equal(bad.footerOptOutCapture.outcome,"document_mismatch");
  assert.equal(bad.footerOptOutCapture.recovery,"original_loader_not_verified");
});
