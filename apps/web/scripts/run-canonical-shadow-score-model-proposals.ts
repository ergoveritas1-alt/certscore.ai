import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCanonicalShadowScoreBenchmarkArtifact } from "../lib/scans/canonical-shadow-score-benchmark";
import { GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS } from "../lib/scans/canonical-shadow-score-model-proposals";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const outputPath = path.resolve(
    argumentValue("--out") ?? "artifacts/scoring/gdpr-eprivacy-shadow-rights-gap-proposals.json"
  );
  const proposals = GDPR_EPRIVACY_SHADOW_MODEL_PROPOSALS.map((proposal) => {
    const benchmark = buildCanonicalShadowScoreBenchmarkArtifact(generatedAt, proposal.model);
    const policyCase = benchmark.cases.find((entry) => entry.laneId === "policy_gaps");
    return {
      benchmarkAcceptanceBlockers: benchmark.acceptanceBlockers,
      changedParameters: proposal.changedParameters,
      modelVersion: proposal.model.version,
      policyGapOutcome: policyCase?.result ?? null,
      proposalId: proposal.proposalId,
      rationale: proposal.rationale
    };
  });
  const artifact = {
    generatedAt,
    lunaDecisionRequired: true,
    proposals,
    schemaVersion: "canonical-shadow-score-model-proposals.v1"
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outputPath,
    proposals: proposals.map((proposal) => ({
      acceptanceBlockers: proposal.benchmarkAcceptanceBlockers,
      posture: proposal.policyGapOutcome?.posture ?? null,
      postureScore: proposal.policyGapOutcome?.postureScore ?? null,
      proposalId: proposal.proposalId
    }))
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
