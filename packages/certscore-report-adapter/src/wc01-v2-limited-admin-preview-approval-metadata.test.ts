import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2ConcernPolicyShapeComparison,
} from "./wc01-v2-concern-policy-shape-comparison";
import {
  buildWc01V2LimitedAdminPreviewApprovalMetadata,
  buildWc01V2LimitedAdminPreviewApprovalMetadataJson,
  failClosedReasonsForProjectionShape,
  WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION,
} from "./wc01-v2-limited-admin-preview-approval-metadata";
import {
  buildWc01V2LimitedAdminPreviewApprovalMetadataSummary,
  generateWc01V2LimitedAdminPreviewApprovalMetadataSingleFromFile,
  renderWc01V2LimitedAdminPreviewApprovalMetadataMarkdown,
} from "./wc01-v2-limited-admin-preview-approval-metadata-output";
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
  type Wc01V2ProjectionShapeComparison,
} from "./wc01-v2-projection-shape-comparison";

test("valid projection shape emits incomplete limited admin preview approval metadata", () => {
  const metadata = buildWc01V2LimitedAdminPreviewApprovalMetadata(
    validProjectionShape(),
    "projection-shape.json",
  );

  assert.equal(metadata.metadataVersion, WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION);
  assert.equal(metadata.targetSurfaceClass, "limited_admin_internal_preview");
  assert.deepEqual(metadata.allowedFamilies, ["pre_consent_tracking", "pre_consent_cookie_storage"]);
  assert.equal(metadata.approvalStatus, "incomplete");
  assert.equal(metadata.implementationStatus, "not_approved");
  assert.equal(metadata.ownerApprovals.length, 5);
  assert.equal(metadata.ownerApprovals.every((approval) => approval.approvalDecision === "missing"), true);
  assert.equal(metadata.failClosedReasons.includes("owner_approvals_missing"), true);
  assert.equal(metadata.failClosedReasons.includes("implementation_proposal_missing"), true);
  assert.equal(metadata.productionEligible, false);
  assert.equal(metadata.persistEligible, false);
  assert.equal(metadata.concernPolicyCallEligible, false);
  assert.equal(metadata.unifiedFindingEligible, false);
  assert.equal(metadata.checklistProjectionEligible, false);
  assert.equal(metadata.customerFacingEligible, false);
  assert.equal(metadata.explicitApprovalRequired, true);
  assertNoForbiddenOutput(metadata);
});

test("unsupported family and missing projection inputs fail closed", () => {
  const projectionShape = validProjectionShape();
  projectionShape.comparedFamilies = [...projectionShape.comparedFamilies, "session_replay_behavioral_analytics"];
  projectionShape.missingProjectionInputs.pre_consent_tracking = ["source_evidence_refs"];

  const metadata = buildWc01V2LimitedAdminPreviewApprovalMetadata(projectionShape, "projection-shape.json");

  assert.equal(
    metadata.failClosedReasons.includes("unsupported_family:session_replay_behavioral_analytics"),
    true,
  );
  assert.equal(metadata.failClosedReasons.includes("missing_projection_inputs:pre_consent_tracking"), true);
  assertNoForbiddenOutput(metadata);
});

test("source projection shape blocked reasons and open flags fail closed while metadata remains closed", () => {
  const projectionShape = validProjectionShape() as Wc01V2ProjectionShapeComparison & {
    productionEligible: boolean;
    unifiedFindingEligible: boolean;
    checklistProjectionEligible: boolean;
    explicitApprovalRequired: boolean;
  };
  projectionShape.blockedReasons = ["pre_consent_tracking:projection_input_missing:source_evidence_refs"];
  projectionShape.recommendation = "blocked_needs_policy_or_projection_shape_revision";
  projectionShape.productionEligible = true;
  projectionShape.unifiedFindingEligible = true;
  projectionShape.checklistProjectionEligible = true;
  projectionShape.explicitApprovalRequired = false;

  const metadata = buildWc01V2LimitedAdminPreviewApprovalMetadata(projectionShape, "projection-shape.json");

  assert.equal(metadata.failClosedReasons.includes("projection_shape_not_reviewable_fixture_only"), true);
  assert.equal(metadata.failClosedReasons.includes("projection_shape_has_blocked_reasons"), true);
  assert.equal(metadata.failClosedReasons.includes("projection_shape_attempts_production_eligibility"), true);
  assert.equal(metadata.failClosedReasons.includes("projection_shape_attempts_unified_finding"), true);
  assert.equal(metadata.failClosedReasons.includes("projection_shape_attempts_checklist_projection"), true);
  assert.equal(metadata.failClosedReasons.includes("projection_shape_attempts_to_skip_explicit_approval"), true);
  assert.equal(metadata.productionEligible, false);
  assert.equal(metadata.unifiedFindingEligible, false);
  assert.equal(metadata.checklistProjectionEligible, false);
  assert.equal(metadata.explicitApprovalRequired, true);
  assertNoForbiddenOutput(metadata);
});

