import {REPORT_FORMAT_POLICY,reportFormatsFor} from './audit-report-formats';
import {MASTER_VALUE_MAPPINGS,mappingFor} from './audit-master-value-mappings';
import {MASTER_CATALOG,masterFieldForLegacy} from './audit-evidence-master-catalog';
import {NORMALIZATION_REVIEW,normalizationFor} from './audit-evidence-normalization';
import {COVERAGE_REVIEW,coverageReviewSummary,itemValueReview,reviewView,EVIDENCE_VIEWS} from './audit-evidence-review';
import {COVERAGE_MAP} from './audit-progress-coverage';
import {COVERAGE_SOURCE_NOTES} from './audit-evidence-output-notes';
import {EVIDENCE_CATALOG,CATALOG_VIEW_BINDINGS,type EvidenceView,type Representation} from './audit-evidence-catalog';

const labels:Record<Representation,string>={detailed:'Detailed',summarized:'Summarized',derived:'Derived',referenced:'Referenced',omitted:'Omitted'};
const notes=new Map(COVERAGE_SOURCE_NOTES.map(n=>[n.key,n]));
const definitions=new Map(EVIDENCE_CATALOG.items.map(i=>[i.id,i]));
const baseRepresented=CATALOG_VIEW_BINDINGS.map(binding=>{
 const item=definitions.get(binding.itemId),note=notes.get(binding.sourceNoteKey);
 if(!item||!note)throw Error('Unmapped catalog binding: '+binding.itemId);
 const area=COVERAGE_MAP.find(a=>a.id===note.areaId)!;
 const cell=(view:EvidenceView)=>{
  const original=note[view];
  let representation:Representation=binding.representations[view]??'summarized';
  if(original.status==='Not included'||original.status==='Not tabulated')representation='omitted';
  if(view==='audit'){
   representation=binding.auditBasis==='none'?'omitted':binding.auditBasis==='operational_receipt'?'referenced':binding.metricRelationship==='related'?'summarized':'derived';
   if(binding.representations.audit)representation=binding.representations.audit;
  }
  const route=mappingFor(item.id).views[view];
  if(view==='report'&&item.id==='gpc.pair.baseline_opportunity')representation='summarized';
  if(route.mode==='retained_aggregate')representation='derived';
  if(route.mode==='context')representation='referenced';
  if(view==='audit'&&route.mode==='native')representation='detailed';
  const conditions=original.status==='Conditional'?'Report focus, layout and retained evidence':original.status==='Version dependent'?'Source version and retained schema':original.status==='Partial'?'Only the described subset or summary':null;
  const detail=route.mode==='retained_aggregate'||route.mode==='context'||(view==='audit'&&route.mode==='native')?route.reason:
   view==='audit'&&binding.auditBasis==='none'?'No dedicated daily item binding is registered. Related group-level coverage does not establish this item’s availability.':
   view==='audit'&&binding.metricRelationship==='related'?'Related measure only; it is not an exact substitute for this item. '+original.detail:original.detail;
  return {status:labels[representation],representation,conditions,detail};
 };
 return {id:item.id,canonicalId:item.id,item:item.label,subject:item.subject,kind:item.kind,definition:item.definition,valueType:item.valueType,scope:item.scope,
  cardinality:item.cardinality,sourceBinding:item.sourceBinding,availability:'not_evaluated_in_catalog_view' as const,
  sourceNoteKey:binding.sourceNoteKey,sourceAreaId:note.areaId,auditSupplement:area.kind==='audit_only',
  report:cell('report'),standard:cell('standard'),full:cell('full'),audit:cell('audit'),metricIds:binding.metricIds,metricRelationship:binding.metricRelationship};
});
const represented=baseRepresented.map(item=>({...item,reportFormats:reportFormatsFor(item.canonicalId,item.report.representation),valueMapping:mappingFor(item.canonicalId),masterField:masterFieldForLegacy(item.canonicalId),normalization:normalizationFor(item.canonicalId),valueReview:itemValueReview(item.canonicalId),viewReview:Object.fromEntries(EVIDENCE_VIEWS.map(view=>[view,reviewView(item,view)]))}));
if(new Set(represented.map(i=>i.id)).size!==represented.length)throw Error('Catalog item mapped more than once');
if(definitions.size!==represented.length)throw Error('Catalog item missing an output binding');
for(const key of notes.keys())if(!CATALOG_VIEW_BINDINGS.some(b=>b.sourceNoteKey===key))throw Error('Original coverage topic lost: '+key);
export const COVERAGE_MATRIX={
 version:'certscore.audit-coverage-matrix.v2',catalog:EVIDENCE_CATALOG,
 reportFormats:REPORT_FORMAT_POLICY,
 normalizationReview:NORMALIZATION_REVIEW,
 masterCatalog:{...MASTER_CATALOG,reportFormats:REPORT_FORMAT_POLICY,valueMappings:MASTER_VALUE_MAPPINGS,viewBindings:represented.map(item=>({legacyId:item.canonicalId,reportFormats:item.reportFormats,masterFieldId:item.masterField.id,metricIds:item.metricIds,metricRelationship:item.metricRelationship,sourceNoteKey:item.sourceNoteKey,views:Object.fromEntries(EVIDENCE_VIEWS.map(view=>[view,item[view]])),status:'capability_mapping_only'}))},
 concepts:NORMALIZATION_REVIEW.proposedConcepts.map(c=>({id:c.id,title:c.title,kind:c.layer,visibility:'Proposed '+c.layer+' record type · '+c.reason,items:represented.filter(i=>c.itemIds.includes(i.canonicalId))})),
 review:{...COVERAGE_REVIEW,views:coverageReviewSummary(baseRepresented)},
 basis:'Canonical domain → subject → item. Representation describes each output; per-scan availability is a separate source-bound dimension and is not evaluated in this catalog view.',
 standard:'Standard SDK Evidence JSON: pulse.evidence(scanId), detail=evidence. This is the public evidence file saved by the Mac mini scan bot. Bounded customerConsentEvidence v1 is implemented locally, not deployed; historical files do not acquire its criteria or provenance.',
 full:'Full evidence v2 is implemented locally, not deployed: unchanged standard SDK evidence plus both regulatory report evidence views, with parity and component-hash checks. Historical full files remain focus-filtered report-display projections; the item cells below describe that legacy contract until retained v2 files establish coverage.',
 audit:'Daily audit views use verified standard exports, retained reports and bounded summaries. Derived measures or references do not imply that a particular scan has usable evidence.',
 migration:{originalTopics:COVERAGE_SOURCE_NOTES.length,canonicalItems:represented.length,unmappedTopics:0},
 domains:EVIDENCE_CATALOG.domains.map(domain=>({id:domain.id,kind:domain.id==='operations'?'audit_only':'evidence_domain',title:domain.label,
  visibility:domain.id==='operations'?'Audit operations and provenance are separate from observed site evidence.':'Canonical subjects are independent of report-box names and file layout.',
  items:represented.filter(i=>definitions.get(i.id)!.domain===domain.id)})),
 areas:COVERAGE_MAP.map(area=>({id:area.id,kind:area.kind,title:area.box,visibility:'visibility' in area?area.visibility:area.report,
  items:represented.filter(i=>i.sourceAreaId===area.id)})),
};
