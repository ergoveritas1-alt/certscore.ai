import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { ScreenshotArtifact } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { isPairedConsentGeometryReady } from "./consent-paired-geometry-readiness.js";
import { consentUiObservationFromConfirmedGeometryControls, consentGateStablePartialDisposition, shouldExitStablePartialConsentGate, preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

test("paired readiness is timing-only and rejects missing, changed and incomplete proof", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><section id="truste-consent-track" role="dialog" aria-label="Cookie choices" style="position:fixed;bottom:0;background:white;padding:20px">
      <p>We use optional cookies. Choose your preferences.</p><button>Accept all</button><button>Untranslated decision</button></section>` }));
    await page.goto("https://geometry-fixture.test/");
    const cdp = await page.context().newCDPSession(page);
    const tree = await cdp.send("Page.getFrameTree");
    const documentIdentity = { source: "cdp_loader_id" as const, token: tree.frameTree.frame.loaderId };
    assert.ok(documentIdentity.token);
    await page.screenshot();
    const geometry = await captureConsentControlGeometry(page, { documentIdentity, screenshotArtifactRef: "settled.png" });
    const observation = consentUiObservationFromConfirmedGeometryControls({ geometry, scanStartedAtMs: Date.now() - 1000 })!;
    assert.equal(observation.inventoryOutcome, "partial");
    observation.captureDiagnostics!.completedChannels.push("dom_inventory");
    const screenshot: ScreenshotArtifact = { artifactId: "screenshot_pre_consent_settled", path: "settled.png", capturedAtMs: 0,
      url: page.url(), documentIdentity, captureMethod: "primary_viewport_fallback", pagePhase: "network_idle", consentStateAtTime: "pre_consent" };
    const input = { geometry, observation, screenshots: [screenshot], pageUrl: page.url(), documentIdentity, framesStable: true };
    const original = structuredClone(input);
    assert.equal(isPairedConsentGeometryReady(input), true);
    assert.deepEqual(input, original, "readiness cannot mutate unknown controls or image safety");
    assert.equal(observation.rejectControlObserved, false);
    assert.ok(observation.basis.includes("unresolved_visible_consent_decision"));
    const displayWithheld = { ...input, screenshots: [{ ...screenshot, retentionStatus: "available" as const, displayStatus: "withheld" as const }] };
    const originalWithheld = structuredClone(displayWithheld);
    assert.equal(isPairedConsentGeometryReady(displayWithheld), true, "display withholding can preserve retained proof");
    assert.deepEqual(displayWithheld, originalWithheld, "readiness does not clear visual withholding");

    const mutations: Array<[string, (value: typeof input) => void]> = [
      ["same URL with a different loader", value => { value.documentIdentity = { ...value.documentIdentity, token: "new-loader" }; }],
      ["missing identity", value => { value.geometry.documentIdentity = undefined; }],
      ["URL drift", value => { value.pageUrl += "next"; }],
      ["frame navigation or replacement", value => { value.framesStable = false; }],
      ["missing screenshot", value => { value.screenshots = []; }],
      ["different image reference", value => { value.screenshots[0].path = "other.png"; }],
      ["placeholder image", value => { value.screenshots[0].captureMethod = "primary_placeholder"; }],
      ["fresh-context image", value => { value.screenshots[0].captureMethod = "fresh_context_viewport_fallback"; }],
      ["unretained image", value => { value.screenshots[0].retentionStatus = "withheld"; }],
      ["post-consent image", value => { value.screenshots[0].consentStateAtTime = "post_accept"; }],
      ["incomplete frame coverage", value => { value.geometry.controlInspection!.captureCoverage.frameCount += 1; }],
      ["loading document", value => { value.geometry.controlInspection!.captureCoverage.documentReadyState = "loading"; }],
      ["truncated capture", value => { value.geometry.controlInspection!.captureCoverage.inventoryTruncated = true; }],
      ["malformed inspection", value => { value.geometry.controlInspection!.retainedCandidateCount += 1; }],
      ["missing DOM channel", value => { value.observation.captureDiagnostics!.completedChannels = ["geometry"]; }],
      ["timeout", value => { value.observation.captureDiagnostics!.timedOutChannels = ["dom_inventory"]; }],
      ["failed inventory", value => { value.observation.captureDiagnostics!.failedChannels = ["accessibility_tree"]; }],
      ["new typed control", value => { value.observation.controls.push({ label: "Reject all", actionType: "reject_all", visible: true }); }],
      ["same-label duplicate", value => { value.observation.controls.push({ ...value.observation.controls[0] }); }],
      ["changed selector", value => { value.observation.controls[0].selectorHint = "#replacement"; }],
      ["changed role", value => { value.observation.controls[0].role = "link"; }],
      ["changed tag", value => { value.observation.controls[0].tagName = "a"; }],
      ["unbound child control", value => { value.geometry.candidates[0].frameContext.frameKind = "child_frame"; }],
      ["nonfinite geometry", value => { value.geometry.viewport.width = Number.NaN; }],
    ];
    for (const [reason, mutate] of mutations) {
      const changed = structuredClone(input);
      mutate(changed);
      assert.equal(isPairedConsentGeometryReady(changed), false, reason);
    }
    const ready = isPairedConsentGeometryReady(input);
    assert.equal(shouldExitStablePartialConsentGate({ controlCount: observation.controls.length, progressObserved: false, proofStable: ready, stableForMs: 1999 }), false);
    assert.equal(shouldExitStablePartialConsentGate({ controlCount: observation.controls.length, progressObserved: false, proofStable: ready, stableForMs: 2000 }), true);
    assert.equal(shouldExitStablePartialConsentGate({ controlCount: observation.controls.length, progressObserved: true, proofStable: ready, stableForMs: 2000 }), false);
    assert.equal(consentGateStablePartialDisposition(8000, false), "exit");
    assert.equal(consentGateStablePartialDisposition(8000, true), "audit_holdout");
    assert.equal(consentGateStablePartialDisposition(18000, true), "exit");
  } finally {
    await browser.close();
  }
});

test("same-URL child-frame reload invalidates paired timing readiness without dropping final proof", { timeout: 40_000 }, async () => {
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/pulse" ? 204 : 200, { "content-type": "text/html" });
    response.end(request.url === "/pulse" ? undefined : request.url === "/frame"
      ? "<!doctype html><html><body>Stable local child document</body></html>"
      : `<!doctype html><html><body><main><h1>Local timing fixture</h1><p>Ordinary visible content stays stable while a delayed first-layer consent control mounts.</p></main>
      <iframe id="proof-frame" src="/frame"></iframe><script>
      window.truste={};let n=0;const pulse=setInterval(()=>{fetch('/pulse').catch(()=>{});if(++n===25)clearInterval(pulse)},100);
      setTimeout(()=>{const s=document.createElement('section');s.id='truste-consent-track';s.setAttribute('role','dialog');s.setAttribute('aria-label','Cookie choices');s.style='position:fixed;bottom:0;left:0;padding:24px;background:white;z-index:99';s.innerHTML='<p>We use optional cookies for analytics. Choose your preferences.</p><button id="truste-consent-button">Accept all</button><button>Untranslated decision</button>';document.body.append(s)},1000);
      setTimeout(()=>{document.getElementById('proof-frame').contentWindow.location.reload()},4500);
      </script></body></html>`);
  });
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-paired-frame-drift-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(),
      internalBudgetMs: 30_000, artifactWriter: await createArtifactWriter(directory), captureScope: "consent_proof",
      screenshotMode: "always", screenshotCaptureMode: "viewport_first", waitMode: "standard", consentGateAuditHoldout: false });
    assert.equal(result.moduleRun.status, "completed");
    const observation = result.consentUiObservations[0];
    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.rejectControlObserved, false);
    assert.equal(observation.managePreferencesControlObserved, false);
    assert.equal(observation.inventoryOutcome, "partial");
    assert.ok(observation.basis.includes("unresolved_visible_consent_decision"));
    const markers = observation.inventoryDiagnostics?.timingMarkers ?? [];
    assert.ok(markers.some(marker => marker.includes("partial_proof_incomplete_safety_exit")));
    assert.ok(!markers.some(marker => marker.includes("stable_partial_exit")));
    const geometry = JSON.parse(await readFile(path.join(directory, "ConsentControlGeometryEvidence.json"), "utf8"));
    assert.ok(result.screenshots.some(image => image.artifactId === "screenshot_pre_consent_geometry_proof" && image.path === geometry.screenshotArtifactRef));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});


test("stable paired exit still reveals a later clipped Reject and retains scroll proof", { timeout: 30_000 }, async () => {
  const html = `<!doctype html><html><head><title>Owned local geometry readiness fixture</title></head><body>
<main><h1>Local scanner fixture</h1><p>This local page tests delayed first-layer consent proof and keeps ordinary visible page content stable while the control is mounted.</p></main>
<script>window.truste={};let n=0;const pulse=setInterval(()=>{fetch('/pulse').catch(()=>{});if(++n===25)clearInterval(pulse)},100);
setTimeout(()=>{const s=document.createElement('section');s.id='truste-consent-track';s.setAttribute('role','dialog');s.setAttribute('aria-label','Cookie choices');s.style='position:fixed;top:90px;left:200px;width:720px;height:390px;overflow-y:auto;padding:24px;background:white;z-index:99';s.innerHTML='<p>We use optional cookies for analytics. Choose your preferences.</p><button id="truste-consent-button">Accept all</button><button>Untranslated decision</button><div style="height:650px">Optional purpose descriptions</div>';document.body.append(s)},1000);setTimeout(()=>{const b=document.createElement('button');b.id='essential-only';b.textContent='Accept only essential cookies';document.getElementById('truste-consent-track').append(b)},7000);</script></body></html>`;
  const server = createServer((request, response) => {
    response.writeHead(request.url === "/pulse" ? 204 : 200, { "content-type": "text/html" });
    response.end(request.url === "/pulse" ? undefined : html);
  });
  const directory = await mkdtemp(path.join(tmpdir(), "certscore-paired-scroll-"));
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(),
      internalBudgetMs: 25_000, artifactWriter: await createArtifactWriter(directory), captureScope: "consent_proof",
      screenshotMode: "always", screenshotCaptureMode: "viewport_first", waitMode: "standard", consentGateAuditHoldout: false });
    assert.equal(result.moduleRun.status, "completed");
    const observation = result.consentUiObservations[0];
    assert.equal(observation.acceptControlObserved, true);
    assert.equal(observation.rejectControlObserved, true);
    assert.equal(observation.inventoryOutcome, "partial");
    assert.ok(observation.basis.includes("unresolved_visible_consent_decision"));
    assert.ok(observation.inventoryDiagnostics?.timingMarkers.some(marker => marker.includes("calibrated_stable_partial_exit")));
    const geometry = JSON.parse(await readFile(path.join(directory, "ConsentControlGeometryEvidence.json"), "utf8"));
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.ok(geometry.summary.limitations.includes("recapture:bounded_internal_scroll_to_first_layer_controls"));
    assert.ok(result.screenshots.some(image => image.artifactId === "screenshot_pre_consent_geometry_proof" && image.path === geometry.screenshotArtifactRef));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