test("non-reviewable readiness fails closed", () => {
  const projectionShape = validProjectionShape();
  projectionShape.evidencePacketReadiness = {
    status: "blocked",
    reasons: ["evidence packet not ready"],
  };

  const reasons = failClosedReasonsForProjectionShape(projectionShape);

  assert.equal(reasons.includes("evidence_packet_not_reviewable"), true);
});

test("unsupported version, raw blocked fields, forbidden status mapping, and legal-conclusion language are rejected", () => {
  const raw = JSON.stringify(validProjectionShape());

  assert.throws(
    () => buildWc01V2LimitedAdminPreviewApprovalMetadataJson(
      raw.replace("wc01.v2_projection_shape_comparison.1", "unsupported"),
      "projection-shape.json",
    ),
    /Unsupported Wc01V2ProjectionShapeComparison version/,
  );
  assert.throws(
    () => buildWc01V2LimitedAdminPreviewApprovalMetadataJson(JSON.stringify({
      ...validProjectionShape(),
      requestBody: "raw",
    }), "projection-shape.json"),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2LimitedAdminPreviewApprovalMetadataJson(JSON.stringify({
      ...validProjectionShape(),
      note: "gap_observed",
    }), "projection-shape.json"),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2LimitedAdminPreviewApprovalMetadataJson(JSON.stringify({
      ...validProjectionShape(),
      note: "illegal",
    }), "projection-shape.json"),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve approval metadata posture", () => {
  const metadata = buildWc01V2LimitedAdminPreviewApprovalMetadata(validProjectionShape(), "projection-shape.json");
  const summary = buildWc01V2LimitedAdminPreviewApprovalMetadataSummary(metadata);
  const markdown = renderWc01V2LimitedAdminPreviewApprovalMetadataMarkdown(summary);

  assert.equal(summary.approvalStatus, "incomplete");
  assert.equal(summary.implementationStatus, "not_approved");
  assert.equal(summary.ownerApprovalCounts.missing, 5);
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.persistEligible, false);
  assert.equal(summary.concernPolicyCallEligible, false);
  assert.equal(summary.unifiedFindingEligible, false);
  assert.equal(summary.checklistProjectionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.equal(summary.explicitApprovalRequired, true);
  assert.match(markdown, /Internal diagnostic only/);
  assert.match(markdown, /Approval status: incomplete/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-limited-admin-preview-approval-metadata-"));
  try {
    const projectionShapePath = join(tmp, "Wc01V2ProjectionShapeComparison.json");
    const outPath = join(tmp, "Wc01V2LimitedAdminPreviewApprovalMetadata.json");
    await writeFile(projectionShapePath, `${JSON.stringify(validProjectionShape(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2LimitedAdminPreviewApprovalMetadataSingleFromFile({
      projectionShapePath,
      outPath,
    });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as { approvalStatus: string };

    assert.equal(generated.summary.approvalStatus, "incomplete");
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2LimitedAdminPreviewApprovalMetadata.summary.md"));
    assert.equal(saved.approvalStatus, "incomplete");
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("limited admin preview approval metadata modules do not import production concern, persistence, unified finding, checklist, report, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-limited-admin-preview-approval-metadata.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-limited-admin-preview-approval-metadata-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-limited-admin-preview-approval-metadata.ts"), "utf8"),
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

function validProjectionShape() {
  return buildWc01V2ProjectionShapeComparison(
    buildWc01V2ConcernPolicyShapeComparison(
      buildWc01V2NormalizedConcernSchemaComparison(
        buildWc01V2ProductionIntegrationCandidateArtifact(
          buildWc01V2NormalizedConcernDraftMapping(validInput()),
          "mapping.json",
        ),
        "candidate.json",
      ),
      "schema.json",
    ),
    "policy-shape.json",
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
