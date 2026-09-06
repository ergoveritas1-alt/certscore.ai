import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";

import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { getEvidenceLabel } from "../../lib/scans/gdpr-eprivacy-assessment-direction";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { buildNormalizedConcerns, buildUnifiedFindingCandidatesFromConcerns } from "../../lib/scans/normalized-concerns";
import { buildRegulatoryGapTopFindings } from "../../lib/scans/regulatory-gap-top-findings";
import { deriveRegulatoryCoverageScore } from "../../lib/scans/regulatory-coverage-score";
import {
  buildPreConsentStorageAssessment,
  buildRuntimeCookieInventory,
  projectPreConsentStorageMetric
} from "../../lib/scans/runtime-cookie-evidence";
import { deriveMaterializedConsentControlAssessment } from "./consent-control-assessment-projector";
import { withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";

const GENERIC_URL = "https://site-under-test.example/";

type FixtureControl = {
  actionType: "accept_all" | "reject_all" | "manage_preferences" | "save_preferences" | "do_not_sell_share" | "other";
  classifierReasonCodes?: string[];
  classifierVariant?: string;
  label: string;
  matchedLocale?: "en" | "pt" | "sl";
  matchedTerm?: string;
  matchStrength?: "direct" | "equivalent" | "contextual";
  presentationType?: "dedicated_button" | "inline_link";
  placementType?: "action_cluster" | "first_layer_body";
  semanticRole?: "dismiss";
};

type ConsentFlowFixture = {
  screenshotWithheld?: boolean;
  complete?: boolean;
  defaultToggleStatesObserved?: boolean;
  firstLayerControls: readonly FixtureControl[];
  independentAccessibilityTimeout?: boolean;
  nonEssentialDefaultsOff?: boolean;
  persistentOptions?: boolean;
  precheckedOptionalPurposeCount?: number;
};

function retainedEvidencePacket(input: ConsentFlowFixture): CanonicalEvidenceBundle {
  const complete = input.complete !== false;
  return {
    scanId: "scan-generic-consent-flow",
    schemaVersion: "2.0",
    completedAt: "2026-07-30T00:00:00.000Z",
    url: GENERIC_URL,
    normalizedUrl: GENERIC_URL,
    screenshots: input.screenshotWithheld ? [{
      artifactId: "consent-frame", path: "screenshot.png", capturedAtMs: 1_000,
      captureMethod: "primary_viewport_fallback", consentStateAtTime: "pre_consent",
      pagePhase: "network_idle", url: GENERIC_URL, retentionStatus: "withheld",
      displayStatus: "withheld", withheldReason: "safety_check_unavailable",
      safetyFailureCode: "finalization_deadline_exceeded",
    }] : [],
    domSnapshots: [{
      artifactId: "dom-pre-consent",
      capturedAtMs: 1_000,
      consentStateAtTime: "pre_consent",
      pagePhase: "settled",
      path: "artifacts/dom-pre-consent.json",
      url: GENERIC_URL
    }],
    consentUiObservations: [{
      observationId: "typed-first-layer-control-inventory",
      observedAtMs: 1_000,
      likelyPresent: true,
      layerInspected: "first_layer",
      captureStatus: complete ? "observed" : "incomplete",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        failedChannels: [],
        timedOutChannels: input.independentAccessibilityTimeout
          ? ["accessibility_tree"]
          : complete ? [] : ["geometry"]
      },
      defaultToggleStatesObserved: input.defaultToggleStatesObserved ?? null,
      nonEssentialDefaultsOff: input.nonEssentialDefaultsOff ?? null,
      precheckedOptionalPurposeCount: input.precheckedOptionalPurposeCount ?? 0,
      controls: input.firstLayerControls.map((control, index) => ({
        ...control,
        artifactRef: `CanonicalEvidenceBundle.json#control-${index}`,
        classifierReasonCodes: control.classifierReasonCodes ?? [`matched_${control.actionType}`],
        layer: "first_layer",
        matchStrength: control.matchStrength ?? "direct",
        matchedLocale: control.matchedLocale ?? "en",
        matchedTerm: control.matchedTerm ?? control.label.toLowerCase(),
        visible: true
      })),
      evidenceRefs: []
    }]
  } as unknown as CanonicalEvidenceBundle;
}

function geometryEvidence(input: ConsentFlowFixture) {
  const complete = input.complete !== false;
  const firstLayerAccept = input.firstLayerControls.some((control) => control.actionType === "accept_all");
  const firstLayerReject = input.firstLayerControls.some((control) => control.actionType === "reject_all");
  const firstLayerOptions = input.firstLayerControls.some((control) =>
    control.actionType === "manage_preferences" || control.actionType === "save_preferences"
  );
  return {
    artifactVersion: "consent_control_geometry.v1",
    observedAtMs: 1_050,
    pageUrl: GENERIC_URL,
    candidates: input.persistentOptions
      ? [{
          candidateId: "persistent-cookie-settings",
          actionType: "manage_preferences",
          label: "Cookie settings",
          layer: "footer",
          presentationType: "persistent_link",
          enabled: true,
          decisionStatus: "footer_or_policy_link"
        }]
      : [],
    ...(complete
      ? {
          summary: {
            cmpDetected: true,
            cmpName: "Generic CMP",
            confidence: 0.95,
            firstLayerAccept,
            firstLayerReject,
            firstLayerOptions
          }
        }
      : {})
  };
}

