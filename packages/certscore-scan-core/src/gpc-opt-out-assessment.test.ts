import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gpcOptOutPrototypeSchema, gpcOptOutObservationSchema, canonicalEvidenceBundleSchema, gpcResponseAssessmentSchema } from "@certscore/contracts";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime.js";
import { buildGpcOptOutPrototype, type GpcPrototypeArtifact } from "./gpc-opt-out-assessment.js";

function source(value: unknown, name = "gpc"): GpcPrototypeArtifact {
  const bytes = Buffer.from(JSON.stringify(value));
  return { bytes, pointer: { sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, uri: `s3://fixture/${name}.json` } };
}
function fixture() {
  const gpc = gpcRuntimeFixture({ enabled: true, vendors: [{ name: "Ads" }] });
  gpc.gpcSignalObservation!.prototypeCaptureBinding = { captureId: "1a111111-1111-4111-8111-111111111111", documentIdentitySource: "cdp_loader_id", documentToken: "fixture-loader" };
  gpc.completedAt = new Date(Date.parse(gpc.startedAt) + 2000).toISOString();
  gpc.networkEvents[1]!.collectionEndpointObserved = true;
  const usca = { apiVersion: "1.1", sectionId: 8, sectionVersion: 1, cmpStatus: "loaded", signalStatus: "ready",
    saleNotice: 1, sharingNotice: 1, saleOptOut: 1, sharingOptOut: 1, gpc: true as boolean | null };
  const observation = { contractVersion: "certscore.gpc-opt-out-observation.prototype.v1", adapterVersion: "gpc_usca_and_live_status.v1",
    scanId: gpc.scanId, documentUrlSha256: gpc.gpcSignalObservation!.documentUrlSha256,
    captureBinding: { ...gpc.gpcSignalObservation!.prototypeCaptureBinding },
    documentStartedAtMs: 0, capturedAtMs: 1000, navigatorGpc: true, gppStatus: "observed", usca,
    stateSha256: createHash("sha256").update(JSON.stringify(usca)).digest("hex"), acknowledgment: [], limitationKeys: [] };
  return { gpc, observation };
}
function run(f = fixture()) {
  const gpc = source(f.gpc);
  return buildGpcOptOutPrototype({ scanId: f.gpc.scanId, gpc, observation: source({
    contractVersion: "certscore.retained-gpc-opt-out-observation.prototype.v1",
    gpcArtifactSha256: gpc.pointer.sha256, observation: f.observation,
  }, "state") });
}

