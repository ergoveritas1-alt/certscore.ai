import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import retained from '../../../../packages/certscore-contracts/src/test-fixtures/redhat-terminal-choice.json';
import {saleSharingOptOutEvidenceSchema,deriveConsentControlAssessment,californiaPrivacyReviewSchema,californiaPrivacyReviewFindingIds,CALIFORNIA_OPT_OUT_ACTIVITY_ID,REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT} from '@certscore/contracts';
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {choiceSummaryFromRecord,choiceSummaryAudit} from '../../../../scripts/lib/audit-progress-choice';

test('verified Red Hat packet persists through canonical assessment and audit without creating an activity finding',()=>{
 const original=californiaCoverageFixture();
 // Owned fixture source documents are moved together; this is not a historical report rewrite.
 const f=JSON.parse(JSON.stringify(original).split(CA_FIXTURE_URL).join(REDHAT_OPT_OUT_DOCUMENT));
 f.bundle.url=REDHAT_OPT_OUT_TARGET;f.bundle.normalizedUrl=REDHAT_OPT_OUT_TARGET;
 const packet=saleSharingOptOutEvidenceSchema.parse({...retained,scanId:f.bundle.scanId,startedAt:f.bundle.startedAt,completedAt:new Date(Date.parse(f.bundle.startedAt)+2245).toISOString()});
 const bytes=Buffer.from(JSON.stringify(packet)),sha=createHash('sha256').update(bytes).digest('hex');
 f.bundle.completedAt=new Date(Date.parse(f.bundle.startedAt)+5000).toISOString();
 f.bundle.saleSharingOptOut={evidence:packet,sha256:sha,sizeBytes:bytes.length,verificationStatus:'verified'};
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,REDHAT_OPT_OUT_DOCUMENT,f.policyEvidence)!;assert(review);
 assert.equal(review.optOutExecution?.choiceConfirmation,'confirmed_terminal');assert.equal(review.optOutExecution?.postConfirmationObservation,'not_measured');assert.equal(review.optOutEffectiveness,'not_assessed');
 const persisted=californiaPrivacyReviewSchema.parse(JSON.parse(JSON.stringify(review)));assert.deepEqual(persisted.optOutExecution,review.optOutExecution);
 assert(!californiaPrivacyReviewFindingIds(persisted).includes(CALIFORNIA_OPT_OUT_ACTIVITY_ID));
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:REDHAT_OPT_OUT_DOCUMENT}});parent.californiaPrivacyReview=persisted;
 const findings=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
 assert(!findings.some(f=>f.unifiedFindingId===CALIFORNIA_OPT_OUT_ACTIVITY_ID));
 const summary=choiceSummaryFromRecord({scan:{id:f.bundle.scanId},snapshot:{consentControlAssessment:parent},canonicalReportProjection:{globalUnifiedFindings:findings}});
 const audit=choiceSummaryAudit(summary,f.bundle.scanId);assert.equal(audit.states['sealed.opt_out.action_completion'],'completed');assert.equal(audit.states['sealed.opt_out.choice_confirmation'],'confirmed_terminal');assert.equal(audit.states['sealed.opt_out.post_confirmation_observation'],'not_measured');assert.equal(audit.states['sealed.opt_out.registration'],'unconfirmed');
 const tampered={...structuredClone(summary),packetSha256:'f'.repeat(64)};assert.equal(choiceSummaryAudit(tampered,f.bundle.scanId).states['sealed.opt_out.choice_confirmation'],undefined);
 f.bundle.saleSharingOptOut.evidence.redHatChoice.reads[2].decision.source='implied';assert.equal(projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,REDHAT_OPT_OUT_DOCUMENT,f.policyEvidence)!.optOutObservation,undefined);
});
