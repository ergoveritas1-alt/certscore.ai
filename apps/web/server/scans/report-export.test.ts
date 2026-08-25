import assert from "node:assert/strict";
import test from "node:test";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { buildCanonicalReportExport } from "./report-export";

function scanRecord(): ScanDetailResponse {
  const scanId = "00000000-0000-0000-0000-000000000001";
  return {
    scan: {
      id: scanId,
      domainHostname: "example.test",
      status: "completed",
      scanType: "full",
      scanFromValue: "eu_ie",
      createdAt: "2026-08-24T00:00:00.000Z",
      startedAt: "2026-08-24T00:00:01.000Z",
      completedAt: "2026-08-24T00:00:20.000Z",
      durationMs: 19_000,
      pagesRequested: 1,
      pagesScanned: 1,
    },
    canonicalReportProjection: {
      artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [],
      derivedContext: {},
      globalUnifiedFindings: [],
      legacyScoreAssessmentInput: { scanId },
      normalizedConcerns: [],
      ownerUnifiedFindings: [],
      topFindingIds: [],
    },
    runtimeArtifacts: {
      rawDisplayOnlyFinding: "must-not-be-exported",
    },
    trackerVendors: [],
  } as unknown as ScanDetailResponse;
}

test("builds downloads from the persisted canonical projection only", () => {
  const report = buildCanonicalReportExport(scanRecord());

  assert.ok(report);
  assert.equal(report.artifactVersion, "canonical-report-export-v5");
  assert.equal(report.scan.domainHostname, "example.test");
  assert.equal(report.executiveSummary.sentences.length, 3);
  assert.match(report.executiveSummary.sentences[2] ?? "", /not a determination of legal compliance/i);
  assert.deepEqual(report.projection.unifiedFindings, []);
  assert.equal(report.appendix.cookieAndTrackerInventory.summary.totalRows, 0);
  assert.equal(report.appendix.dataCollectionSurfaces.summary.totalForms, 0);
  assert.equal(report.appendix.dataCollectionSurfaces.assessmentStatus, "unavailable");
  assert.equal(report.appendix.gdprTransparency.summary.totalRows, 0);
  assert.doesNotMatch(JSON.stringify(report), /rawDisplayOnlyFinding|must-not-be-exported/);
  assert.ok(report.limitations.some((limitation) => limitation.code === "post_choice_effectiveness_not_tested"));
});

test("fails closed when a canonical persisted projection is unavailable", () => {
  const record = scanRecord() as unknown as Record<string, unknown>;
  delete record.canonicalReportProjection;

  assert.equal(buildCanonicalReportExport(record as unknown as ScanDetailResponse), null);
});

test("projects GDPR Transparency and retained collection assessments into separate appendices", () => {
  const scan = scanRecord() as unknown as Record<string, any>;
  scan.canonicalReportProjection.checklistPresentation = {
    artifactVersion: "gdpr-eprivacy-checklist-presentation-v1",
    checklistScore: { score: 80, summary: "Targeted coverage." },
    reviewSummary: { coverageText: "Coverage retained.", priorityReviewText: "Review retained rows." },
    summaryCounts: { gap_observed: 0, neutral_signal: 1, positive_signal: 2, potential_concern: 0, review_signal: 0, technical_limitation: 0 },
    rows: [
      {
        id: "consent_surface_observed",
        label: "Consent mechanism",
        evidenceLabel: "Observed",
        rationale: "Consent surface retained.",
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
        rationale: "Controller contact retained.",
        assessmentDirection: "positive_signal",
        assessmentStatus: "checked",
        evidenceState: "observed",
        policyReviewCandidate: true,
        scannerCoverageGap: false,
        status: "Observed",
        tone: "neutral",
      },
      {
        id: "public_collection_surfaces",
        label: "Public data collection surfaces",
        evidenceLabel: "Observed",
        rationale: "A form was retained.",
        assessmentDirection: "neutral_signal",
        assessmentStatus: "checked",
        evidenceState: "observed",
        policyReviewCandidate: false,
        scannerCoverageGap: false,
        status: "Observed",
        tone: "neutral",
      },
    ],
  };
  scan.canonicalReportProjection.collectionSurfaceAssessment = {
    assessmentStatus: "observed",
    contractVersion: "certscore.collection-surface-assessment.v1",
    sourceInventoryContractVersion: "certscore.collection-surface-inventory.v1",
    sourceLane: "runtime_evidence",
    sourceHash: "a".repeat(64),
    assessedAt: "2026-08-24T00:00:20.000Z",
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
    limitationKeys: [],
    evidenceRefs: ["inventory-ref"],
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
        label: "Email address",
        required: true,
        disabled: false,
        readOnly: false,
        evidenceRefs: [],
        confidence: 0.95,
        directVsInferred: "direct",
      }],
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    productionProjectable: true,
  };

  const report = buildCanonicalReportExport(scan as unknown as ScanDetailResponse);

  assert.ok(report);
  assert.deepEqual(
    report.appendix.gdprTransparency.rows.map((row) => row.id),
    ["controller_contact_disclosure"],
  );
  assert.equal(report.gdprEprivacyReview?.rows.some((row) => row.id === "public_collection_surfaces"), false);
  assert.equal(report.appendix.dataCollectionSurfaces.summary.totalForms, 1);
  assert.equal(report.appendix.dataCollectionSurfaces.summary.totalFields, 1);
  assert.equal(report.appendix.dataCollectionSurfaces.forms[0]?.title, "Contact form");
  assert.equal(report.appendix.dataCollectionSurfaces.forms[0]?.fields[0]?.label, "Email address");
  assert.doesNotMatch(JSON.stringify(report.appendix.gdprTransparency), /Email address|Contact form|collection-surface/i);
});
