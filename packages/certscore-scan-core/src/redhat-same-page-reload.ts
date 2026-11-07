import {createHash} from 'node:crypto';
import type {Page} from 'playwright';
export const REDHAT_FINAL_URL='https://www.redhat.com/en';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

/** One exact native reload, causally joined to the recorded action and browser
 * navigation events. Network authorization/TLS remain in the enclosing harness. */
export class RedHatSamePageReload {
 private network=new Map<string,any>();private observed=0;private pending:any;
 private responseVerified=false;private committed=false;private failed=false;
 private listeners=new Set<()=>void>();
 constructor(private original:{frameId:string;loaderId:string;url:string;sourceSha256:string}){
  if(original.url!==REDHAT_FINAL_URL)throw Error('unreviewed_original');
 }
 observeNetwork(e:any){
  if(e.type!=='Document')return;
  if(++this.observed>4){this.invalidate();return;}
  this.network.set(e.requestId,{frameId:e.frameId,loaderId:e.loaderId,url:e.request.url,method:e.request.method,hasPostData:Boolean(e.request.hasPostData),redirect:Boolean(e.redirectResponse),documentURL:e.documentURL});
 }
 authorizeRequest(e:any,row:any,entries:any,now:number){
  const n=this.network.get(e.networkId),originalHash=hash(this.original.loaderId);
  if(this.failed||this.pending||row.actions!==1||row.submitted!==true||!Number.isFinite(row.dispatchedAtMs)||now-row.dispatchedAtMs>750||now<row.dispatchedAtMs)return false;
  if(row.sourceBundleSha256!==this.original.sourceSha256||row.documentTokenSha256!==originalHash)return false;
  if(row.before?.value?.status!=='observed'||row.before.value.decision?.source!=='implied')return false;
  for(const slot of ['scheduled','requested']){
   const v=entries[slot];if(!v||v.reason!=='reload'||!v.isMainFrame||v.exactDestination!==this.original.url||v.sourceDocumentSha256!==originalHash||v.actionAtMs!==row.dispatchedAtMs||v.atMs<row.dispatchedAtMs||v.atMs>now)return false;
  }
  if(e.frameId!==this.original.frameId||e.request.method!=='GET'||e.request.hasPostData||e.request.url!==this.original.url||e.redirectedRequestId||!n)return false;
  if(n.frameId!==this.original.frameId||n.url!==this.original.url||n.documentURL!==this.original.url||n.method!=='GET'||n.hasPostData||n.redirect||!n.loaderId||n.loaderId===this.original.loaderId)return false;
  this.pending={requestId:e.requestId,networkId:e.networkId,loaderId:n.loaderId,requestedAtMs:now,sourceDocumentSha256:originalHash,actionAtMs:row.dispatchedAtMs};return true;
 }
 isRequest(id:string){return this.pending?.requestId===id;}
 verifyResponse(e:any){
  if(this.failed||!this.isRequest(e.requestId)||this.responseVerified||e.request.url!==this.original.url||e.request.method!=='GET'||e.responseStatusCode!==200||(e.responseHeaders??[]).some((h:any)=>h.name.toLowerCase()==='location'))return false;
  this.responseVerified=true;return true;
 }
 commit(frame:any){
  if(this.failed||!this.responseVerified||this.committed||frame.id!==this.original.frameId||frame.url!==this.original.url||frame.loaderId!==this.pending?.loaderId)return false;
  this.committed=true;this.notify();return true;
 }
 accepts(frame:any){return !this.failed&&frame.id===this.original.frameId&&frame.url===this.original.url&&(this.committed?frame.loaderId===this.pending?.loaderId:frame.loaderId===this.original.loaderId);}
 hasRequest(){return Boolean(this.pending);}
 invalidate(){this.failed=true;this.notify();}
 private notify(){for(const listener of this.listeners)listener();}
 async waitForCommit(cutoff:number){
  if(!this.pending)return;
  if(!this.committed&&!this.failed)await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);this.listeners.delete(done);resolve();};const timer=setTimeout(done,Math.max(0,cutoff-Date.now()));this.listeners.add(done);});
  if(this.failed||!this.committed||Date.now()>=cutoff)throw Error('reload_not_verified_within_capture');
 }
 snapshot(){return {version:'redhat.same-page-reload.v1',requested:Boolean(this.pending),responseVerified:this.responseVerified,committed:this.committed,invalidated:this.failed,networkCandidates:this.observed,
  ...(this.pending?{requestId:this.pending.requestId,networkId:this.pending.networkId,requestedAtMs:this.pending.requestedAtMs,actionAtMs:this.pending.actionAtMs,sourceDocumentSha256:this.pending.sourceDocumentSha256,replacementDocumentSha256:hash(this.pending.loaderId)}:{})};}
}

/** Passive readiness for the single existing terminal SDK slot. Shares the
 * remaining readiness checks/CPU allowance and absolute capture deadline. */
export async function waitForReloadApi(page:Page,cutoff:number,checks:number,processingMs:number){
 const inPage=({cutoff,checks,processingMs}:{cutoff:number;checks:number;processingMs:number})=>new Promise<{reason:string;checks:number;processingMs:number}>(resolve=>{
  let done=false,used=0,spent=0,pending:ReturnType<typeof setTimeout>|undefined;let observer:MutationObserver;let timer:ReturnType<typeof setTimeout>;
  const finish=(reason:string)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(pending);observer?.disconnect();document.removeEventListener('readystatechange',event);resolve({reason,checks:used,processingMs:Math.ceil(spent)});};
  const check=()=>{if(done)return;if(Date.now()>=cutoff)return finish('cutoff');if(used>=checks||spent>=processingMs)return finish('probe_budget');used++;const started=performance.now();let current:unknown=window;
   for(const key of ['truste','cma','callApi']){if(!current||(typeof current!=='object'&&typeof current!=='function')){current=undefined;break;}const d=Object.getOwnPropertyDescriptor(current,key);current=d&&'value'in d?d.value:undefined;}
   spent+=performance.now()-started;if(spent>=processingMs)return finish('probe_budget');if(Date.now()>=cutoff)return finish('cutoff');if(typeof current==='function')finish('api_present');};
  const event=()=>{if(done||pending!==undefined)return;pending=setTimeout(()=>{pending=undefined;check();},Math.max(1,Math.ceil((cutoff-Date.now())/Math.max(1,checks-used))));};
  observer=new MutationObserver(event);observer.observe(document,{childList:true,subtree:true});document.addEventListener('readystatechange',event);timer=setTimeout(()=>finish('cutoff'),Math.max(0,cutoff-Date.now()));check();
 });
 return page.evaluate<{reason:string;checks:number;processingMs:number}>(`(() => {const __name=fn=>fn;return (${inPage.toString()})(${JSON.stringify({cutoff,checks,processingMs})});})()`);
}