function consentSurfaceInspection(complete: boolean) {
  return {
    actionableControlObserved: true,
    consentSurfaceObserved: true,
    coverageStatus: complete ? "complete" : "limited",
    evidenceChannels: [
      { channel: "page_script_inventory", status: "observed" },
      { channel: "geometry", status: complete ? "observed" : "inspection_incomplete" }
    ],
    inspectionCompleted: complete,
    limitationKeys: complete ? [] : ["consent_surface_inspection_runtime_partial"],
    observedAtMs: 1_000,
    outcome: "actionable_surface_observed"
  };
}

function projectConsentStory(input: ConsentFlowFixture) {
  const complete = input.complete !== false;
  const inspection = consentSurfaceInspection(complete);
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: retainedEvidencePacket(input),
    consentControlGeometryEvidence: geometryEvidence(input),
    consentSurfaceInspection: inspection,
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL
  });
  const persistedRuntimeArtifacts = withPersistedFirstLayerConsentEvidence(
    {
      consentControlAssessment: assessment,
      consentSurfaceInspection: inspection
    },
    { consent_control_assessment: assessment }
  );
  assert.ok(persistedRuntimeArtifacts);
  assert.deepEqual(persistedRuntimeArtifacts.consent_control_assessment, assessment);

  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: persistedRuntimeArtifacts,
    validationFindings: []
  });
  const concern = normalizedConcerns.find((candidate) =>
    candidate.originKey.startsWith("consent.options_control_prominence.")
  );
  assert.ok(concern);

  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: !complete,
    normalizedConcerns,
    runtimeArtifacts: persistedRuntimeArtifacts,
    scanCompleted: true,
    snapshot: {
      consent_control_assessment: assessment,
      cookie_banner_present: true
    }
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: !complete,
    coverageOutcomes,
    projectedFindings: [],
    scanCompleted: true,
    unifiedFindings: []
  });
  const row = checklist.find((item) => item.id === "options_settings_preferences_control");
  assert.ok(row);
  const rejectRow = checklist.find((item) => item.id === "reject_all_path_availability");
  assert.ok(rejectRow);
  const gapFindings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      rows: checklist.filter((item) => item.assessmentStatus === "gap_observed"),
      title: "GDPR / ePrivacy"
    }
  });
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [row]
  });
  const rejectScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [rejectRow]
  });

  return {
    assessment,
    concern,
    gapFindingObserved: gapFindings.some((finding) =>
      finding.id === "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control"
    ),
    row,
    rejectRow,
    rejectScore,
    normalizedConcerns,
    score
  };
}

test("visual safety failure preserves the structured assessment through persistence, policy, checklist and score", () => {
  const fixture: ConsentFlowFixture = { firstLayerControls: [
    { actionType: "accept_all", label: "Accept all" },
    { actionType: "reject_all", label: "Reject all" },
    { actionType: "manage_preferences", label: "Settings", presentationType: "dedicated_button", placementType: "action_cluster" },
  ] };
  const reference = projectConsentStory(fixture);
  const withheld = projectConsentStory({ ...fixture, screenshotWithheld: true });
  assert.equal(withheld.assessment.artifactVersion, "2.1");
  assert.equal(withheld.assessment.visualEvidence?.status, "withheld");
  assert.deepEqual(withheld.assessment.controls, reference.assessment.controls);
  assert.deepEqual(withheld.row, reference.row);
  assert.deepEqual(withheld.rejectRow, reference.rejectRow);
  assert.deepEqual(withheld.score, reference.score);
  assert.deepEqual(withheld.rejectScore, reference.rejectScore);
  assert.equal(withheld.gapFindingObserved, reference.gapFindingObserved);
  assert.equal(withheld.concern.evidenceBundle.rawEvidence?.consentControlAssessmentContractVersion, "2.1");
});

test("limited empty first-layer inventory remains unknown through every canonical boundary", () => {
  const packet = retainedEvidencePacket({ firstLayerControls: [] });
  packet.consentUiObservations[0]!.layerInspected = "unknown";
  packet.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  packet.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree"],
    failedChannels: [],
    timedOutChannels: [],
  };
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
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
      observedAtMs: 1_000,
      outcome: "non_actionable_surface_observed",
    },
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence({
    cmpFrameworkSignalObserved: true,
    consentControlAssessment: assessment,
    requestPurposeClassificationConfidence: [{
      category: "analytics",
      collectionEndpointObserved: true,
      confidence: 0.95,
      essentiality: "non_essential",
      evidenceRefs: ["CanonicalEvidenceBundle.json#request-1"],
      firstSeenMs: 400,
      requestUrl: "https://analytics.example/collect",
      runtimePhase: "pre_consent",
      vendorName: "Example Analytics",
    }],
  }, { consent_control_assessment: assessment });
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: { cookie_banner_present: true },
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings: [],
  });
  const byId = (id: string) => {
    const row = checklist.find((item) => item.id === id);
    assert.ok(row);
    return row;
  };

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.equal(assessment.controls.accept.state, "unknown");
  assert.equal(assessment.controls.reject.state, "unknown");
  assert.equal(assessment.controls.options.state, "unknown");
  assert.ok(normalizedConcerns.some((concern) =>
    concern.originKey === "consent.surface_assessment.unknown" &&
    concern.evidenceBundle.rawEvidence?.consentSurfaceAssessmentProjectionEvidence === true
  ));
  assert.ok(!normalizedConcerns.some((concern) =>
    concern.originKey === "consent.refusal_path.unavailable_before_nonessential_activity"
  ));
  assert.equal(byId("accept_consent_control").status, "Not testable");
  assert.equal(byId("options_settings_preferences_control").status, "Not testable");
  assert.equal(byId("reject_all_path_availability").status, "Not testable");
  assert.equal(byId("reject_all_path_availability").evidenceState, "not_testable");
  assert.equal(getEvidenceLabel(byId("reject_all_path_availability")), "Not testable");
});