test("prototype retains independently proven facets without a baseline and never projects or scores", () => {
  const result = run();
  assert.equal(result.delivery.http.status, "observed");
  assert.equal(result.registration.status, "opt_out_recorded");
  assert.equal(result.behavior.collectionRequestCount, 1);
  assert.equal(result.baselineComparison, null);
  assert.equal(result.release.eligible, false);
  assert.equal(result.productionProjectable, false);
  assert.equal(result.scoreEffect, "none");
});
test("quiet failure and worker uncertainty preserve direct request and registration evidence, not absence", () => {
  const f = fixture();
  f.gpc.modulesRun[0]!.timingBreakdown![0]!.outcome = "timed_out";
  f.gpc.gpcSignalObservation!.workerCount = 1;
  const r = run(f);
  assert.equal(r.delivery.fullContext.status, "unknown");
  assert.equal(r.delivery.http.status, "observed");
  assert.equal(r.registration.status, "opt_out_recorded");
  assert.equal(r.behavior.status, "activity_observed");
  assert.equal(r.behavior.captureComplete, false);
  f.gpc.normalizedVendorObservations = [];
  assert.equal(run(f).behavior.status, "unknown");
});
test("legacy replay cannot invent registration and delivery alone is not substantive completion", () => {
  const r = buildGpcOptOutPrototype({ scanId: "gpc-fixture", gpc: source(gpcRuntimeFixture({ enabled: true })) });
  assert.equal(r.delivery.http.status, "observed");
  assert.equal(r.registration.status, "unknown");
  assert.deepEqual(r.substantiveEvidence, { registration: false, collectionActivity: false });
  assert.equal(r.behavior.status, "no_qualified_activity_observed_in_capture");
});
test("resource loading does not count as substantive collection evidence", () => {
  const f = fixture(); f.gpc.networkEvents[1]!.collectionEndpointObserved = false;
  const r = buildGpcOptOutPrototype({ scanId: f.gpc.scanId, gpc: source(f.gpc) });
  assert.equal(r.behavior.status, "activity_observed");
  assert.equal(r.substantiveEvidence.collectionActivity, false);
});
test("a purpose needs its own direct retained request anchor and ambiguous purposes remain limited", () => {
  for (const mode of ["missing", "late", "ambiguous"]) {
    const f = fixture();
    if (mode === "missing") f.gpc.normalizedVendorObservations[0]!.matchedEvidenceIds = ["missing"];
    if (mode === "late") f.gpc.networkEvents[1]!.timestampMs = 1500;
    if (mode === "ambiguous") f.gpc.normalizedVendorObservations.push({ ...f.gpc.normalizedVendorObservations[0]!, observationId: "other", purpose: "analytics" });
    assert.equal(run(f).behavior.requestCount, 0);
  }
});
for (const defect of ["checksum", "size", "scan", "document", "late_navigation", "header"]) {
  test(`prototype fails closed for invalid source: ${defect}`, () => {
    const f = fixture();
    if (defect === "scan") f.gpc.scanId = "other";
    if (defect === "document") f.gpc.networkEvents[0]!.requestUrl += "?other=1";
    if (defect === "late_navigation") f.gpc.networkEvents.push({ ...f.gpc.networkEvents[0]!, eventId: "later", timestampMs: 1100 });
    if (defect === "header") f.gpc.networkEvents[0]!.requestHeaders = {};
    const gpc = source(f.gpc);
    if (defect === "checksum") gpc.pointer.sha256 = "0".repeat(64);
    if (defect === "size") gpc.pointer.sizeBytes++;
    const r = buildGpcOptOutPrototype({ scanId: "gpc-fixture", gpc, observation: source(f.observation) });
    assert.equal(r.delivery.http.status, "unknown");
    assert.equal(r.registration.status, "unknown");
    assert.equal(r.behavior.requestCount, 0);
  });
}
for (const defect of ["hash", "wrong_scan", "wrong_document", "wrong_epoch", "stale", "future", "changed_document", "unready", "wrong_attempt", "same_url_reload", "missing_binding"]) {
  test(`invalid semantic sidecar does not erase unrelated activity: ${defect}`, () => {
    const f = fixture();
    if (defect === "wrong_attempt") f.observation.captureBinding.captureId = "2a222222-2222-4222-8222-222222222222";
    if (defect === "same_url_reload") f.observation.captureBinding.documentToken = "reloaded-same-url";
    if (defect === "missing_binding") delete f.gpc.gpcSignalObservation!.prototypeCaptureBinding;
    if (defect === "hash") f.observation.stateSha256 = "0".repeat(64);
    if (defect === "wrong_scan") f.observation.scanId = "other";
    if (defect === "wrong_document") f.observation.documentUrlSha256 = "0".repeat(64);
    if (defect === "wrong_epoch") f.observation.documentStartedAtMs = 1;
    if (defect === "stale") { f.gpc.networkEvents[0]!.timestampMs = 10; f.observation.capturedAtMs = 1; }
    if (defect === "future") f.observation.capturedAtMs = 2001;
    if (defect === "changed_document") (f.observation.limitationKeys as string[]).push("document_changed_during_semantic_readback");
    if (defect === "unready") f.observation.usca.signalStatus = "not ready";
    assert.equal(run(f).registration.status, "unknown");
    assert.equal(run(f).behavior.collectionRequestCount, 1);
  });
}
test("partial/mixed/zero GPP values are not registered sale/sharing opt-out", () => {
  for (const [sale, sharing, expected] of [[2, 2, "opt_out_not_recorded"], [1, 2, "mixed_or_incomplete"], [0, 0, "mixed_or_incomplete"]] as const) {
    const f = fixture(); f.observation.usca.saleOptOut = sale; f.observation.usca.sharingOptOut = sharing;
    f.observation.stateSha256 = createHash("sha256").update(JSON.stringify(f.observation.usca)).digest("hex");
    assert.equal(run(f).registration.status, expected);
  }
});
test("schemas reject invented completion, score eligibility and inconsistent observation proof", () => {
  const r = run();
  assert.equal(gpcOptOutPrototypeSchema.safeParse({ ...r, productionProjectable: true }).success, false);
  assert.equal(gpcOptOutPrototypeSchema.safeParse({ ...r, behavior: { ...r.behavior, requestCount: 20 } }).success, false);
  assert.equal(gpcOptOutPrototypeSchema.safeParse({ ...r, registration: { ...r.registration, evidenceRefs: [] } }).success, false);
  assert.equal(gpcOptOutObservationSchema.safeParse({ ...fixture().observation, gppStatus: "not_ready" }).success, false);
});

