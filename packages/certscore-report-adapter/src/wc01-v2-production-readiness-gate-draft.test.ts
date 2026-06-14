import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2ProductionReadinessGateDraft,
  buildWc01V2ProductionReadinessGateDraftJson,
  failClosedReasonsForProductionReadinessGateInput,
  type Wc01V2ProductionReadinessGateInput,
  type Wc01V2ProductionReadinessGateName,
  WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION,
  WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION,
} from "./wc01-v2-production-readiness-gate-draft";
import {
  buildWc01V2ProductionReadinessGateDraftSummary,
  generateWc01V2ProductionReadinessGateDraftSingleFromFile,
  renderWc01V2ProductionReadinessGateDraftMarkdown,
} from "./wc01-v2-production-readiness-gate-draft-output";

test("builds artifact-only production-readiness gate draft with closed eligibility defaults", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft(validInput());

  assert.equal(draft.packetVersion, WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION);
  assert.equal(draft.overallGateOutcome, "ready_for_production_proposal_review");
  assert.equal(draft.allowedNextStep, "product_surface_proposal_draft");
  assert.equal(draft.productionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.equal(draft.explicitApprovalRequired, true);
  assert.equal(draft.blockedReason.length, 0);
  assert.equal(draft.guardrails.noAppUi, true);
  assert.equal(draft.guardrails.noPersistence, true);
  assert.equal(draft.guardrails.noProductionIntegration, true);
  assertNoForbiddenOutput(draft);
});

test("policy/copy reviewer actions route to policy/copy review without production eligibility", () => {
  for (const reviewerAction of ["policy_copy_review_required", "sensitive_context_escalated"] as const) {
    const draft = buildWc01V2ProductionReadinessGateDraft({
      ...validInput(),
      reviewerAction,
      sensitiveContextCategories: ["health"],
      sourcePolicyCopyReviewArtifact: "docs/certscore-v2/wc01-v2-sensitive-context-policy-copy-review-design.md",
    });

    assert.equal(draft.overallGateOutcome, "ready_for_policy_copy_review");
    assert.equal(draft.allowedNextStep, "policy_copy_review");
    assert.equal(draft.productionEligible, false);
    assert.equal(draft.customerFacingEligible, false);
  }
});

test("missing refs and evidence follow-up reviewer action block for more evidence", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft({
    ...validInput(),
    reviewerAction: "needs_more_evidence",
    evidenceRefs: [],
    excerptRefs: [],
  });

  assert.equal(draft.overallGateOutcome, "blocked_needs_more_evidence");
  assert.equal(draft.allowedNextStep, "evidence_followup");
  assert.deepEqual(draft.blockedReason, [
    "evidence_refs_missing",
    "excerpt_refs_missing",
    "reviewer_action_needs_more_evidence",
  ]);
});

test("overbroad reviewer action blocks without opening next step", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft({
    ...validInput(),
    reviewerAction: "rejected_overbroad",
  });

  assert.equal(draft.overallGateOutcome, "blocked_overbroad");
  assert.equal(draft.allowedNextStep, "none");
  assert.deepEqual(draft.blockedReason, ["reviewer_action_rejected_overbroad"]);
});

test("guardrail failures block as guardrail outcome", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft({
    ...validInput(),
    guardrailScanResult: {
      passed: false,
      notes: ["forbidden token scan failed"],
    },
    gateResults: validGateResults({ guardrail_sanitization: "failed" }),
  });

  assert.equal(draft.overallGateOutcome, "blocked_guardrail");
  assert.equal(draft.allowedNextStep, "none");
  assert.deepEqual(draft.blockedReason, [
    "gate_failed:guardrail_sanitization",
    "guardrail_scan_failed",
  ]);
});

test("not evaluated gates and internal-only action hold internally", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft({
    ...validInput(),
    reviewerAction: "internal_only",
    gateResults: validGateResults({ product_surface_mapping: "not_evaluated" }),
  });

  assert.equal(draft.overallGateOutcome, "hold_internal_only");
  assert.equal(draft.allowedNextStep, "internal_hold");
  assert.deepEqual(draft.blockedReason, [
    "gate_not_evaluated:product_surface_mapping",
    "reviewer_action_internal_only",
  ]);
});

test("fail-closed reasons include missing required gates and sensitive policy/copy artifact", () => {
  const reasons = failClosedReasonsForProductionReadinessGateInput({
    ...validInput(),
    sensitiveContextCategories: ["finance"],
    sourcePolicyCopyReviewArtifact: undefined,
    gateResults: validGateResults().filter((result) => result.gate !== "approval_record"),
    approvalRecord: [],
  });

  assert.deepEqual(reasons, [
    "approval_record_missing",
    "policy_copy_review_artifact_missing_for_sensitive_context",
    "required_gate_missing:approval_record",
  ]);
});

