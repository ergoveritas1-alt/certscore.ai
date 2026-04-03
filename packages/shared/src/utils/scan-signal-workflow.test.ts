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
  assert.deepEqual(
    workflow.stages.map((stage) => [stage.id, stage.status]),
    [
      ["scanner", "completed"],
      ["nano_doc_signals", "completed"],
      ["signal_merge", "completed"],
      ["unified_findings", "completed"]
    ]
  );
});

test("deriveSignalEnrichmentWorkflowState marks parallelized mode when nano begins before scanner completion", () => {
  const workflow = deriveSignalEnrichmentWorkflowState({
    events: [
      { createdAt: "2026-04-02T10:00:00.000Z", eventType: SCAN_EVENT_TYPES.fullStarted },
      { createdAt: "2026-04-02T10:01:00.000Z", eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted }
    ],
    findingsCount: 0,
    mergedSignalCount: 0,
    nanoSignalCount: 0,
    policyDocumentCount: 0,
    scanCompletedAt: "2026-04-02T10:05:00.000Z",
    scanStatus: "running",
    scannerSignalCount: 3
  });

  assert.equal(workflow.actualMode, "parallelized");
  assert.equal(workflow.stages.find((stage) => stage.id === "nano_doc_signals")?.status, "running");
  assert.equal(workflow.stages.find((stage) => stage.id === "signal_merge")?.status, "blocked");
});
