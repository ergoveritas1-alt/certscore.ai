import { readFileSync } from "node:fs";
import { reviewCcpaScoring } from "./lib/ccpa-scoring-review";

try {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw new Error("Usage: review-ccpa-scoring.ts <canonical-report-export.json>");
  const result = reviewCcpaScoring(JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to review CCPA evidence.");
  process.exitCode = 1;
}
