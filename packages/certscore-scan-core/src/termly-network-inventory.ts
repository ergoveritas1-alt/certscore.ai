import { createHash } from "node:crypto";
import type { CDPSession } from "playwright";
import { cmpNetworkCookieInventorySchema, type CmpNetworkCookieInventory, type CmpInventoryManifest } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";

const recipe=KNOWN_CMP_REGISTRY.find(d=>d.canonicalName==="Termly")!.passiveNetworkInventory!;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function termlyInventoryTenant(raw:string,kind:"script"|"cookies"){
  try{
    const u=new URL(raw);if(u.origin!==recipe.origin || u.username || u.password || u.hash || raw.length>2000)return;
    const prefix=kind==="script"?recipe.scriptPathPrefix:recipe.responsePathPrefix;
    const id=u.pathname.slice(prefix.length).replace(kind==="cookies"?/\/cookies$/:/$^/,"");
    if(!u.pathname.startsWith(prefix) || !uuid.test(id) || kind==="cookies" && u.pathname!==`${prefix}${id}/cookies`)return;
    if([...u.searchParams].length>1 || ![...u.searchParams].every(([k,v])=>kind==="script"?k==="autoBlock" && /^(on|off)$/.test(v):k==="lang" && /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(v)))return;
    return id;
  }catch{return;}
}

/** Sanitized declarations only. Non-cookie technologies and domain labels must
 * not become cookies or named services. This list never proves absence. */