test("parser rejects unsupported version, raw blocked fields, forbidden status token, and legal-conclusion language", () => {
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      inputVersion: "unsupported",
    })),
    /Unsupported Wc01V2ProductionReadinessGateInput version/,
  );
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      note: "gap_observed",
    })),
    /forbidden status token/,
  );
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("input cannot default eligibility flags open", () => {
  const draft = buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
    ...validInput(),
    productionEligible: true,
    customerFacingEligible: true,
    explicitApprovalRequired: false,
  }));

  assert.equal(draft.productionEligible, false);
  assert.equal(draft.customerFacingEligible, false);
  assert.equal(draft.explicitApprovalRequired, true);
});

test("malformed or unsupported required sections fail closed", () => {
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      reviewerAction: "approve_production",
    })),
    /Unsupported reviewerAction/,
  );
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      gateResults: [{ ...validGateResults()[0], gate: "production_policy_call" }],
    })),
    /Unsupported gate/,
  );
  assert.throws(
    () => buildWc01V2ProductionReadinessGateDraftJson(JSON.stringify({
      ...validInput(),
      rollbackSuppressionPlan: {
        ...validInput().rollbackSuppressionPlan,
        emergencyDisablePlan: "",
      },
    })),
    /rollbackSuppressionPlan\.emergencyDisablePlan must be a non-empty string/,
  );
});

test("summary and markdown preserve gate posture", () => {
  const draft = buildWc01V2ProductionReadinessGateDraft(validInput());
  const summary = buildWc01V2ProductionReadinessGateDraftSummary(draft);
  const markdown = renderWc01V2ProductionReadinessGateDraftMarkdown(summary);

  assert.equal(summary.overallGateOutcome, "ready_for_production_proposal_review");
  assert.equal(summary.allowedNextStep, "product_surface_proposal_draft");
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
  const tmp = await mkdtemp(join(tmpdir(), "wc01-production-readiness-gate-"));
  try {
    const inputPath = join(tmp, "Wc01V2ProductionReadinessGateInput.json");
    const outPath = join(tmp, "Wc01V2ProductionReadinessGateDraft.json");
    await writeFile(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ProductionReadinessGateDraftSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as unknown;

    assert.equal(generated.summary.overallGateOutcome, "ready_for_production_proposal_review");
    assert.equal(generated.summaryPath, join(tmp, "Wc01V2ProductionReadinessGateDraft.summary.md"));
    assert.equal((saved as { productionEligible: unknown }).productionEligible, false);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("production readiness gate modules do not import production policy, report, checklist, executive, scoring, regulatory, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-production-readiness-gate-draft.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-production-readiness-gate-draft-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-production-readiness-gate-draft.ts"), "utf8"),
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

function validInput(): Wc01V2ProductionReadinessGateInput {
  return {
    inputVersion: WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION,
    sourcePreviewPacketPath: "artifacts/example/Wc01V2EvidencePreviewPacket.json",
    sourceReviewerLogPath: "docs/certscore-v2/wc01-v2-internal-reviewer-run-002.md",
    sourcePolicyCopyReviewArtifact: "docs/certscore-v2/wc01-v2-sensitive-context-policy-copy-review-design.md",
    siteDomain: "example.com",
    queueItemId: "queue_example_001",
    candidateFamily: "pre_consent_tracking",
    reviewerAction: "evidence_shape_confirmed",
    sensitiveContextCategories: [],
    evidenceRefs: ["source-ref-1"],
    excerptRefs: ["excerpt-1"],
    unresolvedRefCount: 0,
    redactionWarningCount: 0,
    guardrailScanResult: {
      passed: true,
      notes: [],
    },
    gateResults: validGateResults(),
    approvalRecord: [
      {
        owner: "reviewer",
        decision: "approved_for_internal_gate",
        scope: "evidence shape only",
        timestamp: "2026-06-09T00:00:00.000Z",
      },
      {
        owner: "policy_owner",
        decision: "approved_for_internal_gate",
        scope: "internal review routing only",
      },
    ],
    rollbackSuppressionPlan: {
      suppressionReason: "hold internally if any guardrail changes",
      holdState: "hold_internal_only",
      rollbackOwner: "engineering_owner",
      regressionGuardrailCheck: "rerun readiness guardrail scan",
      emergencyDisablePlan: "remove draft from downstream product surface proposal input set",
    },
  };
}

function validGateResults(
  overrides: Partial<Record<Wc01V2ProductionReadinessGateName, "passed" | "failed" | "not_evaluated">> = {},
) {
  const gates: Wc01V2ProductionReadinessGateName[] = [
    "evidence_sufficiency",
    "reviewer_confirmation",
    "unresolved_ref",
    "sensitive_context",
    "policy_copy",
    "guardrail_sanitization",
    "consistency_regression",
    "product_surface_mapping",
    "approval_record",
    "rollback_suppression",
  ];
  return gates.map((gate) => ({
    gate,
    decision: overrides[gate] ?? "passed",
    owner: gate === "policy_copy" || gate === "sensitive_context" ? "policy_owner" as const : "reviewer" as const,
    notes: [`${gate} reviewed for internal gate draft.`],
    requiredInputs: ["grouped evidence preview", "manual reviewer log"],
  }));
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /\bgap_observed\b/);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
}
