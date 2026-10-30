import { reportRequestInventory } from "./report-request-inventory";
import { REPORT_TRANSPORT_CHECKS } from "../../lib/scans/report-runtime-inventory";
import { pdfPriorityReview } from "./report-pdf-priorities";
import { evidenceSectionCounts } from "../../lib/scans/detailed-evidence-presentation";
import { projectConsentControlReport } from "../../lib/scans/consent-control-report";
import { accessibilityRuleTitle } from "../../lib/scans/accessibility-report";
import type { CanonicalReportExport } from "./report-export";
import { reportSectionInFocus } from "../../lib/scans/report-framework-scope";
import { accessibilityReportFollowUp } from "../../lib/scans/report-status-presentation";
import { PDF_REPORT_TOPICS, pdfTopicOverview } from "./report-pdf-topics";
import { pdfInventoryRows, reportFormInventory } from "./report-pdf-reader";

/** Same assessment writer as the scan report, using only projected findings and retained score/coverage. */
export function pdfSiteAssessment(report: CanonicalReportExport) {
  return pdfPriorityReview(report).highlights.text;
}

export type SummaryVisual =
  | { kind: "choices"; choices: Array<{ label: string; status: string }> | null; provider?: string; caption: string }
  | { kind: "bars"; bars: Array<{ label: string; value: number }>; caption: string; unavailable: boolean }
  | { kind: "matrix"; observed: number; review: number; other: number; caption: string }
  | { kind: "flow"; forms: number; fields: number; caption: string; limited?: boolean }
  | { kind: "checks"; checks: Array<{ label: string; status: string }>; caption: string }
  | { kind: "network"; domains: string[]; caption: string; unavailable: boolean }
  | { kind: "certificate"; status: string; caption: string }
  | { kind: "transport"; checks: Array<{ label: string; status: string }>; caption: string }
  | { kind: "services"; services: number; domains: number; purposes: Array<{ label: string; value: number }>; caption: string; unavailable: boolean }
  | { kind: "columns"; counts: number[]; caption: string; unavailable: boolean; rules?: number; reviewItems?: number; failures?: number; nodes?: number; issues?: string[]; statusLabel?: string };

/** Topic-specific inventory/assessment graphics; these never classify or manufacture findings. */
export function pdfSummaryTopics(report: CanonicalReportExport) {
  const controls = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  const runtime = report.appendix.cookieAndTrackerInventory;
  const inventoryUnavailable = runtime.presentationStatus === "insufficient_evidence";
  const rows = report.gdprEprivacyReview?.rows ?? [];
  const disclosures = reportSectionInFocus("gdpr-transparency",report.reviewFocus)?report.appendix.gdprTransparency.rows:[];
  const disclosureCounts = evidenceSectionCounts(disclosures);
  const californiaFamilies=report.californiaScore?.reviewCoverage?.families??[];
  const forms = report.appendix.dataCollectionSurfaces;
  const formInventory = reportFormInventory(report);
  const external = pdfInventoryRows(report).external;
  const requests = reportRequestInventory(report);
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
    policy: report.reviewFocus==="ccpa_cpra"?{kind:"matrix",observed:californiaFamilies.filter(row=>["observed","not_triggered_in_scope"].includes(row.status)).length,review:californiaFamilies.filter(row=>["review","assessed_gap"].includes(row.status)).length,other:californiaFamilies.filter(row=>row.status==="unknown").length,caption:californiaFamilies.length?`${californiaFamilies.length} California review areas`:"California review coverage unavailable"}:{ kind: "matrix", observed: disclosureCounts.observed, review: disclosureCounts.review, other: Math.max(0, disclosures.length - disclosureCounts.observed - disclosureCounts.review), caption: disclosures.length ? `${disclosures.filter(row => row.status === "Observed").length} / ${disclosures.length} disclosures observed` : "Disclosure checks unavailable" },
    forms: { kind: "flow", forms: formInventory.totalForms, fields: formInventory.totalFields, limited: formInventory.limited, caption: formInventory.hasCombinedInventory ? formInventory.limited ? "Observed forms; limited coverage" : "Observed form inventory" : forms.assessmentStatus === "insufficient_evidence" ? "Inventory unavailable" : "Initial-page form inventory" },
    security: { kind: "transport", checks: REPORT_TRANSPORT_CHECKS.map(([label, id]) => ({ label: label!, status: rows.find(row => row.id === id)?.status ?? "Unavailable" })), caption: expiryLabel },
    external: { kind: "services", services: requests?.metric?.overview?.identifiedServices ?? external.length, domains: requests ? requests.distinctHosts ?? 0 : domains.length, purposes: requests?.servicePurposes ?? purposes, caption: requests ? `${requests.metric!.value} requests before choice` : inventoryUnavailable ? "Inventory unavailable" : `${external.filter(row => row.preConsent).length} service observations before choice`, unavailable: inventoryUnavailable },
    accessibility: { kind: "columns", counts: report.accessibilityEvidence?.violations.map(rule => rule.nodeCount) ?? [], rules: report.accessibilityEvidence?.rulesEvaluated.length,
      statusLabel:audit?accessibilityReportFollowUp(audit)?.label:undefined,
      failures: audit?.failedRuleCount ?? undefined, nodes: audit?.affectedNodeCount ?? undefined,
      issues: report.accessibilityEvidence?.violations.map(accessibilityRuleTitle),
      reviewItems: audit?.reviewRuleCount ?? undefined, caption: report.accessibilityEvidence ? `${report.accessibilityEvidence.rulesEvaluated.length} rules checked / ${audit?.reviewRuleCount ?? "?"} manual checks` : "Audit evidence unavailable",
      unavailable: !audit || audit.status !== "completed" && !audit.failedRuleCount && !audit.reviewRuleCount || audit.failedRuleCount === null || audit.failedRuleCount === undefined || !report.accessibilityEvidence || audit.failedRuleCount === 0 && report.accessibilityEvidence.violations.length > 0 },
  };
  return pdfTopicOverview(report).map(topic => ({ ...topic, visual: visuals[topic.id] }));
}
