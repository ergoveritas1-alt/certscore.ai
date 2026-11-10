import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPolicyProvenanceSchema,buildAuditPolicyProvenance,POLICY_SUPPLEMENT_DISPOSITION,TRANSFER_FRAMEWORK_REASON} from '../../packages/certscore-contracts/src/audit-policy-provenance';
import {choiceSummaryAudit,choiceSummaryFromRecord} from './audit-progress-choice';
import {jsonbBytes} from './audit-progress-priority-evidence';
import {operationsEvidenceStates} from './audit-progress-operations-evidence';

export const scanId='11111111-1111-4111-8111-111111111111', digest='a'.repeat(64);
const timestamp='2026-11-06T09:00:00.000Z';
export function operationsFixture(){
 const meta={sha256:digest,sizeBytes:2000};
 const document={documentFetchState:'fetched',documentEvaluationState:'usable',documentRole:'policy_document',
  targetRelationship:'target_controller',documentFormat:'html',extractionStatus:'complete',artifactVerificationStatus:'verified',
  artifactSha256:digest,retainedTextSha256:digest,artifactSizeBytes:102,retainedTextChars:100,
  documentTextCoverage:{status:'complete',sourceTextChars:100,retainedTextChars:100}};
 return {scan:{id:scanId,status:'completed',createdAt:timestamp},snapshot:{consentControlAssessment:{scan:{noGo:false}}},
  runtimeArtifacts:{policy_disclosure_summary:{policySurfaceAdmissionVersion:'target_policy_surfaces.v1',
   retainedPrivacyPolicyTextExcerpt:'PRIVATE POLICY TEXT',
   discoveredPrivacyPolicyDetails:[{documentFetchState:'failed',url:'https://example.invalid/policy'}],
   policyTextEvidenceProjection:{contractVersion:'certscore.policy-text-evidence-projection.v1',scanId,projectionStatus:'verified_complete',
    sourceBundle:{...meta,verificationStatus:'verified'},documents:[document]}}},
  events:[{eventType:'v2_lambda_result.received',metadataJson:{
   parentDispatchSha256:digest,artifactVerification:{verifiedAt:timestamp,manifest:{...meta},scanArtifact:{...meta}},
   artifactMetadata:{scanArtifactUri:{...meta},manifestUri:{...meta}},
   lambdaLaneTimingSummary:{contractVersion:'certscore.v2.lambda-lane-timing.v1',
    cmpPreferenceInspection:{status:'joined',startedAt:timestamp,completedAt:'2026-11-06T09:00:01.000Z'}}}}],
 };
}
const read=(fixture:ReturnType<typeof operationsFixture>)=>choiceSummaryAudit(choiceSummaryFromRecord(fixture),scanId).states;
const key=(v:string)=>'sealed.operations.'+v;

test('bound documents resolve fetch, producer ownership and text receipt independently',()=>{
 const f=operationsFixture(),s=read(f);
 assert.equal(s[key('policy_fetch')],'fetched');
 assert.equal(s[key('policy_owner')],'producer_declared_usable');
 assert.equal(s[key('policy_text_receipt')],'producer_verified_complete_receipt');
 assert.equal(s['sealed.policy_full_text'],undefined);
 assert.doesNotMatch(JSON.stringify(choiceSummaryFromRecord(f)),/PRIVATE POLICY TEXT|example\.invalid/);
 const p=f.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection;
 p.documents[0]!.targetRelationship='service_provider';p.documents[0]!.documentTextCoverage.sourceTextChars=101;
 const limited=read(f);
 assert.equal(limited[key('policy_fetch')],'fetched');
 assert.equal(limited[key('policy_owner')],'no_qualifying_candidate_in_projection');
 assert.equal(limited[key('policy_text_receipt')],'producer_verified_limited_receipt');
 p.documents=[];
 assert.equal(read(f)[key('policy_fetch')],'recorded_fetch_failure');
 f.runtimeArtifacts.policy_disclosure_summary.discoveredPrivacyPolicyDetails=[];
 assert.equal(read(f)[key('policy_fetch')],'no_attempt_in_returned_candidates');
});

