import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContextOptions, Route } from "playwright";
import { prepareConsentActionPage, takePreparedConsentActionPage } from "./consent-action-browser";

test("an exact action takes only a blank page with the originally requested guards", async (t) => {
  const priorForce = process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE;
  const priorAgent = process.env.CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT;
  t.after(() => {
    if (priorForce === undefined) delete process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE;
    else process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE = priorForce;
    if (priorAgent === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT = priorAgent;
  });
  process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE = "true";
  process.env.CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT = "CertScore.ai localhost test";
  const steps: string[] = [];
  const routes: Array<(route: Route) => Promise<void>> = [];
  let pageUrl = "about:blank";
  const page = { url: () => pageUrl, frames: () => [{}], isClosed: () => false };
  const context = {
    async route(_match: string, route: (route: Route) => Promise<void>) {
      steps.push("route");
      routes.push(route);
    },
    async newPage() { steps.push("page"); return page; },
    pages: () => [page],
  };
  const contexts: unknown[] = [];
  const browser = {
    contexts: () => contexts,
    isConnected: () => true,
    async newContext(options: BrowserContextOptions) {
      assert.equal(options.ignoreHTTPSErrors, false);
      contexts.push(context);
      steps.push("context");
      return context;
    },
  } as unknown as Browser;
  const prepared = await prepareConsentActionPage(browser, true);
  assert.deepEqual(steps, ["context", "route", "route", "page"]);
  let blocked = false;
  await routes[1]!({
    request: () => ({ url: () => "http://127.0.0.1/" }),
    abort: async () => { blocked = true; },
    fallback: async () => { assert.fail("Private network navigation was admitted"); },
  } as unknown as Route);
  assert.equal(blocked, true);
  assert.equal(takePreparedConsentActionPage(prepared, true).page, page);
  assert.throws(() => takePreparedConsentActionPage(prepared, false), /required guards/);
  pageUrl = "https://example.test/";
  assert.throws(() => takePreparedConsentActionPage(prepared, true), /blank page/);
});
