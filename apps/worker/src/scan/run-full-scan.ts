import { createAdminClient } from "@website-signal-risk-scanner/db";
import { FULL_SCAN_EVENT_TYPES, PREVIEW_SCAN_EVENT_TYPES, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { getPreviousCompletedScan } from "./history/get-previous-scan";
import { getSnapshotBundle, replaceScanSignals, saveComplianceChangeEvents, saveSnapshotBundle } from "./persistence";
import { buildSnapshotBundle, diffSnapshots } from "./snapshot";

type ScanRow = {
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_requested: number;
  scan_config_json: Record<string, unknown> | null;
  status: string;
  scan_type: "preview" | "full" | "scheduled";
};

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
};

async function insertScanEvent(input: {
  scanId: string;
  domainId: string | null;
  organizationId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    scan_id: input.scanId,
    domain_id: input.domainId,
    organization_id: input.organizationId,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null
  });

  if (error) {
    throw new Error(`Failed to insert scan event: ${error.message}`);
  }
}

function getRequestedPageCount(scan: ScanRow, domain: DomainRow) {
  const configMaxPages =
    typeof scan.scan_config_json?.maxPages === "number" && Number.isFinite(scan.scan_config_json.maxPages)
      ? scan.scan_config_json.maxPages
      : null;

  return Math.max(1, domain.max_pages_override ?? configMaxPages ?? scan.pages_requested ?? 10);
}

function toCompatibilitySignalRows(input: {
  domainId: string;
  organizationId: string;
  scanId: string;
  signals: Array<{
    category: string;
    key: string;
    label: string;
    value: boolean | number | string | string[];
  }>;
}) {
  return input.signals.map((signal) => ({
    scan_id: input.scanId,
    organization_id: input.organizationId,
    domain_id: input.domainId,
    category: signal.category,
    signal_key: signal.key,
    signal_label: signal.label,
    signal_value_json: signal.value,
    value_type: Array.isArray(signal.value)
      ? "string_array"
      : typeof signal.value === "boolean"
        ? "boolean"
        : typeof signal.value === "number"
          ? "number"
          : "text"
  })) as Array<{
    category: string;
    domain_id: string;
    organization_id: string;
    scan_id: string;
    signal_key: string;
    signal_label: string;
    signal_value_json: boolean | number | string | string[];
    value_type: "boolean" | "number" | "text" | "string_array";
  }>;
}

function buildExecutionScanConfig(
  scanConfig: Record<string, unknown> | null,
  input: {
    pagesRequested: number;
    scanPlan: {
      blockStylesheetsInBrowser: boolean;
      browserNavigationTimeoutMs: number;
      browserPostLoadWaitMs: number;
      expansionTargetCount: number;
      prefetchTargetCount: number;
      profile: string;
      staticFetchConcurrency: number;
    };
  }
) {
  return {
    ...(scanConfig ?? {}),
    execution: {
      pagesRequested: input.pagesRequested,
      scanPlan: {
        profile: input.scanPlan.profile,
        prefetchTargetCount: input.scanPlan.prefetchTargetCount,
        expansionTargetCount: input.scanPlan.expansionTargetCount,
        staticFetchConcurrency: input.scanPlan.staticFetchConcurrency,
        browserNavigationTimeoutMs: input.scanPlan.browserNavigationTimeoutMs,
        browserPostLoadWaitMs: input.scanPlan.browserPostLoadWaitMs,
        blockStylesheetsInBrowser: input.scanPlan.blockStylesheetsInBrowser
      }
    }
  } satisfies Record<string, unknown>;
}

