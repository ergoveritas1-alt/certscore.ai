import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry.js";
import {
  mergeConsentUiObservations,
  preConsentRuntimeScanner,
  reconcileConsentUiObservationWithCompletedGeometry,
} from "./scanners/pre-consent-runtime-scanner.js";

const rapidOxfamStyleObservation = {
  observationId: "consent_ui_pre_consent",
  observedAtMs: 7_813,
  captureStatus: "observed" as const,
  captureDiagnostics: {
    completedChannels: [],
    timedOutChannels: [],
    failedChannels: [],
  },
  likelyPresent: true,
  basis: [
    "inventory:rapid_first_layer_controls",
    "control:accept_all:Accept all cookies",
    "control:reject_all:Accept only essential cookies",
    "control:manage_preferences:Cookie Settings",
  ],
  textExcerpt: "Cookie Settings Accept all cookies Accept only essential cookies Learn More",
  layerInspected: "first_layer" as const,
  visibleChoiceLabels: [
    "Cookie Settings",
    "Accept all cookies",
    "Accept only essential cookies",
    "Learn More",
  ],
  defaultToggleStatesObserved: null,
  nonEssentialDefaultsOff: null,
  defaultTogglePurposeLabels: [],
  precheckedOptionalPurposeCount: 0,
  precheckedOptionalPurposeLabels: [],
  acceptControlObserved: true,
  rejectControlObserved: true,
  managePreferencesControlObserved: true,
  controls: [
    { actionType: "manage_preferences" as const, label: "Cookie Settings", visible: true },
    { actionType: "accept_all" as const, label: "Accept all cookies", visible: true },
    { actionType: "reject_all" as const, label: "Accept only essential cookies", visible: true },
    { actionType: "manage_preferences" as const, label: "Learn More", visible: true },
  ],
  inventoryDiagnostics: {
    candidateContainerCount: 1,
    candidateControlCount: 4,
    retainedControlCount: 4,
    inventorySources: ["viewport" as const],
    candidateLabels: [
      "Cookie Settings",
      "Accept all cookies",
      "Accept only essential cookies",
      "Learn More",
    ],
    rejectionReasons: [],
    timingMarkers: ["rapid_first_layer_inventory"],
  },
  evidenceRefs: [],
  confidence: 0.86,
};

test("completed DOM negative survives an independent accessibility failure", () => {
  const domNegative = {
    ...rapidOxfamStyleObservation,
    documentUrl: "https://inventory.example/",
    captureStatus: "no_evidence" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: false,
    basis: ["settled_control_inventory_completed"],
    textExcerpt: "",
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
  };
  const accessibilityFailure = {
    ...domNegative,
    captureStatus: "incomplete" as const,
    captureDiagnostics: {
      completedChannels: [],
      timedOutChannels: [],
      failedChannels: ["accessibility_tree" as const],
    },
    basis: ["inventory:accessibility_tree_failed"],
  };

  const merged = mergeConsentUiObservations(
    domNegative,
    accessibilityFailure,
    "inventory:independent_channels",
  );

  assert.equal(merged.captureStatus, "no_evidence");
  assert.deepEqual(merged.captureDiagnostics?.completedChannels, ["dom_inventory"]);
  assert.deepEqual(merged.captureDiagnostics?.failedChannels, ["accessibility_tree"]);
  assert.ok(merged.basis.includes("settled_control_inventory_completed"));
});

