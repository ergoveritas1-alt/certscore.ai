import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalPageCaptureAssessment } from "../../lib/scans/scan-report-disposition";
import { assessBrowserStartingPage } from "./starting-page";
import type { BrowserScanArtifactRow, BrowserScanEventRow } from "./evidence-summary";

const target = "https://example.com/";
function document(statusCode?: number, url = target, extra = {}): BrowserScanEventRow {
  return { event_type: "network_request", observed_at_ms: 1, event_json: {
    eventType: "network_request", resourceType: "main_frame", hostname: new URL(url).hostname, tabId: 2,
    observedAtMs: 1, url, statusCode, ...extra,
  } };
}
function page(extra = {}): BrowserScanArtifactRow {
  return { artifact_type: "page_evidence", content_type: "application/json", artifact_json: {
    pageType: "homepage", sourceId: "BX01", sourceType: "browser_extension", capturedAtMs: 500, title: "Public shop",
    finalUrl: target, hasReadableContent: true, ...extra,
  } };
}
test("a healthy rendered home page can qualify with the current or published extension", () => {
  assert.equal(assessBrowserStartingPage(target, [document(200), document(403, target, {resourceType:"image"})], [page()]), null);
  assert.equal(assessBrowserStartingPage(target,[document(200)],[page({hasReadableContent:undefined,accessibilitySummary:{headingCount:2}, policyLinks:[{url:target+"privacy"}]})]),null);
  const finalUrl = target+"home";
  assert.equal(assessBrowserStartingPage(target,[document(301,target,{redirectUrl:finalUrl}),document(200,finalUrl)],[page({finalUrl})]),null);
});
test("the final main document governs eligibility including a blocked reload", () => {
  for(const [status,reason] of [[401,"authentication_required"],[403,"access_denied_or_forbidden_page"],[429,"rate_limited_429"],[404,"not_found_404"],[503,"server_error_5xx"]] as const) {
    const stop=assessBrowserStartingPage(target,[document(200),document(status)],[page()]);
    assert.equal(stop?.presentation.code,reason);
    assert.ok(isTerminalPageCaptureAssessment(stop?.assessment));
  }
  assert.equal(assessBrowserStartingPage(target,[document(200)],[page({challengeScreen:true})])?.presentation.code,"captcha_or_challenge");
});
test("missing, stale, empty, cross-tab or unrelated documents cannot establish a successful scan", () => {
  for(const status of [undefined,202,204,205,206,302]) {
    assert.equal(assessBrowserStartingPage(target,[document(status)],[page()])?.presentation.code,"runtime_capture_unverified");
  }
  for(const [events, artifacts] of [
    [[],[page()]],[[document(200)],[]],[[document(200)],[page({capturedAtMs:0})]],[[document(200)],[page({hasReadableContent:false})]],
    [[document(200)],[page({finalUrl:target+"different"})]],[[document(200)],[page({pageType:"privacy_policy"})]],
    [[document(302),document(200,target+"home")],[page({finalUrl:target+"home"})]],
    [[document(302,target,{redirectUrl:"https://elsewhere.test/"}),document(200,"https://elsewhere.test/")],[page({finalUrl:"https://elsewhere.test/"})]],
    [[document(302,target,{redirectUrl:target+"home"}),document(200,target+"home",{tabId:4})],[page({finalUrl:target+"home"})]],
  ] as [BrowserScanEventRow[],BrowserScanArtifactRow[]][]) {
    assert.equal(assessBrowserStartingPage(target,events,artifacts)?.presentation.code,"runtime_capture_unverified");
  }
});
