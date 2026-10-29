import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CanonicalEvidenceBundle,
  type CookieEvent,
  type NetworkEvent,
  type NetworkResponseEvent,
  SCHEMA_VERSION,
  canonicalEvidenceBundleSchema,
  postAcceptEvidencePacketSchema,
} from "@certscore/contracts";
import { RuntimeEvidenceGraphBuilder } from "./runtime-evidence-graph.js";
import { compactCanonicalEvidenceBundleForRetention, summarizeSiteResourceSizes } from "./index.js";
import { getScanProfile } from "./profiles.js";
import { gpcImpactRequestSetHash } from "./gpc-impact-capture.js";
import { resolveVendorObservations } from "@certscore/vendor-resolver";
import {gpcProductionRuntimeFixture} from "../../certscore-contracts/src/test-fixtures/gpc-production";
import {captureCaliforniaRejectRequest} from "./california-reject-request";
import {gpcProofEventPriorities} from "./gpc-proof-retention";

test("compaction preserves exact source requests for selected GPC proofs within the existing caps",()=>{
  const bundle=oversizedGoogleLikeBundle(),session=gpcProductionRuntimeFixture().gpcObservationSession!;
  for(const event of bundle.networkEvents)Object.assign(event,{collectionEndpointObserved:true,thirdParty:true,firstParty:false,hasIdentifierLikeParameters:true,cookieNamesSent:["visitor_id"],resourceType:"fetch"});
  // Late duplicate-recipient events previously competed only on generic event
  // priority despite their detailed retained proof pointing to these exact IDs.
  const events=bundle.networkEvents.slice(150,154);
  session.requestProofCapture={contractVersion:"gpc_request_capture.v1",inspected:4,skipped:0,pending:0,failed:0,retentionDropped:0,restrictions:[],rows:events.map(event=>{
    const url="https://htlb.casalemedia.com/openrtb/pbjs";
    Object.assign(event,{requestUrl:url,url,hostname:"htlb.casalemedia.com",method:"POST",collectionEndpointObserved:true,hasIdentifierLikeParameters:false,cookieNamesSent:[]});
    const fact=captureCaliforniaRejectRequest({url,method:"POST",requestId:event.requestId,startedAtMs:event.timestampMs,hasBody:true,body:"unsupported",headers:{"content-type":"text/plain"}})!;
    return {eventId:event.eventId,documentToken:session.mainDocument!.documentToken,capturedAtMs:event.timestampMs,proof:{...fact,contractVersion:"gpc_request_proof.v1"}};
  })};
  session.requests=session.requestProofCapture.rows.map(row=>({eventId:row.eventId,timestampMs:row.proof.startedAtMs,urlSha256:row.proof.urlSha256,secGpc:"1"}));
  session.requestsObserved=session.requests.length;session.requestsDropped=0;
  session.scanId=bundle.scanId;bundle.gpcObservationSession=session;
  const withoutProof=structuredClone(bundle);delete withoutProof.gpcObservationSession;
  const ordinary=compactCanonicalEvidenceBundleForRetention(withoutProof,1);
  assert.ok(events.some(event=>!ordinary.networkEvents.some(row=>row.eventId===event.eventId)));
  const compacted=compactCanonicalEvidenceBundleForRetention(bundle,1);
  assert.ok(compacted.networkEvents.length<=80);assert.ok(compacted.networkResponseEvents.length<=60);
  for(const event of events)assert.ok(compacted.networkEvents.some(row=>row.eventId===event.eventId));
  assert.ok(canonicalEvidenceBundleSchema.safeParse(compacted).success);
  for(const mode of ["id","method","time","url","document","ambiguous","request_collision"]){
    const bad=structuredClone(bundle),row=bad.gpcObservationSession!.requestProofCapture!.rows[0]!;
    if(mode==="id")row.proof.requestId="other";
    if(mode==="method")row.proof.method="GET";
    if(mode==="time")row.proof.startedAtMs++;
    if(mode==="url")row.proof.urlSha256="f".repeat(64);
    if(mode==="document")row.documentToken="other";
    if(mode==="ambiguous")bad.networkEvents.push(structuredClone(events[0]!));
    if(mode==="request_collision")bad.networkEvents[0]!.requestId=events[0]!.requestId;
    assert.equal(gpcProofEventPriorities(bad).has(events[0]!.eventId),false,mode);
  }
});

