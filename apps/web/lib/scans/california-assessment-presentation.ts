import type { CaliforniaReviewCoverage } from "@certscore/contracts";

/** Wording only, derived from canonical coverage; never changes findings or score. */
export function californiaAssessmentPresentation(coverage?: CaliforniaReviewCoverage | null) {
  const families = coverage?.families ?? [];
  const assessed = families.filter(row => "assessmentState" in row
    ? row.assessmentState === "completed"
    : ["observed", "assessed_gap", "not_triggered_in_scope"].includes(row.status)).length;
  const incomplete = !families.length || assessed < families.length;
  return {
    incomplete,
    emptyLabel: incomplete ? "California privacy review" : "0 CCPA/CPRA issues",
    emptySummary: incomplete
      ? "View the California privacy checks in Detailed evidence."
      : "No CCPA/CPRA priority issues were identified in the assessed evidence.",
    emptySummaryLinks: incomplete ? [{ label: "Detailed evidence", targetId: "evidence" }] : [],
    unavailableScore: "California score unavailable for this scan.",
  };
}
