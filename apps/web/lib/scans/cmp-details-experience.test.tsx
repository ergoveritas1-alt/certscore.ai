import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicCmpAuditSchema } from "@certscore/api-contracts";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import { cmpDetailsExperience, projectCmpAudit } from "./cmp-audit-projection";
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
    { assessment: observedControlAssessment, provider: null, mode: "consent_controls", title: "CMP details" },
    { assessment: noSurface(), provider: null, mode: "consent_signals", title: "CMP details" },
    { assessment: undefined, provider: null, mode: "capture_limited", title: "CMP details" },
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
    assert.equal(audit.experience!.summary, "Consent banner observed; provider not identified.");
  }
  const custom = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment, consentVendor: "Custom consent banner" });
  assert.equal(custom.experience!.mode, "consent_controls");
  assert.equal(custom.experience!.summary, "Custom consent banner observed.");
  assert.deepEqual(custom.rows, projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment }).rows);
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
    assert.doesNotMatch(audit.experience!.summary, /No CMP identified|No consent banner observed/, variant);
    if (!["partial", "unknown"].includes(variant)) assert.equal(audit.experience!.controls, null, variant);
  }
  const withheld = consentControlAssessmentSchema.parse(structuredClone(observedControlAssessment));
  withheld.visualEvidence = { status: "withheld", artifactRefs: [], reasonCodes: ["moderation_timeout"] };
  assert.equal(projectCmpAudit({ scanId: "scan-1", consentControlAssessment: withheld }).experience!.mode, "consent_controls",
    "Withheld pixels do not veto verified structured controls");
});

test("unrecognized consent banners keep supported checks and label the provider accurately", () => {
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: observedControlAssessment });
  assert.ok(audit.experience!.defaultCriterionIds.includes("reject"));
  assert.ok(!audit.experience!.defaultCriterionIds.includes("prominence"), "Unavailable comparisons stay in retained details");
  assert.ok(!audit.experience!.defaultCriterionIds.includes("declared_not_found"));
  assert.deepEqual(audit.experience!.controls, { accept: "observed", reject: "observed", options: "observed" });
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor={null} compact={compact} />);
    assert.match(html, /<h3>CMP details<\/h3>/);
    assert.match(html, /Consent banner observed; provider not identified/);
    assert.match(html, /Provider: Not identified/);
    assert.match(html, /View consent choices/);
    assert.equal((html.match(/id="cmp-criterion-/g) ?? []).length, 13);
    assert.match(html.slice(html.indexOf("data-cmp-retained-checks")), /cmp-criterion-declared_not_found/);
  }
});

test("recognized, explicitly custom and no-banner experiences share the CMP details heading", () => {
  const cases = [
    { assessment: observedControlAssessment, vendor: "OneTrust", body: /OneTrust/, recap: /Consent management audit/ },
    { assessment: observedControlAssessment, vendor: "Custom consent banner", body: /Provider: Not identified/, recap: /Custom consent banner observed/ },
    { assessment: noSurface(), vendor: null, body: /Provider: Not identified/, recap: /No CMP identified\. No consent banner observed on this visit\./ },
  ];
  for (const { assessment, vendor, body, recap } of cases) {
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: assessment, consentVendor: vendor });
    const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor={vendor} />);
    assert.match(html, /<h3>CMP details<\/h3>/);
    assert.match(html, body);
    if (vendor === "OneTrust") assert.match(audit.experience!.summary, recap);
    else assert.match(html, recap);
    const report = { ...SHADOW_REPORT, scan: { ...SHADOW_REPORT.scan, id: "scan-1" }, consentVendor: vendor, cmpAudit: audit };
    const exported = buildDetailedEvidenceExport(report);
    assert.equal(exported.detailedEvidence.sections.find(section => section.id === "cmp")?.title, "CMP details");
    assert.equal(exported.cmpAudit.rows.length, 13);
    assert.deepEqual(JSON.parse(JSON.stringify(exported.cmpAudit.rows)), JSON.parse(JSON.stringify(audit.rows)));
  }
  const recognizedWithoutBanner = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: noSurface(), consentVendor: "OneTrust" });
  assert.equal(recognizedWithoutBanner.experience!.provider, "OneTrust");
  assert.equal(recognizedWithoutBanner.experience!.summary, "No consent banner observed on this visit.");
});

