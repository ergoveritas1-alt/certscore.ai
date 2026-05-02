import { chromium } from "playwright";
import { runAccessibilityScan } from "../src/accessibility/run-accessibility-scan";
import { setupRequestBlocking } from "../src/browser/request-blocking";

/**
 * Dev script to run an accessibility scan against a target URL.
 *
 * Usage:
 *   node --env-file=../web/.env.local --enable-source-maps --import tsx ./scripts/run-local-accessibility-scan.ts https://example.com
 */

async function main() {
  const url = process.argv[2];
  if (!url || !url.startsWith("http")) {
    console.error("Usage: tsx ./scripts/run-local-accessibility-scan.ts <url>");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requestBlocking = await setupRequestBlocking(page, { mode: "full" });

  try {
    console.info(`[dev] Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle" });

    const result = await runAccessibilityScan({
      page,
      url,
      scanId: `dev-${Date.now()}`
    });

    console.log("\n=== Accessibility Scan Result ===");
    console.log(`Score: ${result.score.score} (${result.score.band})`);
    console.log(`Benchmark: ${result.benchmarkLabel}`);
    console.log(`Blocked heavy assets: ${requestBlocking.getStats().blockedCount}`);
    console.log(`Violations: ${result.metrics.totalViolationCount}`);
    console.log(`Affected nodes: ${result.metrics.totalAffectedNodeCount}`);
    console.log(`Critical: ${result.metrics.criticalCount}, Serious: ${result.metrics.seriousCount}, Moderate: ${result.metrics.moderateCount}, Minor: ${result.metrics.minorCount}`);
    console.log("\nExplanation:");
    for (const line of result.score.explanation) {
      console.log(`  - ${line}`);
    }

    if (result.findings.length > 0) {
      console.log("\n=== Top Findings ===");
      for (const finding of result.findings.slice(0, 10)) {
        console.log(`\n[${finding.severity.toUpperCase()}] ${finding.label}`);
        console.log(`  Rule: ${finding.axeRuleId} | Nodes: ${finding.affectedNodeCount}`);
        console.log(`  Evidence: ${finding.evidenceSummary}`);
        console.log(`  Remediation: ${finding.remediation}`);
      }
    }

    if (result.scanError) {
      console.error("\n=== Scan Error ===");
      console.error(`Stage: ${result.scanError.stage}`);
      console.error(`Message: ${result.scanError.message}`);
    }
  } catch (error) {
    console.error("[dev] Fatal error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await requestBlocking.stop();
    await context.close();
    await browser.close();
  }
}

void main();
