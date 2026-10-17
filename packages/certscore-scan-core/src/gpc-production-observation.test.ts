import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";
import { buildGpcProductionObservation } from "./gpc-production-observation";

test("bounded GPC completion uses its own representative visit independently of DOM inventory coverage", () => {
  const bundle=gpcProductionRuntimeFixture();
  bundle.runtimeCoverage!.coverageStatus="limited_partial";
  bundle.scanEvidenceLaneAssessment!.lanes.homepageRuntime="limited";
  bundle.scanLaneRuns[0]!.executionOutcome="degraded";
  const run=()=>{const bytes=Buffer.from(JSON.stringify(bundle));return buildGpcProductionObservation({scanId:bundle.scanId,source:{bytes,pointer:{uri:"fixture.json",sizeBytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}}});};
  assert.equal(run().status,"complete","full producer-bound request/signal completion does not assert DOM completeness");
  bundle.scanLaneRuns[0]!.accessOutcome="access_denied";
  assert.equal(run().status,"limited","another usable surface cannot override this GPC visit");
  bundle.scanLaneRuns[0]!.accessOutcome="representative_page";
  bundle.gpcObservationSession!.requestsDropped=1;
  assert.notEqual(run().status,"complete","partial retained GPC packets remain limited");
});

test("bounded GPC activity requires endpoint attribution for each request", () => {
  for (const mode of ["endpoint", "cookie_only", "same_vendor_other_endpoint", "legacy", "ambiguous", "cookie_other_vendor"] as const) {
    const bundle = gpcProductionRuntimeFixture();
    const vendor = bundle.normalizedVendorObservations[0]!;
    const eventId = vendor.matchedEvidenceIds[0]!;
    bundle.networkEvents.find(event => event.eventId === eventId)!.collectionEndpointObserved = true;
    if (["cookie_only", "same_vendor_other_endpoint"].includes(mode)) {
      vendor.matchSources = [{ source: "request_cookie", sourceEventId: eventId, matchedField: "cookie_name", confidence: 1, resolverBasis: ["cookie_name_match"] }];
    }
    if (mode === "same_vendor_other_endpoint") {
      vendor.matchedEvidenceIds.push("other_endpoint");
      vendor.matchSources.push({ source: "network_request", sourceEventId: "other_endpoint", matchedField: "hostname", confidence: 1, resolverBasis: [] });
    }
    if (mode === "legacy") vendor.matchSources = [];
    if (mode === "ambiguous" || mode === "cookie_other_vendor") {
      const other = structuredClone(vendor);
      other.observationId = "other";
      other.vendor = "Other vendor";
      if (mode === "cookie_other_vendor") other.matchSources = [{ source: "request_cookie", sourceEventId: eventId, matchedField: "cookie_name", confidence: 1, resolverBasis: [] }];
      bundle.normalizedVendorObservations.push(other);
    }
    const bytes = Buffer.from(JSON.stringify(bundle));
    const result = buildGpcProductionObservation({ scanId: bundle.scanId, source: { bytes,
      pointer: { uri: "fixture.json", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } } });
    const counted = mode === "endpoint" || mode === "cookie_other_vendor";
    assert.equal(result.requests.classifiedCount, counted ? 1 : 0, mode);
    assert.equal(result.requests.collectionCount, counted ? 1 : 0, mode);
    assert.deepEqual(result.requests.evidenceIds, counted ? [eventId] : [], mode);
    assert.equal(result.requests.count, bundle.networkEvents.length, "retain every original request");
    assert.equal(result.status, "complete", "bounded completion is independent of purpose attribution");
    assert.equal(result.scoreEffect, "none");
    assert.equal(result.legalInterpretation, "not_assessed");
  }
});
