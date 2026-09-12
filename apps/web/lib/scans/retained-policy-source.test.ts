import assert from "node:assert/strict";
import test from "node:test";
import { retainedPolicySectionHeading } from "./retained-policy-source";
const text = "We retain account records for two years after closure, and remove the records once that period expires.";
test("policy headings require unique exact retained HTML section evidence", () => {
  const section = { heading: "Retention", textExcerpt: text, extractionMethod: "html_heading_hierarchy" };
  assert.equal(retainedPolicySectionHeading(text, [section]), "Retention");
  assert.equal(retainedPolicySectionHeading(`Retention. ${text}`, [section]), "Retention");
  assert.equal(retainedPolicySectionHeading(text, [{ ...section, extractionMethod: "canonical_topic_window" }]), undefined);
  assert.equal(retainedPolicySectionHeading(text, [section, { ...section, heading: "Other" }]), undefined);
  assert.equal(retainedPolicySectionHeading("We keep things.", [section]), undefined);
});
