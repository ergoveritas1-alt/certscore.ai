import assert from "node:assert/strict";
import test from "node:test";
import { SCAN_EVENT_TYPES } from "../constants/queue";
import { deriveSignalEnrichmentWorkflowState } from "./scan-signal-workflow";

test("deriveSignalEnrichmentWorkflowState marks bridge mode when nano starts after scanner completion", () => {
  const workflow = deriveSignalEnrichmentWorkflowState({
    events: [
      { createdAt: "2026-04-02T10:00:00.000Z", eventType: SCAN_EVENT_TYPES.fullStarted },
      { createdAt: "2026-04-02T10:05:00.000Z", eventType: SCAN_EVENT_TYPES.fullCompleted },
      { createdAt: "2026-04-02T10:06:00.000Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted },
      { createdAt: "2026-04-02T10:07:00.000Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted },
      { createdAt: "2026-04-02T10:08:00.000Z", eventType: SCAN_EVENT_TYPES.signalMergeStarted },
      { createdAt: "2026-04-02T10:09:00.000Z", eventType: SCAN_EVENT_TYPES.signalMergeCompleted },
      { createdAt: "2026-04-02T10:10:00.000Z", eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted },
      { createdAt: "2026-04-02T10:11:00.000Z", eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted }
    ],
    documentSourceCount: 2,
    findingsCount: 4,
    mergedSignalCount: 12,
    nanoSignalCount: 5,
    policyDocumentCount: 2,
    scanCompletedAt: "2026-04-02T10:05:00.000Z",
    scanStatus: "completed",
    scannerSignalCount: 7
  });

  assert.equal(workflow.actualMode, "serial_bridge");
  assert.equal(workflow.mergedSignalsReady, true);
  assert.equal(workflow.findingsReady, true);
  assert.deepEqual(workflow.extractionMetrics, {
    freshExtractions: 0,
    reusedExtractions: 0,
    skippedExtractions: 0,
    skippedByReason: {}
  });
  assert.deepEqual(workflow.timings, {
    scannerDurationMs: 5 * 60 * 1000,
    nanoDocRetrievalDurationMs: null,
    nanoDocSignalsDurationMs: 60 * 1000,
    signalMergeDurationMs: 60 * 1000,
    unifiedFindingsDurationMs: 60 * 1000,
    timeToMergedSignalsMs: 9 * 60 * 1000,
    timeToFindingsMs: 11 * 60 * 1000
  });
  assert.deepEqual(
    workflow.stages.map((stage) => [stage.id, stage.status, stage.durationMs]),
    [
      ["scanner", "completed", 5 * 60 * 1000],
      ["nano_doc_retrieval", "completed", null],
      ["nano_doc_signals", "completed", 60 * 1000],
      ["signal_merge", "completed", 60 * 1000],
      ["unified_findings", "completed", 60 * 1000]
    ]
  );
});

test("deriveSignalEnrichmentWorkflowState recovers nano doc retrieval status from downstream nano completion", () => {
  const workflow = deriveSignalEnrichmentWorkflowState({
    events: [
      { createdAt: "2026-04-20T08:25:43.073Z", eventType: SCAN_EVENT_TYPES.fullStarted },
      { createdAt: "2026-04-20T08:26:03.817Z", eventType: SCAN_EVENT_TYPES.fullCompleted },
      { createdAt: "2026-04-20T08:26:08.949Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted },
      { createdAt: "2026-04-20T08:26:08.953Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted },
      { createdAt: "2026-04-20T08:26:08.955Z", eventType: SCAN_EVENT_TYPES.signalMergeStarted },
      { createdAt: "2026-04-20T08:26:08.961Z", eventType: SCAN_EVENT_TYPES.signalMergeCompleted },
      { createdAt: "2026-04-20T08:26:08.962Z", eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted },
      { createdAt: "2026-04-20T08:26:08.963Z", eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted }
    ],
    documentSourceCount: 0,
    findingsCount: 3,
    mergedSignalCount: 9,
    nanoSignalCount: 0,
    policyDocumentCount: 0,
    scanCompletedAt: "2026-04-20T08:26:03.817Z",
    scanStatus: "completed",
    scannerSignalCount: 9
  });

  const docRetrievalStage = workflow.stages.find((stage) => stage.id === "nano_doc_retrieval");
  assert.ok(docRetrievalStage);
  assert.equal(docRetrievalStage?.status, "completed");
  assert.equal(docRetrievalStage?.startedAt, null);
  assert.equal(docRetrievalStage?.durationMs, null);
  assert.equal(docRetrievalStage?.completedAt, "2026-04-20T08:26:08.953Z");
});

test("deriveSignalEnrichmentWorkflowState marks parallelized mode when nano begins before scanner completion", () => {
  const workflow = deriveSignalEnrichmentWorkflowState({
    events: [
      { createdAt: "2026-04-02T10:00:00.000Z", eventType: SCAN_EVENT_TYPES.fullStarted },
      { createdAt: "2026-04-02T10:01:00.000Z", eventType: SCAN_EVENT_TYPES.nanoDocRetrievalStarted }
    ],
    documentSourceCount: 0,
    findingsCount: 0,
    mergedSignalCount: 0,
    nanoSignalCount: 0,
    policyDocumentCount: 0,
    skippedExtractionCount: 2,
    skippedExtractionReasons: {
      secondary_privacy_not_required: 1,
      terms_extraction_not_required: 1
    },
    scanCompletedAt: "2026-04-02T10:05:00.000Z",
    scanStatus: "running",
    scannerSignalCount: 3
  });

  assert.equal(workflow.actualMode, "parallelized");
  assert.equal(workflow.stages.find((stage) => stage.id === "nano_doc_retrieval")?.status, "running");
  assert.equal(workflow.stages.find((stage) => stage.id === "nano_doc_signals")?.status, "blocked");
  assert.equal(workflow.stages.find((stage) => stage.id === "signal_merge")?.status, "blocked");
  assert.equal(workflow.timings.scannerDurationMs, 5 * 60 * 1000);
  assert.equal(workflow.timings.nanoDocRetrievalDurationMs, null);
  assert.equal(workflow.timings.timeToMergedSignalsMs, null);
  assert.equal(workflow.timings.timeToFindingsMs, null);
  assert.deepEqual(workflow.extractionMetrics, {
    freshExtractions: 0,
    reusedExtractions: 0,
    skippedExtractions: 2,
    skippedByReason: {
      secondary_privacy_not_required: 1,
      terms_extraction_not_required: 1
    }
  });
});

test("deriveSignalEnrichmentWorkflowState promotes merge and findings to completed when persisted counts exist after scan completion", () => {
  const workflow = deriveSignalEnrichmentWorkflowState({
    events: [
      { createdAt: "2026-04-18T21:29:50.260Z", eventType: SCAN_EVENT_TYPES.fullQueued },
      { createdAt: "2026-04-18T21:29:50.310Z", eventType: SCAN_EVENT_TYPES.nanoDocRetrievalStarted },
      { createdAt: "2026-04-18T21:29:52.241Z", eventType: SCAN_EVENT_TYPES.nanoDocRetrievalCompleted },
      { createdAt: "2026-04-18T21:29:58.263Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted },
      { createdAt: "2026-04-18T21:29:58.299Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted },
      { createdAt: "2026-04-18T21:30:05.767Z", eventType: SCAN_EVENT_TYPES.fullStarted },
      { createdAt: "2026-04-18T21:30:48.697Z", eventType: SCAN_EVENT_TYPES.fullCompleted }
    ],
    documentSourceCount: 3,
    findingsCount: 1,
    mergedSignalCount: 6,
    nanoSignalCount: 3,
    policyDocumentCount: 3,
    reusedExtractionCount: 3,
    scanCompletedAt: "2026-04-18T21:30:48.697Z",
    scanStatus: "completed",
    scannerSignalCount: 6
  });

  assert.equal(workflow.mergedSignalsReady, true);
  assert.equal(workflow.findingsReady, true);
  assert.equal(workflow.stages.find((stage) => stage.id === "signal_merge")?.status, "completed");
  assert.equal(workflow.stages.find((stage) => stage.id === "unified_findings")?.status, "completed");
  assert.equal(workflow.stages.find((stage) => stage.id === "signal_merge")?.startedAt, null);
  assert.equal(workflow.stages.find((stage) => stage.id === "unified_findings")?.startedAt, null);
});
