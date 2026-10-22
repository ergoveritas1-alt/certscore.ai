import {createHash} from "node:crypto";
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest,type CaliforniaRejectRequestEvidence} from "@certscore/contracts";
import {resolveCanonicalVendor,inspectGpcRequestQualification,CANONICAL_VENDOR_RESOLVER_VERSION,isCanonicalAdvertisingCollectionCandidate} from "@certscore/vendor-resolver";
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const identifiers=["li_adsId","li_adsid","li_fat_id","li_sugr","lms_ads","fbp","fbc","external_id","vid","msclkid","cid","auid","gacid","gclid","d_cid","d_cid_ic","d_uuid","vi"] as const;
const fields=new Set([...identifiers,"pid","fmt","time","event_id","conversion_id","url","referrer","page","v","ev","id","tid","en","google_nid","d","p","publisherId","ttd_pid","xcid","rid","gpp","gpp_sid","us_privacy","rdp","npa","ltd","dpo","data_processing_options"]);
export type CaliforniaRequestInput={url:string;method:string;requestId:string;startedAtMs:number;httpStatus?:number;hasBody:boolean;
 body?:string|null;headers?:Record<string,string>};
export function californiaProofRecipient(url:string) {
 if(url.length>16384 || !isCanonicalAdvertisingCollectionCandidate(url))return null;
 const vendor=resolveCanonicalVendor({type:"request",url,sourceScanner:"reject_observation",matchSource:"network_request"}).observation;
 if(!vendor || vendor.confidence<0.9 || vendor.registryAttribution?.matchKind!=="endpoint" || (!["advertising","marketing"].includes(vendor.purpose) && !(vendor.purpose==="analytics" && /^https:\/\/track(?:-eu1)?\.hubspot\.com\/(?:__pt[qc]|ptq)\.gif(?:[?]|$)/.test(url))))return null;
 return {entityId:vendor.registryAttribution.entityId,label:vendor.entity,resolverVersion:CANONICAL_VENDOR_RESOLVER_VERSION};
}
/** Bounded interpretation of already-issued Request bytes. Raw inputs never
 * enter retained proof; missing, truncated and unsupported formats stay unknown. */
