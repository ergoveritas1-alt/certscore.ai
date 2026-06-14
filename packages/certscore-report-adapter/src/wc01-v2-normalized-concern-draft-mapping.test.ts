import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2NormalizedConcernDraftMapping,
  buildWc01V2NormalizedConcernDraftMappingJson,
  failClosedReasonsForCandidate,
  type Wc01V2NormalizedConcernDraftMappingCandidateInput,
  type Wc01V2NormalizedConcernDraftMappingInput,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION,
} from "./wc01-v2-normalized-concern-draft-mapping";
import {
  buildWc01V2NormalizedConcernDraftMappingSummary,
  generateWc01V2NormalizedConcernDraftMappingSingleFromFile,
  renderWc01V2NormalizedConcernDraftMappingMarkdown,
} from "./wc01-v2-normalized-concern-draft-mapping-output";

test("valid pre_consent_tracking emits fixture-only normalized concern draft mapping", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping({
    ...validInput(),
    candidates: [validTrackingCandidate()],
  });

  assert.equal(mapping.packetVersion, WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION);
  assert.equal(mapping.draftMappings.length, 1);
  assert.equal(mapping.blockedMappings.length, 0);
  assert.equal(mapping.implementationStatus, "not_approved");
  assert.equal(mapping.productionEligible, false);
  assert.equal(mapping.persistEligible, false);
  assert.equal(mapping.concernPolicyCallEligible, false);
  assert.equal(mapping.unifiedFindingEligible, false);
  assert.equal(mapping.checklistProjectionEligible, false);
  assert.equal(mapping.customerFacingEligible, false);
  assert.equal(mapping.explicitApprovalRequired, true);

  const draft = mapping.draftMappings[0];
  assert.ok(draft);
  assert.equal(draft.sourceFamily, "pre_consent_tracking");
  assert.equal(draft.proposedNormalizedConcernType, "v2_pre_consent_tracking_normalized_concern_draft");
  assert.equal(draft.proposedConcernPolicyKey, "v2.pre_consent_tracking.reviewed_non_sensitive");
  assert.equal(draft.consentStateContext.phase, "pre_consent");
  assert.equal(draft.vendorOrEndpointAttribution.name, "Example Analytics");
  assertNoForbiddenOutput(mapping);
});

test("valid pre_consent_cookie_storage emits fixture-only normalized concern draft mapping", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping({
    ...validInput(),
    candidates: [validCookieStorageCandidate()],
  });

  assert.equal(mapping.draftMappings.length, 1);
  assert.equal(mapping.blockedMappings.length, 0);

  const draft = mapping.draftMappings[0];
  assert.ok(draft);
  assert.equal(draft.sourceFamily, "pre_consent_cookie_storage");
  assert.equal(draft.proposedNormalizedConcernType, "v2_pre_consent_cookie_storage_normalized_concern_draft");
  assert.equal(draft.proposedConcernPolicyKey, "v2.pre_consent_cookie_storage.reviewed_non_sensitive");
  assert.equal(draft.cookieStorageContext?.party, "third_party");
  assert.equal(draft.cookieStorageContext?.unsafeStorageContentPresent, false);
  assertNoForbiddenOutput(mapping);
});

test("sensitive-context candidate fails closed and does not emit a draft", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping({
    ...validInput(),
    candidates: [{
      ...validTrackingCandidate(),
      sensitiveContextCategories: ["health"],
    }],
  });

  assert.equal(mapping.draftMappings.length, 0);
  assert.deepEqual(mapping.blockedMappings[0]?.failClosedReasons, [
    "sensitive_context_requires_separate_policy_product_approval",
  ]);
});

test("missing evidence refs, excerpt refs, and consent-state context fail closed", () => {
  const reasons = failClosedReasonsForCandidate({
    ...validTrackingCandidate(),
    evidenceRefs: [],
    displaySafeExcerptRefs: [],
    consentStateContext: undefined,
  });

  assert.equal(reasons.includes("evidence_refs_missing"), true);
  assert.equal(reasons.includes("display_safe_excerpt_refs_missing"), true);
  assert.equal(reasons.includes("consent_state_context_missing"), true);
});

test("diagnostic-only purpose sole support fails closed", () => {
  const reasons = failClosedReasonsForCandidate({
    ...validTrackingCandidate(),
    purposeBasis: {
      supportingPurposes: ["security"],
      diagnosticPurposes: [],
    },
  });

  assert.equal(reasons.includes("diagnostic_only_purpose_is_sole_or_mixed_support"), true);
  assert.equal(reasons.includes("supporting_purpose_missing"), true);
});

