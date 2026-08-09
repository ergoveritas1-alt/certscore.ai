import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveMaterializedConsentControlAssessment, deriveWs01ConsentControlAssessment } from "./consent-control-assessment-projector";

function bundle(
  controls: Array<Record<string, unknown>>,
  options: {
    captureStatus?: "observed" | "no_evidence" | "incomplete";
    defaultToggleStatesObserved?: boolean | null;
    likelyPresent?: boolean;
    nonEssentialDefaultsOff?: boolean | null;
    precheckedOptionalPurposeCount?: number;
    url?: string;
  } = {},
) {
  const url = options.url ?? "https://oxfam.org/en";
  return {
    scanId: "scan-oxfam-fixture",
    schemaVersion: "2.0",
    completedAt: "2026-07-27T18:04:10.000Z",
    url,
    normalizedUrl: url,
    domSnapshots: [{
      artifactId: "dom-pre-consent",
      capturedAtMs: 6_500,
      consentStateAtTime: "pre_consent",
      pagePhase: "settled",
      path: "artifacts/dom-pre-consent.json",
      url,
    }],
    consentUiObservations: [{
      observationId: "consent-ui-pre-consent",
      observedAtMs: 6_500,
      likelyPresent: options.likelyPresent ?? true,
      layerInspected: "first_layer",
      captureStatus: options.captureStatus ?? "observed",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        failedChannels: [],
        timedOutChannels: [],
      },
      defaultToggleStatesObserved: options.defaultToggleStatesObserved,
      nonEssentialDefaultsOff: options.nonEssentialDefaultsOff,
      precheckedOptionalPurposeCount: options.precheckedOptionalPurposeCount,
      controls,
      evidenceRefs: [],
    }],
  } as unknown as CanonicalEvidenceBundle;
}

function completeInspection(outcome: string, observed: boolean) {
  return {
    actionableControlObserved: observed,
    consentSurfaceObserved: observed,
    coverageStatus: "complete",
    evidenceChannels: [{
      channel: "page_script_inventory",
      status: observed ? "observed" : "not_observed",
    }],
    inspectionCompleted: true,
    limitationKeys: [],
    observedAtMs: 6_500,
    outcome,
  };
}

function geometry(candidates: Array<Record<string, unknown>>, summary: {
  firstLayerAccept: boolean;
  firstLayerReject: boolean;
  firstLayerOptions: boolean;
  limitations?: string[];
} = {
  firstLayerAccept: true,
  firstLayerReject: true,
  firstLayerOptions: true,
}) {
  return {
    artifactVersion: "2.0",
    observedAtMs: 8_700,
    pageUrl: "https://oxfam.org/en",
    candidates,
    summary: {
      cmpDetected: true,
      cmpName: "Drupal EU Cookie Compliance",
      confidence: 0.96,
      ...summary,
    },
  };
}

