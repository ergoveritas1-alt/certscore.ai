import { assessmentHighlightAction, assessmentHighlightFacts, isAssessmentReferral } from "./assessment-highlight-copy";
import { buildAssessmentBrief, normalizeAssessmentCopy, type AssessmentBrief, type AssessmentContext, type AssessmentHighlightFinding, type AssessmentScope } from "./assessment-brief";
import { findingEvidenceAnchor } from "./report-evidence-navigation";
export type { AssessmentHighlightFinding, AssessmentContext } from "./assessment-brief";
export type AssessmentHighlightLink = { label: string; targetId: string };
export type AssessmentHighlightCopy = { text: string; links: AssessmentHighlightLink[] };
export type AssessmentHighlightsPresentation = AssessmentHighlightCopy & { expanded?: AssessmentHighlightCopy };

export const ASSESSMENT_HIGHLIGHTS_MAX_LENGTH = 500;
export const ASSESSMENT_HIGHLIGHTS_EXPANDED_MAX_LENGTH = 1000;
type Finding = NonNullable<AssessmentBrief["primary"]>;
function sentence(value: string) { return /[.!?]$/.test(value) ? value : `${value}.`; }
function label(finding: Finding) { return `“${finding.readerTitle.replace(/[.!?]$/, "")}”`; }
const rank = (finding: Finding) => finding.severity === "critical" ? 0
  : finding.severity === "high" || finding.status === "Potential gap" ? 1
  : finding.severity === "low" ? 3 : 2;

/** Breadth within priority tiers, using projected topics only. Keep the canonical lead. */
function* diverseFindings(brief: AssessmentBrief) {
  if (!brief.primary) return;
  const ordered = [brief.primary];
  yield brief.primary;
  const remaining = [...brief.secondary];
  while (remaining.length) {
    const tier = Math.min(...remaining.map(rank));
    const candidates = remaining.filter(finding => rank(finding) === tier);
    const next = candidates.find(finding => !ordered.some(shown => shown.domain === finding.domain))
      ?? candidates.find(finding => !ordered.some(shown => shown.topic === finding.topic)) ?? candidates[0]!;
    ordered.push(next);
    yield next;
    remaining.splice(remaining.indexOf(next), 1);
  }
}

type Rendered = { text: string; selected: Finding[]; facts: Map<Finding, string> };

