import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { waitForConsentDocumentReady } from "./consent-document-readiness.js";

test("document readiness spends only the remaining caller deadline and never polls DOM", async () => {
  const deadline = Date.now() + 250;
  let calls = 0;
  const page = { waitForLoadState: async (state: string, options: { timeout: number }) => {
    calls++;
    assert.equal(state, "domcontentloaded");
    assert.ok(options.timeout > 0 && options.timeout <= 250);
  } } as Page;
  assert.equal(await waitForConsentDocumentReady(page, deadline), true);
  assert.equal(calls, 1);
  assert.equal(await waitForConsentDocumentReady(page, Date.now() - 1), false);
  assert.equal(calls, 1);
});

test("readiness timeout and cancellation fail closed without a fresh wait", async () => {
  const failed = { waitForLoadState: async () => { throw new Error("timeout"); } } as unknown as Page;
  assert.equal(await waitForConsentDocumentReady(failed, Date.now() + 100), false);
  const controller = new AbortController();
  let finish!: () => void;
  const pending = { waitForLoadState: () => new Promise<void>(resolve => { finish = resolve; }) } as Page;
  const result = waitForConsentDocumentReady(pending, Date.now() + 500, controller.signal);
  controller.abort();
  assert.equal(await result, false);
  finish();
});
