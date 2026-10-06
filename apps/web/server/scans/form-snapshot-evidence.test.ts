import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { buildCollectionSurfaceInventory } from "../../../../packages/certscore-scan-core/src/collection-surface-inventory";
import { verifiedFormSnapshots, verifiedPostAcceptFormSnapshots } from "./form-snapshot-evidence";

test("After Accept images require phase-owned inventory, exact form binding and original image checksums", () => {
  const base = buildCollectionSurfaceInventory({pageUrl:"https://example.test/",inspectedFieldCandidateCount:1,candidateScanTruncated:false,
    rows:[{groupKey:"form",structure:"native_form",inputType:"email",elementType:"input",required:false,disabled:false,readOnly:false,domOrder:0}]},Date.now());
  const inventory = {contractVersion:"certscore.post_accept_form_inventory.v1",sourceLane:"accept_observation",phase:"after_accept",coverage:"bounded_sample",pageUrl:base.pageUrl,forms:base.forms};
  const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const bytes = Buffer.from([0xff,0xd8,0xff,0xd9]);
  const image = {contractVersion:"certscore.collection-surface-snapshot.v1",formRef:base.forms[0]!.formRef,pageUrl:base.pageUrl,
    capturedAt:new Date().toISOString(),sourceInventoryHash:sha(JSON.stringify(inventory)),mimeType:"image/jpeg",valuesMasked:true,
    status:"available",width:1,height:1,sizeBytes:4,sha256:sha(bytes),data:bytes.toString("base64")};
  const capture = {contractVersion:"certscore.post_accept_form_snapshots.v1",phase:"after_accept",sessionId:randomUUID(),exactTargetSha256:sha(base.pageUrl),
    actionDispatchedAtMs:100,acceptanceRegisteredAtMs:110,capturedAtMs:200,documentIdentity:{source:"cdp_loader_id",token:"document"},inventory,snapshots:[image]};
  assert.deepEqual(verifiedPostAcceptFormSnapshots(capture)?.images[0]?.bytes,bytes);
  for (const change of [{sourceInventoryHash:"a".repeat(64)},{sha256:"b".repeat(64)},{data:Buffer.from("changed").toString("base64")},{formRef:"collection_form_99"},{status:"withheld"}]) {
    assert.equal(verifiedPostAcceptFormSnapshots({...capture,snapshots:[{...image,...change}]}),null);
  }
  assert.equal(verifiedPostAcceptFormSnapshots({...capture,inventory:{...inventory,sourceLane:"runtime_evidence"}}),null);
});

test("form images require inventory, document and byte integrity and never expose withheld bytes", () => {
  const inventory = buildCollectionSurfaceInventory({ pageUrl: "https://example.test/", inspectedFieldCandidateCount: 1, candidateScanTruncated: false, rows: [{ groupKey: "form", structure: "native_form", inputType: "email", elementType: "input", required: false, disabled: false, readOnly: false, domOrder: 0 }] }, Date.now());
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const snapshot = { contractVersion: "certscore.collection-surface-snapshot.v1", formRef: "collection_form_0", pageUrl: inventory.pageUrl, capturedAt: new Date().toISOString(), sourceInventoryHash: sha(JSON.stringify(inventory)), mimeType: "image/jpeg", valuesMasked: true, status: "available", width: 1, height: 1, sizeBytes: bytes.length, sha256: sha(bytes), data: bytes.toString("base64") };
  const verify = (override = {}) => verifiedFormSnapshots({ collectionSurfaceInventory: inventory, collectionSurfaceSnapshots: [{ ...snapshot, ...override }] });
  assert.deepEqual(verify()[0]?.bytes, bytes);
  assert.equal(verify({ reason: "review_timed_out" }).length, 0, "available images cannot carry a failure reason");
  const failure = verify({ status: "unavailable", data: undefined, reason: "review_timed_out" });
  assert.equal(failure[0]?.snapshot.reason, "review_timed_out");
  assert.equal(failure[0]?.bytes, null);
  assert.equal(verify({ status: "unavailable", data: undefined, reason: "guessed" }).length, 0);
  for (const override of [{ sourceInventoryHash: "0".repeat(64) }, { pageUrl: "https://other.test/" }, { formRef: "collection_form_9" }, { sha256: "0".repeat(64) }, { status: "withheld" }]) assert.equal(verify(override).some(item => item.bytes !== null), false);
});
