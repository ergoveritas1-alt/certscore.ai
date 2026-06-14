import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2ConcernPolicyShapeComparison,
  type Wc01V2ConcernPolicyShapeComparison,
} from "./wc01-v2-concern-policy-shape-comparison";
import {
  buildWc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMappingCandidateInput,
  type Wc01V2NormalizedConcernDraftMappingInput,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
} from "./wc01-v2-normalized-concern-draft-mapping";
import {
  buildWc01V2NormalizedConcernSchemaComparison,
} from "./wc01-v2-normalized-concern-schema-comparison";
import {
  buildWc01V2ProductionIntegrationCandidateArtifact,
} from "./wc01-v2-production-integration-candidate";
import {
  buildWc01V2ProjectionShapeComparison,
  buildWc01V2ProjectionShapeComparisonJson,
  failClosedReasonsForProjectionFamily,
  WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION,
} from "./wc01-v2-projection-shape-comparison";
import {
  buildWc01V2ProjectionShapeComparisonSummary,
  generateWc01V2ProjectionShapeComparisonSingleFromFile,
  renderWc01V2ProjectionShapeComparisonMarkdown,
} from "./wc01-v2-projection-shape-comparison-output";

test("valid concern-policy shape emits fixture-only projection shape comparison", () => {
  const comparison = buildWc01V2ProjectionShapeComparison(validConcernPolicyShape(), "policy-shape.json");

  assert.equal(comparison.packetVersion, WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION);
  assert.deepEqual(comparison.comparedFamilies, [
    "pre_consent_cookie_storage",
    "pre_consent_tracking",
  ]);
  assert.deepEqual(comparison.missingProjectionInputs.pre_consent_tracking, []);
  assert.deepEqual(comparison.missingProjectionInputs.pre_consent_cookie_storage, []);
  assert.equal(comparison.blockedReasons.length, 0);
  assert.equal(comparison.recommendation, "projection_shape_reviewable_fixture_only");
  assert.equal(comparison.unifiedFindingShapeReadiness.status, "fixture_reviewable");
  assert.equal(comparison.checklistProjectionShapeReadiness.status, "fixture_reviewable");
  assert.equal(comparison.evidencePacketReadiness.status, "fixture_reviewable");
  assert.equal(comparison.unifiedFindingEligible, false);
  assert.equal(comparison.checklistProjectionEligible, false);
  assert.equal(comparison.customerFacingEligible, false);
  assert.equal(comparison.explicitApprovalRequired, true);
  assert.equal(
    comparison.proposedUnifiedFindingKeys.includes("v2.pre_consent_tracking.unified_finding_candidate_draft"),
    true,
  );
  assert.equal(
    comparison.proposedChecklistRowKeys.includes("v2.pre_consent_cookie_storage.checklist_row_candidate_draft"),
    true,
  );
  assertNoForbiddenOutput(comparison);
});

test("missing policy key and policy inputs fail closed", () => {
  const policyShape = validConcernPolicyShape();
  policyShape.proposedConcernPolicyKeys = policyShape.proposedConcernPolicyKeys.filter(
    (key) => !key.includes("pre_consent_tracking"),
  );
  policyShape.policyInputRequirements.pre_consent_tracking = [];
  policyShape.missingPolicyInputs.pre_consent_tracking = ["source_evidence_refs"];

  const comparison = buildWc01V2ProjectionShapeComparison(policyShape, "policy-shape.json");

  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:concern_policy_key_missing"),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:policy_shape_missing_required_inputs"),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:projection_input_missing:source_evidence_refs"),
    true,
  );
  assert.equal(comparison.unifiedFindingShapeReadiness.status, "blocked");
  assertNoForbiddenOutput(comparison);
});

