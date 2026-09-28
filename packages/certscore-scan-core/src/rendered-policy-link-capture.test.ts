import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { captureRenderedPolicyLinks, mergeRetainedRenderedPolicyLinks } from "./scanners/pre-consent-runtime-scanner";
import { policySurfaceObservationsFromRetainedRenderedLinks } from "./scanners/policy-surface-scanner";

test("existing browser pass retains visibility and image, SVG and shadow-root accessible names", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>.hidden { display: none }</style>
      <a class="hidden" href="https://example.test/hidden">Do Not Sell or Share</a>
      <a href="https://example.test/image"><img alt="Do Not Sell or Share" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></a>
      <a href="https://example.test/svg"><svg width="20" height="20"><title>Your Privacy Choices</title><circle cx="10" cy="10" r="8"/></svg></a>
      <div id="shadow-host"></div>
    `);
    await page.evaluate(() => {
      document.getElementById("shadow-host")!.attachShadow({ mode: "open" }).innerHTML =
        '<a href="https://example.test/shadow" aria-label="Cookie Settings">⚙</a>';
    });
    const links = await captureRenderedPolicyLinks(page);
    const byHref = (href: string) => links.find((link) => link.href === href);
    assert.equal(byHref("https://example.test/hidden")?.linkVisibility, "hidden");
    assert.equal(byHref("https://example.test/image")?.linkVisibility, "visible");
    assert.equal(byHref("https://example.test/image")?.accessibleNameSource, "image_alt");
    assert.equal(byHref("https://example.test/image")?.linkText, "Do Not Sell or Share");
    assert.equal(byHref("https://example.test/svg")?.accessibleNameSource, "svg_title");
    assert.equal(byHref("https://example.test/shadow")?.accessibleNameSource, "aria_label");
    const observations = policySurfaceObservationsFromRetainedRenderedLinks({ links });
    assert.equal(observations.find((row) => row.url === "https://example.test/image")?.linkVisibility, "visible");
    assert.equal(observations.find((row) => row.url === "https://example.test/image")?.accessibleNameSource, "image_alt");
    assert.equal(observations.find((row) => row.url === "https://example.test/hidden")?.linkVisibility, "hidden");
  } finally {
    await browser.close();
  }
});

test("visible same-href proof can replace a hidden link after the 40-link retention cap", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div style="display:none">${Array.from({ length: 40 }, (_, index) =>
      `<a href="https://example.test/choice-${index}">Do Not Sell or Share</a>`).join("")}</div>
      <footer><a href="https://example.test/choice-0">Do Not Sell or Share</a></footer>`);
    const links = await captureRenderedPolicyLinks(page);
    assert.equal(links.length, 40);
    assert.equal(links.find((link) => link.href === "https://example.test/choice-0")?.linkVisibility, "visible");
    assert.equal(links.find((link) => link.href === "https://example.test/choice-0")?.domLocation, "footer");
    const hiddenBatch = links.map((link) => link.href === "https://example.test/choice-0"
      ? { ...link, linkVisibility: "hidden" as const, domLocation: "body" as const }
      : link);
    const replacement = links.find((link) => link.href === "https://example.test/choice-0")!;
    const merged = mergeRetainedRenderedPolicyLinks(hiddenBatch, [replacement]);
    assert.equal(merged.length, 40);
    assert.equal(merged.find((link) => link.href === replacement.href)?.linkVisibility, "visible");
  } finally {
    await browser.close();
  }
});
