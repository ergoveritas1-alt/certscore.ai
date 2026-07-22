import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCanonicalShadowScoreBenchmarkArtifact } from "../lib/scans/canonical-shadow-score-benchmark";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const outputPath = path.resolve(
    argumentValue("--out") ?? "artifacts/scoring/gdpr-eprivacy-shadow-benchmark-candidate-v3.json"
  );
  const artifact = buildCanonicalShadowScoreBenchmarkArtifact(new Date().toISOString());

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    caseCount: artifact.cases.length,
    acceptanceBlockers: artifact.acceptanceBlockers,
    gdprEprivacyCutoverEligible: artifact.gdprEprivacyCutoverEligible,
    invariantFailures: artifact.invariantFailures,
    outputPath,
    overallScoreStatus: artifact.overallScoreStatus,
    representedLaneCount: new Set(artifact.cases.map((entry) => entry.laneId)).size
  }, null, 2));

  if (process.argv.includes("--require-clean") && artifact.acceptanceBlockers.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
