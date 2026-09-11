import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime.js";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { buildGpcResponseAssessment, compareGpcSets } from "./gpc-response-assessment.js";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime.js";
import { createGpcSignalCapture, gpcDocumentHash, installGpcNavigatorSignal } from "./gpc-signal-capture.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
import { gpcJourneyWindowFixture, redirectGpcFixture } from "./test-fixtures/gpc-window.cases.js";

const sha = "a".repeat(64);

function bundle(input: {
  gpc?: boolean;
  lane: "runtime_evidence" | "gpc_observation";
  tracker?: string;
}): CanonicalEvidenceBundle {
  const fixture = gpcRuntimeFixture({ enabled: input.lane === "gpc_observation",
    vendors: input.tracker ? [{ name: input.tracker }] : [] });
  if (!input.gpc) fixture.networkEvents.forEach((event) => { event.requestHeaders = {}; });
  return fixture;
}

function assess(baseline: CanonicalEvidenceBundle, gpc: CanonicalEvidenceBundle) {
  return buildGpcResponseAssessment({
    baseline,
    baselineArtifact: { sha256: sha, sizeBytes: 100, uri: "s3://evidence/baseline.json" },
    generatedAt: "2026-08-20T12:00:00.000Z",
    gpc,
    gpcArtifact: { sha256: sha, sizeBytes: 100, uri: "s3://evidence/gpc.json" },
  });
}

test("GPC assessment is responsive when the paired passive condition changes a relevant tracker", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence", tracker: "Example Ads" }),
    bundle({ gpc: true, lane: "gpc_observation" }),
  );
  assert.equal(result.status, "responsive");
  assert.equal(result.findingTitle, "GPC response");
  assert.deepEqual(result.comparison.deltas.trackers.baselineOnly, ["Example Ads|pixel|advertising"]);
  assert.equal(result.scoreEffect, "none");
  assert.equal(result.legalInterpretation, "not_assessed");
});

test("GPC assessment reports no observable response only for comparable identical evidence", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence", tracker: "Example Analytics" }),
    bundle({ gpc: true, lane: "gpc_observation", tracker: "Example Analytics" }),
  );
  assert.equal(result.status, "no_observable_response");
  assert.equal(result.findingTitle, "No observable GPC response");
  assert.equal(result.comparison.comparable, true);
});

test("GPC assessment fails closed when direct Sec-GPC evidence is missing", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence" }),
    bundle({ lane: "gpc_observation" }),
  );
  assert.equal(result.status, "indeterminate");
  assert.equal(result.findingTitle, "GPC response");
  assert.ok(result.comparison.limitationKeys.includes("main_document_sec_gpc_not_retained"));
});

test("v2 compares complete sets before sampling, including large and long identities", () => {
  const original = Array.from({ length: 150 }, (_,i) => `z${String(i).padStart(3, "0")}`);
  const delta = compareGpcSets(original, ["a_new", ...original]);
  assert.equal(delta.baselineOnlyCount, 0);
  assert.equal(delta.sharedCount, 150);
  assert.equal(delta.shared.length, 100);
  assert.equal(delta.gpcOnlyCount, 1);
  assert.equal(delta.samplesTruncated, true);
  assert.equal(compareGpcSets(["x".repeat(600) + "1"], ["x".repeat(600) + "2"]).sharedCount, 0);
});

test("v2 does not call added advertising, cookies, or CMP identity variation a privacy response", () => {
  const base = gpcRuntimeFixture({ enabled: false });
  const gpc = gpcRuntimeFixture({ enabled: true, vendors: [{ name: "More Ads" }, { name: "CMP", purpose: "consent_management" }] });
  gpc.cookieSnapshots.push({ artifactId: "snapshot", capturedAtMs: 950, consentStateAtTime: "pre_consent", url: gpc.url,
    cookies: [{ name: "session", domain: "example.test", path: "/" }], cookieNames: ["session"], evidenceRefs: [] });
  const result = assess(base, gpc);
  assert.equal(result.status, "no_observable_response");
  assert.equal(result.comparison.deltas.cookies.gpcOnlyCount, 1);
  assert.equal(result.comparison.deltas.trackers.gpcOnlyCount, 1);
});

