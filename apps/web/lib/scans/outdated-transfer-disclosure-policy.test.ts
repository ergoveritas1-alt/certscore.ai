import assert from 'node:assert/strict';
import test from 'node:test';
import { assessOutdatedTransferDisclosure, readOutdatedTransferDisclosureAssessment } from './outdated-transfer-disclosure-policy';
import { buildNormalizedConcerns } from './normalized-concerns';
import { deriveGdprEprivacyCoveragePolicyOutcomes } from './gdpr-eprivacy-coverage-policy';
import { deriveRegulatoryCoverageScore, getGdprEprivacyRowDeduction } from './regulatory-coverage-score';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
(require.cache as Record<string, unknown>)[require.resolve('server-only')] = {exports:{},loaded:true};
const { mergeSiteChecklistRows } = require('../../server/scans/full-site-score') as typeof import('../../server/scans/full-site-score');
import { deriveCanonicalOverallScoreForReport } from '../../server/scans/canonical-overall-score';
const positive='Our service provider is certified under the EU-US Privacy Shield. We use this framework for transfers.';
const input={text:positive,sourceDocumentSha256:'a'.repeat(64),sourceUrl:'https://example.test/privacy',scanDate:'2026-10-03T00:00:00.000Z'};
function project(text=positive, assessment: unknown=assessOutdatedTransferDisclosure({...input,text})) {
 const match={canonicalId:'eu_us_privacy_shield',canonicalName:'EU-US Privacy Shield',statusAtScan:'invalidated',sourceUrl:input.sourceUrl,evidenceText:text,outdatedTransferDisclosureAssessment:assessment};
 const runtimeArtifacts={policyDisclosureSummary:{legalFrameworkValidityMatches:[match]}};
 const normalizedConcerns=buildNormalizedConcerns({reviewFindingCandidates:[],validationFindings:[],runtimeArtifacts});
 const outcome=deriveGdprEprivacyCoveragePolicyOutcomes({normalizedConcerns,runtimeArtifacts} as any).outdated_transfer_framework_reference!;
 return {id:outcome.rowId,assessmentStatus:'review_signal',evidenceState:'observed',status:outcome.status,evidenceRefs:outcome.evidenceRefs,criticalEvidence:outcome.criticalEvidence} as any;
}
test('verified guidance follows concern policy and deducts three points once',()=>{
 const row=project();
 assert.equal(getGdprEprivacyRowDeduction(row),3);
 const score=(rows:any[])=>deriveRegulatoryCoverageScore({framework:'gdpr_eprivacy',rows}).score;
 assert.equal(score([row]),97);
 const bare = {...row,criticalEvidence:{retainedEvidence:{outdatedTransferDisclosureAssessment:assessOutdatedTransferDisclosure(input)}}};
 assert.equal(getGdprEprivacyRowDeduction(bare),0);
 assert.equal(score([row,row,row]),97);
 assert.equal(score(mergeSiteChecklistRows([row],[row,row])),97);
 assert.equal(score([row,{id:'privacy_notice_availability',assessmentStatus:'gap_observed',evidenceState:'observed',status:'Gap observed'}]),88);
 assert.equal(deriveCanonicalOverallScoreForReport({scanRecord:{} as any,checklistRows:[row],unifiedFindings:[]}),97);
});
test('historical, corrected, uncertain, legacy, and unbound evidence cannot deduct',()=>{
 for(const text of ['Privacy Shield was invalidated and replaced. We now rely on other safeguards.','Historically our provider was certified under Privacy Shield.','We no longer rely on Privacy Shield.','We do not rely on Privacy Shield.','We may rely on Privacy Shield.','We mention Privacy Shield for background only.','Unser Anbieter war früher unter Privacy Shield zertifiziert.']) {
  assert.equal(assessOutdatedTransferDisclosure({...input,text}),null,text);
  assert.equal(getGdprEprivacyRowDeduction(project(text)),0,text);
 }
 assert.equal(assessOutdatedTransferDisclosure({...input,scanDate:'2019-01-01T00:00:00.000Z'}),null);
 assert.equal(assessOutdatedTransferDisclosure({...input,scanDate:null}),null);
 assert.equal(getGdprEprivacyRowDeduction(project(positive,null)),0);
 assert.equal(getGdprEprivacyRowDeduction(project('Different unbound policy passage',assessOutdatedTransferDisclosure(input))),0);
 assert.equal(readOutdatedTransferDisclosureAssessment({...assessOutdatedTransferDisclosure(input),sourceDocumentSha256:'bad'}),null);
});
test('current German ombudsman guidance qualifies without claiming a transfer violation',()=>{
 const text='Bei der Übermittlung Ihrer personenbezogenen Daten in die USA beachten Sie: Der im Privacy Shield vorgesehene Ombudsmann hat keine genügende Unabhängigkeit; er kann keine bindenden Anordnungen treffen.';
 assert.ok(assessOutdatedTransferDisclosure({...input,text}));
 assert.equal(getGdprEprivacyRowDeduction(project(text)),3);
});
