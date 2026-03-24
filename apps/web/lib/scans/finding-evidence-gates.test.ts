import assert from "node:assert/strict";
import test from "node:test";
import {
  hasStrongRightsFrictionEvidence,
  hasSensitivePayloadEvidence,
  shouldSurfacePrimarySignalFinding
} from "./finding-evidence-gates";

test("hasSensitivePayloadEvidence returns false for detector-only evidence", () => {
  assert.equal(
    hasSensitivePayloadEvidence({
      signalKey: "commerce.high_sensitivity_data_collection_detected",
      signalValue: true
    }),
    false
  );
});

test("hasSensitivePayloadEvidence returns true for suspected payload evidence", () => {
  assert.equal(
    hasSensitivePayloadEvidence({
      sensitivePayloadViolations: [
        {
          detectedType: "postal_code_detected",
          evidenceStrength: "suspected",
          matchSnippet: "postal_code=94***",
          requestMethod: "POST",
          requestUrl: "https://tracker.example.net/collect"
        }
      ]
    }),
    true
  );
});

test("shouldSurfacePrimarySignalFinding hides detector-only high-sensitivity findings", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        sensitivePayloadViolations: []
      },
      key: "commerce.high_sensitivity_data_collection_detected",
      linkedValidationEvidence: null
    }),
    false
  );
});

test("shouldSurfacePrimarySignalFinding keeps suspected-evidence high-sensitivity findings", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        sensitivePayloadViolations: [
          {
            detectedType: "postal_code_detected",
            evidenceStrength: "suspected",
            matchSnippet: "postal_code=94***",
            requestMethod: "POST",
            requestUrl: "https://tracker.example.net/collect"
          }
        ]
      },
      key: "commerce.high_sensitivity_data_collection_detected",
      linkedValidationEvidence: null
    }),
    true
  );
});

test("hasStrongRightsFrictionEvidence ignores bare score-only friction packets", () => {
  assert.equal(
    hasStrongRightsFrictionEvidence({
      consentEvidencePassCount: 2,
      signalKey: "privacy.user_rights_friction_score",
      signalValue: 100
    }),
    false
  );
});

test("hasStrongRightsFrictionEvidence keeps blocker-backed friction packets", () => {
  assert.equal(
    hasStrongRightsFrictionEvidence({
      consentBlockerType: "email_capture",
      consentBlockerUrl: "https://example.com/privacy-request",
      signalKey: "privacy.user_rights_friction_score",
      signalValue: 100
    }),
    true
  );
});

test("shouldSurfacePrimarySignalFinding hides score-only rights-friction findings", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        consentEvidencePassCount: 1,
        signalKey: "privacy.user_rights_friction_score",
        signalValue: 100
      },
      key: "privacy.user_rights_friction_score",
      linkedValidationEvidence: null
    }),
    false
  );
});

test("shouldSurfacePrimarySignalFinding keeps rights-friction findings with a concrete barrier", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        consentBlockerType: "auth_wall",
        consentRedirectOrAuthRequired: true,
        signalKey: "privacy.user_rights_friction_score",
        signalValue: 100
      },
      key: "privacy.user_rights_friction_score",
      linkedValidationEvidence: null
    }),
    true
  );
});

test("shouldSurfacePrimarySignalFinding hides session-replay findings without concrete runtime artifacts", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        signalKey: "privacy.session_replay_runtime_detected",
        signalValue: true
      },
      key: "privacy.session_replay_runtime_detected",
      linkedValidationEvidence: null
    }),
    false
  );
});

test("shouldSurfacePrimarySignalFinding keeps session-replay findings with concrete vendor evidence", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        relatedVendors: ["Hotjar"],
        runtimeEvidenceArtifacts: ["hotjar script observed"],
        signalKey: "privacy.session_replay_runtime_detected",
        signalValue: true
      },
      key: "privacy.session_replay_runtime_detected",
      linkedValidationEvidence: null
    }),
    true
  );
});

test("shouldSurfacePrimarySignalFinding hides DSAR findings when extraction remains weak", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        policy_dsar_mechanism: "absent",
        policy_extraction_status: "structurally_weak",
        policy_rights_signals: [],
        policy_semantic_confidence: 0.82
      },
      key: "section_review.missing_dsar_high_exposure",
      linkedValidationEvidence: null
    }),
    false
  );
});

test("shouldSurfacePrimarySignalFinding keeps DSAR findings with fetched high-confidence policy evidence", () => {
  assert.equal(
    shouldSurfacePrimarySignalFinding({
      fallbackEvidence: {
        policy_dsar_mechanism: "absent",
        policy_extraction_status: "fetched",
        policy_rights_signals: [],
        policy_semantic_confidence: 0.82
      },
      key: "section_review.missing_dsar_high_exposure",
      linkedValidationEvidence: null
    }),
    true
  );
});
