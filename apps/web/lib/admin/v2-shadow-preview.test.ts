import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  isV2ShadowPreviewEnabled,
  parseV2ShadowPreviewArtifact,
} from "./v2-shadow-preview";

test("preview parser accepts a valid WC01 v2 shadow artifact", () => {
  const model = parseV2ShadowPreviewArtifact(JSON.stringify(validArtifact()));

  assert.equal(model.contractVersion, "wc01.v2_shadow_projection.1");
  assert.equal(model.productionEligible, false);
  assert.equal(model.source.scanId, "scan_fixture");
  assert.equal(model.rows.length, 2);
  assert.equal(model.rowsByStatus.observed, 1);
  assert.equal(model.rowsByStatus.review_signal, 1);
  assert.equal(model.rowsByWc01AssessmentStatus.checked, 1);
  assert.equal(model.rowsByWc01AssessmentStatus.review_signal, 1);
  assert.equal(model.guardrails.topFindingEligibleCount, 0);
  assert.equal(model.guardrails.gapEligibleCount, 0);
  assert.deepEqual(model.rows[0]?.vendorPurposes, ["advertising"]);
  assert.deepEqual(model.rows[0]?.vendorLabels, ["Example Ads"]);
});

test("preview flag requires explicit enablement", () => {
  assert.equal(isV2ShadowPreviewEnabled({}), false);
  assert.equal(isV2ShadowPreviewEnabled({ CERTSCORE_V2_SHADOW_PREVIEW_ENABLED: "0" }), false);
  assert.equal(isV2ShadowPreviewEnabled({ CERTSCORE_V2_SHADOW_PREVIEW_ENABLED: "1" }), true);
});

test("unsupported contract version fails closed", () => {
  assertPreviewError(
    { contractVersion: "wc01.v2_shadow_projection.0" },
    "unsupported_contract",
  );
});

test("productionEligible true fails closed", () => {
  assertPreviewError({ productionEligible: true }, "production_eligible_true");
});

test("topFindingEligible true fails closed", () => {
  const artifact = validArtifact();
  artifact.rows[0]!.topFindingEligible = true;
  assertPreviewError(artifact, "top_finding_eligible_true");
});

test("gapEligible true fails closed", () => {
  const artifact = validArtifact();
  artifact.rows[0]!.gapEligible = true;
  assertPreviewError(artifact, "gap_eligible_true");
});

test("forbidden gap status token fails closed", () => {
  const artifact = validArtifact();
  artifact.rows[0]!.status = "gap_observed";
  assertPreviewError(artifact, "forbidden_gap_status_token_present");
});

test("raw blocked fields fail closed", () => {
  const artifact = validArtifact() as Record<string, unknown>;
  artifact.requestBody = "raw body";
  assertPreviewError(artifact, "raw_blocked_fields_present");
});

test("sanitizer warnings are retained as diagnostics", () => {
  const artifact = validArtifact() as Record<string, unknown>;
  artifact.sanitizerWarnings = ["contains_long_opaque_value_without_redaction_context"];
  const model = parseV2ShadowPreviewArtifact(JSON.stringify(artifact));

  assert.deepEqual(model.sanitizerWarnings, ["contains_long_opaque_value_without_redaction_context"]);
  assert.equal(model.rows[0]?.topFindingEligible, false);
  assert.equal(model.rows[0]?.gapEligible, false);
});

test("rows render as internal diagnostic statuses only", () => {
  const model = parseV2ShadowPreviewArtifact(JSON.stringify(validArtifact()));
  const statuses = model.rows.map((row) => ({
    status: row.status,
    wc01AssessmentStatus: row.wc01AssessmentStatus,
    topFindingEligible: row.topFindingEligible,
    gapEligible: row.gapEligible,
  }));

  assert.deepEqual(statuses, [
    {
      status: "observed",
      wc01AssessmentStatus: "checked",
      topFindingEligible: false,
      gapEligible: false,
    },
    {
      status: "review_signal",
      wc01AssessmentStatus: "review_signal",
      topFindingEligible: false,
      gapEligible: false,
    },
  ]);
});

test("preview route does not import production report/checklist/executive modules", () => {
  const repoRoot = process.cwd().endsWith(`${path.sep}apps${path.sep}web`)
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();
  const pagePath = path.resolve(
    repoRoot,
    "apps/web/app/app/admin/v2-shadow-preview/page.tsx",
  );
  const pageSource = readFileSync(pagePath, "utf8");

  assert.doesNotMatch(pageSource, /shared-scan-detail-view/);
  assert.doesNotMatch(pageSource, /executive-summary-card/);
  assert.doesNotMatch(pageSource, /executive-findings-projection/);
  assert.doesNotMatch(pageSource, /coverage-checklist/);
  assert.doesNotMatch(pageSource, /normalized-concerns/);
  assert.doesNotMatch(pageSource, /unified-findings/);
});

function assertPreviewError(overrides: Record<string, unknown>, code: string) {
  const artifact = { ...validArtifact(), ...overrides };
  assert.throws(
    () => parseV2ShadowPreviewArtifact(JSON.stringify(artifact)),
    (error) => Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === code),
  );
}

function validArtifact() {
  return {
    contractVersion: "wc01.v2_shadow_projection.1",
    source: {
      scanId: "scan_fixture",
      reviewId: "review_fixture",
      url: "https://example.test",
      projectionVersion: "certscore.v2.report_projection_draft.1",
    },
    rows: [
      {
        rowId: "third_party_vendors_observed",
        sourceFindingKey: "third_party_vendors_observed",
        category: "runtime",
        status: "observed",
        wc01AssessmentStatus: "checked",
        topFindingEligible: false,
        gapEligible: false,
        evidence: {
          excerptIds: ["excerpt_fixture"],
          sourceRefIds: ["ref_fixture"],
          displaySafeExcerpts: [],
          capped: false,
          omittedCount: 0,
        },
        vendors: [
          {
            observationId: "vendor_fixture",
            entity: "Example Ads",
            vendor: "Example Ads",
            purpose: "advertising",
            confidence: 0.9,
            basis: ["fixture"],
            regulatoryRelevance: ["diagnostic"],
          },
        ],
        confidence: {
          score: 0.9,
          band: "high",
          directVsInferred: "direct",
        },
        policy: {
          reviewOnlyReasons: ["shadow_projection_only"],
          matchedCriteria: ["fixture_observed"],
          missingCorroborators: [],
          demotionReasons: [],
        },
      },
      {
        rowId: "policy_runtime_vendor_alignment_review",
        sourceFindingKey: "policy_runtime_vendor_alignment_review_signal",
        category: "policy_surface",
        status: "review_signal",
        wc01AssessmentStatus: "review_signal",
        topFindingEligible: false,
        gapEligible: false,
        evidence: {
          excerptIds: [],
          sourceRefIds: [],
          displaySafeExcerpts: [],
          capped: true,
          omittedCount: 2,
        },
        vendors: [],
        confidence: {
          score: 0.6,
          band: "medium",
          directVsInferred: "mixed",
        },
        policy: {
          reviewOnlyReasons: ["shadow_projection_only", "review_only_finding_key"],
          matchedCriteria: ["policy_runtime_alignment"],
          missingCorroborators: ["manual_review"],
          demotionReasons: ["review_signal_only"],
        },
      },
    ],
    limitations: [],
    sanitizerWarnings: [],
    productionEligible: false,
  };
}
