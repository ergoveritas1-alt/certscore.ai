import assert from "node:assert/strict";
import test from "node:test";
import { renderCanonicalReportPdf } from "./report-export-pdf";
import type { CanonicalReportExport } from "./report-export";

test("renders a multi-section canonical report as a valid bounded PDF", () => {
  const report = {
    artifactType: "certscore_canonical_report_export",
    artifactVersion: "canonical-report-export-v4",
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
    consentControlAssessment: {
      assessmentStatus: "complete",
      coverage: { status: "complete" },
      controls: {
        accept: { state: "observed" },
        reject: { state: "observed" },
        options: { state: "observed" },
        privacyOptOut: { state: "unknown" },
      },
    },
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
    },
    notice: "Observed evidence only.",
  } as unknown as CanonicalReportExport;

  const pdf = renderCanonicalReportPdf(report);
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /\/Type \/Catalog/);
  assert.match(pdf.toString("latin1"), /Executive summary/);
  assert.match(pdf.toString("latin1"), /Appendix: Detailed cookie and tracker inventory/);
  assert.match(pdf.toString("latin1"), /Appendix: GDPR Transparency/);
  assert.match(pdf.toString("latin1"), /Appendix: Transport Security/);
  assert.equal(pdf.toString("latin1").match(/Valid SSL\/TLS certificate/g)?.length, 1);
  assert.equal(pdf.toString("latin1").match(/TLS certificate review/g)?.length, 1);
  assert.ok(
    pdf.toString("latin1").indexOf("Appendix: Transport Security") <
      pdf.toString("latin1").indexOf("Valid SSL/TLS certificate"),
  );
  assert.doesNotMatch(
    pdf.toString("latin1").slice(
      pdf.toString("latin1").indexOf("Key findings"),
      pdf.toString("latin1").indexOf("Appendix: GDPR Transparency"),
    ),
    /Valid SSL\/TLS certificate|TLS certificate review/,
  );
  assert.doesNotMatch(pdf.toString("latin1"), /Data collection surfaces|Public data collection surfaces|Work email/);
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
  assert.match(pdfWithVisualEvidence, /Appendix: Full captured page/);
  assert.match(pdfWithVisualEvidence, /\/Subtype \/Image/);
  assert.match(pdfWithVisualEvidence, /\/Im1 Do/);
  assert.match(pdfWithVisualEvidence, /\/Logo Do/);
});
