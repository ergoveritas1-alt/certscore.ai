import assert from "node:assert/strict";
import test from "node:test";
import { documentedServiceRegions, resolveDocumentedServiceRegion } from "./service-regions";

test("documented request paths yield service context independently of IP/HQ", () => {
  for (const [url, region] of [
    ["https://o123.ingest.de.sentry.io/api/456/envelope/?sentry_key=redacted", "DE"],
    ["https://o123.ingest.us.sentry.io/api/456/store/", "US"],
    ["https://region1.google-analytics.com/mp/collect?api_secret=redacted", "EU"],
  ]) {
    const row = resolveDocumentedServiceRegion(url);
    assert.equal(row?.region, region);
    assert.equal(row?.basis, "documented_service_region");
    assert.ok(row?.sources.length);
    assert.equal("ip" in row!, false);
    assert.equal("headquartersCountry" in row!, false);
    assert.equal(JSON.stringify(row).includes("redacted"), false);
  }
});
test("assets, spoofed hosts, undocumented paths and generic region names remain unknown", () => {
  for (const url of [undefined, "o1.ingest.de.sentry.io", "http://o1.ingest.de.sentry.io/api/2/store/", "https://o1.ingest.de.sentry.io.evil.test/api/2/store/", "https://o1.ingest.de.sentry.io:8443/api/2/store/", "https://x@o1.ingest.de.sentry.io/api/2/store/", "https://o1.ingest.sentry.io/api/2/store/", "https://o1.ingest.de.sentry.io/app.js", "https://region1.google-analytics.com/g/collect", "https://region1.google-analytics.com/measurement/conversion", "https://cdn.eu.amplitude.com/a.js", "https://us.example.com/"]) assert.equal(resolveDocumentedServiceRegion(url), null, url);
});
test("service aggregation deduplicates reference metadata while preserving both regions", () => {
  assert.deepEqual(documentedServiceRegions(["https://o1.ingest.de.sentry.io/api/2/store/", "https://o3.ingest.de.sentry.io/api/4/envelope/", "https://o1.ingest.us.sentry.io/api/2/store/"]).map(r => r.region), ["DE", "US"]);
});