function render(brief: AssessmentBrief, limit: number, required?: Rendered): Rendered {
  if (!brief.primary && brief.assessmentResult?.sourceRefs.length) {
    const text = normalizeAssessmentCopy(brief.assessmentResult.facts.join(" "));
    if (brief.assessmentResult.facts.length && text.length <= limit) return { text, selected: [], facts: new Map() };
  }
  if (!brief.primary) return { text: brief.coverage.state === "complete"
    ? "No priority issues were identified in the assessed evidence." : "No priority findings are available from this visit.", selected: [], facts: new Map() };
  const action = sentence(assessmentHighlightAction(brief.primary));
  const selected = [...(required?.selected ?? [])];
  const facts = new Map<Finding, string>(required?.facts);
  const compose = () => {
    const primaryReferral = selected[0] && !facts.has(selected[0]) ? `${label(selected[0])}.` : "";
    const observations = selected.filter(finding => facts.has(finding)).map(finding => sentence(`${label(finding)}: ${facts.get(finding)}`));
    const titles = selected.filter((finding, index) => index > 0 && !facts.has(finding)).map(label);
    const referrals = titles.length ? `Other findings: ${titles.length < 3 ? titles.join(" and ") : `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`}.` : "";
    const primaryNotShown = brief.primary?.prominence === "supporting" && !selected.includes(brief.primary);
    return normalizeAssessmentCopy([primaryReferral, ...observations, referrals, primaryNotShown || [...facts.values()].some(fact => fact.includes(action)) ? "" : action].filter(Boolean).join(" "));
  };
  // Reserve a small part of the collapsed budget for evidence, instead of filling it with titles.
  const maxFindings = limit === ASSESSMENT_HIGHLIGHTS_MAX_LENGTH ? 3 : 8;
  for (const finding of diverseFindings(brief)) {
    if (selected.length >= maxFindings) break;
    if (finding.prominence === "supporting") continue;
    if (selected.includes(finding) || finding.readerTitle.length > 100) continue;
    selected.push(finding);
    if (compose().length > limit) selected.pop();
  }
  selected.sort((left,right)=>Number(left.prominence==="supporting")-Number(right.prominence==="supporting"));
  for (const finding of selected) {
    const summary = finding.readerSummary;
    if (!summary || isAssessmentReferral(summary) || summary.replace(/[.!?]$/, "") === finding.readerTitle.replace(/[.!?]$/, "")) continue;
    const previous = facts.get(finding);
    const variants = assessmentHighlightFacts(summary, finding.id, finding.prominence === "supporting");
    // Add concise whole facts across the expansion before spending spare room
    // on richer variants. Facts already visible in the collapsed copy stay intact.
    for (const variant of required ? [...variants].reverse() : variants) {
      if (previous && variant.length < previous.length) continue;
      facts.set(finding, variant);
      if (compose().length <= limit) break;
      if (previous) facts.set(finding, previous);
      else facts.delete(finding);
    }
  }
  if (required) {
    for (const finding of selected) {
      if (finding.prominence === "supporting") continue;
      const previous = facts.get(finding);
      if (!previous) continue;
      for (const variant of assessmentHighlightFacts(finding.readerSummary, finding.id, finding.prominence === "supporting")) {
        if (variant.length <= previous.length) continue;
        facts.set(finding, variant);
        if (compose().length <= limit) break;
        facts.set(finding, previous);
      }
    }
  }
  // Supporting findings use only remaining space after stronger observations
  // and their action. Never include an unqualified title as narrative filler.
  for (const finding of diverseFindings(brief)) {
    if (selected.length >= maxFindings) break;
    if (finding.prominence !== "supporting" || selected.includes(finding) || finding.readerTitle.length > 100) continue;
    if (!finding.readerSummary || isAssessmentReferral(finding.readerSummary)) continue;
    selected.push(finding);
    let fits = false;
    const tryWholeFacts = () => {
      for (const variant of assessmentHighlightFacts(finding.readerSummary, finding.id, true)) {
        facts.set(finding, variant);
        if (compose().length <= limit) return true;
      }
      return false;
    };
    fits = tryWholeFacts();
    // Existing concise variants preserve the stronger observation and action.
    // Prefer useful breadth over repeated measurements, never clip prose or
    // shorten a qualification, and never remove facts shown in collapsed copy.
    const previousFacts = new Map(facts);
    if (!fits && !required) {
      for (const shown of selected) {
        if (shown.prominence !== "priority" || !facts.has(shown)) continue;
        const variants = assessmentHighlightFacts(shown.readerSummary, shown.id);
        const concise = [...variants].sort((a,b)=>a.length-b.length)[0];
        if (concise && concise.length < facts.get(shown)!.length) facts.set(shown,concise);
      }
      fits = tryWholeFacts();
      if (!fits) { facts.clear(); for (const [shown,fact] of previousFacts) facts.set(shown,fact); }
    }
    if (!fits) { selected.pop(); facts.delete(finding); }
  }
  return { text: selected.length || brief.primary.prominence !== "supporting" ? compose() : "No priority findings are available from this visit.", selected, facts };
}

function linksFor(text: string, selected: Finding[]): AssessmentHighlightLink[] {
  const links = selected.filter(finding => text.includes(label(finding)))
    .map(finding => ({ label: label(finding), targetId: findingEvidenceAnchor(finding.id ?? "") }));
  if (text.includes("Detailed evidence")) links.push({ label: "Detailed evidence", targetId: "evidence" });
  return links;
}

export function renderAssessmentBrief(brief: AssessmentBrief) {
  return render(brief, ASSESSMENT_HIGHLIGHTS_MAX_LENGTH).text;
}

export function buildAssessmentHighlights(findings: ReadonlyArray<AssessmentHighlightFinding>, scope: AssessmentScope, context: AssessmentContext = {}) {
  return renderAssessmentBrief(buildAssessmentBrief(findings, scope, context));
}

/** Both lengths are editorial projections of the same canonical findings. Never cut qualifications. */
export function buildAssessmentHighlightsPresentation(findings: ReadonlyArray<AssessmentHighlightFinding>, scope: AssessmentScope, context: AssessmentContext = {}): AssessmentHighlightsPresentation {
  const brief = buildAssessmentBrief(findings, scope, context);
  const collapsed = render(brief, ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  const expanded = render(brief, ASSESSMENT_HIGHLIGHTS_EXPANDED_MAX_LENGTH, collapsed);
  const resultLinks = !brief.primary && brief.assessmentResult && collapsed.text.includes(brief.assessmentResult.facts[0] ?? "")
    ? brief.assessmentResult.facts.map(label => ({ label, targetId: brief.assessmentResult!.targetId })) : [];
  return { text: collapsed.text, links: [...resultLinks, ...linksFor(collapsed.text, collapsed.selected)],
    ...(expanded.text !== collapsed.text ? { expanded: { text: expanded.text, links: linksFor(expanded.text, expanded.selected) } } : {}) };
}
