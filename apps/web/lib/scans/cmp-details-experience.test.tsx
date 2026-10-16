import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicCmpAuditSchema } from "@certscore/api-contracts";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import { projectCmpAudit } from "./cmp-audit-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { CmpDetails } from "../../components/scans/cmp-details";
import { EvidenceDirectory } from "../../components/scans/report-lab/shadow-scan-report";
import { SHADOW_REPORT } from "../../components/scans/report-lab/shadow-report-data";
import { buildDetailedEvidenceExport } from "./detailed-evidence-report";
import { buildReportDisplayExport } from "../api-v2/report-display-export";
import { selectReportEvidenceSection } from "../api-v2/report-evidence-selection";
import { buildReportEvidencePage } from "../api-v2/report-evidence-page";
import { reconstructReportEvidencePages } from "../../../../packages/certscore-sdk/src/detailed-evidence";

function noSurface() {
  const assessment = consentControlAssessmentSchema.parse(structuredClone(observedControlAssessment));
  assessment.surface.status = "not_observed";
  for (const control of Object.values(assessment.controls)) control.state = "not_observed";
  return assessment;
}

test("four experience modes use retained assessment and canonical provider identity without changing any criterion", () => {
  const cases = [
    { assessment: observedControlAssessment, provider: "OneTrust", mode: "cmp_details", title: "CMP details" },
    { assessment: observedControlAssessment, provider: null, mode: "consent_controls", title: "Consent controls" },
    { assessment: noSurface(), provider: null, mode: "consent_signals", title: "Consent and cookie signals" },
    { assessment: undefined, provider: null, mode: "capture_limited", title: "Consent capture limited" },
  ];
  for (const item of cases) {
    const before = structuredClone(item);
    const base = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: item.assessment });
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: item.assessment, consentVendor: item.provider });
    assert.equal(audit.experience!.mode, item.mode);
    assert.equal(audit.experience!.title, item.title);
    assert.deepEqual(audit.rows, base.rows, "Provider identity cannot affect assessments or deductions");
    assert.equal(audit.rows.length, 13);
    publicCmpAuditSchema.parse(audit);
    assert.deepEqual(item, before);
  }
  for (const provider of ["Not identified", "custom mechanism", "Unknown", "arbitrary provider"]) {
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment, consentVendor: provider });
    assert.equal(audit.experience!.mode, "consent_controls");
    assert.equal(audit.experience!.provider, null);
  }
});

test("no-surface summary requires complete, usable, document-bound inspection and actual negative control states", () => {
  for (const variant of ["partial", "unknown", "blocked", "wrong_scan", "unbound", "missing", "malformed", "challenge"]) {
    const assessment = noSurface();
    if (variant === "partial") { assessment.assessmentStatus = "limited"; assessment.coverage.status = "limited"; }
    if (variant === "unknown") { assessment.assessmentStatus = "limited"; assessment.controls.accept.state = "unknown"; }
    if (variant === "blocked") assessment.scan.noGo = true;
    if (variant === "wrong_scan") assessment.scan.scanId = "another-scan";
    if (variant === "unbound") assessment.document.identityStatus = "mismatched";
    if (variant === "challenge") assessment.document.reasonCodes = ["captcha_or_challenge"];
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: variant === "missing" ? undefined
      : variant === "malformed" ? { controls: assessment.controls } : assessment });
    assert.equal(audit.experience!.mode, "capture_limited", variant);
    assert.doesNotMatch(audit.experience!.summary, /No consent surface/, variant);
    if (!["partial", "unknown"].includes(variant)) assert.equal(audit.experience!.controls, null, variant);
  }
  const withheld = consentControlAssessmentSchema.parse(structuredClone(observedControlAssessment));
  withheld.visualEvidence = { status: "withheld", artifactRefs: [], reasonCodes: ["moderation_timeout"] };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: withheld }).experience!.mode, "consent_controls",
    "Withheld pixels do not veto verified structured controls");
});