test("source policy shape blocked reasons and open flags fail closed while output remains closed", () => {
  const policyShape = validConcernPolicyShape() as Wc01V2ConcernPolicyShapeComparison & {
    productionEligible: boolean;
    unifiedFindingEligible: boolean;
    checklistProjectionEligible: boolean;
    explicitApprovalRequired: boolean;
  };
  policyShape.blockedReasons = ["pre_consent_tracking:policy_input_missing:source_evidence_refs"];
  policyShape.recommendation = "blocked_needs_schema_or_policy_shape_revision";
  policyShape.productionEligible = true;
  policyShape.unifiedFindingEligible = true;
  policyShape.checklistProjectionEligible = true;
  policyShape.explicitApprovalRequired = false;

  const comparison = buildWc01V2ProjectionShapeComparison(policyShape, "policy-shape.json");

  assert.equal(comparison.blockedReasons.includes("policy_shape_attempts_production_eligibility"), true);
  assert.equal(comparison.blockedReasons.includes("policy_shape_attempts_unified_finding"), true);
  assert.equal(comparison.blockedReasons.includes("policy_shape_attempts_checklist_projection"), true);
  assert.equal(comparison.blockedReasons.includes("policy_shape_attempts_to_skip_explicit_approval"), true);
  assert.equal(comparison.blockedReasons.includes("policy_shape_not_reviewable_fixture_only"), true);
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:source_policy_shape_has_blocked_reasons"),
    true,
  );
  assert.equal(comparison.productionEligible, false);
  assert.equal(comparison.unifiedFindingEligible, false);
  assert.equal(comparison.checklistProjectionEligible, false);
  assertNoForbiddenOutput(comparison);
});

test("non-reviewable policy readiness fails closed", () => {
  const policyShape = validConcernPolicyShape();
  policyShape.copyReviewReadiness = {
    status: "blocked",
    reasons: ["copy review not ready"],
  };

  const reasons = failClosedReasonsForProjectionFamily("pre_consent_tracking", policyShape);

  assert.equal(reasons.includes("policy_shape_readiness_not_reviewable"), true);
});

