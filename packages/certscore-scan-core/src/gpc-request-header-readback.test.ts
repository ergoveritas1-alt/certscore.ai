import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { chromium, type Browser, type Page, type Request } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime.js";
import { captureGpcOptOutObservation } from "./gpc-opt-out-capture.js";
import { startGpcObservationSession } from "./gpc-observation-session.js";

async function fixtureServer() {
  let receivedSecGpc: string | undefined;
  const server = createServer((request, response) => {
    receivedSecGpc = request.headers["sec-gpc"];
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><body><p>GPC request fixture</p></body></html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}/`, get receivedSecGpc() { return receivedSecGpc; } };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function finishFixture(page: Page, session: Awaited<ReturnType<typeof startGpcObservationSession>>, scanId: string, captureId: string, started: number) {
  session.prepareFinalization();
  const cdp = await page.context().newCDPSession(page);
  const tree = await cdp.send("Page.getFrameTree");
  const loaderId = tree.frameTree.frame.loaderId as string;
  const semantic = await captureGpcOptOutObservation(page, {
    scanId,
    scanStartedAtMs: started,
    monitorKey: session.monitorKey,
    binding: { captureId, documentIdentity: () => ({ source: "cdp_loader_id", token: loaderId }) },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  return session.finish(semantic, { callbacks: 0, dropped: 0, registered: false }, false);
}

test("request header readback recovers Sec-GPC from the same Chromium request", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "11111111-1111-4111-8111-111111111111";
    const session = await startGpcObservationSession({ page, scanId: "header-recovery", captureId, scanStartedAtMs: started });
    let navigationRequest: Request | undefined;
    page.on("request", (request) => { if (request.isNavigationRequest()) navigationRequest = request; });
    await page.goto(fixture.url);
    assert.equal(fixture.receivedSecGpc, "1");
    assert.ok(navigationRequest);
    session.recordRequest({ eventId: "fixture-navigation", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} }, navigationRequest);
    // Simulate the observed API omission while the independent fixture server
    // confirms that Chromium sent GPC. Diagnostics must reveal the discrepancy,
    // without substituting a correlated header into authoritative capture.
    const original = navigationRequest;
    session.recordRequest({ eventId: "fixture-omitted-readback", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} }, {
      allHeaders: async () => ({}), timing: () => original.timing(), method: () => original.method(),
      resourceType: () => original.resourceType(), serviceWorker: () => original.serviceWorker(),
      failure: () => original.failure(), frame: () => original.frame(),
    });
    const packet = await finishFixture(page, session, "header-recovery", captureId, started);
    const row = packet.requests.find((request) => request.eventId === "fixture-navigation");
    assert.equal(row?.secGpc, "1");
    assert.equal(row?.headerSource, "all_headers_readback");
    assert.equal(packet.limitationKeys.includes("request_header_readback_incomplete"), false);
    const diagnostic = packet.requestDiagnostics?.missingHeaders.find(d => d.eventId === "fixture-omitted-readback");
    assert.equal(diagnostic?.cdp?.extraInfoHeader, "1", JSON.stringify(diagnostic));
    assert.equal(packet.requests.find(r => r.eventId === "fixture-omitted-readback")?.secGpc, null);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});

test("absent and explicit zero headers never become an enabled GPC header", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "22222222-2222-4222-8222-222222222222";
    const session = await startGpcObservationSession({ page, scanId: "header-negative", captureId, scanStartedAtMs: started });
    await page.goto(fixture.url);
    session.recordRequest({ eventId: "absent", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} });
    session.recordRequest({ eventId: "zero", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: { secGpc: "0" } });
    const packet = await finishFixture(page, session, "header-negative", captureId, started);
    assert.equal(packet.requests.find((request) => request.eventId === "absent")?.secGpc, null);
    assert.equal(packet.requests.find((request) => request.eventId === "zero")?.secGpc, "0");
    assert.equal(packet.requests.some((request) => request.secGpc === "1"), false);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});

test("a delayed allHeaders readback cannot mutate the frozen post-finish packet", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "33333333-3333-4333-8333-333333333333";
    const session = await startGpcObservationSession({ page, scanId: "header-delayed", captureId, scanStartedAtMs: started });
    await page.goto(fixture.url);
    let release!: (headers: Record<string, string>) => void;
    const delayed = { allHeaders: () => new Promise<Record<string, string>>((resolve) => { release = resolve; }) };
    session.recordRequest({ eventId: "delayed", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} }, delayed);
    const packet = await finishFixture(page, session, "header-delayed", captureId, started);
    const before = JSON.stringify(packet.requests);
    assert.equal(packet.terminal, "incomplete");
    assert.ok(packet.limitationKeys.includes("request_header_readback_incomplete"));
    release({ "sec-gpc": "1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(JSON.stringify(packet.requests), before);
    assert.equal(packet.requests[0]?.secGpc, null);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});

test('GPC supplements inspect actual POST bytes and Cookie headers with one read per candidate',async()=>{
 const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
 try{
  const context=await browser.newContext({extraHTTPHeaders:{'Sec-GPC':'1'}});
  await context.addCookies([{name:'li_sugr',value:'fixture-advertising-id',domain:'px.ads.linkedin.com',path:'/',secure:true,sameSite:'None'}]);
  await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>GPC proof fixture</title><p>Fixture</p>',headers:{'access-control-allow-origin':'https://fixture.test','access-control-allow-credentials':'true'}}));
  const page=await context.newPage(),started=Date.now(),captureId='22222222-2222-4222-8222-222222222222';
  const session=await startGpcObservationSession({page,scanId:'body-proof',captureId,scanStartedAtMs:started});
  let seq=0,headerReads=0;
  page.on('request',r=>{
   const id=String(++seq);
   session.recordRequest({eventId:`e${id}`,requestId:`r${id}`,method:r.method(),timestampMs:Date.now()-started,requestUrl:r.url(),requestHeaders:{secGpc:'1'}},{
    allHeaders:async()=>{headerReads++;const h=await r.allHeaders();return r.url().includes('pid=456')?{...h,'sec-gpc':'0'}:h;},postData:()=>r.postData(),method:()=>r.method(),frame:()=>r.frame(),
   });
  });
  await page.goto('https://fixture.test');
  await page.evaluate(async()=>{
   await fetch('https://px.ads.linkedin.com/wa/?fmt=a',{method:'POST',body:JSON.stringify({signalType:'PAGE_VISIT',hem:'a'.repeat(64)}),credentials:'include'});
   await fetch('https://px.ads.linkedin.com/collect/?pid=123',{credentials:'include'});
   await fetch('https://px.ads.linkedin.com/collect/?pid=456',{credentials:'include'});
  });
  const packet=await finishFixture(page,session,'body-proof',captureId,started);
  assert.equal(packet.requestProofCapture?.inspected,3);
  assert.equal(headerReads,3,'no duplicate reads and no read for snapshot-complete non-candidates');
  assert.ok(packet.requestProofCapture?.rows.find(r=>r.proof.path==='/wa/')?.proof.proof?.identifiers.some(i=>i.field==='hem'&&i.source==='body'));
  assert.ok(packet.requestProofCapture?.rows.find(r=>r.proof.path==='/collect/')?.proof.proof?.identifiers.some(i=>i.source==='cookie_header'));
  assert.equal(JSON.stringify(packet).includes('fixture-advertising-id'),false);
  assert.equal(packet.requests.at(-1)?.secGpc,'0','explicit contradictory same-request readback overrides the snapshot');
  await session.close();await context.close();
 }finally{await browser.close();}
});
