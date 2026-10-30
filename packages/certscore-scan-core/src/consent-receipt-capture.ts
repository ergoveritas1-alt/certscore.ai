import {matchesCanonicalCmpCookieName} from './cmp-cookie-name.js';
import {captureExactCookieWrite} from './exact-cookie-write-capture.js';
import {createHash} from 'node:crypto';
import type {BrowserContext,Frame,Page} from 'playwright';
import {consentReceiptCaptureSchema,type ConsentReceiptCapture,type ConsentReceiptObservation} from '@certscore/contracts';
import type {CmpApiConsentProvider,CmpApiConsentSnapshot,PartialApiReceipt} from './cmp-api-consent-state.js';
import type {ActionStateWrite} from './consent-action-semantic-state.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const captures=new WeakMap<object,ReturnType<typeof installConsentReceiptCapture>>();
const enumValues=new Set(['yes','no','allow','deny','ACCEPT','DENY','granted','denied','mixed','unknown','active','inactive','always active']);
const candidate=(name:string)=>/consent|optanon|^cmplz_|^__cmp|^cmapi_|(?:^|[.])notice_(?:gdpr_prefs|preferences)$|(?:^|[.])cmapi_cookie_privacy$/i.test(name)||name.toLowerCase().startsWith('_iub_cs')&&matchesCanonicalCmpCookieName(name,'_iub_cs');
function duplicateJsonFields(text:string):boolean{
 const stack:Array<Set<string>|null>=[];
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='{'){stack.push(new Set());continue;}if(c==='['){stack.push(null);continue;}if(c==='}'||c===']'){stack.pop();continue;}
  if(c!=='"')continue;const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}
  let next=i+1;while(/\s/.test(text[next]??'' )&&next<text.length)next++;
  if(text[next]!==':')continue;const key=JSON.parse(text.slice(start,i+1))as string,set=stack.at(-1);if(set){if(set.has(key))return true;set.add(key);}
 }return false;
}
type Projection=Pick<ConsentReceiptObservation,'format'|'facts'|'factsLimited'|'omittedFields'>;
/** CPU-only projection of an already-read bounded value. No raw IDs, strings,
 * key names or numeric values leave this helper. Unknown shapes stay unknown. */
export function projectReceiptValue(key:string,value:string,api=false):Projection {
 const out:Projection={format:api?'api':'opaque',facts:[],factsLimited:false,omittedFields:0};
 const add=(path:string,value:unknown)=>{if(typeof value!=='boolean'&&!(typeof value==='string'&&enumValues.has(value))){out.omittedFields=Math.min(4096,out.omittedFields+1);return;}
  if(out.facts.length===16){out.factsLimited=true;return;}out.facts.push({pathSha256:hash(path),value:value as boolean|'yes'});};
 if(value.length>2048){out.factsLimited=true;return out;}
 let text=value;try{text=decodeURIComponent(text);}catch{out.factsLimited=true;return out;}
 if(key==='cookieyes-consent'){
  out.format='cookieyes';const seen=new Set<string>();
  for(const part of text.split(',').slice(0,25)){const pieces=part.split(':');const name=pieces[0]!;
   if(pieces.length!==2||seen.has(name)){out.facts=[];out.factsLimited=true;return out;}seen.add(name);
   if(['consentid','consent','action','lastRenewedDate'].includes(name)){out.omittedFields++;continue;}add(name,pieces[1]);}
  if(text.split(',').length>24)out.factsLimited=true;return out;
 }
 if(/^OptanonConsent(?:_[\w-]+)?$/.test(key)){
  out.format='onetrust_groups';const groups=new URLSearchParams(text).getAll('groups');
  if(groups.length!==1){out.factsLimited=true;return out;}const seen=new Set<string>();
  for(const part of groups[0]!.split(',').slice(0,17)){const [id,state,extra]=part.split(':');
   if(!id||extra!==undefined||!['0','1'].includes(state!)||seen.has(id)){out.facts=[];out.factsLimited=true;return out;}seen.add(id);add(id,state==='1');}return out;
 }
 if(key==='CookieConsent'&&text.trim().startsWith('{')){
  out.format='cookiebot';text=text.replace(/([{,])\s*([a-zA-Z]+)\s*:/g,'$1"$2":').replace(/'([^'\\]*)'/g,(_m,s:string)=>JSON.stringify(s));
 }
 try{
  const raw=JSON.parse(text) as unknown;if(!api&&out.format==='opaque')out.format='json';
  // Duplicate JSON fields are never silently represented as a complete input.
  if(duplicateJsonFields(text)){out.factsLimited=true;return out;}
  let inspected=0;
  const walk=(value:unknown,path:string[],depth:number):void=>{
   if(++inspected>64||depth>4){out.factsLimited=true;return;}
   if(Array.isArray(value)){
    if(api&&value.length>=2&&value.length<=3&&typeof value.at(-1)==='boolean'&&value.slice(0,-1).every(x=>typeof x==='string')){add(JSON.stringify(value.slice(0,-1)),value.at(-1));return;}
    for(let i=0;i<Math.min(value.length,16);i++)walk(value[i],[...path,String(i)],depth+1);if(value.length>16)out.factsLimited=true;
   }else if(value&&typeof value==='object'){
    const entries=Object.entries(value);for(const [k,v]of entries.slice(0,16))walk(v,[...path,k],depth+1);if(entries.length>16)out.factsLimited=true;
   }else add(JSON.stringify(path),value);
  };walk(raw,[],0);
 }catch{
  if(enumValues.has(text)){out.format=api?'api':'scalar';add('',text);}else out.omittedFields++;
 }
 return out;
}

