import {californiaPriorityDemotion} from "./california-priority-selection";

type Finding = {id?: string; evidenceJson?: Record<string, unknown>; severity?: string; priority?: string};

/** Shared narrative prominence over canonical projected findings only. This is
 * independent of top-issue eligibility: qualified collection reviews may be in
 * that list while retaining complete review qualifications in the narrative.
 * Other demotions retain their evidence, framework and duplicate protections. */
export function assessmentHighlightProminence(finding: Finding, findings: readonly Finding[]) {
  const demotion = californiaPriorityDemotion(finding, findings);
  if (demotion === null && finding.id === "california_collection_review") return "supporting";
  if (demotion === null && finding.severity === "low" && finding.priority !== "high") return "supporting";
  return demotion === null ? "priority" : "excluded";
}

export function selectAssessmentHighlightFindings<T extends Finding>(findings: readonly T[]): T[] {
  return findings.filter(finding => assessmentHighlightProminence(finding, findings) !== "excluded");
}

/** Within narrative support, qualified collection reviews precede routine
 * low-severity observations. This ordering is independent of score effects. */
export function supportingAssessmentHighlightOrder(finding: Finding) {
  return finding.id === "california_collection_review" ? 0 : 1;
}
