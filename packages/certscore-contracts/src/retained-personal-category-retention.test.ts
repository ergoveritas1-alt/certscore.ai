import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import f from "./test-fixtures/retained-personal-category-retention.json";
import {classifyGdprTransparencyTopics, PERSONAL_CATEGORY_PURPOSE_RETENTION_PATTERN} from "./gdpr-transparency-topic-classifier";
import {article13DisclosureRejectReason, hasSubstantiveRetentionEvidence} from "./article13-disclosure-rejection";

test("retained category/purpose criterion is a precise quote without markup or adjacent opt-out evidence", () => {
  assert.equal(f.historicalSelectedWitness.signalObserved, "not_confirmed");
  assert.equal(f.section.extractionState, "complete");
  assert.equal(f.contentCoverage.status, "truncated");
  assert.equal(createHash("sha256").update(f.section.textExcerpt).digest("hex"), f.section.evidenceTextSha256);
  const match = classifyGdprTransparencyTopics({section: {heading: f.section.heading, body: f.section.textExcerpt}})
    .matches.find(m => m.topic === "data_retention");
  assert.equal(match?.evidenceExcerpt, f.clause);
  assert.equal(f.clause.length, 180);
  assert.ok(f.section.textExcerpt.includes(match!.evidenceExcerpt));
  assert.doesNotMatch(match!.evidenceExcerpt, /<|&nbsp;|\\r|Privacy Choices|Opt Out/);
  for (const text of [f.clause, f.section.textExcerpt, f.historicalSelectedWitness.selectedPolicySectionExcerpt]) {
    assert.equal(hasSubstantiveRetentionEvidence(text), true);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.equal(article13DisclosureRejectReason(text, "data_retention", {mode}), null, mode);
  }
});

test("category recognition requires affirmative personal-data scope and the retained purpose criterion", () => {
  for (const text of [
    f.clause.replace("We retain", "We do not retain"),
    `Do ${f.clause.charAt(0).toLowerCase() + f.clause.slice(1)}`,
    f.clause.replace("Personal Information, including Sensitive Personal Information", "Technical Files, including System Files"),
    f.clause.replace("for as long as needed or permitted in light of the purpose(s) for which it was collected", "on our servers"),
    f.clause.replace("purpose(s)", "purpose?s"),
    f.clause.replace(/\.$/, "?"),
    "The criteria used to determine our retention periods include:",
  ]) {
    assert.equal(PERSONAL_CATEGORY_PURPOSE_RETENTION_PATTERN.test(text), false, text);
    assert.equal(hasSubstantiveRetentionEvidence(text), false, text);
    for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
      assert.notEqual(article13DisclosureRejectReason(text, "data_retention", {mode}), null, mode);
  }
  const existingNumericCriterion = f.clause.replace("for as long as needed or permitted in light of the purpose(s) for which it was collected", "for 5 years");
  for (const mode of ["scan_core", "retained_report", "multilingual_classifier"] as const)
    assert.equal(article13DisclosureRejectReason(existingNumericCriterion, "data_retention", {mode}), null,
      "the consistency guard preserves other already-supported criteria");
});
