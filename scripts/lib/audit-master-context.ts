import {readIdChanges} from './audit-id-changes';
/** Snapshot-level facts are never duplicated into scan evidence or rate denominators. */
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
export const CONTEXT_PATHS:Record<string,string>={
 'operations.series.compatibility':'/days/*/{metrics,quantities,findings}/*/series',
 'operations.series.rate':'/days/*/{metrics,findings}/*/series/*/{rate,denominator}',
 'operations.provenance.receipt_ancestry':'/retainedReports (complete nested receipts)',
 'operations.cohort.exclusions':'/exclusionCounts',
 'operations.cohort.missing_days':'/days/*/{date,inventoryHours,completeDay,sampleOnly}',
 'operations.series.summary_coverage':'/rows/*/{createdAt,metricSources,states}/sealed.opt_out.coverage',
 'operations.acquisition.pending_ids':'/sources/cache-manifest.json/receipts[state != copied]',
 'operations.acquisition.id_additions':'/sources/cache-manifest.json/previousCache + directInventory (exact ID observations)',
 'operations.acquisition.id_updates':'/sources/cache-manifest.json/previousCache + directInventory (report generation and status separately)',
 'operations.acquisition.cache_reuse':'/sources/cache-manifest.json/transferCounts/localFilesReused',
};
export function readMasterContext(data:Record<string,any>){
 const values:Record<string,any>={};
 const put=(id:string,value:any,qualification:string)=>{values[id]={status:value===undefined?'not_retained':'available',scope:'frozen_dashboard_window',path:CONTEXT_PATHS[id],qualification,...(value===undefined?{}:{value})};};
 put('operations.cohort.exclusions',data.exclusionCounts,'audit-cohort-exclusions');
 put('operations.cohort.missing_days',data.days?.map((d:any)=>({date:d.date,inventoryHours:d.inventoryHours,completeDay:d.completeDay,sampleOnly:d.sampleOnly})),'audit-calendar-coverage/no-zero-imputation');
 put('operations.provenance.receipt_ancestry',Array.isArray(data.retainedReports)?{referencePath:'/retainedReports',count:data.retainedReports.length,sha256:hash(JSON.stringify(data.retainedReports)),nestedReceipts:'unchanged_in_referenced_snapshot_value'}:undefined,'complete-retained-receipt-objects');
 const byDate:Record<string,Record<string,number>>={};
 for(const r of data.rows??[]){if(!r.reportable)continue;const date=String(r.createdAt).slice(0,10);const source=r.metricSources?.['sealed.opt_out.coverage']??'unavailable_source',state=r.states?.['sealed.opt_out.coverage']??'not_returned';const key=source+'/'+state;(byDate[date]??={})[key]=((byDate[date]??{})[key]??0)+1;}
 put('operations.series.summary_coverage',data.rows?byDate:undefined,'UTC_createdAt/source-version/state; no historical reconstruction');
 if(data.days){
  for(const day of data.days)for(const family of ['metrics','quantities','findings'])for(const v of Object.values(day[family]??{}) as any[]){if(v.source==='mixed_sources'&&((family==='quantities'&&(v.median!==null||v.delta!==null))||(family!=='quantities'&&(v.rate!==null||v.deltaPp!==null))))throw Error('Incompatible aggregate values are not null');}
  const reference={referencePath:'/days',sha256:hash(JSON.stringify(data.days)),days:data.days.length,interpretation:'Read each original source/engine/schema/window series separately; no pooled incompatible rate.'};
  put('operations.series.compatibility',reference,'shared-audit-engine/source-series');put('operations.series.rate',reference,'shared-audit-engine/source-series');
 }else{put('operations.series.compatibility',undefined,'shared-audit-engine');put('operations.series.rate',undefined,'shared-audit-engine');}
 const refs=(data.sources??[]).filter((s:any)=>typeof s.file==='string'&&s.file.endsWith('/cache-manifest.json'));
 if(refs.length>1)throw Error('Ambiguous current cache receipt');
 let cache:any,ref:any=refs[0];
 if(ref){if(statSync(ref.file).size>64*1024*1024)throw Error('Cache receipt exceeds bound');const bytes=readFileSync(ref.file);if(hash(bytes)!==ref.sha256||(ref.bytes!==undefined&&bytes.length!==ref.bytes))throw Error('Changed cache receipt bytes');cache=JSON.parse(bytes.toString());if(cache.version!=='certscore.mac-mini-evidence-cache.v1'||cache.sourceWrites!==0||!Array.isArray(cache.receipts))throw Error('Unsupported cache contract');}
 const pending=cache?.receipts.filter((r:any)=>r.state!=='copied').map((r:any)=>({scanId:r.scanId,state:r.state,selectionInventory:r.selectionInventory}));
 put('operations.acquisition.pending_ids',pending===undefined?undefined:{count:pending.length,referenceFile:ref.file,sha256:ref.sha256,selection:'non-copied cache receipts; ID-only proof'},'verified-local-cache-receipt');
 const reused=cache?.transferCounts?.localFilesReused;if(reused!==undefined&&(!Number.isSafeInteger(reused)||reused<0))throw Error('Invalid cache reuse count');
 put('operations.acquisition.cache_reuse',reused===undefined?undefined:{count:reused,unit:'local_files',referenceFile:ref.file,sha256:ref.sha256},'verified-local-cache-receipt');
 let previousCache=cache?.previousCache;
 if(data.idChangeInputs){
  const inputs=data.idChangeInputs;
  if(!ref||inputs.currentCache?.file!==ref.file||inputs.currentCache?.sha256!==ref.sha256||inputs.currentCache?.bytes!==ref.bytes)throw Error('ID comparison current-cache mismatch');
  const p=inputs.priorSnapshot;
  if(!p||!Number.isSafeInteger(p.bytes)||p.bytes>200_000_000||statSync(p.file).size!==p.bytes)throw Error('ID comparison prior snapshot bound');
  const bytes=readFileSync(p.file);if(hash(bytes)!==p.sha256)throw Error('Changed prior snapshot bytes');
  const prior=JSON.parse(bytes.toString());
  if(!prior.sources?.some((s:any)=>s.file===inputs.previousCache?.file&&s.sha256===inputs.previousCache?.sha256&&s.bytes===inputs.previousCache?.bytes))throw Error('Previous cache lacks original snapshot receipt');
  if(previousCache&&JSON.stringify(previousCache)!==JSON.stringify(inputs.previousCache))throw Error('Conflicting previous cache receipt');
  previousCache=inputs.previousCache;
 }
 const changes=cache?readIdChanges({...cache,previousCache}):undefined;
 put('operations.acquisition.id_additions',changes?{count:changes.counts.new_to_retained_inventory,ledger:changes}:undefined,'new_to_retained_inventory/not_lifetime_discovery');
 put('operations.acquisition.id_updates',changes?{count:changes.counts.report_generation_changed,statusOnly:changes.counts.status_only_changed,ledger:changes}:undefined,'report_generation_changes/status_only_separate/unknown_baseline_excluded');
 return values;
}
