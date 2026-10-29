import { decodeMixpanelBody, isMixpanelTrack } from "./mixpanel-collection-body";
import {isAdvertisingIdentityValue} from './advertising-identifiers';
import {readBoundedProtocolJson,type ProtocolJson} from './bounded-protocol-json';
import { decodeIndexExchangeCollectionBody, isIndexExchangeCollection, readIndexExchangeProcessing } from "./index-exchange-collection-body";
import {decodeGoogleBrowserCollectionBody, isGoogleBrowserCollection, readGoogleBrowserProcessing} from "./google-browser-collection-body";
import {decodeRubiconExchangeCollectionBody, isRubiconExchangeCollection, readRubiconExchangeProcessing} from "./rubicon-collection-body";
import type {OpenRtbContext} from "./openrtb-identity";

/** Reviewed collector envelopes. This module observes shape and processing
 * declarations; accepting an envelope never establishes a sale/sharing role. */
function fail(code='unsupported_fields'):never{throw Error(code);}
const object=(v:ProtocolJson):v is {[key:string]:ProtocolJson}=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const scalar=(v:ProtocolJson)=>v===null||['string','number','boolean'].includes(typeof v);
const privacy=new Set(['gpp','gpp_sid','us_privacy','rdp','npa','ltd','dpo','data_processing_options']);
const restricted=new Set(['opt_out','optOut','du','data_use','limited_data_use']);
const split=(s:string)=>new Set(s.split(' '));
const expandedReddit=split('ts aaid external_id idfa auto_em auto_pn partner_ids pm drp m.itemCount m.value m.valueDecimal m.currency m.transactionId m.orderId m.customEventName m.products m.conversionId');
const reddit=split('id event uuid click_id em pn mthd esurl drfr integration partner partner_version opt_out sh sw v dpm dpcc dprc conversion_id transaction_id currency value item_count products trigger_id db');
for (const field of expandedReddit) reddit.add(field);
const snap=split('pid ev u_c1 u_sclid u_scsid u_hem u_hpn u_hed pl rf ts v intg trackId t du data_use e_cur e_pr e_id e_desc e_pids e_qt e_cs e_dm c_type d_b d_m d_os d_ot m_sw m_sh m_wbt huah if nat df s_r_id s_r_ids');
const pinterest=split('event tid cb tv pd ed ad rd ov if uo dp np cdh em epik noscript');
const tiktok=split('event event_id message_id is_onsite properties context partner timestamp pixel_code ttp ttclid type');
function protocol(url:URL){
 if(isMixpanelTrack(url))return 'mixpanel';
 if(url.origin==='https://alb.reddit.com'&&/^\/rp(?:\.gif)?$/.test(url.pathname))return 'reddit';
 if(url.origin==='https://tr.snapchat.com'&&/^\/p\/?$/.test(url.pathname))return 'snap';
 if(url.origin==='https://ct.pinterest.com'&&/^\/v3\/?$/.test(url.pathname))return 'pinterest';
 if(url.origin==='https://analytics.tiktok.com'&&/^\/api\/v2\/pixel(?:\/(?:act|inter|perf))?\/?$/.test(url.pathname))return 'tiktok';
 if(/^https:\/\/(?:fast\.)?a\.klaviyo\.com$/.test(url.origin)&&/^\/(?:api\/(?:track|identify|events|profiles)|client\/(?:events|profiles))\/?$/.test(url.pathname))return 'klaviyo';
 return null;
}
/** Only visitor fields whose carrier is verified in the vendor source. */
export function isCanonicalProtocolIdentityField(url:URL,field:string):boolean{
 const p=protocol(url);
 return p==='reddit'?['uuid','click_id'].includes(field):p==='snap'?field==='u_c1':p==='tiktok'?['ttp','ttclid'].includes(field):p==='pinterest'?field==='external_id'||field==='epik':false;
}
export function canonicalCollectionBodyFields(url:URL):ReadonlySet<string>{
 const p=protocol(url);return p==='reddit'?reddit:p==='snap'?snap:p==='pinterest'?pinterest:p==='tiktok'?tiktok:new Set();
}
/** Explicit vendor opt-outs are never silently dropped. Unsupported vendor
 * semantics stay neutral rather than being mislabeled as an IAB opt-out. */
