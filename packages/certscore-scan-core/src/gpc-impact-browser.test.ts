import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runScan } from "./index";
import { buildGpcImpactAssessment } from "./gpc-impact-assessment";
import { assessGpcCohortRow } from "./gpc-impact-cohort";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { buildLocalV2DagLambdaLaneRun } from "../../../apps/v2-dag-lambda/src/handler";
import { readOriginalGpcCookieReadBinding } from "./gpc-cookie-read-binding";
import { chromium } from "playwright";

for (const scenario of ["ready", "late_cmp", "slow_inventory"]) {
const lateCmp = scenario === "late_cmp", slowInventory = scenario === "slow_inventory";
test(slowInventory ? "the sole later read includes activity during already-required slow inventory within the five-second cap" : lateCmp
  ? "existing terminal checkpoint captures a CMP that becomes ready during the owed cookie read"
  : "existing baseline and GPC browsers retain comparable windows on a continuously busy page", async t => {
  const cookieReads = { runtime_evidence: 0, gpc_observation: 0 };
  let activeLane: keyof typeof cookieReads = "runtime_evidence";
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", async (...args: Parameters<typeof chromium.launch>) => {
    const browser = await launch(...args), createContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await createContext(options), cookies = context.cookies.bind(context), lane = activeLane;
      context.cookies = async (...cookieArgs) => {
        cookieReads[lane]++;
        const result = await cookies(...cookieArgs);
        if (lateCmp && cookieReads[lane] === (lane === "runtime_evidence" ? 2 : 1)) {
          await context.pages()[0]!.evaluate(() => { (window as any).__fixtureCmpReady = true; });
        }
        return result;
      };
      if (slowInventory) {
        const createPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await createPage(), evaluate = page.evaluate.bind(page);
          let delayed = false;
          page.evaluate = (async (fn: any, argument: any) => {
            if (!delayed && argument?.maxFieldCandidates && argument?.workPolicyVersion) {
              delayed = true;
              // Model slow existing inventory, not a production settle/wait.
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            return evaluate(fn, argument);
          }) as typeof page.evaluate;
          return page;
        };
      }
      return context;
    };
    return browser;
  });
  const server = createServer((req, res) => {
    if (req.url === '/hanging') return;
    if (req.url !== '/') { res.end('observed'); return; }
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><html><head><title>Product documentation</title></head><body><h1>Product documentation</h1><p>${'Information about products, services, and public support. '.repeat(40)}</p><script>
      history.replaceState(null, '', location.href);
      fetch('/hanging'); setTimeout(()=>{ if(navigator.globalPrivacyControl!==true) fetch('/baseline-only'); },300);
      if (${slowInventory}) setTimeout(()=>{if(navigator.globalPrivacyControl!==true)fetch('/baseline-only-late');},4000);
      window.__gpp=(command,callback)=>{const enabled=navigator.globalPrivacyControl===true;
        const ready=${!lateCmp}||window.__fixtureCmpReady===true;
        const ping={gppVersion:'1.1',cmpStatus:ready?'loaded':'loading',signalStatus:ready?'ready':'not ready',applicableSections:[8],sectionList:[8],
          parsedSections:{usca:[{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:enabled?1:2,SharingOptOut:enabled?1:2},{GpcSegmentType:1,Gpc:enabled}]}};
        if(command==='ping')callback(ping,true);
        if(command==='addEventListener')callback({eventName:'listenerRegistered',data:true,listenerId:1,pingData:ping},true);
      };
    </script></body></html>`);
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const out = await mkdtemp(path.join(tmpdir(),'gpc-impact-'));
  try {
    const url = `http://127.0.0.1:${(server.address() as {port:number}).port}/`;
    const sources=[];
    const capturedHorizons: number[] = [];
    for (const lane of ['runtime_evidence','gpc_observation'] as const) {
      activeLane = lane;
      const outDir = path.join(out,lane);
      const bundle = await runScan({scanId:'busy-pair',url,outDir,evidenceLane:lane,profile:'standard',scenarioResourceMode:'lean',retainGpcObservation:lane==='gpc_observation',preConsentScreenshotMode:'never',formSnapshotReviewer:lane==='runtime_evidence'?async()=>({safeForDisplay:true}):undefined});
      assert.ok(bundle.gpcImpactCapture, lane);
      if (lane === 'runtime_evidence') {
        assert.equal(bundle.collectionSurfaceInventory?.coverage.status, 'limited');
        assert.ok(bundle.collectionSurfaceInventory?.coverage.reasonCodes.includes('document_settle_incomplete'));
      }
      assert.equal(bundle.gpcImpactCapture.expectedEnabled,lane==='gpc_observation');
      const horizon = bundle.gpcImpactCapture.windows.at(-1)?.durationMs;
      assert.ok(horizon === 3000 || horizon === 5000, JSON.stringify(bundle.gpcImpactCapture));
      if (slowInventory) assert.equal(horizon, 5000, "existing five-second cap reached during owed inventory work");
      capturedHorizons.push(horizon);
      const timings = bundle.modulesRun.find(m => m.moduleName === "preConsentRuntimeScanner")!.timingBreakdown!;
      const inventory = timings.find(row => row.label === "page evidence capture")!;
      const signal = timings.filter(row => row.label === "GPC signal readback");
      assert.equal(signal.length, 1, "exactly one navigator read per lane");
      assert.ok(timings.indexOf(signal[0]!) > timings.indexOf(inventory), "signal read follows already-required inventory");
      if (!slowInventory) assert.ok(Buffer.byteLength(JSON.stringify(bundle.gpcImpactCapture))<2048);
      const {requestLedger, ...captureMetadata} = bundle.gpcImpactCapture;
      assert.ok(Buffer.byteLength(JSON.stringify(captureMetadata)) < 2048);
      assert.ok((requestLedger?.rows.length ?? 0) <= 1000);
      assert.ok(Buffer.byteLength(JSON.stringify(requestLedger?.rows ?? [])) <= 64 * 1024);
      const retained = JSON.parse(await readFile(path.join(outDir,'CanonicalEvidenceBundle.json'),'utf8'));
      // Production workers add the lane envelope after runScan; use that same
      // envelope builder here rather than treating a bare local run as a worker.
      assert.ok(bundle.region);
      retained.scanLaneRuns = [buildLocalV2DagLambdaLaneRun({bundle,workerLane:lane,region:bundle.region,physicalInvocationId:`fixture-${lane}`})];
      const bytes = Buffer.from(JSON.stringify(retained));
      const source = {bytes,pointer:{uri:path.join(outDir,'CanonicalEvidenceBundle.json'),sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}};
      sources.push(source);
      assert.equal(cookieReads[lane], lane === "runtime_evidence" ? 2 : 1, "existing baseline preview/final reads and the single GPC final read are unchanged");
      if(lane==='gpc_observation') {
        assert.equal(buildGpcProductionObservation({scanId:'busy-pair',source}).status,'complete');
        assert.equal(retained.gpcObservationSession.mainDocument.committedAtMs, retained.gpcImpactCapture.document.committedAtMs);
        const snapshot = retained.cookieSnapshots[0];
        assert.ok(snapshot?.gpcReadBinding, "future original GPC bytes retain the existing read's binding");
        assert.equal(snapshot.captureCoverage, undefined, "baseline-only eligibility is unchanged");
        assert.deepEqual(readOriginalGpcCookieReadBinding(retained, snapshot), snapshot.gpcReadBinding);
        console.log("GPC_WORKER_BINDING_FIXTURE", JSON.stringify({ cookieReads: cookieReads[lane],
          bindingBytes: Buffer.byteLength(JSON.stringify(snapshot.gpcReadBinding)),
          commitTimesExactlyEqual: true, cookieReadDurationMs: snapshot.gpcReadBinding.completedAtMs - snapshot.gpcReadBinding.startedAtMs }));
      } else {
        assert.ok(retained.cookieSnapshots[0]?.captureCoverage);
        assert.equal(retained.cookieSnapshots[0]?.gpcReadBinding, undefined);
      }
    }
    const impact=buildGpcImpactAssessment({scanId:'busy-pair',baseline:sources[0],gpc:sources[1]});
    assert.equal(impact.status,'measured',JSON.stringify(impact));
    assert.equal(impact.durationMs,Math.min(...capturedHorizons), "the comparison uses the longest fully retained common window");
    assert.equal(impact.requestAttempts!.baseline-impact.requestAttempts!.gpc,slowInventory ? 2 : 1,'actual baseline-only request is measured in the common window');
    assert.equal(impact.scoreEffect,'none');
    assert.equal(impact.cmpRecordedState.baselineState,'captured');
    assert.equal(impact.cmpComparison?.comparable,true,JSON.stringify(impact.cmpComparison));
    assert.equal(impact.cmpComparison?.saleChange,'opt_out_appeared');
    assert.equal(impact.cmpComparison?.sharingChange,'opt_out_appeared');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(out,{recursive:true,force:true});
  }
});

}

