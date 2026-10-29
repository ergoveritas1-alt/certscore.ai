import { createHash } from "node:crypto";
import type { Frame, Page, Request, Response } from "playwright";
import { cmpPassiveDiagnosticsSchema, type CmpPassiveDiagnostics } from "@certscore/contracts";

/** Appended to the existing storage init script: no extra browser round trip.
 * Do not retain event payloads, call SDKs or treat a page event as trusted consent. */
export const CMP_PASSIVE_EVENT_INIT_SCRIPT = `;(() => {
  if (window !== window.top || Object.prototype.hasOwnProperty.call(window,"__certscoreReadCmpPassiveEvents")) return;
  const rows=[]; let truncated=false;
  const onEvent=(event)=>{if(rows.length<8) rows.push({name:event.type,atEpochMs:performance.timeOrigin+performance.now()});else truncated=true;};
  window.addEventListener("OneTrustGroupsUpdated",onEvent);
  window.addEventListener("OTConsentApplied",onEvent);
  Object.defineProperty(window,"__certscoreReadCmpPassiveEvents",{value:()=>({documentUrl:location.href,events:rows.slice(),truncated}),enumerable:false,writable:false,configurable:false});
})();`;
const endpoints = new Set([
  "https://privacyportal.onetrust.com/request/v1/consentreceipts",
  "https://privacyportal-eu.onetrust.com/request/v1/consentreceipts",
  "https://privacy.erm-gre.bce.ca/request/v1/consentreceipts",
]);
type Capture = { epoch():object; record(raw:unknown,epoch:object):void; finish(at?:number):CmpPassiveDiagnostics|undefined };
const captures = new WeakMap<Page,Capture>();
const sha = (s:string)=>createHash("sha256").update(s).digest("hex");
const normalized = (s:string)=>{try{const u=new URL(s);u.hash="";return ["https:","http:"].includes(u.protocol)?u.href:undefined;}catch{return undefined;}};

export function installCmpPassiveDiagnostics(page:Page):Capture {
  let epoch={},closed=false,frozen:CmpPassiveDiagnostics|undefined;
  let started=Date.now(),network:CmpPassiveDiagnostics["network"]=[],events:CmpPassiveDiagnostics["events"]=[];
  let eventReadAt:number|undefined,eventsTruncated=false,networkTruncated=false;
  const requests=new WeakMap<Request,{epoch:object;row:CmpPassiveDiagnostics["network"][number]}>();
  const navigate=(frame:Frame)=>{if(!closed&&frame===page.mainFrame()){epoch={};started=Date.now();network=[];events=[];eventReadAt=undefined;eventsTruncated=false;networkTruncated=false;}};
  const request=(req:Request)=>{try{
    if(closed || req.method()!=="POST" || !endpoints.has(req.url()) || req.frame()!==page.mainFrame() || req.redirectedFrom())return;
    if(network.length===8){networkTruncated=true;return;}
    const type=req.resourceType();const row:CmpPassiveDiagnostics["network"][number]={role:"reviewed_receipt_endpoint",requestedAtEpochMs:Date.now(),transport:type==="xhr"||type==="fetch"||type==="ping"?type:"other",failed:false};
    network.push(row);requests.set(req,{epoch,row});
  }catch{/* Detached or foreign requests are not source-bound observations. */}};
  const response=(res:Response)=>{try{const item=requests.get(res.request());if(closed||!item||item.epoch!==epoch||res.fromServiceWorker())return;
    const status=res.status();if(status>=100&&status<=599){item.row.status=status;item.row.responseAtEpochMs=Date.now();}
  }catch{}};
  const failed=(req:Request)=>{const item=requests.get(req);if(!closed&&item?.epoch===epoch)item.row.failed=true;};
  page.on("framenavigated",navigate);page.on("request",request);page.on("response",response);page.on("requestfailed",failed);
  const capture:Capture={epoch:()=>epoch,record(raw,readEpoch){
    if(closed||readEpoch!==epoch||!raw||typeof raw!=="object")return;
    const value=raw as {documentUrl?:unknown;events?:unknown;truncated?:unknown};
    if(typeof value.documentUrl!=="string"||value.documentUrl.length>8192||normalized(value.documentUrl)!==normalized(page.url())||!Array.isArray(value.events)||value.events.length>8||typeof value.truncated!=="boolean")return;
    const at=Date.now();
    if(value.events.some(e=>!e||typeof e!=="object"||!["OneTrustGroupsUpdated","OTConsentApplied"].includes(e.name)||typeof e.atEpochMs!=="number"||!Number.isFinite(e.atEpochMs)||e.atEpochMs<started||e.atEpochMs>at))return;
    events=value.events.map(e=>({name:e.name,atEpochMs:e.atEpochMs}));eventsTruncated=value.truncated;eventReadAt=at;
  },finish(at=Date.now()){
    if(closed)return frozen;
    closed=true;
    page.off("framenavigated",navigate);page.off("request",request);page.off("response",response);page.off("requestfailed",failed);
    if(captures.get(page)===capture)captures.delete(page);
    const url=normalized(page.url());
    const parsed=cmpPassiveDiagnosticsSchema.safeParse({policyVersion:"cmp_passive_diagnostics.v1",diagnosticOnly:true,
      ...(url?{documentSha256:sha(url)}:{}),startedAtEpochMs:started,frozenAtEpochMs:at,eventRead:eventReadAt===undefined?"not_read":"read",
      ...(eventReadAt===undefined?{}:{eventReadAtEpochMs:eventReadAt}),events,eventsTruncated,networkTruncated,network});
    frozen=parsed.success?parsed.data:undefined;
    return frozen;
  }};captures.set(page,capture);return capture;
}
export function cmpPassiveReadToken(scope:Page|Frame) {
  const page="page"in scope?scope.page():scope;
  if("page"in scope && scope!==page.mainFrame())return undefined;
  const capture=captures.get(page);return capture?{capture,epoch:capture.epoch()}:undefined;
}
export function recordCmpPassiveRead(token:ReturnType<typeof cmpPassiveReadToken>,raw:unknown) {try { token?.capture.record(raw,token.epoch); } catch { /* Optional diagnostics never alter action evidence. */ }}
