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
import { buildReportDisplayExport } from "./report-display-export";
import { selectReportEvidenceSection } from "./report-evidence-selection";

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
  const assessment = { ...observedControlAssessment, scan: { ...observedControlAssessment.scan, scanId } };
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

test("score explanations fail closed for historical, mismatched and unscored results", () => {
  const scan = fixture();
  assert.equal(projectScanScoreExplanation(scan, 100), null);
  assert.equal(projectScanScoreExplanation(scan, null), null);
  assert.equal(projectScanScoreExplanation({ ...scan, snapshot: { ...scan.snapshot, score_version: "historical" } }, 85), null);
  assert.equal(projectScanScoreExplanation({ ...scan, snapshot: { ...scan.snapshot, score_version: null } }, 85), null);
  assert.equal(projectScanFormsSummary({ ...scan, scan: { ...scan.scan, status: "running" } }), null);
});