test("a verified settled stable partial exit persists missing controls as not observed", () => {
  const packet = retainedEvidencePacket({
    firstLayerControls: [{ actionType: "accept_all", label: "Accept all" }],
  });
  packet.screenshots = [{
    artifactId: "screenshot-pre-consent-settled",
    capturedAtMs: 1_050,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "artifacts/screenshot-pre-consent-settled.png",
    url: GENERIC_URL,
  }];
  packet.consentUiObservations[0]!.basis = [
    "inventory:first_layer_controls",
    "settled_control_inventory_completed",
    "inventory:paired_settled_frame_completed",
  ];
  packet.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  packet.consentUiObservations[0]!.documentUrl = GENERIC_URL;
  packet.consentUiObservations[0]!.inventoryOutcome = "complete_with_controls";
  packet.consentUiObservations[0]!.inventoryDiagnostics = {
    blockingInaccessibleFrameCount: 0,
    candidateContainerCount: 1,
    candidateControlCount: 1,
    retainedControlCount: 1,
    inventorySources: ["cmp_container"],
    candidateLabels: ["Accept all"],
    rejectionReasons: [],
    timingMarkers: ["gate_8s:calibrated_stable_partial_exit"],
  };
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
    consentControlGeometryEvidence: geometryEvidence({
      firstLayerControls: [{ actionType: "accept_all", label: "Accept all" }],
    }),
    consentSurfaceInspection: consentSurfaceInspection(true),
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.coverage.status, "complete");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
});

test("a visible necessary selection plus save-selection control projects a necessary-only reject path", () => {
  const controls = [
    { actionType: "accept_all" as const, label: "✓ Akzeptieren", matchedLocale: "en" as const },
    {
      actionType: "save_preferences" as const,
      label: "Auswahl speichern",
      matchedLocale: "en" as const,
      classifierReasonCodes: ["variant_save_preferences"],
    },
    { actionType: "manage_preferences" as const, label: "Personalisieren", matchedLocale: "en" as const },
  ];
  const packet = retainedEvidencePacket({ firstLayerControls: controls });
  packet.consentUiObservations[0]!.necessaryPreferenceSelectionObserved = true;
  packet.consentUiObservations[0]!.necessaryPreferenceLabels = ["Essenziell"];
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
    consentControlGeometryEvidence: geometryEvidence({ firstLayerControls: controls }),
    consentSurfaceInspection: consentSurfaceInspection(true),
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.controls.accept.state, "observed");
  assert.equal(assessment.controls.reject.state, "observed");
  assert.equal(assessment.controls.options.state, "observed");
  assert.ok(assessment.evidence.some((evidence) =>
    evidence.intent === "reject" &&
    evidence.classifier?.reasonCodes.includes("save_preferences_with_necessary_selection_observed")
  ));
});

test("limited no-evidence inventory stays unknown through assessment, concern policy, and checklist", () => {
  const packet = retainedEvidencePacket({ firstLayerControls: [] });
  packet.consentUiObservations[0]!.captureStatus = "no_evidence";
  packet.consentUiObservations[0]!.likelyPresent = false;
  packet.consentUiObservations[0]!.basis = ["settled_control_inventory_completed"];
  packet.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory"],
    failedChannels: [],
    timedOutChannels: [],
  };
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
    consentControlGeometryEvidence: null,
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: false,
      coverageStatus: "limited",
      evidenceChannels: [{ channel: "page_script_inventory", status: "observed" }],
      inspectionCompleted: false,
      limitationKeys: ["network_cmp_inspection_incomplete"],
      observedAtMs: 1_000,
      outcome: "inspection_incomplete",
    },
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence(
    { consentControlAssessment: assessment },
    { consent_control_assessment: assessment },
  );
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: { cookie_banner_present: false },
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings: [],
  });
  const statusFor = (id: string) => checklist.find((row) => row.id === id)?.status;

  assert.equal(assessment.assessmentStatus, "limited");
  assert.equal(assessment.surface.status, "unknown");
  assert.ok(!normalizedConcerns.some((concern) =>
    concern.originKey === "consent.operational_surface.not_observed"
  ));
  assert.equal(statusFor("accept_consent_control"), "Not testable");
  assert.equal(statusFor("reject_all_path_availability"), "Not testable");
  assert.equal(statusFor("options_settings_preferences_control"), "Not testable");
});