function oxfamStyleGeometry(): ConsentControlGeometryArtifact {
  return {
    artifactVersion: "consent_control_geometry.v1",
    sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: "https://www.oxfamamerica.org/",
    capturedAt: "2026-07-26T21:21:00.000Z",
    viewport: { width: 1366, height: 900 },
    screenshotArtifactRef: "/tmp/screenshot-pre-consent-settled.png",
    cmp: {
      detected: true,
      name: "TrustArc",
      confidence: 0.65,
      reasonCodes: [],
      matchedSignals: [],
      detections: [],
    },
    containers: [],
    candidates: [{
      candidateId: "candidate_learn_more",
      label: "Learn More",
      normalizedLabel: "learn more",
      actionType: "other",
      tagName: "a",
      selectorHint: "a.cmpnt-button",
      layer: "first_layer",
      frameContext: {
        frameKind: "main_frame",
        frameUrl: "https://www.oxfamamerica.org/",
      },
      enabled: true,
      computedStyle: {
        display: "inline-block",
        visibility: "hidden",
        opacity: "1",
        pointerEvents: "none",
        position: "relative",
        zIndex: "auto",
      },
      boundingBox: {
        x: 800,
        y: 530,
        width: 200,
        height: 50,
        top: 530,
        right: 1_000,
        bottom: 580,
        left: 800,
      },
      viewport: { width: 1366, height: 900 },
      intersectsViewport: true,
      clippedByScrollableAncestor: false,
      occlusion: {
        center: false,
        topLeft: false,
        topRight: false,
        bottomLeft: false,
        bottomRight: false,
        checkedPoints: 5,
        hitSelectorHints: [],
      },
      classifierReasonCodes: ["no_term_match"],
      classifierConfidence: 0.2,
      decisionStatus: "hidden",
      reasons: ["hidden_or_zero_area"],
    }],
    summary: {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
      cmpDetected: true,
      cmpName: "TrustArc",
      confidence: 0.65,
      limitations: ["cmp_detected_without_visible_first_layer_controls"],
    },
  };
}

test("completed geometry cannot erase stronger structured A/R/O evidence", () => {
  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current: rapidOxfamStyleObservation,
    geometry: oxfamStyleGeometry(),
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.captureStatus, "observed");
  assert.equal(reconciled.likelyPresent, true);
  assert.equal(reconciled.acceptControlObserved, true);
  assert.equal(reconciled.rejectControlObserved, true);
  assert.equal(reconciled.managePreferencesControlObserved, true);
  assert.equal(reconciled.controls.length, 4);
  assert.ok(reconciled.basis.includes("geometry:did_not_corroborate_structured_controls"));
});

test("visible and accessible intent conflicts keep the affected control unknown", () => {
  const current = {
    ...rapidOxfamStyleObservation,
    inventoryOutcome: "complete_with_controls" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const, "accessibility_tree" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    controls: rapidOxfamStyleObservation.controls.map((control) =>
      control.actionType === "reject_all"
        ? { ...control, label: "Reject all optional data processing and close this banner" }
        : control
    ),
  };
  const conflictGeometry = oxfamStyleGeometry();
  const template = conflictGeometry.candidates[0]!;
  conflictGeometry.candidates = [{
    ...template,
    candidateId: "candidate_conflict",
    label: "Do Not Sell or Share My Personal Information",
    normalizedLabel: "do not sell or share my personal information",
    actionType: "other",
    ariaLabel: "Reject all optional data processing and close this banner",
    classifierReasonCodes: [
      "visible_accessible_intent_conflict",
      "visible_intent_privacy_opt_out",
      "accessible_intent_reject",
    ],
    classifierConfidence: 0.5,
    decisionStatus: "ambiguous",
    reasons: ["unclassified_control"],
  }];
  conflictGeometry.summary.limitations = ["visible_accessible_intent_conflict"];

  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    artifactPath: "/tmp/ConsentControlGeometryEvidence.json",
    current,
    geometry: conflictGeometry,
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.captureStatus, "incomplete");
  assert.equal(reconciled.inventoryOutcome, "partial");
  assert.equal(reconciled.acceptControlObserved, true);
  assert.equal(reconciled.rejectControlObserved, false);
  assert.equal(reconciled.managePreferencesControlObserved, true);
  assert.equal(
    reconciled.controls.some((control) =>
      control.actionType === "other" &&
      control.classifierReasonCodes?.includes("visible_accessible_intent_conflict")
    ),
    true,
  );
  assert.equal(reconciled.basis.includes("geometry:visible_accessible_intent_conflict"), true);
});

