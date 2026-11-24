import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvokeWithResponseStreamCommandOutput } from "@aws-sdk/client-lambda";
import { readConsentEvidenceWorkerStream } from "./consent-evidence-stream.js";

const receipt = { scanId: "fixture", bundle:{sha256:"synthetic"},geometry:{sha256:"synthetic"} };
const result = {scanId:"fixture",status:"completed"};
const readyFrame = JSON.stringify({kind:"ready",receipt})+"\n";
const finalFrame = JSON.stringify({kind:"result",result})+"\n";
const bytes = (s:string) => ({ PayloadChunk:{Payload:Buffer.from(s)} });
const ok = {InvokeComplete:{}};

function response(EventStream:NonNullable<InvokeWithResponseStreamCommandOutput["EventStream"]>): InvokeWithResponseStreamCommandOutput {
  return { StatusCode:200, $metadata:{}, EventStream };
}

test("a split notice is delivered while the terminal consent result is still blocked", async () => {
  let unfreeze!:()=>void;
  const frozen = new Promise<void>(resolve=>{unfreeze=resolve});
  let notice!:()=>void;
  const delivered = new Promise<void>(resolve=>{notice=resolve});
  let finished = false;
  const work = readConsentEvidenceWorkerStream(response((async function*() {
    yield bytes(readyFrame.slice(0,37));
    yield bytes(readyFrame.slice(37));
    await frozen;
    yield bytes(finalFrame);
    yield ok;
  })()), value => {assert.deepEqual(value,receipt);notice()}).then(value=>{
    finished=true;return JSON.parse(value.toString("utf8"));
  });
  await delivered;
  assert.equal(finished,false);
  unfreeze();
  assert.deepEqual(await work,result);
});

test("missing notices preserve terminal result; invalid, failed and duplicate streams are rejected", async () => {
  const consume = (...frames:AsyncIterableItem[]) => readConsentEvidenceWorkerStream(response((async function*() {
    yield* frames;
  })()),()=>undefined);
  assert.deepEqual(JSON.parse((await consume(bytes(finalFrame),ok)).toString("utf8")),result);
  await assert.rejects(consume(bytes(readyFrame+readyFrame+finalFrame),ok),/Unexpected/);
  await assert.rejects(consume(bytes(finalFrame)),/terminal result/);
  await assert.rejects(consume(bytes(finalFrame),{InvokeComplete:{ErrorCode:"Unhandled"}}),/stream failed/);
  await assert.rejects(consume(bytes("x".repeat(524_289)),ok),/byte limit/);
});

type AsyncIterableItem = NonNullable<InvokeWithResponseStreamCommandOutput["EventStream"]> extends AsyncIterable<infer E> ? E : never;
