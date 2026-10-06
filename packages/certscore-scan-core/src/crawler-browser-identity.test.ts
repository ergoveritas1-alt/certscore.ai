import assert from "node:assert/strict";
import { verify } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { chromium } from "playwright";
import { generateWebBotAuthKeyPair } from "@website-signal-risk-scanner/web-bot-auth";
import { chromiumContextOptions } from "./playwright-runtime.js";
import { installWebBotAuthRoute } from "./web-bot-auth-routing.js";
import { installGpcNavigatorSignal } from "./gpc-signal-capture.js";

const crawlerUa = "Mozilla/5.0 (compatible; ConsentCheckBot/1.0; +https://consentcheck.site/bot)";
const identityEnv = {
  CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT: crawlerUa,
  // Existing Lambda configurations may retain the old variable during rollout.
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT: crawlerUa,
};
const pageHtml = `<html><body><button>Accept all</button><button>Reject all</button><script>
  window.consentGranted = /bot|googlebot|crawler|spider|robot|crawling|lighthouse/i.test(navigator.userAgent);
  if (window.consentGranted) document.cookie = 'optionalConsent=all; path=/';
  window.childRequest = fetch('/child').then(r => r.text());
</script></body></html>`;

test("fresh baseline and GPC visits identify the bot on HTTP without navigator auto-consent", async () => {
  const received: Array<{ path: string; ua: string | undefined; gpc: string | undefined }> = [];
  const server = createServer((request, response) => {
    received.push({ path: request.url!, ua: request.headers["user-agent"], gpc: request.headers["sec-gpc"] as string | undefined });
    if (request.url === "/") {
      response.writeHead(302, { Location: "/visit" }); response.end(); return;
    }
    response.writeHead(200, { "Content-Type": request.url === "/child" ? "text/plain" : "text/html" });
    response.end(request.url === "/child" ? "loaded" : pageHtml);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const gpc of [false, true]) {
      const options = chromiumContextOptions(identityEnv);
      const context = await browser.newContext({ ...options, extraHTTPHeaders: { ...options.extraHTTPHeaders, ...(gpc ? { "Sec-GPC": "1" } : {}) } });
      const identityRoute = await installWebBotAuthRoute(context, identityEnv);
      assert.equal(identityRoute.enabled, false);
      await installGpcNavigatorSignal(context, gpc);
      assert.deepEqual(await context.cookies(), []);
      const page = await context.newPage();
      await page.goto(url);
      const state = await page.evaluate(async () => ({
        ua: navigator.userAgent,
        consentGranted: (window as any).consentGranted,
        child: await (window as any).childRequest,
        localStorageLength: localStorage.length,
        gpc: (navigator as any).globalPrivacyControl === true,
      }));
      assert.match(state.ua, /Chrome\//);
      assert.doesNotMatch(state.ua, /ConsentCheckBot/);
      assert.equal(state.consentGranted, false);
      assert.equal(state.child, "loaded");
      assert.equal(state.localStorageLength, 0);
      assert.equal(state.gpc, gpc);
      assert.deepEqual(await context.cookies(), []);
      await context.close();
    }
    assert.deepEqual(received.filter(row => ["/", "/visit", "/child"].includes(row.path)).map(row => ({ ...row })),
      [undefined, "1"].flatMap(gpc => ["/", "/visit", "/child"].map(path => ({ path, ua: crawlerUa, gpc }))));
  } finally {
    await browser.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("native navigator visits preserve valid signed crawler identity for HTTPS documents and children", async () => {
  const key = generateWebBotAuthKeyPair();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(chromiumContextOptions(identityEnv));
  const proofs: Array<{ path: string; ua: string | undefined; valid: boolean }> = [];
  try {
    await context.route("https://identity-fixture.invalid/**", async route => {
      const request = route.request(), headers = request.headers();
      const params = (headers["signature-input"] ?? "").replace(/^sig1=/, "");
      const base = `"@authority": identity-fixture.invalid\n"signature-agent": ${headers["signature-agent"]}\n"@signature-params": ${params}`;
      const signature = /^sig1=:(.+):$/.exec(headers.signature ?? "")?.[1];
      proofs.push({ path: new URL(request.url()).pathname, ua: headers["user-agent"], valid: Boolean(signature && verify(null, Buffer.from(base), key.publicKey, Buffer.from(signature, "base64"))) });
      await route.fulfill({ contentType: request.url().endsWith("/child") ? "text/plain" : "text/html", body: request.url().endsWith("/child") ? "loaded" : pageHtml });
    });
    const signer = await installWebBotAuthRoute(context, { ...identityEnv,
      WEB_BOT_AUTH_ENABLED: "1", WEB_BOT_AUTH_PRIVATE_KEY_PEM: key.privateKeyPem,
      WEB_BOT_AUTH_SIGNATURE_AGENT_URL: "https://consentcheck.site/.well-known/http-message-signatures-directory",
    });
    const page = await context.newPage();
    await page.goto("https://identity-fixture.invalid/visit");
    assert.equal(await page.evaluate(async () => { await (window as any).childRequest; return (window as any).consentGranted; }), false);
    assert.deepEqual(proofs, ["/visit", "/child"].map(path => ({ path, ua: crawlerUa, valid: true })));
    assert.equal(signer.snapshot().signedNavigationRequestCount, 1);
    assert.equal(signer.snapshot().signedHttpsRequestCount, 2);
    assert.deepEqual(await context.cookies(), []);
  } finally { await browser.close(); }
});