test("same-document empty geometry completes an explicitly empty DOM inventory", () => {
  const current = {
    ...rapidOxfamStyleObservation,
    documentUrl: "https://www.oxfamamerica.org/",
    captureStatus: "no_evidence" as const,
    inventoryOutcome: "complete_empty" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: false,
    basis: ["settled_control_inventory_completed"],
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    inventoryDiagnostics: {
      candidateContainerCount: 1,
      candidateControlCount: 1,
      retainedControlCount: 0,
      inventorySources: [],
      candidateLabels: ["Allow All"],
      rejectionReasons: ["hidden"],
      timingMarkers: ["rapid_inventory_post_settle_completed"],
    },
  };

  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current,
    geometry: oxfamStyleGeometry(),
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.inventoryOutcome, "complete_empty");
  assert.deepEqual(reconciled.captureDiagnostics?.completedChannels, ["dom_inventory", "geometry"]);
  assert.equal(reconciled.basis.includes("geometry:hidden_cmp_markup_separated_from_visible_surface"), true);
});

test("completed same-document geometry reconciles a previously unavailable empty inventory", () => {
  const current = {
    ...rapidOxfamStyleObservation,
    documentUrl: "https://www.oxfamamerica.org/",
    captureStatus: "no_evidence" as const,
    inventoryOutcome: "geometry_unavailable" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: false,
    basis: ["settled_control_inventory_completed", "geometry:incomplete_not_authoritative"],
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
  };

  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current,
    geometry: oxfamStyleGeometry(),
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.inventoryOutcome, "complete_empty");
  assert.deepEqual(reconciled.captureDiagnostics?.completedChannels, ["dom_inventory", "geometry"]);
  assert.equal(reconciled.basis.includes("geometry:no_visible_first_layer_controls"), true);
});

test("completed settled geometry separates hidden CMP markup from a visible consent surface", () => {
  const current = {
    ...rapidOxfamStyleObservation,
    documentUrl: "https://www.oxfamamerica.org/",
    captureStatus: "observed" as const,
    inventoryOutcome: "complete_empty" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const, "accessibility_tree" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: true,
    basis: [
      "settled_control_inventory_completed",
      "canonical_consent_control:en:accept:allow all",
    ],
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    inventoryDiagnostics: {
      candidateContainerCount: 1,
      candidateControlCount: 1,
      retainedControlCount: 0,
      inventorySources: [],
      candidateLabels: ["Allow All"],
      rejectionReasons: ["hidden"],
      timingMarkers: ["rapid_inventory_post_settle_completed"],
    },
  };

  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current,
    geometry: oxfamStyleGeometry(),
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.captureStatus, "no_evidence");
  assert.equal(reconciled.likelyPresent, false);
  assert.equal(reconciled.inventoryOutcome, "complete_empty");
  assert.deepEqual(
    reconciled.captureDiagnostics?.completedChannels,
    ["dom_inventory", "accessibility_tree", "geometry"],
  );
  assert.equal(
    reconciled.basis.includes("geometry:hidden_cmp_markup_separated_from_visible_surface"),
    true,
  );
});

