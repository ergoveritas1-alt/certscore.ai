/** Re-read immutable inputs; aggregation parity alone cannot detect incorrect row extraction. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {parseCanonicalEvidenceArtifact} from '@certscore/contracts/dist/canonical-evidence-artifact.js';
import {extractExportRow} from './audit-progress-export';
import {applyChoiceSummary,choiceSummaryFromRecord,choiceMetricRegistry} from './audit-progress-choice';
import {applyRetainedOptOutExtracts} from './audit-progress-opt-out';
import {CONTROL_ACCESSIBILITY_KEYS,isControlAccessibilityExtract,readControlAccessibilityDetail} from './audit-progress-control-accessibility';
import {checklistEvidence,returnedState} from './audit-progress-contracts';
import {localDay,type ProgressRow} from './audit-progress';
const choiceKey=(k:string)=>k.startsWith('sealed.opt_out.')||k.startsWith('sealed.choice_finding.')||
 k.startsWith('sealed.terminal.audit_')||k.startsWith('sealed.choice_evidence.')||k.startsWith('sealed.operations.')||k.startsWith('sealed.priority_evidence.');
type ChoiceInput={rows:ProgressRow[];optOutExtracts:any[];metrics?:{id:string}[];days?:{date:string}[]};
export function rebuildChoiceEvidence(data:ChoiceInput){
 const currentDay=data.days?.at(-1)?.date;
 const activityKeys=['accept','reject'].filter(action=>data.metrics?.some(m=>m.id===`detail.${action}.activity_all`))
  .flatMap(action=>[`click.${action}`,`detail.${action}.verdict`]);
 const cmpKeys=data.metrics?.filter(m=>m.id.startsWith('customer_cmp_check.')).map(m=>m.id)??[];
 if(cmpKeys.length)cmpKeys.push('checklist.consent_optional_defaults_on');
 const proof=structuredClone(data.rows);let exports=0,summaries=0,comparisons=0;
 const bytes=(ref:{file:string;sha256:string})=>{const b=readFileSync(ref.file);assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256,'Choice evidence source hash');return b;};
 const read=(ref:{file:string;sha256:string})=>JSON.parse(bytes(ref).toString('utf8'));
 for(const row of proof){
  const ref=row.refs.find(r=>r.role==='checksum_verified_persisted_report_generation')??row.refs.find(r=>r.role==='checksum_verified_projection');
  delete row.controlAccessibilityCoverage;
  delete row.optOutRejection;
  for(const key of CONTROL_ACCESSIBILITY_KEYS)if(!ref||isControlAccessibilityExtract(row.metricSources?.[key])){
   delete row.states[key];delete row.metricSources?.[key];
  }
  for(const key of Object.keys(row.states))if(choiceKey(key)){delete row.states[key];delete row.metricSources?.[key];}
  row.retainedMetricLabels={};
  for(const key of Object.keys(row.measurements??{}))if(choiceKey(key))delete row.measurements![key];
  const exportRef=row.refs.find(r=>r.role==='hash_verified_bot_archive_export');
  if(exportRef&&row.reportable){
   const expected=extractExportRow(read(exportRef),exportRef);assert.equal(expected.scanId,row.scanId);
   for(const [key,value]of Object.entries(expected.states))if(key.includes('gpc')){assert.equal(row.states[key],value,`GPC source state ${row.scanId}/${key}`);comparisons++;}
   for(const key of new Set([...Object.keys(expected.measurements??{}),...Object.keys(row.measurements??{})]))if(key.startsWith('gpc.')){
    assert.equal(row.measurements?.[key],expected.measurements?.[key],`GPC source quantity ${row.scanId}/${key}`);comparisons++;
   }
   for(const key of activityKeys){
    assert.equal(row.states[key],expected.states[key],`Post-click activity source state ${row.scanId}/${key}`);comparisons++;
   }
   assert.deepEqual(row.cookieDeclarationCounts,expected.cookieDeclarationCounts,`Cookie comparison source counts ${row.scanId}`);
   comparisons++;
   for(const key of cmpKeys){
    const packetSource=(source:string|undefined)=>source?.includes('/certscore.customer-consent-evidence.v1/');
    const source=row.metricSources?.[key],expectedSource=expected.metricSources?.[key];
    if(!packetSource(source)&&!(packetSource(expectedSource)&&localDay(row.createdAt)===currentDay))continue;
    assert.equal(row.states[key],expected.states[key],`Public CMP source state ${row.scanId}/${key}`);
    assert.equal(source,expectedSource,`Public CMP source scope ${row.scanId}/${key}`);
    comparisons++;
   }
   exports++;
  }
  if(!row.reportable)continue;
  if(ref){
   const input=read(ref),snapshot=ref.role==='checksum_verified_projection'?input:input.snapshot;
   assert.ok(!row.publicProjectionSourceHash||snapshot.report_projection_source_hash===row.publicProjectionSourceHash,'Choice source generation');
   const record=typeof snapshot.report_projection_payload==='string'?JSON.parse(snapshot.report_projection_payload):snapshot.report_projection_payload;
   assert.equal(record.scan.id,row.scanId,'Choice source scan identity');
   const originalCheck=record.canonicalReportProjection?.checklistRows?.find((entry:any)=>entry.id==='accessibility_consent_controls');
   row.controlAccessibilityCoverage=readControlAccessibilityDetail(originalCheck?.criticalEvidence?.retainedEvidence?.controlAccessibilityReceipt);
   const originalValues=[checklistEvidence(originalCheck),returnedState(originalCheck?.status)];
   for(const [index,key] of CONTROL_ACCESSIBILITY_KEYS.entries())if(row.states[key]!==undefined&&row.states[key]!=='unavailable'){
    assert.equal(row.states[key],originalValues[index],`Retained control accessibility ${row.scanId}/${key}`);comparisons++;
   }
   let bundleSource:{sha256:string;sizeBytes:number}|undefined;
   const original=(role:string)=>{
    const ref=row.refs.find(r=>r.role===role);if(!ref)return undefined;
    const retained=bytes(ref);
    if(role==='scanArtifactUri')bundleSource={sha256:ref.sha256,sizeBytes:retained.length};
    const value=role==='scanArtifactUri'?parseCanonicalEvidenceArtifact(retained):JSON.parse(retained.toString('utf8'));
    assert.equal((value as {scanId?:string}).scanId,row.scanId,'Choice artifact scan identity');return value;
   };
   const manifest=original('manifestUri'),bundle=original('scanArtifactUri');
   applyChoiceSummary(row,choiceSummaryFromRecord(record,{manifest,bundle,bundleSource}),`persisted_report_choice_summary/${row.projectionVersion}`);summaries++;
  }
 }
 applyRetainedOptOutExtracts(proof,data.optOutExtracts);choiceMetricRegistry(proof);
 return {rows:proof,exports,summaries,comparisons};
}
export function verifyChoiceEvidence(data:ChoiceInput){
 const rebuilt=rebuildChoiceEvidence(data);
 for(let i=0;i<data.rows.length;i++)assert.deepEqual(data.rows[i]!.optOutRejection,rebuilt.rows[i]!.optOutRejection,`Opt-out rejection receipt ${data.rows[i]!.scanId}`);
 for(let i=0;i<data.rows.length;i++)assert.deepEqual(data.rows[i]!.controlAccessibilityCoverage,rebuilt.rows[i]!.controlAccessibilityCoverage,`Control coverage receipt ${data.rows[i]!.scanId}`);const proof=rebuilt.rows;let {exports,summaries,comparisons}=rebuilt;
 for(let i=0;i<proof.length;i++)for(const key of new Set([...Object.keys(proof[i]!.states),...Object.keys(data.rows[i]!.states)]))if(choiceKey(key)){
  // Missing and explicit unavailable are the same coverage state, never zero or success.
  assert.equal(data.rows[i]!.states[key]??'unavailable',proof[i]!.states[key]??'unavailable',`Choice source state ${proof[i]!.scanId}/${key}`);comparisons++;
  if((key.startsWith('sealed.operations.')||key==='sealed.priority_evidence.cmp')&&proof[i]!.states[key]){
   assert.equal(data.rows[i]!.metricSources?.[key],proof[i]!.metricSources?.[key],`Choice evidence source scope ${proof[i]!.scanId}/${key}`);comparisons++;
  }
 }
 for(let i=0;i<proof.length;i++)for(const key of new Set([...Object.keys(proof[i]!.measurements??{}),...Object.keys(data.rows[i]!.measurements??{})]))if(choiceKey(key)){
  assert.equal(data.rows[i]!.measurements?.[key],proof[i]!.measurements?.[key],`Choice source quantity ${proof[i]!.scanId}/${key}`);comparisons++;
 }
 for(const [index,row] of proof.entries())for(const key of CONTROL_ACCESSIBILITY_KEYS){
  const actual=data.rows[index]!;
  assert.equal(actual.states[key]??'unavailable',row.states[key]??'unavailable',`Control accessibility source state ${row.scanId}/${key}`);comparisons++;
  if(isControlAccessibilityExtract(row.metricSources?.[key])||isControlAccessibilityExtract(actual.metricSources?.[key])){
   assert.equal(actual.metricSources?.[key],row.metricSources?.[key],`Control accessibility source scope ${row.scanId}/${key}`);comparisons++;
  }
 }
 return {exports,summaries,comparisons,sourceMismatchCount:0};
}
