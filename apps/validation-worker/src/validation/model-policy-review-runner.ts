import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  buildPolicyReviewCacheKey,
  buildDeterministicCookieInventoryRow,
  buildNoComparablePolicyRuntimeRow,
  buildPolicyRuntimeComparisonTransport,
  buildStaticPolicyReviewPacket,
  POLICY_MODEL_REVIEW_CONTRACT_VERSION,
  POLICY_MODEL_REVIEW_PROMPT_VERSION,
  RUNTIME_POLICY_REVIEW_TOPICS,
  STATIC_POLICY_REVIEW_TOPICS,
  deriveDeterministicLegalFrameworkSignals,
  deriveDeterministicPolicyReviewSignals,
  planPolicyRuntimeSemanticReview,
  reviewPolicyPacketWithModel,
  reviewPolicyPacketWithMini,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket
} from "./model-policy-review";
import {
  loadReusableModelReviewArtifact,
  upsertScanModelReviewArtifact
} from "./repository";
import {
  isApprovedProductionPolicyReviewModel,
  summarizeNanoRouting,
} from "./policy-review-routing";
import {
  buildBoundedMiniTopicTransport,
  buildMiniExtractionReuseTransport,
  composeExtractionReuseShadowArtifact,
} from "./policy-review-escalation";
import {
  composeDualNanoConsensusShadowArtifact,
  routeDualNanoPolicyReview,
  summarizeDualNanoConsensus,
} from "./policy-review-consensus";

type PolicyReviewArtifactKind =
  | "policy_semantic"
  | "policy_semantic_static"
  | "policy_semantic_parallel_shadow"
  | "policy_semantic_nano_shadow"
  | "policy_semantic_extraction_reuse_shadow"
  | "policy_semantic_dual_nano_shadow";

const STATIC_REVIEW_JOIN_WAIT_MS = 6_000;
const STATIC_REVIEW_JOIN_POLL_MS = 500;

export async function waitForUsableStaticReview<T>(input: {
  isUsable: (candidate: T) => boolean;
  load: () => Promise<T | null>;
  pollMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  waitMs?: number;
}) {
  const pollMs = Math.max(10, input.pollMs ?? STATIC_REVIEW_JOIN_POLL_MS);
  const waitMs = Math.max(0, input.waitMs ?? STATIC_REVIEW_JOIN_WAIT_MS);
  const attemptCount = Math.max(1, Math.ceil(waitMs / pollMs) + 1);
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    const candidate = await input.load();
    if (candidate && input.isUsable(candidate)) return candidate;
    if (attempt + 1 < attemptCount) {
      await (input.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(pollMs);
    }
  }
  return null;
}

function hasExactlyTopics(
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>,
  topics: readonly string[],
) {
  return artifact.status === "completed" &&
    artifact.rows.length === topics.length &&
    topics.every((topic) => artifact.rows.some((row) => row.topic === topic));
}

function stablePolicyUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value;
  }
}

export function rebindCachedStaticArtifact(input: {
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  packet: PolicyReviewPacket;
}) {
  const documentIdByUrl = new Map(
    input.packet.documents.map((document) => [
      stablePolicyUrl(document.canonicalUrl),
      document.documentId,
    ]),
  );
  const documentIdForUrl = (sourceUrl: string) =>
    documentIdByUrl.get(stablePolicyUrl(sourceUrl)) ?? null;
  const rows = input.artifact.rows.map((row) => ({
    ...row,
    sourceDocumentIds: [...new Set(
      row.sourceUrls.flatMap((sourceUrl) => {
        const documentId = documentIdForUrl(sourceUrl);
        return documentId ? [documentId] : [];
      }),
    )],
  }));
  const deterministicLegalFrameworkSignals = input.artifact.deterministicLegalFrameworkSignals
    .flatMap((signal) => {
      const sourceDocumentId = documentIdForUrl(signal.sourceUrl);
      return sourceDocumentId ? [{ ...signal, sourceDocumentId }] : [];
    });
  const deterministicPolicyReviewSignals = input.artifact.deterministicPolicyReviewSignals
    .flatMap((signal) => {
      const sourceDocumentId = documentIdForUrl(signal.sourceUrl);
      return sourceDocumentId ? [{ ...signal, sourceDocumentId }] : [];
    });
  return policyModelReviewArtifactSchema.parse({
    ...input.artifact,
    deterministicLegalFrameworkSignals,
    deterministicPolicyReviewSignals,
    rows,
    scanId: input.packet.scanId,
    provenance: {
      ...input.artifact.provenance,
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      reasonCodes: [...new Set([
        ...input.artifact.provenance.reasonCodes,
        "cached_evidence_refs_rebound_to_current_packet",
      ])].slice(0, 30),
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

async function persistReviewArtifact(input: {
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  cacheHit: boolean;
  packet: PolicyReviewPacket;
  reviewKind: PolicyReviewArtifactKind;
  supplementalMetrics?: Record<string, unknown>;
}) {
  const summary = {
    ...summarizePolicyReviewArtifact(input.artifact),
    cacheHit: input.cacheHit,
    reviewStatus: input.artifact.status,
    ...input.supplementalMetrics,
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
  const staticPacket = buildStaticPolicyReviewPacket(input.packet);
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
    ? rebindCachedStaticArtifact({
        artifact: policyModelReviewArtifactSchema.parse({
          ...parsedReusable.data,
          mode: "shadow",
          provenance: {
            ...parsedReusable.data.provenance,
            reasonCodes: [...new Set([
              ...parsedReusable.data.provenance.reasonCodes,
              "static_content_hash_cache_reuse",
            ])],
          },
        }),
        packet: staticPacket,
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
  const rows = [
    ...input.staticArtifact.rows.map((row) => ({
      ...row,
      reviewSource: row.reviewSource ?? "mini" as const,
    })),
    ...input.runtimeArtifact.rows,
  ];
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
          ...(input.runtimeArtifact.provenance.reasonCodes.includes(
            "deterministic_runtime_topic_routing_v1"
          )
            ? [
                "mini_exception_routing_enabled",
                "owner_approved_mini_exception_routing_2026_08_08",
              ]
            : []),
        ])].slice(0, 30),
        usedForProductionProjection: false,
      },
      productionEligible: false,
    }),
    mode: input.mode,
  });
}

