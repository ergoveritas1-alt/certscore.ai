/** V2 logical master. This is not a producer/API payload schema or a value migration. */
import {EVIDENCE_CATALOG} from './audit-evidence-catalog';
import {NORMALIZATION_REVIEW,normalizationFor} from './audit-evidence-normalization';
import {MASTER_SOURCE_REVIEW} from './audit-evidence-source-review';

const corrections:Record<string,{type:string;definition:string;nativeFields:string[];min?:number;max?:number}>={
 'gpc.delivery.verification':{type:'scoped_records',definition:'Separate bounded main-document delivery and matched paired-window delivery assessments. Historical standard/audit gpc_delivery is a compatibility series, never pooled with either scoped assessment.',nativeFields:['gpcResponse.observation.delivery','gpcResponse.comparison.delivery','gpcResponse.activityComparison']},
 'collection.field.confidence':{type:'number',min:0,max:1,definition:'Producer confidence for one retained field, numeric 0..1. It is not a string label or a probability of compliance.',nativeFields:['collectionSurfaceFieldSchema.confidence']},
 'collection.field.state':{type:'object',definition:'Preserve disabled and readOnly as independent boolean flags. A display label such as Enabled/Disabled is a projection, not a replacement for both source flags.',nativeFields:['collectionSurfaceFieldSchema.disabled','collectionSurfaceFieldSchema.readOnly']},
};
const sourceFor=(recordId:string):string[]=>{
 if(recordId==='page.technology_summary')return ['packages/certscore-contracts/src/site-metadata.ts','apps/web/components/scans/report-lab/shadow-scan-report.tsx'];
 if(recordId==='page.context')return ['apps/web/components/scans/report-lab/shadow-scan-report.tsx','apps/web/components/scans/report-lab/timeline-report-model.ts'];
 if(recordId.startsWith('technology.'))return ['packages/certscore-contracts/src/technology-inventory.ts','apps/web/server/scans/cms-security-projection.ts','apps/web/components/scans/cms-security-evidence.tsx'];
 if(recordId.startsWith('collection.'))return ['packages/certscore-contracts/src/collection-surface-form.ts','apps/web/components/scans/collection-surfaces-table.tsx'];
 if(recordId.startsWith('consent.'))return ['packages/certscore-contracts/src/consent-action-stages.ts','packages/certscore-contracts/src/terminal-consent-decision.ts'];
 if(recordId==='gpc.cmp_comparison')return ['packages/certscore-contracts/src/gpc-cmp-state-comparison.ts'];
 if(recordId==='gpc.behavioral_pair')return ['packages/certscore-contracts/src/gpc-activity-comparison.ts'];
 if(recordId.startsWith('gpc.'))return ['apps/web/lib/scans/gpc-customer-policy.ts','scripts/lib/audit-progress-contracts.ts'];
 if(recordId.startsWith('cmp.'))return ['packages/certscore-contracts/src/cmp-audit-evidence.ts','apps/web/lib/scans/cmp-audit-projection.ts'];
 if(recordId.startsWith('accessibility.'))return ['packages/certscore-api-contracts/src/accessibility-audit.ts','apps/web/lib/scans/accessibility-report.ts'];
 if(recordId.startsWith('integrity.'))return ['packages/certscore-contracts/src/site-integrity.ts','apps/web/components/scans/site-integrity-evidence.tsx'];
 if(recordId.startsWith('privacy.'))return ['packages/certscore-api-contracts/src/privacy-audit.ts','apps/web/lib/scans/california-privacy-evidence.ts','scripts/lib/audit-progress-contracts.ts'];
 if(/^(policies|policy|tracking|transport)\./.test(recordId))return ['apps/web/components/scans/report-lab/shadow-scan-report.tsx','apps/web/lib/pulse/projection.ts','scripts/lib/audit-progress-contracts.ts'];
 if(/^(audit|evidence)\./.test(recordId))return ['scripts/lib/audit-progress-contracts.ts','apps/web/lib/api-v2/report-display-export.ts'];
 throw Error('Unreviewed master record type: '+recordId);
};
const receipts=new Set<string>(MASTER_SOURCE_REVIEW.sources.map(s=>s.file));
const records=NORMALIZATION_REVIEW.proposedConcepts.map(c=>({...c,sourceReferences:sourceFor(c.id)}));
for(const record of records)for(const source of record.sourceReferences)if(!receipts.has(source))throw Error('Missing source-review receipt: '+source);
const fields=EVIDENCE_CATALOG.items.map(item=>{
 const n=normalizationFor(item.id),correction=corrections[item.id];
 const dimensionKey=Object.entries(n.dimensions).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join(',');
 return {id:n.proposedConceptId+'.'+n.field+(dimensionKey?'['+dimensionKey+']':''),legacyId:item.id,recordType:n.proposedConceptId,
  field:n.field,fixedDimensions:n.dimensions,label:item.label,definition:correction?.definition??item.definition,
  semanticKind:item.kind,layer:n.layer,valueContract:correction??{type:item.valueType,authority:'original_source_schema',nativeFields:[] as string[]},
  sourceScope:n.proposedConceptId==='gpc.cmp_comparison'?'paired_semantic_checkpoints':item.scope,legacySourceScope:item.scope,cardinality:item.cardinality,sourceBinding:item.sourceBinding,
  requiredContext:['original_source_identity_and_hash','schema_and_generation','applicable_document_session_and_time','original_assessment_or_engine_policy','record_identity_for_collection_members'],
  availabilityPolicy:'Preserve available/unknown/not_assessed/not_retained/unsupported_version/invalid_or_unbound/not_applicable separately; do not coerce omissions to zero or absence.',
  correctionFromV1:correction?{originalValueType:item.valueType,reason:correction.definition}:null,
 };
});
if(new Set(fields.map(f=>f.id)).size!==fields.length)throw Error('Master catalog field/dimension collision');
if(new Set(fields.map(f=>f.legacyId)).size!==EVIDENCE_CATALOG.items.length)throw Error('Incomplete legacy compatibility map');
const legacyMap=new Map(fields.map(f=>[f.legacyId,f]));
export function masterFieldForLegacy(id:string){const field=legacyMap.get(id);if(!field)throw Error('Unmapped legacy item: '+id);return field;}
export const MASTER_CATALOG={version:'certscore.evidence-master-catalog.v2',status:'logical_catalog_established',
 scope:'Versioned definitions and compatibility bindings for the reviewed 231 items. This does not migrate producer payloads, export schemas, retained values or audit metrics. Source schemas remain authoritative; explicit value adapters and output parity gates precede any consumer migration.',
 questionGroups:[
  {id:'gpc.delivery',title:'GPC signal delivered',primaryMetric:'gpc_delivery',recordTypes:['gpc.signal_delivery'],definition:'Usable scans with verified GPC header and navigator delivery. Delivery does not establish site processing or honoring.'},
  {id:'gpc.observed_collection',title:'Activity under GPC (all)',primaryMetric:'detail.gpc.session_collection',recordTypes:['gpc.full_visit_activity','gpc.cross_window_comparison'],definition:'Usable scans where advertising or marketing data was successfully collected during a GPC-enabled visit, whether acknowledged or not. Includes collection whose sale/sharing role is unresolved. Script downloads alone do not count.'},
  {id:'gpc.acknowledgment',title:'GPC acknowledged',primaryMetric:'detail.gpc.cmp_receipt',recordTypes:['gpc.cmp_checkpoint','gpc.response_assessment','gpc.behavioral_pair','gpc.cmp_comparison'],definition:'Usable scans with explicit CMP receipt of GPC. Missing readback is unknown, not rejection. Acknowledgment does not establish honoring. Comparison coverage remains supporting evidence.'},
  {id:'gpc.california_collection_review',title:'California-qualified activity under GPC',primaryMetric:'detail.gpc.california_collection',recordTypes:['privacy.canonical_choice_result','gpc.full_visit_activity'],definition:'Usable scans with a recorded California review finding for collection under GPC. This narrower subset requires supported sale/sharing-related activity, such as identifier syncing or audience collection, plus the retained policy’s evidence and processing checks. Historical policy versions remain separate. Neutral records and acknowledgment-only contradictions do not count. Missing assessment remains unavailable.'},
 ],
 presentationRevision:'gpc_four_questions.v2-aligned',
 records:records.map(record=>({...record,fieldIds:fields.filter(f=>f.recordType===record.id).map(f=>f.id)})),fields,
 compatibility:{version:'certscore.evidence-master-compatibility.v1',from:EVIDENCE_CATALOG.version,allLegacyIdsPreserved:true,rewrittenHistoricalValues:0,
  entries:fields.map(f=>({legacyId:f.legacyId,masterFieldId:f.id,recordType:f.recordType,field:f.field,fixedDimensions:f.fixedDimensions}))},
 sourceReview:MASTER_SOURCE_REVIEW,
 resolutions:[
  {id:'page_technology_aliases',outcome:'keep_separate',itemIds:['page.platform','page.version','technology.detection.product','technology.detection.version'],reason:'Page summaries can combine generator names and map conflicting versions to Unknown. Technology detections carry distinct scope/confidence/evidence and explicit conflicts. No unconditional alias or deletion is sound.'},
  {id:'industry_context',outcome:'retain_context',itemIds:['page.industry'],reason:'Existing benchmark display consumes report.scan.benchmark. Industry remains page context, not an observed risk fact; no removal is needed.'},
  {id:'field_confidence',outcome:'correct_logical_type',itemIds:['collection.field.confidence'],reason:'The native field schema specifies number 0..1; legacy catalog text typing is retained only in the compatibility definition.'},
  {id:'cmp_checkpoint_scope',outcome:'separate_semantic_scope',itemIds:EVIDENCE_CATALOG.items.filter(i=>i.id.startsWith('gpc.cmp_pair.')).map(i=>i.id),reason:'CMP snapshots use paired semantic checkpoints, not the matched behavioral request window. Retain each arm’s read time, document scope and source hash.'},
  {id:'field_state',outcome:'preserve_components',itemIds:['collection.field.state'],reason:'The report state label combines disabled/readOnly. The v2 logical field preserves both booleans as a composite; it cannot collapse one into the other.'},
 ],
 outputMigration:{report:'not_migrated',standard:'not_migrated',full:'not_migrated',audit:'catalog_metadata_only'},
 nextGates:['Build explicit source-version-aware value adapters; reject missing identity, source mismatch and conflicting generations.','Verify field-level parity for all four output projections, including intentional omissions and partial coverage.','Preserve prior API versions and legacy IDs when introducing new output contracts.'],
};
