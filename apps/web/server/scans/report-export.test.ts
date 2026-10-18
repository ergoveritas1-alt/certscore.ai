import { selectSiteIntegrityFinding } from "../../lib/scans/site-integrity-report";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import assert from "node:assert/strict";
import test from "node:test";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { buildCanonicalReportExport } from "./report-export";
import { renderCanonicalReportPdf } from "./report-export-pdf";
import { aggregateFullSite } from "@website-signal-risk-scanner/shared";
import { completedActionProjection } from "../../lib/scans/test-fixtures/action-execution-projection";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { buildTrackingWorkpaper, renderTrackingWorkpaperCsv } from "./tracking-workpaper";
import { reviewCcpaScoring } from "../../scripts/lib/ccpa-scoring-review";
import { buildApiV2ScanResource, buildApiV2ScanStatus } from "../../lib/api-v2/scan-resource";
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";

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
    events: [],
  } as unknown as ScanDetailResponse;
}

test("review focus changes presentation without changing evidence, findings or scoring inputs", () => {
  const record = scanRecord();
  const before = structuredClone(record);
  const eu = buildCanonicalReportExport(record, undefined, "gdpr_eprivacy")!;
  const ca = buildCanonicalReportExport(record, undefined, "ccpa_cpra")!;
  assert.deepEqual(ca.projection, eu.projection);
  assert.deepEqual(ca.gdprEprivacyReview, eu.gdprEprivacyReview);
  assert.deepEqual(ca.appendix, eu.appendix);
  assert.deepEqual(ca.gpcResponse, eu.gpcResponse);
  assert.deepEqual(record, before);
  assert.equal(ca.reviewFocusLabel, "CCPA/CPRA");
  assert.match(ca.reviewScope, /California visitor behavior was not tested/);
  assert.match(renderCanonicalReportPdf(ca).toString("latin1"), /CCPA\/CPRA evidence report/);
  assert.equal(ca.postAcceptObservation, undefined);
  assert.equal(ca.postRefusalObservation, undefined);
  const review = reviewCcpaScoring(JSON.parse(JSON.stringify(ca)));
  assert.equal(review.source.scanId, record.scan.id);
  assert.equal(review.source.scanFrom, "eu_ie");
  assert.equal(review.score, null);
});
test("California export carries its own versioned starting-page score", () => {
  const record = scanRecord();
  const scanId = record.scan.id;
  const documentUrl = "https://example.test/";
  const parent = deriveConsentControlAssessment({scan:{scanId,finalUrl:documentUrl}});
  parent.californiaPrivacyReview = {
    contractVersion:"certscore.california-privacy-review.v1",policyVersion:"california-privacy-review.v1",
    scanId,documentUrl,capturedAt:"2026-10-16T12:00:02.000Z",sourceHash:"a".repeat(64),verificationStatus:"verified",
    scoreEffect:"none",applicability:"not_determined",choiceSurface:"observed",
    inspection:{contractVersion:"certscore.privacy-choice-inspection.v1",documentUrl,capturedAt:"2026-10-16T12:00:01.000Z",
      sourceHash:"b".repeat(64),scope:"rendered_named_links_and_buttons",coverage:"complete",namedChoiceCandidateCount:1,
      unnamedControlCount:0,candidateEnumerationTruncated:false,uninspectedFrameCount:0,uninspectedShadowRootCount:0,
      supportedDocumentLanguage:true,representativeDocument:true,documentStable:true},
    controls:[{label:"Your Privacy Choices",kind:"your_privacy_choices",evidenceRef:"policy-surface:choice",
      destinationUrl:"https://example.test/choices",destinationStatus:"retrieved"}],controlsTruncated:false,
    optOutEffectiveness:"not_assessed",noticeAdequacy:"not_assessed",noticeTopics:[],noticeEvidenceRefs:[],
  };
  record.runtimeArtifacts = {...record.runtimeArtifacts,consentControlAssessment:parent};
  record.accessPostureSummary = {} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot = { report_projection_status: "ready", certscore_overall: 82,
    score_version: "overall-posture.v11" } as ScanDetailResponse["snapshot"];
  const ca = buildCanonicalReportExport(record,undefined,"ccpa_cpra")!;
  assert.equal(ca.californiaScore.score,100);
  assert.equal(ca.californiaScore.coverage,"bounded");
  const resource = buildApiV2ScanResource(record);
  const status = buildApiV2ScanStatus(record, { canonicalScan: resource });
  assert.equal(resource.postureScores?.ccpaCpra.score,100);
  assert.equal(resource.postureScores?.ccpaCpra.coverage,"bounded");
  assert.equal(resource.postureScores?.gdprEprivacy.score,resource.score);
  assert.deepEqual(status.postureScores,resource.postureScores);
  assert.match(renderCanonicalReportPdf(ca).toString("latin1"),/California starting-page score: 100\/100/);
});

