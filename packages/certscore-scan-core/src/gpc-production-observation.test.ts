import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { resolveVendorObservations } from "@certscore/vendor-resolver";

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

function collectorFixture(url: string, historicalOverlap = false) {
  const bundle = gpcProductionRuntimeFixture();
  const event = bundle.networkEvents[1]!;
  event.requestUrl = event.url = url;
  event.collectionEndpointObserved = true;
  bundle.networkResponseEvents = [{ ...event, eventType: "network_response", eventId: "response", responseUrl: url, status: 200 }];
  bundle.normalizedVendorObservations = resolveVendorObservations([{ type: "request", url, evidenceId: event.eventId,
    sourceScanner: "pre_consent_runtime", matchSource: "network_request" }]);
  if (historicalOverlap) {
    const duplicate = structuredClone(bundle.normalizedVendorObservations[0]!);
    duplicate.observationId = "historical_doubleclick";
    duplicate.product = "Google Ads / DoubleClick";
    bundle.normalizedVendorObservations.push(duplicate);
  }
  bundle.gpcObservationSession!.requests.find(r => r.eventId === event.eventId)!.urlSha256 = createHash("sha256").update(url).digest("hex");
  const run = () => {
    bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
    const bytes = Buffer.from(JSON.stringify(bundle));
    return buildGpcProductionObservation({ scanId: bundle.scanId, source: { bytes,
      pointer: { uri: "fixture.json", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } } });
  };
  return { bundle, event, run };
}

test("verified GPT and Lotame collectors retain recipients including historical same-recipient product overlap", () => {
  for (const [url, entityId, overlap] of [
    ["https://securepubads.g.doubleclick.net/gampad/ads?iu=fixture", "ent_7509263a9ab6", true],
    ["https://bcp.crwdcntrl.net/6/map?xcid=fixture", "ent_58e68839dcd6", false],
  ] as const) {
    const { event, run } = collectorFixture(url, overlap);
    const result = run();
    assert.equal(result.requests.advertisingCollectionCount, 1);
    assert.deepEqual(result.requests.advertisingCollectionEvidenceIds, [event.eventId]);
    assert.equal(result.requests.advertisingCollectionRecipients?.rows[0]?.entityId, entityId);
    assert.equal(result.scoreEffect, "none", "the scanner observes; WC01 scores");
  }
});

test("same-recipient overlap cannot override conflicting purposes, recipient identities or failed response/signal proof", () => {
  for (const mode of ["purpose", "entity", "response", "signal", "unbound"] as const) {
    const { bundle, event, run } = collectorFixture("https://securepubads.g.doubleclick.net/gampad/ads?iu=fixture", true);
    if (mode === "purpose") bundle.normalizedVendorObservations[1]!.purpose = "analytics";
    if (mode === "entity") bundle.normalizedVendorObservations[1]!.registryAttribution!.entityId = "ent_other";
    if (mode === "response") bundle.networkResponseEvents[0]!.status = 500;
    if (mode === "signal") bundle.gpcObservationSession!.requests.find(r => r.eventId === event.eventId)!.secGpc = null;
    if (mode === "unbound") bundle.gpcObservationSession!.requests.find(r => r.eventId === event.eventId)!.urlSha256 = "f".repeat(64);
    assert.equal(run().requests.advertisingCollectionCount, 0, mode);
  }
});

test("successful GPT dictionaries and consent telemetry remain neutral even with a retained collection flag", () => {
  for (const url of ["https://securepubads.g.doubleclick.net/pagead/managed/dict/m202610200101/gpt", "https://pagead2.googlesyndication.com/ccm/collect"]) {
    assert.equal(collectorFixture(url).run().requests.advertisingCollectionCount, 0, url);
  }
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
