import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { postAcceptReportProjectionSchema } from '@certscore/contracts';
import { projectPostAcceptForms } from './post-accept-form-projection';
import { observedControlAssessment } from './test-fixtures/observed-control-assessment';

const proof = {contractVersion:'certscore.consent_action_control_proof.v1',action:'accept',observedAtMs:90,
  accessibleLabel:'Accept all',labelSource:'visible_text',actionSemantics:'direct_label',classifierIntent:'accept',
  classifierConfidence:1,recipeId:'fixture',selectorHint:'#accept',visible:true,enabled:true,uniquelyActionable:true,authorizedTargetSha256:'a'.repeat(64)};
const form = {formRef:'accept_frame_0_collection_form_0',structure:'native_form',surfaceType:'contact',title:'Contact',pageUrl:'https://example.test/',method:'post',actionRelationship:'unknown',candidateFieldCount:0,retainedFieldCount:0,fieldsTruncated:false,fields:[],confidence:1,directVsInferred:'direct'};
const projection = postAcceptReportProjectionSchema.parse({
  contractVersion:'certscore.post_accept_report_projection.v1',completedAt:'2026-10-02T10:00:00.000Z',
  actionControlProof:proof,evidenceDisposition:'indeterminate',indeterminateReason:'acceptance_not_confirmed',
  contradictionObserved:false,observationCount:0,observationWindowMs:500,packetSha256:'b'.repeat(64),
  postAcceptActivity:[],productionProjectable:false,acceptanceExercised:false,registrationStatus:'unconfirmed',resolverMethod:'cmp_registry_recipe',status:'unconfirmed',
  interactionDiagnostics:{resolver:{snapshots:[],truncated:false},navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:true},click:{outcome:'completed',reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}},
  formCapture:{version:'post_accept_form_capture.v1',phase:'after_accept_click',sessionId:randomUUID(),exactTargetSha256:'a'.repeat(64),actionDispatchedAtMs:100,status:'limited',reasonCodes:['capture_limit'],inspectedFrameCount:1,candidateFrameCount:2,
    frames:[{frameRef:'main',documentToken:randomUUID(),documentUrl:'https://example.test/',capturedAtMs:120,forms:[form]}]},
});
test('after-click forms require a valid retained projection and observed first-layer Accept, without promoting registration',()=>{
  const source={consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:projection};
  const result=projectPostAcceptForms(source);
  assert.equal(result.rows.length,1); assert.equal(result.limited,true);
  assert.equal(result.rows[0]?.capturePhase,'after_accept_click');
  assert.equal(result.rows[0]?.captureProvenance?.packetSha256,projection.packetSha256);
  assert.equal(result.rows[0]?.captureProvenance?.capturedAtMs,120);
  assert.equal(result.rows[0]?.snapshot.status,'unavailable');
  assert.equal(projection.registrationStatus,'unconfirmed');
  assert.deepEqual(projectPostAcceptForms({...source,consentControlAssessment:undefined}).rows,[]);
  for(const patch of [{packetSha256:undefined},{actionControlProof:undefined},{formCapture:{...projection.formCapture,exactTargetSha256:'c'.repeat(64)}}]) {
    assert.deepEqual(projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...projection,...patch}}).rows,[]);
  }
});


test('verified registered form metadata produces After Accept image URLs without altering the control assessment',()=>{
  const inventory={contractVersion:'certscore.post_accept_form_inventory.v1',sourceLane:'accept_observation',phase:'after_accept',coverage:'bounded_sample',pageUrl:form.pageUrl,forms:[{...form,formRef:'collection_form_0'}]};
  const formSnapshotCapture={contractVersion:'certscore.post_accept_form_snapshots.v1',phase:'after_accept',sessionId:randomUUID(),exactTargetSha256:'a'.repeat(64),
    actionDispatchedAtMs:100,acceptanceRegisteredAtMs:110,capturedAtMs:150,documentIdentity:{source:'cdp_loader_id',token:'loader'},inventory,
    snapshots:[{contractVersion:'certscore.collection-surface-snapshot.v1',formRef:'collection_form_0',pageUrl:form.pageUrl,capturedAt:'2026-10-06T10:00:00.000Z',
      sourceInventoryHash:'c'.repeat(64),mimeType:'image/jpeg',valuesMasked:true,status:'available',width:640,height:400,sha256:'d'.repeat(64),sizeBytes:1000}]};
  const value={...projection,formCapture:undefined,formSnapshotCapture,acceptanceRegisteredAtMs:110,acceptanceExercised:true,registrationStatus:'confirmed',status:'confirmed_clean',evidenceDisposition:'confirmed',indeterminateReason:null};
  const source={consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:value};
  const rows=projectPostAcceptForms(source).rows;
  assert.equal(rows.length,1);assert.equal(rows[0]?.snapshot.status,'available');
  assert.ok(rows[0]?.snapshot.status==='available' && rows[0].snapshot.url.includes('after_accept%3Acollection_form_0'));
  assert.equal(observedControlAssessment.controls.accept.state,'observed');
  assert.deepEqual(projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,registrationStatus:'unconfirmed',acceptanceExercised:false}}).rows,[]);
});