test("unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language are rejected", () => {
  const raw = JSON.stringify(validConcernPolicyShape());

  assert.throws(
    () => buildWc01V2ProjectionShapeComparisonJson(
      raw.replace("wc01.v2_concern_policy_shape_comparison.1", "unsupported"),
      "policy-shape.json",
    ),
    /Unsupported Wc01V2ConcernPolicyShapeComparison version/,
  );
  assert.throws(
    () => buildWc01V2ProjectionShapeComparisonJson(JSON.stringify({
      ...validConcernPolicyShape(),
      requestBody: "raw",
    }), "policy-shape.json"),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ProjectionShapeComparisonJson(JSON.stringify({
      ...validConcernPolicyShape(),
      note: "gap_observed",
    }), "policy-shape.json"),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2ProjectionShapeComparisonJson(JSON.stringify({
      ...validConcernPolicyShape(),
      note: "illegal",
    }), "policy-shape.json"),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve closed defaults", () => {
  const comparison = buildWc01V2ProjectionShapeComparison(validConcernPolicyShape(), "policy-shape.json");
  const summary = buildWc01V2ProjectionShapeComparisonSummary(comparison);
  const markdown = renderWc01V2ProjectionShapeComparisonMarkdown(summary);

  assert.equal(summary.missingProjectionInputCountsByFamily.pre_consent_tracking, 0);
  assert.equal(summary.missingProjectionInputCountsByFamily.pre_consent_cookie_storage, 0);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.equal(summary.explicitApprovalRequired, true);
  assert.match(markdown, /Fixture-only internal diagnostic/);
  assert.match(markdown, /Unified finding eligible: false/);
  assert.match(markdown, /Checklist projection eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-projection-shape-comparison-"));
  try {
    const concernPolicyShapePath = join(tmp, "Wc01V2ConcernPolicyShapeComparison.json");
    const outPath = join(tmp, "Wc01V2ProjectionShapeComparison.json");
    await writeFile(concernPolicyShapePath, `${JSON.stringify(validConcernPolicyShape(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ProjectionShapeComparisonSingleFromFile({
      concernPolicyShapePath,
      outPath,
    });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as { unifiedFindingEligible: boolean };

    assert.equal(generated.summary.comparedFamilies.length, 2);
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2ProjectionShapeComparison.summary.md"));
    assert.equal(saved.unifiedFindingEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("projection shape comparison modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-projection-shape-comparison.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-projection-shape-comparison-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-projection-shape-comparison.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /apps\/web\/.*concern-policy/);
  assert.doesNotMatch(sources, /normalized-concerns/);
  assert.doesNotMatch(sources, /persist/i);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /report/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /top-finding/);
  assert.doesNotMatch(sources, /scoring/);
  assert.doesNotMatch(sources, /regulatory-lens/);
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function validConcernPolicyShape() {
  return buildWc01V2ConcernPolicyShapeComparison(
    buildWc01V2NormalizedConcernSchemaComparison(
      buildWc01V2ProductionIntegrationCandidateArtifact(
        buildWc01V2NormalizedConcernDraftMapping(validInput()),
        "mapping.json",
      ),
      "candidate.json",
    ),
    "schema.json",
  );
}

function validInput(): Wc01V2NormalizedConcernDraftMappingInput {
  return {
    inputVersion: WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
    sourceArtifactPath: "artifacts/example/Wc01V2ProductionReadinessGateDraft.json",
    sourceArtifactKind: "production_readiness_gate_draft",
    candidates: [
      validTrackingCandidate(),
      validCookieStorageCandidate(),
    ],
  };
}

function validTrackingCandidate(): Wc01V2NormalizedConcernDraftMappingCandidateInput {
  return {
    sourceFamily: "pre_consent_tracking",
    evidenceRefs: ["source_ref_tracking_request"],
    displaySafeExcerptRefs: ["excerpt_tracking_request"],
    consentStateContext: {
      phase: "pre_consent",
      observedBeforeConsentAction: true,
      sourceRefIds: ["source_ref_tracking_request"],
    },
    confidence: "high",
    directness: "direct",
    vendorOrEndpointAttribution: {
      kind: "vendor",
      name: "Example Analytics",
      confidence: "high",
      sourceRefIds: ["source_ref_tracking_request"],
    },
    purposeBasis: {
      supportingPurposes: ["analytics"],
      diagnosticPurposes: [],
    },
    exclusionsApplied: [
      "tag_management_only_excluded",
      "consent_management_only_excluded",
      "diagnostic_only_purposes_excluded",
      "inventory_only_excluded",
      "policy_runtime_alignment_only_excluded",
      "consent_flow_delta_only_excluded",
      "library_only_evidence_excluded",
    ],
    sensitiveContextCategories: [],
    unresolvedRefDisposition: {
      unresolvedRefCount: 0,
      affectsEvidenceSufficiency: false,
      notes: ["No unresolved refs affect this fixture."],
    },
    rollbackSuppressionHints: ["suppress_by_family_or_vendor"],
    blockedSurfaces: [
      "executive_summary",
      "top_findings",
      "scoring",
      "regulatory_lens_output",
      "api_mcp_export",
    ],
  };
}

function validCookieStorageCandidate(): Wc01V2NormalizedConcernDraftMappingCandidateInput {
  return {
    ...validTrackingCandidate(),
    sourceFamily: "pre_consent_cookie_storage",
    evidenceRefs: ["source_ref_cookie_write"],
    displaySafeExcerptRefs: ["excerpt_cookie_write"],
    consentStateContext: {
      phase: "pre_consent",
      observedBeforeConsentAction: true,
      sourceRefIds: ["source_ref_cookie_write"],
    },
    cookieStorageContext: {
      party: "third_party",
      storageType: "cookie",
      observedWriteBeforeConsentAction: true,
      unsafeStorageContentPresent: false,
      sourceRefIds: ["source_ref_cookie_write"],
    },
    vendorOrEndpointAttribution: {
      kind: "endpoint",
      name: "example-ad-measurement.test",
      confidence: "high",
      sourceRefIds: ["source_ref_cookie_write"],
    },
    purposeBasis: {
      supportingPurposes: ["advertising_measurement"],
      diagnosticPurposes: [],
    },
    exclusionsApplied: [
      "tag_management_only_excluded",
      "consent_management_only_excluded",
      "diagnostic_only_purposes_excluded",
      "inventory_only_excluded",
      "policy_runtime_alignment_only_excluded",
      "consent_flow_delta_only_excluded",
      "raw_cookie_values_excluded",
      "unsafe_storage_content_excluded",
    ],
  };
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\bgap_observed\b/);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
}
