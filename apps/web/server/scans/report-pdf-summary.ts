import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { evidenceSectionCounts } from "../../lib/scans/detailed-evidence-presentation";
import { buildAssessmentHighlights } from "../../lib/scans/assessment-highlights";
import { projectConsentControlReport } from "../../lib/scans/consent-control-report";
import { accessibilityRuleTitle } from "../../lib/scans/accessibility-report";
import type { CanonicalReportExport } from "./report-export";
import { PDF_REPORT_TOPICS, pdfTopicOverview } from "./report-pdf-topics";
import { pdfReviewGroups, pdfInventoryRows } from "./report-pdf-reader";

const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : undefined;

/** Same assessment writer as the scan report, using only projected findings and retained score/coverage. */
export function pdfSiteAssessment(report: CanonicalReportExport) {
  if (report.gdprEprivacyReview?.rows.length) {
    const groups = pdfReviewGroups(report);
    if (groups.length) {
      const order = ["initial-tracking", "refusal", "privacy-notice"];
      const selected = groups.filter(group => group.status === "Gap observed").sort((left, right) => {
        const rank = (id: string) => order.includes(id) ? order.indexOf(id) : order.length;
        return rank(left.id) - rank(right.id);
      }).slice(0, 3);
      if (selected.length) {
        const facts = selected.map(group => {
          const observation = group.observations.find(item => item.status === "Gap observed") ?? group.observations[0]!;
          if (observation.id === "privacy_notice_availability") return "No reachable privacy notice was found in the tested context.";
          if (observation.id === "pre_consent_third_party_tracking") {
            const vendors = /^Tracking-classified requests were observed before consent: ([\s\S]+)\. The first (?:retained )?qualifying request was /.exec(observation.explanation)?.[1];
            if (vendors) return `Requests from ${vendors} were observed before a consent choice.`;
          }
          if (observation.id === "post_reject_tracking_reduction" && observation.explanation === "Eligible non-essential tracking activity was observed after the refusal confirmation during the measured post-Reject window.")
            return "Non-essential activity was also observed after Reject was confirmed during the measured observation window.";
          return observation.explanation;
        });
        const actions = selected.map(group => group.id === "initial-tracking" ? "gate optional integrations before consent" : group.id === "refusal" ? "verify that Reject suppresses optional activity" : group.id === "privacy-notice" ? "make the privacy notice accessible" : null).filter(Boolean);
        return [...facts, ...(actions.length ? [`Prioritize these fixes: ${actions.join("; ")}. Then re-test this page.`] : [])].join(" ");
      }
      const review = groups[0]!.observations[0]!;
      return `${review.explanation} Review the supporting evidence and recommended checks before drawing a stronger conclusion.`;
    }
  }
  const findings = pdfNarrativeFindings(report).map(finding => {
    const packet = object(finding);
    const presentation = object(packet.presentation);
    const severity = ["critical", "high", "medium", "low"].includes(String(packet.severity))
      ? packet.severity as "critical" | "high" | "medium" | "low" : undefined;
    const action = string(presentation.suggestedFix);
    return { id: string(packet.unifiedFindingId), title: string(presentation.findingName) ?? string(packet.title) ?? string(packet.unifiedFindingId) ?? "Retained finding",
      summary: string(presentation.findingDescription) ?? string(presentation.description) ?? string(packet.summary),
      severity, status: string(packet.status), correctionSteps: action ? [action] : [],
    };
  });
  const limited = report.executiveSummary.counts.technicalLimitation;
  return buildAssessmentHighlights(findings, { kind: "page" }, { score: report.score?.value,
    coverage: { state: limited > 0 ? "limited" : report.gdprEprivacyReview?.rows.length ? "complete" : "unknown", limitedCount: limited } });
}

export type SummaryVisual =
  | { kind: "choices"; choices: Array<{ label: string; status: string }> | null; provider?: string; caption: string }
  | { kind: "bars"; bars: Array<{ label: string; value: number }>; caption: string; unavailable: boolean }
  | { kind: "matrix"; observed: number; review: number; other: number; caption: string }
  | { kind: "flow"; forms: number; fields: number; caption: string }
  | { kind: "checks"; checks: Array<{ label: string; status: string }>; caption: string }
  | { kind: "network"; domains: string[]; caption: string; unavailable: boolean }
  | { kind: "certificate"; status: string; caption: string }
  | { kind: "transport"; checks: Array<{ label: string; status: string }>; caption: string }
  | { kind: "services"; services: number; domains: number; purposes: Array<{ label: string; value: number }>; caption: string; unavailable: boolean }
  | { kind: "columns"; counts: number[]; caption: string; unavailable: boolean; rules?: number; reviewItems?: number; failures?: number; nodes?: number; issues?: string[] };