test("new California coverage and score agree across persisted report, API, JSON and PDF",()=>{
  const record=scanRecord();const f=californiaCoverageFixture();f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:parent};
  record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v11"} as ScanDetailResponse["snapshot"];
  const exported=buildCanonicalReportExport(record,undefined,"ccpa_cpra")!;
  const api=buildApiV2ScanResource(record);
  assert.equal(exported.californiaScore.score,100);assert.equal(api.postureScores?.ccpaCpra.score,100);
  assert.equal(api.postureScores?.ccpaCpra.coverageSummary?.evidenceFamilies,6);
  assert.equal(api.postureScores?.ccpaCpra.policyVersion,exported.californiaScore.policyVersion);
  assert.equal(exported.californiaScore.reviewCoverage?.families.length,6);
  const pdf=renderCanonicalReportPdf(exported).toString("latin1");
  assert.match(pdf,/California coverage/);assert.doesNotMatch(pdf,/california-regulatory-posture.v2|bounded risk signal|not a compliance grade/);
  assert.doesNotMatch(pdf,/review focuses on GPC/);
});

test("v3 numerical score and review coverage agree in API and exports",()=>{
  const record=scanRecord();const f=californiaCoverageFixture("Canadian Privacy Policy. To exercise your privacy rights, contact privacy@example.test. We use personal information to provide requested services.");
  f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v3";
  f.bundle.collectionSurfaceInventory!.scenario="fresh_pre_consent";
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:parent};
  record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v11"} as ScanDetailResponse["snapshot"];
  const exported=buildCanonicalReportExport(record,undefined,"ccpa_cpra")!;
  const api=buildApiV2ScanResource(record);
  assert.equal(exported.californiaScore.score,100);assert.equal(exported.californiaScore.coverage,"limited");
  assert.equal(api.postureScores?.ccpaCpra.score,100);
  assert.equal(api.postureScores?.ccpaCpra.coverageSummary?.scoreReady,true);
  assert.ok(api.postureScores?.ccpaCpra.coverageSummary?.families.some(row=>row.id === "california_rights" && row.status === "review"));
  assert.doesNotMatch(renderCanonicalReportPdf(exported).toString("latin1"),/california-regulatory-posture.v3|bounded risk signal|not a compliance grade/);
  assert.equal(exported.gpcResponse,null);
});

test("exports omit speculative action lanes but preserve independently verified clicks", () => {
  const record = scanRecord();
  record.runtimeArtifacts = {
    consentControlAssessment: observedControlAssessment,
    postAcceptEvidenceProjection: completedActionProjection("accept"),
    postRefusalEvidenceProjection: completedActionProjection("reject"),
  };
  const report = buildCanonicalReportExport(record)!;
  assert.ok(report.postAcceptObservation);
  assert.ok(report.postRefusalObservation);
  assert.doesNotMatch(JSON.stringify(report.limitations), /did not click|no consent action|post_choice_effectiveness_not_tested/);
});

