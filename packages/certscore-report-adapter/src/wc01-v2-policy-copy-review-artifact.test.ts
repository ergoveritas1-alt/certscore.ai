import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2PolicyCopyReviewArtifact,
  buildWc01V2PolicyCopyReviewArtifactJson,
  failClosedReasonsForPolicyCopyReviewInput,
  type Wc01V2PolicyCopyReviewInput,
  WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION,
  WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION,
} from "./wc01-v2-policy-copy-review-artifact";
import {
  buildWc01V2PolicyCopyReviewArtifactSummary,
  generateWc01V2PolicyCopyReviewArtifactSingleFromFile,
  renderWc01V2PolicyCopyReviewArtifactMarkdown,
} from "./wc01-v2-policy-copy-review-artifact-output";

test("builds artifact-only policy/copy review artifact with closed eligibility defaults", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact(validInput());

  assert.equal(artifact.packetVersion, WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION);
  assert.equal(artifact.policyCopyOutcome, "ready_for_production_readiness_gate");
  assert.equal(artifact.allowedNextStep, "production_readiness_gate_draft");
  assert.equal(artifact.sensitiveContextIsRoutingMetadataOnly, true);
  assert.equal(artifact.productionEligible, false);
  assert.equal(artifact.customerFacingEligible, false);
  assert.equal(artifact.explicitApprovalRequired, true);
  assert.equal(artifact.blockedReason.length, 0);
  assert.equal(artifact.guardrails.noAppUi, true);
  assert.equal(artifact.guardrails.noPersistence, true);
  assert.equal(artifact.guardrails.noProductionIntegration, true);
  assertNoForbiddenOutput(artifact);
});

test("missing policy or copy owner approval blocks policy/copy review", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact({
    ...validInput(),
    policyCopyDecisions: [
      { owner: "policy_owner", decision: "pending", scope: "internal routing only" },
      { owner: "copy_owner", decision: "missing", scope: "internal phrasing only" },
    ],
  });

  assert.equal(artifact.policyCopyOutcome, "blocked_policy_copy");
  assert.equal(artifact.allowedNextStep, "none");
  assert.deepEqual(artifact.blockedReason, [
    "copy_owner_internal_review_approval_missing",
    "policy_owner_internal_review_approval_missing",
  ]);
});

test("missing sensitive context, evidence, excerpts, phrasing, and family context fail closed", () => {
  const reasons = failClosedReasonsForPolicyCopyReviewInput({
    ...validInput(),
    sensitiveContextCategories: [],
    evidenceRefs: [],
    excerptRefs: [],
    familyEvidenceContext: [],
    allowedInternalPhrasing: [],
    blockedPhrasingPatterns: [],
  });

  assert.deepEqual(reasons, [
    "allowed_internal_phrasing_missing",
    "blocked_phrasing_patterns_missing",
    "evidence_refs_missing",
    "excerpt_refs_missing",
    "family_evidence_context_missing",
    "sensitive_context_categories_missing",
  ]);
});

test("unresolved blockers and needs-more-evidence route to evidence follow-up", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact({
    ...validInput(),
    reviewerAction: "needs_more_evidence",
    unresolvedRefsDisposition: {
      unresolvedRefCount: 4,
      blocksReview: true,
      notes: ["requires upstream inspection"],
    },
  });

  assert.equal(artifact.policyCopyOutcome, "blocked_needs_more_evidence");
  assert.equal(artifact.allowedNextStep, "evidence_followup");
  assert.deepEqual(artifact.blockedReason, [
    "reviewer_action_needs_more_evidence",
    "unresolved_refs_block_review",
  ]);
});

test("overbroad reviewer action blocks without opening next step", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact({
    ...validInput(),
    reviewerAction: "rejected_overbroad",
  });

  assert.equal(artifact.policyCopyOutcome, "blocked_overbroad");
  assert.equal(artifact.allowedNextStep, "none");
  assert.deepEqual(artifact.blockedReason, ["reviewer_action_rejected_overbroad"]);
});

test("internal-only reviewer action holds internally", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact({
    ...validInput(),
    reviewerAction: "internal_only",
  });

  assert.equal(artifact.policyCopyOutcome, "hold_internal_only");
  assert.equal(artifact.allowedNextStep, "internal_hold");
  assert.deepEqual(artifact.blockedReason, ["reviewer_action_internal_only"]);
});

