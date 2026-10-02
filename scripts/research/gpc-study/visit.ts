/** Isolated research capture; no production persistence, model calls or consent actions. */
import {chromium} from 'playwright';
import {getDomain} from 'tldts';
import {randomUUID,createHash} from 'node:crypto';
import {installGpcNavigatorSignal} from '../../../packages/certscore-scan-core/src/gpc-signal-capture.ts';
import {captureGpcOptOutObservation} from '../../../packages/certscore-scan-core/src/gpc-opt-out-capture.ts';
import {classifyConsentGeometryAccess} from '../../../packages/certscore-scan-core/src/consent-geometry-access.ts';
import {assertPublicNetworkUrl,installPublicNetworkGuardRoute} from '../../../packages/certscore-scan-core/src/public-network-guard.ts';
import {resolveCanonicalVendor,CANONICAL_VENDOR_RESOLVER_VERSION} from '../../../packages/certscore-vendor-resolver/src/index.ts';
import {chromiumLaunchArgs} from '../../../packages/certscore-scan-core/src/playwright-runtime.ts';
import {sha,summarize} from './metrics.ts';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function captureVisit(input:any,config:any){
 const started=Date.now(),browserId=randomUUID(),contextId=randomUUID();
 const result:any={contract:'certscore.research.gpc.visit.v1',visit:input,provenance:{...config,browserId,contextId,actualPlatform:process.platform,actualArchitecture:process.arch,nodeVersion:process.version,resolverVersion:CANONICAL_VENDOR_RESOLVER_VERSION,startedAt:new Date(started).toISOString()},observed:{requests:[],snapshots:[],delivery:[],workers:[],navigations:[]},derived:{windows:[]},coverage:{limitations:[],requestsDropped:0,transferredBytes:0},status:'failed'};
 let browser:any,context:any,page:any,commit:any,latestDocument:any,mainFrameId:string|undefined,offset:number|undefined;
 const init=new Map<string,number>(),pending=new Set<Promise<any>>(),reqMap=new Map<any,any>();let capturing=true;
 const limit=(x:string)=>{if(!result.coverage.limitations.includes(x))result.coverage.limitations.push(x);};
 const deadline=setTimeout(()=>{limit('visit_timeout');void browser?.close().catch(()=>{});},config.visitTimeoutMs);
 try{
  if(!config.fixture)await assertPublicNetworkUrl(input.url);
  browser=await chromium.launch({headless:true,executablePath:config.executablePath||process.env.CERTSCORE_CHROMIUM_EXECUTABLE_PATH||undefined,proxy:config.proxy,timeout:10000,args:config.launchArgs??chromiumLaunchArgs({env:process.platform==='linux'?{AWS_LAMBDA_FUNCTION_NAME:'research'}:{}})});
  result.provenance.chromiumVersion=browser.version();result.provenance.browserLaunchedAt=new Date().toISOString();
  if(config.chromiumVersion&&browser.version()!==config.chromiumVersion)throw Error('chromium_version_mismatch');
  context=await browser.newContext({viewport:{width:1366,height:900},locale:'en-US',timezoneId:'America/Los_Angeles',ignoreHTTPSErrors:false,serviceWorkers:'allow',userAgent:input.ua_profile==='bot'?config.botUserAgent:config.userAgent,extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9',...(input.condition==='enabled'?{'Sec-GPC':'1'}:{})}});
  if(!config.fixture)await installPublicNetworkGuardRoute(context,{env:{CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE:'true'}});
  else await context.route('**/*',async(route:any)=>{if(new URL(route.request().url()).hostname==='127.0.0.1')await route.continue();else await route.fulfill({status:204,body:''});});
  if(input.condition!=='absent')await installGpcNavigatorSignal(context,input.condition==='enabled');
  if(!['absent','enabled','false'].includes(input.condition))throw Error('condition_invalid');
  page=await context.newPage();context.on('page',(other:any)=>{if(other!==page)limit('additional_page_unverified');});page.on('framedetached',()=>limit('transient_frame_unverified'));const cdp=await context.newCDPSession(page);
  await cdp.send('Page.enable');await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',(e:any)=>{if(offset===undefined&&e.type==='Document')offset=e.wallTime*1000-e.timestamp*1000;});
  cdp.on('Page.lifecycleEvent',(e:any)=>{if(e.name==='init'){init.set(e.loaderId,e.timestamp*1000);if(latestDocument?.token===e.loaderId&&offset!==undefined)latestDocument.committedAt=e.timestamp*1000+offset;}});
  cdp.on('Page.frameNavigated',(e:any)=>{if(e.frame.parentId)return;mainFrameId=e.frame.id;const mono=init.get(e.frame.loaderId);latestDocument={source:'cdp_loader_id',token:e.frame.loaderId,urlSha256:sha(e.frame.url),frameId:e.frame.id,committedAt:mono!==undefined&&offset!==undefined?mono+offset:null,receivedAt:Date.now()};result.observed.navigations.push(latestDocument);if(commit&&latestDocument.token!==commit.token)limit('document_changed_after_commit');});
  const worker=(w:any)=>{result.observed.workers.push({urlHash:sha(w.url()),at:Date.now()});limit('worker_navigator_startup_unverified');};context.on('serviceworker',worker);page.on('worker',worker);
  context.on('request',(req:any)=>{
   if(!capturing)return;if(result.observed.requests.length>=config.maxRequests){result.coverage.requestsDropped++;limit('request_overflow');return;}
   let frameUrl:string|null=null;try{frameUrl=req.frame().url();}catch{}
   let url:URL;try{url=new URL(req.url());if(!['http:','https:'].includes(url.protocol))return;}catch{return;}
   const observedAt=Date.now(),requestStart=req.timing().startTime,id='request_'+result.observed.requests.length,classification=resolveCanonicalVendor({type:'request',url:req.url(),evidenceId:id});
   const v=classification.observation,top=getDomain(input.url,{allowPrivateDomains:true}),host=getDomain(url.hostname,{allowPrivateDomains:true});
   const row:any={id,at:requestStart>0?requestStart:observedAt,timestampBasis:requestStart>0?'browser_request_start_epoch_ms':'event_received_epoch_ms',receivedAt:observedAt,urlHash:sha(req.url()),endpoint:url.origin+url.pathname,method:req.method(),resourceType:req.resourceType(),frameUrlHash:frameUrl?sha(frameUrl):null,thirdParty:top&&host?top!==host:null,classification:v?{status:'resolved',vendor:v.vendor,product:v.product??'unspecified',purpose:v.purpose,serviceId:sha([v.vendor,v.product??'unspecified',v.purpose]),registryAttribution:v.registryAttribution}: {status:classification.status},status:'pending',secGpc:null,headersRead:false};
   result.observed.requests.push(row);reqMap.set(req,row);
   const task=req.allHeaders().then((h:any)=>{row.secGpc=h['sec-gpc']??null;row.userAgent=h['user-agent']??null;row.headersRead=true;}).catch(()=>limit('request_header_read_failed')).finally(()=>pending.delete(task));pending.add(task);
  });
  context.on('response',(response:any)=>{const row=reqMap.get(response.request());if(row){row.responseStatus=response.status();row.responseAt=Date.now();row.status='response_observed';}});
  context.on('requestfailed',(req:any)=>{const row=reqMap.get(req);if(row){row.status='failed';row.failure=req.failure()?.errorText??'unknown';row.completedAt=Date.now();}});
  context.on('requestfinished',(req:any)=>{const row=reqMap.get(req);if(!row)return;row.status='completed';row.completedAt=Date.now();const t=req.timing();if(t.startTime>0){row.at=t.startTime;row.timestampBasis='browser_request_start_epoch_ms';row.timing=t;}});
  cdp.on('Network.dataReceived',(e:any)=>{result.coverage.transferredBytes+=e.encodedDataLength||e.dataLength||0;if(result.coverage.transferredBytes>config.maxBytes){limit('transfer_budget_exceeded');void page.close().catch(()=>{});}});
  const navigationStarted=Date.now();const response=await page.goto(input.url,{waitUntil:'commit',timeout:config.navigationTimeoutMs});result.provenance.navigationElapsedMs=Date.now()-navigationStarted;
  const bindingDeadline=Date.now()+1000;while(!latestDocument?.committedAt&&Date.now()<bindingDeadline)await pause(5);commit=latestDocument;if(!commit?.committedAt)throw Error('document_commit_unverified');result.observed.document=commit;result.observed.effectiveUrl=page.url();
  if(getDomain(page.url(),{allowPrivateDomains:true})!==getDomain(input.url,{allowPrivateDomains:true}))limit('cross_domain_redirect');
  for(const horizon of config.endpointsMs){
   await pause(Math.max(0,commit.committedAt+horizon-Date.now()));
   const checkpointStarted=Date.now(),identityBefore=latestDocument?.token;
   const frames=page.frames();if(frames.length>64)limit('frame_inventory_overflow');
   const reads=await Promise.all(frames.slice(0,64).map(async(frame:any)=>{
    try{return await frame.evaluate('(() => { const __name = (fn) => fn; return (' + (()=>{const n=navigator as Navigator&{globalPrivacyControl?:unknown};const storage=(name:'localStorage'|'sessionStorage')=>{try{const s=window[name];return {complete:true,entries:Object.keys(s).slice(0,10000).map(k=>[k,s.getItem(k)]),overflow:s.length>10000};}catch{return {complete:false,entries:[],overflow:false};}};return {url:location.href,timeOrigin:performance.timeOrigin,at:Date.now(),navigatorPresent:'globalPrivacyControl' in n,navigatorValue:n.globalPrivacyControl??null,local:storage('localStorage'),session:storage('sessionStorage'),title:document.title,bodyText:(document.body?.innerText??'').slice(0,6000)};}).toString() + ')(); })()');}catch{return null;}
   }));
   const cookies=await context.cookies();
   const semantic=await captureGpcOptOutObservation(page,{scanId:input.visit_id,scanStartedAtMs:started,semanticOnly:true,binding:{captureId:contextId,documentIdentity:()=>latestDocument}}).catch(()=>null);
   const main:any=reads[frames.indexOf(page.mainFrame())];
   const access=classifyConsentGeometryAccess({pageUrl:page.url(),httpStatus:response?.status(),title:main?.title,bodyText:main?.bodyText});
   const snapshot:any={horizonMs:horizon,startedAt:checkpointStarted,completedAt:Date.now(),lagMs:checkpointStarted-(commit.committedAt+horizon),documentToken:identityBefore,documentStable:identityBefore===latestDocument?.token&&identityBefore===commit.token,access:{status:access.status,reasonCodes:access.reasonCodes},semantic,cookies:cookies.map((c:any)=>({name:c.name,domain:c.domain,path:c.path,partitionKey:c.partitionKey??null,valueHash:sha(c.value),secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,expires:c.expires,thirdParty:getDomain(c.domain.replace(/^\./,''),{allowPrivateDomains:true})!==getDomain(page.url(),{allowPrivateDomains:true})})),frames:reads.map((x:any)=>x?{urlHash:sha(x.url),origin:new URL(x.url).origin,timeOrigin:x.timeOrigin,at:x.at,navigatorPresent:x.navigatorPresent,navigatorValue:x.navigatorValue,local:{...x.local,entries:x.local.entries.map(([k,v]:any)=>({keyHash:sha(k),valueHash:sha(v)}))},session:{...x.session,entries:x.session.entries.map(([k,v]:any)=>({keyHash:sha(k),valueHash:sha(v)}))}}:null)};
   result.observed.snapshots.push(snapshot);
   if(snapshot.lagMs>250)limit('endpoint_schedule_lag');
   if(!snapshot.documentStable)limit('snapshot_document_mismatch');
   if(reads.some((x:any)=>!x))limit('frame_read_unavailable');
   if(reads.some((x:any)=>x&&(input.condition==='absent'?x.navigatorPresent:x.navigatorValue!==(input.condition==='enabled'))))limit('navigator_condition_mismatch');
   if(access.status!=='loaded')limit('access_not_representative');
   if(!main?.bodyText?.trim()&&!main?.title?.trim())limit('blank_document');
  }
  try{const bytes=await page.screenshot({type:'png',timeout:1500});result.observed.representativeScreenshot={sha256:createHash('sha256').update(bytes).digest('hex'),encoding:'base64',data:bytes.toString('base64'),capturedAt:Date.now()};}catch{result.observed.representativeScreenshot={status:'unavailable'};}
  result.status='complete';
 }catch(e:any){result.error=String(e?.message??e).split('\n')[0]!.slice(0,240);limit('visit_failed');}
 finally{
  for(const [request,row] of reqMap){const timing=request.timing();if(timing.startTime>0){row.at=timing.startTime;row.timestampBasis='browser_request_start_epoch_ms';row.timing=timing;}}
  capturing=false;await Promise.race([Promise.allSettled([...pending]),pause(500)]);if(pending.size)limit('pending_header_reads');
  if(result.observed.requests.some((r:any)=>r.timestampBasis!=='browser_request_start_epoch_ms'))limit('request_timestamp_unverified');
  if(result.observed.requests.some((r:any)=>!r.headersRead||(input.condition==='enabled'?r.secGpc!=='1':r.secGpc!==null)))limit('request_condition_unverified');
  if(commit){const main=result.observed.requests.find((r:any)=>r.resourceType==='document'&&r.urlHash===commit.urlSha256&&r.headersRead&&r.responseStatus>=200&&r.responseStatus<400);if(!main)limit('main_document_transport_proof_missing');else result.observed.delivery.push({documentToken:commit.token,requestId:main.id,secGpc:main.secGpc,responseStatus:main.responseStatus,basis:'retained_browser_header_and_document_response'});for(const h of config.endpointsMs){const snap=result.observed.snapshots.find((s:any)=>s.horizonMs===h);if(snap)result.derived.windows.push({...summarize(result.observed.requests,commit.committedAt,h),complete:result.status==='complete'&&result.coverage.limitations.length===0,snapshotComplete:snap.documentStable&&snap.lagMs<=250&&snap.completedAt-snap.startedAt<=250});}}
  result.provenance.completedAt=new Date().toISOString();result.provenance.totalDurationMs=Date.now()-started;delete result.provenance.proxy;
  clearTimeout(deadline);await browser?.close().catch(()=>{});
 }
 return result;
}
