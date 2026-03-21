import assert from "node:assert/strict";
import test from "node:test";
import {
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
