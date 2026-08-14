import assert from "node:assert/strict";
import test from "node:test";
import { getTrustedRequestSourceIp, normalizeRequestSourceIp } from "./request-source-ip";

test("uses the ALB-appended rightmost forwarded IP instead of a spoofable left entry", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "cf-connecting-ip": "192.0.2.99",
    "x-forwarded-for": "198.51.100.200, 203.0.113.42"
  })), "203.0.113.42");
});

test("uses Cloudflare's original client IP when the final forwarded hop is Cloudflare", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "cf-connecting-ip": "198.51.100.200",
    "x-forwarded-for": "198.51.100.200, 172.64.217.24"
  })), "198.51.100.200");
});

test("does not trust CF-Connecting-IP from an unverified forwarded hop", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "cf-connecting-ip": "198.51.100.200",
    "x-forwarded-for": "198.51.100.200, 203.0.113.42"
  })), "203.0.113.42");
});

test("does not trust a standalone spoofed CF-Connecting-IP header", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "cf-connecting-ip": "198.51.100.200",
    "x-real-ip": "203.0.113.42"
  })), null);
});

test("does not trust a standalone spoofed X-Real-IP header", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({ "x-real-ip": "198.51.100.90" })), null);
});

test("fails closed when the rightmost ALB source slot is malformed", () => {
  assert.equal(getTrustedRequestSourceIp(new Headers({
    "x-forwarded-for": "198.51.100.90, not-an-ip"
  })), null);
});

test("normalizes valid address and optional proxy port forms", () => {
  assert.equal(normalizeRequestSourceIp("203.0.113.8:443"), "203.0.113.8");
  assert.equal(normalizeRequestSourceIp("[2001:db8::7]:443"), "2001:db8::7");
  assert.equal(normalizeRequestSourceIp("not-an-ip"), null);
});
