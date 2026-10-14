import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessCmsSignals, assessCmsPluginSignals, type CmsSecurityProjection, type CmsSignal } from "@certscore/contracts";
import { SHADOW_REPORT, type ShadowReportData } from "../../components/scans/report-lab/shadow-report-data";
import { CmpDetails } from "../../components/scans/cmp-details";
import { RegulatoryChecklistCorrectionSteps } from "../../components/scans/regulatory-checklist-evidence-details";
import { CMP_AUDIT_CRITERIA } from "./cmp-audit-projection";
import { buildDetailedEvidenceExport } from "./detailed-evidence-report";
import { buildReportDisplayExport } from "../api-v2/report-display-export";
import { selectReportEvidenceSection } from "../api-v2/report-evidence-selection";
import { buildReportEvidencePage } from "../api-v2/report-evidence-page";
import { reconstructReportEvidencePages } from "../../../../packages/certscore-sdk/src/detailed-evidence";

function fixture(): ShadowReportData {
  const report = structuredClone(SHADOW_REPORT);
  report.cmpAudit = { version: "cmp_audit_report.v1", scanId: report.scan.id, scope: "starting_page", assessmentSourceHash: "fnv1a-aabbccdd",
    rows: CMP_AUDIT_CRITERIA.map(row => ({ ...row, status: "Not assessed", sourceIds: [] })) };
  Object.assign(report.cmpAudit.rows.find(row => row.id === "banner")!, { status: "Observed", detail: "Consent surface observed on the initial visit." });
  Object.assign(report.cmpAudit.rows.find(row => row.id === "found_not_declared")!, { status: "Review recommended", detail: "2 observed cookie names did not match 3 retained CMP declaration patterns.", sourceIds: ["cmp-cookie-proof"], deductionPoints: 15,
    supportingEvidence: { cookieComparison: { declarationPatternCount: 3, observedCookieNameCount: 4, unmatchedNameCount: 2, unmatchedNames: ["cookie_a", "cookie_b"], allUnmatchedOnlyAfterAccept: true } } });
  const signals: CmsSignal[] = [{ evidenceRef: "site_integrity:dom:0", kind: "meta_generator", value: "WordPress 6.8.3", sourceUrl: "https://example.com/", artifactRef: "runtime:dom:1" }];
  report.cmsSecurity = { contractVersion: "certscore.cms-security-projection.v2", scanId: report.scan.id, verificationStatus: "verified", sourceHash: "a".repeat(64), documentUrl: "https://example.com/", documentToken: "private-document-token", capturedAt: "2026-10-07T00:00:00.000Z", evidenceRef: "runtime:dom:1", signals,
    assessment: assessCmsSignals(signals, "2026-10-07T00:00:00.000Z", undefined, "v2"), pluginInventory: assessCmsPluginSignals(signals) } satisfies CmsSecurityProjection;
  return report;
}
test("report and focused exports retain the 13 CMP outcomes, comparisons and shared display wording", () => {
  const report = fixture(), before = structuredClone(report);
  const prepared = { ...report, ...buildDetailedEvidenceExport(report) };
  const exported = buildReportDisplayExport(selectReportEvidenceSection(prepared, "cmp").report, { scanId: report.scan.id });
  const page = buildReportEvidencePage({ scanId: report.scan.id, report: exported, section: "cmp" });
  const rebuilt = reconstructReportEvidencePages([{ ...page, entries: page.entries.map(entry => ({ ...entry, value: entry.value })) }]);
  assert.equal(rebuilt.cmpAudit?.rows.length, 13);
  assert.equal(rebuilt.cmpAudit?.assessmentSourceHash, report.cmpAudit!.assessmentSourceHash);
  const raw = rebuilt.cmpAudit!.rows.find(row => row.id === "found_not_declared")!;
  assert.equal(raw.status, "Review recommended");
  assert.deepEqual(raw.supportingEvidence?.cookieComparison?.unmatchedNames, ["cookie_a", "cookie_b"]);
  const section = rebuilt.detailedEvidence!.sections[0]!;
  assert.equal(section.title, "CMP details");
  assert.equal(section.displayStatus, "Review");
  assert.deepEqual(section.counts, { checks: 13, review: 1, limited: 11, observed: 1, unsupported: 0 });
  assert.equal(section.rows.find(row => row.id === "found_not_declared")!.displayStatus, "Review");
  const html = renderToStaticMarkup(<CmpDetails audit={report.cmpAudit} vendor="Example CMP" />);
  for (const row of section.rows) assert.ok(html.includes(row.title), `Website and API share title ${row.id}`);
  assert.ok(html.includes(section.recap));
  assert.ok(!JSON.stringify(exported).includes("deductionPoints"));
  assert.deepEqual(report, before);
});
test("CMS export preserves existing version/advisory evidence and omits document state", () => {
  const report = fixture();
  const prepared = { ...report, ...buildDetailedEvidenceExport(report) };
  const output = buildReportDisplayExport(selectReportEvidenceSection(prepared, "cms").report, { scanId: report.scan.id }) as any;
  assert.equal(output.cmsSecurity.sourceHash, report.cmsSecurity!.sourceHash);
  assert.equal(output.cmsSecurity.detections[0].version, "6.8.3");
  assert.equal(output.cmsSecurity.advisories.length, report.cmsSecurity!.assessment.matches.length);
  assert.equal(output.detailedEvidence.sections[0].title, "CMS & version");
  assert.doesNotMatch(JSON.stringify(output), /private-document-token|documentToken/);
  const wrong = structuredClone(report); wrong.cmsSecurity!.scanId = "other-scan";
  assert.equal(buildDetailedEvidenceExport(wrong).cmsSecurity, null);
});
test("missing CMP and CMS evidence stays limited or unavailable and creates no findings", () => {
  const report = fixture(); delete report.cmpAudit; delete report.cmsSecurity;
  const before = structuredClone(report.findings);
  const output = buildDetailedEvidenceExport(report);
  assert.equal(output.cmpAudit.rows.filter(row => row.status === "Not assessed").length, 13);
  assert.equal(output.detailedEvidence.sections[0]?.displayStatus, "Limited");
  assert.equal(output.cmsSecurity, null);
  assert.deepEqual(report.findings, before);
});
test("malformed or cross-scan public evidence cannot pass the display-export allowlist", () => {
  const report = fixture();
  const output = buildReportDisplayExport({ scan: report.scan, cmsSecurity: report.cmsSecurity, cmpAudit: { ...report.cmpAudit, scanId: "other-scan" } }, { scanId: report.scan.id }) as any;
  assert.equal(output.cmsSecurity, undefined);
  assert.equal(output.cmpAudit, undefined);
});
test("API correction steps match the rendered retained-checklist guidance", () => {
  const report = fixture();
  const canonicalEvidenceJson = JSON.stringify({ coverageArea: "Tracking after refusal", assessmentStatus: "gap_observed", status: "Gap observed", retainedEvidence: { smokingGunEvidence: [{ vendor: "HubSpot" }] } });
  report.consentRows.push({ id: "post_reject_tracking_reduction", title: "Tracking after refusal", status: "Potential gap", summary: "Retained requests", correctionSteps: [], evidenceJson: {}, canonicalEvidenceJson });
  Object.assign(report.cmpAudit!.rows.find(row => row.id === "implementation")!, { status: "Review recommended", sourceIds: ["post_reject_tracking_reduction"] });
  const output = buildDetailedEvidenceExport(report);
  const steps = output.detailedEvidence.sections[0]!.rows.find(row => row.id === "implementation")!.correctionSteps;
  const html = renderToStaticMarkup(<RegulatoryChecklistCorrectionSteps jsonPayload={canonicalEvidenceJson} />);
  assert.ok(steps.length > 0);
  for (const step of steps) assert.ok(html.includes(step));
});
test("CMP request support rejects query values instead of exposing them", () => {
  const report = fixture();
  report.cmpAudit!.rows.find(row => row.id === "implementation")!.supportingEvidence = { requests: [{ hostname: "example.com", path: "/collect?token=private", vendor: "Example", category: "Analytics", msAfterReject: 1 }] };
  assert.throws(() => buildDetailedEvidenceExport(report), /omit query/);
});
test("scanner integration support remains independent of a CMP feature assessment", () => {
  const report = fixture();
  report.cmpAudit!.inspectionSupport = { state: "unsupported", provider: "Example CMP", recipeVersion: null, reason: "no_supported_inspector" };
  const output = buildDetailedEvidenceExport(report);
  assert.equal(output.cmpAudit.inspectionSupport?.state, "unsupported");
  assert.equal(output.cmpAudit.rows.find(row => row.id === "services")!.status, "Not assessed");
  assert.equal(output.detailedEvidence.sections[0]!.counts.unsupported, 0);
});

