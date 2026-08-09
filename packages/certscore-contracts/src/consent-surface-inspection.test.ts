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

test("verified empty consent evidence remains complete through non-terminal scan diagnostics", () => {
  const input = baseInput();
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    limitationKeys: ["scan_no_go_diagnostics"],
    notes: ["Potential no-go evidence was contradicted by retained normal-site evidence."],
  };
  input.scanNoGoDecision = "continue_with_diagnostics";
  input.screenshots = [{
    artifactId: "screenshot_pre_consent_settled",
    capturedAtMs: 950,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "/bounded/settled.png",
    url: "https://example.test/",
  }];
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "accessibility_tree", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    layerInspected: "first_layer",
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.equal(outcome.limitationKeys.includes("scan_no_go_diagnostics"), false);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.status, "observed");
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

test("independent typed DOM and geometry recovery completes consent inspection without upgrading general runtime coverage", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial", "consent_ui_capture_timed_out"],
  };
  input.screenshots = [{
    artifactId: "screenshot_pre_consent_independent_recovery",
    capturedAtMs: 950,
    captureMethod: "independent_visual_fallback_viewport",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "/bounded/independent-recovery.png",
    url: "https://example.test/",
  }];
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    documentUrl: "https://example.test/",
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    basis: [
      "settled_control_inventory_completed",
      "geometry:captured",
      "recovery:independent_consent_capture_completed",
    ],
    layerInspected: "first_layer",
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(input.runtimeCoverage.coverageStatus, "limited_partial");
  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "page_script_inventory")?.status, "observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.status, "observed");
  assert.equal(outcome.limitationKeys.includes("consent_surface_inspection_runtime_partial"), false);
});

test("bounded same-session empty packet completes canonical negative inspection", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial", "consent_ui_capture_timed_out"],
  };
  input.screenshots = [{
    artifactId: "screenshot_pre_consent_packet_recovery",
    capturedAtMs: 950,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "/bounded/recovery.png",
    url: "https://example.test/",
  }];
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    documentUrl: "https://example.test/",
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    boundedSameSessionRecoveryOutcome: "completed",
    basis: ["recovery:bounded_same_session_consent_packet_completed"],
    layerInspected: "first_layer",
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.deepEqual(outcome.limitationKeys, []);
});

test("bounded same-session empty packet stays limited when its screenshot is document-mismatched", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial"],
  };
  input.screenshots = [{
    artifactId: "screenshot_pre_consent_packet_recovery",
    capturedAtMs: 950,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "/bounded/recovery.png",
    url: "https://other-document.test/",
  }];
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    documentUrl: "https://example.test/",
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    boundedSameSessionRecoveryOutcome: "completed",
    basis: ["recovery:bounded_same_session_consent_packet_completed"],
    layerInspected: "first_layer",
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.inspectionCompleted, false);
});

test("verified complete-empty consent proof is not limited by unrelated runtime diagnostics", () => {
  const input = baseInput();
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["cmp_runtime_without_actionable_surface"],
  };
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    layerInspected: "first_layer",
    basis: ["settled_control_inventory_completed", "geometry:captured"],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "no_surface_observed_complete_coverage");
  assert.equal(outcome.coverageStatus, "complete");
  assert.deepEqual(outcome.limitationKeys, []);
});

test("verified empty consent proof does not erase a no-go limitation", () => {
  const input = baseInput();
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["scan_no_go_diagnostics"],
  };
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "no_evidence",
    inventoryOutcome: "complete_empty",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    layerInspected: "first_layer",
    basis: ["settled_control_inventory_completed", "geometry:captured"],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.limitationKeys.includes("scan_no_go_diagnostics"), true);
});

