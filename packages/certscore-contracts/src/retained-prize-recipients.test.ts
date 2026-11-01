import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import f from "./test-fixtures/retained-prize-recipient-disclosure.json";
import {classifyGdprTransparencyTopics, COMPETITION_PRIZE_RECIPIENT_PATTERN} from "./gdpr-transparency-topic-classifier";
import {article13DisclosureRejectReason, hasSubstantiveRecipientsEvidence} from "./article13-disclosure-rejection";

test("retained contact/address recipient disclosure keeps its prize-delivery scope and exact source", () => {
  assert.equal(f.historicalSelectedWitness.signalObserved, "not_confirmed");
  assert.equal(f.section.extractionState, "complete");
  assert.equal(f.contentCoverage.status, "truncated");
  assert.equal(createHash("sha256").update(f.section.textExcerpt).digest("hex"), f.section.evidenceTextSha256);
  const match = classifyGdprTransparencyTopics({section: {heading: f.section.heading, body: f.section.textExcerpt}})
    .matches.find(m => m.topic === "recipients_or_vendor_categories");
  assert.equal(match?.evidenceExcerpt, f.clause);
  assert.ok(f.section.textExcerpt.includes(match!.evidenceExcerpt));
  assert.equal(hasSubstantiveRecipientsEvidence(f.clause), true);
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
    assert.equal(article13DisclosureRejectReason(f.clause, "recipients_or_vendor_categories", {mode}), null, mode);
  assert.deepEqual(classifyGdprTransparencyTopics({section: {body: f.clause}}).matches.map(m => m.topic),
    ["recipients_or_vendor_categories"]);
});

test("recipient recognition cannot borrow recipient identity or personal-data transfer from a changed clause", () => {
  for (const text of [
    f.clause.replace("will be passed", "will not be passed"),
    f.clause.replace("your contact details and, if applicable mailing address", "aggregated poll totals"),
    f.clause.replace("the product supplier, advertising agency or PR company", "another entrant"),
    f.clause.replace("will be passed to the third party", "will stay with us"),
    f.clause.replace("prize(s)", "prize?s"),
    f.clause.replace(/\.$/, "?"),
    `Could ${f.clause.charAt(0).toLowerCase() + f.clause.slice(1)}`,
  ]) {
    assert.equal(COMPETITION_PRIZE_RECIPIENT_PATTERN.test(text), false, text);
    assert.equal(hasSubstantiveRecipientsEvidence(text), false, text);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.notEqual(article13DisclosureRejectReason(text, "recipients_or_vendor_categories", {mode}), null, mode);
  }
});

test("the older aggregate-only survey quote does not gain a personal-data recipient disclosure", () => {
  const text = f.historicalSelectedWitness.selectedPolicySectionExcerpt;
  assert.equal(hasSubstantiveRecipientsEvidence(text), false);
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
    assert.notEqual(article13DisclosureRejectReason(text, "recipients_or_vendor_categories", {mode}), null, mode);
});