test("v2 retains web-storage identity differences as descriptive evidence, not automatic response", () => {
  const base = gpcRuntimeFixture({ enabled: false }), gpc = gpcRuntimeFixture({ enabled: true });
  base.storageSnapshots.push({ artifactId: "snapshot", capturedAtMs: 950, consentStateAtTime: "pre_consent", url: base.url,
    localStorage: { key: "[redacted]" }, sessionStorage: {}, localStorageKeys: ["key"], sessionStorageKeys: [], valuesRedacted: true, evidenceRefs: [] });
  const result = assess(base, gpc);
  assert.equal(result.status, "no_observable_response");
  assert.deepEqual(result.comparison.deltas.webStorage.baselineOnly, ["https://example.test|localStorage|key"]);
});

const invalidConditions: Array<[string, (base: CanonicalEvidenceBundle, gpc: CanonicalEvidenceBundle) => void]> = [
  ["missing signal proof", (_b,g) => { delete g.gpcSignalObservation; }],
  ["false navigator value", (_b,g) => { g.gpcSignalObservation!.frames[0]!.navigatorValue = false; }],
  ["unverified WorkerNavigator", (_b,g) => { g.gpcSignalObservation!.workerCount = 1; }],
  ["unread frame", (_b,g) => { g.gpcSignalObservation!.frameCount = 2; }],
  ["ambiguous main frame", (_b,g) => {
    g.gpcSignalObservation!.frames.push({ ...g.gpcSignalObservation!.frames[0]!, documentUrlSha256: "d".repeat(64) });
    g.gpcSignalObservation!.frameCount = 2;
  }],
  ["oversized proof identity", (_b,g) => { g.networkEvents[0]!.eventId = "x".repeat(200); }],
  ["header only on subresources", (_b,g) => { g.networkEvents[0]!.requestHeaders = {}; }],
  ["contaminated baseline", (b) => { b.networkEvents[0]!.requestHeaders = { secGpc: "1" }; }],
  ["different browser protocol", (_b,g) => { g.gpcSignalObservation!.contextConfigSha256 = "d".repeat(64); }],
  ["partial runtime capture", (_b,g) => { g.runtimeCoverage!.coverageStatus = "limited_partial"; }],
  ["failed settle", (_b,g) => { g.modulesRun[0]!.timingBreakdown![0]!.outcome = "timed_out"; }],
  ["different scan identity", (_b,g) => { g.scanId = "another-scan"; }],
  ["different query document", (_b,g) => {
    const url = "https://example.test/?region=another";
    g.gpcSignalObservation!.documentUrlSha256 = gpcDocumentHash(url);
    g.gpcSignalObservation!.frames[0]!.documentUrlSha256 = gpcDocumentHash(url);
    g.networkEvents[0]!.requestUrl = url; g.scanLaneRuns[0]!.firstEffectiveUrl = url;
  }],
];
for (const [name, mutate] of invalidConditions) {
  test(`v2 fails closed: ${name}`, () => {
    const base = gpcRuntimeFixture({ enabled: false, vendors: [{ name: "Ads" }] });
    const gpc = gpcRuntimeFixture({ enabled: true, vendors: [{ name: "Ads" }] });
    mutate(base, gpc);
    const result = assess(base, gpc);
    assert.equal(result.status, "indeterminate");
    assert.equal(result.comparison.comparable, false);
    assert.ok(result.comparison.limitationKeys.length > 0);
  });
}

test("v2 compares only the common relative observation window and requires retained classification anchors", () => {
  const base = gpcRuntimeFixture({ enabled: false, vendors: [{ name: "Late Ads", atMs: 1500 }] });
  base.gpcSignalObservation!.capturedAtMs = 2000;
  const gpc = gpcRuntimeFixture({ enabled: true });
  const result = assess(base, gpc);
  assert.equal(result.status, "no_observable_response");
  assert.equal(result.comparison.coverage.comparedThroughMs, 1000);
  assert.equal(result.comparison.deltas.trackers.baselineCount, 0);
  base.networkEvents[1]!.timestampMs = 500;
  base.normalizedVendorObservations[0]!.matchedEvidenceIds = ["missing"];
  assert.equal(assess(base, gpc).comparison.deltas.trackers.baselineCount, 0);
});

test("v2 worker failure retains a neutral assessment without invented GPC proof or pointer", () => {
  const result = buildGpcResponseAssessment({ baseline: gpcRuntimeFixture({ enabled: false }),
    baselineArtifact: { uri: "s3://evidence/baseline.json", sha256: sha, sizeBytes: 100 }, failureReason: "gpc_worker_failed" });
  assert.equal(result.status, "indeterminate");
  assert.equal(result.comparison.gpcArtifact, null);
  assert.equal(result.comparison.enabledProof.navigatorGlobalPrivacyControl, null);
  assert.equal(result.comparison.delivery.status, "unavailable");
  assert.ok(result.comparison.limitationKeys.includes("gpc_worker_failed"));
});

