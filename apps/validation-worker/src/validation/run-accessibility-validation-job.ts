import { chromium } from "playwright";
import { query } from "@website-signal-risk-scanner/db";
import { runAccessibilityScan } from "../accessibility/run-accessibility-scan";
import { persistAccessibilityResults } from "../accessibility/persist-accessibility-results";
import { setupRequestBlocking } from "../browser/request-blocking";

/**
 * Standalone validation job that runs an accessibility scan against a scan's
 * final URL and persists results.
 *
 * This can be invoked from:
 * - the validation dispatcher (as an optional stage)
 * - a manual script
 * - a future scheduled job
 */

export async function runAccessibilityValidationJob(scanId: string): Promise<{
  findingsCount: number;
  score: number;
  status: "completed" | "failed" | "skipped";
}> {
  const scanResult = await query<
    { domain_id: string; organization_id: string }
  >(
    `select domain_id, organization_id from scans where id = $1`,
    [scanId],
    { readOnly: true }
  );

  const snapshotResult = await query<
    { final_url: string | null }
  >(
    `select final_url from scan_snapshots where scan_id = $1`,
    [scanId],
    { readOnly: true }
  );

  const scan = scanResult.rows[0];
  const finalUrl = snapshotResult.rows[0]?.final_url ?? null;
  if (!scan || !finalUrl) {
    console.info("[accessibility-job] skipping: no final_url", { scanId });
    return { findingsCount: 0, score: 96, status: "skipped" };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requestBlocking = await setupRequestBlocking(page, { mode: "full" });

  try {
    console.info("[accessibility-job] navigating", { scanId, url: finalUrl });
    await page.goto(finalUrl, { waitUntil: "networkidle" });

    const result = await runAccessibilityScan({
      page,
      url: finalUrl,
      scanId
    });

    if (result.scanError) {
      console.error("[accessibility-job] scan error", {
        message: result.scanError.message,
        scanId,
        stage: result.scanError.stage
      });
      return { findingsCount: 0, score: 96, status: "failed" };
    }

    await persistAccessibilityResults(scanId, scan.organization_id, scan.domain_id, result);

    console.info("[accessibility-job] completed", {
      requestBlocking: requestBlocking.getStats(),
      findingsCount: result.findings.length,
      scanId,
      score: result.score.score
    });

    return {
      findingsCount: result.findings.length,
      score: result.score.score,
      status: "completed"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[accessibility-job] fatal error", { message, scanId });
    return { findingsCount: 0, score: 96, status: "failed" };
  } finally {
    await requestBlocking.stop();
    await context.close();
    await browser.close();
  }
}