test("failed redaction/sanitization blocks policy/copy review", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact({
    ...validInput(),
    redactionSanitization: {
      passed: false,
      warningCount: 1,
      notes: ["unsafe display field"],
    },
  });

  assert.equal(artifact.policyCopyOutcome, "blocked_policy_copy");
  assert.equal(artifact.allowedNextStep, "none");
  assert.deepEqual(artifact.blockedReason, ["redaction_sanitization_failed"]);
});

test("parser rejects unsupported version, raw blocked fields, forbidden status token, and legal-conclusion language", () => {
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      inputVersion: "unsupported",
    })),
    /Unsupported Wc01V2PolicyCopyReviewInput version/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("unsupported sensitive category, reviewer action, confidence, directness, and decision fail closed", () => {
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      sensitiveContextCategories: ["children"],
    })),
    /Unsupported sensitive-context category/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      reviewerAction: "approve_production",
    })),
    /Unsupported reviewerAction/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      confidenceBand: "certain",
    })),
    /Unsupported confidenceBand/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      directness: "absolute",
    })),
    /Unsupported directness/,
  );
  assert.throws(
    () => buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
      ...validInput(),
      policyCopyDecisions: [{ owner: "policy_owner", decision: "approved_for_customer_copy", scope: "copy" }],
    })),
    /Unsupported policyCopyDecisions.decision/,
  );
});

test("input cannot default eligibility flags open", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifactJson(JSON.stringify({
    ...validInput(),
    productionEligible: true,
    customerFacingEligible: true,
    explicitApprovalRequired: false,
  }));

  assert.equal(artifact.productionEligible, false);
  assert.equal(artifact.customerFacingEligible, false);
  assert.equal(artifact.explicitApprovalRequired, true);
});

test("summary and markdown preserve policy/copy posture", () => {
  const artifact = buildWc01V2PolicyCopyReviewArtifact(validInput());
  const summary = buildWc01V2PolicyCopyReviewArtifactSummary(artifact);
  const markdown = renderWc01V2PolicyCopyReviewArtifactMarkdown(summary);

  assert.equal(summary.policyCopyOutcome, "ready_for_production_readiness_gate");
  assert.equal(summary.allowedNextStep, "production_readiness_gate_draft");
  assert.equal(summary.sensitiveContextIsRoutingMetadataOnly, true);
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
  const tmp = await mkdtemp(join(tmpdir(), "wc01-policy-copy-review-"));
  try {
    const inputPath = join(tmp, "Wc01V2PolicyCopyReviewInput.json");
    const outPath = join(tmp, "Wc01V2PolicyCopyReviewArtifact.json");
    await writeFile(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2PolicyCopyReviewArtifactSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as unknown;

    assert.equal(generated.summary.policyCopyOutcome, "ready_for_production_readiness_gate");
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2PolicyCopyReviewArtifact.summary.md"));
    assert.equal((saved as { productionEligible: unknown }).productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("policy/copy review modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-policy-copy-review-artifact.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-policy-copy-review-artifact-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-policy-copy-review-artifact.ts"), "utf8"),
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

function validInput(): Wc01V2PolicyCopyReviewInput {
  return {
    inputVersion: WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION,
    sourcePreviewPacketPath: "artifacts/example/Wc01V2EvidencePreviewPacket.json",
    sourceReviewerLogPath: "docs/certscore-v2/wc01-v2-internal-reviewer-run-002.md",
    siteDomain: "example.com",
    queueItemId: "queue_example_001",
    candidateFamily: "pre_consent_tracking",
    reviewerAction: "sensitive_context_escalated",
    sensitiveContextCategories: ["health"],
    evidenceRefs: ["source-ref-1"],
    excerptRefs: ["excerpt-1"],
    confidenceBand: "high",
    directness: "direct",
    familyEvidenceContext: ["pre-consent runtime evidence with consent-state context"],
    allowedInternalPhrasing: [
      "Sensitive-context review route.",
      "Evidence shape is reviewable internally.",
    ],
    blockedPhrasingPatterns: [
      "[blocked: definitive compliance conclusion]",
      "[blocked: unsupported sensitive-data sharing claim]",
    ],
    policyCopyDecisions: [
      {
        owner: "policy_owner",
        decision: "approved_for_internal_review",
        scope: "sensitive-context routing metadata only",
      },
      {
        owner: "copy_owner",
        decision: "approved_for_internal_review",
        scope: "internal phrasing only",
      },
    ],
    unresolvedRefsDisposition: {
      unresolvedRefCount: 0,
      blocksReview: false,
      notes: [],
    },
    redactionSanitization: {
      passed: true,
      warningCount: 0,
      notes: [],
    },
    caveats: ["No customer-facing wording is approved."],
    coverageLimitations: [],
  };
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\bgap_observed\b/);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
}
