import assert from "node:assert/strict";
import test from "node:test";
import { getScanRequesterIpContext, normalizeScanRequesterIpContext } from "./requester-ip-context";

test("getScanRequesterIpContext retains the bounded source IP and a stable hash", () => {
  const context = getScanRequesterIpContext(new Headers({
    "cf-connecting-ip": "203.0.113.42",
    "x-forwarded-for": "198.51.100.1, 203.0.113.42"
  }));
  assert.equal(context.sourceIp, "203.0.113.42");
  assert.match(context.ipHash ?? "", /^[a-f0-9]{64}$/);
});

test("normalizeScanRequesterIpContext derives a hash when only the source IP is supplied", () => {
  const context = normalizeScanRequesterIpContext({ sourceIp: "2001:db8::7" });
  assert.equal(context.sourceIp, "2001:db8::7");
  assert.match(context.ipHash ?? "", /^[a-f0-9]{64}$/);
});
