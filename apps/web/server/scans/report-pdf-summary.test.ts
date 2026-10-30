import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentHighlights } from "../../lib/scans/assessment-highlights";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { pdfSiteAssessment, pdfSummaryTopics } from "./report-pdf-summary";
import { scopeCanonicalReportPdf } from "./report-pdf-evidence";
import type { CanonicalReportExport } from "./report-export";

function reportFixture() {
  return { scan: { id: "scan-1" }, score: { value: 64 }, executiveSummary: { counts: { technicalLimitation: 0 } }, projection: { unifiedFindings: [] }, gdprEprivacyReview: { rows: [] }, consentControlAssessment: structuredClone(observedControlAssessment), appendix: {
    gdprTransparency: { rows: [] }, cookieAndTrackerInventory: { presentationStatus: "retained", summary: { cookieRows: 0, storageRows: 0 }, rows: [] }, dataCollectionSurfaces: { summary: { totalForms: 0, totalFields: 0 }, assessmentStatus: "insufficient_evidence" },
  } } as unknown as CanonicalReportExport;
}

test("California PDF retains observed transport facts without EU disclosure conclusions", () => {
  const report = reportFixture();
  report.reviewFocus = "ccpa_cpra";
  report.gdprEprivacyReview!.rows = [
    { id: "transport_security_https_delivery", label: "HTTPS delivery", status: "Observed", rationale: "HTTPS delivery was verified." },
    { id: "legal_basis_disclosure_observed", label: "Legal basis", status: "Observed", rationale: "EU disclosure conclusion." },
  ] as NonNullable<CanonicalReportExport["gdprEprivacyReview"]>["rows"];
  const before = structuredClone(report), scoped = scopeCanonicalReportPdf(report);
  assert.deepEqual(scoped.gdprEprivacyReview!.rows.map(row => row.id), ["transport_security_https_delivery"]);
  const security = pdfSummaryTopics(scoped).find(topic => topic.id === "security")!.visual;
  assert.ok(security.kind === "transport");
  assert.equal(security.checks[0]!.status, "Observed");
  assert.deepEqual(report, before);
});

