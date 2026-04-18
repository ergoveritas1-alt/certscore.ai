import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivityLineWithExecutionSummary,
  hasPersistedSignalsMismatch
} from "./preview-scan-repository";

test("hasPersistedSignalsMismatch detects degraded signal persistence behind a signals.persisted event", () => {
  const result = hasPersistedSignalsMismatch({
    executionSummary: {
      completedAt: "2026-04-18T11:23:46.817Z",
      contractVersion: "scanner-execution.v1",
      degradedStages: ["persistence_diff_finalization"],
      failureCategory: null,
      lifecycle: "completed",
      startedAt: "2026-04-18T11:23:32.019Z",
      stages: [
        {
          attempts: 1,
          completedAt: "2026-04-18T11:23:46.830Z",
          durationMs: 166,
          errorCategory: "persistence",
          message: "Failed to persist scan signals: invalid input syntax for type json",
          metadata: { degradedIssueCount: 1 },
          outcome: "degraded",
          recoverable: true,
          stage: "persistence_diff_finalization",
          startedAt: "2026-04-18T11:23:46.664Z"
        }
      ],
      updatedAt: "2026-04-18T11:23:46.817Z"
    },
    latestEvent: {
      created_at: "2026-04-18T11:23:46.811Z",
      event_type: "signals.persisted",
      message:
        "Stage 7 completed: canonical snapshot, page metadata, vendor rows, accessibility counts, and compatibility signals persisted.",
      metadata_json: {
        pagesPersisted: 4,
        totalSignals: 9,
        trackerRowsPersisted: 6
      }
    }
  });

  assert.equal(result, true);
});

test("buildActivityLineWithExecutionSummary overrides misleading signals.persisted success text when signal persistence degraded", () => {
  const line = buildActivityLineWithExecutionSummary(
    {
      completed_at: "2026-04-18T11:23:46.817Z",
      created_at: "2026-04-18T11:23:30.657Z",
      domain_id: "domain-1",
      duration_ms: 16160,
      error_message: null,
      id: "scan-1",
      organization_id: null,
      pages_requested: 1,
      pages_scanned: 0,
      scan_config_json: {},
      scan_type: "preview",
      started_at: "2026-04-18T11:23:31.990Z",
      status: "completed",
      submitted_by_user_id: null,
      updated_at: "2026-04-18T11:23:46.817Z"
    },
    {
      created_at: "2026-04-18T11:23:46.811Z",
      event_type: "signals.persisted",
      message:
        "Stage 7 completed: canonical snapshot, page metadata, vendor rows, accessibility counts, and compatibility signals persisted.",
      metadata_json: {
        pagesPersisted: 4,
        totalSignals: 9,
        trackerRowsPersisted: 6
      }
    },
    {
      completedAt: "2026-04-18T11:23:46.817Z",
      contractVersion: "scanner-execution.v1",
      degradedStages: ["persistence_diff_finalization"],
      failureCategory: null,
      lifecycle: "completed",
      startedAt: "2026-04-18T11:23:32.019Z",
      stages: [
        {
          attempts: 1,
          completedAt: "2026-04-18T11:23:46.830Z",
          durationMs: 166,
          errorCategory: "persistence",
          message: "Failed to persist scan signals: invalid input syntax for type json",
          metadata: { degradedIssueCount: 1 },
          outcome: "degraded",
          recoverable: true,
          stage: "persistence_diff_finalization",
          startedAt: "2026-04-18T11:23:46.664Z"
        }
      ],
      updatedAt: "2026-04-18T11:23:46.817Z"
    }
  );

  assert.match(line ?? "", /degraded signal persistence/i);
  assert.doesNotMatch(line ?? "", /compatibility signals persisted/i);
});
