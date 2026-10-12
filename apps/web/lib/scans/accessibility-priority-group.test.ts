import assert from "node:assert/strict";
import test from "node:test";
import { ACCESSIBILITY_PRIORITY_GROUP_ID, groupStoredReportScorePriorities } from "./accessibility-priority-group";

const finding = (id: string, rank: number) => ({ id, rank, title: id, summary: "Retained summary", evidence: ["retained proof"],
  evidenceJson: { findingId: id } as Record<string, unknown>, correctionSteps: [`Repair ${id}`], pages: [{ id: "home", url: "https://example.test/", homepage: true }] });

test("stored current and historical site scores group selected accessibility entries without rescoring", () => {
  for (const version of ["full-site-distinct-findings.v6", "current-policy"] ) {
    const score = { version, value: 90, deductions: [{ label: "Retained deduction", deductionPoints: 10 }],
      sources: [{ pageId: "home", sourceHash: "original-hash" }], scope: "Original coverage", limitedPages: 2,
      priorityReview: [finding("regulatory_gap__gdpr_eprivacy__privacy_notice_availability", 1), finding("semantic_labeling_accessibility_issue", 2), finding("visual_contrast_accessibility_issue", 3)] };
    const original = structuredClone(score);
    const projected = groupStoredReportScorePriorities(score);
    assert.deepEqual(score, original);
    assert.deepEqual({ ...projected, priorityReview: undefined }, { ...score, priorityReview: undefined });
    assert.deepEqual(projected.priorityReview.map(row => row.id), [score.priorityReview[0]!.id, ACCESSIBILITY_PRIORITY_GROUP_ID]);
    assert.deepEqual(projected.priorityReview[1]!.evidenceJson.findings, score.priorityReview.slice(1));
    assert.deepEqual(groupStoredReportScorePriorities(projected), projected, "grouping is idempotent");
  }
});

test("stored grouping cannot introduce an accessibility finding from unknown or empty entries", () => {
  for (const priorityReview of [[], [finding("unrecognized_accessibility_label", 1)]]) {
    const score = { value: 100, priorityReview };
    assert.deepEqual(groupStoredReportScorePriorities(score), score);
  }
});
