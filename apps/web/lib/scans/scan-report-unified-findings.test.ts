import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanReportUnifiedFindings,
  selectOwnerUnifiedFindingsForSection,
  type ScanReportUnifiedFindingState
} from "./scan-report-unified-findings";

function packet(id: string, categoryId: string, relation: "owner" | "mirror" | "overlay") {
  return {
    categoryAlignments: [{ evidenceCategoryId: categoryId, relation }],
    unifiedFindingId: id
  };
}

test("selectOwnerUnifiedFindingsForSection keeps only owner-aligned packets", () => {
  const findings = [
    packet("owned", "tracking", "owner"),
    packet("mirrored", "tracking", "mirror"),
    packet("other", "financial", "owner")
  ];

  assert.deepEqual(
    selectOwnerUnifiedFindingsForSection(findings as never, new Set(["tracking"])).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});

test("buildScanReportUnifiedFindings dedupes owner packets across section drafts", () => {
  const owned = packet("owned", "tracking", "owner");
  const state: ScanReportUnifiedFindingState = {
    derivedContext: {
      accessibilityIssueRows: [],
      accessibilityRuleEvidenceRows: [],
      consentAuditFindings: [],
      policyBehaviorContradictions: [],
      preconsentViolationRows: [],
      prioritizedAccessibilityRuleRows: [],
      scanReportReviewIssues: [],
      taxonomySnapshotSections: []
    },
    globalUnifiedFindings: [owned, packet("mirrored", "tracking", "mirror")] as never,
    sectionDrafts: [
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] },
      { sections: [{ sectionCategoryIds: new Set(["tracking"]) }] }
    ]
  };

  assert.deepEqual(
    buildScanReportUnifiedFindings(state).map((finding) => finding.unifiedFindingId),
    ["owned"]
  );
});
