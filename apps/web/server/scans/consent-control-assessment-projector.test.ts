import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveMaterializedConsentControlAssessment } from "./consent-control-assessment-projector";

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

function geometry(candidates: Array<Record<string, unknown>>, summary = {
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
    finalUrl: "https://edition.cnn.com/",
    noGo: false,
    requestedUrl: "https://cnn.com/",
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.document.identityStatus, "matched");
  assert.deepEqual(assessment.document.observedDocumentIds, ["https://edition.cnn.com/"]);
  assert.equal(assessment.surface.status, "observed_actionable");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.coverage.status, "complete");
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
