import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { collectionSurfaceAssessmentSchema, postAcceptReportProjectionSchema, COLLECTION_SURFACE_ASSESSMENT_VERSION } from "@certscore/contracts";
import { CANONICAL_OVERALL_SCORE_VERSION } from "../scans/california-gpc-response-policy";
import { observedControlAssessment } from "../scans/test-fixtures/observed-control-assessment";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { projectScanFormsSummary, projectScanScoreExplanation } from "./scan-report-summary";
import { buildApiV2ScanResource, buildApiV2ScanStatus } from "./scan-resource";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { accessibilityProjectionFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { buildUnifiedFindingDisplayPackets } from "../scans/unified-findings";
import { buildReportDisplayExport } from "./report-display-export";
import { selectReportEvidenceSection } from "./report-evidence-selection";
import { projectRetainedActionTimeline } from "../scans/action-timeline-projection";
import { deriveCanonicalOverallScoreExplanationForReport } from "../../server/scans/canonical-overall-score";
import { getPersistedCanonicalReportProjection } from "../../server/scans/persisted-canonical-report-projection";

const scanId = "00000000-0000-4000-8000-000000000123";
const pageUrl = "https://sits.example/en/";
function fixture(): ScanDetailResponse {
  const forms = [8, 1].map((count, index) => {
    const formRef = `collection_form_${index}`;
    return { formRef, structure: "native_form", surfaceType: "generic_form", pageUrl, method: "post",
      actionRelationship: "third_party", actionHostname: "forms-eu1.hsforms.com", candidateFieldCount: count,
      retainedFieldCount: count, fieldsTruncated: false, confidence: 1, directVsInferred: "direct",
      fields: Array.from({ length: count }, (_, i) => ({ fieldRef: `${formRef}_field_${i}`, elementType: "input",
        inputType: "text", semanticCategory: "name", required: false, disabled: false, readOnly: false,
        confidence: 1, directVsInferred: "direct", evidenceRefs: [] })) };
  });
  const afterAccept = postAcceptReportProjectionSchema.parse({
    contractVersion: "certscore.post_accept_report_projection.v1", completedAt: "2026-10-07T10:00:01.000Z",
    packetSha256: "b".repeat(64), status: "confirmed_clean", evidenceDisposition: "confirmed", indeterminateReason: null,
    contradictionObserved: false, observationCount: 0, observationWindowMs: 500, postAcceptActivity: [],
    productionProjectable: true, acceptanceExercised: true, registrationStatus: "confirmed", resolverMethod: "cmp_registry_recipe",
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v1", action: "accept", observedAtMs: 90,
      accessibleLabel: "Accept all", labelSource: "visible_text", actionSemantics: "direct_label", classifierIntent: "accept",
      classifierConfidence: 1, recipeId: "fixture", selectorHint: "#accept", visible: true, enabled: true,
      uniquelyActionable: true, authorizedTargetSha256: "a".repeat(64) },
    acceptanceRegisteredAtMs: 110,
    interactionDiagnostics: { resolver: { snapshots: [], truncated: false },
      navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
      click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false } },
    formSnapshotCapture: { contractVersion: "certscore.post_accept_form_snapshots.v1", phase: "after_accept", sessionId: randomUUID(),
      exactTargetSha256: "a".repeat(64), actionDispatchedAtMs: 100, acceptanceRegisteredAtMs: 110, capturedAtMs: 150,
      documentIdentity: { source: "cdp_loader_id", token: "loader" },
      inventory: { contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation", phase: "after_accept",
        coverage: "bounded_sample", pageUrl, forms },
      snapshots: forms.map(form => ({ contractVersion: "certscore.collection-surface-snapshot.v1", formRef: form.formRef,
        pageUrl, capturedAt: "2026-10-07T10:00:00.150Z", sourceInventoryHash: "c".repeat(64), mimeType: "image/jpeg",
        valuesMasked: true, status: "available", width: 640, height: 400, sha256: "d".repeat(64), sizeBytes: 1000 })),
    },
  });
  const assessment = { ...structuredClone(observedControlAssessment), scan: { ...observedControlAssessment.scan, scanId } };
  const row = { id: "post_reject_tracking_reduction", label: "Post-choice tracking reduction", status: "Gap observed",
    assessmentStatus: "gap_observed", evidenceState: "observed", tone: "warning", note: "Direct post-refusal requests retained.",
    explanation: "Direct post-refusal requests retained.", subchecks: [], evidenceRefs: [],
    criticalEvidence: { retainedEvidence: { rejectInteractionConfirmed: true, refusalExercised: true,
      scoreEffect: "canonical_post_refusal_policy" }, projectedFindings: [], missingOrIncompleteSourceSignals: [] } };
  return { scan: { id: scanId, domainHostname: "sits.example", status: "completed", scanType: "full", pagesScanned: 1,
    pagesRequested: 1, scanFromValue: "eu_ie", scanConfigJson: { normalizedUrl: pageUrl },
    createdAt: "2026-10-07T10:00:00.000Z", startedAt: "2026-10-07T10:00:00.000Z", completedAt: "2026-10-07T10:00:02.000Z" },
    snapshot: { certscore_overall: 85, score_version: CANONICAL_OVERALL_SCORE_VERSION, report_projection_status: "ready" },
    runtimeArtifacts: { consentControlAssessment: assessment, postAcceptEvidenceProjection: afterAccept },
    trackerVendors: [], signals: [], validationFindings: [], events: [], pageEvidence: [], policyEnrichment: [],
    accessPostureSummary: {}, canonicalReportProjection: { artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [row], derivedContext: {}, legacyScoreAssessmentInput: { scanId }, normalizedConcerns: [],
      globalUnifiedFindings: [], ownerUnifiedFindings: [], topFindingIds: [],
      collectionSurfaceAssessment: collectionSurfaceAssessmentSchema.parse({ contractVersion: COLLECTION_SURFACE_ASSESSMENT_VERSION,
        scanId, assessedAt: "2026-10-07T10:00:00.000Z", assessmentStatus: "not_observed", sourceInventoryContractVersion: null,
        sourceHash: "a".repeat(64), sourceLane: "runtime_evidence", pageUrl, coverage: null, forms: [], productionProjectable: true }),
    },
  } as unknown as ScanDetailResponse;
}