test("Oxfam A/R/O remains observed when a later same-document state is collapsed", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Accept only essential cookies", visible: true, layer: "first_layer" },
      { actionType: "manage_preferences", label: "Cookie Settings", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.artifactVersion, "2.0");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("limited coordinator coverage preserves observed controls without certifying the inventory", () => {
  const url = "https://site-under-test.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Decline", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Customise", visible: true, layer: "first_layer" },
  ], { url });
  source.domSnapshots = [];
  source.screenshots = [{
    artifactId: "screenshot-pre-consent",
    capturedAtMs: 6_400,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    path: "artifacts/screenshot-pre-consent.png",
    url,
  }];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: [],
    timedOutChannels: ["accessibility_tree"],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "accessibility_tree", status: "inspection_incomplete" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["accessibility_inventory_incomplete"],
      observedAtMs: 6_500,
      outcome: "actionable_surface_observed",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.coverage.requiredChannels, ["dom_inventory", "geometry"]);
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("limited coordinator coverage keeps an empty first-layer inventory unknown", () => {
  const url = "https://non-actionable.example/";
  const source = bundle([], { url });
  source.consentUiObservations[0]!.layerInspected = "unknown";
  source.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "accessibility_tree", status: "observed" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["cmp_runtime_without_actionable_surface"],
      observedAtMs: 6_500,
      outcome: "non_actionable_surface_observed",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("an incomplete inventory paired to the final settled frame invalidates an earlier empty inventory", () => {
  const url = "https://settled-frame-incomplete.example/";
  const source = bundle([], {
    captureStatus: "no_evidence",
    likelyPresent: false,
    url,
  });
  source.consentUiObservations[0]!.basis = [
    "settled_control_inventory_completed",
    "recapture:paired_settled_frame_inventory_incomplete",
  ];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: false,
        firstLayerReject: false,
        firstLayerOptions: false,
        cmpDetected: false,
        confidence: 0,
        limitations: ["Main-frame consent geometry was unavailable."],
      },
      viewport: { width: 0, height: 0 },
      candidates: [],
    },
    consentSurfaceInspection: null,
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("a later verified same-session packet supersedes historical incomplete inventory diagnostics", () => {
  const url = "https://recovered-packet.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Settings", visible: true, layer: "first_layer" },
  ], { url });
  source.screenshots = [{
    artifactId: "screenshot_pre_consent_packet_recovery",
    capturedAtMs: 6_490,
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "artifacts/recovery.png",
    url,
  }];
  source.consentUiObservations[0]!.documentUrl = url;
  source.consentUiObservations[0]!.inventoryOutcome = "complete_with_controls";
  source.consentUiObservations[0]!.boundedSameSessionRecoveryOutcome = "completed";
  source.consentUiObservations[0]!.basis = [
    "recapture:post_settle_inventory_incomplete",
    "geometry_capture_unavailable",
    "recovery:bounded_same_session_consent_packet_completed",
  ];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: true,
        firstLayerReject: false,
        firstLayerOptions: true,
        cmpDetected: true,
        confidence: 0.9,
        limitations: [],
      },
      viewport: { width: 1440, height: 900 },
      candidates: [],
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("a relevant inaccessible frame remains fail-closed despite observed controls and geometry", () => {
  const url = "https://blocking-frame.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Decline", visible: true, layer: "first_layer" },
  ], { url });
  source.consentUiObservations[0]!.inventoryOutcome = "frame_inaccessible";
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  source.consentUiObservations[0]!.inventoryDiagnostics = {
    candidateContainerCount: 1,
    candidateControlCount: 2,
    retainedControlCount: 2,
    inspectedFrameCount: 2,
    inaccessibleFrameCount: 1,
    blockingInaccessibleFrameCount: 1,
    nonBlockingInaccessibleFrameCount: 0,
    nonBlockingInaccessibleFrameReasonCodes: [],
    inventorySources: ["viewport"],
    candidateLabels: ["Accept", "Decline"],
    rejectionReasons: ["frame_inaccessible"],
    timingMarkers: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: url,
      summary: {
        firstLayerAccept: true,
        firstLayerReject: true,
        firstLayerOptions: false,
        cmpDetected: true,
        confidence: 0.9,
        limitations: [],
      },
      viewport: { width: 1440, height: 900 },
      candidates: [],
    },
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("limited no-evidence DOM inventory does not certify first-layer negatives", () => {
  const url = "https://no-banner.example/";
  const source = bundle([], {
    captureStatus: "no_evidence",
    likelyPresent: false,
    url,
  });
  source.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: [],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: false,
      coverageStatus: "limited",
      evidenceChannels: [{ channel: "page_script_inventory", status: "observed" }],
      inspectionCompleted: false,
      limitationKeys: ["network_cmp_inspection_incomplete"],
      observedAtMs: 6_500,
      outcome: "inspection_incomplete",
    },
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("a failed non-inventory channel does not erase completed typed A/R/O controls", () => {
  const url = "https://typed-controls.example/";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Reject", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Options", visible: true, layer: "first_layer" },
  ], { url });
  source.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: ["network_cmp"],
    timedOutChannels: [],
  };

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("complete dismiss-only inventory projects actionable surface with A/R/O not observed", () => {
  const url = "https://dismiss-only.example/";
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([{
      actionType: "other",
      artifactRef: "CanonicalEvidenceBundle.json#dismiss-close",
      classifierReasonCodes: ["matched_dismiss", "match_strength_direct"],
      label: "Close",
      layer: "first_layer",
      matchStrength: "direct",
      semanticRole: "dismiss",
      visible: true,
    }], { url }),
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: url,
    noGo: false,
    requestedUrl: url,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.coverage.status, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.evidence[0]?.intent, "dismiss");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("WS01 complete dismiss-only observation projects into ConsentControlAssessment v2", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    completedAt: "2026-08-02T21:06:48.000Z",
    firstLayerConsentChoices: {
      capturedAtMs: 7_501,
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://www.usccb.org/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "dismiss", label: "Close", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    requestedUrl: "https://usccb.org/",
    scanId: "scan-ws01-dismiss-only",
    scanStatus: "completed",
  });

  assert.ok(assessment);
  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.evidence[0]?.intent, "dismiss");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
  assert.equal(assessment.provenance.sourceBundleVersion, "ws01.hybrid_runtime_evidence.v1");
});

