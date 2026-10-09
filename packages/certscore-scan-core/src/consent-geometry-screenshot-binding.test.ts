import assert from "node:assert/strict";
import test from "node:test";
import type { ScreenshotArtifact } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { bindConsentGeometryScreenshot, preferredPreConsentScreenshotRef } from "./consent-geometry-screenshot-binding.js";

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
