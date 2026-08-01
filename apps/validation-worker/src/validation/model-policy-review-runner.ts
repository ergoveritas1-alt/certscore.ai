import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  buildPolicyReviewCacheKey,
  buildPolicyStaticContentHash,
  POLICY_MODEL_REVIEW_CONTRACT_VERSION,
  POLICY_MODEL_REVIEW_PROMPT_VERSION,
  RUNTIME_POLICY_REVIEW_TOPICS,
  STATIC_POLICY_REVIEW_TOPICS,
  deriveDeterministicLegalFrameworkSignals,
  deriveDeterministicPolicyReviewSignals,
  reviewPolicyPacketWithMini,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket
} from "./model-policy-review";
import {
  loadReusableModelReviewArtifact,
  upsertScanModelReviewArtifact
} from "./repository";

type PolicyReviewArtifactKind =
  | "policy_semantic"
  | "policy_semantic_static"
  | "policy_semantic_parallel_shadow";

function hasExactlyTopics(
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>,
  topics: readonly string[],
) {
  return artifact.status === "completed" &&
    artifact.rows.length === topics.length &&
    topics.every((topic) => artifact.rows.some((row) => row.topic === topic));
}

async function persistReviewArtifact(input: {
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  cacheHit: boolean;
  packet: PolicyReviewPacket;
  reviewKind: PolicyReviewArtifactKind;
}) {
  const summary = {
    ...summarizePolicyReviewArtifact(input.artifact),
    cacheHit: input.cacheHit,
    reviewStatus: input.artifact.status,
  };
  await upsertScanModelReviewArtifact({
    cacheKey: input.artifact.cacheKey,
    contentHash: input.artifact.provenance.contentHash,
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    metrics: summary,
    modelRole: "review",
    promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
    requestedModel: input.artifact.provenance.requestedModel,
    resolvedModel: input.artifact.provenance.resolvedModel,
    review: input.artifact,
    reviewKind: input.reviewKind,
    reviewMode: input.artifact.mode,
    reviewStatus: input.artifact.status,
    scanId: input.packet.scanId,
    sourceDocumentIds: input.packet.documents.map((document) => document.documentId),
  });
  return summary;
}

export async function runStaticPolicyReviewPacket(input: {
  apiKey?: string;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const staticPacket = {
    ...input.packet,
    contentHash: buildPolicyStaticContentHash(input.packet),
    evidenceCoverage: {
      ...input.packet.evidenceCoverage,
      runtimeCoverage: {},
    },
    runtimeContext: {},
  };
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: staticPacket.contentHash,
    model: input.model,
    reviewPhase: "static",
  });
  const reusable = await loadReusableModelReviewArtifact({
    cacheKey,
    reviewKind: "policy_semantic_static",
  });
  const parsedReusable = reusable?.review_json
    ? policyModelReviewArtifactSchema.safeParse(reusable.review_json)
    : null;
  const artifact = parsedReusable?.success && hasExactlyTopics(parsedReusable.data, STATIC_POLICY_REVIEW_TOPICS)
    ? policyModelReviewArtifactSchema.parse({
        ...parsedReusable.data,
        mode: "shadow",
        scanId: staticPacket.scanId,
        productionEligible: false,
        provenance: {
          ...parsedReusable.data.provenance,
          reasonCodes: [...new Set([
            ...parsedReusable.data.provenance.reasonCodes,
            "static_content_hash_cache_reuse",
          ])],
          usedForProductionProjection: false,
        },
      })
    : await reviewPolicyPacketWithMini({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: staticPacket,
        reviewPhase: "static",
        topics: STATIC_POLICY_REVIEW_TOPICS,
      });
  const cacheHit = Boolean(parsedReusable?.success);
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit,
    packet: staticPacket,
    reviewKind: "policy_semantic_static",
  });
  return { artifact, cacheHit, staticPacket, summary };
}

function composeParallelPolicyArtifact(input: {
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  runtimeArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  staticArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
}) {
  const rows = [...input.staticArtifact.rows, ...input.runtimeArtifact.rows];
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: input.packet.contentHash,
    model: input.model,
  });
  return finalizeArtifactProjectionMode({
    artifact: policyModelReviewArtifactSchema.parse({
      ...input.runtimeArtifact,
      cacheKey,
      deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
      deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
      mode: input.mode,
      rows,
      scanId: input.packet.scanId,
      provenance: {
        ...input.runtimeArtifact.provenance,
        contentHash: input.packet.contentHash,
        confidence: rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length,
        inputRefs: input.packet.documents.map((document) => document.documentId),
        outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
        reasonCodes: [...new Set([
          ...input.staticArtifact.provenance.reasonCodes,
          ...input.runtimeArtifact.provenance.reasonCodes,
          "verified_static_policy_review_join",
          "terminal_runtime_delta_review",
        ])].slice(0, 30),
        usedForProductionProjection: false,
      },
      productionEligible: false,
    }),
    mode: input.mode,
  });
}