export async function runMiniExceptionRuntimeReview(input: {
  apiKey?: string;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const cookieRow = buildDeterministicCookieInventoryRow(input.packet);
  const comparisonPlan = planPolicyRuntimeSemanticReview(input.packet);
  const comparisonTransport = comparisonPlan.requiresMiniReview
    ? buildPolicyRuntimeComparisonTransport(input.packet, comparisonPlan)
    : null;
  const comparisonArtifact = comparisonPlan.requiresMiniReview
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
        reviewPhase: "runtime_delta",
        topics: ["policy_runtime_consistency"],
        transportPacket: comparisonTransport ?? undefined,
      })
    : null;
  const comparisonRow = comparisonArtifact?.rows.find(
    (row) => row.topic === "policy_runtime_consistency"
  );
  const completed = comparisonPlan.requiresMiniReview
    ? comparisonArtifact?.status === "completed" && Boolean(comparisonRow)
    : true;
  const rows = completed
    ? [
        cookieRow,
        comparisonRow
          ? { ...comparisonRow, reviewSource: "mini" as const }
          : buildNoComparablePolicyRuntimeRow(input.packet),
      ]
    : [];
  const baseProvenance = comparisonArtifact?.provenance ?? {
    role: "review" as const,
    provider: "openai" as const,
    requestedModel: input.model,
    resolvedModel: input.model,
    taskType: "policy_semantic_deterministic_runtime_review",
    promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
    schemaVersion: "policy_semantic_review_output.v2",
    inputRefs: input.packet.documents.map((document) => document.documentId),
    outputRefs: [],
    contentHash: input.packet.contentHash,
    confidence: 1,
    reasonCodes: [],
    uncertaintyNotes: [],
    latencyMs: 0,
    promptTokens: 0,
    cachedPromptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    usedForProductionProjection: false,
  };
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: "shadow",
    status: completed ? "completed" : "failed",
    scanId: input.packet.scanId,
    cacheKey: buildPolicyReviewCacheKey({
      contentHash: input.packet.contentHash,
      model: `${input.model}:mini-exception-runtime-v2`,
      reviewPhase: "runtime_delta",
    }),
    rows,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: completed
      ? null
      : comparisonArtifact?.failureReason ?? "Mini policy/runtime comparison was incomplete.",
    provenance: {
      ...baseProvenance,
      taskType: comparisonPlan.requiresMiniReview
        ? "policy_semantic_mini_exception_runtime_review"
        : "policy_semantic_deterministic_runtime_review",
      contentHash: input.packet.contentHash,
      confidence: rows.length > 0
        ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length
        : null,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      reasonCodes: [...new Set([
        ...baseProvenance.reasonCodes,
        "deterministic_cookie_inventory_projection",
        "deterministic_runtime_topic_routing_v1",
        ...(comparisonPlan.requiresMiniReview
          ? [
              "mini_explicit_policy_runtime_comparison",
              "bounded_policy_runtime_comparison_transport_v1",
            ]
          : ["mini_runtime_call_avoided_no_comparable_claim"]),
      ])].slice(0, 30),
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

async function loadMatchingStaticArtifact(input: {
  model: string;
  packet: PolicyReviewPacket;
}) {
  const staticPacket = buildStaticPolicyReviewPacket(input.packet);
  const staticCacheKey = buildPolicyReviewCacheKey({
    contentHash: staticPacket.contentHash,
    model: input.model,
    reviewPhase: "static",
  });
  const artifact = await waitForUsableStaticReview({
    load: async () => {
      const early = await loadReusableModelReviewArtifact({
        cacheKey: staticCacheKey,
        consistentRead: true,
        reviewKind: "policy_semantic_static",
      });
      const parsed = early?.review_json
        ? policyModelReviewArtifactSchema.safeParse(early.review_json)
        : null;
      return parsed?.success ? parsed.data : null;
    },
    isUsable: (artifact) => hasExactlyTopics(artifact, STATIC_POLICY_REVIEW_TOPICS),
  });
  return artifact
    ? rebindCachedStaticArtifact({ artifact, packet: staticPacket })
    : null;
}

export async function runConcurrentPolicyReviewJoin<TStatic, TRuntime>(input: {
  loadStatic: () => Promise<TStatic>;
  reviewRuntime: () => Promise<TRuntime>;
}) {
  return Promise.all([input.loadStatic(), input.reviewRuntime()]);
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
  const approvedProductionModel = isApprovedProductionPolicyReviewModel({
    requestedModel: input.artifact.provenance.requestedModel,
    resolvedModel: input.artifact.provenance.resolvedModel,
  });
  const productionEligible =
    input.mode === "enforced" &&
    approvedProductionModel &&
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
            : "production_projection_withheld",
          approvedProductionModel
            ? "approved_gpt_5_4_mini_production_model_v1"
            : "unapproved_production_review_model",
        ])
      ].slice(0, 30),
      usedForProductionProjection: productionEligible
    },
    productionEligible
  });
}

