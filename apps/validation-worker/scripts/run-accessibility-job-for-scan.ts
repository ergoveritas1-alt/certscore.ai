import { runAccessibilityValidationJob } from "../src/validation/run-accessibility-validation-job";

/**
 * One-off script to run the accessibility validation job for a specific scan.
 *
 * Usage:
 *   node --env-file=../web/.env.local --enable-source-maps --import tsx ./scripts/run-accessibility-job-for-scan.ts <scanId>
 */

async function main() {
  const scanId = process.argv[2];
  if (!scanId) {
    console.error("Usage: tsx ./scripts/run-accessibility-job-for-scan.ts <scanId>");
    process.exit(1);
  }

  console.info(`[dev] Running accessibility validation job for scan ${scanId}...`);
  const result = await runAccessibilityValidationJob(scanId);
  console.log("\n=== Result ===");
  console.log(JSON.stringify(result, null, 2));
}

void main();
