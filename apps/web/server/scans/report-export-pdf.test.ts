import assert from "node:assert/strict";
import test from "node:test";
import { buildTechnologyInventory } from "@certscore/contracts";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { reportCmpEvidenceFixture, reportTechnicalEvidenceFixture, reportVisualEvidenceFixture } from "./report-appendix-evidence.fixture";
import { createHash } from "node:crypto";
import { projectCmpAudit } from "../../lib/scans/cmp-audit-projection";
import { appendixEvidenceLines } from "./report-pdf-appendices";
import { renderCanonicalReportPdf } from "./report-export-pdf";
import { PDF_REPORT_TOPICS, pdfTopicForFinding, pdfTopicForRow } from "./report-pdf-topics";
import { pdfPublicWords } from "./report-pdf-reader";
import type { CanonicalReportExport } from "./report-export";
import { californiaPriorityGpcFixture, QUALIFIED_URL } from "../../lib/scans/test-fixtures/california-priority-gpc";

const visiblePdfText = (source: string) => [...source.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1]!.replace(/\\([\\()])/g, "$1")).join(" ");

test("renders a multi-section canonical report as a valid bounded PDF", async () => {
  const report = {
    artifactType: "certscore_canonical_report_export",
    artifactVersion: "canonical-report-export-v8",
    score: { value: 64, scope: "starting_page" },
    reviewFocus: "gdpr_eprivacy",
    reviewFocusLabel: "GDPR/ePrivacy",
    reviewScope: "Observed from Ireland. Changing review focus uses the same evidence.",
    privacyAuditEvidence: null,
    gpcResponse: null,
    generatedAt: "2026-08-24T00:00:00.000Z",
    scan: {
      id: "00000000-0000-0000-0000-000000000001",
      domainHostname: "example.test",
      status: "completed",
      scanType: "full",
      scanFrom: "eu_ie",
      createdAt: "2026-08-24T00:00:00.000Z",
      startedAt: "2026-08-24T00:00:01.000Z",
      completedAt: "2026-08-24T00:00:20.000Z",
      durationMs: 19_000,
      pagesRequested: 1,
      pagesScanned: 1,
    },
    executiveSummary: {
      posture: "targeted review priority",
      sentences: [
        "The retained evidence indicates targeted review priority across the in-scope checklist.",
        "No high-priority finding was retained; automated evidence coverage was complete.",
        "This is a technical risk-signal summary for review prioritization, not a determination of legal compliance or legal advice.",
      ],
      counts: {
        gapObserved: 0,
        potentialConcern: 1,
        reviewSignal: 1,
        technicalLimitation: 0,
        highPriorityFindings: 0,
        inScopeChecklistRows: 3,
      },
    },
    gdprEprivacyReview: {
      checklistScore: { score: 82, summary: "Retained evidence coverage is targeted." },
      reviewSummary: { coverageText: "Coverage retained.", priorityReviewText: "Review targeted rows." },
      summaryCounts: { gap_observed: 0, potential_concern: 1, review_signal: 0, technical_limitation: 0 },
      rows: [
        {
          id: "consent_surface_observed",
          label: "Consent mechanism",
          evidenceLabel: "Observed",
          rationale: "A consent surface was retained.",
          assessmentDirection: "positive_signal",
          assessmentStatus: "checked",
          evidenceState: "observed",
          policyReviewCandidate: false,
          scannerCoverageGap: false,
          status: "Observed",
          tone: "neutral",
        },
        {
          id: "controller_contact_disclosure",
          label: "Controller/contact disclosure",
          evidenceLabel: "Observed",
          rationale: "Controller contact evidence was retained.",
          assessmentDirection: "positive_signal",
          assessmentStatus: "checked",
          evidenceState: "observed",
          policyReviewCandidate: true,
          scannerCoverageGap: false,
          status: "Observed",
          tone: "neutral",
        },
        {
          id: "transport_security_tls_certificate",
          label: "Valid SSL/TLS certificate",
          evidenceLabel: "Observed",
          rationale: "The retained TLS probe verified the origin certificate.",
          assessmentDirection: "positive_signal",
          assessmentStatus: "checked",
          evidenceState: "observed",
          policyReviewCandidate: false,
          scannerCoverageGap: false,
          status: "Observed",
          tone: "neutral",
        },
      ],
    },
    projection: {
      artifactVersion: "persisted-canonical-report-projection-v5",
      normalizedConcerns: [],
      unifiedFindings: [{
        unifiedFindingId: "transport_security_tls_certificate",
        severity: "medium",
        presentation: {
          findingName: "TLS certificate review",
          findingDescription: "Retained TLS evidence requires review.",
        },
      }],
      topFindingIds: [],
      checklist: [],
      checklistPresentation: null,
      evidenceIndex: null,
      scoreAssessmentInput: {},
    },
    consentControlAssessment: { ...structuredClone(observedControlAssessment), scan: { ...observedControlAssessment.scan, scanId: "00000000-0000-0000-0000-000000000001" } },
    limitations: [{ code: "pre_interaction_observation_only", detail: "No consent controls were clicked." }],
    appendix: {
      gdprTransparency: {
        title: "Appendix: GDPR Transparency",
        scopeNote: "Persisted transparency rows only.",
        summary: { totalRows: 1, observedRows: 1, notConfirmedRows: 0, noMatchRows: 0 },
        rows: [{
          id: "controller_contact_disclosure",
          label: "Controller/contact disclosure",
          evidenceLabel: "Observed",
          rationale: "Controller contact evidence was retained.",
          assessmentDirection: "positive_signal",
          assessmentStatus: "checked",
          evidenceState: "observed",
          policyReviewCandidate: true,
          scannerCoverageGap: false,
          status: "Observed",
          tone: "neutral",
        }],
      },
      cookieAndTrackerInventory: {
        title: "Appendix: Detailed cookie and tracker inventory",
        scopeNote: "Observed evidence from the bounded scan only.",
        presentationStatus: "retained",
        presentationMessage: null,
        summary: {
          totalRows: 1,
          includedRows: 1,
          omittedRows: 0,
          cookieRows: 1,
          trackerRows: 0,
          groupedEntities: 1,
          requestEvidenceRows: 0,
          dataFlowRows: 0,
        },
        rows: [{
          rowNumber: 1,
          type: "cookie",
          vendor: "Example Analytics",
          purpose: ["Analytics"],
          evidenceClassification: "Non-essential",
          firstSeenMs: 1_250,
          preConsent: true,
          cookieNames: ["_example"],
          domains: ["example.test"],
          confidence: "high",
          relationship: { party: "first_party", site: "same_site", entity: "same_entity" },
          category: "Analytics",
          priority: "high",
          observedRecordCount: 1,
          requestCount: 1,
          setByThirdPartyScript: false,
          timingEvidence: "before_consent_cookie_write",
          attributionSignatures: ["example_analytics"],
          regulatoryRelevance: ["analytics"],
          requestDetails: [],
          dataFlows: [],
          cookieDetails: [],
        }],
      },
      dataCollectionSurfaces: {
        title: "Appendix: Data collection surfaces",
        scopeNote: "Persisted read-only collection-surface assessment only.",
        assessmentStatus: "observed",
        presentationMessage: "The retained read-only main-document inventory is listed below.",
        pageUrl: "https://example.test/contact",
        coverage: {
          status: "complete",
          documentScope: "main_document",
          interactionMode: "none",
          candidateFormCount: 1,
          retainedFormCount: 1,
          candidateFieldCount: 1,
          retainedFieldCount: 1,
          inspectedFormCandidateCount: 1,
          inspectedFieldCandidateCount: 1,
          candidateScanTruncated: false,
          retentionTruncated: false,
          reasonCodes: [],
        },
        summary: {
          totalForms: 1,
          totalFields: 1,
          candidateForms: 1,
          candidateFields: 1,
          omittedForms: 0,
          omittedFields: 0,
        },
        limitationKeys: [],
        evidenceRefs: ["CanonicalEvidenceBundle.json#collectionSurfaceInventory"],
        forms: [{
          formRef: "form-1",
          structure: "native_form",
          surfaceType: "contact",
          title: "Contact form",
          pageUrl: "https://example.test/contact",
          method: "post",
          actionRelationship: "self",
          candidateFieldCount: 1,
          retainedFieldCount: 1,
          fieldsTruncated: false,
          fields: [{
            fieldRef: "field-1",
            elementType: "input",
            inputType: "email",
            semanticCategory: "email",
            label: "Work email",
            autocompleteToken: "email",
            required: true,
            disabled: false,
            readOnly: false,
            evidenceRefs: [{ refId: "field-ref-1" }],
            confidence: 0.95,
            directVsInferred: "direct",
          }],
          evidenceRefs: [{ refId: "form-ref-1" }],
          confidence: 0.95,
          directVsInferred: "direct",
        }],
      },
    },
    notice: "Observed evidence only.",
  } as unknown as CanonicalReportExport;

  // Exercise the production renderer in both focuses, including a positive
  // retained GPC observation. Presentation must not rewrite either score.
  const jurisdictional=structuredClone(report);
  jurisdictional.californiaScore={score:86,scope:"starting_page"} as never;
  jurisdictional.appendix.gdprTransparency.rows[0]!.label="EU-only clause";
  const gpcAssessment=californiaPriorityGpcFixture([QUALIFIED_URL]);
  jurisdictional.gpcResponse={contractVersion:gpcAssessment.contractVersion,
    observation:gpcAssessment.contractVersion==="certscore.gpc-response-assessment.v3"?gpcAssessment.observation:undefined,
    comparison:gpcAssessment.comparison,status:gpcAssessment.status,summary:"Existing qualified GPC observation."} as never;
  const jurisdictionalBefore=JSON.stringify(jurisdictional);
  const euText=visiblePdfText(renderCanonicalReportPdf(jurisdictional).toString("latin1"));
  const california={...jurisdictional,reviewFocus:"ccpa_cpra",reviewFocusLabel:"CCPA/CPRA"} as CanonicalReportExport;
  const caText=visiblePdfText(renderCanonicalReportPdf(california).toString("latin1"));
  assert.doesNotMatch(euText,/GPC response|Global Privacy Control|Privacy choices and notices/);
  assert.match(caText,/GPC response/);
  assert.match(euText,/EU-only clause/);
  assert.doesNotMatch(caText,/EU-only clause|Transparency checks/);
  assert.match(caText,/California score 86 \/ 100/);
  const caUnknown={...california,californiaScore:{...california.californiaScore,score:null}};
  assert.match(visiblePdfText(renderCanonicalReportPdf(caUnknown).toString("latin1")),/California score N\/A Unavailable/);
  assert.equal(JSON.stringify(jurisdictional),jurisdictionalBefore);

  const pdf = renderCanonicalReportPdf(report);
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /\/Type \/Catalog/);
  assert.match(pdf.toString("latin1"), /Executive summary/);
  const pdfText = pdf.toString("latin1");
  const streams = [...pdfText.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]!);
  assert.doesNotMatch(pdfText, /What we tested|\(tested\)|tested-context/);
  assert.match(visiblePdfText(streams[1]!), /Top issues/);
  assert.doesNotMatch(visiblePdfText(streams[0]!), /Other \/ unavailable|Starting-page score: this exact page|Score covers the observed website pages|Not a legal certification|Choice-path results and timing/);
  assert.doesNotMatch(streams[0]!, /124 139 Td \(To review\) Tj/);
  assert.match(visiblePdfText(streams.slice(1).join("\n")), /Observed evidence only\./);
  for (const [index, topic] of PDF_REPORT_TOPICS.entries()) {
    assert.ok(visiblePdfText(streams[0]!).includes(topic.title), `Page 1 must include ${topic.title}`);
    const heading = `Appendix ${String.fromCharCode(65 + index)}: ${topic.title}`;
    assert.equal(streams.filter(stream => stream.includes(`(${heading}) Tj`)).length, 1);
    const chapterStream = streams.find(stream => stream.includes(`(${heading}) Tj`))!;
    assert.match(chapterStream, /50 782 Td/, "Each appendix starts at the top of a new page");
    assert.ok(streams.findIndex(stream => stream.includes(heading)) > 0);
    assert.ok(pdfText.includes(`/Dest (${topic.id})`));
    if (index) assert.ok(pdfText.indexOf(heading) > pdfText.indexOf(`Appendix ${String.fromCharCode(64 + index)}:`));
  }
  assert.doesNotMatch(streams[0]!, /Appendix A:|No forms found|Controller\/contact disclosure/);
  assert.match(streams[0]!, /Region: Ireland/);
  assert.equal(pdfText.match(/Valid SSL\/TLS certificate/g)?.length, 1);
  assert.equal(pdfText.match(/\(1\. TLS certificate review - Finding\)/g)?.length, 1);
  assert.ok(pdfText.indexOf("Appendix E: Webserver security") < pdfText.indexOf("Valid SSL/TLS certificate"));
  assert.doesNotMatch(pdfText, /Appendix [A-Z]: TLS/);
  assert.match(pdfText, /\/Subtype \/Link/);
  assert.match(pdfText, /\/S \/URI/);
  assert.match(streams[0]!, /CertScore.ai score/);
  assert.match(streams[0]!, /Top issues/);
  assert.doesNotMatch(streams[0]!, /\([A-H]\) Tj|First third-party request|Reject confirmed/);
  assert.doesNotMatch(pdfText, /\(Overview\) Tj|\(Plan\) Tj|\(Workpaper\) Tj/);
  assert.match(streams[0]!, /Topic evidence at a glance/);
  assert.match(streams[0]!, /Site assessment/);
  assert.doesNotMatch(streams[0]!, /Findings by topic|\(Topics\)|\(Findings\)/);
  assert.match(streams[0]!, /35 Tf[^\n]*\(64\)/);
  assert.doesNotMatch(streams[0]!, /\(82\)/, "The headline must use the canonical overall score, not checklist score");
  assert.match(streams[0]!, / c\nS Q/, "Summary charts must use vector paths");
  const unavailableScore = structuredClone(report); unavailableScore.score.value = null;
  assert.match(renderCanonicalReportPdf(unavailableScore).toString("latin1"), /\(N\/A\)/);
  for (const value of [0, 100]) {
    const boundaryScore = structuredClone(report); boundaryScore.score.value = value;
    assert.match(renderCanonicalReportPdf(boundaryScore).toString("latin1"), new RegExp(`35 Tf[^\\n]*\\(${value}\\)`));
  }
  assert.match(pdfText, /Accessibility evidence unavailable; conformance remains unknown/);
  assert.match(pdf.toString("latin1"), /Contact form/);
  assert.match(pdf.toString("latin1"), /Work email/);
  assert.doesNotMatch(pdf.toString("latin1"), /Public data collection surfaces/);
  assert.equal(pdf.toString("latin1").match(/Controller\/contact disclosure/g)?.length, 1);
  assert.doesNotMatch(pdf.toString("latin1"), /Assessment: Complete; evidence coverage: Complete/);
  assert.match(pdf.toString("latin1"), /Accept control: Observed/);
  assert.doesNotMatch(pdf.toString("latin1"), /Coverage: .* requested pages/);
  assert.match(pdf.toString("latin1"), /Example Analytics/);
  assert.match(pdf.toString("latin1"), /%%EOF\n$/);
  assert.ok(pdf.length < 100_000);

  const jpegWithSof = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const pdfWithVisualEvidence = renderCanonicalReportPdf(report, {
    brandLogo: { body: jpegWithSof, contentType: "image/jpeg" },
    visualEvidence: { body: jpegWithSof, contentType: "image/jpeg" },
  }).toString("latin1");
  assert.match(pdfWithVisualEvidence, /Captured page evidence/);
  assert.doesNotMatch(pdfWithVisualEvidence, /Full captured page segment/);
  assert.match(pdfWithVisualEvidence, /\/Subtype \/Image/);
  assert.match(pdfWithVisualEvidence, /\/Im1 Do/);
  assert.match(pdfWithVisualEvidence, /\/Logo Do/);

  const sharp = (await import("sharp")).default;
  const screenshot = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const visualReport = structuredClone(report);
  visualReport.consentControlAssessment = reportVisualEvidenceFixture(report.scan.id, createHash("sha256").update(screenshot).digest("hex"));
  const focusedPdf = renderCanonicalReportPdf(visualReport, { visualEvidence: { body: screenshot, contentType: "image/png" } }).toString("latin1");
  assert.equal((focusedPdf.match(/\/Im1 Do/g) ?? []).length, 2, "Keep the full capture alongside its magnified control detail");
  assert.match(focusedPdf, /0.55 0.30 0.63 RG 1.5 w/);
  assert.match(visiblePdfText(focusedPdf), /Boxes mark observed Accept and Reject controls/);
  const logo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect x="8" y="8" width="144" height="144" rx="30" fill="#0284c7"/><path d="M40 100L80 40L120 100Z" fill="white"/><text x="175" y="100" font-size="45" font-family="Helvetica" fill="#0f172a">Northstar</text></svg>')).png().toBuffer();
  const brandedPdf = renderCanonicalReportPdf(report, {
    brandName: "Northstar Research (Client Reports)",
    brandLogo: { body: logo, contentType: "image/png" },
  });
  const blackHeaderPdf = renderCanonicalReportPdf(report, {
    brandName: "Northstar Research (Client Reports)", brandLogo: { body: logo, contentType: "image/png" }, headerTheme: "black",
  });
  const firstTextStream = (buffer: Buffer) => [...buffer.toString("latin1").matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]!).find(stream => stream.includes("Executive summary"))!;
  assert.match(firstTextStream(brandedPdf), /1 1 1 rg 0 690 612 152 re f/);
  assert.match(firstTextStream(brandedPdf), /23 Tf 0.12 0.18 0.27 rg/);
  assert.match(firstTextStream(blackHeaderPdf), /0 0 0 rg 0 690 612 152 re f/);
  assert.match(firstTextStream(blackHeaderPdf), /23 Tf 1 1 1 rg/);
  assert.match(blackHeaderPdf.toString("latin1"), /0 0 0 rg 0 812 612 30 re f/);
  assert.match(brandedPdf.toString("latin1"), /1 1 1 rg 0 812 612 30 re f/);
  const brandedText = brandedPdf.toString("latin1");
  assert.match(brandedText, /Northstar Research \\\(Client Reports\\\)/);
  assert.match(brandedText, /\/Logo Do/);
  assert.doesNotMatch(brandedText, /CERTSCORE\.AI|CertScore\.ai  -  retained technical evidence/);
  assert.match(brandedText, /Executive summary/);
  assert.match(brandedText, /Accept control: Observed/);
  const richReport = structuredClone(report);
  const localPdf = renderCanonicalReportPdf(report, { appUrl: "http://localhost:3000" }).toString("latin1");
  assert.doesNotMatch(localPdf, /localhost|s3:\/\/|local-parity/);
  assert.match(localPdf, /Download the technical workpaper/);
  assert.doesNotMatch(localPdf, /https:\/\/certscore\.ai\/api\/scans\//);
  assert.match(renderCanonicalReportPdf(report).toString("latin1"), /https:\/\/certscore\.ai\/api\/scans\//);
  for (const internal of ["http://localhost:3000/private", "s3://scan-artifacts/private", "http://192.168.1.2/private", "v2-dag-lambda/local-parity/private", `${"Unbroken-prefix".repeat(80)}local-parity`]) {
    const unsafe = structuredClone(report);
    unsafe.notice = internal;
    assert.throws(() => renderCanonicalReportPdf(unsafe), /internal infrastructure/);
  }
  const cmpFixture = reportCmpEvidenceFixture(report.scan.id);
  richReport.consentControlAssessment = cmpFixture.assessment;
  const cmpAudit = projectCmpAudit({ scanId: report.scan.id, consentControlAssessment: cmpFixture.assessment, consentVendor: "OneTrust", normalizedConcerns: cmpFixture.normalizedConcerns });
  const cmpRow = (id: string) => cmpAudit.rows.find(row => row.id === id)!;
  const technical = reportTechnicalEvidenceFixture(report.scan.id);
  technical.cms.technologyInventory = buildTechnologyInventory([{
    kind: "header", value: "x-powered-by: PHP/8.3.12", sourceUrl: technical.cms.documentUrl,
    sourceRef: "response-php", evidenceRef: "site_integrity:tech-signal:0",
  }], technical.cms.documentUrl);
  richReport.appendix.evidenceDossier = { cmp: { provider: "OneTrust", audit: cmpAudit }, cmsSecurity: technical.cms, formDestinations: technical.forms, checklistDetails: [{ id: "transport_security_tls_certificate", topic: "tls", label: "TLS certificate", status: "Observed", explanation: "Verified origin certificate.", note: "", evidenceRefs: ["transport:tls:1"], correctionSteps: [], subchecks: [], facts: [{ label: "issuer", value: "Example Certificate Authority" }, { label: "validTo", value: "2027-08-24T00:00:00Z" }] }, { id: "controller_contact_disclosure", topic: "policy", label: "Controller contact disclosure", status: "Observed", explanation: "Contact details in the retained privacy notice.", note: "", evidenceRefs: ["policy:notice:1"], correctionSteps: [], subchecks: [], facts: [{ label: "selectedPolicySectionExcerpt", value: "For questions about personal data, contact the controller at privacy@example.test." }, { label: "sourceUrl", value: "https://example.test/privacy" }] }] };
  const tracker = structuredClone(richReport.appendix.cookieAndTrackerInventory.rows[0]!);
  Object.assign(tracker, { rowNumber: 2, type: "tracker", vendor: "Example Metrics", domains: ["metrics.example.test"], cookieNames: [], resourceNames: ["Example Metrics"], requestDetails: [{ method: "POST", hostname: "metrics.example.test", path: "/collect", vendor: "Example Metrics", responseObserved: true, responseStorageAttempted: false, cookieNamesSent: [], responseCookieNamesSet: [], identifierParameterNames: ["client_id"], essentiality: "non_essential" }], relationship: { party: "third_party", site: "cross_site", entity: "external_entity" } });
  richReport.appendix.cookieAndTrackerInventory.rows = [...richReport.appendix.cookieAndTrackerInventory.rows, tracker];
  Object.assign(richReport.appendix.cookieAndTrackerInventory.summary, { trackerRows: 1, totalRows: 2, includedRows: 2, requestEvidenceRows: 1 });
  richReport.accessibilityEvidence = accessibilityAuditFixture({ scanId: report.scan.id });
  richReport.accessibilityAudit = { status: "completed", required: true, scope: "starting_page_rendered_content", engine: "axe-core", engineVersion: "4.11.3", durationMs: 1000, failedRuleCount: 4, affectedNodeCount: 4, reviewRuleCount: 0 };
  richReport.projection.unifiedFindings = [
    ...richReport.projection.unifiedFindings,
    ...["preconsent_tracking", "cookie_disclosure_gap", "weak_cookie_security_attributes"].map((id, index) => ({ unifiedFindingId: id, severity: "high", title: `Priority finding ${index + 1} with a long title `.repeat(5), summary: "Detailed retained evidence. ".repeat(24), presentation: { findingName: `Priority finding ${index + 1} with a long title `.repeat(5), suggestedFix: "Review the implementation against retained evidence and verify the correction. ".repeat(8) } })),
    { unifiedFindingId: "semantic_labeling_accessibility_issue", severity: "critical", details: { family: "accessibility" }, title: "Accessible names require review" },
  ] as unknown as CanonicalReportExport["projection"]["unifiedFindings"];
  const longCellReport = structuredClone(richReport);
  longCellReport.appendix.evidenceDossier.checklistDetails[0]!.facts[0]!.value = "Retained clause repeated for long-cell verification. ".repeat(400) + "FINAL_RETAINED_CLAUSE";
  const longCellPdf = renderCanonicalReportPdf(longCellReport);
  assert.ok(longCellPdf.toString("latin1").includes("FINAL_RETAINED_CLAUSE"), "Long table cells must continue without losing their final evidence");
  const dashboards = appendixEvidenceLines(richReport, { text: () => [], heading: text => ({ text }) });
  assert.deepEqual(dashboards.policy[0]!.overview!.metrics.map(metric => metric.value), ["1", "1", "1"]);
  assert.equal(dashboards.storage[0]!.overview!.metrics[2]!.value, "1", "Cookie-domain counts exclude external-service-only domains");
  assert.equal(dashboards.external[0]!.overview!.metrics[1]!.value, "1", "External-domain counts exclude cookie-only domains");
  assert.equal(dashboards.security[0]!.overview!.metrics[1]!.value, "Not retained", "A missing plugin inventory cannot become a zero-plugin result");
  const richBefore = JSON.stringify(richReport);
  const richPdf = renderCanonicalReportPdf(richReport, { brandName: "Northstar Research", brandLogo: { body: logo, contentType: "image/png" } });
  assert.equal(JSON.stringify(richReport), richBefore, "Rendering must never change canonical evidence or scoring inputs");
  const richText = richPdf.toString("latin1");
  const summaryStream = [...richText.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]!).find(stream => stream.includes("Executive summary"))!;
  assert.match(summaryStream, /Priority finding 1/);
  assert.doesNotMatch(summaryStream, /Appendix A:/);
  assert.match(summaryStream, /distinct observations/);
  assert.match(richText.slice(richText.indexOf("Appendix G: ADA/WCAG")), /Automated rule evidence: image-alt/);
  assert.match(richText, /\(#image-alt\)/);
  assert.match(richText, /https:\/\/dequeuniversity.com/);
  assert.doesNotMatch(richText, /deduction|scoring withheld|point penalty/i);
  for (const [index, topic] of PDF_REPORT_TOPICS.entries()) {
    const from = richText.indexOf(`Appendix ${String.fromCharCode(65 + index)}:`);
    const to = index < PDF_REPORT_TOPICS.length - 1 ? richText.indexOf(`Appendix ${String.fromCharCode(66 + index)}:`) : richText.length;
    const appendix = richText.slice(from, to);
    assert.ok(appendix.includes("Detailed evidence"), `${topic.id}: evidence remains present without navigation buttons`);
    if (appendix.includes("Where to investigate")) {
      for (const label of ["What to change / review", "How to verify", "Evidence / workpaper references"])
        assert.ok(appendix.includes(label), `${topic.id}: ${label}`);
    }
  }
  assert.equal((richText.match(/\(Sources and workpaper\) Tj/g) ?? []).length, 1, "All appendices share one workpaper section instead of duplicating it");
  const consentAppendix = richText.slice(richText.indexOf("Appendix A:"), richText.indexOf("Appendix B:"));
  for (const row of cmpAudit.rows) assert.ok(consentAppendix.includes(row.label.slice(0, 30)), row.id);
  for (const retained of ["OneTrust", "retained_cookie_100", "Audience measurement", "Analytics consent", "metrics.example.test/collect"]) assert.ok(consentAppendix.includes(retained), retained);
  assert.ok((consentAppendix.match(/CMP-stated purpose/g)?.length ?? 0) > 1, "Long inventories repeat column headers on continued pages");
  assert.ok(richText.includes("Appendix A: CMP and consent \\(continued\\)"));
  assert.match(richText.slice(richText.indexOf("Appendix E:")), /Example Certificate Authority/);
  assert.doesNotMatch(richText.slice(0, richText.indexOf("Appendix E:")), /Example Certificate Authority/);
  const richVisibleText = [...richText.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1]!.replace(/\\([\\()])/g, "$1")).join(" ");
  const normalizedText = (text: string) => pdfPublicWords(text).replace(/[^a-z0-9]/gi, "").toLowerCase();
  const renderedEvidence = normalizedText(richVisibleText);
  const evidenceLines = appendixEvidenceLines(richReport, { text: text => [{ text: String(text) }], heading: text => ({ text }) });
  for (const lines of Object.values(evidenceLines)) for (const line of lines) for (const cell of line.cells ?? []) for (const text of cell) {
    assert.ok(renderedEvidence.includes(normalizedText(text)), `Compact layout must preserve every evidence table cell: ${text}`);
  }
  assert.ok(richVisibleText.includes("Timing association only"));
  assert.doesNotMatch(richText, /Exact field-value match|undefined/);
  assert.ok(richVisibleText.includes("Drupal") && richVisibleText.includes("7.98"));
  assert.ok(richVisibleText.includes("Tech stack observed") && richVisibleText.includes("PHP") && richVisibleText.includes("8.3.12"));
  assert.ok(richVisibleText.includes("x-powered-by: PHP/8.3.12"));
  assert.equal((richText.match(/checks:/g) ?? []).length, 3, "CMP, policy and consolidated transport each show one checklist status strip");
  assert.doesNotMatch(richText, /No checklist rows retained for this topic/);
  assert.match(richText, /\/PageMode \/UseOutlines/);
  for (const topic of PDF_REPORT_TOPICS) for (const section of ["overview", "fixes", "evidence", "sources"])
    assert.ok(richText.includes(`/Dest (${topic.id}-${section})`), `${topic.id} ${section} has a navigation target`);
  assert.match(richText, /\/Dest \(executive\)/);
  const limitedReport = structuredClone(report);
  limitedReport.consentControlAssessment!.controls.reject.state = "unknown";
  limitedReport.consentControlAssessment!.assessmentStatus = "limited";
  limitedReport.consentControlAssessment!.coverage.status = "limited";
  const limitedText = renderCanonicalReportPdf(limitedReport).toString("latin1");
  assert.match(limitedText, /Reject \/ necessary-only control: Not observed/);
  assert.doesNotMatch(limitedText, /Reject \/ necessary-only control: Unknown/);
  limitedReport.consentControlAssessment!.document.identityStatus = "mismatched";
  assert.doesNotMatch(renderCanonicalReportPdf(limitedReport).toString("latin1"), /Accept control: Observed/);
  const previewReport = structuredClone(richReport);
  previewReport.executiveSummary.posture = "elevated review priority";
  previewReport.executiveSummary.sentences[0] = "The retained evidence indicates elevated review priority across consent, cookie disclosure and storage security reviews.";
  previewReport.executiveSummary.counts.highPriorityFindings = 4;
  const previewCopy: Record<string, { title: string; action: string }> = {
    preconsent_tracking: { title: "Tracking before a recorded consent choice", action: "Review the retained vendor requests and gate non-essential activity until a choice is recorded." },
    cookie_disclosure_gap: { title: "Cookie disclosure requires review", action: "Compare retained cookie names with the published cookie notice and update the relevant disclosure." },
    weak_cookie_security_attributes: { title: "Cookie security attributes need review", action: "Review the retained cookie attributes and verify the appropriate security settings." },
  };
  for (const finding of previewReport.projection.unifiedFindings as Array<Record<string, unknown>>) {
    const copy = previewCopy[String(finding.unifiedFindingId)];
    if (copy) { finding.title = copy.title; finding.summary = String(finding.unifiedFindingId) === "preconsent_tracking" ? "An analytics cookie and a metrics request were retained before a recorded consent choice." : `The retained scan flags ${String(finding.unifiedFindingId) === "cookie_disclosure_gap" ? "cookie disclosure" : "cookie security attributes"} for review.`; finding.presentation = { findingName: copy.title, suggestedFix: copy.action }; }
  }
  // The downloadable design preview uses internally consistent, illustrative data.
  // The stress fixtures above deliberately retain mismatches and extreme lengths.
  previewReport.limitations = [];
  Object.assign(previewReport.scan, { createdAt: "2026-10-20T12:00:00.000Z", startedAt: "2026-10-20T12:00:01.000Z", completedAt: "2026-10-20T12:00:20.000Z" });
  previewReport.generatedAt = "2026-10-20T12:01:00.000Z";
  previewReport.consentControlAssessment!.provenance.computedAt = "2026-10-20T12:00:20.000Z";
  previewReport.gdprEprivacyReview!.summaryCounts.gap_observed = 1;
  previewReport.gdprEprivacyReview!.reviewSummary.coverageText = "Retained evidence covers the starting page and the bounded observation windows.";
  previewReport.gdprEprivacyReview!.reviewSummary.priorityReviewText = "Review the listed findings alongside their retained evidence and implementation steps.";
  const previewFindings = previewReport.projection.unifiedFindings as Array<Record<string, unknown>>;
  const tlsFinding = previewFindings.find(finding => finding.unifiedFindingId === "transport_security_tls_certificate")!;
  tlsFinding.primaryPageUrl = "https://example.test/";
  tlsFinding.presentation = { findingName: "TLS certificate chain requires review", findingDescription: "The retained HTTPS probe could not validate the certificate chain served by example.test.", suggestedFix: "Install the complete intermediate certificate chain at the public TLS endpoint." };
  const tlsRow = previewReport.gdprEprivacyReview!.rows.find(row => row.id === "transport_security_tls_certificate")!;
  Object.assign(tlsRow, { status: "Gap observed", evidenceLabel: "Gap observed", assessmentStatus: "gap_observed", assessmentDirection: "negative_signal", rationale: "The retained probe could not validate the served certificate chain." });
  const tlsDetail = previewReport.appendix.evidenceDossier!.checklistDetails.find(row => row.id === tlsRow.id)!;
  Object.assign(tlsDetail, { status: "Gap observed", explanation: tlsRow.rationale });
  tlsDetail.facts.push({ label: "validTlsCertificate", value: "No" }, { label: "tlsProbeErrorMessage", value: "Unable to verify the first certificate in the served chain." });
  for (const finding of previewFindings.filter(item => ["preconsent_tracking", "weak_cookie_security_attributes", "cookie_disclosure_gap"].includes(String(item.unifiedFindingId)))) {
    finding.primaryPageUrl = "https://example.test/";
    finding.evidence = { pageUrls: ["https://example.test/"], entities: { cookies: ["_example"], domains: ["example.test"] } };
  }
  const weakDetail = { id: "weak_cookie_security_attributes", topic: "storage" as const, label: "Cookie security attributes", status: "Review signal" as const, explanation: "The retained _example cookie was set without Secure.", note: "", evidenceRefs: ["cookie:_example:initial"], correctionSteps: [], subchecks: [], facts: [{ label: "cookieName", value: "_example" }, { label: "domain", value: "example.test" }, { label: "path", value: "/" }, { label: "secure", value: "No" }] };
  previewReport.appendix.evidenceDossier!.checklistDetails.push(weakDetail);
  const a11y = previewReport.accessibilityEvidence!;
  a11y.documentUrl = "https://example.test/";
  a11y.startedAt = "2026-10-20T12:00:05.000Z";
  a11y.completedAt = "2026-10-20T12:00:06.000Z";
  const ruleCopy: Record<string, [string, string, string, string]> = {
    "image-alt": ["Images need a text alternative", "The team image has no alt attribute.", "#team-image", '<img id="team-image" src="/team.jpg">'],
    label: ["Form fields need an accessible label", "The email input has no associated label or accessible name.", "#contact-email", '<input id="contact-email" type="email">'],
    "button-name": ["Buttons need an accessible name", "The icon-only menu button has no accessible name.", "#menu-toggle", '<button id="menu-toggle"><svg aria-hidden="true"></svg></button>'],
    "color-contrast": ["Text needs sufficient color contrast", "The help text has a measured contrast of 2.3:1 against a required 4.5:1.", ".contact-help", '<p class="contact-help">We will reply by email.</p>'],
  };
  for (const rule of a11y.violations) {
    const [help, description, selector, html] = ruleCopy[rule.ruleId]!;
    rule.help = help; rule.description = description;
    for (const node of rule.representativeNodes) Object.assign(node, { selectors: [selector], htmlSnippet: html, failureSummary: description });
  }
  const accessibilityFinding = previewFindings.find(finding => finding.unifiedFindingId === "semantic_labeling_accessibility_issue")!;
  accessibilityFinding.primaryPageUrl = "https://example.test/";
  accessibilityFinding.summary = "An image, an email field and a menu button lack accessible names. The retained help-text sample also falls below its contrast threshold.";
  previewReport.appendix.evidenceDossier!.cmp.audit.rows.find(row => row.id === "cookie_information")!.supportingEvidence!.inventory!.declarations = cmpRow("cookie_information").supportingEvidence!.inventory!.declarations!.slice(0, 6);
  const longAssessmentReport = structuredClone(previewReport);
  longAssessmentReport.projection.unifiedFindings = [{ unifiedFindingId: "cookie_disclosure_gap", severity: "high", title: "Privacy disclosure review", summary: "W".repeat(530), presentation: { suggestedFix: "Review the retained policy disclosure." } }] as unknown as CanonicalReportExport["projection"]["unifiedFindings"];
  const longAssessmentPdf = renderCanonicalReportPdf(longAssessmentReport);
  const previewPdf = renderCanonicalReportPdf(previewReport, { brandName: "Northstar Research", brandLogo: { body: logo, contentType: "image/png" } });
  const previewBlackPdf = renderCanonicalReportPdf(previewReport, { brandName: "Northstar Research", brandLogo: { body: logo, contentType: "image/png" }, headerTheme: "black" });
  const previewPageStreams = [...previewPdf.toString("latin1").matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => visiblePdfText(match[1]!));
  assert.ok(previewPageStreams.some(page => page.includes("Evidence: Cookie security attributes") && page.includes("Cookie name")), "keep the short cookie evidence heading and its table on the same page");
  assert.ok(previewPageStreams.some(page => page.includes("Automated rule evidence: image-alt") && page.includes("#team-image")), "keep the accessibility evidence heading and affected element together");
  if (process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    await mkdir(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, { recursive: true });
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "workspace-report.pdf"), brandedPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "long-assessment.pdf"), longAssessmentPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "detailed-report.pdf"), richPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "long-evidence-cell.pdf"), longCellPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "black-header-report.pdf"), blackHeaderPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "visual-executive-summary.pdf"), previewPdf);
    await writeFile(path.join(process.env.CERTSCORE_BRANDING_PDF_PREVIEW_DIR, "visual-executive-summary-black.pdf"), previewBlackPdf);
  }
});

test("PDF topics group canonical identifiers and metadata without treating unknown findings as consent", () => {
  assert.equal(pdfTopicForRow("transport_security_tls_certificate"), "tls");
  assert.equal(pdfTopicForRow("transport_security_form_transport"), "forms");
  assert.equal(pdfTopicForFinding({ unifiedFindingId: "preconsent_tracking" }), "consent");
  assert.equal(pdfTopicForFinding({ unifiedFindingId: "weak_cookie_security_attributes" }), "storage");
  assert.equal(pdfTopicForFinding({ unifiedFindingId: "cookie_retention_lifetime_review_signal" }), "storage");
  assert.equal(pdfTopicForFinding({ unifiedFindingId: "controller_contact_disclosure" }), "policy");
  assert.equal(pdfTopicForFinding({ details: { family: "accessibility" } }), "accessibility");
  assert.equal(pdfTopicForFinding({ details: { family: "cms_security" } }), "security");
  assert.equal(pdfTopicForFinding({ unifiedFindingId: "future_finding", title: "Consent high risk TLS" }), null);
});
