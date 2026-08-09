import assert from "node:assert/strict";
import test from "node:test";
import {
  policyModelReviewArtifactSchema,
  POLICY_REVIEW_TOPIC_DEFINITIONS
} from "@certscore/contracts";
import {
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket,
} from "./model-policy-review";
import {
  finalizeArtifactProjectionMode,
  rebindCachedStaticArtifact,
  runConcurrentPolicyReviewJoin,
  runMiniExceptionRuntimeReview,
  waitForUsableStaticReview,
} from "./model-policy-review-runner";

function artifact() {
  return policyModelReviewArtifactSchema.parse({
    contractVersion: "policy_model_review.v2",
    mode: "shadow",
    status: "completed",
    scanId: "scan-1",
    cacheKey: "a".repeat(64),
    rows: Object.keys(POLICY_REVIEW_TOPIC_DEFINITIONS).map((topic) => ({
      topic,
      status: "observed",
      confidence: 0.95,
      sourceDocumentIds: ["policy-1"],
      sourceUrls: ["https://example.test/privacy"],
      evidenceExcerpts: ["Direct retained policy evidence."],
      conflictingExcerpts: [],
      reasonCodes: ["policy_review_invariants_applied_v1"],
      rationale: "Direct retained evidence passed the production invariants."
    })),
    deterministicLegalFrameworkSignals: [],
    deterministicPolicyReviewSignals: [],
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: "gpt-5.4-mini",
      resolvedModel: "gpt-5.4-mini",
      taskType: "policy_semantic_review",
      promptVersion: "policy_semantic_review.v2",
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: [],
      outputRefs: [],
      contentHash: "b".repeat(64),
      confidence: 0.95,
      reasonCodes: [],
      uncertaintyNotes: [],
      latencyMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      usedForProductionProjection: false
    },
    productionEligible: false
  });
}

test("enforced invariant-verified review becomes production-projectable", () => {
  const finalized = finalizeArtifactProjectionMode({
    artifact: artifact(),
    mode: "enforced"
  });
  assert.equal(finalized.productionEligible, true);
  assert.equal(finalized.provenance.usedForProductionProjection, true);
  assert.ok(
    finalized.provenance.reasonCodes.includes(
      "approved_precision_first_production_projection_v1"
    )
  );
  assert.equal(summarizePolicyReviewArtifact(finalized).productionEligible, true);
});

test("shadow review remains non-production", () => {
  const finalized = finalizeArtifactProjectionMode({
    artifact: artifact(),
    mode: "shadow"
  });
  assert.equal(finalized.productionEligible, false);
  assert.equal(finalized.provenance.usedForProductionProjection, false);
  assert.equal(summarizePolicyReviewArtifact(finalized).productionEligible, false);
});

test("enforced Nano review remains non-production even when row invariants pass", () => {
  const nano = artifact();
  const finalized = finalizeArtifactProjectionMode({
    artifact: policyModelReviewArtifactSchema.parse({
      ...nano,
      provenance: {
        ...nano.provenance,
        requestedModel: "gpt-5.4-nano",
        resolvedModel: "gpt-5.4-nano-2026-03-17",
      },
    }),
    mode: "enforced",
  });
  assert.equal(finalized.productionEligible, false);
  assert.equal(finalized.provenance.usedForProductionProjection, false);
  assert.ok(finalized.provenance.reasonCodes.includes("unapproved_production_review_model"));
});

test("Mini-exception runtime review avoids a model call for typed facts without a comparable claim", async () => {
  const packet: PolicyReviewPacket = {
    contentHash: "b".repeat(64),
    documents: [{
      canonicalUrl: "https://example.test/privacy",
      contentCoverage: {
        status: "complete",
        sourceTextChars: 100,
        extractedSectionCount: 1,
        retainedSectionCount: 1,
        retainedStrongSectionCount: 1,
        retainedTableRowCount: 0,
        limitationKeys: [],
        packetTextTruncated: false,
      },
      documentEvaluationState: "usable",
      documentFetchState: "fetched",
      documentId: "policy-1",
      documentOwnerEntity: "Example",
      documentType: "privacy_policy",
      extractedCandidates: {},
      ownershipConfidence: 1,
      ownershipReasonCodes: ["same_registrable_domain_as_scan_target"],
      targetRelationship: "target_controller",
      text: "We explain our privacy practices and provide contact details.",
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: { coverageStatus: "complete" },
      runtimeCoverage: { coverageStatus: "usable" },
    },
    policyCandidates: [],
    runtimeContext: { cookies: [{ cookieName: "_ga" }] },
    scanContext: { region: "eu_ie", targetUrl: "https://example.test" },
    scanDate: "2026-08-08",
    scanId: "scan-1",
  };
  const runtime = await runMiniExceptionRuntimeReview({
    model: "gpt-5.4-mini",
    packet,
  });
  assert.equal(runtime.status, "completed");
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.provenance.promptTokens, 0);
  assert.ok(runtime.provenance.reasonCodes.includes("mini_runtime_call_avoided_no_comparable_claim"));
  assert.equal(
    runtime.rows.find((row) => row.topic === "cookie_inventory")?.status,
    "observed",
  );
  assert.equal(
    runtime.rows.find((row) => row.topic === "policy_runtime_consistency")?.status,
    "insufficient_retained_evidence",
  );
});