export function collectionBodyPrivacySignals(url:URL,fields:URLSearchParams):boolean{
 return protocol(url)!==null&&[...fields].some(([k,v])=>
   protocol(url)==='reddit' && ['dpm','dpcc','dprc'].includes(k) && !['','0','false'].includes(v)||['rdp','npa','ltd','dpo','data_processing_options'].includes(k)||restricted.has(k)&&!['0','false'].includes(v));
}
export type CollectionBodyDecodeStage = "envelope_selection" | "json_structure" | "collector_fields" | "field_uniqueness";
export function decodeCanonicalCollectionBody(url:URL,body:string,onStage?:(stage:CollectionBodyDecodeStage)=>void):{fields:URLSearchParams;format:'json'|'form';context?:OpenRtbContext}|null{
 const stage=(value:CollectionBodyDecodeStage)=>{try{onStage?.(value);}catch{/* Diagnostic observers cannot change decoding. */}};
 stage("envelope_selection");
 if(isGoogleBrowserCollection(url))return decodeGoogleBrowserCollectionBody(url,body);
 if(isRubiconExchangeCollection(url))return decodeRubiconExchangeCollectionBody(url,body);
 if(isIndexExchangeCollection(url))return decodeIndexExchangeCollectionBody(url,body);
 const p=protocol(url);if(!p)return null;
 if(p==='mixpanel')return decodeMixpanelBody(url,body);
 let text=body.trim(),format:'json'|'form'='json';
 if(p==='klaviyo'&&!text.startsWith('{')){
  if(/%(?![a-f0-9]{2})/i.test(text))fail('unsupported_body');
  const form=new URLSearchParams(text);if([...form].length!==1||form.getAll('data').length!==1)return null;
  text=form.get('data')!;format='form';
  if(!text.startsWith('{')){
   if(!text||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('unsupported_body');
   const decoded=atob(text);if(btoa(decoded)!==text)fail('unsupported_body');
   text=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(decoded,c=>c.charCodeAt(0)));
  }
 }
 if(!text.startsWith('{'))return null;
 stage("json_structure");
 const root=readBoundedProtocolJson(text,[...url.searchParams].length);if(!object(root))fail();
 stage("collector_fields");
 const fields=new URLSearchParams();
 const routing=p==='reddit'?new Set(['id','event']):p==='tiktok'?new Set(['pixel_code','event']):p==='snap'?new Set(['pid','ev']):p==='pinterest'?new Set(['tid','event']):new Set<string>();
 const value=(key:string,v:ProtocolJson)=>{
  if(!scalar(v))fail();
  if(v!==null)fields.append(key,String(v));else if(privacy.has(key)||restricted.has(key))fields.append(key,'[invalid]');
 };
 const walk=(v:ProtocolJson,allowed:Set<string>,children:Record<string,(v:ProtocolJson)=>void>={})=>{
  if(!object(v))fail();
  for(const [k,x]of Object.entries(v)){
   if(privacy.has(k)){value(k,x);continue;}
   if(restricted.has(k)){value(k,x);continue;}
   if(children[k]){children[k]!(x);continue;}
   if(!allowed.has(k)||!scalar(x))fail();
   if(isCanonicalProtocolIdentityField(url,k)||routing.has(k))value(k,x);
  }
 };
 const flat=(allowed:Set<string>)=>(v:ProtocolJson)=>walk(v,allowed);
 const properties=flat(split('value currency content_id content_type content_name content_category contents quantity order_id price description query search_string status'));
 if(p==='reddit'){
  walk(root,reddit);for(const[k,v]of Object.entries(root))if(scalar(v)&&v!==null&&!privacy.has(k)&&!restricted.has(k)&&!isCanonicalProtocolIdentityField(url,k)&&!routing.has(k))fields.append(k,String(v));
 }else if(p==='tiktok'){
  const user=flat(split('ttp ttclid external_id email phone_number phone user_id')); // No new identity qualification is inferred.
  const context=(v:ProtocolJson)=>walk(v,split('pageview_id session_id variation_id user_agent ip locale'),{
   user,pixel:(v)=>{walk(v,split('code'));if(object(v)&&v.code!==undefined)value('pixel_code',v.code);},
   ad:flat(split('callback click_id ad_id creative_id campaign_id adgroup_id')),
   device:flat(split('platform os os_version screen_width screen_height language user_agent')),
   page:flat(split('url referrer title')),library:flat(split('name version')),
  });
  walk(root,tiktok,{context,properties});
 }else if(p==='snap'){
  const events:ProtocolJson[]=[];
  const event=(v:ProtocolJson)=>{events.push(v);walk(v,snap,{pids:(v)=>{if(!Array.isArray(v)||!v.length||v.length>16||!v.every(x=>typeof x==='string'||typeof x==='number'))fail();}});};
  const timings=(v:ProtocolJson)=>{if(!Array.isArray(v)||v.length>8||!v.every(x=>x===null||typeof x==='number'&&Number.isFinite(x)))fail();};
  walk(root,snap,{
   req:(v)=>{if(!Array.isArray(v)||!v.length||v.length>16)fail('body_limit');for(const item of v)walk(item,split('del'),{t:event});},
   ctx:(v)=>walk(v,split('bt c1 dl ds id if intg lc ls nat pl rf r si sr srs ss sw sh t ts ti bg mtp df ua url v ic pv rd sa sps m_wbt d_a d_bvs d_md d_m d_ot d_os huah'),{a:timings,p:timings,tp:(x)=>{if(!Array.isArray(x)||x.length>16||!x.every(scalar))fail();}}),
  });
  if(events.length){
   if(['pid','ev','u_c1','pids'].some(k=>Object.hasOwn(root,k)))fail();
   // One positive tuple is enough to identify this recipient. Routing and user
   // identity must come from the very same event, never separate batch entries.
   const tuple=(v:ProtocolJson)=>{if(!object(v))return null;const pid=v.pid??(Array.isArray(v.pids)?v.pids[0]:undefined);return typeof v.ev==='string'&&v.ev.length>0&&(typeof pid==='string'||typeof pid==='number')&&isAdvertisingIdentityValue('u_c1',v.u_c1)?{pid:String(pid),ev:v.ev,u_c1:v.u_c1}:null;};
   const selected=events.map(tuple).find(Boolean);
   for(const k of ['pid','ev','u_c1'])fields.delete(k);
   if(selected)for(const[k,v]of Object.entries(selected))fields.append(k,v);
  }
 }else if(p==='pinterest'){
  walk(root,pinterest,{pd:flat(split('em external_id fn ln ph ct st zp country aem')),ed:properties,ad:flat(split('epik'))});
 }else{
  const identity=flat(split('$email $phone_number $id $exchange_id $kid email phone_number external_id anonymous_id _kx first_name last_name organization title image'));
  const attributes=(v:ProtocolJson)=>walk(v,split('email phone_number external_id anonymous_id _kx time value unique_id metric'),{properties,profile:(x)=>walk(x,split('id type'),{data:(y)=>walk(y,split('id type'),{attributes:identity})}),metric:(x)=>walk(x,split('id type'),{data:(y)=>walk(y,split('id type'),{attributes:flat(split('name service'))})})});
  walk(root,split('token event time'),{customer_properties:identity,properties,data:(v)=>walk(v,split('type id'),{attributes})});
 }
 // A single retained request may batch events, but conflicting or repeated
 // privacy declarations cannot be combined into an invented effective state.
 stage("field_uniqueness");
 for(const key of new Set(fields.keys()))if(fields.getAll(key).length!==1){
  const values=fields.getAll(key);
  if(isCanonicalProtocolIdentityField(url,key)&&new Set(values).size===1){fields.delete(key);fields.append(key,values[0]!);}
  else fail('duplicate_fields');
 }
 return {fields,format};
}

