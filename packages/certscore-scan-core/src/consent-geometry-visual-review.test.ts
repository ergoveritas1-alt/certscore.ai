import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import { buildReviewPacket, normalizeNanoVisualReview } from "./consent-geometry-visual-review.js";

test("buildReviewPacket bounds visual review evidence to consent-relevant candidates", () => {
  const packet = buildReviewPacket("example.com", fixtureGeometry());

  assert.equal(packet.site, "example.com");
  assert.equal(packet.visibleConfirmedCandidates.length, 3);
  assert.deepEqual(
    packet.visibleConfirmedCandidates.map((candidate) => candidate.actionType),
    ["accept_all", "reject_all", "manage_preferences"],
  );
  assert.equal(packet.nonVisibleConsentCandidates.length, 1);
  assert.equal(packet.nonVisibleConsentCandidates[0]?.decisionStatus, "hidden");
  assert.equal(packet.containers.length, 1);
  assert.equal(packet.containers[0]?.textExcerpt.includes("Accept All"), true);
});

test("normalizeNanoVisualReview compares Nano visual decisions to scanner summary", () => {
  const review = normalizeNanoVisualReview("example.com", fixtureGeometry(), {
    visualFirstLayerAccept: true,
    visualFirstLayerReject: false,
    visualFirstLayerOptions: true,
    visibleLabels: ["Accept All", "Manage Cookies"],
    notes: ["Reject not visually present"],
    limitations: ["small screenshot"],
  }, "test-nano");

  assert.equal(review.reviewStatus, "reviewed");
  assert.equal(review.visualFirstLayerAccept, true);
  assert.equal(review.visualFirstLayerReject, false);
  assert.equal(review.visualFirstLayerOptions, true);
  assert.deepEqual(review.scannerAgreement, {
    accept: "agree",
    reject: "disagree",
    options: "agree",
  });
  assert.deepEqual(review.visibleLabels, ["Accept All", "Manage Cookies"]);
  assert.equal(review.model, "test-nano");
});

test("normalizeNanoVisualReview keeps visual booleans consistent with listed options labels", () => {
  const paypalReview = normalizeNanoVisualReview("paypal.com", fixtureGeometry(), {
    visualFirstLayerAccept: true,
    visualFirstLayerReject: true,
    visualFirstLayerOptions: false,
    visibleLabels: ["Accept", "Decline", "Manage cookies and learn more"],
    notes: ["A link/button labeled Manage cookies and learn more is visible in the banner text area."],
    limitations: [],
  }, "test-nano");
  const lequipeReview = normalizeNanoVisualReview("lequipe.fr", fixtureGeometry(), {
    visualFirstLayerAccept: true,
    visualFirstLayerReject: false,
    visualFirstLayerOptions: false,
    visibleLabels: ["oui, j'accepte", "paramétrer mon consentement"],
    notes: ["A preferences/configuration link is visible in the first-layer overlay text area."],
    limitations: [],
  }, "test-nano");

  assert.equal(paypalReview.visualFirstLayerOptions, true);
  assert.equal(paypalReview.scannerAgreement.options, "agree");
  assert.equal(lequipeReview.visualFirstLayerOptions, true);
  assert.equal(lequipeReview.scannerAgreement.options, "agree");
});

test("normalizeNanoVisualReview keeps reject-with-subscription labels as visible reject", () => {
  const review = normalizeNanoVisualReview("ilsole24ore.com", fixtureGeometry(), {
    visualFirstLayerAccept: true,
    visualFirstLayerReject: false,
    visualFirstLayerOptions: true,
    visibleLabels: ["Preferenze", "Accetto", "Rifiuta e abbonati"],
    notes: ["A visible first-layer control Rifiuta e abbonati is present."],
    limitations: [],
  }, "test-nano");

  assert.equal(review.visualFirstLayerAccept, true);
  assert.equal(review.visualFirstLayerReject, true);
  assert.equal(review.visualFirstLayerOptions, true);
  assert.equal(review.scannerAgreement.reject, "agree");
});

function fixtureGeometry(): ConsentControlGeometryArtifact {
  return {
    artifactVersion: "consent_control_geometry.v1",
    sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: "https://example.com/",
    capturedAt: "2026-06-27T00:00:00.000Z",
    viewport: { width: 1366, height: 900 },
    screenshotArtifactRef: "/tmp/example.png",
    cmp: {
      detected: true,
      name: "OneTrust",
      confidence: 0.9,
      reasonCodes: ["script:https://cdn.cookielaw.org"],
      matchedSignals: [],
      detections: [],
    },
    containers: [{
      containerId: "container_0",
      selectorHint: "#onetrust-banner-sdk",
      role: "dialog",
      layer: "first_layer",
      textExcerpt: "We use cookies. Accept All Decline Non-Essential Cookies Manage Cookies",
      htmlExcerpt: "<div>bounded</div>",
      boundingBox: rect(10, 10, 400, 300),
      intersectsViewport: true,
    }],
    candidates: [
      candidate("candidate_0", "Accept All", "accept_all", "confirmed_visible"),
      candidate("candidate_1", "Decline Non-Essential Cookies", "reject_all", "confirmed_visible"),
      candidate("candidate_2", "Manage Cookies", "manage_preferences", "confirmed_visible"),
      candidate("candidate_3", "Allow All", "accept_all", "hidden"),
      candidate("candidate_4", "Privacy Policy", "policy_link", "footer_or_policy_link"),
    ],
    summary: {
      firstLayerAccept: true,
      firstLayerReject: true,
      firstLayerOptions: true,
      cmpDetected: true,
      cmpName: "OneTrust",
      confidence: 0.98,
      limitations: ["accept_all:Allow All:hidden"],
    },
  };
}

function candidate(
  candidateId: string,
  label: string,
  actionType: ConsentControlGeometryArtifact["candidates"][number]["actionType"],
  decisionStatus: ConsentControlGeometryArtifact["candidates"][number]["decisionStatus"],
): ConsentControlGeometryArtifact["candidates"][number] {
  return {
    candidateId,
    label,
    normalizedLabel: label.toLowerCase(),
    actionType,
    tagName: "button",
    selectorHint: `#${candidateId}`,
    containerSelectorHint: "#onetrust-banner-sdk",
    containerId: "container_0",
    layer: decisionStatus === "footer_or_policy_link" ? "footer" : "first_layer",
    frameContext: {
      frameKind: "main_frame",
      frameUrl: "https://example.com/",
    },
    enabled: true,
    computedStyle: {
      display: decisionStatus === "hidden" ? "none" : "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
      position: "static",
      zIndex: "auto",
    },
    boundingBox: rect(20, 20, 160, 40),
    viewport: { width: 1366, height: 900 },
    intersectsViewport: decisionStatus !== "hidden",
    clippedByScrollableAncestor: false,
    occlusion: {
      center: decisionStatus !== "hidden",
      topLeft: decisionStatus !== "hidden",
      topRight: decisionStatus !== "hidden",
      bottomLeft: decisionStatus !== "hidden",
      bottomRight: decisionStatus !== "hidden",
      checkedPoints: 5,
      hitSelectorHints: [],
    },
    classifierReasonCodes: ["matched"],
    classifierConfidence: 0.95,
    decisionStatus,
    reasons: [decisionStatus],
  };
}

function rect(x: number, y: number, width: number, height: number) {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
  };
}
