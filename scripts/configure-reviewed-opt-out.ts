import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
type Entry={name:string;value:string};
type Task={containerDefinitions:Array<{name:string;environment?:Entry[];secrets?:Array<{name:string;valueFrom:string}>;[key:string]:unknown}>;[key:string]:unknown};
export const ROLLOUT_FLAGS=['CERTSCORE_CONDITIONAL_SALE_SHARING_OPT_OUT_ENABLED','CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED','CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED','CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED'];
export function configureReviewedOptOut(task:Task,mode:string,containerName:string){
 assert.ok(['preserve','enable','disable'].includes(mode));if(mode==='preserve')return task;
 assert.ok(['certscore-web','validation-worker'].includes(containerName),'Unexpected rollout consumer');
 const targets=task.containerDefinitions.filter(c=>c.name===containerName);assert.equal(targets.length,1);
 const target=targets[0]!,environment=target.environment??[];
 assert.equal(new Set(environment.map(e=>e.name)).size,environment.length,'Duplicate environment keys');
 assert.ok(!(target.secrets??[]).some(e=>ROLLOUT_FLAGS.includes(e.name)),'Rollout flag shadowed by secret');
 return {...task,containerDefinitions:task.containerDefinitions.map(c=>c!==target?c:{...c,environment:[...environment.filter(e=>!ROLLOUT_FLAGS.includes(e.name)),...ROLLOUT_FLAGS.map(name=>({name,value:mode==='enable'?'1':'0'}))]})};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const [file,mode,container]=process.argv.slice(2);assert.ok(file&&mode&&container);
 writeFileSync(file,JSON.stringify(configureReviewedOptOut(JSON.parse(readFileSync(file,'utf8')),mode,container)));
 console.log(`Reviewed opt-out rollout: ${mode}; task resources unchanged.`);
}
