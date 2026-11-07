import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {californiaPrivacyReviewSchema, saleSharingOptOutEvidenceSchema} from '@certscore/contracts';
import {buildPrivacyChoiceExperience, type PrivacyChoiceExperienceInput} from './privacy-choice-experience';
import {gpcProductFixture} from './test-fixtures/gpc-product';
import {buildUnifiedFindingDisplayPackets} from './unified-findings';
import {buildGpcResponseReportProjection} from '../../components/scans/report-lab/gpc-report-projection';
import {californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL} from '../../server/scans/california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from '../../server/scans/california-privacy-review-projection';

export function experienceFixture(options: Parameters<typeof gpcProductFixture>[0] = {}) {
  const f = gpcProductFixture(options);
  const findings = buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:f.assessment,gpcActivityComparison:f.activityComparison,gpcCmpStateComparison:f.cmpStateComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  const projection = buildGpcResponseReportProjection(findings);
  assert.ok(projection);
  const input = {scan:{id:f.gpc.scanId,url:f.gpc.url,origin:'US California',createdAt:'2026-11-05',createdAtIso:'2026-11-05T12:00:00.000Z'},gpcResponse:projection} as PrivacyChoiceExperienceInput;
  return {input, f, findings};
}
test('canonical GPC facts stay separate from explicit opt-out and optional interfaces', () => {
  const {input} = experienceFixture({apiUnavailable:true});
  const result = buildPrivacyChoiceExperience(input);
  assert.equal(result.facts[0]!.value,'Verified on this page');
  assert.equal(result.facts[1]!.value,'Not observable in this result');
  assert.equal(result.facts[3]!.value,'No verified action result');
  assert.equal(result.hasFindings,false);
  assert.match(result.packageText,/VERIFICATION FOLLOW-UP — NOT A NEW FAILURE FINDING/);
  assert.doesNotMatch(result.packageText,/implement GPP|install GPP|deduction|points|compliant/i);
  const missing = buildPrivacyChoiceExperience({...input,gpcResponse:null});
  assert.match(missing.activity,/No verified GPC activity result/);
  assert.equal(missing.recipients.length,0);
});
test('fix package uses existing canonical finding guidance and bound request IDs', () => {
  const {input} = experienceFixture({contradiction:true,urls:['https://cm.g.doubleclick.net/pixel?google_nid=fixture&google_hm=SECRET']});
  const before = JSON.stringify(input);
  const result = buildPrivacyChoiceExperience(input);
  assert.equal(result.hasFindings,true);
  for(const item of input.gpcResponse!.guidance!.items.filter(item => item.kind==='adverse')) {
    assert.ok(result.packageText.includes(item.observation));
    for(const e of item.evidence) assert.ok(result.packageText.includes(e.evidenceId));
  }
  assert.match(result.packageText,/Initiator|GPC handler/);
  assert.match(result.packageText,/equal windows/);
  assert.doesNotMatch(result.packageText,/SECRET|fixture-loader|s3:\/\/|deduction/i);
  assert.equal(JSON.stringify(input),before);
  const mismatched = buildPrivacyChoiceExperience({...input,scan:{...input.scan,id:'wrong-scan'}});
  assert.equal(mismatched.hasFindings,false);
  assert.equal(mismatched.recipients.length,0);
});
test('missing collection counts are not converted into zero or an honoring result', () => {
  const {input} = experienceFixture();
  const a = input.gpcResponse!.assessment;
  assert.equal(a.contractVersion,'certscore.gpc-response-assessment.v3');
  if(a.contractVersion !== 'certscore.gpc-response-assessment.v3') return;
  delete a.observation.requests.advertisingCollectionCount;
  delete a.observation.requests.advertisingCollectionEvidenceIds;
  const result = buildPrivacyChoiceExperience(input);
  assert.doesNotMatch(result.activity,/No successful advertising collection/);
});
test('copy context strips target credentials, query values and fragments', () => {
  const {input} = experienceFixture();
  input.scan.url='https://user:secret@example.test/path?email=raw@example.test#private';
  const text = buildPrivacyChoiceExperience(input).packageText;
  assert.match(text,/Target: https:\/\/example.test\/path/);
  assert.doesNotMatch(text,/user:secret|raw@example.test|#private/);
});
test('explicit opt-out reports completion, unconfirmed and missing results independently', () => {
  const f=californiaCoverageFixture();
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const evidence=saleSharingOptOutEvidenceSchema.parse({contractVersion:'certscore.sale-sharing-opt-out-evidence.v1',policyVersion:'bounded_sale_sharing_opt_out.v1',scanId:f.bundle.scanId,parentDispatchSha256:'a'.repeat(64),targetUrl:CA_FIXTURE_URL,documentToken:'choice-loader',startedAt:'2026-10-17T12:00:00.000Z',completedAt:'2026-10-17T12:00:01.500Z',status:'complete',recipeVersion:'fixture.v1',provider:'OneTrust',actionCount:2,submitted:true,registration:'confirmed',confirmedAt:'2026-10-17T12:00:00.500Z',before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,requests:[{hostname:'www.facebook.com',vendor:'Meta',purpose:'advertising',httpStatus:204,msAfterConfirmation:300}],limitations:[]});
  const bind = () => { const bytes=Buffer.from(JSON.stringify(evidence)); review.optOutObservation={evidence,verificationStatus:'verified',sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}; };
  bind();review.optOutEffectiveness='bounded_observation';
  const input={scan:{id:f.bundle.scanId,url:CA_FIXTURE_URL,origin:'US California',createdAt:'2026-11-05'},californiaPrivacyReview:californiaPrivacyReviewSchema.parse(review)} as PrivacyChoiceExperienceInput;
  const result=buildPrivacyChoiceExperience(input);
  assert.equal(result.facts[3]!.value,'Choice recorded; bounded activity captured');
  assert.match(result.facts[3]!.detail,/1 advertising-classified responses retained during 500 ms/);
  assert.match(result.packageText,/Meta — www.facebook.com; HTTP 204; \+300 ms after confirmation; classified response; collection not established/);
  assert.equal(result.hasFindings,false);
  evidence.status='limited';evidence.registration='unconfirmed';evidence.confirmedAt=null;evidence.after=null;evidence.captureComplete=false;evidence.observationWindowMs=0;evidence.requests=[];
  review.optOutEffectiveness='not_assessed';bind();input.californiaPrivacyReview=californiaPrivacyReviewSchema.parse(review);
  assert.equal(buildPrivacyChoiceExperience(input).facts[3]!.value,'Action submitted; choice unconfirmed');
  input.scan.id='other-scan';
  assert.equal(buildPrivacyChoiceExperience(input).facts[3]!.value,'No verified action result');
});
