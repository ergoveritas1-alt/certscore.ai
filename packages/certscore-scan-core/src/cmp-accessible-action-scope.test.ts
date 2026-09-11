import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { resolveScopedAccessibleControl } from "./cmp-accessible-action.js";

async function withPage(html: string, run: (page: import("playwright").Page) => Promise<void>) {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded" });
    await run(page);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const accept = { kind: "scoped_accessible_control", scopeSelector: "#scope", intent: "accept" } as const;

test("resolves a visible accessible control in a boxless open-shadow scope", async () => {
  await withPage(`<!doctype html><div id="scope" style="display:contents"></div><script>
    const host = document.querySelector('#scope');
    const shadow = host.attachShadow({mode:'open'});
    shadow.innerHTML = '<button aria-label="Accept all cookies">Accept all</button>';
  </script>`, async (page) => {
    const control = await resolveScopedAccessibleControl(page, accept);
    assert.ok(control);
    assert.equal(await control.getAttribute("aria-label"), "Accept all cookies");
  });
});

test("rejects a control under a hidden or inert ancestor", async () => {
  await withPage(`<!doctype html><div id="scope" hidden><button aria-label="Accept all cookies">Accept all</button></div>`, async (page) => {
    assert.equal(await resolveScopedAccessibleControl(page, accept), undefined);
  });
  await withPage(`<!doctype html><div id="scope" inert><button aria-label="Accept all cookies">Accept all</button></div>`, async (page) => {
    assert.equal(await resolveScopedAccessibleControl(page, accept), undefined);
  });
  await withPage(`<!doctype html><div id="scope"><div aria-hidden="true"><button aria-label="Accept all cookies">Accept all</button></div></div>`, async (page) => {
    assert.equal(await resolveScopedAccessibleControl(page, accept), undefined);
  });
});

test("fails closed when two eligible controls are present", async () => {
  await withPage(`<!doctype html><div id="scope"><button aria-label="Accept all cookies">Accept all</button><button aria-label="Accept all cookies">Accept all</button></div>`, async (page) => {
    assert.equal(await resolveScopedAccessibleControl(page, accept), undefined);
  });
});

test("fails closed before truncating a control set larger than the bound", async () => {
  const buttons = Array.from({ length: 25 }, (_, index) =>
    `<button aria-label="${index === 0 || index === 24 ? "Accept all cookies" : "Continue"}">${index === 0 || index === 24 ? "Accept all" : "Continue"}</button>`,
  ).join("");
  await withPage(`<!doctype html><div id="scope">${buttons}</div>`, async (page) => {
    assert.equal(await resolveScopedAccessibleControl(page, accept), undefined);
  });
});
