import type { CanonicalReportExport } from "./report-export";
import { buildReportPdfV2Model } from "./report-pdf-v2-model";
import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { pdfPriorityReview, pdfPrioritySourceIds } from "./report-pdf-priorities";
import { pdfConfidenceLabel, pdfPublicWords, pdfReviewGroups, pdfOtherReviewGroups } from "./report-pdf-reader";
import { pdfSummaryTopics } from "./report-pdf-summary";
import { pdfDisplayTopic, pdfTopicForFinding, pdfTopicForRow } from "./report-pdf-topics";
import { reportStatusLabel, accessibilityReportFollowUp } from "../../lib/scans/report-status-presentation";
import { evidenceHeaderStatus } from "../../lib/scans/detailed-evidence-presentation";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import { reportFormInventory } from "./report-form-inventory";

export type ExecutiveFindingCard = { id: string; title: string; summary: string; status: string; impact: string; confidence: string; priority: boolean; target: string };
export type ExecutiveSummaryContent = {
  score: number | null; scoreScope: string; rating: string; priorityCount: number;
  metrics: Array<{ label: string; value: string; note: string; attention: boolean }>;
  findings: ExecutiveFindingCard[];
  topics: Array<{ title: string; status: string; target: string }>;
};
/** A visible excerpt only. The full canonical finding remains in the body. */
export function executiveFindingExcerpt(value: string, maximum = 250) {
  if (value.length <= maximum) return value;
  const prefix = value.slice(0, maximum);
  return `${prefix.slice(0, Math.max(prefix.lastIndexOf(" "), maximum - 25)).trimEnd()}...`;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Presentation only: keep the existing priority selection, canonical narratives,
 * framework scope and typed assessments. No evidence or scoring is derived here. */
export function reportExecutiveSummary(report: CanonicalReportExport): ExecutiveSummaryContent {
  const review = pdfPriorityReview(report), groups = pdfReviewGroups(report), narratives = pdfNarrativeFindings(report);
  const rawScore = report.reviewFocus === "ccpa_cpra" ? report.californiaScore?.score : report.score?.value;
  const score = typeof rawScore === "number" && Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 100 ? rawScore : null;
  const otherIds = new Set(pdfOtherReviewGroups(report).flatMap(group => group.observations.map(observation => observation.id)));
  const covered = new Set(review.topIssues.flatMap(pdfPrioritySourceIds));
  const findings: ExecutiveFindingCard[] = groups.map((group, index) => {
    const finding = review.topIssues[index]!, observation = group.observations[0]!;
    const packet = narratives.find(item => pdfPrioritySourceIds(finding).includes(String(item.unifiedFindingId)));
    return { id: finding.id, title: pdfPublicWords(group.title), summary: pdfPublicWords(finding.summary), status: reportStatusLabel(group.status),
      impact: observation.severity ?? (typeof packet?.severity === "string" ? packet.severity : "Not recorded"), confidence: observation.confidence ?? "Confidence not established", priority: true, target: "findings" };
  });
  for (const finding of narratives) {
    const id = String(finding.unifiedFindingId ?? "");
    if (covered.has(id)) continue;
    const presentation = object(finding.presentation);
    const topic = pdfDisplayTopic(pdfTopicForFinding(finding)) ?? "policy";
    findings.push({ id, title: pdfPublicWords(String(presentation.findingName ?? finding.title ?? id)), summary: pdfPublicWords(String(finding.summary ?? "")),
      status: id === "post_accept_consent_dependent_activity" ? "For information" : reportStatusLabel(String(finding.status ?? "Finding")),
      impact: typeof finding.severity === "string" ? finding.severity : "Not recorded", confidence: pdfConfidenceLabel(presentation.confidenceScore), priority: false, target: otherIds.has(id) ? "other-findings" : topic });
  }
  const v2 = report.artifactType === "certscore_canonical_report_export" && report.artifactVersion === "canonical-report-export-v8" && report.reviewFocus === "gdpr_eprivacy" && report.score.scope === "starting_page" ? buildReportPdfV2Model(report) : null;
  if (v2) for (const finding of findings.filter(item => !item.priority)) {
    const display = v2.findings.find(item => item.id === finding.id);
    if (display) finding.title = display.title;
  }
  const forms = reportFormInventory(report), families = report.californiaScore?.reviewCoverage?.families ?? [];
  const metrics = v2?.metrics ?? [
    { label: "Top issues", value: String(review.topIssues.length), note: `${findings.length} report findings` },
    { label: "Forms observed", value: String(forms.totalForms), note: `${forms.totalFields} retained fields${forms.limited ? "; limited coverage" : ""}` },
    { label: "Pages scanned", value: String(report.scan.pagesScanned ?? "Unknown"), note: report.fullSite ? "Observed site pages" : "Starting-page visit" },
    report.reviewFocus === "ccpa_cpra" ? { label: "California review areas", value: String(families.length || "Unknown"), note: `${families.filter(f => f.status === "observed").length} observed; ${families.filter(f => ["review", "assessed_gap"].includes(f.status)).length} review` } : { label: "Disclosure text observed", value: `${report.appendix.gdprTransparency.rows.filter(row => row.status === "Observed").length}/${report.appendix.gdprTransparency.rows.length}`, note: "Starting-page text presence; adequacy is separate." },
  ];
  const targetMap: Record<string, string> = { "Cookies and storage": "storage", "CMP and consent": "consent", "Privacy policy": "policy", "External services": "external", "Transport security": "security", Accessibility: "accessibility", Forms: "forms" };
  const topics = v2 ? v2.topics.map(topic => ({ title: topic.title, status: reportStatusLabel(topic.status), target: targetMap[topic.title] ?? topic.target }))
    : pdfSummaryTopics(report).map(topic => {
      const rows = (report.gdprEprivacyReview?.rows ?? []).filter(row => pdfDisplayTopic(pdfTopicForRow(row.id)) === topic.id);
      let status: string = evidenceHeaderStatus(rows)?.label ?? (rows.some(row => row.status === "Observed") ? "Observed" : "Not tested");
      if (topic.findings.length) status = "Review";
      if (!topic.findings.length && topic.visual.kind === "bars") status = topic.visual.unavailable ? "Partial" : "Observed";
      if (!topic.findings.length && topic.visual.kind === "services" && !topic.visual.unavailable && (topic.visual.services > 0 || topic.visual.domains > 0)) status = "Observed";
      if (topic.id === "forms") status = forms.totalForms ? "Observed" : forms.limited ? "Limited" : "Not observed";
      if (topic.id === "accessibility" && report.accessibilityAudit) status = accessibilityReportFollowUp(report.accessibilityAudit)?.label ?? "Observed";
      if (topic.id === "policy" && report.reviewFocus === "ccpa_cpra") status = families.some(row => ["review", "assessed_gap"].includes(row.status)) ? "Review" : families.some(row => row.status === "unknown") ? "Limited" : families.length ? "Observed" : "Not tested";
      return { title: topic.title, status, target: topic.id };
    });
  return { score, scoreScope: report.reviewFocus === "ccpa_cpra" || report.score.scope === "starting_page" ? "Starting-page score" : "Full-site score", rating: score === null ? "Unavailable" : report.reviewFocus === "ccpa_cpra" ? "California assessment" : getGdprEprivacyPostureTone(score).ratingLabel,
    priorityCount: review.topIssues.length, metrics: metrics.map((metric, index) => ({ ...metric, attention: Boolean(v2 && index === 2 && Number(metric.value) > 0), note: v2 && index === 1 ? "Non-essential storage. Requests separate." : pdfPublicWords(metric.note) })), findings, topics };
}
