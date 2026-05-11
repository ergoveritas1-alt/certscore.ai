import assert from "node:assert/strict";
import test from "node:test";
import type { SignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";
import { hasPendingPostCompletionFindingWork } from "./scan-auto-refresh";

function makeWorkflow(overrides: Partial<SignalEnrichmentWorkflowState> = {}): SignalEnrichmentWorkflowState {
  return {
    actualMode: "serial_bridge",
    extractionMetrics: {
      freshExtractions: 0,
      reusedExtractions: 0,
      skippedByReason: {},
      skippedExtractions: 0
    },
    findingsReady: false,
    mergedSignalsReady: true,
    preferredMode: "parallel_evidence_collection",
    stages: [
      {
        completedAt: "2026-04-26T00:00:00.000Z",
        dependsOn: [],
        description: "Scanner",
        durationMs: 1000,
        id: "scanner",
        itemCount: 1,
        label: "Scanner",
        startedAt: "2026-04-26T00:00:00.000Z",
        status: "completed"
      },
      {
        completedAt: null,
        dependsOn: ["signal_merge"],
        description: "Unified findings",
        durationMs: null,
        id: "unified_findings",
        itemCount: 0,
        label: "Unified Findings",
        startedAt: null,
        status: "queued"
      }
    ],
    timings: {
      nanoDocRetrievalDurationMs: null,
      nanoDocSignalsDurationMs: null,
      queuePickupLatencyMs: null,
      projectionRecoveryLatencyMs: null,
      projectionRecoveryMode: null,
      scannerDurationMs: 1000,
      scannerRuntimeMs: 1000,
      signalMergeDurationMs: null,
      timeToFinalReportMs: null,
      timeToFindingsMs: null,
      timeToFirstUsefulReportMs: null,
      timeToMergedSignalsMs: null,
      unifiedFindingsDurationMs: null
    },
    ...overrides
  };
}

test("hasPendingPostCompletionFindingWork follows the enrichment workflow state", () => {
  assert.equal(
    hasPendingPostCompletionFindingWork({
      signalEnrichmentWorkflow: makeWorkflow(),
      status: "completed"
    }),
    true
  );

  assert.equal(
    hasPendingPostCompletionFindingWork({
      reportFindingsDerived: true,
      signalEnrichmentWorkflow: makeWorkflow(),
      status: "completed"
    }),
    false
  );

  assert.equal(
    hasPendingPostCompletionFindingWork({
      signalEnrichmentWorkflow: makeWorkflow({ findingsReady: true }),
      status: "completed"
    }),
    false
  );

  assert.equal(
    hasPendingPostCompletionFindingWork({
      signalEnrichmentWorkflow: makeWorkflow(),
      status: "running"
    }),
    false
  );
});
