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
  const run = (propertySource?: Parameters<typeof buildGpcProductionObservation>[0]["propertySource"]) => {
    bundle.gpcObservationSession=gpcObservationSessionSchema.parse(bundle.gpcObservationSession);
    bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
    const bytes = Buffer.from(JSON.stringify(bundle));
    return buildGpcProductionObservation({ scanId: bundle.scanId, propertySource, source: { bytes,
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
    assert.deepEqual(result.requests.advertisingCollectionQualification, { policyVersion: "gpc_sale_sharing_evidence.v5",
      rows: [{ policyVersion:"ca_sale_sharing_qualification.v3", evidenceId: event.eventId, activity, basis: activity === "unresolved" ? "endpoint_or_identity_unresolved" : "google_advertising_feature_identifier", processingSignals: [...signals], gpp: decodeGppRequest(new URLSearchParams()) }] });
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

test('same-request GPC POST proof adds a recipient through canonical observation and CA policy',async()=>{
 const {createGpcRequestProofCapture}=await import('./gpc-request-proof');
 const {deriveCaliforniaGpcResponsePolicy}=await import('../../../apps/web/lib/scans/california-gpc-response-policy');
 const url='https://px.ads.linkedin.com/wa/?fmt=a';
 const {bundle,event,run}=collectorFixture(url);
 event.method='POST';
 assert.equal(run().requests.advertisingCollectionQualification?.rows[0]?.activity,'unresolved');
 const session=bundle.gpcObservationSession!,capture=createGpcRequestProofCapture(()=>event.timestampMs+1);
 capture.reserve(event,session.mainDocument!.documentToken,{method:()=>event.method,postData:()=>JSON.stringify({signalType:'PAGE_VISIT',hem:'a'.repeat(64)})})!({'content-type':'text/plain'});
 session.requestProofCapture=capture.finish();
 const observation=run();
 assert.equal(observation.requests.advertisingCollectionQualification?.rows[0]?.basis,'linkedin_hashed_email');
 // The same shared policy consumes the producer-bound observation; no UI shortcut.
 const {buildGpcResponseAssessment}=await import('./gpc-response-assessment');
 const {gpcRuntimeFixture}=await import('../../certscore-contracts/src/test-fixtures/gpc-runtime');
 const {buildUnifiedFindingDisplayPackets}=await import('../../../apps/web/lib/scans/unified-findings');
 const bytes=Buffer.from(JSON.stringify(bundle)),pointer={uri:'fixture.json',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const comparison=buildGpcResponseAssessment({baseline:gpcRuntimeFixture({enabled:false}),baselineArtifact:pointer,gpc:bundle,gpcArtifact:pointer});
 const assessment={...comparison,contractVersion:'certscore.gpc-response-assessment.v3' as const,observation};
 const result=deriveCaliforniaGpcResponsePolicy(assessment);
 assert.equal(result.deductionPoints,15);assert.deepEqual(result.recipientIds,['ent_3ee0b5177739']);
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:assessment},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 const finding=findings.find(f=>f.unifiedFindingId==='gpc_response');
 assert.ok(finding?.scoreEffects?.length);assert.match(finding!.summary,/LinkedIn/);
});

test('the 100-row GPC qualification sample preserves a late distinct recipient after duplicate traffic',()=>{
 const {bundle,event,run}=collectorFixture('https://www.google.com/pagead/conversion/123/?gclid=visitor123');
 const session=bundle.gpcObservationSession!;
 for(let i=0;i<105;i++){
  const url=i===104?'https://px.ads.linkedin.com/collect/?pid=123&li_fat_id=visitor123':event.requestUrl;
  const next={...event,eventId:`late-${i}`,requestId:`late-r-${i}`,requestUrl:url,url,timestampMs:event.timestampMs+i+1};
  bundle.networkEvents.push(next);bundle.networkResponseEvents.push({...next,eventType:'network_response',eventId:`response-${i}`,responseUrl:url,status:200});
  session.requests.push({eventId:next.eventId,timestampMs:next.timestampMs,urlSha256:createHash('sha256').update(url).digest('hex'),secGpc:'1'});session.requestsObserved++;
 }
 bundle.normalizedVendorObservations=resolveVendorObservations(bundle.networkEvents.map(e=>({type:'request' as const,url:e.requestUrl,evidenceId:e.eventId,sourceScanner:'pre_consent_runtime',matchSource:'network_request' as const})));
 const result=run();
 assert.equal(result.requests.advertisingCollectionCount,106);
 assert.equal(result.requests.advertisingCollectionRecipients?.rows.length,100);
 assert.ok(result.requests.advertisingCollectionRecipients?.rows.some(r=>r.entityId==='ent_3ee0b5177739'));
});

test("property-bound owner purpose joins successful GPC-session collection and cannot borrow identity, signal or source proof",()=>{
 const url="https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=123.456&npa=1";
 for(const mode of ["positive","wrong_property","generic","restricted","failed","signal"]){
  const {bundle,event,run}=collectorFixture(mode==="restricted"?url+"&rdp=1":url);
  bundle.policySurfaceObservations=[{observationId:"privacy",surfaceType:"privacy_policy",url:bundle.url+"privacy",sourceScanner:"policy_surface",scenario:"policy_surface_review",consentStateAtTime:"not_applicable",discoveryMethod:"footer_link",status:"fetched",
   targetRelationship:"target_controller",ownershipConfidence:.98,confidence:.98,documentEvaluationState:"usable",documentRole:"policy_document",documentFetchState:"fetched",httpStatus:200,documentLanguage:"en",
   textExcerpt:mode==="generic"?"We use Google Analytics.":`We share data collected through Google Analytics property ${mode==="wrong_property"?"G-OTHER1":"G-ABC123"} with Google for cross-context behavioral advertising.`}];
  if(mode==="failed")bundle.networkResponseEvents[0]!.status=500;
  if(mode==="signal")bundle.gpcObservationSession!.requests.find(r=>r.eventId===event.eventId)!.secGpc=null;
  const result=run();
  const rows=result.requests.advertisingCollectionQualification?.rows??[];
  const {gpcPolicyCollectionEvidenceIds}=require("../../certscore-contracts/src/gpc-bounded-observation");
  assert.equal(gpcPolicyCollectionEvidenceIds(result).length,mode==="positive"?1:0,mode);
  if(mode==="positive"){assert.equal(rows[0]?.activity,"declared_sale_sharing_collection");assert.ok(rows[0]?.propertyEvidence);assert.deepEqual(rows[0]?.processingSignals,["google_npa"]);}
 }
});


test("verified policy worker purpose joins GPC without borrowing its collection; bad corroborating bytes leave direct recipients unchanged",()=>{
 const {bundle,run}=collectorFixture("https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=123.456");
 const policy=structuredClone(bundle);policy.policySurfaceObservations=[{observationId:"privacy",surfaceType:"privacy_policy",url:bundle.url+"privacy",sourceScanner:"policy_surface",scenario:"policy_surface_review",consentStateAtTime:"not_applicable",discoveryMethod:"footer_link",status:"fetched",confidence:.98,
 targetRelationship:"target_controller",ownershipConfidence:.98,documentEvaluationState:"usable",documentRole:"policy_document",documentFetchState:"fetched",httpStatus:200,documentLanguage:"en",textExcerpt:"We use Google Analytics property G-ABC123 for remarketing."}];
 const artifact=()=>{const bytes=Buffer.from(JSON.stringify(policy));return {bytes,pointer:{uri:"s3://fixture/policy.json",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length}};};
 assert.equal(run(artifact()).requests.advertisingCollectionEvidenceIds?.length,1);
 const bad=artifact();bad.pointer.sha256="f".repeat(64);assert.equal(run(bad).requests.advertisingCollectionEvidenceIds?.length,0);
 policy.scanId="other-scan";assert.equal(run(artifact()).requests.advertisingCollectionEvidenceIds?.length,0);
 policy.scanId=bundle.scanId;policy.url="https://other.test/";assert.equal(run(artifact()).requests.advertisingCollectionEvidenceIds?.length,0);
 const direct=collectorFixture("https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture");assert.equal(direct.run(bad).requests.advertisingCollectionEvidenceIds?.length,1);
});

test("body-only Analytics property and identity proof can add a recipient without requiring cookie matching",()=>{
 const {bundle,event,run}=collectorFixture("https://www.google-analytics.com/g/collect");
 event.method="POST";
 bundle.policySurfaceObservations=[{observationId:"privacy",surfaceType:"privacy_policy",url:bundle.url+"privacy",sourceScanner:"policy_surface",scenario:"policy_surface_review",consentStateAtTime:"not_applicable",discoveryMethod:"footer_link",status:"fetched",confidence:.98,
 targetRelationship:"target_controller",ownershipConfidence:.98,documentEvaluationState:"usable",documentRole:"policy_document",documentFetchState:"fetched",httpStatus:200,documentLanguage:"en",textExcerpt:"We use Google Analytics property G-ABC123 for remarketing."}];
 const {captureCaliforniaRejectRequest}=require("./california-reject-request");
 const proof=captureCaliforniaRejectRequest({url:event.requestUrl,method:"POST",requestId:event.requestId,startedAtMs:event.timestampMs,httpStatus:204,hasBody:true,
 body:"v=2&tid=G-ABC123&cid=123.456",headers:{"content-type":"application/x-www-form-urlencoded"}});
 assert.ok(proof.propertyBinding);
 bundle.gpcObservationSession!.requestProofCapture={contractVersion:"gpc_request_capture.v1",inspected:1,skipped:0,pending:0,failed:0,retentionDropped:0,rows:[{eventId:event.eventId,documentToken:"fixture-loader",capturedAtMs:900,proof:{...proof,contractVersion:"gpc_request_proof.v1"}}],restrictions:[]};
 assert.equal(run().requests.advertisingCollectionEvidenceIds?.length,1);
 bundle.gpcObservationSession!.requestProofCapture.rows[0]!.proof.requestId="different-request";
 assert.equal(run().requests.advertisingCollectionEvidenceIds?.length,0);
});