type Token={capture:ReturnType<typeof installConsentReceiptCapture>;epoch:object;phase:ConsentReceiptObservation['phase'];url:string};
export function receiptCaptureToken(scope:Page|Frame|BrowserContext):Token|undefined {
 try{const capture=captures.get(scope);if(capture)return capture.token();
 if('page'in scope){const page=scope.page();if(scope!==page.mainFrame())return;return captures.get(page)?.token();}
 return;}catch{return;}
}
export function installConsentReceiptCapture(page:Page,input:{scanId:string;action:'accept'|'reject';clockOriginAtEpochMs:number;signal?:AbortSignal}){
 let epoch={},closed=false,invalid=false,phase:ConsentReceiptObservation['phase']='baseline',dispatched:number|undefined;
 let rows:ConsentReceiptObservation[]=[],truncated=false,limited=false,spent=0;
 const inspections={baseline:0,initial:0,terminal:0};const seen=new Set<string>();
 const navigation=(frame:Frame)=>{if(frame!==page.mainFrame()||closed)return;epoch={};rows=[];seen.clear();if(dispatched!==undefined)invalid=true;};
 page.on('framenavigated',navigation);
 const handle={token():Token|undefined{if(closed||invalid||input.signal?.aborted)return;if(spent>=4){limited=true;return;}return{capture:handle,epoch,phase,url:page.url()};},
  phase(value:ConsentReceiptObservation['phase']){phase=value;},dispatch(at:number){dispatched=at;phase='initial';},
  record(token:Token,key:string,value:string|undefined,base:Omit<ConsentReceiptObservation,'phase'|'keySha256'|'readAtEpochMs'|'available'|'format'|'facts'|'factsLimited'|'omittedFields'|'valueSha256'>,exactWrite?:{assignment?:string;url?:string;limited?:boolean;configuration?:boolean;partialApi?:boolean;omittedFields?:number}){
   if(closed||invalid||input.signal?.aborted||token.epoch!==epoch||token.url!==page.url())return;
   if(spent>=4){limited=true;return;}const start=performance.now();
   try{
    if(value!==undefined&&value.length>2048){truncated=true;return;}
    if(token.phase==='baseline'&&dispatched!==undefined){limited=true;return;}
    if((base.writeObservedAtEpochMs??0)>Date.now()||(base.eventObservedAtEpochMs??0)>Date.now()){limited=true;return;}
    const signature=JSON.stringify([token.phase,key,value,base]);if(seen.has(signature))return;
    const max=token.phase==='initial'?16:8;if(inspections[token.phase]>=max){truncated=true;return;}
    inspections[token.phase]++;seen.add(signature);
    let identitySha256=base.identitySha256;
    if(exactWrite?.assignment&&exactWrite.url&&value!==undefined){const proof=captureExactCookieWrite({assignment:exactWrite.assignment,url:exactWrite.url,observedAtMs:0,source:'main_document_setter'});
     if(proof?.valueHash===hash(value))identitySha256=proof.identityHash;}
    const row:ConsentReceiptObservation={...base,...(identitySha256?{identitySha256}:{}),phase:token.phase,keySha256:hash(key),readAtEpochMs:Date.now(),available:value!==undefined,
     ...(value===undefined?{format:base.source==='api'?'api':'opaque',facts:[],factsLimited:false,omittedFields:0}:{valueSha256:hash(value),...projectReceiptValue(key,value,base.source==='api')})};
    if(exactWrite?.limited)row.factsLimited=true;
    if(exactWrite?.configuration)row.format='configuration';
    if(exactWrite?.partialApi)row.format='api_partial';
    if(exactWrite?.omittedFields)row.omittedFields=Math.min(4096,row.omittedFields+exactWrite.omittedFields);
    if(rows.length===8||JSON.stringify([...rows,row]).length>7000){truncated=true;return;}rows.push(row);
   }catch{limited=true;}finally{spent+=performance.now()-start;}
  },
  finish(binding?:{targetSha256?:string;frameIdentitySha256?:string;clickOutcome?:string},at=Date.now()):ConsentReceiptCapture|undefined{
   if(closed)return;closed=true;page.off('framenavigated',navigation);if(captures.get(page)===handle)captures.delete(page);if(captures.get(page.context())===handle)captures.delete(page.context());
   if(dispatched===undefined||!binding?.targetSha256||binding.clickOutcome!=='completed')return;
   const parsed=consentReceiptCaptureSchema.safeParse({policyVersion:'consent_receipt_capture.v1',diagnosticOnly:true,scanId:input.scanId,action:input.action,
    authorizedTargetSha256:binding.targetSha256,...(binding.frameIdentitySha256?{frameIdentitySha256:binding.frameIdentitySha256}:{}),
    clockOriginAtEpochMs:input.clockOriginAtEpochMs,actionDispatchedAtEpochMs:dispatched,frozenAtEpochMs:at,
    documentStable:!invalid,cancelled:input.signal?.aborted===true,observationsTruncated:truncated,processingLimited:limited,
    observations:invalid||input.signal?.aborted?[]:rows});return parsed.success?parsed.data:undefined;
  }};
 captures.set(page,handle);captures.set(page.context(),handle);return handle;
}
export function retainReceiptCookies(token:Token|undefined,cookies:Awaited<ReturnType<BrowserContext['cookies']>>,name:string){
 if(!token)return;try{
  const url=new URL(token.url);
  const matching=cookies.filter(c=>{const domain=c.domain.replace(/^\./,'');return (c.name===name||c.name.toLowerCase().startsWith(name.toLowerCase().replace(/[*]$/,''))&&matchesCanonicalCmpCookieName(c.name,name))&&
   (url.hostname===domain||c.domain.startsWith('.')&&url.hostname.endsWith('.'+domain))&&
   (url.pathname===c.path||url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))&&(!c.secure||url.protocol==='https:');});
  if(!matching.length)token.capture.record(token,name,undefined,{source:'cookie',storageType:'cookie',cookieMultiplicity:'none'});
  for(const c of matching.slice(0,2))token.capture.record(token,c.name,c.value,{source:'cookie',storageType:'cookie',cookieMultiplicity:matching.length===1?'unique':'ambiguous',identitySha256:hash(JSON.stringify(['cookie_name_domain_path_partition',c.domain.toLowerCase().replace(/^\./,''),c.path,c.partitionKey??'',c.name]))});
 }catch{/* Observations cannot change confirmation. */}}
