import assert from "node:assert/strict";
import test from "node:test";
import { formatScanFromLabel, getScanFromDefinition, normalizeScanFrom } from "./scan-location";

test("normalizes scan-from values", () => {
  assert.equal(normalizeScanFrom("default"), "default");
  assert.equal(normalizeScanFrom("california"), "california");
  assert.equal(normalizeScanFrom("eu"), "eu");
  assert.equal(normalizeScanFrom("uk"), "uk");
  assert.equal(normalizeScanFrom("unknown"), "default");
  assert.equal(normalizeScanFrom(null), "default");
});

test("formats scan-from labels and geo targets", () => {
  assert.equal(formatScanFromLabel("california"), "California");
  assert.deepEqual(getScanFromDefinition("eu").requestedGeo, {
    countryCode: "DE",
    provider: "decodo-residential",
    regionCode: null
  });
});
