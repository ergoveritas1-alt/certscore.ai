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
  type Wc01V2ProductionIntegrationCandidateArtifact,
} from "./wc01-v2-production-integration-candidate";
import {
  buildWc01V2NormalizedConcernSchemaComparison,
  buildWc01V2NormalizedConcernSchemaComparisonJson,
  failClosedReasonsForCandidate,
  WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION,
} from "./wc01-v2-normalized-concern-schema-comparison";
import {
  buildWc01V2NormalizedConcernSchemaComparisonSummary,
  generateWc01V2NormalizedConcernSchemaComparisonSingleFromFile,
  renderWc01V2NormalizedConcernSchemaComparisonMarkdown,
} from "./wc01-v2-normalized-concern-schema-comparison-output";

test("valid production integration candidate compares against WC01 normalized-concern shape as fixture-only", () => {
  const comparison = buildWc01V2NormalizedConcernSchemaComparison(validCandidateArtifact(), "candidate.json");

  assert.equal(comparison.packetVersion, WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION);
  assert.deepEqual(comparison.comparedFamilies, [
    "pre_consent_cookie_storage",
    "pre_consent_tracking",
  ]);
  assert.deepEqual(comparison.missingFields.pre_consent_tracking, []);
  assert.deepEqual(comparison.missingFields.pre_consent_cookie_storage, []);
  assert.equal(comparison.blockedReasons.length, 0);
  assert.equal(comparison.recommendation, "schema_shape_reviewable_fixture_only");
  assert.equal(comparison.concernPolicyReadiness.status, "fixture_reviewable");
  assert.equal(comparison.unifiedFindingReadiness.status, "fixture_reviewable");
  assert.equal(comparison.checklistProjectionReadiness.status, "fixture_reviewable");
  assert.equal(comparison.productionEligible, false);
  assert.equal(comparison.persistEligible, false);
  assert.equal(comparison.concernPolicyCallEligible, false);
  assert.equal(comparison.unifiedFindingEligible, false);
  assert.equal(comparison.checklistProjectionEligible, false);
  assert.equal(comparison.customerFacingEligible, false);
  assert.equal(comparison.explicitApprovalRequired, true);
  assertNoForbiddenOutput(comparison);
});

test("missing refs, excerpt refs, confidence, directness, and consent context fail closed", () => {
  const artifact = validCandidateArtifact();
  const candidate = artifact.candidates[0]!;
  candidate.normalizedConcernDraft.evidenceRefs = [];
  candidate.normalizedConcernDraft.displaySafeExcerptRefs = [];
  delete (candidate.normalizedConcernDraft as Record<string, unknown>).consentStateContext;
  delete (candidate.normalizedConcernDraft as Record<string, unknown>).confidence;
  delete (candidate.normalizedConcernDraft as Record<string, unknown>).directness;

  const comparison = buildWc01V2NormalizedConcernSchemaComparison(artifact, "candidate.json");

  assert.equal(comparison.recommendation, "blocked_needs_candidate_shape_revision");
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:evidence_refs_missing"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:display_safe_excerpt_refs_missing"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:consent_state_context_missing"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:confidence_missing"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:directness_missing"), true);
  assert.equal(comparison.concernPolicyReadiness.status, "blocked");
  assertNoForbiddenOutput(comparison);
});

