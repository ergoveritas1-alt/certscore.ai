import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), out=path.join(root,'artifacts/ar-retention-cohort-20261009');
const selection=JSON.parse(await readFile(path.join(out,'owned-selection.json'),'utf8'));
const {selectCalibrationTargets}=await import('../../scripts/lib/scan-quality-calibration-ledger.ts');
const ledger=JSON.parse(await readFile(path.join(out,'owned-effective-ledger.json'),'utf8'));
let next=0; const visits:any[]=[]; const contacts:any[]=[];
const flush=()=>writeFile(path.join(out,'owned-summary.json'),JSON.stringify({runKey:'ar-retention-cohort-20261009',generatedAt:new Date().toISOString(),localOnly:true,noDeployment:true,protocol:'Two owned canaries, one candidate visit each, serial domain contacts; frozen previous working source versus fixed-cap priority retention. Not a release cohort or causal same-stream comparison. Fresh independent consent/Accept/Reject sessions, same bot/local egress;13s search,30s terminal,A3s/R8s windows. No forms, new lanes, retries, timeouts, models or deployment.',visits,results:contacts},null,2));
async function worker(){while(next<selection.selected.length){
 const index=next++, target=selection.selected[index];
 const eligible=selectCalibrationTargets({targets:[target],ledger,limit:1,minimumCooldownDays:28,now:new Date(),rotationKey:selection.rotationKey,cooldownOverrideReason:selection.cooldownOverride?.reason});
 if(eligible.selected[0]?.url!==target.url)throw new Error('target selection changed');
 const order=[['candidate',1]];
 for(const [version,repeat] of order){
  const dir=path.join(out,'owned-visits',new URL(target.url).hostname,new URL(target.url).pathname.replaceAll('/','_'),`${version}-${repeat}`);await mkdir(dir,{recursive:true});
  let exists=false;try{await access(path.join(dir,'result.json'));exists=true;}catch{}if(exists)throw new Error('Refusing to overwrite existing visit evidence: '+dir);
  const source=version==='baseline'?path.join(root,'artifacts/ar-onetrust-confirmation-20261009/candidate'):path.join(root,'artifacts/ar-request-retention-20261009/candidate');
  const row:any={url:target.url,version,repeat,startedAt:new Date().toISOString(),status:'running'};visits.push(row);await flush();
  const child=spawn(process.execPath,['--import','tsx',path.join(root,'artifacts/ar-retention-cohort-20261009/visit.mts'),source,target.url,dir,String(version),String(repeat)],{cwd:root,detached:true,env:{...process.env,TSX_TSCONFIG_PATH:path.join(source,'tsconfig.base.json')}});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>{try{process.kill(-child.pid!,'SIGTERM')}catch{}},90000);
  const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);
  await writeFile(path.join(dir,'process.log'),stdout+stderr);
  row.status=code===0?'completed':'failed';row.completedAt=new Date().toISOString();row.exitCode=code;
  let result:any;try{result=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));}catch{}
  row.resultPath=path.relative(root,path.join(dir,'result.json'));
  if(result){for(const lane of result.lanes)contacts.push({...lane,version,repeat});row.noGo=result.lanes.some((r:any)=>r.runtime?.noGoCandidate);}
  else{row.error=stderr.slice(-2000);}
  await flush();console.log(JSON.stringify({done:visits.filter(r=>r.completedAt).length,planned:2,url:target.url,version,repeat,status:row.status,noGo:row.noGo,lanes:result?.lanes.map((r:any)=>({lane:r.lane,accept:r.observations?.[0]?.accept,reject:r.observations?.[0]?.reject,click:r.click?.outcome,registration:r.registration?.status,error:r.error}))}));
  if(row.noGo){row.remainingVisitsSkipped='no_automatic_repeat_after_no_go';await flush();break;}
 }
}}
await worker();await flush();