test("corroborated positive DOM and accessibility capture completes a partial consent lane without requiring geometry", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial", "consent_control_geometry_unavailable"],
  };
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "observed",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "accessibility_tree"],
      timedOutChannels: [],
      failedChannels: [],
    },
    basis: ["inventory:direct_cmp_semantic_controls", "inventory:accessibility_tree_controls"],
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["Accept All", "Show Purposes"],
    acceptControlObserved: true,
    managePreferencesControlObserved: true,
    controls: [
      { actionType: "accept_all", classifierReasonCodes: ["canonical_match"], label: "Accept All", visible: true },
      { actionType: "manage_preferences", classifierReasonCodes: ["canonical_match"], label: "Show Purposes", visible: true },
    ],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(input.runtimeCoverage.coverageStatus, "limited_partial");
  assert.equal(outcome.outcome, "actionable_surface_observed");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "page_script_inventory")?.status, "observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "accessibility_tree")?.status, "observed");
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.status, "not_observed");
  assert.equal(outcome.limitationKeys.includes("consent_surface_inspection_runtime_partial"), false);
});

test("same-document DOM and geometry complete a positive inventory without duplicate accessibility capture", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial", "scan_no_go_diagnostics"],
  };
  input.scanNoGoDecision = "continue_with_diagnostics";
  input.screenshots = [{
    artifactId: "screenshot_pre_consent_cmp_controls",
    capturedAtMs: 950,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "/bounded/controls.png",
    url: "https://example.test/",
  }];
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "observed",
    inventoryOutcome: "complete_with_controls",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    basis: ["settled_control_inventory_completed", "geometry:confirmed_first_layer_controls"],
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["Accept", "Decline"],
    acceptControlObserved: true,
    rejectControlObserved: true,
    controls: [
      { actionType: "accept_all", classifierReasonCodes: ["canonical_match"], label: "Accept", visible: true },
      { actionType: "reject_all", classifierReasonCodes: ["canonical_match"], label: "Decline", visible: true },
    ],
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "actionable_surface_observed");
  assert.equal(outcome.coverageStatus, "complete");
  assert.equal(outcome.inspectionCompleted, true);
  assert.equal(outcome.limitationKeys.includes("scan_no_go_diagnostics"), false);
  assert.equal(outcome.evidenceChannels.find((channel) => channel.channel === "geometry")?.status, "observed");
});

test("DOM and geometry do not complete a positive inventory while a relevant frame remains inaccessible", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial"],
  };
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "observed",
    inventoryOutcome: "frame_inaccessible",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      timedOutChannels: [],
      failedChannels: [],
    },
    likelyPresent: true,
    layerInspected: "first_layer",
    acceptControlObserved: true,
    controls: [{ actionType: "accept_all", classifierReasonCodes: ["canonical_match"], label: "Accept", visible: true }],
    inventoryDiagnostics: {
      candidateContainerCount: 1,
      candidateControlCount: 1,
      retainedControlCount: 1,
      inspectedFrameCount: 2,
      inaccessibleFrameCount: 1,
      blockingInaccessibleFrameCount: 1,
      nonBlockingInaccessibleFrameCount: 0,
      nonBlockingInaccessibleFrameReasonCodes: [],
      inventorySources: ["viewport"],
      candidateLabels: ["Accept"],
      rejectionReasons: ["frame_inaccessible"],
      timingMarkers: [],
    },
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "actionable_surface_observed");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.inspectionCompleted, false);
});

test("corroborating inventory channels do not complete a partial negative consent lane without geometry", () => {
  const input = baseInput();
  input.modulesRun![0]!.status = "partial";
  input.runtimeCoverage = {
    ...input.runtimeCoverage!,
    coverageStatus: "limited_partial",
    limitationKeys: ["pre_consent_runtime_partial"],
  };
  input.consentUiObservations![0] = {
    ...input.consentUiObservations![0]!,
    captureStatus: "no_evidence",
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "accessibility_tree"],
      timedOutChannels: [],
      failedChannels: [],
    },
  };

  const outcome = deriveConsentSurfaceInspectionOutcome(input);

  assert.equal(outcome.outcome, "indeterminate_limited_coverage");
  assert.equal(outcome.coverageStatus, "limited");
  assert.equal(outcome.inspectionCompleted, false);
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
