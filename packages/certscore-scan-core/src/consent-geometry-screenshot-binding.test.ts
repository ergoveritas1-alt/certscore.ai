import assert from "node:assert/strict";
import test from "node:test";
import type { ScreenshotArtifact } from "@certscore/contracts";
import type { Page } from "playwright";
import { captureConsentControlGeometry, type ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { bindConsentGeometryScreenshot, preferredPreConsentScreenshotRef } from "./consent-geometry-screenshot-binding.js";
import { isPairedConsentGeometryReady } from "./consent-paired-geometry-readiness.js";
import { consentUiObservationFromConfirmedGeometryControls } from "./scanners/pre-consent-runtime-scanner.js";

const document = { pageUrl: "https://fixture.example/", documentIdentity: { source: "cdp_loader_id" as const, token: "current-loader" } };
function screenshot(overrides: Partial<ScreenshotArtifact> = {}): ScreenshotArtifact {
  return { artifactId: "screenshot_pre_consent_geometry_proof", capturedAtMs: 5000,
    path: "proof.png", url: document.pageUrl, documentIdentity: document.documentIdentity,
    consentStateAtTime: "pre_consent", pagePhase: "network_idle", ...overrides };
}
function geometry(): ConsentControlGeometryArtifact {
  return { artifactVersion: "consent_control_geometry.v1", sourceScanner: "consent_control_geometry_diagnostic",
    ...document, capturedAt: "2026-10-09T00:00:00Z", viewport: { width: 1366, height: 768 },
    screenshotArtifactRef: "initial.png", cmp: { detected: false, confidence: 0, reasonCodes: [], matchedSignals: [], detections: [] },
    containers: [], candidates: [
      { candidateId: "current", layer: "first_layer", decisionStatus: "confirmed_visible", screenshotArtifactRef: "initial.png" },
      { candidateId: "prior-scroll", layer: "first_layer", decisionStatus: "confirmed_visible", screenshotArtifactRef: "before-scroll.png" },
      { candidateId: "hidden", layer: "first_layer", decisionStatus: "dom_present_not_visible", screenshotArtifactRef: "initial.png" },
    ] as ConsentControlGeometryArtifact["candidates"],
    summary: { firstLayerAccept: true, firstLayerReject: true, firstLayerOptions: false, cmpDetected: false, confidence: 0.9, limitations: [] } };
}

test("a later same-loader proof replaces packet and current visible candidate references together", () => {
  const packet = geometry();
  assert.equal(bindConsentGeometryScreenshot(packet, screenshot()), true);
  assert.equal(packet.screenshotArtifactRef, "proof.png");
  assert.equal(packet.candidates[0].screenshotArtifactRef, "proof.png");
  assert.equal(packet.candidates[1].screenshotArtifactRef, "before-scroll.png", "do not relabel an earlier merged viewport");
  assert.equal(packet.candidates[2].screenshotArtifactRef, "initial.png", "hidden controls are not proof-image observations");
});

test("a same-document page image stays contextual for a later visible first-layer opt-out", async () => {
  const viewport = {width: 1366, height: 900};
  const candidate = {
    frameUrl: document.pageUrl, layer: "first_layer", contextText: "Cookie privacy choices. Opt out of the sale or sharing of personal information.",
    label: "Do Not Sell or Share My Personal Information", tagName: "button", selectorHint: "#privacy-opt-out",
    enabled: true, semanticallyInteractive: true, intersectsViewport: true, viewport,
    computedStyle: {display: "block", visibility: "visible", pointerEvents: "auto", opacity: "1"},
    boundingBox: {x: 37, y: 833, width: 386, height: 36, top: 833, right: 423, bottom: 869, left: 37},
    occlusion: {center: true, topLeft: true, topRight: true, bottomLeft: true, bottomRight: true, checkedPoints: 5},
  };
  const frame = {evaluate: async () => ({pageUrl: document.pageUrl, viewport, documentReadyState: "complete", inventoryLimited: false,
    candidates: [candidate, {...candidate, label: "Accept all", selectorHint: "#accept"}], containers: [], scripts: [],
    cookieNames: [], globals: ["CookieYes"], domSelectors: [], textSnippets: [candidate.contextText]})};
  const page = {url: () => document.pageUrl, mainFrame: () => frame, frames: () => [frame],
    context: () => ({cookies: async () => []}), on: () => {}, off: () => {}} as unknown as Page;
  const scanStartedAtMs = Date.now();
  const packet = await captureConsentControlGeometry(page, {documentIdentity: document.documentIdentity, screenshotArtifactRef: "settled.png"});
  const optOut = packet.candidates.find(candidate => candidate.actionType === "do_not_sell_share")!;
  const accept = packet.candidates.find(candidate => candidate.actionType === "accept_all")!;
  assert.equal(optOut.decisionStatus, "confirmed_visible");
  assert.equal(packet.screenshotArtifactRef, "settled.png");
  assert.equal(optOut.screenshotArtifactRef, undefined);
  assert.equal(accept.screenshotArtifactRef, "settled.png");
  const observation = consentUiObservationFromConfirmedGeometryControls({geometry: packet, scanStartedAtMs})!;
  observation.captureDiagnostics!.completedChannels.push("dom_inventory");
  const readiness = {geometry: packet, observation, ...document, framesStable: true, screenshots: [screenshot({
    artifactId: "screenshot_pre_consent_settled", path: "settled.png", captureMethod: "primary_viewport_fallback",
  })]};
  assert.equal(isPairedConsentGeometryReady(readiness), true, "the exact opt-out inventory must not force additional capture");
  const wrong = structuredClone(readiness);
  wrong.observation.controls.find(control => control.actionType === "do_not_sell_share")!.selectorHint = "#replacement";
  assert.equal(isPairedConsentGeometryReady(wrong), false, "the opt-out still needs its exact DOM match");
  const missingAcceptImage = structuredClone(readiness);
  delete missingAcceptImage.geometry.candidates.find(control => control.actionType === "accept_all")!.screenshotArtifactRef;
  assert.equal(isPairedConsentGeometryReady(missingAcceptImage), false);
  assert.equal(bindConsentGeometryScreenshot(packet, screenshot()), true);
  assert.equal(packet.screenshotArtifactRef, "proof.png");
  assert.equal(optOut.screenshotArtifactRef, undefined);
  assert.equal(accept.screenshotArtifactRef, "proof.png");
  assert.ok(consentUiObservationFromConfirmedGeometryControls({geometry: packet, scanStartedAtMs})?.controls
    .some(control => control.actionType === "do_not_sell_share" && control.visible));
});

test("a OneTrust banner wrapper mentioning privacy choices is not an opt-out candidate", async () => {
  const selector = "#onetrust-banner-sdk";
  const viewport = {width: 1366, height: 900};
  const candidate = {frameUrl: document.pageUrl, layer: "first_layer", enabled: true, semanticallyInteractive: true,
    intersectsViewport: true, viewport, label: "Your Privacy Choices", tagName: "div", selectorHint: selector,
    containerSelectorHint: selector, contextText: "We use cookies. See Your Privacy Choices in the footer.",
    computedStyle: {display: "block", visibility: "visible", pointerEvents: "auto", opacity: "1"},
    boundingBox: {x: 0, y: 756, width: 1366, height: 144, top: 756, right: 1366, bottom: 900, left: 0},
    occlusion: {center: true, checkedPoints: 1}};
  const frame = {evaluate: async () => ({pageUrl: document.pageUrl, viewport, documentReadyState: "complete", inventoryLimited: false,
    candidates: [candidate, {...candidate, tagName: "button", selectorHint: "#onetrust-pc-btn-handler"}], containers: [], scripts: [],
    cookieNames: [], globals: ["OneTrust"], domSelectors: [selector], textSnippets: [candidate.contextText]})};
  const page = {url: () => document.pageUrl, mainFrame: () => frame, frames: () => [frame],
    context: () => ({cookies: async () => []}), on: () => {}, off: () => {}} as unknown as Page;
  const packet = await captureConsentControlGeometry(page, {...document, screenshotArtifactRef: "settled.png"});
  assert.equal(packet.candidates.find(row => row.selectorHint === selector)?.actionType, "other");
  assert.equal(packet.candidates.find(row => row.selectorHint === "#onetrust-pc-btn-handler")?.actionType, "do_not_sell_share");
});

for (const [reason, overrides] of [
  ["different loader", { documentIdentity: { source: "cdp_loader_id", token: "previous-loader" } }],
  ["unknown loader during capture", { documentIdentity: undefined }],
  ["different URL", { url: "https://fixture.example/next" }],
  ["post-consent capture", { consentStateAtTime: "post_accept" }],
] as const) {
  test(`screenshot binding rejects ${reason} without changing structured evidence`, () => {
    const packet = geometry(); const original = structuredClone(packet);
    assert.equal(bindConsentGeometryScreenshot(packet, screenshot(overrides as Partial<ScreenshotArtifact>)), false);
    assert.deepEqual(packet, original);
  });
}

test("screenshot priority cannot select a stale loader's proof over current settled evidence", () => {
  assert.equal(preferredPreConsentScreenshotRef([
    screenshot({ documentIdentity: { source: "cdp_loader_id", token: "previous-loader" } }),
    screenshot({ artifactId: "screenshot_pre_consent_settled", path: "settled.png" }),
  ], document), "settled.png");
  assert.equal(preferredPreConsentScreenshotRef([screenshot()], { ...document, documentIdentity: undefined }), undefined);
});

test("binding retains safety-withheld status and does not make a withheld image displayable", () => {
  const image = screenshot({ displayStatus: "withheld", retentionStatus: "withheld", withheldReason: "safety_check_unavailable" });
  assert.equal(bindConsentGeometryScreenshot(geometry(), image), true);
  assert.equal(image.displayStatus, "withheld");
  assert.equal(image.retentionStatus, "withheld");
});


test("packet recovery references its reused CMP image rather than a nonexistent recovery file", () => {
  const reused = screenshot({ artifactId: "screenshot_pre_consent_cmp_controls", path: "screenshot-pre-consent-cmp-controls.png" });
  const reference = preferredPreConsentScreenshotRef([reused], document);
  assert.equal(reference, reused.path);
  assert.notEqual(reference, "screenshot-pre-consent-packet-recovery.png");
});
