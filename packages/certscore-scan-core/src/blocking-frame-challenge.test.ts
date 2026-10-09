import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { collectConsentGeometryPageAccess, isRetainedBlockingFrameChallengeBound } from "./consent-geometry-access.js";
import { buildScanNoGoAssessment } from "./index.js";
import { domSnapshotArtifactSchema, type ScreenshotArtifact } from "@certscore/contracts";

const identity = { source: "cdp_loader_id" as const, token: "retained-loader" };
const screenshot: ScreenshotArtifact = { artifactId: "screenshot_pre_consent_settled", path: "settled.png", capturedAtMs: 100,
  url: "https://challenge-fixture.test/", documentIdentity: identity, captureMethod: "primary_viewport_fallback", pagePhase: "network_idle", consentStateAtTime: "pre_consent" };
const snapshot = domSnapshotArtifactSchema.parse({ artifactId: "dom_blocking_frame_challenge", path: "geometry.json", capturedAtMs: 120,
  url: screenshot.url, documentIdentity: identity, textExcerpt: "Quick verification. Press & hold to confirm you're a human (and not a bot).",
  pagePhase: "network_idle", consentStateAtTime: "pre_consent", blockingFrameChallenge: { policyVersion: "blocking_frame_challenge.v1",
    frameUrl: "https://verification-fixture.test/", viewportCoverage: 1, hitTestSamples: 5, hitTestMatches: 5, screenshotArtifactRef: screenshot.path } });
function assessment(retained = snapshot, image = screenshot) {
  return buildScanNoGoAssessment({ consentUiObservations: [], screenshots: [image], domSnapshots: [
    { ...snapshot, artifactId: "dom_text_pre_consent", blockingFrameChallenge: undefined, textExcerpt: "A healthy underlying store. Browse products and services. ".repeat(30) }, retained],
    modulesRun: [], networkEvents: [], networkResponseEvents: [], policySurfaceObservations: [] });
}
test("provisional challenge metadata requires the original matching geometry file contents", () => {
  const artifact = { pageUrl: snapshot.url, documentIdentity: identity, access: { blockingFrameChallenge: {
    ...snapshot.blockingFrameChallenge, textExcerpt: snapshot.textExcerpt } } };
  assert.equal(isRetainedBlockingFrameChallengeBound(snapshot, artifact), true);
  for (const missing of [null, {}, [], { ...artifact, access: {} }, { ...artifact, pageUrl: "https://another.test/" },
    { ...artifact, documentIdentity: { ...identity, token: "new-loader" } },
    { ...artifact, access: { blockingFrameChallenge: { ...artifact.access.blockingFrameChallenge, hitTestMatches: 0 } } },
    { ...artifact, access: { blockingFrameChallenge: { ...artifact.access.blockingFrameChallenge, textExcerpt: "different" } } }]) {
    assert.equal(isRetainedBlockingFrameChallengeBound(snapshot, missing), false);
  }
});
test("document-bound viewport-blocking challenge overrides healthy underlying DOM only with complete retained proof", () => {
  const result = assessment();
  assert.equal(result?.scanNoGoAssessment.decision, "no_go");
  assert.ok(result?.scanNoGoAssessment.reasonCodes.includes("captcha_or_challenge"));
  assert.ok(result?.scanNoGoAssessment.corroboratorCodes.includes("viewport_blocking_frame_challenge_observed"));
  const changes: Array<[string, (row: typeof snapshot) => void]> = [
    ["small widget", row => { row.blockingFrameChallenge!.viewportCoverage = 0.1; }],
    ["occluded iframe", row => { row.blockingFrameChallenge!.hitTestMatches = 2; }],
    ["incidental CAPTCHA attribution", row => { row.textExcerpt = "Protected by reCAPTCHA. Privacy and terms."; }],
    ["missing loader", row => { row.documentIdentity = undefined; }],
    ["different loader", row => { row.documentIdentity!.token = "different"; }],
    ["different document URL", row => { row.url += "next"; }],
    ["different image", row => { row.blockingFrameChallenge!.screenshotArtifactRef = "other.png"; }],
    ["stale proof", row => { row.capturedAtMs = 3000; }],
    ["post-consent proof", row => { row.consentStateAtTime = "post_accept"; }],
  ];
  for (const [reason, change] of changes) {
    const row = structuredClone(snapshot); change(row);
    assert.notEqual(assessment(row)?.scanNoGoAssessment.decision, "no_go", reason);
  }
  assert.notEqual(assessment(snapshot, { ...screenshot, captureMethod: "primary_placeholder" })?.scanNoGoAssessment.decision, "no_go");
  assert.notEqual(assessment(snapshot, { ...screenshot, retentionStatus: "withheld" })?.scanNoGoAssessment.decision, "no_go");
  const superseded = buildScanNoGoAssessment({ consentUiObservations: [], screenshots: [screenshot,
    { ...screenshot, path: "later.png", capturedAtMs: snapshot.capturedAtMs + 1 }], domSnapshots: [snapshot],
    modulesRun: [], networkEvents: [], networkResponseEvents: [], policySurfaceObservations: [] });
  assert.notEqual(superseded?.scanNoGoAssessment.decision, "no_go", "later same-document imagery requires fresh challenge proof");
});

