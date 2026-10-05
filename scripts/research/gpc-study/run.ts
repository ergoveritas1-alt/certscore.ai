import {LambdaClient,InvokeCommand,GetFunctionCommand} from '@aws-sdk/client-lambda';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {gunzipSync} from 'node:zlib';
import fs from 'node:fs';import path from 'node:path';import {captureVisit} from './visit.ts';import {sha} from './metrics.ts';
import {readCsv} from './csv.ts';export {readCsv} from './csv.ts';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function main(args=process.argv.slice(2)){
 const root=path.resolve(args[0]??'artifacts/research/gpc-controlled-study-2026'),mode=args[1]??'plan';
 if(!['plan','pilot','full'].includes(mode))throw Error('Use plan, pilot, full');
 const config=JSON.parse(fs.readFileSync(root+'/frozen_config.json','utf8')),manifest=JSON.parse(fs.readFileSync(root+'/sample_manifest.json','utf8'));
 for(const [file,expected] of Object.entries(manifest.files))if(sha(fs.readFileSync(root+'/'+file,'utf8'))!==expected)throw Error('frozen_file_mismatch:'+file);
 const freeze=JSON.parse(fs.readFileSync(root+'/freeze_manifest.json','utf8'));for(const [file,expected] of Object.entries(freeze.files))if(sha(fs.readFileSync(root+'/'+file,'utf8'))!==expected)throw Error('protocol_freeze_mismatch:'+file);
 if(config.runnerBundleSha256&&sha(fs.readFileSync(process.argv[1]!,'utf8'))!==config.runnerBundleSha256)throw Error('runner_bundle_mismatch');
 const sites=new Map(readCsv(root+'/sample_frame.csv').map(r=>[r.site_id,r])),pilot=new Set(readCsv(root+'/pilot_sites.csv').map(r=>r.site_id));
 const jobs=readCsv(root+'/randomization.csv').filter(r=>mode!=='pilot'||pilot.has(r.site_id)).map(r=>({...r,...{url:sites.get(r.site_id)!.url,domain:sites.get(r.site_id)!.domain,block:Number(r.block),position:Number(r.position),attempt:1}}));
 if(mode==='plan'){console.log(JSON.stringify({sites:sites.size,visits:jobs.length,pilotVisits:jobs.filter(r=>pilot.has(r.site_id)).length,configHash:sha(config)},null,2));return;}
 if(config.launchState!=='frozen_and_locally_validated')throw Error('local_validation_not_complete');
 if(mode==='full'){const f=root+'/private/full-launch-authorization.json';if(!fs.existsSync(f))throw Error('Separate explicit full-study authorization and budget approval required');const a=JSON.parse(fs.readFileSync(f,'utf8'));if(a.explicitOwnerAuthorization!==true||a.configSha256!==sha(config)||a.maximumUsd<config.fullStudyBudgetUsd)throw Error('full_launch_authorization_invalid');}
 const contact=JSON.parse(fs.readFileSync(root+'/private/contact-eligibility.json','utf8'));
 if(Date.now()-Date.parse(contact.checkedAt)>24*3600*1000)throw Error('contact_history_stale');
 if(jobs.some(j=>!contact.sites[j.site_id]))throw Error('contact_history_incomplete_for_selected_run');
 const proxy=process.env.GPC_RESEARCH_PROXY_SERVER;if(!proxy&&!config.lambdaFunctionName)throw Error('California proxy or research Lambda required');
 const egress=JSON.parse(fs.readFileSync(root+'/private/egress-verification.json','utf8'));if(!egress.verified||Date.now()-Date.parse(egress.checkedAt)>24*3600*1000)throw Error('egress_unverified');
 if(config.lambdaFunctionName){const live=await new LambdaClient({region:'us-west-1'}).send(new GetFunctionCommand({FunctionName:config.lambdaFunctionName}));if(!live.Code?.ResolvedImageUri?.endsWith('@'+config.imageDigest))throw Error('deployed_image_mismatch');}
 const runRoot=root+'/private/'+mode+'-v3';fs.mkdirSync(runRoot,{recursive:true,mode:0o700});
 const lock=runRoot+'/.scheduler.lock';try{fs.mkdirSync(lock);}catch{throw Error('scheduler_locked; inspect interrupted owner before explicit recovery');}
 const done=new Map<string,any>(),started=new Set<string>(),active=new Map<string,Promise<void>>();
 const write=(job:any,result:any)=>{const file=runRoot+'/'+job.visit_id+'.json';const record={...result,visit:job,configSha256:sha(config)};fs.writeFileSync(file+'.tmp',JSON.stringify(record),{mode:0o600});fs.renameSync(file+'.tmp',file);done.set(job.visit_id,record);};
 try{
  for(const j of jobs){const file=runRoot+'/'+j.visit_id+'.json';if(fs.existsSync(file))done.set(j.visit_id,JSON.parse(fs.readFileSync(file,'utf8')));else if(fs.existsSync(runRoot+'/'+j.visit_id+'.started'))write(j,{status:'interrupted',coverage:{limitations:['uncertain_previous_execution_no_automatic_retry']},provenance:{completedAt:new Date().toISOString()}});}
  while(done.size<jobs.length){
   for(const j of jobs){
    if(done.has(j.visit_id)||started.has(j.visit_id))continue;
    const c=contact.sites[j.site_id];if(!c)throw Error('contact_history_missing:'+j.site_id);
    if(!c.eligible){write(j,{status:'not_contacted',coverage:{limitations:[c.reason]},provenance:{completedAt:new Date().toISOString()}});continue;}
    if(active.size>=config.globalConcurrency||[...started].some(id=>!done.has(id)&&jobs.find(x=>x.visit_id===id)?.site_id===j.site_id))continue;
    const previous=jobs.filter(x=>x.site_id===j.site_id&&(x.block<j.block||(x.block===j.block&&x.position<j.position)));
    if(previous.some(x=>!done.has(x.visit_id)))continue;
    const last=previous.sort((a,b)=>b.block-a.block||b.position-a.position)[0];
    if(last){const terminal=Date.parse(done.get(last.visit_id).provenance.completedAt),spacing=last.block===j.block?config.withinPairSpacingMs:config.blockSpacingMs;if(Date.now()<terminal+spacing)continue;}
    fs.writeFileSync(runRoot+'/'+j.visit_id+'.started',JSON.stringify({at:new Date().toISOString(),configSha256:sha(config)}),{flag:'wx',mode:0o600});started.add(j.visit_id);
    const task=(config.lambdaFunctionName?invokeVisit(j,config,mode):captureVisit(j,{...config,proxy:{server:proxy}})).then(r=>write(j,r)).catch(e=>write(j,{status:'failed',error:String(e).slice(0,240),coverage:{limitations:['uncaught_infrastructure_error']},provenance:{completedAt:new Date().toISOString()}})).finally(()=>active.delete(j.visit_id));active.set(j.visit_id,task);
   }
   const transfer=[...done.values()].reduce((s,r)=>s+(r.coverage?.transferredBytes??0),0);
   fs.writeFileSync(runRoot+'/checkpoint.json',JSON.stringify({at:new Date().toISOString(),terminal:done.size,planned:jobs.length,active:[...active.keys()],observedTransferBytes:transfer}));
   if(transfer>config.pilotAggregateBytes&&mode==='pilot'){await Promise.allSettled([...active.values()]);throw Error('pilot_transfer_budget_stop');}
   if(done.size<jobs.length)await pause(1000);
  }
 }finally{await Promise.allSettled([...active.values()]);fs.rmdirSync(lock);}
 console.log(JSON.stringify({runRoot,terminal:done.size,planned:jobs.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});

async function invokeVisit(visit:any,config:any,mode:string){
 const client=new LambdaClient({region:'us-west-1',maxAttempts:1});
 const response=await client.send(new InvokeCommand({FunctionName:config.lambdaFunctionName,Payload:Buffer.from(JSON.stringify({kind:'visit',visit,config,runNamespace:mode+'-v3'}))}));
 const result=JSON.parse(Buffer.from(response.Payload??[]).toString());if(response.FunctionError)throw Error(result.errorMessage??'research_invocation_failed');
 if(result.bucket!==config.artifactBucket||!result.key.startsWith('v2-dag-lambda/local/research/gpc-controlled-study-2026/'+mode+'-v3/'))throw Error('unexpected_artifact_pointer');
 const source=await new S3Client({region:'us-west-1'}).send(new GetObjectCommand({Bucket:result.bucket,Key:result.key}));
 const bytes=gunzipSync(Buffer.from(await source.Body!.transformToByteArray()));if(bytes.length!==result.sizeBytes||sha(bytes.toString())!==result.sha256)throw Error('research_artifact_integrity');
 return {...JSON.parse(bytes.toString()),artifact:{...result}};
}