test("verified same-session empty consent packet remains factual not-observed through canonical projection", () => {
  const packet = retainedEvidencePacket({ firstLayerControls: [] });
  packet.screenshots = [{
    artifactId: "screenshot_pre_consent_packet_recovery",
    capturedAtMs: 990,
    captureMethod: "primary_viewport_fallback",
    consentStateAtTime: "pre_consent",
    pagePhase: "network_idle",
    path: "artifacts/bounded-recovery.png",
    url: GENERIC_URL,
  }];
  packet.consentUiObservations[0]!.documentUrl = GENERIC_URL;
  packet.consentUiObservations[0]!.captureStatus = "no_evidence";
  packet.consentUiObservations[0]!.inventoryOutcome = "complete_empty";
  packet.consentUiObservations[0]!.likelyPresent = false;
  packet.consentUiObservations[0]!.boundedSameSessionRecoveryOutcome = "completed";
  packet.consentUiObservations[0]!.basis = [
    "recovery:bounded_same_session_consent_packet_completed",
    "geometry:hidden_cmp_markup_separated_from_visible_surface",
  ];
  packet.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "accessibility_tree", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
    consentControlGeometryEvidence: geometryEvidence({ firstLayerControls: [] }),
    consentSurfaceInspection: {
      actionableControlObserved: false,
      consentSurfaceObserved: false,
      coverageStatus: "complete",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "accessibility_tree", status: "observed" },
        { channel: "geometry", status: "observed" },
        { channel: "cmp_runtime", status: "observed" },
      ],
      inspectionCompleted: true,
      limitationKeys: [],
      observedAtMs: 1_000,
      outcome: "no_surface_observed_complete_coverage",
    },
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence({
    cmpFrameworkSignalObserved: true,
    consentControlAssessment: assessment,
  }, { consent_control_assessment: assessment });
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: { cookie_banner_present: false },
  });
  const unifiedCandidates = buildUnifiedFindingCandidatesFromConcerns(normalizedConcerns);
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings: [],
  });
  const row = (id: string) => {
    const found = checklist.find((candidate) => candidate.id === id);
    assert.ok(found);
    return found;
  };

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "not_observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
  assert.ok(normalizedConcerns.some((concern) =>
    concern.originKey === "consent.operational_surface.not_observed"
  ));
  assert.ok(!normalizedConcerns.some((concern) =>
    concern.originKey === "consent.control_inventory.partial_first_layer"
  ));
  assert.ok(!unifiedCandidates.some((candidate) =>
    candidate.normalizedConcern.suggestedUnifiedFindingId === "consent_refusal_path_missing"
  ));
  assert.equal(row("accept_consent_control").evidenceState, "not_observed");
  assert.equal(row("reject_all_path_availability").evidenceState, "not_observed");
  assert.equal(row("options_settings_preferences_control").evidenceState, "not_observed");
  assert.notEqual(row("reject_all_path_availability").assessmentStatus, "gap_observed");
});

test("California privacy choice stays separate while absent cookie-consent A/R/O projects as not observed", () => {
  const packet = retainedEvidencePacket({
    firstLayerControls: [{
      actionType: "do_not_sell_share",
      label: "Do Not Sell or Share My Personal Information",
    }],
  });
  packet.consentUiObservations[0]!.inventoryOutcome = "complete_with_controls";
  packet.consentUiObservations[0]!.captureDiagnostics = {
    completedChannels: ["dom_inventory", "geometry"],
    failedChannels: [],
    timedOutChannels: [],
  };
  const assessment = deriveMaterializedConsentControlAssessment({
    bundle: packet,
    consentControlGeometryEvidence: geometryEvidence({
      firstLayerControls: [{
        actionType: "do_not_sell_share",
        label: "Do Not Sell or Share My Personal Information",
      }],
    }),
    consentSurfaceInspection: {
      actionableControlObserved: true,
      consentSurfaceObserved: true,
      coverageStatus: "complete",
      evidenceChannels: [
        { channel: "page_script_inventory", status: "observed" },
        { channel: "geometry", status: "observed" },
      ],
      inspectionCompleted: true,
      limitationKeys: [],
      observedAtMs: 1_000,
      outcome: "actionable_surface_observed",
    },
    finalUrl: GENERIC_URL,
    noGo: false,
    requestedUrl: GENERIC_URL,
  });
  const runtimeArtifacts = withPersistedFirstLayerConsentEvidence({
    cmpFrameworkSignalObserved: true,
    consentControlAssessment: assessment,
  }, { consent_control_assessment: assessment });
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: [],
  });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: { cookie_banner_present: false },
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    scanCompleted: true,
    unifiedFindings: [],
  });
  const row = (id: string) => {
    const found = checklist.find((candidate) => candidate.id === id);
    assert.ok(found);
    return found;
  };

  assert.equal(assessment.assessmentStatus, "complete");
  assert.equal(assessment.surface.status, "observed_non_actionable");
  assert.equal(assessment.controls.privacyOptOut.state, "observed");
  assert.equal(assessment.controls.accept.state, "not_observed");
  assert.equal(assessment.controls.reject.state, "not_observed");
  assert.equal(assessment.controls.options.state, "not_observed");
  assert.ok(normalizedConcerns.some((concern) =>
    concern.originKey === "consent.operational_surface.not_observed" &&
    concern.evidenceBundle.rawEvidence?.consentPrivacyChoiceOnlyEvidence === true
  ));
  assert.equal(row("consent_surface_observed").status, "Not observed");
  assert.equal(row("accept_consent_control").evidenceState, "not_observed");
  assert.equal(row("reject_all_path_availability").evidenceState, "not_observed");
  assert.equal(row("options_settings_preferences_control").evidenceState, "not_observed");
});

