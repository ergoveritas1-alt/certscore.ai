import { gpcReaderSummary } from "./gpc-reader-summary";
import { buildAssessmentBrief, normalizeAssessmentCopy, type AssessmentBrief, type AssessmentContext, type AssessmentHighlightFinding, type AssessmentScope } from "./assessment-brief";
import { findingEvidenceAnchor } from "./report-evidence-navigation";
export type { AssessmentHighlightFinding, AssessmentContext } from "./assessment-brief";
export type AssessmentHighlightLink = { label: string; targetId: string };

// Prefer assessed observations and an action. Technical coverage diagnostics
// remain in the retained brief and Detailed evidence, not the site assessment.
export const ASSESSMENT_HIGHLIGHTS_MAX_LENGTH = 700;
function sentence(value: string) { return /[.!?]$/.test(value) ? value : `${value}.`; }

/** Editorial copy only, over an already-projected finding. Keep observation
 * scope and semantic qualifications; omit standalone capture diagnostics. */
function highlightFacts(summary: string, id: string | null) {
  let copy = id === "gpc_response" ? gpcReaderSummary(summary) : summary;
  if (id === "gpc_response") {
    copy = copy.replace(/GPC causation is not established\.\s*/g, "")
      .replace(/Bounded GPC observation was limited\.\s*/g, "")
      .replace(/Main-document GPC delivery was not fully verified\.\s*/g, "")
      .replace(/Request coverage was limited\.\s*/g, "")
      .replace(/CMP-recorded sale state: unknown; sharing state: unknown\.\s*/g, "")
      .replace(/CMP-recorded sale state: unknown; sharing state: (opted out|not opted out)\./g, "CMP-recorded sharing state: $1.")
      .replace(/CMP-recorded sale state: (opted out|not opted out); sharing state: unknown\./g, "CMP-recorded sale state: $1.");
  }
  return normalizeAssessmentCopy(copy
    .replace(/^(?:Partial support from scan evidence; |Potential issue based on scan evidence; )/, "")
    .replace(/Essentiality was not confirmed for every item\.\s*/g, "")
    .replace(/Scan evidence only partially supports this finding\.\s*/g, ""));
}

export function renderAssessmentBrief(brief: AssessmentBrief) {
  if (!brief.primary && brief.attention === "limited") return "Review the retained evidence for this visit.";
  const sentences = [brief.lead];
  let action = brief.firstAction && brief.firstAction.length <= 300
    ? sentence(brief.firstAction)
    : brief.primary ? "Review the supporting evidence and recommended fixes in Detailed evidence." : "";
  const primary = brief.primary;
  const genericSummary = primary?.readerSummary === "Potential issue based on scan evidence.";
  const fact = primary?.readerSummary && !genericSummary && primary.readerSummary.replace(/[.!?]$/, "").toLowerCase() !== primary.title.replace(/[.!?]$/, "").toLowerCase()
    ? highlightFacts(primary.readerSummary, primary.id) : primary?.domain !== "other" && primary ? sentence(primary.title) : "";
  if (primary?.id === "gpc_response" && fact) {
    const evidenceLead = sentence(`“${primary.readerTitle}”: ${fact}`);
    const paragraph = [evidenceLead, action].filter(Boolean).join(" ");
    if (paragraph.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) return normalizeAssessmentCopy(paragraph);
  }
  if ([brief.lead, action].filter(Boolean).join(" ").length > ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) {
    action = "Review the supporting evidence and recommended fixes in Detailed evidence.";
  }
  // Reserve room for an already-projected Reject observation even when storage
  // leads the assessment. Keep its observed scope and action semantics.
  const behavior = brief.secondary.find(finding =>
    finding.id === "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction" &&
    finding.readerSummary && finding.readerSummary !== "Potential issue based on scan evidence." &&
    finding.readerTitle.length <= 100);
  const behaviorFact = behavior ? sentence(`“${behavior.readerTitle}”: ${highlightFacts(behavior.readerSummary, behavior.id)}`) : "";
  const behaviorFits = Boolean(behaviorFact && [brief.lead, behaviorFact, action].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  // Preserve scope/confidence before optional secondary context. Never cut a
  // source summary at a sentence boundary that might drop its qualification.
  if (fact && [brief.lead, sentence(fact), behaviorFits ? behaviorFact : "", action].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH) {
    const namedFact = primary && primary.readerTitle.length <= 100 && !brief.lead.includes(`“${primary.readerTitle}”`)
      ? fact === sentence(primary.title) ? `“${primary.readerTitle}”` : `“${primary.readerTitle}”: ${fact}` : fact;
    sentences.push(sentence([brief.lead, sentence(namedFact), behaviorFits ? behaviorFact : "", action].filter(Boolean).join(" ").length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH ? namedFact : fact));
  }
  if (behaviorFits) sentences.push(behaviorFact);
  if (action) sentences.push(action);
  const secondary = brief.secondary.filter(finding => !behaviorFits || finding !== behavior).slice(0, 2);
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
  if (text.includes("Detailed evidence")) links.push({ label: "Detailed evidence", targetId: "evidence" });
  return { text, links };
}