for (const purpose of ["advertising", "analytics"] as const) {
  test(`v2 does not backdate late ${purpose} through an early tag-manager journey`, () => {
    const baseline = gpcJourneyWindowFixture(false, purpose);
    baseline.gpcSignalObservation!.capturedAtMs = 2000;
    const gpc = gpcJourneyWindowFixture(true, purpose);
    const before = structuredClone([baseline, gpc]);
    assert.ok(baseline.observedJourneys.some((j) => j.journeyType === "vendor" && j.purpose === purpose && j.firstObservedAtMs === 200));
    const result = assess(baseline, gpc);
    assert.equal(result.status, "no_observable_response");
    assert.equal(result.comparison.deltas.trackers.baselineCount, 0);
    assert.equal(result.comparison.deltas.trackers.gpcCount, 0);
    assert.deepEqual([baseline, gpc], before, "raw evidence must remain intact");
    assert.equal(assess(baseline, gpcRuntimeFixture({ enabled: true })).status, "no_observable_response",
      "a late-only baseline purpose must not become apparent suppression");
  });
}

test("v2 retains in-window purpose anchors even when a journey started before the current document", () => {
  const baseline = gpcJourneyWindowFixture(false, "advertising", 500);
  const gpc = gpcJourneyWindowFixture(true, "advertising", 500);
  for (const bundle of [baseline, gpc]) {
    bundle.gpcSignalObservation!.documentStartedAtMs = 300;
    bundle.networkEvents[0]!.timestampMs = 300;
    // A later endpoint cannot invalidate the qualifying one already retained.
    bundle.networkEvents.push({ ...bundle.networkEvents[2]!, eventId: "late_endpoint", timestampMs: 2000 });
  }
  const delta = assess(baseline, gpc).comparison.deltas.trackers;
  assert.deepEqual(delta.shared, ["Example Vendor|Collection|advertising", "Example Vendor|Example Vendor|advertising"]);
});

test("v2 journey purpose cannot borrow an unrelated product, observation, or event", () => {
  for (const mutate of [
    (j: CanonicalEvidenceBundle["observedJourneys"][number]) => { j.relatedVendorObservationIds = ["missing"]; },
    (j: CanonicalEvidenceBundle["observedJourneys"][number]) => { j.product = "Unrelated Product"; },
    (j: CanonicalEvidenceBundle["observedJourneys"][number]) => { j.eventRefs = j.eventRefs.filter((ref) => ref.eventId === "vendor_0"); },
  ]) {
    const baseline = gpcJourneyWindowFixture(false, "advertising", 500);
    baseline.observedJourneys.forEach(mutate);
    const result = assess(baseline, gpcRuntimeFixture({ enabled: true }));
    assert.deepEqual(result.comparison.deltas.trackers.baselineOnly, ["Example Vendor|Collection|advertising"]);
  }
});

test("v2 pairs verified final documents after redirects without treating the first response as final", () => {
  const baseline = redirectGpcFixture(gpcRuntimeFixture({ enabled: false, vendors: [{ name: "Ads" }] }));
  const gpc = redirectGpcFixture(gpcRuntimeFixture({ enabled: true, vendors: [{ name: "Ads" }] }));
  const result = assess(baseline, gpc);
  assert.equal(result.status, "no_observable_response");
  assert.deepEqual(result.comparison.limitationKeys, []);
  assert.equal(result.comparison.deltas.advertisingOrMarketingActivity.sharedCount, 1);
});

