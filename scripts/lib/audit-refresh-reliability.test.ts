import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildAuditComparison,readAuditComparison,buildAuditComparisonDelivery,readAuditComparisonDelivery} from '../../packages/certscore-contracts/src/audit-comparison';
import {applyRetainedOptOutExtracts} from './audit-progress-opt-out';
import {auditDataHealth} from './audit-data-health';
import {fitAuditDeltaQuery} from './audit-delta-query';
import {preservePolicyReceipts} from '../configure-audit-receipts';
import {verifyReceiptRelease} from '../verify-audit-receipt-release';
import {verifyPolicyReceiptDelivery,verifyAuditReceiptDelivery} from '../verify-audit-receipt-delivery';
const id='11111111-1111-4111-8111-111111111111',createdAt='2026-11-11T10:00:00.000Z',hash='a'.repeat(64);
const source=()=>({scanId:id,createdAt,bundle:{scanId:id,scannerBuildProvenance:{contractVersion:'scanner_build_provenance.v1',gitSha:'b'.repeat(40)}},manifest:{scanId:id,privacyCaptureProfile:'presence_only_six_workers.v1'},bundleSha256:hash,manifestSha256:'c'.repeat(64)});
const row=():any=>({scanId:id,createdAt,reportable:true,projectionVersion:'scan-report-projection-v27',publicProjectionSourceHash:hash,states:{},refs:[],originRequestId:'creator',originProof:'original_credential_verified'});
const extract=():any=>({scanId:id,created_at:createdAt,isMacMini:true,isCanary:false,originalRequestId:'creator',status:'completed',projection_status:'ready',projection_version:'scan-report-projection-v27',projection_source_hash:hash,projection_payload_sha256:'d'.repeat(64)});
test('comparison provenance is bounded and rejects missing, unverified or foreign source identities',()=>{
 const valid=buildAuditComparison(source());assert.ok(valid);assert.ok(Buffer.byteLength(JSON.stringify(valid))<=512);
 for(const patch of [{bundleSha256:null},{manifestSha256:null},{manifest:{scanId:'other',privacyCaptureProfile:'presence_only_six_workers.v1'}},{bundle:{scanId:id,scannerBuildProvenance:{gitSha:'b'.repeat(40)}}},{manifest:{scanId:id,privacyCaptureProfile:'inferred'}}])assert.equal(buildAuditComparison({...source(),...patch}),null);
 assert.equal(readAuditComparison({...valid,extra:'unreviewed'}),null);
});
test('comparison intake binds original creator, time, ready generation and inventory hash; conflicts fail',()=>{
 const dir=mkdtempSync(join(tmpdir(),'audit-comparison-'));
 const save=(e:any)=>{const file=join(dir,'source-'+Math.random()+'.json'),bytes=Buffer.from(JSON.stringify({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,rows:[e]}));writeFileSync(file,bytes);return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
 try{
  const e={...extract(),auditComparison:buildAuditComparison(source())},r=row(),ref=save(e);
  applyRetainedOptOutExtracts([r],[ref]);assert.deepEqual(r.comparisonMetadata,e.auditComparison);
  for(const patch of [{originalRequestId:'foreign'},{created_at:'2026-11-11T11:00:00Z'},{projection_source_hash:'f'.repeat(64)},{projection_status:'pending'}]){const v=row();applyRetainedOptOutExtracts([v],[save({...e,...patch})]);assert.equal(v.comparisonMetadata,undefined);}
  assert.throws(()=>applyRetainedOptOutExtracts([r],[save({...e,auditComparison:{...e.auditComparison,producer:'f'.repeat(40)}})]),/Conflicting/);
  assert.throws(()=>applyRetainedOptOutExtracts([row()],[{...ref,sha256:'f'.repeat(64)}]),/hash/);
  const historical=row();applyRetainedOptOutExtracts([historical],[save(extract())]);assert.equal(historical.comparisonMetadata,undefined);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual container/date sizing trims only a priority prefix, keeps all receipts and blocks if zero cannot fit',()=>{
 const ids=Array.from({length:100},(_,i)=>{const h=createHash('sha256').update('fit-'+i).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;});
 const b={overlapStartUtc:'2026-11-08T22:41:19.889464+00:00',windowEndUtc:'2026-11-11T13:00:00.000000+00:00',pendingRefreshIds:ids,includePrivacyFormReceipts:true};
 const old=process.env.CALIBRATION_DB_ECS_CONTAINER;
 try{
  process.env.CALIBRATION_DB_ECS_CONTAINER='actual-long-container-name';
  const p=fitAuditDeltaQuery(b,'MACMINI_DELTA_IDS');assert.ok(p.pendingRefreshIds.length<100&&p.pendingRefreshIds.length>0);
  assert.deepEqual([...p.pendingRefreshIds,...p.deferredPendingIds],ids);assert.ok(p.selected.override.fits);
  for(const column of ['control_assessment','choice_audit','auditPrivacyForm','controlAccessibility','policyReceipt','auditComparison'])assert.ok(p.selected.sql.includes(column));
  process.env.CALIBRATION_DB_ECS_CONTAINER='x'.repeat(9000);
  assert.throws(()=>fitAuditDeltaQuery(b,'MACMINI_DELTA_IDS'),/zero pending/);
 }finally{if(old===undefined)delete process.env.CALIBRATION_DB_ECS_CONTAINER;else process.env.CALIBRATION_DB_ECS_CONTAINER=old;}
 assert.deepEqual(b.pendingRefreshIds,ids);
});
const key='CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED',privateKey='CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED';
const task=(value?:string):any=>({containerDefinitions:[{name:'certscore-web',environment:[{name:privateKey,value:'1'},...(value?[{name:key,value}]:[])]}]});
test('explicit policy restoration is independent, verified against the converged exact task, and never implies delivery',()=>{
 const expected=preservePolicyReceipts(task(),task(),'true');assert.equal(expected.containerDefinitions[0].environment[1].value,'1');
 const arn='task:123',services={services:[{status:'ACTIVE',taskDefinition:arn,desiredCount:1,runningCount:1,pendingCount:0,deployments:[{status:'PRIMARY',taskDefinition:arn}]}]};
 const actual={taskDefinition:{...expected,taskDefinitionArn:arn}},proof=verifyReceiptRelease(expected,actual,services,arn);
 assert.equal(proof.deliveryStatus,'pending_next_scheduled_refresh');
 assert.throws(()=>verifyReceiptRelease(expected,{taskDefinition:{...task(),taskDefinitionArn:arn}},services,arn),/drift/);
 assert.throws(()=>verifyReceiptRelease(expected,actual,{services:[{...services.services[0],runningCount:0}]},arn),/converged/);
 assert.throws(()=>verifyReceiptRelease(expected,actual,services,'task:124'));
 const workflow=readFileSync('.github/workflows/web-aws-ecs-deploy.yml','utf8');assert.match(workflow,/audit_policy_receipts:/);assert.ok(workflow.indexOf('Verify materializer receipt configuration')>workflow.indexOf('Wait for ECS services to stabilize'));
});
test('delivery verification requires new generation-bound policy receipts and leaves no-new-data pending',()=>{
 const release={version:'certscore.audit-receipt-release.v1',status:'passed',configurationVerified:true,verifiedAtUtc:'2026-11-11T09:00:00Z',configuration:{[key]:'1'}};
 assert.equal(verifyPolicyReceiptDelivery(release,[],[]).status,'pending');
 assert.equal(verifyPolicyReceiptDelivery(release,[row()],[]).status,'failed');
 const receipt={version:'certscore.audit-policy-provenance.v1',binding:{scanId:id,createdAt,generation:'scan-report-projection-v27',sourceHash:hash},bundle:hash,fetch:'fetched',owner:'producer_declared_usable',text:'producer_verified_complete_receipt'};
 assert.equal(verifyPolicyReceiptDelivery(release,[row()],[{...extract(),policyReceipt:receipt}]).status,'passed');
 assert.equal(verifyPolicyReceiptDelivery(release,[row()],[{...extract(),policyReceipt:{...receipt,binding:{...receipt.binding,sourceHash:'f'.repeat(64)}}}]).status,'failed');
});


test('verified comparison metadata enables only same-build/profile/source cohort candidates',()=>{
 const comparison=buildAuditComparison(source());
 const base={...row(),site:'example.test',region:'california',profile:'not retained in public export',producer:'not retained in public export',assessmentVersion:'pulse-public-v11',defaultSource:'public_export/v11',metricSources:{control:'version1'},comparisonMetadata:comparison};
 const prior={...base,createdAt:'2026-11-10T18:00:00Z'},current={...base,createdAt:'2026-11-11T18:00:00Z'};
 const changed={...current,comparisonMetadata:{...comparison,producer:'e'.repeat(40)}};
 const h=auditDataHealth({windows:[{end:'2026-11-11T20:00:00Z'}]},[prior,current,changed]);
 assert.equal(h.comparability.matchedReports,1);assert.equal(h.comparability.metadataUnavailable,0);
});


const release=()=>({version:'certscore.audit-receipt-release.v1',status:'passed',configurationVerified:true,verifiedAtUtc:'2026-11-11T09:00:00Z',configuration:{[key]:'1'}});
const policy=()=>({version:'certscore.audit-policy-provenance.v1',binding:{scanId:id,createdAt,generation:'scan-report-projection-v27',sourceHash:hash},bundle:hash,fetch:'fetched',owner:'producer_declared_usable',text:'producer_verified_complete_receipt'});
test('comparison source limitations are explicit bounded receipts; absent historical data gains no invented reason',()=>{
 const base={...source(),sourcesVerified:true};
 for(const [patch,reason] of [
  [{sourcesVerified:false},'original_sources_unverified'],
  [{manifest:{scanId:'other'}},'source_identity_mismatch'],
  [{bundle:{scanId:id}},'scanner_build_not_retained'],
  [{manifest:{scanId:id}},'capture_profile_not_retained'],
  [{manifest:{scanId:id,privacyCaptureProfile:'future'}},'capture_profile_unsupported'],
  [{manifestSha256:'wrong'},'source_metadata_invalid'],
 ] as const){
  const result=buildAuditComparisonDelivery({...base,...patch});assert.ok(result&&'reason' in result);assert.equal(result.reason,reason);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=512);assert.deepEqual(readAuditComparisonDelivery(result),result);assert.equal(readAuditComparison(result),null);
 }
 assert.deepEqual(buildAuditComparisonDelivery(base),buildAuditComparison(source()));
 assert.equal(readAuditComparisonDelivery(null),null);
 assert.equal(readAuditComparisonDelivery({version:'certscore.audit-comparison-unavailable.v1',scanId:id,createdAt,reason:'made_up'}),null);
});
test('combined delivery requires comparison metadata as well as policy receipts; limitations are degraded, not a green pass',()=>{
 const e={...extract(),policyReceipt:policy(),auditComparison:buildAuditComparison(source())};
 const good=verifyAuditReceiptDelivery(release(),[row()],[e]);assert.equal(good.status,'passed');assert.equal(good.policy.available,1);assert.equal(good.comparison.available,1);
 for(const value of [undefined,null]){const missing=verifyAuditReceiptDelivery(release(),[row()],[{...e,auditComparison:value}]);assert.equal(missing.status,'failed');assert.equal(missing.comparison.missing,1);assert.equal(missing.comparison.unavailable,0);}
 const unavailable=buildAuditComparisonDelivery({...source(),sourcesVerified:false});
 const degraded=verifyAuditReceiptDelivery(release(),[row()],[{...e,auditComparison:unavailable}]);
 assert.equal(degraded.status,'degraded');assert.equal(degraded.comparison.available,0);assert.equal(degraded.comparison.unavailable,1);
 assert.equal(degraded.comparison.byDateAndVersion[0].reasons.original_sources_unverified,1);
 assert.equal(degraded.comparison.byDateAndVersion[0].date,'2026-11-11');
 assert.equal(verifyAuditReceiptDelivery(release(),[],[]).status,'pending');
 assert.equal(verifyAuditReceiptDelivery(release(),[{...row(),createdAt:'2026-11-11T08:00:00Z'}],[e]).status,'pending');
 assert.equal(verifyAuditReceiptDelivery(release(),[{...row(),reportable:false}],[e]).status,'pending');
});
test('combined delivery rejects malformed, conflicting, foreign or stale comparison receipts',()=>{
 const comparison=buildAuditComparison(source()),e={...extract(),policyReceipt:policy(),auditComparison:comparison};
 for(const auditComparison of [{...comparison,createdAt:'2026-11-11T11:00:00Z'},{...comparison,scanId:'22222222-2222-4222-8222-222222222222'},{...comparison,extra:'unknown'}]){
  const r=verifyAuditReceiptDelivery(release(),[row()],[{...e,auditComparison}]);assert.equal(r.status,'failed');assert.equal(r.comparison.invalid,1);
 }
 assert.equal(verifyAuditReceiptDelivery(release(),[row()],[e,{...e,auditComparison:null}]).comparison.conflicting,1);
 const conflicting=verifyAuditReceiptDelivery(release(),[row()],[e,{...e,auditComparison:{...comparison,producer:'f'.repeat(40)}}]);assert.equal(conflicting.comparison.conflicting,1);assert.equal(conflicting.status,'failed');
 for(const patch of [{originalRequestId:'foreign'},{projection_payload_sha256:null},{projection_source_hash:'f'.repeat(64)},{projection_status:'pending'}])assert.equal(verifyAuditReceiptDelivery(release(),[row()],[{...e,...patch}]).comparison.missing,1);
});
test('unavailable diagnostics retain bound ancestry without becoming comparison metadata and conflict with positive metadata',()=>{
 const dir=mkdtempSync(join(tmpdir(),'comparison-unavailable-'));
 try{
  const file=join(dir,'inventory.json'),e={...extract(),auditComparison:buildAuditComparisonDelivery({...source(),sourcesVerified:false})};
  const bytes=Buffer.from(JSON.stringify({version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,rows:[e]}));writeFileSync(file,bytes);
  const receipt={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},r=row();
  applyRetainedOptOutExtracts([r],[receipt]);assert.equal(r.comparisonUnavailableReason,'original_sources_unverified');assert.equal(r.comparisonMetadata,undefined);
  assert.equal(r.refs[0].role,'generation_matched_comparison');
  assert.throws(()=>applyRetainedOptOutExtracts([{...row(),comparisonMetadata:buildAuditComparison(source())}],[receipt]),/Conflicting/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
