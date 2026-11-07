import assert from 'node:assert/strict';
import test from 'node:test';
import {article13DisclosureRejectReason,hasSubstantiveProcessingPurposesEvidence} from './article13-disclosure-rejection';
const retained='We may process limited technical data, including: IP address device and browser information timestamps referral URLs online identifiers (such as cookie IDs, mobile advertising IDs, or similar identifiers, where applicable) This data is used solely for: ad delivery and optimization fraud prevention analytics and system security, including the detection of invalid traffic, prevention of fraud, and ensuring the integrity of advertising systems We do not intentionally collect directly identifiable personal data such as names, email addresses, or contact details through this domain.';
test('original P15 bounded selected witness states nominal processing purposes',()=>{
 assert.equal(hasSubstantiveProcessingPurposesEvidence(retained),true);
 for(const mode of ['scan_core','retained_report'] as const)assert.equal(article13DisclosureRejectReason(retained,'processing_purposes',{mode}),null,mode);
});
test('nominal-purpose change preserves the independent multilingual prose-quality gate',()=>{assert.equal(article13DisclosureRejectReason(retained,'processing_purposes',{mode:'multilingual_classifier'}),'code_or_non_policy_excerpt');});
test('passive purpose lists retain an immediate named-data antecedent',()=>{
 for(const text of [
  'We may process limited technical data, including IP addresses and browser information. This data is used solely for ad delivery and optimization, fraud prevention and analytics.',
  'Technical data is used for fraud prevention and system security.',
  'Personal data is processed for customer support.',
 ])assert.equal(hasSubstantiveProcessingPurposesEvidence(text),true,text);
});
test('nominal phrases do not supply missing subjects, antecedents, purposes or affirmative statements',()=>{
 for(const text of [
  'This data is used solely for ad delivery and optimization.',
  'We may process limited technical data. Our customers decide what happens next. This data is used solely for ad delivery and optimization.',
  'We may process limited technical data. This data is used solely for the purposes described in this policy.',
  'We may process limited technical data. Is this data used solely for ad delivery and optimization?',
  'We may process limited technical data. This data is not used for ad delivery and optimization.',
  'We may process limited technical data. This data could be used for ad delivery and optimization.',
  'We may process limited technical data. You can request information about how this data is used for ad delivery and optimization.',
  'Purposes of processing: ad delivery and optimization. Please see our privacy policy regarding personal data.',
  'We do not process technical data. This data is used solely for ad delivery and optimization.',
 ])assert.equal(hasSubstantiveProcessingPurposesEvidence(text),false,text);
});
