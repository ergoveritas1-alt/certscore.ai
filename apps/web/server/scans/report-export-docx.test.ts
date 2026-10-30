import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { renderCanonicalReportDocx, REPORT_DOCX_CONTENT_TYPE } from "./report-export-docx";
import { priorityReportFixture } from "./report-priority.fixture";
import { pdfPriorityReview } from "./report-pdf-priorities";
import { pdfPublicWords } from "./report-pdf-reader";
import { pdfEvidenceTable } from "./report-pdf-appendices";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { californiaPriorityGpcFixture } from "../../lib/scans/test-fixtures/california-priority-gpc";
import { assessGpcPotentialRisk } from "../../lib/scans/california-potential-risk-policy";
import { reportFormsScanFixture, reportRequestScanFixture } from "./report-forms.fixture";
import { buildCanonicalReportExport } from "./report-export";
import { REPORT_EXPORT_DISCLAIMER } from "./report-export-footer";
import sharp from "sharp";

/** Inspect the actual OOXML archive without a second production ZIP dependency. */
function parts(buffer: Buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10), length = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + length);
    assert.ok(method === 0 || method === 8);
    entries.set(buffer.toString("utf8", offset + 46, offset + 46 + nameLength), (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function text(xml: string) { return [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]!.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')).join("\n"); }

test("Word embeds bounded workspace branding in both header themes without changing canonical content", async () => {
  const report = priorityReportFixture(), before = structuredClone(report);
  const logo = await sharp({ create: { width: 320, height: 120, channels: 4, background: "#036a91" } }).png().toBuffer();
  for (const headerTheme of ["white", "black"] as const) {
    const archive = parts(await renderCanonicalReportDocx(report, { brandName: "Owned Agency", brandLogo: { body: logo, contentType: "image/png" }, headerTheme }));
    const xml = archive.get("word/document.xml")!, content = text(xml);
    assert.match(content, /example\.test\nSCORE\nReview\nOwned Agency\nGDPR\/ePrivacy/);
    assert.match(content, /SCORE\nReview\nOwned Agency\nGDPR\/ePrivacy[^\n]*\n+[^\n]+\nScan origination: Germany \(EU\)/);
    assert.ok(!content.includes(pdfPriorityReview(report).highlights.text), "Export omits the highlights paragraph");
    assert.match(xml, /name="Workspace logo"/);
    const header = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
    assert.match(header, /Executive Summary[\s\S]*Workspace logo[\s\S]*SCORE[\s\S]*Scan origination:/, "All header content belongs to one flat table, including in Pages");
    assert.equal((header.match(/<w:tbl>/g) ?? []).length, 1, "Nested header tables must not return");
    const heights = [...header.matchAll(/<w:trHeight w:val="(\d+)" w:hRule="exact"\/>/g)].map(match => Number(match[1]));
    assert.equal(heights.length, 5, "Pages header rows have explicit heights");
    assert.ok(heights.reduce((sum, height) => sum + height, 0) <= 2100, "Ordinary header stays within the PDF's roughly 100-point height");
    assert.match(header, /<w:gridSpan w:val="4"/);
    assert.equal((header.match(/<w:vMerge w:val="restart"/g) ?? []).length, 3, "Logo, score label and score image span the three identity rows");
    const lastRow = [...header.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].at(-1)![0];
    assert.match(lastRow, /21 Oct 2026[\s\S]*Scan origination:/, "Date and origination share the bottom grid row");
    const summary = xml.slice(0, xml.indexOf("<w:sectPr>"));
    const spacers = [...summary.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map(match => match[0]).filter(paragraph => /<w:t[^>]*><\/w:t>/.test(paragraph));
    assert.ok(spacers.length > 4);
    for (const spacer of spacers) {
      const properties = spacer.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)![0];
      assert.match(properties, /w:lineRule="exact"/, "Summary spacers must not inherit body line height");
      assert.match(properties, /<w:rPr>[\s\S]*w:sz w:val="[23]"/, "Pages needs the spacer paragraph mark sized explicitly");
    }
    assert.equal([...archive.keys()].filter(name => /^word\/media\/.+\.png$/.test(name)).length, 2);
    assert.match(xml, headerTheme === "black" ? /w:fill="000000"/ : /w:fill="FFFFFF"/);
    for (const [name, footer] of archive) if (/^word\/footer\d+\.xml$/.test(name)) assert.match(text(footer), /Owned Agency \|/);
    assert.deepEqual(report, before);
  }
  await assert.rejects(renderCanonicalReportDocx(report, { brandLogo: { body: Buffer.from("invalid"), contentType: "image/png" } }), /valid.*logo|valid.*image/i);
});

test("Word header reserves height for wrapped identities rather than clipping editable text", async () => {
  const report = priorityReportFixture();
  const logo = await sharp({ create: { width: 320, height: 120, channels: 4, background: "#036a91" } }).png().toBuffer();
  const opts = { brandLogo: { body: logo, contentType: "image/png" } };
  const header = async (brandName: string) => parts(await renderCanonicalReportDocx(report, { ...opts, brandName })).get("word/document.xml")!.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
  const ordinary = await header("Owned Agency");
  report.scan.domainHostname = "www." + "wide-domain-name-".repeat(3) + "example.test";
  const brandName = "Worldwide workspace ".repeat(3).trim();
  const wrapped = await header(brandName);
  const height = (xml: string) => [...xml.matchAll(/<w:trHeight w:val="(\d+)"/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  assert.ok(height(wrapped) > height(ordinary));
  assert.ok(text(wrapped).includes(brandName));
  assert.ok(text(wrapped).includes(report.scan.domainHostname));
});

test("Word is a real editable DOCX using the same canonical priority and preserving other findings", async () => {
  const report = priorityReportFixture(), before = structuredClone(report);
  const archive = parts(await renderCanonicalReportDocx(report, { timeZone: "Pacific/Honolulu" }));
  const xml = archive.get("word/document.xml")!, content = text(xml);
  assert.match(REPORT_DOCX_CONTENT_TYPE, /wordprocessingml.document$/);
  assert.ok(archive.has("[Content_Types].xml") && archive.has("word/styles.xml"));
  assert.match(xml, /w:pStyle w:val="Title"/);
  assert.match(content, /Starting-page score/);
  assert.match(xml, /Score 80\/100/);
  assert.match(xml, /w:sz w:val="32"[^>]*\/>[\s\S]*?<w:t[^>]*>Executive Summary<\/w:t>/);
  assert.match(content, /Review\nCertScore\.ai\nGDPR\/ePrivacy[^\n]*\n+[^\n]+\nScan origination: Germany \(EU\)/);
  assert.doesNotMatch(content, /Targeted review/);
  assert.match(content, /1 selected priority/);
  assert.match(xml, /w:anchor="report_consent"/);
  assert.match(xml, /w:bookmarkStart[^>]*w:name="report_findings"/);
  assert.ok(!content.includes(pdfPriorityReview(report).highlights.text), "Export omits the highlights paragraph");
  for (const finding of report.projection.unifiedFindings.filter(f => f.unifiedFindingId !== "post_reject_click_tracking")) assert.ok(content.includes(pdfPublicWords(finding.summary)));
  assert.ok(content.includes(pdfPublicWords(pdfPriorityReview(report).topIssues[0]!.summary)));
  assert.match(content, /Other report findings/);
  assert.match(content, /Partial concern/);
  assert.doesNotMatch(content, /deduction|scoring withheld|Global Privacy Control|GPC response|sale \/ sharing/);
  assert.ok(![...archive.keys()].some(name => /vbaProject|embeddings|activeX/.test(name)));
  const footers = [...archive.entries()].filter(([name]) => /^word\/footer\d+\.xml$/.test(name));
  assert.equal(footers.length, 2);
  for (const [, footer] of footers) {
    assert.ok(text(footer).includes(`Scan ID: ${report.scan.id}`));
    assert.ok(text(footer).includes(REPORT_EXPORT_DISCLAIMER));
  }
  assert.deepEqual(report, before);
});

test("California Word uses its score and qualified priorities while excluding EU-only conclusions", async () => {
  const report = priorityReportFixture(); report.reviewFocus = "ccpa_cpra"; report.reviewFocusLabel = "CCPA/CPRA";
  const gpc = californiaPriorityGpcFixture();
  report.projection.unifiedFindings = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: {
    gpcResponseAssessment: gpc, californiaGpcPotentialRiskAssessment: assessGpcPotentialRisk(gpc, "california.collection-review.v3-retained-scope"),
  } });
  report.projection.checklist = [];
  report.appendix.gdprTransparency.rows = [{ id: "legal_basis_disclosure_observed", label: "EU_ONLY_DISCLOSURE", status: "Observed", rationale: "EU_ONLY_CONCLUSION" }] as never;
  const before = structuredClone(report), archive = parts(await renderCanonicalReportDocx(report));
  const content = text(archive.get("word/document.xml")!);
  const selected = pdfPriorityReview(report);
  assert.ok(selected.topIssues.some(f => f.id === "california_collection_review"));
  assert.match(archive.get("word/document.xml")!, /Score 100\/100/);
  assert.match(content, /Starting-page score/);
  assert.match(content, /1 selected priority/);
  assert.ok(content.includes(selected.topIssues[0]!.title));
  assert.ok(!content.includes(selected.highlights.text), "Export omits the highlights paragraph");
  assert.doesNotMatch(content, /EU_ONLY|Score 80\/100/);
  assert.deepEqual(report, before);
});

test("missing choice proof does not become a Word priority or a completed decision", async () => {
  const report = priorityReportFixture();
  report.projection.checklist[0]!.criticalEvidence.retainedEvidence.reportControlObserved = false;
  const content = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.match(content, /0 selected priorities/);
  assert.match(content, /Other report findings/);
  assert.doesNotMatch(content, /1\. Non-essential|consent was registered/);
});

test("full-site Word preserves the stored site score, page scope and shared priority selection", async () => {
  const report = priorityReportFixture(), priority = pdfPriorityReview(report).topIssues[0]!;
  report.score = { value: 72, scope: "full_site" };
  report.scan.pagesScanned = 2;
  report.fullSite = {
    scope: "Observed site pages", scoreScope: "Full-site score", condition: "Completed", countingScope: "Observed resources only",
    inventoryHref: "/app/scans/fixture/resources",
    summary: { state: { requested: { maxPages: 2, concurrency: 1, waitSeconds: 0 }, effective: { concurrency: 1, waitSeconds: 0 }, region: "eu_de", status: "completed", stopReason: "page_limit", startedAt: "2026-10-21T23:18:00Z", completedAt: "2026-10-21T23:19:00Z", homepageDurationMs: 1000 },
      counts: { completed: 2, partial: 0, blockedFailed: 0, pending: 0, excluded: 0 }, totals: { services: 1, cookies: 0, requestEvents: 1, embedInstances: 0, additionalServices: 1 }, timing: { medianPageMs: 1000, slowestPageMs: 1000, sampleCount: 2 } },
    score: { value: 72, scope: "Observed site pages", priorityReview: [{ ...priority, pages: [{ id: "page-two", url: "https://example.test/second", homepage: false }] }] },
    pages: [{ id: "page-two", url: "https://example.test/second", status: "completed", services: 1, cookies: 0, requestEvents: 1, embedInstances: 0, limitations: [] }],
    resources: [{ occurrence: { kind: "service", label: "Owned service evidence", vendor: "Owned service" }, purposes: ["Analytics"], pageIds: ["page-two"] }],
  } as never;
  const before = structuredClone(report), content = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.match(content, /SCORE/); assert.match(content, /Full-site score/);
  assert.match(content, /https:\/\/example.test\/second/); assert.match(content, /Owned service evidence/);
  assert.ok(!content.includes(pdfPriorityReview(report).highlights.text), "Export omits the highlights paragraph");
  assert.deepEqual(report, before);
});

test("Word tables preserve unabridged Unicode cells, XML escaping and repeating headers", async () => {
  const report = priorityReportFixture();
  const long = 'Résumé <script> & "quoted" ' + "retained clause ".repeat(250) + "FINAL_RETAINED_CLAUSE";
  report.appendix.evidenceDossier!.checklistDetails = [{ id: "transport_security_tls_certificate", topic: "security", label: "Certificate", status: "Observed", explanation: "Retained certificate evidence.", facts: [{ label: "Retained evidence", value: long }], correctionSteps: [], subchecks: [] }] as never;
  const archive = parts(await renderCanonicalReportDocx(report)), xml = archive.get("word/document.xml")!;
  assert.match(xml, /Résumé &lt;script&gt; &amp; &quot;quoted&quot;/);
  assert.match(xml, /FINAL_RETAINED_CLAUSE/);
  assert.doesNotMatch(xml, /<script>/);
  assert.match(xml, /w:tblHeader/);
  const rows = pdfEvidenceTable("long", ["Evidence"], [[long]], [512]);
  assert.equal(rows[1]!.sourceCells![0], long);
  assert.ok(rows.slice(2).every(row => row.tableRowContinuation));
});

test("public Word export rejects internal infrastructure evidence without fetching external content", async () => {
  const report = priorityReportFixture(); report.limitations = [{ detail: "Internal URL http://127.0.0.1/private" }] as never;
  await assert.rejects(renderCanonicalReportDocx(report), /internal infrastructure/);
});

test("Word retains factual narratives without publishing historical score-effect explanations", async () => {
  const report = priorityReportFixture();
  const finding = report.projection.unifiedFindings[0]!;
  finding.summary = "Some request identities overlap. It corroborates review without adding a second score effect.";
  report.projection.unifiedFindings[3]!.summary = "Activity followed Accept. This is an informational behavior record and does not affect score.";
  const before = structuredClone(report), content = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.match(content, /Some request identities overlap\./); assert.match(content, /Activity followed Accept\./);
  assert.doesNotMatch(content, /score effect|does not affect score/);
  assert.deepEqual(report, before);
});

test("shared export wording decodes text and keeps inferred purpose without internal registry identifiers", () => {
  assert.equal(pdfPublicWords("tracking | Inferred separately: analytics; canonical_cookie_registry.v1"), "tracking | Inferred separately: analytics");
  assert.equal(pdfPublicWords("&lt;100ms &amp; 1 year"), "<100ms & 1 year");
});

test("EU and California scope opt-out limitations consistently with the shared report sections", async () => {
  const report = priorityReportFixture();
  report.limitations = [{ code: "privacy_opt_out_execution_not_tested", detail: "CA_ONLY_OPT_OUT_SCOPE" }, { code: "bounded_observation_scope", detail: "SHARED_CAPTURE_SCOPE" }] as never;
  const eu = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.doesNotMatch(eu, /CA_ONLY_OPT_OUT_SCOPE/); assert.match(eu, /SHARED_CAPTURE_SCOPE/);
  report.reviewFocus = "ccpa_cpra"; report.reviewFocusLabel = "CCPA/CPRA";
  const ca = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.match(ca, /CA_ONLY_OPT_OUT_SCOPE/); assert.match(ca, /SHARED_CAPTURE_SCOPE/);
  assert.equal(report.limitations.length, 2);
});

test("Word includes the same two after-Accept forms and nine retained fields as the scan", async () => {
  const scan = reportFormsScanFixture(), report = buildCanonicalReportExport(scan)!;
  const content = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
  assert.match(content, /Inventory summary: 2 forms; 9 fields/);
  assert.match(content, /Initial page: 0; after Accept: 2/);
  assert.match(content, /Contact field 8/); assert.match(content, /Search/); assert.match(content, /capture was limited/);
  assert.doesNotMatch(content, /\nNo forms found\./);
});


test("Word retains the complete initial request inventory and excludes EU review summaries from California", async () => {
  for (const focus of ["gdpr_eprivacy", "ccpa_cpra"] as const) {
    const report = buildCanonicalReportExport(reportRequestScanFixture(), undefined, focus)!;
    report.gdprEprivacyReview = priorityReportFixture().gdprEprivacyReview;
    report.gdprEprivacyReview!.reviewSummary.coverageText = "EU_REVIEW_SUMMARY_SENTINEL";
    report.gdprEprivacyReview!.reviewSummary.priorityReviewText = "EU_PRIORITY_SUMMARY_SENTINEL";
    const content = text(parts(await renderCanonicalReportDocx(report)).get("word/document.xml")!);
    assert.match(content, /3 request events; 2 distinct request resources before a choice/);
    assert.match(content, /asset-2\.js/); assert.doesNotMatch(content, /PRIVATE_VALUE/);
    if (focus === "ccpa_cpra") assert.doesNotMatch(content, /EU_REVIEW_SUMMARY_SENTINEL|EU_PRIORITY_SUMMARY_SENTINEL|Summary counts:/);
  }
});
