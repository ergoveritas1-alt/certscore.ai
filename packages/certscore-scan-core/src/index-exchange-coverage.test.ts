import assert from "node:assert/strict";
import test from "node:test";
import { californiaRejectRequestEvidenceSchema, isQualifyingSaleSharingRequest } from "@certscore/contracts";
import { captureCaliforniaRejectRequest } from "./california-reject-request";
import { createGpcRequestProofCapture } from "./gpc-request-proof";

const url = "https://htlb.casalemedia.com/openrtb/pbjs?s=publisher";
const event = () => ({ id: "auction", at: 1, site: { page: "https://publisher.test/", ref: "https://publisher.test/start" },
  imp: [{ id: "bid", banner: { w: 300, h: 250, topframe: 1 } }], ext: { source: "prebid", ixdiag: { ls: true, imps: 1 } },
  user: { eids: [{ source: "pubcid.org", uids: [{ id: "private-visitor-fixture", atype: 1 }] }] },
});
const capture = (body: string, target = url, method = "POST") => captureCaliforniaRejectRequest({
  url: target, body, method, hasBody: true, requestId: "request", startedAtMs: 10, httpStatus: 200,
  headers: { "content-type": "text/plain" }, qualificationContext: { gpcDelivered: true },
});

test("source-reviewed Index banner envelope retains hashed evidence without inventing California purpose", () => {
  const row = capture(JSON.stringify(event()))!;
  assert.equal(row.proof?.policyVersion, "bounded_ca_request_proof.v12");
  assert.equal(row.proof?.bodyStatus, "complete");
  assert.equal(row.payload, "inspected_body");
  assert.equal(row.proof?.identifiers.find(id => id.field === "eid_pubcid.org")?.source, "body");
  assert.equal(row.qualification.activity, "unresolved");
  assert.equal(isQualifyingSaleSharingRequest(row.qualification), false);
  assert.doesNotMatch(JSON.stringify(row), /private-visitor-fixture|publisher\.test|auction/);
  assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(row), row);
  for (const change of [
    { origin: "https://other.casalemedia.com" }, { path: "/other" }, { method: "GET" },
    { qualification: { ...row.qualification, activity: "identified_advertising_collection" } },
  ]) assert.equal(californiaRejectRequestEvidenceSchema.safeParse({ ...row, ...change }).success, false);
});

test("Index privacy fields survive supported and unsupported sibling metadata", () => {
  const body = { ...event(), regs: { ext: { us_privacy: "1NYN", gdpr: 1 } } };
  for (const data of [body, { ...body, unreviewed: { metadata: true } }]) {
    const row = capture(JSON.stringify(data))!;
    assert.ok(row.qualification.processingSignals.includes("us_privacy_sale_opt_out"));
    assert.equal(isQualifyingSaleSharingRequest(row.qualification), false);
  }
  const duplicate = capture(JSON.stringify(body), url + "&us_privacy=1NNN")!;
  assert.equal(duplicate.proof?.bodyStatus, "unsupported");
  assert.ok(duplicate.proof?.reasons.includes("duplicate_fields"));
  assert.ok(duplicate.qualification.processingSignals.includes("privacy_signal_invalid"));
  const invalid = capture(JSON.stringify({ ...event(), regs: { gpp: "not-valid", gpp_sid: [7] } }))!;
  assert.ok(invalid.qualification.processingSignals.includes("gpp_unresolved"));
});

test("Index bodies reject ambiguous identity, unknown envelopes and shared field/byte overflows", () => {
  const duplicate = JSON.stringify(event()).replace('"id":"auction"', '"id":"auction","\\u0069d":"other"');
  const repeated = event(); repeated.user.eids.push(repeated.user.eids[0]!);
  const mismatched = event(); mismatched.ext.source = "unreviewed";
  for (const body of [duplicate, JSON.stringify(repeated), JSON.stringify(mismatched),
    JSON.stringify({ ...event(), privacy_mode: "allow" }),
    JSON.stringify({ ...event(), toString: { privacy_mode: "allow" } }),
    JSON.stringify({ ...event(), imp: Array.from({ length: 17 }, () => event().imp[0]) }),
    JSON.stringify({ ...event(), site: { page: "x".repeat(32769) } }),
    JSON.stringify({ ...event(), imp: [{ id: "bid", video: { mimes: ["video/mp4"] } }] }),
  ]) assert.notEqual(capture(body)?.proof?.bodyStatus, "complete");
  assert.notEqual(capture(JSON.stringify(event()), url, "GET")?.proof?.bodyStatus, "complete");
  assert.notEqual(capture(JSON.stringify(event()), "https://htlb.casalemedia.com/openrtb/other")?.proof?.bodyStatus, "complete");
});

test("GPC and Reject share the Index parser with one body and header read and the same 48/32 caps", () => {
  const proof = createGpcRequestProofCapture(() => 20);
  let reads = 0;
  for (let i = 0; i < 60; i++) {
    const done = proof.reserve({ eventId: `event-${i}`, requestId: `request-${i}`, method: "POST", timestampMs: 10, requestUrl: url }, "loader", {
      method: () => "POST", postData: () => { reads++; return JSON.stringify(event()); },
    });
    if (done) { proof.response(`event-${i}`, 200); done({ "content-type": "text/plain" }); }
  }
  const result = proof.finish("loader");
  assert.equal(reads, result.inspected);
  assert.ok(result.inspected <= 48);
  assert.ok(result.rows.length <= 32);
  assert.ok(result.rows.every(row => row.proof.proof?.policyVersion === "bounded_ca_request_proof.v12" &&
    row.proof.proof.bodyStatus === "complete" && row.proof.qualification.activity === "unresolved"));
});
