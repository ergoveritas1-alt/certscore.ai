import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./test-fixtures/vendor-service-purpose-v1.json";
import { normalizedVendorObservationSchema, vendorServicePurposeSchema } from "./index";

const legacy = {
  observationId: "maps-request", entity: "Google LLC", vendor: "Google",
  product: "Google Maps embed", purpose: "infrastructure", confidence: 0.97,
  basis: ["google_maps_embed_endpoint"], matchedEvidenceIds: ["request-1"],
};

test("service-purpose v1 preserves legacy observations and retains the bounded new field", () => {
  assert.equal(normalizedVendorObservationSchema.parse(legacy).servicePurpose, undefined);
  const current = normalizedVendorObservationSchema.parse({ ...legacy, servicePurpose: "Embedded maps" });
  assert.equal(current.servicePurpose, "Embedded maps");
  assert.equal(current.purpose, "infrastructure");
  assert.deepEqual(current.matchedEvidenceIds, ["request-1"]);
  for (const value of ["GDPR compliant", "Tracking confirmed", "x".repeat(1000), null, 1, {}]) {
    assert.equal(vendorServicePurposeSchema.safeParse(value).success, false);
    assert.equal(normalizedVendorObservationSchema.safeParse({ ...legacy, servicePurpose: value }).success, false);
  }
});

test("shared runtime service-purpose fixtures round-trip without altering observation facts", () => {
  for (const { observation } of fixtures) {
    const current = normalizedVendorObservationSchema.parse(observation);
    const { servicePurpose, ...legacy } = observation;
    const parsedLegacy = normalizedVendorObservationSchema.parse(legacy);
    assert.deepEqual(current, { ...parsedLegacy, servicePurpose });
  }
});