test("custom mechanisms keep consent checks while incomplete provider inventory stays in retained details", () => {
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  assert.ok(audit.experience!.defaultCriterionIds.includes("reject"));
  assert.ok(!audit.experience!.defaultCriterionIds.includes("prominence"), "Unavailable comparisons stay in retained details");
  assert.ok(!audit.experience!.defaultCriterionIds.includes("declared_not_found"));
  assert.deepEqual(audit.experience!.controls, { accept: "observed", reject: "observed", options: "observed" });
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor={null} compact={compact} />);
    assert.match(html, /<h3>Consent controls<\/h3>/);
    assert.match(html, /Provider: Not identified/);
    assert.match(html, /View consent choices/);
    assert.equal((html.match(/id="cmp-criterion-/g) ?? []).length, 13);
    assert.match(html.slice(html.indexOf("data-cmp-retained-checks")), /cmp-criterion-declared_not_found/);
  }
});

test("no-surface default avoids an empty audit grid while preserving every status and reachable evidence anchor", () => {
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: noSurface() });
  const before = structuredClone(audit);
  assert.deepEqual(audit.experience!.defaultCriterionIds, []);
  for (const compact of [false, true]) {
    const report = { ...SHADOW_REPORT, scan: { ...SHADOW_REPORT.scan, id: "scan-1" }, consentVendor: null, cmpAudit: audit,
      controls: { accept: "Not observed", reject: "Not observed", options: "Not observed" } };
    const html = renderToStaticMarkup(<EvidenceDirectory report={report} compact={compact} />);
    const start = html.indexOf('id="cmp-details"'), retained = html.indexOf("data-cmp-retained-checks", start);
    assert.match(html.slice(start, retained), /Consent and cookie signals/);
    assert.doesNotMatch(html.slice(start, retained), /id="cmp-criterion-|Consent management audit|No review flags/);
    assert.match(html.slice(start, retained), /View cookies and storage|View tracking evidence|View policy evidence/);
    assert.equal((html.match(/id="cmp-criterion-/g) ?? []).length, 13);
  }
  assert.deepEqual(audit, before);
  assert.equal(audit.rows.find(row => row.id === "categories")!.status, "Not assessed");
  assert.ok(audit.rows.every(row => !row.deductionPoints));
});

test("all four experiences and complete counts survive API pagination and SDK reconstruction", () => {
  for (const [assessment, provider] of [[observedControlAssessment, "OneTrust"], [observedControlAssessment, null],
    [noSurface(), null], [undefined, null]] as const) {
    const report = structuredClone(SHADOW_REPORT);
    report.scan.id = "scan-1";
    report.consentVendor = provider;
    report.cmpAudit = projectCmpAudit({ scanId: report.scan.id, consentControlAssessment: assessment, consentVendor: provider });
    const before = structuredClone(report);
    const prepared = { ...report, ...buildDetailedEvidenceExport(report) };
    for (const section of ["cmp", "consent", undefined] as const) {
      const selected = section ? selectReportEvidenceSection(prepared, section).report : prepared;
      const exported = buildReportDisplayExport(selected, { scanId: report.scan.id });
      const pages = [];
      let cursor: string | undefined;
      do {
        const page = buildReportEvidencePage({ scanId: report.scan.id, report: exported, section, cursor });
        pages.push({ ...page, entries: page.entries.map(entry => ({ ...entry, value: entry.value })) });
        cursor = page.pagination.nextCursor ?? undefined;
      } while (cursor);
      const reconstructed = reconstructReportEvidencePages(pages);
      assert.deepEqual(reconstructed.cmpAudit, JSON.parse(JSON.stringify(prepared.cmpAudit)));
      assert.equal(reconstructed.cmpAudit!.rows.length, 13);
      const cmp = reconstructed.detailedEvidence!.sections.find(row => row.id === "cmp")!;
      assert.equal(cmp.title, prepared.cmpAudit.experience!.title);
      assert.equal(cmp.counts.checks, 13, "Collapsed rows do not count as resolved checks");
    }
    assert.deepEqual(report, before, "No score, finding or report input mutation");
  }
});
