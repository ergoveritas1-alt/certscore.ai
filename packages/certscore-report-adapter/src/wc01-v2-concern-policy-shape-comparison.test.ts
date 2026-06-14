import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMappingCandidateInput,
  type Wc01V2NormalizedConcernDraftMappingInput,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
} from "./wc01-v2-normalized-concern-draft-mapping";
import {
  buildWc01V2ProductionIntegrationCandidateArtifact,
} from "./wc01-v2-production-integration-candidate";
import {
  buildWc01V2NormalizedConcernSchemaComparison,
  type Wc01V2NormalizedConcernSchemaComparison,
} from "./wc01-v2-normalized-concern-schema-comparison";
import {
  buildWc01V2ConcernPolicyShapeComparison,
  buildWc01V2ConcernPolicyShapeComparisonJson,
  failClosedReasonsForFamilyPolicyShape,
  WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION,
} from "./wc01-v2-concern-policy-shape-comparison";
import {
  buildWc01V2ConcernPolicyShapeComparisonSummary,
  generateWc01V2ConcernPolicyShapeComparisonSingleFromFile,
  renderWc01V2ConcernPolicyShapeComparisonMarkdown,
} from "./wc01-v2-concern-policy-shape-comparison-output";

test("valid schema comparison emits fixture-only concern-policy shape comparison", () => {
  const comparison = buildWc01V2ConcernPolicyShapeComparison(validSchemaComparison(), "schema.json");

  assert.equal(comparison.packetVersion, WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION);
  assert.deepEqual(comparison.comparedFamilies, [
    "pre_consent_cookie_storage",
    "pre_consent_tracking",
  ]);
  assert.deepEqual(comparison.missingPolicyInputs.pre_consent_tracking, []);
  assert.deepEqual(comparison.missingPolicyInputs.pre_consent_cookie_storage, []);
  assert.equal(comparison.blockedReasons.length, 0);
  assert.equal(comparison.recommendation, "concern_policy_shape_reviewable_fixture_only");
  assert.equal(comparison.decisionReadiness.status, "fixture_reviewable");
  assert.equal(comparison.suppressionReadiness.status, "fixture_reviewable");
  assert.equal(comparison.copyReviewReadiness.status, "fixture_reviewable");
  assert.equal(comparison.productionEligible, false);
  assert.equal(comparison.persistEligible, false);
  assert.equal(comparison.concernPolicyCallEligible, false);
  assert.equal(comparison.unifiedFindingEligible, false);
  assert.equal(comparison.checklistProjectionEligible, false);
  assert.equal(comparison.customerFacingEligible, false);
  assert.equal(comparison.explicitApprovalRequired, true);
  assertNoForbiddenOutput(comparison);
});

test("missing policy key and normalized concern type fail closed", () => {
  const schema = validSchemaComparison();
  schema.proposedConcernPolicyKeys = schema.proposedConcernPolicyKeys.filter(
    (key) => !key.includes("pre_consent_tracking"),
  );
  schema.proposedNormalizedConcernTypes = schema.proposedNormalizedConcernTypes.filter(
    (type) => !type.includes("pre_consent_tracking"),
  );

  const comparison = buildWc01V2ConcernPolicyShapeComparison(schema, "schema.json");

  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:proposed_concern_policy_key_missing"),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:proposed_normalized_concern_type_missing"),
    true,
  );
  assert.equal(comparison.decisionReadiness.status, "blocked");
  assertNoForbiddenOutput(comparison);
});

test("missing evidence, consent, confidence, purpose, suppression, and storage inputs fail closed", () => {
  const schema = validSchemaComparison();
  schema.requiredFieldsPresent.pre_consent_cookie_storage = [];
  schema.missingFields.pre_consent_cookie_storage = ["source_evidence_refs", "storage_type"];

  const comparison = buildWc01V2ConcernPolicyShapeComparison(schema, "schema.json");

  assert.equal(
    comparison.blockedReasons.includes("pre_consent_cookie_storage:schema_missing_required_fields"),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_cookie_storage:policy_input_missing:source_evidence_refs"),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_cookie_storage:policy_input_missing:storage_type"),
    true,
  );
  assert.equal(
    comparison.missingPolicyInputs.pre_consent_cookie_storage?.includes("storage_type"),
    true,
  );
  assertNoForbiddenOutput(comparison);
});

