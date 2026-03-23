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
        additionalDiscoveryMaxAdditionalFetchAttempts: 8,
        additionalDiscoveryMaxFetchAttemptsPerType: 3,
        additionalDiscoveryMaxSecondHopLegalHubFetchesPerMissingType: 1,
        browserProfileSweepEnabled: false,
        browserNavigationTimeoutMs: 30_000,
        browserPostLoadWaitMs: 1_000,
        browserRuntimeCaptureMaxAttempts: 1,
        browserRuntimeStabilityMinWaitMs: 300,
        browserRuntimeStabilityQuietWindowMs: 300,
        blockStylesheetsInBrowser: false,
        consentAcceptPathStrategy: "reject_then_accept_on_escalation",
        consentProfileSweepEnabled: false,
        expansionTargetCount: 20,
        prefetchTargetCount: 5,
        profile: "balanced",
        runPostrunCookiesDiagnostic: false,
        runServiceWorkerCheck: false,
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

function createSupabaseStub(input: {
  domain?: Record<string, unknown>;
  scan: Record<string, unknown>;
  updateErrors?: Partial<Record<string, string>>;
}) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle: async () => {
                  if (table === "scans") {
                    return {
                      data: input.scan.id === value ? input.scan : null,
                      error: null
                    };
                  }

                  if (table === "domains") {
                    return {
                      data: input.domain && input.domain.id === value ? input.domain : null,
                      error: null
                    };
                  }

                  return { data: null, error: null };
                }
              };
            }
          };
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          return {
            eq: async () => ({
              error: input.updateErrors?.[table] ? { message: input.updateErrors[table] } : null
            })
          };
        }
      };
    }
  };

  return { client, inserts, updates };
}

function createBundle() {
  return {
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    compatibilitySignals: [],
    pageEvidence: [],
    pages: [],
    policyEnrichments: [],
    policyEvidence: [],
    policyReviewQueueItems: [],
    runtimeArtifacts: {
      consentAcceptInteractionSucceeded: false,
      consentAuditCompleted: false,
      consentRejectInteractionSucceeded: false
    },
    scanPlan: {
      browserNavigationTimeoutMs: 30_000,
      browserPostLoadWaitMs: 1_000,
      blockStylesheetsInBrowser: false,
      expansionTargetCount: 20,
      prefetchTargetCount: 5,
      profile: "balanced",
      staticFetchConcurrency: 4
    },
    signalHits: [],
    snapshot: {
      accessibilityScore: 80,
      certscoreOverall: 72,
      contactPagePresent: true,
      cookieBannerPresent: false,
      cookieCountTotal: 0,
      homepageFetchStatus: "ok",
      pagesScanned: 3,
      partialScan: false,
      privacyPolicyPresent: true,
      privacyScore: 68,
      termsOfServicePresent: true,
      thirdPartyCookieCount: 0,
      totalSignals: 0,
      trackerCountTotal: 0,
      trackerVendorCount: 0,
      trackingBeforeConsentDetected: false,
      thirdPartyCookieSetBeforeConsent: false,
      wcagErrorCountTotal: 0,
      legalCoverageScore: 70
    },
    trackerVendors: []
  } as never;
}

test("runFullScanJob completes with degraded baseline lookup when previous snapshot lookup fails", async () => {
  const supabase = createSupabaseStub({
    domain: {
      hostname: "example.com",
      id: "domain-1",
      max_pages_override: null,
      normalized_url: "https://example.com"
    },
    scan: {
      domain_id: "domain-1",
      id: "scan-1",
      organization_id: "org-1",
      pages_requested: 5,
      scan_config_json: null,
      scan_type: "full",
      status: "queued"
    }
  });
  const bundle = createBundle();

  await testInternals.runFullScanJob("scan-1", {
    buildSnapshotBundle: async () => bundle,
    createAdminClient: () => supabase.client as never,
    getPreviousCompletedScan: async () => {
      throw new Error("Previous snapshot lookup failed");
    },
    getSnapshotBundle: async () => null as never,
    replaceScanSignals: async () => undefined,
    saveComplianceChangeEvents: async () => undefined,
    saveSnapshotBundle: async () => undefined
  });

  const scanConfigUpdates = supabase.updates.filter(
    (entry) => entry.table === "scans" && "scan_config_json" in entry.values
  );
  const scanConfigUpdate = scanConfigUpdates[scanConfigUpdates.length - 1]?.values.scan_config_json as
    | { execution?: { summary?: ScannerExecutionSummary } }
    | undefined;

  assert.equal(scanConfigUpdate?.execution?.summary?.lifecycle, "completed");
  assert.deepEqual(scanConfigUpdate?.execution?.summary?.degradedStages, ["baseline_lookup"]);
  assert.equal(scanConfigUpdate?.execution?.summary?.failureCategory, null);

  const completedUpdate = supabase.updates.find(
    (entry) => entry.table === "scans" && entry.values.status === "completed"
  );
  assert.ok(completedUpdate);
});

