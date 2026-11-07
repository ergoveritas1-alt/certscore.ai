import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const key='CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED';
export function resolveAuditReceipts(mode:string,current:{containerDefinitions?:Array<{name:string;environment?:Array<{name:string;value:string}>;secrets?:Array<{name:string}>}>}){
 assert.ok(['preserve','true','false'].includes(mode));
 if(mode!=='preserve')return mode==='true'?'1':'0';
 const containers=(current.containerDefinitions??[]).filter(c=>c.name==='certscore-web');assert.ok(containers.length<=1);
 const target=containers[0];if(!target)return '0';
 assert.ok(!(target.secrets??[]).some(e=>e.name===key),'Receipt flag must not be shadowed by a secret');
 const values=(target.environment??[]).filter(e=>e.name===key);assert.ok(values.length<=1,'Duplicate receipt flag');
 if(!values.length)return '0';assert.ok(['0','1'].includes(values[0]!.value),'Invalid current receipt flag');return values[0]!.value;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [mode,file]=process.argv.slice(2);assert.ok(mode&&file);const value=JSON.parse(readFileSync(file,'utf8'));console.log(resolveAuditReceipts(mode,value.taskDefinition??value));}
