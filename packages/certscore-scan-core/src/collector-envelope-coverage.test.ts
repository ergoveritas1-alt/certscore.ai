import assert from "node:assert/strict";
import test from "node:test";
import { captureCaliforniaRejectRequest } from "./california-reject-request";
import { createGpcRequestProofCapture } from "./gpc-request-proof";
import { californiaRejectRequestEvidenceSchema } from "@certscore/contracts";

const capture = (url: string, body: string, contentType = "application/x-www-form-urlencoded") => captureCaliforniaRejectRequest({
  url, body, method: "POST", requestId: "fixture-request", startedAtMs: 10, httpStatus: 200, hasBody: true,
  headers: { "content-type": contentType }, qualificationContext: { gpcDelivered: true, requestAtMs: 10 },
});

test("reviewed Reddit SDK metadata keeps exact routing, visitor proof and processing restrictions", () => {
  const url = "https://alb.reddit.com/rp?id=publisher&event=PageVisit";
  const fields = { id: "publisher", event: "PageVisit", uuid: "private-fixture", ts: "123", mthd: "POST", "m.value": "20", "m.currency": "USD", "m.products": '[{"id":"item"}]', dpm: "", dpcc: "0", dprc: "0" };
  const row = capture(url, new URLSearchParams(fields).toString())!;
  assert.equal(row.proof?.bodyStatus, "complete");
  assert.equal(row.proof?.policyVersion, "bounded_ca_request_proof.v6");
  assert.equal(row.qualification.activity, "identified_advertising_collection");
  assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row), row);
  assert.doesNotMatch(JSON.stringify(row), /private-fixture|item/);
  const restricted = capture(url, new URLSearchParams({ ...fields, dpm: "LDU" }).toString())!;
  assert.ok(restricted.qualification.processingSignals.includes("privacy_signal_invalid"));
  const partial = capture(url, new URLSearchParams({ ...fields, dpm: "LDU", unreviewed: "x" }).toString())!;
  assert.equal(partial.proof?.bodyStatus, "unsupported");
  assert.ok(partial.qualification.processingSignals.includes("privacy_signal_invalid"));
  for (const [target, body] of [
    [url, new URLSearchParams({ ...fields, id: "other" }).toString()],
    [url, new URLSearchParams(fields).toString() + "&ts=456"],
    ["https://alb.reddit.com/other", new URLSearchParams(fields).toString()],
  ]) assert.notEqual(capture(target!, body!)?.proof?.bodyStatus, "complete");
  const metadataOnly = capture(url, new URLSearchParams({ ts: "123", external_id: "private-fixture" }).toString())!;
  assert.equal(metadataOnly.qualification.activity, "unresolved");
});

test("Mixpanel object and bounded batch envelopes inspect JSON and canonical base64 without creating advertising purpose", () => {
  const event = { event: "Page view", properties: { token: "publisher", distinct_id: "private-fixture", $current_url: "https://example.test/", custom: 2 } };
  for (const host of ["api.mixpanel.com", "api-js.mixpanel.com"]) for (const payload of [event, [event, event]]) {
    const json = JSON.stringify(payload);
    for (const data of [json, Buffer.from(json).toString("base64")]) {
      const body = new URLSearchParams({ data }).toString(), row = capture(`https://${host}/track/`, body)!;
      assert.equal(row.proof?.bodyStatus, "complete");
      assert.equal(row.proof?.policyVersion, "bounded_ca_request_proof.v6");
      assert.equal(row.qualification.activity, "unresolved");
      assert.doesNotMatch(JSON.stringify(row), /private-fixture|distinct_id/);
      assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row), row);
    }
    assert.equal(capture(`https://${host}/track`, json, "application/json")?.proof?.bodyStatus, "complete");
  }
});

test("collector batches reject malformed, oversized, duplicate and unreviewed privacy envelopes", () => {
  const url = "https://api-js.mixpanel.com/track";
  for (const json of [
    '{"event":"A","properties":{"distinct_id":"x","\\u0064istinct_id":"y"}}',
    JSON.stringify(Array.from({ length: 17 }, () => ({ event: "A", properties: {} }))),
    JSON.stringify({ event: "A", properties: { custom: { nested: "unreviewed" } } }),
    JSON.stringify({ event: "A", properties: { custom_privacy_mode: "allowed" } }),
    JSON.stringify({ event: "A", properties: { value: "x".repeat(32768) } }),
  ]) assert.notEqual(capture(url, json, "application/json")?.proof?.bodyStatus, "complete");
  const restricted = capture(url, JSON.stringify({ event: "A", properties: { rdp: 1, custom: {} } }), "application/json")!;
  assert.equal(restricted.proof?.bodyStatus, "unsupported");
  assert.ok(restricted.qualification.processingSignals.includes("privacy_signal_invalid"));
  assert.equal(capture(url, "data=YWJj&data=YWJj")?.proof?.bodyStatus, "unsupported");
  assert.notEqual(capture("https://unreviewed.mixpanel.com/track", "data=e30=")?.proof?.bodyStatus, "complete");
});

test("both action and GPC lanes use the same reviewed decoder without extra reads", () => {
  let headerReads = 0, bodyReads = 0;
  const c = createGpcRequestProofCapture(() => 12);
  const done = c.reserve({ eventId: "event", requestId: "request", timestampMs: 10, requestUrl: "https://api-js.mixpanel.com/track", method: "POST" }, "loader", {
    method: () => "POST", postData: () => { bodyReads++; return new URLSearchParams({ data: JSON.stringify({ event: "A", properties: { distinct_id: "private-fixture" } }) }).toString(); },
  })!;
  c.response("event", 200); headerReads++; done({ "content-type": "application/x-www-form-urlencoded" });
  const rows = c.finish("loader").rows;
  assert.equal(rows.length, 1); assert.equal(rows[0]?.proof.proof?.bodyStatus, "complete");
  assert.equal(bodyReads, 1); assert.equal(headerReads, 1);
});
