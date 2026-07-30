import assert from "node:assert/strict";
import test from "node:test";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "./gdpr-eprivacy-checklist-rationale";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import {
  buildPreConsentStorageAssessment,
  buildRuntimeCookieInventory,
  projectPreConsentStorageMetric
} from "./runtime-cookie-evidence";

function projectStorageStory(runtimeArtifacts: Record<string, unknown>) {
  const runtimeCookieRows = buildRuntimeCookieInventory({ runtimeArtifacts }).rows;
  const assessment = buildPreConsentStorageAssessment({
    runtimeArtifacts,
    runtimeCookieRows
  });
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts,
    validationFindings: []
  });
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
  return {
    assessment,
    metric: projectPreConsentStorageMetric(assessment),
    rationale: deriveGdprEprivacyCoverageChecklistRowRationale(row),
    row,
    score: deriveRegulatoryCoverageScore({
      framework: "gdpr_eprivacy",
      rows: [row]
    })
  };
}

test("essential-only storage stays zero and neutral through the canonical projection", () => {
  const story = projectStorageStory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [{
        beforeConsent: true,
        category: "necessary",
        cookieName: "OptanonConsent",
        domain: "example.test",
        nonEssential: false,
        party: "first_party"
      }],
      storageSummary: {
        cookiesBeforeConsentCount: 1
      }
    }
  });

  assert.equal(story.assessment.status, "classified_zero");
  assert.equal(story.metric.status, "measured_zero");
  assert.equal(story.metric.value, 0);
  assert.equal(story.row.status, "Not observed");
  assert.equal(story.score.score, 100);
});

test("unreconciled aggregate storage cannot coexist with a conclusive zero or a scored concern", () => {
  const story = projectStorageStory({
    hybridRuntimeEvidence: {
      storageSummary: {
        cookiesBeforeConsentCount: 2
      }
    }
  });

  assert.equal(story.assessment.status, "partially_classified");
  assert.equal(story.metric.status, "partially_classified");
  assert.equal(story.metric.value, null);
  assert.doesNotMatch(story.metric.explanation, /none detected/i);
  assert.equal(story.row.status, "Review signal");
  assert.doesNotMatch(story.rationale, /writes? (?:were|was) observed/i);
  assert.equal(story.score.score, 100);
});

test("classified non-essential writes use the same evidence in the metric and checklist", () => {
  const story = projectStorageStory({
    hybridRuntimeEvidence: {
      cookieWriteObservations: [{
        beforeConsent: true,
        category: "analytics",
        cookieName: "_ga",
        domain: "example.test",
        nonEssential: true,
        party: "first_party",
        setAtMs: 425
      }],
      storageSummary: {
        cookiesBeforeConsentCount: 1
      }
    }
  });

  assert.equal(story.assessment.status, "classified_nonessential_observed");
  assert.equal(story.metric.value, 1);
  assert.equal(story.row.criticalEvidence.retainedEvidence.preConsentStorageAssessmentStatus, "classified_nonessential_observed");
  assert.match(story.row.evidenceRefs.join(" "), /_ga/);
  assert.match(story.rationale, /write-level timing evidence/i);
});
