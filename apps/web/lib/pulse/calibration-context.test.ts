import assert from "node:assert/strict";
import { test } from "node:test";
import { projectGdprTransparencyTopicCandidateSummary, projectPulseCalibrationContext } from "./calibration-context";

test("projects bounded scanner region and primary-language provenance", () => {
  assert.deepEqual(projectPulseCalibrationContext({
    snapshot: {
      site_language_primary: {
        locale: "de",
        confidence: "high",
        source: "declared",
        ignored: "not exported"
      }
    },
    scan: {
      provenance: {
        lambdaAwsRegion: "eu-central-1",
        requestedScanFromValue: "eu_de"
      }
    }
  }), {
    scannerRegion: "eu-central-1",
    scanFrom: "eu_de",
    primaryLanguage: {
      locale: "de",
      confidence: "high",
      source: "declared"
    }
  });
});

test("projects only bounded GDPR topic candidate metadata", () => {
  assert.deepEqual(projectGdprTransparencyTopicCandidateSummary([{
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    confidence: 0.92,
    evidenceText: "raw policy text must not be exported",
    matchedLocale: "de",
    matchStrength: "direct",
    productionCredit: false,
    topic: "legal_basis"
  }]), [{
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    confidence: 0.92,
    matchedLocale: "de",
    matchStrength: "direct",
    productionCredit: false,
    topic: "legal_basis"
  }]);
});

test("adapts the existing string snapshot language contract for calibration output", () => {
  const result = projectPulseCalibrationContext({
    scan: { provenance: { lambdaAwsRegion: "local", requestedScanFromValue: "local" } },
    snapshot: { site_language_primary: "nl" }
  });
  assert.deepEqual(result.primaryLanguage, {
    locale: "nl",
    confidence: null,
    source: "materialized_snapshot"
  });
});
