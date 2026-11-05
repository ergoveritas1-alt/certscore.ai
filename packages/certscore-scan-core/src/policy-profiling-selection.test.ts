import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { article13DisclosureRejectReason, assessArticle13PolicyTextQuality } from "../../certscore-contracts/src/article13-disclosure-rejection";
import { retainedArticle13SectionEvidenceFromSections } from "./scanners/policy-surface-scanner";
const topic = "automated_decision_making_or_profiling";
const sourceUrl = "https://publisher.example/privacy";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
// Original retained wording has no site, customer or contact identifiers.
const original = "The Company may use user information for profiling in order to provide personalized advertisements, recommendations, and content tailored to user preferences. Profiling means the automated processing of personal data to evaluate certain personal aspects, in particular to analyze or predict aspects such as interests, behavior, or location. Logic involved: Profiling is based on analysis of user activity within the Services (e.g., frequency of calendar use, interaction with content, clicks on advertisements, device and location data) and comparison with statistical user segments. Purpose and significance: The purpose of profiling is to display more relevant advertisements or recommendations and to improve the user experience. This may affect which advertisements or recommendations you see, but it does not produce legal effects or similarly significant impacts on you. Legal basis: Where required by applicable data protection laws, profiling is carried out on the basis of your explicit consent. For users in the EU/EEA, profiling is based on consent pursuant to Art. 6 para. 1 lit. a GDPR. You may withdraw your consent at any time with future effect.";
function witness(text: string) {
  return retainedArticle13SectionEvidenceFromSections([{
    sourceUrl, heading: "Profiling", textExcerpt: text,
    extractionMethod: "html_heading_hierarchy", sourceOffsetBasis: "sanitized_html",
    extractionState: "truncated", quality: "strong", charStart: 0, charEnd: text.length,
    documentTextSha256: hash(text), evidenceTextSha256: hash(text), sourceTextChars: text.length,
  }], sourceUrl).find(w => w.coverageArea === topic);
}
test("long policy prose retains its complete profiling practice statement under unchanged quality guards", () => {
  assert.equal(assessArticle13PolicyTextQuality(original).reason, "low_quality_non_policy_text");
  assert.equal(article13DisclosureRejectReason(original, topic), "code_or_non_policy_excerpt");
  const w = witness(original)!;
  assert.equal(w.signalObserved, "observed");
  assert.equal(w.selectedPolicySectionExcerpt, original.slice(0, original.indexOf(". ") + 1));
  assert.equal(w.selectedPolicySectionExcerpt.length, 158);
  assert.equal(w.evidenceTextSha256, hash(w.selectedPolicySectionExcerpt));
  assert.equal(w.sourceDocumentTextSha256, hash(original));
  assert.equal(w.selectedPolicySectionUrl, sourceUrl);
  assert.equal(w.sectionExtractionState, "truncated");
});
test("already usable qualified profiling statement keeps its qualification", () => {
  const text = "Some of the ways in which we process personal information may be considered profiling. This description does not establish legal or similarly significant effects.";
  const w = witness(text)!;
  assert.equal(w.signalObserved, "observed");
  assert.ok(w.selectedPolicySectionExcerpt.includes("may be considered profiling"));
});
test("code/config quality rejection is not repaired by a later practice sentence", () => {
  const text = "Copyright The Closure Library. SPDX-License-Identifier Apache-2.0. " + original;
  assert.equal(assessArticle13PolicyTextQuality(text).reason, "low_quality_extracted_code_or_config");
  assert.notEqual(witness(text)?.signalObserved, "observed");
});
test("generic profiling rights do not become a source practice through quality recovery", () => {
  const text = "You have the right to object to profiling and automated decisions concerning your personal data. " + "Please read this information carefully before making a request. ".repeat(14) + "Privacy Policy.";
  assert.notEqual(witness(text)?.signalObserved, "observed");
});

