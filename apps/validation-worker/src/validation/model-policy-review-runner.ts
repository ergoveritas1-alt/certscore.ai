import {
  policyModelReviewArtifactSchema,
  type PolicyModelReviewRow,
} from "@certscore/contracts";
import {
  buildPolicyReviewCacheKey,
  buildPolicyRuntimeSemanticContentHash,
  buildDeterministicCookieInventoryRow,
  buildNoComparablePolicyRuntimeRow,
  buildStaticPolicyReviewPacket,
  POLICY_MODEL_REVIEW_CONTRACT_VERSION,
  POLICY_MODEL_REVIEW_PROMPT_VERSION,
  POLICY_REVIEW_TOPICS,
  RUNTIME_POLICY_REVIEW_TOPICS,
  STATIC_POLICY_REVIEW_TOPICS,
  deriveDeterministicLegalFrameworkSignals,
  deriveDeterministicPolicyReviewSignals,
  planPolicyRuntimeSemanticReview,
  reviewPolicyPacketWithModel,
  reviewPolicyPacketWithMini,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket,
  type PolicyReviewTopic,
} from "./model-policy-review";
import {
  loadReusableModelReviewArtifact,
  upsertScanModelReviewArtifact
} from "./repository";
import {
  NANO_ROUTINE_REVIEW_CONFIDENCE_THRESHOLDS,
  NANO_PRIMARY_MINI_INVOCATION_RATE_TARGET,
  isApprovedProductionPolicyReviewModel,
  isApprovedRoutinePolicyReviewModel,
  routeNanoPrimaryPolicyReview,
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

export function isRuntimeSemanticCacheReusable(
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>,
) {
  if (!hasExactlyTopics(artifact, POLICY_REVIEW_TOPICS)) return false;
  const runtimeRow = artifact.rows.find(
    (row) => row.topic === "policy_runtime_consistency",
  );
  if (!runtimeRow) return false;
  return ![
    runtimeRow.rationale,
    ...runtimeRow.evidenceExcerpts,
    ...runtimeRow.conflictingExcerpts,
  ].some((value) => /\b\d[\d,]*(?:\.\d+)?\s*(?:ms|milliseconds?|s|secs?|seconds?)\b/i.test(value));
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
  cacheContentHash?: string;
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
    contentHash: input.cacheContentHash ?? input.packet.contentHash,
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
          ...(input.cacheContentHash && input.cacheContentHash !== input.packet.contentHash
            ? ["runtime_semantic_cache_identity_v1"]
            : []),
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
  const comparisonArtifact = comparisonPlan.requiresMiniReview
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
        reviewPhase: "runtime_delta",
        topics: ["policy_runtime_consistency"],
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
      model: `${input.model}:mini-exception-runtime-v1`,
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
          ? ["mini_explicit_policy_runtime_comparison"]
          : ["mini_runtime_call_avoided_no_comparable_claim"]),
      ])].slice(0, 30),
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export function buildNonBlockingTerminalRuntimeReview(input: {
  model: string;
  packet: PolicyReviewPacket;
}) {
  const cookieRow = buildDeterministicCookieInventoryRow(input.packet);
  const comparisonPlan = planPolicyRuntimeSemanticReview(input.packet);
  const comparisonRow: PolicyModelReviewRow = comparisonPlan.requiresMiniReview
    ? {
        topic: "policy_runtime_consistency",
        reviewSource: "deterministic",
        status: "insufficient_retained_evidence",
        comparisonOutcome: "insufficient_comparison_evidence",
        confidence: 0,
        sourceDocumentIds: [],
        sourceUrls: [],
        evidenceExcerpts: [],
        conflictingExcerpts: [],
        reasonCodes: [
          "post_scan_model_call_withheld",
          "runtime_semantic_review_not_ready_at_projection",
          "policy_review_invariants_applied_v1",
        ],
        rationale:
          "A directly comparable policy/runtime claim requires semantic review, but no verified completed review was available at projection time. The comparison remains unknown.",
      }
    : buildNoComparablePolicyRuntimeRow(input.packet);
  const rows = [cookieRow, comparisonRow];
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: "shadow",
    status: "completed",
    scanId: input.packet.scanId,
    cacheKey: buildPolicyReviewCacheKey({
      contentHash: input.packet.contentHash,
      model: `${input.model}:nonblocking-terminal-runtime-v1`,
      reviewPhase: "runtime_delta",
    }),
    rows,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: null,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: input.model,
      resolvedModel: input.model,
      taskType: "policy_semantic_deterministic_terminal_review",
      promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      contentHash: input.packet.contentHash,
      confidence: rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length,
      reasonCodes: [
        "deterministic_cookie_inventory_projection",
        "nonblocking_terminal_policy_projection_v1",
        ...(comparisonPlan.requiresMiniReview
          ? ["runtime_semantic_review_deferred"]
          : ["mini_runtime_call_avoided_no_comparable_claim"]),
      ],
      uncertaintyNotes: comparisonPlan.requiresMiniReview
        ? ["Policy/runtime semantic comparison was not ready at projection time."]
        : [],
      latencyMs: 0,
      promptTokens: 0,
      cachedPromptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export function buildDeferredTerminalPolicyReview(input: {
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
}) {
  const failureReason =
    "No verified completed policy-semantic review was available at projection time; post-scan model calls are disabled.";
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: input.mode,
    status: "failed",
    scanId: input.packet.scanId,
    cacheKey: buildPolicyReviewCacheKey({
      contentHash: input.packet.contentHash,
      model: `${input.model}:deferred-terminal-v1`,
    }),
    rows: [],
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason,
    provenance: {
      role: "review",
      provider: "openai",
      requestedModel: input.model,
      resolvedModel: input.model,
      taskType: "policy_semantic_review_deferred",
      promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
      schemaVersion: "policy_semantic_review_output.v2",
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: [],
      contentHash: input.packet.contentHash,
      confidence: null,
      reasonCodes: [
        "post_scan_model_call_withheld",
        "verified_early_policy_review_unavailable",
        "production_projection_withheld",
      ],
      uncertaintyNotes: [failureReason],
      latencyMs: 0,
      promptTokens: 0,
      cachedPromptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

async function loadMatchingStaticArtifact(input: {
  model: string;
  packet: PolicyReviewPacket;
  waitMs?: number;
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
    waitMs: input.waitMs,
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

export function getTerminalStaticReviewJoinMode(earlyStaticExpected?: boolean) {
  return earlyStaticExpected ? "wait_for_verified_early_static" : "generate_static_concurrently";
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

function sumNullableMetric(
  artifacts: Array<ReturnType<typeof policyModelReviewArtifactSchema.parse> | null>,
  key: "cachedPromptTokens" | "completionTokens" | "latencyMs" | "promptTokens" | "totalTokens",
) {
  const values = artifacts
    .map((artifact) => artifact?.provenance[key] ?? null)
    .filter((value): value is number => typeof value === "number");
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

const NANO_PRIMARY_MINI_AUDIT_SAMPLE_RATE = 0.01;

export function isNanoPrimaryMiniAuditSample(contentHash: string) {
  const bucket = Number.parseInt(contentHash.slice(0, 8), 16) % 10_000;
  return bucket < NANO_PRIMARY_MINI_AUDIT_SAMPLE_RATE * 10_000;
}

function nanoPrimaryUnknownRow(input: {
  reasonCodes: readonly string[];
  row?: PolicyModelReviewRow;
  topic: PolicyReviewTopic;
}): PolicyModelReviewRow {
  return {
    topic: input.topic,
    reviewSource: "nano",
    status: "insufficient_retained_evidence",
    ...(input.topic === "policy_runtime_consistency"
      ? { comparisonOutcome: "insufficient_comparison_evidence" as const }
      : {}),
    confidence: Math.min(input.row?.confidence ?? 0, 0.8),
    sourceDocumentIds: input.row?.sourceDocumentIds ?? [],
    sourceUrls: input.row?.sourceUrls ?? [],
    evidenceExcerpts: input.row?.evidenceExcerpts ?? [],
    conflictingExcerpts: input.row?.conflictingExcerpts ?? [],
    reasonCodes: [...new Set([
      ...(input.row?.reasonCodes ?? []),
      ...input.reasonCodes,
      "nano_primary_unresolved_retained_as_unknown",
      "policy_review_invariants_applied_v1",
    ])].slice(0, 20),
    rationale:
      "Nano did not produce a production-safe observed result after bounded recovery; the retained result remains unknown and does not create an absence finding.",
  };
}

function composeNanoPrimaryRuntimeArtifact(input: {
  comparisonArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse> | null;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const cookieRow = buildDeterministicCookieInventoryRow(input.packet);
  const comparisonPlan = planPolicyRuntimeSemanticReview(input.packet);
  const comparisonRow = input.comparisonArtifact?.rows.find(
    (row) => row.topic === "policy_runtime_consistency",
  );
  const completed = comparisonPlan.requiresMiniReview
    ? input.comparisonArtifact?.status === "completed" && Boolean(comparisonRow)
    : true;
  const rows = completed
    ? [
        cookieRow,
        comparisonRow
          ? { ...comparisonRow, reviewSource: "nano" as const }
          : buildNoComparablePolicyRuntimeRow(input.packet),
      ]
    : [cookieRow];
  const baseProvenance = input.comparisonArtifact?.provenance ?? {
    role: "review" as const,
    provider: "openai" as const,
    requestedModel: input.model,
    resolvedModel: input.model,
    taskType: "policy_semantic_nano_primary_runtime_review",
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
      model: `${input.model}:nano-primary-runtime-v1`,
      reviewPhase: "runtime_delta",
    }),
    rows,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: completed
      ? null
      : input.comparisonArtifact?.failureReason ?? "Nano policy/runtime comparison was incomplete.",
    provenance: {
      ...baseProvenance,
      taskType: comparisonPlan.requiresMiniReview
        ? "policy_semantic_nano_primary_runtime_review"
        : "policy_semantic_deterministic_runtime_review",
      reasonCodes: [...new Set([
        ...baseProvenance.reasonCodes,
        "deterministic_cookie_inventory_projection",
        ...(comparisonPlan.requiresMiniReview
          ? ["nano_direct_policy_runtime_comparison"]
          : ["nano_runtime_call_avoided_no_comparable_claim"]),
      ])].slice(0, 30),
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export async function runNanoPrimaryRuntimeReview(input: {
  apiKey?: string;
  model: string;
  packet: PolicyReviewPacket;
}) {
  const comparisonPlan = planPolicyRuntimeSemanticReview(input.packet);
  const comparisonArtifact = comparisonPlan.requiresMiniReview
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        mode: "shadow",
        model: input.model,
        packet: input.packet,
        reviewPhase: "runtime_delta",
        topics: ["policy_runtime_consistency"],
      })
    : null;
  return composeNanoPrimaryRuntimeArtifact({
    comparisonArtifact,
    model: input.model,
    packet: input.packet,
  });
}

function provisionalNanoPrimaryArtifact(input: {
  nanoModel: string;
  packet: PolicyReviewPacket;
  recoveryArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse> | null;
  runtimeArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  staticArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
}) {
  const primaryRows = new Map(
    [...input.staticArtifact.rows, ...input.runtimeArtifact.rows]
      .map((row) => [row.topic, row]),
  );
  const recoveryRows = new Map(
    (input.recoveryArtifact?.rows ?? []).map((row) => [row.topic, row]),
  );
  const rows = POLICY_REVIEW_TOPICS.map((topic) =>
    recoveryRows.get(topic) ??
    primaryRows.get(topic) ??
    nanoPrimaryUnknownRow({ reasonCodes: ["nano_primary_topic_missing"], topic })
  );
  const components = [input.staticArtifact, input.runtimeArtifact, input.recoveryArtifact];
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: "shadow",
    status: "completed",
    scanId: input.packet.scanId,
    cacheKey: buildPolicyReviewCacheKey({
      contentHash: input.packet.contentHash,
      model: `nano-primary-provisional-v1:${input.nanoModel}`,
    }),
    rows,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: null,
    provenance: {
      ...input.staticArtifact.provenance,
      requestedModel: input.nanoModel,
      resolvedModel: input.recoveryArtifact?.provenance.resolvedModel ??
        input.staticArtifact.provenance.resolvedModel,
      taskType: "policy_semantic_nano_primary_provisional_review",
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      latencyMs: sumNullableMetric(components, "latencyMs"),
      promptTokens: sumNullableMetric(components, "promptTokens"),
      cachedPromptTokens: sumNullableMetric(components, "cachedPromptTokens"),
      completionTokens: sumNullableMetric(components, "completionTokens"),
      totalTokens: sumNullableMetric(components, "totalTokens"),
      reasonCodes: ["nano_primary_provisional_review_v1"],
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export function composeNanoPrimaryPolicyReviewArtifact(input: {
  decisions: ReturnType<typeof routeNanoPrimaryPolicyReview>;
  miniArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse> | null;
  miniModel: string;
  nanoArtifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  nanoModel: string;
  packet: PolicyReviewPacket;
}) {
  const decisions = new Map(input.decisions.map((decision) => [decision.topic, decision]));
  const nanoRows = new Map(input.nanoArtifact.rows.map((row) => [row.topic, row]));
  const miniRows = new Map((input.miniArtifact?.rows ?? []).map((row) => [row.topic, row]));
  const rows = POLICY_REVIEW_TOPICS.map((topic) => {
    const nanoRow = nanoRows.get(topic);
    if (nanoRow?.reviewSource === "deterministic") return nanoRow;
    const decision = decisions.get(topic);
    if (decision?.action === "mini_conflict_candidate") {
      const miniRow = miniRows.get(topic);
      return miniRow
        ? {
            ...miniRow,
            reviewSource: "mini" as const,
            reasonCodes: [...new Set([
              ...miniRow.reasonCodes,
              "mini_verified_conflict_adjudication",
            ])].slice(0, 20),
          }
        : nanoPrimaryUnknownRow({
            reasonCodes: ["mini_conflict_adjudication_unavailable"],
            row: nanoRow,
            topic,
          });
    }
    if (decision?.action === "accept_nano" && nanoRow) {
      return {
        ...nanoRow,
        reviewSource: "nano" as const,
        reasonCodes: [...new Set([
          ...nanoRow.reasonCodes,
          "nano_primary_observed_projection_accepted",
        ])].slice(0, 20),
      };
    }
    return nanoPrimaryUnknownRow({
      reasonCodes: decision?.reasonCodes ?? ["nano_primary_decision_missing"],
      row: nanoRow,
      topic,
    });
  });
  const miniInvoked = Boolean(input.miniArtifact);
  const approvedNanoModel = isApprovedRoutinePolicyReviewModel({
    requestedModel: input.nanoModel,
    resolvedModel: input.nanoArtifact.provenance.resolvedModel,
  });
  const approvedMiniModel = !miniInvoked || isApprovedProductionPolicyReviewModel({
    requestedModel: input.miniModel,
    resolvedModel: input.miniArtifact?.provenance.resolvedModel ?? input.miniModel,
  });
  const components = [input.nanoArtifact, input.miniArtifact];
  return policyModelReviewArtifactSchema.parse({
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    mode: "shadow",
    status: "completed",
    scanId: input.packet.scanId,
    cacheKey: buildPolicyReviewCacheKey({
      contentHash: input.packet.contentHash,
      model: `nano-primary-v1:${input.nanoModel}:${input.miniModel}`,
    }),
    rows,
    deterministicLegalFrameworkSignals: deriveDeterministicLegalFrameworkSignals(input.packet),
    deterministicPolicyReviewSignals: deriveDeterministicPolicyReviewSignals(input.packet),
    failureReason: null,
    provenance: {
      ...input.nanoArtifact.provenance,
      requestedModel: miniInvoked
        ? `hybrid:${input.nanoModel}+rare-${input.miniModel}`
        : input.nanoModel,
      resolvedModel: miniInvoked
        ? `hybrid:${input.nanoArtifact.provenance.resolvedModel}+rare-${input.miniArtifact?.provenance.resolvedModel ?? input.miniModel}`
        : input.nanoArtifact.provenance.resolvedModel,
      taskType: "policy_semantic_nano_primary_precision_review",
      contentHash: input.packet.contentHash,
      inputRefs: input.packet.documents.map((document) => document.documentId),
      outputRefs: rows.flatMap((row) => row.sourceDocumentIds).slice(0, 100),
      confidence: rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length,
      reasonCodes: [
        "nano_primary_precision_mode_v1",
        "owner_approved_mini_below_three_percent_goal_2026_08_18",
        approvedNanoModel ? "approved_gpt_5_4_nano_routine_model_v1" : "unapproved_routine_review_model",
        approvedMiniModel ? "approved_rare_mini_model_or_not_invoked_v1" : "unapproved_rare_mini_model",
      ],
      uncertaintyNotes: [],
      latencyMs: sumNullableMetric(components, "latencyMs"),
      promptTokens: sumNullableMetric(components, "promptTokens"),
      cachedPromptTokens: sumNullableMetric(components, "cachedPromptTokens"),
      completionTokens: sumNullableMetric(components, "completionTokens"),
      totalTokens: sumNullableMetric(components, "totalTokens"),
      usedForProductionProjection: false,
    },
    productionEligible: false,
  });
}

export function finalizeNanoPrimaryPolicyProjectionMode(input: {
  artifact: ReturnType<typeof policyModelReviewArtifactSchema.parse>;
  mode: "shadow" | "enforced";
}) {
  const approvedModels =
    input.artifact.provenance.reasonCodes.includes("approved_gpt_5_4_nano_routine_model_v1") &&
    input.artifact.provenance.reasonCodes.includes("approved_rare_mini_model_or_not_invoked_v1");
  const sourceRoutingValid = input.artifact.rows.every((row) => {
    if (row.reviewSource === "deterministic") {
      return RUNTIME_POLICY_REVIEW_TOPICS.includes(
        row.topic as (typeof RUNTIME_POLICY_REVIEW_TOPICS)[number],
      );
    }
    if (row.reviewSource === "mini") {
      return row.reasonCodes.includes("mini_verified_conflict_adjudication");
    }
    if (row.status === "observed") {
      return row.confidence >= NANO_ROUTINE_REVIEW_CONFIDENCE_THRESHOLDS[row.topic] &&
        row.reasonCodes.includes("nano_primary_observed_projection_accepted");
    }
    return row.status === "insufficient_retained_evidence" &&
      row.reasonCodes.includes("nano_primary_unresolved_retained_as_unknown");
  });
  const productionEligible = input.mode === "enforced" &&
    input.artifact.status === "completed" &&
    input.artifact.rows.length === POLICY_REVIEW_TOPICS.length &&
    approvedModels &&
    sourceRoutingValid &&
    input.artifact.rows.every((row) =>
      row.reasonCodes.includes("policy_review_invariants_applied_v1")
    );
  return policyModelReviewArtifactSchema.parse({
    ...input.artifact,
    mode: input.mode,
    provenance: {
      ...input.artifact.provenance,
      reasonCodes: [...new Set([
        ...input.artifact.provenance.reasonCodes,
        productionEligible
          ? "approved_precision_first_nano_primary_projection_v1"
          : "production_projection_withheld",
      ])].slice(0, 30),
      usedForProductionProjection: productionEligible,
    },
    productionEligible,
  });
}

export async function runNanoPrimaryPolicyReviewPacket(input: {
  apiKey?: string;
  earlyStaticExpected?: boolean;
  miniModel: string;
  mode: "shadow" | "enforced";
  nanoModel: string;
  packet: PolicyReviewPacket;
  reuseEarlyStatic?: boolean;
}) {
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: input.packet.contentHash,
    model: `nano-primary-v1:${input.nanoModel}:${input.miniModel}`,
  });
  const reusable = await loadReusableModelReviewArtifact({
    cacheKey,
    consistentRead: true,
    reviewKind: "policy_semantic",
  });
  const parsedReusable = reusable?.review_json
    ? policyModelReviewArtifactSchema.safeParse(reusable.review_json)
    : null;
  if (
    parsedReusable?.success &&
    hasExactlyTopics(parsedReusable.data, POLICY_REVIEW_TOPICS) &&
    parsedReusable.data.provenance.reasonCodes.includes("nano_primary_precision_mode_v1")
  ) {
    const artifact = finalizeNanoPrimaryPolicyProjectionMode({
      artifact: rebindCachedStaticArtifact({ artifact: parsedReusable.data, packet: input.packet }),
      mode: input.mode,
    });
    return {
      artifact,
      cacheHit: true,
      summary: {
        ...summarizePolicyReviewArtifact(artifact),
        cacheHit: true,
        reviewStatus: artifact.status,
      },
    };
  }

  const staticReview = async () => {
    if (input.reuseEarlyStatic && input.earlyStaticExpected) {
      const early = await loadMatchingStaticArtifact({
        model: input.nanoModel,
        packet: input.packet,
      });
      if (early) return early;
    }
    return (await runStaticPolicyReviewPacket({
      apiKey: input.apiKey,
      model: input.nanoModel,
      packet: input.packet,
    })).artifact;
  };
  const [staticArtifact, runtimeArtifact] = await runConcurrentPolicyReviewJoin({
    loadStatic: staticReview,
    reviewRuntime: () => runNanoPrimaryRuntimeReview({
      apiKey: input.apiKey,
      model: input.nanoModel,
      packet: input.packet,
    }),
  });
  const primary = provisionalNanoPrimaryArtifact({
    nanoModel: input.nanoModel,
    packet: input.packet,
    recoveryArtifact: null,
    runtimeArtifact,
    staticArtifact,
  });
  const retryTopics = routeNanoPrimaryPolicyReview(primary)
    .filter((decision) => decision.action === "retry_nano")
    .map((decision) => decision.topic)
    .filter((topic) => primary.rows.find((row) => row.topic === topic)?.reviewSource !== "deterministic");
  const retryRows = primary.rows.filter((row) => retryTopics.includes(row.topic));
  const recoveryTransport = buildBoundedMiniTopicTransport({
    packet: input.packet,
    passageExcerpts: retryRows.flatMap((row) => [
      ...row.evidenceExcerpts,
      ...row.conflictingExcerpts,
    ]),
    topics: retryTopics,
    transportVersion: "policy_nano_primary_recovery_transport.v1",
  });
  const recoveryArtifact = retryTopics.length > 0
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        candidateArtifact: primary,
        mode: "shadow",
        model: input.nanoModel,
        packet: input.packet,
        reviewPhase: "critic",
        topics: retryTopics,
        transportPacket: recoveryTransport.packet,
      })
    : null;
  const recovered = provisionalNanoPrimaryArtifact({
    nanoModel: input.nanoModel,
    packet: input.packet,
    recoveryArtifact,
    runtimeArtifact,
    staticArtifact,
  });
  const decisions = routeNanoPrimaryPolicyReview(recovered, { afterRetry: true });
  const miniTopics = decisions
    .filter((decision) => decision.action === "mini_conflict_candidate")
    .map((decision) => decision.topic);
  const conflictRows = recovered.rows.filter((row) => miniTopics.includes(row.topic));
  const miniTransport = buildBoundedMiniTopicTransport({
    packet: input.packet,
    passageExcerpts: conflictRows.flatMap((row) => [
      ...row.evidenceExcerpts,
      ...row.conflictingExcerpts,
    ]),
    topics: miniTopics,
    transportVersion: "policy_nano_primary_rare_mini_transport.v1",
  });
  const miniArtifact = miniTopics.length > 0
    ? await reviewPolicyPacketWithModel({
        apiKey: input.apiKey,
        candidateArtifact: recovered,
        mode: "shadow",
        model: input.miniModel,
        packet: input.packet,
        reviewPhase: "escalated",
        topics: miniTopics,
        transportPacket: miniTransport.packet,
      })
    : null;
  const artifact = finalizeNanoPrimaryPolicyProjectionMode({
    artifact: composeNanoPrimaryPolicyReviewArtifact({
      decisions,
      miniArtifact,
      miniModel: input.miniModel,
      nanoArtifact: recovered,
      nanoModel: input.nanoModel,
      packet: input.packet,
    }),
    mode: input.mode,
  });
  const routing = {
    contractVersion: "nano_primary_policy_routing.v1",
    miniAuditSampleSelected: isNanoPrimaryMiniAuditSample(input.packet.contentHash),
    miniInvocationRateTarget: NANO_PRIMARY_MINI_INVOCATION_RATE_TARGET,
    miniInvoked: Boolean(miniArtifact),
    miniTopics,
    nanoRecoveryInvoked: Boolean(recoveryArtifact),
    retryTopics,
    unresolvedTopics: decisions
      .filter((decision) => decision.action === "retain_unknown")
      .map((decision) => decision.topic),
  };
  const summary = await persistReviewArtifact({
    artifact,
    cacheHit: false,
    packet: input.packet,
    reviewKind: "policy_semantic",
    supplementalMetrics: {
      nanoRecoveryTransport: recoveryTransport.metrics,
      rareMiniTransport: miniTransport.metrics,
      routing,
    },
  });
  return {
    artifact,
    cacheHit: false,
    decisions,
    miniArtifact,
    recoveryArtifact,
    routing,
    runtimeArtifact,
    staticArtifact,
    summary,
  };
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
  allowPostResultModelCalls?: boolean;
  apiKey?: string;
  earlyStaticExpected?: boolean;
  mode: "shadow" | "enforced";
  model: string;
  packet: PolicyReviewPacket;
  reuseEarlyStatic?: boolean;
  useMiniExceptionRuntime?: boolean;
  useRuntimeSemanticCache?: boolean;
}) {
  const runtimeSemanticCacheEligible = Boolean(
    input.useMiniExceptionRuntime &&
    input.useRuntimeSemanticCache &&
    planPolicyRuntimeSemanticReview(input.packet).requiresMiniReview
  );
  const cacheContentHash = runtimeSemanticCacheEligible
    ? buildPolicyRuntimeSemanticContentHash(input.packet)
    : input.packet.contentHash;
  const cacheKey = buildPolicyReviewCacheKey({
    contentHash: cacheContentHash,
    model: input.model
  });
  const reusable = await loadReusableModelReviewArtifact({
    cacheKey,
    consistentRead: true,
    reviewKind: "policy_semantic"
  });
  let cacheHit = false;
  let artifact;
  let parallelJoin = false;
  let terminalReviewDeferred = false;
  if (reusable?.review_json) {
    const parsed = policyModelReviewArtifactSchema.safeParse(reusable.review_json);
    if (
      parsed.success &&
      hasExactlyTopics(parsed.data, POLICY_REVIEW_TOPICS) &&
      (!runtimeSemanticCacheEligible || isRuntimeSemanticCacheReusable(parsed.data))
    ) {
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
                  runtimeSemanticCacheEligible
                    ? "runtime_semantic_cache_reuse"
                    : "content_hash_cache_reuse"
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

  if (!artifact && input.reuseEarlyStatic && input.allowPostResultModelCalls === false) {
    const staticArtifact = await loadMatchingStaticArtifact({
      ...input,
      waitMs: 0,
    });
    if (staticArtifact && hasExactlyTopics(staticArtifact, STATIC_POLICY_REVIEW_TOPICS)) {
      parallelJoin = true;
      artifact = composeParallelPolicyArtifact({
        cacheContentHash,
        mode: input.mode,
        model: input.model,
        packet: input.packet,
        runtimeArtifact: buildNonBlockingTerminalRuntimeReview({
          model: input.model,
          packet: input.packet,
        }),
        staticArtifact,
      });
    } else {
      terminalReviewDeferred = true;
      artifact = buildDeferredTerminalPolicyReview(input);
    }
  }

  if (!artifact && input.reuseEarlyStatic) {
    const staticReviewJoinMode = getTerminalStaticReviewJoinMode(input.earlyStaticExpected);
    const [staticArtifact, runtimeArtifact] = await runConcurrentPolicyReviewJoin({
      // The terminal Lambda result carries the verified early-policy pointer
      // when that lane produced a usable packet. Only poll in that case. When
      // no pointer exists, start the same bounded static review immediately so
      // it overlaps the runtime-delta review instead of sleeping for six
      // seconds and then issuing a full eight-topic review.
      loadStatic: () => staticReviewJoinMode === "wait_for_verified_early_static"
        ? loadMatchingStaticArtifact(input)
        : runStaticPolicyReviewPacket(input).then((result) => result.artifact),
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
    if (staticArtifact && hasExactlyTopics(staticArtifact, STATIC_POLICY_REVIEW_TOPICS)) {
      if (hasExactlyTopics(runtimeArtifact, RUNTIME_POLICY_REVIEW_TOPICS)) {
        parallelJoin = true;
        artifact = composeParallelPolicyArtifact({
          cacheContentHash,
          mode: input.mode,
          model: input.model,
          packet: input.packet,
          runtimeArtifact,
          staticArtifact,
        });
      }
    }
  }

  if (!artifact && input.allowPostResultModelCalls === false) {
    terminalReviewDeferred = true;
    artifact = buildDeferredTerminalPolicyReview(input);
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
    postResultModelCallStarted: input.allowPostResultModelCalls !== false && !cacheHit,
    terminalReviewDeferred,
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
