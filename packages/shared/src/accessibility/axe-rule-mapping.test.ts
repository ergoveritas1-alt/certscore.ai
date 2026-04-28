import assert from "node:assert/strict";
import test from "node:test";
import { mapAxeRuleIdToFindingId, getMappedFindingId } from "./axe-rule-mapping";

test("mapAxeRuleIdToFindingId maps known axe rules to CertScore IDs", () => {
  assert.equal(mapAxeRuleIdToFindingId("image-alt"), "missing_image_alt_text");
  assert.equal(mapAxeRuleIdToFindingId("color-contrast"), "low_color_contrast");
  assert.equal(mapAxeRuleIdToFindingId("label"), "form_label_missing");
  assert.equal(mapAxeRuleIdToFindingId("button-name"), "button_accessible_name_missing");
  assert.equal(mapAxeRuleIdToFindingId("link-name"), "link_accessible_name_missing");
  assert.equal(mapAxeRuleIdToFindingId("html-has-lang"), "document_language_missing");
  assert.equal(mapAxeRuleIdToFindingId("aria-valid-attr-value"), "invalid_aria_attribute_value");
  assert.equal(mapAxeRuleIdToFindingId("aria-required-children"), "invalid_aria_structure");
  assert.equal(mapAxeRuleIdToFindingId("landmark-one-main"), "missing_or_invalid_main_landmark");
  assert.equal(mapAxeRuleIdToFindingId("page-has-heading-one"), "missing_h1_heading");
});

test("mapAxeRuleIdToFindingId falls back to accessibility_violation_${ruleId}", () => {
  assert.equal(mapAxeRuleIdToFindingId("custom-rule"), "accessibility_violation_custom-rule");
  assert.equal(mapAxeRuleIdToFindingId(""), "accessibility_violation_");
});

test("getMappedFindingId returns null for unmapped rules", () => {
  assert.equal(getMappedFindingId("image-alt"), "missing_image_alt_text");
  assert.equal(getMappedFindingId("unknown-rule"), null);
});
