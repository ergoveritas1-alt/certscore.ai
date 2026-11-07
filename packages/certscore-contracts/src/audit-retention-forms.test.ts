import assert from 'node:assert/strict';
import test from 'node:test';
import {hasSubstantiveRetentionEvidence,article13DisclosureRejectReason} from './article13-disclosure-rejection';
const forms=[
 'Example Company will not retain your personal data for longer than is necessary to fulfil the purposes for which the personal data has been collected.',
 'We retain information about you and your use of our services for as long as is needed to fulfill our legitimate business purposes outlined in this Privacy Policy.',
 'We will either delete or anonymize it or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible.',
];
for(const [i,text] of forms.entries())test(`complete retention criterion form ${i+1} needs no invented numeric period`,()=>{
 assert.equal(hasSubstantiveRetentionEvidence(text),true);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'data_retention',{mode}),null);
 assert.doesNotMatch(text,/\d+\s*(?:days|months|years)/);
});
test('schedule references, suppression purposes, storage reasons and incomplete criteria remain unqualified',()=>{
 for(const text of [
  "Authentication events. Kept for the audit log, for as long as the plan's audit retention.",
  'The company will retain each category of Personal Information in accordance with our data retention schedule.',
  'We keep the minimum personal information to ensure your information remains deleted and is not used for any other purpose.',
  'Certain records and information will be retained for specific purposes such as legal, payment and accounting.',
  ...forms.map(s=>s.slice(0,-1)+'?'),
  ...forms.map(s=>s.slice(0,-1)),
  'We retain information about you and your use of our services for legitimate business purposes.',
  'We isolate personal information from further processing in our backup archives.',
  'We will retain your personal data for longer than is necessary to fulfil the purposes for which the personal data has been collected.',
 ])assert.equal(hasSubstantiveRetentionEvidence(text),false,text);
});
