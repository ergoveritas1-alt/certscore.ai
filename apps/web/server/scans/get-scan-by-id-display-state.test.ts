import assert from "node:assert/strict";
import test from "node:test";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { deriveScanDisplayState } from "./display-state";

test("derives completed preview detail state from nano and unified finding events", () => {
  const displayState = deriveScanDisplayState(
    {
      completed_at: null,
      created_at: "2026-04-18T17:48:24.500Z",
      scan_type: "preview",
      started_at: null,
      status: "queued"
    },
    [
      {
        createdAt: "2026-04-18T17:48:24.596Z",
        eventType: SCAN_EVENT_TYPES.nanoDocRetrievalStarted,
        id: "evt-start",
        message: "Nano document retrieval started.",
        metadataJson: { stage: "nano_doc_retrieval" }
      },
      {
        createdAt: "2026-04-18T17:48:38.431Z",
        eventType: SCAN_EVENT_TYPES.signalMergeCompleted,
        id: "evt-merge",
        message: "Merged signal derivation completed.",
        metadataJson: { stage: "signal_merge" }
      },
      {
        createdAt: "2026-04-18T17:48:38.437Z",
        eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted,
        id: "evt-findings",
        message: "Unified finding derivation completed.",
        metadataJson: { stage: "unified_findings", findingCount: 2 }
      }
    ]
  );

  assert.equal(displayState.status, "queued");
  assert.equal(displayState.startedAt, null);
  assert.equal(displayState.completedAt, null);
});

test("derives completed preview detail state only from preview lifecycle events", () => {
  const displayState = deriveScanDisplayState(
    {
      completed_at: null,
      created_at: "2026-04-18T17:48:24.500Z",
      scan_type: "preview",
      started_at: null,
      status: "queued"
    },
    [
      {
        createdAt: "2026-04-18T17:48:24.596Z",
        eventType: SCAN_EVENT_TYPES.previewStarted,
        id: "evt-start",
        message: "Preview scan started.",
        metadataJson: null
      },
      {
        createdAt: "2026-04-18T17:48:38.437Z",
        eventType: SCAN_EVENT_TYPES.previewCompleted,
        id: "evt-complete",
        message: "Preview scan completed.",
        metadataJson: null
      }
    ]
  );

  assert.equal(displayState.status, "completed");
  assert.equal(displayState.startedAt, "2026-04-18T17:48:24.596Z");
  assert.equal(displayState.completedAt, "2026-04-18T17:48:38.437Z");
});

test("leaves non-preview scan status untouched", () => {
  const displayState = deriveScanDisplayState(
    {
      completed_at: null,
      created_at: "2026-04-18T17:48:24.500Z",
      scan_type: "full",
      started_at: null,
      status: "queued"
    },
    [
      {
        createdAt: "2026-04-18T17:48:38.437Z",
        eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted,
        id: "evt-findings",
        message: "Unified finding derivation completed.",
        metadataJson: { stage: "unified_findings", findingCount: 2 }
      }
    ]
  );

  assert.equal(displayState.status, "queued");
  assert.equal(displayState.startedAt, null);
  assert.equal(displayState.completedAt, null);
});
