import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  runCanonicalShadowScore,
  type CanonicalShadowScoreRunInput
} from "../lib/scans/canonical-shadow-score-run";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const inputPath = argumentValue("--input");
const outputPath = argumentValue("--out");
if (!inputPath || !outputPath) {
  throw new Error("Usage: tsx apps/web/scripts/run-canonical-shadow-score.ts --input <input.json> --out <artifact.json>");
}

const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8")) as CanonicalShadowScoreRunInput;
const artifact = runCanonicalShadowScore(input);
const resolvedOutputPath = path.resolve(outputPath);
await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
await writeFile(resolvedOutputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Wrote canonical shadow score comparison artifact to ${resolvedOutputPath}`);