test("report and API share the 85 score, Reject deduction and both After-Accept forms", () => {
  const scan = fixture();
  const api = buildApiV2ScanResource(scan);
  const status = buildApiV2ScanStatus(scan, { canonicalScan: api });
  const report = buildTimelineReportModel(scan);
  assert.equal(api.score, 85);
  assert.equal(status.score, 85);
  assert.deepEqual(api.formsSummary, status.formsSummary);
  assert.deepEqual(api.scoreExplanation, status.scoreExplanation);
  assert.equal(api.formsSummary?.totalObserved, 2);
  assert.equal(api.formsSummary?.preConsentObserved, 0);
  assert.equal(api.formsSummary?.afterAcceptObserved, 2);
  assert.equal(api.scoreExplanation?.totalPolicyDeductionPoints, 15);
  assert.equal(api.scoreExplanation?.deductions[0]?.rules[0]?.decisionVerification, "confirmed");
  assert.ok(api.scoreExplanation?.deductions[0]?.rules[0]?.findingIds.includes("regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction"));
  assert.ok("collectionTableRows" in report);
  assert.equal(report.score.value, 85);
  assert.deepEqual(report.formsSummary, api.formsSummary);
  assert.deepEqual(report.scoreExplanation, api.scoreExplanation);
  const selected = selectReportEvidenceSection(report as unknown as Record<string, unknown>, "forms");
  const exported = buildReportDisplayExport(selected.report) as any;
  assert.deepEqual(exported.formsSummary, api.formsSummary);
  assert.deepEqual(exported.collectionTableRows.map((row: any) => [row.capturePhase, row.form.fields.length, row.snapshot.status]),
    [["after_accept", 8, "available"], ["after_accept", 1, "available"]]);
  assert.equal(new URL(api.links!.formsEvidence!).searchParams.get("section"), "forms");
  assert.equal(status.links?.formsEvidence, api.links!.formsEvidence);
  for (const [index, row] of exported.collectionTableRows.entries()) {
    const url = new URL(row.snapshot.url);
    assert.equal(url.pathname, `/api/v2/scans/${scanId}/report-evidence/form-snapshot`);
    assert.equal(url.searchParams.get("formRef"), `after_accept:collection_form_${index}`);
  }
});

