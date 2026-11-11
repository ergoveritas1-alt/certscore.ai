import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const keys=['CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED','CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED'];
export function receiptConfiguration(task:any){
 const containers=(task.containerDefinitions??[]).filter((c:any)=>c.name==='certscore-web');
 assert.equal(containers.length,1,'One materializer container required');
 return Object.fromEntries(keys.map(key=>{
  const c=containers[0],values=(c.environment??[]).filter((v:any)=>v.name===key);
  assert.ok(!(c.secrets??[]).some((v:any)=>v.name===key),'Receipt flag shadowed by secret');
  assert.ok(values.length<=1&&values.every((v:any)=>['0','1'].includes(v.value)),'Ambiguous receipt flag');
  return [key,values[0]?.value??null];
 }));
}
export function verifyReceiptRelease(expected:any,actual:any,services:any,arn:string){
 const task=actual.taskDefinition??actual,config=receiptConfiguration(expected);
 assert.equal(task.taskDefinitionArn,arn,'Unexpected task definition');
 assert.deepEqual(receiptConfiguration(task),config,'Receipt configuration drift');
 assert.equal((services.failures??[]).length,0);
 assert.equal(services.services?.length,1);
 const service=services.services[0];
 assert.equal(service.status,'ACTIVE');assert.equal(service.taskDefinition,arn);
 assert.ok(service.desiredCount>0&&service.runningCount===service.desiredCount&&service.pendingCount===0,'Materializer not converged');
 assert.equal(service.deployments?.length,1);
 assert.equal(service.deployments[0].taskDefinition,arn);
 assert.equal(service.deployments[0].status,'PRIMARY');
 return {version:'certscore.audit-receipt-release.v1',status:'passed',configurationVerified:true,
  taskDefinitionArn:arn,configuration:config,deliveryStatus:'pending_next_scheduled_refresh',verifiedAtUtc:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [expected,actual,services,arn]=process.argv.slice(2);assert.ok(expected&&actual&&services&&arn);
 const sources=[expected,actual,services].map(file=>({file,bytes:readFileSync(file)}));
 const result=verifyReceiptRelease(...sources.map(s=>JSON.parse(s.bytes.toString())) as [any,any,any],arn);
 console.log(JSON.stringify({...result,sources:sources.map(s=>({file:s.file,sha256:createHash('sha256').update(s.bytes).digest('hex')}))},null,2));
}
