import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function withPage(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await run(page);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

test("consent interaction vendor diff logic is deterministic", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      difference(left: string[], right: string[]): string[];
      intersection(left: string[], right: string[]): string[];
    };
  }).__test;

  assert.ok(helpers);
  assert.deepEqual(helpers?.difference(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag"]), ["Google Ads"]);
  assert.deepEqual(
    helpers?.intersection(["Google Ads", "LinkedIn Insight Tag"], ["LinkedIn Insight Tag", "Marketo"]),
    ["LinkedIn Insight Tag"]
  );
});

test("accept path logs one-click opt-in evidence", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performAcceptPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        clicked: boolean;
        clickCount: number | null;
        evidenceLog: Array<{ action: string; text: string }>;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="accept" onclick="document.getElementById('banner').remove()">Accept all</button>
        <button id="reject">Reject all</button>
      </div>
    `);

    const result = await helpers!.performAcceptPath(page, "", async () => {});
    assert.equal(result.clicked, true);
    assert.equal(result.clickCount, 1);
    assert.deepEqual(result.evidenceLog.map((step) => step.action), ["accept"]);
  });
});

test("reject path traverses preferences, toggles non-essential cookies, and saves", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performRejectPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        clicked: boolean;
        clickCount: number | null;
        evidenceLog: Array<{ action: string; text: string }>;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="manage" onclick="document.getElementById('prefs').style.display='block'">Manage preferences</button>
      </div>
      <div id="prefs" style="display:none">
        <label><input id="analytics" type="checkbox" checked /> Analytics cookies</label>
        <button id="save" onclick="document.getElementById('prefs').remove(); document.getElementById('banner').remove()">Save choices</button>
      </div>
    `);

    const result = await helpers!.performRejectPath(page, "", async () => {});
    assert.equal(result.clicked, true);
    assert.equal(result.clickCount, 3);
    assert.deepEqual(result.evidenceLog.map((step) => step.action), ["preferences", "toggle", "save"]);
  });
});

test("reject path flags auth-wall friction when the opt-out flow reveals login gating", async () => {
  const mod = await import("./consent-interaction");
  const helpers = (mod as unknown as {
    __test?: {
      performRejectPath: (page: Page, startHost: string, waitForSettle: (maxWaitMs: number) => Promise<void>) => Promise<{
        clicked: boolean;
        clickCount: number | null;
        redirectOrAuthRequired: boolean;
      }>;
    };
  }).__test;

  await withPage(async (page) => {
    await page.setContent(`
      <div id="banner">
        <button id="manage" onclick="document.body.innerText='Login required to manage privacy settings'">Manage preferences</button>
      </div>
    `);

    const result = await helpers!.performRejectPath(page, "", async () => {});
    assert.equal(result.redirectOrAuthRequired, true);
    assert.equal(result.clickCount, 1);
  });
});