test("terminal bound fields agree across report, API follow-up and form tally without changing score",()=>{
  const scan=fixture() as any;const packet=scan.runtimeArtifacts.postAcceptEvidenceProjection;
  const images=packet.formSnapshotCapture;
  const later={...images.inventory.forms[0],candidateFieldCount:7,retainedFieldCount:7,
    fields:images.inventory.forms[0].fields.slice(0,7).map((field:any,index:number)=>({...field,controlIndex:index,label:`Field ${index}`}))};
  images.inventory.forms=[{...later,candidateFieldCount:3,retainedFieldCount:3,fields:later.fields.slice(0,3)}];
  images.snapshots=images.snapshots.slice(0,1);
  packet.formCapture={version:'post_accept_form_capture.v3',phase:'after_accept_click',sessionId:randomUUID(),
    exactTargetSha256:'a'.repeat(64),actionDispatchedAtMs:100,status:'captured',reasonCodes:[],inspectedFrameCount:1,candidateFrameCount:1,
    window:{startedAtMs:110,endedAtMs:610,terminalSampleCompleted:true},frames:[{
      frameRef:'accept_frame_0',documentToken:randomUUID(),documentUrl:pageUrl,capturedAtMs:550,
      documentBinding:{source:'cdp_loader_id',token:'loader',boundAtMs:130},
      forms:[{...later,formRef:'accept_frame_0_collection_form_0'}]}]};
  packet.retainedActionTiming={policyVersion:'retained_action_timing.v1',action:'accept',actionDispatchedAtMs:100,observationEndedAtMs:610};
  assert.ok(postAcceptReportProjectionSchema.safeParse(packet).success);
  const api=buildApiV2ScanResource(scan);const report=buildTimelineReportModel(scan);
  assert.ok('collectionTableRows' in report);
  const exported=buildReportDisplayExport(selectReportEvidenceSection(report as unknown as Record<string,unknown>,'forms').report) as any;
  assert.equal(api.formsSummary?.afterAcceptObserved,1);
  assert.deepEqual(report.formsSummary,api.formsSummary);
  assert.equal(exported.collectionTableRows[0]?.form.fields.length,7);
  assert.equal(exported.collectionTableRows[0]?.snapshot.status,'available');
  assert.equal(exported.collectionTableRows[0]?.captureProvenance.capturedAtMs,550);
  assert.equal(api.score,85);assert.equal(api.scoreExplanation?.totalPolicyDeductionPoints,15);
  assert.equal(images.inventory.forms[0].fields.length,3,'source image inventory is immutable');
  const timeline=projectRetainedActionTimeline(packet,scan.runtimeArtifacts.consentControlAssessment,'accept')!;
  assert.equal(timeline.events.find(event=>event.label==='Forms captured')?.atMs,450);
  packet.formCapture.frames[0].forms.push({...later,formRef:'accept_frame_0_collection_form_1',candidateFieldCount:1,retainedFieldCount:1,
    fields:[{...later.fields[0],fieldRef:'collection_form_1_field_0',controlIndex:7}]});
  assert.equal(projectScanFormsSummary(scan)?.afterAcceptObserved,2);
  assert.equal(projectRetainedActionTimeline(packet,scan.runtimeArtifacts.consentControlAssessment,'accept')?.events
    .find(event=>event.label==='Forms captured')?.detail,'2 forms retained after the Accept click');
});

test("unavailable, malformed or gated-off form captures do not become zero observed", () => {
  const scan = fixture() as any;
  scan.canonicalReportProjection.collectionSurfaceAssessment = null;
  delete scan.runtimeArtifacts.postAcceptEvidenceProjection;
  assert.equal(projectScanFormsSummary(scan), null);
  const limited = fixture() as any;
  limited.canonicalReportProjection.collectionSurfaceAssessment.assessmentStatus = "limited";
  limited.runtimeArtifacts.consentControlAssessment.controls.accept.state = "unknown";
  const summary = projectScanFormsSummary(limited)!;
  assert.equal(summary.preConsentCapture, "limited");
  assert.equal(summary.afterAcceptObserved, null);
  assert.equal(summary.afterAcceptCapture, "unavailable");
  const malformed = fixture() as any;
  malformed.canonicalReportProjection.collectionSurfaceAssessment.scanId = "another-scan";
  malformed.runtimeArtifacts.postAcceptEvidenceProjection.packetSha256 = "invalid";
  assert.equal(projectScanFormsSummary(malformed), null);
});

