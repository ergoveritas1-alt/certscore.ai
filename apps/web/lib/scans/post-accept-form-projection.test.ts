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
