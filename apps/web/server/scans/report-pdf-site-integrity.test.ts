import assert from "node:assert/strict";
import test from "node:test";
import { siteIntegrityCodeProofFixture, siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { getReviewFindingPresentation } from "../../lib/scans/review-finding-presentation";
import { SITE_INTEGRITY_REMEDIATION, SITE_INTEGRITY_REMEDIATION_TEXT } from "../../lib/scans/site-integrity-remediation";
import { selectSiteIntegrityFinding } from "../../lib/scans/site-integrity-report";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { pdfFrontmatter } from "./report-pdf-frontmatter";
import { pdfReviewGroups } from "./report-pdf-reader";
import { pdfSiteIntegrityRemediationEvidence } from "./report-pdf-site-integrity";
import type { CanonicalReportExport } from "./report-export";
import type { PdfLine } from "./report-export-pdf";

const layout = { text: (text: string, options?: Partial<PdfLine>): PdfLine[] => [{ text, ...options }], heading: (text: string): PdfLine => ({ text }) };

function fixture() {
  const projection = structuredClone(siteIntegrityProjectionFixture);
  projection.observation.links[0]!.codeProof = structuredClone(siteIntegrityCodeProofFixture);
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const finding = selectSiteIntegrityFinding(packets)!;
  return { scan: { id: projection.scanId, requestedUrl: projection.observation.documentUrl }, projection: { unifiedFindings: packets, checklist: [] }, appendix: { siteIntegrity: finding } } as unknown as CanonicalReportExport;
}

test("hidden-link guidance is shared by canonical presentation and eligible evidence panels", () => {
  const report = fixture();
  const before = structuredClone(report);
  const presentation = getReviewFindingPresentation(SITE_INTEGRITY_FINDING_ID);
  assert.equal(presentation.suggestedFix, SITE_INTEGRITY_REMEDIATION_TEXT);
  assert.equal(report.appendix.siteIntegrity!.action, SITE_INTEGRITY_REMEDIATION_TEXT);
  assert.equal(report.projection.unifiedFindings[0]!.presentation.suggestedFix, SITE_INTEGRITY_REMEDIATION_TEXT);
  for (const required of [/Elements search/, /DOM subtree-modification breakpoint/, /CMS blocks/, /remove the anchor/, /Preserve legitimate skip links/, /does not establish compromise/, /page\/CDN caches/, /keyboard-operable/, /Do not visit/]) assert.match(presentation.suggestedFix, required);
  assert.deepEqual(pdfReviewGroups(report)[0]!.observations[0]!.steps, SITE_INTEGRITY_REMEDIATION.steps);
  assert.deepEqual(report, before);
});

test("combined issue includes source, destination, measured cause and retained redacted code before fixes", () => {
  const report = fixture();
  report.projection.unifiedFindings[0]!.presentation.suggestedFix = "STALE_GENERIC_FIX";
  const before = structuredClone(report);
  const text = pdfFrontmatter(report, "http://localhost:3000", layout).map(line => line.text).join("\n");
  assert.match(text, /Source URL: https:\/\/clinic.example\//);
  assert.match(text, /Destination hostname: pharmacy.example \| Evidence: site_integrity:link:1/);
  assert.match(text, /bounding box 0 x 0px; computed overflow hidden/);
  assert.match(text, /\*   <div style="width:0px;height:0px;overflow:hidden">/);
  assert.match(text, /href="https:\/\/pharmacy.example\/\[redacted\]"/);
  assert.match(text, /not a source-file line or unique selector/);
  assert.ok(text.indexOf("Destination hostname:") < text.indexOf("1. Locate each listed"));
  assert.doesNotMatch(text, /STALE_GENERIC_FIX|test1-concealed-link|guaranteed|compromised site/);
  assert.deepEqual(report, before);
});

test("measurements reflect each retained concealment method, never a guessed selector", () => {
  for (const concealment of ["offscreen_position", "zero_size_container", "zero_font_size"] as const) {
    const report = fixture();
    const link = report.appendix.siteIntegrity!.evidence.observation.links[0]!;
    link.concealment = concealment;
    const proof = link.codeProof!;
    proof.computedStyle.position = "absolute";
    proof.computedStyle.fontSizePx = 0;
    proof.concealingRect.left = -9999;
    proof.concealingRect.top = -9999;
    const text = pdfSiteIntegrityRemediationEvidence(report, layout).map(line => line.text).join("\n");
    assert.match(text, concealment === "offscreen_position" ? /position absolute; bounding box left -9999px, top -9999px/ : concealment === "zero_size_container" ? /bounding box 0 x 0px; computed overflow hidden/ : /computed font-size 0px/);
  }
});

test("historical and capture-limited evidence does not fabricate code or source locations", () => {
  for (const limited of [false, true]) {
    const report = fixture();
    const link = report.appendix.siteIntegrity!.evidence.observation.links[0]!;
    delete link.codeProof;
    if (limited) link.codeProofUnavailableReason = "capture_limit";
    const text = pdfSiteIntegrityRemediationEvidence(report, layout).map(line => line.text).join("\n");
    assert.match(text, /Code excerpt not retained/);
    assert.match(text, /exact element and source file are unavailable/);
    assert.doesNotMatch(text, /<div|href=|bounding box|font-size/);
  }
});

test("malformed, mismatched and absent evidence supplies no code", () => {
  for (const mutation of ["missing", "mismatch", "malformed"] as const) {
    const report = fixture();
    if (mutation === "missing") delete report.appendix.siteIntegrity;
    else if (mutation === "mismatch") report.appendix.siteIntegrity!.evidence.scanId = "unrelated-scan";
    else report.appendix.siteIntegrity!.evidence.sourceHash = "invalid";
    const text = pdfSiteIntegrityRemediationEvidence(report, layout).map(line => line.text).join("\n");
    assert.match(text, /Link location evidence is unavailable/);
    assert.doesNotMatch(text, /pharmacy.example|Source URL:|<div/);
  }
});

test("raw appendix evidence cannot create or reopen a suppressed issue", () => {
  for (const suppressed of [false, true]) {
    const report = fixture();
    if (suppressed) report.projection.unifiedFindings[0]!.presentationDecision.status = "suppress";
    else report.projection.unifiedFindings = [];
    const text = pdfFrontmatter(report, "http://localhost:3000", layout).map(line => line.text).join("\n");
    assert.doesNotMatch(text, /Hidden outbound links|Destination hostname:|<div|1. Locate each listed/);
  }
});

test("separate pages retain their own evidence and repeated pages are deduplicated", () => {
  const report = fixture();
  const first = report.appendix.siteIntegrity!;
  const second = structuredClone(first);
  const pageId = "00000000-0000-4000-8000-000000000001";
  const attemptId = "00000000-0000-4000-8000-000000000002";
  second.evidence = { ...second.evidence, contractVersion: "certscore.site-integrity-projection.v2", pageId, attemptId, configurationHash: "c".repeat(64), evidenceRef: `full-site:${pageId}:${attemptId}:evidence.json#siteIntegrityObservation`, observation: { ...second.evidence.observation, contractVersion: "certscore.site-integrity-observation.v2", scope: "additional_page_main_document", documentUrl: "https://clinic.example/about" } };
  second.evidence.observation.links = [second.evidence.observation.links[0]!];
  report.appendix.siteIntegritySite = { findings: [first, first, second], coverage: [] };
  const text = pdfSiteIntegrityRemediationEvidence(report, layout).map(line => line.text).join("\n");
  assert.equal(text.split("Source URL:").length - 1, 2);
  assert.equal(text.split("Destination hostname: pharmacy.example").length - 1, 2);
  assert.match(text, /Source URL: https:\/\/clinic.example\/about/);
});
