import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { buildPostActionObservationDispatchConfigs } from "@certscore/contracts";
import type { AcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import type { RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import {
  dedicatedConsentLanes, handler, notifyObservedActionLanes, parseLocalV2DagLambdaDispatchPayload,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, LOCAL_V2_DAG_SCAN_PROCESSOR, LOCAL_V2_DAG_SCANNER_RUNTIME,
  POST_ACCEPT_WORKER_FEATURE_FLAG, POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG, postRefusalParentDispatchSha256,
} from "./handler";
import { CONSENT_CLICK_CHECKPOINT_FILES, verifyConsentClickCheckpoint } from "./reject-click-checkpoint";

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const url = "https://93.184.215.14/";
const actions = ["accept", "reject"] as const;

test("California action workers use the real prepared dispatch, release store and retained receipt path", { timeout: 65_000 }, async t => {
  for (const [name, value] of Object.entries({
    [POST_ACCEPT_WORKER_FEATURE_FLAG]: "1",
    [POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]: "1",
    CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE: "1",
    CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE: "1",
    CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE: "true",
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET: "fixture-artifacts",
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX: "fixtures",
    CERTSCORE_EARLY_CONSENT_NAVIGATION_ENABLED: undefined,
  })) {
    const prior = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior; });
  }
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "certscore-early-handler-"));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));

  for (const mode of ["flag_off", "flag_on", "blocked", "other_region", "registered_flag_off", "registered_flag_on"] as const) await t.test(mode, async sub => {
    const registered = mode === "registered_flag_off" || mode === "registered_flag_on";
    if (mode === "flag_off" || mode === "registered_flag_off") delete process.env.CERTSCORE_EARLY_CONSENT_NAVIGATION_ENABLED;
    else process.env.CERTSCORE_EARLY_CONSENT_NAVIGATION_ENABLED = "1";
    const expectedEarly = mode === "flag_on" || mode === "blocked" || mode === "registered_flag_on";
    const scanId = randomUUID();
    const region = mode === "other_region" ? "eu-west-1" : "us-west-1";
    const auth = { kind: "scan_target_resolution", authorizationId: "sharded_scan_resolved_exact_target.v2",
      scanId, requestedUrl: url, maxRedirects: 1, resolutionTimeoutMs: 750 };
    const config = { enabled: true, rolloutMode: "all_eligible", interactionAuthorization: auth,
      actionSearchTimeoutMs: 5_000, confirmationTimeoutMs: 500, observationWindowMs: 100 };
    const productionReject = buildPostActionObservationDispatchConfigs({
      scanId, targetUrl: url, intent: {
        orchestrationMode: "sharded", postRefusalRejectWorkerEnabled: true, postRefusalRejectWorkerRolloutMode: "all_eligible",
      },
    }).postRefusalObservation!;
    const payload = parseLocalV2DagLambdaDispatchPayload({
      artifactOnly: true, awsRegion: region, callbackCorrelationId: scanId, scanId, targetEnvironment: "production",
      contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, functionName: "offline-fixture",
      hostname: new URL(url).hostname, targetUrl: url, localCallbackUrl: null, orchestrationMode: "sharded",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR, productionFindingIntegration: false, profile: "tiny",
      resultHandoff: "sqs", resultPurpose: "persisted_scan", scannerRuntime: LOCAL_V2_DAG_SCANNER_RUNTIME,
      resultQueueUrl: `https://sqs.${region}.amazonaws.com/123/fixture`, vpcMode: "none",
      postAcceptObservation: { ...config, resolver: { kind: "canonical_cmp_registry", recipeSetId: "canonical-consent-control-accept-v6" } },
      postRefusalObservation: registered ? productionReject :
        { ...config, resolver: { kind: "canonical_cmp_registry", recipeSetId: "canonical-consent-control-reject-v23" } },
    });
    const parentDispatchSha256 = postRefusalParentDispatchSha256(payload);
    const rejectLabel = registered ? "Accept essential cookies" : "Reject all";
    const borlabsState = registered ? `
      let grants = { essential: false, analytics: false };
      window.borlabsCookieConfig = { settings: { dialogShowDialog: true }, services: {
        essential: { id: "essential", serviceGroupId: "essential" }, analytics: { id: "analytics", serviceGroupId: "statistics" },
      } };
      window.BorlabsCookie = { Consents: { hasConsent: id => grants[id] } };
      document.querySelector("section").addEventListener("click", event => {
        if (!event.isTrusted) return;
        grants = { essential: true, analytics: event.target.id === "accept" };
        dispatchEvent(new Event("borlabs-cookie-consent-saved"));
        document.querySelector("section").hidden = true;
      });` : "";
    const fixtureHtml = `<!doctype html>
      <section ${registered ? 'id="BorlabsCookieBox" class="brlbs-cmpnt-dialog brlbs-cmpnt-dialog-box-entrance"' : 'class="cookie-banner"'}
        role="dialog" aria-label="Cookie consent"><p>Choose whether to allow optional cookies.</p>
        <button id="accept" class="brlbs-btn-accept-all">Accept all</button>
        <button id="reject" class="brlbs-btn-accept-only-essential">${rejectLabel}</button>
      </section>
      <script>
        document.querySelector("section").addEventListener("click", event => {
          if (event.isTrusted) fetch("/clicked/" + event.target.id);
        });
        ${borlabsState}
      </script>`;
    const visits: number[] = [];
    const clicks: string[] = [];
    let browserCount = 0;
    const launch = chromium.launch.bind(chromium);
    sub.mock.method(chromium, "launch", async () => {
      browserCount++;
      const browser = await launch({ args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
      sub.after(() => browser.close());
      const openContext = browser.newContext.bind(browser);
      sub.mock.method(browser, "newContext", async (...args: Parameters<typeof openContext>) => {
        const context = await openContext({ ...args[0], serviceWorkers: "block" });
        await context.route("**/*", async route => {
          const request = route.request().url();
          if (request === url) {
            visits.push(performance.now());
            return route.fulfill({ contentType: "text/html", body: fixtureHtml });
          }
          if (request === url + "clicked/accept" || request === url + "clicked/reject") {
            clicks.push(new URL(request).pathname.split("/").at(-1)!);
            return route.fulfill({ status: 204 });
          }
          return route.abort();
        });
        return context;
      });
      return browser;
    });

    type WorkerOptions = NonNullable<Parameters<typeof handler>[1]>;
    const objects = new Map<string, { bytes: Buffer; etag: string; sha256?: string }>();
    const s3Client: NonNullable<WorkerOptions["s3Client"]> = { async send({ input }, options) {
      options?.abortSignal?.throwIfAborted();
      const key = input.Key!;
      const current = objects.get(key);
      if ((input.IfNoneMatch === "*" && current) || (input.IfMatch && input.IfMatch !== current?.etag)) {
        throw Object.assign(new Error("Conditional fixture write failed"), { name: "PreconditionFailed" });
      }
      assert.ok(Buffer.isBuffer(input.Body) || typeof input.Body === "string");
      const bytes = Buffer.from(input.Body);
      const etag = `"${sha(bytes)}"`;
      objects.set(key, { bytes, etag, sha256: input.Metadata?.sha256 });
      return { ETag: etag, $metadata: {} };
    } };
    const s3GetClient: NonNullable<WorkerOptions["s3GetClient"]> = { async send({ input }, options) {
      options?.abortSignal?.throwIfAborted();
      const row = objects.get(input.Key!);
      assert.ok(row);
      return { ETag: row.etag, ContentLength: row.bytes.length, ContentRange: `bytes 0-${row.bytes.length - 1}/${row.bytes.length}`,
        Metadata: row.sha256 ? { sha256: row.sha256 } : {},
        Body: { transformToByteArray: async () => row.bytes } as never, $metadata: {} };
    } };
    const invocations: string[] = [];
    const rejectNotices: Parameters<NonNullable<WorkerOptions["onRejectPacketReady"]>>[0][] = [];
    const preparations = dedicatedConsentLanes({
      payload, signalFor: () => AbortSignal.timeout(16_000), deadlineAtMs: Date.now() + 15_000, s3Client, s3GetClient,
      lambdaClient: { async send(command, options) {
        const dispatch = JSON.parse(Buffer.from(command.input.Payload!).toString("utf8"));
        invocations.push(dispatch.workerLane);
        assert.ok(dispatch.actionPreparation);
        assert.equal(dispatch.acceptFirstLayerProof ?? dispatch.rejectFirstLayerProof, undefined);
        const result = await handler(dispatch, { s3Client, s3GetClient, workspaceRoot, callerSignal: options?.abortSignal,
          onRejectPacketReady: notice => { rejectNotices.push(notice); },
        });
        return { StatusCode: 200, Payload: Buffer.from(JSON.stringify(result)) };
      } },
    });
    const hint = { layerInspected: "first_layer", captureStatus: "observed",
      controls: actions.map(action => ({ actionType: `${action}_all`, visible: true })) } as Parameters<typeof notifyObservedActionLanes>[2];
    const consentWorker = { ...payload, workerLane: "consent_proof" as const };
    notifyObservedActionLanes({ onObservedAction: preparations.observe }, consentWorker, hint);
    notifyObservedActionLanes({ onObservedAction: preparations.observe }, consentWorker, hint);

    await testWait(() => [...objects].filter(([key, row]) => key.includes("/preparation/") &&
      JSON.parse(row.bytes.toString()).state === "ready").length === 2);
    if (expectedEarly) await testWait(() => visits.length === 2);
    assert.equal(visits.length, expectedEarly ? 2 : 0);
    assert.deepEqual(clicks, []);
    const lanes = actions.map(action => preparations.decide(action)!);

    if (mode === "blocked") {
      await Promise.all(lanes.map(lane => lane.decline()));
      await Promise.all(lanes.map(lane => assert.rejects(lane.result, /action_release_unavailable/)));
      assert.deepEqual(clicks, []);
      assert.equal([...objects.keys()].some(key => key.endsWith("ClickCheckpoint.json")), false);
    } else {
      const releaseStartedAt = performance.now();
      const issuedAtMs = Date.now();
      const scope = { scanId, issuedAtMs, expiresAtMs: issuedAtMs + 6_000 };
      const hashes = { parentDispatchSha256, sourceSha256: sha("source"), geometrySha256: sha("geometry"),
        requestedTargetSha256: sha(url), documentSha256: sha(url) };
      const accept: AcceptFirstLayerProof = { ...scope, ...hashes, version: "certscore.accept-first-layer-proof.v1",
        selectorSha256: sha("#accept"), labelSha256: sha("Accept all"), exactSelector: "#accept" };
      const reject: RejectFirstLayerProof = { ...scope, exactSelector: "#reject", outcome: "qualified",
        binding: { ...hashes, documentTokenSha256: sha("loader"), selectorSha256: sha("#reject"),
          labelSha256: sha(rejectLabel), selectorEvidence: "verified_geometry", labelMatch: "exact" } };
      let releasedAccept = accept;
      let releasedReject = reject;
      assert.deepEqual(await Promise.all([
        lanes[0]!.release(accept, () => scope.expiresAtMs, proof => { releasedAccept = proof; }),
        lanes[1]!.release(reject, () => scope.expiresAtMs, proof => { releasedReject = proof; }),
      ]), [true, true]);
      for (const binding of [{ action: "accept", proof: releasedAccept }, { action: "reject", proof: releasedReject }] as const) {
        const key = `fixtures/${scanId}/lanes/${binding.action}_observation/${CONSENT_CLICK_CHECKPOINT_FILES[binding.action]}`;
        await testWait(() => objects.has(key));
        const receipt = objects.get(key);
        assert.ok(receipt, `Missing ${binding.action} receipt`);
        const verified = verifyConsentClickCheckpoint({ body: receipt.bytes, metadataSha256: receipt.sha256, binding,
          coordinatorDispatchAtMs: binding.proof.issuedAtMs, verifiedAtMs: Date.now(), deadlineAtMs: binding.proof.expiresAtMs });
        assert.ok(verified);
        const reserveMs = binding.proof.expiresAtMs - verified.completedAtMs;
        assert.ok(reserveMs >= 200);
        sub.diagnostic(JSON.stringify({ mode, action: binding.action, reserveMs }));
      }
      assert.deepEqual((await Promise.all(lanes.map(lane => lane.result))).map(result => result.status), ["completed", "completed"]);
      assert.deepEqual([...clicks].sort(), actions);
      if (registered) {
        const key = `fixtures/${scanId}/lanes/reject_observation/PostRefusalEvidencePacket.json`;
        const retained = objects.get(key);
        assert.ok(retained);
        const packet = JSON.parse(retained.bytes.toString());
        assert.equal(packet.refusalRegistration.status, "confirmed");
        assert.equal(packet.timing.observationExitReason, "window_elapsed");
        assert.ok(packet.timing.observationMs >= productionReject.observationWindowMs);
        assert.deepEqual(rejectNotices, [{ scanId, parentDispatchSha256, packet: {
          uri: `s3://fixture-artifacts/${key}`, sha256: sha(retained.bytes), sizeBytes: retained.bytes.length,
        } }]);
        sub.diagnostic(JSON.stringify({ mode, rejectRegistration: packet.refusalRegistration.status,
          observationMs: packet.timing.observationMs, matchingPacketNotices: rejectNotices.length }));
      } else {
        assert.deepEqual(rejectNotices, []);
      }
      for (const visit of visits) assert.equal(visit < releaseStartedAt, expectedEarly);
    }
    assert.equal(browserCount, 2);
    assert.deepEqual(invocations.sort(), ["accept_observation", "reject_observation"]);
  });
});

async function testWait(ready: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 15));
  assert.ok(ready(), "Timed out waiting for fixture workers");
}