test("repeated collector traffic cannot evict another recipient's successful request/response pair", () => {
  const bundle = oversizedGoogleLikeBundle();
  for (const [i, event] of bundle.networkEvents.entries()) {
    const meta = i === 90;
    const url = meta ? "https://www.facebook.com/tr/?id=fixture&ev=PageView" : `https://www.google-analytics.com/g/collect?cid=fixture-${i}`;
    Object.assign(event, { url, requestUrl: url, hostname: new URL(url).hostname, requestHostname: new URL(url).hostname,
      collectionEndpointObserved: true, thirdParty: true, firstParty: false, resourceType: "fetch", isMainFrame: false,
      cookieNamesSent: meta ? [] : ["_ga"], hasIdentifierLikeParameters: !meta });
    Object.assign(bundle.networkResponseEvents[i]!, { url, responseUrl: url, status: 204, cookieNamesSet: meta ? [] : ["_ga"] });
  }
  bundle.normalizedVendorObservations = resolveVendorObservations(bundle.networkEvents.map(e => ({ type: "request" as const,
    url: e.requestUrl, evidenceId: e.eventId, sourceScanner: "pre_consent_runtime", matchSource: "network_request" as const })));
  const original = structuredClone(bundle.networkEvents[90]!);
  const result = compactCanonicalEvidenceBundleForRetention(bundle, 1);
  assert.ok(result.networkEvents.some(e => e.eventId === original.eventId), "Keep the distinct recipient request");
  assert.ok(result.networkResponseEvents.some(e => e.requestId === original.requestId && e.status === 204), "Keep its exact observed response");
  assert.ok(result.networkEvents.length <= 80 && result.networkResponseEvents.length <= 60);
  assert.deepEqual(bundle.networkEvents[90], original, "Retention cannot mutate the source");
  for (const mode of ["missing", "failed", "ambiguous"] as const) {
    const negative = structuredClone(bundle);
    if (mode === "missing") delete negative.networkResponseEvents[90]!.status;
    if (mode === "failed") negative.networkResponseEvents[90]!.status = 500;
    if (mode === "ambiguous") negative.networkResponseEvents.push({ ...negative.networkResponseEvents[90]!, eventId: "duplicate_response", status: 500 });
    const retained = compactCanonicalEvidenceBundleForRetention(negative, 1);
    assert.equal(retained.networkEvents.some(e => e.eventId === original.eventId), false, `${mode} response proof cannot elevate a recipient over supported pairs`);
    for (const response of retained.networkResponseEvents) assert.ok(negative.networkResponseEvents.some(e => e.eventId === response.eventId && e.status === response.status));
  }
});

test("retention restores complete small GPC windows without displacing priority evidence", () => {
  const bundle = oversizedGoogleLikeBundle();
  const baseline = compactCanonicalEvidenceBundleForRetention(bundle);
  const retainedIds = new Set(baseline.networkEvents.map(e => e.eventId));
  const lost = bundle.networkEvents.find(e => !retainedIds.has(e.eventId))!;
  assert.ok(lost);
  bundle.networkEvents = bundle.networkEvents.map(e => ({ ...e, timestampMs: e.eventId === lost.eventId ? 1000 : 2000 }));
  const observed = bundle.networkEvents.filter(e => e.timestampMs === 1000);
  bundle.gpcImpactCapture = { contractVersion: "certscore.gpc-impact-capture.v1", scope: "page_http_request_attempts_after_document_commit",
    expectedEnabled: false, captureStartedAtMs: 0, capturedAtMs: 1500, readbackDocumentToken: "loader",
    document: { token: "loader", urlSha256: "a".repeat(64), committedAtMs: 1000, secGpc: null }, requestsDropped: 0,
    windows: [{ durationMs: 250, requestCount: 1, requestSetSha256: gpcImpactRequestSetHash(observed) }], limitationKeys: [] };
  const result = compactCanonicalEvidenceBundleForRetention(bundle);
  assert.ok(result.networkEvents.some(e => e.eventId === lost.eventId));
  for (const id of retainedIds) assert.ok(result.networkEvents.some(e => e.eventId === id), id);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 400 * 1024);
  assert.deepEqual(result.gpcImpactCapture, bundle.gpcImpactCapture);
  assert.equal(gpcImpactRequestSetHash(result.networkEvents.filter(e => e.timestampMs >= 1000 && e.timestampMs < 1250)), bundle.gpcImpactCapture.windows[0]!.requestSetSha256);
  const constrained = compactCanonicalEvidenceBundleForRetention(bundle, 1);
  assert.equal(constrained.gpcImpactCapture?.retentionStatus, "incomplete");
  assert.deepEqual(constrained.gpcImpactCapture?.windows, bundle.gpcImpactCapture.windows, "original counts/digests are never rewritten");
  assert.equal(canonicalEvidenceBundleSchema.safeParse(constrained).success, true);
  const large = structuredClone(bundle);
  large.networkEvents = large.networkEvents.map(e => ({ ...e, timestampMs: 1000 }));
  large.gpcImpactCapture!.windows = [{ durationMs: 250, requestCount: large.networkEvents.length, requestSetSha256: gpcImpactRequestSetHash(large.networkEvents) }];
  const bounded = compactCanonicalEvidenceBundleForRetention(large);
  assert.equal(bounded.gpcImpactCapture?.retentionStatus, "incomplete", "large restoration does not lift the 16 KiB addition cap");
  assert.deepEqual(bounded.gpcImpactCapture?.windows, large.gpcImpactCapture!.windows);
});

test("canonical bundle retention keeps report-critical evidence under 400 KB excluding screenshots", () => {
  const bundle = oversizedGoogleLikeBundle();
  assert.ok(Buffer.byteLength(JSON.stringify(bundle)) > 400 * 1024);

  const compacted = compactCanonicalEvidenceBundleForRetention(bundle);
  const serializedBytes = Buffer.byteLength(JSON.stringify(compacted));

  assert.ok(serializedBytes <= 400 * 1024, `expected compacted bundle <= 400 KB, got ${serializedBytes} bytes`);
  assert.equal(compacted.runtimeCoverage?.coverageStatus, "usable");
  assert.equal(compacted.runtimeCoverage?.observationCounts.thirdPartyRequests, 3);
  assert.equal(compacted.runtimeCoverage?.observationCounts.cookieEvents, 8);
  assert.equal(compacted.derivedRuntimeSignals.preConsentTrackingObserved, true);
  assert.equal(compacted.derivedRuntimeSignals.thirdPartyCookiesPreConsentObserved, true);
  assert.equal(compacted.consentUiObservations[0]?.rejectControlObserved, true);
  assert.equal(compacted.policySurfaceObservations.map((surface) => surface.surfaceType).sort().join(","), "privacy_policy,terms");
  assert.ok(compacted.networkEvents.some((event) => event.thirdParty === true && event.cookieNamesSent.includes("NID")));
  assert.ok(compacted.cookieEvents.some((event) => event.cookieName === "NID"));
  assert.ok(compacted.observedJourneys.some((journey) => journey.journeyType === "cookie" && journey.displayName === "NID"));
  assert.equal(compacted.observedJourneys.some((journey) => journey.attributionStatus === "site_owned_infrastructure"), false);
});

