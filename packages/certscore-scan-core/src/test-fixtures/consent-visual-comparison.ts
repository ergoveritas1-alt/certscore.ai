import sharp from "sharp";
import { classifyConsentInspectionRole, CONTROL_INSPECTION_POLICY } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact, ConsentControlCandidateEvidence } from "../consent-control-geometry.js";

export const visualFixtureStartMs = Date.parse("2026-10-10T12:00:00.000Z");
export async function consentVisualFixture(style: "filled" | "outline" | "equal" | "reject_filled" = "filled") {
  const viewport = { width: 640, height: 300 };
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  const container = { containerId: "dialog", selectorHint: "#cookie-banner", layer: "first_layer" as const,
    textExcerpt: "We use cookies", htmlExcerpt: "<section>Cookie consent</section>", boundingBox: rect(20, 20, 600, 260), intersectsViewport: true };
  const candidates = ["Accept all", "Reject all", "Cookie settings"].map((label, i): ConsentControlCandidateEvidence => ({
    candidateId: `control-${i}`, label, normalizedLabel: label.toLowerCase(), actionType: ["accept_all", "reject_all", "manage_preferences"][i] as ConsentControlCandidateEvidence["actionType"],
    presentationType: "dedicated_button", placementType: "action_cluster", tagName: "button", selectorHint: `#control-${i}`,
    containerId: "dialog", layer: "first_layer", frameContext: { frameKind: "main_frame", frameUrl: "https://visual-fixture.test/" },
    enabled: true, computedStyle: { display: "block", visibility: "visible", opacity: "1", pointerEvents: "auto", position: "static", zIndex: "auto" },
    boundingBox: rect(i === 0 ? 60 : i === 1 ? 260 : 60, i === 2 ? 220 : 150, 180, 50), viewport,
    intersectsViewport: true, clippedByScrollableAncestor: false,
    occlusion: { center: true, topLeft: true, topRight: true, bottomLeft: true, bottomRight: true, checkedPoints: 5, hitSelectorHints: [] },
    screenshotArtifactRef: "proof.png", matchedTerm: label.toLowerCase(), matchedLocale: "en", matchStrength: "direct",
    classifierReasonCodes: [], classifierConfidence: 1, consentContextConfirmed: true, decisionStatus: "confirmed_visible", reasons: [],
  }));
  const geometry: ConsentControlGeometryArtifact = {
    artifactVersion: "consent_control_geometry.v1", sourceScanner: "consent_control_geometry_diagnostic", pageUrl: "https://visual-fixture.test/",
    capturedAt: new Date(visualFixtureStartMs + 1000).toISOString(), documentIdentity: { source: "cdp_loader_id", token: "visual-fixture-loader" },
    viewport, screenshotArtifactRef: "proof.png", cmp: { detected: false, confidence: 0, reasonCodes: [], matchedSignals: [], detections: [] },
    containers: [container], candidates,
    controlInspection: { version: CONTROL_INSPECTION_POLICY, retainedCandidateCount: candidates.length,
      captureCoverage: { inventoryTruncated: false, documentReadyState: "complete", mainFrameAvailable: true,
        documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1 },
      structuralCoverage: "complete", reasonCodes: [], candidates: candidates.map(c => ({ candidateId: c.candidateId, ...classifyConsentInspectionRole(c) })) },
    summary: { firstLayerAccept: true, firstLayerReject: true, firstLayerOptions: true, cmpDetected: false, confidence: 1, limitations: [] },
  };
  const background = [30, 41, 59], bright = [34, 221, 192];
  const pixels = Buffer.alloc(viewport.width * viewport.height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = background[i % 3]!;
  const draw = (x: number, y: number, width: number, height: number, color: number[]) => {
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
      color.forEach((v, channel) => { pixels[(py * viewport.width + px) * 3 + channel] = v; });
    }
  };
  if (style === "outline") { draw(52, 142, 196, 66, [255, 255, 255]); draw(56, 146, 188, 58, background); }
  if (style === "filled" || style === "equal") draw(60, 150, 180, 50, bright);
  if (style === "reject_filled" || style === "equal") draw(260, 150, 180, 50, bright);
  // Text-sized contrasting patches prevent uniform fill from being the only fixture.
  draw(125, 170, 30, 10, [255, 255, 255]); draw(325, 170, 30, 10, [255, 255, 255]);
  return { geometry, screenshotBytes: await sharp(pixels, { raw: { ...viewport, channels: 3 } }).png().toBuffer(),
    screenshotCapturedAtMs: visualFixtureStartMs + 1000 };
}
