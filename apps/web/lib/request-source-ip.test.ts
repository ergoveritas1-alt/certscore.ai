import assert from "node:assert/strict";
import test from "node:test";
import { getTrustedRequestSourceIp, normalizeRequestSourceIp } from "./request-source-ip";

test("uses the ALB-appended rightmost forwarded IP instead of a spoofable left entry", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "cf-connecting-ip": "192.0.2.99",
    "x-forwarded-for": "198.51.100.200, 203.0.113.42"
  })), "203.0.113.42");
});

test("normalizes valid address and optional proxy port forms", () => {
  assert.equal(normalizeRequestSourceIp("203.0.113.8:443"), "203.0.113.8");
  assert.equal(normalizeRequestSourceIp("[2001:db8::7]:443"), "2001:db8::7");
  assert.equal(normalizeRequestSourceIp("not-an-ip"), null);
});
