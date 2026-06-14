import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMappingCandidateInput,
  type Wc01V2NormalizedConcernDraftMappingInput,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
} from "./wc01-v2-normalized-concern-draft-mapping";
import {
  buildWc01V2ProductionIntegrationCandidateArtifact,
  buildWc01V2ProductionIntegrationCandidateArtifactJson,
  failClosedReasonsForDraft,
  WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION,
} from "./wc01-v2-production-integration-candidate";
import {
  buildWc01V2ProductionIntegrationCandidateSummary,
  generateWc01V2ProductionIntegrationCandidateSingleFromFile,
  renderWc01V2ProductionIntegrationCandidateMarkdown,
} from "./wc01-v2-production-integration-candidate-output";

test("valid normalized-concern draft mapping emits internal production integration candidates", () => {
  const artifact = buildWc01V2ProductionIntegrationCandidateArtifact(validMapping(), "mapping.json");

  assert.equal(artifact.packetVersion, WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION);
  assert.equal(artifact.candidates.length, 2);
  assert.equal(artifact.blockedCandidates.length, 0);
  assert.equal(artifact.implementationStatus, "not_approved");
  assert.equal(artifact.productionEligible, false);
  assert.equal(artifact.persistEligible, false);
  assert.equal(artifact.concernPolicyCallEligible, false);
  assert.equal(artifact.unifiedFindingEligible, false);
  assert.equal(artifact.checklistProjectionEligible, false);
  assert.equal(artifact.customerFacingEligible, false);
  assert.equal(artifact.explicitApprovalRequired, true);

  const tracking = artifact.candidates.find((candidate) => candidate.family === "pre_consent_tracking");
  assert.ok(tracking);
  assert.equal(tracking.proposedConcernPolicyKey, "v2.pre_consent_tracking.reviewed_non_sensitive");
  assert.equal(tracking.copyPosture, "no_user_visible_wording");
  assert.equal(tracking.approvalMetadata.approvalStatus, "missing");
  assert.equal(tracking.rollbackPlan.suppressionState, "hold_internal_only");

  const storage = artifact.candidates.find((candidate) => candidate.family === "pre_consent_cookie_storage");
  assert.ok(storage);
  assert.equal(storage.normalizedConcernDraft.cookieStorageContext?.party, "third_party");
  assert.equal(storage.proposedConcernPolicyKey, "v2.pre_consent_cookie_storage.reviewed_non_sensitive");
  assertNoForbiddenOutput(artifact);
});

test("sensitive-context draft fails closed and does not emit candidate", () => {
  const mapping = validMapping();
  mapping.draftMappings[0] = {
    ...mapping.draftMappings[0]!,
    sensitiveContextCategories: ["health"],
  };

  const artifact = buildWc01V2ProductionIntegrationCandidateArtifact(mapping);

  assert.equal(artifact.candidates.length, 1);
  assert.equal(artifact.blockedCandidates.length, 1);
  assert.deepEqual(artifact.blockedCandidates[0]?.failClosedReasons, [
    "sensitive_context_requires_separate_policy_product_approval",
  ]);
});

test("blocked source mappings are carried as blocked candidates", () => {
  const mapping = buildWc01V2NormalizedConcernDraftMapping({
    ...validInput(),
    candidates: [{
      ...validTrackingCandidate(),
      evidenceRefs: [],
      displaySafeExcerptRefs: [],
    }],
  });

  const artifact = buildWc01V2ProductionIntegrationCandidateArtifact(mapping);

  assert.equal(artifact.candidates.length, 0);
  assert.equal(artifact.blockedCandidates.length, 1);
  assert.equal(
    artifact.blockedCandidates[0]?.failClosedReasons.includes("source_mapping_blocked:evidence_refs_missing"),
    true,
  );
  assert.equal(
    artifact.blockedCandidates[0]?.failClosedReasons.includes("source_mapping_blocked:display_safe_excerpt_refs_missing"),
    true,
  );
});

test("missing refs, unresolved blockers, and open source flags fail closed", () => {
  const mapping = validMapping();
  const draft = structuredClone(mapping.draftMappings[0]!);
  draft.evidenceRefs = [];
  draft.displaySafeExcerptRefs = [];
  draft.unresolvedRefDisposition.affectsEvidenceSufficiency = true;
  draft.closedDefaultFlags = {
    ...draft.closedDefaultFlags,
    productionEligible: true as false,
    concernPolicyCallEligible: true as false,
    explicitApprovalRequired: false as true,
  };

  const reasons = failClosedReasonsForDraft(draft);

  assert.equal(reasons.includes("evidence_refs_missing"), true);
  assert.equal(reasons.includes("display_safe_excerpt_refs_missing"), true);
  assert.equal(reasons.includes("unresolved_refs_affect_evidence_sufficiency"), true);
  assert.equal(reasons.includes("source_mapping_attempts_production_eligibility"), true);
  assert.equal(reasons.includes("source_mapping_attempts_concern_policy_call"), true);
  assert.equal(reasons.includes("source_mapping_attempts_to_skip_explicit_approval"), true);
});

test("unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language are rejected", () => {
  const raw = JSON.stringify(validMapping());

  assert.throws(
    () => buildWc01V2ProductionIntegrationCandidateArtifactJson(
      raw.replace("wc01.v2_normalized_concern_draft_mapping.1", "unsupported"),
    ),
    /Unsupported Wc01V2NormalizedConcernDraftMapping version/,
  );
  assert.throws(
    () => buildWc01V2ProductionIntegrationCandidateArtifactJson(JSON.stringify({
      ...validMapping(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ProductionIntegrationCandidateArtifactJson(JSON.stringify({
      ...validMapping(),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2ProductionIntegrationCandidateArtifactJson(JSON.stringify({
      ...validMapping(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("source mapping root eligibility must remain closed", () => {
  const mapping = validMapping() as Wc01V2NormalizedConcernDraftMapping & {
    productionEligible: boolean;
  };
  mapping.productionEligible = true;

  assert.throws(
    () => buildWc01V2ProductionIntegrationCandidateArtifact(mapping as Wc01V2NormalizedConcernDraftMapping),
    /productionEligible must be false/,
  );
});

test("summary and markdown preserve closed defaults", () => {
  const artifact = buildWc01V2ProductionIntegrationCandidateArtifact(validMapping(), "mapping.json");
  const summary = buildWc01V2ProductionIntegrationCandidateSummary(artifact);
  const markdown = renderWc01V2ProductionIntegrationCandidateMarkdown(summary);

  assert.equal(summary.candidateCount, 2);
  assert.equal(summary.blockedCandidateCount, 0);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.match(markdown, /Not implementation approval/);
  assert.match(markdown, /Production eligible: false/);
  assert.match(markdown, /Concern policy call eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-production-integration-candidate-"));
  try {
    const inputPath = join(tmp, "Wc01V2NormalizedConcernDraftMapping.json");
    const outPath = join(tmp, "Wc01V2ProductionIntegrationCandidate.json");
    await writeFile(inputPath, `${JSON.stringify(validMapping(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ProductionIntegrationCandidateSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as { productionEligible: boolean };

    assert.equal(generated.summary.candidateCount, 2);
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2ProductionIntegrationCandidate.summary.md"));
    assert.equal(saved.productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("production integration candidate modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-production-integration-candidate.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-production-integration-candidate-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-production-integration-candidate.ts"), "utf8"),
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

function validMapping() {
  return buildWc01V2NormalizedConcernDraftMapping(validInput());
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