test("cookie/storage candidates require party and storage context", () => {
  const artifact = validCandidateArtifact();
  const candidate = artifact.candidates.find((entry) => entry.family === "pre_consent_cookie_storage");
  assert.ok(candidate);
  delete (candidate.normalizedConcernDraft as Record<string, unknown>).cookieStorageContext;

  const comparison = buildWc01V2NormalizedConcernSchemaComparison(artifact, "candidate.json");

  assert.equal(comparison.blockedReasons.includes("pre_consent_cookie_storage:cookie_storage_context_missing"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_cookie_storage:storage_type_missing"), true);
  assert.equal(
    comparison.evidenceRequirementCoverage.pre_consent_cookie_storage?.some(
      (entry) => entry.requirement === "storage_type" && entry.status === "missing",
    ),
    true,
  );
  assertNoForbiddenOutput(comparison);
});

test("sensitive context and unresolved refs remain closed for schema comparison", () => {
  const artifact = validCandidateArtifact();
  const candidate = artifact.candidates[0]!;
  candidate.normalizedConcernDraft.sensitiveContextCategories = ["health"];
  candidate.normalizedConcernDraft.unresolvedRefDisposition = {
    unresolvedRefCount: 2,
    affectsEvidenceSufficiency: true,
    notes: ["Reviewer would need upstream artifact inspection."],
  };

  const reasons = failClosedReasonsForCandidate(candidate);
  assert.equal(reasons.includes("sensitive_context_requires_separate_policy_product_approval"), true);
  assert.equal(reasons.includes("unresolved_refs_affect_evidence_sufficiency"), true);

  const comparison = buildWc01V2NormalizedConcernSchemaComparison(artifact, "candidate.json");
  assert.equal(
    comparison.blockedReasons.includes(
      "pre_consent_tracking:sensitive_context_requires_separate_policy_product_approval",
    ),
    true,
  );
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:unresolved_refs_affect_evidence_sufficiency"),
    true,
  );
  assertNoForbiddenOutput(comparison);
});

test("open artifact or candidate flags are represented as fail-closed comparison reasons", () => {
  const artifact = validCandidateArtifact() as Wc01V2ProductionIntegrationCandidateArtifact & {
    productionEligible: boolean;
    concernPolicyCallEligible: boolean;
  };
  artifact.productionEligible = true;
  artifact.concernPolicyCallEligible = true;
  artifact.candidates[0]!.closedDefaultFlags = {
    ...artifact.candidates[0]!.closedDefaultFlags,
    unifiedFindingEligible: true as false,
    customerFacingEligible: true as false,
  };

  const comparison = buildWc01V2NormalizedConcernSchemaComparison(artifact, "candidate.json");

  assert.equal(comparison.blockedReasons.includes("artifact_attempts_production_eligibility"), true);
  assert.equal(comparison.blockedReasons.includes("artifact_attempts_concern_policy_call"), true);
  assert.equal(comparison.blockedReasons.includes("pre_consent_tracking:candidate_attempts_unified_finding"), true);
  assert.equal(
    comparison.blockedReasons.includes("pre_consent_tracking:candidate_attempts_customer_facing_eligibility"),
    true,
  );
  assert.equal(comparison.productionEligible, false);
  assert.equal(comparison.customerFacingEligible, false);
  assertNoForbiddenOutput(comparison);
});

test("unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language are rejected", () => {
  const raw = JSON.stringify(validCandidateArtifact());

  assert.throws(
    () => buildWc01V2NormalizedConcernSchemaComparisonJson(
      raw.replace("wc01.v2_production_integration_candidate.1", "unsupported"),
      "candidate.json",
    ),
    /Unsupported Wc01V2ProductionIntegrationCandidate version/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernSchemaComparisonJson(JSON.stringify({
      ...validCandidateArtifact(),
      requestBody: "raw",
    }), "candidate.json"),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernSchemaComparisonJson(JSON.stringify({
      ...validCandidateArtifact(),
      note: "gap_observed",
    }), "candidate.json"),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernSchemaComparisonJson(JSON.stringify({
      ...validCandidateArtifact(),
      note: "illegal",
    }), "candidate.json"),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve closed defaults", () => {
  const comparison = buildWc01V2NormalizedConcernSchemaComparison(validCandidateArtifact(), "candidate.json");
  const summary = buildWc01V2NormalizedConcernSchemaComparisonSummary(comparison);
  const markdown = renderWc01V2NormalizedConcernSchemaComparisonMarkdown(summary);

  assert.equal(summary.missingFieldCountsByFamily.pre_consent_tracking, 0);
  assert.equal(summary.missingFieldCountsByFamily.pre_consent_cookie_storage, 0);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.equal(summary.explicitApprovalRequired, true);
  assert.match(markdown, /Fixture-only internal diagnostic/);
  assert.match(markdown, /Production eligible: false/);
  assert.match(markdown, /Concern policy call eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-normalized-concern-schema-comparison-"));
  try {
    const candidatePath = join(tmp, "Wc01V2ProductionIntegrationCandidate.json");
    const outPath = join(tmp, "Wc01V2NormalizedConcernSchemaComparison.json");
    await writeFile(candidatePath, `${JSON.stringify(validCandidateArtifact(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2NormalizedConcernSchemaComparisonSingleFromFile({
      candidatePath,
      outPath,
    });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as { productionEligible: boolean };

    assert.equal(generated.summary.comparedFamilies.length, 2);
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2NormalizedConcernSchemaComparison.summary.md"));
    assert.equal(saved.productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("normalized concern schema comparison modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-schema-comparison.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-schema-comparison-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-normalized-concern-schema-comparison.ts"), "utf8"),
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

function validCandidateArtifact() {
  return buildWc01V2ProductionIntegrationCandidateArtifact(
    buildWc01V2NormalizedConcernDraftMapping(validInput()),
    "mapping.json",
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