test("canonical consent-control flow preserves site-agnostic prominence and absence semantics", () => {
  const cases = [
    {
      name: "dedicated first-layer settings button",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" },
          {
            actionType: "manage_preferences",
            label: "Cookie settings",
            presentationType: "dedicated_button"
          }
        ]
      },
      expectedAssessmentOptions: "observed",
      expectedAssessmentReject: "not_observed",
      expectedChecklistEligibility: "observed",
      expectedGapFinding: false,
      expectedRowStatus: "Observed",
      expectedScore: 100,
      expectedState: "dedicated_button"
    },
    {
      name: "defaults-off preference panel with a first-layer save action",
      fixture: {
        defaultToggleStatesObserved: true,
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" },
          {
            actionType: "save_preferences",
            label: "Save settings and proceed",
            presentationType: "dedicated_button"
          }
        ],
        nonEssentialDefaultsOff: true,
        precheckedOptionalPurposeCount: 0
      },
      expectedAssessmentOptions: "observed",
      expectedAssessmentReject: "observed",
      expectedChecklistEligibility: "observed",
      expectedGapFinding: false,
      expectedRowStatus: "Observed",
      expectedScore: 100,
      expectedState: "dedicated_button"
    },
    {
      name: "inline preferences link grouped with accept and decline",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" },
          { actionType: "reject_all", label: "Decline" },
          {
            actionType: "manage_preferences",
            label: "Manage choices",
            presentationType: "inline_link",
            placementType: "action_cluster"
          }
        ]
      },
      expectedAssessmentOptions: "observed",
      expectedAssessmentReject: "observed",
      expectedChecklistEligibility: "observed",
      expectedGapFinding: false,
      expectedRowStatus: "Observed",
      expectedScore: 100,
      expectedState: "inline_link_action_cluster"
    },
    {
      name: "inline preferences link retained in first-layer body copy",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" },
          { actionType: "reject_all", label: "Decline" },
          {
            actionType: "manage_preferences",
            label: "Manage choices",
            presentationType: "inline_link",
            placementType: "first_layer_body"
          }
        ]
      },
      expectedAssessmentOptions: "observed",
      expectedAssessmentReject: "observed",
      expectedChecklistEligibility: "review_signal",
      expectedGapFinding: false,
      expectedRowStatus: "Review signal",
      expectedScore: 100,
      expectedState: "inline_link_first_layer_body"
    },
    {
      name: "typed controls retained despite independent accessibility timeout",
      fixture: {
        independentAccessibilityTimeout: true,
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept" },
          { actionType: "reject_all", label: "Decline" },
          {
            actionType: "manage_preferences",
            label: "Customise",
            presentationType: "dedicated_button"
          }
        ]
      },
      expectedAssessmentOptions: "observed",
      expectedAssessmentReject: "observed",
      expectedChecklistEligibility: "observed",
      expectedGapFinding: false,
      expectedRowStatus: "Observed",
      expectedScore: 100,
      expectedState: "dedicated_button"
    },
    {
      name: "balanced accept and decline without first-layer settings",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" },
          { actionType: "reject_all", label: "Decline" }
        ]
      },
      expectedAssessmentOptions: "not_observed",
      expectedAssessmentReject: "observed",
      expectedChecklistEligibility: "review_signal",
      expectedGapFinding: false,
      expectedRowStatus: "Review signal",
      expectedScore: 100,
      expectedState: "balanced_accept_decline_no_first_layer_settings"
    },
    {
      name: "persistent preferences link outside the first layer",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" }
        ],
        persistentOptions: true
      },
      expectedAssessmentOptions: "not_observed",
      expectedAssessmentReject: "not_observed",
      expectedChecklistEligibility: "review_signal",
      expectedGapFinding: false,
      expectedRowStatus: "Review signal",
      expectedScore: 100,
      expectedState: "persistent_link"
    },
    {
      name: "no granular or persistent controls",
      fixture: {
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" }
        ]
      },
      expectedAssessmentOptions: "not_observed",
      expectedAssessmentReject: "not_observed",
      expectedChecklistEligibility: "none",
      expectedGapFinding: false,
      expectedRowStatus: "Not observed",
      expectedScore: null,
      expectedState: "accept_without_refusal_or_settings"
    },
    {
      name: "incomplete retained control inventory",
      fixture: {
        complete: false,
        firstLayerControls: [
          { actionType: "accept_all", label: "Accept all" }
        ]
      },
      expectedAssessmentOptions: "unknown",
      expectedAssessmentReject: "unknown",
      expectedChecklistEligibility: "none",
      expectedGapFinding: false,
      expectedRowStatus: "Not confirmed",
      expectedScore: null,
      expectedState: "insufficient_retained_evidence"
    }
  ] as const;

  for (const fixtureCase of cases) {
    const story = projectConsentStory(fixtureCase.fixture);
    assert.equal(story.assessment.controls.options.state, fixtureCase.expectedAssessmentOptions, fixtureCase.name);
    assert.equal(story.assessment.controls.reject.state, fixtureCase.expectedAssessmentReject, fixtureCase.name);
    assert.equal(story.concern.observedValue, fixtureCase.expectedState, fixtureCase.name);
    assert.equal(
      story.concern.regulatoryChecklistEligibility,
      fixtureCase.expectedChecklistEligibility,
      fixtureCase.name
    );
    assert.equal(story.concern.promotionEligibility, "internal_only", fixtureCase.name);
    assert.equal(story.concern.externalSurfacingEligibility, "audit_only", fixtureCase.name);
    assert.equal(story.row.status, fixtureCase.expectedRowStatus, fixtureCase.name);
    assert.equal(story.gapFindingObserved, fixtureCase.expectedGapFinding, fixtureCase.name);
    if (fixtureCase.expectedScore !== null) {
      assert.equal(story.score.score, fixtureCase.expectedScore, fixtureCase.name);
    } else {
      assert.notEqual(story.score.score, 0, fixtureCase.name);
    }
  }
});

