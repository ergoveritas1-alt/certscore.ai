import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  buildPolicyReviewCacheKey,
  POLICY_MODEL_REVIEW_CONTRACT_VERSION,
  POLICY_MODEL_REVIEW_PROMPT_VERSION,
  reviewPolicyPacketWithMini,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket
} from "./model-policy-review";
import {
  loadReusableModelReviewArtifact,
  upsertScanModelReviewArtifact
} from "./repository";

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
    reviewStatus: artifact.status
  };
  await upsertScanModelReviewArtifact({
    cacheKey: artifact.cacheKey,
    contentHash: artifact.provenance.contentHash,
    contractVersion: POLICY_MODEL_REVIEW_CONTRACT_VERSION,
    metrics: summary,
    modelRole: "review",
    promptVersion: POLICY_MODEL_REVIEW_PROMPT_VERSION,
    requestedModel: artifact.provenance.requestedModel,
    resolvedModel: artifact.provenance.resolvedModel,
    review: artifact,
    reviewKind: "policy_semantic",
    reviewMode: artifact.mode,
    reviewStatus: artifact.status,
    scanId: input.packet.scanId,
    sourceDocumentIds: input.packet.documents.map((document) => document.documentId)
  });

  return {
    artifact,
    cacheHit,
    summary
  };
}
