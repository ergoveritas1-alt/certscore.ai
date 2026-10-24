import {createHash} from "node:crypto";
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest,type CaliforniaRejectRequestEvidence} from "@certscore/contracts";
import {resolveCanonicalVendor,inspectGpcRequestQualification,isAdvertisingIdentityValue,CANONICAL_VENDOR_RESOLVER_VERSION,isCanonicalAdvertisingCollectionCandidate,readBoundedProtocolJson,decodeCanonicalCollectionBody,canonicalCollectionBodyFields,collectionBodyPrivacySignals,isCanonicalProtocolIdentityField,readCanonicalBodyProcessing,usesExpandedCollectionBody} from "@certscore/vendor-resolver";
import {decodeLinkedInWaBody} from "./linkedin-wa-body";
const sha=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
const identifiers=["li_adsId","li_adsid","li_fat_id","liFatId","hem","ud[em]","ud[ph]","li_sugr","lms_ads","fbp","fbc","external_id","vid","msclkid","cid","auid","gacid","gclid","d_cid","d_cid_ic","d_uuid","vi","first_party_id","eid_pubcid.org","eid_sharedid.org","eid_id5-sync.com","eid_liveramp.com","uuid","click_id","ttp","ttclid","u_c1","epik"] as const;
const fields=new Set([...identifiers,"pid","fmt","time","event_id","conversion_id","url","referrer","page","v","ev","id","tid","en","google_nid","d","p","publisherId","ttd_pid","xcid","rid","gpp","gpp_sid","us_privacy","rdp","npa","ltd","dpo","data_processing_options","event","ttp","ttclid","sc_cookie1","sc_click_id","epik","ti","dl","rl","ts","sw","sh","cd","noscript","it","coo","first_party_id","eid_pubcid.org","eid_sharedid.org","eid_id5-sync.com","eid_liveramp.com"]);
export type CaliforniaRequestInput={url:string;method:string;requestId:string;startedAtMs:number;httpStatus?:number;hasBody:boolean;
 qualificationContext?:Parameters<typeof inspectGpcRequestQualification>[1];
 headerPolicy?:"required"|"supplemental";
 body?:string|null;headers?:Record<string,string>};
export function californiaProofRecipient(url:string) {
 if(url.length>16384 || !isCanonicalAdvertisingCollectionCandidate(url))return null;
 const vendor=resolveCanonicalVendor({type:"request",url,sourceScanner:"reject_observation",matchSource:"network_request"}).observation;
 if(!vendor || vendor.confidence<0.9 || vendor.registryAttribution?.matchKind!=="endpoint" ||
  !["advertising","marketing","analytics","session_replay"].includes(vendor.purpose))return null;
 return {entityId:vendor.registryAttribution.entityId,label:vendor.entity,resolverVersion:CANONICAL_VENDOR_RESOLVER_VERSION};
}
/** Bounded interpretation of already-issued Request bytes. Raw inputs never
 * enter retained proof; missing, truncated and unsupported formats stay unknown. */
