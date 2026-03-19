import assert from "node:assert/strict";
import test from "node:test";
import { deriveValidationFindingTaxonomy, getValidationFindingFamily } from "./validation-finding-taxonomy";

test("maps scan report review findings to explicit queue metadata", () => {
  assert.deepEqual(
    deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: "scan_report_review.missing_dsar_high_exposure",
      subtype: "policy_review_queue"
    }),
    {
      familyId: "policy_review_queue",
      familyLabel: "Policy Review Queue",
      scope: "page",
      source: "policy_review_queue",
      subject: "disclosure"
    }
  );
});

test("maps section review findings to explicit policy section metadata", () => {
  assert.deepEqual(
    deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: "section_review.clarity_risk_68",
      subtype: null
    }),
    {
      familyId: "policy_section_review",
      familyLabel: "Policy Section Review",
      scope: "page",
      source: "policy_enrichment",
      subject: "privacy"
    }
  );
});

test("maps accessibility review findings to explicit accessibility metadata", () => {
  assert.deepEqual(
    deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: "accessibility_review.contrast_failures",
      subtype: null
    }),
    {
      familyId: "accessibility_review",
      familyLabel: "Accessibility Review",
      scope: "site",
      source: "snapshot_accessibility",
      subject: "accessibility"
    }
  );
});

test("maps policy runtime findings to explicit runtime review metadata", () => {
  assert.deepEqual(
    deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: "policy_runtime.functional_misalignment",
      subtype: "policy_runtime_review"
    }),
    {
      familyId: "policy_runtime_review",
      familyLabel: "Policy Runtime Review",
      scope: "page",
      source: "policy_runtime",
      subject: "disclosure"
    }
  );
});

test("maps cookie runtime findings to explicit cookie runtime metadata", () => {
  assert.deepEqual(
    deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: "cookie_runtime.disclosure_gap",
      subtype: "cookie_runtime_review"
    }),
    {
      familyId: "cookie_runtime_review",
      familyLabel: "Cookie Runtime Review",
      scope: "page",
      source: "cookie_runtime",
      subject: "disclosure"
    }
  );
});

test("prefers explicit finding_family when rendering a label", () => {
  assert.deepEqual(
    getValidationFindingFamily({
      category: "scan_report_review",
      findingFamily: "policy_section_review",
      ruleKey: "section_review.clarity_risk_68",
      subtype: null
    }),
    {
      id: "policy_section_review",
      label: "Policy Section Review"
    }
  );
});