test('changed or ambiguous generation and oversized or malformed collections cannot qualify',()=>{
 const f=operationsFixture(),p=f.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection;
 p.sourceBundle.sha256='b'.repeat(64);
 assert.equal(read(f)[key('policy_fetch')],undefined);
 p.sourceBundle.sha256=digest;p.scanId='another scan';
 assert.equal(read(f)[key('policy_owner')],undefined);
 p.scanId=scanId;p.documents=Array.from({length:17},()=>p.documents[0]!);
 assert.equal(read(f)[key('policy_text_receipt')],undefined);
 f.events.push(f.events[0]!);
 assert.equal(read(f)[key('cmp_coordinator')],undefined);
});

test('CMP coordinator proof distinguishes joined, limited, absent and unbound attempts',()=>{
 const f=operationsFixture(),m=f.events[0]!.metadataJson;
 assert.equal(read(f)[key('cmp_coordinator')],'worker_result_joined');
 m.lambdaLaneTimingSummary.cmpPreferenceInspection.status='limited';
 assert.equal(read(f)[key('cmp_coordinator')],'coordinator_attempt_limited');
 m.artifactMetadata.manifestUri.sha256='b'.repeat(64);
 assert.equal(read(f)[key('cmp_coordinator')],undefined);
 m.artifactMetadata.manifestUri.sha256=digest;
 m.lambdaLaneTimingSummary.cmpPreferenceInspection.completedAt='2026-11-06T08:00:00.000Z';
 assert.equal(read(f)[key('cmp_coordinator')],undefined);
});

test('compact policy receipts preserve legacy states and reject mismatched scan, time and generation',()=>{
 const fixture=operationsFixture(),generation='scan-report-projection-v27';
 const compact=buildAuditPolicyProvenance(fixture,generation,digest);
 assert.ok(compact);
 const {binding}=compact;
 const summary={...choiceSummaryFromRecord(fixture),operationsEvidence:compact};
 assert.ok(Buffer.byteLength(JSON.stringify(compact))<=512);
 assert.doesNotMatch(JSON.stringify(compact),/PRIVATE POLICY TEXT|example\.invalid|cmpPreferenceInspection/);
 const compactStates=choiceSummaryAudit(summary,scanId,binding).states;
 for(const id of ['policy_fetch','policy_owner','policy_text_receipt'])assert.equal(compactStates[key(id)],read(fixture)[key(id)]);
 assert.equal(compactStates[key('cmp_coordinator')],undefined);
 assert.equal(choiceSummaryAudit(summary,scanId).states[key('policy_owner')],undefined);
 for(const bad of [{sourceHash:'f'.repeat(64)},{createdAt:'2026-11-06T09:00:00.001Z'},
  {scanId:'22222222-2222-4222-8222-222222222222'},{generation:'scan-report-projection-v26'}]){
  const badSummary:unknown={...summary,operationsEvidence:{...compact,binding:{...binding,...bad}}};
  assert.equal(choiceSummaryAudit(badSummary,scanId,binding).states[key('policy_owner')],undefined);
 }
 fixture.events.push(fixture.events[0]!);
 assert.equal(buildAuditPolicyProvenance(fixture,generation,digest),undefined);
});

