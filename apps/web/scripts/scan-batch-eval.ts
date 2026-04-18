import { query, queryOne } from "@website-signal-risk-scanner/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { SCAN_EVENT_TYPES, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../lib/scans/nano-document-sources";
import { buildUnifiedFindingDisplayPackets } from "../lib/scans/unified-findings";
import { getConfiguredValidationRedisUrl } from "../lib/env";
import { repairFindingFamilyPacketEvents } from "../server/scans/family-packet-event-repair";
import { loadMergedSignalsByScanId } from "../server/scans/merged-signal-summary";
import { deriveSignalEnrichmentWorkflowState } from "../../../packages/shared/src/utils/scan-signal-workflow";

type ScanRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

type ScanSignalRow = {
  population_source: string | null;
  signal_key: string;
};

function getDocumentSourceStatusCount(rows: Array<Record<string, unknown>>, status: string) {
  return rows.filter((row) => {
    const value = row.source_status;
    return typeof value === "string" ? value === status : false;
  }).length;
}

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
};

const DEFAULT_ORG_ID = "2f2ef2a2-d86b-4993-8bd5-de912e7de905";
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 5_000;
const NANO_DOC_RETRIEVAL_QUEUE = "nano_doc_retrieval";
const NANO_DOC_RETRIEVAL_JOB = "nano_doc_retrieval";

let nanoDocQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    enableReadyCheck: false,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: password.length > 0 ? password : undefined,
    port: Number(url.port || 6379),
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: username.length > 0 ? username : undefined
  };
}

function getRedisConnection() {
  const redisUrl = getConfiguredValidationRedisUrl();
  if (!redisUrl) {
    throw new Error("Validation Redis is not configured. Set VALIDATION_REDIS_URL or REDIS_URL.");
  }

  return createRedisConnection(redisUrl);
}