test("tag-management-only and consent-management-only support fail closed", () => {
  assert.equal(
    failClosedReasonsForCandidate({
      ...validTrackingCandidate(),
      purposeBasis: {
        supportingPurposes: ["tag_management"],
        diagnosticPurposes: [],
      },
    }).includes("tag_management_only_support"),
    true,
  );

  assert.equal(
    failClosedReasonsForCandidate({
      ...validTrackingCandidate(),
      purposeBasis: {
        supportingPurposes: ["consent_management"],
        diagnosticPurposes: [],
      },
    }).includes("consent_management_only_support"),
    true,
  );
});

test("cookie/storage mapping rejects unsafe or first-party storage context", () => {
  const unsafe = failClosedReasonsForCandidate({
    ...validCookieStorageCandidate(),
    cookieStorageContext: {
      ...validCookieStorageCandidate().cookieStorageContext,
      unsafeStorageContentPresent: true,
    },
  });
  assert.equal(unsafe.includes("unsafe_storage_content_present"), true);

  const firstParty = failClosedReasonsForCandidate({
    ...validCookieStorageCandidate(),
    cookieStorageContext: {
      ...validCookieStorageCandidate().cookieStorageContext,
      party: "first_party",
    },
  });
  assert.equal(firstParty.includes("non_third_party_storage_context"), true);
});

test("unresolved refs that affect sufficiency fail closed", () => {
  const reasons = failClosedReasonsForCandidate({
    ...validTrackingCandidate(),
    unresolvedRefDisposition: {
      unresolvedRefCount: 3,
      affectsEvidenceSufficiency: true,
      notes: ["requires upstream inspection"],
    },
  });

  assert.equal(reasons.includes("unresolved_refs_affect_evidence_sufficiency"), true);
});

test("target output attempts to open production flags fail closed while output remains closed", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping({
    ...validInput(),
    targetOutputFlags: {
      productionEligible: true,
      persistEligible: true,
      concernPolicyCallEligible: true,
      unifiedFindingEligible: true,
      checklistProjectionEligible: true,
      customerFacingEligible: true,
      explicitApprovalRequired: false,
    },
  });

  assert.equal(mapping.draftMappings.length, 0);
  assert.equal(mapping.productionEligible, false);
  assert.equal(mapping.persistEligible, false);
  assert.equal(mapping.concernPolicyCallEligible, false);
  assert.equal(mapping.unifiedFindingEligible, false);
  assert.equal(mapping.checklistProjectionEligible, false);
  assert.equal(mapping.customerFacingEligible, false);
  assert.equal(mapping.explicitApprovalRequired, true);
  assert.deepEqual(mapping.blockedMappings[0]?.failClosedReasons, [
    "target_output_attempts_checklist_projection",
    "target_output_attempts_concern_policy_call",
    "target_output_attempts_customer_facing_eligibility",
    "target_output_attempts_persistence",
    "target_output_attempts_production_eligibility",
    "target_output_attempts_to_skip_explicit_approval",
    "target_output_attempts_unified_finding",
  ]);
  assertNoForbiddenOutput(mapping);
});

test("parser rejects unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language", () => {
  assert.throws(
    () => buildWc01V2NormalizedConcernDraftMappingJson(JSON.stringify({
      ...validInput(),
      inputVersion: "unsupported",
    })),
    /Unsupported Wc01V2NormalizedConcernDraftMappingInput version/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernDraftMappingJson(JSON.stringify({
      ...validInput(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernDraftMappingJson(JSON.stringify({
      ...validInput(),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2NormalizedConcernDraftMappingJson(JSON.stringify({
      ...validInput(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve fixture-only closed defaults", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping(validInput());
  const summary = buildWc01V2NormalizedConcernDraftMappingSummary(mapping);
  const markdown = renderWc01V2NormalizedConcernDraftMappingMarkdown(summary);

  assert.equal(summary.draftMappingCount, 2);
  assert.equal(summary.blockedMappingCount, 0);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.match(markdown, /Fixture-only internal diagnostic/);
  assert.match(markdown, /Concern policy call eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-normalized-concern-draft-map-"));
  try {
    const inputPath = join(tmp, "Wc01V2NormalizedConcernDraftMappingInput.json");
    const outPath = join(tmp, "Wc01V2NormalizedConcernDraftMapping.json");
    await writeFile(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2NormalizedConcernDraftMappingSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2NormalizedConcernDraftMappingInput & {
      productionEligible: boolean;
    };

    assert.equal(generated.summary.draftMappingCount, 2);
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2NormalizedConcernDraftMapping.summary.md"));
    assert.equal(saved.productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("normalized concern draft mapping modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-draft-mapping.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-normalized-concern-draft-mapping-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-normalized-concern-draft-mapping.ts"), "utf8"),
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

function validInput(): Wc01V2NormalizedConcernDraftMappingInput {
  return {
    inputVersion: WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
    sourceArtifactPath: "docs/certscore-v2/examples/Wc01V2NormalizedConcernDraftMappingInput.example.json",
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
