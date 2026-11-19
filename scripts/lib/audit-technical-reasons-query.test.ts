import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {technicalCountsSql,fitAuditDeltaQuery,REJECT_ACTIVITY_RECEIPT_SQL,assertCurrentPriorityExtraction} from './audit-delta-query';
import {choiceAuditSqlForTransport} from './audit-progress-choice';
import {jsonbBytes,priorityEvidenceFromRecord,priorityEvidenceStates} from './audit-progress-priority-evidence';
test('actual bounded SQL preserves zero counts and distinguishes missing, verification, binding and schema blockers',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'technical-reasons-pg-')),env={...process.env};
 for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];
 const run=(command:string,args:string[],input?:string)=>{const r=spawnSync('/opt/homebrew/bin/'+command,args,{input,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout;};
 const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
 const source={verificationStatus:'verified',scanId:id,sourceHash:hash,contractVersion:'certscore.cms-security-projection.v1',assessment:{detections:[],matches:[],catalogueVersion:'v1'}};
 const events=[{eventType:'v2_lambda_result.received',metadataJson:{artifactMetadata:{scanArtifactUri:{sha256:hash}}}}];
 const payload=(cms:any,resultEvents:any=events,diagnostic?:string[])=>JSON.stringify({scan:{id},runtimeArtifacts:{cmsSecurity:cms,cmsProjectionDiagnostic:diagnostic},events:resultEvents}).replaceAll("'","''");
 const cases=[payload(source),payload(null),payload({...source,verificationStatus:'unverified'}),payload({...source,sourceHash:'b'.repeat(64)}),payload({...source,assessment:{}}),payload(source,[]),payload(null,undefined,[hash,'cms_document_mismatch']),payload(null,undefined,['b'.repeat(64),'cms_document_mismatch']),payload(null,undefined,[hash,'cms_document_mismatch','extra'])];
 try{
  run('initdb',['-D',root+'/data','--no-locale','--auth=trust','-U','fixture']);
  run('pg_ctl',['-D',root+'/data','-l',root+'/log','-o',`-k ${root} -p 54396 -c listen_addresses=''`,'-w','start']);
  const sql=`select ${technicalCountsSql(true)} from (values ${cases.map(p=>`('ready','${p}'::jsonb)`).join(',')}) p(report_projection_status,report_projection_payload), (select '${id}'::uuid id) s,(select false "isCanary") o;`;
  const rows=run('psql',['-X','-h',root,'-p','54396','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],sql).trim().split('\n').map(s=>JSON.parse(s));
  assert.deepEqual(rows[0][1],['certscore.cms-security-projection.v1',0,0,'v1']);
  assert.deepEqual(rows.slice(1).map(r=>r[1]),['source_missing','source_unverified','source_binding_mismatch','source_schema_incomplete','original_source_binding_unavailable','cms_document_mismatch','source_missing','source_missing']);
  const acceptCases=[
    [hash,'control_unresolved'],['b'.repeat(64),'control_unresolved'],
    [hash,'control_unresolved','unexpected'],hash,
    [hash,{reason:'control_unresolved'}],
  ].map(acceptPathDiagnostic=>({scan:{id},events,runtimeArtifacts:{
    acceptPathDiagnostic,postAcceptEvidenceProjection:{execution:{clickCompleted:false}},
  }}));
  const [valid]=acceptCases;
  const casesWithStatus=[...acceptCases.map(value=>({value,status:'ready',canary:false})),
   {value:valid,status:'pending',canary:false},{value:valid,status:'ready',canary:true},
   {value:{...valid,scan:{id:'wrong'}},status:'ready',canary:false},
   {value:{...valid,events:[...events,...events]},status:'ready',canary:false}];
  const acceptSql=`select ${choiceAuditSqlForTransport(false,true,true)}
   from (values ${casesWithStatus.map(({value,status,canary})=>`('${JSON.stringify(value)}'::jsonb,'${status}',${canary})`).join(',')})
   p(report_projection_payload,report_projection_status,canary), (select '${id}'::uuid id) s,
   lateral (select p.canary "isCanary") o, (select null::jsonb value) a;`;
  const acceptRows=run('psql',['-X','-h',root,'-p','54396','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],acceptSql).trim().split('\n').map(v=>JSON.parse(v).priorityEvidence);
  assert.equal(acceptRows[0].acceptPath,'control_unresolved');
  assert.equal(acceptRows[0].accept,null);
  assert.deepEqual(acceptRows.slice(1).map(row=>row.acceptPath),Array(8).fill(null));
  const reloadProjection = {
   contractVersion: 'certscore.post_refusal_report_projection.v1',
   packetSha256: hash,
   execution: {policyVersion: 'choice_path_execution.v1',status: 'limited',clickCompleted:true,
    observationCompleted:false,consentConfirmed:true},
   retainedActionTiming: {actionDispatchedAtMs: 100, observationEndedAtMs: 8200},
   refusalRegisteredAtMs: 150, observationWindowMs: 8000,
   actionControlProof: {action:'reject',authorizedTargetSha256:hash,observedAtMs:90},
   terminalDecisionEvidence: {
    policyVersion: 'bounded_registered_terminal_consent_decision.v1', action:'reject', authorizedTargetSha256:hash,
    readStartedAtMs:7850, readCompletedAtMs:7860,
    trustArcReloadReadback:{preReloadReadAtMs:170,reloadCommittedAtMs:700},
    evidence:{policyVersion:'semantic_consent_registration.v2',basis:'verified_state',decision:'denied',
      observedStateSha256:hash,observedAtMs:7860,timestampBasis:'verified_state_observed'},
   },
  };
  const lateProjection=structuredClone(reloadProjection);
  lateProjection.terminalDecisionEvidence.readCompletedAtMs=8101;
  const reversedProjection=structuredClone(reloadProjection);
  reversedProjection.terminalDecisionEvidence.trustArcReloadReadback.preReloadReadAtMs=701;
  const reloadRecords=[reloadProjection,lateProjection,reversedProjection].map(postRefusalEvidenceProjection=>({
   scan:{id},events,runtimeArtifacts:{postRefusalEvidenceProjection},
  }));
  const reloadSql=`select ${choiceAuditSqlForTransport(false,true,true)}
   from (values ${reloadRecords.map(value=>`('${JSON.stringify(value)}'::jsonb,'ready',false)`).join(',')})
   p(report_projection_payload,report_projection_status,canary), (select '${id}'::uuid id) s,
   lateral (select p.canary "isCanary") o, (select null::jsonb value) a;`;
  const reloadRows=run('psql',['-X','-h',root,'-p','54396','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],reloadSql).trim().split('\n');
  assert.equal(reloadRows.length,3);
  for (const [index,line] of reloadRows.entries()) {
   const value=JSON.parse(line);
   assert.ok(jsonbBytes(value)<=8192);
   assert.deepEqual(value.priorityEvidence,{...priorityEvidenceFromRecord(reloadRecords[index]),acceptPath:null});
   assert.equal(priorityEvidenceStates(value.priorityEvidence,id)['sealed.terminal.audit_reject']?.value,
    index===0?'verified':'unverified');
  }
  const activity=[1,id,hash,'request'];
  const snapshot=[2,id,hash,'cookie_snapshot'];
  const allActivity=[2,id,hash,'request_and_storage_write_and_cookie_snapshot'];
  const project=(auditRejectActivity:unknown,scanId=id)=>({scan:{id:scanId},auditRejectActivity});
  const activityCases=[
   [project(activity),'ready',false],
   [project(snapshot),'ready',false],
   [project(allActivity),'ready',false],
   [project(activity),'ready',true],
   [project(activity),'pending',false],
   [project(activity,'wrong'),'ready',false],
   [project([...activity,'x'.repeat(192)]),'ready',false],
   [project(null),'ready',false],
  ] as const;
  const activitySql=`select coalesce(${REJECT_ACTIVITY_RECEIPT_SQL},'null'::jsonb)
   from (values ${activityCases.map(([value,status,canary])=>`('${JSON.stringify(value)}'::jsonb,'${status}',${canary})`).join(',')})
   p(report_projection_payload,report_projection_status,canary), (select '${id}'::uuid id) s,
   lateral (select p.canary "isCanary") o;`;
  const activityRows=run('psql',['-X','-h',root,'-p','54396','-U','fixture','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],activitySql);
  assert.deepEqual(activityRows.trim().split('\n').map(value=>JSON.parse(value)),[activity,snapshot,allActivity,null,null,null,null,null]);
 }finally{spawnSync('/opt/homebrew/bin/pg_ctl',['-D',root+'/data','-m','immediate','-w','stop'],{env,stdio:'ignore'});rmSync(root,{recursive:true,force:true});}
});
test('56 pending targets preserve required receipts within the existing launch cap',()=>{
 const pendingRefreshIds=Array.from({length:56},(_,i)=>{const h=createHash('sha256').update('pending-fixture-'+i).digest('hex').slice(0,32);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);});
 const p=fitAuditDeltaQuery({overlapStartUtc:'2026-11-08T22:41:19.889464+00:00',windowEndUtc:'2026-11-11T13:00:00.000000+00:00',pendingRefreshIds,includePrivacyFormReceipts:true},'MACMINI_DELTA_IDS');
 const candidate=fitAuditDeltaQuery({overlapStartUtc:'2026-11-08T22:41:19.889464+00:00',windowEndUtc:'2026-11-11T13:00:00.000000+00:00',pendingRefreshIds,includePrivacyFormReceipts:true,includeForwardCoverageDiagnostics:true,includeRejectActivityReceipt:true},'MACMINI_DELTA_IDS');
 assert.ok(candidate.pendingRefreshIds.length>0&&candidate.selected.override.fits);
 assert.deepEqual(candidate.pendingRefreshIds,pendingRefreshIds.slice(0,candidate.pendingRefreshIds.length));
 assert.ok(candidate.selected.sql.includes("'acceptPath'")&&candidate.selected.sql.includes('cmsProjectionDiagnostic'));
 assert.ok(!p.selected.sql.includes("'acceptPath'"));
 assert.match(candidate.selected.sql,/"auditRejectActivity"/);
 assert.doesNotMatch(p.selected.sql,/"auditRejectActivity"/);
 assert.equal(candidate.selected.policyReceipt,true);
 assert.equal(candidate.selected.privacyForm,true);
 assert.deepEqual(candidate.deferredPendingIds,pendingRefreshIds.slice(candidate.pendingRefreshIds.length));
 assert.throws(()=>assertCurrentPriorityExtraction([{}],false,true),/omitted the post-Reject/);
 assert.equal(p.selected.privacyForm,true);assert.equal(p.selected.policyReceipt,true);assert.equal(p.selected.controlAccessibility,true);assert.ok(p.selected.override.fits);assert.ok(p.selected.sql.includes('source_schema_incomplete'));
});
