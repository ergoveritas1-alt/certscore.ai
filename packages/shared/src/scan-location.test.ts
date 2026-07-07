import assert from "node:assert/strict";
import test from "node:test";
import { formatScanFromLabel, getScanFromDefinition, normalizeScanFrom } from "./scan-location";

test("normalizes scan-from values", () => {
  assert.equal(normalizeScanFrom("default"), "default");
  assert.equal(normalizeScanFrom("california"), "california");
  assert.equal(normalizeScanFrom("eu_de"), "eu_de");
  assert.equal(normalizeScanFrom("eu_ie"), "eu_ie");
  assert.equal(normalizeScanFrom("us_east"), "eu_ie");
  assert.equal(normalizeScanFrom("eu"), "eu_de");
  assert.equal(normalizeScanFrom("uk"), "eu_ie");
  assert.equal(normalizeScanFrom("unknown"), "eu_ie");
  assert.equal(normalizeScanFrom(null), "eu_ie");
});

test("formats scan-from labels and geo targets", () => {
  assert.equal(formatScanFromLabel("eu_ie"), "EU-IR");
  assert.deepEqual(getScanFromDefinition("eu_de").requestedGeo, {
    countryCode: "DE",
    provider: "aws-ec2-proxy-eip",
    regionCode: "eu-central-1"
  });
  assert.deepEqual(getScanFromDefinition("california").requestedGeo, {
    countryCode: "US",
    provider: "aws-ec2-proxy-eip",
    regionCode: "us-west-2"
  });
  assert.equal(getScanFromDefinition("eu_ie").realIpEgress?.id, "eu-ie-ec2-proxy-t4g-micro");
  assert.equal(getScanFromDefinition("eu_de").realIpEgress?.id, "eu-de-ec2-proxy-t4g-micro");
  assert.equal(getScanFromDefinition("california").realIpEgress?.id, "us-ca-ec2-proxy-t4g-micro");
});