test('versioned late-form metadata reaches the same After Accept image URL without changing consent findings',()=>{
  const inventory={contractVersion:'certscore.post_accept_form_inventory.v1',sourceLane:'accept_observation',phase:'after_accept',coverage:'bounded_sample',pageUrl:form.pageUrl,forms:[{...form,formRef:'collection_form_0'}]};
  const value={...projection,formCapture:undefined,observationWindowMs:3000,packetSha256:'b'.repeat(64),
    acceptanceRegisteredAtMs:110,acceptanceExercised:true,registrationStatus:'confirmed',status:'confirmed_clean',evidenceDisposition:'confirmed',indeterminateReason:null,
    formSnapshotCapture:{contractVersion:'certscore.post_accept_form_snapshots.v2',phase:'after_accept',sessionId:randomUUID(),exactTargetSha256:'a'.repeat(64),
      actionDispatchedAtMs:100,acceptanceRegisteredAtMs:110,capturedAtMs:3600,
      lateForm:{baseCaptureDeadlineAtMs:3110,detectedAtMs:2500,extensionMs:1500},documentIdentity:{source:'cdp_loader_id',token:'loader'},inventory,
      snapshots:[{contractVersion:'certscore.collection-surface-snapshot.v1',formRef:'collection_form_0',pageUrl:form.pageUrl,capturedAt:'2026-10-06T10:00:00.000Z',
        sourceInventoryHash:'c'.repeat(64),mimeType:'image/jpeg',valuesMasked:true,status:'available',width:640,height:400,sha256:'d'.repeat(64),sizeBytes:1000}]}};
  const source={consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:value};
  const rows=projectPostAcceptForms(source).rows;
  assert.equal(rows.length,1);
  assert.equal(rows[0]?.snapshot.status,'available');
  assert.equal(observedControlAssessment.controls.accept.state,'observed');
  assert.deepEqual(projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,formSnapshotCapture:{...value.formSnapshotCapture,
    lateForm:{...value.formSnapshotCapture.lateForm,detectedAtMs:1000}}}}).rows,[]);
});

