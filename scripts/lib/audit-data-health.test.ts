import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDataHealth} from './audit-data-health';
import {applyTechnicalCounts} from './audit-progress-opt-out';
import {auditHealthContext} from './audit-data-health-context';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const row=(date:string,extra:any={})=>({scanId:date,site:'example.test',createdAt:date+'T18:00:00Z',reportable:true,region:'california',profile:'p',producer:'v2',assessmentVersion:'v1',projectionVersion:'v27',defaultSource:'public_export/v1',states:{outcome:'usable_limited'},metricSources:{},...extra});
const data={timezone:'America/Los_Angeles',windows:[{end:'2026-11-10T22:41:00Z'}],masterValueParity:{status:'passed',mismatches:0},errors:[]};
test('coverage distinguishes absent evidence, measured zero, positive values and no-go attempts',()=>{
 const rows=[row('2026-11-10',{measurements:{'technology.detections':0}}),row('2026-11-10',{measurements:{'technology.detections':2}}),row('2026-11-10',{reportable:false,states:{outcome:'no_go'}}),row('2026-11-10')];
 const h=auditDataHealth(data,rows,{},Date.parse('2026-11-10T23:41:00Z'));
 assert.equal(h.attempts,4);assert.equal(h.reportable,3);assert.equal(h.noGo,1);assert.equal(h.ageHours,1);
 assert.deepEqual(h.quantities[1],{id:'technology.detections',eligible:3,measured:2,positive:1,zero:1,unavailable:1,reasons:{reason_not_retained:1}});
 assert.equal(h.pending.available,false);
});
test('cutoff day is fixed even if filters leave only earlier rows; date gaps do not become a previous day',()=>{
 const h=auditDataHealth(data,[row('2026-11-08')]);assert.equal(h.reportable,0);assert.equal(h.date,'2026-11-10');assert.equal(h.comparability.previousDate,'2026-11-09');assert.equal(h.comparability.previousReportable,0);
});
test('same-site comparison requires the full source/version map and region; no pooled delta is emitted',()=>{
 const prior=row('2026-11-09',{metricSources:{a:'v1'}});
 const h=auditDataHealth(data,[prior,row('2026-11-10',{metricSources:{a:'v1'}}),row('2026-11-10',{metricSources:{a:'v2'}}),row('2026-11-10',{region:'eu',metricSources:{a:'v1'}}),row('2026-11-10',{producer:'not retained in public export',metricSources:{a:'v1'}})]);
 assert.equal(h.comparability.matchedReports,1);assert.equal(h.comparability.matchedSites,1);assert.equal('delta' in h.comparability,false);
 assert.equal(h.comparability.metadataUnavailable,1);
});
test('receipt delivery gaps and queue ages remain separate from outcome failures and filter populations',()=>{
 const prior=row('2026-11-09',{metricSources:{policy:'persisted_policy_receipt/v27/v1'}});
 const h=auditDataHealth(data,[prior,row('2026-11-10')],{pending:[{createdAt:'2026-11-01T22:41:00Z'}]});
 assert.equal(h.policy.deliveryGap,true);assert.equal(h.policy.previousAvailable,1);assert.equal(h.pending.oldestAttemptAgeDays,9);assert.equal(h.pending.over7Days,1);assert.equal(h.noGo,0);
});
test('technical unavailable diagnostics never create zero counts and reject conflicts or unknown codes',()=>{
 const r:any=row('2026-11-10');assert.equal(applyTechnicalCounts(r,[null,'source_missing']),true);
 assert.deepEqual(r.technicalCountUnavailable,{version:'certscore.technical-count-availability.v1',reasons:{'technology.detections':'source_missing','technology.matches':'source_missing'}});assert.equal(r.measurements,undefined);
 assert.throws(()=>applyTechnicalCounts(r,[null,'source_unverified']),/Conflicting/);
 assert.throws(()=>applyTechnicalCounts(row('2026-11-10') as any,[null,'invented']),/Unknown/);
 const measured:any=row('2026-11-10',{measurements:{'site.link_evidence':0}});
 assert.throws(()=>applyTechnicalCounts(measured,['source_missing',null]),/Conflicting/);
 const legacy:any=row('2026-11-10');applyTechnicalCounts(legacy,[null,null]);assert.equal(legacy.technicalCountUnavailable,undefined);
});
test('queue summary follows original hashed inventories and refuses tampered provenance',()=>{
 const dir=mkdtempSync(join(tmpdir(),'certscore-health-context-'));
 const save=(name:string,data:any)=>{const file=join(dir,name);writeFileSync(file,JSON.stringify(data));const b=readFileSync(file);return {file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};};
 try{
  const inventory=save('inventory.json',{version:'certscore.mac-mini-direct-id-inventory.v1',readOnly:true,rows:[{scanId:'id',isMacMini:true,isCanary:false,originalRequestId:'creator',created_at:'2026-11-01T12:00:00Z'}]});
  const manifest=save('cache-manifest.json',{directInventory:inventory,receipts:[{scanId:'id',state:'source_unavailable'}]});
  assert.deepEqual(auditHealthContext({sources:[manifest]}).pending,[{scanId:'id',createdAt:'2026-11-01T12:00:00Z',status:'unavailable'}]);
  const original=readFileSync(inventory.file,'utf8');writeFileSync(inventory.file,original.replace('creator','changed'));
  assert.throws(()=>auditHealthContext({sources:[manifest]}),/hash mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
