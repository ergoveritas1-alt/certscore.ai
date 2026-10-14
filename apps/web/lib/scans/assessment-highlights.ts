import { buildAssessmentBrief, normalizeAssessmentCopy, type AssessmentBrief, type AssessmentContext, type AssessmentHighlightFinding, type AssessmentScope } from "./assessment-brief";
import { evidenceRowAnchor, findingEvidenceAnchor } from "./report-evidence-navigation";
export type { AssessmentHighlightFinding, AssessmentContext } from "./assessment-brief";
export type AssessmentHighlightLink = { label: string; targetId: string };

// Prefer three useful sentences; keep full evidence qualifications and actions.
export const ASSESSMENT_HIGHLIGHTS_MAX_LENGTH = 700;
function sentence(value: string) { return /[.!?]$/.test(value) ? value : `${value}.`; }

export function renderAssessmentBrief(brief: AssessmentBrief) {
  const sentences = [brief.lead];
  let action = brief.firstAction && brief.firstAction.length <= 300
    ? sentence(brief.firstAction)
    : brief.primary ? "Review the supporting evidence and recommended fixes in Detailed evidence." : "";
  const primary = brief.primary;
  const genericSummary = primary?.readerSummary === "Potential issue based on scan evidence.";
  const fact = primary?.readerSummary && !genericSummary && primary.readerSummary.replace(/[.!?]$/, "").toLowerCase() !== primary.title.replace(/[.!?]$/, "").toLowerCase()
    ? primary.readerSummary : primary?.domain !== "other" && primary ? sentence(primary.title) : "";
  const items = brief.coverage.items;
  const namedItems: { id: string; title: string }[] = [];
  for (const item of items ?? []) {
    if (item.title.length <= 100 && namedItems.length < 3 && namedItems.reduce((sum, row) => sum + row.title.length, 0) + item.title.length <= 150) namedItems.push(item);
  }
  const limitation = brief.coverage.state === "limited" && items?.length === 0 ? ""
    : brief.coverage.state === "limited" && namedItems.length
      ? `Could not complete: ${namedItems.map(item => `“${item.title}”`).join(", ")}.${items!.length > namedItems.length ? " Other incomplete checks are listed in Detailed evidence." : ""}`
      : brief.coverage.state === "limited" ? "See Detailed evidence for checks that could not be completed."
        : brief.attention === "limited" ? "Review the scan coverage in Detailed evidence." : "";
  if ([brief.lead, action, limitation].filter(Boolean).join(" ").length > ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) {
    action = "Review the supporting evidence and recommended fixes in Detailed evidence.";
  }
  // Preserve scope/confidence before optional secondary context. Never cut a
  // source summary at a sentence boundary that might drop its qualification.
  if (fact && [brief.lead, sentence(fact), action, limitation].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) {
    const namedFact = primary && primary.readerTitle.length <= 100
      ? fact === sentence(primary.title) ? `“${primary.readerTitle}”` : `“${primary.readerTitle}”: ${fact}` : fact;
    sentences.push(sentence([brief.lead, sentence(namedFact), action, limitation].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH ? namedFact : fact));
  }
  if (action) sentences.push(action);
  if (limitation) sentences.push(limitation);
  const secondary = brief.secondary.slice(0, 2);
  if (secondary.length && secondary.every(finding => finding.readerTitle.length <= 100)) {
    const context = `Also review ${secondary.map(finding => `“${finding.readerTitle.replace(/[.!?]$/, "")}”`).join(" and ")}.`;
    if ([...sentences, context].join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) sentences.push(context);
  }

  return normalizeAssessmentCopy(sentences.join(" "));
}

export function buildAssessmentHighlights(findings: ReadonlyArray<AssessmentHighlightFinding>, scope: AssessmentScope, context: AssessmentContext = {}) {
  return renderAssessmentBrief(buildAssessmentBrief(findings, scope, context));
}

/** Link only named projected checks actually included in the highlight prose. */
export function buildAssessmentHighlightsPresentation(findings: ReadonlyArray<AssessmentHighlightFinding>, scope: AssessmentScope, context: AssessmentContext = {}) {
  const brief = buildAssessmentBrief(findings, scope, context);
  const text = renderAssessmentBrief(brief);
  const links: AssessmentHighlightLink[] = [brief.primary, ...brief.secondary].flatMap(finding => {
    if (!finding) return [];
    const label = [`“${finding.readerTitle}”`, `“${finding.readerTitle.replace(/[.!?]$/, "")}”`].find(label => text.includes(label));
    return label ? [{ label, targetId: findingEvidenceAnchor(finding.id ?? "") }] : [];
  });
  for (const item of brief.coverage.items ?? []) {
    if (text.includes(`“${item.title}”`)) links.push({ label: `“${item.title}”`, targetId: evidenceRowAnchor(item.id) });
  }
  if (text.includes("Detailed evidence")) links.push({ label: "Detailed evidence", targetId: "evidence" });
  return { text, links };
}