/** A known processing declaration remains observable even if unrelated event
 * metadata is unsupported. Only reviewed root/event locations are inspected;
 * no absence or role is inferred from this independent partial read. */
export function readCanonicalBodyProcessing(url:URL,body:string,structuralPolicy?:"magnite_json_structure.v1"):URLSearchParams|null{
 if(isGoogleBrowserCollection(url))return readGoogleBrowserProcessing(url,body);
 if(isRubiconExchangeCollection(url))return readRubiconExchangeProcessing(url,body,structuralPolicy);
 if(isIndexExchangeCollection(url))return readIndexExchangeProcessing(url,body);
 const p=protocol(url);if(!p||new TextEncoder().encode(body).length>32768)return null;
 try{
  if(p==='mixpanel')return decodeMixpanelBody(url,body,true)?.fields??null;
  const text=body.trim(),fields=new URLSearchParams();
  if(!text.startsWith('{')){
   if(/[{}\r\n]/.test(text)||/%(?![a-f0-9]{2})/i.test(text))return null;
   const values=new URLSearchParams(text);if([...values].length>128)return null;
   for(const[k,v]of values)if(privacy.has(k)||restricted.has(k)||p==='reddit'&&['dpm','dpcc','dprc'].includes(k))fields.append(k,v);
  }else{
   const root=readBoundedProtocolJson(text,[...url.searchParams].length);if(!object(root))return null;
   const retain=(v:ProtocolJson)=>{if(!object(v))return;for(const[k,x]of Object.entries(v))if((privacy.has(k)||restricted.has(k)||p==='reddit'&&['dpm','dpcc','dprc'].includes(k))&&scalar(x))fields.append(k,x===null?'[invalid]':String(x));};
   retain(root);
   if(p==='snap'&&Array.isArray(root.req)&&root.req.length<=16)for(const event of root.req)if(object(event))retain(event.t??null);
  }
  return fields;
 }catch{return null;}
}

/** New parses carry a distinct proof policy; original v1-v5 records stay intact. */
export function usesExpandedCollectionBody(url: URL, fields: URLSearchParams): boolean {
 return isMixpanelTrack(url) || protocol(url)==='reddit' && [...fields.keys()].some(key=>expandedReddit.has(key)||['dpm','dpcc','dprc'].includes(key));
}
