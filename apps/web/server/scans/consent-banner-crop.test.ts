import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { deriveConsentBannerCrop, deriveConsentRejectCrop, deriveConsentProminenceCrop, deriveConsentScreenshotCrops } from "./consent-banner-crop";

function fixture() {
  const visual = { version: "consent_control_visual_comparison.v1", documentToken: "document-1",
    screenshotArtifactRef: "/retained/banner.png", screenshotSha256: "a".repeat(64),
    imageWidth: 1366, imageHeight: 900, captureSkewMs: 100,
    accept: { candidateId: "accept", bounds: [419, 438.75, 528, 45], fillContrast: 9,
      outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 },
    reject: { candidateId: "reject", bounds: [419, 556.75, 528, 49], fillContrast: 1,
      outerEmphasisFraction: 0, backgroundUniformity: 1, interiorUniformity: 1 } };
  const assessment = { ...structuredClone(observedControlAssessment), artifactVersion: "2.2", visualComparison: visual,
    provenance: { ...observedControlAssessment.provenance, contractVersion: "2.2" },
    controls: Object.fromEntries(Object.entries(observedControlAssessment.controls).map(([key, control]) => [key,
      { ...control, inspection: { policy: "control_specific_inspection.v2", status: "complete", evidenceRefs: ["ConsentControlGeometryEvidence.json"] } }])),
    evidence: ["accept", "reject"].map(intent => ({ evidenceId: intent, intent, layer: "first_layer", visible: true, actionable: true,
      documentToken: "document-1", documentId: "doc-1", observedAtMs: 100, channels: ["geometry"], artifactRefs: ["banner"],
      label: intent, locale: "en", classifier: null })),
    document: { ...observedControlAssessment.document, canonicalDocumentToken: "document-1" },
    visualEvidence: { status: "available", artifactRefs: ["banner"], reasonCodes: [] } };
  const geometry = { documentIdentity: { token: "document-1" }, screenshotArtifactRef: visual.screenshotArtifactRef,
    visualComparison: visual, candidates: [{ candidateId: "accept", containerId: "dialog" }, { candidateId: "reject", containerId: "dialog" }],
    containers: [{ containerId: "dialog", role: "alertdialog", layer: "first_layer", intersectsViewport: true,
      boundingBox: { x: 395, y: 151.75, width: 576, height: 596.5 } }] };
  const screenshot = { artifactId: "banner", path: "/retained/banner.png", capturedAtMs: 100,
    consentStateAtTime: "pre_consent", documentIdentity: { source: "cdp_loader_id", token: "document-1" },
    url: "https://example.com/", retentionStatus: "available", displayStatus: "available" } as NonNullable<CanonicalEvidenceBundle["screenshots"]>[number];
  return { assessment, geometry, screenshot };
}

test("banner crop uses retained container bounds without changing the assessment", () => {
  const input = fixture(), before = structuredClone(input);
  assert.deepEqual(deriveConsentBannerCrop(input), { version: "consent_banner_crop.v1", x: 395, y: 151.75,
    width: 576, height: 596.5, imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) });
  assert.deepEqual(input, before);
});

test("Reject crop retains the exact assessed button with bounded surrounding pixels", () => {
  const input = fixture(), before = structuredClone(input);
  assert.deepEqual(deriveConsentRejectCrop(input), { version: "consent_control_crop.v1", control: "reject",
    x: 407, y: 544.75, width: 552, height: 73, imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) });
  assert.deepEqual(input, before);
  input.geometry.candidates[1]!.containerId = "separate-link";
  assert.ok(deriveConsentRejectCrop(input), "a separated Reject control does not need the banner's shared container");
});

test("paired crop preserves original layout, including intervening space and separated controls", () => {
  const input = fixture(), before = structuredClone(input);
  assert.deepEqual(deriveConsentProminenceCrop(input), { version: "consent_prominence_crop.v1",
    x: 407, y: 426.75, width: 552, height: 191, imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) });
  assert.deepEqual(input, before);
  assert.deepEqual(deriveConsentScreenshotCrops(input), { bannerCrop: deriveConsentBannerCrop(input),
    rejectCrop: deriveConsentRejectCrop(input), prominenceCrop: deriveConsentProminenceCrop(input) });
  input.assessment.visualComparison.reject.bounds = [1100, 700, 100, 40];
  input.geometry.candidates[1]!.containerId = "separated-link";
  assert.deepEqual(deriveConsentProminenceCrop(input), { version: "consent_prominence_crop.v1",
    x: 407, y: 426.75, width: 805, height: 325.25, imageWidth: 1366, imageHeight: 900, screenshotSha256: "a".repeat(64) });
});

test("inner action clusters use the enclosing semantic dialog rather than clipping banner edges", () => {
  const input = fixture();
  input.geometry.candidates.forEach(c => { c.containerId = "inner"; });
  input.geometry.containers.push({ containerId: "inner", role: "", layer: "first_layer", intersectsViewport: true,
    boundingBox: { x: 419, y: 175.75, width: 528, height: 491 } });
  assert.equal(deriveConsentBannerCrop(input)?.width, 576);
  input.geometry.containers[0]!.role = "";
  assert.equal(deriveConsentBannerCrop(input), null);
});

test("withheld, unavailable, unbound or mismatched screenshot evidence cannot supply a crop", () => {
  for (const mutate of [
    (x: ReturnType<typeof fixture>) => { x.screenshot.displayStatus = "withheld"; },
    (x: ReturnType<typeof fixture>) => { x.screenshot.retentionStatus = "withheld"; },
    (x: ReturnType<typeof fixture>) => { x.assessment.visualEvidence.status = "unavailable"; },
    (x: ReturnType<typeof fixture>) => { x.assessment.visualEvidence.artifactRefs = []; },
    (x: ReturnType<typeof fixture>) => { x.screenshot.documentIdentity!.token = "other-document"; },
    (x: ReturnType<typeof fixture>) => { x.screenshot.path = "/retained/other.png"; },
    (x: ReturnType<typeof fixture>) => { x.geometry.documentIdentity.token = "other-document"; },
    (x: ReturnType<typeof fixture>) => { x.geometry.visualComparison = { ...x.geometry.visualComparison, screenshotSha256: "b".repeat(64) }; },
  ]) {
    const input = fixture(); mutate(input); assert.equal(deriveConsentBannerCrop(input), null);
    assert.equal(deriveConsentRejectCrop(input), null);
    assert.equal(deriveConsentProminenceCrop(input), null);
    assert.deepEqual(deriveConsentScreenshotCrops(input), {});
  }
});

test("unanchored, out-of-image or partial-control containers do not produce guessed crops", () => {
  for (const mutate of [
    (x: ReturnType<typeof fixture>) => { x.geometry.candidates[1]!.containerId = "other"; },
    (x: ReturnType<typeof fixture>) => { x.geometry.containers[0]!.boundingBox.width = 2000; },
    (x: ReturnType<typeof fixture>) => { x.geometry.containers[0]!.boundingBox.height = 100; },
    (x: ReturnType<typeof fixture>) => { x.geometry.containers[0]!.boundingBox.x = -1; },
    (x: ReturnType<typeof fixture>) => { x.geometry.containers[0]!.intersectsViewport = false; },
  ]) {
    const input = fixture(); mutate(input); assert.equal(deriveConsentBannerCrop(input), null);
  }
});