test("incomplete empty After-Accept capture has the same not-captured status in report, API and evidence export", () => {
  const scan = fixture() as any;
  const packet=scan.runtimeArtifacts.postAcceptEvidenceProjection;
  delete packet.formSnapshotCapture;
  packet.formCapture={version:'post_accept_form_capture.v2',phase:'after_accept_click',sessionId:randomUUID(),
    exactTargetSha256:'a'.repeat(64),actionDispatchedAtMs:100,status:'limited',reasonCodes:['frame_unavailable'],
    inspectedFrameCount:0,candidateFrameCount:1,frames:[],window:{startedAtMs:110,endedAtMs:610,terminalSampleCompleted:false}};
  assert.ok(postAcceptReportProjectionSchema.safeParse(packet).success,JSON.stringify(postAcceptReportProjectionSchema.safeParse(packet)));
  const api=buildApiV2ScanResource(scan);
  const status=buildApiV2ScanStatus(scan,{canonicalScan:api});
  const report=buildTimelineReportModel(scan);
  assert.ok('collectionTableRows' in report);
  assert.equal(api.formsSummary?.countStatus,'not_captured');
  assert.equal(api.formsSummary?.afterAcceptCapture,'limited');
  assert.deepEqual(status.formsSummary,api.formsSummary);
  assert.deepEqual(report.formsSummary,api.formsSummary);
  const exported=buildReportDisplayExport(selectReportEvidenceSection(report as unknown as Record<string,unknown>,'forms').report) as Record<string,unknown>;
  assert.deepEqual(exported.formsSummary,api.formsSummary);
  assert.equal(api.score,85,'form coverage must not affect Reject scoring');
  packet.formCapture={...packet.formCapture,status:'captured',reasonCodes:[],inspectedFrameCount:1,
    frames:[{frameRef:'accept_frame_0',documentToken:randomUUID(),documentUrl:pageUrl,capturedAtMs:550,forms:[]}],
    window:{startedAtMs:110,endedAtMs:610,terminalSampleCompleted:true}};
  assert.equal(projectScanFormsSummary(scan)?.countStatus,'captured');
  assert.equal(projectScanFormsSummary(scan)?.totalObserved,0);
  packet.formCapture={...packet.formCapture,version:'post_accept_form_capture.v1',window:undefined};
  assert.equal(projectScanFormsSummary(scan)?.countStatus,'not_captured','legacy early sample is not completed window coverage');
});

test("withheld screenshots preserve verified fields and disclosures in API follow-up", () => {
  const scan=fixture() as any;
  const images=scan.runtimeArtifacts.postAcceptEvidenceProjection.formSnapshotCapture;
  images.snapshots=images.snapshots.map((snapshot:any)=>({contractVersion:snapshot.contractVersion,formRef:snapshot.formRef,
    pageUrl:snapshot.pageUrl,capturedAt:snapshot.capturedAt,sourceInventoryHash:snapshot.sourceInventoryHash,mimeType:'image/jpeg',
    valuesMasked:true,status:'withheld',reason:'review_withheld'}));
  images.inventory.forms[0].privacyDisclosure={version:1,excerpts:[{text:'See our Privacy policy',association:'inside_form',links:[]}],truncated:false};
  assert.ok(postAcceptReportProjectionSchema.safeParse(scan.runtimeArtifacts.postAcceptEvidenceProjection).success,
    JSON.stringify(postAcceptReportProjectionSchema.safeParse(scan.runtimeArtifacts.postAcceptEvidenceProjection)));
  const report=buildTimelineReportModel(scan);
  assert.ok('collectionTableRows' in report);
  const exported=buildReportDisplayExport(selectReportEvidenceSection(report as unknown as Record<string,unknown>,'forms').report) as any;
  assert.deepEqual(exported.collectionTableRows.map((row:any)=>[row.form.fields.length,row.snapshot.status]),[[8,'withheld'],[1,'withheld']]);
  assert.equal(exported.collectionTableRows[0].form.privacyDisclosure.excerpts[0].text,'See our Privacy policy');
  assert.ok(exported.collectionTableRows.every((row:any)=>!row.snapshot.url));
  assert.equal(exported.formsSummary.totalObserved,2);
});

