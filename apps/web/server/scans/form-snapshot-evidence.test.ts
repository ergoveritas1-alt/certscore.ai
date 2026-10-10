import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { buildCollectionSurfaceInventory } from "../../../../packages/certscore-scan-core/src/collection-surface-inventory";
import { verifiedFormSnapshots, verifiedPostAcceptFormSnapshots, verifiedPostAcceptFormSnapshotForRow } from "./form-snapshot-evidence";
import { postAcceptFormCaptureSchema, postAcceptFormSnapshotCaptureSchema } from "@certscore/contracts";
import { projectPostAcceptForms } from "../../lib/scans/post-accept-form-projection";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";

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
  const {acceptanceRegisteredAtMs:_registered,...common}=capture;
  const afterClick={...common,contractVersion:"certscore.post_accept_form_snapshots.v7",
    phase:"after_accept_click",captureDeadlineAtMs:3100};
  assert.deepEqual(verifiedPostAcceptFormSnapshots(afterClick)?.images[0]?.bytes,bytes);
  for(const change of [{acceptanceRegisteredAtMs:110},{capturedAtMs:3101},
    {lateForm:{baseCaptureDeadlineAtMs:3100,detectedAtMs:2500,extensionMs:1500}},
    {snapshots:[{...image,sha256:"b".repeat(64)}]}])
    assert.equal(verifiedPostAcceptFormSnapshots({...afterClick,...change}),null);
  const withheld=verifiedPostAcceptFormSnapshots({...afterClick,
    snapshots:[{...image,status:"withheld",reason:"review_withheld",data:undefined}]});
  assert.equal(withheld?.images[0]?.bytes,null);
  const extended = { ...capture, contractVersion: "certscore.post_accept_form_snapshots.v2",
    capturedAtMs: 3600, lateForm: { baseCaptureDeadlineAtMs: 3120, detectedAtMs: 2500, extensionMs: 1500 } };
  assert.deepEqual(verifiedPostAcceptFormSnapshots(extended)?.images[0]?.bytes, bytes);
  assert.equal(verifiedPostAcceptFormSnapshots({ ...extended,
    lateForm: { ...extended.lateForm, detectedAtMs: 1000 } }), null);
  for (const change of [{sourceInventoryHash:"a".repeat(64)},{sha256:"b".repeat(64)},{data:Buffer.from("changed").toString("base64")},{formRef:"collection_form_99"},{status:"withheld"}]) {
    assert.equal(verifiedPostAcceptFormSnapshots({...capture,snapshots:[{...image,...change}]}),null);
  }
  assert.equal(verifiedPostAcceptFormSnapshots({...capture,inventory:{...inventory,sourceLane:"runtime_evidence"}}),null);
  const second={...base.forms[0]!,formRef:"collection_form_1",fields:base.forms[0]!.fields.map(field=>({...field,fieldRef:"collection_form_1_field_0",controlIndex:1}))};
  const laterInventory={...inventory,forms:[...inventory.forms,second]};
  const later={...capture,contractVersion:"certscore.post_accept_form_snapshots.v6",capturedAtMs:3600,
    lateForm:{baseCaptureDeadlineAtMs:3110,detectedAtMs:2500,extensionMs:9500},
    postCaptureInventory:{capturedAtMs:4300,documentIdentity:capture.documentIdentity,inventory:laterInventory},
    postCaptureSnapshots:{capturedAtMs:5000,snapshots:[{...image,formRef:second.formRef,sourceInventoryHash:sha(JSON.stringify(laterInventory))}]}};
  const verified=verifiedPostAcceptFormSnapshots(later);assert.equal(verified?.images.length,2);
  assert.deepEqual(verified?.images[1]?.bytes,bytes);assert.equal(verified?.images[1]?.capturedAtMs,5000);
  for(const change of [{sourceInventoryHash:image.sourceInventoryHash},{sha256:"b".repeat(64)},{formRef:image.formRef}])
    assert.equal(verifiedPostAcceptFormSnapshots({...later,postCaptureSnapshots:{...later.postCaptureSnapshots,
      snapshots:[{...later.postCaptureSnapshots.snapshots[0],...change}]}}),null);
  assert.equal(verifiedPostAcceptFormSnapshots({...later,postCaptureSnapshots:{...later.postCaptureSnapshots,capturedAtMs:4299}}),null);
  assert.equal(verifiedPostAcceptFormSnapshots({...later,postCaptureSnapshots:{...later.postCaptureSnapshots,capturedAtMs:12611}}),null);

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