test("busy-page retention preserves redirected document proof, bounded GPC windows and collection responses", () => {
  const bundle = oversizedGoogleLikeBundle();
  for (const [index, status] of [[70, 302], [90, 200]] as const) {
    Object.assign(bundle.networkEvents[index]!, { isMainFrame: true, resourceType: "document", collectionEndpointObserved: false });
    bundle.networkResponseEvents[index]!.status = status;
  }
  bundle.networkEvents[90]!.parentRequestId = bundle.networkEvents[70]!.requestId;
  bundle.networkEvents[90]!.redirectChainRequestIds = [bundle.networkEvents[70]!.requestId];
  bundle.networkEvents[120]!.collectionEndpointObserved = true;
  bundle.networkResponseEvents[120]!.status = 204;
  bundle.gpcImpactCapture = { contractVersion: "certscore.gpc-impact-capture.v1", scope: "page_http_request_attempts_after_document_commit",
    expectedEnabled: false, captureStartedAtMs: 0, capturedAtMs: 1500, readbackDocumentToken: "loader",
    document: { token: "loader", urlSha256: "a".repeat(64), committedAtMs: 940, secGpc: null }, requestsDropped: 0,
    windows: [{ durationMs: 250, requestCount: 40, requestSetSha256: gpcImpactRequestSetHash(bundle.networkEvents.filter(event=>event.timestampMs>=940&&event.timestampMs<1190)) }], limitationKeys: [] };
  const result = compactCanonicalEvidenceBundleForRetention(bundle);
  for (const index of [70, 90, 120]) {
    assert.ok(result.networkEvents.some(event=>event.eventId === bundle.networkEvents[index]!.eventId));
    assert.ok(result.networkResponseEvents.some(event=>event.requestId === bundle.networkEvents[index]!.requestId));
  }
  assert.equal(result.gpcImpactCapture?.retentionStatus, undefined);
  assert.ok(result.networkEvents.length<=140);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=400*1024);
});

test("busy-page retention preserves exact CMP loader response pairs without synthesizing missing responses", () => {
  const bundle = oversizedGoogleLikeBundle();
  const [completed, pending] = [bundle.networkEvents[70]!, bundle.networkEvents[90]!];
  // These otherwise-unreferenced middle events are displaced by the bounded
  // first/last samples. A CMP observation must retain their exact transport proof.
  bundle.cmpRuntimeObservations = [{
    observationId: "cmp-loader", observedAtMs: 1000, sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent", entity: "OneTrust", vendor: "OneTrust",
    confidence: 0.95, directVsInferred: "direct", evidenceRefs: [],
    signals: [completed, pending].map(event => ({ signalType: "script_url", matchedField: "hostname",
      matchedValueRedacted: event.hostname, sourceEventId: event.eventId, confidence: 0.95, resolverBasis: [] })),
  }];
  const original = structuredClone(bundle.networkResponseEvents[70]!);
  bundle.networkResponseEvents = bundle.networkResponseEvents.filter(event => event.requestId !== pending.requestId);
  const result = compactCanonicalEvidenceBundleForRetention(bundle);
  assert.ok(result.networkEvents.some(event => event.eventId === completed.eventId));
  assert.ok(result.networkEvents.some(event => event.eventId === pending.eventId));
  assert.ok(result.networkResponseEvents.some(event => event.eventId === original.eventId && event.requestId === original.requestId && event.status === original.status));
  assert.equal(result.networkResponseEvents.some(event => event.requestId === pending.requestId), false);
  assert.deepEqual(result.cmpRuntimeObservations, bundle.cmpRuntimeObservations);
  assert.ok(result.networkEvents.length <= 140 && result.networkResponseEvents.length <= 100);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 400 * 1024);
});