/** Topic-specific inventory/assessment graphics; these never classify or manufacture findings. */
export function pdfSummaryTopics(report: CanonicalReportExport) {
  const controls = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  const runtime = report.appendix.cookieAndTrackerInventory;
  const inventoryUnavailable = runtime.presentationStatus === "insufficient_evidence";
  const rows = report.gdprEprivacyReview?.rows ?? [];
  const disclosures = report.appendix.gdprTransparency.rows;
  const disclosureCounts = evidenceSectionCounts(disclosures);
  const forms = report.appendix.dataCollectionSurfaces;
  const external = pdfInventoryRows(report).external;
  const domains = [...new Set(external.flatMap(row => row.domains))];
  const expiry = report.appendix.evidenceDossier?.checklistDetails.find(row => row.id === "transport_security_tls_certificate")?.facts.find(fact => /(?:^|\/ )validTo$/.test(fact.label))?.value;
  const parsedExpiry = expiry ? new Date(expiry) : null;
  const expiryLabel = parsedExpiry && Number.isFinite(parsedExpiry.getTime()) ? `Expires ${parsedExpiry.toISOString().slice(0, 10)}` : "Certificate evidence";
  const audit = report.accessibilityAudit;
  const purposeLabels: Record<string, string> = { "Session replay": "Replay", "Consent management": "Consent tools", "Consent Management": "Consent tools" };
  const purposes = [...new Set(external.flatMap(row => row.purpose))].map(purpose => ({ label: purposeLabels[purpose] ?? purpose, value: external.filter(row => row.purpose.includes(purpose)).length }));
  const visuals: Record<typeof PDF_REPORT_TOPICS[number]["id"], SummaryVisual> = {
    consent: { kind: "choices", choices: controls ? Object.entries(controls.controls).map(([key, status]) => ({ label: key === "options" ? "Options" : key === "reject" ? "Reject" : "Accept", status: status === "observed" ? "Observed" : "Not observed" })) : null,
      provider: report.appendix.evidenceDossier?.cmp?.provider ?? undefined,
      caption: rows.some(row => row.id === "post_reject_tracking_reduction" && row.status === "Gap observed") ? "After Reject: activity observed" : controls ? `${Object.values(controls.controls).filter(state => state === "observed").length} of 3 choices observed` : "Visit evidence unavailable" },
    storage: { kind: "bars", bars: [{ label: "Cookies", value: runtime.summary.cookieRows }, { label: "Storage", value: runtime.summary.storageRows ?? 0 }], caption: "Retained inventory", unavailable: inventoryUnavailable },
    policy: { kind: "matrix", observed: disclosureCounts.observed, review: disclosureCounts.review, other: Math.max(0, disclosures.length - disclosureCounts.observed - disclosureCounts.review), caption: disclosures.length ? `${disclosures.filter(row => row.status === "Observed").length} / ${disclosures.length} disclosures observed` : "Disclosure checks unavailable" },
    forms: { kind: "flow", forms: forms.summary.totalForms, fields: forms.summary.totalFields, caption: forms.assessmentStatus === "insufficient_evidence" ? "Inventory unavailable" : "Retained form inventory" },
    security: { kind: "transport", checks: [["HTTPS delivery", "transport_security_https_delivery"], ["HTTP redirect", "transport_security_http_redirect"], ["Mixed-content check", "transport_security_mixed_content"], ["HTTPS certificate", "transport_security_tls_certificate"]].map(([label, id]) => ({ label: label!, status: rows.find(row => row.id === id)?.status ?? "Unavailable" })), caption: expiryLabel },
    external: { kind: "services", services: external.length, domains: domains.length, purposes, caption: inventoryUnavailable ? "Inventory unavailable" : `${external.filter(row => row.preConsent).length} services seen before choice`, unavailable: inventoryUnavailable },
    accessibility: { kind: "columns", counts: report.accessibilityEvidence?.violations.map(rule => rule.nodeCount) ?? [], rules: report.accessibilityEvidence?.rulesEvaluated.length,
      failures: audit?.failedRuleCount ?? undefined, nodes: audit?.affectedNodeCount ?? undefined,
      issues: report.accessibilityEvidence?.violations.map(accessibilityRuleTitle),
      reviewItems: audit?.reviewRuleCount ?? undefined, caption: report.accessibilityEvidence ? `${report.accessibilityEvidence.rulesEvaluated.length} rules checked / ${audit?.reviewRuleCount ?? "?"} review items` : "Audit evidence unavailable",
      unavailable: audit?.status !== "completed" || audit.failedRuleCount === null || audit.failedRuleCount === undefined || !report.accessibilityEvidence || audit.failedRuleCount === 0 && report.accessibilityEvidence.violations.length > 0 },
  };
  return pdfTopicOverview(report).map(topic => ({ ...topic, visual: visuals[topic.id] }));
}
