import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2ProductSurfaceProposalDraft,
  buildWc01V2ProductSurfaceProposalDraftJson,
  failClosedReasonsForInput,
  type Wc01V2ProductSurfaceProposalInput,
  WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION,
  WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION,
} from "./wc01-v2-product-surface-proposal-draft";
import {
  buildWc01V2ProductSurfaceProposalDraftSummary,
  generateWc01V2ProductSurfaceProposalDraftSingleFromFile,
  renderWc01V2ProductSurfaceProposalDraftMarkdown,
} from "./wc01-v2-product-surface-proposal-draft-output";

test("builds artifact-only proposal draft with closed defaults", () => {
  const draft = buildWc01V2ProductSurfaceProposalDraft(validInput());

  assert.equal(draft.packetVersion, WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION);
  assert.equal(draft.implementationStatus, "not_approved");
  assert.equal(draft.productionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.equal(draft.explicitApprovalRequired, true);
  assert.equal(draft.failClosedReasons.length, 0);
  assert.equal(draft.guardrails.noAppUi, true);
  assert.equal(draft.guardrails.noPersistence, true);
  assert.equal(draft.guardrails.noProductionIntegration, true);
  assert.equal(draft.guardrails.noCustomerFacingCopy, true);
  assertNoForbiddenOutput(draft);
});

test("high-risk or customer-facing surfaces fail closed without explicit approval metadata", () => {
  const draft = buildWc01V2ProductSurfaceProposalDraft({
    ...validInput(),
    proposedSurfaceClass: "customer_facing_report_row",
  });

  assert.equal(draft.productionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.deepEqual(draft.failClosedReasons, [
    "explicit_approval_metadata_missing_for_blocked_surface",
  ]);
});

test("scoring, regulatory, API/export, and UI-like surfaces fail closed by default", () => {
  for (const proposedSurfaceClass of [
    "score_impact",
    "regulatory_lens_output",
    "export_api_mcp_output",
    "limited_admin_internal_preview",
  ] as const) {
    const draft = buildWc01V2ProductSurfaceProposalDraft({
      ...validInput(),
      proposedSurfaceClass,
    });

    assert.equal(draft.productionEligible, false);
    assert.equal(draft.customerFacingEligible, false);
    assert.deepEqual(
      draft.failClosedReasons,
      ["explicit_approval_metadata_missing_for_blocked_surface"],
      proposedSurfaceClass,
    );
  }
});

test("proposal draft fails closed on missing required design sections", () => {
  const reasons = failClosedReasonsForInput({
    ...validInput(),
    allowedFamilies: [],
    blockedFamilies: [],
    evidenceRequirements: [],
    guardrailRequirements: [],
    sourceProductionReadinessGateDraft: undefined,
    sourcePolicyCopyReviewArtifact: undefined,
    sensitiveContextHandling: {
      required: true,
      categories: [],
      defaultCustomerFacingBlocked: true,
      notes: [],
    },
  });

  assert.deepEqual(reasons, [
    "allowed_or_blocked_families_missing",
    "evidence_requirements_missing",
    "guardrail_requirements_missing",
    "policy_copy_review_artifact_missing_for_sensitive_context",
    "sensitive_context_categories_missing",
    "source_production_readiness_gate_draft_missing",
  ]);
});

test("missing approval requirements and incomplete rollback/suppression plan fail closed", () => {
  const missingApprovals = buildWc01V2ProductSurfaceProposalDraft({
    ...validInput(),
    approvalRequirements: [],
  });

  assert.deepEqual(missingApprovals.failClosedReasons, ["approval_requirements_missing"]);

  const incompleteRollback = {
    ...validInput(),
    rollbackSuppressionPlan: {
      ...validInput().rollbackSuppressionPlan,
      emergencyDisablePlan: "",
    },
  };

  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraft(incompleteRollback),
    /rollbackSuppressionPlan\.emergencyDisablePlan must be a non-empty string/,
  );
});

test("missing sensitive-context handling fails closed", () => {
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      sensitiveContextHandling: undefined,
    })),
    /sensitiveContextHandling must be an object/,
  );
});

test("parser rejects unsupported version, raw blocked fields, forbidden status token, and legal-conclusion language", () => {
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      inputVersion: "unsupported",
    })),
    /Unsupported Wc01V2ProductSurfaceProposalInput version/,
  );
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("unsupported app UI and persistence surface classes fail closed", () => {
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      proposedSurfaceClass: "app_ui",
    })),
    /Unsupported proposedSurfaceClass/,
  );
  assert.throws(
    () => buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
      ...validInput(),
      proposedSurfaceClass: "persistence",
    })),
    /Unsupported proposedSurfaceClass/,
  );
});

