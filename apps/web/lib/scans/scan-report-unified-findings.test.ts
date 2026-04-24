import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanReportUnifiedFindings,
  selectOwnerUnifiedFindingsForSection,
  type ScanReportUnifiedFindingState
} from "./scan-report-unified-findings";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";

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

test("report-level candidates surface runtime-backed session replay provenance", () => {
  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [
      {
        categoryId: "adtech_analytics_replay_footprint",
        description: "This signal is worth reviewer attention.",
        fallbackEvidence: {
          runtimeVendors: ["Microsoft Clarity"],
          session_replay_runtime_detected: true,
          session_replay_runtime_vendors: ["Microsoft Clarity"],
          signalKey: "commerce.session_replay_tool_detected",
          signalValue: true
        },
        observedValue: "Microsoft Clarity",
        severity: "high",
        signalKey: "commerce.session_replay_tool_detected",
        signalLabel: "Session replay tool detected",
        signalSource: "snapshot_signal",
        sourceType: "signal",
        title: "Session replay tool detected"
      }
    ],
    validationFindings: [],
    validationFindingLookup: new Map()
  });
  const packet = packets.find((finding) => finding.unifiedFindingId === "session_replay_observed");

  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.surfacingDecision.decisionState, "review");
  assert.equal(packet?.confidenceInputs.hasDirectRuntimeEvidence, true);
});
