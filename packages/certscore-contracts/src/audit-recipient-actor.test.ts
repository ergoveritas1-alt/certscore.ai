import assert from 'node:assert/strict';import test from 'node:test';
import {article13DisclosureRejectReason,hasSubstantiveRecipientsEvidence} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics} from './gdpr-transparency-topic-classifier';
const actor='and our affiliates (“Publisher”, “we” or “our”) collect, process, store, and share personal information about our Users.';
const modes=['scan_core','retained_report','multilingual_classifier'] as const;
test('joint actors do not establish recipients of an outbound disclosure',()=>{
 for(const text of [actor,'We and our affiliates collect and process personal information about our users.','Our affiliates may collect and share personal information about our users.']){
  assert.equal(hasSubstantiveRecipientsEvidence(text),false);
  for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'recipients_or_vendor_categories',{mode}),'insufficient_row_specific_terms');
  assert.ok(!classifyGdprTransparencyTopics({section:{body:text}}).matches.some(m=>m.topic==='recipients_or_vendor_categories'));
 }
});
test('conditional outgoing sharing is still a recipient disclosure beside joint actors',()=>{
 for(const outgoing of ['We may share personal information with payment processors to complete purchases.','To make the Site work, we may need to share some of your personal information with other Users, our affiliates, third parties, and service providers.','We share personal information with Stripe to process payments.','Personal information is disclosed to Example LLC for support.','Personal information is disclosed to service providers for support.','We do not share personal information with our affiliates.'])for(const mode of modes)assert.equal(article13DisclosureRejectReason(actor+' '+outgoing,'recipients_or_vendor_categories',{mode}),null);
});
test('a recipient receiving data remains distinct from the controller receiving it',()=>{
 const received='Our payment processors receive personal information to complete your purchase and handle billing.';
 for(const text of [received,actor+' '+received,actor+' Stripe receives personal information to process payments.'])for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'recipients_or_vendor_categories',{mode}),null);
 for(const mode of modes)assert.equal(article13DisclosureRejectReason('We receive personal information from advertising partners.','recipients_or_vendor_categories',{mode}),'insufficient_row_specific_terms');
});
test('a combined subject can disclose a real distinct recipient in the same sentence',()=>{
 for(const mode of modes)assert.equal(article13DisclosureRejectReason('We and our affiliates share personal information with service providers to operate the service.','recipients_or_vendor_categories',{mode}),null);
});
test('a concrete labeled category is retained when another sentence defines joint actors',()=>{
 for(const mode of modes)assert.equal(article13DisclosureRejectReason(actor+' Recipients of personal information: payment processors and service providers.','recipients_or_vendor_categories',{mode}),null);
});
