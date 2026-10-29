import assert from "node:assert/strict";
import test from "node:test";
import { article13DisclosureRejectReason, hasNonSubstantiveDisclosureContext } from "./article13-disclosure-rejection";
import { DISCLOSURE_DUTY_WITNESSES } from "./test-fixtures/disclosure-duty-witnesses";

test("statutory disclosure inventories do not establish the three listed disclosures",()=>{
  for(const {topic,text} of DISCLOSURE_DUTY_WITNESSES) for(const mode of ["scan_core","retained_report","multilingual_classifier"] as const){
    assert.equal(hasNonSubstantiveDisclosureContext(text,topic),true);
    assert.notEqual(article13DisclosureRejectReason(text,topic,{mode}),null,topic+": "+mode);
  }
});
test("a disclosure-duty heading does not veto an actual bounded value",()=>{
  for(const [topic,text] of [
    ["dpo_contact","Following information: • Our data protection officer can be contacted at dpo@example.test; • questions are welcome."],
    ["data_retention","Következő kiegészítő információkat: • A személyes adatokat 3 évig őrizzük; • egyéb jogok."],
    ["recipients_or_vendor_categories","Following information: • We share personal data with hosting providers to operate our website; • your rights are described below."],
  ]) assert.equal(hasNonSubstantiveDisclosureContext(text!,topic),false,topic);
});
test("recipient rights-notification prose remains distinct from an actual recipient disclosure",()=>{
  const text="Conformément à la Réglementation et dans la mesure du possible, MGEN informera les destinataires de vos données de tout effacement, rectification de vos données, ou limitation de traitement de vos données.";
  assert.equal(hasNonSubstantiveDisclosureContext(text,"recipients_or_vendor_categories"),true);
  assert.equal(hasNonSubstantiveDisclosureContext("Nous transmettons vos données personnelles à nos prestataires pour héberger notre site.","recipients_or_vendor_categories"),false);
});
