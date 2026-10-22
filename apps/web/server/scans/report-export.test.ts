import { reportCmpEvidenceFixture } from "./report-appendix-evidence.fixture";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import { selectSiteIntegrityFinding } from "../../lib/scans/site-integrity-report";
import { SITE_INTEGRITY_FINDING_ID } from "@certscore/contracts";
import { siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { buildUnifiedFindingDisplayPackets } from "../../lib/scans/unified-findings";
import { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
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
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,CA_FIXTURE_POLICY} from "./california-review-coverage.fixture";
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
  assert.deepEqual(report.score, { value: 51, scope: "full_site" });
  assert.match(pdf.toString("latin1"), /35 Tf[^\n]*\(51\)/);
  assert.match(pdf.toString("latin1"),/robots.txt restricts crawl coverage/);
});

test("builds downloads from the persisted canonical projection only", () => {
  const report = buildCanonicalReportExport(scanRecord());

  assert.ok(report);
  assert.equal(report.artifactVersion, "canonical-report-export-v8");
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

test("incidental challenge classification carries LinkedIn collection through canonical scoring and exports", async () => {
  const { gpcIncidentalChallengeFixture } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/gpc-incidental-challenge.cases");
  const { gpcRuntimeFixture } = await import("../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime");
  const { buildLocalV2DagLambdaLaneRun } = await import("../../../v2-dag-lambda/src/handler");
  const { buildGpcProductionAssessment } = await import("../../../../packages/certscore-scan-core/src/gpc-production-observation");
  const { buildGpcResponseAssessment } = await import("../../../../packages/certscore-scan-core/src/gpc-response-assessment");
  const { buildNormalizedConcerns } = await import("../../lib/scans/normalized-concerns");
  for (const mode of ["incidental", "two_recipients", "restricted", "blocked", "library_only", "missing_delivery", "bad_checksum"] as const) {
    const record = scanRecord();
    const bundle = gpcIncidentalChallengeFixture(record.scan.id, mode === "two_recipients" ? ["https://www.facebook.com/tr/?id=fixture&ev=PageView&fbp=visitor-fixture"] : []);
    if (mode === "restricted") {
      for (const event of bundle.networkEvents) if (event.requestUrl.startsWith("https://px.ads.linkedin.com/collect/")) {
        event.requestUrl = event.url = `${event.requestUrl}&us_privacy=1NYN`;
        bundle.gpcObservationSession!.requests.find(row => row.eventId === event.eventId)!.urlSha256 = createHash("sha256").update(event.requestUrl).digest("hex");
      }
      bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
    }
    if (mode === "blocked") bundle.scanNoGoAssessment!.decision = "no_go";
    if (mode === "library_only") for (const event of bundle.networkEvents) event.collectionEndpointObserved = false;
    if (mode === "missing_delivery") {
      bundle.gpcObservationSession!.semanticObservation!.navigatorGpc = false;
      bundle.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(bundle.gpcObservationSession)).digest("hex");
    }
    bundle.scanLaneRuns = [buildLocalV2DagLambdaLaneRun({ bundle, workerLane: "gpc_observation", region: "local" })!];
    const bytes = Buffer.from(JSON.stringify(bundle));
    const pointer = { uri: "s3://fixture/gpc.json", sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
    const comparison = buildGpcResponseAssessment({ baseline: gpcRuntimeFixture({ enabled: false }), gpc: bundle,
      baselineArtifact: { ...pointer, uri: "s3://fixture/baseline.json" }, gpcArtifact: pointer });
    const assessment = buildGpcProductionAssessment({ scanId: bundle.scanId, comparison,
      source: { bytes: mode === "bad_checksum" ? Buffer.alloc(bytes.length) : bytes, pointer } });
    const f = californiaCoverageFixture();
    f.bundle.scanId = record.scan.id;
    f.policyEvidence.projection.scanId = record.scan.id;
    f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
    f.bundle.policySurfaceObservations.forEach(surface => { surface.documentLanguage = "en"; });
    const child = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
    assert.ok(child);
    const parent = deriveConsentControlAssessment({ scan: { scanId: record.scan.id, finalUrl: CA_FIXTURE_URL } });
    parent.californiaPrivacyReview = child;
    record.runtimeArtifacts = { consentControlAssessment: parent, gpcResponseAssessment: assessment };
    record.accessPostureSummary = {} as ScanDetailResponse["accessPostureSummary"];
    const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: record.runtimeArtifacts,
      reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
    const canonical = (record as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
    canonical.normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts: record.runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
    canonical.ownerUnifiedFindings = canonical.globalUnifiedFindings = packets;
    record.snapshot = { report_projection_status: "ready", certscore_overall: 73, score_version: "overall-posture.v11" } as ScanDetailResponse["snapshot"];
    const persisted = buildPersistedScanReportProjection(record);
    const restored = readPersistedScanReportProjection({ scan: record.scan, snapshot: {
      report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
      report_projection_payload: JSON.parse(persisted.serialized), report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes, report_projection_computed_at: f.bundle.completedAt,
    } })!;
    assert.ok(restored);
    const exported = buildCanonicalReportExport(restored, undefined, "ccpa_cpra")!;
    const eligible = mode === "incidental" || mode === "two_recipients";
    const points = mode === "two_recipients" ? 25 : eligible ? 15 : 0;
    assert.equal(exported.californiaScore.score, 100 - points, mode);
    assert.equal(exported.gpcResponse!.californiaPolicy.deductionPoints, points, mode);
    assert.equal(exported.californiaScore.deductions.filter(row => row.findingId === "gpc_response").length, eligible ? 1 : 0);
    const finding = packets.find(row => row.unifiedFindingId === "gpc_response")!;
    assert.equal(finding.scoreEffects?.some(effect => effect.appliesTo === "california_posture" && effect.deductionPoints === points) ?? false, eligible);
    assert.equal(finding.scoreEffects?.some(effect => effect.appliesTo === "certscore_overall") ?? false, false);
    const api = buildApiV2ScanResource(restored);
    assert.equal(api.postureScores?.ccpaCpra.score, exported.californiaScore.score);
    assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.score, exported.californiaScore.score);
    assert.doesNotMatch(renderCanonicalReportPdf(exported).toString("latin1"), /deduct|scoring withheld|score impact|15.point|point penalty/i);
  }
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

test("usable reports retain both posture scores across persistence, API and export with unknown California checks",()=>{
  const record=scanRecord();const f=californiaCoverageFixture();
  f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
  f.bundle.policySurfaceInspection={californiaReviewPolicy:"california-privacy-review.v10"} as typeof f.bundle.policySurfaceInspection;
  f.bundle.policySurfaceObservations=[];f.policyEvidence.projection.documents=[];f.policyEvidence.texts=[];
  f.bundle.scanLaneRuns=[{laneId:"runtime_evidence",executionOutcome:"success",accessOutcome:"representative_page",challengeDetected:false}] as typeof f.bundle.scanLaneRuns;
  f.bundle.runtimeMetadataSnapshots=[{artifactId:"runtime-dom",path:"/retained/runtime-dom.txt",url:CA_FIXTURE_URL,capturedAtMs:500,
    documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"},textExcerpt:"Usable starting page",pagePhase:"network_idle",consentStateAtTime:"pre_consent"}];
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10" && child.observedScoreBasis);
  const parent=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)))};
  record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
  record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v13"} as ScanDetailResponse["snapshot"];
  const restored=JSON.parse(JSON.stringify(record)) as ScanDetailResponse;
  const exported=buildCanonicalReportExport(restored,undefined,"ccpa_cpra")!;
  const api=buildApiV2ScanResource(restored);
  assert.equal(exported.californiaScore.score,100);
  assert.equal(exported.californiaScore.policyVersion,"california-regulatory-posture.v12-observed");
  assert.equal(exported.californiaScore.coverage,"limited");
  assert.equal(exported.californiaScore.reviewCoverage?.scoreReady,false);
  assert.deepEqual(exported.californiaScore.deductions,[]);
  assert.equal(api.postureScores?.ccpaCpra.score,100);
  assert.equal(api.postureScores?.gdprEprivacy.score,73);
  assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.score,100);
});

test("source-bound short policy and separate provider evidence preserve canonical California findings and exports",async()=>{
  const {publisherPolicyHtml,publisherPolicyText,vendorPolicyText}=await import("../../../../packages/certscore-scan-core/src/test-fixtures/policy-source-association");
  const {resolvePolicyVisibleText,extractPolicySections,classifyPolicyDocumentOwnership}=await import("../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner");
  const {buildNormalizedConcerns,buildUnifiedFindingCandidatesFromConcerns}=await import("../../lib/scans/normalized-concerns");
  const {deriveConcernPolicy}=await import("../../lib/scans/concern-policy");
  const {consentControlAssessmentSchema}=await import("@certscore/contracts");
  const targetUrl=CA_FIXTURE_URL,providerUrl="https://metricpond.example/privacy";
  const html=publisherPolicyHtml(providerUrl);
  const resolved=await resolvePolicyVisibleText({html,baseUrl:`${targetUrl}privacy`,surfaceType:"privacy_policy",timeoutMs:100,
    onResolvedPolicyDocument:()=>{assert.fail("A provider source must not replace usable target text");}});
  assert.match(resolved,/Sketchgarden is an open source drawing project/);
  assert.doesNotMatch(resolved,/Metricpond is the data controller/);
  const sections=extractPolicySections({html,sourceUrl:`${targetUrl}privacy`,visibleText:resolved});
  assert.ok(sections.some(section=>section.sourceOffsetBasis==="sanitized_html"),"Legitimate HTML and retained-text representations may have different hashes");
  for(const mode of ["target_positive","target_negative","provider_only","partial_target"] as const) {
    const text=mode==="provider_only"?vendorPolicyText:mode==="target_negative"?
      publisherPolicyText.replace("We will not discriminate against you for exercising your privacy rights. ",""):resolved;
    const f=californiaCoverageFixture(text),record=scanRecord();
    f.bundle.scanId=record.scan.id;f.policyEvidence.projection.scanId=record.scan.id;
    f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
    const ownership=classifyPolicyDocumentOwnership({targetUrl,documentUrl:mode==="provider_only"?providerUrl:`${targetUrl}privacy`,
      documentTitle:mode==="provider_only"?"Metricpond Privacy Policy":"Sketchgarden Privacy Policy",text});
    f.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";Object.assign(surface,ownership);});
    f.policyEvidence.projection.documents.forEach(document=>{document.targetRelationship=ownership.targetRelationship!;});
    if(mode==="provider_only")assert.equal(ownership.targetRelationship,"service_provider");
    if(mode==="partial_target")f.policyEvidence.projection.documents.forEach(document=>{document.documentTextCoverage.status="truncated";});
    const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
    assert.ok(child,mode);
    if(mode==="provider_only") {
      assert.ok(child.contractVersion === "certscore.california-privacy-review.v10");
      assert.equal(child.disclosureInspection,undefined,"A provider policy cannot prove target disclosure presence or absence");
      assert.deepEqual(child.reviewCoverage?.sourceDocuments,[]);
      assert.equal(child.reviewCoverage?.captureCoverage?.policyTextComplete,false);
      assert.ok(child.inspection,"Independently verified target choice inspection remains retained");
    }
    const initial=deriveConsentControlAssessment({scan:{scanId:record.scan.id,finalUrl:CA_FIXTURE_URL}});
    if(child)initial.californiaPrivacyReview=child;
    const parent=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(initial)));
    record.runtimeArtifacts={...record.runtimeArtifacts,consentControlAssessment:parent};
    const concerns=buildNormalizedConcerns({reviewFindingCandidates:[],validationFindings:[],runtimeArtifacts:record.runtimeArtifacts});
    const negative=concerns.find(row=>row.suggestedUnifiedFindingId==="california_rights_disclosure_not_observed");
    assert.equal(Boolean(negative),mode==="target_negative",mode);
    if(negative) {
      const policy=deriveConcernPolicy({concern:negative,evidenceStrengthFlags:negative.evidenceStrengthFlags,
        rawEvidence:negative.evidenceBundle.rawEvidence,consentControlAssessment:parent});
      assert.equal(policy.promotionEligibility,"eligible");
      assert.ok(policy.scoreEffects?.some(effect=>effect.appliesTo==="california_posture"&&effect.deductionPoints===12));
      assert.ok(buildUnifiedFindingCandidatesFromConcerns(concerns).some(row=>row.normalizedConcern===negative));
    }
    const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:record.runtimeArtifacts});
    assert.equal(packets.some(row=>row.unifiedFindingId==="california_rights_disclosure_not_observed"),mode==="target_negative",mode);
    const canonical=(record as unknown as {canonicalReportProjection:{ownerUnifiedFindings:typeof packets;globalUnifiedFindings:typeof packets}}).canonicalReportProjection;
    canonical.ownerUnifiedFindings=packets;canonical.globalUnifiedFindings=packets;
    record.accessPostureSummary={} as ScanDetailResponse["accessPostureSummary"];
    record.snapshot={report_projection_status:"ready",certscore_overall:73,score_version:"overall-posture.v11"} as ScanDetailResponse["snapshot"];
    const persisted=buildPersistedScanReportProjection(record);
    const restored=readPersistedScanReportProjection({scan:record.scan,snapshot:{
      report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,
      report_projection_payload:JSON.parse(persisted.serialized),report_projection_payload_sha256:persisted.sha256,
      report_projection_payload_size_bytes:persisted.sizeBytes,report_projection_computed_at:"2026-10-19T00:00:00.000Z",
    }});
    assert.ok(restored);
    assert.deepEqual(restored.runtimeArtifacts?.consentControlAssessment,parent,"Persistence preserves typed source provenance and conclusions");
    const exported=buildCanonicalReportExport(restored,undefined,"ccpa_cpra")!,api=buildApiV2ScanResource(restored);
    const expected=mode==="target_positive"?100:mode==="target_negative"?88:null;
    assert.equal(exported.californiaScore.score,expected,mode);
    assert.equal(api.postureScores?.ccpaCpra.score,expected,mode);
    const withoutCalifornia=buildApiV2ScanResource({...restored,runtimeArtifacts:{...restored.runtimeArtifacts,
      consentControlAssessment:{...parent,californiaPrivacyReview:undefined},
    }});
    assert.deepEqual(api.postureScores?.gdprEprivacy,withoutCalifornia.postureScores?.gdprEprivacy,"California evidence cannot alter the persisted EU score");
    assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.score,expected);
    assert.equal(exported.californiaScore.deductions.some(row=>row.policyKey==="california.rights_disclosure_not_observed"),mode==="target_negative");
    assert.ok(renderCanonicalReportPdf(exported).byteLength>0);
    if(mode==="provider_only")assert.deepEqual(exported.californiaScore.deductions,[],"Vendor-only retained text cannot establish target presence or absence");
  }
});