test("canonical consent-control flow consumes Slovenian typed controls without downstream label inference", () => {
  const story = projectConsentStory({
    firstLayerControls: [
      {
        actionType: "accept_all",
        classifierReasonCodes: ["matched_accept", "requires_consent_context", "context_satisfied"],
        label: "Naloži vse",
        matchedLocale: "sl",
        matchedTerm: "naloži vse",
        matchStrength: "contextual",
      },
      {
        actionType: "reject_all",
        classifierReasonCodes: ["matched_reject", "variant_necessary_only", "context_satisfied"],
        classifierVariant: "necessary_only",
        label: "Naloži samo nujne",
        matchedLocale: "sl",
        matchedTerm: "naloži samo nujne",
        matchStrength: "equivalent",
      },
      {
        actionType: "manage_preferences",
        classifierReasonCodes: ["matched_options", "requires_consent_context", "context_satisfied"],
        label: "Nastavitve",
        matchedLocale: "sl",
        matchedTerm: "nastavitve",
        matchStrength: "contextual",
        presentationType: "dedicated_button",
      },
    ],
  });

  assert.equal(story.assessment.controls.accept.state, "observed");
  assert.equal(story.assessment.controls.reject.state, "observed");
  assert.equal(story.assessment.controls.options.state, "observed");
  assert.equal(story.row.status, "Observed");
  assert.equal(story.rejectRow.status, "Observed");
  assert.equal(story.gapFindingObserved, false);
  assert.equal(story.score.score, 100);
  assert.equal(
    story.assessment.evidence.some((evidence) =>
      evidence.label === "Naloži samo nujne" &&
      evidence.intent === "reject" &&
      evidence.classifier?.matchedTerm === "naloži samo nujne"
    ),
    true,
  );
});

test("canonical consent-control flow consumes Portuguese Ketch A/R/O without downstream label inference", () => {
  const story = projectConsentStory({
    firstLayerControls: [
      {
        actionType: "accept_all",
        label: "Aceitar todos",
        matchedLocale: "pt",
        matchedTerm: "aceitar todos",
      },
      {
        actionType: "reject_all",
        label: "Rejeitar todos",
        matchedLocale: "pt",
        matchedTerm: "rejeitar todos",
      },
      {
        actionType: "manage_preferences",
        classifierReasonCodes: ["matched_options", "requires_consent_context", "context_satisfied"],
        label: "Preferências",
        matchedLocale: "pt",
        matchedTerm: "preferências",
        matchStrength: "contextual",
        presentationType: "dedicated_button",
      },
    ],
  });

  assert.equal(story.assessment.assessmentStatus, "complete");
  assert.equal(story.assessment.controls.accept.state, "observed");
  assert.equal(story.assessment.controls.reject.state, "observed");
  assert.equal(story.assessment.controls.options.state, "observed");
  assert.equal(story.row.status, "Observed");
  assert.equal(story.rejectRow.status, "Observed");
  assert.equal(story.gapFindingObserved, false);
  assert.equal(story.score.score, 100);
  assert.equal(
    story.assessment.evidence.some((evidence) =>
      evidence.label === "Preferências" &&
      evidence.intent === "options" &&
      evidence.classifier?.matchedTerm === "preferências"
    ),
    true,
  );
});

test("canonical consent-control flow projects UniConsent accept/options evidence and a partial reject concern", () => {
  const story = projectConsentStory({
    firstLayerControls: [
      {
        actionType: "accept_all",
        classifierReasonCodes: ["matched_accept", "match_strength_direct"],
        label: "Agree and proceed",
        matchedTerm: "agree and proceed",
      },
      {
        actionType: "manage_preferences",
        classifierReasonCodes: ["matched_options", "match_strength_direct"],
        label: "Manage Options",
        matchedTerm: "manage options",
        presentationType: "dedicated_button",
      },
    ],
  });

  assert.equal(story.assessment.controls.accept.state, "observed");
  assert.equal(story.assessment.controls.options.state, "observed");
  assert.equal(story.assessment.controls.reject.state, "not_observed");
  assert.equal(story.row.status, "Observed");
  assert.equal(story.rejectRow.status, "Review signal");
  assert.equal(story.rejectRow.assessmentStatus, "review_signal");
  assert.equal(getEvidenceLabel(story.rejectRow), "Partial concern");
  assert.equal(story.rejectScore.score, 90);
  assert.match(story.rejectRow.limitation ?? "", /no same-layer reject/i);
});

test("canonical consent-control flow projects dismiss-only evidence through every policy boundary", () => {
  const story = projectConsentStory({
    firstLayerControls: [{
      actionType: "other",
      classifierReasonCodes: ["matched_dismiss", "match_strength_direct"],
      label: "Close",
      matchedTerm: "close",
      semanticRole: "dismiss",
    }],
  });
  const dismissConcern = story.normalizedConcerns.find((concern) =>
    concern.originKey === "consent.dismiss_without_reject.complete_first_layer"
  );
  const unifiedCandidates = buildUnifiedFindingCandidatesFromConcerns(
    dismissConcern ? [dismissConcern] : []
  );

  assert.equal(story.assessment.surface.status, "observed_actionable");
  assert.equal(story.assessment.evidence[0]?.intent, "dismiss");
  assert.equal(story.assessment.controls.accept.state, "not_observed");
  assert.equal(story.assessment.controls.reject.state, "not_observed");
  assert.equal(story.assessment.controls.options.state, "not_observed");
  assert.ok(dismissConcern);
  assert.equal(dismissConcern.regulatoryChecklistEligibility, "review_signal");
  assert.equal(dismissConcern.promotionEligibility, "eligible");
  assert.equal(
    unifiedCandidates[0]?.normalizedConcern.suggestedUnifiedFindingId,
    "dismiss_without_reject"
  );
  assert.equal(story.rejectRow.status, "Review signal");
});

