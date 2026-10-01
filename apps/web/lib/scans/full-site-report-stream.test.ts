import assert from "node:assert/strict";
import test from "node:test";
import { readFullSiteReportStream } from "./full-site-report-stream";
import type { FullSiteReportOverview } from "../../server/scans/full-site-report";

const overview = { summary: { state: { status: "completed" } }, score: { value: 92 }, finalizationStartedAt: null } as unknown as FullSiteReportOverview;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) + "\n");

test("overview is visible while supporting details are still blocked, then merges without duplicating score", async () => {
  let send!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({start(controller) {send = controller;}}));
  let sawOverview!: () => void;
  const delivered = new Promise<void>(resolve => { sawOverview = resolve; });
  let finished = false;
  const pending = readFullSiteReportStream(response, value => {assert.deepEqual(value, overview); sawOverview();});
  void pending.then(() => {finished = true;});
  send.enqueue(encode({type:"overview",data:overview,elapsedMs:12}));
  await delivered;
  assert.equal(finished,false,"slow details must not block overview delivery");
  send.enqueue(encode({type:"report",data:{services:[], label:"Grüße"},elapsedMs:8000}));
  send.close();
  assert.deepEqual(await pending, {...overview,services:[],label:"Grüße"});
});

test("fragmented UTF-8 and JSON frames survive arbitrary network chunk boundaries", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({type:"overview",data:overview}) + "\n" + JSON.stringify({type:"report",data:{label:"Grüße 東京"}}));
  const response = new Response(new ReadableStream({start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  }}));
  assert.equal((await readFullSiteReportStream(response,()=>{}) as unknown as {label:string}).label,"Grüße 東京");
});

test("a details error preserves the delivered overview and rejects completion", async () => {
  let retained: FullSiteReportOverview | undefined;
  const response = new Response(new ReadableStream({start(controller) {
    controller.enqueue(encode({type:"overview",data:overview}));
    controller.enqueue(encode({type:"error",message:"Supporting details could not be loaded. Please retry."}));
    controller.close();
  }}));
  await assert.rejects(readFullSiteReportStream(response,value=>{retained=value;}), /Supporting details/);
  assert.deepEqual(retained,overview);
});

test("truncated streams and details without an assessment do not masquerade as complete", async () => {
  await assert.rejects(readFullSiteReportStream(new Response(encode({type:"overview",data:overview})),()=>{}), /did not finish/);
  await assert.rejects(readFullSiteReportStream(new Response(encode({type:"report",data:{}})),()=>{}), /assessment was missing/);
});
