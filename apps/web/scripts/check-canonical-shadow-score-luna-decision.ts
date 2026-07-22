import {
  auditLunaScoreDecision,
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel
} from "../lib/scans/canonical-shadow-score-luna-decision";

async function main() {
  const errors = auditLunaScoreDecision(GDPR_EPRIVACY_SHADOW_LUNA_DECISION);
  const approved = isLunaScoreDecisionApprovedForModel(
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
    GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
  );
  const { buildCanonicalShadowScoreBenchmarkArtifact } = await import(
    "../lib/scans/canonical-shadow-score-benchmark"
  );
  const benchmark = buildCanonicalShadowScoreBenchmarkArtifact(new Date().toISOString());
  const requireApproved = process.argv.includes("--require-approved");

  console.log(JSON.stringify({
    approved,
    benchmarkAcceptanceBlockers: benchmark.acceptanceBlockers,
    benchmarkSchemaVersion: benchmark.schemaVersion,
    decisionStatus: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.decisionStatus,
    errors,
    modelVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
    overallScoreStatus: benchmark.overallScoreStatus,
    schemaVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.schemaVersion
  }, null, 2));

  if (
    errors.length > 0 ||
    (requireApproved && (!approved || benchmark.acceptanceBlockers.length > 0))
  ) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