export function captureCaliforniaRejectRequest(input:CaliforniaRequestInput) {
 let url:URL;try{url=new URL(input.url);}catch{return null;}
 if(url.protocol!=="https:" || url.username || url.password || url.port || url.hash || url.pathname.length>500 || url.origin.length>300)return null;
 const entity=californiaProofRecipient(input.url);if(!entity)return null;
 const v2=Object.hasOwn(input,"body")||Object.hasOwn(input,"headers");
 const proof:NonNullable<CaliforniaRejectRequestEvidence["proof"]>={policyVersion:"bounded_ca_request_proof.v1",
  bodyStatus:input.hasBody?"unavailable":"absent",bodyFormat:input.hasBody?"unknown":"none",bodySha256:null,
  headersStatus:"unavailable",headersSha256:null,identifiers:[],reasons:[]};
 const reason=(r:typeof proof.reasons[number])=>{if(!proof.reasons.includes(r))proof.reasons.push(r);};
 const bodyFields=new URLSearchParams();
 if(v2 && input.hasBody) {
  if(input.body===undefined || input.body===null)reason("body_unavailable");
  else if(input.body.length>32768 || Buffer.byteLength(input.body)>32768){proof.bodyStatus="limited";reason("body_limit");}
  else {
   proof.bodySha256=sha(input.body);
   try {
    const body=input.body.trim();
    if(body.startsWith("{")){
     // Flat JSON only: no nested privacy state or event arrays are guessed.
     // Reject duplicate keys before JSON.parse can discard their first value.
     if(/\\/.test(body))throw Error("unsupported_body");
     const keys=[...body.matchAll(/"([^"\\]*)"\s*:/g)].map(match=>match[1]!);
     if(new Set(keys).size!==keys.length)throw Error("duplicate_fields");
     const object=JSON.parse(body);
     if(!object || Array.isArray(object)||typeof object!=="object"||Object.values(object).some(v=>v===null || !["string","number","boolean"].includes(typeof v)))throw Error("unsupported_body");
     for(const [key,value]of Object.entries(object))bodyFields.append(key,String(value));proof.bodyFormat="json";
    }else{
     if(/[{}\r\n]/.test(body)||/%(?![a-f0-9]{2})/i.test(body)||body && !body.includes("="))throw Error("unsupported_body");
     for(const [key,value]of new URLSearchParams(body))bodyFields.append(key,value);proof.bodyFormat="form";
    }
    const all=[...url.searchParams,...bodyFields];
    if(all.length>128)throw Error("body_limit");
    if(new Set(all.map(([key])=>key)).size!==all.length)throw Error("duplicate_fields");
    if([...bodyFields].some(([key])=>!fields.has(key)))throw Error("unsupported_fields");
    proof.bodyStatus="complete";
   }catch(error){const code=error instanceof Error?error.message:"";proof.bodyStatus=code==="body_limit"?"limited":"unsupported";
    reason(code==="duplicate_fields"?"duplicate_fields":code==="body_limit"?"body_limit":code==="unsupported_fields"?"unsupported_fields":"unsupported_body");}
  }
 }
 const identifier=(source:"query"|"body"|"cookie_header",field:typeof identifiers[number],value:string)=>{
  if(proof.identifiers.length<8 && value.length>=3 && value.length<=2048 && !/^(?:0+|null|undefined|false|true|unknown|none|not.?set|redacted|\[redacted\]|\$.*)$/i.test(value) && !/^0+(?:[-.]+0+)*$/.test(value) && /[a-z1-9]/i.test(value))
   proof.identifiers.push({source,field,valueSha256:sha(value)});
 };
 for(const [key,value]of url.searchParams)if(identifiers.includes(key as never))identifier("query",key as typeof identifiers[number],value);
 if(proof.bodyStatus==="complete")for(const [key,value]of bodyFields)if(identifiers.includes(key as never))identifier("body",key as typeof identifiers[number],value);
 if(v2 && input.headers){
  const entries=Object.entries(input.headers),lower=entries.map(([name])=>name.toLowerCase());
  if(entries.length>64 || entries.some(([name,value])=>name.length>128 || value.length>8192) || new Set(lower).size!==lower.length){proof.headersStatus="limited";reason("header_limit");}
  else{
   proof.headersStatus="complete";proof.headersSha256=sha(JSON.stringify(entries.map(([k,v])=>[k.toLowerCase(),v]).sort(([a],[b])=>a!.localeCompare(b!))));
   for(const [name,value]of entries){
    const key=name.toLowerCase();
    // Nonstandard privacy headers require an explicit supported mapping.
    if(/gpp|privacy|consent|processing|opt.?out|do.?not.?sell/i.test(key)){proof.headersStatus="limited";reason("unsupported_privacy_header");}
    if((key==="content-length" && value!=="0" && (input.body===undefined || input.body===null || !/^[0-9]+$/.test(value) || Number(value)!==Buffer.byteLength(input.body))) ||
      key==="transfer-encoding" && value!=="identity" && (input.body===undefined || input.body===null)){
     proof.bodyStatus="unavailable";proof.bodyFormat="unknown";reason("body_unavailable");
    }
    if(key==="content-encoding" && value!=="identity"){proof.bodyStatus="unsupported";reason("unsupported_body");}
    if(key!=="cookie")continue;
    if(value.split(";").some(part=>part.indexOf("=")<1)){proof.headersStatus="limited";reason("ambiguous_cookie");continue;}
    const cookies=value.split(";").map(part=>{const at=part.indexOf("=");return [part.slice(0,at).trim(),part.slice(at+1).trim()] as const;});
    if(cookies.length>96 || new Set(cookies.map(([key])=>key)).size!==cookies.length){proof.headersStatus="limited";reason("ambiguous_cookie");continue;}
    if(url.hostname==="px.ads.linkedin.com" && /^\/(?:collect|wa)\/?$/.test(url.pathname))for(const [name,raw]of cookies){
     if(name==="BizographicsOptOut" && raw){proof.headersStatus="limited";reason("cookie_opt_out_unresolved");}
     // bcookie/lidc/__cf_bm are security/routing, not advertising proof.
     if(!["li_fat_id","li_sugr","lms_ads"].includes(name))continue;
     const existing=[...url.searchParams,...bodyFields].filter(([key])=>key==="li_fat_id");
     if(name==="li_fat_id"&&existing.length && existing.some(([,value])=>value!==raw)){proof.headersStatus="limited";reason("ambiguous_cookie");continue;}
     identifier("cookie_header",name as "li_fat_id"|"li_sugr"|"lms_ads",raw);

    }
   }
  }
 }else if(v2)reason("headers_unavailable");
 if(v2 && input.hasBody && input.headers && proof.bodyStatus==="complete"){
  const contentType=Object.entries(input.headers).find(([key])=>key.toLowerCase()==="content-type")?.[1]?.split(";")[0]?.trim().toLowerCase();
  if(!contentType || !["application/json","application/x-www-form-urlencoded","text/plain"].includes(contentType) ||
    contentType==="application/json" && proof.bodyFormat!=="json" ||
    contentType==="application/x-www-form-urlencoded" && proof.bodyFormat!=="form"){
   proof.bodyStatus="unsupported";reason("unsupported_body");
  }
 }
 const qualification=inspectGpcRequestQualification(input.url,{allowLinkedInWa:v2,
  linkedInHeaderIdentifier:proof.headersStatus==="complete" && proof.identifiers.some(id=>id.source==="cookie_header"&&["li_fat_id","li_sugr","lms_ads"].includes(id.field))},v2?bodyFields:undefined);
 if(!v2 && qualification.activity==="unresolved")return null;
 if(v2 && proof.headersStatus!=="complete" && !qualification.processingSignals.includes("privacy_signal_invalid"))qualification.processingSignals.push("privacy_signal_invalid");
 return californiaRejectRequestEvidenceSchema.parse({contractVersion:v2?"california_reject_request.v2":"california_reject_request.v1",
  requestId:input.requestId,startedAtMs:input.startedAtMs,origin:url.origin,path:url.pathname,method:input.method,
  urlSha256:sha(input.url),httpStatus:input.httpStatus??null,
  payload:v2?(proof.bodyStatus==="absent"?"no_body":proof.bodyStatus==="complete"?"inspected_body":"uninspected_body"):input.hasBody?"uninspected_body":"no_body",
  ...(v2?{proof}:{}),entity,qualification});
}

/** Prefer a successful unrestricted proof for each entity, then fill spare
 * capacity with other evidence. Recent duplicate traffic cannot evict entities. */
export function prioritizeCaliforniaRequests<T extends {californiaCollection?:CaliforniaRejectRequestEvidence;startedAtMs:number}>(rows:readonly T[],cap=32):T[]{
 cap=Math.max(0,Math.min(32,cap|0));if(!cap)return [];
 const quality=(r:T)=>r.californiaCollection && isQualifyingSaleSharingRequest(r.californiaCollection.qualification) &&
  r.californiaCollection.payload!=="uninspected_body" && (r.californiaCollection.httpStatus??0)>=200 && (r.californiaCollection.httpStatus??600)<400?1:0;
 const sorted=[...rows].sort((a,b)=>quality(b)-quality(a)||b.startedAtMs-a.startedAtMs);
 const selected:T[]=[],seen=new Set<string>();
 for(const row of sorted){const id=row.californiaCollection?.entity.entityId;if(!id || seen.has(id))continue;selected.push(row);seen.add(id);if(selected.length>=cap)return selected;}
 for(const row of sorted){if(!row.californiaCollection || selected.includes(row))continue;selected.push(row);if(selected.length>=cap)break;}
 return selected;
}
