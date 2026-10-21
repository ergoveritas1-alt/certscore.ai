import assert from "node:assert/strict";
import test from "node:test";
import { compareDurationRows, durationServiceIndex, verifyDurationCheckpoint } from "./gpc-duration-checkpoints";
import type { CanonicalEvidenceBundle, GpcImpactCapture } from "../../packages/certscore-contracts/src";
import { gpcImpactIdentityHash } from "../../packages/certscore-scan-core/src/gpc-impact-capture";

type Row = NonNullable<GpcImpactCapture["requestLedger"]>["rows"][number];
const row = (eventId: string, timestampMs: number, advertising: string[], collection = false): Row => ({eventId,timestampMs,advertising,analytics:[],collection,headersVerified:true,secGpc:"1",urlSha256:"a".repeat(64),attributionUnknown:false});
const index = new Map([["a",{key:"service-a",label:"Service A"}],["b",{key:"service-b",label:"Service B"}],["alias",{key:"service-a",label:"Service A"}]]);

test("additional requests alone are not new meaningful evidence", () => {
  const early=[row("first",1000,["a"],true)];
  const result=compareDurationRows(early,[...early,row("repeat",4000,["a"],true)],index);
  assert.equal(result.meaningful,false);assert.equal(result.repeatOnly,true);assert.equal(result.lateClassifiedRequestCount,1);
});
test("a new canonical service and first collection evidence are counted independently", () => {
  const early=[row("first",1000,["a"])];
  const first=compareDurationRows(early,[...early,row("collection",4000,["a"],true)],index);
  assert.equal(first.meaningful,true);assert.equal(first.newServices.length,0);assert.equal(first.firstCollectionServices.length,1);
  const next=compareDurationRows(early,[...early,row("new",4000,["b"])],index);
  assert.equal(next.meaningful,true);assert.equal(next.newServices.length,1);assert.equal(next.collectionEvidenceGain,false);
});
test("registry aliases and purpose hashes do not double-count the same service", () => {
  const early=[row("first",1000,["a"],true)];
  const result=compareDurationRows(early,[...early,row("alias",4000,["alias"],true)],index);
  assert.equal(result.meaningful,false);assert.equal(result.fiveSeconds.services,1);
});
test("unclassified traffic is retained separately without becoming a finding", () => {
  const result=compareDurationRows([], [row("other",4000,[])],index);
  assert.equal(result.lateRequestCount,1);assert.equal(result.meaningful,false);assert.equal(result.repeatOnly,false);
});
test("unresolved and conflicting service attribution fail closed", () => {
  assert.throws(() => compareDurationRows([], [row("unknown", 4000, ["missing"])], index), /unresolved_retained_service_identity/);
  const bundle = (serviceId: string) => ({normalizedVendorObservations: [{vendor: "Example", product: "Analytics", purpose: "analytics", registryAttribution: {serviceId}}]}) as unknown as CanonicalEvidenceBundle;
  assert.throws(() => durationServiceIndex([bundle("first"), bundle("second")]), /conflicting_retained_service_identity/);
});
test("checkpoint boundaries are half-open and hashes or missing signal proof fail closed", () => {
  const rows=[row("early",1000,["a"]),row("at-three",3100,["b"]),row("at-five",5100,["b"])];
  const bundle={gpcSignalObservation:{capturedAtMs:5200},gpcImpactCapture:{comparisonPolicy:"page_http_signal.v2",expectedEnabled:true,
    document:{committedAtMs:100},requestLedger:{rows},windows:[
      {durationMs:3000,requestCount:1,requestSetSha256:gpcImpactIdentityHash(rows.slice(0,1))},
      {durationMs:5000,requestCount:2,requestSetSha256:gpcImpactIdentityHash(rows.slice(0,2))},
    ]}} as unknown as CanonicalEvidenceBundle;
  assert.equal(verifyDurationCheckpoint(bundle,3000).length,1);assert.equal(verifyDurationCheckpoint(bundle,5000).length,2);
  bundle.gpcSignalObservation!.capturedAtMs=4000;
  assert.throws(()=>verifyDurationCheckpoint(bundle,5000),/unverified/);
  bundle.gpcSignalObservation!.capturedAtMs=5200;
  bundle.gpcImpactCapture!.windows[1]!.requestSetSha256="0".repeat(64);
  assert.throws(()=>verifyDurationCheckpoint(bundle,5000),/unverified/);
});
