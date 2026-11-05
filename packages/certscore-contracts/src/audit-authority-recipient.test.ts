import test from 'node:test';import assert from 'node:assert/strict';
import {article13DisclosureRejectReason} from './article13-disclosure-rejection';
const recipient='This information is shared with members of the corporate family, business partners, third party service providers, authorized users within your organization, and legal or regulatory authorities as required.';
const complaint='You have the right to lodge a complaint with your local data protection authority.';
const modes=['scan_core','retained_report','multilingual_classifier'] as const;
test('complete authority-recipient sentences do not establish a complaint route',()=>{
 for(const text of [recipient,'Policy. '+recipient,'Privacy Policy. '+recipient,'We may disclose personal information to regulatory authorities as required by law.','We share personal data with law enforcement when required by law.'])for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'supervisory_authority',{mode}),'insufficient_row_specific_terms');
});
test('a separate explicit complaint right is preserved with recipient language',()=>{
 for(const text of [complaint,recipient+' '+complaint,complaint+' '+recipient])for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'supervisory_authority',{mode}),null);
});
test('authority recipients remain useful recipient-category evidence',()=>{
 for(const mode of modes)assert.equal(article13DisclosureRejectReason(recipient,'recipients_or_vendor_categories',{mode}),null);
});