export async function runFullScanJob(scanId: string) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .select("id, organization_id, domain_id, pages_requested, status, scan_config_json, scan_type")
    .eq("id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load scan ${scanId}: ${error.message}`);
  }

  if (!scan) {
    throw new Error(`Scan ${scanId} was not found.`);
  }

  const scanRow = scan as ScanRow;

  if (!scanRow.domain_id) {
    throw new Error(`Scan ${scanId} is missing a domain.`);
  }

  if (!scanRow.organization_id && scanRow.scan_type !== "preview") {
    throw new Error(`Scan ${scanId} is missing an organization.`);
  }

  if (scanRow.status === "completed") {
    return;
  }

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url, max_pages_override")
    .eq("id", scanRow.domain_id)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load domain for scan ${scanId}: ${domainError.message}`);
  }

  if (!domain) {
    throw new Error(`Domain for scan ${scanId} was not found.`);
  }

  const domainRow = domain as DomainRow;
  const requestedPageCount = getRequestedPageCount(scanRow, domainRow);
  const startedAt = new Date();
  const isPreview = scanRow.scan_type === "preview";
  const startedEventType = scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.started : FULL_SCAN_EVENT_TYPES.started;
  const completedEventType =
    scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.completed : FULL_SCAN_EVENT_TYPES.completed;
  const failedEventType = scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.failed : FULL_SCAN_EVENT_TYPES.failed;
  const crawlSource = scanRow.scan_type === "scheduled" ? "scheduled" : scanRow.scan_type === "preview" ? "preview" : "manual";

  try {
    const { error: startError } = await supabase
      .from("scans")
      .update({
        status: "running",
        started_at: startedAt.toISOString(),
        error_message: null
      })
      .eq("id", scanId);

    if (startError) {
      throw new Error(`Failed to mark scan as running: ${startError.message}`);
    }

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: startedEventType,
      message: scanRow.scan_type === "preview" ? "Live preview scan started." : "Structured snapshot scan started.",
      metadata: {
        pagesRequested: requestedPageCount
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.crawlStarted,
      message: "Stage 1 started: crawl setup, robots, homepage fetch, and page discovery.",
      metadata: {
        requestedPageCount
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.regressionStarted,
      message: isPreview
        ? "Looking for a previous completed snapshot so this preview can anchor itself against any existing baseline."
        : "Looking for a previous completed snapshot so this scan can compare against the latest baseline.",
      metadata: {
        requestedPageCount,
        scanType: scanRow.scan_type
      }
    });

    const previousScan = await getPreviousCompletedScan({
      currentScanId: scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id
    });
    const previousBundle = previousScan ? await getSnapshotBundle(previousScan.id) : null;

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.regressionCompleted,
      message: previousScan
        ? "Previous snapshot context found. New observations will be compared against the earlier completed scan."
        : isPreview
          ? "No previous snapshot context found. This preview run is creating the first baseline for this domain."
          : "No previous snapshot context found. This run is creating the first baseline for this domain.",
      metadata: {
        hasPreviousSnapshot: Boolean(previousScan),
        previousScanId: previousScan?.id ?? null
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.privacyAuditStarted,
      message: isPreview
        ? "Starting the lightweight live pass: homepage fetch, runtime/privacy checks, legal-link discovery, and signal normalization."
        : "Starting the full scan pass: homepage fetch, runtime/privacy checks, legal-link discovery, targeted page fetches, and signal normalization.",
      metadata: {
        requestedPageCount,
        crawlSource
      }
    });

    const bundle = await buildSnapshotBundle({
      scanId,
      organizationId: scanRow.organization_id,
      domainId: domainRow.id,
      domain: domainRow.normalized_url || domainRow.hostname,
      previous: previousBundle,
      requestedPageCount,
      crawlSource
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.legalAuditStarted,
      message: isPreview
        ? "Runtime checks are back. Folding privacy-policy, terms, contact, and disclosure evidence into the preview bundle now."
        : "Runtime checks are back. Folding privacy-policy, terms, contact, and disclosure evidence into the full scan bundle now.",
      metadata: {
        pagesScanned: bundle.snapshot.pagesScanned,
        privacyPolicyPresent: bundle.snapshot.privacyPolicyPresent,
        termsOfServicePresent: bundle.snapshot.termsOfServicePresent,
        contactPagePresent: bundle.snapshot.contactPagePresent
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.homepageLoaded,
      message: "Homepage fetch and lightweight runtime pass completed.",
      metadata: {
        homepageFetchStatus: bundle.snapshot.homepageFetchStatus,
        pagesScanned: bundle.snapshot.pagesScanned,
        cookieBannerPresent: bundle.snapshot.cookieBannerPresent,
        trackerCountTotal: bundle.snapshot.trackerCountTotal,
        cookieCountTotal: bundle.snapshot.cookieCountTotal,
        thirdPartyCookieCount: bundle.snapshot.thirdPartyCookieCount
      }
    });

    const updatedScanConfig = buildExecutionScanConfig(scanRow.scan_config_json, {
      pagesRequested: requestedPageCount,
      scanPlan: bundle.scanPlan
    });

    const { error: executionConfigError } = await supabase
      .from("scans")
      .update({
        scan_config_json: updatedScanConfig
      })
      .eq("id", scanId);

    if (executionConfigError) {
      throw new Error(`Failed to persist scan execution config: ${executionConfigError.message}`);
    }

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.pageDiscoveryCompleted,
      message: "Stages 1-6 completed: static extraction, policy normalization, browser checks, enrichment, and scoring.",
      metadata: {
        scanPlanProfile: bundle.scanPlan.profile,
        staticFetchConcurrency: bundle.scanPlan.staticFetchConcurrency,
        prefetchTargetCount: bundle.scanPlan.prefetchTargetCount,
        expansionTargetCount: bundle.scanPlan.expansionTargetCount,
        pagesScanned: bundle.snapshot.pagesScanned,
        homepageFetchStatus: bundle.snapshot.homepageFetchStatus,
        partialScan: bundle.snapshot.partialScan,
        trackerCountTotal: bundle.snapshot.trackerCountTotal,
        wcagErrorCountTotal: bundle.snapshot.wcagErrorCountTotal
      }
    });

    await saveSnapshotBundle(bundle);

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.legalAuditCompleted,
      message: isPreview
        ? "Canonical preview bundle assembled successfully. Persisting the snapshot rows and score summaries next."
        : "Canonical full scan bundle assembled successfully. Persisting the snapshot rows and score summaries next.",
      metadata: {
        totalSignals: bundle.snapshot.totalSignals,
        certscoreOverall: bundle.snapshot.certscoreOverall,
        privacyScore: bundle.snapshot.privacyScore,
        accessibilityScore: bundle.snapshot.accessibilityScore
      }
    });
    if (scanRow.organization_id) {
      await replaceScanSignals({
        scanId,
        signals: toCompatibilitySignalRows({
          scanId,
          organizationId: scanRow.organization_id,
          domainId: domainRow.id,
          signals: bundle.compatibilitySignals
        })
      });
    }

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.privacyAuditStarted,
      message: isPreview
        ? "Privacy and consent normalization completed. Persisting the preview snapshot next."
        : "Privacy and consent normalization completed. Persisting the full scan snapshot next.",
      metadata: {
        privacyPolicyPresent: bundle.snapshot.privacyPolicyPresent,
        trackingBeforeConsentDetected: bundle.snapshot.trackingBeforeConsentDetected,
        thirdPartyCookieSetBeforeConsent: bundle.snapshot.thirdPartyCookieSetBeforeConsent
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.signalsPersisted,
      message: "Stage 7 completed: canonical snapshot, page metadata, vendor rows, accessibility counts, and compatibility signals persisted.",
      metadata: {
        totalSignals: bundle.snapshot.totalSignals,
        trackerVendorCount: bundle.snapshot.trackerVendorCount,
        pagesPersisted: bundle.pages.length,
        trackerRowsPersisted: bundle.trackerVendors.length,
        accessibilityRuleRowsPersisted: bundle.accessibilityRuleCounts.length,
        privacyScore: bundle.snapshot.privacyScore,
        accessibilityScore: bundle.snapshot.accessibilityScore
      }
    });

    const diff = diffSnapshots({
      domain: domainRow.hostname,
      eventTimestamp: new Date().toISOString(),
      currentSnapshot: bundle.snapshot,
      currentTrackers: bundle.trackerVendors,
      previousScanId: previousScan?.id ?? null,
      previousSnapshot: previousBundle?.snapshot ?? null,
      previousTrackers: previousBundle?.trackers ?? []
    });

    if (scanRow.organization_id) {
      await saveComplianceChangeEvents({
        scanIdCurrent: scanId,
        organizationId: scanRow.organization_id,
        domainId: domainRow.id,
        events: diff.events
      });
    }

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.accessibilityAuditCompleted,
      message: isPreview
        ? "Accessibility and disclosure summaries were finalized for the preview result."
        : "Accessibility and disclosure summaries were finalized for the full scan result.",
      metadata: {
        accessibilityScore: bundle.snapshot.accessibilityScore,
        wcagErrorCountTotal: bundle.snapshot.wcagErrorCountTotal,
        legalCoverageScore: bundle.snapshot.legalCoverageScore
      }
    });

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.changesComputed,
      message: diff.summary.isBaseline ? "Baseline snapshot recorded." : "Stage 8 completed: rich snapshot diff and change events recorded.",
      metadata: diff.summary
    });

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const { error: completeError } = await supabase
      .from("scans")
      .update({
        status: "completed",
        pages_scanned: bundle.snapshot.pagesScanned,
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        error_message: null
      })
      .eq("id", scanId);

    if (completeError) {
      throw new Error(`Failed to mark scan as completed: ${completeError.message}`);
    }

    await supabase
      .from("domains")
      .update({
        latest_scan_id: scanId,
        last_scanned_at: completedAt.toISOString()
      })
      .eq("id", domainRow.id);

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: completedEventType,
      message: scanRow.scan_type === "preview" ? "Live preview scan completed." : "Structured snapshot scan completed.",
      metadata: {
        durationMs,
        pagesScanned: bundle.snapshot.pagesScanned,
        totalSignals: bundle.snapshot.totalSignals,
        certscoreOverall: bundle.snapshot.certscoreOverall,
        changeSummary: diff.summary
      }
    });
  } catch (jobError) {
    const errorMessage = jobError instanceof Error ? jobError.message : "Unknown full scan job error";

    await supabase
      .from("scans")
      .update({
        status: "failed",
        error_message: errorMessage
      })
      .eq("id", scanId);

    await insertScanEvent({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: failedEventType,
      message: scanRow.scan_type === "preview" ? "Live preview scan failed." : "Structured snapshot scan failed.",
      metadata: {
        error: errorMessage
      }
    });

    throw jobError;
  }
}
