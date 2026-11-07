import type {AdaptedView} from './audit-master-values';
import type {P2Field,P2Sample,PersistedP2Source} from '../../apps/web/server/scans/privacy-form-audit-fields';
export type {P2Field,P2Sample,PersistedP2Source} from '../../apps/web/server/scans/privacy-form-audit-fields';
/** Retained-input audit supplement. Not a second observation or cross-view parity pass. */
export const P2_AUDIT_IDS=[
 'gpc.delivery.http_header','gpc.delivery.navigator',
 ...['california.assessment','california.coverage','rights.assessment','collection_notice.assessment','sale_sharing.assessment'].map(k=>'privacy.'+k),
 ...['input_type','semantic_category','required','state'].map(k=>'collection.field.'+k),'collection.form.action_relationship',
];
type Group={date:string;sourceView:string;schema:string;generation:string;policy:string;originProof:string;scans:number;availableScans:number;records:number;retainedRecords:number;unknownRecords:number;states:Record<string,number>;values:Record<string,number>;facets:Record<string,Record<string,number>>;coverageRate:number|null};
type Item={legacyId:string;eligibleScans:number;availableScans:number;unavailableScans:number;records:number;retainedRecords:number;unknownRecords:number;scansWithRecords:number;emptyInventoryScans:number;states:Record<string,number>;groups:Group[];aggregateRate:null;unit:string;implementation:'implemented_locally'};
const tally=(v:Record<string,number>,k:string)=>{v[k]=(v[k]??0)+1;};
// Hashes/URLs remain in the bound source receipt; group only the declared schema/policy and inventory scope.
function policy(sample:P2Sample,id:string){
 if(sample.groupPolicy)return sample.groupPolicy;
 if(id.startsWith('collection.'))return sample.qualification;
 const parts=sample.qualification.split('/');
 return parts.slice(0,id.startsWith('privacy.')||id.startsWith('gpc.')?2:1).join('/');
}
function valueLabel(value:unknown):string|undefined{
 if(typeof value==='boolean'||typeof value==='number')return String(value);
 if(typeof value==='string'&&value.length<=160)return value;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const v=value as Record<string,unknown>;
  if(typeof v.disabled==='boolean'&&typeof v.readOnly==='boolean')return `disabled=${v.disabled};readOnly=${v.readOnly}`;
  if(typeof v.status==='string'&&v.status.length<=160)return v.status;
 }
 return undefined; // Do not turn structured assessments, quotations or finding presence into a verdict.
}
export function createP2Coverage(){
 const items:Item[]=P2_AUDIT_IDS.map(legacyId=>({legacyId,eligibleScans:0,availableScans:0,unavailableScans:0,records:0,retainedRecords:0,unknownRecords:0,scansWithRecords:0,emptyInventoryScans:0,states:{},groups:[],aggregateRate:null,unit:legacyId.startsWith('collection.field.')?'field records':legacyId.startsWith('collection.form.')?'form records':'assessment records',implementation:'implemented_locally'}));
 return {add(row:{createdAt:string;originProof?:string},views:AdaptedView[],schemas:Record<string,string>,persisted?:PersistedP2Source,compact?:PersistedP2Source){
  for(const item of items){
   item.eligibleScans++;
   // Prefer the original standard packet when it has an exact reader. A missing packet never borrows a related checklist.
   const sources=[...views.filter(v=>v.view!=='audit').map(v=>({sourceView:String(v.view),schema:schemas[v.view]??'not_retained',generation:v.binding.generation,originProof:row.originProof??'unverified',fields:v.fields as P2Field[]})),...(compact?[compact]:[]),...(persisted?[persisted]:[])];
   const candidates=sources.flatMap(source=>{const field=source.fields.find(f=>f.legacyId===item.legacyId);return field?[{source,field}]:[];});
   const candidate=candidates.find(c=>c.field.samples.length||c.field.status==='invalid_or_unbound')??candidates.find(c=>!['intentional_omission','summary_only','not_projected'].includes(c.field.status));
   const samples=candidate?.field.samples??[],status=candidate?.field.status??'view_not_retained';
   const good=samples.filter(s=>s.availability==='available');
   const retained=samples.filter(s=>['available','unknown'].includes(s.availability)&&s.value!==null&&s.value!==undefined);
   item.retainedRecords+=retained.length;item.unknownRecords+=retained.filter(s=>s.availability==='unknown').length;
   if(retained.length)item.scansWithRecords++;if(samples.some(s=>s.availability==='empty_inventory'))item.emptyInventoryScans++;
   if(good.length||samples.some(s=>s.availability==='empty_inventory'))item.availableScans++;else item.unavailableScans++;
   if(!samples.length)tally(item.states,status);else for(const s of samples)tally(item.states,s.availability);
   item.records+=good.length;
   const buckets=new Map<string,P2Sample[]>();
   for(const sample of samples){const p=policy(sample,item.legacyId);buckets.set(p,[...(buckets.get(p)??[]),sample]);}
   if(!buckets.size)buckets.set('unavailable',[]);
   for(const [p,scoped] of buckets){
    const key={date:row.createdAt.slice(0,10),sourceView:candidate?.source.sourceView??'none',schema:candidate?.source.schema??'not_retained',generation:candidate?.source.generation??'not_retained',policy:p,originProof:candidate?.source.originProof??row.originProof??'unverified'};
    let g=item.groups.find(g=>Object.entries(key).every(([k,v])=>g[k as keyof Group]===v));
    if(!g){g={...key,scans:0,availableScans:0,records:0,retainedRecords:0,unknownRecords:0,states:{},values:{},facets:{},coverageRate:null};item.groups.push(g);}
    g.scans++;if(scoped.some(s=>s.availability==='available'||s.availability==='empty_inventory'))g.availableScans++;
    if(!scoped.length)tally(g.states,status);
    for(const s of scoped){tally(g.states,s.availability);if(s.availability==='available')g.records++;
     if(['available','unknown'].includes(s.availability)&&s.value!==null&&s.value!==undefined){g.retainedRecords++;if(s.availability==='unknown')g.unknownRecords++;const label=valueLabel(s.value);if(label!==undefined)tally(g.values,label);
      for(const [dimension,values] of Object.entries(s.facets??{}))for(const value of values)tally(g.facets[dimension]??={},value);
     }
    }
    g.coverageRate=g.scans?g.availableScans/g.scans:null;
   }
  }
 },finish(){return {version:'certscore.audit-p2-retained-coverage.v2',items,scope:'UTC date/source schema/policy/original-creator groups. Known-value records, explicit unknown records and verified empty inventories stay distinct. Persisted assessments are audit-only source inputs, not reconstructed customer views or parity passes. Coverage rates describe known retained values or verified empty inventories, not action success, compliance or population completeness. Field/form records are not scan counts. Aggregate rates across incompatible groups are null.',productionQueries:0,newScans:0};}};
}
