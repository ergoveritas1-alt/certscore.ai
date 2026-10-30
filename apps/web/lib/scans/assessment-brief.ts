import { assessmentHighlightProminence, selectAssessmentHighlightFindings, supportingAssessmentHighlightOrder } from "./assessment-highlight-selection";
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
  evidenceJson?: Record<string, unknown>;
};
export type AssessmentScope = { kind: "page" } | { kind: "site"; scannedPages: number | null };
/** Contextual results describe proved observations only. Actions belong to
 * eligible projected findings, never unresolved coverage/review statuses. */
export type AssessmentResultSummary = {
  facts: readonly string[]; targetId: string; sourceRefs: readonly string[];
};
export type AssessmentContext = {
  score?: number | null;
  coverage?: { state: "complete" | "limited" | "unknown"; limitedCount?: number; items?: readonly { id: string; title: string }[] };
  assessmentResult?: AssessmentResultSummary | null;
};
type Domain = "privacy" | "accessibility" | "security" | "maintenance" | "other";
export type AssessmentAttention = "high_priority" | "needs_work" | "attention" | "targeted_improvements" | "review" | "no_priority_observed" | "limited";

export function normalizeAssessmentCopy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** Members are already-projected findings, not raw accessibility observations. */
function accessibilityMembers(finding: AssessmentHighlightFinding): AssessmentHighlightFinding[] {
  if (finding.id !== "accessibility_priority_group" || !Array.isArray(finding.evidenceJson?.findings)) return [];
  return finding.evidenceJson.findings.filter((value): value is AssessmentHighlightFinding =>
    Boolean(value && typeof value === "object" && typeof value.id === "string" && typeof value.title === "string"
      && typeof value.summary === "string"));
}

/** Reader labels over already-projected identities, never a new assessment. */
function readerTitle(finding: AssessmentHighlightFinding): string {
  if (finding.id === "california_collection_review" && finding.title === "Collection under privacy-choice conditions — review recommended") return "Collection under privacy-choice conditions";
  if (finding.id === "regulatory_gap__gdpr_eprivacy__transport_security_http_redirect") return "HTTP-to-HTTPS redirect review";
  if (finding.id === "regulatory_gap__gdpr_eprivacy__consent_surface_observed" && finding.summary === "Not confirmed by scan evidence; The canonical pre-interaction consent assessment was limited, so consent-surface presence was not confirmed from retained evidence.") return "Consent interface not confirmed";
  if (finding.id === "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction" && finding.title === "Post-choice tracking reduction") return "Activity after a Reject click — review";
  if (finding.id === "regulatory_gap__gdpr_eprivacy__options_settings_preferences_control") return "Consent settings access review";
  if (finding.id === "visual_contrast_accessibility_issue") return finding.summary?.startsWith("Low-contrast text was detected") ? "Low text contrast" : "Text contrast and color cues";
  if (finding.id === "accessibility_priority_group" && Array.isArray(finding.evidenceJson?.findings)) {
    const members = finding.evidenceJson.findings.filter((value): value is AssessmentHighlightFinding =>
      Boolean(value && typeof value === "object" && typeof value.title === "string"));
    if (members.length) {
      const label = members.slice(0, 2).map(readerTitle).join(" and ") + (members.length > 2 ? " and other accessibility checks" : "");
      if (label.length <= 100) return label;
      const first = readerTitle(members[0]!);
      return first.length <= 65 ? `${first} and other accessibility checks` : normalizeAssessmentCopy(finding.title);
    }
  }
  return normalizeAssessmentCopy(finding.title);
}

function readerAction(finding: AssessmentHighlightFinding, action: string): string {
  if (finding.id === "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction" && action === "Ensure a confirmed Reject suppresses optional tracker requests and storage writes, then retest the same post-Refusal observation window.") {
    return "Update optional services to respect Reject, then retest tracking and storage after Reject.";
  }
  return action;
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
  if (id === "gpc_response" || family === "gpc") return { domain: "privacy", topic: "the site's response to Global Privacy Control" };
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
  const priorityFindings = selectAssessmentHighlightFindings(findings);
  const privacy = findMissingPrivacyPolicyHighlight(priorityFindings);
  const highlighted = privacy ? [privacy, ...priorityFindings.filter(finding => finding !== privacy)] : priorityFindings;
  // Rank only already-projected findings. A supported gap should not hide
  // behind a review row, and a low-severity maintenance item belongs last.
  const rank = (finding: AssessmentHighlightFinding) => finding.severity === "low" ? 2
    : finding.status === "Potential gap" || finding.severity === "critical" || finding.severity === "high" ? 0 : 1;
  const supporting = (finding: AssessmentHighlightFinding) => assessmentHighlightProminence(finding, findings) === "supporting";
  const ordered = [...highlighted].sort((left, right) => Number(supporting(left)) - Number(supporting(right))
    || (supporting(left) && supporting(right) ? supportingAssessmentHighlightOrder(left) - supportingAssessmentHighlightOrder(right) : 0)
    || rank(left) - rank(right));
  const sources = ordered.map(finding => ({
    readerMembers: accessibilityMembers(finding),
    sourceRef: finding.id ?? `projected-finding:${findings.indexOf(finding) + 1}`,
    prominence: assessmentHighlightProminence(finding, findings),
    id: finding.id ?? null,
    title: normalizeAssessmentCopy(finding.title),
    readerTitle: readerTitle(finding),
    summary: normalizeAssessmentCopy(finding.summary ?? ""),
    readerSummary: finding.id === "regulatory_gap__gdpr_eprivacy__privacy_notice_availability"
      ? "Privacy policy not found within the assessed scope."
      : normalizeAssessmentCopy(accessibilityMembers(finding).map(member => member.summary).join(" ") || finding.summary || ""),
    status: finding.status ?? "unknown",
    severity: finding.severity ?? null,
    priority: finding.priority ?? null,
    ...topicFor(finding),
    actions: (finding.correctionSteps ?? []).map(normalizeAssessmentCopy).filter(Boolean).map(action => readerAction(finding, action)),
  }));
  const primary = sources[0] ?? null;
  const coverage = context.coverage ?? { state: "unknown" as const };
  const score = typeof context.score === "number" && Number.isFinite(context.score) && context.score >= 0 && context.score <= 100 ? context.score : null;
  const scoreBand = score === null ? null : getGdprEprivacyPostureTone(score).ratingLabel;
  // The lead names the primary finding's domain, so a secondary finding must
  // not lend its priority to that lead (for example, accessibility -> privacy).
  const explicitHigh = primary?.severity === "critical" || primary?.severity === "high" || primary?.priority === "high";
  const allExplicitLow = sources.length > 0 && sources.every(finding => finding.severity === "low" && finding.priority !== "high");
  const hasGap = primary?.status === "Potential gap";
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
    findingCount: sources.length,
    primary,
    secondary: sources.slice(1),
    firstAction: primary?.actions[0] ?? null,
    sourceRefs: sources.map(source => source.sourceRef),
    assessmentResult: context.assessmentResult ?? null,
  };
}
export type AssessmentBrief = ReturnType<typeof buildAssessmentBrief>;
