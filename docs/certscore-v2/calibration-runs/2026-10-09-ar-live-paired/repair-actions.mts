import { spawn } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'artifacts/ar-live-paired-20261009');
const summary=JSON.parse(await readFile(path.join(out,'summary.json'),'utf8'));
const jobs:any[]=[];
const reviewedNoGo=new Set(['nomura.com']);
for(const visit of summary.visits){
 if(reviewedNoGo.has(new URL(visit.url).hostname))continue;
 if(!visit.completedAt)throw new Error('Main paired batch is still running');
 const r=JSON.parse(await readFile(path.join(root,visit.resultPath),'utf8'));
 if(r.lanes.some((l:any)=>l.limitations?.some((s:string)=>s.includes('scan_identity_mismatch'))))jobs.push(visit);
}
const bySite=new Map<string,any[]>();for(const j of jobs)bySite.set(j.url,[...(bySite.get(j.url)??[]),j]);
const sites=[...bySite.entries()];let next=0;const visits:any[]=[],contacts:any[]=[];
const flush=()=>writeFile(path.join(out,'action-repair-summary.json'),JSON.stringify({runKey:'ar-live-paired-action-repair-20261009',generatedAt:new Date().toISOString(),scope:'Repeat only harness-invalid action visits; no passive rescan. Original invalid actions excluded, no finding generated.',visits,results:contacts},null,2));
async function worker(){while(next<sites.length){const [url,group]=sites[next++]!;for(const job of group){
 const dir=path.join(out,'action-repair',new URL(url).hostname,`${job.version}-${job.repeat}`);await mkdir(dir,{recursive:true});
 const source=job.version==='baseline'?path.join(out,'baseline'):root;
 const row:any={url,version:job.version,repeat:job.repeat,startedAt:new Date().toISOString(),status:'running'};visits.push(row);await flush();
 const child=spawn(process.execPath,['--import','tsx',path.join(out,'visit.mts'),source,url,dir,job.version,String(job.repeat)],{cwd:root,detached:true,env:{...process.env,AR_ACTIONS_ONLY:'1',TSX_TSCONFIG_PATH:path.join(source,'tsconfig.base.json')}});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const timer=setTimeout(()=>{try{process.kill(-child.pid!,'SIGTERM')}catch{}},90000);
 const code=await new Promise(resolve=>child.on('close',resolve));clearTimeout(timer);
 await writeFile(path.join(dir,'process.log'),stdout+stderr);
 const result=JSON.parse(await readFile(path.join(dir,'result.json'),'utf8'));
 Object.assign(row,{status:code===0?'completed':'failed',completedAt:new Date().toISOString(),resultPath:path.relative(root,path.join(dir,'result.json'))});
 for(const lane of result.lanes)contacts.push({...lane,version:job.version,repeat:job.repeat});
 await flush();console.log(JSON.stringify({done:visits.filter(r=>r.completedAt).length,planned:jobs.length,url,version:job.version,repeat:job.repeat,status:row.status,lanes:result.lanes.map((r:any)=>({lane:r.lane,click:r.click?.outcome,registration:r.registration?.status,error:r.error}))}));
 }}}
await Promise.all([worker(),worker()]);await flush();