test("score explanations fail closed for historical, mismatched and unscored results", () => {
  const scan = fixture();
  assert.equal(projectScanScoreExplanation(scan, 100), null);
  assert.equal(projectScanScoreExplanation(scan, null), null);
  assert.equal(projectScanScoreExplanation({ ...scan, snapshot: { ...scan.snapshot, score_version: "historical" } }, 85), null);
  assert.equal(projectScanScoreExplanation({ ...scan, snapshot: { ...scan.snapshot, score_version: null } }, 85), null);
  assert.equal(projectScanFormsSummary({ ...scan, scan: { ...scan.scan, status: "running" } }), null);
});

test("accessibility presentation preserves the versioned historical score without recalculation", () => {
  const scan = fixture();
  scan.snapshot = { ...scan.snapshot!, score_version: "overall-posture.v6" };
  const accessibilityAudit = accessibilityProjectionFixture({ scanId: scan.scan.id });
  scan.runtimeArtifacts = { ...scan.runtimeArtifacts, accessibilityAudit };
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const canonical = (scan as unknown as { canonicalReportProjection: { ownerUnifiedFindings: typeof packets; globalUnifiedFindings: typeof packets } }).canonicalReportProjection;
  canonical.ownerUnifiedFindings = packets;
  canonical.globalUnifiedFindings = packets;
  const retained = JSON.stringify(scan);
  const report = buildTimelineReportModel(scan);
  assert.ok("findings" in report);
  assert.ok(report.findings.some(finding => finding.id === "visual_contrast_accessibility_issue" && finding.priority === "high"));
  assert.ok(report.findings.some(finding => finding.id === "text_alternative_accessibility_issue" && finding.status === "Observed"));
  assert.match(report.verdict, /4 accessibility issues \(4 high-impact checks\)/);
  assert.equal(report.accessibilityAudit?.failedRuleCount, 4);
  assert.equal(report.score.value, 85);
  assert.equal(buildApiV2ScanResource(scan).score, 85);
  assert.equal(projectScanScoreExplanation(scan, 85), null);
  assert.equal(JSON.stringify(scan), retained, "report presentation leaves the retained projection unchanged");
});

test("fresh accessibility scoring agrees across report, API status and evidence export", () => {
  const scan = fixture();
  const accessibilityAudit = accessibilityProjectionFixture({ scanId: scan.scan.id });
  scan.runtimeArtifacts = { ...scan.runtimeArtifacts, accessibilityAudit };
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { accessibilityAudit },
    reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const canonical = (scan as unknown as { canonicalReportProjection: { ownerUnifiedFindings: typeof packets; globalUnifiedFindings: typeof packets } }).canonicalReportProjection;
  canonical.ownerUnifiedFindings = packets;
  canonical.globalUnifiedFindings = packets;
  const persisted = getPersistedCanonicalReportProjection(scan)!;
  const score = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: scan,
    checklistRows: persisted.checklistRows, unifiedFindings: persisted.globalUnifiedFindings })!;
  assert.equal(score.score, 75, "15 existing privacy points plus 10 accessibility points");
  scan.snapshot = { ...scan.snapshot!, certscore_overall: score.score, score_version: score.scoreVersion };
  const original = JSON.stringify(scan);
  const api = buildApiV2ScanResource(scan);
  const status = buildApiV2ScanStatus(scan, { canonicalScan: api });
  const report = buildTimelineReportModel(scan);
  const exported = buildReportDisplayExport(report as unknown as Record<string, unknown>) as any;
  assert.ok("scoreExplanation" in report);
  assert.equal(api.score, 75);
  assert.equal(status.score, 75);
  assert.equal(report.score.value, 75);
  assert.deepEqual(api.scoreExplanation, report.scoreExplanation);
  assert.deepEqual(status.scoreExplanation, report.scoreExplanation);
  assert.deepEqual(exported.scoreExplanation, report.scoreExplanation);
  assert.equal(api.scoreExplanation?.deductions.find(row => row.family === "accessibility")?.deductionPoints, 10);
  assert.equal(JSON.stringify(scan), original);
});
