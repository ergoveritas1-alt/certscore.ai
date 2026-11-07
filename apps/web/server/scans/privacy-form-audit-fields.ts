/** Pure extraction shared by the report writer and retained audit tools. */
import {createHash} from 'node:crypto';
import {consentControlAssessmentSchema,collectionSurfaceAssessmentSchema} from '@certscore/contracts';

export type P2Sample = {
  recordKey: string;
  value: unknown;
  qualification: string;
  availability: string;
  comparisonScope?: string;
  groupPolicy?: string;
  facets?: Record<string, string[]>;
};
export type P2Field = {legacyId: string; status: string; samples: P2Sample[]};
export type PersistedP2Source = {
  sourceView: 'persisted_assessment';
  schema: string;
  generation: string;
  originProof: 'original_credential_verified';
  fields: P2Field[];
};

const digest=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const stablePrivacyFormJson=(v:unknown)=>JSON.stringify(stable(v??null));
const privacyFields:Record<string,string>={'privacy.california.assessment':'','privacy.california.coverage':'reviewCoverage','privacy.rights.assessment':'rightsAssessment','privacy.collection_notice.assessment':'collectionNoticeAssessment','privacy.sale_sharing.assessment':'saleSharingAssessment'};
export const PERSISTED_P2_IDS=[...Object.keys(privacyFields),...['input_type','semantic_category','required','state'].map(k=>'collection.field.'+k),'collection.form.action_relationship'];
function facets(id:string,v:any):Record<string,string[]>{
 const out:Record<string,string[]>={};
 const add=(key:string,value:unknown)=>{if(typeof value==='string'||typeof value==='boolean')out[key]=[...(out[key]??[]),String(value)];};
 if(id==='privacy.california.assessment'){add('choiceSurface',v.choiceSurface);add('optOutEffectiveness',v.optOutEffectiveness);}
 if(id==='privacy.california.coverage'){
  add('runtimeCoverage',v.runtimeCoverage);
  for(const key of ['policyTextComplete','choiceInventoryComplete','collectionInventoryComplete'])add('captureCoverage.'+key,v.captureCoverage?.[key]);
  for(const family of v.families??[])for(const key of ['status','assessmentState','followUp'])add('family.'+family.id+'.'+key,family[key]);
 }
 if(id==='privacy.rights.assessment'||id==='privacy.sale_sharing.assessment')for(const topic of v.topics??[])add('topic.'+topic.topic+'.status',topic.status);
 if(id==='privacy.collection_notice.assessment'){
  add('inventoryComplete',v.inventoryComplete);
  // Each point is a retained record. These facet counts are not scan denominators.
  for(const point of v.points??[])for(const key of ['status','assessmentScope','categoryMatch','purposeMatch','purposeBasis'])add('point.'+key,point[key]);
 }
 return out;
}

/** Pure typed extraction. The caller must verify original source and generation receipts first. */
export function persistedP2Fields(payload:any,scanId:string,bundleHash:string):{fields:P2Field[];valueDigest:string}{
 const s=payload.snapshot??{},raw=s.consentControlAssessment??s.consent_control_assessment;
 if(s.consentControlAssessment&&s.consent_control_assessment&&stablePrivacyFormJson(s.consentControlAssessment)!==stablePrivacyFormJson(s.consent_control_assessment))throw Error('Conflicting generation-bound consent assessments');
 const consent=consentControlAssessmentSchema.safeParse(raw),ca=consent.success?consent.data.californiaPrivacyReview:null;
 if(consent.success&&consent.data.scan.scanId!==scanId)throw Error('P2 consent scan mismatch');
 if(ca&&ca.sourceHash!==bundleHash)throw Error('P2 California original source mismatch');
 const fields:P2Field[]=Object.entries(privacyFields).map(([legacyId,key])=>{
  const value=ca?(key?(ca as any)[key]:ca):undefined;
  const groupPolicy=ca?[ca.contractVersion,ca.policyVersion,value?.contractVersion??'parent_assessment',value?.sourceCoverage?.policyVersion??'original_scope'].join('/'):'unavailable';
  return {legacyId,status:raw&&!consent.success?'invalid_or_unbound':'not_retained',samples:value?[{recordKey:'assessment',value,qualification:groupPolicy+'/'+ca!.sourceHash,groupPolicy,availability:'available',facets:facets(legacyId,value)}]:[]};
 });
 const rawForms=payload.canonicalReportProjection?.collectionSurfaceAssessment;
 const parsed=collectionSurfaceAssessmentSchema.safeParse(rawForms),f=parsed.success?parsed.data:null;
 if(f&&(f.scanId!==scanId||new Set(f.forms.map(x=>x.formRef)).size!==f.forms.length||f.forms.some(form=>form.pageUrl!==f.pageUrl||new Set(form.fields.map(x=>x.fieldRef)).size!==form.fields.length)))throw Error('P2 form identity mismatch');
 // A not-testable assessment can retain source inventory counters while withholding
 // all projected forms. Its counters cannot establish an empty measured inventory.
 if(f?.coverage&&f.assessmentStatus!=='not_testable'&&(f.coverage.retainedFormCount!==f.forms.length||f.coverage.retainedFieldCount!==f.forms.reduce((n,form)=>n+form.fields.length,0)))throw Error('P2 form coverage count mismatch');
 const usable=!!f&&f.assessmentStatus!=='not_testable'&&!!f.sourceHash&&!!f.sourceInventoryContractVersion;
 const empty=usable&&f!.assessmentStatus==='not_observed'&&f!.forms.length===0&&f!.coverage?.status==='complete'&&f!.coverage.candidateFormCount===0&&f!.coverage.candidateFieldCount===0&&!f!.coverage.retentionTruncated&&!f!.coverage.candidateScanTruncated;
 const scope=f?[f.contractVersion,'initial_passive_main_document',f.sourceInventoryContractVersion??'unavailable',stablePrivacyFormJson({assessmentStatus:f.assessmentStatus,coverage:f.coverage,limitations:f.limitationKeys})].join('/'):'unavailable';
 for(const legacyId of PERSISTED_P2_IDS.filter(id=>id.startsWith('collection.'))){
  const samples:P2Sample[]=[];
  if(empty)samples.push({recordKey:'@inventory',value:[],qualification:scope,groupPolicy:scope,availability:'empty_inventory'});
  else if(usable)for(const form of f!.forms){
   const groupPolicy=scope+'/'+stablePrivacyFormJson({candidateFields:form.candidateFieldCount,retainedFields:form.retainedFieldCount,truncated:form.fieldsTruncated});
   const add=(recordKey:string,value:unknown)=>samples.push({recordKey,value,qualification:groupPolicy,groupPolicy,availability:value==='unknown'?'unknown':'available'});
   const prefix=f!.sourceHash+'/'+form.formRef;
   if(legacyId==='collection.form.action_relationship')add(prefix,form.actionRelationship);
   else for(const field of form.fields){const key=legacyId.split('.').at(-1)!;add(prefix+'/'+field.fieldRef,key==='state'?{disabled:field.disabled,readOnly:field.readOnly}:key==='input_type'?field.inputType:key==='semantic_category'?field.semanticCategory:field.required);}
  }
  fields.push({legacyId,status:rawForms&&!parsed.success?'invalid_or_unbound':f?.assessmentStatus==='not_testable'?'not_testable':f&&!usable?'source_binding_unavailable':f?'limited_or_empty_inventory':'not_retained',samples});
 }
 return {fields,valueDigest:digest(stablePrivacyFormJson([raw??null,rawForms??null]))};
}