test("redirected denied homepage recovers only observed policy evidence through the persisted canonical report", async () => {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = { exports: {}, loaded: true } as NodeModule;
  const { startRedirectedPolicyRecoveryFixture } = await import("../../../../packages/certscore-scan-core/src/test-fixtures/redirected-policy-recovery");
  const { policySurfaceScanner } = await import("../../../../packages/certscore-scan-core/src/scanners/policy-surface-scanner");
  const { createArtifactWriter } = await import("../../../../packages/certscore-scan-core/src/artifact-writer");
  const { dedupePolicySurfaces, summarizePolicySurfaces, verifyLocalV2DagLambdaArtifactBody } = await import("./local-v2-dag-report");
  const { buildNormalizedConcerns } = await import("../../lib/scans/normalized-concerns");
  const { deriveConcernPolicy } = await import("../../lib/scans/concern-policy");
  const { consentControlAssessmentSchema } = await import("@certscore/contracts");

  for (const mode of ["recovered", "missing_right", "retrieval_failed", "clients_only", "marketing"] as const) {
    const governing = mode === "recovered" || mode === "missing_right";
    const policyText = mode === "clients_only"
      ? `Clients Privacy Policy. This policy covers customers, partners and end-users. It does not cover website visitors. ${CA_FIXTURE_POLICY.repeat(5)}`
      : mode === "marketing"
      ? "Cloud Security is a comprehensive security suite for Linux web servers. Protect your website with malware scanning, firewall protection and server monitoring. Read our Privacy Policy, contact sales and start a free trial. ".repeat(15)
      : (mode === "missing_right"
      ? CA_FIXTURE_POLICY.replace("We will not discriminate against you for exercising your privacy rights. ", "")
      : CA_FIXTURE_POLICY).repeat(5);
    const fixture = await startRedirectedPolicyRecoveryFixture({
      policyText, policyFails: mode === "retrieval_failed", duplicatePolicyLinks: true, directPolicyBlocked: true,
      ...(mode === "clients_only" ? { policyTitle: "Clients Privacy Policy", policyLinkText: "Do Not Sell or Share My Personal Information" } : {}),
      ...(mode === "marketing" ? { policyTitle: "Cloud Security for Linux Web Servers" } : {}),
    });
    const outDir = await mkdtemp(path.join(tmpdir(), "policy-recovery-canonical-"));
    try {
      const captured = await policySurfaceScanner({
        url: fixture.targetUrl, normalizedUrl: fixture.targetUrl, scanStartedAtMs: Date.now(),
        internalBudgetMs: 12_000, discoveryMode: "fast", nanoAssistProvider: {
          async classifyLinks({ candidates, assistId }) {
            return { assistId, rankedCandidates: candidates.map((candidate, priorityRank) => ({
              candidateId: candidate.candidateId, likelySurfaceType: candidate.deterministicSurfaceType,
              shouldFetch: true, priorityRank, confidence: 0.95, reason: "Deterministic fixture link ranking", uncertaintyNotes: [],
            })) };
          },
        },
        artifactWriter: await createArtifactWriter(outDir),
      });
      const policy = captured.policySurfaceObservations.find(surface => surface.normalizedUrl === fixture.policyUrl);
      assert.ok(policy, "The rendered footer route survives the denied direct homepage");
      assert.equal(policy.linkObservationState, "observed");
      assert.equal(policy.linkSourcePageUrl, `${fixture.baseUrl}/canonical/`);
      assert.equal(policy.status === "fetched", mode !== "retrieval_failed");
      if (mode === "marketing") assert.equal(policy.documentRole, "unknown", JSON.stringify({
        title: policy.title, body: policy.governingPolicyBodyAssessment, roleReasons: policy.documentRoleReasonCodes,
        signals: policy.article13DisclosureSignals, sections: policy.retainedArticle13SectionEvidence,
      }));
      assert.ok(!captured.policySurfaceObservations.some(surface =>
        surface.finalUrl === `${fixture.baseUrl}/canonical/` && surface.status === "fetched"),
      "Homepage marketing or denial content cannot become the policy body");

      for (const verified of mode === "recovered" ? [true, false] : [true]) {
        const record = scanRecord();
        const f = californiaCoverageFixture();
        const documentUrl = `${fixture.baseUrl}/canonical/`;
        f.bundle.scanId = record.scan.id;
        f.bundle.normalizedUrl = fixture.targetUrl;
        f.bundle.policySurfaceObservations = captured.policySurfaceObservations;
        f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
        f.bundle.policySurfaceInspection!.privacyChoiceInspection = captured.privacyChoiceInspection;
        if (f.bundle.collectionSurfaceInventory) f.bundle.collectionSurfaceInventory.pageUrl = documentUrl;
        const bundleBytes = Buffer.from(JSON.stringify(f.bundle));
        const source = {
          schemaVersion: "certscore.v2.canonical-evidence-bundle.v1", verificationStatus: "verified" as const,
          sha256: createHash("sha256").update(bundleBytes).digest("hex"), sizeBytes: bundleBytes.byteLength,
          uri: "s3://policy-fixture/CanonicalEvidenceBundle.json",
        };
        verifyLocalV2DagLambdaArtifactBody({ body: bundleBytes, expectedSha256: source.sha256, expectedSizeBytes: source.sizeBytes });
        const artifactsById = new Map();
        const texts: Array<{ observationId: string; text: string }> = [];
        for (const surface of captured.policySurfaceObservations) {
          const ref = surface.artifactRefs.find(ref => ref.artifactId.startsWith("policy_surface_text_"));
          if (!ref) continue;
          assert.ok(ref.path);
          const bytes = await readFile(ref.path);
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const checked = { body: bytes, expectedSha256: sha256, expectedSizeBytes: bytes.byteLength };
          if (verified) verifyLocalV2DagLambdaArtifactBody(checked);
          else assert.throws(() => verifyLocalV2DagLambdaArtifactBody({ ...checked, body: Buffer.alloc(bytes.byteLength) }), /checksum mismatch/);
          artifactsById.set(ref.artifactId, {
            artifactId: ref.artifactId, fileName: path.basename(ref.path), sha256, sizeBytes: bytes.byteLength,
            uri: `s3://policy-fixture/${path.basename(ref.path)}`,
            ...(verified ? { text: bytes.toString("utf8"), verificationStatus: "verified" } : { verificationStatus: "verification_failed" }),
          });
          if (verified) texts.push({ observationId: surface.observationId, text: bytes.toString("utf8") });
        }
        const summary = summarizePolicySurfaces(dedupePolicySurfaces(captured.policySurfaceObservations, documentUrl), "127.0.0.1", {
          targetUrl: documentUrl, discoveredPolicySurfaces: captured.policySurfaceObservations,
          policyEvidenceLaneStatus: captured.moduleRun.status === "completed" ? "complete" : "degraded",
          policyTextEvidenceContext: { artifactsById, scanId: record.scan.id, generatedAt: f.bundle.completedAt, sourceBundle: source },
        });
        if (governing && verified) {
          assert.equal(summary.policyTextEvidenceProjection.documents[0]?.finalUrl, fixture.policyUrl);
          assert.equal(summary.policyTextEvidenceProjection.documents[0]?.artifactVerificationStatus, "verified");
        }
        const child = projectCaliforniaPrivacyReview(f.bundle, source, documentUrl, {
          projection: summary.policyTextEvidenceProjection, texts,
        });
        assert.ok(child, "The representative rendered visit retains a typed California assessment");
        assert.ok(child.contractVersion === "certscore.california-privacy-review.v10");
        if (governing && verified) {
          assert.equal(child.reviewCoverage?.sourceDocuments[0]?.url, fixture.policyUrl);
          const rights = child.rightsAssessment!.topics;
          assert.equal(rights.length, 4);
          for (const right of rights) assert.equal(right.status,
            mode === "missing_right" && right.topic === "non_discrimination" ? "not_observed" : "disclosed");
        } else {
          assert.equal(child.rightsAssessment, undefined);
          assert.equal(child.reviewCoverage?.families.find(family => family.id === "california_rights")?.status, "unknown");
          assert.deepEqual(child.reviewCoverage?.sourceDocuments, []);
        }
        const parent = deriveConsentControlAssessment({ scan: { scanId: record.scan.id, finalUrl: documentUrl } });
        if (child) parent.californiaPrivacyReview = child;
        record.runtimeArtifacts = {
          policyDisclosureSummary: summary,
          consentControlAssessment: consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent))),
        };
        const concerns = buildNormalizedConcerns({ reviewFindingCandidates: [], validationFindings: [], runtimeArtifacts: record.runtimeArtifacts });
        const sufficientPolicyTopics = concerns.filter(concern =>
          concern.evidenceBundle.rawEvidence?.gdprTransparencyArticle13ConcernState === "sufficient");
        if (governing) {
          assert.ok(sufficientPolicyTopics.length > 0, "Recovered policy clauses enter the normalized GDPR concern path");
          for (const concern of sufficientPolicyTopics) assert.equal(
            new URL(String(concern.evidenceBundle.rawEvidence?.sourceUrl)).href.replace(/\/$/, ""),
            fixture.policyUrl.replace(/\/$/, ""));
          // Verified bundle sections can support positives independently of the
          // full-text artifact. A failed full-text checksum still bars absence.
        } else {
          assert.equal(sufficientPolicyTopics.length, 0, `${mode} cannot create visitor policy-topic coverage`);
          assert.equal(summary.privacyPolicyPresent, false, `${mode} cannot satisfy governing policy availability`);
        }
        const missing = concerns.find(concern => concern.suggestedUnifiedFindingId === "california_rights_disclosure_not_observed");
        const shouldDeduct = mode === "missing_right" && verified;
        assert.equal(Boolean(missing), shouldDeduct, `${mode}, verified=${verified}`);
        if (missing) assert.equal(deriveConcernPolicy({ concern: missing, evidenceStrengthFlags: missing.evidenceStrengthFlags,
          rawEvidence: missing.evidenceBundle.rawEvidence, consentControlAssessment: parent }).promotionEligibility, "eligible");
        const packets = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [],
          validationFindingLookup: new Map(), runtimeArtifacts: record.runtimeArtifacts });
        const canonical = (record as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
        canonical.normalizedConcerns = concerns;
        canonical.ownerUnifiedFindings = packets;
        canonical.globalUnifiedFindings = packets;
        record.accessPostureSummary = {} as ScanDetailResponse["accessPostureSummary"];
        record.snapshot = { report_projection_status: "ready", certscore_overall: 73,
          score_version: "overall-posture.v11" } as ScanDetailResponse["snapshot"];
        const persisted = buildPersistedScanReportProjection(record);
        const restored = readPersistedScanReportProjection({ scan: record.scan, snapshot: {
          report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION,
          report_projection_payload: JSON.parse(persisted.serialized), report_projection_payload_sha256: persisted.sha256,
          report_projection_payload_size_bytes: persisted.sizeBytes, report_projection_computed_at: f.bundle.completedAt,
        } });
        assert.ok(restored);
        assert.deepEqual(restored.runtimeArtifacts?.consentControlAssessment, record.runtimeArtifacts.consentControlAssessment);
        const exported = buildCanonicalReportExport(restored, undefined, "ccpa_cpra")!;
        assert.equal(exported.californiaScore.deductions.some(row => row.policyKey === "california.rights_disclosure_not_observed"), shouldDeduct);
        const api = buildApiV2ScanResource(restored);
        assert.equal(api.postureScores?.ccpaCpra.score, exported.californiaScore.score);
        if (governing && verified) assert.equal(exported.californiaScore.score, shouldDeduct ? 88 : 100);
        const withoutCalifornia = buildApiV2ScanResource({ ...restored, runtimeArtifacts: {
          ...restored.runtimeArtifacts, consentControlAssessment: { ...parent, californiaPrivacyReview: undefined },
        } });
        assert.deepEqual(api.postureScores?.gdprEprivacy, withoutCalifornia.postureScores?.gdprEprivacy);
        assert.equal(JSON.parse(JSON.stringify(exported)).californiaScore.score, exported.californiaScore.score);
        assert.ok(renderCanonicalReportPdf(exported).byteLength > 0);
      }
    } finally {
      await fixture.close();
      await rm(outDir, { recursive: true, force: true });
    }
  }
});


