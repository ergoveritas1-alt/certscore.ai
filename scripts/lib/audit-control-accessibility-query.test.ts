import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CONTROL_ACCESSIBILITY_SQL,readControlAccessibilityDetail} from './audit-progress-control-accessibility';

test('private control assessment receipts survive the actual SQL, while duplicates and old omissions stay unknown',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'control-pg-'));const env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 const run=(command:string,args:string[],input?:string)=>{
  const r=spawnSync('/opt/homebrew/bin/'+command,args,{input,env,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);return r.stdout;
 };
 const row={id:'accessibility_consent_controls',evidenceState:'not_testable',status:'Not testable',criticalEvidence:{retainedEvidence:{controlAccessibilityReceipt:[1,'partial',16,1,0,0,0]}}};
 const payload=(rows:unknown[])=>JSON.stringify({canonicalReportProjection:{artifactVersion:'persisted-canonical-report-projection-v7',checklistRows:rows}}).replaceAll("'","''");
 try{
  run('initdb',['-D',root+'/data','--no-locale','--auth=trust','-U','fixture']);
  run('pg_ctl',['-D',root+'/data','-l',root+'/log','-o',`-k ${root} -p 54398 -c listen_addresses=''`,'-w','start']);
  const query=`select ${CONTROL_ACCESSIBILITY_SQL} from (values
   ('ready','${payload([row])}'::jsonb),('ready','${payload([{...row,criticalEvidence:{}}])}'::jsonb),
   ('ready','${payload([row,row])}'::jsonb),('pending','${payload([row])}'::jsonb)) p(report_projection_status,report_projection_payload);`;
  const rows=run('psql',['-X','-h',root,'-p','54398','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],query).trimEnd().split('\n');
  const actual=JSON.parse(rows[0]!);assert.deepEqual(actual[3],[1,'partial',16,1,0,0,0]);
  assert.deepEqual(readControlAccessibilityDetail(actual[3])?.reasons,['control_results_missing']);
  assert.equal(JSON.parse(rows[1]!)[3],null);
  assert.equal(rows.filter(r=>r.trim()).length,2);
 }finally{
  spawnSync('/opt/homebrew/bin/pg_ctl',['-D',root+'/data','-m','immediate','-w','stop'],{env,stdio:'ignore'});
  rmSync(root,{recursive:true,force:true});
 }
});
