import assert from "node:assert/strict";
import test from "node:test";
import { parseDomainBatchInput } from "./domain";

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