test("reconciled terminal form fields preserve retrievable original pixels and reject changed row provenance",()=>{
  const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
  const base=buildCollectionSurfaceInventory({pageUrl:'https://example.test/',inspectedFieldCandidateCount:1,
    candidateScanTruncated:false,rows:[{groupKey:'form',structure:'native_form',inputType:'email',elementType:'input',
      required:false,disabled:false,readOnly:false,domOrder:0}]},Date.now());
  const inventory={contractVersion:'certscore.post_accept_form_inventory.v1',sourceLane:'accept_observation',
    phase:'after_accept',coverage:'bounded_sample',pageUrl:base.pageUrl,forms:base.forms};
  const bytes=Buffer.from([0xff,0xd8,0xff,0xd9]);
  const formSnapshotCapture=postAcceptFormSnapshotCaptureSchema.parse({contractVersion:'certscore.post_accept_form_snapshots.v7',
    phase:'after_accept_click',sessionId:randomUUID(),exactTargetSha256:sha(base.pageUrl),actionDispatchedAtMs:100,
    captureDeadlineAtMs:3100,capturedAtMs:200,documentIdentity:{source:'cdp_loader_id',token:'loader'},inventory,
    snapshots:[{contractVersion:'certscore.collection-surface-snapshot.v1',formRef:base.forms[0]!.formRef,pageUrl:base.pageUrl,
      capturedAt:new Date().toISOString(),sourceInventoryHash:sha(JSON.stringify(inventory)),mimeType:'image/jpeg',valuesMasked:true,
      status:'available',width:1,height:1,sizeBytes:bytes.length,sha256:sha(bytes),data:bytes.toString('base64')}]});
  const form=base.forms[0]!;
  const formCapture=postAcceptFormCaptureSchema.parse({version:'post_accept_form_capture.v3',phase:'after_accept_click',
    sessionId:randomUUID(),exactTargetSha256:sha(base.pageUrl),actionDispatchedAtMs:100,status:'captured',reasonCodes:[],
    inspectedFrameCount:1,candidateFrameCount:1,window:{startedAtMs:100,endedAtMs:3100,terminalSampleCompleted:true},
    frames:[{frameRef:'accept_frame_0',documentToken:randomUUID(),documentUrl:base.pageUrl,capturedAtMs:2900,
      documentBinding:{source:'cdp_loader_id',token:'loader',boundAtMs:150},forms:[{...form,formRef:'accept_frame_0_collection_form_0',
        candidateFieldCount:2,retainedFieldCount:2,fields:[...form.fields,{...form.fields[0]!,fieldRef:'collection_form_0_field_1',
          controlIndex:1,inputType:'text',semanticCategory:'name',label:'Name'}]}]}]});
  const projection={contractVersion:'certscore.post_accept_report_projection.v1',completedAt:new Date().toISOString(),
    actionControlProof:{contractVersion:'certscore.consent_action_control_proof.v1',action:'accept',observedAtMs:90,
      accessibleLabel:'Accept',labelSource:'visible_text',actionSemantics:'direct_label',classifierIntent:'accept',classifierConfidence:1,
      recipeId:'fixture',selectorHint:'#accept',visible:true,enabled:true,uniquelyActionable:true,authorizedTargetSha256:sha(base.pageUrl)},
    evidenceDisposition:'indeterminate',indeterminateReason:'acceptance_not_confirmed',contradictionObserved:false,
    observationCount:0,observationWindowMs:3000,packetSha256:'b'.repeat(64),postAcceptActivity:[],productionProjectable:false,
    acceptanceExercised:false,registrationStatus:'unconfirmed',resolverMethod:'cmp_registry_recipe',status:'unconfirmed',
    interactionDiagnostics:{resolver:{snapshots:[],truncated:false},navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:true},
      click:{outcome:'completed',reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}},
    afterActionCapture:{policyVersion:'bounded_after_action_capture.v1',action:'accept',activationStatus:'completed',
      actionDispatchedAtMs:100,captureEndedAtMs:3100,requestedWindowMs:3000,stopReason:'window_elapsed',requestsDropped:0,
      storageSnapshotRetained:false,storageWriteCoverage:'bounded_main_document_sample',storageWrites:[],requestIds:[]},
    afterActionRequests:[],afterActionStorage:[],formCapture,formSnapshotCapture:{...formSnapshotCapture,
      snapshots:formSnapshotCapture.snapshots.map(({data:_bytes,...metadata})=>metadata)}};
  const row=projectPostAcceptForms({consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:projection}).rows[0]!;
  assert.equal(row.form.fields.length,2);
  assert.equal(row.captureProvenance?.sessionId,formCapture.sessionId);
  assert.equal(row.captureProvenance?.capturedAtMs,2900);
  const packet={formSnapshotCapture,formCapture};
  assert.deepEqual(verifiedPostAcceptFormSnapshotForRow(packet,row),bytes);
  for(const patch of [{sessionId:formSnapshotCapture.sessionId},{capturedAtMs:200},{documentToken:'other'},{frameRef:'other'}])
    assert.equal(verifiedPostAcceptFormSnapshotForRow(packet,{...row,captureProvenance:{...row.captureProvenance!,...patch}}),null);
  assert.equal(verifiedPostAcceptFormSnapshotForRow(packet,{...row,form:{...row.form,fields:form.fields}}),null);
  assert.equal(verifiedPostAcceptFormSnapshotForRow(packet,{...row,capturePhase:'after_accept'}),null);
});