const invalidFinalDocuments: Array<[string, (b: CanonicalEvidenceBundle) => void]> = [
  ["missing final request", (b) => { b.networkEvents.splice(1, 1); }],
  ["final header missing", (b) => { b.networkEvents[1]!.requestHeaders = {}; }],
  ["query identity mismatch", (b) => { b.networkEvents[1]!.requestUrl += "&other=1"; }],
  ["old same-URL request", (b) => { b.gpcSignalObservation!.documentStartedAtMs = 101; }],
  ["request after readback", (b) => { b.networkEvents[1]!.timestampMs = 1100; }],
  ["duplicate same-URL navigation", (b) => { b.networkEvents.push({ ...b.networkEvents[1]!, eventId: "duplicate", timestampMs: 200 }); }],
  ["later conflicting navigation", (b) => { b.networkEvents.push({ ...b.networkEvents[0]!, eventId: "later", timestampMs: 200 }); }],
  ["navigation after readback", (b) => { b.networkEvents.push({ ...b.networkEvents[0]!, eventId: "later", timestampMs: 1100 }); }],
  ["simultaneous conflicting navigation", (b) => { b.networkEvents[0]!.timestampMs = 100; }],
  ["negative observation interval", (b) => { b.gpcSignalObservation!.documentStartedAtMs = 1001; }],
];
for (const [name, mutate] of invalidFinalDocuments) {
  test(`v2 final document fails closed: ${name}`, () => {
    const baseline = redirectGpcFixture(gpcRuntimeFixture({ enabled: false }));
    const gpc = redirectGpcFixture(gpcRuntimeFixture({ enabled: true }));
    mutate(gpc);
    const result = assess(baseline, gpc);
    assert.equal(result.status, "indeterminate");
    assert.equal(result.comparison.comparable, false);
  });
}

test("dedicated passive browser condition sends Sec-GPC and exposes navigator.globalPrivacyControl", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-gpc-observation-"));
  const pageUrl = "https://gpc-observation.test/";
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      captureScope: "runtime_evidence",
      globalPrivacyControlEnabled: true,
      gpcOptOutPrototype: { scanId: "gpc-runtime-prototype-fixture" },
      internalBudgetMs: 5_000,
      normalizedUrl: pageUrl,
      routeFulfillers: [{
        urlPattern: /^https:\/\/gpc-observation\.test\/$/,
        contentType: "text/html",
        body: `<!doctype html><script>
          window.__gpp = (command, callback) => callback({ gppVersion: '1.1', cmpStatus: 'loaded', signalStatus: 'ready',
            applicableSections: [8], sectionList: [8], parsedSections: { usca: [{ Version: 1,
              SaleOptOutNotice: 1, SharingOptOutNotice: 1, SaleOptOut: 1, SharingOptOut: 1 }, { SubsectionType: 1, Gpc: true }] } }, true);
          fetch('/navigator-gpc-' + String(navigator.globalPrivacyControl));</script>`,
      }, {
        urlPattern: /^https:\/\/gpc-observation\.test\/navigator-gpc-/,
        contentType: "text/plain",
        body: "ok",
      }],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: pageUrl,
      waitMode: "fast",
    });
    const requests = result.networkEvents.filter((event) => event.requestHostname === "gpc-observation.test");
    assert.ok(requests.length >= 2);
    assert.ok(requests.every((event) => event.requestHeaders?.secGpc === "1"));
    assert.ok(requests.some((event) => event.path === "/navigator-gpc-true"));
    assert.equal(result.gpcSignalObservation?.frames[0]?.navigatorValue, true);
    assert.ok(result.gpcObservationSession, "new capture retains its typed terminal session");
    assert.equal(result.gpcObservationSession.terminal, "completed", JSON.stringify(result.gpcObservationSession.limitationKeys));
    assert.equal(result.gpcObservationSession.mainDocument?.secGpc, "1");
    assert.ok(result.gpcObservationSession.requests.length >= 2);
    assert.deepEqual(result.gpcOptOutObservation?.captureBinding, result.gpcSignalObservation?.prototypeCaptureBinding);
    assert.ok(result.gpcOptOutObservation?.captureBinding?.documentToken);
    assert.equal(result.gpcOptOutObservation?.usca?.saleOptOut, 1);
    assert.equal(result.gpcOptOutObservation?.usca?.sharingOptOut, 1);
    assert.equal(result.gpcOptOutObservation?.documentUrlSha256, result.gpcSignalObservation?.documentUrlSha256);
    assert.equal(result.gpcSignalObservation?.documentUrlSha256, gpcDocumentHash(pageUrl));
    assert.equal(requests.some((event) => event.requestHeaders?.dnt !== undefined), false);
    assert.ok(result.transportSecurityObservations.length > 0);
    const quietWait = result.moduleRun.timingBreakdown?.find((entry) =>
      entry.label === "passive evidence quiet wait"
    );
    assert.ok(quietWait);
    assert.ok((quietWait?.durationMs ?? 0) >= 250);
    assert.notEqual(quietWait?.outcome, "timed_out");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("signal readback verifies both baseline/GPC frames and reports WorkerNavigator honestly", async () => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    for (const enabled of [false, true]) {
      const context = await browser.newContext();
      await installGpcNavigatorSignal(context, enabled);
      await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body:
        route.request().url().includes("child.test") ? "Child frame" : '<iframe src="https://child.test/"></iframe>' }));
      const page = await context.newPage();
      const capture = createGpcSignalCapture({ context, page, enabled, scanStartedAtMs: Date.now(), internalBudgetMs: 5000 });
      await page.goto("https://parent.test/");
      const proof = await capture.snapshot();
      assert.equal(proof?.frameCount, 2);
      assert.ok(proof?.frames.every((frame) => frame.navigatorValue === enabled));
      assert.deepEqual(proof?.limitationKeys, []);
      const workerValue = await page.evaluate(() => new Promise<string>((resolve) => {
        const worker = new Worker(URL.createObjectURL(new Blob(['postMessage(typeof navigator.globalPrivacyControl)'], { type: 'text/javascript' })));
        worker.onmessage = (event) => resolve(event.data);
      }));
      assert.equal(workerValue, "undefined");
      const withWorker = await capture.snapshot();
      assert.equal(withWorker?.workerCount, 1);
      assert.ok(withWorker?.limitationKeys.includes("worker_navigator_delivery_unverified"));
      await context.close();
    }
  } finally { await browser.close(); }
});