test("WS01 incomplete consent inventory does not create a canonical negative assessment", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    firstLayerConsentChoices: {
      capturedBeforeInteraction: true,
      controlInventoryComplete: false,
      documentUrl: "https://www.usccb.org/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "dismiss", label: "Close", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    scanId: "scan-ws01-incomplete",
    scanStatus: "completed",
  });

  assert.equal(assessment, null);
});

test("WS01 complete empty first-layer inventory projects binary not-observed controls", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    completedAt: "2026-08-05T22:00:00.000Z",
    firstLayerConsentChoices: {
      capturedAtMs: 8_000,
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      normalizedChoices: [],
      sameSurfaceCandidates: true,
    },
    requestedUrl: "https://example.test/",
    scanId: "scan-ws01-complete-empty",
    scanStatus: "completed",
  });

  assert.ok(assessment);
  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("WS01 malformed non-empty inventory fails closed instead of becoming complete empty", () => {
  const assessment = deriveWs01ConsentControlAssessment({
    firstLayerConsentChoices: {
      capturedBeforeInteraction: true,
      controlInventoryComplete: true,
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      normalizedChoices: [{ action: "accept", label: "", sameSurface: true }],
      sameSurfaceCandidates: true,
    },
    scanId: "scan-ws01-malformed-inventory",
    scanStatus: "completed",
  });

  assert.equal(assessment, null);
});

test("geometry projection retains inline and persistent options presentation", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Reject all cookies", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "inline-options",
        actionType: "manage_preferences",
        label: "Cookie Consent Tool",
        layer: "first_layer",
        presentationType: "inline_link",
        placementType: "action_cluster",
        enabled: true,
        decisionStatus: "confirmed_visible",
      },
      {
        candidateId: "footer-options",
        actionType: "manage_preferences",
        label: "Cookie Settings",
        layer: "footer",
        presentationType: "persistent_link",
        enabled: true,
        decisionStatus: "footer_or_policy_link",
      },
    ]),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "inline-options")?.presentationType,
    "inline_link",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "inline-options")?.placementType,
    "action_cluster",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "footer-options")?.presentationType,
    "persistent_link",
  );
  assert.equal(
    assessment.evidence.find((row) => row.evidenceId === "footer-options")?.layer,
    "deeper_layer",
  );
});