test("PDF export carries the canonical CertScore.ai score, preserves retained scores and fails closed for no-go", async () => {
  const { deriveCanonicalOverallScoreForReport } = await import("./canonical-overall-score");
  const record = scanRecord();
  const canonical = (record as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
  const expected = deriveCanonicalOverallScoreForReport({ scanRecord: record, checklistRows: canonical.checklistRows, unifiedFindings: canonical.ownerUnifiedFindings });
  assert.deepEqual(buildCanonicalReportExport(record)!.score, { value: expected, scope: "starting_page" });
  record.snapshot = { certscore_overall: 61, report_projection_status: "ready" } as ScanDetailResponse["snapshot"];
  const before = structuredClone(record);
  assert.equal(buildCanonicalReportExport(record)!.score.value, 61);
  assert.deepEqual(record, before);
  for (const invalid of [-1, 101, Number.NaN, "82"]) {
    record.snapshot = { certscore_overall: invalid, report_projection_status: "ready" } as ScanDetailResponse["snapshot"];
    assert.equal(buildCanonicalReportExport(record)!.score.value, expected);
  }
  const retained = JSON.parse(await readFile("apps/web/lib/scans/test-fixtures/authentication-no-go-20260909.json", "utf8"));
  record.runtimeArtifacts = retained.runtimeArtifacts;
  record.snapshot = { certscore_overall: 100, report_projection_status: "ready" } as ScanDetailResponse["snapshot"];
  assert.equal(buildCanonicalReportExport(record)!.score.value, null);
});


test("PDF appendix exports all bound CMP detail and preserves shared action reportability", () => {
  const record = scanRecord();
  const fixture = reportCmpEvidenceFixture(record.scan.id);
  record.runtimeArtifacts = { consentControlAssessment: fixture.assessment, cmpVendorName: "OneTrust" };
  const canonical = (record as unknown as { canonicalReportProjection: PersistedCanonicalReportProjection }).canonicalReportProjection;
  canonical.normalizedConcerns = fixture.normalizedConcerns;
  const before = structuredClone(record);
  const report = buildCanonicalReportExport(record)!;
  const audit = report.appendix.evidenceDossier.cmp.audit;
  assert.equal(audit.rows.length, 13);
  assert.equal(audit.rows.find(row => row.id === "cookie_information")!.supportingEvidence!.inventory!.declarations!.length, 100);
  assert.equal(audit.rows.find(row => row.id === "implementation")!.supportingEvidence!.inventory!.choiceActivity![0]!.requests[0]!.path, "/collect");
  assert.deepEqual(record, before);
  assert.deepEqual(report.projection.unifiedFindings, []);
  assert.equal(report.score.value, null);
  const pdf = renderCanonicalReportPdf(report).toString("latin1");
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]!);
  const cookiePage = streams.findIndex(stream => stream.includes("retained_cookie_100"));
  const storagePage = streams.findIndex(stream => stream.includes("(Appendix B: Cookies and similar technologies) Tj"));
  assert.ok(cookiePage >= 0 && storagePage > cookiePage);
  assert.doesNotMatch(pdf, /deduction|point penalty|scoring withheld/i);
  fixture.assessment.controls.reject.state = "unknown";
  fixture.assessment.assessmentStatus = "limited";
  fixture.assessment.coverage.status = "limited";
  const restricted = buildCanonicalReportExport(record)!.appendix.evidenceDossier.cmp.audit;
  assert.deepEqual(restricted.rows.find(row => row.id === "implementation")!.supportingEvidence!.inventory!.choiceActivity, []);
  canonical.normalizedConcerns = [];
  const unbound = buildCanonicalReportExport(record)!.appendix.evidenceDossier.cmp.audit;
  assert.ok(unbound.rows.every(row => !row.supportingEvidence?.inventory), "Raw typed CMP rows cannot bypass normalized concern eligibility");
  record.runtimeArtifacts!.consentControlAssessment = consentControlAssessmentSchema.parse({ ...fixture.assessment, scan: { ...fixture.assessment.scan, scanId: "other-scan" }, cmpAudit: { ...fixture.assessment.cmpAudit, scanId: "other-scan" } });
  assert.equal(buildCanonicalReportExport(record)!.consentControlAssessment, null);
});