test("runFullScanJob fails when snapshot persistence fails", async () => {
  const supabase = createSupabaseStub({
    domain: {
      hostname: "example.com",
      id: "domain-1",
      max_pages_override: null,
      normalized_url: "https://example.com"
    },
    scan: {
      domain_id: "domain-1",
      id: "scan-2",
      organization_id: "org-1",
      pages_requested: 5,
      scan_config_json: null,
      scan_type: "full",
      status: "queued"
    }
  });
  const bundle = createBundle();

  await assert.rejects(() =>
    testInternals.runFullScanJob("scan-2", {
      buildSnapshotBundle: async () => bundle,
      createAdminClient: () => supabase.client as never,
      getPreviousCompletedScan: async () => null,
      getSnapshotBundle: async () => null as never,
      replaceScanSignals: async () => undefined,
      saveComplianceChangeEvents: async () => undefined,
      saveSnapshotBundle: async () => {
        throw new Error("Failed to save snapshot bundle");
      }
    })
  );

  const failedUpdate = supabase.updates.find(
    (entry) => entry.table === "scans" && entry.values.status === "failed"
  );
  assert.ok(failedUpdate);

  const scanConfigUpdates = supabase.updates.filter(
    (entry) => entry.table === "scans" && "scan_config_json" in entry.values
  );
  const scanConfigUpdate = scanConfigUpdates[scanConfigUpdates.length - 1]?.values.scan_config_json as
    | { execution?: { summary?: ScannerExecutionSummary } }
    | undefined;

  assert.equal(scanConfigUpdate?.execution?.summary?.lifecycle, "failed");
  assert.equal(scanConfigUpdate?.execution?.summary?.failureCategory, "persistence");
});

test("runFullScanJob degrades when signal derivation fails but persistence can continue", async () => {
  const supabase = createSupabaseStub({
    domain: {
      hostname: "example.com",
      id: "domain-1",
      max_pages_override: null,
      normalized_url: "https://example.com"
    },
    scan: {
      domain_id: "domain-1",
      id: "scan-3",
      organization_id: "org-1",
      pages_requested: 5,
      scan_config_json: null,
      scan_type: "full",
      status: "queued"
    }
  });
  const bundle = createBundle() as Record<string, unknown>;

  Object.defineProperty(bundle, "compatibilitySignals", {
    get() {
      throw new Error("Signal taxonomy projection failed");
    }
  });

  await testInternals.runFullScanJob("scan-3", {
    buildSnapshotBundle: async () => bundle as never,
    createAdminClient: () => supabase.client as never,
    getPreviousCompletedScan: async () => null,
    getSnapshotBundle: async () => null as never,
    replaceScanSignals: async () => undefined,
    saveComplianceChangeEvents: async () => undefined,
    saveSnapshotBundle: async () => undefined
  });

  const scanConfigUpdates = supabase.updates.filter(
    (entry) => entry.table === "scans" && "scan_config_json" in entry.values
  );
  const scanConfigUpdate = scanConfigUpdates[scanConfigUpdates.length - 1]?.values.scan_config_json as
    | { execution?: { summary?: ScannerExecutionSummary } }
    | undefined;

  assert.equal(scanConfigUpdate?.execution?.summary?.lifecycle, "completed");
  assert.deepEqual(scanConfigUpdate?.execution?.summary?.degradedStages, [
    "signal_derivation",
    "persistence_diff_finalization"
  ]);
  assert.equal(scanConfigUpdate?.execution?.summary?.failureCategory, null);
});

test("runFullScanJob degrades when compatibility signal persistence fails after snapshot save", async () => {
  const supabase = createSupabaseStub({
    domain: {
      hostname: "example.com",
      id: "domain-1",
      max_pages_override: null,
      normalized_url: "https://example.com"
    },
    scan: {
      domain_id: "domain-1",
      id: "scan-4",
      organization_id: "org-1",
      pages_requested: 5,
      scan_config_json: null,
      scan_type: "full",
      status: "queued"
    }
  });
  const bundle = createBundle();

  await testInternals.runFullScanJob("scan-4", {
    buildSnapshotBundle: async () => bundle,
    createAdminClient: () => supabase.client as never,
    getPreviousCompletedScan: async () => null,
    getSnapshotBundle: async () => null as never,
    replaceScanSignals: async () => {
      throw new Error("replace scan signals failed");
    },
    saveComplianceChangeEvents: async () => undefined,
    saveSnapshotBundle: async () => undefined
  });

  const scanConfigUpdates = supabase.updates.filter(
    (entry) => entry.table === "scans" && "scan_config_json" in entry.values
  );
  const scanConfigUpdate = scanConfigUpdates[scanConfigUpdates.length - 1]?.values.scan_config_json as
    | { execution?: { summary?: ScannerExecutionSummary } }
    | undefined;

  assert.equal(scanConfigUpdate?.execution?.summary?.lifecycle, "completed");
  assert.deepEqual(scanConfigUpdate?.execution?.summary?.degradedStages, ["persistence_diff_finalization"]);
  assert.equal(scanConfigUpdate?.execution?.summary?.failureCategory, null);
});