function getNanoDocQueue() {
  if (nanoDocQueue) {
    return nanoDocQueue;
  }

  nanoDocQueue = new Queue<{ pollCount?: number; scanId: string }>(NANO_DOC_RETRIEVAL_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoDocQueue;
}

async function enqueueNanoSignalEnrichment(scanId: string) {
  await getNanoDocQueue().add(
    NANO_DOC_RETRIEVAL_JOB,
    { pollCount: 0, scanId },
    {
      attempts: 2,
      jobId: `${scanId}--nano-doc-retrieval--initial`
    }
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return (
    message.includes(`Could not find the '${column}' column`) ||
    message.includes(`column "${column}"`) ||
    message.includes(`column ${column} does not exist`) ||
    (message.includes(column) && message.includes("does not exist"))
  );
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function diffMs(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return null;
  }

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(0, endMs - startMs);
}

function getScanConfig(input: {
  maxPages: number;
  maxRequestedTier?: string | null;
  processor: string;
  profile: string;
  runtimeFast?: boolean;
}) {
  return {
    ...(input.runtimeFast
      ? {
          execution: {
            scanPlanProfileOverride: "runtime_fast"
          }
        }
      : {}),
    ...(input.maxRequestedTier ? { maxRequestedTier: input.maxRequestedTier } : {}),
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: input.processor,
    profile: input.profile,
    maxPages: input.maxPages,
    source: "codex-scan-batch-eval"
  };
}

async function ensureDomain(input: {
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
}) {
  const existing = await queryOne<DomainRow>(
    `
      select id, hostname, normalized_url, max_pages_override
      from domains
      where organization_id = $1
        and normalized_url = $2
    `,
    [input.organizationId, input.normalizedUrl],
    { readOnly: true }
  );

  if (existing) {
    return existing;
  }

  const inserted = await queryOne<DomainRow>(
    `
      insert into domains (organization_id, hostname, normalized_url, status)
      values ($1, $2, $3, 'active')
      returning id, hostname, normalized_url, max_pages_override
    `,
    [input.organizationId, input.hostname, input.normalizedUrl]
  );

  if (!inserted) {
    throw new Error(`Failed to create domain ${input.hostname}: Unknown error`);
  }

  return inserted;
}

async function queueScan(input: {
  domain: DomainRow;
  maxRequestedTier?: string | null;
  organizationId: string;
  processor: string;
  profile: string;
  runtimeFast?: boolean;
  pagesRequestedOverride?: number | null;
}) {
  const pagesRequested = Math.max(1, input.pagesRequestedOverride ?? input.domain.max_pages_override ?? DEFAULT_MAX_PAGES);
  const insertedScan = await queryOne<ScanRow>(
    `
      insert into scans (
        organization_id,
        domain_id,
        submitted_by_user_id,
        scan_type,
        status,
        pages_requested,
        pages_scanned,
        scan_config_json
      )
      values ($1, $2, null, 'full', 'queued', $3, 0, $4)
      returning id, status, created_at, completed_at, error_message
    `,
    [
      input.organizationId,
      input.domain.id,
      pagesRequested,
      getScanConfig({
        maxPages: pagesRequested,
        maxRequestedTier: input.maxRequestedTier,
        processor: input.processor,
        profile: input.profile,
        runtimeFast: input.runtimeFast
      })
    ]
  );

  if (!insertedScan) {
    throw new Error(`Failed to queue scan for ${input.domain.hostname}: Unknown error`);
  }

  await enqueueNanoSignalEnrichment(insertedScan.id).catch((error) => {
    console.error("[scan-batch-eval] nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: insertedScan.id
    });
  });

  return insertedScan;
}

async function waitForCompletion(input: {
  hostname: string;
  scanId: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const scan = await queryOne<ScanRow>(
      `
        select id, status, created_at, completed_at, error_message
        from scans
        where id = $1
      `,
      [input.scanId],
      { readOnly: true }
    );

    if (!scan) {
      throw new Error(`Failed to poll scan ${input.scanId} for ${input.hostname}: Not found`);
    }
    if (scan.status === "completed" || scan.status === "failed" || scan.status === "canceled") {
      return scan;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for scan ${input.scanId} (${input.hostname}) after ${input.timeoutMs}ms`);
}

async function waitForSignalEnrichmentCompletion(input: {
  hostname: string;
  scanId: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const data = await query<{ created_at: string; event_type: string }>(
      `
        select event_type, created_at
        from scan_events
        where scan_id = $1
          and event_type = any($2::text[])
      `,
      [input.scanId, [
        SCAN_EVENT_TYPES.nanoDocRetrievalCompleted,
        SCAN_EVENT_TYPES.nanoDocRetrievalFailed,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed
      ]],
      { readOnly: true }
    ).then((result) => result.rows);

    const eventTypes = new Set(
      data
        .map((row) => (row && typeof row === "object" ? (row as { event_type?: unknown }).event_type : null))
        .filter((value): value is string => typeof value === "string")
    );

    const retrievalDone =
      eventTypes.has(SCAN_EVENT_TYPES.nanoDocRetrievalCompleted) ||
      eventTypes.has(SCAN_EVENT_TYPES.nanoDocRetrievalFailed);
    const enrichmentDone =
      eventTypes.has(SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted) ||
      eventTypes.has(SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed);

    if (retrievalDone && enrichmentDone) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function summarizeScan(input: {
  hostname: string;
  scanId: string;
}) {
  const documentSourcesResult = await query<Record<string, unknown>>(
    `select * from scan_document_sources where scan_id = $1 order by created_at asc`,
    [input.scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: error instanceof Error ? error.message : String(error) } }));
  const [
    snapshot,
    events,
    policyEnrichment,
    signalResult,
    findingsResult,
    scanRow
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scanId], { readOnly: true }),
    query<ScanEventRow>(
      `select id, event_type, message, metadata_json, created_at from scan_events where scan_id = $1 order by created_at asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<ScanSignalRow>(
      `select signal_key, population_source from scan_signals where scan_id = $1 order by signal_key asc`,
      [input.scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as ScanSignalRow[], error: { message: error instanceof Error ? error.message : String(error) } })),
    query<{ id: string }>(
      `select id from validation_run_findings where scan_id = $1`,
      [input.scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as Array<{ id: string }>, error: { message: error instanceof Error ? error.message : String(error) } })),
    queryOne<ScanRow>(
      `select id, status, created_at, started_at, completed_at, error_message from scans where id = $1`,
      [input.scanId],
      { readOnly: true }
    )
  ]);

  const documentSourcesError = documentSourcesResult.error;
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources for ${input.hostname}: ${documentSourcesError.message}`);
  }
  if (!scanRow) {
    throw new Error(`Failed to load scan row for ${input.hostname}: Not found`);
  }

  let signals = signalResult.data;
  let signalsError = signalResult.error;
  if (signalsError && isMissingColumnError(signalsError, "population_source")) {
    const fallback = await query<{ signal_key: string }>(
      `select signal_key from scan_signals where scan_id = $1 order by signal_key asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows);
    signals = fallback.map((row) => ({
      ...row,
      population_source: null
    }));
    signalsError = null;
  }
  if (signalsError) {
    throw new Error(`Failed to load signals for ${input.hostname}: ${signalsError.message}`);
  }

  let findings = findingsResult.data;
  let findingsError = findingsResult.error;
  if (findingsError && isMissingColumnError(findingsError, "scan_id")) {
    const runs = await query<{ id: string }>(
      `select id from validation_runs where scan_id = $1`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows);

    const runIds = runs
      .map((row) => (row && typeof row === "object" ? (row as { id?: unknown }).id : null))
      .filter((value): value is string => typeof value === "string");

    if (runIds.length === 0) {
      findings = [];
      findingsError = null;
    } else {
      findings = await query<{ id: string }>(
        `select id from validation_run_findings where validation_run_id = any($1::uuid[])`,
        [runIds],
        { readOnly: true }
      ).then((result) => result.rows);
      findingsError = null;
    }
  }
  if (findingsError) {
    throw new Error(`Failed to load validation findings for ${input.hostname}: ${findingsError.message}`);
  }

  const normalizedDocumentSources = (documentSourcesError ? [] : documentSourcesResult.data) as Array<Record<string, unknown>>;
  const readyDocumentSourceCount = getDocumentSourceStatusCount(normalizedDocumentSources, "ready");
  const rejectedDocumentSourceCount = getDocumentSourceStatusCount(normalizedDocumentSources, "rejected");
  const signalRows = (signals ?? []) as ScanSignalRow[];
  const findingRows = (findings ?? []) as Array<Record<string, unknown>>;
  const observedAtByScanId = new Map<string, string | null>([
    [input.scanId, scanRow?.completed_at ?? scanRow?.started_at ?? scanRow?.created_at ?? null]
  ]);
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    observedAtByScanId,
    scanIds: [input.scanId]
  });
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const policySemanticRows = preferDocumentSources
    ? buildNanoPolicyInputsFromDocumentSources(normalizedDocumentSources)
    : ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const normalizedPolicyRows = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });

  const repairedEvents = repairFindingFamilyPacketEvents({
    events: events.map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    policyEnrichment: normalizedPolicyRows
  });

  const displayPackets = buildUnifiedFindingDisplayPackets({
    mergedSignals: mergedSignalsByScanId.get(input.scanId) ?? [],
    policyEnrichment: normalizedPolicyRows,
    reviewFindingCandidates: [],
    scanEvents: repairedEvents,
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const surfaced = displayPackets
    .filter((packet) => packet.presentationDecision.status !== "suppress")
    .map((packet) => ({
      id: packet.unifiedFindingId,
      status: packet.presentationDecision.status,
      decision: packet.surfacingDecision.decisionState,
      url: packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? null,
      summary: packet.summary
    }));

  const scannerSignalCount = signalRows.filter((row) => !row.population_source || row.population_source === "scanner").length;
  const nanoSignalCount = signalRows.filter((row) => row.population_source === "nano").length;
  const workflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: readyDocumentSourceCount,
    events: events.map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type
    })),
    findingsCount: findingRows.length,
    mergedSignalCount: signalRows.length,
    nanoSignalCount,
    policyDocumentCount: policySemanticRows.length,
    scanCompletedAt: typeof scanRow?.completed_at === "string" ? scanRow.completed_at : null,
    scanStatus: typeof scanRow?.status === "string" ? scanRow.status : null,
    scannerSignalCount
  });

  return {
    counts: {
      documentSources: readyDocumentSourceCount,
      rejectedDocumentSources: rejectedDocumentSourceCount,
      totalDocumentSourceRows: normalizedDocumentSources.length,
      findings: findingRows.length,
      nanoSignals: nanoSignalCount,
      scannerSignals: scannerSignalCount,
      totalSignals: signalRows.length
    },
    scan: {
      completedAt: typeof scanRow?.completed_at === "string" ? scanRow.completed_at : null,
      createdAt: typeof scanRow?.created_at === "string" ? scanRow.created_at : null,
      startedAt: typeof scanRow?.started_at === "string" ? scanRow.started_at : null,
      status: typeof scanRow?.status === "string" ? scanRow.status : null
    },
    snapshot,
    surfaced,
    workflow
  };
}