export async function runNanoPolicyReviewShadow(input: {
  apiKey?: string;
  miniReferenceArtifact?: Promise<ReturnType<typeof policyModelReviewArtifactSchema.parse>>;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: input.packet.contentHash,
    model: input.model,
  });
  const reusable = await loadReusableModelReviewArtifact({
    cacheKey,
    reviewKind: "policy_semantic_nano_shadow",
  });
  const parsedReusable = reusable?.review_json
    ? policyModelReviewArtifactSchema.safeParse(reusable.review_json)
    : null;
  const reviewed = parsedReusable?.success
    ? parsedReusable.data
    : await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
      });
  const artifact = policyModelReviewArtifactSchema.parse({
    ...reviewed,
    mode: "shadow",
    productionEligible: false,
    scanId: input.packet.scanId,
    provenance: {
      ...reviewed.provenance,
      reasonCodes: [...new Set([
        ...reviewed.provenance.reasonCodes,
        "nano_routine_shadow_non_projectable",
        ...(parsedReusable?.success ? ["content_hash_cache_reuse"] : []),
      ])].slice(0, 30),
      usedForProductionProjection: false,
    },
  });
  const miniReferenceArtifact = input.miniReferenceArtifact
    ? await input.miniReferenceArtifact
    : null;
  const routing = summarizeNanoRouting({
    miniReferenceArtifact,
    nanoArtifact: artifact,
  });
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit: Boolean(parsedReusable?.success),
    packet: input.packet,
    reviewKind: "policy_semantic_nano_shadow",
    supplementalMetrics: { routing },
  });
  return { artifact, routing, summary };
}

export async function runExtractionReusePolicyReviewShadow(input: {
  apiKey?: string;
  canonicalMiniReferenceArtifact?: Promise<ReturnType<typeof policyModelReviewArtifactSchema.parse>>;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const transport = buildMiniExtractionReuseTransport(input.packet);
  const reusableTopicCount = transport.reuseDecisions.filter(
    (decision) => decision.canReuseObserved,
  ).length;
  const fallbackToCanonical = reusableTopicCount === 0;
  const miniArtifact = fallbackToCanonical && input.canonicalMiniReferenceArtifact
    ? await input.canonicalMiniReferenceArtifact
    : await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
        reviewPhase: "escalated",
        topics: transport.topics,
        transportPacket: transport.packet,
      });
  const artifact = composeExtractionReuseShadowArtifact({
    canonicalFallback: fallbackToCanonical,
    miniArtifact,
    packet: input.packet,
    reuseDecisions: transport.reuseDecisions,
    topics: transport.topics,
  });
  const routing = {
    escalatedTopicCount: transport.topics.length,
    fallbackToCanonical,
    miniCallAvoided: fallbackToCanonical && Boolean(input.canonicalMiniReferenceArtifact),
    reusableTopicCount,
    reusableTopics: transport.reuseDecisions
      .filter((decision) => decision.canReuseObserved)
      .map((decision) => decision.topic),
    transportMetrics: transport.metrics,
  };
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit: false,
    packet: input.packet,
    reviewKind: "policy_semantic_extraction_reuse_shadow",
    supplementalMetrics: {
      routing,
      ...(routing.miniCallAvoided
        ? {
            cachedPromptTokens: 0,
            completionTokens: 0,
            latencyMs: 0,
            promptTokens: 0,
            totalTokens: 0,
          }
        : {}),
    },
  });
  return { artifact, routing, summary };
}