test("canonical consent-control flow projects reject-and-subscribe as a partial concern", () => {
  const story = projectConsentStory({
    firstLayerControls: [
      { actionType: "accept_all", label: "Accept all" },
      {
        actionType: "reject_all",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_subscription"
        ],
        label: "Reject and subscribe"
      },
      {
        actionType: "manage_preferences",
        label: "Manage choices",
        presentationType: "dedicated_button"
      }
    ]
  });
  const paidDeclineConcern = story.normalizedConcerns.find((concern) =>
    concern.originKey === "consent.paid_decline_path.reject_with_subscription"
  );

  assert.equal(story.assessment.controls.reject.state, "not_observed");
  assert.equal(
    story.assessment.evidence.some((evidence) =>
      evidence.controlVariant === "reject_with_subscription" && evidence.intent === "reject"
    ),
    true
  );
  assert.ok(paidDeclineConcern);
  assert.equal(paidDeclineConcern.regulatoryChecklistEligibility, "review_signal");
  assert.equal(story.rejectRow.status, "Review signal");
  assert.equal(story.rejectRow.assessmentStatus, "review_signal");
  assert.match(story.rejectRow.limitation ?? "", /consent or pay/i);
  assert.match(story.rejectRow.limitation ?? "", /cannot be determined from the consent interface alone/i);
  assert.equal(story.rejectScore.score, null);
  const paidFinding = buildUnifiedFindingCandidatesFromConcerns(story.normalizedConcerns).find((candidate) =>
    candidate.normalizedConcern.suggestedUnifiedFindingId === "paid_alternative_required_to_decline_tracking"
  );
  assert.ok(paidFinding);
  assert.equal(story.gapFindingObserved, false);
});

test("canonical consent-control flow projects Reject and Pay as paid decline without free reject", () => {
  const story = projectConsentStory({
    firstLayerControls: [
      { actionType: "accept_all", label: "I Accept" },
      {
        actionType: "reject_all",
        classifierReasonCodes: [
          "matched_reject",
          "variant_reject_with_payment"
        ],
        label: "Reject and Pay"
      },
      {
        actionType: "manage_preferences",
        label: "More Options",
        presentationType: "dedicated_button"
      }
    ]
  });
  const paidDeclineConcern = story.normalizedConcerns.find((concern) =>
    concern.originKey === "consent.paid_decline_path.reject_with_payment"
  );

  assert.equal(story.assessment.controls.reject.state, "not_observed");
  assert.equal(
    story.assessment.evidence.some((evidence) =>
      evidence.controlVariant === "reject_with_payment" &&
      evidence.intent === "reject" &&
      evidence.label === "Reject and Pay"
    ),
    true
  );
  assert.ok(paidDeclineConcern);
  assert.equal(paidDeclineConcern.regulatoryChecklistEligibility, "review_signal");
  assert.equal(story.rejectRow.status, "Review signal");
  assert.match(story.rejectRow.limitation ?? "", /required payment/i);
  assert.match(story.rejectRow.limitation ?? "", /consent or pay/i);
  assert.equal(story.rejectScore.score, null);
  assert.equal(
    paidDeclineConcern.suggestedUnifiedFindingId,
    "paid_alternative_required_to_decline_tracking"
  );
  assert.equal(story.gapFindingObserved, false);
});

function projectStorageStory(runtimeArtifacts: Record<string, unknown>) {
  const runtimeCookieRows = buildRuntimeCookieInventory({ runtimeArtifacts }).rows;
  const assessment = buildPreConsentStorageAssessment({
    runtimeArtifacts,
    runtimeCookieRows
  });
  const metric = projectPreConsentStorageMetric(assessment);
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
  const concern = normalizedConcerns.find((candidate) =>
    candidate.originKey.startsWith("storage.preconsent_assessment.")
  );
  assert.ok(concern);
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    policyEnrichmentCount: 0,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: {}
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    runtimeCookieRows,
    scanCompleted: true,
    unifiedFindings: []
  });
  const row = checklist.find((item) => item.id === "pre_consent_cookies_storage");
  assert.ok(row);
  const gapFindings = buildRegulatoryGapTopFindings({
    gdprEprivacyArea: {
      id: "gdpr_eprivacy",
      rows: checklist.filter((item) => item.assessmentStatus === "gap_observed"),
      title: "GDPR / ePrivacy"
    }
  });
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [row]
  });
  return {
    assessment,
    concern,
    gapFindingObserved: gapFindings.some((finding) =>
      finding.id === "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage"
    ),
    metric,
    row,
    score
  };
}

