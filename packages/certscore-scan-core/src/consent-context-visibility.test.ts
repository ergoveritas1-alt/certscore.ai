import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";

let browser: Browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser.close();
});

async function capture(html: string) {
  const page: Page = await browser.newPage();
  try {
    await page.setContent(html);
    return await captureConsentControlGeometry(page);
  } finally {
    await page.close();
  }
}

function assertNoConsentContext(artifact: Awaited<ReturnType<typeof captureConsentControlGeometry>>) {
  assert.equal(artifact.summary.firstLayerAccept, false);
  const allow = artifact.candidates.find((candidate) => candidate.label === "Allow");
  assert.ok(allow);
  assert.notEqual(allow.decisionStatus, "confirmed_visible");
}

test("visible consent prose establishes context for a generic Allow control", async () => {
  const artifact = await capture(`
    <div id="scope" style="position:fixed;left:10px;top:10px;width:420px;height:180px;background:white">
      <p>We use cookies and similar technologies. Choose your privacy preferences.</p>
      <button>Allow</button>
    </div>
  `);
  assert.equal(artifact.summary.firstLayerAccept, true);
  assert.equal(artifact.candidates.find((candidate) => candidate.label === "Allow")?.decisionStatus, "confirmed_visible");
});

test("script and style text do not establish generic consent context", async () => {
  const artifact = await capture(`
    <div id="scope" style="position:fixed;left:10px;top:10px;width:420px;height:180px;background:white">
      <script>/* We use cookies and similar technologies. Choose your privacy preferences. */</script>
      <style>/* We use cookies and similar technologies. Choose your privacy preferences. */</style>
      <button>Allow</button>
    </div>
  `);
  assertNoConsentContext(artifact);
});

test("hidden, CSS-hidden, visibility-hidden, aria-hidden, and inert prose do not establish context", async () => {
  const variants = [
    `<div hidden>We use cookies and similar technologies. Choose your privacy preferences.</div>`,
    `<div class="gone">We use cookies and similar technologies. Choose your privacy preferences.</div>`,
    `<div style="visibility:hidden">We use cookies and similar technologies. Choose your privacy preferences.</div>`,
    `<div aria-hidden="true">We use cookies and similar technologies. Choose your privacy preferences.</div>`,
    `<div inert>We use cookies and similar technologies. Choose your privacy preferences.</div>`,
  ];
  for (const prose of variants) {
    const artifact = await capture(`
      <style>.gone { display:none }</style>
      <div id="cookie-banner" role="dialog" style="position:fixed;left:10px;top:10px;width:420px;height:180px;background:white">
        ${prose}<button>Allow</button>
      </div>
    `);
    assertNoConsentContext(artifact);
  }
});

test("hidden prose inside an open shadow root does not establish context", async () => {
  const artifact = await capture(`
    <example-cmp id="scope" style="display:block;position:fixed;left:10px;top:10px;width:420px;height:180px;background:white"></example-cmp>
    <script>
      const host = document.querySelector("#scope");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = '<div aria-hidden="true">We use cookies and similar technologies. Choose your privacy preferences.</div><button>Allow</button>';
    </script>
  `);
  assertNoConsentContext(artifact);
});
