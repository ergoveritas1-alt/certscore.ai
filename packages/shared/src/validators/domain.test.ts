import assert from "node:assert/strict";
import test from "node:test";
import { createDomainRequestSchema, getDomainValidationReasonCode, parseDomainBatchInput } from "./domain";
import { isNonPublicTargetUrlError, normalizeUrl } from "../utils/url";

test("parseDomainBatchInput parses space, comma, and semicolon separated domains", () => {
  const parsed = parseDomainBatchInput("example.com, coinbase.com howeycoins.com;cnn.com");

  assert.deepEqual(
    parsed.valid.map((item) => item.hostname),
    ["example.com", "coinbase.com", "howeycoins.com", "cnn.com"]
  );
  assert.deepEqual(parsed.invalid, []);
});

test("parseDomainBatchInput deduplicates normalized urls and keeps invalid tokens separate", () => {
  const parsed = parseDomainBatchInput("example.com https://example.com invalid@@@");

  assert.deepEqual(parsed.valid.map((item) => item.hostname), ["example.com"]);
  assert.deepEqual(parsed.invalid, ["invalid@@@"]);
});

test("normalizeUrl rejects non-public literal and local hostname targets", () => {
  for (const value of [
    "http://127.0.0.1",
    "https://127.0.0.1",
    "http://localhost",
    "http://localhost.localdomain",
    "http://0.0.0.0",
    "http://[::1]",
    "http://169.254.169.254",
    "http://2130706433",
    "http://0x7f000001",
    "http://0177.0.0.1",
    "http://127.1"
  ]) {
    assert.throws(() => normalizeUrl(value), (error) => {
      assert.equal(isNonPublicTargetUrlError(error), true, value);
      return true;
    });
  }
});

test("domain validation preserves the non-public target reason without retaining the input", () => {
  const parsed = createDomainRequestSchema.safeParse({ domain: "http://169.254.169.254/latest/meta-data/" });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(getDomainValidationReasonCode(parsed.error), "non_public_target");
    assert.equal(JSON.stringify(parsed.error.issues).includes("169.254.169.254"), false);
  }
});

test("normalizeUrl preserves globally reachable IPv4 and ordinary domains", () => {
  assert.equal(normalizeUrl("https://1.1.1.1"), "https://1.1.1.1/");
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
});
