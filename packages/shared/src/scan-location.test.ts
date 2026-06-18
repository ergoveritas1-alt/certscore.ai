import assert from "node:assert/strict";
import test from "node:test";
import { formatScanFromLabel, getScanFromDefinition, normalizeScanFrom } from "./scan-location";

test("normalizes scan-from values", () => {
  assert.equal(normalizeScanFrom("default"), "default");
  assert.equal(normalizeScanFrom("eu_de"), "eu_de");
  assert.equal(normalizeScanFrom("eu_ie"), "eu_ie");
  assert.equal(normalizeScanFrom("california"), "california");
  assert.equal(normalizeScanFrom("eu"), "eu_de");
  assert.equal(normalizeScanFrom("uk"), "eu_ie");
  assert.equal(normalizeScanFrom("unknown"), "eu_ie");
  assert.equal(normalizeScanFrom(null), "eu_ie");
});

test("formats scan-from labels and geo targets", () => {
  assert.equal(formatScanFromLabel("california"), "California");
  assert.equal(formatScanFromLabel("eu_ie"), "EU-IR");
  assert.deepEqual(getScanFromDefinition("eu_de").requestedGeo, {
    countryCode: "DE",
    provider: "aws-default",
    regionCode: "eu-central-1"
  });
});
