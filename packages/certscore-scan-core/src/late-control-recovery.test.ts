import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { normalizeActionStorageSnapshot } from "./action-storage-snapshot.js";

const recipe = {
  recipeId: "local-late-recovery-test",
  selectorHint: "#consent-action",
};

function targetHash(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

test("late proof rejects a stale hidden control without dispatching it", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let clicks = 0;
    await page.setContent(`<button id="consent-action" onclick="window.__clicks++">Accept</button>`);
    await page.evaluate(() => { (window as unknown as { __clicks: number }).__clicks = 0; });
    const control = page.locator(recipe.selectorHint);
    await page.locator(recipe.selectorHint).evaluate((element) => { (element as HTMLElement).hidden = true; });
    const result = await buildConsentActionControlProof({
      action: "accept", control, observedAtMs: 1, page,
      recipeId: recipe.recipeId, selectorHint: recipe.selectorHint,
    });
    clicks = await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
    assert.deepEqual(result, { status: "label_unverifiable", reason: "resolved_control_no_longer_actionable" });
    assert.equal(clicks, 0);
  } finally {
    await browser.close();
  }
});

test("late proof fails closed on abort and exact-target drift", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="consent-action">Accept</button>');
    const control = page.locator(recipe.selectorHint);
    const abort = new AbortController();
    abort.abort();
    const aborted = await buildConsentActionControlProof({
      action: "accept", control, observedAtMs: 1, page, signal: abort.signal,
      recipeId: recipe.recipeId, selectorHint: recipe.selectorHint,
    });
    assert.equal(aborted.status, "label_unverifiable");
    assert.equal(aborted.reason, "abort_requested_before_action");

    const redirected = await buildConsentActionControlProof({
      action: "accept", control, observedAtMs: 1, page,
      authorizedTargetSha256: targetHash("https://authorized.example/"),
      recipeId: recipe.recipeId, selectorHint: recipe.selectorHint,
    });
    assert.equal(redirected.status, "label_unverifiable");
    assert.equal(redirected.reason, "redirect_target_not_authorized");
  } finally {
    await browser.close();
  }
});

test("changed labels remain non-actionable and malformed storage remains limited", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<button id="consent-action">Manage preferences</button>');
    const result = await buildConsentActionControlProof({
      action: "accept", control: page.locator(recipe.selectorHint), observedAtMs: 1,
      page, recipeId: recipe.recipeId, selectorHint: recipe.selectorHint,
    });
    assert.equal(result.status, "label_mismatch");

    const snapshot = normalizeActionStorageSnapshot({
      cookies: [{ name: "", value: "", domain: "example.test", path: "/" }, null],
      localStorage: [["consent", ""], ["bad", null]],
      sessionStorage: null,
    });
    assert.equal(snapshot.cookies.length, 1);
    assert.equal(snapshot.cookies[0]?.name, "");
    assert.equal(snapshot.localStorage.length, 1);
    assert.equal(snapshot.droppedCookies, 1);
    assert.equal(snapshot.droppedLocalStorage, 1);
    assert.equal(snapshot.droppedSessionStorage, 1);
  } finally {
    await browser.close();
  }
});
