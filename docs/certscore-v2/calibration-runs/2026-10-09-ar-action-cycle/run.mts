import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), out=path.join(root,'artifacts/ar-action-cycle-20261009');
const selection=JSON.parse(await readFile(path.join(out,'selection.json'),'utf8'));
const {selectCalibrationTargets}=await import('../../scripts/lib/scan-quality-calibration-ledger.ts');
const ledger=JSON.parse(await readFile(path.join(out,'selected-ledger.json'),'utf8'));
let next=0; const visits:any[]=[]; const contacts:any[]=[];
const flush=()=>writeFile(path.join(out,'summary.json'),JSON.stringify({runKey:'ar-action-cycle-20261009',generatedAt:new Date().toISOString(),localOnly:true,noDeployment:true,protocol:'3 selected sites;2 repeats/source balanced ABBA/BAAB. Before is frozen previous working source;after adds bounded recovery and explicit Reject budget. Same local identity and independent fresh consent/Accept/Reject sessions. Legacy Reject ignores30s input;after enforces it. No forms/scanner model calls/deployment.',visits,results:contacts},null,2));
async function worker(){while(next<selection.selected.length){
 const index=next++, target=selection.selected[index];
 const eligible=selectCalibrationTargets({targets:[target],ledger,limit:1,minimumCooldownDays:28,now:new Date(),rotationKey:selection.rotationKey,cooldownOverrideReason:selection.cooldownOverride?.reason});
 if(eligible.selected[0]?.url!==target.url)throw new Error('target selection changed');
 const order=index%2?[['candidate',1],['baseline',1],['baseline',2],['candidate',2]]:[['baseline',1],['candidate',1],['candidate',2],['baseline',2]];
 for(const [version,repeat] of order){
  const dir=path.join(out,'visits',new URL(target.url).hostname,`${version}-${repeat}`);await mkdir(dir,{recursive:true});
  const source=version==='baseline'?path.join(out,'before'):root;
  const row:any={url:target.url,version,repeat,startedAt:new Date().toISOString(),status:'running'};visits.push(row);await flush();
  const child=spawn(process.execPath,['--import','tsx',path.join(root,'artifacts/ar-live-paired-20261009/visit.mts'),source,target.url,dir,String(version),String(repeat)],{cwd:root,detached:true,env:{...process.env,TSX_TSCONFIG_PATH:path.join(source,'tsconfig.base.json')}});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>{try{process.kill(-child.pid!,'SIGTERM')}catch{}},90000);
  const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);
  await writeFile(path.join(dir,'process.log'),stdout+stderr);
  row.status=code===0?'completed':'failed';row.completedAt=new Date().toISOString();row.exitCode=code;
  let result:any;try{result=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));}catch{}
  row.resultPath=path.relative(root,path.join(dir,'result.json'));
  if(result){for(const lane of result.lanes)contacts.push({...lane,version,repeat});row.noGo=result.lanes.some((r:any)=>r.runtime?.noGoCandidate);}
  else{row.error=stderr.slice(-2000);}
  await flush();console.log(JSON.stringify({done:visits.filter(r=>r.completedAt).length,planned:12,url:target.url,version,repeat,status:row.status,noGo:row.noGo,lanes:result?.lanes.map((r:any)=>({lane:r.lane,accept:r.observations?.[0]?.accept,reject:r.observations?.[0]?.reject,click:r.click?.outcome,registration:r.registration?.status,error:r.error}))}));
  if(row.noGo){row.remainingVisitsSkipped='no_automatic_repeat_after_no_go';await flush();break;}
 }
}}
await Promise.all([worker(),worker()]);await flush();
