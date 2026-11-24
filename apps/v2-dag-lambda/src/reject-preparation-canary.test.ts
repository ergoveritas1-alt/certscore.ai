import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Readable } from "node:stream";
import { SQSClient } from "@aws-sdk/client-sqs";
import type { RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { prepareRejectProofSender, readRejectPreparationRelease, rejectPreparationCanaryEnabled, withPreparedRejectBrowser } from "./reject-preparation-canary.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const targetUrl = "https://www.ergoveritas.com/testar-recovery-20261123-delayed-banner.html";
const binding = { targetUrl, scanId: "isolated-scan", parentDispatchSha256: sha("parent"), preparationId:"0".repeat(32) };
const makeProof = (now: number): RejectFirstLayerProof => ({
  scanId:binding.scanId, outcome:"qualified", issuedAtMs:now, expiresAtMs:now+6000, exactSelector:"#declineButton",
  binding:{
    parentDispatchSha256:binding.parentDispatchSha256, sourceSha256:sha("source"),geometrySha256:sha("geometry"),
    requestedTargetSha256:sha(targetUrl),documentSha256:sha(targetUrl),documentTokenSha256:sha("CDP loader"),
    selectorSha256:sha("#declineButton"),selectorEvidence:"verified_geometry",labelSha256:sha("Decline all"),labelMatch:"exact",
  },
});
const envelope = (proof: RejectFirstLayerProof) => JSON.stringify({
  version:"certscore.reject-preparation-release.v1",preparationId:binding.preparationId,proof,
});

test("only the immutable isolated synthetic scan on an exact owned fixture can prepare a browser", () => {
  const name = "certscore-v2-dag-local-ar-canary-20261123";
  const env = {AWS_LAMBDA_FUNCTION_NAME:name,AWS_LAMBDA_FUNCTION_VERSION:"6",CERTSCORE_REJECT_PREPARATION_CANARY_ENABLED:"1"};
  const payload = {targetUrl,functionName:name+":6",awsRegion:"eu-central-1",resultPurpose:"synthetic_verification",targetEnvironment:"production",
    postRefusalObservation:{enabled:true,interactionAuthorization:{kind:"owned_canary",authorizationId:"ergoveritas_owned_post_refusal_canary.v1"}}};
  assert.ok(rejectPreparationCanaryEnabled(payload,env));
  assert.equal(rejectPreparationCanaryEnabled(payload,{}),false);
  for (const changed of [{targetUrl:targetUrl+"?x=1"},{functionName:name+":5"},{awsRegion:"us-west-1"},
    {targetUrl:targetUrl.replace("www.","")},{resultPurpose:"persisted_scan"}]) {
    assert.equal(rejectPreparationCanaryEnabled({...payload,...changed},env),false);
  }
});

test("a private release binds the preparation nonce, scan, expiry, exact URL and original parent", () => {
  const proof = makeProof(1000);
  const body = envelope(proof);
  assert.deepEqual(readRejectPreparationRelease(body,binding,1100),proof);
  assert.equal(readRejectPreparationRelease(body,binding,7000),undefined);
  assert.equal(readRejectPreparationRelease(body,binding,999),undefined);
  assert.equal(readRejectPreparationRelease(body,{...binding,preparationId:"1".repeat(32)},1100),undefined);
  assert.equal(readRejectPreparationRelease(body,{...binding,scanId:"other"},1100),undefined);
  assert.equal(readRejectPreparationRelease(body,{...binding,targetUrl:targetUrl+"?x=1"},1100),undefined);
  assert.equal(readRejectPreparationRelease(body,{...binding,parentDispatchSha256:sha("other")},1100),undefined);
  assert.equal(readRejectPreparationRelease(undefined,binding,1100),undefined);
});

test("browser setup overlaps the release wait and keeps all navigation downstream of valid proof", async () => {
  let release!: (proof:RejectFirstLayerProof) => void;
  let markReady!: () => void;
  const blankReady = new Promise<void>(resolve => { markReady = resolve; });
  const events:string[] = [];
  const browser={contexts:() => [],close:async () => {events.push("closed")}};
  const proof = makeProof(Date.now());
  const result = withPreparedRejectBrowser({
    launch:async () => {events.push("prepared blank"); return browser;},
    takeProof:() => new Promise(resolve => {release=resolve}),
    run:async (opened, gate) => {
      assert.equal(opened,browser);
      events.push("page setup");
      markReady();
      assert.equal(await gate.waitForProof(),proof);
      events.push("observer permitted");
      return 42;
    },
  });
  await blankReady;
  assert.deepEqual(events,["prepared blank","page setup"]);
  release(proof);
  assert.equal(await result,42);
  assert.deepEqual(events,["prepared blank","page setup","observer permitted","closed"]);
});

test("a missing or expired proof or a non-blank process closes the browser before any observer runs", async () => {
  for (const scenario of ["missing","expired","non-blank"] as const) {
    let closed=0;
    await assert.rejects(withPreparedRejectBrowser({
      launch:async () => ({contexts:() => scenario==="non-blank" ? [1] : [],close:async () => {closed++}}),
      takeProof:async () => {
        if (scenario==="missing") throw new Error("no proof");
        return makeProof(Date.now()-(scenario==="expired" ? 10000 : 0));
      },
      run:async (_browser, gate) => {
        assert.notEqual(scenario,"non-blank");
        await gate.waitForProof();
        assert.fail("an unverified page cannot navigate");
      },
    }));
    assert.equal(closed,1);
  }
});


test("preparing the sender resolves credentials without sending a queue request", async () => {
  let credentialReads = 0;
  const messages: unknown[] = [];
  const client = new SQSClient({
    region: "eu-central-1", maxAttempts: 1,
    credentials: async () => {
      credentialReads++;
      return { accessKeyId: "fixture-key", secretAccessKey: "fixture-secret" };
    },
    requestHandler: {
      async handle(request) {
        const input = JSON.parse(String(request.body));
        messages.push(input);
        return { response: {
          statusCode: 200, headers: { "content-type": "application/x-amz-json-1.0" },
          body: Readable.from([Buffer.from(JSON.stringify({
            MessageId: "queue-fixture-ack",
            MD5OfMessageBody: createHash("md5").update(input.MessageBody).digest("hex"),
          }))]),
        } };
      },
    },
  });
  const release = prepareRejectProofSender(client);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(credentialReads, 1);
  assert.equal(messages.length, 0);

  const proof = makeProof(Date.now());
  const signal = new AbortController().signal;
  await assert.rejects(release({ ...binding, scanId: "other" }, proof, signal), /release_unverified/);
  await assert.rejects(release(binding, makeProof(Date.now() - 7000), signal), /release_unverified/);
  await assert.rejects(release(binding, proof, AbortSignal.abort()), { name: "AbortError" });
  assert.equal(messages.length, 0);

  await release(binding, proof, signal);
  assert.equal(messages.length, 1);
  assert.equal(credentialReads, 1);
  assert.deepEqual(messages[0], {
    QueueUrl: "https://sqs.eu-central-1.amazonaws.com/199536052647/certscore-v2-dag-local-ar-prep-20261123",
    MessageBody: envelope(proof),
  });
});