test("California privacy choices share website/export headers and retain verified controls, candidates and passages", async () => {
  const { CaliforniaPrivacyWorkpaper } = await import("../../components/scans/regulatory-review-focus");
  const report = fixture(); report.reviewFocus = "ccpa_cpra";
  report.privacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v2", scanId: report.scan.id, documentUrl: "https://example.com/",
    capturedAt: "2026-10-07T00:00:00.000Z", sourceHash: "c".repeat(64), verificationStatus: "verified", scoreEffect: "none",
    passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified", collectionPointNoticeAssessment: "not_assessed", truncated: false,
    controls: [{ kind: "your_privacy_choices", label: "Your privacy choices", sourceUrl: "https://example.com/", destinationUrl: "https://example.com/choices",
      placement: "footer", evidenceRef: "privacy:control:1", retrieval: "not_attempted", interaction: "not_tested" }],
    controlCandidates: [{ kind: "cookie_settings", label: "Cookie settings", sourceUrl: "https://example.com/", destinationUrl: "https://example.com/settings",
      placement: "footer", evidenceRef: "privacy:candidate:1", verification: "visibility_unverified" }],
    notices: [{ kind: "california_notice", url: "https://example.com/privacy", evidenceRef: "privacy:notice:1", directlyLinkedFromScannedPage: true,
      coverage: "partial", passages: [{ topic: "privacy_rights", excerpt: "You can request access to or deletion of personal information." }] }],
  };
  const before = structuredClone(report);
  const projected = { ...report, ...buildDetailedEvidenceExport(report) };
  const selection = selectReportEvidenceSection(projected, "policy");
  const exported = buildReportDisplayExport(selection.report, { scanId: report.scan.id });
  const pages = []; let cursor: string | null = null;
  do { const page = buildReportEvidencePage({ scanId: report.scan.id, report: exported, section: "policy", cursor }); pages.push(page); cursor = page.pagination.nextCursor; } while (cursor);
  const rebuilt = reconstructReportEvidencePages(pages.map(page => ({ ...page, entries: page.entries.map(entry => ({ ...entry, value: entry.value })) })));
  assert.deepEqual(rebuilt.privacyAuditEvidence, report.privacyAuditEvidence);
  const section = rebuilt.detailedEvidence!.sections.find(section => section.id === "privacy")!;
  assert.equal(section.displayStatus, "Review");
  assert.deepEqual(section.rows.map(row => row.status), ["Observed", "Needs review", "Retained"]);
  assert.equal(section.rows[1]!.displayStatus, "Review");
  assert.equal(section.rows[0]!.source.field, "privacyAuditEvidence.controls");
  assert.equal(section.rows[2]!.source.field, "privacyAuditEvidence.notices");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper evidence={report.privacyAuditEvidence} focus="ccpa_cpra" />);
  assert.ok(html.includes(section.title)); assert.ok(html.includes(section.recap));
  assert.ok(html.includes(report.privacyAuditEvidence.notices[0]!.passages[0]!.excerpt));
  assert.match(section.rows[1]!.summary!, /visibility not verified/);
  assert.ok(selection.selection.fields.includes("privacyAuditEvidence"));
  assert.deepEqual(report, before);
  report.reviewFocus = "gdpr_eprivacy";
  assert.ok(!buildDetailedEvidenceExport(report).detailedEvidence.sections.some(section => section.id === "privacy"));
  report.privacyAuditEvidence.scanId = "other-scan";
  assert.equal(buildDetailedEvidenceExport(report).privacyAuditEvidence, null);
  assert.equal((buildReportDisplayExport({ scan: report.scan, privacyAuditEvidence: report.privacyAuditEvidence }) as any).privacyAuditEvidence, undefined);
});

test("California export is limited on missing, malformed or cross-scan evidence, without findings or absence claims", () => {
  const report = fixture(); report.reviewFocus = "ccpa_cpra";
  const before = structuredClone(report.findings);
  for (const evidence of [undefined, { scanId: report.scan.id }, { scanId: "other-scan" }]) {
    report.privacyAuditEvidence = evidence as any;
    const output = buildDetailedEvidenceExport(report);
    assert.equal(output.privacyAuditEvidence, null);
    const section = output.detailedEvidence.sections.find(section => section.id === "privacy")!;
    assert.equal(section.recap, "Evidence unavailable"); assert.equal(section.displayStatus, "Limited"); assert.deepEqual(section.rows, []);
    const exported = buildReportDisplayExport({ scan: report.scan, privacyAuditEvidence: evidence }, { scanId: report.scan.id }) as any;
    assert.equal(exported.privacyAuditEvidence, undefined);
  }
  assert.deepEqual(report.findings, before);
});
