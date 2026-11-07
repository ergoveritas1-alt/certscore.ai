/** Exact retained ID observations, never export-file counts or lifetime discovery. */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function read(ref:any,limit:number){
 if(!ref||typeof ref.file!=='string'||!Number.isSafeInteger(ref.bytes)||ref.bytes<=0||ref.bytes>limit||statSync(ref.file).size!==ref.bytes)throw Error('ID ledger receipt size mismatch');
 const b=readFileSync(ref.file);if(createHash('sha256').update(b).digest('hex')!==ref.sha256)throw Error('ID ledger receipt hash mismatch');return JSON.parse(b.toString());
}
function inventory(ref:any){
 const d=read(ref,32_000_000);
 if(d.version!=='certscore.mac-mini-direct-id-inventory.v1'||d.readOnly!==true||!Array.isArray(d.rows)||d.rows.length>5000||new Set(d.rows.map((r:any)=>r.scanId)).size!==d.rows.length)throw Error('Invalid ID ledger inventory');
 for(const r of d.rows)if(!uuid.test(r.scanId)||typeof r.originalRequestId!=='string'||!r.originalRequestId||typeof r.isCanary!=='boolean'||r.isMacMini!==true||!Number.isFinite(Date.parse(r.created_at)))throw Error('Unbound ID ledger row');
 return d;
}
export function readIdChanges(cache:any){
 if(!cache.previousCache||!cache.directInventory)return undefined;
 const previous=read(cache.previousCache,64*1024*1024);
 if(previous.version!=='certscore.mac-mini-evidence-cache.v1'||previous.sourceWrites!==0||!Array.isArray(previous.receipts))throw Error('Invalid previous ID ledger cache');
 const current=inventory(cache.directInventory),old=previous.directInventory?inventory(previous.directInventory):undefined;
 if(!Number.isFinite(Date.parse(previous.end))||!Number.isFinite(Date.parse(cache.end))||old&&Date.parse(old.end)!==Date.parse(previous.end)||Date.parse(current.end)!==Date.parse(cache.end)||Date.parse(previous.end)>=Date.parse(cache.end))throw Error('ID ledger interval mismatch');
 const known=new Set(previous.receipts.map((r:any)=>r.scanId)),before=new Map<string,any>((old?.rows??[]).map((r:any)=>[r.scanId,r]));
 for(const id of before.keys())known.add(id);
 const rows=current.rows.filter((r:any)=>r.isCanary===false).map((r:any)=>{
  const p=before.get(r.scanId);let change:string;
  if(!known.has(r.scanId))change='new_to_retained_inventory';
  else if(!p)change='prior_observation_unavailable';
  else if(p.originalRequestId!==r.originalRequestId||Date.parse(p.created_at)!==Date.parse(r.created_at))throw Error('Conflicting original ID identity');
  else if(!/^[a-f0-9]{64}$/.test(p.projection_source_hash??'')||!/^[a-f0-9]{64}$/.test(r.projection_source_hash??''))change='generation_unavailable';
  else if(p.projection_source_hash!==r.projection_source_hash||p.projection_version&&r.projection_version&&p.projection_version!==r.projection_version)change='report_generation_changed';
  else if(!p.projection_version||!r.projection_version||!/^[a-f0-9]{64}$/.test(p.projection_payload_sha256??'')||!/^[a-f0-9]{64}$/.test(r.projection_payload_sha256??''))change='generation_unavailable';
  else if(p.projection_payload_sha256!==r.projection_payload_sha256)change='report_generation_changed';
  else if(typeof p.status!=='string'||typeof r.status!=='string')change='status_unavailable';
  else if(p.status!==r.status)change='status_only_changed';
  else change='unchanged';
  return {scanId:r.scanId,change};
 });
 const counts:Record<string,number>=Object.fromEntries(['new_to_retained_inventory','report_generation_changed','status_only_changed','unchanged','prior_observation_unavailable','generation_unavailable','status_unavailable'].map(k=>[k,0]));
 for(const r of rows)counts[r.change]=(counts[r.change]??0)+1;
 return {version:'certscore.audit-id-changes.v1',scope:'current_returned_noncanary_original_creator_IDs_vs_previous_retained_cache; not lifetime IDs or complete production',before:cache.previousCache,after:cache.directInventory,counts,rows,unreturnedPriorIds:'not_rechecked_not_in_denominator'};
}
