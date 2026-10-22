import assert from "node:assert/strict";
import {canonicalEvidenceBundleSchema,gpcObservationSessionSchema} from "@certscore/contracts";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { resolveVendorObservations, decodeGppRequest } from "@certscore/vendor-resolver";

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
    bundle.gpcObservationSession=gpcObservationSessionSchema.parse(bundle.gpcObservationSession);
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

test('identity-bearing DoubleClick collector qualifies through retained signal/session/response proof; sync-frame alone does not',()=>{
 const url='https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456';
 const {bundle,run}=collectorFixture(url);
 assert.equal(run().requests.advertisingCollectionRecipients?.rows[0]?.entityId,'ent_7509263a9ab6');
 bundle.networkResponseEvents[0]!.status=500;
 assert.equal(run().requests.advertisingCollectionCount,0);
 assert.equal(collectorFixture('https://gum.criteo.com/syncframe?origin=prebid&gdpr=0').run().requests.advertisingCollectionCount,0);
});

test('OpenX ESP page-context collection gets endpoint attribution independently of its subsequent bootstrap',()=>{
 const {run}=collectorFixture('https://rtb.openx.net/esp?url=https%3A%2F%2Fpublisher.test%2F&rid=esp');
 assert.equal(run().requests.advertisingCollectionRecipients?.rows[0]?.entityId,'ent_ea85d9fc1696');
 for(const url of ['https://rtb.openx.net/esp?rid=esp','https://rtb.openx.net/esp-config?url=https%3A%2F%2Fpublisher.test%2F&rid=esp','https://rtb.openx.net/esp?url=&rid=esp'])
  assert.equal(collectorFixture(url).run().requests.advertisingCollectionCount,0,url);
});

test("GPC producer retains verified request roles and restrictions without dropping factual advertising activity", () => {
  for (const [url, activity, signals] of [
    ["https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456", "identified_advertising_collection", []],
    ["https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&rdp=1", "identified_advertising_collection", ["google_rdp"]],
    ["https://securepubads.g.doubleclick.net/gampad/ads?iu=fixture&npa=1", "unresolved", ["google_npa"]],
  ] as const) {
    const { run, bundle, event } = collectorFixture(url);
    const result = run();
    assert.equal(result.requests.advertisingCollectionCount, 1);
    assert.deepEqual(result.requests.advertisingCollectionQualification, { policyVersion: "gpc_sale_sharing_evidence.v2",
      rows: [{ evidenceId: event.eventId, activity, basis: activity === "unresolved" ? "endpoint_or_identity_unresolved" : "google_advertising_feature_identifier", processingSignals: [...signals], gpp: decodeGppRequest(new URLSearchParams()) }] });
    bundle.networkResponseEvents[0]!.status = 500;
    assert.deepEqual(run().requests.advertisingCollectionQualification?.rows, [], "classification cannot invent successful collection");
  }
});

test("offline GPP fields are retained only from successful bound collection evidence", () => {
  const {bundle,run}=collectorFixture("https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=123.456&gpp=DBABBg~BVWSSSVY.YA&gpp_sid=8");
  const row=run().requests.advertisingCollectionQualification!.rows[0]!;
  assert.equal(row.gpp!.status,"decoded");assert.deepEqual(row.gpp!.sectionIds,[8]);
  assert.equal(row.gpp!.sections[0]!.gpc,true);assert.equal(row.gpp!.sections[0]!.saleOptOut,1);
  assert.deepEqual(row.processingSignals,["gpp_opt_out"]);
  bundle.gpcObservationSession!.requests[1]!.secGpc=null;
  assert.deepEqual(run().requests.advertisingCollectionQualification!.rows,[]);
});

test("GPP propagation observations require retained successful requests and positive same-document proof", () => {
  const missing=collectorFixture("https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN");
  assert.equal(missing.run().requests.gppPropagation?.rows[0]?.reason,"applicable_section_missing");
  missing.bundle.networkResponseEvents[0]!.status=403;
  assert.deepEqual(missing.run().requests.gppPropagation?.rows,[]);
  for (const mode of ["valid","future","missing_history","invalidated","gpc_false","absent_parameter","bad_hash","wrong_document"] as const) {
    const f=collectorFixture("https://image6.pubmatic.com/AdServer/UCookieSetPug?p=123&gpp=&gpp_sid=&us_privacy=1NYN");
    const semantic=f.bundle.gpcObservationSession!.semanticObservation!;
    const state={apiVersion:"1.1" as const,sectionId:8 as const,sectionVersion:1 as const,cmpStatus:"loaded" as const,signalStatus:"ready" as const,
      saleNotice:2 as const,sharingNotice:2 as const,saleOptOut:1 as const,sharingOptOut:1 as const,gpc:mode!=="gpc_false"};
    semantic.gppStatus="observed";semantic.usca=state;
    semantic.stateSha256=createHash("sha256").update(JSON.stringify(state)).digest("hex");
    semantic.stateTransitions=[{observedAtMs:mode==="future"?f.event.timestampMs+1:f.event.timestampMs-1,
      status:"observed",state,stateSha256:mode==="bad_hash"?"a".repeat(64):semantic.stateSha256}];
    if(mode==="missing_history")delete semantic.stateTransitions;
    if(mode==="invalidated")semantic.stateTransitions.push({observedAtMs:f.event.timestampMs,status:"not_ready",state:null,stateSha256:null});
    if(mode==="wrong_document")semantic.captureBinding!.documentToken="different-loader";
    if(mode==="absent_parameter") {
      f.event.requestUrl=f.event.url="https://image6.pubmatic.com/AdServer/UCookieSetPug?p=123&gpp_sid=&us_privacy=1NYN";
      f.bundle.gpcObservationSession!.requests.find(r=>r.eventId===f.event.eventId)!.urlSha256=createHash("sha256").update(f.event.requestUrl).digest("hex");
    }
    if(mode==="valid") canonicalEvidenceBundleSchema.parse(f.bundle);
    const observation=f.run(); const rows=observation.requests.gppPropagation?.rows;
    assert.equal(rows?.length,mode==="valid"?1:0,JSON.stringify({mode,observation}));
    if(mode==="valid")assert.equal(rows?.[0]?.cmpEvidence?.observedAtMs,f.event.timestampMs-1);
  }
});