test("250ms quiet gate restarts for late GPC-condition activity and retains the request", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-gpc-quiet-window-"));
  const pageUrl = "https://gpc-quiet-window.test/";
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    const writer = await createArtifactWriter(tempRoot);
    let lateRequestScheduled = false;
    const result = await preConsentRuntimeScanner({
      browser,
      artifactWriter: { ...writer, async writeJsonArtifact(filename, content) {
        const retained = await writer.writeJsonArtifact(filename, content);
        if (filename === "TransportSecurityObservation.json" && !lateRequestScheduled) {
          lateRequestScheduled = true;
          const page = browser.contexts()[0]?.pages()[0];
          assert.ok(page);
          // Anchor the fixture timer to the checkpoint immediately before the
          // quiet gate. A navigation-anchored timer can expire during transport
          // capture and never exercise a restart at all on a slower machine.
          await page.evaluate(() => { setTimeout(() => { void fetch("/late-gpc-request"); }, 175); });
        }
        return retained;
      } },
      captureScope: "runtime_evidence",
      globalPrivacyControlEnabled: true,
      internalBudgetMs: 5_000,
      normalizedUrl: pageUrl,
      routeFulfillers: [{
        urlPattern: /^https:\/\/gpc-quiet-window\.test\/$/,
        contentType: "text/html",
        body: `<!doctype html><body>Passive evidence fixture</body>`,
      }, {
        urlPattern: /^https:\/\/gpc-quiet-window\.test\/late-gpc-request$/,
        contentType: "text/plain",
        body: "ok",
      }],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: pageUrl,
      waitMode: "fast",
    });

    const lateRequest = result.networkEvents.find((event) => event.path === "/late-gpc-request");
    assert.ok(lateRequest);
    assert.equal(lateRequestScheduled, true);
    assert.equal(lateRequest?.requestHeaders?.secGpc, "1");
    const quietWait = result.moduleRun.timingBreakdown?.find((entry) =>
      entry.label === "passive evidence quiet wait"
    );
    assert.ok((quietWait?.durationMs ?? 0) >= 400);
    assert.notEqual(quietWait?.outcome, "timed_out");
  } finally {
    await browser.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("ordinary passive scanner has no prototype readback or sidecar", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-gpc-default-"));
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot), captureScope: "runtime_evidence", globalPrivacyControlEnabled: true,
      internalBudgetMs: 5000, normalizedUrl: "https://gpc-default.test/", url: "https://gpc-default.test/",
      scanStartedAtMs: Date.now(), screenshotMode: "never", waitMode: "fast",
      routeFulfillers: [{ urlPattern: /^https:\/\/gpc-default\.test\/.*$/, contentType: "text/html",
        body: '<!doctype html><script>window.__gpp = () => { fetch("/unexpected-prototype-read"); throw Error("Unexpected prototype"); };</script><p>Default fixture</p>' }],
    });
    assert.equal(result.gpcOptOutObservation, undefined);
    assert.equal(result.gpcSignalObservation?.prototypeCaptureBinding, undefined);
    assert.equal(result.moduleRun.timingBreakdown?.some(t => t.label === "GPC opt-out prototype"), false);
    assert.equal(result.networkEvents.some(e => e.path === "/unexpected-prototype-read"), false);
  } finally { await rm(tempRoot, { recursive: true, force: true }); }
});
