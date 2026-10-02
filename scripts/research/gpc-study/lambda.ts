/** Standalone research Lambda runtime. No production scanner handler is invoked. */
import fs from 'node:fs';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {gzipSync} from 'node:zlib';import {captureVisit} from './visit.ts';import {sha} from './metrics.ts';
const s3=new S3Client({region:'us-west-1'});
async function handler(payload:any){
 if(payload.kind==='browser_probe'){
  await s3.send(new PutObjectCommand({Bucket:process.env.GPC_RESEARCH_BUCKET,Key:'v2-dag-lambda/local/research/gpc-controlled-study-2026/preflight/'+sha(fs.readFileSync(__filename,'utf8'))+'-'+Date.now()+'.json',Body:JSON.stringify({kind:'research-storage-preflight',at:new Date().toISOString()}),ContentType:'application/json',IfNoneMatch:'*'}));
  const {chromium}=await import('playwright');const b=await chromium.launch({headless:true,executablePath:process.env.CERTSCORE_CHROMIUM_EXECUTABLE_PATH,proxy:{server:process.env.GPC_RESEARCH_PROXY_SERVER!},args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-setuid-sandbox','--disable-software-rasterizer','--no-zygote','--single-process']});
  try{const c=await b.newContext({proxy:undefined});const p=await c.newPage();await p.goto('data:text/html,<h1>Native GPC probe</h1>');const native=await p.evaluate(()=>({present:'globalPrivacyControl' in navigator,type:typeof (navigator as any).globalPrivacyControl,ua:navigator.userAgent}));await p.goto('https://checkip.amazonaws.com',{waitUntil:'domcontentloaded',timeout:10000});const address=(await p.locator('body').innerText()).trim();if(!/^[0-9.]+$/.test(address))throw Error('egress_readback_invalid');return {browserVersion:b.version(),native,egressIpHash:sha(address),platform:process.platform,arch:process.arch};}finally{await b.close();}
 }
 if(payload.kind!=='visit'||!payload.visit?.visit_id?.match(/^site_[0-9a-f]{16}_(primary|aa)_b[123]_p[12]$/))throw Error('invalid_research_visit');
 if(payload.config.lambdaBundleSha256!==sha(fs.readFileSync(__filename,'utf8')))throw Error('lambda_bundle_mismatch');
 const config={...payload.config,proxy:{server:process.env.GPC_RESEARCH_PROXY_SERVER},fixture:false};
 if(!config.proxy.server)throw Error('research_proxy_missing');
 const record=await captureVisit(payload.visit,config);const text=JSON.stringify(record),bytes=gzipSync(text);
 if(!['pilot-v3','full-v3'].includes(payload.runNamespace))throw Error('invalid_run_namespace');
 const key=`v2-dag-lambda/local/research/gpc-controlled-study-2026/${payload.runNamespace}/${payload.visit.visit_id}.json.gz`;
 await s3.send(new PutObjectCommand({Bucket:process.env.GPC_RESEARCH_BUCKET,Key:key,Body:bytes,ContentType:'application/gzip',IfNoneMatch:'*'}));
 return {bucket:process.env.GPC_RESEARCH_BUCKET,key,sha256:sha(text),sizeBytes:Buffer.byteLength(text),compressedBytes:bytes.length,status:record.status};
}
async function main(){const api=process.env.AWS_LAMBDA_RUNTIME_API;if(!api)throw Error('Lambda runtime required');for(;;){const response=await fetch(`http://${api}/2018-06-01/runtime/invocation/next`);const id=response.headers.get('lambda-runtime-aws-request-id');try{const output=await handler(await response.json());await fetch(`http://${api}/2018-06-01/runtime/invocation/${id}/response`,{method:'POST',body:JSON.stringify(output)});}catch(e:any){await fetch(`http://${api}/2018-06-01/runtime/invocation/${id}/error`,{method:'POST',body:JSON.stringify({errorMessage:String(e.message).slice(0,240),errorType:'ResearchCaptureError'})});}}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