async function loadMatchingStaticArtifact(input: {
  model: string;
  packet: PolicyReviewPacket;
}) {
  const staticCacheKey = buildPolicyReviewCacheKey({
    contentHash: buildPolicyStaticContentHash(input.packet),
    model: input.model,
    reviewPhase: "static",
  });
  const early = await loadReusableModelReviewArtifact({
    cacheKey: staticCacheKey,
    reviewKind: "policy_semantic_static",
  });
  const parsed = early?.review_json
    ? policyModelReviewArtifactSchema.safeParse(early.review_json)
    : null;
  return parsed?.success && hasExactlyTopics(parsed.data, STATIC_POLICY_REVIEW_TOPICS)
    ? parsed.data
    : null;
}

export async function runParallelPolicyReviewShadow(input: {
  apiKey?: string;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const staticArtifact = await loadMatchingStaticArtifact(input);
  if (!staticArtifact) {
    return { reviewStatus: "skipped" as const, skipReason: "matching_static_review_unavailable" };
  }
  const runtimeArtifact = await reviewPolicyPacketWithMini({
    apiKey: input.apiKey,
    mode: "shadow",
    model: input.model,
    packet: input.packet,
    reviewPhase: "runtime_delta",
    topics: RUNTIME_POLICY_REVIEW_TOPICS,
  });
  if (!hasExactlyTopics(runtimeArtifact, RUNTIME_POLICY_REVIEW_TOPICS)) {
    return { reviewStatus: "failed" as const, skipReason: runtimeArtifact.failureReason ?? "runtime_delta_failed" };
  }
  const artifact = composeParallelPolicyArtifact({
    mode: "shadow",
    model: input.model,
    packet: input.packet,
    runtimeArtifact,
    staticArtifact,
  });
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit: false,
    packet: input.packet,
    reviewKind: "policy_semantic_parallel_shadow",
  });
  return { artifact, reviewStatus: artifact.status, summary };
}

export function finalizeArtifactProjectionMode(input: {
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  mode: "shadow" | "enforced";
}) {
  const productionEligible =
    input.mode === "enforced" &&
    input.artifact.status === "completed" &&
    input.artifact.rows.length === 8 &&
    input.artifact.rows.every((row) =>
      row.reasonCodes.includes("policy_review_invariants_applied_v1")
    );
  return policyModelReviewArtifactSchema.parse({
    ...input.artifact,
    mode: input.mode,
    provenance: {
      ...input.artifact.provenance,
      reasonCodes: [
        ...new Set([
          ...input.artifact.provenance.reasonCodes,
          productionEligible
            ? "approved_precision_first_production_projection_v1"
            : "production_projection_withheld"
        ])
      ].slice(0, 30),
      usedForProductionProjection: productionEligible
    },
    productionEligible
  });
}

export async function runPolicyReviewPacket(input: {
  apiKey?: string;
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  reuseEarlyStatic?: boolean;
}) {
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: input.packet.contentHash,
    model: input.model
  });
  const reusable = await loadReusableModelReviewArtifact({
    cacheKey,
    reviewKind: "policy_semantic"
  });
  let cacheHit = false;
  let artifact;
  let parallelJoin = false;
  if (reusable?.review_json) {
    const parsed = policyModelReviewArtifactSchema.safeParse(reusable.review_json);
    if (parsed.success) {
      cacheHit = true;
      artifact = finalizeArtifactProjectionMode({
        artifact: policyModelReviewArtifactSchema.parse({
          ...parsed.data,
          mode: input.mode,
          scanId: input.packet.scanId,
          provenance: {
            ...parsed.data.provenance,
            reasonCodes: [
              ...new Set([
                ...parsed.data.provenance.reasonCodes,
                "content_hash_cache_reuse"
              ])
            ],
            usedForProductionProjection: false
          }
        }),
        mode: input.mode
      });
    }
  }

  if (!artifact && input.reuseEarlyStatic) {
    const staticArtifact = await loadMatchingStaticArtifact(input);
    if (staticArtifact) {
      const runtimeArtifact = await reviewPolicyPacketWithMini({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
        reviewPhase: "runtime_delta",
        topics: RUNTIME_POLICY_REVIEW_TOPICS,
      });
      if (hasExactlyTopics(runtimeArtifact, RUNTIME_POLICY_REVIEW_TOPICS)) {
        parallelJoin = true;
        artifact = composeParallelPolicyArtifact({
          mode: input.mode,
          model: input.model,
          packet: input.packet,
          runtimeArtifact,
          staticArtifact,
        });
      }
    }
  }

  artifact ??= finalizeArtifactProjectionMode({
    artifact: await reviewPolicyPacketWithMini({
      apiKey: input.apiKey,
      mode: input.mode,
      model: input.model,
      packet: input.packet
    }),
    mode: input.mode
  });
  const summary = {
    ...summarizePolicyReviewArtifact(artifact),
    cacheHit,
    parallelJoin,
    reviewStatus: artifact.status
  };
  await persistReviewArtifact({
    artifact,
    cacheHit,
    packet: input.packet,
    reviewKind: "policy_semantic",
  });

  return {
    artifact,
    cacheHit,
    summary
  };
}
