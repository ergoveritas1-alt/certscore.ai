import {
  ASSESSMENT_HIGHLIGHTS_MAX_LENGTH,
  buildAssessmentHighlights,
  type AssessmentContext,
  type AssessmentHighlightFinding,
} from "../../../lib/scans/assessment-highlights";

// Older report callers still supply evidence and timeline context. The brief
// reads only already-projected findings and the canonical score/coverage.
export const EXECUTIVE_OVERVIEW_MIN_LENGTH = 0;
export const EXECUTIVE_OVERVIEW_MAX_LENGTH = ASSESSMENT_HIGHLIGHTS_MAX_LENGTH;

type ExecutiveOverviewInput = {
  findings: ReadonlyArray<AssessmentHighlightFinding>;
  context?: AssessmentContext;
  [key: string]: unknown;
};

export function buildExecutiveOverview(input: ExecutiveOverviewInput) {
  return buildAssessmentHighlights(input.findings, { kind: "page" }, input.context);
}
