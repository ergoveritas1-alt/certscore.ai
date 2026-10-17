import assert from "node:assert/strict";
import test from "node:test";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
import { consentUiObservationSchema, cmpRuntimeObservationSchema, type NetworkEvent } from "@certscore/contracts";
import { CMP_INITIALIZATION_SETTLE_POLICY, createCmpInitializationTracker, isRegisteredCmpInitializationRequest } from "./cmp-initialization-settle";

const pageUrl = "https://example.test/";
const sdkUrl = "https://cdn.cookielaw.org/scripttemplates/202509.1.0/otBannerSdk.js";
function request(id = "sdk", overrides: Partial<NetworkEvent> = {}): NetworkEvent {
  return { ...gpcRuntimeFixture({ enabled: false }).networkEvents[0]!, eventId: `net_${id}`, requestId: id,
    documentUrl: pageUrl, requestUrl: sdkUrl, url: sdkUrl, resourceType: "script", method: "GET", isMainFrame: true, ...overrides };
}
function setup() {
  let binding = { url: pageUrl, token: "loader" };
  const controller = new AbortController();
  const tracker = createCmpInitializationTracker({ readBinding: () => binding, isCurrent: () => true, signal: controller.signal });
  return { tracker, controller, drift: (notify = true) => { binding = { ...binding, token: "changed" }; if (notify) tracker.notifyBindingChanged(); } };
}

test("only registered main-document initialization assets can extend consent settling", () => {
  assert.equal(CMP_INITIALIZATION_SETTLE_POLICY.ownerApprovedMaximumWaitMs, 4000);
  assert.equal(CMP_INITIALIZATION_SETTLE_POLICY.maxWaitMs, 2500);
  assert.equal(CMP_INITIALIZATION_SETTLE_POLICY.quietMs, 250);
  assert.equal(isRegisteredCmpInitializationRequest(request()), true);
  for (const path of ["/scripttemplates/otSDKStub.js", "/scripttemplates/new/scripttemplates/202509.1.0/otBannerSdk.js", "/scripttemplates/old/scripttemplates/5.11.0/otBannerSdk.js"]) {
    assert.equal(isRegisteredCmpInitializationRequest(request("variant", { requestUrl: `https://cdn.cookielaw.org${path}` })), true);
  }
  for (const overrides of [
    { requestUrl: sdkUrl.replace("cdn.cookielaw.org", "cdn.cookielaw.org.evil.test") },
    { requestUrl: sdkUrl.replace("https:", "http:") }, { requestUrl: sdkUrl + "#fragment" },
    { requestUrl: "https://cdn.cookielaw.org/metrics/ping" }, { method: "POST" },
    { isMainFrame: false }, { resourceType: "image" },
  ]) assert.equal(isRegisteredCmpInitializationRequest(request("bad", overrides)), false, JSON.stringify(overrides));
});

test("one wait settles an existing dependency chain and uses no network or browser API", async () => {
  const { tracker } = setup();
  assert.deepEqual(await tracker.waitForReady(Date.now() + 100), { outcome: "not_needed", durationMs: 0 });
  tracker.recordRequest(request());
  const wait = tracker.waitForReady(Date.now() + 1200);
  tracker.recordResponse("sdk", 200);
  tracker.finish("sdk", "completed");
  await new Promise(resolve => setTimeout(resolve, 60));
  tracker.recordRequest(request("config", { requestUrl: "https://cdn.cookielaw.org/consent/019a50ab-5375-7ab0-af84-00b00439ad95/en.json", resourceType: "fetch" }));
  tracker.finish("config", "completed");
  const result = await wait;
  assert.equal(result.outcome, "settled"); assert.ok(result.durationMs >= 300 && result.durationMs < 1200);
  assert.equal((await tracker.waitForReady(Date.now() + 100)).outcome, "not_needed", "No second allowance");
  assert.equal(tracker.snapshot().completed, 2); tracker.close();
});

test("unresolved loads respect a shorter parent/hard-cap deadline and cannot claim a quiet window", async () => {
  const { tracker } = setup(); tracker.recordRequest(request());
  const wait = tracker.waitForReady(Date.now() + 40);
  tracker.finish("sdk", "completed");
  const result = await wait;
  assert.equal(result.outcome, "budget_exhausted"); assert.ok(result.durationMs < 250);
  tracker.recordRequest(request("late"));
  assert.equal((await tracker.waitForReady(Date.now() + 100)).durationMs, 0); tracker.close();
});

test("abort, document drift, closure and bounded overflow stop the wait without producing evidence", async () => {
  for (const kind of ["abort", "drift", "close", "overflow"]) {
    const { tracker, controller, drift } = setup(); tracker.recordRequest(request());
    const wait = tracker.waitForReady(Date.now() + 1000);
    if (kind === "abort") controller.abort();
    if (kind === "drift") drift();
    if (kind === "close") tracker.close();
    if (kind === "overflow") for (let i = 0; i < 130; i++) tracker.recordRequest(request(`extra-${i}`));
    assert.equal((await wait).outcome, { abort: "cancelled", drift: "document_changed", close: "closed", overflow: "overflow" }[kind]);
    assert.ok(tracker.snapshot().matched <= 128); tracker.close();
  }
});