test("tracking workpaper preserves coverage even when empty and never infers sale, sharing or honoring", () => {
  const report = buildCanonicalReportExport(scanRecord())!;
  const empty = renderTrackingWorkpaperCsv(report);
  assert.match(empty, /"manifest"/);
  assert.match(empty, /"scan_gpc_response"/);
  // Empty manifest columns still align with the header (no embedded commas).
  assert.equal(empty.split("\r\n")[0]?.split('","').length, 30);
  assert.equal(empty.split("\r\n")[1]?.split('","').length, 30);
  assert.equal(empty.trim().split("\r\n").length, 2);
  const inventory = report.appendix.cookieAndTrackerInventory;
  inventory.rows = [{ rowNumber: 1, vendor: '=HYPERLINK("https://attacker.test")', products: ["Product, with comma"],
    type: "cookie", resourceNames: ["_ga"], purpose: "Analytics", relationship: { party: "first_party" },
    domains: ["example.test"], firstSeenMs: 15, preConsent: true, evidenceClassification: "observed", confidence: 0.99,
    evidenceRefs: ["cookie:fixture"],
  }] as unknown as typeof inventory.rows;
  inventory.summary = { ...inventory.summary, totalRows: 501, includedRows: 1, omittedRows: 500 };
  const workpaper = buildTrackingWorkpaper(report);
  assert.equal(workpaper.rows[0]?.saleAssessment, "not_assessed");
  assert.equal(workpaper.rows[0]?.shareAssessment, "not_assessed");
  assert.equal(workpaper.rows[0]?.vendorGpcHonoring, "not_assessed");
  assert.equal(workpaper.completeness.omittedRows, 500);
  const csv = renderTrackingWorkpaperCsv(report);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://attacker.test"")"'));
  assert.ok(csv.includes('"Product, with comma"'));
  assert.ok(csv.includes('"501","1","500"'));
  assert.ok(csv.includes('"cookie:fixture"'));
  assert.equal(csv.trim().split("\r\n").length, 3);
});

test("full-site JSON and PDF retain scope while homepage projection and score inputs stay unchanged",()=>{
  const record=scanRecord(), baseline=buildCanonicalReportExport(record)!;
  const aggregate=aggregateFullSite({scanId:record.scan.id,status:"completed",requested:{maxPages:200,concurrency:1,waitSeconds:5},effective:{concurrency:1,waitSeconds:5},region:"eu-west-1",configurationHash:"a".repeat(64),startedAt:"2026-09-06T00:00:00.000Z",completedAt:"2026-09-06T00:01:00.000Z",homepageDurationMs:20000,stopReason:"max_pages",robotsRestriction:"robots.txt restricts crawl coverage.",discoveryExhausted:false,discovered:0,peakWorkers:1,pauseMs:null},[]);
  const fullSite={score:{version:"full-site-distinct-findings.v1",value:51,assessedNonEssentialStorage: null, scoredPages:3,limitedPages:0,priorityReview:[],sources:[],scope:"Eligible retained evidence across scanned pages."},scope:"Full homepage audit plus additional-page resource inventories",scoreScope:"Full-site score",condition:"Fresh visit, no consent action.",countingScope:"Across observed pages; independent visits.",summary:{...aggregate,resources:undefined},timing:{crawlStartedAt:"2026-09-06T00:00:20.000Z"},pages:[],resources:[{ occurrence: { kind: "request", label: "https://example.test/additional-page-resource", vendor: "Example" }, purposes: ["analytics"], pageIds: ["page-2"] }] as unknown as import("./full-site-report").FullSiteReportExport["resources"],inventoryHref:`/api/scans/${record.scan.id}/full-site`,pageEvidenceHrefTemplate:"?detailPage={pageId}"};
  const integrityPackets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: siteIntegrityProjectionFixture }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const finding = selectSiteIntegrityFinding(integrityPackets)!;
  const siteIntegrity = { findings: [finding], coverage: [{ pageId: "home", url: finding.evidence.observation.documentUrl, homepage: true, status: "captured" as const }, { pageId: "missing", url: "https://clinic.example/unavailable", homepage: false, status: "unavailable" as const }] };
  const report=buildCanonicalReportExport(record,{ ...fullSite, score: { ...fullSite.score, siteIntegrity } })!;
  assert.deepEqual(report.appendix.siteIntegritySite, siteIntegrity);
  assert.deepEqual(report.projection,baseline.projection);
  assert.deepEqual(report.gdprEprivacyReview,baseline.gdprEprivacyReview);
  assert.equal(baseline.fullSite,undefined);assert.equal(report.fullSite?.summary.state.requested.maxPages,200);
  const pdf=renderCanonicalReportPdf(report);
  assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
  assert.match(pdf.toString("latin1"),/Website scan report/);
  assert.match(pdf.toString("latin1"), /Site integrity coverage/);
  assert.match(pdf.toString("latin1"), /1 of 2 scanned pages/);
  assert.match(pdf.toString("latin1"), /clinic.example\/unavailable/);
  assert.match(pdf.toString("latin1"),/additional-page-resource/);
  assert.equal(report.fullSite?.resources.length, 1);
  assert.match(pdf.toString("latin1"),/Full-site score .*GDPR\/ePrivacy-weighted.*51/);
  assert.equal(report.fullSite?.score?.value,51);
  assert.match(pdf.toString("latin1"),/robots.txt restricts crawl coverage/);
});

