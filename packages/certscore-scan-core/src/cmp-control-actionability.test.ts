import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  dispatchLocatorClickWithVerifiedGeometry,
  inspectLocatorActionability,
  locatorActionabilitySupportsVerifiedDispatch,
  locatorHasViewportHitTarget,
  waitForLocatorVerifiedGeometry,
} from "./cmp-control-actionability.js";

test("an animated CMP control becomes actionable only after entering the viewport", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<!doctype html><html><body>
      <button id="accept" style="position:fixed;left:20px;top:20px;transform:translateY(900px)">Accept</button>
      <script>setTimeout(() => document.querySelector('#accept').style.transform = 'none', 250)</script>
    </body></html>`);
    const control = page.locator("#accept");

    assert.equal(await control.isVisible(), true);
    assert.equal(await locatorHasViewportHitTarget(control), false);
    await page.waitForTimeout(350);
    assert.equal(await locatorHasViewportHitTarget(control), true);
  } finally {
    await browser.close();
  }
});

test("an occluded CMP control is not a usable viewport hit target", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<!doctype html><html><body>
      <button id="reject" style="position:fixed;left:20px;top:20px;width:160px;height:48px">Reject</button>
      <div style="position:fixed;left:0;top:0;width:240px;height:100px;z-index:2"></div>
    </body></html>`);

    assert.equal(await locatorHasViewportHitTarget(page.locator("#reject")), false);
  } finally {
    await browser.close();
  }
});

test("verified geometry dispatches a continuously animated but safe CMP control", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<!doctype html><html><head><style>
      @keyframes cmp-pulse { from { transform: translateX(0); } to { transform: translateX(2px); } }
      #accept { position:fixed;left:20px;top:20px;width:160px;height:48px;animation:cmp-pulse 40ms linear infinite alternate; }
    </style></head><body>
      <button id="accept">Accept all</button>
      <script>window.acceptCount = 0; document.querySelector('#accept').addEventListener('click', () => window.acceptCount += 1);</script>
    </body></html>`);
    const control = page.locator("#accept");

    await assert.rejects(control.click({ trial: true, timeout: 150 }));
    const actionability = await inspectLocatorActionability(control);
    assert.equal(locatorActionabilitySupportsVerifiedDispatch(actionability), true);
    await dispatchLocatorClickWithVerifiedGeometry(control);
    assert.equal(await page.evaluate(() => (window as unknown as { acceptCount: number }).acceptCount), 1);
  } finally {
    await browser.close();
  }
});

test("verified geometry waits within the retry slice for a partially off-screen control", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<!doctype html><html><body>
      <button id="accept" style="position:fixed;left:20px;top:594px;width:160px;height:48px">Accept all</button>
      <script>setTimeout(() => document.querySelector('#accept').style.top = '520px', 200);</script>
    </body></html>`);
    const control = page.locator("#accept");

    assert.equal(await locatorHasViewportHitTarget(control), false);
    const actionability = await waitForLocatorVerifiedGeometry(control, 500);
    assert.equal(locatorActionabilitySupportsVerifiedDispatch(actionability!), true);
  } finally {
    await browser.close();
  }
});