test("completed geometry preserves a visible non-actionable consent surface", () => {
  const geometry = oxfamStyleGeometry();
  geometry.containers = [{
    containerId: "container_notice",
    selectorHint: "#onetrust-banner-sdk",
    layer: "first_layer",
    textExcerpt: "Cookie notice",
    htmlExcerpt: "<div>Cookie notice</div>",
    boundingBox: {
      x: 0,
      y: 650,
      width: 1366,
      height: 250,
      top: 650,
      right: 1366,
      bottom: 900,
      left: 0,
    },
    intersectsViewport: true,
  }];
  const current = {
    ...rapidOxfamStyleObservation,
    captureStatus: "observed" as const,
    inventoryOutcome: "complete_empty" as const,
    captureDiagnostics: {
      completedChannels: ["dom_inventory" as const],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: true,
    basis: ["settled_control_inventory_completed"],
    visibleChoiceLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
  };

  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current,
    geometry,
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfamamerica.org/",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.captureStatus, "observed");
  assert.equal(reconciled.likelyPresent, true);
  assert.equal(reconciled.basis.includes("geometry:no_visible_first_layer_controls"), true);
});

test("non-rendered script consent words do not create a visible consent surface", async () => {
  const server = await startServer(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <main>
          <h1>News homepage</h1>
          <p>Current reporting and analysis.</p>
        </main>
        <script type="application/json">
          {
            "cookie": "cookie consent",
            "controls": ["accept all", "reject all", "manage preferences"]
          }
        </script>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-script-only-consent-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 6_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "never",
      waitMode: "fast",
    });

    const observation = result.consentUiObservations[0];
    assert.ok(observation);
    assert.equal(observation.documentUrl, server.url);
    assert.equal(observation.likelyPresent, false);
    assert.equal(observation.controls.length, 0);
    assert.equal(observation.acceptControlObserved, false);
    assert.equal(observation.rejectControlObserved, false);
    assert.equal(observation.managePreferencesControlObserved, false);
    assert.doesNotMatch(observation.textExcerpt, /accept all|reject all|manage preferences/i);
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("geometry from a different final document marks coverage incomplete without erasing structured evidence", () => {
  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current: rapidOxfamStyleObservation,
    geometry: oxfamStyleGeometry(),
    geometryAccessLoaded: true,
    pageUrl: "https://www.oxfam.org/en",
    scanStartedAtMs: Date.now() - 10_000,
  });

  assert.equal(reconciled.captureStatus, "incomplete");
  assert.equal(reconciled.inventoryOutcome, "document_mismatch");
  assert.equal(reconciled.likelyPresent, true);
  assert.equal(reconciled.controls.length, 4);
  assert.ok(reconciled.basis.includes("geometry:document_mismatch_not_authoritative"));
});

