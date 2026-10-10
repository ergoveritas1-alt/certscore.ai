import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postAcceptFormCaptureSchema } from "./post-accept-form-capture";
import { postAcceptFormSnapshotProjectionSchema } from "./post-accept-form-snapshots";
import { reconcilePostAcceptFormInventory } from "./post-accept-form-reconciliation";

function fixture() {
  const fields = Array.from({length:7},(_,i)=>({fieldRef:`collection_form_0_field_${i}`,controlIndex:i,
    elementType:"input",inputType:"text",semanticCategory:"name",label:`Field ${i}`,required:false,
    disabled:false,readOnly:false,evidenceRefs:[],confidence:0.9,directVsInferred:"direct"}));
  const form = {formRef:"collection_form_0",structure:"native_form",surfaceType:"generic_form",pageUrl:"https://example.test/",
    method:"post",actionHostname:"example.test",actionRelationship:"self",candidateFieldCount:3,retainedFieldCount:3,
    fieldsTruncated:false,fields:fields.slice(0,3),confidence:0.9,directVsInferred:"direct"};
  const images = postAcceptFormSnapshotProjectionSchema.parse({contractVersion:"certscore.post_accept_form_snapshots.v1",
    phase:"after_accept",sessionId:randomUUID(),exactTargetSha256:"a".repeat(64),actionDispatchedAtMs:100,
    acceptanceRegisteredAtMs:120,capturedAtMs:500,documentIdentity:{source:"cdp_loader_id",token:"loader"},
    inventory:{contractVersion:"certscore.post_accept_form_inventory.v1",sourceLane:"accept_observation",phase:"after_accept",
      coverage:"bounded_sample",pageUrl:form.pageUrl,forms:[form]},snapshots:[]});
  const capture = postAcceptFormCaptureSchema.parse({version:"post_accept_form_capture.v3",phase:"after_accept_click",
    sessionId:randomUUID(),exactTargetSha256:images.exactTargetSha256,actionDispatchedAtMs:100,status:"captured",reasonCodes:[],
    inspectedFrameCount:1,candidateFrameCount:1,window:{startedAtMs:120,endedAtMs:3120,terminalSampleCompleted:true},
    frames:[{frameRef:"accept_frame_0",documentToken:randomUUID(),documentUrl:form.pageUrl,capturedAtMs:2900,
      documentBinding:{source:"cdp_loader_id",token:"loader",boundAtMs:200},
      forms:[{...form,formRef:"accept_frame_0_collection_form_0",fields,candidateFieldCount:7,retainedFieldCount:7}]}]});
  return {images,capture};
}

test("loader-bound terminal inventory enriches three imaged fields to seven without changing originals",()=>{
  const {images,capture}=fixture(); const original=JSON.stringify({images,capture});
  const result=reconcilePostAcceptFormInventory(images,capture)!;
  assert.equal(result.inventory.forms[0]?.fields.length,7);
  assert.equal(result.structuredFrame?.capturedAtMs,2900);
  assert.equal(result.inventory.forms.length,1);
  assert.equal(JSON.stringify({images,capture}),original);
});

test("click-only images reconcile terminal fields only against the dispatch-anchored window",()=>{
  const {images,capture}=fixture();
  const {acceptanceRegisteredAtMs:_registered,...common}=images;
  const afterClick=postAcceptFormSnapshotProjectionSchema.parse({...common,
    contractVersion:"certscore.post_accept_form_snapshots.v7",phase:"after_accept_click",captureDeadlineAtMs:3100});
  const boundCapture=postAcceptFormCaptureSchema.parse({...capture,
    window:{...capture.window,startedAtMs:100,endedAtMs:3100}});
  assert.equal(reconcilePostAcceptFormInventory(afterClick,boundCapture)?.inventory.forms[0]?.fields.length,7);
  assert.equal(reconcilePostAcceptFormInventory(afterClick,capture)?.structuredFrame,undefined);
  assert.equal(reconcilePostAcceptFormInventory(afterClick,{...boundCapture,frames:[{...boundCapture.frames[0]!,
    documentBinding:{source:"cdp_loader_id",token:"other",boundAtMs:200}}]})?.structuredFrame,undefined);
});

test("historical, incomplete, mismatched and ambiguous captures cannot enrich an imaged form",()=>{
  const {images,capture}=fixture();
  const frame=capture.frames[0]!; const form=frame.forms[0]!;
  const cases=[
    {...capture,version:"post_accept_form_capture.v2" as const,frames:[{...frame,documentBinding:undefined}]},
    {...capture,status:"limited" as const,reasonCodes:["capture_limit" as const]},
    {...capture,window:{...capture.window!,terminalSampleCompleted:false}},
    {...capture,exactTargetSha256:"b".repeat(64)},
    {...capture,actionDispatchedAtMs:101},
    {...capture,window:{...capture.window!,startedAtMs:121}},
    {...capture,frames:[{...frame,documentBinding:{...frame.documentBinding!,token:"other"}}]},
    {...capture,frames:[{...frame,capturedAtMs:400}]},
    {...capture,frames:[{...frame,capturedAtMs:3200}]},
    {...capture,frames:[{...frame,documentUrl:"https://example.test/other"}]},
    {...capture,frames:[{...frame,forms:[form,form]}]},
    {...capture,frames:[{...frame,forms:[{...form,actionHostname:"other.test"}]}]},
    {...capture,frames:[{...frame,forms:[{...form,actionRelationship:"third_party" as const}]}]},
    {...capture,frames:[{...frame,forms:[{...form,fieldsTruncated:true}]}]},
    {...capture,frames:[{...frame,forms:[{...form,fields:form.fields.map((f,i)=>i===0?{...f,label:"Replacement"}:f)}]}]},
    {...capture,frames:[{...frame,forms:[{...form,fields:form.fields.map((f,i)=>i===6?{...f,controlIndex:0}:f)}]}]},
  ];
  for (const candidate of cases) {
    assert.equal(reconcilePostAcceptFormInventory(images,candidate)?.inventory.forms[0]?.fields.length,3,JSON.stringify(candidate));
    assert.equal(reconcilePostAcceptFormInventory(images,candidate)?.structuredFrame,undefined);
  }
  assert.equal(reconcilePostAcceptFormInventory(images)?.inventory.forms[0]?.fields.length,3);
});

test("new binding metadata cannot upgrade legacy records or samples taken before proof",()=>{
  const {capture}=fixture(); const frame=capture.frames[0]!;
  assert.equal(postAcceptFormCaptureSchema.safeParse({...capture,version:"post_accept_form_capture.v2"}).success,false);
  assert.equal(postAcceptFormCaptureSchema.safeParse({...capture,frames:[{...frame,documentBinding:{...frame.documentBinding!,boundAtMs:3000}}]}).success,false);
  assert.equal(postAcceptFormCaptureSchema.safeParse({...capture,frames:[{...frame,frameRef:"accept_frame_1"}]}).success,false);
});

test("a newly retained main form keeps its own reference without borrowing the original image",()=>{
  const {images,capture}=fixture();const frame=capture.frames[0]!;
  const second={...frame.forms[0]!,formRef:'accept_frame_0_collection_form_1',candidateFieldCount:1,retainedFieldCount:1,
    fields:[{...frame.forms[0]!.fields[0]!,controlIndex:7,fieldRef:'collection_form_1_field_0'}]};
  frame.forms.push(second);
  const result=reconcilePostAcceptFormInventory(images,capture)!;
  assert.equal(result.inventory.forms.length,1);
  assert.deepEqual(result.additionalFormRefs,[second.formRef]);
  assert.equal(result.structuredFrame?.forms.length,2);
});