test("existing frame reads distinguish a full-page human challenge from small, hidden, covered and ambiguous widgets", { timeout: 20_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: new URL(route.request().url()).hostname === "verification-fixture.test"
      ? "<!doctype html><html><body>Unrelated account visitor@example.test, identifier abcdef01234567890123456789. Quick verification. Press &amp; hold to confirm you're a human (and not a bot).</body></html>"
      : "<!doctype html><html><body><main>Healthy public store and product information.</main><iframe src='https://verification-fixture.test/?token=sensitive-fixture-token#visitor' style='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:100'></iframe></body></html>" }));
    await page.goto(screenshot.url);
    const capture = () => collectConsentGeometryPageAccess(page, 200, { frameTextTimeoutMs: 500 });
    const first = await capture();
    assert.equal(first.blockingFrameChallenge?.hitTestMatches, 5, JSON.stringify(first));
    assert.equal(first.status, "rate_limited_or_security_challenge");
    assert.equal(first.blockingFrameChallenge?.textExcerpt, "Press & hold to confirm you're a human");
    assert.doesNotMatch(first.blockingFrameChallenge!.textExcerpt, /visitor|identifier|abcdef/);
    assert.equal(first.blockingFrameChallenge!.frameUrl, "https://verification-fixture.test/");
    await page.locator("iframe").evaluate(element => { (element as HTMLElement).style.width = "300px"; (element as HTMLElement).style.height = "100px"; });
    const widget = await capture();
    assert.equal(widget.blockingFrameChallenge, undefined);
    assert.equal(widget.status, "loaded", "an embedded widget must not classify the healthy parent as blocked");
    await page.locator("iframe").evaluate(element => { element.setAttribute("style", "position:fixed;inset:0;width:100vw;height:100vh;opacity:0"); });
    assert.equal((await capture()).blockingFrameChallenge, undefined);
    await page.locator("iframe").evaluate(element => { element.setAttribute("style", "position:fixed;inset:0;width:100vw;height:100vh"); });
    await page.evaluate(() => { document.body.style.opacity = "0.97"; document.documentElement.style.opacity = "0.97"; });
    assert.equal((await capture()).blockingFrameChallenge, undefined, "composed ancestor opacity must remain visible");
    await page.evaluate(() => { document.body.style.opacity = "1"; document.documentElement.style.opacity = "1"; });
    await page.evaluate(() => { const cover = document.createElement("div"); cover.id = "cover"; cover.style.cssText = "position:fixed;inset:0;background:white;z-index:999"; document.body.append(cover); });
    assert.equal((await capture()).blockingFrameChallenge, undefined);
    await page.locator("#cover").evaluate(element => element.remove());
    await page.locator("iframe").evaluate(element => { const clone = element.cloneNode(true); document.body.append(clone); });
    assert.equal((await capture()).blockingFrameChallenge, undefined, "same-URL duplicate frame readback cannot be uniquely bound");
  } finally { await browser.close(); }
});

test("local scanner retains blocking-frame proof and publishes a canonical no-go despite healthy parent text", { timeout: 30_000 }, async () => {
  const { createServer } = await import("node:http");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { runScan } = await import("./index.js");
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(request.url === "/frame"
      ? "<!doctype html><html><body>Quick verification. Press &amp; hold to confirm you're a human (and not a bot).</body></html>"
      : `<!doctype html><html><body><main>${"Healthy public store and product information. Browse our products and services. ".repeat(30)}</main><iframe src='/frame' style='position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:100'></iframe></body></html>`);
  });
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-blocking-challenge-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const bundle = await runScan({ url: `http://127.0.0.1:${address.port}/`, profile: "standard", outDir: directory,
      evidenceLane: "consent_proof", captureReplay: false, preConsentScreenshotMode: "always", preConsentModuleDeadlineMs: 15000 });
    assert.equal(bundle.scanNoGoAssessment?.decision, "no_go");
    assert.ok(bundle.scanNoGoAssessment?.corroboratorCodes.includes("viewport_blocking_frame_challenge_observed"));
    assert.ok(bundle.domSnapshots.some(row => row.blockingFrameChallenge?.hitTestMatches === 5));
    const retained = bundle.domSnapshots.find(row => row.blockingFrameChallenge)!;
    const geometry = JSON.parse(await readFile(retained.path, "utf8"));
    assert.equal(geometry.access.blockingFrameChallenge.hitTestMatches, 5);
    assert.equal(geometry.access.blockingFrameChallenge.textExcerpt, retained.textExcerpt);
    assert.ok((await readFile(retained.blockingFrameChallenge!.screenshotArtifactRef)).byteLength > 0);
    assert.equal(bundle.scanEvidenceLaneAssessment?.lanes.consent, "not_testable");
    assert.equal(bundle.runtimeCoverage?.coverageStatus, "limited_none");
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
