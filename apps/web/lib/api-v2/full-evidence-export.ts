import {createHash} from 'node:crypto';
/** Customer-safe union of existing public projections. Never accepts raw worker artifacts. */
export const FULL_EVIDENCE_VERSION='certscore.full-evidence.v2' as const;
export const FULL_EVIDENCE_MAX_BYTES=24*1024*1024;
export const REPORT_FOCUSES=['gdpr_eprivacy','ccpa_cpra'] as const;
export type EvidenceFocus=typeof REPORT_FOCUSES[number];
type JsonObject=Record<string,any>;
export type FullEvidenceInput={scanId:string;sourceHash:string;projectionVersion:string;standardEvidence:JsonObject;reportViews:Record<EvidenceFocus,JsonObject>;defaultFocus:EvidenceFocus};
const json=(v:unknown)=>JSON.parse(JSON.stringify(v));
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const exclusions=['raw_cookie_values','raw_request_response_bodies','raw_visitor_identifiers','secrets_and_credentials','unredacted_query_values','raw_dom_and_policy_documents','internal_only_diagnostics','scoring_deduction_explanations','image_binary_bytes'];
export function resolveFullEvidenceReferences(root:JsonObject,value:unknown=root):any{
 let nodes=0;
 const walk=(v:any,stack:Set<any>,depth:number):any=>{
  if(++nodes>500000||depth>80)throw Error('Evidence reference expansion exceeds bound');
  if(!v||typeof v!=='object')return v;
  if(stack.has(v))throw Error('Cyclic evidence reference');const next=new Set(stack).add(v);
  if(Object.hasOwn(v,'reportContentRef')){
   if(Object.keys(v).length!==1||typeof v.reportContentRef!=='string'||!v.reportContentRef.startsWith('/'))throw Error('Invalid evidence reference');
   let target:any=root;
   for(const raw of v.reportContentRef.slice(1).split('/')){
    if(/~(?![01])/.test(raw))throw Error('Invalid evidence pointer escape');const key=raw.replaceAll('~1','/').replaceAll('~0','~');
    if(['__proto__','prototype','constructor'].includes(key)||!target||typeof target!=='object'||!Object.hasOwn(target,key))throw Error('Dangling evidence reference');target=target[key];
   }
   return walk(target,next,depth+1);
  }
  return Array.isArray(v)?v.map(x=>walk(x,next,depth+1)):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,next,depth+1)]));
 };return walk(value,new Set(),0);
}
function rebase(value:any,prefix:string):any{
 if(!value||typeof value!=='object')return value;
 if(Object.hasOwn(value,'reportContentRef'))return {reportContentRef:prefix+value.reportContentRef};
 return Array.isArray(value)?value.map(x=>rebase(x,prefix)):Object.fromEntries(Object.entries(value).map(([k,x])=>[k,rebase(x,prefix)]));
}
export function assertFullEvidenceSuperset(full:JsonObject,input:FullEvidenceInput){
 if(full.exportContent?.version!==FULL_EVIDENCE_VERSION||full.exportContent?.scope!=='full_customer_evidence')throw Error('Full evidence contract missing');
 if(full.exportContent.components?.standardEvidence?.sha256!==digest(json(input.standardEvidence)))throw Error('Standard component hash changed');
 if(!equal(full.standardEvidence,json(input.standardEvidence)))throw Error('Standard evidence lost or changed');
 if(full.exportContent.binding.scanId!==input.scanId||full.exportContent.binding.sourceHash!==input.sourceHash||full.exportContent.binding.projectionVersion!==input.projectionVersion)throw Error('Full evidence binding changed');
 for(const focus of REPORT_FOCUSES){
  if(full.exportContent.components?.reportViews?.[focus]?.sha256!==digest(json(input.reportViews[focus])))throw Error('Report component hash changed');
  const actual=resolveFullEvidenceReferences(full,full.reportViews?.[focus]);
  const expected=resolveFullEvidenceReferences(input.reportViews[focus]);
  if(!equal(actual,expected))throw Error('Report evidence lost or changed: '+focus);
 }
 const original=input.reportViews[input.defaultFocus];
 for(const [key,value] of Object.entries(original))if(key!=='exportContent'&&!equal(resolveFullEvidenceReferences(full,full[key]),resolveFullEvidenceReferences(original,value)))throw Error('Default report field lost: '+key);
}
export function buildFullEvidenceExport(input:FullEvidenceInput){
 const standard=json(input.standardEvidence),views=json(input.reportViews) as FullEvidenceInput['reportViews'];
 if(standard.type!=='certscore_pulse_evidence'||standard.meta?.detail!=='evidence'||standard.meta?.evidenceSafety!=='bounded_structured_public_evidence')throw Error('A standard SDK evidence projection is required');
 if(!/^[a-f0-9]{64}$/.test(input.sourceHash)||!input.projectionVersion||standard.scanId!==input.scanId||(standard.scan_id!==undefined&&standard.scan_id!==input.scanId)||standard.meta.reportProjectionSourceHash!==input.sourceHash||standard.meta.reportProjectionVersion!==input.projectionVersion)throw Error('Standard evidence generation mismatch');
 for(const focus of REPORT_FOCUSES){const view=views[focus];if(view?.scan?.id!==input.scanId||view.reviewFocus!==focus||view.exportContent?.scope!=='report_display_content')throw Error('Report view identity/scope mismatch');resolveFullEvidenceReferences(view);}
 const full={...views[input.defaultFocus],standardEvidence:standard,
  reportViews:Object.fromEntries(REPORT_FOCUSES.map(f=>[f,rebase(views[f],'/reportViews/'+f)])),
  exportContent:{version:FULL_EVIDENCE_VERSION,scope:'full_customer_evidence',masterCatalogVersion:'certscore.evidence-master-catalog.v2',standardProjectionClock:'retained_projection_time_or_scan_terminal_time',
   binding:{scanId:input.scanId,sourceHash:input.sourceHash,projectionVersion:input.projectionVersion},
   components:{standardEvidence:{path:'/standardEvidence',status:'included',schemaVersion:standard.meta.schemaVersion,projectionVersion:standard.meta.projectionVersion,sha256:digest(standard)},
    reportViews:Object.fromEntries(REPORT_FOCUSES.map(f=>[f,{path:'/reportViews/'+f,status:'included',sha256:digest(views[f])}]))},
   completeness:'Complete union of the returned customer-safe projections; source caps, unknowns and capture limitations remain authoritative. Not a raw evidence bundle or complete observation of the website.',
   exclusions,
   references:'reportContentRef pointers resolve against this whole document. standardEvidence is the unchanged standard SDK projection. reportViews retains both regulatory evidence views; root report fields preserve the selected display view.',
  }};
 if(Buffer.byteLength(JSON.stringify(full),'utf8')>FULL_EVIDENCE_MAX_BYTES)throw Error('Full evidence exceeds byte bound; no partial package returned');
 assertFullEvidenceSuperset(full,{...input,standardEvidence:standard,reportViews:views});return full;
}
/** Recheck a retained v2 package without trusting its self-described component receipts. */
export function verifyFullEvidenceExport(full:JsonObject){
 const unbase=(value:any,prefix:string):any=>{
  if(!value||typeof value!=='object')return value;
  if(Object.hasOwn(value,'reportContentRef')){
   if(Object.keys(value).length!==1||typeof value.reportContentRef!=='string'||!value.reportContentRef.startsWith(prefix+'/'))throw Error('Cross-component report reference');
   return {reportContentRef:value.reportContentRef.slice(prefix.length)};
  }
  return Array.isArray(value)?value.map(v=>unbase(v,prefix)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unbase(v,prefix)]));
 };
 if(!REPORT_FOCUSES.includes(full.reviewFocus))throw Error('Missing full report focus');
 const views=Object.fromEntries(REPORT_FOCUSES.map(f=>[f,unbase(full.reportViews?.[f],'/reportViews/'+f)])) as FullEvidenceInput['reportViews'];
 const binding=full.exportContent?.binding??{};
 const expected=buildFullEvidenceExport({...binding,standardEvidence:full.standardEvidence,reportViews:views,defaultFocus:full.reviewFocus});
 if(!equal(full,expected))throw Error('Full package component receipt or content mismatch');
}