export async function runDualNanoConsensusPolicyReviewShadow(input: {
  apiKey?: string;
  canonicalMiniReferenceArtifact?: Promise<ReturnType<typeof policyModelReviewArtifactSchema.parse>>;
  miniModel: string;
  nanoModel: string;
  packet: PolicyReviewPacket;
}) {
  const primaryResult = await runNanoPolicyReviewShadow({
    apiKey: input.apiKey,
    model: input.nanoModel,
    packet: input.packet,
  });
  const primaryArtifact = primaryResult.artifact;
  const criticArtifact = await reviewPolicyPacketWithModel({
    apiKey: input.apiKey,
    candidateArtifact: primaryArtifact,
    mode: "shadow",
    model: input.nanoModel,
    packet: input.packet,
    reviewPhase: "critic",
  });
  const decisions = routeDualNanoPolicyReview({
    criticArtifact,
    primaryArtifact,
  });
  const escalationTopics = decisions
    .filter((decision) => decision.requiresMiniEscalation)
    .map((decision) => decision.topic);
  const escalationExcerpts = [...primaryArtifact.rows, ...criticArtifact.rows]
    .filter((row) => escalationTopics.includes(row.topic))
    .flatMap((row) => [...row.evidenceExcerpts, ...row.conflictingExcerpts]);
  const boundedTransport = buildBoundedMiniTopicTransport({
    packet: input.packet,
    passageExcerpts: escalationExcerpts,
    topics: escalationTopics,
    transportVersion: "policy_dual_nano_mini_transport.v1",
  });
  const miniArtifact = escalationTopics.length > 0
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.miniModel,
        packet: input.packet,
        reviewPhase: "escalated",
        topics: escalationTopics,
        transportPacket: boundedTransport.packet,
      })
    : null;
  const artifact = composeDualNanoConsensusShadowArtifact({
    criticArtifact,
    decisions,
    miniArtifact,
    packet: input.packet,
    primaryArtifact,
  });
  const canonicalMiniArtifact = input.canonicalMiniReferenceArtifact
    ? await input.canonicalMiniReferenceArtifact
    : null;
  const routing = summarizeDualNanoConsensus({
    canonicalMiniArtifact,
    criticArtifact,
    decisions,
    miniEscalationArtifact: miniArtifact,
    primaryArtifact,
  });
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit: false,
    packet: input.packet,
    reviewKind: "policy_semantic_dual_nano_shadow",
    supplementalMetrics: {
      boundedMiniTransport: boundedTransport.metrics,
      routing,
    },
  });
  return {
    artifact,
    boundedMiniTransport: boundedTransport.metrics,
    criticArtifact,
    miniArtifact,
    primaryArtifact,
    routing,
    summary,
  };
}

export async function runPolicyReviewPacket(input: {
  apiKey?: string;
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  reuseEarlyStatic?: boolean;
  useMiniExceptionRuntime?: boolean;
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
        artifact: rebindCachedStaticArtifact({
          artifact: policyModelReviewArtifactSchema.parse({
            ...parsed.data,
            mode: input.mode,
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
          packet: input.packet,
        }),
        mode: input.mode
      });
    }
  }

  if (!artifact && input.reuseEarlyStatic) {
    const [staticArtifact, runtimeArtifact] = await runConcurrentPolicyReviewJoin({
      loadStatic: () => loadMatchingStaticArtifact(input),
      reviewRuntime: () => input.useMiniExceptionRuntime
        ? runMiniExceptionRuntimeReview({
            apiKey: input.apiKey,
            model: input.model,
            packet: input.packet,
          })
        : reviewPolicyPacketWithMini({
            apiKey: input.apiKey,
            mode: "shadow",
            model: input.model,
            packet: input.packet,
            reviewPhase: "runtime_delta",
            topics: RUNTIME_POLICY_REVIEW_TOPICS,
          }),
    });
    if (staticArtifact) {
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
