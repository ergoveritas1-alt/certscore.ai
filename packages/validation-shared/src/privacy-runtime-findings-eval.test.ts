import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePrivacyRuntimeFindingExpectation,
  evaluatePrivacyRuntimeFindingsDataset
} from "./privacy-runtime-findings-eval";
import type { PrivacyRuntimeFindingDatasetExample } from "./privacy-runtime-findings.dataset";

test("privacy runtime corpus eval matches every seed expectation", () => {
  const summary = evaluatePrivacyRuntimeFindingsDataset();

  assert.ok(summary.evaluatedCount >= 180);
  assert.equal(summary.mismatchCount, 0);
  assert.deepEqual(summary.mismatches, []);
});

test("pre-consent tracking confirmation requires vendor, URL, and timing sequence", () => {
  const base = {
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "preconsent_tracking",
    findingId: "preconsent_tracking",
    id: "unit-preconsent-thin",
    notes: "unit",
    scenarioType: "borderline_review",
    sourceKind: "synthetic_fixture"
  } satisfies Omit<PrivacyRuntimeFindingDatasetExample, "evidence">;

  assert.equal(
    derivePrivacyRuntimeFindingExpectation({
      ...base,
      evidence: {
        consentBannerDetectedMs: 100,
        sequenceEvidence: true,
        vendors: ["Meta Pixel"]
      }
    }).promotionEligibility,
    "internal_only"
  );
});

test("nano policy anchors help disclosure cases but do not replace runtime anchors", () => {
  const example = {
    evidence: {
      nanoPolicyAnchor: {
        confidence: 0.9,
        pageUrl: "https://example.test/privacy",
        snippet: "We only use advertising cookies after consent.",
        topic: "tracking_technologies_disclosure"
      },
      policyAnchor: {
        claimType: "consent_gated_tracking_claim",
        confidence: 0.88,
        extractionStatus: "fetched",
        sourceUrl: "https://example.test/privacy",
        snippet: "We only use advertising cookies after consent."
      }
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "disclosure_runtime_mismatch",
    findingId: "consent_gated_tracking_claim_conflict",
    id: "unit-nano-without-runtime",
    notes: "unit",
    scenarioType: "borderline_review",
    sourceKind: "nano_review"
  } satisfies PrivacyRuntimeFindingDatasetExample;

  assert.equal(derivePrivacyRuntimeFindingExpectation(example).promotionEligibility, "internal_only");
});

test("dark-pattern consent promotion requires actionable consent controls", () => {
  const example = {
    evidence: {
      artifactRefs: ["s3://privacy-runtime/dark-pattern/live.png"],
      consentSurfaceObserved: true,
      uiFacts: ["banner_present", "reject_action_not_observed"],
      visualFacts: ["privacy footer text mentions cookies"]
    },
    expected: {
      confidenceBand: "moderate",
      externalSurfacingEligibility: "audit_only",
      presentationState: "review",
      promotionEligibility: "internal_only"
    },
    findingGroup: "dark_pattern_consent",
    findingId: "reject_button_missing",
    id: "unit-dark-pattern-no-actionable-control",
    notes: "unit",
    scenarioType: "borderline_review",
    sourceKind: "synthetic_fixture"
  } satisfies PrivacyRuntimeFindingDatasetExample;

  assert.equal(derivePrivacyRuntimeFindingExpectation(example).promotionEligibility, "internal_only");
});
