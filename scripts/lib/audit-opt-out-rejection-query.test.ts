import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {choiceAuditSqlForTransport,choiceSummaryAudit} from './audit-progress-choice';

test('existing daily SQL retains dispatch rejection detail and preserves legacy missing detail',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'rejection-pg-')),env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 const run=(command:string,args:string[],input?:string)=>{
  const r=spawnSync('/opt/homebrew/bin/'+command,args,{input,env,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);return r.stdout;
 };
 const scanId='11111111-1111-4111-8111-111111111111',counts=Array(14).fill(0);counts[12]=4096;
 const rejection=[1,1,32,4096,7,counts,Array.from({length:8},(_,i)=>[31,120+i,12,255])];
 const decision={version:'conditional_opt_out_dispatch.v3',scanId,status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),controlObserved:true,supportedRoute:false,observationId:'control',rejection};
 const payload=(conditional:unknown)=>JSON.stringify({scan:{id:scanId},events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'conditional_no_dispatch_recorded',conditionalOptOutDecision:conditional}}}]}).replaceAll("'","''");
 try{
  run('initdb',['-D',root+'/data','--no-locale','--auth=trust','-U','fixture']);
  run('pg_ctl',['-D',root+'/data','-l',root+'/log','-o',`-k ${root} -p 54397 -c listen_addresses=''`,'-w','start']);
  const query=`select ${choiceAuditSqlForTransport(false,true)} from (values
   ('ready','${payload(decision)}'::jsonb),('ready','${payload({...decision,rejection:undefined})}'::jsonb),
   ('ready','${payload({...decision,unexpected:'reject'})}'::jsonb)) p(report_projection_status,report_projection_payload),
   (select '{"scan":{"noGo":false}}'::jsonb as value) a;`;
  const rows=run('psql',['-X','-h',root,'-p','54397','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],query).trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(rows.length,3);assert.deepEqual(rows[0].conditional.rejection,rejection);
  assert.deepEqual(choiceSummaryAudit(rows[0],scanId).rejection?.receipt,rejection);
  assert.ok(Buffer.byteLength(JSON.stringify(rows[0]))<8192);
  assert.equal(choiceSummaryAudit(rows[1],scanId).rejection,undefined);
  assert.equal(rows[2].conditional,null,'unexpected receipt fields fail closed');
 }finally{
  spawnSync('/opt/homebrew/bin/pg_ctl',['-D',root+'/data','-m','immediate','-w','stop'],{env,stdio:'ignore'});
  rmSync(root,{recursive:true,force:true});
 }
});
