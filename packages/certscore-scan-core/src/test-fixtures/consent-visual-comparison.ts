import sharp from "sharp";
import { classifyConsentInspectionRole, CONTROL_INSPECTION_POLICY } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact, ConsentControlCandidateEvidence } from "../consent-control-geometry.js";

export const visualFixtureStartMs = Date.parse("2026-10-10T12:00:00.000Z");
export async function consentVisualFixture(style: "filled" | "outline" | "equal" | "reject_filled" = "filled", stacked = false) {
  const viewport = { width: 640, height: 300 };
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  const container = { containerId: "dialog", selectorHint: "#cookie-banner", layer: "first_layer" as const,
    textExcerpt: "We use cookies", htmlExcerpt: "<section>Cookie consent</section>", boundingBox: rect(20, 20, 600, 260), intersectsViewport: true };
  const candidates = ["Accept all", "Reject all", "Cookie settings"].map((label, i): ConsentControlCandidateEvidence => ({
    candidateId: `control-${i}`, label, normalizedLabel: label.toLowerCase(), actionType: ["accept_all", "reject_all", "manage_preferences"][i] as ConsentControlCandidateEvidence["actionType"],
    presentationType: "dedicated_button", placementType: "action_cluster", tagName: "button", selectorHint: `#control-${i}`,
    containerId: "dialog", layer: "first_layer", frameContext: { frameKind: "main_frame", frameUrl: "https://visual-fixture.test/" },
    enabled: true, computedStyle: { display: "block", visibility: "visible", opacity: "1", pointerEvents: "auto", position: "static", zIndex: "auto" },
    boundingBox: stacked ? rect(60, 60 + i * 70, 180, 50) : rect(i === 0 ? 60 : i === 1 ? 260 : 60, i === 2 ? 220 : 150, 180, 50), viewport,
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
  const a = candidates[0]!.boundingBox, r = candidates[1]!.boundingBox;
  if (style === "outline") { draw(a.x - 8, a.y - 8, 196, 66, [255, 255, 255]); draw(a.x - 4, a.y - 4, 188, 58, background); }
  if (style === "filled" || style === "equal") draw(a.x, a.y, 180, 50, bright);
  if (style === "reject_filled" || style === "equal") draw(r.x, r.y, 180, 50, bright);
  draw(a.x + 65, a.y + 20, 30, 10, [255, 255, 255]); draw(r.x + 65, r.y + 20, 30, 10, [255, 255, 255]);
  return { geometry, screenshotBytes: await sharp(pixels, { raw: { ...viewport, channels: 3 } }).png().toBuffer(),
    screenshotCapturedAtMs: visualFixtureStartMs + 1000 };
}

/** Synthetic pixels and complete fixture proof for retained-layout regression.
 * Coordinates/labels model the named historical layouts; this is not site evidence. */
export async function separatedConsentVisualFixture(layout: "streamable" | "witt" | "qobuz") {
  const fixture = await consentVisualFixture();
  const { geometry } = fixture;
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  const layouts = {
    streamable: { a: rect(1000, 746.06, 325, 44.38), r: rect(1189.66, 439.81, 145.34, 16.56),
      surface: rect(975, 419.81, 375, 464.19), label: "Continue without accepting" },
    witt: { a: rect(483, 791.22, 400, 44.39), r: rect(483, 851.61, 144.53, 24.39),
      surface: rect(0, 600, 1366, 300), label: "Einwilligung ablehnen" },
    qobuz: { a: rect(688, 636.75, 200, 40.41), r: rect(587.17, 317.14, 191.64, 24),
      surface: rect(318, 176.83, 730, 546.33), label: "Continue without agreeing →" },
  };
  const selected = layouts[layout];
  geometry.viewport = { width: 1366, height: 900 };
  geometry.containers[0]!.boundingBox = selected.surface;
  geometry.candidates = geometry.candidates.slice(0, 2);
  const [accept, reject] = geometry.candidates;
  accept!.boundingBox = selected.a;
  reject!.boundingBox = selected.r;
  reject!.label = selected.label;
  reject!.normalizedLabel = selected.label.toLowerCase();
  reject!.matchedTerm = selected.label;
  geometry.candidates.forEach(c => { c.viewport = geometry.viewport; });
  if (layout === "witt") {
    geometry.cmp.name = "OneTrust"; geometry.cmp.detected = true;
    reject!.selectorHint = "#onetrust-reject-all-handler";
  }
  geometry.controlInspection!.retainedCandidateCount = 2;
  geometry.controlInspection!.candidates = geometry.candidates.map(c => ({ candidateId: c.candidateId, ...classifyConsentInspectionRole(c) }));
  const pixels = Buffer.alloc(1366 * 900 * 3, 255);
  for (let y = Math.floor(selected.a.top); y < Math.ceil(selected.a.bottom); y++) {
    for (let x = Math.floor(selected.a.left); x < Math.ceil(selected.a.right); x++) {
      const at = (y * 1366 + x) * 3; pixels[at] = 25; pixels[at + 1] = 25; pixels[at + 2] = 25;
    }
  }
  return { ...fixture, screenshotBytes: await sharp(pixels, { raw: { ...geometry.viewport, channels: 3 } }).png().toBuffer() };
}