export function parseTermlyCookieResponse(body:Buffer,proof:Omit<CmpNetworkCookieInventory,"version"|"source"|"records"|"inventoryManifest"|"truncated"|"bodySha256">):CmpNetworkCookieInventory|undefined{
  if(!body.length || body.length>65536 || body.length!==proof.decodedBytes)return;
  let value:unknown;try{value=JSON.parse(body.toString("utf8"));}catch{return;}
  if(!value || typeof value!=="object" || Array.isArray(value))return;
  const cookies=(value as Record<string,unknown>).cookies;
  if(!cookies || typeof cookies!=="object" || Array.isArray(cookies))return;
  const categories=["unclassified","essential","performance","analytics","advertising","social_networking","prefix"];
  if(Object.keys(cookies).some(k=>!categories.includes(k)))return;
  const manifest:CmpInventoryManifest={version:"cmp_inventory_manifest.v1",source:"termly_cookie_response.v1",names:[],sourceRecordCount:0,resolvedRecordCount:0,unresolvedRecordCount:0,unresolvedSources:0,truncated:false};
  const records:CmpNetworkCookieInventory["records"]=[];
  let visited=0,chars=0,nameChars=0,truncated=false;
  const text=(x:unknown)=>typeof x==="string" && x.length<=4096 && !/[<>]/.test(x)?x.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,240):"";
  for(const [group,category] of categories.entries()){
    const rows=(cookies as Record<string,unknown>)[category];
    if(!Array.isArray(rows)){manifest.unresolvedSources++;continue;}
    if(category==="prefix"){if(rows.length)manifest.unresolvedSources++;continue;}
    if(rows.length>256){truncated=true;manifest.truncated=true;}
    for(const [index,item] of rows.slice(0,256).entries()){
      if(visited++>=256){truncated=true;manifest.truncated=true;break;}
      if(!item || typeof item!=="object" || Array.isArray(item)){manifest.unresolvedSources++;continue;}
      const row=item as Record<string,unknown>;
      // Termly documents distinct HTTP/server cookies and non-cookie technologies.
      // An unrecognized technology remains unclassified source coverage.
      if(["html_local_storage","html_session_storage","pixel_tracker","indexed_db"].includes(String(row.tracker_type)))continue;
      if(row.tracker_type!=="http_cookie" && row.tracker_type!=="server_cookie"){manifest.unresolvedSources++;continue;}
      manifest.sourceRecordCount++;
      if(typeof row.name!=="string" || !/^[A-Za-z0-9_.$:#*+\-\[\]]{1,160}$/.test(row.name)){manifest.unresolvedRecordCount++;continue;}
      const name=row.name;
      if(!manifest.names.includes(name)){
        if(nameChars+name.length>8192){manifest.unresolvedRecordCount++;manifest.truncated=true;truncated=true;continue;}
        manifest.names.push(name);nameChars+=name.length;
      }
      manifest.resolvedRecordCount++;
      const purpose=text(row.purpose),duration=text(row.expire),size=name.length+purpose.length+duration.length;
      if(records.length>=100 || chars+size>16000){truncated=true;continue;}
      chars+=size;records.push({technology:row.tracker_type,name,purpose,duration,sourceRef:`category:${group}/record:${index}`});
    }
  }
  const parsed=cmpNetworkCookieInventorySchema.safeParse({...proof,version:recipe.version,source:"already_requested_response",records,inventoryManifest:manifest,truncated,bodySha256:createHash("sha256").update(body).digest("hex")});
  return parsed.success?parsed.data:undefined;
}

type Binding={url:string;token?:string};
/** Uses the existing Network session. One finished, main-frame, tenant-bound
 * response only; never fetches, intercepts, waits, retries or alters the page. */
export function installPassiveTermlyInventoryCapture(input:{session:CDPSession;mainFrameId:string;targetUrl:string;now:()=>number;readBinding:()=>Binding;isCurrent:()=>boolean}){
  const {session}=input;
  const scripts=new Map<string,{url:string;token:string}>();
  let candidate:{id:string;tenant:string;url:string;token:string;script:string;bytes:number;mime?:string;valid:boolean}|undefined;
  let result:CmpNetworkCookieInventory|undefined,closed=false,attempted=false,ambiguous=false;
  const bound=(token:string)=>!closed && input.isCurrent() && input.readBinding().url===input.targetUrl && input.readBinding().token===token;
  const request=(p:any)=>{
    if(closed || !input.isCurrent())return;
    if(p.requestId===candidate?.id && p.redirectResponse){ambiguous=true;result=undefined;candidate!.valid=false;return;}
    if(p.frameId!==input.mainFrameId || p.loaderId!==input.readBinding().token || input.readBinding().url!==input.targetUrl || p.documentURL!==input.targetUrl || p.request?.method!=="GET")return;
    const url=p.request.url;
    if(typeof url!=="string")return;
    const tenant=termlyInventoryTenant(url,p.type==="Script"?"script":"cookies");
    if(!tenant)return;
    if(p.type==="Script"){
      if(scripts.size>=1){ambiguous=true;result=undefined;return;}
      scripts.set(tenant,{url,token:p.loaderId});return;
    }
    if(ambiguous || p.type!=="XHR" && p.type!=="Fetch" || scripts.get(tenant)?.token!==p.loaderId)return;
    if(candidate || attempted || typeof p.requestId!=="string" || p.requestId.length>160 || p.redirectResponse){ambiguous=true;result=undefined;return;}
    candidate={id:p.requestId,tenant,url,token:p.loaderId,script:scripts.get(tenant)!.url,bytes:0,valid:true};
  };
  const response=(p:any)=>{
    if(p.requestId!==candidate?.id || !candidate)return;
    if(p.frameId!==input.mainFrameId || p.loaderId!==candidate.token || p.response?.url!==candidate.url || p.response?.status!==200 ||
      p.response?.fromServiceWorker || p.response?.mimeType!=="application/json" || !bound(candidate.token))candidate.valid=false;
    else candidate.mime="application/json";
  };
  const data=(p:any)=>{
    if(p.requestId!==candidate?.id || !candidate)return;
    if(!Number.isInteger(p.dataLength) || p.dataLength<0)candidate.valid=false;
    else {candidate.bytes+=p.dataLength;if(candidate.bytes>65536)candidate.valid=false;}
  };
  const failed=(p:any)=>{if(p.requestId===candidate?.id && candidate){candidate.valid=false;result=undefined;}};
  const finished=(p:any)=>{
    if(p.requestId!==candidate?.id || !candidate || attempted)return;
    attempted=true;const source=candidate;
    if(ambiguous || !source.valid || !source.mime || !source.bytes || !bound(source.token))return;
    // Chrome's dataLength is decoded byte accounting. Reject oversized bodies
    // before retrieving its existing buffer; the returned bytes must agree.
    void session.send("Network.getResponseBody",{requestId:source.id}).then((body:{body:string;base64Encoded:boolean})=>{
      if(!bound(source.token) || ambiguous || !source.valid || typeof body.body!=="string" || body.body.length>90000)return;
      const bytes=Buffer.from(body.body,body.base64Encoded?"base64":"utf8");
      result=parseTermlyCookieResponse(bytes,{documentToken:source.token,documentUrl:input.targetUrl,tenantId:source.tenant,scriptUrl:source.script,responseUrl:source.url,
        requestId:source.id,frameId:input.mainFrameId,httpStatus:200,mimeType:"application/json",completedAtMs:input.now(),decodedBytes:source.bytes});
    }).catch(()=>undefined);
  };
  const listeners:[[string,(p:any)=>void],...Array<[string,(p:any)=>void]>]=[["Network.requestWillBeSent",request],["Network.responseReceived",response],["Network.dataReceived",data],["Network.loadingFailed",failed],["Network.loadingFinished",finished]];
  for(const [event,fn]of listeners)session.on(event as any,fn);
  return {snapshot:()=>!closed && !ambiguous && result && input.readBinding().url===input.targetUrl && input.readBinding().token===result.documentToken?result:undefined,
    close:()=>{closed=true;for(const [event,fn]of listeners)session.off(event as any,fn);}};
}