test("failed, irrelevant and foreign-document requests do not start a wait", async () => {
  const { tracker } = setup();
  tracker.recordRequest(request("foreign", { documentUrl: "https://other.test/" }));
  tracker.recordRequest(request("metrics", { requestUrl: "https://cdn.cookielaw.org/metrics/ping" }));
  assert.equal((await tracker.waitForReady(Date.now() + 100)).outcome, "not_needed");
  tracker.recordRequest(request()); tracker.recordResponse("sdk", 403);
  assert.equal((await tracker.waitForReady(Date.now() + 100)).outcome, "not_needed");
  assert.equal(tracker.snapshot().failed, 1); tracker.close();
});

test("the real adaptive gate settles one late SDK and recovers passive declarations without opening preferences", { timeout: 10000 }, async () => {
  const { chromium } = await import("playwright");
  const { detectConsentUiWithAdaptiveCmpGates } = await import("./scanners/pre-consent-runtime-scanner");
  const { captureCmpBasicEvidence } = await import("./cmp-basic-capture");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route(pageUrl, route => route.fulfill({ contentType: "text/html", body: "<main>Public fixture content</main><script>window.actions=0;document.addEventListener('click',()=>window.actions++);</script>" }));
    await page.route(sdkUrl, async route => {
      await new Promise(resolve => setTimeout(resolve, 450));
      await route.fulfill({ contentType: "application/javascript", body: `window.OneTrust=new class {GetDomainData(){return {Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:true}]}]}}}();` });
    });
    await page.goto(pageUrl);
    const tracker = createCmpInitializationTracker({ readBinding: () => ({ url: page.url(), token: "loader" }), isCurrent: () => true });
    let sdkRequests = 0;
    let requested!: () => void;
    const requestStarted = new Promise<void>(resolve => { requested = resolve; });
    page.on("request", req => { if (req.url() === sdkUrl) { sdkRequests++; tracker.recordRequest(request()); requested(); } });
    page.on("requestfinished", req => { if (req.url() === sdkUrl) tracker.finish("sdk", "completed"); });
    page.on("requestfailed", req => { if (req.url() === sdkUrl) tracker.finish("sdk", "failed"); });
    await page.evaluate(url => { const script = document.createElement("script"); script.src = url; document.head.append(script); }, sdkUrl);
    await requestStarted;
    const timingBreakdown: any[] = [];
    await detectConsentUiWithAdaptiveCmpGates({
      page, navigationStartedAtMs: Date.now() - 20000, scanStartedAtMs: Date.now() - 20000,
      deadlineAtMs: Date.now() + 2000, stablePartialProofPacket: false,
      settlePendingCmpInitialization: deadline => tracker.waitForReady(deadline), timingBreakdown,
      initialObservation: consentUiObservationSchema.parse({ observationId: "empty", observedAtMs: 0, likelyPresent: false, basis: [], controls: [], confidence: 0.8 }),
      cmpRuntimeObservations: [cmpRuntimeObservationSchema.parse({ observationId: "cmp", observedAtMs: 0, sourceScanner: "pre_consent_runtime", scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", entity: "OneTrust", vendor: "OneTrust", confidence: 0.95, signals: [{ signalType: "script_url", matchedField: "hostname", matchedValueRedacted: "cdn.cookielaw.org", confidence: 0.95 }] })],
    });
    const settled = timingBreakdown.find(row => row.label === "conditional CMP initialization settle");
    assert.equal(settled?.outcome, "completed", JSON.stringify(timingBreakdown));
    const basic = await captureCmpBasicEvidence({ page, scanId: "late-sdk", targetUrl: pageUrl, scanStartedAtMs: Date.now(),
      readBinding: () => ({ url: page.url(), token: "loader" }), isCurrent: () => true });
    assert.deepEqual(basic?.declarations.map(row => row.name), ["_ga"]);
    assert.deepEqual(basic?.controls, [], "Loaded configuration is not a visible choice");
    assert.equal(sdkRequests, 1); assert.equal(await page.evaluate(() => (window as any).actions), 0);
    tracker.close();
  } finally { await browser.close(); }
});


test("a pending SDK respects the conservative cost cap within the approved four-second allowance", { timeout: 6000 }, async () => {
  const { tracker } = setup(); tracker.recordRequest(request());
  const result = await tracker.waitForReady(Date.now() + 60000);
  assert.equal(result.outcome, "budget_exhausted");
  assert.ok(result.durationMs >= 2400 && result.durationMs < 3000, String(result.durationMs));
  assert.equal((await tracker.waitForReady(Date.now() + 60000)).durationMs, 0);
  tracker.close();
});


test("quiet completion rechecks the bound document even without a navigation notification", async () => {
  const { tracker, drift } = setup(); tracker.recordRequest(request());
  const wait = tracker.waitForReady(Date.now() + 1000);
  tracker.finish("sdk", "completed"); drift(false);
  assert.equal((await wait).outcome, "document_changed"); tracker.close();
});
