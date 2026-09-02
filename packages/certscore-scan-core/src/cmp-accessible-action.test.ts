import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  closedShadowAccessibleControlAvailable,
  dispatchClosedShadowAccessibleControl,
} from "./cmp-accessible-action.js";

for (const intent of ["accept", "reject"] as const) {
  test(`closed-shadow accessibility resolution uniquely dispatches ${intent}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    try {
      await page.setContent(`<!doctype html><html><body><test-consent></test-consent><script>
        window.__choice = null;
        customElements.define('test-consent', class extends HTMLElement {
          constructor() {
            super();
            const root = this.attachShadow({ mode: 'closed' });
            root.innerHTML = '<div role="dialog" aria-label="Cookie choices" style="position:fixed;left:20px;top:20px;padding:20px;background:white"><button id="accept">Accept all</button><button id="reject">Reject all</button></div>';
            root.querySelector('#accept').addEventListener('click', () => window.__choice = 'accept');
            root.querySelector('#reject').addEventListener('click', () => window.__choice = 'reject');
          }
        });
      </script></body></html>`);
      const resolution = {
        intent,
        kind: "closed_shadow_accessible_control" as const,
        scopeSelector: "test-consent",
      };
      assert.equal(await closedShadowAccessibleControlAvailable(page, resolution), true);
      await dispatchClosedShadowAccessibleControl(page, resolution);
      await page.waitForFunction((expected) => (window as any).__choice === expected, intent);
      assert.equal(await page.evaluate(() => (window as any).__choice), intent);
    } finally {
      await browser.close();
    }
  });
}

test("closed-shadow accessibility resolution rejects transactional refusal variants", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  try {
    await page.setContent(`<!doctype html><html><body><test-consent></test-consent><script>
      customElements.define('test-consent', class extends HTMLElement {
        constructor() {
          super();
          const root = this.attachShadow({ mode: 'closed' });
          root.innerHTML = '<div role="dialog" aria-label="Cookie choices" style="position:fixed;left:20px;top:20px;padding:20px;background:white"><button>Reject and subscribe</button></div>';
        }
      });
    </script></body></html>`);
    assert.equal(await closedShadowAccessibleControlAvailable(page, {
      intent: "reject",
      kind: "closed_shadow_accessible_control",
      scopeSelector: "test-consent",
    }), false);
  } finally {
    await browser.close();
  }
});
