import assert from "node:assert/strict";
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/operational-events", route => route.fulfill({ json: { ok: true } }));
    await page.goto("http://localhost:3000/dev-fixtures/production-cookie-table", { waitUntil: "networkidle" });
    if (await page.getByRole("button", { name: "Reject analytics", exact: true }).isVisible()) await page.getByRole("button", { name: "Reject analytics", exact: true }).click();
    assert.equal(await page.getByRole("columnheader", { name: "Resource details", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Inspect ⌄", exact: true }).count(), 3);
    await page.getByRole("button", { name: "Inspect ⌄", exact: true }).first().click();
    await page.getByRole("button", { name: "+ 1 child", exact: true }).first().click();
    await page.getByRole("button", { name: "+ 1 child", exact: true }).first().click();
    await page.getByRole("button", { name: /fixture_id/ }).waitFor();
    await page.screenshot({ path: "/tmp/production-cookie-table-demo.png", fullPage: true });
    await page.goto("http://localhost:3000/dev-fixtures/production-cookie-table?example=real", { waitUntil: "networkidle" });
    const realRows = await page.getByRole("button", { name: "Inspect ⌄", exact: true }).count();
    console.log(JSON.stringify({ realRows, realPage: (await page.locator("main").innerText()).slice(0, 450) }));
    await page.screenshot({ path: "/tmp/production-cookie-table-real.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: production component, original Inspect controls, two child links, no page errors");
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
