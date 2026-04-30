import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query, queryOne } from "../packages/db/src";
import { createGmailTransport, getGmailConfig } from "../apps/web/server/email/gmail";

const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_SCAN_QUEUE_STALE_MINUTES = 10;
const DEFAULT_SYNTHETIC_SCAN_DOMAIN = "example.com";
const DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES = 15;
const VALIDATION_SETTINGS_KEY = "default";
const execFileAsync = promisify(execFile);

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

type SyntheticScanRow = {
  completed_at: string | null;
  error_message: string | null;
  started_at: string | null;
  status: string;
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

type ScannerServiceHeartbeatSnapshot = {
  errorMessage: string | null;
  host: string | null;
  lastHeartbeatAt: string | null;
};

function getBooleanEnv(name: string, defaultValue: boolean) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

function getNumberEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function normalizeHeartbeatValue(value: unknown) {
  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? value : null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? value.toISOString() : null;
  }

  return null;
}

function getHeartbeatTimestamp(value: string | Date | null | undefined) {
  const normalizedValue = normalizeHeartbeatValue(value ?? null);

  if (!normalizedValue) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(normalizedValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getLegacyHeartbeatHost(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const host = (metadata as { host?: unknown }).host;
  return typeof host === "string" && host.trim().length > 0 ? host : null;
}

async function getLastScannerServiceHeartbeat(): Promise<ScannerServiceHeartbeatSnapshot> {
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

  const eventErrorMessage =
    eventResult.status === "rejected"
      ? eventResult.reason instanceof Error
        ? eventResult.reason.message
        : "Unknown scan_events heartbeat error."
      : null;
  const heartbeatErrorMessage =
    heartbeatResult.status === "rejected"
      ? heartbeatResult.reason instanceof Error
        ? heartbeatResult.reason.message
        : "Unknown worker_heartbeats error."
      : null;
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
  const lastHeartbeatAt =
    eventHeartbeatMs >= tableHeartbeatMs
      ? eventHeartbeatAt
      : tableHeartbeatMs > Number.NEGATIVE_INFINITY
        ? tableHeartbeatAt
        : eventHeartbeatAt;

  if (lastHeartbeatAt) {
    return {
      errorMessage: null,
      host: eventHeartbeatMs >= tableHeartbeatMs ? eventHost : tableHost,
      lastHeartbeatAt
    };
  }

  if (eventErrorMessage && heartbeatErrorMessage) {
    return {
      errorMessage: `Scanner health check failed: ${eventErrorMessage}; table fallback also failed: ${heartbeatErrorMessage}`,
      host: null,
      lastHeartbeatAt: null
    };
  }

  return {
    errorMessage: null,
    host: null,
    lastHeartbeatAt: null
  };
}

function getAlertRecipients() {
  return (process.env.OPS_ALERT_TO_EMAIL ?? process.env.FEEDBACK_TO_EMAIL ?? process.env.GMAIL_SMTP_USER ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function sendAlertEmail(subject: string, lines: string[]) {
  const gmailConfig = getGmailConfig();
  const recipients = getAlertRecipients();

  if (!gmailConfig || recipients.length === 0) {
    return false;
  }

  const transporter = createGmailTransport(gmailConfig);
  await transporter.sendMail({
    from: `"CertScore.ai Ops Monitor" <${gmailConfig.fromEmail}>`,
    subject,
    text: lines.join("\n"),
    to: recipients.join(", ")
  });

  return true;
}

async function checkHttpEndpoint(input: {
  findings: string[];
  label: string;
  timeoutMs?: number;
  url: string;
  validateJson?: (value: unknown) => string | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);

  try {
    const response = await fetch(input.url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
        "User-Agent": "CertScore-Ops-Monitor/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      input.findings.push(`${input.label} returned HTTP ${response.status}.`);
      return;
    }

    if (input.validateJson) {
      const payload = await response.json().catch((error) => {
        input.findings.push(`${input.label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });

      if (payload !== null) {
        const validationError = input.validateJson(payload);
        if (validationError) {
          input.findings.push(`${input.label} failed validation: ${validationError}`);
        }
      }
    }
  } catch (error) {
    input.findings.push(`${input.label} request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkQueuedScanBacklog(input: { findings: string[]; staleMinutes: number }) {
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
    [`${input.staleMinutes} minutes`],
    { readOnly: true }
  );

  if (!backlog) {
    input.findings.push("Queued full-scan backlog query returned no row.");
    return;
  }

  if (backlog.stale_queued_count > 0) {
    input.findings.push(
      `${backlog.stale_queued_count} full scan(s) have been queued longer than ${input.staleMinutes}m; oldest queued at ${
        backlog.oldest_queued_at ?? "unknown"
      }.`
    );
  }

  return backlog;
}

async function wakeScannerCapacity(input: { findings: string[]; queuedCount: number }) {
  if (input.queuedCount <= 0 || !getBooleanEnv("OPS_WAKE_SCANNER_ON_QUEUE", false)) {
    return;
  }

  const cluster = process.env.AWS_SCANNER_ECS_CLUSTER?.trim();
  const service = process.env.AWS_SCANNER_ECS_SERVICE?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-west-1";

  if (!cluster || !service) {
    input.findings.push("Full scans are queued, but OPS_WAKE_SCANNER_ON_QUEUE is enabled without AWS_SCANNER_ECS_CLUSTER/AWS_SCANNER_ECS_SERVICE.");
    return;
  }

  try {
    await execFileAsync("aws", [
      "ecs",
      "update-service",
      "--region",
      region,
      "--cluster",
      cluster,
      "--service",
      service,
      "--desired-count",
      "1"
    ]);
  } catch (error) {
    input.findings.push(`Failed to wake scanner ECS service ${cluster}/${service}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function queueSyntheticScan(input: { baseUrl: string; domain: string }) {
  const response = await fetch(new URL("/api/full-scan", input.baseUrl), {
    body: JSON.stringify({ domain: input.domain }),
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

async function waitForSyntheticScan(input: { scanId: string; timeoutMinutes: number }) {
  const deadlineMs = Date.now() + input.timeoutMinutes * 60_000;

  while (Date.now() < deadlineMs) {
    const scan = await queryOne<SyntheticScanRow>(
      `select status, started_at::text as started_at, completed_at::text as completed_at, error_message
         from scans
        where id = $1`,
      [input.scanId],
      { readOnly: true }
    );

    if (!scan) {
      throw new Error(`Synthetic scan ${input.scanId} disappeared from the database.`);
    }

    if (scan.status === "completed") {
      return scan;
    }

    if (scan.status === "failed") {
      throw new Error(`Synthetic scan ${input.scanId} failed: ${scan.error_message ?? "no error message"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  throw new Error(`Synthetic scan ${input.scanId} did not complete within ${input.timeoutMinutes}m.`);
}

async function runSyntheticScanCheck(input: { baseUrl: string; domain: string; findings: string[]; timeoutMinutes: number }) {
  try {
    const scanId = await queueSyntheticScan({ baseUrl: input.baseUrl, domain: input.domain });
    await wakeScannerCapacity({
      findings: input.findings,
      queuedCount: 1
    });
    await waitForSyntheticScan({ scanId, timeoutMinutes: input.timeoutMinutes });
  } catch (error) {
    input.findings.push(`Synthetic homepage scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const environment = process.env.OPS_ALERT_ENVIRONMENT?.trim() || DEFAULT_ENVIRONMENT;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running the ops monitor.");
  }
  const staleMinutes = Number(process.env.OPS_HEARTBEAT_STALE_MINUTES ?? DEFAULT_HEARTBEAT_STALE_MINUTES);
  const baseUrl = process.env.OPS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const requireScannerHeartbeat = getBooleanEnv("OPS_REQUIRE_SCANNER_HEARTBEAT", true);
  const requireValidationHeartbeat = getBooleanEnv("OPS_REQUIRE_VALIDATION_HEARTBEAT", true);
  const scanQueueStaleMinutes = getNumberEnv("OPS_SCAN_QUEUE_STALE_MINUTES", DEFAULT_SCAN_QUEUE_STALE_MINUTES);
  const syntheticScanEnabled = getBooleanEnv("OPS_SYNTHETIC_SCAN_ENABLED", false);
  const syntheticScanDomain = process.env.OPS_SYNTHETIC_SCAN_DOMAIN?.trim() || DEFAULT_SYNTHETIC_SCAN_DOMAIN;
  const syntheticScanTimeoutMinutes = getNumberEnv("OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES", DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES);
  const staleThresholdMs = staleMinutes * 60_000;
  const findings: string[] = [];
  process.env.DATABASE_URL = databaseUrl;

  await checkHttpEndpoint({
    findings,
    label: "Web health",
    url: new URL("/api/health", baseUrl).toString(),
    validateJson: (value) => {
      const status = (value as { status?: unknown } | null)?.status;
      return status === "ok" ? null : `expected status ok, got ${String(status)}`;
    }
  });

  await checkHttpEndpoint({
    findings,
    label: "Database health",
    url: new URL("/api/health/database", baseUrl).toString(),
    validateJson: (value) => {
      const ok = (value as { ok?: unknown } | null)?.ok;
      return ok === true ? null : `expected ok true, got ${String(ok)}`;
    }
  });

  let validationSettings: ValidationSettingsRow | null = null;
  try {
    validationSettings = await queryOne<ValidationSettingsRow>(
      `
        select last_worker_heartbeat_at, last_worker_host, pipeline_enabled
        from validation_settings
        where singleton_key = $1
      `,
      [VALIDATION_SETTINGS_KEY],
      { readOnly: true }
    );
  } catch (error) {
    findings.push(`Validation settings query failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!validationSettings) {
    findings.push("Validation settings row is missing.");
  } else if (validationSettings.pipeline_enabled && requireValidationHeartbeat) {
    if (!validationSettings.last_worker_heartbeat_at) {
      findings.push("Validation worker heartbeat is missing.");
    } else {
      const heartbeatAgeMs = Date.now() - new Date(validationSettings.last_worker_heartbeat_at).getTime();
      if (heartbeatAgeMs > staleThresholdMs) {
        findings.push(
          `Validation worker heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${validationSettings.last_worker_host ?? "unknown"}).`
        );
      }
    }
  }

  if (requireScannerHeartbeat) {
    const scannerHeartbeat = await getLastScannerServiceHeartbeat();

    if (scannerHeartbeat.errorMessage) {
      findings.push(scannerHeartbeat.errorMessage);
    } else if (!scannerHeartbeat.lastHeartbeatAt) {
      findings.push("Scanner service heartbeat is missing.");
    } else {
      const heartbeatAgeMs = Date.now() - new Date(scannerHeartbeat.lastHeartbeatAt).getTime();
      if (heartbeatAgeMs > staleThresholdMs) {
        findings.push(
          `Scanner service heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${scannerHeartbeat.host ?? "unknown"}).`
        );
      }
    }
  }

  const scanBacklog = await checkQueuedScanBacklog({
    findings,
    staleMinutes: scanQueueStaleMinutes
  }).catch((error) => {
    findings.push(`Queued full-scan backlog query failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });

  if (scanBacklog) {
    await wakeScannerCapacity({
      findings,
      queuedCount: scanBacklog.queued_count
    });
  }

  if (syntheticScanEnabled) {
    await runSyntheticScanCheck({
      baseUrl,
      domain: syntheticScanDomain,
      findings,
      timeoutMinutes: syntheticScanTimeoutMinutes
    });
  }

  if (findings.length === 0) {
    console.log(
      JSON.stringify(
        {
          environment,
          baseUrl,
          status: "ok",
          queuedFullScans: scanBacklog?.queued_count ?? null,
          syntheticScanEnabled,
          validationHeartbeatAt: validationSettings?.last_worker_heartbeat_at ?? null
        },
        null,
        2
      )
    );
    return;
  }

  const subject = `[CertScore.ai Ops] ${environment} worker alert`;
  const lines = [
    `Environment: ${environment}`,
    "",
    "Findings:",
    ...findings.map((finding) => `- ${finding}`)
  ];

  const sent = await sendAlertEmail(subject, lines);
  console.error(lines.join("\n"));

  if (!sent) {
    console.error("Alert email was not sent because Gmail sender config or OPS_ALERT_TO_EMAIL is missing.");
  }

  process.exit(1);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Ops monitor failed: ${message}`);
  process.exit(1);
});
