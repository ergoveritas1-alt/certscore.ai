import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { pdfFrontmatter } from "./report-pdf-frontmatter";

test("each issue is immediately followed by its remediation before the next issue", () => {
  const report = {
    scan: { id: "combined-issues", requestedUrl: "https://example.test/page", scanFrom: "eu_ie" },
    projection: { unifiedFindings: [], checklist: [] },
    gdprEprivacyReview: { rows: [
      { id: "pre_consent_third_party_tracking", label: "Tracking", status: "Gap observed", rationale: "TRACKING_EVIDENCE" },
      { id: "privacy_notice_availability", label: "Privacy notice", status: "Gap observed", rationale: "POLICY_EVIDENCE" },
    ] },
    appendix: { evidenceDossier: { checklistDetails: [{ id: "privacy_notice_availability", correctionSteps: ["FIX_POLICY_NOTICE"] }] } },
  } as unknown as CanonicalReportExport;
  const before = structuredClone(report);
  const lines = pdfFrontmatter(report, "http://localhost:3000", {
    text: (text, options) => [{ text, ...options }], heading: text => ({ text, kind: "section" }),
  });
  const chapters = lines.filter(line => line.chapterTitle).map(line => line.chapterTitle);
  assert.deepEqual(chapters, ["Top issues and remediation", "How to re-test"]);
  const text = lines.map(line => line.text).join("\n");
  assert.doesNotMatch(text, /review areas|distinct checklist|Related observations|States:|Affected page:|Service request observations|Remediation plan/);
  const trackingEvidence = lines.findIndex(line => line.text === "TRACKING_EVIDENCE");
  const trackingFix = lines.findIndex(line => line.text.startsWith("1. In DevTools Network"));
  const policyHeading = lines.findIndex(line => line.kind === "section" && line.text.startsWith("2. Privacy policy"));
  const policyEvidence = lines.findIndex(line => line.text === "POLICY_EVIDENCE");
  const policyFix = lines.findIndex(line => line.text.startsWith("1. Check the scanned page's footer"));
  assert.ok(trackingEvidence >= 0 && trackingEvidence < trackingFix && trackingFix < policyHeading);
  assert.ok(policyHeading < policyEvidence && policyEvidence < policyFix);
  assert.equal(lines.filter(line => line.text === "Remediation").length, 2);
  assert.deepEqual(report, before);
});