test("source schema blocked reasons and open flags fail closed while output remains closed", () => {
  const schema = validSchemaComparison() as Wc01V2NormalizedConcernSchemaComparison & {
    productionEligible: boolean;
    concernPolicyCallEligible: boolean;
    explicitApprovalRequired: boolean;
  };
  schema.blockedReasons = ["pre_consent_tracking:evidence_refs_missing"];
  schema.recommendation = "blocked_needs_candidate_shape_revision";
  schema.productionEligible = true;
  schema.concernPolicyCallEligible = true;
  schema.explicitApprovalRequired = false;

  const comparison = buildWc01V2ConcernPolicyShapeComparison(schema, "schema.json");

  assert.equal(comparison.blockedReasons.includes("schema_attempts_production_eligibility"), true);
  assert.equal(comparison.blockedReasons.includes("schema_attempts_concern_policy_call"), true);
  assert.equal(comparison.blockedReasons.includes("schema_attempts_to_skip_explicit_approval"), true);
  assert.equal(comparison.blockedReasons.includes("schema_not_reviewable_fixture_only"), true);
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:source_schema_has_blocked_reasons"),
    true,
  );
  assert.equal(comparison.productionEligible, false);
  assert.equal(comparison.concernPolicyCallEligible, false);
  assert.equal(comparison.explicitApprovalRequired, true);
  assertNoForbiddenOutput(comparison);
});

test("family fail-closed helper reports missing policy inputs", () => {
  const schema = validSchemaComparison();
  schema.requiredFieldsPresent.pre_consent_tracking = schema.requiredFieldsPresent.pre_consent_tracking?.filter(
    (field) => field !== "vendor_endpoint_attribution",
  ) ?? [];

  const reasons = failClosedReasonsForFamilyPolicyShape("pre_consent_tracking", schema);

  assert.equal(reasons.includes("policy_input_missing:vendor_endpoint_attribution"), true);
});

test("unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language are rejected", () => {
  const raw = JSON.stringify(validSchemaComparison());

  assert.throws(
    () => buildWc01V2ConcernPolicyShapeComparisonJson(
      raw.replace("wc01.v2_normalized_concern_schema_comparison.1", "unsupported"),
      "schema.json",
    ),
    /Unsupported Wc01V2NormalizedConcernSchemaComparison version/,
  );
  assert.throws(
    () => buildWc01V2ConcernPolicyShapeComparisonJson(JSON.stringify({
      ...validSchemaComparison(),
      requestBody: "raw",
    }), "schema.json"),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ConcernPolicyShapeComparisonJson(JSON.stringify({
      ...validSchemaComparison(),
      note: "gap_observed",
    }), "schema.json"),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2ConcernPolicyShapeComparisonJson(JSON.stringify({
      ...validSchemaComparison(),
      note: "illegal",
    }), "schema.json"),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve closed defaults", () => {
  const comparison = buildWc01V2ConcernPolicyShapeComparison(validSchemaComparison(), "schema.json");
  const summary = buildWc01V2ConcernPolicyShapeComparisonSummary(comparison);
  const markdown = renderWc01V2ConcernPolicyShapeComparisonMarkdown(summary);

  assert.equal(summary.missingPolicyInputCountsByFamily.pre_consent_tracking, 0);
  assert.equal(summary.missingPolicyInputCountsByFamily.pre_consent_cookie_storage, 0);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.equal(summary.explicitApprovalRequired, true);
  assert.match(markdown, /Fixture-only internal diagnostic/);
  assert.match(markdown, /Concern policy call eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-concern-policy-shape-comparison-"));
  try {
    const schemaComparisonPath = join(tmp, "Wc01V2NormalizedConcernSchemaComparison.json");
    const outPath = join(tmp, "Wc01V2ConcernPolicyShapeComparison.json");
    await writeFile(schemaComparisonPath, `${JSON.stringify(validSchemaComparison(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ConcernPolicyShapeComparisonSingleFromFile({
      schemaComparisonPath,
      outPath,
    });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as { concernPolicyCallEligible: boolean };

    assert.equal(generated.summary.comparedFamilies.length, 2);
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2ConcernPolicyShapeComparison.summary.md"));
    assert.equal(saved.concernPolicyCallEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("concern-policy shape comparison modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-shape-comparison.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-shape-comparison-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-concern-policy-shape-comparison.ts"), "utf8"),
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

function validSchemaComparison() {
  return buildWc01V2NormalizedConcernSchemaComparison(
    buildWc01V2ProductionIntegrationCandidateArtifact(
      buildWc01V2NormalizedConcernDraftMapping(validInput()),
      "mapping.json",
    ),
    "candidate.json",
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