test("builds downloads from the persisted canonical projection only", () => {
  const report = buildCanonicalReportExport(scanRecord());

  assert.ok(report);
  assert.equal(report.artifactVersion, "canonical-report-export-v6");
  assert.equal(report.scan.domainHostname, "example.test");
  assert.equal(report.executiveSummary.sentences.length, 3);
  assert.match(report.executiveSummary.sentences[2] ?? "", /not a determination of legal compliance/i);
  assert.deepEqual(report.projection.unifiedFindings, []);
  assert.equal(report.appendix.cookieAndTrackerInventory.summary.totalRows, 0);
  assert.equal(report.appendix.dataCollectionSurfaces.summary.totalForms, 0);
  assert.equal(report.appendix.dataCollectionSurfaces.assessmentStatus, "unavailable");
  assert.equal(report.appendix.gdprTransparency.summary.totalRows, 0);
  assert.doesNotMatch(JSON.stringify(report), /rawDisplayOnlyFinding|must-not-be-exported/);
  assert.ok(report.limitations.some((limitation) => limitation.code === "privacy_opt_out_execution_not_tested"));
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

 test("integrity survives checked persistence and remains in JSON/PDF evidence without a one-off summary", () => {
  const scan = scanRecord();
  const baseline = buildCanonicalReportExport(scan)!;
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { siteIntegrity: { ...siteIntegrityProjectionFixture, scanId: scan.scan.id } },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const canonical = (scan as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
  canonical.ownerUnifiedFindings = packets;
  canonical.globalUnifiedFindings = packets;
  const persisted = buildPersistedScanReportProjection(scan);
  const snapshot = {
    report_projection_computed_at: "2026-09-17T07:25:00.000Z", report_projection_payload: JSON.parse(persisted.serialized),
    report_projection_payload_sha256: persisted.sha256, report_projection_payload_size_bytes: persisted.sizeBytes,
    report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
  };
  const restored = readPersistedScanReportProjection({ scan: scan.scan, snapshot });
  assert.ok(restored);
  const report = buildCanonicalReportExport(restored)!;
  assert.equal(report.appendix.siteIntegrity?.findingId, SITE_INTEGRITY_FINDING_ID);
  assert.equal(report.appendix.siteIntegrity?.evidence.sourceHash, siteIntegrityProjectionFixture.sourceHash);
  assert.deepEqual(report.appendix.siteIntegrity?.evidence.observation, siteIntegrityProjectionFixture.observation);
  assert.deepEqual(report.executiveSummary.counts, baseline.executiveSummary.counts);
  assert.equal(report.executiveSummary.posture, baseline.executiveSummary.posture);
  assert.deepEqual(report.gdprEprivacyReview, baseline.gdprEprivacyReview);
  assert.equal(report.executiveSummary.sentences.length, 3);
  assert.doesNotMatch(report.executiveSummary.sentences.join(" "), /separate site-integrity observation/);
  const pdf = renderCanonicalReportPdf(report).toString("latin1");
  assert.match(pdf, /Site integrity - High priority/);
  assert.doesNotMatch(pdf, /score deduction|policy deduction|27-point/);
  assert.equal(report.appendix.siteIntegrity?.scoreEffects?.[0]?.deductionPoints, 27);
  assert.match(pdf, /pharmacy.example/);
  assert.equal(readPersistedScanReportProjection({ scan: scan.scan, snapshot: { ...snapshot, report_projection_payload_sha256: "0".repeat(64) } }), null);
});

test("verified bounded GPC measurements survive both customer review focuses without scoring", async () => {
  const { gpcRuntimeFixture } = await import("../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime");
  const { gpcActivityComparisonFixture } = await import("../../../../packages/certscore-contracts/src/test-fixtures/gpc-activity-comparison");
  const { buildGpcResponseAssessment } = await import("../../../../packages/certscore-scan-core/src/gpc-response-assessment");
  const scan = scanRecord();
  const pointer = { uri: "s3://fixture/source.json", sha256: "a".repeat(64), sizeBytes: 100 };
  const assessment = buildGpcResponseAssessment({ baseline: gpcRuntimeFixture({ enabled: false }), gpc: gpcRuntimeFixture({ enabled: true }),
    baselineArtifact: pointer, gpcArtifact: { ...pointer, sha256: "b".repeat(64) } });
  const activityComparison = gpcActivityComparisonFixture({ scanId: scan.scan.id });
  const project = (includeActivity: boolean) => buildUnifiedFindingDisplayPackets({
    runtimeArtifacts: { gpcResponseAssessment: assessment, ...(includeActivity ? { gpcActivityComparison: activityComparison } : {}) },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(),
  });
  const packets = project(true);
  assert.deepEqual(packets.map(finding => finding.scoreEffects), project(false).map(finding => finding.scoreEffects));
  const canonical = (scan as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
  canonical.ownerUnifiedFindings = packets;
  canonical.globalUnifiedFindings = packets;
  const persisted = buildPersistedScanReportProjection(scan);
  const restored = readPersistedScanReportProjection({ scan: scan.scan, snapshot: {
    report_projection_computed_at: "2026-09-25T00:00:00.000Z", report_projection_payload: JSON.parse(persisted.serialized),
    report_projection_payload_sha256: persisted.sha256, report_projection_payload_size_bytes: persisted.sizeBytes,
    report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
  } });
  assert.ok(restored);
  const eu = buildCanonicalReportExport(restored, undefined, "gdpr_eprivacy")!;
  const ca = buildCanonicalReportExport(restored, undefined, "ccpa_cpra")!;
  assert.ok(eu.gpcResponse);
  assert.ok(ca.gpcResponse);
  assert.equal(ca.gpcResponse.californiaPolicy.deductionPoints,0);
  const { renderPulseMarkdown } = await import("../../lib/pulse/markdown");
  const markdown = renderPulseMarkdown({ domain: "example.test", scanId: scan.scan.id, scanStatus: "completed", gpcResponse: ca.gpcResponse, topFindings: [], links: {}, summary: {} });
  assert.match(markdown, /Baseline -> GPC/);
  const pdf = renderCanonicalReportPdf(ca).toString("latin1");
  assert.match(pdf, /Baseline -> GPC/);
  assert.match(pdf, /No qualifying tracking activity observed/);
  assert.match(pdf, /California starting-page score: Unavailable/);
  const foreign = { ...restored, scan: { ...restored.scan, id: "foreign-scan" } };
  assert.equal(buildCanonicalReportExport(foreign), null, "a report cannot be rebound to a different scan");
});

test("v4 negative disclosure inspection and deduction agree in canonical report, API, JSON and PDF",()=>{
  const record=scanRecord();const f=californiaCoverageFixture("Privacy Policy. Access your personal information, correct inaccuracies and request erasure. Contact privacy@example.test to exercise rights.");
  f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v4";
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:parent};
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:record.runtimeArtifacts});
  const canonical=(record as unknown as {canonicalReportProjection:{ownerUnifiedFindings:typeof packets;globalUnifiedFindings:typeof packets}}).canonicalReportProjection;
  canonical.ownerUnifiedFindings=packets;
  canonical.globalUnifiedFindings=packets;
  record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v11"} as ScanDetailResponse["snapshot"];
  const exported=buildCanonicalReportExport(record,undefined,"ccpa_cpra")!;
  const api=buildApiV2ScanResource(record);
  assert.equal(exported.californiaScore.score,88);assert.equal(exported.californiaScore.deductions.length,1);
  assert.equal(api.postureScores?.ccpaCpra.score,88);assert.equal(api.postureScores?.gdprEprivacy.score,73);
  assert.equal(exported.californiaScore.policyVersion,"california-regulatory-posture.v4");
  assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.score,88);
  assert.doesNotMatch(renderCanonicalReportPdf(exported).toString("latin1"),/california-regulatory-posture.v4|bounded risk signal|not a compliance grade/);
  assert.equal(exported.gpcResponse,null);
});

