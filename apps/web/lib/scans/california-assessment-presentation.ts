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
    emptyLabel: incomplete ? "Assessment incomplete" : "0 CCPA/CPRA issues",
    emptySummary: incomplete
      ? "California assessment is incomplete. No priority issue was established from the retained evidence; unresolved checks may still contain issues. See California privacy review in Detailed evidence for the remaining checks."
      : "No CCPA/CPRA priority issues were identified in the assessed evidence.",
    unavailableScore: "California score unavailable: this visit did not retain enough evidence to assess risk. Missing capture is not a passing result.",
  };
}