test("geometry projection carries a custom first-layer settings control into ConsentControlAssessment v2", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      { actionType: "accept_all", label: "Accept All", visible: true, layer: "first_layer" },
      { actionType: "reject_all", label: "Accept only essential", visible: true, layer: "first_layer" },
    ]),
    consentControlGeometryEvidence: geometry([{
      candidateId: "custom-settings",
      actionType: "manage_preferences",
      classifierReasonCodes: ["matched_options", "match_strength_direct", "context_satisfied"],
      label: "Cookie settings",
      layer: "first_layer",
      presentationType: "unknown",
      enabled: true,
      decisionStatus: "confirmed_visible",
    }]),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.options.state, "observed");
  const options = assessment.evidence.find((row) => row.evidenceId === "custom-settings");
  assert.equal(options?.intent, "options");
  assert.equal(options?.layer, "first_layer");
  assert.equal(options?.visible, true);
  assert.equal(options?.actionable, true);
});

test("geometry intent conflicts keep the assessment limited instead of proving reject absence", () => {
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Manage Preferences", visible: true, layer: "first_layer" },
    {
      actionType: "other",
      classifierReasonCodes: ["visible_accessible_intent_conflict"],
      label: "Do Not Sell or Share My Personal Information",
      visible: true,
      layer: "first_layer",
    },
  ], { captureStatus: "incomplete" });
  source.consentUiObservations[0]!.inventoryOutcome = "partial";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "intent-conflict",
        actionType: "other",
        classifierReasonCodes: ["visible_accessible_intent_conflict"],
        label: "Do Not Sell or Share My Personal Information",
        layer: "first_layer",
        enabled: true,
        decisionStatus: "ambiguous",
      },
    ], {
      firstLayerAccept: true,
      firstLayerReject: false,
      firstLayerOptions: true,
      limitations: ["visible_accessible_intent_conflict"],
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "observed");
});

test("CNN retained geometry keeps an explicitly inventoried missing reject as not_observed", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "accept_all",
        label: "Accept All",
        matchedTerm: "accept all",
        matchedLocale: "en",
        visible: true,
        layer: "first_layer",
      },
      {
        actionType: "manage_preferences",
        label: "Show Purposes, Opens the preference center dialog",
        matchedTerm: "preference center",
        matchedLocale: "en",
        visible: true,
        layer: "first_layer",
      },
    ], { captureStatus: "incomplete", url: "https://edition.cnn.com/" }),
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: "https://edition.cnn.com/",
      observedAtMs: 0,
      candidates: [
        {
          candidateId: "candidate_1",
          actionType: "accept_all",
          label: "Accept All",
          layer: "first_layer",
          enabled: true,
          decisionStatus: "confirmed_visible",
        },
        {
          candidateId: "candidate_2",
          actionType: "manage_preferences",
          label: "Show Purposes, Opens the preference center dialog",
          layer: "first_layer",
          enabled: true,
          decisionStatus: "confirmed_visible",
        },
      ],
      summary: {
        firstLayerAccept: true,
        firstLayerReject: false,
        firstLayerOptions: true,
        cmpDetected: true,
        cmpName: "OneTrust",
        confidence: 0.89,
      },
    },
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "complete",
      inspectionCompleted: true,
      limitationKeys: ["pre_consent_runtime_incomplete"],
      observedAtMs: 26_870,
      outcome: "actionable_surface_observed",
    },
    finalUrl: "https://edition.cnn.com/",
    noGo: false,
    requestedUrl: "https://cnn.com/",
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.coverage.status, "complete");
});