test("the GPC worker retains a OneTrust cookie receipt on a page without GPP", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "gpc-receipt-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = path.join(dir, "key.pem"), cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
    "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  const server = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.headers["sec-gpc"] === "1") {
      res.setHeader("Set-Cookie", "OptanonConsent=version=202303.1.0&browserGpcFlag=1&isGpcEnabled=1&consentId=PRIVATE_ID; Secure; Path=/");
    }
    res.end(`<html lang="en"><head><title>Local product documentation</title></head><body><main><h1>Product documentation</h1><p>${"Public product and service details. ".repeat(40)}</p></main></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `https://127.0.0.1:${(server.address() as { port: number }).port}/`;
  let cookieReads = 0;
  const launch = chromium.launch.bind(chromium);
  t.mock.method(chromium, "launch", async (...args: Parameters<typeof chromium.launch>) => {
    const browser = await launch(...args), newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext({ ...options, serviceWorkers: "block" });
      await context.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin ? route.fallback() : route.abort());
      const cookies = context.cookies.bind(context);
      context.cookies = async (...cookieArgs) => { cookieReads++; return cookies(...cookieArgs); };
      return context;
    };
    return browser;
  });

  const scanId = "onetrust-no-gpp", outDir = path.join(dir, "scan"), workerLane = "gpc_observation";
  const bundle = await runScan({ scanId, url, outDir, evidenceLane: workerLane, profile: "standard", scenarioResourceMode: "lean",
    retainGpcObservation: true, preConsentScreenshotMode: "never" });
  assert.ok(bundle.region);
  const retained = JSON.parse(await readFile(path.join(outDir, "CanonicalEvidenceBundle.json"), "utf8"));
  retained.scanLaneRuns = [buildLocalV2DagLambdaLaneRun({ bundle, workerLane, region: bundle.region, physicalInvocationId: "fixture-onetrust" })];
  const bytes = Buffer.from(JSON.stringify(retained));
  const gpc = { bytes, pointer: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length } };
  const audit = assessGpcCohortRow({ scanId, required: true, gpc });
  assert.equal(cookieReads, 1, JSON.stringify(bundle.modulesRun.map(module => module.errors)));
  assert.equal(audit.observation.semanticProbe, "unavailable");
  assert.equal(audit.observation.registration.cmpGpcSignal, "unknown");
  assert.deepEqual(audit.pairedStorageMetadata.gpc.oneTrustGpcReceipt, { sdkVersion: "202303.1.0", browserGpcFlag: true, gpcCategoryFlag: true });
  assert.doesNotMatch(bytes.toString(), /PRIVATE_ID|consentId=|isGpcEnabled=/);
});
