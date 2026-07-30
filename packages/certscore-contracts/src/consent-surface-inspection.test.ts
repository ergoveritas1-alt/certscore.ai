import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentSurfaceInspectionOutcome } from "./index";

function baseInput(): Parameters<typeof deriveConsentSurfaceInspectionOutcome>[0] {
  return {
    cmpRuntimeObservations: [],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 900,
      likelyPresent: false,
      basis: ["insufficient_banner_keywords", "settled_control_inventory_completed"],
      layerInspected: "unknown" as const,
      visibleChoiceLabels: [],
      defaultTogglePurposeLabels: [],
      precheckedOptionalPurposeCount: 0,
      precheckedOptionalPurposeLabels: [],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: false,
      controls: [],
      impliedConsentLanguageObserved: false,
      impliedConsentLanguageEvidence: [],
      evidenceRefs: [],
      confidence: 0.8
    }],
    domSnapshots: [{
      artifactId: "dom_pre_consent",
      capturedAtMs: 900,
      consentStateAtTime: "pre_consent" as const,
      pagePhase: "dom_content_loaded" as const,
      path: "/bounded/dom.json",
      url: "https://example.test/"
    }],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed" as const,
      startedAt: "2026-07-13T00:00:00.000Z",
      completedAt: "2026-07-13T00:00:01.000Z",
      evidenceRefs: [],
      errors: []
    }],
    runtimeCoverage: {
      coverageStatus: "usable" as const,
      limitationKeys: [],
      fallbackModesUsed: [],
      observationCounts: {
        networkEvents: 2,
        thirdPartyRequests: 1,
        cookieEvents: 0,
        cookiesBeforeConsent: 0,
        normalizedVendors: 1,
        observedJourneys: 1
      },
      silentEmpty: false,
      notes: []
    },
    screenshots: [],
    visualCapture: undefined
  };
}

test("complete bounded inspection can retain that no consent surface was observed", () => {
  const outcome = deriveConsentSurfaceInspectionOutcome(baseInput());

  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.equal(outcome.observedAtMs, 900);
  assert.equal(outcome.evidenceChannels.length, 7);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "dom_snapshot")?.status, "not_observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "navigation_network")?.status, "not_observed");
});

test("an ambiguous OK acknowledgment retains a non-actionable consent surface", () => {
  const input = baseInput();
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["OK"],
    acceptControlObserved: false,
    textExcerpt: "By using this site you agree to analytics cookies.",
    controls: [{
      label: "OK",
      actionType: "accept_all",
      semanticRole: "ambiguous_acknowledgment",
      confidence: 0.52,
      visible: true
    }],
    impliedConsentLanguageObserved: true,
    impliedConsentLanguageEvidence: [{
      classifierId: "implied_consent.by_using_agree",
      matchedExcerpt: "By using this site you agree to analytics cookies.",
      confidence: 0.9,
      observedLayer: "first_layer",
      observedAtMs: 900,
      sourceArtifactRef: "fixture:consent-banner"
    }]
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);
  assert.equal(outcome.consentSurfaceObserved, true);
  assert.equal(outcome.actionableControlObserved, false);
  assert.equal(outcome.outcome, "non_actionable_surface_observed");
});

test("CMP runtime identity alone does not confirm a visible consent surface", () => {
  const input = baseInput();
  input.visualCapture = {
    status: "available",
    captureMethod: "primary_full_page",
    artifactRefs: [],
    notes: []
  };
  input.cmpRuntimeObservations = [{
    observationId: "cmp-hubspot",
    observedAtMs: 700,
    sourceScanner: "preConsentRuntimeScanner",
    scenario: "cmp_runtime_signal",
    consentStateAtTime: "pre_consent",
    entity: "hubspot",
    vendor: "HubSpot",
    product: "HubSpot Banner",
    signals: [],
    evidenceRefs: [],
    confidence: 0.97,
    directVsInferred: "direct"
  }];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.consentSurfaceObserved, false);
  assert.equal(outcome.actionableControlObserved, false);
  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
});

test("timeout evidence prevents absence from becoming a complete negative observation", () => {
  const input = baseInput();
  input.consentUiObservations![0]!.basis = ["bounded_capture_timeout_or_failure"];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
});

test("completed recapture after an earlier timeout can retain a complete negative observation", () => {
  const input = baseInput();
  input.consentUiObservations![0]!.basis = [
    "insufficient_banner_keywords",
    "recapture:post_timeout_completed_without_first_layer_controls",
    "settled_control_inventory_completed",
  ];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
});

test("missing settled inventory keeps a negative observation indeterminate", () => {
  const input = baseInput();
  input.consentUiObservations![0]!.basis = ["insufficient_banner_keywords"];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.ok(outcome.limitationKeys.includes("consent_surface_inspection_settled_inventory_missing"));
});

test("inventory probe failure cannot establish that a consent surface is absent", () => {
  const input = baseInput();
  input.consentUiObservations![0]!.basis = [
    "inventory:probe_failed",
    "insufficient_banner_keywords",
  ];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.ok(outcome.limitationKeys.includes("consent_surface_inspection_observation_incomplete"));
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "page_script_inventory")?.status, "inspection_incomplete");
});

test("unavailable main-frame geometry cannot establish that a consent surface is absent", () => {
  const input = baseInput();
  input.consentUiObservations![0]!.basis = [
    "geometry_capture_unavailable",
    "settled_control_inventory_completed",
  ];

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.ok(outcome.limitationKeys.includes("consent_surface_inspection_observation_incomplete"));
});

test("canonical first-layer controls establish an actionable surface without CMP identity", () => {
  const input = baseInput();
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["Reject all"],
    rejectControlObserved: true,
    controls: [{
      actionType: "reject_all",
      classifierReasonCodes: ["canonical_match"],
      label: "Reject all",
      visible: true
    }]
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "actionable_surface_observed");
  assert.equal(outcome.actionableControlObserved, true);
  assert.equal(outcome.observedAtMs, 900);
});

test("completed DOM controls remain actionable when the independent accessibility channel times out", () => {
  const input = baseInput();
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "observed",
    captureDiagnostics: {
      completedChannels: ["dom_inventory"],
      timedOutChannels: ["accessibility_tree"],
      failedChannels: [],
    },
    basis: [
      "inventory:rapid_first_layer_controls",
      "inventory:accessibility_tree_timed_out",
    ],
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["Accept", "Decline", "Customise"],
    acceptControlObserved: true,
    rejectControlObserved: true,
    managePreferencesControlObserved: true,
    controls: [
      { actionType: "accept_all", classifierReasonCodes: ["canonical_match"], label: "Accept", visible: true },
      { actionType: "reject_all", classifierReasonCodes: ["canonical_match"], label: "Decline", visible: true },
      { actionType: "manage_preferences", classifierReasonCodes: ["canonical_match"], label: "Customise", visible: true },
    ],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "actionable_surface_observed");
  assert.equal(outcome.actionableControlObserved, true);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "page_script_inventory")?.status, "observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "accessibility_tree")?.status, "inspection_incomplete");
});

test("captured geometry remains an observed evidence channel when AX owns classification", () => {
  const input = baseInput();
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    basis: ["inventory:accessibility_tree", "geometry:captured"],
    likelyPresent: true,
    layerInspected: "first_layer",
    acceptControlObserved: true,
    controls: [{
      actionType: "accept_all",
      classifierReasonCodes: ["canonical_match"],
      label: "Accept all",
      visible: true,
    }],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.status, "observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.evidenceCount, 1);
});
