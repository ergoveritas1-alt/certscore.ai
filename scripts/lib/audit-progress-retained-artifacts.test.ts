import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {retainedArtifactContext,retainedConsentActionStates} from './audit-progress-retained-artifacts';
test('original event and manifest bind every recovered byte; changed source ancestry is rejected',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'audit-original-')),scanId='one';
 const save=(kind:string,data:any)=>{const b=Buffer.from(JSON.stringify(data)),file=path.join(root,kind);writeFileSync(file,b);return {file,kind,uri:'s3://retained/'+kind,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};};
 const bundle=save('scanArtifactUri',{scanId,policySurfaceObservations:[]});
 const manifest=save('manifestUri',{scanId,auxiliaryArtifacts:[],privacyCaptureProfile:'presence_only_six_workers.v1',
  consentActionStages:{version:'certscore.consent-action-stages.v1',scanId,accept:'gate_declined',reject:'packet_deadline_exceeded'},
  acceptGateShadowReceipt:{version:'certscore.accept-gate-shadow-receipt.v1',scanId,enforcementActive:true,
   passive:{outcome:'blocked',blockReason:'control_binding_unverified'},dispatch:{outcome:'not_attempted'},finalRecheck:{outcome:'not_run'}},
  rejectGateShadowReceipt:{version:'certscore.reject-gate-shadow-receipt.v1',scanId,enforcementActive:true,
   passive:{outcome:'qualified'},dispatch:{outcome:'would_allow'},finalRecheck:{outcome:'unavailable'},
   timing:{dispatchObservedAtMs:1,proofExpiresAtMs:10}},
  rejectClickCheckpoint:{version:'certscore.reject-click-checkpoint.v1',scanId,receiptSha256:'a'.repeat(64),gateProofSha256:'b'.repeat(64),
   recheckedAtMs:1,dispatchedAtMs:2,completedAtMs:3,verifiedAtMs:4},
 });
 const entries=[bundle,manifest],event={artifactMetadata:Object.fromEntries(entries.map(r=>[r.kind,{sha256:r.sha256,sizeBytes:r.bytes}])),artifactPointers:Object.fromEntries(entries.map(r=>[r.kind,r.uri]))};
 const payload={events:[{eventType:'v2_lambda_result.received',metadataJson:event}]};
 const ref=save('receipts.json',{version:'certscore.audit-retained-artifacts.v1',scanId,root,receipts:entries});
 const context=retainedArtifactContext(payload,scanId,ref)!;
 assert.equal(context.sourceFacts.facets.cmp_dispatch?.state,'intentionally_omitted');
 const states=retainedConsentActionStates(context.manifest,scanId);
 assert.deepEqual(states,{
  'sealed.detail.accept.coordinator.stage':'gate_declined',
  'sealed.detail.accept.coordinator.passive':'control_binding_unverified',
  'sealed.detail.accept.coordinator.dispatch':'not_attempted',
  'sealed.detail.accept.coordinator.exact_recheck':'not_run',
  'sealed.detail.reject.coordinator.stage':'packet_deadline_exceeded',
  'sealed.detail.reject.coordinator.passive':'qualified',
  'sealed.detail.reject.coordinator.dispatch':'would_allow',
  'sealed.detail.reject.coordinator.exact_recheck':'unavailable',
  'sealed.detail.reject.coordinator.click_checkpoint':'verified',
 });
 assert.deepEqual(retainedConsentActionStates(context.manifest,'wrong-scan'),{});
 const checkpoint=context.manifest.rejectClickCheckpoint;
 checkpoint.scanId='wrong-scan';
 assert.equal(retainedConsentActionStates(context.manifest,scanId)['sealed.detail.reject.coordinator.click_checkpoint'],undefined);
 event.artifactMetadata.scanArtifactUri!.sha256='a'.repeat(64);assert.throws(()=>retainedArtifactContext(payload,scanId,ref),/ancestry/);
 event.artifactMetadata.scanArtifactUri!.sha256=bundle.sha256;writeFileSync(bundle.file,'corrupt');assert.throws(()=>retainedArtifactContext(payload,scanId,ref),/checksum/);
});

test('daily retained-evidence audit decodes the lossless artifact only after original event/receipt verification',async()=>{
 const {serializeCanonicalEvidenceArtifact}=await import('@certscore/contracts/dist/canonical-evidence-artifact.js');
 const {gpcCookieReadWideDictionaryFixture}=await import('../../packages/certscore-scan-core/src/test-fixtures/gpc-cookie-read.cases');
 const fixture=gpcCookieReadWideDictionaryFixture('encoded-audit').bundle,scanId=fixture.scanId;
 const root=mkdtempSync(path.join(tmpdir(),'audit-encoded-'));
 const save=(kind:string,data:any,encoded=false)=>{const b=Buffer.from(encoded?serializeCanonicalEvidenceArtifact(data):JSON.stringify(data)),file=path.join(root,kind);writeFileSync(file,b);return {file,kind,uri:'s3://retained/'+kind,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};};
 const bundle=save('scanArtifactUri',fixture,true),manifest=save('manifestUri',{scanId,auxiliaryArtifacts:[],privacyCaptureProfile:'presence_only_six_workers.v1'});
 const entries=[bundle,manifest],event={artifactMetadata:Object.fromEntries(entries.map(r=>[r.kind,{sha256:r.sha256,sizeBytes:r.bytes}])),artifactPointers:Object.fromEntries(entries.map(r=>[r.kind,r.uri]))};
 const payload={events:[{eventType:'v2_lambda_result.received',metadataJson:event}]};
 const ref=save('receipts.json',{version:'certscore.audit-retained-artifacts.v1',scanId,root,receipts:entries});
 assert.deepEqual(retainedArtifactContext(payload,scanId,ref)?.bundle,JSON.parse(JSON.stringify(fixture)));
 event.artifactMetadata.scanArtifactUri!.sha256='a'.repeat(64);
 assert.throws(()=>retainedArtifactContext(payload,scanId,ref),/ancestry/);
});