export function retainReceiptWrites(token:Token|undefined,writes:ActionStateWrite[]){
 if(!token)return;try{for(const w of writes.slice(-96))if(candidate(w.name)&&w.value!==undefined&&(!w.documentUrl||w.documentUrl===token.url))
  token.capture.record(token,w.name,w.value,{source:'write',storageType:w.storageType,writeSequence:w.sequence,writeObservedAtEpochMs:w.observedAtEpochMs},w.cookieAssignment&&w.documentUrl?{assignment:w.cookieAssignment,url:w.documentUrl}:undefined);}catch{/* Optional retention never discards observed writes. */}
}
export function retainReceiptApi(token:Token|undefined,provider:CmpApiConsentProvider,snapshot:CmpApiConsentSnapshot|undefined){
 token?.capture.record(token,provider,snapshot?.canonicalState,{source:'api',provider,...(snapshot?{decision:snapshot.decision,eventSequence:snapshot.eventSequence,
  ...(snapshot.configurationSha256?{configurationSha256:snapshot.configurationSha256}:{}),...(snapshot.eventObservedAtEpochMs===undefined?{}:{eventObservedAtEpochMs:snapshot.eventObservedAtEpochMs})}:{})});
}

/** Project only the bounded group/configuration input already returned by the
 * existing OneTrust read. No source lookup, getter or SDK call is introduced. */
