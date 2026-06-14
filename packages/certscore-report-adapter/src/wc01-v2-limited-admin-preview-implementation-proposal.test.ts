import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildWc01V2LimitedAdminPreviewImplementationProposalDraft,
  buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson,
  failClosedReasonsForLimitedAdminPreviewImplementationProposal,
  parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson,
  parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson,
  type Wc01V2LimitedAdminPreviewImplementationProposalDraft,
} from "./wc01-v2-limited-admin-preview-implementation-proposal";
import {
  buildWc01V2LimitedAdminPreviewImplementationProposalSummary,
  generateWc01V2LimitedAdminPreviewImplementationProposalSingleFromFile,
  renderWc01V2LimitedAdminPreviewImplementationProposalMarkdown,
} from "./wc01-v2-limited-admin-preview-implementation-proposal-output";
import type { Wc01V2LimitedAdminPreviewApprovalMetadata } from "./wc01-v2-limited-admin-preview-approval-metadata";
import type { Wc01V2ProductSurfaceProposalDraft } from "./wc01-v2-product-surface-proposal-draft";

test("limited admin preview implementation proposal remains closed by default", () => {
  const draft = buildWc01V2LimitedAdminPreviewImplementationProposalDraft({
    approvalMetadata: approvalMetadata(),
    sourceApprovalMetadataPath: "artifacts/example/Wc01V2LimitedAdminPreviewApprovalMetadata.json",
    productSurfaceProposals: [productSurfaceProposal("pre_consent_tracking")],
    sourceProductSurfaceProposalPaths: [
      "artifacts/example/Wc01V2ProductSurfaceProposalDraft.narrow-pre-consent-tracking.json",
    ],
  });

  assert.equal(draft.implementationStatus, "not_approved");
  assert.equal(draft.approvalStatus, "incomplete");
  assert.equal(draft.surfaceStatus, "blocked_until_explicit_approval");
  assert.equal(draft.productionEligible, false);
  assert.equal(draft.persistEligible, false);
  assert.equal(draft.concernPolicyCallEligible, false);
  assert.equal(draft.unifiedFindingEligible, false);
  assert.equal(draft.checklistProjectionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.equal(draft.explicitApprovalRequired, true);
  assert.deepEqual(draft.allowedFamilies, ["pre_consent_tracking", "pre_consent_cookie_storage"]);
  assert.ok(draft.failClosedReasons.includes("approval_metadata_not_ready"));
  assert.ok(draft.failClosedReasons.includes("implementation_proposal_reference_missing"));
  assert.ok(draft.failClosedReasons.includes("owner_approvals_missing"));
  assert.ok(draft.failClosedReasons.includes("source_approval_metadata_fail_closed"));
});

test("missing product surface proposal and unsupported source surfaces fail closed", () => {
  const reasons = failClosedReasonsForLimitedAdminPreviewImplementationProposal({
    approvalMetadata: approvalMetadata(),
    productSurfaceProposals: [],
    sourceProductSurfaceProposalPaths: [],
  });
  assert.ok(reasons.includes("product_surface_proposal_missing"));

  assert.throws(
    () => parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson(JSON.stringify({
      ...productSurfaceProposal("pre_consent_tracking"),
      proposedSurfaceClass: "customer_facing_report_row",
    })),
    /Unsupported product surface proposal surface/,
  );
});

test("parser rejects unsupported versions, raw blocked fields, forbidden status mapping, and legal-conclusion language", () => {
  assert.throws(
    () => parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson(JSON.stringify({
      ...approvalMetadata(),
      metadataVersion: "unsupported",
    })),
    /Unsupported Wc01V2LimitedAdminPreviewApprovalMetadata version/,
  );
  assert.throws(
    () => buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson({
      approvalMetadataRaw: JSON.stringify({ ...approvalMetadata(), requestBody: "nope" }),
      sourceApprovalMetadataPath: "metadata.json",
      productSurfaceProposalRaws: [JSON.stringify(productSurfaceProposal("pre_consent_tracking"))],
      sourceProductSurfaceProposalPaths: ["proposal.json"],
    }),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson(JSON.stringify({
      ...productSurfaceProposal("pre_consent_tracking"),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson(JSON.stringify({
      ...approvalMetadata(),
      note: "violation",
    })),
    /legal-conclusion language/,
  );
});

test("summary and markdown preserve blocked proposal posture", () => {
  const draft = buildWc01V2LimitedAdminPreviewImplementationProposalDraft({
    approvalMetadata: approvalMetadata(),
    sourceApprovalMetadataPath: "metadata.json",
    productSurfaceProposals: [productSurfaceProposal("pre_consent_cookie_storage")],
    sourceProductSurfaceProposalPaths: ["proposal.json"],
  });
  const summary = buildWc01V2LimitedAdminPreviewImplementationProposalSummary(draft);
  const markdown = renderWc01V2LimitedAdminPreviewImplementationProposalMarkdown(summary);

  assert.equal(summary.implementationStatus, "not_approved");
  assert.equal(summary.surfaceStatus, "blocked_until_explicit_approval");
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.match(markdown, /Implementation status: not_approved/);
  assert.match(markdown, /Owner Approval Status/);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-limited-admin-preview-proposal-"));
  try {
    const metadataPath = join(tmp, "metadata.json");
    const proposalPath = join(tmp, "proposal.json");
    const outPath = join(tmp, "draft.json");
    await writeFile(metadataPath, JSON.stringify(approvalMetadata(), null, 2), "utf8");
    await writeFile(proposalPath, JSON.stringify(productSurfaceProposal("pre_consent_tracking"), null, 2), "utf8");

    const generated = await generateWc01V2LimitedAdminPreviewImplementationProposalSingleFromFile({
      approvalMetadataPath: metadataPath,
      productSurfaceProposalPaths: [proposalPath],
      outPath,
    });

    assert.equal(generated.draft.implementationStatus, "not_approved");
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2LimitedAdminPreviewImplementationProposal.summary.md"));
    const written = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2LimitedAdminPreviewImplementationProposalDraft;
    assert.equal(written.targetSurfaceClass, "limited_admin_internal_preview");
    assert.match(await readFile(generated.summaryPath!, "utf8"), /Limited Admin Preview Implementation Proposal/);
  } finally {
    await rm(tmp, { force: true, recursive: true });
  }
});

test("limited admin preview implementation proposal modules do not import production paths", async () => {
  const files = [
    new URL("./wc01-v2-limited-admin-preview-implementation-proposal.ts", import.meta.url),
    new URL("./wc01-v2-limited-admin-preview-implementation-proposal-output.ts", import.meta.url),
    new URL("./cli/wc01-v2-limited-admin-preview-implementation-proposal.ts", import.meta.url),
  ];
  const forbidden = [
    "apps/web/components/scans/shared-scan-detail-view",
    "apps/web/lib/scans/concern-policy",
    "apps/web/lib/scans/normalized-concerns",
    "apps/web/lib/scans/unified-findings",
    "checklist",
    "executive",
    "regulatory",
    "scoring",
  ];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const imports = text
      .split("\n")
      .filter((line) => line.trim().startsWith("import "))
      .join("\n");
    for (const blocked of forbidden) {
      assert.equal(imports.includes(blocked), false, `${file} imports ${blocked}`);
    }
  }
});

function approvalMetadata(): Wc01V2LimitedAdminPreviewApprovalMetadata {
  return {
    metadataVersion: "wc01.v2_limited_admin_preview_approval_metadata.1",
    sourceProjectionShapePath: "artifacts/example/Wc01V2ProjectionShapeComparison.json",
    sourceProjectionShapeVersion: "wc01.v2_projection_shape_comparison.1",
    targetSurfaceClass: "limited_admin_internal_preview",
    sourceFixtureChain: {
      productionIntegrationCandidate: "artifacts/example/Wc01V2ProductionIntegrationCandidate.json",
      normalizedConcernSchemaComparison: "artifacts/example/Wc01V2NormalizedConcernSchemaComparison.json",
      concernPolicyShapeComparison: "artifacts/example/Wc01V2ConcernPolicyShapeComparison.json",
      projectionShapeComparison: "artifacts/example/Wc01V2ProjectionShapeComparison.json",
    },
    allowedFamilies: ["pre_consent_tracking", "pre_consent_cookie_storage"],
    blockedFamilies: ["session_replay_behavioral_analytics", "sensitive_context_items"],
    ownerApprovals: ["product", "policy", "copy", "evidence", "engineering"].map((ownerRole) => ({
      ownerRole: ownerRole as "product" | "policy" | "copy" | "evidence" | "engineering",
      ownerName: "TBD",
      approvalDecision: "missing",
      approvalDate: "not_recorded",
      scopeNotes: [],
      requiredFollowups: [],
    })),
    accessControlPlan: {
      audience: "internal_admin_only",
      readOnly: true,
      defaultAccess: "disabled_until_implementation_proposal",
      requiredControls: ["explicit_internal_route_gate"],
    },
    dataHandlingPlan: {
      artifactOnly: true,
      nonPersistent: true,
      noCustomerVisibleOutput: true,
      noProductionReportBuilderIntegration: true,
      notes: [],
    },
    evidenceRequirements: ["display_safe_excerpts"],
    copyPosture: "internal_diagnostic_only",
    sensitiveContextHandling: {
      defaultHandling: "excluded_until_separate_approval",
      categories: ["health"],
      routingMetadataOnly: true,
    },
    blockedSurfaceAssertions: ["no_app_ui"],
    guardrailRequirements: ["raw_blocked_field_rejection_tests"],
    rollbackSuppressionPlan: {
      defaultState: "disabled",
      disablePath: "feature_flag",
      familySuppression: true,
      siteDomainSuppression: true,
      vendorDomainSuppression: true,
      emergencyRollbackOwner: "engineering_owner_required",
      notes: [],
    },
    implementationProposalRef: "not_created",
    approvalStatus: "incomplete",
    implementationStatus: "not_approved",
    failClosedReasons: ["implementation_proposal_missing", "owner_approvals_missing"],
    productionEligible: false,
    persistEligible: false,
    concernPolicyCallEligible: false,
    unifiedFindingEligible: false,
    checklistProjectionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    guardrails: {
      noAppUi: true,
      noPersistence: true,
      noProductionIntegration: true,
      noProductionConcernPolicyCall: true,
      noPersistedNormalizedConcerns: true,
      noUnifiedFindings: true,
      noChecklistRows: true,
      noReportRows: true,
      noExecutiveSummaries: true,
      noTopFindings: true,
      noScoringOutput: true,
      noRegulatoryLensOutput: true,
      noApiMcpExportOutput: true,
      noCustomerFacingCopy: true,
      noLegalConclusionLanguage: true,
      noForbiddenStatusMapping: true,
      noRawBlockedFields: true,
    },
  };
}

function productSurfaceProposal(family: "pre_consent_tracking" | "pre_consent_cookie_storage"): Wc01V2ProductSurfaceProposalDraft {
  return {
    packetVersion: "wc01.v2_product_surface_proposal_draft.1",
    proposedSurfaceClass: "limited_admin_internal_preview",
    proposedSurfaceAudience: "internal",
    proposedSurfacePurpose: "artifact review",
    sourceReviewerWorkflowDocs: [],
    allowedFamilies: [family],
    blockedFamilies: ["session_replay_behavioral_analytics"],
    sensitiveContextHandling: {
      required: false,
      categories: [],
      defaultCustomerFacingBlocked: true,
      notes: [],
    },
    copyPosture: "draft_internal_only",
    evidenceRequirements: ["display_safe_excerpts"],
    userVisibleWordingStatus: "no_user_visible_wording",
    guardrailRequirements: ["guardrail_scan"],
    approvalRequirements: [],
    rollbackSuppressionPlan: {
      suppressionReason: "closed_default",
      holdState: "blocked",
      rollbackOwner: "engineering",
      regressionGuardrailCheck: "guardrail_scan",
      emergencyDisablePlan: "disable_flag",
    },
    implementationStatus: "not_approved",
    productionEligible: false,
    customerFacingEligible: false,
    explicitApprovalRequired: true,
    failClosedReasons: [],
    guardrails: {
      noAppUi: true,
      noPersistence: true,
      noProductionIntegration: true,
      noProductionConcernPolicyCall: true,
      noPersistedNormalizedConcerns: true,
      noUnifiedFindings: true,
      noReportChecklistExecutiveScoringRegulatoryOutput: true,
      noApiMcpExportOutput: true,
      noCustomerFacingCopy: true,
      noLegalConclusionLanguage: true,
      noForbiddenStatusMapping: true,
      noRawBlockedFields: true,
    },
  };
}
