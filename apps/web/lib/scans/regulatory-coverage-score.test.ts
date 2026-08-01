import assert from "node:assert/strict";
import test from "node:test";
import { getGdprEprivacyCoverageChecklistRowIds } from "./gdpr-eprivacy-coverage-checklist";
import {
  auditRegulatoryCoverageScoreConfig,
  deriveRegulatoryCoverageScore,
  GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION,
  REGULATORY_COVERAGE_SCORE_SOURCE
} from "./regulatory-coverage-score";

test("GDPR/ePrivacy scoring configuration explicitly covers the canonical checklist registry", () => {
  const audit = auditRegulatoryCoverageScoreConfig({
    framework: "gdpr_eprivacy",
    rowIds: getGdprEprivacyCoverageChecklistRowIds()
  });

  assert.deepEqual(audit, { missingConfigIds: [], staleConfigIds: [] });
});

test("unknown checklist rows withhold scoring instead of receiving a silent fallback weight", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "checked",
      evidenceState: "observed",
      id: "unregistered_future_row",
      status: "Observed"
    }]
  });

  assert.equal(result.score, null);
  assert.equal(result.coverageConfidence, "insufficient");
  assert.match(result.summary, /configuration is missing/i);
});

test("balanced Accept and Decline without first-layer settings does not incur a material score penalty", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          balancedAcceptDeclineWithoutFirstLayerSettings: true,
        },
      },
      evidenceState: "observed",
      id: "options_settings_preferences_control",
      status: "Review signal",
    }],
  });

  assert.equal(result.score, 100);
});

test("contextual inline and persistent settings links do not incur a material score penalty", () => {
  for (const optionsControlProminence of ["inline_link", "inline_link_first_layer_body", "persistent_link"]) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { optionsControlProminence },
        },
        evidenceState: "observed",
        id: "options_settings_preferences_control",
        status: "Review signal",
      }],
    });

    assert.equal(result.score, 100, optionsControlProminence);
  }
});

test("contextual browser capability access does not incur a fingerprinting score penalty", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "checked",
      criticalEvidence: {
        retainedEvidence: {
          browserDeviceEntropyEvidence: {
            assessmentStrength: "contextual_only",
            browserApiSignals: ["Navigator.plugins", "Navigator.mimeTypes"]
          },
          fingerprintingObserved: false,
          promotionEligible: false
        }
      },
      evidenceState: "not_observed",
      id: "device_identification_fingerprinting_signal_observed",
      status: "Not observed"
    }]
  });

  assert.equal(result.score, 100);
});

test("storage classification limitations do not incur a substantive concern penalty", () => {
  for (const preConsentStorageAssessmentStatus of [
    "partially_classified",
    "snapshot_presence_only"
  ]) {
    const result = deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [{
        assessmentStatus: "review_signal",
        criticalEvidence: {
          retainedEvidence: { preConsentStorageAssessmentStatus }
        },
        evidenceState: "observed",
        id: "pre_consent_cookies_storage",
        status: "Review signal"
      }]
    });

    assert.equal(result.score, 100, preConsentStorageAssessmentStatus);
  }
});

test("confirmed non-essential pre-consent storage retains its substantive score effect", () => {
  const result = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "gap_observed",
      criticalEvidence: {
        retainedEvidence: {
          preConsentStorageAssessmentStatus: "classified_nonessential_observed"
        }
      },
      evidenceState: "observed",
      id: "pre_consent_cookies_storage",
      status: "Gap observed"
    }]
  });

  assert.equal(result.score, 0);
});

test("California score is derived from evidence-gated checklist rows", () => {
  const score = deriveRegulatoryCoverageScore({
    framework: "california",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { privacyNoticeObserved: true } },
        evidenceState: "observed",
        id: "privacy_notice_availability",
        status: "observed"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: {
          retainedEvidence: {
            runtimeVendorRequestUrlCoherence: "mismatch",
            unmatchedAdvertisingSharingVendorLabels: ["Meta Pixel"]
          }
        },
        evidenceState: "not_observed",
        id: "do_not_sell_share_availability",
        status: "not_observed"
      },
      {
        assessmentStatus: "review_signal",
        criticalEvidence: { retainedEvidence: { sufficientForNegativeCipaReview: false } },
        evidenceState: "observed",
        id: "cipa_sensitive_communication_interception",
        status: "review_signal"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { privacyControlObserved: false } },
        evidenceState: "not_observed",
        id: "privacy_control_accessibility",
        status: "not_applicable"
      }
    ]
  });

  assert.equal(score.ratingLabel, "Watch");
  assert.equal(score.score, 71);
  assert.match(score.summary, /evidence-gated checklist rows/i);
  assert.doesNotMatch(score.summary, /\d+ checked|\d+ review|\d+ gap/i);
});

test("GDPR/ePrivacy score uses the same row-led scoring mechanics", () => {
  const strongScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } },
        evidenceState: "observed",
        id: "consent_surface_observed",
        status: "Observed"
      },
      {
        assessmentStatus: "checked",
        criticalEvidence: { retainedEvidence: { rejectAllPathObserved: true } },
        evidenceState: "observed",
        id: "reject_all_path_availability",
        status: "Observed"
      }
    ]
  });
  const gapScore = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [
      {
        assessmentStatus: "gap_observed",
        criticalEvidence: { retainedEvidence: { preConsentTrackingObserved: true } },
        evidenceState: "observed",
        id: "pre_consent_third_party_tracking",
        status: "Gap observed"
      },
      {
        assessmentStatus: "coverage_limitation",
        criticalEvidence: { missingOrIncompleteSourceSignals: [{ field: "rejectActionConfirmed" }] },
        evidenceState: "not_testable",
        id: "post_reject_tracking_reduction",
        status: "Not testable"
      }
    ]
  });

  assert.equal(strongScore.score, 100);
  assert.equal(strongScore.coverageConfidence, "high");
  assert.equal(strongScore.scoreVersion, GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION);
  assert.equal(strongScore.scoreSource, REGULATORY_COVERAGE_SCORE_SOURCE);
  assert.equal(strongScore.ratingLabel, "Strong");
  assert.match(strongScore.summary, /evidence-gated checklist rows/i);
  assert.doesNotMatch(strongScore.summary, /\d+ checked|\d+ review|\d+ gap/i);
  assert.equal(gapScore.score, 6);
  assert.equal(gapScore.coverageConfidence, "low");
  assert.equal(gapScore.ratingLabel, "Needs work");
});

test("technical policy extraction limitations do not affect the GDPR/ePrivacy score", () => {
  const score = deriveRegulatoryCoverageScore({
    framework: "gdpr_eprivacy",
    rows: [{
      assessmentStatus: "review_signal",
      criticalEvidence: {
        retainedEvidence: {
          policyEvidenceAssessment: {
            contractVersion: "certscore.policy-topic-evidence-assessment.v1",
            result: "not_located_automatically",
            scoreEffect: "none"
          }
        }
      },
      evidenceState: "not_observed",
      id: "legal_basis_disclosure_observed",
      status: "Not confirmed"
    }]
  });

  assert.equal(score.score, null);
  assert.equal(score.ratingLabel, "Not scored");
});
