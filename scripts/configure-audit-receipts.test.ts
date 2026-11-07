import test from 'node:test';import assert from 'node:assert/strict';import {resolveAuditReceipts} from './configure-audit-receipts';
test('ordinary deploys preserve receipt enablement while explicit modes control it',()=>{
 const task=(value:string)=>({containerDefinitions:[{name:'certscore-web',environment:[{name:'CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED',value}]}]});
 assert.equal(resolveAuditReceipts('preserve',task('1')),'1');assert.equal(resolveAuditReceipts('preserve',task('0')),'0');assert.equal(resolveAuditReceipts('preserve',{}),'0');assert.equal(resolveAuditReceipts('true',{}),'1');assert.equal(resolveAuditReceipts('false',task('1')),'0');
 assert.throws(()=>resolveAuditReceipts('preserve',task('yes')));const duplicate=task('1');duplicate.containerDefinitions[0]!.environment.push({...duplicate.containerDefinitions[0]!.environment[0]!});assert.throws(()=>resolveAuditReceipts('preserve',duplicate));assert.throws(()=>resolveAuditReceipts('unknown',task('0')));
});
