import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { runScan } from "@certscore/scan-core";
import { shareConsentActionBrowser } from "@certscore/scan-core/consent-action-browser";
import { notifyObservedActionLanes, dedicatedConsentLanes, parseLocalV2DagLambdaDispatchPayload, LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, LOCAL_V2_DAG_SCAN_PROCESSOR, LOCAL_V2_DAG_SCANNER_RUNTIME, POST_ACCEPT_WORKER_FEATURE_FLAG, POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG } from "./handler";

test("the ordinary consent scan invokes exactly one blank Lambda per observed action before passive capture finishes", async t => {
  for (const flag of [POST_ACCEPT_WORKER_FEATURE_FLAG, POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG,
    "CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE", "CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
    const prior = process.env[flag];
    process.env[flag] = "1";
    t.after(() => { if (prior === undefined) delete process.env[flag]; else process.env[flag] = prior; });
  }
  const server = createServer((_req, res) => {
    res.writeHead(200, {"Content-Type":"text/html"});
    res.end('<main>Fixture homepage</main><section role="dialog" class="cookie-banner" style="position:fixed;bottom:0;background:white;padding:20px"><p>We use optional cookies for analytics. Choose your cookie preferences.</p><button id="yes">Accept all cookies</button><button id="no">Reject all cookies</button></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = "http://127.0.0.1:" + address.port + "/";
  const browser = await chromium.launch({args:["--disable-background-networking","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
  t.after(() => browser.close());
  const outDir = await mkdtemp(join(tmpdir(), "certscore-choice-preparation-"));
  t.after(() => rm(outDir, {recursive:true,force:true}));
  const bucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "fixture";
  t.after(() => {
    if (bucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = bucket;
  });
  const scanId = "prepared-choices";
  const config = { enabled: true, rolloutMode: "all_eligible", interactionAuthorization: {
    kind: "scan_target_resolution", authorizationId: "sharded_scan_resolved_exact_target.v2", scanId, requestedUrl: url,
  } };
  const parent = parseLocalV2DagLambdaDispatchPayload({
    scanId, targetUrl: url, targetEnvironment: "production", hostname: "127.0.0.1", orchestrationMode: "sharded",
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    scannerRuntime: LOCAL_V2_DAG_SCANNER_RUNTIME, resultPurpose: "synthetic_verification", resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/fixture", awsRegion: "us-west-1", vpcMode: "none",
    artifactOnly: true, productionFindingIntegration: false, callbackCorrelationId: scanId, functionName: "local-fixture",
    postAcceptObservation: {...config, resolver: {kind: "canonical_cmp_registry", recipeSetId: "canonical-consent-control-accept-v6"}},
    postRefusalObservation: {...config, resolver: {kind: "canonical_cmp_registry", recipeSetId: "canonical-consent-control-reject-v23"}},
  });
  const envelopes: { action: string; at: number; id: string }[] = [];
  const signal = AbortSignal.timeout(15000);
  const preparations = dedicatedConsentLanes({
    payload: parent, signalFor: () => signal,
    s3Client: { async send(command) {
      assert.equal(command.input.IfNoneMatch, "*");
      return {ETag: '"pending"', $metadata: {}};
    } },
    lambdaClient: { async send(command) {
      assert.equal(command.constructor.name, "InvokeCommand");
      assert.equal(command.input.InvocationType, "RequestResponse");
      const envelope = JSON.parse(Buffer.from(command.input.Payload!).toString());
      const parsed = parseLocalV2DagLambdaDispatchPayload(envelope);
      assert.ok(parsed.actionPreparation);
      assert.equal(parsed.rejectFirstLayerProof, undefined);
      assert.equal(parsed.acceptFirstLayerProof, undefined);
      assert.equal(parsed.scanId, scanId);
      assert.throws(() => parseLocalV2DagLambdaDispatchPayload({...envelope, workerLane:"consent_proof"}));
      assert.throws(() => parseLocalV2DagLambdaDispatchPayload({...envelope, targetUrl:url + "other"}));
      assert.throws(() => parseLocalV2DagLambdaDispatchPayload({...envelope, contractVersion:parent.contractVersion}));
      envelopes.push({ action: parsed.workerLane!, id: parsed.actionPreparation.id, at: Date.now() });
      throw new Error("transport intercepted locally");
    } },
  });
  const capture = {...parent, workerLane: "consent_proof" as const};
  const passive = shareConsentActionBrowser(Promise.resolve(browser));
  const bundle = await runScan({url,scanId,profile:"standard",outDir,evidenceLane:"consent_proof",
    preConsentModuleDeadlineMs:15000,preConsentScreenshotMode:"always",browserReuseMode:"per_module",
    borrowedConsentBrowser:browser,openBorrowedConsentContext:passive.openPassiveContext,
    onFirstLayerObservation(observation) {
      notifyObservedActionLanes({ onObservedAction: preparations.observe }, capture, observation);
    },
  });
  const passiveCompletedAt = Date.now();
  assert.equal(bundle.scanId,scanId);
  assert.deepEqual(envelopes.map(row => row.action).sort(), ["accept_observation","reject_observation"]);
  assert.equal(new Set(envelopes.map(row => row.id)).size, 2);
  for (const {at} of envelopes) assert.ok(at <= passiveCompletedAt);
  for (const action of ["accept","reject"] as const) {
    const lane = preparations.decide(action);
    assert.ok(lane);
    await assert.rejects(lane.result, /transport intercepted locally/);
    preparations.observe(action);
  }
  assert.equal(envelopes.length, 2);
  t.diagnostic(JSON.stringify({dispatchBeforePassiveCompletionMs: envelopes.map(row => ({
    action: row.action, ms: passiveCompletedAt - row.at,
  }))}));
});

test("full DOM inventory preserves distinct same-document button-role links for the two first-layer choices", async t => {
  for (const flag of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE","CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
    const prior = process.env[flag];
    process.env[flag] = "1";
    t.after(() => { if (prior === undefined) delete process.env[flag]; else process.env[flag] = prior; });
  }
  const browser = await chromium.launch({args:["--disable-background-networking","--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", route => route.request().url() === "https://fixture.invalid/"
    ? route.fulfill({contentType:"text/html",body:'<section role="dialog" class="cookie-banner" style="position:fixed;bottom:0;padding:20px"><p>We use optional cookies for analytics. Choose your cookie preferences.</p><div class="fs-cc-banner_buttons-wrapper"><a role="button" href="#">Deny</a> <a role="button" href="#">Accept</a></div></section>'})
    : route.abort());
  await page.goto("https://fixture.invalid/");
  const {readConsentUiObservation} = await import("../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner");
  const read = () => readConsentUiObservation(page,Date.now(),{allowFullDocumentCmpControls:true});
  const observed = await read();
  for (const [action,label] of [["accept_all","Accept"],["reject_all","Deny"]]) {
    const control = observed.controls.find(row => row.actionType === action);
    assert.ok(control?.selectorHint);
    assert.equal(control.linkDestination,"same_document");
    const locator = page.locator(control.selectorHint);
    assert.equal(await locator.count(),1);
    assert.equal(await locator.textContent(),label);
  }
  await page.getByRole("button",{name:"Deny"}).evaluate(element => element.setAttribute("href","/account"));
  const {capturePassiveConsentControlGeometry} = await import("../../../packages/certscore-scan-core/src/consent-control-geometry");
  const geometry = await capturePassiveConsentControlGeometry(page,{timeoutMs:1500});
  assert.ok(geometry.candidates.some(row => row.label === "Deny" && row.linkDestination === "other_document"));
  assert.ok(!geometry.candidates.some(row => row.exactNativeRejectSelectorVerified));
});
