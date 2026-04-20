import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivityLineWithExecutionSummary,
  hasPersistedSignalsMismatch,
  serializePreviewScan
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

test("serializePreviewScan does not treat nano enrichment completion as preview completion", () => {
  const preview = serializePreviewScan({
    domain: {
      created_at: "2026-04-20T17:37:08.304Z",
      hostname: "facebook.com",
      id: "domain-1",
      latest_scan_id: "scan-1",
      normalized_url: "https://facebook.com/",
      organization_id: null,
      updated_at: "2026-04-20T17:37:08.304Z"
    },
    events: [
      {
        created_at: "2026-04-20T17:37:08.361Z",
        event_type: "preview_scan.queued",
        message: "Preview scan queued.",
        metadata_json: {
          hostname: "facebook.com",
          normalizedUrl: "https://facebook.com/"
        }
      },
      {
        created_at: "2026-04-20T17:38:44.602Z",
        event_type: "signals.nano_doc_enrichment_completed",
        message: "Nano document signal enrichment completed.",
        metadata_json: {
          stage: "nano_doc_signals"
        }
      }
    ],
    latestEvent: {
      created_at: "2026-04-20T17:38:44.602Z",
      event_type: "signals.nano_doc_enrichment_completed",
      message: "Nano document signal enrichment completed.",
      metadata_json: {
        stage: "nano_doc_signals"
      }
    },
    recentEvents: [],
    runtimeArtifacts: null,
    scan: {
      completed_at: null,
      created_at: "2026-04-20T17:37:08.304Z",
      domain_id: "domain-1",
      duration_ms: null,
      error_message: null,
      id: "scan-1",
      organization_id: null,
      pages_requested: 1,
      pages_scanned: 0,
      scan_config_json: {
        hostname: "facebook.com",
        normalizedUrl: "https://facebook.com/",
        processor: "live-preview-v1"
      },
      scan_type: "preview",
      started_at: null,
      status: "queued",
      submitted_by_user_id: null,
      updated_at: "2026-04-20T17:37:08.304Z"
    }
  });

  assert.equal(preview.status, "queued");
  assert.equal(preview.completedAt, null);
  assert.match(preview.activityLine ?? "", /waiting for a worker/i);
});
