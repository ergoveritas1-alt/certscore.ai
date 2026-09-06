import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./test-fixtures/vendor-registry-attribution-v1.json";
import { normalizedVendorObservationSchema, vendorRegistryAttributionSchema } from "./index";

test("retained registry provenance survives contract parsing; legacy evidence remains valid", () => {
  for (const fixture of fixtures) {
    assert.deepEqual(normalizedVendorObservationSchema.parse(fixture.observation), fixture.observation);
    const { registryAttribution: _registry, ...legacy } = fixture.observation;
    assert.deepEqual(normalizedVendorObservationSchema.parse(legacy), legacy);
  }
});

test("registry provenance is versioned, bounded, strict, and identity-safe", () => {
  const valid = fixtures[0]!.observation.registryAttribution;
  for (const changes of [
    { contractVersion: "unknown" }, { serviceId: "Google Maps" }, { ruleIds: [] },
    { ruleIds: ["same", "same"] }, { ruleIds: Array.from({ length: 33 }, (_, i) => `rule_${i}`) },
    { resolverVersion: "x".repeat(121) }, { matchKind: "guessed" }, { rawCookieValue: "secret" },
  ]) assert.equal(vendorRegistryAttributionSchema.safeParse({ ...valid, ...changes }).success, false);
});
