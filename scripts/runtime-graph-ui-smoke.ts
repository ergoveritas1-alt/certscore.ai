import assert from "node:assert/strict";
import { chromium } from "playwright";
import { runtimeGraphUiFixture } from "../apps/web/components/scans/runtime-evidence-graph-ui-fixture";

// Explicit local development check; never visits production or creates a database scan.
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const projection = { ...runtimeGraphUiFixture(), scanId: "00000000-0000-4000-8000-000000000123" };
  let reads = 0; let responseMode: "success" | "limit" | "corrupt" = "success";
  await page.route(`http://localhost:3000/api/scans/${projection.scanId}/runtime-evidence-graph`, async route => {
    reads++;
    if (responseMode === "limit") return route.fulfill({ status: 429, headers: { "Retry-After": "60" }, json: { error: "Synthetic canonical quota denial" } });
    return route.fulfill({ json: responseMode === "corrupt" ? { ...projection, scanId: "foreign" } : projection });
  });
  try {
    await page.goto("http://localhost:3000/dev-fixtures/runtime-evidence-graph?lazy=1", { waitUntil: "networkidle" });
    assert.equal(reads, 0, "collapsed inventory must not fetch graph bytes");
    assert.equal(await page.getByTestId("runtime-graph-disabled-fixture").getByTestId("runtime-evidence-graph").count(), 0, "disabled presentation must not leave an empty graph tile");
    await page.getByText("How these items were loaded Relationship evidence unavailable", { exact: true }).click();
    await page.getByText("This scan has no verified, publishable relationship graph. Existing observations remain available. Missing graph evidence does not establish absence.", { exact: true }).waitFor();
    assert.equal(reads, 0, "explicit historical unavailability never requests artifact bytes");
    const summary = page.getByText("How these items were loaded 2 captured scenarios", { exact: true });
    await summary.focus(); await summary.press("Enter");
    await page.getByLabel("Find an item").waitFor();
    assert.equal(reads, 1);
    await page.getByRole("button", { name: "Measurement request", exact: false }).click();
    await page.getByText("Parents and sources (2)", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Widget script Initiating script", exact: false }).click();
    await page.getByRole("heading", { name: "Widget script", exact: true }).waitFor();
    await page.getByLabel("Find an item").fill("fixture_key_44");
    assert.equal(await page.getByRole("list", { name: "Captured evidence nodes" }).getByRole("button").count(), 1);
    await page.getByLabel("Scenario", { exact: true }).selectOption("post_reject");
    await page.getByRole("button", { name: "fixture_key_44", exact: false }).click();
    await page.getByText("Same scoped item across scenarios", { exact: true }).waitFor();
    await page.getByText("Retained evidence fields", { exact: true }).click();
    assert.equal(reads, 1, "scenario/search/detail navigation reuses one verified graph");
    await summary.click(); await summary.click(); assert.equal(reads, 1);

    responseMode = "limit";
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("How these items were loaded 2 captured scenarios", { exact: true }).click();
    await page.getByText("Read limit reached. Wait 60 seconds before retrying.", { exact: true }).waitFor();
    const limitedReads = reads;
    await page.waitForTimeout(250); assert.equal(reads, limitedReads, "no automatic quota retry");
    responseMode = "success"; await page.getByRole("button", { name: "Retry loading evidence" }).click();
    await page.getByLabel("Find an item").waitFor(); assert.equal(reads, limitedReads + 1);

    responseMode = "corrupt";
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("How these items were loaded 2 captured scenarios", { exact: true }).click();
    await page.getByText("The retained relationship evidence did not verify.", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Find an item").count(), 0);
    assert.deepEqual(errors, []);
    console.info(JSON.stringify({ result: "passed", syntheticApiReads: reads, checks: ["disabled_no_tile", "historical_no_reads", "lazy_zero_reads", "keyboard", "multiple_parents", "search", "scenario", "evidence_drawer", "single_fetch", "429_no_auto_retry", "explicit_retry", "cross_scan_rejected", "no_page_errors"], limitation: "API responses intercepted with synthetic data; separate server storage/auth/quota tests cover the real read boundary" }));
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
