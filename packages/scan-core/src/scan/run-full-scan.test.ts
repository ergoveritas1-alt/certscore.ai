import assert from "node:assert/strict";
import test from "node:test";
import type { ScanExecutionErrorCategory, ScannerExecutionSummary } from "@website-signal-risk-scanner/shared";
import { testInternals } from "./run-full-scan";

test("retryTransientStageOperation retries transient failures and returns the successful attempt", async () => {
  let attempts = 0;

  const result = await testInternals.retryTransientStageOperation({
    label: "Snapshot bundle build",
    maxAttempts: 3,
    operation: async () => {
      attempts += 1;

      if (attempts < 2) {
        throw new Error("Initial navigation timed out after 30000ms");
      }

      return "ok";
    },
    timeoutMs: 100
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, {
    attempts: 2,
    result: "ok"
  });
});

test("retryTransientStageOperation stops on non-transient failures", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      testInternals.retryTransientStageOperation({
        label: "Snapshot bundle build",
        maxAttempts: 3,
        operation: async () => {
          attempts += 1;
          throw new Error("Missing scan record");
        },
        timeoutMs: 100
      }),
    (error: unknown) => {
      assert.equal(attempts, 1);
      assert.equal(typeof error, "object");
      assert.equal((error as { attempts: number }).attempts, 1);
      assert.equal((error as { category: ScanExecutionErrorCategory }).category, "missing_record");
      assert.equal((error as { error: Error }).error.message, "Missing scan record");
      return true;
    }
  );
});

test("buildExecutionScanConfig preserves existing execution fields and attaches the shared summary", () => {
  const executionSummary = {
    contractVersion: "scanner-execution.v1",
    degradedStages: ["baseline_lookup"],
    failureCategory: null,
    lifecycle: "completed",
    startedAt: "2026-03-21T20:00:00.000Z",
    completedAt: "2026-03-21T20:00:10.000Z",
    stages: [
      {
        attempts: 1,
        completedAt: "2026-03-21T20:00:05.000Z",
        durationMs: 5000,
        errorCategory: "baseline_lookup",
        message: "Previous snapshot lookup failed.",
        metadata: {
          fallbackUsed: true
        },
        outcome: "degraded",
        recoverable: true,
        stage: "baseline_lookup",
        startedAt: "2026-03-21T20:00:00.000Z"
      }
    ],
    updatedAt: "2026-03-21T20:00:10.000Z"
  } satisfies ScannerExecutionSummary;

  const nextConfig = testInternals.buildExecutionScanConfig(
    {
      execution: {
        existingField: "keep-me",
        scanPlan: {
          profile: "legacy"
        }
      },
      maxPages: 10
    },
    {
      executionSummary,
      pagesRequested: 12,
      scanPlan: {
        browserNavigationTimeoutMs: 30_000,
        browserPostLoadWaitMs: 1_000,
        blockStylesheetsInBrowser: false,
        expansionTargetCount: 20,
        prefetchTargetCount: 5,
        profile: "balanced",
        staticFetchConcurrency: 4
      }
    }
  );

  assert.deepEqual(nextConfig, {
    execution: {
      existingField: "keep-me",
      pagesRequested: 12,
      scanPlan: {
        browserNavigationTimeoutMs: 30_000,
        browserPostLoadWaitMs: 1_000,
        blockStylesheetsInBrowser: false,
        expansionTargetCount: 20,
        prefetchTargetCount: 5,
        profile: "balanced",
        staticFetchConcurrency: 4
      },
      summary: executionSummary
    },
    maxPages: 10
  });
});

test("getRequestedPageCount prefers domain override before scan config and scan default", () => {
  assert.equal(
    testInternals.getRequestedPageCount(
      {
        domain_id: "domain-1",
        id: "scan-1",
        organization_id: null,
        pages_requested: 6,
        scan_config_json: {
          maxPages: 9
        },
        scan_type: "full",
        status: "queued"
      },
      {
        hostname: "example.com",
        id: "domain-1",
        max_pages_override: 14,
        normalized_url: "https://example.com"
      }
    ),
    14
  );
});