for(const version of ["v5","v6","v7","v8","v9","v10"] as const) test(`${version} clause and collection assessments retain evidence consistently across score, API and exports`,()=>{
  const record=scanRecord();const f=californiaCoverageFixture("Privacy Policy. We give the individual access to personal information upon request. A customer may request correction of inaccurate personal information. We retain records until they are no longer necessary. Such information is destroyed or erased.");
  f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy=`california-privacy-review.${version}`;
  f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:parent};
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:record.runtimeArtifacts});
  const canonical=(record as unknown as {canonicalReportProjection:{ownerUnifiedFindings:typeof packets;globalUnifiedFindings:typeof packets}}).canonicalReportProjection;
  canonical.ownerUnifiedFindings=packets;canonical.globalUnifiedFindings=packets;
  record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v11"} as ScanDetailResponse["snapshot"];
  const exported=buildCanonicalReportExport(record,undefined,"ccpa_cpra")!;
  assert.equal(exported.californiaScore.score,88);assert.equal(exported.californiaScore.deductions.length,1);
  assert.equal(exported.californiaScore.policyVersion,`california-regulatory-posture.${version === "v10"?"v11-wcag":(version === "v8" || version === "v9")?"v7":version}`);
  assert.equal(exported.californiaScore.rightsAssessment?.topics.find(row=>row.topic === "right_to_delete")!.status,"not_observed");
  assert.equal(exported.californiaScore.collectionNoticeAssessment?.inventoryComplete,true);
  const api=buildApiV2ScanResource(record);assert.equal(api.postureScores?.ccpaCpra.score,88);assert.equal(api.postureScores?.gdprEprivacy.score,73);
  assert.equal(api.postureScores?.ccpaCpra.policyVersion,`california-regulatory-posture.${version === "v10"?"v11-wcag":(version === "v8" || version === "v9")?"v7":version}`);
  assert.match(renderCanonicalReportPdf(exported).toString("latin1"),/Rights clause/);
  assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.rightsAssessment.topics.length,4);
  assert.equal(exported.gpcResponse,null);
  if(version === "v6" || version === "v7" || version === "v8" || version === "v9" || version === "v10"){assert.ok(exported.californiaScore.saleSharingAssessment);assert.match(renderCanonicalReportPdf(exported).toString("latin1"),/Sale\/sharing clause/);}
});
