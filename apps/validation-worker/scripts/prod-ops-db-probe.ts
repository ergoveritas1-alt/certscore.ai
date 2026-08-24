import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import { reconcileOrphanedQueuedScans } from "../src/validation/repository";
import { ORPHANED_QUEUED_SCAN_DISPATCH_DEADLINE_MS } from "../src/validation/orphaned-queued-scan";

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const DEFAULT_NANO_SIGNAL_RETRY_WINDOW_MINUTES = 30;
const DEFAULT_NANO_SIGNAL_TERMINAL_ATTEMPT_LIMIT = 3;
const DEFAULT_EVENT_PRESSURE_WINDOW_MINUTES = 30;
const DEFAULT_LIFECYCLE_EVENTS_PER_MINUTE_LIMIT = 50;
const DEFAULT_LIFECYCLE_EVENT_CONSECUTIVE_MINUTES = 3;
const DEFAULT_NANO_FAILURES_PER_MINUTE_LIMIT = 5;
const DEFAULT_NANO_FAILURE_CONSECUTIVE_MINUTES = 2;
const DEFAULT_NANO_AMPLIFICATION_WINDOW_MINUTES = 10;
const DEFAULT_NANO_STARTED_TO_REQUESTED_RATIO_LIMIT = 5;
const DEFAULT_NANO_DURABLE_GENERATION_CLAIM_LIMIT = 3;
const DEFAULT_SCAN_QUEUE_STALE_MINUTES = 10;
const DEFAULT_SYNTHETIC_SCAN_DOMAIN = "ergoveritas.com";
const DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES = 15;
const VALIDATION_SETTINGS_KEY = "default";
const execFileAsync = promisify(execFile);

type SectionState = "ok" | "skipped" | "under_load" | "failing";

type Section = {
  details: string[];
  status: SectionState;
};

type ValidationSettingsRow = {
  last_worker_heartbeat_at: string | null;
  last_worker_host: string | null;
  pipeline_enabled: boolean;
};

type QueuedScanBacklogRow = {
  oldest_queued_at: string | null;
  queued_count: number;
  stale_queued_count: number;
};

type QueueSnapshotRow = {
  created_at: string | null;
  metadata_json: unknown;
};

type NanoSignalRetryLoopRow = {
  failure_count: number;
  first_seen_at: string;
  last_seen_at: string;
  request_count: number;
  scan_id: string;
  start_count: number;
};

type EventPressureMinuteRow = {
  lifecycle_event_count: number;
  minute: string;
  nano_failure_count: number;
};

type NanoSignalAmplificationRow = {
  request_count: number;
  start_count: number;
  started_to_requested_ratio: number;
};

type NanoSignalDurableGenerationLoopRow = {
  observed_claim_count: number;
  poll_count: number;
  requested_at: string;
  scan_id: string;
  start_count: number;
};

type ScannerEcsState = {
  detail: string;
  isRunning: boolean;
};

type ScannerHeartbeatEventRow = {
  created_at?: string | null;
  metadata_json?: unknown;
};

type WorkerHeartbeatRow = {
  host: string | null;
  last_heartbeat_at: string | null;
  worker_type: string;
};

type SyntheticScanRow = {
  completed_at: string | null;
  error_message: string | null;
  started_at: string | null;
  status: string;
};