test("late canonical CMP initialization survives compaction without an earlier probe reference", () => {
  const bundle = oversizedGoogleLikeBundle();
  const late = bundle.networkEvents[90]!;
  Object.assign(late, { hostname: "cdn.cookielaw.org", registrableDomain: "cookielaw.org", thirdParty: true, firstParty: false,
    resourceType: "script", url: "https://cdn.cookielaw.org/scripttemplates/202509.1.0/otBannerSdk.js",
    requestUrl: "https://cdn.cookielaw.org/scripttemplates/202509.1.0/otBannerSdk.js" });
  const response = bundle.networkResponseEvents[90]!;
  Object.assign(response, { hostname: late.hostname, url: late.url, responseUrl: late.url, status: 200 });
  // A publisher can reference every routine request. CMP priority must beat
  // that traffic, while the separate navigation/collection tier stays higher.
  bundle.consentUiObservations[0]!.evidenceRefs = bundle.networkEvents.map(event => ({
    refId: `busy_${event.eventId}`, eventId: event.eventId, eventType: "network_request", label: "Retained request",
  }));
  for (const event of bundle.networkEvents) if (event !== late) {
    event.thirdParty = true; event.firstParty = false; event.cookieNamesSent = ["identifier"];
  }
  const originalObservations = structuredClone(bundle.cmpRuntimeObservations);
  const originalSignals = structuredClone(bundle.derivedRuntimeSignals);
  const result = compactCanonicalEvidenceBundleForRetention(bundle);
  assert.ok(result.networkEvents.some(event => event.eventId === late.eventId));
  assert.ok(result.networkResponseEvents.some(event => event.requestId === late.requestId && event.status === 200));
  assert.deepEqual(result.cmpRuntimeObservations, originalObservations, "Retention cannot create CMP observations");
  assert.equal(result.derivedRuntimeSignals.preConsentTrackingObserved, originalSignals.preConsentTrackingObserved);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 400 * 1024);
});

test("canonical bundle retention does not convert CMP-only activity into pre-consent tracking", () => {
  const bundle = oversizedGoogleLikeBundle();
  const cookieJourney = bundle.observedJourneys.find((journey) => journey.displayName === "NID");
  assert.ok(cookieJourney);
  bundle.observedJourneys = [{
    ...cookieJourney,
    journeyId: "journey_cmp_consent_cookie",
    key: "cookie:cmp_consent",
    displayName: "cmp_consent",
    vendor: "Example CMP",
    purpose: "consent_management",
    relatedCookies: ["cmp_consent"],
    relatedEndpoints: ["https://cmp.example.test/consent"],
    relatedVendors: ["Example CMP"],
  }];
  bundle.derivedRuntimeSignals.preConsentTrackingObserved = true;

  const compacted = compactCanonicalEvidenceBundleForRetention(bundle);

  assert.equal(compacted.derivedRuntimeSignals.preConsentTrackingObserved, false);
  assert.equal(compacted.derivedRuntimeSignals.thirdPartyCookiesPreConsentObserved, false);
});

test("canonical bundle retention caps module timing breakdowns before schema validation", () => {
  const bundle = oversizedGoogleLikeBundle();
  bundle.modulesRun[0] = {
    ...bundle.modulesRun[0]!,
    timingBreakdown: Array.from({ length: 45 }, (_, index) => ({
      label: `policy timing ${index}`,
      durationMs: index + 1,
      detail: `retained diagnostic ${index}`,
      outcome: "completed" as const,
    })),
  };

  assert.throws(() => canonicalEvidenceBundleSchema.parse(bundle), /at most 40 element/);

  const compacted = compactCanonicalEvidenceBundleForRetention(bundle);
  const timingBreakdown = compacted.modulesRun[0]?.timingBreakdown ?? [];

  assert.equal(timingBreakdown.length, 40);
  assert.equal(timingBreakdown[39]?.label, "timing entries truncated");
  assert.match(timingBreakdown[39]?.detail ?? "", /6 timing breakdown entries omitted/);
  assert.equal(timingBreakdown[39]?.durationMs, 255);
  assert.equal(timingBreakdown[0]?.outcome, "completed");
  assert.equal(timingBreakdown[39]?.outcome, "skipped");
});

test("retains the full pre-consent transfer total after response diagnostics are compacted", () => {
  const bundle = oversizedGoogleLikeBundle();
  bundle.siteResourceSizeSummary = summarizeSiteResourceSizes(bundle.networkResponseEvents);

  const compacted = compactCanonicalEvidenceBundleForRetention(bundle);

  assert.equal(bundle.siteResourceSizeSummary.responseCount, 180);
  assert.equal(bundle.siteResourceSizeSummary.totalTransferBytes, 180 * 24_600);
  assert.deepEqual(compacted.siteResourceSizeSummary, bundle.siteResourceSizeSummary);
  assert.equal(compacted.networkResponseEvents.every((event) => event.sizes === undefined), true);
});

test("canonical evidence rejects duplicate policy observation identities", () => {
  const bundle = oversizedGoogleLikeBundle();
  const privacyPolicy = bundle.policySurfaceObservations.find((observation) =>
    observation.surfaceType === "privacy_policy"
  );
  assert.ok(privacyPolicy);

  assert.throws(
    () => canonicalEvidenceBundleSchema.parse({
      ...bundle,
      policySurfaceObservations: [privacyPolicy, { ...privacyPolicy }],
    }),
    /Duplicate policy surface observationId/,
  );
});