test('transfer assessment only uses explicit bound results and preserves the SQL receipt cap',()=>{
 const f=operationsFixture();
 const policy=f.runtimeArtifacts.policy_disclosure_summary;
 const check={version:'certscore.transfer-framework-assessment.v1',matcher:'outdated_transfer_disclosure.v1',
  status:'checked_no_signal',checkedDocumentIndexes:[0],signalDocumentIndex:null};
 const gen='scan-report-projection-v27',metric=key('transfer_framework_check');
 const reasonMetric=key('transfer_framework_reasons');
 const historical=buildAuditPolicyProvenance(f,gen,digest)!;
 assert.equal(operationsEvidenceStates(historical,scanId,historical.binding)[metric],undefined);
 const fresh={...f,runtimeArtifacts:{policy_disclosure_summary:{...policy,transferFrameworkAssessment:check as unknown}}};
 const compact=buildAuditPolicyProvenance(fresh,gen,digest)!;
 assert.equal(compact.t,0);
 assert.equal(operationsEvidenceStates(compact,scanId,compact.binding)[metric]?.value,'checked_no_signal');
 assert.equal(operationsEvidenceStates(compact,scanId,compact.binding)[reasonMetric],undefined);
 assert.equal(operationsEvidenceStates(compact,scanId,{...compact.binding,sourceHash:'b'.repeat(64)})[metric],undefined);
 const maxMask=Object.values(TRANSFER_FRAMEWORK_REASON).reduce((mask,bit)=>mask|bit,0);
 const largest=auditPolicyProvenanceSchema.parse({...compact,fetch:'no_attempt_in_returned_candidates',
  owner:0,text:'producer_verified_complete_receipt',t:5,r:maxMask,
  s:Object.values(POLICY_SUPPLEMENT_DISPOSITION).reduce((mask,bit)=>mask|bit,0)});
 assert.ok(jsonbBytes(largest)<=512);
 assert.equal(jsonbBytes(largest),492);
 for(const reason of ['document_text_below_minimum','document_extraction_coverage_incomplete','document_content_scope_incomplete'] as const){
  const r=TRANSFER_FRAMEWORK_REASON[reason];
  const split=auditPolicyProvenanceSchema.parse({...compact,owner:1,t:3,r});
  assert.equal(operationsEvidenceStates(split,scanId,split.binding)[reasonMetric]?.value,'reason_mask_'+r);
 }
 assert.equal(auditPolicyProvenanceSchema.safeParse({...largest,r:TRANSFER_FRAMEWORK_REASON.matcher_limit}).success,false);
 assert.equal(auditPolicyProvenanceSchema.safeParse({...compact,r:1}).success,false);
 assert.equal(auditPolicyProvenanceSchema.safeParse({...historical,r:1}).success,false);
 assert.equal(auditPolicyProvenanceSchema.safeParse({...largest,r:maxMask+1}).success,false);
 for(const patch of [{checkedDocumentIndexes:[1]},{checkedDocumentIndexes:[]},{checkedDocumentIndexes:[0,0]},
  {status:'checked_review_signal'},{signalDocumentIndex:0},{matcher:'unsupported'}]){
  fresh.runtimeArtifacts.policy_disclosure_summary.transferFrameworkAssessment={...check,...patch};
  const invalid=buildAuditPolicyProvenance(fresh,gen,digest)!;
  assert.equal(invalid.t,undefined);
  assert.equal(invalid.text,compact.text);
 }
 fresh.runtimeArtifacts.policy_disclosure_summary.transferFrameworkAssessment={...check,reasonMask:0};
 const complete=buildAuditPolicyProvenance(fresh,gen,digest)!;
 assert.equal(complete.owner,1);
 assert.equal(operationsEvidenceStates(complete,scanId,complete.binding)[reasonMetric]?.value,'reason_mask_0');
 assert.equal(operationsEvidenceStates(complete,scanId,complete.binding)[key('policy_owner')]?.value,compact.owner);
 const reasonMask=TRANSFER_FRAMEWORK_REASON.policy_evidence_lane_degraded|TRANSFER_FRAMEWORK_REASON.unresolved_material_policy_supplements;
 const supplementMask=POLICY_SUPPLEMENT_DISPOSITION.skipped_budget|POLICY_SUPPLEMENT_DISPOSITION.fetched_without_eligible_match;
 fresh.runtimeArtifacts.policy_disclosure_summary.transferFrameworkAssessment={...check,status:'partial_review_signal',signalDocumentIndex:0,reasonMask,supplementMask};
 const partial=buildAuditPolicyProvenance(fresh,gen,digest)!;
 assert.equal(operationsEvidenceStates(partial,scanId,partial.binding)[metric]?.value,'partial_review_signal');
 assert.equal(partial.r,reasonMask);
 assert.equal(partial.s,supplementMask);
 assert.equal(operationsEvidenceStates(partial,scanId,partial.binding)[key('transfer_supplement_disposition')]?.value,'supplement_mask_'+supplementMask);
 assert.equal(operationsEvidenceStates({...partial,s:undefined},scanId,partial.binding)[key('transfer_supplement_disposition')],undefined);
 assert.equal(operationsEvidenceStates(partial,scanId,partial.binding)[reasonMetric]?.value,'reason_mask_'+reasonMask);
 assert.equal(operationsEvidenceStates(partial,scanId,{...partial.binding,sourceHash:'b'.repeat(64)})[reasonMetric],undefined);
});
