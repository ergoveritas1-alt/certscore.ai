import { policyModelReviewArtifactSchema } from "@certscore/contracts";

const NO_PRODUCTION_POLICY_MODEL_REVIEW = "no-production-policy-model-review";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getProductionPolicyModelReviewRevision(runtimeArtifacts: unknown) {
  if (!isRecord(runtimeArtifacts)) {
    return NO_PRODUCTION_POLICY_MODEL_REVIEW;
  }

  const rawArtifact =
    runtimeArtifacts.policyModelReviewArtifact ??
    runtimeArtifacts.policy_model_review_artifact;
  const parsed = policyModelReviewArtifactSchema.safeParse(rawArtifact);
  if (
    !parsed.success ||
    !parsed.data.productionEligible ||
    !parsed.data.provenance.usedForProductionProjection
  ) {
    return NO_PRODUCTION_POLICY_MODEL_REVIEW;
  }

  return [
    "production-policy-model-review",
    parsed.data.cacheKey,
    parsed.data.contractVersion,
    parsed.data.mode,
    parsed.data.status
  ].join(":");
}
