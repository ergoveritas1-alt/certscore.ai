import test from 'node:test';import assert from 'node:assert/strict';import {resolveAuditReceipts,preservePolicyReceipts} from './configure-audit-receipts';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
test('ordinary deploys preserve receipt enablement while explicit modes control it',()=>{
 const task=(value:string)=>({containerDefinitions:[{name:'certscore-web',environment:[{name:'CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED',value}]}]});
 assert.equal(resolveAuditReceipts('preserve',task('1')),'1');assert.equal(resolveAuditReceipts('preserve',task('0')),'0');assert.equal(resolveAuditReceipts('preserve',{}),'0');assert.equal(resolveAuditReceipts('true',{}),'1');assert.equal(resolveAuditReceipts('false',task('1')),'0');
 assert.throws(()=>resolveAuditReceipts('preserve',task('yes')));const duplicate=task('1');duplicate.containerDefinitions[0]!.environment.push({...duplicate.containerDefinitions[0]!.environment[0]!});assert.throws(()=>resolveAuditReceipts('preserve',duplicate));assert.throws(()=>resolveAuditReceipts('unknown',task('0')));
});

const policyKey='CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED';
const task=(value?:string)=>({family:'materializer',cpu:'1024',memory:'2048',containerDefinitions:[{name:'certscore-web',image:'immutable-image',environment:[
 {name:'CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED',value:'1'},
 {name:'UNRELATED',value:'unchanged'},...(value===undefined?[]:[{name:policyKey,value}]),
],secrets:[] as Array<{name:string}>}]});
test('materializer policy grant survives a web-derived deployment without changing other settings',()=>{
 const target=task(),current=task('1'),before=structuredClone({target,current});
 assert.deepEqual(preservePolicyReceipts(target,current),task('1'));
 assert.deepEqual({target,current},before);
});
test('policy absence or explicit disable remains independent of web and privacy-form enablement',()=>{
 assert.deepEqual(preservePolicyReceipts(task('1'),task('0')),task('0'));
 assert.deepEqual(preservePolicyReceipts(task('1'),task()),task());
 assert.deepEqual(preservePolicyReceipts(task('1'),{}),task());
 assert.deepEqual(preservePolicyReceipts(task('0'),task('1')),task('1'));
});
test('ambiguous policy configuration fails before a target can be written',()=>{
 for(const source of [true,false]){
  for(const fault of ['invalid','duplicate','secret']){
   const current=task('1'),target=task('0'),bad=source?current:target;
   if(fault==='invalid')bad.containerDefinitions[0]!.environment.push({name:policyKey,value:'yes'});
   if(fault==='duplicate')bad.containerDefinitions[0]!.environment.push({name:policyKey,value:'1'});
   if(fault==='secret')bad.containerDefinitions[0]!.secrets.push({name:policyKey});
   assert.throws(()=>preservePolicyReceipts(target,current));
  }
 }
 assert.throws(()=>preservePolicyReceipts(task(),task('invalid')));
 const duplicate=task();duplicate.containerDefinitions.push(structuredClone(duplicate.containerDefinitions[0]!));
 assert.throws(()=>preservePolicyReceipts(duplicate,task()));
 assert.throws(()=>preservePolicyReceipts(task(),duplicate));
 assert.throws(()=>preservePolicyReceipts({},task()));
 assert.throws(()=>preservePolicyReceipts(task(),{containerDefinitions:[{name:'wrong-container'}]}));
});
test('web workflow preserves materializer policy grants before either registration',()=>{
 const workflow=readFileSync('.github/workflows/web-aws-ecs-deploy.yml','utf8');
 const guard=workflow.indexOf('scripts/configure-audit-receipts.ts preserve-policy');
 assert.ok(guard>0);
 assert.ok(guard<workflow.indexOf('TARGET_TASK_DEFINITION="$(aws ecs register-task-definition'));
 assert.ok(guard<workflow.indexOf('TARGET_MATERIALIZER_TASK_DEFINITION="$(aws ecs register-task-definition'));
 assert.match(workflow.slice(guard,guard+180),/current-materializer-task-definition.json target-materializer-task-definition.json/);
});
test('production CLI accepts describe-task-definition envelopes and fails without changing target bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'certscore-policy-settings-'));
 try{
  const source=join(dir,'current.json'),target=join(dir,'target.json');
  writeFileSync(source,JSON.stringify({taskDefinition:task('1')}));writeFileSync(target,JSON.stringify(task()));
  const args=['--experimental-strip-types',resolve('scripts/configure-audit-receipts.ts'),'preserve-policy',source,target];
  execFileSync(process.execPath,args,{stdio:'pipe'});
  assert.deepEqual(JSON.parse(readFileSync(target,'utf8')),task('1'));
  const before=readFileSync(target);
  writeFileSync(source,JSON.stringify({taskDefinition:task('invalid')}));
  assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));
  assert.deepEqual(readFileSync(target),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