test("input cannot default implementation or eligibility flags open", () => {
  const draft = buildWc01V2ProductSurfaceProposalDraftJson(JSON.stringify({
    ...validInput(),
    implementationStatus: "approved",
    productionEligible: true,
    customerFacingEligible: true,
    explicitApprovalRequired: false,
  }));

  assert.equal(draft.implementationStatus, "not_approved");
  assert.equal(draft.productionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.equal(draft.explicitApprovalRequired, true);
});

test("named surface wording requires copy-owner approval metadata", () => {
  const draft = buildWc01V2ProductSurfaceProposalDraft({
    ...validInput(),
    copyPosture: "separately_approved_for_named_surface",
    userVisibleWordingStatus: "separately_approved_for_named_surface",
    approvalRequirements: validInput().approvalRequirements.map((requirement) =>
      requirement.owner === "copy_owner"
        ? { ...requirement, status: "pending" }
        : requirement
    ),
  });

  assert.equal(draft.customerFacingEligible, false);
  assert.deepEqual(draft.failClosedReasons, [
    "copy_owner_approval_missing_for_named_surface_wording",
  ]);
});

test("summary and markdown preserve guardrail posture", () => {
  const draft = buildWc01V2ProductSurfaceProposalDraft(validInput());
  const summary = buildWc01V2ProductSurfaceProposalDraftSummary(draft);
  const markdown = renderWc01V2ProductSurfaceProposalDraftMarkdown(summary);

  assert.equal(summary.implementationStatus, "not_approved");
  assert.equal(summary.productionEligible, false);
  assert.equal(summary.customerFacingEligible, false);
  assert.equal(summary.explicitApprovalRequired, true);
  assert.match(markdown, /Not implementation approval/);
  assert.match(markdown, /Production eligible: false/);
  assert.match(markdown, /Customer-facing eligible: false/);
  assertNoForbiddenOutput(summary);
  assertNoForbiddenOutput(markdown);
});

test("single-file generator writes JSON and markdown", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-product-surface-proposal-"));
  try {
    const inputPath = join(tmp, "Wc01V2ProductSurfaceProposalInput.json");
    const outPath = join(tmp, "Wc01V2ProductSurfaceProposalDraft.json");
    await writeFile(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ProductSurfaceProposalDraftSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as unknown;

    assert.equal(generated.summary.proposedSurfaceClass, "internal_product_proposal_artifact");
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2ProductSurfaceProposalDraft.summary.md"));
    assert.equal((saved as { productionEligible: unknown }).productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("product surface proposal modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-product-surface-proposal-draft.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-product-surface-proposal-draft-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-product-surface-proposal-draft.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /apps\/web\/.*concern-policy/);
  assert.doesNotMatch(sources, /normalized-concerns/);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /top-finding/);
  assert.doesNotMatch(sources, /scoring/);
  assert.doesNotMatch(sources, /regulatory-lens/);
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function validInput(): Wc01V2ProductSurfaceProposalInput {
  return {
    inputVersion: WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION,
    proposedSurfaceClass: "internal_product_proposal_artifact",
    proposedSurfaceAudience: "product and policy owners",
    proposedSurfacePurpose: "Document an internal product-surface proposal before implementation.",
    sourceProductionReadinessGateDraft: "artifacts/example/Wc01V2ProductionReadinessGateDraft.json",
    sourcePolicyCopyReviewArtifact: "docs/certscore-v2/wc01-v2-sensitive-context-policy-copy-review-design.md",
    sourceReviewerWorkflowDocs: [
      "docs/certscore-v2/wc01-v2-internal-reviewer-workflow-stability-checkpoint.md",
      "docs/certscore-v2/wc01-v2-production-surface-taxonomy-design.md",
    ],
    allowedFamilies: [
      "pre_consent_tracking",
      "pre_consent_cookie_storage",
      "session_replay_behavioral_analytics",
    ],
    blockedFamilies: ["third_party_vendors_observed", "tag_management"],
    sensitiveContextHandling: {
      required: true,
      categories: ["health", "finance"],
      defaultCustomerFacingBlocked: true,
      notes: ["Sensitive context remains routing metadata only."],
    },
    copyPosture: "policy_copy_review_required",
    evidenceRequirements: ["source refs", "display-safe excerpt refs", "confidence/directness"],
    userVisibleWordingStatus: "no_user_visible_wording",
    guardrailRequirements: ["raw-field scan", "forbidden wording scan", "sanitizer check"],
    approvalRequirements: [
      { owner: "evidence_owner", required: true, status: "approved_for_proposal" },
      { owner: "policy_owner", required: true, status: "approved_for_proposal" },
      { owner: "copy_owner", required: true, status: "approved_for_proposal" },
      { owner: "product_owner", required: true, status: "approved_for_proposal" },
      { owner: "engineering_owner", required: true, status: "approved_for_proposal" },
    ],
    rollbackSuppressionPlan: {
      suppressionReason: "hold if any guardrail fails",
      holdState: "hold_internal_only",
      rollbackOwner: "engineering_owner",
      regressionGuardrailCheck: "rerun guardrail scan before any next step",
      emergencyDisablePlan: "remove generated artifact from next-stage review set",
    },
  };
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\bgap_observed\b/);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
}
