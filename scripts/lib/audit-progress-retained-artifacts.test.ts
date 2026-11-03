import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {retainedArtifactContext} from './audit-progress-retained-artifacts';
test('original event and manifest bind every recovered byte; changed source ancestry is rejected',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'audit-original-')),scanId='one';
 const save=(kind:string,data:any)=>{const b=Buffer.from(JSON.stringify(data)),file=path.join(root,kind);writeFileSync(file,b);return {file,kind,uri:'s3://retained/'+kind,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};};
 const bundle=save('scanArtifactUri',{scanId,policySurfaceObservations:[]}),manifest=save('manifestUri',{scanId,auxiliaryArtifacts:[],privacyCaptureProfile:'presence_only_six_workers.v1'});
 const entries=[bundle,manifest],event={artifactMetadata:Object.fromEntries(entries.map(r=>[r.kind,{sha256:r.sha256,sizeBytes:r.bytes}])),artifactPointers:Object.fromEntries(entries.map(r=>[r.kind,r.uri]))};
 const payload={events:[{eventType:'v2_lambda_result.received',metadataJson:event}]};
 const ref=save('receipts.json',{version:'certscore.audit-retained-artifacts.v1',scanId,root,receipts:entries});
 assert.equal(retainedArtifactContext(payload,scanId,ref)?.sourceFacts.facets.cmp_dispatch?.state,'intentionally_omitted');
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