test("root and action graph bytes never displace existing canonical evidence during compaction", () => {
  const bundle = oversizedGoogleLikeBundle();
  bundle.postAcceptEvidence = postAcceptEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_accept_evidence.v1", artifactOnly: true, productionProjectable: false,
    scanId: "accept", parentScanId: bundle.scanId, targetUrl: "https://example.test/", normalizedUrl: "https://example.test/",
    observationBranch: "accept_only", phase: "post_action", consentAction: "accept",
    startedAt: bundle.startedAt, completedAt: bundle.completedAt,
    resolver: { found: false, method: "local_fixture_recipe", confidence: 0, recipeId: "fixture" },
    acceptanceRegistration: { status: "not_attempted", acceptanceExercised: false, reason: "fixture", witnesses: [] },
    observationWindowMs: 0, timing: { dispatchDelayMs: 0, navigationMs: 0, resolverMs: 0, confirmationMs: 0, observationMs: 0, totalMs: 0, readyAtMs: 0 },
    network: { requests: [], postAcceptNonEssentialRequests: [], activeRequestIdsAtAcceptanceRegistration: [] },
    storage: { preAction: [], postAction: [], writesAfterAccept: [], itemsCreatedOrChangedAfterAccept: [] },
    observations: [], cancellation: { requested: false, outcome: "not_requested" }, limitations: [],
  });
  const baseline = compactCanonicalEvidenceBundleForRetention(bundle);
  const graph = (scenario: "pre_consent" | "post_accept") => {
    const builder = new RuntimeEvidenceGraphBuilder({ scanId: bundle.scanId, captureId: `fixture:${scenario}`, scenario, mode: "project", startedAt: bundle.startedAt, browserVersion: "fixture" });
    for (let index = 0; index < 500; index++) builder.handle("main", "Network.requestWillBeSent", { requestId: String(index), frameId: "frame", loaderId: "document", documentURL: "https://example.test/", request: { url: `https://example.test/${index}`, method: "GET" }, initiator: { type: "other" } });
    return builder.finish();
  };
  const root = graph("pre_consent"); const action = graph("post_accept");
  const retained = compactCanonicalEvidenceBundleForRetention({ ...bundle, runtimeEvidenceGraphs: [root], postAcceptEvidence: { ...bundle.postAcceptEvidence, runtimeEvidenceGraph: action } });
  assert.deepEqual(retained.runtimeEvidenceGraphs, [root]);
  assert.deepEqual(retained.postAcceptEvidence?.runtimeEvidenceGraph, action);
  delete retained.runtimeEvidenceGraphs; delete retained.postAcceptEvidence!.runtimeEvidenceGraph;
  assert.deepEqual(retained, baseline);
});

