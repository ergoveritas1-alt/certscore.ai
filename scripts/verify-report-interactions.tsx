import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright";
import { ReportInteractionFixture } from "./fixtures/report-interactions";

// In-memory, synthetic component hydration. Never opens a report URL, contacts
// localhost/production/target sites, or creates a scan. All requests are intercepted.
async function main() {
const result = await build({
  stdin: {
    contents: `import React from 'react';
      import { hydrateRoot } from 'react-dom/client';
      import { ReportInteractionFixture } from './scripts/fixtures/report-interactions';
      hydrateRoot(document.getElementById('root'), React.createElement(ReportInteractionFixture));`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
  tsconfig: path.resolve("apps/web/tsconfig.test.json"),
  define: { "process.env.NODE_ENV": '"development"' },
});
const markup = renderToString(<ReportInteractionFixture />);
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=", "base64");
const browser = await chromium.launch({ headless: true });
try {
  for (const timezoneId of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    let imageRequests = 0;
    let failImage = false;
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, "http://report-component-fixture.test", "unexpected outbound request");
      assert.match(url.pathname, /^\/api\/scans\/fixture\/form-[01]\.png$/);
      imageRequests++;
      if (failImage) return route.abort();
      await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
    });
    await page.setContent(`<!doctype html><html><head><base href="http://report-component-fixture.test/"></head><body><div id="root">${markup}</div></body></html>`);
    assert.equal(await page.locator("time").getAttribute("title"), "UTC", "SSR has an explicit UTC fallback");
    await page.addScriptTag({ content: result.outputFiles[0]!.text });
    await page.waitForFunction(zone => document.querySelector("time")?.title === zone, timezoneId);
    const expected = new Intl.DateTimeFormat("en-US", { timeZone: timezoneId, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short" }).format(new Date("2026-10-08T00:22:22Z"));
    assert.equal(await page.locator("time").innerText(), expected);
    assert.equal(await page.locator("time").getAttribute("datetime"), "2026-10-08T00:22:22.000Z");

    const timeline = page.getByRole("region", { name: "Pre-consent page event timeline", exact: true });
    await timeline.waitFor();
    assert.equal(await timeline.getByRole("button", { name: "Pre-consent", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(imageRequests, 0, "screenshots load only on request");
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    const accept = page.getByRole("region", { name: "Post accept click page event timeline", exact: true });
    await accept.getByText("Accepted activity", { exact: true }).waitFor();
    await accept.getByText("Limited", { exact: true }).waitFor();
    assert.equal(await accept.getByText("Cookie/storage", { exact: true }).count(), 0);
    assert.equal(await accept.locator('[class*="rose-"]').count(), 0, "ordinary post-Accept activity stays neutral");
    await page.getByRole("button", { name: "Reject", exact: true }).focus();
    await page.keyboard.press("Enter");
    const reject = page.getByRole("region", { name: "Post reject click page event timeline", exact: true });
    const issue = reject.getByText("Non-essential request", { exact: true });
    await issue.waitFor();
    assert.match(await issue.getAttribute("class") ?? "", /text-rose/);
    await page.getByRole("button", { name: "Pre-consent", exact: true }).click();
    await timeline.getByText("Cookie/storage", { exact: true }).waitFor();
    assert.equal(await timeline.locator('[class*="rose-"]').count(), 0, "unclassified storage stays neutral");

    for (const title of ["Contact", "Newsletter"]) {
      const trigger = page.getByRole("button", { name: `View form: ${title}`, exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await dialog.waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>("dialog img");
        return image?.complete && image.naturalWidth === 1;
      });
      assert.equal(await dialog.getByRole("status").count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      if (title === "Contact") await dialog.getByRole("button", { name: "Close form snapshot" }).click();
      else await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.body.style.overflow === "");
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true, "focus returns to the correct form");
    }
    // Retained-image delivery failure is recoverable without leaving a broken dialog.
    failImage = true;
    await page.getByRole("button", { name: "View form: Newsletter", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    failImage = false;
    await page.getByRole("button", { name: "View form: Newsletter", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>("dialog img")?.naturalWidth === 1);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "View privacy disclosure: Contact", exact: true }).click();
    await page.getByText("We use your email to answer your request.", { exact: true }).waitFor();
    assert.equal(imageRequests, 4);
    assert.deepEqual(errors.filter(error => !error.includes("net::ERR_FAILED")), [], "no hydration or component errors");
    console.log(`PASS ${timezoneId}: hydration, timeline modes/tones, both images, modal focus/scroll/Escape, image failure/reopen, disclosure`);
    await context.close();
  }
} finally {
  await browser.close();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
