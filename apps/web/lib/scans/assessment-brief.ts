import { findMissingPrivacyPolicyHighlight } from "./missing-privacy-policy-highlight";
import { getGdprEprivacyPostureTone } from "./regulatory-coverage-score";
import { SCORING_RULE_BY_ID } from "./scoring-policy";

export const ASSESSMENT_BRIEF_VERSION = "certscore.assessment-brief.v1";
export type AssessmentHighlightFinding = {
  id?: string;
  title: string;
  summary?: string | null;
  status?: string;
  priority?: "high";
  /** Only explicit canonical severity; never the generic checklist-card severity. */
  severity?: "critical" | "high" | "medium" | "low";
  correctionSteps?: readonly string[];
};
export type AssessmentScope = { kind: "page" } | { kind: "site"; scannedPages: number | null };
export type AssessmentContext = {
  score?: number | null;
  coverage?: { state: "complete" | "limited" | "unknown"; limitedCount?: number };
};
type Domain = "privacy" | "accessibility" | "security" | "maintenance" | "other";
export type AssessmentAttention = "high_priority" | "needs_work" | "attention" | "targeted_improvements" | "review" | "no_priority_observed" | "limited";

export function normalizeAssessmentCopy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** Editorial topic labels for existing finding identities, never eligibility or severity rules. */
function topicFor(finding: AssessmentHighlightFinding): { domain: Domain; topic: string } {
  const id = (finding.id ?? "").replace(/^regulatory_gap__gdpr_eprivacy__/, "");
  const family = SCORING_RULE_BY_ID.get(id)?.family;
  if (id === "accessibility_priority_group" || family === "accessibility") return { domain: "accessibility", topic: "accessibility" };
  if (id === "site_integrity_cms_security") return { domain: "maintenance", topic: "the site's software maintenance" };
  if (id === "acceptance_signal_contradicts_action") return { domain: "privacy", topic: "how the site records a visitor's consent choice" };
  if (family === "post_refusal_enforcement") return { domain: "privacy", topic: "how the site responds to a visitor's rejection" };
  if (family === "consent_controls") return { domain: "privacy", topic: id === "reject_all_path_availability" ? "the visitor's ability to refuse optional activity" : "visitor consent choices" };
  if (family === "pre_consent_storage") return { domain: "privacy", topic: "cookies and storage before consent" };
  if (family === "pre_consent_tracking") return { domain: "privacy", topic: "activity before consent" };
  if (family === "policy_transparency") return { domain: "privacy", topic: "privacy disclosures" };
  if (family === "gpc") return { domain: "privacy", topic: "the site's response to Global Privacy Control" };
  if (family === "sensitive_runtime" || family === "tracking_technology") return { domain: "privacy", topic: "tracking and data collection" };
  if (family === "embedded_third_party") return { domain: "privacy", topic: "third-party content loaded before consent" };
  if (family === "transport_security") return { domain: "security", topic: "connection security" };
  if (family === "site_integrity") return { domain: "security", topic: "unexpected hidden links" };
  return { domain: "other", topic: finding.title.length <= 120 ? `“${normalizeAssessmentCopy(finding.title).replace(/[.!?]$/, "")}”` : "the leading reported issue" };
}

export function buildAssessmentBrief(
  findings: ReadonlyArray<AssessmentHighlightFinding>,
  scope: AssessmentScope,
  context: AssessmentContext = {},
) {
  const privacy = findMissingPrivacyPolicyHighlight(findings);
  const highlighted = privacy ? [privacy, ...findings.filter(finding => finding !== privacy)] : findings;
  // A known low-severity maintenance item must not precede a canonical gap.
  const ordered = [...highlighted.filter(finding => finding.severity !== "low"), ...highlighted.filter(finding => finding.severity === "low")];
  const sources = ordered.map(finding => ({
    sourceRef: finding.id ?? `projected-finding:${findings.indexOf(finding) + 1}`,
    id: finding.id ?? null,
    title: normalizeAssessmentCopy(finding.title),
    summary: normalizeAssessmentCopy(finding.summary ?? ""),
    readerSummary: finding.id === "regulatory_gap__gdpr_eprivacy__privacy_notice_availability"
      ? "Privacy policy not found within the assessed scope."
      : normalizeAssessmentCopy(finding.summary ?? ""),
    status: finding.status ?? "unknown",
    severity: finding.severity ?? null,
    priority: finding.priority ?? null,
    ...topicFor(finding),
    actions: (finding.correctionSteps ?? []).map(normalizeAssessmentCopy).filter(Boolean),
  }));
  const primary = sources[0] ?? null;
  const coverage = context.coverage ?? { state: "unknown" as const };
  const score = typeof context.score === "number" && Number.isFinite(context.score) && context.score >= 0 && context.score <= 100 ? context.score : null;
  const scoreBand = score === null ? null : getGdprEprivacyPostureTone(score).ratingLabel;
  const explicitHigh = sources.some(finding => finding.severity === "critical" || finding.severity === "high" || finding.priority === "high");
  const allExplicitLow = sources.length > 0 && sources.every(finding => finding.severity === "low" && finding.priority !== "high");
  const hasGap = sources.some(finding => finding.status === "Potential gap");
  let attention: AssessmentAttention;
  let basis: string;
  if (scoreBand === "High-priority remediation") {
    attention = "high_priority"; basis = "existing_score_band";
  } else if (scoreBand === "Needs work") {
    attention = "needs_work"; basis = "existing_score_band";
  } else if (allExplicitLow) {
    attention = "targeted_improvements"; basis = "all_findings_explicitly_low_severity";
  } else if (explicitHigh || hasGap) {
    attention = "attention"; basis = explicitHigh ? "explicit_canonical_priority" : "projected_gap";
  } else if (sources.length) {
    attention = "review"; basis = "projected_review_findings";
  } else if (coverage.state !== "complete") {
    attention = "limited"; basis = "no_priority_findings_with_incomplete_or_unknown_coverage";
  } else {
    attention = "no_priority_observed"; basis = "no_priority_findings_in_completed_assessment";
  }
  // Confidence/coverage and importance are independent. No score or missing
  // finding can turn unknown evidence into a positive observation.
  const domainLead = primary?.domain === "privacy" ? "A privacy concern" : primary?.domain === "accessibility" ? "Accessibility" : primary?.domain === "security" ? "A security concern" : primary?.domain === "maintenance" ? "Software maintenance" : "A reported issue";
  const topic = primary?.topic;
  const lead = attention === "high_priority" ? `This assessment calls for high-priority remediation${topic ? `, starting with ${topic}` : ""}.`
    : attention === "needs_work" ? `This assessment needs work${topic ? `, with ${topic} the first area to review` : ""}.`
    : attention === "attention" ? `${domainLead} needs attention${scope.kind === "page" ? " on this page" : " in this assessment"}.`
    : attention === "targeted_improvements" ? `The findings point to targeted improvements${topic ? ` in ${topic}` : ""}.`
    : attention === "review" ? `The assessment calls for focused review${topic ? ` of ${topic}` : ""}.`
    : "No priority issues were identified in the assessed evidence.";
  return {
    contractVersion: ASSESSMENT_BRIEF_VERSION,
    scope, score, scoreBand, attention, basis, lead, coverage,
    findingCount: findings.length,
    primary,
    secondary: sources.slice(1),
    firstAction: primary?.actions[0] ?? (coverage.state === "limited" ? "Review the limited checks in Coverage and verify them manually." : null),
    sourceRefs: sources.map(source => source.sourceRef),
  };
}
export type AssessmentBrief = ReturnType<typeof buildAssessmentBrief>;
