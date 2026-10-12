import { buildAssessmentBrief, normalizeAssessmentCopy, type AssessmentBrief, type AssessmentContext, type AssessmentHighlightFinding, type AssessmentScope } from "./assessment-brief";
export type { AssessmentHighlightFinding, AssessmentContext } from "./assessment-brief";

// Prefer three useful sentences; keep full evidence qualifications and actions.
export const ASSESSMENT_HIGHLIGHTS_MAX_LENGTH = 700;
function sentence(value: string) { return /[.!?]$/.test(value) ? value : `${value}.`; }
const GENERIC_CHECKLIST_ACTION = "Review the retained checklist evidence, confirm whether the row is applicable to the site, and address the underlying implementation or disclosure gap if confirmed.";
function readerFact(value: string) {
  const partial = value.match(/^Partial support from scan evidence;\s*(.+)$/);
  return partial ? `The scan provides partial support for this finding. ${partial[1]}` : value;
}

export function renderAssessmentBrief(brief: AssessmentBrief) {
  const sentences = [brief.lead];
  let action = brief.firstAction && brief.firstAction.length <= 300
    ? sentence(brief.firstAction)
    : brief.primary ? "Review the supporting evidence and recommended fixes in Regulatory Risk Review." : "";
  const primary = brief.primary;
  const genericSummary = primary?.readerSummary === "Potential issue based on scan evidence.";
  const fact = primary?.readerSummary && !genericSummary && primary.readerSummary.replace(/[.!?]$/, "").toLowerCase() !== primary.title.replace(/[.!?]$/, "").toLowerCase()
    ? readerFact(primary.readerSummary) : primary?.domain !== "other" && primary ? sentence(primary.title) : "";
  const limitationCount = brief.coverage.limitedCount;
  const limitation = brief.coverage.state === "limited"
    ? typeof limitationCount === "number" && Number.isInteger(limitationCount) && limitationCount > 0
      ? `${limitationCount} checklist item${limitationCount === 1 ? " remains" : "s remain"} technically limited and should be verified manually.`
      : "See Coverage for the assessment limitations."
    : brief.attention === "limited" ? "See Coverage for the scope of the assessed evidence." : "";
  // The coverage sentence already supplies the follow-up for an empty report.
  if (!primary && brief.coverage.state === "limited" && typeof limitationCount === "number" && Number.isInteger(limitationCount) && limitationCount > 0) action = "";
  // A specific instruction already in the retained summary is more useful
  // than repeating the generic checklist fallback after it.
  const summaryHasAction = /(?:^|[.!?]\s+)(?:Review|Verify|Check|Update|Ensure|Publish|Correct|Remove|Replace|Confirm|Address)\b/.test(fact);
  const repeatsAction = Boolean(action && fact && (
    fact.toLowerCase().includes(action.replace(/[.!?]$/, "").toLowerCase()) ||
    (action === GENERIC_CHECKLIST_ACTION && summaryHasAction)
  ));
  if (repeatsAction && [brief.lead, sentence(fact), limitation].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) action = "";
  // Preserve scope/confidence before optional secondary context. Never cut a
  // source summary at a sentence boundary that might drop its qualification.
  if (fact && [brief.lead, sentence(fact), action, limitation].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) {
    sentences.push(sentence(fact));
  }
  if (action) sentences.push(action);
  if (limitation) sentences.push(limitation);
  const secondary = brief.secondary.slice(0, 2);
  if (secondary.length && secondary.every(finding => finding.title.length <= 100)) {
    const context = `Also review ${secondary.map(finding => `“${finding.title.replace(/[.!?]$/, "")}”`).join(" and ")}.`;
    if ([...sentences, context].join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) sentences.push(context);
  }

  return normalizeAssessmentCopy(sentences.join(" "));
}

export function buildAssessmentHighlights(findings: ReadonlyArray<AssessmentHighlightFinding>, scope: AssessmentScope, context: AssessmentContext = {}) {
  return renderAssessmentBrief(buildAssessmentBrief(findings, scope, context));
}
