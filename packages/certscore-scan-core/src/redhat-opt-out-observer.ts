import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,type Browser,type BrowserContext} from 'playwright';
import {saleSharingOptOutDispatchSchema,REDHAT_OPT_OUT_POLICY,type SaleSharingOptOutDispatch,type SaleSharingOptOutEvidence} from '@certscore/contracts';
import {chromiumContextOptions,chromiumLaunchOptions} from './playwright-runtime.js';
import {assertPublicNetworkUrl,installPublicNetworkGuardRoute} from './public-network-guard.js';
import {installWebBotAuthRoute} from './web-bot-auth-routing.js';
import {RedHatSamePageReload,waitForReloadApi} from './redhat-same-page-reload.js';
import {RedHatNavigationRecorder} from './redhat-navigation-recorder.js';
import {verifyRedHatAction,REDHAT_DIRECT_READINESS_RESERVE_MS} from './redhat-opt-out-action.js';
import {redHatObservationPacket} from './redhat-opt-out-packet.js';
const routes:Record<string,string[]>={'https://redhat.com/':['https://redhat.com/','https://www.redhat.com/en']};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Explicit v4 worker only; no ordinary v1 dispatch gains this route. */
export async function runRedHatOptOutObserver(input:{config:SaleSharingOptOutDispatch;parentDispatchSha256:string;signal?:AbortSignal;browser?:Browser;deadlineAtMs?:number}):Promise<SaleSharingOptOutEvidence>{
 input={...input,config:saleSharingOptOutDispatchSchema.parse(input.config)};
 if(input.config.policyVersion!==REDHAT_OPT_OUT_POLICY)throw Error('redhat_policy_required');
  const started=Date.now(),captureMs=Math.max(1,Math.min(3000,(input.deadlineAtMs??Infinity)-started-250)),deadline=started+captureMs,abort=new AbortController();let browser:Browser|undefined=input.browser,context:BrowserContext|undefined,closed=false;
  const row:any={scanId:input.config.scanId,url:input.config.exactTargetUrl,lane:'redhat_explicit_opt_out_diagnostic',startedAt:new Date(started).toISOString(),scannerRuntimeStarted:true,status:'failed',sourceBundleSha256:input.config.redHatAuthorization!.sourceSha256,actions:0,submitted:false,requests:[],sdkResult:null};
  const navigation=new RedHatNavigationRecorder();let reload:RedHatSamePageReload|undefined;
  const remaining=()=>{if(closed||input.signal?.aborted||Date.now()>=deadline)throw Error('capture_deadline');return deadline-Date.now();};
  const cancel=()=>{closed=true;abort.abort();void context?.close().catch(()=>undefined);if(!input.browser)void browser?.close().catch(()=>undefined);};const timer=setTimeout(cancel,captureMs);input.signal?.addEventListener('abort',cancel,{once:true});
  try{
   remaining();browser??=await chromium.launch({...chromiumLaunchOptions({headless:true}),timeout:remaining()});remaining();
   context=await browser.newContext({...chromiumContextOptions(),ignoreHTTPSErrors:false,serviceWorkers:'block'});remaining();
   await installWebBotAuthRoute(context);await installPublicNetworkGuardRoute(context);remaining();
   const page=await context.newPage();context.on('page',p=>{if(p!==page)void p.close();});const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');await cdp.send('Network.enable');
   cdp.on('Network.requestWillBeSent',(e:any)=>{if(row.actions===1)reload?.observeNetwork(e);});
   const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;
   for(const [event,slot] of [['Page.frameRequestedNavigation','requested'],['Page.frameScheduledNavigation','scheduled']] as const)cdp.on(event,(e:any)=>{if(row.actions===1)navigation.record(slot,{url:e.url,reason:e.reason,isMainFrame:e.frameId===frame,atMs:Date.now()-started,actionAtMs:row.dispatchedAtMs,sourceDocumentSha256:row.documentTokenSha256});});
   const route=routes[input.config.exactTargetUrl]!,ids:string[]=[],responses=new Set<string>();let invalid=false;
   cdp.on('Fetch.requestPaused',async(e:any)=>{
    const block=async(reason:string)=>{invalid=true;reload?.invalidate();row.guardFailure??=reason;await cdp.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'}).catch(()=>undefined);};
    try{
     remaining();if(row.actions===1&&e.responseStatusCode===undefined)navigation.record('request',{url:e.request.url,method:e.request.method,isMainFrame:e.frameId===frame,atMs:Date.now()-started,actionAtMs:row.dispatchedAtMs,sourceDocumentSha256:row.documentTokenSha256,requestId:e.requestId,redirectedRequestId:e.redirectedRequestId});if(invalid||e.frameId!==frame||e.request.method!=='GET')return await block('unreviewed_navigation');
     if(e.responseStatusCode===undefined&&row.actions===1){
      if(!reload?.authorizeRequest(e,row,navigation.snapshot().entries,Date.now()-started))return await block('unreviewed_post_click_navigation');
      await assertPublicNetworkUrl(e.request.url,{signal:abort.signal});remaining();
      row.requests.push({url:e.request.url,requestId:e.requestId,networkId:e.networkId,redirectedRequestId:null,kind:'verified_same_page_reload',atMs:Date.now()-started});
      await cdp.send('Fetch.continueRequest',{requestId:e.requestId});return;
     }
     if(e.responseStatusCode!==undefined&&reload?.isRequest(e.requestId)){
      const receipt=row.requests.find((r:any)=>r.requestId===e.requestId);if(receipt)receipt.status=e.responseStatusCode;
      if(!reload.verifyResponse(e))return await block('reload_response_unverified');
      remaining();await cdp.send('Fetch.continueRequest',{requestId:e.requestId});return;
     }
     if(e.responseStatusCode===undefined){
      const index=ids.length;if(index>=route.length||e.request.url!==route[index]||(index===0?Boolean(e.redirectedRequestId):e.redirectedRequestId!==ids[index-1]||!responses.has(ids[index-1]!)))return await block('route_or_ancestry_mismatch');
      await assertPublicNetworkUrl(e.request.url,{signal:abort.signal});remaining();ids.push(e.requestId);row.requests.push({url:e.request.url,requestId:e.requestId,redirectedRequestId:e.redirectedRequestId??null,atMs:Date.now()-started});
     }else{
      const index=ids.indexOf(e.requestId);if(index<0||responses.has(e.requestId)||e.request.url!==route[index])return await block('response_binding_mismatch');
      row.requests[index].status=e.responseStatusCode;
      if(e.responseStatusCode===301){
       const locations=(e.responseHeaders??[]).filter((h:any)=>h.name.toLowerCase()==='location');
       if(locations.length!==1||index+1>=route.length||new URL(locations[0].value,e.request.url).href!==route[index+1])return await block('unreviewed_redirect');
       await assertPublicNetworkUrl(route[index+1]!,{signal:abort.signal});remaining();
      }else if(e.responseStatusCode!==200||index!==route.length-1)return await block('non_representative_response');
      responses.add(e.requestId);
     }
     await cdp.send('Fetch.continueRequest',{requestId:e.requestId});
    }catch{await block('guard_or_capture_deadline');}
   });
   await cdp.send('Fetch.enable',{patterns:[{resourceType:'Document',requestStage:'Request'},{resourceType:'Document',requestStage:'Response'}]});
   await page.goto(input.config.exactTargetUrl,{waitUntil:'commit',timeout:Math.max(1,remaining()-REDHAT_DIRECT_READINESS_RESERVE_MS)});remaining();if(invalid)throw Error('route_not_verified');
   const bound=(await cdp.send('Page.getFrameTree')).frameTree.frame;assert.equal(bound.url,route.at(-1));row.documentUrl=bound.url;row.documentTokenSha256=hash(bound.loaderId);row.commitAtMs=Date.now()-started;
   reload=new RedHatSamePageReload({frameId:bound.id,loaderId:bound.loaderId,url:bound.url,sourceSha256:input.config.redHatAuthorization!.sourceSha256});let lastDocumentHash=hash(bound.loaderId);
   cdp.on('Page.frameNavigated',({frame:next}:any)=>{if(!next.parentId&&next.loaderId!==bound.loaderId&&!reload!.commit(next)){invalid=true;reload!.invalidate();}});
   const assertCurrent=()=>{remaining();if(invalid||page.url()!==bound.url)throw Error('document_changed');};
   const verifyBinding=async()=>{assertCurrent();const current=(await cdp.send('Page.getFrameTree')).frameTree.frame;assertCurrent();assert(reload!.accepts(current),'unverified_document_loader');lastDocumentHash=hash(current.loaderId);};
   await verifyRedHatAction(page,{deadline,started,expectedUrl:bound.url,bound:verifyBinding,assertCurrent,signal:abort.signal,record:row,documentIdentity:()=>lastDocumentHash,prepareTerminal:async()=>{
    if(!reload!.hasRequest())return;const cutoff=deadline-300;await reload!.waitForCommit(cutoff);await verifyBinding();
    row.terminalReadiness=await waitForReloadApi(page,cutoff,Math.max(0,32-row.readiness.checks),Math.max(0,10-row.readiness.probeMs));await verifyBinding();
   }});
   await verifyBinding();row.stateBindingVerified=true;row.status='completed';

  }catch(error){row.error=error instanceof Error?error.message.slice(0,200):'diagnostic_failed';row.stateBindingVerified=false;row.choiceRegistered=false;}
  finally{
   row.samePageReload=reload?.snapshot();row.postClickNavigation=navigation.snapshot();row.captureFinishedMs=Date.now()-started;clearTimeout(timer);input.signal?.removeEventListener('abort',cancel);cancel();await Promise.race([Promise.all([context?.close().catch(()=>undefined),!input.browser?browser?.close().catch(()=>undefined):undefined]),new Promise(resolve=>setTimeout(resolve,250))]);row.totalIncludingCleanupMs=Date.now()-started;
   row.completedAt=new Date().toISOString();
  }
  return redHatObservationPacket(row,input.config,input.parentDispatchSha256);
}