test("PDF site assessment uses the scan report writer with canonical observation, qualification and action", () => {
  const report = reportFixture();
  const finding = { unifiedFindingId: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", severity: "high", summary: "Qualifying non-essential requests were observed during the retained post-Reject capture.", presentation: { findingName: "Non-essential activity after confirmed Reject", suggestedFix: "Update optional services to respect Reject, then retest." } };
  report.projection.unifiedFindings = [finding] as unknown as CanonicalReportExport["projection"]["unifiedFindings"];
  const before = structuredClone(report);
  const expected = buildAssessmentHighlights([{ id: finding.unifiedFindingId, severity: "high", title: finding.presentation.findingName, summary: finding.summary, correctionSteps: [finding.presentation.suggestedFix] }], { kind: "page" }, { score: 64, coverage: { state: "unknown", limitedCount: 0 } });
  assert.equal(pdfSiteAssessment(report), expected);
  assert.match(expected, /retained post-Reject capture/);
  assert.match(expected, /Update optional services/);
  assert.doesNotMatch(expected, /deduction|point penalty|scoring withheld/i);
  assert.deepEqual(report, before);
});

test("PDF summary never turns missing findings or unusable control visits into a positive assessment", () => {
  const report = reportFixture();
  report.score.value = null;
  assert.equal(pdfSiteAssessment(report), "No priority findings are available from this visit.");
  report.consentControlAssessment!.document.identityStatus = "mismatched";
  const consent = pdfSummaryTopics(report)[0]!.visual;
  assert.equal(consent.kind, "choices");
  if (consent.kind === "choices") assert.equal(consent.choices, null);
});

test("each topic uses its own retained evidence visual and unavailable inventories remain unavailable", () => {
  const report = reportFixture();
  const snapshots = pdfSummaryTopics(report);
  assert.deepEqual(snapshots.map(topic => topic.visual.kind), ["choices", "bars", "matrix", "flow", "transport", "services", "columns"]);
  assert.deepEqual(snapshots.map(topic => topic.findings.length), [0, 0, 0, 0, 0, 0, 0]);
  report.appendix.cookieAndTrackerInventory.presentationStatus = "insufficient_evidence";
  const limited = pdfSummaryTopics(report);
  for (const id of ["storage", "external"]) {
    const graphic = limited.find(topic => topic.id === id)!.visual;
    assert.ok("unavailable" in graphic && graphic.unavailable);
  }
  const security = limited.find(topic => topic.id === "security")!.visual;
  assert.ok(security.kind === "transport" && security.checks.find(check => check.label === "HTTPS certificate")?.status === "Unavailable");
});


test("policy visual counts every retained disclosure, including review rows at the end of long checklists", () => {
  const report = reportFixture();
  report.appendix.gdprTransparency.rows = Array.from({ length: 40 }, (_, index) => ({ id: `disclosure-${index}`, status: index === 39 ? "Gap observed" : "Observed" })) as CanonicalReportExport["appendix"]["gdprTransparency"]["rows"];
  const policy = pdfSummaryTopics(report).find(topic => topic.id === "policy")!.visual;
  assert.ok(policy.kind === "matrix");
  assert.equal(policy.observed, 39);
  assert.equal(policy.review, 1);
  assert.equal(policy.other, 0);
});

test("the PDF assessment leads with projected gaps rather than a lower-confidence supporting storage review", () => {
  const report = reportFixture();
  report.gdprEprivacyReview!.rows = [
    { id: "pre_consent_cookies_storage", label: "Storage", status: "Review signal", rationale: "Cookie essentiality remains unresolved." },
    { id: "pre_consent_third_party_tracking", label: "Tracking", status: "Gap observed", rationale: "Tracking-classified requests were observed before consent: Example Analytics. The first retained qualifying request was Example Analytics at 1.15s after scan start." },
    { id: "post_reject_tracking_reduction", label: "After Reject", status: "Gap observed", rationale: "Eligible non-essential tracking activity was observed after the refusal confirmation during the measured post-Reject window." },
    { id: "privacy_notice_availability", label: "Privacy notice", status: "Gap observed", rationale: "No reachable policy was found in the completed discovery." },
  ] as NonNullable<CanonicalReportExport["gdprEprivacyReview"]>["rows"];
  report.appendix.evidenceDossier = { checklistDetails: [] } as unknown as CanonicalReportExport["appendix"]["evidenceDossier"];
  const before = structuredClone(report);
  const text = pdfSiteAssessment(report);
  assert.match(text, /^Requests from Example Analytics were observed before a consent choice/);
  assert.match(text, /after Reject was confirmed/);
  assert.match(text, /No reachable privacy notice/);
  assert.doesNotMatch(text, /Cookie essentiality|deduction|recovery|needs work/i);
  assert.deepEqual(report, before);
  report.gdprEprivacyReview!.rows = [report.gdprEprivacyReview!.rows[0]!];
  assert.match(pdfSiteAssessment(report), /remains unresolved/);
  assert.doesNotMatch(pdfSiteAssessment(report), /No priority issues/);
  assert.equal(pdfSiteAssessment(report), "Cookie essentiality remains unresolved.");
  assert.doesNotMatch(pdfSiteAssessment(report), /Review the supporting evidence|recommended checks|Prioritize these fixes/);
});

test("accessibility zero results require a completed audit and corroborating rule evidence", () => {
  const report = reportFixture();
  report.accessibilityAudit = { status: "completed", failedRuleCount: 0, reviewRuleCount: 0 } as CanonicalReportExport["accessibilityAudit"];
  report.accessibilityEvidence = { violations: [], reviewItems: [], rulesEvaluated: ["rule-1", "rule-2"] } as unknown as CanonicalReportExport["accessibilityEvidence"];
  const visual = pdfSummaryTopics(report).find(topic => topic.id === "accessibility")!.visual;
  assert.ok(visual.kind === "columns" && !visual.unavailable && visual.rules === 2 && visual.reviewItems === 0);
  report.accessibilityEvidence = null;
  const missing = pdfSummaryTopics(report).find(topic => topic.id === "accessibility")!.visual;
  assert.ok(missing.kind === "columns" && missing.unavailable);
});

test("both PDF focuses show retained inconclusive accessibility checks as Manual check, preserving unknown zero-result limits",()=>{
  for(const focus of ["gdpr_eprivacy","ccpa_cpra"] as const){
    const report=reportFixture();report.reviewFocus=focus;
    report.accessibilityAudit={status:"limited",failedRuleCount:0,reviewRuleCount:2} as CanonicalReportExport["accessibilityAudit"];
    report.accessibilityEvidence={violations:[],reviewItems:[],rulesEvaluated:["aria-hidden-focus","color-contrast"]} as unknown as CanonicalReportExport["accessibilityEvidence"];
    const before=structuredClone(report),visual=pdfSummaryTopics(report).find(topic=>topic.id==="accessibility")!.visual;
    assert.ok(visual.kind==="columns"&&!visual.unavailable);
    if(visual.kind==="columns"){assert.equal(visual.statusLabel,"Manual check");assert.equal(visual.failures,0);assert.equal(visual.reviewItems,2);}
    assert.deepEqual(report,before);
    report.accessibilityAudit!.reviewRuleCount=0;
    const unresolved=pdfSummaryTopics(report).find(topic=>topic.id==="accessibility")!.visual;
    assert.ok(unresolved.kind==="columns"&&unresolved.unavailable,"an incomplete zero-result capture must not become a passing audit");
  }
});

test("CMP summary names the provider and each observed control without asserting action confirmation", () => {
  const report = reportFixture();
  report.appendix.evidenceDossier = { cmp: { provider: "OneTrust" }, checklistDetails: [] } as unknown as CanonicalReportExport["appendix"]["evidenceDossier"];
  report.gdprEprivacyReview!.rows = [{ id: "post_reject_tracking_reduction", status: "Gap observed" }] as NonNullable<CanonicalReportExport["gdprEprivacyReview"]>["rows"];
  const before = structuredClone(report);
  const visual = pdfSummaryTopics(report).find(topic => topic.id === "consent")!.visual;
  assert.ok(visual.kind === "choices");
  assert.equal(visual.provider, "OneTrust");
  assert.deepEqual(visual.choices, [{ label: "Accept", status: "Observed" }, { label: "Reject", status: "Observed" }, { label: "Options", status: "Observed" }]);
  assert.equal(visual.caption, "After Reject: activity observed");
  assert.doesNotMatch(JSON.stringify(visual), /confirmed|registered|succeeded/i);
  assert.deepEqual(report, before);
});

test("ADA/WCAG summary gives measured failures, nodes and named barriers instead of a disclaimer", () => {
  const report = reportFixture();
  const audit = accessibilityAuditFixture();
  audit.violations = audit.violations.filter(rule => rule.ruleId !== "color-contrast");
  report.accessibilityEvidence = audit;
  report.accessibilityAudit = { status: "completed", failedRuleCount: 3, affectedNodeCount: 3, reviewRuleCount: 0 } as CanonicalReportExport["accessibilityAudit"];
  const before = structuredClone(report);
  const visual = pdfSummaryTopics(report).find(topic => topic.id === "accessibility")!.visual;
  assert.ok(visual.kind === "columns" && !visual.unavailable);
  assert.equal(visual.failures, 3);
  assert.equal(visual.nodes, 3);
  assert.deepEqual(visual.issues, ["Image text alternatives", "Form field labels", "Button names"]);
  assert.equal(visual.caption, "4 rules checked / 0 manual checks");
  assert.doesNotMatch(visual.caption, /manual audit|Automated check only/);
  assert.deepEqual(report, before);
});