test("cached static review references are rebound to the current retained document", () => {
  const packet: PolicyReviewPacket = {
    contentHash: "b".repeat(64),
    documents: [{
      canonicalUrl: "https://example.test/privacy",
      contentCoverage: {
        status: "complete",
        sourceTextChars: 100,
        extractedSectionCount: 1,
        retainedSectionCount: 1,
        retainedStrongSectionCount: 1,
        retainedTableRowCount: 0,
        limitationKeys: [],
        packetTextTruncated: false,
      },
      documentEvaluationState: "usable",
      documentFetchState: "fetched",
      documentId: "current-policy-document",
      documentOwnerEntity: "Example",
      documentType: "privacy_policy",
      extractedCandidates: {},
      ownershipConfidence: 1,
      ownershipReasonCodes: ["same_registrable_domain_as_scan_target"],
      targetRelationship: "target_controller",
      text: "Direct retained policy evidence.",
    }],
    evidenceCoverage: {
      coverageLimitations: [],
      policySurfaceInspection: {},
      runtimeCoverage: {},
    },
    policyCandidates: [],
    runtimeContext: {},
    scanContext: { region: null, targetUrl: "https://example.test" },
    scanDate: "2023-07-10",
    scanId: "current-scan",
  };
  const rebound = rebindCachedStaticArtifact({ artifact: artifact(), packet });
  assert.equal(rebound.scanId, "current-scan");
  assert.deepEqual(rebound.rows[0]?.sourceDocumentIds, ["current-policy-document"]);
  assert.deepEqual(rebound.provenance.inputRefs, ["current-policy-document"]);
  assert.equal(rebound.productionEligible, false);
});

test("terminal join waits for a concurrently persisted usable static review", async () => {
  let loads = 0;
  const sleeps: number[] = [];
  const result = await waitForUsableStaticReview({
    isUsable: (candidate) => candidate === "ready",
    load: async () => {
      loads += 1;
      return loads === 3 ? "ready" : null;
    },
    pollMs: 10,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    waitMs: 30,
  });

  assert.equal(result, "ready");
  assert.equal(loads, 3);
  assert.deepEqual(sleeps, [10, 10]);
});

test("terminal join remains bounded and falls back when static review never becomes usable", async () => {
  let loads = 0;
  const result = await waitForUsableStaticReview({
    isUsable: () => false,
    load: async () => {
      loads += 1;
      return null;
    },
    pollMs: 10,
    sleepImpl: async () => {},
    waitMs: 20,
  });

  assert.equal(result, null);
  assert.equal(loads, 3);
});

test("terminal runtime review starts while the static review is still pending", async () => {
  let releaseStatic!: () => void;
  const staticPending = new Promise<void>((resolve) => {
    releaseStatic = resolve;
  });
  let runtimeStarted = false;

  const joined = runConcurrentPolicyReviewJoin({
    loadStatic: async () => {
      await staticPending;
      return "static";
    },
    reviewRuntime: async () => {
      runtimeStarted = true;
      return "runtime";
    },
  });

  await Promise.resolve();
  assert.equal(runtimeStarted, true);
  releaseStatic();
  assert.deepEqual(await joined, ["static", "runtime"]);
});

test("same-scan static review join uses the primary database connection", async () => {
  const workerRoot = process.cwd().endsWith("apps/validation-worker")
    ? process.cwd()
    : `${process.cwd()}/apps/validation-worker`;
  const [runnerSource, repositorySource] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) =>
      readFile(`${workerRoot}/src/validation/model-policy-review-runner.ts`, "utf8")
    ),
    import("node:fs/promises").then(({ readFile }) =>
      readFile(`${workerRoot}/src/validation/repository.ts`, "utf8")
    ),
  ]);

  assert.match(runnerSource, /consistentRead:\s*true/);
  assert.match(repositorySource, /readOnly:\s*input\.consistentRead !== true/);
});