export function retainReceiptConfiguration(token:Token|undefined,raw:unknown,sourceSha256?:string){
 if(!token)return;
 try{
  const value=raw as {declared?:Array<{id?:unknown;status?:unknown}>;inputs?:{isIabEnabled?:unknown;vendorLevelOptOut?:unknown;useGoogleVendors?:unknown;groups?:Array<Record<string,unknown>>}}|undefined;
  const groups=Array.isArray(raw)?raw:value?.inputs?.groups??value?.declared;
  if(!Array.isArray(groups)){token.capture.record(token,'onetrust',undefined,{source:'configuration',provider:'onetrust'});return;}
  const safe:Record<string,unknown>=Object.create(null);const ids=new Set<string>();let incomplete=groups.length>16;
  if(value?.inputs)for(const field of ['isIabEnabled','vendorLevelOptOut','useGoogleVendors']as const)if(typeof value.inputs[field]==='boolean')safe[field]=value.inputs[field];
  for(const group of groups.slice(0,16)){
   if(!group||typeof group.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(group.id)||ids.has(group.id)){incomplete=true;continue;}ids.add(group.id);
   const fields:Record<string,unknown>=Object.create(null);
   if(['active','inactive','always active'].includes(group.status as string))fields.status=group.status;
   for(const field of ['root','named','isIabPurpose','showInPopup','alwaysShowCategory'])if(typeof group[field]==='boolean')fields[field]=group[field];
   safe[group.id]=fields;
  }
  const text=JSON.stringify(safe);
  token.capture.record(token,'onetrust',text,{source:'configuration',provider:'onetrust',...(sourceSha256?{sdkSourceSha256:sourceSha256}:{})},{configuration:true,limited:incomplete||Object.keys(safe).length===0});
 }catch{/* Capture never changes configuration verification. */}
}

export function retainReceiptApiPartial(token:Token|undefined,provider:CmpApiConsentProvider,partial:PartialApiReceipt|undefined){
 if(!token||!partial)return;
 try{token.capture.record(token,provider+':partial',JSON.stringify(partial.fields),{source:'api',provider,decision:'unknown',...(partial.apiReadKind?{apiReadKind:partial.apiReadKind}:{}),
   ...(partial.readbackMatched===undefined?{}:{readbackMatched:partial.readbackMatched}),...(partial.eventSequence===undefined?{}:{eventSequence:partial.eventSequence}),
   ...(partial.eventObservedAtEpochMs===undefined?{}:{eventObservedAtEpochMs:partial.eventObservedAtEpochMs})},
  {partialApi:true,limited:true,omittedFields:partial.omittedFields});}catch{/* Partial data never affects the live decoder. */}
}