test("saved v1 experience metadata gets current presentation copy without rewriting retained rows", () => {
  for (const [mode, title, summary, expected] of [
    ["consent_controls", "Consent controls", "Consent mechanism observed; provider not identified.", "Consent banner observed; provider not identified."],
    ["consent_signals", "Consent and cookie signals", "No consent surface was observed on this visit.", "No CMP identified. No consent banner observed on this visit."],
    ["capture_limited", "Consent capture limited", "Control evidence unavailable", "CMP identification and consent banner detection could not be determined on this visit."],
  ] as const) {
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: mode === "consent_signals" ? noSurface() : mode === "capture_limited" ? undefined : observedControlAssessment });
    const originalRows = structuredClone(audit.rows);
    audit.experience = { ...audit.experience!, mode, title, summary };
    const rendered = cmpDetailsExperience(audit, null);
    assert.equal(rendered.title, "CMP details");
    assert.equal(rendered.summary, expected);
    assert.equal(audit.experience.title, title, "Saved metadata remains untouched");
    assert.deepEqual(audit.rows, originalRows);
  }
});

test("no-surface view omits retained-check disclosure while preserving underlying statuses and related evidence", () => {
  const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: noSurface() });
  const before = structuredClone(audit);
  assert.deepEqual(audit.experience!.defaultCriterionIds, []);
  for (const compact of [false, true]) {
    const report = { ...SHADOW_REPORT, scan: { ...SHADOW_REPORT.scan, id: "scan-1" }, consentVendor: null, cmpAudit: audit,
      controls: { accept: "Not observed", reject: "Not observed", options: "Not observed" } };
    const html = renderToStaticMarkup(<EvidenceDirectory report={report} compact={compact} />);
    const start = html.indexOf('id="cmp-details"'), end = html.indexOf('id="consent-review-evidence"', start);
    const cmp = html.slice(start, end);
    assert.match(cmp, /CMP details/);
    assert.match(cmp, /No CMP identified\. No consent banner observed on this visit\./);
    assert.doesNotMatch(cmp, /<details id="cmp-criterion-|Consent management audit|No review flags|All retained checks|data-cmp-retained-checks/);
    assert.equal((cmp.match(/data-shared-evidence-target="cmp-details"/g) ?? []).length, 13, "Existing deep links retain aliases to the section");
    assert.match(cmp, /Provider: Not identified/);
    assert.doesNotMatch(cmp, /View consent choices|View cookies and storage|View tracking evidence|View policy evidence/);
    const exported = buildDetailedEvidenceExport(report);
    assert.equal(exported.cmpAudit.rows.length, 13);
    assert.deepEqual(JSON.parse(JSON.stringify(exported.cmpAudit.rows)), JSON.parse(JSON.stringify(audit.rows)));
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

test("no-surface view omits duplicate observed policy detail but keeps a supported review visible and exports unchanged", () => {
  for (const status of ["Observed", "Review recommended"] as const) {
    const audit = projectCmpAudit({ scanId: "scan-1", consentControlAssessment: noSurface() });
    const policy = audit.rows.find(row => row.id === "privacy_link")!;
    policy.status = status;
    audit.experience!.defaultCriterionIds = ["privacy_link"];
    const report = { ...SHADOW_REPORT, scan: { ...SHADOW_REPORT.scan, id: "scan-1" }, consentVendor: null, cmpAudit: audit };
    const before = buildDetailedEvidenceExport(report);
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(<CmpDetails audit={audit} vendor={null} compact={compact} />);
      assert.doesNotMatch(html, /All retained checks|View consent choices|View cookies and storage|View tracking evidence|View policy evidence/);
      assert.match(html, /Provider: Not identified/);
      assert.equal(html.includes('<details id="cmp-criterion-privacy_link"'), status === "Review recommended");
      assert.ok(html.includes('id="cmp-criterion-privacy_link"'), "Existing navigation anchor remains available");
    }
    assert.deepEqual(buildDetailedEvidenceExport(report), before);
    assert.equal(before.cmpAudit.rows.length, 13);
  }
});
