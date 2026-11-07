import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceSummaryAudit,choiceSummaryFromRecord} from './audit-progress-choice';

export const scanId='11111111-1111-4111-8111-111111111111', digest='a'.repeat(64);
const timestamp='2026-11-06T09:00:00.000Z';
export function operationsFixture(){
 const meta={sha256:digest,sizeBytes:2000};
 const document={documentFetchState:'fetched',documentEvaluationState:'usable',documentRole:'policy_document',
  targetRelationship:'target_controller',documentFormat:'html',extractionStatus:'complete',artifactVerificationStatus:'verified',
  artifactSha256:digest,retainedTextSha256:digest,artifactSizeBytes:102,retainedTextChars:100,
  documentTextCoverage:{status:'complete',sourceTextChars:100,retainedTextChars:100}};
 return {scan:{id:scanId},snapshot:{consentControlAssessment:{scan:{noGo:false}}},
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
