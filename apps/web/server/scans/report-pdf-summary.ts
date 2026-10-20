import { pdfNarrativeFindings } from "./report-pdf-evidence";
import { evidenceSectionCounts } from "../../lib/scans/detailed-evidence-presentation";
import { buildAssessmentHighlights } from "../../lib/scans/assessment-highlights";
import { projectConsentControlReport } from "../../lib/scans/consent-control-report";
import type { CanonicalReportExport } from "./report-export";
import { PDF_REPORT_TOPICS, pdfTopicOverview } from "./report-pdf-topics";

const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : undefined;

/** Same assessment writer as the scan report, using only projected findings and retained score/coverage. */
export function pdfSiteAssessment(report: CanonicalReportExport) {
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
  | { kind: "choices"; choices: Array<{ label: string; status: string }> | null; caption: string }
  | { kind: "bars"; bars: Array<{ label: string; value: number }>; caption: string; unavailable: boolean }
  | { kind: "matrix"; observed: number; review: number; other: number; caption: string }
  | { kind: "flow"; forms: number; fields: number; caption: string }
  | { kind: "checks"; checks: Array<{ label: string; status: string }>; caption: string }
  | { kind: "network"; domains: string[]; caption: string; unavailable: boolean }
  | { kind: "certificate"; status: string; caption: string }
  | { kind: "columns"; counts: number[]; caption: string; unavailable: boolean };

/** Topic-specific inventory/assessment graphics; these never classify or manufacture findings. */
export function pdfSummaryTopics(report: CanonicalReportExport) {
  const controls = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  const runtime = report.appendix.cookieAndTrackerInventory;
  const inventoryUnavailable = runtime.presentationStatus === "insufficient_evidence";
  const rows = report.gdprEprivacyReview?.rows ?? [];
  const disclosures = report.appendix.gdprTransparency.rows;
  const disclosureCounts = evidenceSectionCounts(disclosures);
  const forms = report.appendix.dataCollectionSurfaces;
  const external = runtime.rows.filter(row => row.type !== "cookie" && row.type !== "storage");
  const domains = [...new Set(external.flatMap(row => row.domains))];
  const certificate = rows.find(row => row.id === "transport_security_tls_certificate");
  const expiry = report.appendix.evidenceDossier?.checklistDetails.find(row => row.id === "transport_security_tls_certificate")?.facts.find(fact => /(?:^|\/ )validTo$/.test(fact.label))?.value;
  const parsedExpiry = expiry ? new Date(expiry) : null;
  const expiryLabel = parsedExpiry && Number.isFinite(parsedExpiry.getTime()) ? `Expires ${parsedExpiry.toISOString().slice(0, 10)}` : "Certificate evidence";
  const audit = report.accessibilityAudit;
  const visuals: Record<typeof PDF_REPORT_TOPICS[number]["id"], SummaryVisual> = {
    consent: { kind: "choices", choices: controls ? Object.entries(controls.controls).map(([key, status]) => ({ label: key === "options" ? "Options" : key === "reject" ? "Reject" : "Accept", status: status === "observed" ? "Observed" : "Not observed" })) : null,
      caption: controls ? `${Object.values(controls.controls).filter(state => state === "observed").length} of 3 choices observed` : "Visit evidence unavailable" },
    storage: { kind: "bars", bars: [{ label: "Cookies", value: runtime.summary.cookieRows }, { label: "Storage", value: runtime.summary.storageRows ?? 0 }], caption: "Retained inventory", unavailable: inventoryUnavailable },
    policy: { kind: "matrix", observed: disclosureCounts.observed, review: disclosureCounts.review, other: Math.max(0, disclosures.length - disclosureCounts.observed - disclosureCounts.review), caption: disclosures.length ? `${disclosures.filter(row => row.status === "Observed").length} / ${disclosures.length} disclosures observed` : "Disclosure checks unavailable" },
    forms: { kind: "flow", forms: forms.summary.totalForms, fields: forms.summary.totalFields, caption: forms.assessmentStatus === "insufficient_evidence" ? "Inventory unavailable" : "Retained form inventory" },
    security: { kind: "checks", checks: [["HTTPS", "transport_security_https_delivery"], ["Redirect", "transport_security_http_redirect"], ["Mixed", "transport_security_mixed_content"]].map(([label, id]) => ({ label: label!, status: rows.find(row => row.id === id)?.status ?? "Unavailable" })), caption: "Connection checks" },
    external: { kind: "network", domains, caption: inventoryUnavailable ? "Inventory unavailable" : `${domains.length} retained ${domains.length === 1 ? "domain" : "domains"}`, unavailable: inventoryUnavailable },
    tls: { kind: "certificate", status: certificate?.status ?? "Unavailable", caption: expiryLabel },
    accessibility: { kind: "columns", counts: report.accessibilityEvidence?.violations.map(rule => rule.nodeCount) ?? [], caption: audit?.failedRuleCount === null || audit?.failedRuleCount === undefined ? "Audit unavailable" : `${audit.failedRuleCount} rules / ${audit.affectedNodeCount ?? "?"} nodes`, unavailable: audit?.failedRuleCount === null || audit?.failedRuleCount === undefined },
  };
  return pdfTopicOverview(report).map(topic => ({ ...topic, visual: visuals[topic.id] }));
}