test("canonical pre-consent storage flow preserves classification and applies the unified deduction schedule", () => {
  const cases = [
    {
      name: "essential storage only",
      runtimeArtifacts: {
        hybridRuntimeEvidence: {
          cookieWriteObservations: [{
            beforeConsent: true,
            category: "necessary",
            cookieName: "cookieconsent",
            domain: "site-under-test.example",
            nonEssential: false,
            party: "first_party"
          }],
          storageSummary: { cookiesBeforeConsentCount: 1 }
        }
      },
      expectedAssessment: "classified_zero",
      expectedChecklistEligibility: "none",
      expectedGapFinding: false,
      expectedMetric: 0,
      expectedRowStatus: "Not observed",
      expectedScore: 100
    },
    {
      name: "unclassified aggregate storage",
      runtimeArtifacts: {
        hybridRuntimeEvidence: {
          storageSummary: { cookiesBeforeConsentCount: 2 }
        }
      },
      expectedAssessment: "partially_classified",
      expectedChecklistEligibility: "review_signal",
      expectedGapFinding: false,
      expectedMetric: null,
      expectedRowStatus: "Review signal",
      expectedScore: 94
    },
    {
      name: "confirmed non-essential write",
      runtimeArtifacts: {
        hybridRuntimeEvidence: {
          cookieWriteObservations: [{
            beforeConsent: true,
            category: "analytics",
            cookieName: "analytics_id",
            domain: "site-under-test.example",
            nonEssential: true,
            party: "first_party",
            setAtMs: 425
          }],
          storageSummary: { cookiesBeforeConsentCount: 1 }
        }
      },
      expectedAssessment: "classified_nonessential_observed",
      expectedChecklistEligibility: "gap_observed",
      expectedGapFinding: true,
      expectedMetric: 1,
      expectedRowStatus: "Gap observed",
      expectedScore: 94
    }
  ] as const;

  for (const fixtureCase of cases) {
    const story = projectStorageStory(fixtureCase.runtimeArtifacts);
    assert.equal(story.assessment.status, fixtureCase.expectedAssessment, fixtureCase.name);
    assert.equal(
      story.concern.regulatoryChecklistEligibility,
      fixtureCase.expectedChecklistEligibility,
      fixtureCase.name
    );
    assert.equal(story.gapFindingObserved, fixtureCase.expectedGapFinding, fixtureCase.name);
    assert.equal(story.metric.value, fixtureCase.expectedMetric, fixtureCase.name);
    assert.equal(story.row.status, fixtureCase.expectedRowStatus, fixtureCase.name);
    assert.equal(story.score.score, fixtureCase.expectedScore, fixtureCase.name);
  }
});

test("all customer and administrative surfaces consume persisted canonical projections", async () => {
  const [
    reportProjection,
    overviewProjection,
    pulseProjection,
    adminProjection,
    adminDetailProjection,
    apiActivityProjection,
    supplementalSignalsProjection,
    reportViewProjection,
    scoreLifecycleProjection
  ] = await Promise.all([
    readFile("apps/web/server/scans/scan-report-projection.ts", "utf8"),
    readFile("apps/web/server/scans/get-organization-scans.ts", "utf8"),
    readFile("apps/web/lib/pulse/projection.ts", "utf8"),
    readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8"),
    readFile("apps/web/server/admin/get-admin-scan-detail.ts", "utf8"),
    readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8"),
    readFile("apps/web/lib/scans/scan-detail-supplemental-signals.ts", "utf8"),
    readFile("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8"),
    readFile("apps/web/server/scans/score-assessment-lifecycle.ts", "utf8")
  ]);

  assert.match(reportProjection, /canonicalConsentAssessment/);
  assert.match(reportProjection, /buildScanReportUnifiedFindingStateForScan|debugBuildScanReportUnifiedFindingStateForScan/);
  assert.match(reportProjection, /certscore_overall/);

  assert.match(overviewProjection, /projectCanonicalSurfaceSummary/);
  assert.match(overviewProjection, /legacyScoreAssessmentMap/);
  assert.match(overviewProjection, /canonicalConsentSurfaceCompatibilityFromSnapshot/);
  assert.doesNotMatch(overviewProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(pulseProjection, /buildScanReportUnifiedFindings/);
  assert.match(pulseProjection, /getPersistedCanonicalReportProjection/);
  assert.match(pulseProjection, /gdprEprivacyChecklist/);
  assert.match(pulseProjection, /gdprEprivacyScore/);

  assert.match(reportViewProjection, /hydrateChecklistPolicyEvidence\([\s\S]*persistedCanonicalProjection\.checklistRows/);
  assert.match(reportViewProjection, /persisted\.ownerUnifiedFindings/);
  assert.match(scoreLifecycleProjection, /persistedCanonicalProjection\.legacyScoreAssessmentInput/);

  assert.match(adminProjection, /buildPulseProjection/);
  assert.match(adminProjection, /reportSummary/);
  assert.doesNotMatch(adminProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(adminDetailProjection, /withCanonicalConsentSnapshotCompatibility/);
  assert.doesNotMatch(adminDetailProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(apiActivityProjection, /loadLatestVersionedScoreAssessments/);
  assert.match(apiActivityProjection, /projectCanonicalSurfaceSummary/);
  assert.match(apiActivityProjection, /scan_snapshots/);
  assert.match(apiActivityProjection, /consent_accept_observed/);
  assert.match(apiActivityProjection, /consent_reject_observed/);
  assert.match(apiActivityProjection, /consent_options_observed/);
  assert.doesNotMatch(apiActivityProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(supplementalSignalsProjection, /canonicalConsentSurfaceCompatibilityFromSnapshot/);
  assert.doesNotMatch(
    supplementalSignalsProjection,
    /snapshot\.cookie_banner_present\s*===\s*(?:true|false)/
  );
});
