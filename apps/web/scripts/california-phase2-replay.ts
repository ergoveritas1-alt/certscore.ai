import path from "node:path";
import {
  loadCaliforniaPhase2Artifacts,
  replayCaliforniaPhase2Artifact,
  writeCaliforniaPhase2ReplayReports
} from "../lib/scans/california-phase2-validation-replay";

function getArg(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function getDefaultInputDir() {
  return path.resolve(process.cwd(), "../../tmp/california-phase2-validation");
}

function getDefaultOutputDir(inputDir: string) {
  return path.resolve(inputDir, "wc01-replay");
}

async function main() {
  const inputDir = path.resolve(getArg("--input-dir") ?? process.env.CALIFORNIA_VALIDATION_INPUT_DIR ?? getDefaultInputDir());
  const outDir = path.resolve(getArg("--out-dir") ?? process.env.CALIFORNIA_VALIDATION_REPLAY_OUT_DIR ?? getDefaultOutputDir(inputDir));
  const artifacts = await loadCaliforniaPhase2Artifacts(inputDir);
  if (artifacts.length === 0) {
    throw new Error(`No *.runtime-artifacts.json files found in ${inputDir}. Run WS01 california:validate first.`);
  }

  const audits = artifacts.map(({ artifact }) => replayCaliforniaPhase2Artifact(artifact));
  const reportPaths = await writeCaliforniaPhase2ReplayReports({ audits, outDir });
  const insufficientRows = audits.flatMap((audit) =>
    audit.rowAudits
      .filter((row) => !row.selfSufficient)
      .map((row) => `${audit.domain}:${row.rowId}:${row.status}`)
  );

  console.info("[california-phase2-replay] wrote", reportPaths);
  if (insufficientRows.length > 0) {
    console.warn("[california-phase2-replay] rows needing evidence review", insufficientRows);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[california-phase2-replay]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
