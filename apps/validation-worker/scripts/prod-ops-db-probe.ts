import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query, queryOne } from "@website-signal-risk-scanner/db";

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const DEFAULT_SCAN_QUEUE_STALE_MINUTES = 10;
const DEFAULT_SYNTHETIC_SCAN_DOMAIN = "example.com";
const DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES = 15;
const VALIDATION_SETTINGS_KEY = "default";
const execFileAsync = promisify(execFile);

type SectionState = "ok" | "skipped" | "failing";

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
  if (status === "failing" || (status === "ok" && section.status !== "failing") || (status === "skipped" && section.status === "skipped")) {
    section.status = status;
  }
  section.details.push(detail);
}

function finding(findings: string[], section: Section, message: string) {
  findings.push(message);
  mark(section, "failing", message);
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
  const syntheticScanEnabled = getBooleanEnv("OPS_SYNTHETIC_SCAN_ENABLED", false);
  const syntheticScanDomain = process.env.OPS_SYNTHETIC_SCAN_DOMAIN?.trim() || DEFAULT_SYNTHETIC_SCAN_DOMAIN;
  const syntheticScanTimeoutMinutes = getNumberEnv("OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES", DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES);
  const requireScannerHeartbeat = getBooleanEnv("OPS_REQUIRE_SCANNER_HEARTBEAT", true);
  const requireValidationHeartbeat = getBooleanEnv("OPS_REQUIRE_VALIDATION_HEARTBEAT", true);
  const findings: string[] = [];
  const sections = {
    databaseAndBacklog: { details: [], status: "ok" as SectionState },
    workerHeartbeats: { details: [], status: "skipped" as SectionState },
    scannerQueueCanary: { details: [], status: "ok" as SectionState }
  };

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
      mark(sections.workerHeartbeats, "ok", `Scanner service heartbeat is fresh (${Math.round(heartbeatAgeMs / 60_000)}m old).`);
    }
  } else {
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
    finding(
      findings,
      sections.scannerQueueCanary,
      `${backlog.stale_queued_count} full scan(s) have been queued longer than ${scanQueueStaleMinutes}m; oldest queued at ${backlog.oldest_queued_at ?? "unknown"}.`
    );
  } else {
    mark(sections.databaseAndBacklog, "ok", "Direct database query succeeded.");
    mark(sections.scannerQueueCanary, "ok", `Queued full-scan backlog is clear (${backlog.queued_count} queued).`);
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

  const status: SectionState = findings.length === 0 ? "ok" : "failing";
  console.log(
    JSON.stringify(
      {
        status,
        answer: {
          areScansBeingPickedUp: sections.scannerQueueCanary.status === "ok",
          areWorkersAlive: sections.workerHeartbeats.status === "skipped" ? null : sections.workerHeartbeats.status === "ok",
          isAnythingStale: status === "failing"
        },
        sections,
        queuedFullScans: backlog?.queued_count ?? null,
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
