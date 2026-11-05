import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime";
import { createArtifactWriter } from "./artifact-writer";
import { policySurfaceScanner } from "./scanners/policy-surface-scanner";

test("policy recovery reuses the discovered page and closes its context in a borrowed browser", async t => {
  let homepageVisits = 0, policyVisits = 0;
  const text = "We collect personal information to provide our services. Our legal basis is consent and legitimate interests. We retain records for two years. You may request access, correction and deletion by contacting privacy@example.test. ".repeat(12);
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    if (request.url === "/privacy") {
      policyVisits++;
      assert.match(request.headers.cookie ?? "", /policy_session=ready/);
      response.end(`<html><body><main><h1>Privacy Policy</h1><p>${text}</p></main></body></html>`);
    } else {
      homepageVisits++;
      response.setHeader("set-cookie", "policy_session=ready; Path=/");
      response.end('<html lang="en"><body><main>Public company homepage.</main><footer><a href="/privacy">Privacy Policy</a></footer></body></html>');
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const directory = await mkdtemp(path.join(tmpdir(), "policy-handoff-"));
  const browser = await chromium.launch(chromiumLaunchOptions({headless:true}));
  let contextsCreated = 0, externalRequests = 0;
  const newContext = browser.newContext.bind(browser);
  t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
    contextsCreated++;
    const context = await newContext(...args);
    await context.route("**/*", route => {
      if (new URL(route.request().url()).hostname !== "127.0.0.1") {externalRequests++; return route.abort();}
      return route.continue();
    });
    return context;
  });
  // Reproduce failed direct retrieval; browser fallback remains real HTTP.
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", {status:503}));
  try {
    const result = await policySurfaceScanner({url, normalizedUrl:url, scanStartedAtMs:Date.now(),
      internalBudgetMs:12000, discoveryMode:"fast", browser, artifactWriter:await createArtifactWriter(directory), enableNanoPolicyAssist:false});
    const policy = result.policySurfaceObservations.find(row => row.normalizedUrl === `${url}privacy`);
    assert.equal(policy?.status, "fetched");
    assert.equal(homepageVisits, 1, "recovery must not re-prime the homepage");
    assert.equal(policyVisits, 1);
    assert.equal(contextsCreated, 1, "reuse the exact discovery session");
    assert.equal(browser.contexts().length, 0, "close retained contexts even when browser ownership is external");
    assert.equal(browser.isConnected(), true);
    assert.equal(externalRequests, 0);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, {recursive:true,force:true});
  }
});