test("recorded state and a received GPC flag never establish causation", () => {
  for (const value of [true, false, null]) {
    const f = fixture(); f.observation.usca.gpc = value;
    f.observation.stateSha256 = createHash("sha256").update(JSON.stringify(f.observation.usca)).digest("hex");
    const r = run(f);
    assert.equal(r.registration.status, "opt_out_recorded", "retain the actual current state");
    assert.equal(r.registration.cmpGpcSignal, value === true ? "received" : value === false ? "not_received" : "unknown");
    assert.equal(r.registration.causedByGpc, "not_established");
  }
});
test("same-scan semantic evidence from a different source bundle fails closed", () => {
  const f = fixture(), gpc = source(f.gpc);
  const observation = source({ contractVersion: "certscore.retained-gpc-opt-out-observation.prototype.v1",
    gpcArtifactSha256: "0".repeat(64), observation: f.observation });
  const r = buildGpcOptOutPrototype({ scanId: f.gpc.scanId, gpc, observation });
  assert.equal(r.registration.status, "unknown");
  assert.equal(r.behavior.collectionRequestCount, 1);
});
test("duplicate event identities, unclassified requests, CMP traffic and ambiguous products cannot establish collection", () => {
  for (const mode of ["duplicate_id", "unclassified", "cmp", "ambiguous_product"]) {
    const f = fixture();
    if (mode === "duplicate_id") f.gpc.networkEvents.push({ ...f.gpc.networkEvents[1]! });
    if (mode === "unclassified") f.gpc.normalizedVendorObservations = [];
    if (mode === "cmp") f.gpc.normalizedVendorObservations[0]!.purpose = "consent_management";
    if (mode === "ambiguous_product") f.gpc.normalizedVendorObservations.push({ ...f.gpc.normalizedVendorObservations[0]!, observationId: "other", product: "other" });
    assert.equal(run(f).substantiveEvidence.collectionActivity, false);
  }
});

test("prototype readback and state cannot enter canonical assessment or bundle persistence", () => {
  const f = fixture(), r = run(f);
  assert.equal(gpcResponseAssessmentSchema.safeParse(r).success, false);
  const persisted = canonicalEvidenceBundleSchema.parse({ ...f.gpc, gpcOptOutObservation: f.observation, gpcOptOutPrototype: r });
  assert.equal("gpcOptOutObservation" in persisted, false);
  assert.equal("gpcOptOutPrototype" in persisted, false);
  assert.equal(persisted.gpcResponseAssessment, undefined);
  assert.equal(r.sources.filter(s => s.kind === "runtime_bundle").length, 1);
  assert.equal(r.sources.filter(s => s.kind === "semantic_readback").length, 1);
});
test("a pre-existing displayed status without GPP state is acknowledgment only", () => {
  const f = fixture(), observation = { ...f.observation, usca: null, stateSha256: null, gppStatus: "unavailable",
    acknowledgment: [{ cmp: "OneTrust", scopeSelector: "#onetrust-banner-sdk", message: "Opt-Out Request Honored", source: "visible_cmp_live_status" }] };
  const gpc = source(f.gpc);
  const r = buildGpcOptOutPrototype({ scanId: f.gpc.scanId, gpc, observation: source({
    contractVersion: "certscore.retained-gpc-opt-out-observation.prototype.v1", gpcArtifactSha256: gpc.pointer.sha256, observation }) });
  assert.equal(r.acknowledgment.status, "observed");
  assert.equal(r.registration.status, "unknown");
  assert.equal(r.substantiveEvidence.registration, false);
});
