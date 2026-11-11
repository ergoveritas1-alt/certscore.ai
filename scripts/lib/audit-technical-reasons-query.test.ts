import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {technicalCountsSql,fitAuditDeltaQuery} from './audit-delta-query';
test('actual bounded SQL preserves zero counts and distinguishes missing, verification, binding and schema blockers',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'technical-reasons-pg-')),env={...process.env};
 for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];
 const run=(command:string,args:string[],input?:string)=>{const r=spawnSync('/opt/homebrew/bin/'+command,args,{input,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout;};
 const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
 const source={verificationStatus:'verified',scanId:id,sourceHash:hash,contractVersion:'certscore.cms-security-projection.v1',assessment:{detections:[],matches:[],catalogueVersion:'v1'}};
 const payload=(cms:any,events:any=[{eventType:'v2_lambda_result.received',metadataJson:{artifactMetadata:{scanArtifactUri:{sha256:hash}}}}])=>JSON.stringify({scan:{id},runtimeArtifacts:{cmsSecurity:cms},events}).replaceAll("'","''");
 const cases=[payload(source),payload(null),payload({...source,verificationStatus:'unverified'}),payload({...source,sourceHash:'b'.repeat(64)}),payload({...source,assessment:{}}),payload(source,[])];
 try{
  run('initdb',['-D',root+'/data','--no-locale','--auth=trust','-U','fixture']);
  run('pg_ctl',['-D',root+'/data','-l',root+'/log','-o',`-k ${root} -p 54396 -c listen_addresses=''`,'-w','start']);
  const sql=`select ${technicalCountsSql()} from (values ${cases.map(p=>`('ready','${p}'::jsonb)`).join(',')}) p(report_projection_status,report_projection_payload), (select '${id}'::uuid id) s,(select false "isCanary") o;`;
  const rows=run('psql',['-X','-h',root,'-p','54396','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],sql).trim().split('\n').map(s=>JSON.parse(s));
  assert.deepEqual(rows[0][1],['certscore.cms-security-projection.v1',0,0,'v1']);
  assert.deepEqual(rows.slice(1).map(r=>r[1]),['source_missing','source_unverified','source_binding_mismatch','source_schema_incomplete','original_source_binding_unavailable']);
 }finally{spawnSync('/opt/homebrew/bin/pg_ctl',['-D',root+'/data','-m','immediate','-w','stop'],{env,stdio:'ignore'});rmSync(root,{recursive:true,force:true});}
});
test('56 pending targets preserve required receipts within the existing launch cap',()=>{
 const pendingRefreshIds=Array.from({length:56},(_,i)=>{const h=createHash('sha256').update('pending-fixture-'+i).digest('hex').slice(0,32);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);});
 const p=fitAuditDeltaQuery({overlapStartUtc:'2026-11-08T22:41:19.889464+00:00',windowEndUtc:'2026-11-11T13:00:00.000000+00:00',pendingRefreshIds,includePrivacyFormReceipts:true},'MACMINI_DELTA_IDS');
 assert.equal(p.selected.privacyForm,true);assert.equal(p.selected.policyReceipt,true);assert.equal(p.selected.controlAccessibility,true);assert.ok(p.selected.override.fits);assert.ok(p.selected.sql.includes('source_schema_incomplete'));
});