test("CNN production artifact binds typed controls to the retained redirected screenshot document", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: {
      scanId: "scan_1785253386257_cnn.com",
      schemaVersion: "2.0",
      completedAt: "2026-07-28T15:43:41.691Z",
      url: "https://cnn.com/",
      normalizedUrl: "https://cnn.com/",
      domSnapshots: [],
      consentUiObservations: [{
        observationId: "consent_ui_pre_consent",
        observedAtMs: 16_194,
        captureStatus: "observed",
        captureDiagnostics: {
          completedChannels: [],
          timedOutChannels: [],
          failedChannels: [],
        },
        likelyPresent: true,
        basis: ["first_layer", "rapid_consent_surface"],
        layerInspected: "first_layer",
        controls: [
          {
            label: "Accept All",
            actionType: "accept_all",
            visible: true,
            layer: "first_layer",
            matchedTerm: "accept all",
            matchedLocale: "en",
            matchStrength: "direct",
            classifierReasonCodes: [],
          },
          {
            label: "Show Purposes, Opens the preference center dialog",
            actionType: "manage_preferences",
            visible: true,
            layer: "first_layer",
            matchedTerm: "preference center",
            matchedLocale: "en",
            matchStrength: "direct",
            classifierReasonCodes: [],
          },
        ],
      }],
      screenshots: [
        {
          artifactId: "screenshot-pre-consent-1",
          capturedAtMs: 11_636,
          captureMethod: "primary_viewport_fallback",
          path: "screenshots/pre-consent-1.png",
          url: "https://edition.cnn.com/",
          pagePhase: "pre_consent",
          consentStateAtTime: "pre_consent",
        },
        {
          artifactId: "screenshot-pre-consent-2",
          capturedAtMs: 29_670,
          captureMethod: "primary_viewport_fallback",
          path: "screenshots/pre-consent-2.png",
          url: "https://edition.cnn.com/",
          pagePhase: "pre_consent",
          consentStateAtTime: "pre_consent",
        },
      ],
    } as unknown as CanonicalEvidenceBundle,
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "limited",
      evidenceChannels: [
        { channel: "viewport_screenshot", status: "observed" },
        { channel: "page_script_inventory", status: "observed" },
        { channel: "cmp_runtime", status: "observed" },
        { channel: "dom_snapshot", status: "inspection_incomplete" },
        { channel: "geometry", status: "inspection_incomplete" },
      ],
      inspectionCompleted: false,
      limitationKeys: ["pre_consent_runtime_partial", "consent_surface_inspection_runtime_partial"],
      observedAtMs: 16_194,
      outcome: "actionable_surface_observed",
    },
    consentControlGeometryEvidence: {
      artifactVersion: "consent_control_geometry.v1",
      pageUrl: "https://cnn.com/",
      candidates: [],
    },
    finalUrl: "https://edition.cnn.com/",
    noGo: false,
    requestedUrl: "https://cnn.com/",
  });

  assert.equal(assessment.coverage.status, "limited");
  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, ["https://edition.cnn.com/"]);
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "unknown");
});

test("explicit observation document URL survives a requested-to-final redirect", () => {
  const requestedUrl = "https://redirect.example/";
  const finalUrl = "https://redirect.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
    { actionType: "reject_all", label: "Continue without accepting", visible: true, layer: "first_layer" },
    { actionType: "manage_preferences", label: "Personalise", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.domSnapshots[0]!.url = requestedUrl;
  source.consentUiObservations[0]!.documentUrl = finalUrl;

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, [finalUrl]);
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("earlier redirect-document controls do not poison a later completed final-document inventory", () => {
  const requestedUrl = "https://redirect-history.example/";
  const finalUrl = "https://redirect-history.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Continue", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.consentUiObservations[0]!.observedAtMs = 1_000;
  source.consentUiObservations[0]!.documentUrl = requestedUrl;
  source.consentUiObservations.push({
    ...source.consentUiObservations[0]!,
    observationId: "consent-ui-final-document",
    observedAtMs: 2_000,
    documentUrl: finalUrl,
    controls: [
      { actionType: "accept_all", classifierReasonCodes: [], label: "Accept", visible: true, layer: "first_layer" },
      { actionType: "reject_all", classifierReasonCodes: [], label: "Reject", visible: true, layer: "first_layer" },
      { actionType: "manage_preferences", classifierReasonCodes: [], label: "Options", visible: true, layer: "first_layer" },
    ],
  });

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, [finalUrl]);
  assert.equal(assessment.evidence.some((row) => row.label === "Continue"), false);
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
});

test("an explicit conflicting observation document fails closed despite a final-page screenshot", () => {
  const requestedUrl = "https://redirect.example/";
  const finalUrl = "https://redirect.example/gb";
  const source = bundle([
    { actionType: "accept_all", label: "Accept", visible: true, layer: "first_layer" },
  ], { url: requestedUrl });
  source.consentUiObservations[0]!.documentUrl = requestedUrl;
  source.screenshots = [{
    artifactId: "final-screenshot",
    capturedAtMs: 6_400,
    consentStateAtTime: "pre_consent",
    pagePhase: "dom_content_loaded",
    path: "artifacts/final.png",
    url: finalUrl,
  }];

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: null,
    finalUrl,
    noGo: false,
    requestedUrl,
  });

  assert.equal(assessment.document.identityStatus, "mismatched");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("complete same-document no-surface coverage produces factual not-observed values", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([], { captureStatus: "no_evidence", likelyPresent: false }),
    consentControlGeometryEvidence: geometry([], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: false,
    }),
    consentSurfaceInspection: completeInspection("no_surface_observed_complete_coverage", false),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("first-layer save with every observed optional default off is both options and necessary-only refusal", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "save_preferences",
        label: "Save settings and proceed",
        visible: true,
        layer: "first_layer",
      },
    ], {
      defaultToggleStatesObserved: true,
      nonEssentialDefaultsOff: true,
      precheckedOptionalPurposeCount: 0,
    }),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "save-settings",
        actionType: "save_preferences",
        label: "Save settings and proceed",
        layer: "first_layer",
        decisionStatus: "confirmed_visible",
      },
    ], {
      firstLayerAccept: false,
      firstLayerReject: false,
      firstLayerOptions: true,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(
    assessment.evidence.some((evidence) =>
      evidence.intent === "reject" &&
      evidence.classifier?.reasonCodes.includes("save_preferences_with_all_optional_defaults_off")
    ),
    true,
  );
});

