import {createP2Coverage} from './audit-p2-coverage';
import {loadPersistedP2Sources,type PersistedP2Inputs} from './audit-p2-persisted';
import {loadPrivacyFormInputs,reconcilePrivacyFormSources,type PrivacyFormInput} from './audit-privacy-form-inputs';
import type {OptOutReceipt} from './audit-progress-opt-out';
/** Reconciliation of retained view bytes, never reconstruction of missing customer outputs. */
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {adaptMasterView,compareMasterViews,stableValue,type Binding,type ViewInput} from './audit-master-values';
import {MASTER_VALUE_MAPPINGS} from './audit-master-value-mappings';
import {readMasterContext,CONTEXT_PATHS} from './audit-master-context';
import type {ProgressRow} from './audit-progress';
export function verifyMasterValueParity(data:PersistedP2Inputs&{masterViewReceipts?:Array<{view:'report'|'full';file:string;sha256:string;schema:string;binding:Binding}>;privacyFormReceipts?:PrivacyFormInput[];optOutExtracts?:OptOutReceipt[];[key:string]:unknown}){
 const tally=(counts:Record<string,number>,key:string,n=1)=>{counts[key]=(counts[key]??0)+n;};
 const items=MASTER_VALUE_MAPPINGS.items.map(m=>({legacyId:m.legacyId,masterFieldId:m.masterFieldId,views:Object.fromEntries(['report','standard','full','audit'].map(v=>[v,{} as Record<string,number>])) as Record<string,Record<string,number>>,pairs:{} as Record<string,Record<string,number>>}));
 const fields=new Map(items.map(i=>[i.legacyId,i]));
 const pairs:Record<string,{comparisons:number;mismatches:number;notComparable:number}>={};
 const byDate:Record<string,{scans:number;standard:number;report:number;full:number;comparisons:number;mismatches:number}>={};
 const sourceReceipts:Array<{scanId:string;view:string;sha256:string}>=[];
 const p2=createP2Coverage();
 const persisted=loadPersistedP2Sources(data);
 const compact=loadPrivacyFormInputs(data.rows,data.privacyFormReceipts??[],data.optOutExtracts??[]);
 for(const [id,source] of compact){const original=persisted.byScan.get(id);if(original)reconcilePrivacyFormSources(source,original);}
 let evaluatedScans=0,missingSourceBinding=0,comparisons=0,mismatches=0;
 for(const row of data.rows.filter(r=>r.reportable)){
  const date=row.createdAt.slice(0,10),day=byDate[date]??={scans:0,standard:0,report:0,full:0,comparisons:0,mismatches:0};day.scans++;
  if(!row.publicProjectionSourceHash){missingSourceBinding++;p2.add(row,[],{});continue;}
  const binding:Binding={scanId:row.scanId,createdAt:row.createdAt,generation:row.projectionVersion,sourceHash:row.publicProjectionSourceHash,creatorIdentity:String((row as any).originProof??'unverified')+'/'+row.originRequestId};
  const schemas:Record<string,string>={audit:'certscore.mac-mini-daily-progress.v5'};
  const bytes=Buffer.from(JSON.stringify(row));const views=[adaptMasterView({view:'audit',schema:'certscore.mac-mini-daily-progress.v5',bytes,sha256:createHash('sha256').update(bytes).digest('hex'),binding})];
  const ref=row.refs.find(r=>r.role==='hash_verified_bot_archive_export');
  if(ref){
   const bytes=readFileSync(ref.file);const doc=JSON.parse(bytes.toString('utf8'));
   schemas.standard=doc.meta?.projectionVersion;
   const standard=adaptMasterView({view:'standard',schema:doc.meta?.projectionVersion,bytes,sha256:ref.sha256,binding});
   // Exact public metric routes must survive into the stored daily row. A dropped value or changed qualifier is a regression, not an intentional omission.
   for(const f of standard.fields){if(MASTER_VALUE_MAPPINGS.items.find(m=>m.legacyId===f.legacyId)!.views.standard.mode!=='metric')continue;const actual=views[0]!.fields.find(a=>a.legacyId===f.legacyId)!;for(const expected of f.samples.filter(s=>s.availability==='available'&&MASTER_VALUE_MAPPINGS.items.find(m=>m.legacyId===f.legacyId)!.views.standard.paths.includes(s.recordKey))){const sample=actual.samples.find(s=>s.recordKey===expected.recordKey);if(!sample||stableValue(sample)!==stableValue(expected))throw Error(`Stored master metric drift ${row.scanId}/${f.legacyId}/${expected.recordKey}`);}}
   views.push(standard);day.standard++;sourceReceipts.push({scanId:row.scanId,view:'standard',sha256:ref.sha256});
  }
  for(const ref of (data.masterViewReceipts??[]).filter(r=>r.binding.scanId===row.scanId)){
   if(views.some(v=>v.view===ref.view))throw Error('Duplicate retained view receipt');
   if(stableValue(ref.binding)!==stableValue(binding))throw Error('Master view does not match current scan/source/generation/creator binding: '+row.scanId);
   schemas[ref.view]=ref.schema;
   const input:ViewInput={...ref,bytes:readFileSync(ref.file)};views.push(adaptMasterView(input));day[ref.view]++;sourceReceipts.push({scanId:row.scanId,view:ref.view,sha256:ref.sha256});
  }
  for(const name of ['report','standard','full','audit']){
   const view=views.find(v=>v.view===name);
   for(const item of items){const field=view?.fields.find(f=>f.legacyId===item.legacyId);const counts=item.views[name]!;
    if(name==='audit'&&CONTEXT_PATHS[item.legacyId])continue;
    if(!field)tally(counts,'view_not_retained');else if(field.samples.length){for(const sample of field.samples)tally(counts,sample.availability);}else tally(counts,field.status);
   }
  }
  for(let i=0;i<views.length;i++)for(let j=i+1;j<views.length;j++){
   const a=views[i]!,b=views[j]!,name=[a.view,b.view].sort().join('↔'),pair=pairs[name]??={comparisons:0,mismatches:0,notComparable:0};
   for(const result of compareMasterViews(a,b)){
    const f=fields.get(result.legacyId)!;tally(f.pairs[name]??={},result.status);
    comparisons+=result.comparisons;day.comparisons+=result.comparisons;pair.comparisons+=result.comparisons;
    if(result.status==='mismatch'){mismatches++;day.mismatches++;pair.mismatches++;throw Error(`Master value mismatch ${row.scanId}/${result.legacyId}/${name}`);}
    if(result.status==='not_comparable')pair.notComparable++;
   }
  }p2.add(row,views,schemas,persisted.byScan.get(row.scanId),compact.get(row.scanId));evaluatedScans++;
 }
 return {version:'certscore.master-value-parity.v1',catalogVersion:MASTER_VALUE_MAPPINGS.catalogVersion,status:'passed',evaluatedScans,missingSourceBinding,comparisons,mismatches,pairs,byDate,items,contextValues:readMasterContext(data),
  p2Coverage:{...p2.finish(),persistedSources:persisted.summary,...(data.privacyFormReceipts?.length?{compactReceipts:{matched:compact.size,referenced:data.privacyFormReceipts.length}}:{})},sourceReceiptCount:sourceReceipts.length,sourceReceiptsSha256:createHash('sha256').update(JSON.stringify(sourceReceipts)).digest('hex'),
  scope:'Retained local values only. Report/full views are not reconstructed. Missing views, unknowns and incompatible source groups are not matches. Archive origin alone does not independently prove original creator credentials. No canonical controls are supplemented.',
  timeBasis:'UTC createdAt date; dashboard cohort/calendar coverage remains America/Los_Angeles.',
  productionQueries:0,newScans:0};
}
