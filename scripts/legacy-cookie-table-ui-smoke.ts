import assert from "node:assert/strict";
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const errors: string[] = [];
    const graphReads: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.url().includes("/runtime-evidence-graph")) graphReads.push(request.url()); });
    await page.route("**/api/operational-events", route => route.fulfill({ json: { ok: true } }));
    await page.goto("http://localhost:3000/dev-fixtures/production-cookie-table?example=real", { waitUntil: "networkidle" });
    const table = page.locator("table.compact-resource-inventory");
    await table.waitFor();
    const rows = table.locator("tr[data-resource-owner]");
    const count = await rows.count();
    assert.ok(count > 0, "Real retained inventory must load");
    assert.equal(await rows.first().locator("td:nth-child(3) .w-16").count(), 0, "Legacy vendors must not reserve a relationship gutter");
    assert.equal(await table.getByRole("columnheader").count(), 10);
    assert.equal(await table.getByRole("button", { name: /immediate links?|Load retained relationship links/ }).count(), 0);
    assert.equal(await page.locator("[data-main-relationship]").count(), 0);
    for (let i = 0; i < count; i++) {
      assert.equal(await rows.nth(i).locator(":scope > td").count(), 10);
      await rows.nth(i).getByRole("button", { name: /^Inspect .* details$/ }).click();
      const detail = table.locator("tr[data-resource-detail]").nth(i);
      await detail.getByText("No retained graph for this scenario.", { exact: false }).waitFor();
      await detail.locator("summary").filter({ hasText: "Inventory summary & original evidence" }).click();
      assert.ok((await detail.innerText()).length > 200);
      await rows.nth(i).getByRole("button", { name: /^Close .* details$/ }).click();
    }
    await page.getByRole("button", { name: "Copy entire cookies and trackers table", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.startsWith("Type\tVendor\tName\tPurpose\tEvidence mix"));
    assert.equal(copied.trim().split("\n").length, count + 1);
    const longName = table.getByRole("button", { name: /^Show full retained name:/ }).first();
    if (await longName.count()) {
      await longName.click();
      assert.equal(await page.locator("[popover]:popover-open").count(), 1);
      await page.keyboard.press("Escape");
    }
    for (const width of [864, 734]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const heights = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      assert.ok(heights.every(height => Math.abs(height - heights[0]!) < 1));
    }
    await page.screenshot({ path: "/tmp/legacy-cookie-table-preview.png", fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(graphReads, []);
    console.log(JSON.stringify({ result: "PASS", rows: count, columns: 10, copiedRows: count, graphControls: 0, graphReads: 0, pageErrors: errors, screenshot: "/tmp/legacy-cookie-table-preview.png" }));
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