test("retained reject-with-subscription evidence cannot project as a free reject control", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([
      {
        actionType: "accept_all",
        label: "Accetta e continua",
        visible: true,
        layer: "first_layer",
      },
      {
        actionType: "reject_all",
        label: "Rifiuta e abbonati",
        visible: true,
        layer: "first_layer",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_subscription",
        ],
      },
      {
        actionType: "manage_preferences",
        label: "Preferenze",
        visible: true,
        layer: "first_layer",
      },
    ]),
    consentControlGeometryEvidence: geometry([
      {
        candidateId: "paid-reject",
        actionType: "reject_all",
        label: "Rifiuta e abbonati",
        layer: "first_layer",
        decisionStatus: "confirmed_visible",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_subscription",
        ],
      },
    ], {
      firstLayerAccept: true,
      firstLayerReject: true,
      firstLayerOptions: true,
    }),
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  const paidDeclineEvidence = assessment.evidence.find(
    (evidence) => evidence.label === "Rifiuta e abbonati",
  );
  assert.ok(paidDeclineEvidence);
  assert.equal(paidDeclineEvidence.intent, "reject");
  assert.equal(paidDeclineEvidence.controlVariant, "reject_with_subscription");
  assert.equal(paidDeclineEvidence.actionable, true);
});

test("no-go evidence cannot create missing-control negatives", () => {
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: bundle([], { captureStatus: "incomplete", likelyPresent: false }),
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      coverageStatus: "limited",
      evidenceChannels: [],
      inspectionCompleted: false,
      limitationKeys: ["scan_blocked"],
      outcome: "inspection_incomplete",
    },
    finalUrl: "https://oxfam.org/en",
    noGo: true,
    noGoReasonCodes: ["bot_blocked"],
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
});

test("redirected-document evidence cannot be attributed to a different final document", () => {
  const source = bundle([
    { actionType: "accept_all", label: "Accept all cookies", visible: true, layer: "first_layer" },
  ]);
  source.domSnapshots[0]!.url = "https://interstitial.example/choose-country";

  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: source,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: completeInspection("actionable_surface_observed", true),
    finalUrl: "https://oxfam.org/en",
    noGo: false,
    requestedUrl: "https://oxfam.org/en",
  });

  assert.equal(assessment.document.identityStatus, "mismatched");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.surface.status, "unknown");
});