test("pre-consent scanner recaptures below-fold consent geometry before proof screenshot", async () => {
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 2200px; font-family: sans-serif; }
          main { height: 1100px; padding: 32px; }
          .cookie-banner {
            position: absolute;
            top: 1220px;
            left: 120px;
            width: 900px;
            padding: 24px;
            background: #fff;
            border: 1px solid #333;
          }
          .cookie-banner button { margin-right: 12px; padding: 12px 18px; }
        </style>
      </head>
      <body>
        <main><h1>Below fold consent fixture</h1></main>
        <section class="cookie-banner" role="dialog" aria-label="Cookie consent">
          <p>We use cookies for analytics and advertising. Manage your privacy preferences.</p>
          <button>Manage Preferences</button>
          <button>Reject All Non-Required</button>
          <button>Accept All</button>
        </section>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-below-fold-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.ok(
      result.screenshots.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent_geometry_proof"),
      JSON.stringify(result.moduleRun.timingBreakdown, null, 2),
    );

    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    assert.equal(
      geometry.summary.limitations.includes("recapture:bounded_scroll_to_below_fold_first_layer_controls"),
      true,
    );
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent scanner scrolls within the same first-layer panel and retains controls from both views", async () => {
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); }
          .cookie-panel {
            position: fixed;
            left: 260px;
            top: 90px;
            width: 720px;
            height: 390px;
            overflow-y: auto;
            padding: 24px;
            background: white;
          }
          .purpose { height: 220px; }
          button { display: block; width: 100%; margin: 12px 0; padding: 14px; }
        </style>
      </head>
      <body>
        <div class="backdrop"></div>
        <section class="cookie-panel" role="dialog" aria-modal="true" aria-label="Cookie settings">
          <h2>Cookie settings</h2>
          <p>Choose how optional analytics and advertising cookies may be used.</p>
          <button id="preferences">Individual preferences</button>
          <div class="purpose">Optional purpose controls and descriptions</div>
          <button id="accept-all">Accept all cookies</button>
          <button id="essential-only">Accept only essential cookies</button>
        </section>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-internal-scroll-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 9_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "never",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    assert.equal(
      geometry.summary.limitations.includes("recapture:bounded_internal_scroll_to_first_layer_controls"),
      true,
    );
    assert.ok(
      geometry.candidates.some((candidate) =>
        candidate.label === "Individual preferences" &&
        candidate.decisionStatus === "confirmed_visible"
      ),
    );
    assert.ok(
      geometry.candidates.some((candidate) =>
        candidate.label === "Accept only essential cookies" &&
        candidate.decisionStatus === "confirmed_visible"
      ),
    );
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent scanner retains a proof screenshot for deeply nested animated Borlabs controls", async () => {
  const wrappers = Array.from({ length: 12 }, () => "<div class=\"brlbs-wrapper\">").join("");
  const closers = "</div>".repeat(12);
  const consentMarkup = `${wrappers}
    <div class="overlay">
      <section class="dialog" role="alertdialog" aria-modal="true" aria-label="Data protection preference">
        <p>We need your consent before you can continue. We use cookies for analytics and advertising.</p>
        <button>Accept all</button>
        <button>Save consent</button>
        <button>Accept essential cookies</button>
        <button>Individual preferences</button>
      </section>
    </div>
  ${closers}`;
  const navigationLinks = Array.from(
    { length: 900 },
    (_, index) => `<a href="/navigation-${index}">Navigation ${index}</a>`,
  ).join("");
  const server = await startServer(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; min-height: 1200px; font-family: sans-serif; }
          #BorlabsCookieBox .overlay { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,.5); }
          #BorlabsCookieBox .dialog { position: absolute; left: 360px; top: 160px; width: 620px; padding: 24px; background: white; }
          #BorlabsCookieBox button { display: block; width: 100%; margin-top: 12px; padding: 12px; }
        </style>
      </head>
      <body>
        <nav>${navigationLinks}</nav>
        <main><h1>SITS-style fixture</h1></main>
        <div id="BorlabsCookieBox" data-borlabs-cookie-consent-required="true"></div>
        <script>
          window.BorlabsCookie = { Consents: {} };
          window.setTimeout(() => {
            document.querySelector("#BorlabsCookieBox").innerHTML = ${JSON.stringify(consentMarkup)};
          }, 2200);
        </script>
      </body>
    </html>
  `);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-borlabs-geometry-"));
  try {
    const artifactWriter = await createArtifactWriter(path.join(tempRoot, "out"));
    const result = await preConsentRuntimeScanner({
      url: server.url,
      normalizedUrl: server.url,
      scanStartedAtMs: Date.now(),
      internalBudgetMs: 8_000,
      artifactWriter,
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      waitMode: "fast",
    });

    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.equal(
      result.moduleRun.timingBreakdown?.find((entry) => entry.label === "early screenshot capture")?.outcome,
      "completed",
    );
    assert.equal(result.consentUiObservations[0]?.acceptControlObserved, true);
    assert.equal(result.consentUiObservations[0]?.rejectControlObserved, true);
    assert.equal(result.consentUiObservations[0]?.managePreferencesControlObserved, true);
    assert.ok(
      result.consentUiObservations[0]?.basis.includes("geometry:confirmed_first_layer_controls"),
      JSON.stringify(result.consentUiObservations[0], null, 2),
    );
    assert.ok(
      result.consentUiObservations[0]?.basis.includes("geometry:confirmed_first_layer_controls"),
      JSON.stringify(result.consentUiObservations[0], null, 2),
    );
    assert.deepEqual(
      result.consentUiObservations[0]?.controls.map((control) => control.label).sort(),
      ["Accept all", "Accept essential cookies", "Individual preferences", "Save consent"].sort(),
    );
    assert.ok(
      result.screenshots.some((screenshot) =>
        screenshot.artifactId === "screenshot_pre_consent_geometry_proof" ||
        screenshot.artifactId === "screenshot_pre_consent_cmp_controls"
      ),
      JSON.stringify(result.moduleRun.timingBreakdown, null, 2),
    );

    const geometry = JSON.parse(
      await readFile(path.join(tempRoot, "out", "ConsentControlGeometryEvidence.json"), "utf8"),
    ) as ConsentControlGeometryArtifact;
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    const acceptControl = geometry.candidates.find((candidate) => candidate.actionType === "accept_all");
    assert.match(
      acceptControl?.screenshotArtifactRef ?? "",
      /screenshot-pre-consent-(?:geometry-proof|cmp-controls)\.png$/,
    );
  } finally {
    await closeServer(server.server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function startServer(body: string): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