export function captureCaliforniaRejectRequest(input:CaliforniaRequestInput) {
 let url:URL;try{url=new URL(input.url);}catch{return null;}
 if(url.protocol!=="https:" || url.username || url.password || url.port || url.hash || url.pathname.length>500 || url.origin.length>300)return null;
 const entity=californiaProofRecipient(input.url);if(!entity)return null;
 const v2=Object.hasOwn(input,"body")||Object.hasOwn(input,"headers");
 const proof:NonNullable<CaliforniaRejectRequestEvidence["proof"]>={policyVersion:"bounded_ca_request_proof.v4",
  bodyStatus:input.hasBody?"unavailable":"absent",bodyFormat:input.hasBody?"unknown":"none",bodySha256:null,
  headersStatus:"unavailable",headersSha256:null,identifiers:[],reasons:[]};
 const reason=(r:typeof proof.reasons[number])=>{if(!proof.reasons.includes(r))proof.reasons.push(r);};
 const bodyFields=new URLSearchParams(),endpointBodyFields=canonicalCollectionBodyFields(url);
 let structured=false;
 if(v2 && input.hasBody) {
  if(input.body===undefined || input.body===null)reason("body_unavailable");
  else if(input.body.length>32768 || Buffer.byteLength(input.body)>32768){proof.bodyStatus="limited";reason("body_limit");}
  else {
   proof.bodySha256=sha(input.body);
   try {
    const body=input.body.trim();
    const canonical=decodeCanonicalCollectionBody(url,input.body);
    const linkedin=decodeLinkedInWaBody(url,input.method,input.body);
    if(linkedin){
     proof.policyVersion="bounded_ca_request_proof.v3";proof.identifierDispositions=linkedin.identifierDispositions;proof.bodyFormat="linkedin_wa_json";
     proof.bodyEncoding=linkedin.encoding;proof.decodedBodySha256=sha(linkedin.decodedBytes);
     for(const [key,value]of linkedin.fields)bodyFields.append(key,value);
    }else if(canonical){
     structured=true;proof.policyVersion="bounded_ca_request_proof.v5";proof.bodyFormat=canonical.format;
     for(const[k,v]of canonical.fields)bodyFields.append(k,v);
    }else if(body.startsWith("{")){
     // Decode escaped keys before duplicate checks; only flat primitive fields
     // are accepted outside the reviewed endpoint-owned envelopes.
     const object=readBoundedProtocolJson(body,[...url.searchParams].length);
     if(!object || Array.isArray(object)||typeof object!=="object"||Object.values(object).some(v=>v===null || !["string","number","boolean"].includes(typeof v)))throw Error("unsupported_body");
     for(const [key,value]of Object.entries(object))bodyFields.append(key,String(value));proof.bodyFormat="json";
    }else{
     if(/[{}\r\n]/.test(body)||/%(?![a-f0-9]{2})/i.test(body)||body && !body.includes("="))throw Error("unsupported_body");
     for(const [key,value]of new URLSearchParams(body))bodyFields.append(key,value);proof.bodyFormat="form";
    }
    // Reddit's distributed SDK mirrors these exact routing fields in both the
    // query and form. Equal single copies are redundant, never conflicting;
    // privacy declarations and every other protocol keep strict uniqueness.
    if(url.origin==="https://alb.reddit.com"&&/^\/rp(?:\.gif)?$/.test(url.pathname))for(const key of ["id","event","click_id"]){
     const q=url.searchParams.getAll(key),b=bodyFields.getAll(key);
     if(q.length===1&&b.length===1&&q[0]===b[0]){bodyFields.delete(key);proof.policyVersion="bounded_ca_request_proof.v5";}
    }
    const all=[...url.searchParams,...bodyFields];
    if(all.length>128)throw Error("body_limit");
    if(new Set(all.map(([key])=>key)).size!==all.length)throw Error("duplicate_fields");
    if(!structured && [...bodyFields].some(([key])=>["uuid","click_id","u_c1"].includes(key)&&!isCanonicalProtocolIdentityField(url,key)||!fields.has(key)&&!endpointBodyFields.has(key)||["liFatId","hem"].includes(key)&&proof.bodyFormat!=="linkedin_wa_json"))throw Error("unsupported_fields");
    if([...bodyFields].some(([key])=>!fields.has(key)&&endpointBodyFields.has(key)))proof.policyVersion="bounded_ca_request_proof.v5";
    proof.bodyStatus="complete";
   }catch(error){const code=error instanceof Error?error.message:"";proof.bodyStatus=code==="body_limit"?"limited":"unsupported";
    reason(code==="duplicate_fields"?"duplicate_fields":code==="body_limit"?"body_limit":code==="unsupported_fields"?"unsupported_fields":"unsupported_body");}
  }
 }
 const identifier=(source:"query"|"body"|"cookie_header",field:typeof identifiers[number],value:string)=>{
  if(["uuid","click_id","ttp","ttclid","u_c1","epik"].includes(field)&&!isCanonicalProtocolIdentityField(url,field))return;
  if(["ud[em]","ud[ph]"].includes(field) && (!/^(?:www\.)?facebook\.com$/.test(url.hostname) || !/^\/tr\/?$/.test(url.pathname) || source==="cookie_header"))return;
  if(proof.identifiers.length<8 && isAdvertisingIdentityValue(field,value))
   proof.identifiers.push({source,field,valueSha256:sha(value)});
 };
 // Prefer newly supported endpoint-bound identities within the same eight-item cap.
 if(proof.bodyStatus==="complete")for(const key of ["hem","liFatId","ud[em]","ud[ph]"] as const){
  const value=bodyFields.get(key);if(value!==null)identifier("body",key,value);
 }
 for(const key of ["ud[em]","ud[ph]"] as const){const value=url.searchParams.get(key);if(url.searchParams.getAll(key).length===1&&value!==null)identifier("query",key,value);}
 for(const key of ["uuid","click_id","ttp","ttclid","u_c1","epik"] as const){
  const query=url.searchParams.get(key);if(url.searchParams.getAll(key).length===1&&query!==null)identifier("query",key,query);
  const body=bodyFields.get(key);if(proof.bodyStatus==="complete"&&bodyFields.getAll(key).length===1&&body!==null)identifier("body",key,body);
 }
 for(const [key,value]of url.searchParams)if(!["liFatId","hem","ud[em]","ud[ph]","uuid","click_id","ttp","ttclid","u_c1","epik"].includes(key)&&identifiers.includes(key as never))identifier("query",key as typeof identifiers[number],value);
 if(proof.bodyStatus==="complete")for(const [key,value]of bodyFields)if(!["hem","liFatId","ud[em]","ud[ph]","uuid","click_id","ttp","ttclid","u_c1","epik"].includes(key)&&identifiers.includes(key as never))identifier("body",key as typeof identifiers[number],value);
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
    contentType==="application/json" && !["json","linkedin_wa_json"].includes(proof.bodyFormat) ||
    contentType==="application/x-www-form-urlencoded" && proof.bodyFormat!=="form" ||
    proof.bodyFormat==="linkedin_wa_json" && contentType!=="text/plain"){
   proof.bodyStatus="unsupported";reason("unsupported_body");
  }
 }
 if(proof.bodyStatus!=="complete")proof.identifiers=proof.identifiers.filter(id=>id.source!=="body");
 if(proof.identifiers.some(id=>["uuid","click_id","ttp","ttclid","u_c1","epik"].includes(id.field)))proof.policyVersion="bounded_ca_request_proof.v5";
 if(proof.bodyFormat!=="linkedin_wa_json")delete proof.identifierDispositions;
 if(proof.identifiers.some(id=>["hem","ud[em]","ud[ph]"].includes(id.field)))proof.policyVersion="bounded_ca_request_proof.v3";
 const qualification=inspectGpcRequestQualification(input.url,{...input.qualificationContext,allowLinkedInWa:v2,
  linkedInWaBodyIdentifier:proof.bodyStatus==="complete"&&proof.bodyFormat==="linkedin_wa_json"&&proof.identifiers.some(id=>id.field==="liFatId"&&id.source==="body"),
  linkedInHeaderIdentifier:proof.headersStatus==="complete" && proof.identifiers.some(id=>id.source==="cookie_header"&&["li_fat_id","li_sugr","lms_ads"].includes(id.field))},v2 && proof.bodyStatus==="complete"?bodyFields:undefined);
 // Unsupported event metadata cannot erase a separately parseable, known
 // request-local restriction. Missing partial reads are not new URL gates.
 if(v2&&proof.bodyStatus!=="complete"&&typeof input.body==="string"){
  const processing=readCanonicalBodyProcessing(url,input.body);
  if(processing&&[...processing].length){
   const partial=inspectGpcRequestQualification(input.url,input.qualificationContext,processing);
   qualification.processingSignals=[...new Set([...qualification.processingSignals,...partial.processingSignals])];
   if(collectionBodyPrivacySignals(url,processing)&&!qualification.processingSignals.includes("privacy_signal_invalid"))qualification.processingSignals.push("privacy_signal_invalid");
   if(processing.has("gpp")||processing.has("gpp_sid"))qualification.gpp=partial.gpp;
  }
 }
 if(!v2 && ["linkedin_hashed_email","meta_advanced_matching_identifier","tiktok_pixel_identifier","pinterest_tag_identifier","snap_pixel_identifier","reddit_pixel_identifier"].includes(qualification.basis))return null;
 if(!v2 && qualification.activity==="unresolved")return null;
 if(collectionBodyPrivacySignals(url,new URLSearchParams([...url.searchParams,...bodyFields]))&&!qualification.processingSignals.includes("privacy_signal_invalid"))qualification.processingSignals.push("privacy_signal_invalid");
 if(v2 && input.hasBody && usesExpandedCollectionBody(url,bodyFields))proof.policyVersion="bounded_ca_request_proof.v6";
 const combined=new URLSearchParams(url.searchParams);if(proof.bodyStatus==="complete")for(const [k,v]of bodyFields)combined.append(k,v);
 const propertyId=combined.getAll("tid").length===1?combined.get("tid"):null;
 const propertyBinding=v2&&["google-analytics.com","www.google-analytics.com"].includes(url.hostname)&&url.pathname==="/g/collect"&&
  combined.getAll("v").length===1&&combined.get("v")==="2"&&propertyId&&/^G-[A-Z0-9]{4,60}$/.test(propertyId)&&
  combined.getAll("cid").length===1&&proof.identifiers.some(id=>id.field==="cid")
  ?{policyVersion:"google_analytics_property.v1" as const,propertyIdSha256:sha(propertyId)}:undefined;
 if(v2 && proof.headersStatus!=="complete" && (input.headerPolicy!=="supplemental" || proof.reasons.some(r=>["unsupported_privacy_header","ambiguous_cookie","cookie_opt_out_unresolved"].includes(r))) && !qualification.processingSignals.includes("privacy_signal_invalid"))qualification.processingSignals.push("privacy_signal_invalid");
 return californiaRejectRequestEvidenceSchema.parse({contractVersion:v2?"california_reject_request.v2":"california_reject_request.v1",
  requestId:input.requestId,startedAtMs:input.startedAtMs,origin:url.origin,path:url.pathname,method:input.method,
  urlSha256:sha(input.url),httpStatus:input.httpStatus??null,
  payload:v2?(proof.bodyStatus==="absent"?"no_body":proof.bodyStatus==="complete"?"inspected_body":"uninspected_body"):input.hasBody?"uninspected_body":"no_body",
  ...(v2?{proof}:{}),...(propertyBinding?{propertyBinding}:{}),entity,qualification});
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
