import assert from 'node:assert/strict';
import test from 'node:test';
import {article13DisclosureRejectReason,hasSubstantiveRetentionEvidence} from './article13-disclosure-rejection';
const retained='Data is retained only as long as necessary for operational, legal, and security purposes, including fraud detection and prevention, after which it is deleted or anonymized where feasible.';
test('original P15 lifecycle witness states a retention criterion without a numeric period',()=>{
 assert.equal(hasSubstantiveRetentionEvidence(retained),true);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(retained,'data_retention',{mode}),null,mode);
 assert.doesNotMatch(retained,/\d+\s*(?:days|months|years)/);
});
test('bare Data does not qualify generic storage, questions, missing criteria or unrelated subjects',()=>{
 for(const text of [
  'Data retention. Please see our privacy policy for more information.',
  'Data is retained in our secure system, after which it is deleted.',
  'Data is retained only as long as necessary for business purposes.',
  'Data is retained only as long as necessary, after which it is deleted?',
  'Weather data is retained as long as necessary for forecasts, after which it is deleted.',
  'Backup data is retained as long as necessary for testing, after which it is deleted.',
  'Your right to deletion. Data is retained securely.',
  'Data is not retained as long as necessary, after which it is deleted.',
  'Data is retained temporarily. After which it is deleted as long as necessary.',
 ])assert.equal(hasSubstantiveRetentionEvidence(text),false,text);
});