async function main() {
  const orgId = getArgValue("--org") ?? DEFAULT_ORG_ID;
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const enrichmentTimeoutMs = Number(getArgValue("--enrichment-timeout-ms") ?? DEFAULT_ENRICHMENT_TIMEOUT_MS);
  const pagesRequestedOverride = getArgValue("--pages");
  const processor = getArgValue("--processor") ?? "queued-full-scan-v1";
  const profile = getArgValue("--profile") ?? "standard";
  const maxRequestedTier = getArgValue("--max-tier");
  const runtimeFast = hasFlag("--runtime-fast");
  const onlySummarize = hasFlag("--summarize-only");
  const queueOnly = hasFlag("--queue-only");
  const aggregateTimings = hasFlag("--aggregate-timings");
  const argv = process.argv.slice(2);
  const positionalDomains: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (
      token === "--org" ||
      token === "--timeout-ms" ||
      token === "--enrichment-timeout-ms" ||
      token === "--domains" ||
      token === "--pages" ||
      token === "--processor" ||
      token === "--profile" ||
      token === "--max-tier"
    ) {
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      continue;
    }

    positionalDomains.push(token);
  }

  const explicitDomains = getArgValue("--domains");
  const parsedBatch = parseDomainBatchInput(explicitDomains ?? positionalDomains.join(" "));

  if (parsedBatch.valid.length === 0) {
    throw new Error("Provide at least one valid domain with --domains.");
  }

  if (onlySummarize && queueOnly) {
    throw new Error("Use either --summarize-only or --queue-only, not both.");
  }

  const results: Array<Record<string, unknown>> = [];

  for (const entry of parsedBatch.valid) {
    const domain = await ensureDomain({
      hostname: entry.domain,
      normalizedUrl: `https://${entry.domain}`,
      organizationId: orgId
    });

    let scanId: string;
    if (onlySummarize) {
      const latest = await queryOne<{ id: string; created_at: string; status: string }>(
        `
          select id, created_at, status
          from scans
          where organization_id = $1
            and domain_id = $2
            and scan_type = 'full'
            and status = any($3::text[])
          order by created_at desc
          limit 1
        `,
        [orgId, domain.id, ["completed", "failed", "canceled"]],
        { readOnly: true }
      );

      if (!latest) {
        results.push({
          domain: domain.hostname,
          pendingReason: "no_terminal_scan",
          scanId: null,
          surfaced: []
        });
        continue;
      }

      scanId = latest.id;
    } else if (queueOnly) {
      const queued = await queueScan({
        domain,
        maxRequestedTier,
        organizationId: orgId,
        pagesRequestedOverride: pagesRequestedOverride ? Number(pagesRequestedOverride) : null,
        processor,
        profile,
        runtimeFast
      });

      results.push({
        domain: domain.hostname,
        scanId: queued.id,
        queuedAt: queued.created_at,
        status: queued.status
      });

      continue;
    } else {
      const queued = await queueScan({
        domain,
        maxRequestedTier,
        organizationId: orgId,
        pagesRequestedOverride: pagesRequestedOverride ? Number(pagesRequestedOverride) : null,
        processor,
        profile,
        runtimeFast
      });

      scanId = queued.id;
      await waitForCompletion({
        hostname: domain.hostname,
        scanId,
        timeoutMs
      });
      await waitForSignalEnrichmentCompletion({
        hostname: domain.hostname,
        scanId,
        timeoutMs: enrichmentTimeoutMs
      }).catch(() => undefined);
    }

    const summary = await summarizeScan({
      hostname: domain.hostname,
      scanId
    });

    results.push({
      counts: summary.counts,
      domain: domain.hostname,
      scanId,
      scan: {
        completedAt: summary.scan.completedAt,
        createdAt: summary.scan.createdAt,
        endToEndDurationMs: diffMs(summary.scan.createdAt, summary.scan.completedAt),
        runDurationMs: diffMs(summary.scan.startedAt ?? summary.scan.createdAt, summary.scan.completedAt),
        startedAt: summary.scan.startedAt,
        status: summary.scan.status
      },
      scanOutcome: (summary.snapshot as Record<string, unknown> | null)?.scan_outcome ?? null,
      stopReason: (summary.snapshot as Record<string, unknown> | null)?.stop_reason_code ?? null,
      homepageStatus: (summary.snapshot as Record<string, unknown> | null)?.homepage_fetch_http_status ?? null,
      blocked: (summary.snapshot as Record<string, unknown> | null)?.blocked_flag ?? null,
      workflow: {
        actualMode: summary.workflow.actualMode,
        findingsReady: summary.workflow.findingsReady,
        mergedSignalsReady: summary.workflow.mergedSignalsReady,
        timings: summary.workflow.timings
      },
      surfaced: summary.surfaced
    });
  }

  if (aggregateTimings) {
    const mergedValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { timeToMergedSignalsMs?: unknown } } | undefined)?.timings;
        return typeof timings?.timeToMergedSignalsMs === "number" ? timings.timeToMergedSignalsMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const findingsValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { timeToFindingsMs?: unknown } } | undefined)?.timings;
        return typeof timings?.timeToFindingsMs === "number" ? timings.timeToFindingsMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const retrievalValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { nanoDocRetrievalDurationMs?: unknown } } | undefined)?.timings;
        return typeof timings?.nanoDocRetrievalDurationMs === "number" ? timings.nanoDocRetrievalDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const signalValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { nanoDocSignalsDurationMs?: unknown } } | undefined)?.timings;
        return typeof timings?.nanoDocSignalsDurationMs === "number" ? timings.nanoDocSignalsDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const endToEndValues = results
      .map((row) => {
        const scan = row.scan as { endToEndDurationMs?: unknown } | undefined;
        return typeof scan?.endToEndDurationMs === "number" ? scan.endToEndDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const runValues = results
      .map((row) => {
        const scan = row.scan as { runDurationMs?: unknown } | undefined;
        return typeof scan?.runDurationMs === "number" ? scan.runDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    console.log(
      JSON.stringify(
        {
          aggregateTimingSummary: {
            averageEndToEndDurationMs: getAverage(endToEndValues),
            averageRunDurationMs: getAverage(runValues),
            domains: results.length,
            medianEndToEndDurationMs: getMedian(endToEndValues),
            medianNanoDocRetrievalDurationMs: getMedian(retrievalValues),
            medianNanoDocSignalsDurationMs: getMedian(signalValues),
            medianRunDurationMs: getMedian(runValues),
            medianTimeToFindingsMs: getMedian(findingsValues),
            medianTimeToMergedSignalsMs: getMedian(mergedValues)
          },
          results
        },
        null,
        2
      )
    );
    return;
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
