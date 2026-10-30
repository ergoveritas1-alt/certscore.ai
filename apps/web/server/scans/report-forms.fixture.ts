import { collectionSurfaceAssessmentSchema, postAcceptReportProjectionSchema, COLLECTION_SURFACE_ASSESSMENT_VERSION } from "@certscore/contracts";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import { priorityReportFixture, priorityScanRecord } from "./report-priority.fixture";
import type { PersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";

/** Owned zero-initial / two-after-Accept fixture with nine retained fields. */
export function reportFormsScanFixture() {
  const scan = priorityScanRecord(priorityReportFixture()) as ReturnType<typeof priorityScanRecord> & { canonicalReportProjection: PersistedCanonicalReportProjection };
  const scanId = scan.scan.id, pageUrl = "https://example.test/";
  const forms = [8, 1].map((count, index) => ({ formRef: `collection_form_${index}`, structure: "native_form", surfaceType: "generic_form", pageUrl,
    method: "post", actionRelationship: "third_party", actionHostname: "forms.example.test", candidateFieldCount: count, retainedFieldCount: count,
    fieldsTruncated: false, confidence: 1, directVsInferred: "direct", fields: Array.from({ length: count }, (_, i) => ({ fieldRef: `form_${index}_field_${i}`,
      label: index === 1 ? "Search" : `Contact field ${i + 1}`, elementType: "input", inputType: "text", semanticCategory: index === 1 ? "search" : "name",
      required: false, disabled: false, readOnly: false, confidence: 1, directVsInferred: "direct", evidenceRefs: [] })) }));
  const projection = postAcceptReportProjectionSchema.parse({ contractVersion: "certscore.post_accept_report_projection.v1", completedAt: "2026-10-21T23:18:53Z",
    packetSha256: "b".repeat(64), status: "confirmed_clean", evidenceDisposition: "confirmed", indeterminateReason: null, contradictionObserved: false,
    observationCount: 0, observationWindowMs: 500, postAcceptActivity: [], productionProjectable: true, acceptanceExercised: true, registrationStatus: "confirmed",
    resolverMethod: "cmp_registry_recipe", acceptanceRegisteredAtMs: 110,
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v1", action: "accept", observedAtMs: 90, accessibleLabel: "Accept all", labelSource: "visible_text",
      actionSemantics: "direct_label", classifierIntent: "accept", classifierConfidence: 1, recipeId: "owned", selectorHint: "#accept", visible: true, enabled: true,
      uniquelyActionable: true, authorizedTargetSha256: "a".repeat(64) },
    interactionDiagnostics: { resolver: { snapshots: [], truncated: false }, navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
      click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false } },
    formCapture: { version: "post_accept_form_capture.v1", phase: "after_accept_click", sessionId: "00000000-0000-4000-8000-000000000002",
      exactTargetSha256: "a".repeat(64), actionDispatchedAtMs: 100, status: "limited", reasonCodes: ["frame_unavailable"], inspectedFrameCount: 1, candidateFrameCount: 2,
      frames: [{ frameRef: "accept_frame_0", documentToken: "00000000-0000-4000-8000-000000000003", documentUrl: pageUrl, capturedAtMs: 150, forms: [] }] },
    formSnapshotCapture: { contractVersion: "certscore.post_accept_form_snapshots.v1", phase: "after_accept", sessionId: "00000000-0000-4000-8000-000000000004",
      exactTargetSha256: "a".repeat(64), actionDispatchedAtMs: 100, acceptanceRegisteredAtMs: 110, capturedAtMs: 150,
      documentIdentity: { source: "cdp_loader_id", token: "loader" }, inventory: { contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation",
        phase: "after_accept", coverage: "bounded_sample", pageUrl, forms }, snapshots: forms.map(form => ({ contractVersion: "certscore.collection-surface-snapshot.v1",
        formRef: form.formRef, pageUrl, capturedAt: "2026-10-21T23:18:53Z", sourceInventoryHash: "c".repeat(64), mimeType: "image/jpeg", valuesMasked: true,
        status: "available", width: 640, height: 400, sha256: "d".repeat(64), sizeBytes: 1000 })) },
  });
  scan.runtimeArtifacts = { consentControlAssessment: { ...structuredClone(observedControlAssessment), scan: { ...observedControlAssessment.scan, scanId } }, postAcceptEvidenceProjection: projection };
  scan.canonicalReportProjection!.collectionSurfaceAssessment = collectionSurfaceAssessmentSchema.parse({ contractVersion: COLLECTION_SURFACE_ASSESSMENT_VERSION,
    scanId, assessedAt: "2026-10-21T23:18:00Z", assessmentStatus: "not_observed", sourceInventoryContractVersion: null, sourceHash: "e".repeat(64),
    sourceLane: "runtime_evidence", pageUrl, coverage: null, forms: [], productionProjectable: true });
  return scan;
}

export function reportRequestScanFixture(count = 3) {
  const scan = reportFormsScanFixture();
  scan.accessPostureSummary = { accessPostureClass: "tolerant", homepageFetchStatus: "ok", stopReason: null, interruptionReason: null } as unknown as typeof scan.accessPostureSummary;
  scan.scan.pagesRequested = 1;
  scan.runtimeArtifacts!.hybridRuntimeEvidence = {
    networkSummary: { metricBasis: "retained_unique_request_events", preConsentRequestCount: count, retainedRequestEventCount: count, totalRequestCount: count },
    requestObservations: Array.from({ length: count }, (_, index) => ({ requestUrl: index < 2 ? "https://js.stripe.com/v3/" : `https://example.test/asset-${index}.js?session=PRIVATE_VALUE`, preConsent: true, timestampMs: 100 + index, thirdParty: index < 2, method: "GET" })),
  };
  return scan;
}
