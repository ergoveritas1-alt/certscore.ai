import type { ReportReviewFocus } from "@certscore/api-contracts";
import type { CaliforniaReviewCoverage } from "@certscore/contracts";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightsPresentation } from "./assessment-highlights";
import type { AssessmentContext, AssessmentHighlightFinding, AssessmentScope } from "./assessment-brief";
import { projectCaliforniaAssessmentResultSummary, type AssessmentReportIdentity } from "./california-assessment-result-summary";
import { californiaAssessmentPresentation } from "./california-assessment-presentation";
import { regulatoryReviewContext, selectRegulatoryReview } from "./regulatory-review-catalog";
import { assessmentHighlightProminence } from "./assessment-highlight-selection";
import { REVIEW_FOCUS_LABELS } from "./report-review-focus";

/** One selection/rendering path for both report focuses and both report surfaces. */
export function buildRegulatoryAssessmentHighlights<T extends AssessmentHighlightFinding & { id: string; status: string; rank: number }>(
  findings: readonly T[], focus: ReportReviewFocus, scope: AssessmentScope,
  context: Omit<AssessmentContext, "assessmentResult"> = {},
  identity?: AssessmentReportIdentity, californiaCoverage?: CaliforniaReviewCoverage,
) {
  const review = selectRegulatoryReview(findings, focus);
  const supporting = findings.filter(finding => assessmentHighlightProminence(finding, findings) === "supporting"
    && !review.topIssues.some(issue=>issue.id===finding.id)
    && regulatoryReviewContext(finding.id, focus));
  const highlightFindings = [...review.topIssues, ...supporting];
  const result = focus === "ccpa_cpra" && scope.kind === "page" && !highlightFindings.length
    ? projectCaliforniaAssessmentResultSummary(findings, identity) : null;
  let highlights: AssessmentHighlightsPresentation;
  if (highlightFindings.length || result) {
    highlights = buildAssessmentHighlightsPresentation(highlightFindings, scope, { ...context, assessmentResult: result });
  } else if (focus === "ccpa_cpra") {
    const empty = californiaAssessmentPresentation(californiaCoverage);
    highlights = { text: empty.emptySummary, links: empty.emptySummaryLinks };
  } else {
    highlights = { text: `No ${REVIEW_FOCUS_LABELS[focus]} priority issues were identified in the assessed evidence.`, links: [] };
  }
  return { ...review, highlights };
}
