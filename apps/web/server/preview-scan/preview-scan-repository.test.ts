import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivityLineWithExecutionSummary,
  derivePreviewDisplayState,
  hasPersistedSignalsMismatch,
  sanitizeStaleAccessDiagnostics
} from "./preview-scan-repository";

test("Nano enrichment activity does not promote a queued scanner record to running or completed", () => {
  const scan = {
    completed_at: null,
    created_at: "2026-07-19T04:33:30.310Z",
    domain_id: "domain-1",
    duration_ms: null,
    error_message: null,
    id: "scan-1",
    organization_id: null,
    pages_requested: 1,
    pages_scanned: 0,
    scan_config_json: {},
    scan_type: "preview" as const,
    started_at: null,
    status: "queued" as const,
    submitted_by_user_id: null,
    updated_at: "2026-07-19T04:33:30.310Z"
  };
  const enrichmentEvents = [
    {
      created_at: "2026-07-19T04:33:31.000Z",
      event_type: "signals.nano_doc_enrichment_started",
      message: "Nano document signal enrichment started.",
      metadata_json: { stage: "nano_doc_signals" }
    },
    {
      created_at: "2026-07-19T04:33:32.000Z",
      event_type: "signals.nano_doc_enrichment_completed",
      message: "Nano document signal enrichment completed.",
      metadata_json: { stage: "nano_doc_signals" }
    }
  ];

  assert.deepEqual(derivePreviewDisplayState(scan, enrichmentEvents), {
    completedAt: null,
    startedAt: null,
    status: "queued"
  });
});

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

test("sanitizeStaleAccessDiagnostics clears stale auth wall diagnostics after useful origin reach", () => {
  const result = sanitizeStaleAccessDiagnostics({
    executionSummary: {
      stages: [
        {
          metadata: {
            accessPostureClass: "degraded_but_useful",
            authWallSuspected: true,
            blockedFlag: false,
            blockPageClassification: "login_wall_probable",
            captchaFlag: false,
            challengeSuspected: false,
            homepageFetchHttpStatus: 200,
            homepageFetchStatus: "ok",
            rateLimitSuspected: false
          }
        }
      ]
    },
    snapshot: {
      access_posture_class: "degraded_but_useful",
      auth_wall_suspected: true,
      blocked_flag: false,
      block_page_classification: "login_wall_probable",
      captcha_flag: false,
      challenge_suspected: false,
      homepage_fetch_http_status: 200,
      homepage_fetch_status: "ok",
      rate_limit_suspected: false
    }
  });

  const metadata = result.executionSummary.stages[0]?.metadata;
  assert.ok(metadata);
  assert.equal(metadata.authWallSuspected, false);
  assert.equal(metadata.blockPageClassification, null);
  assert.equal(result.snapshot.auth_wall_suspected, false);
  assert.equal(result.snapshot.block_page_classification, null);
});

test("sanitizeStaleAccessDiagnostics preserves auth wall diagnostics when useful origin was not reached", () => {
  const result = sanitizeStaleAccessDiagnostics({
    accessPostureClass: "early_loss",
    authWallSuspected: true,
    blockedFlag: false,
    blockPageClassification: "login_wall_probable",
    captchaFlag: false,
    challengeSuspected: false,
    homepageFetchHttpStatus: 200,
    homepageFetchStatus: "ok",
    rateLimitSuspected: false
  });

  assert.equal(result.authWallSuspected, true);
  assert.equal(result.blockPageClassification, "login_wall_probable");
});
