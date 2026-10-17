import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicNetworkUrl, guardedPublicFetch, installPublicNetworkGuardRoute, PublicNetworkGuardError } from "./public-network-guard.js";

test("runtime guard accepts only all-public DNS answers", async () => {
  await assert.doesNotReject(() => assertPublicNetworkUrl("https://example.com/path", {
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  }));
  for (const answers of [
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }],
    [{ address: "169.254.169.254", family: 4 }],
  ]) {
    await assert.rejects(
      () => assertPublicNetworkUrl("https://example.com", { resolver: async () => answers }),
      PublicNetworkGuardError,
    );
  }
});

test("runtime guard rejects direct private literals and local aliases", async () => {
  for (const url of ["http://127.0.0.1", "http://[::1]", "http://localhost", "http://service.internal"]) {
    await assert.rejects(() => assertPublicNetworkUrl(url), PublicNetworkGuardError);
  }
});

test("runtime guard re-resolves and blocks simulated DNS rebinding", async () => {
  let lookupCount = 0;
  const resolver = async () => {
    lookupCount += 1;
    return [{ address: lookupCount === 1 ? "93.184.216.34" : "10.0.0.9", family: 4 }];
  };
  await assert.doesNotReject(() => assertPublicNetworkUrl("https://rebind.example", { resolver }));
  await assert.rejects(
    () => assertPublicNetworkUrl("https://rebind.example", { resolver }),
    PublicNetworkGuardError,
  );
});

test("runtime guard blocks redirect destinations in unsafe network classes", async () => {
  for (const redirectUrl of [
    "http://127.0.0.1/admin",
    "http://10.1.2.3/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/",
  ]) {
    await assert.rejects(() => assertPublicNetworkUrl(redirectUrl), PublicNetworkGuardError);
  }
});

test("runtime guard permits intentional public IPv4 and IPv6 controls", async () => {
  await assert.doesNotReject(() => assertPublicNetworkUrl("https://93.184.216.34/"));
  await assert.doesNotReject(() => assertPublicNetworkUrl("https://[2606:4700:4700::1111]/"));
});

test("guarded fetch validates a redirect before opening the destination", async () => {
  const opened: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    opened.push(url);
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  };
  await assert.rejects(() => guardedPublicFetch("https://example.com/", {}, {
    env: { CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE: "true" },
    fetchImpl: fetchImpl as typeof fetch,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  }), PublicNetworkGuardError);
  assert.deepEqual(opened, ["https://example.com/"]);
});

test("explicit redirect responses validate the source and never open the destination", async () => {
  const opened: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    opened.push(String(input));
    return new Response(null, { status: 301, headers: { location: "http://169.254.169.254/" } });
  }) as typeof fetch;
  const options = {
    env: { CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE: "true" }, fetchImpl,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    maxRedirects: 0, returnRedirectResponse: true,
  };
  assert.equal((await guardedPublicFetch("https://example.com/sitemap.xml", {}, options)).status, 301);
  assert.deepEqual(opened, ["https://example.com/sitemap.xml"]);
  await assert.rejects(() => guardedPublicFetch("http://127.0.0.1/", {}, options), PublicNetworkGuardError);
  assert.equal(opened.length, 1);
  await assert.rejects(() => guardedPublicFetch("https://example.com/", {}, { ...options, returnRedirectResponse: false }), PublicNetworkGuardError);
});

test("DNS failures retain bounded internal reasons without changing fail-closed behavior", async () => {
  const cases = [
    { resolver: async () => { throw Object.assign(new Error('private resolver detail'), {code:'EAI_AGAIN'}); }, reason:'dns_resolution_failed', resolverCode:'EAI_AGAIN' },
    { resolver: async () => { throw Object.assign(new Error('private resolver detail'), {code:'private raw code'}); }, reason:'dns_resolution_failed', resolverCode:'other' },
    { resolver: async () => [], reason:'dns_no_answers' },
    { resolver: async () => [{address:'93.184.216.34',family:4},{address:'10.0.0.7',family:4}], reason:'non_public_dns_answer' },
  ];
  for (const {resolver,reason,resolverCode} of cases) {
    let calls=0;
    await assert.rejects(() => assertPublicNetworkUrl('https://example.com/', {resolver:async hostname => {calls++;return resolver();}}), error => {
      assert.ok(error instanceof PublicNetworkGuardError);
      assert.equal(error.code,'unsafe_target_blocked');
      assert.equal(error.message,'This target is not eligible for public website scanning.');
      assert.deepEqual(error.diagnostic,{version:'public_network_guard_failure.v1',reason,...(resolverCode?{resolverCode}:{})});
      assert.ok(Object.isFrozen(error.diagnostic));
      assert.doesNotMatch(JSON.stringify(error.diagnostic),/private|10\.0\.0|example\.com/);
      return true;
    });
    assert.equal(calls,1,'diagnostics must not retry DNS');
  }
});


test("route phase diagnostics distinguish pending validation without weakening or repeating the guard", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    for (const denied of [false, true]) {
      const context = await browser.newContext();
      const phases: string[] = [];
      let release!: () => void, lookups = 0, opened = 0;
      const pending = new Promise<void>(resolve => { release = resolve; });
      await context.route("https://guard-fixture.test/**", async route => { opened++; await route.fulfill({ body: "fixture" }); });
      await installPublicNetworkGuardRoute(context, { env: { CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE: "true" },
        resolver: async () => { lookups++; await pending; return [{ address: denied ? "127.0.0.1" : "93.184.216.34", family: 4 }]; },
        onRequestPhase: (_request, phase) => { phases.push(phase); if (phase !== "validation_pending") throw new Error("Observer failure"); },
      });
      const page = await context.newPage();
      const navigation = page.goto("https://guard-fixture.test/", { timeout: 3000 }).catch(() => null);
      for (let count = 0; !phases.length && count < 100; count++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.deepEqual(phases, ["validation_pending"]);
      assert.equal(opened, 0, "No network before public validation");
      release(); await navigation;
      assert.deepEqual(phases, ["validation_pending", denied ? "denied" : "validated"]);
      assert.equal(lookups, 1); assert.equal(opened, denied ? 0 : 1);
      await context.close();
    }
  } finally { await browser.close(); }
});

test("cancelled DNS validation cannot open a request after a late public answer", async () => {
  const controller = new AbortController();
  let release!: (value: {address:string;family:number}[]) => void;
  let opened = 0;
  const work = guardedPublicFetch("https://example.com/", {signal:controller.signal}, {
    env:{CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE:"true"},
    resolver:()=>new Promise(resolve=>{release=resolve;}),
    fetchImpl:(async()=>{opened++;return new Response("unexpected");}) as typeof fetch,
  });
  controller.abort();
  await assert.rejects(work, {name:"AbortError"});
  release([{address:"93.184.216.34",family:4}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opened,0);
});

test("concurrent lanes share pending DNS only and revalidate later answers", async () => {
  const {createInFlightPublicNetworkResolver}=await import("./public-network-guard.js");
  let calls=0, release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  const resolver=createInFlightPublicNetworkResolver(async()=>{
    const index=++calls; await pending;
    return [{address:index === 1?"93.184.216.34":"10.0.0.1",family:4}];
  });
  const lanes=Array.from({length:6},()=>assertPublicNetworkUrl("https://example.com/",{resolver}));
  assert.equal(calls,1);
  release(); await Promise.all(lanes);
  await assert.rejects(()=>assertPublicNetworkUrl("https://example.com/",{resolver}),PublicNetworkGuardError);
  assert.equal(calls,2,"A completed public answer is not cached across visits");
});
