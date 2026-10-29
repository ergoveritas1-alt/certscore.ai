import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeRequestPayload } from "./request-payload-signals";
import { createFormDestinationCollector } from "./form-destination-trace";
import { createGpcRequestProofCapture } from "./gpc-request-proof";

test("opaque runtime bodies retain independent GPC URL proof and response without claiming body absence", () => {
  const request = { method: () => "POST", postData: (): string | null => { throw Error("private-body"); } };
  const payload = readRuntimeRequestPayload(request);
  assert.equal(payload.signals, undefined);
  assert.equal(payload.body, undefined);
  const capture = createGpcRequestProofCapture(() => 200);
  const reserve = capture.reserve({ eventId: "request", requestId: "request", timestampMs: 100,
    requestUrl: "https://www.google.com/pagead/1p-user-list/123/?random=1&uid=fixture-visitor" }, "loader", request);
  assert.ok(reserve);
  capture.response("request", 204);
  reserve({});
  const proof = capture.finish("loader").rows[0]!.proof;
  assert.equal(proof.httpStatus, 204);
  assert.equal(proof.proof?.bodyStatus, "unavailable");
  assert.doesNotMatch(JSON.stringify(proof), /fixture-visitor|private-body/);
});

test("opaque form bodies preserve same-document query matches and count unsupported payloads", () => {
  const started = Date.now() - 1000;
  const collector = createFormDestinationCollector(started);
  collector.event({ kind: "input", time: started + 100, pageUrl: "https://site.test/", formIndex: 0,
    actionUrl: "https://site.test/send", fields: [{ name: "email", value: "fixture@example.test", type: "email", label: "Email", autocomplete: "email" }] }, "loader", "https://site.test/");
  collector.request("opaque", "https://collector.test/send?email=fixture%40example.test", "POST", 200, undefined, "loader");
  collector.status("opaque", "response_observed");
  const trace = collector.finish();
  assert.equal(trace.coverage.unsupportedPayloads, 1);
  assert.equal(trace.requests[0]?.status, "response_observed");
  assert.equal(trace.requests[0]?.relation, "exact_field_value_match");
  assert.equal(trace.requests[0]?.matches[0]?.location, "query");
  assert.doesNotMatch(JSON.stringify(trace), /fixture(@|%40)example/);
});

test("successful runtime body reads preserve empty, JSON, form and bounded-field observations", () => {
  for (const body of [null, ""]) assert.equal(readRuntimeRequestPayload({ postData: () => body }).signals?.bodyPresent, false);
  assert.deepEqual(readRuntimeRequestPayload({ postData: () => '{"a":"é","b":1}' }).signals,
    { bodyPresent: true, bodySizeBytes: 16, bodyFieldNames: ["a", "b"] });
  assert.deepEqual(readRuntimeRequestPayload({ postData: () => "a=1&a=2&b=3" }).signals?.bodyFieldNames, ["a", "b"]);
  const large = readRuntimeRequestPayload({ postData: () => "a=" + "x".repeat(20_000) });
  assert.equal(large.signals?.bodySizeBytes, 20_002);
  assert.deepEqual(large.signals?.bodyFieldNames, []);
});

test("opaque bodies cannot become field names and valid metadata stays bounded",()=>{
 for(const body of ['opaque-private-envelope',Buffer.from('private-payload').toString('base64'),'[{"private":"value"}]']){
  const result=readRuntimeRequestPayload({postData:()=>body});assert.equal(result.body,body);assert.deepEqual(result.signals?.bodyFieldNames,[]);
 }
 const input=Object.fromEntries([...Array.from({length:80},(_,i)=>[`field_${i}`,'private']),['raw=value','private'],['x'.repeat(500),'private']]);
 const result=readRuntimeRequestPayload({postData:()=>JSON.stringify(input)});assert.equal(result.signals?.bodyFieldNames.length,32);assert.ok(result.signals!.bodyFieldNames.every(k=>/^[A-Za-z_$][\w.$-]{0,63}$/.test(k)));assert.doesNotMatch(JSON.stringify(result.signals),/private/);
});