function getBooleanEnv(name: string, defaultValue: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? ["1", "true", "yes", "on"].includes(value) : defaultValue;
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function mark(section: Section, status: SectionState, detail: string) {
  if (
    status === "failing" ||
    (status === "under_load" && section.status !== "failing") ||
    (status === "ok" && section.status !== "failing" && section.status !== "under_load") ||
    (status === "skipped" && section.status === "skipped")
  ) {
    section.status = status;
  }
  section.details.push(detail);
}

function finding(findings: string[], section: Section, message: string) {
  findings.push(message);
  mark(section, "failing", message);
}

function note(section: Section, detail: string) {
  section.details.push(detail);
}

function normalizeHeartbeatValue(value: unknown) {
  if (typeof value === "string") {
    return Number.isFinite(new Date(value).getTime()) ? value : null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  return null;
}

function getHeartbeatTimestamp(value: string | Date | null | undefined) {
  const normalizedValue = normalizeHeartbeatValue(value ?? null);
  return normalizedValue ? new Date(normalizedValue).getTime() : Number.NEGATIVE_INFINITY;
}

function getLegacyHeartbeatHost(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const host = (metadata as { host?: unknown }).host;
  return typeof host === "string" && host.trim().length > 0 ? host : null;
}

async function getLastScannerHeartbeat() {
  const [eventResult, heartbeatResult] = await Promise.allSettled([
    queryOne<ScannerHeartbeatEventRow>(
      `select created_at, metadata_json
         from scan_events
        where scan_id is null
          and event_type = $1
        order by created_at desc
        limit 1`,
      ["scanner.runtime_heartbeat"],
      { readOnly: true }
    ),
    query<WorkerHeartbeatRow>(
      `select worker_type, last_heartbeat_at, host
         from worker_heartbeats
        where worker_type = $1`,
      ["scanner"],
      { readOnly: true }
    )
  ]);
  const eventRow = eventResult.status === "fulfilled" ? eventResult.value : null;
  const eventHeartbeatAt = normalizeHeartbeatValue(eventRow?.created_at);
  const eventHost = getLegacyHeartbeatHost(eventRow?.metadata_json);
  const heartbeatRows = heartbeatResult.status === "fulfilled" ? heartbeatResult.value.rows : [];
  const newestHeartbeatRow = [...heartbeatRows]
    .filter((row) => normalizeHeartbeatValue(row.last_heartbeat_at))
    .sort((left, right) => getHeartbeatTimestamp(right.last_heartbeat_at) - getHeartbeatTimestamp(left.last_heartbeat_at))[0];
  const tableHeartbeatAt = normalizeHeartbeatValue(newestHeartbeatRow?.last_heartbeat_at);
  const tableHost = newestHeartbeatRow?.host ?? null;
  const eventHeartbeatMs = getHeartbeatTimestamp(eventHeartbeatAt);
  const tableHeartbeatMs = getHeartbeatTimestamp(tableHeartbeatAt);

  return {
    host: eventHeartbeatMs >= tableHeartbeatMs ? eventHost : tableHost,
    lastHeartbeatAt:
      eventHeartbeatMs >= tableHeartbeatMs
        ? eventHeartbeatAt
        : tableHeartbeatMs > Number.NEGATIVE_INFINITY
          ? tableHeartbeatAt
          : eventHeartbeatAt
  };
}

async function wakeScannerCapacity(findings: string[], section: Section, queuedCount: number) {
  if (queuedCount <= 0 || !getBooleanEnv("OPS_WAKE_SCANNER_ON_QUEUE", false)) {
    return;
  }

  const cluster = process.env.AWS_SCANNER_ECS_CLUSTER?.trim();
  const service = process.env.AWS_SCANNER_ECS_SERVICE?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-west-1";

  if (!cluster || !service) {
    finding(findings, section, "Full scans are queued, but scanner wake-up is missing AWS_SCANNER_ECS_CLUSTER/AWS_SCANNER_ECS_SERVICE.");
    return;
  }

  try {
    await execFileAsync("aws", ["ecs", "update-service", "--region", region, "--cluster", cluster, "--service", service, "--desired-count", "1"]);
    mark(section, "ok", `Scanner ECS service ${cluster}/${service} wake-up requested.`);
  } catch (error) {
    finding(findings, section, `Failed to wake scanner ECS service ${cluster}/${service}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getScannerEcsState(): Promise<ScannerEcsState> {
  const cluster = process.env.AWS_SCANNER_ECS_CLUSTER?.trim();
  const service = process.env.AWS_SCANNER_ECS_SERVICE?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-west-1";

  if (!cluster || !service) {
    return {
      detail: "Scanner ECS service is not configured.",
      isRunning: false
    };
  }

  try {
    const { stdout } = await execFileAsync("aws", [
      "ecs",
      "describe-services",
      "--region",
      region,
      "--cluster",
      cluster,
      "--services",
      service,
      "--output",
      "json"
    ]);
    const payload = JSON.parse(stdout) as {
      failures?: { reason?: string }[];
      services?: Array<{
        desiredCount?: number;
        pendingCount?: number;
        runningCount?: number;
        status?: string;
      }>;
    };
    const described = payload.services?.[0];
    const failure = payload.failures?.[0];

    if (!described) {
      return {
        detail: `Scanner ECS service ${cluster}/${service} was not described${failure?.reason ? `: ${failure.reason}` : "."}`,
        isRunning: false
      };
    }

    const desired = described.desiredCount ?? 0;
    const running = described.runningCount ?? 0;
    const pending = described.pendingCount ?? 0;
    const isRunning = described.status === "ACTIVE" && running > 0 && running >= desired && pending === 0;

    return {
      detail: `Scanner ECS service ${cluster}/${service} is ${described.status ?? "unknown"} (${running}/${desired} running, ${pending} pending).`,
      isRunning
    };
  } catch (error) {
    return {
      detail: `Scanner ECS service check failed: ${error instanceof Error ? error.message : String(error)}`,
      isRunning: false
    };
  }
}

function getSnapshotOldestQueuedAt(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const oldestQueuedAt = (metadata as { oldestQueuedAt?: unknown }).oldestQueuedAt;
  return typeof oldestQueuedAt === "string" && oldestQueuedAt.trim().length > 0 ? oldestQueuedAt : null;
}

async function getPreviousQueueSnapshot() {
  return queryOne<QueueSnapshotRow>(
    `select created_at::text as created_at, metadata_json
       from scan_events
      where scan_id is null
        and event_type = $1
      order by created_at desc
      limit 1`,
    ["ops.scanner_queue_snapshot"],
    { readOnly: true }
  );
}

async function getNanoSignalRetryLoops(windowMinutes: number, terminalAttemptLimit: number) {
  return query<NanoSignalRetryLoopRow>(
    `select
       scan_id::text as scan_id,
       count(*) filter (where event_type = 'signals.nano_doc_enrichment_started')::int as start_count,
       count(*) filter (where event_type = 'signals.nano_doc_enrichment_failed')::int as failure_count,
       count(*) filter (where event_type = 'signals.nano_doc_enrichment_requested')::int as request_count,
       min(created_at)::text as first_seen_at,
       max(created_at)::text as last_seen_at
     from scan_events
     where scan_id is not null
       and created_at >= now() - make_interval(mins => $1::int)
       and event_type in (
         'signals.nano_doc_enrichment_started',
         'signals.nano_doc_enrichment_failed',
         'signals.nano_doc_enrichment_requested'
       )
     group by scan_id
     having count(*) filter (where event_type = 'signals.nano_doc_enrichment_failed') > $2::int
     order by failure_count desc, last_seen_at desc
     limit 10`,
    [windowMinutes, terminalAttemptLimit],
    { readOnly: true }
  ).then((result) => result.rows);
}

async function getEventPressureMinuteRows(windowMinutes: number) {
  return query<EventPressureMinuteRow>(
    `select
       date_trunc('minute', created_at)::text as minute,
       count(*) filter (where scan_id is not null)::int as lifecycle_event_count,
       count(*) filter (
         where scan_id is not null
           and event_type = 'signals.nano_doc_enrichment_failed'
       )::int as nano_failure_count
     from scan_events
     where created_at >= now() - make_interval(mins => $1::int)
     group by date_trunc('minute', created_at)
     order by date_trunc('minute', created_at) asc`,
    [windowMinutes],
    { readOnly: true }
  ).then((result) => result.rows);
}

async function getNanoSignalAmplification(windowMinutes: number) {
  return queryOne<NanoSignalAmplificationRow>(
    `select
       count(*) filter (
         where event_type = 'signals.nano_doc_enrichment_started'
       )::int as start_count,
       count(*) filter (
         where event_type = 'signals.nano_doc_enrichment_requested'
       )::int as request_count,
       (
         count(*) filter (where event_type = 'signals.nano_doc_enrichment_started')::double precision
         / greatest(
             count(*) filter (where event_type = 'signals.nano_doc_enrichment_requested'),
             1
           )::double precision
       ) as started_to_requested_ratio
     from scan_events
     where scan_id is not null
       and created_at >= now() - make_interval(mins => $1::int)
       and event_type in (
         'signals.nano_doc_enrichment_started',
         'signals.nano_doc_enrichment_requested'
       )`,
    [windowMinutes],
    { readOnly: true }
  );
}

async function getNanoSignalDurableGenerationLoops(claimLimit: number) {
  return query<NanoSignalDurableGenerationLoopRow>(
    `select
       work_items.scan_id::text as scan_id,
       work_items.requested_at::text as requested_at,
       work_items.poll_count::int as poll_count,
       count(events.scan_id) filter (
         where events.event_type = 'signals.nano_doc_enrichment_started'
       )::int as start_count,
       (
         work_items.poll_count
         + count(events.scan_id) filter (
             where events.event_type = 'signals.nano_doc_enrichment_started'
           )
       )::int as observed_claim_count
     from nano_signal_work_items work_items
     left join scan_events events
       on events.scan_id = work_items.scan_id
      and events.created_at >= work_items.requested_at
      and events.event_type = 'signals.nano_doc_enrichment_started'
     group by work_items.scan_id, work_items.requested_at, work_items.poll_count
     having (
       work_items.poll_count
       + count(events.scan_id) filter (
           where events.event_type = 'signals.nano_doc_enrichment_started'
         )
     ) > $1::int
     order by observed_claim_count desc, work_items.requested_at asc
     limit 10`,
    [claimLimit],
    { readOnly: true }
  ).then((result) => result.rows);
}

function findConsecutiveMinuteThresholdBreach(
  rows: EventPressureMinuteRow[],
  count: (row: EventPressureMinuteRow) => number,
  threshold: number,
  requiredConsecutiveMinutes: number
) {
  let run: EventPressureMinuteRow[] = [];

  for (const row of rows) {
    if (count(row) < threshold) {
      run = [];
      continue;
    }

    const priorMinuteMs = run.length > 0 ? new Date(run[run.length - 1]!.minute).getTime() : null;
    const minuteMs = new Date(row.minute).getTime();
    run = priorMinuteMs !== null && minuteMs - priorMinuteMs === 60_000 ? [...run, row] : [row];

    if (run.length >= requiredConsecutiveMinutes) {
      return run.slice(-requiredConsecutiveMinutes);
    }
  }

  return [];
}

async function recordQueueSnapshot(backlog: QueuedScanBacklogRow, scanQueueStaleMinutes: number, status: SectionState) {
  await query(
    `insert into scan_events (event_type, message, metadata_json)
     values ($1, $2, $3::jsonb)`,
    [
      "ops.scanner_queue_snapshot",
      `Ops queue snapshot: ${backlog.queued_count} queued, ${backlog.stale_queued_count} stale.`,
      JSON.stringify({
        oldestQueuedAt: backlog.oldest_queued_at,
        queuedCount: backlog.queued_count,
        staleQueuedCount: backlog.stale_queued_count,
        staleMinutes: scanQueueStaleMinutes,
        status
      })
    ]
  );
}

async function recordQueueSnapshotBestEffort(section: Section, backlog: QueuedScanBacklogRow, scanQueueStaleMinutes: number, status: SectionState) {
  try {
    await recordQueueSnapshot(backlog, scanQueueStaleMinutes, status);
  } catch (error) {
    note(section, `Queue snapshot persistence skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function queueSyntheticScan(baseUrl: string, domain: string) {
  const response = await fetch(new URL("/api/full-scan", baseUrl), {
    body: JSON.stringify({ domain }),
    headers: {
      "Content-Type": "application/json",
      "X-CertScore-Scan-Source": "ops-synthetic-canary"
    },
    method: "POST"
  });
  const body = (await response.json().catch(() => null)) as { scanId?: string | null } | null;

  if (!response.ok || !body?.scanId) {
    throw new Error(`Synthetic scan queue failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body.scanId;
}

async function waitForSyntheticScan(scanId: string, timeoutMinutes: number) {
  const deadlineMs = Date.now() + timeoutMinutes * 60_000;

  while (Date.now() < deadlineMs) {
    const scan = await queryOne<SyntheticScanRow>(
      `select status, started_at::text as started_at, completed_at::text as completed_at, error_message
         from scans
        where id = $1`,
      [scanId],
      { readOnly: true }
    );

    if (!scan) {
      throw new Error(`Synthetic scan ${scanId} disappeared from the database.`);
    }

    if (scan.status === "completed") {
      return scan;
    }

    if (scan.status === "failed") {
      throw new Error(`Synthetic scan ${scanId} failed: ${scan.error_message ?? "no error message"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  throw new Error(`Synthetic scan ${scanId} did not complete within ${timeoutMinutes}m.`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for the AWS-side prod DB probe.");
  }

  const baseUrl = process.env.OPS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const staleThresholdMs = getNumberEnv("OPS_HEARTBEAT_STALE_MINUTES", DEFAULT_HEARTBEAT_STALE_MINUTES) * 60_000;
  const scanQueueStaleMinutes = getNumberEnv("OPS_SCAN_QUEUE_STALE_MINUTES", DEFAULT_SCAN_QUEUE_STALE_MINUTES);
  const nanoSignalRetryWindowMinutes = getNumberEnv(
    "OPS_NANO_SIGNAL_RETRY_WINDOW_MINUTES",
    DEFAULT_NANO_SIGNAL_RETRY_WINDOW_MINUTES
  );
  const nanoSignalTerminalAttemptLimit = getNumberEnv(
    "OPS_NANO_SIGNAL_TERMINAL_ATTEMPT_LIMIT",
    DEFAULT_NANO_SIGNAL_TERMINAL_ATTEMPT_LIMIT
  );
  const eventPressureWindowMinutes = getNumberEnv(
    "OPS_EVENT_PRESSURE_WINDOW_MINUTES",
    DEFAULT_EVENT_PRESSURE_WINDOW_MINUTES
  );
  const lifecycleEventsPerMinuteLimit = getNumberEnv(
    "OPS_LIFECYCLE_EVENTS_PER_MINUTE_LIMIT",
    DEFAULT_LIFECYCLE_EVENTS_PER_MINUTE_LIMIT
  );
  const lifecycleEventConsecutiveMinutes = getNumberEnv(
    "OPS_LIFECYCLE_EVENT_CONSECUTIVE_MINUTES",
    DEFAULT_LIFECYCLE_EVENT_CONSECUTIVE_MINUTES
  );
  const nanoFailuresPerMinuteLimit = getNumberEnv(
    "OPS_NANO_FAILURES_PER_MINUTE_LIMIT",
    DEFAULT_NANO_FAILURES_PER_MINUTE_LIMIT
  );
  const nanoFailureConsecutiveMinutes = getNumberEnv(
    "OPS_NANO_FAILURE_CONSECUTIVE_MINUTES",
    DEFAULT_NANO_FAILURE_CONSECUTIVE_MINUTES
  );
  const nanoAmplificationWindowMinutes = getNumberEnv(
    "OPS_NANO_AMPLIFICATION_WINDOW_MINUTES",
    DEFAULT_NANO_AMPLIFICATION_WINDOW_MINUTES
  );
  const nanoStartedToRequestedRatioLimit = getNumberEnv(
    "OPS_NANO_STARTED_TO_REQUESTED_RATIO_LIMIT",
    DEFAULT_NANO_STARTED_TO_REQUESTED_RATIO_LIMIT
  );
  const nanoDurableGenerationClaimLimit = getNumberEnv(
    "OPS_NANO_DURABLE_GENERATION_CLAIM_LIMIT",
    DEFAULT_NANO_DURABLE_GENERATION_CLAIM_LIMIT
  );
  const syntheticScanEnabled = getBooleanEnv("OPS_SYNTHETIC_SCAN_ENABLED", false);
  const syntheticScanDomain = process.env.OPS_SYNTHETIC_SCAN_DOMAIN?.trim() || DEFAULT_SYNTHETIC_SCAN_DOMAIN;
  const syntheticScanTimeoutMinutes = getNumberEnv("OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES", DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES);
  const requireScannerHeartbeat = getBooleanEnv("OPS_REQUIRE_SCANNER_HEARTBEAT", false);
  const requireValidationHeartbeat = getBooleanEnv("OPS_REQUIRE_VALIDATION_HEARTBEAT", true);
  const repairOrphanedQueuedScans = getBooleanEnv("OPS_REPAIR_ORPHANED_QUEUED_SCANS", true);
  const findings: string[] = [];
  let scannerHeartbeatHealthy = false;
  const sections = {
    databaseAndBacklog: { details: [], status: "ok" as SectionState },
    nanoSignalEnrichment: { details: [], status: "ok" as SectionState },
    workerHeartbeats: { details: [], status: "skipped" as SectionState },
    scannerQueueCanary: { details: [], status: "ok" as SectionState }
  };

  const repairedOrphanedScanIds = repairOrphanedQueuedScans
    ? await reconcileOrphanedQueuedScans({
        limit: 20,
        minAgeMs: Math.max(
          ORPHANED_QUEUED_SCAN_DISPATCH_DEADLINE_MS,
          scanQueueStaleMinutes * 60_000
        ),
        source: "prod-ops-db-probe"
      })
    : [];
  if (repairedOrphanedScanIds.length > 0) {
    note(
      sections.scannerQueueCanary,
      `Marked ${repairedOrphanedScanIds.length} orphaned queued scan(s) failed after the Lambda dispatch deadline.`
    );
  }

  const validationSettings = await queryOne<ValidationSettingsRow>(
    `select last_worker_heartbeat_at, last_worker_host, pipeline_enabled
       from validation_settings
      where singleton_key = $1`,
    [VALIDATION_SETTINGS_KEY],
    { readOnly: true }
  );

  if (!validationSettings) {
    finding(findings, sections.workerHeartbeats, "Validation settings row is missing.");
  } else if (validationSettings.pipeline_enabled && requireValidationHeartbeat) {
    const heartbeatAt = validationSettings.last_worker_heartbeat_at;
    const heartbeatAgeMs = heartbeatAt ? Date.now() - new Date(heartbeatAt).getTime() : Number.POSITIVE_INFINITY;

    if (!heartbeatAt || heartbeatAgeMs > staleThresholdMs) {
      finding(
        findings,
        sections.workerHeartbeats,
        `Validation worker heartbeat is stale or missing (${Number.isFinite(heartbeatAgeMs) ? Math.round(heartbeatAgeMs / 60_000) : "unknown"}m old, host ${validationSettings.last_worker_host ?? "unknown"}).`
      );
    } else {
      mark(sections.workerHeartbeats, "ok", `Validation worker heartbeat is fresh (${Math.round(heartbeatAgeMs / 60_000)}m old).`);
    }
  } else {
    mark(sections.workerHeartbeats, "skipped", requireValidationHeartbeat ? "Validation pipeline is disabled." : "Validation heartbeat freshness is disabled.");
  }

  const nanoSignalRetryLoops = await getNanoSignalRetryLoops(
    nanoSignalRetryWindowMinutes,
    nanoSignalTerminalAttemptLimit
  );
  if (nanoSignalRetryLoops.length > 0) {
    for (const retryLoop of nanoSignalRetryLoops) {
      finding(
        findings,
        sections.nanoSignalEnrichment,
        `Nano signal enrichment retry loop detected for scan ${retryLoop.scan_id}: ${retryLoop.failure_count} terminal failures, ${retryLoop.start_count} starts, and ${retryLoop.request_count} requests between ${retryLoop.first_seen_at} and ${retryLoop.last_seen_at}.`
      );
    }
  } else {
    mark(
      sections.nanoSignalEnrichment,
      "ok",
      `No scan exceeded ${nanoSignalTerminalAttemptLimit} Nano terminal failures in the last ${nanoSignalRetryWindowMinutes}m.`
    );
  }

  const [eventPressureMinuteRows, nanoSignalAmplification, nanoSignalDurableGenerationLoops] = await Promise.all([
    getEventPressureMinuteRows(eventPressureWindowMinutes),
    getNanoSignalAmplification(nanoAmplificationWindowMinutes),
    getNanoSignalDurableGenerationLoops(nanoDurableGenerationClaimLimit)
  ]);
  const lifecycleEventBreach = findConsecutiveMinuteThresholdBreach(
    eventPressureMinuteRows,
    (row) => row.lifecycle_event_count,
    lifecycleEventsPerMinuteLimit,
    lifecycleEventConsecutiveMinutes
  );
  const nanoFailureBreach = findConsecutiveMinuteThresholdBreach(
    eventPressureMinuteRows,
    (row) => row.nano_failure_count,
    nanoFailuresPerMinuteLimit,
    nanoFailureConsecutiveMinutes
  );

  if (lifecycleEventBreach.length > 0) {
    finding(
      findings,
      sections.nanoSignalEnrichment,
      `Scan-lifecycle event pressure exceeded ${lifecycleEventsPerMinuteLimit}/minute for ${lifecycleEventConsecutiveMinutes} consecutive minutes (${lifecycleEventBreach.map((row) => `${row.minute}: ${row.lifecycle_event_count}`).join(", ")}).`
    );
  } else {
    mark(
      sections.nanoSignalEnrichment,
      "ok",
      `Scan-lifecycle event pressure stayed below ${lifecycleEventsPerMinuteLimit}/minute for ${lifecycleEventConsecutiveMinutes} consecutive minutes in the last ${eventPressureWindowMinutes}m.`
    );
  }

  if (nanoFailureBreach.length > 0) {
    finding(
      findings,
      sections.nanoSignalEnrichment,
      `Nano terminal failures reached ${nanoFailuresPerMinuteLimit}/minute for ${nanoFailureConsecutiveMinutes} consecutive minutes (${nanoFailureBreach.map((row) => `${row.minute}: ${row.nano_failure_count}`).join(", ")}).`
    );
  } else {
    mark(
      sections.nanoSignalEnrichment,
      "ok",
      `Nano terminal failures stayed below ${nanoFailuresPerMinuteLimit}/minute for ${nanoFailureConsecutiveMinutes} consecutive minutes in the last ${eventPressureWindowMinutes}m.`
    );
  }

  if (
    nanoSignalAmplification &&
    nanoSignalAmplification.started_to_requested_ratio > nanoStartedToRequestedRatioLimit
  ) {
    finding(
      findings,
      sections.nanoSignalEnrichment,
      `Nano start amplification exceeded ${nanoStartedToRequestedRatioLimit}:1 over ${nanoAmplificationWindowMinutes}m (${nanoSignalAmplification.start_count} starts / ${nanoSignalAmplification.request_count} requests; ratio ${nanoSignalAmplification.started_to_requested_ratio.toFixed(2)}:1).`
    );
  } else {
    mark(
      sections.nanoSignalEnrichment,
      "ok",
      `Nano start amplification stayed at or below ${nanoStartedToRequestedRatioLimit}:1 over ${nanoAmplificationWindowMinutes}m (${nanoSignalAmplification?.start_count ?? 0} starts / ${nanoSignalAmplification?.request_count ?? 0} requests).`
    );
  }

  if (nanoSignalDurableGenerationLoops.length > 0) {
    for (const loop of nanoSignalDurableGenerationLoops) {
      finding(
        findings,
        sections.nanoSignalEnrichment,
        `Nano durable work generation for scan ${loop.scan_id} exceeded ${nanoDurableGenerationClaimLimit} observed claims without changing generation (${loop.observed_claim_count} claims: ${loop.start_count} starts + poll count ${loop.poll_count}; requested ${loop.requested_at}).`
      );
    }
  } else {
    mark(
      sections.nanoSignalEnrichment,
      "ok",
      `No active Nano durable work generation exceeded ${nanoDurableGenerationClaimLimit} observed claims.`
    );
  }

  if (requireScannerHeartbeat) {
    const scannerHeartbeat = await getLastScannerHeartbeat();
    const heartbeatAgeMs = scannerHeartbeat.lastHeartbeatAt
      ? Date.now() - new Date(scannerHeartbeat.lastHeartbeatAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (!scannerHeartbeat.lastHeartbeatAt || heartbeatAgeMs > staleThresholdMs) {
      finding(
        findings,
        sections.workerHeartbeats,
        `Scanner service heartbeat is stale or missing (${Number.isFinite(heartbeatAgeMs) ? Math.round(heartbeatAgeMs / 60_000) : "unknown"}m old, host ${scannerHeartbeat.host ?? "unknown"}).`
      );
    } else {
      scannerHeartbeatHealthy = true;
      mark(sections.workerHeartbeats, "ok", `Scanner service heartbeat is fresh (${Math.round(heartbeatAgeMs / 60_000)}m old).`);
    }
  } else {
    scannerHeartbeatHealthy = true;
    mark(sections.workerHeartbeats, "skipped", "Scanner heartbeat freshness is disabled.");
  }

  const backlog = await queryOne<QueuedScanBacklogRow>(
    `
      select
        count(*) filter (where status = 'queued')::int as queued_count,
        count(*) filter (where status = 'queued' and created_at < now() - $1::interval)::int as stale_queued_count,
        min(created_at) filter (where status = 'queued')::text as oldest_queued_at
      from scans
      where scan_type = 'full'
        and status = 'queued'
    `,
    [`${scanQueueStaleMinutes} minutes`],
    { readOnly: true }
  );

  if (!backlog) {
    finding(findings, sections.databaseAndBacklog, "Queued full-scan backlog query returned no row.");
  } else if (backlog.stale_queued_count > 0) {
    const [scannerEcsState, previousSnapshot] = await Promise.all([getScannerEcsState(), getPreviousQueueSnapshot()]);
    const previousOldestQueuedAt = getSnapshotOldestQueuedAt(previousSnapshot?.metadata_json);
    const oldestQueuedScanIsMoving = !previousOldestQueuedAt || previousOldestQueuedAt !== backlog.oldest_queued_at;
    const backlogMessage = `${backlog.stale_queued_count} full scan(s) have been queued longer than ${scanQueueStaleMinutes}m; oldest queued at ${
      backlog.oldest_queued_at ?? "unknown"
    }.`;

    if (!scannerHeartbeatHealthy) {
      finding(findings, sections.scannerQueueCanary, `${backlogMessage} Scanner heartbeat is stale.`);
    } else if (!scannerEcsState.isRunning) {
      finding(findings, sections.scannerQueueCanary, `${backlogMessage} ${scannerEcsState.detail}`);
    } else if (!oldestQueuedScanIsMoving) {
      finding(
        findings,
        sections.scannerQueueCanary,
        `${backlogMessage} Oldest queued scan has not moved since previous monitor snapshot at ${previousSnapshot?.created_at ?? "unknown"}.`
      );
    } else {
      mark(sections.scannerQueueCanary, "under_load", `${backlogMessage} Scanner is running, so this is classified as under load.`);
      note(sections.scannerQueueCanary, scannerEcsState.detail);
    }
    await recordQueueSnapshotBestEffort(
      sections.scannerQueueCanary,
      backlog,
      scanQueueStaleMinutes,
      findings.length > 0 ? "failing" : sections.scannerQueueCanary.status
    );
  } else {
    mark(sections.databaseAndBacklog, "ok", "Direct database query succeeded.");
    mark(sections.scannerQueueCanary, "ok", `Queued full-scan backlog is clear (${backlog.queued_count} queued).`);
    await recordQueueSnapshotBestEffort(sections.scannerQueueCanary, backlog, scanQueueStaleMinutes, "ok");
  }

  if (backlog) {
    await wakeScannerCapacity(findings, sections.scannerQueueCanary, backlog.queued_count);
  }

  if (syntheticScanEnabled) {
    try {
      const scanId = await queueSyntheticScan(baseUrl, syntheticScanDomain);
      await wakeScannerCapacity(findings, sections.scannerQueueCanary, 1);
      await waitForSyntheticScan(scanId, syntheticScanTimeoutMinutes);
      mark(sections.scannerQueueCanary, "ok", `Synthetic homepage scan completed for ${syntheticScanDomain}.`);
    } catch (error) {
      finding(findings, sections.scannerQueueCanary, `Synthetic homepage scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const status: SectionState = findings.length > 0 ? "failing" : sections.scannerQueueCanary.status === "under_load" ? "under_load" : "ok";
  console.log(
    JSON.stringify(
      {
        status,
        answer: {
          areScansBeingPickedUp: sections.scannerQueueCanary.status === "ok" || sections.scannerQueueCanary.status === "under_load",
          areWorkersAlive: sections.workerHeartbeats.status === "skipped" ? null : sections.workerHeartbeats.status === "ok",
          isAnythingStale: status === "failing" || status === "under_load"
        },
        sections,
        queuedFullScans: backlog?.queued_count ?? null,
        repairedOrphanedQueuedScans: repairedOrphanedScanIds.length,
        nanoSignalRetryLoopCount: nanoSignalRetryLoops.length,
        nanoSignalDurableGenerationLoopCount: nanoSignalDurableGenerationLoops.length,
        nanoSignalStartedToRequestedRatio: nanoSignalAmplification?.started_to_requested_ratio ?? null,
        syntheticScanEnabled,
        validationHeartbeatAt: validationSettings?.last_worker_heartbeat_at ?? null
      },
      null,
      2
    )
  );

  if (findings.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(`AWS-side prod DB probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