function oversizedGoogleLikeBundle(): CanonicalEvidenceBundle {
  const startedAt = "2026-06-22T16:15:13.179Z";
  const networkEvents = Array.from({ length: 180 }, (_, index) => networkEvent(index));
  const networkResponseEvents = networkEvents.map((event, index) => networkResponseEvent(event, index));
  const cookieEvents = Array.from({ length: 8 }, (_, index) => cookieEvent(index));
  const observedJourneys: CanonicalEvidenceBundle["observedJourneys"] = [
    ...Array.from({ length: 160 }, (_, index) => lowSignalEndpointJourney(index)),
    {
      journeyId: "journey_cookie_nid",
      journeyType: "cookie",
      key: "cookie:nid",
      displayName: "NID",
      vendor: "Google",
      purpose: "advertising",
      sourceScanner: "pre_consent_runtime",
      scenariosObserved: ["fresh_pre_consent"],
      firstObservedAtMs: 950,
      lastObservedAtMs: 950,
      firstObservedConsentState: "pre_consent",
      consentStatesObserved: ["pre_consent"],
      firstPartyOrThirdParty: "third_party",
      entryPoint: "https://www.google.com/",
      entryPointSourceEventId: "cookie_0",
      relatedCookies: ["NID"],
      relatedScripts: [],
      relatedEndpoints: ["https://googleads.g.doubleclick.net/pagead/id"],
      relatedVendors: ["Google"],
      relatedVendorObservationIds: [],
      observedBehaviors: ["cookie_set"],
      eventRefs: [{
        eventId: "cookie_0",
        eventType: "cookie",
        timestampMs: 950,
        label: "NID",
        behavior: "cookie_set",
        thirdParty: true,
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
      }],
      confidence: 0.9,
      directVsInferred: "direct",
      evidenceRefs: [{
        refId: "evidence_cookie_0",
        eventId: "cookie_0",
        eventType: "cookie",
        label: "NID cookie set before consent",
      }],
    },
    {
      journeyId: "journey_tracker_doubleclick",
      journeyType: "tracker",
      key: "tracker:doubleclick",
      displayName: "DoubleClick",
      vendor: "Google",
      purpose: "advertising",
      sourceScanner: "pre_consent_runtime",
      scenariosObserved: ["fresh_pre_consent"],
      firstObservedAtMs: 880,
      lastObservedAtMs: 880,
      firstObservedConsentState: "pre_consent",
      consentStatesObserved: ["pre_consent"],
      firstPartyOrThirdParty: "third_party",
      entryPoint: "https://googleads.g.doubleclick.net/pagead/id",
      entryPointSourceEventId: "net_0",
      relatedCookies: ["NID"],
      relatedScripts: [],
      relatedEndpoints: ["https://googleads.g.doubleclick.net/pagead/id"],
      relatedVendors: ["Google"],
      relatedVendorObservationIds: [],
      observedBehaviors: ["third_party_request_observed", "cookie_sent", "identifier_parameter_observed"],
      eventRefs: [{
        eventId: "net_0",
        eventType: "network_request",
        timestampMs: 880,
        url: "https://googleads.g.doubleclick.net/pagead/id",
        label: "DoubleClick request",
        behavior: "cookie_sent",
        thirdParty: true,
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
      }],
      confidence: 0.86,
      directVsInferred: "direct",
      evidenceRefs: [{
        refId: "evidence_net_0",
        eventId: "net_0",
        eventType: "network_request",
        label: "DoubleClick request before consent",
      }],
    },
  ];

  return canonicalEvidenceBundleSchema.parse({
    scanId: "scan_google_like_large",
    url: "https://google.com/",
    normalizedUrl: "https://google.com/",
    startedAt,
    completedAt: "2026-06-22T16:15:19.634Z",
    region: "eu-west-1",
    scanProfile: getScanProfile("quick"),
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt,
      completedAt: "2026-06-22T16:15:17.319Z",
      durationMs: 4126,
      evidenceRefs: [],
      errors: [],
    }],
    runtimeTimeline: [...networkEvents, ...networkResponseEvents, ...cookieEvents],
    networkEvents,
    networkResponseEvents,
    cookieEvents,
    cookieSnapshots: [{
      artifactId: "cookies_pre_consent",
      capturedAtMs: 4100,
      consentStateAtTime: "pre_consent",
      cookies: cookieEvents.map((event) => ({
        name: event.cookieName,
        domain: event.cookieDomain ?? ".google.com",
        path: "/",
        sourceEventId: event.eventId,
      })),
      cookieNames: cookieEvents.map((event) => event.cookieName),
      evidenceRefs: [],
    }],
    storageSnapshots: [],
    scriptEvents: [],
    iframeEvents: [],
    consentUiObservations: [{
      observationId: "consent_ui_google",
      observedAtMs: 1700,
      likelyPresent: true,
      basis: ["control:reject_all:Reject all", "control:accept_all:Accept all"],
      textExcerpt: "Before you continue to Google",
      layerInspected: "first_layer",
      visibleChoiceLabels: ["Reject all", "Accept all"],
      acceptControlObserved: true,
      rejectControlObserved: true,
      managePreferencesControlObserved: true,
      controls: [
        { label: "Reject all", actionType: "reject_all", tagName: "button", selectorHint: "#W0wltc", visible: true },
        { label: "Accept all", actionType: "accept_all", tagName: "button", selectorHint: "#L2AGLb", visible: true },
      ],
      evidenceRefs: [{ refId: "consent_ui_ref", artifactId: "screenshot_pre", eventType: "consent_ui" }],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    collectionSurfaceObservations: [],
    consentInteractionEvents: [],
    policySurfaceObservations: [{
      observationId: "privacy_policy",
      surfaceType: "privacy_policy",
      url: "https://policies.google.com/privacy",
      normalizedUrl: "https://policies.google.com/privacy",
      discoveryMethod: "page_text_link",
      status: "fetched",
      textExcerpt: "Google Privacy Policy",
      evidenceRefs: [{ refId: "privacy_ref", url: "https://policies.google.com/privacy" }],
      artifactRefs: [{ artifactId: "privacy_artifact", artifactType: "json", path: "privacy.json", label: "Privacy policy" }],
      confidence: 0.95,
      directVsInferred: "direct",
    }, {
      observationId: "terms",
      surfaceType: "terms",
      url: "https://policies.google.com/terms",
      normalizedUrl: "https://policies.google.com/terms",
      discoveryMethod: "page_text_link",
      status: "fetched",
      textExcerpt: "Google Terms of Service",
      evidenceRefs: [{ refId: "terms_ref", url: "https://policies.google.com/terms" }],
      artifactRefs: [{ artifactId: "terms_artifact", artifactType: "json", path: "terms.json", label: "Terms" }],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    cmpRuntimeObservations: [],
    screenshots: [{
      artifactId: "screenshot_pre",
      path: "screenshot-pre-consent.png",
      url: "https://google.com/",
      capturedAtMs: 1800,
      pagePhase: "dom_content_loaded",
      consentStateAtTime: "pre_consent",
    }],
    domSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys,
    derivedRuntimeSignals: {
      thirdPartyVendorsObserved: false,
      preConsentTrackingObserved: true,
      thirdPartyCookiesPreConsentObserved: true,
      consentBannerLikelyPresent: true,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      journeySummary: {
        journeyCount: observedJourneys.length,
        vendorJourneyCount: 0,
        productJourneyCount: 0,
        trackerJourneyCount: 1,
        cookieJourneyCount: 1,
        scriptJourneyCount: 0,
        endpointJourneyCount: 160,
        activeCollectionJourneyCount: 1,
        consentManagementJourneyCount: 0,
        notes: [],
      },
      notes: [],
    },
    runtimeCoverage: {
      coverageStatus: "usable",
      limitationKeys: [],
      fallbackModesUsed: [],
      observationCounts: {
        networkEvents: networkEvents.length,
        thirdPartyRequests: 3,
        cookieEvents: cookieEvents.length,
        cookiesBeforeConsent: 3,
        normalizedVendors: 0,
        observedJourneys: observedJourneys.length,
      },
      silentEmpty: false,
      notes: [],
    },
    artifactRefs: [{ artifactId: "screenshot_pre", artifactType: "screenshot", path: "screenshot-pre-consent.png", label: "Pre-consent screenshot" }],
    scannerVersion: "certscore-scan-core-v2-test",
    schemaVersion: SCHEMA_VERSION,
  });
}

function networkEvent(index: number): NetworkEvent {
  const thirdParty = index < 3;
  const hostname = thirdParty ? "googleads.g.doubleclick.net" : "www.google.com";
  return {
    eventId: `net_${index}`,
    eventType: "network_request",
    timestampMs: 800 + index,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: `https://${hostname}/resource-${index}?client=abc123&id=${index}`,
    hostname,
    registrableDomain: thirdParty ? "doubleclick.net" : "google.com",
    firstParty: !thirdParty,
    thirdParty,
    topLevelUrl: "https://google.com/",
    initiatorStack: Array.from({ length: 12 }, (_, stackIndex) => `at googleBootstrap${stackIndex} (https://${hostname}/bundle-${index}.js:${stackIndex}:1)`),
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    requestId: `req_${index}`,
    method: "GET",
    resourceType: index === 0 ? "fetch" : "script",
    requestUrl: `https://${hostname}/resource-${index}?client=abc123&id=${index}`,
    normalizedUrl: `https://${hostname}/resource-${index}`,
    requestHostname: hostname,
    path: `/resource-${index}`,
    queryParamNames: ["client", "id"],
    identifierParamNames: index === 0 ? ["id"] : [],
    advertisingClickIdParamNames: [],
    tagContainerParamNames: [],
    hasIdentifierLikeParameters: index === 0,
    hasAdvertisingClickIdParameters: false,
    hasTagContainerParameters: false,
    isMainFrame: index === 10,
    isSubFrame: false,
    isThirdParty: thirdParty,
    requestHeaders: {
      secFetchSite: thirdParty ? "cross-site" : "same-origin",
      cookieHeaderPresent: index === 0,
      cookieNames: index === 0 ? ["NID"] : [],
      authorizationHeaderPresent: false,
    },
    cookieHeaderPresent: index === 0,
    cookieNamesSent: index === 0 ? ["NID"] : [],
    authorizationHeaderPresent: false,
    collectionEndpointObserved: index === 0,
    endpointSubtype: thirdParty ? "google_ads_or_measurement" : "google_owned_infrastructure",
    attributionStatus: thirdParty ? "unresolved_meaningful" : "site_owned_infrastructure",
    attributionReason: thirdParty ? "third_party_identifier_request" : "google_owned_infrastructure",
    resolverBasis: [`hostname:${hostname}`, `path:/resource-${index}`, `resource_type:script`],
  };
}

function networkResponseEvent(request: NetworkEvent, index: number): NetworkResponseEvent {
  return {
    eventId: `resp_${index}`,
    eventType: "network_response",
    timestampMs: request.timestampMs + 50,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: request.requestUrl,
    hostname: request.hostname,
    registrableDomain: request.registrableDomain,
    firstParty: request.firstParty,
    thirdParty: request.thirdParty,
    topLevelUrl: "https://google.com/",
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    requestId: request.requestId,
    responseUrl: request.requestUrl,
    normalizedUrl: request.normalizedUrl,
    status: 200,
    contentType: "application/javascript",
    mimeType: "application/javascript",
    setCookieHeaders: index === 0 ? ["NID=redacted; Secure; SameSite=None"] : [],
    setCookieMetadata: index === 0 ? [{ name: "NID", domain: ".google.com", path: "/", secure: true, firstParty: false, thirdParty: true }] : [],
    cookieNamesSet: index === 0 ? ["NID"] : [],
    responseHeaders: { contentType: "application/javascript", cacheControl: "private, max-age=0", etagPresent: true },
    cacheHeaders: { cacheControl: "private, max-age=0", expires: "Mon, 22 Jun 2026 16:15:14 GMT" },
    accessControlHeaders: { accessControlAllowOrigin: "*" },
    timing: {
      startTime: index,
      domainLookupStart: index + 1,
      domainLookupEnd: index + 2,
      connectStart: index + 3,
      connectEnd: index + 4,
      requestStart: index + 5,
      responseStart: index + 6,
      responseEnd: index + 7,
    },
    sizes: { requestHeadersSize: 500, responseHeadersSize: 600, responseBodySize: 24000 },
  };
}

function cookieEvent(index: number): CookieEvent {
  const cookieName = index === 0 ? "NID" : `CONSENT_${index}`;
  return {
    eventId: `cookie_${index}`,
    eventType: "cookie",
    timestampMs: 950 + index,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    url: "https://www.google.com/",
    hostname: "google.com",
    registrableDomain: "google.com",
    firstParty: index !== 0,
    thirdParty: index === 0,
    evidenceRefs: [],
    confidence: 0.95,
    directVsInferred: "direct",
    cookieName,
    cookieDomain: ".google.com",
    cookiePath: "/",
    secure: true,
    httpOnly: false,
    sourceRequestId: index === 0 ? "req_0" : undefined,
    sourceResponseEventId: index === 0 ? "resp_0" : undefined,
    cookieParty: index === 0 ? "third_party" : "first_party",
    vendorAssociated: false,
    cookiePurpose: index === 0 ? "advertising" : "consent_management",
    cookieClassificationBasis: [index === 0 ? "third_party" : "first_party", index === 0 ? "name:advertising" : "name:consent_management"],
    operation: "set_cookie_header",
    valueRedacted: true,
  };
}

function lowSignalEndpointJourney(index: number): CanonicalEvidenceBundle["observedJourneys"][number] {
  return {
    journeyId: `journey_infra_${index}`,
    journeyType: "endpoint",
    key: `endpoint:https://www.google.com/resource-${index}`,
    displayName: "www.google.com",
    sourceScanner: "pre_consent_runtime",
    scenariosObserved: ["fresh_pre_consent"],
    firstObservedAtMs: 800 + index,
    lastObservedAtMs: 800 + index,
    firstObservedConsentState: "pre_consent",
    consentStatesObserved: ["pre_consent"],
    firstPartyOrThirdParty: "first_party",
    entryPoint: `https://www.google.com/resource-${index}`,
    entryPointSourceEventId: `net_${Math.min(index + 3, 179)}`,
    relatedCookies: [],
    relatedScripts: [],
    relatedEndpoints: [`https://www.google.com/resource-${index}`],
    relatedVendors: [],
    relatedVendorObservationIds: [],
    observedBehaviors: [],
    endpointSubtype: "google_owned_infrastructure",
    attributionStatus: "site_owned_infrastructure",
    attributionReason: "google_owned_infrastructure",
    resolverBasis: [`hostname:www.google.com`, `path:/resource-${index}`, "resource_type:script", "google_endpoint_subtype:google_owned_infrastructure"],
    eventRefs: [{
      eventId: `net_${Math.min(index + 3, 179)}`,
      eventType: "network_request",
      timestampMs: 800 + index,
      url: `https://www.google.com/resource-${index}`,
      label: "Google infrastructure request",
      firstParty: true,
      thirdParty: false,
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
    }],
    confidence: 0.52,
    directVsInferred: "inferred",
    evidenceRefs: [],
  };
}


test("redirect navigation proof outranks a saturated advertising comparison window at both retention caps", () => {
  const bundle = oversizedGoogleLikeBundle();
  for (const event of bundle.networkEvents) {
    Object.assign(event, { collectionEndpointObserved: true, thirdParty: true, firstParty: false, cookieNamesSent: ["ad_id"], timestampMs: 1100 });
  }
  for (const index of [70, 90]) {
    Object.assign(bundle.networkEvents[index]!, { isMainFrame: true, resourceType: "document", collectionEndpointObserved: false,
      thirdParty: false, firstParty: true, cookieNamesSent: [], timestampMs: 900 + index });
    bundle.networkResponseEvents[index]!.status = index === 70 ? 302 : 200;
  }
  bundle.networkEvents[90]!.parentRequestId = bundle.networkEvents[70]!.requestId;
  bundle.networkEvents[90]!.redirectChainRequestIds = [bundle.networkEvents[70]!.requestId];
  const window = bundle.networkEvents.filter(event => event.timestampMs >= 1000);
  bundle.gpcImpactCapture = { contractVersion: "certscore.gpc-impact-capture.v1", scope: "page_http_request_attempts_after_document_commit",
    expectedEnabled: false, captureStartedAtMs: 0, capturedAtMs: 1500, readbackDocumentToken: "loader",
    document: { token: "loader", urlSha256: "a".repeat(64), committedAtMs: 1000, secGpc: null }, requestsDropped: 0,
    windows: [{ durationMs: 250, requestCount: window.length, requestSetSha256: gpcImpactRequestSetHash(window) }], limitationKeys: [] };
  for (const budget of [400 * 1024, 1]) {
    const result = compactCanonicalEvidenceBundleForRetention(bundle, budget);
    for (const index of [70, 90]) {
      assert.ok(result.networkEvents.some(event => event.eventId === bundle.networkEvents[index]!.eventId));
      assert.ok(result.networkResponseEvents.some(event => event.requestId === bundle.networkEvents[index]!.requestId));
    }
    assert.ok(result.networkEvents.length <= 140 && result.networkResponseEvents.length <= 100);
    assert.equal(result.gpcImpactCapture?.retentionStatus, "incomplete");
    assert.deepEqual(result.gpcImpactCapture?.windows, bundle.gpcImpactCapture.windows);
  }
});

test("new page-HTTP policy retains a complete short interval when the long interval exceeds event caps", () => {
  const bundle = oversizedGoogleLikeBundle();
  bundle.networkEvents = bundle.networkEvents.map((e, i) => ({...e, timestampMs: i < 33 ? 1000+i : 1450}));
  const nav=bundle.networkEvents.at(-1)!;
  Object.assign(nav,{isMainFrame:true,resourceType:"document",timestampMs:900});
  bundle.networkEvents[100]!.collectionEndpointObserved=true;
  bundle.gpcImpactCapture={contractVersion:"certscore.gpc-impact-capture.v1",scope:"page_http_request_attempts_after_document_commit",
    comparisonPolicy:"page_http_signal.v1",expectedEnabled:false,captureStartedAtMs:0,capturedAtMs:2100,readbackDocumentToken:"loader",
    document:{token:"loader",urlSha256:"a".repeat(64),committedAtMs:1000,secGpc:null},requestsDropped:0,limitationKeys:[],
    windows:([250,500,1000] as const).map(durationMs=>{const events=bundle.networkEvents.filter(e=>e.timestampMs>=1000&&e.timestampMs<1000+durationMs);
      return {durationMs,requestCount:events.length,requestSetSha256:gpcImpactRequestSetHash(events)};})};
  const retained=compactCanonicalEvidenceBundleForRetention(bundle,1);
  assert.ok(retained.networkEvents.length<=80);
  assert.ok(retained.networkEvents.some(e=>e.eventId===nav.eventId));
  assert.ok(retained.networkEvents.some(e=>e.eventId===bundle.networkEvents[100]!.eventId));
  const early=retained.networkEvents.filter(e=>e.timestampMs>=1000&&e.timestampMs<1250);
  assert.equal(early.length,33);
  assert.equal(gpcImpactRequestSetHash(early),bundle.gpcImpactCapture.windows[0]!.requestSetSha256);
  assert.equal(retained.gpcImpactCapture?.retentionStatus,"incomplete","The longer windows remain incomplete");
  assert.deepEqual(retained.gpcImpactCapture?.windows,bundle.gpcImpactCapture.windows);
});
