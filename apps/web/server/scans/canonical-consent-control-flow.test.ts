import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";

import { deriveGdprEprivacyCoverageChecklist } from "../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "../../lib/scans/gdpr-eprivacy-coverage-policy";
import { buildNormalizedConcerns } from "../../lib/scans/normalized-concerns";
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
  actionType: "accept_all" | "reject_all" | "manage_preferences";
  classifierReasonCodes?: string[];
  classifierVariant?: string;
  label: string;
  matchedLocale?: "en" | "sl";
  matchedTerm?: string;
  matchStrength?: "direct" | "equivalent" | "contextual";
  presentationType?: "dedicated_button" | "inline_link";
  placementType?: "action_cluster" | "first_layer_body";
};

type ConsentFlowFixture = {
  complete?: boolean;
  firstLayerControls: readonly FixtureControl[];
  independentAccessibilityTimeout?: boolean;
  persistentOptions?: boolean;
};

function retainedEvidencePacket(input: ConsentFlowFixture): CanonicalEvidenceBundle {
  const complete = input.complete !== false;
  return {
    scanId: "scan-generic-consent-flow",
    schemaVersion: "2.0",
    completedAt: "2026-07-30T00:00:00.000Z",
    url: GENERIC_URL,
    normalizedUrl: GENERIC_URL,
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
  const firstLayerOptions = input.firstLayerControls.some((control) => control.actionType === "manage_preferences");
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
      expectedChecklistEligibility: "gap_observed",
      expectedGapFinding: true,
      expectedRowStatus: "Gap observed",
      expectedScore: 0,
      expectedState: "no_granular_controls_retained"
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
  assert.equal(story.rejectScore.score, 45);
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

test("canonical pre-consent storage flow uses one non-essential predicate for metric, checklist, and score", () => {
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
      expectedScore: 100
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
      expectedScore: 0
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
    supplementalSignalsProjection
  ] = await Promise.all([
    readFile("apps/web/server/scans/scan-report-projection.ts", "utf8"),
    readFile("apps/web/server/scans/get-organization-scans.ts", "utf8"),
    readFile("apps/web/lib/pulse/projection.ts", "utf8"),
    readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8"),
    readFile("apps/web/server/admin/get-admin-scan-detail.ts", "utf8"),
    readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8"),
    readFile("apps/web/lib/scans/scan-detail-supplemental-signals.ts", "utf8")
  ]);

  assert.match(reportProjection, /canonicalConsentAssessment/);
  assert.match(reportProjection, /buildScanReportUnifiedFindingStateForScan|debugBuildScanReportUnifiedFindingStateForScan/);
  assert.match(reportProjection, /certscore_overall/);

  assert.match(overviewProjection, /overviewSnapshot\?\.certscore_overall/);
  assert.match(overviewProjection, /legacyScoreAssessmentMap/);
  assert.match(overviewProjection, /canonicalConsentSurfaceCompatibilityFromSnapshot/);
  assert.doesNotMatch(overviewProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(pulseProjection, /buildScanReportUnifiedFindings/);
  assert.match(pulseProjection, /gdprEprivacyChecklist/);
  assert.match(pulseProjection, /gdprEprivacyScore/);

  assert.match(adminProjection, /buildPulseProjection/);
  assert.match(adminProjection, /reportSummary/);
  assert.doesNotMatch(adminProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(adminDetailProjection, /withCanonicalConsentSnapshotCompatibility/);
  assert.doesNotMatch(adminDetailProjection, /cookie consent tool|manage choices|accept all|decline/i);

  assert.match(apiActivityProjection, /loadLatestVersionedScoreAssessments/);
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