test('later same-document form inventory enriches rows without inventing a second image',()=>{
  const email={fieldRef:'collection_form_0_field_0',controlIndex:0,elementType:'input',inputType:'email',semanticCategory:'email',
    label:'Email',required:false,disabled:false,readOnly:false,evidenceRefs:[],confidence:0.9,directVsInferred:'direct'};
  const name={...email,fieldRef:'collection_form_0_field_1',controlIndex:1,inputType:'text',semanticCategory:'name',label:'Name'};
  const disclosure={version:1,truncated:false,excerpts:[{text:'We use your personal data to handle your request.',
    association:'inside_form',links:[{label:'Privacy policy',url:'https://example.test/privacy'}]}]};
  const first={...form,formRef:'collection_form_0',candidateFieldCount:1,retainedFieldCount:1,fields:[email],privacyDisclosure:disclosure};
  const later={...first,privacyDisclosure:undefined,candidateFieldCount:2,retainedFieldCount:2,fields:[email,name]};
  const second={...form,formRef:'collection_form_1',candidateFieldCount:1,retainedFieldCount:1,
    fields:[{...email,fieldRef:'collection_form_1_field_0',controlIndex:2}]};
  const inventory={contractVersion:'certscore.post_accept_form_inventory.v1',sourceLane:'accept_observation',phase:'after_accept',
    coverage:'bounded_sample',pageUrl:form.pageUrl,forms:[first]};
  const value={...projection,formCapture:undefined,observationWindowMs:3000,acceptanceRegisteredAtMs:110,
    acceptanceExercised:true,registrationStatus:'confirmed',status:'confirmed_clean',evidenceDisposition:'confirmed',indeterminateReason:null,
    formSnapshotCapture:{contractVersion:'certscore.post_accept_form_snapshots.v5',phase:'after_accept',sessionId:randomUUID(),
      exactTargetSha256:'a'.repeat(64),actionDispatchedAtMs:100,acceptanceRegisteredAtMs:110,capturedAtMs:3600,
      lateForm:{baseCaptureDeadlineAtMs:3110,detectedAtMs:2500,extensionMs:9500},
      documentIdentity:{source:'cdp_loader_id',token:'loader'},inventory,
      postCaptureInventory:{capturedAtMs:4300,documentIdentity:{source:'cdp_loader_id',token:'loader'},
        inventory:{...inventory,forms:[later,second]}},
      snapshots:[{contractVersion:'certscore.collection-surface-snapshot.v1',formRef:'collection_form_0',pageUrl:form.pageUrl,
        capturedAt:'2026-10-06T10:00:00.000Z',sourceInventoryHash:'c'.repeat(64),mimeType:'image/jpeg',valuesMasked:true,
        status:'available',width:640,height:400,sha256:'d'.repeat(64),sizeBytes:1000}]}};
  const source={consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:value};
  const rows=projectPostAcceptForms(source).rows;
  assert.equal(rows.length,2);
  assert.equal(rows[0]?.form.fields.length,2);
  assert.equal(rows[0]?.snapshot.status,'available');
  assert.equal(rows[1]?.snapshot.status,'unavailable');
  assert.deepEqual(rows[0]?.form.privacyDisclosure,disclosure);
  assert.equal(rows[1]?.form.privacyDisclosure,undefined);
  assert.equal(later.privacyDisclosure,undefined, 'source inventory must remain unchanged for image hash verification');
  const secondCapture={...value.formSnapshotCapture,contractVersion:"certscore.post_accept_form_snapshots.v6",
    postCaptureSnapshots:{capturedAtMs:5000,snapshots:[{...value.formSnapshotCapture.snapshots[0],formRef:second.formRef}]}};
  const withSecond=projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,formSnapshotCapture:secondCapture}}).rows;
  assert.equal(withSecond[1]?.snapshot.status,"available");
  assert.equal(withSecond[0]?.captureProvenance?.capturedAtMs,3600);
  assert.equal(withSecond[1]?.captureProvenance?.capturedAtMs,5000);
  assert.deepEqual(withSecond[0]?.form.privacyDisclosure,disclosure);
  assert.equal(withSecond[1]?.form.privacyDisclosure,undefined);

  const withLaterForms=(forms:unknown[])=>projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,
    formSnapshotCapture:{...value.formSnapshotCapture,postCaptureInventory:{...value.formSnapshotCapture.postCaptureInventory,
      inventory:{...value.formSnapshotCapture.postCaptureInventory.inventory,forms}}}}}).rows;
  const laterDisclosure={...disclosure,excerpts:[{...disclosure.excerpts[0],text:'Updated retained disclosure.'}]};
  assert.deepEqual(withLaterForms([{...later,privacyDisclosure:laterDisclosure},second])[0]?.form.privacyDisclosure,laterDisclosure);
  assert.deepEqual(withLaterForms([{...later,privacyDisclosure:{...disclosure,excerpts:[]}},second])[0]?.form.privacyDisclosure,disclosure);
  assert.equal(withLaterForms([{...later,actionRelationship:'third_party'},second])[0]?.form.privacyDisclosure,undefined);
  assert.equal(withLaterForms([{...later,pageUrl:'https://example.test/other'},second])[0]?.form.privacyDisclosure,undefined);
  assert.deepEqual(withLaterForms([later,{...second,formRef:later.formRef}]),[], 'ambiguous form identity must fail closed');

  assert.deepEqual(projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,
    formSnapshotCapture:{...value.formSnapshotCapture,postCaptureInventory:{...value.formSnapshotCapture.postCaptureInventory,
      documentIdentity:{source:'cdp_loader_id',token:'other'}}}}}).rows,[]);
  assert.deepEqual(projectPostAcceptForms({...source,postAcceptEvidenceProjection:{...value,
    formSnapshotCapture:{...value.formSnapshotCapture,postCaptureInventory:{...value.formSnapshotCapture.postCaptureInventory,
      inventory:{...value.formSnapshotCapture.postCaptureInventory.inventory,
        forms:[{...later,fields:[{...email,controlIndex:99},name]},second]}}}}}).rows,[]);
});
