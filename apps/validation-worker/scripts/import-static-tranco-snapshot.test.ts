import assert from "node:assert/strict";
import test from "node:test";
import { parseTrancoCsvLine } from "./import-static-tranco-snapshot";

test("parseTrancoCsvLine parses a bounded static ranking row", () => {
  assert.deepEqual(parseTrancoCsvLine("123,Example.COM"), {
    hostname: "example.com",
    tranco_rank: 123
  });
});

test("parseTrancoCsvLine rejects malformed and out-of-range rows", () => {
  assert.equal(parseTrancoCsvLine("not-a-rank,example.com"), null);
  assert.equal(parseTrancoCsvLine("1000001,example.com"), null);
  assert.equal(parseTrancoCsvLine("10,"), null);
});

