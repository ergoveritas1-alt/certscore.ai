import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const key='CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED';
const policyKey='CERTSCORE_AUDIT_POLICY_PROVENANCE_ENABLED';
type ReceiptTask={containerDefinitions?:Array<{name:string;environment?:Array<{name:string;value:string}>;secrets?:Array<{name:string}>}>};

/** The materializer is built from the web task, but its policy receipt grant
 * belongs to the existing materializer. Missing means disabled; never inherit
 * or enable this grant from the public web task or the privacy-form setting. */
export function preservePolicyReceipts<T extends ReceiptTask>(target:T,current:ReceiptTask,mode='preserve'):T {
 assert.ok(['preserve','true','false'].includes(mode),'Invalid policy receipt mode');
 const result=structuredClone(target);
 const targets=(result.containerDefinitions??[]).filter(c=>c.name==='certscore-web');
 const sources=(current.containerDefinitions??[]).filter(c=>c.name==='certscore-web');
 assert.equal(targets.length,1,'Exactly one target web container required');
 assert.ok(sources.length<=1,'Duplicate source web container');
 assert.ok(!current.containerDefinitions?.length||sources.length===1,'Current materializer web container missing');
 const source=sources[0],destination=targets[0]!;
 for(const container of [source,destination]) {
  assert.ok(!(container?.secrets??[]).some(e=>e.name===policyKey),'Policy receipt flag must not be shadowed by a secret');
  const values=(container?.environment??[]).filter(e=>e.name===policyKey);
  assert.ok(values.length<=1,'Duplicate policy receipt flag');
  assert.ok(values.every(e=>['0','1'].includes(e.value)),'Invalid policy receipt flag');
 }
 const grants=mode==='preserve'?(source?.environment??[]).filter(e=>e.name===policyKey):[{name:policyKey,value:mode==='true'?'1':'0'}];
 destination.environment=[...(destination.environment??[]).filter(e=>e.name!==policyKey),...structuredClone(grants)];
 return result;
}
export function resolveAuditReceipts(mode:string,current:{containerDefinitions?:Array<{name:string;environment?:Array<{name:string;value:string}>;secrets?:Array<{name:string}>}>}){
 assert.ok(['preserve','true','false'].includes(mode));
 if(mode!=='preserve')return mode==='true'?'1':'0';
 const containers=(current.containerDefinitions??[]).filter(c=>c.name==='certscore-web');assert.ok(containers.length<=1);
 const target=containers[0];if(!target)return '0';
 assert.ok(!(target.secrets??[]).some(e=>e.name===key),'Receipt flag must not be shadowed by a secret');
 const values=(target.environment??[]).filter(e=>e.name===key);assert.ok(values.length<=1,'Duplicate receipt flag');
 if(!values.length)return '0';assert.ok(['0','1'].includes(values[0]!.value),'Invalid current receipt flag');return values[0]!.value;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,file,targetFile,policyMode]=process.argv.slice(2);assert.ok(mode&&file);
 const value=JSON.parse(readFileSync(file,'utf8'));
 if(mode==='preserve-policy'){
  assert.ok(targetFile,'Target task definition required');
  const target=JSON.parse(readFileSync(targetFile,'utf8'));
  const preserved=preservePolicyReceipts(target,value.taskDefinition??value,policyMode??'preserve');
  writeFileSync(targetFile,JSON.stringify(preserved,null,2)+'\n');
 }else console.log(resolveAuditReceipts(mode,value.taskDefinition??value));
}
