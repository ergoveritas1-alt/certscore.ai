import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query, queryOne } from "../packages/db/src";
import { createGmailTransport, getGmailConfig } from "../apps/web/server/email/gmail";

const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_SCAN_QUEUE_STALE_MINUTES = 10;
const DEFAULT_STALE_RUNNING_SCAN_MINUTES = 6;
const DEFAULT_STALE_RUNNING_SCAN_EVENT_MINUTES = 5;
const DEFAULT_STALE_RUNNING_SCAN_REPAIR_LIMIT = 25;
const DEFAULT_SYNTHETIC_SCAN_DOMAIN = "example.com";
const DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES = 15;
const VALIDATION_SETTINGS_KEY = "default";
const execFileAsync = promisify(execFile);

type SectionState = "ok" | "skipped" | "failing";

type MonitorSection = {
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

type SyntheticScanRow = {
  completed_at: string | null;
  error_message: string | null;
  started_at: string | null;
  status: string;
};

type StaleRunningScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  domain_id: string | null;
  error_message: string | null;
  id: string;
  latest_event_at: string | null;
  latest_event_message: string | null;
  organization_id: string | null;
  run_age_minutes: number | null;
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

function createSections() {
  return {
    publicWeb: { details: [], status: "ok" },
    ecsServices: { details: [], status: "skipped" },
    databaseAndBacklog: { details: [], status: "skipped" },
    workerHeartbeats: { details: [], status: "skipped" },
    scannerQueueCanary: { details: [], status: "skipped" }
  } satisfies Record<string, MonitorSection>;
}

function markSection(section: MonitorSection, status: SectionState, detail: string) {
  if (status === "failing" || (status === "ok" && section.status !== "failing") || (status === "skipped" && section.status === "skipped")) {
    section.status = status;
  }
  section.details.push(detail);
}

function addFinding(input: { findings: string[]; section: MonitorSection; message: string }) {
  input.findings.push(input.message);
  markSection(input.section, "failing", input.message);
}

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
  section: MonitorSection;
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
      addFinding({
        findings: input.findings,
        section: input.section,
        message: `${input.label} returned HTTP ${response.status}.`
      });
      return;
    }

    if (input.validateJson) {
      const payload = await response.json().catch((error) => {
        addFinding({
          findings: input.findings,
          section: input.section,
          message: `${input.label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`
        });
        return null;
      });

      if (payload !== null) {
        const validationError = input.validateJson(payload);
        if (validationError) {
          addFinding({
            findings: input.findings,
            section: input.section,
            message: `${input.label} failed validation: ${validationError}`
          });
        }
      }
    }

    if (!input.findings.some((finding) => finding.startsWith(`${input.label} `))) {
      markSection(input.section, "ok", `${input.label} returned healthy.`);
    }
  } catch (error) {
    addFinding({
      findings: input.findings,
      section: input.section,
      message: `${input.label} request failed: ${error instanceof Error ? error.message : String(error)}`
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getEcsServiceTargets() {
  const explicitTargets = (process.env.OPS_ECS_SERVICE_TARGETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (explicitTargets.length > 0) {
    return explicitTargets;
  }

  return [
    process.env.AWS_WEB_ECS_CLUSTER && process.env.AWS_WEB_CERTSCORE_SERVICE
      ? `${process.env.AWS_WEB_ECS_CLUSTER}/${process.env.AWS_WEB_CERTSCORE_SERVICE}`
      : null,
    process.env.AWS_VALIDATION_ECS_CLUSTER && process.env.AWS_VALIDATION_ECS_WORKER_SERVICE
      ? `${process.env.AWS_VALIDATION_ECS_CLUSTER}/${process.env.AWS_VALIDATION_ECS_WORKER_SERVICE}`
      : null
  ].filter((target): target is string => Boolean(target));
}

async function checkEcsServices(input: { findings: string[]; section: MonitorSection }) {
  const targets = getEcsServiceTargets();

  if (targets.length === 0) {
    markSection(input.section, "skipped", "No ECS service targets configured.");
    return;
  }

  const region = process.env.AWS_REGION?.trim() || "us-west-1";
  let checkedCount = 0;

  for (const target of targets) {
    const [cluster, service] = target.split("/");

    if (!cluster || !service) {
      addFinding({
        findings: input.findings,
        section: input.section,
        message: `Invalid ECS service target ${target}; expected cluster/service.`
      });
      continue;
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
        failures?: { arn?: string; reason?: string }[];
        services?: {
          desiredCount?: number;
          deployments?: { rolloutState?: string; rolloutStateReason?: string }[];
          pendingCount?: number;
          runningCount?: number;
          serviceName?: string;
          status?: string;
        }[];
      };
      const describedService = payload.services?.[0];
      const failure = payload.failures?.[0];

      if (!describedService) {
        addFinding({
          findings: input.findings,
          section: input.section,
          message: `ECS service ${target} was not described${failure?.reason ? `: ${failure.reason}` : "."}`
        });
        continue;
      }

      checkedCount += 1;
      const rollout = describedService.deployments?.[0];
      const desired = describedService.desiredCount ?? 0;
      const running = describedService.runningCount ?? 0;
      const pending = describedService.pendingCount ?? 0;

      if (describedService.status !== "ACTIVE" || running < desired || pending > 0 || rollout?.rolloutState === "FAILED") {
        addFinding({
          findings: input.findings,
          section: input.section,
          message: `ECS service ${target} unhealthy: status ${describedService.status ?? "unknown"}, desired ${desired}, running ${running}, pending ${pending}, rollout ${rollout?.rolloutState ?? "unknown"}.`
        });
      } else {
        markSection(input.section, "ok", `ECS service ${target} is steady (${running}/${desired} running).`);
      }
    } catch (error) {
      addFinding({
        findings: input.findings,
        section: input.section,
        message: `ECS service ${target} check failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  if (checkedCount === 0 && input.section.status !== "failing") {
    markSection(input.section, "skipped", "No ECS services were checked.");
  }
}

async function checkQueuedScanBacklog(input: { findings: string[]; section: MonitorSection; staleMinutes: number }) {
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
    addFinding({
      findings: input.findings,
      section: input.section,
      message: "Queued full-scan backlog query returned no row."
    });
    return;
  }

  if (backlog.stale_queued_count > 0) {
    addFinding({
      findings: input.findings,
      section: input.section,
      message: `${backlog.stale_queued_count} full scan(s) have been queued longer than ${input.staleMinutes}m; oldest queued at ${
        backlog.oldest_queued_at ?? "unknown"
      }.`
    });
  } else {
    markSection(input.section, "ok", `Queued full-scan backlog is clear (${backlog.queued_count} queued).`);
  }

  return backlog;
}

async function loadStaleRunningScans(input: { eventStaleMinutes: number; limit: number; runAgeMinutes: number }) {
  const result = await query<StaleRunningScanRow>(
    `
      select s.id::text,
             s.organization_id::text,
             s.domain_id::text,
             d.hostname as domain_hostname,
             s.status,
             s.created_at::text,
             s.started_at::text,
             s.completed_at::text,
             s.error_message,
             latest_event.created_at::text as latest_event_at,
             latest_event.message as latest_event_message,
             floor(extract(epoch from (now() - coalesce(s.started_at, s.created_at))) / 60)::int as run_age_minutes
        from scans s
        left join domains d on d.id = s.domain_id
        left join lateral (
          select se.created_at, se.message
            from scan_events se
           where se.scan_id = s.id
           order by se.created_at desc
           limit 1
        ) latest_event on true
       where s.scan_type = 'full'
         and s.status = 'running'
         and coalesce(s.started_at, s.created_at) < now() - $1::interval
         and (
           latest_event.created_at is null
           or latest_event.created_at < now() - $2::interval
         )
       order by coalesce(s.started_at, s.created_at)
       limit $3
    `,
    [`${input.runAgeMinutes} minutes`, `${input.eventStaleMinutes} minutes`, input.limit],
    { readOnly: true }
  );

  return result.rows;
}

async function markStaleRunningScanFailed(input: {
  eventStaleMinutes: number;
  runAgeMinutes: number;
  scan: StaleRunningScanRow;
}) {
  const failedAt = new Date().toISOString();
  const errorMessage = "The scanner did not return a terminal result within the expected time. No result was inferred; start a new scan.";
  const result = await query<{ id: string }>(
    `
      update scans
         set status = 'failed',
             completed_at = $2,
             error_message = $3,
             updated_at = now()
       where id = $1
         and status = 'running'
         and coalesce(started_at, created_at) < now() - $4::interval
         and not exists (
           select 1
             from scan_events se
            where se.scan_id = scans.id
              and se.created_at >= now() - $5::interval
         )
       returning id::text
    `,
    [input.scan.id, failedAt, errorMessage, `${input.runAgeMinutes} minutes`, `${input.eventStaleMinutes} minutes`]
  );

  if (result.rowCount === 0) {
    return false;
  }

  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, $2, $3, 'ops.scan_marked_failed', $4, $5)
    `,
    [
      input.scan.id,
      input.scan.domain_id,
      input.scan.organization_id,
      "Ops reconciler marked an orphaned running scan as failed after no terminal Lambda result arrived.",
      {
        failedAt,
        latestEventAt: input.scan.latest_event_at,
        latestEventMessage: input.scan.latest_event_message,
        minEventStaleMinutes: input.eventStaleMinutes,
        minRunAgeMinutes: input.runAgeMinutes,
        reason: "lambda_terminal_result_absent",
        runAgeMinutes: input.scan.run_age_minutes,
        source: "monitor-prod-ops"
      }
    ]
  );

  return true;
}

async function repairStaleRunningScans(input: {
  eventStaleMinutes: number;
  findings: string[];
  limit: number;
  repairEnabled: boolean;
  runAgeMinutes: number;
  section: MonitorSection;
}) {
  const scans = await loadStaleRunningScans({
    eventStaleMinutes: input.eventStaleMinutes,
    limit: input.limit,
    runAgeMinutes: input.runAgeMinutes
  });

  if (scans.length === 0) {
    markSection(input.section, "ok", "No stale running full scans found.");
    return { repairedCount: 0, staleRunningCount: 0 };
  }

  const scanSummary = scans
    .map((scan) => `${scan.domain_hostname ?? scan.id} (${scan.id}, ${scan.run_age_minutes ?? "unknown"}m)`)
    .join(", ");

  if (!input.repairEnabled) {
    addFinding({
      findings: input.findings,
      section: input.section,
      message: `${scans.length} stale running full scan(s) found and repair is disabled: ${scanSummary}.`
    });
    return { repairedCount: 0, staleRunningCount: scans.length };
  }

  let repairedCount = 0;
  for (const scan of scans) {
    if (
      await markStaleRunningScanFailed({
        eventStaleMinutes: input.eventStaleMinutes,
        runAgeMinutes: input.runAgeMinutes,
        scan
      })
    ) {
      repairedCount += 1;
    }
  }

  markSection(
    input.section,
    "ok",
    `Repaired ${repairedCount}/${scans.length} stale running full scan(s): ${scanSummary}.`
  );

  return { repairedCount, staleRunningCount: scans.length };
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

async function runSyntheticScanCheck(input: { baseUrl: string; domain: string; findings: string[]; section: MonitorSection; timeoutMinutes: number }) {
  try {
    const scanId = await queueSyntheticScan({ baseUrl: input.baseUrl, domain: input.domain });
    await waitForSyntheticScan({ scanId, timeoutMinutes: input.timeoutMinutes });
  } catch (error) {
    addFinding({
      findings: input.findings,
      section: input.section,
      message: `Synthetic homepage scan failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function summarizeForHumans(input: {
  baseUrl: string;
  directDatabaseChecksEnabled: boolean;
  environment: string;
  queuedFullScans: number | null;
  repairedStaleRunningScans: number | null;
  sections: ReturnType<typeof createSections>;
  status: SectionState;
  syntheticScanEnabled: boolean;
  validationHeartbeatAt: string | null;
}) {
  return {
    environment: input.environment,
    baseUrl: input.baseUrl,
    status: input.status,
    answer: {
      canUsersUseTheApp: input.sections.publicWeb.status === "ok",
      areScansBeingPickedUp:
        input.directDatabaseChecksEnabled && input.sections.scannerQueueCanary.status !== "skipped"
          ? input.sections.scannerQueueCanary.status === "ok"
          : null,
      areWorkersAlive:
        input.directDatabaseChecksEnabled && input.sections.workerHeartbeats.status !== "skipped"
          ? input.sections.workerHeartbeats.status === "ok"
          : null,
      isAnythingStale: input.status === "failing"
    },
    sections: input.sections,
    directDatabaseChecksEnabled: input.directDatabaseChecksEnabled,
    queuedFullScans: input.queuedFullScans,
    repairedStaleRunningScans: input.repairedStaleRunningScans,
    syntheticScanEnabled: input.syntheticScanEnabled,
    validationHeartbeatAt: input.validationHeartbeatAt
  };
}

async function main() {
  const environment = process.env.OPS_ALERT_ENVIRONMENT?.trim() || DEFAULT_ENVIRONMENT;
  const staleMinutes = Number(process.env.OPS_HEARTBEAT_STALE_MINUTES ?? DEFAULT_HEARTBEAT_STALE_MINUTES);
  const baseUrl = process.env.OPS_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const requireScannerHeartbeat = getBooleanEnv("OPS_REQUIRE_SCANNER_HEARTBEAT", false);
  const requireValidationHeartbeat = getBooleanEnv("OPS_REQUIRE_VALIDATION_HEARTBEAT", true);
  const requireDirectDatabase = getBooleanEnv("OPS_REQUIRE_DIRECT_DATABASE", false);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (requireDirectDatabase && !databaseUrl) {
    throw new Error("Set DATABASE_URL before running the ops monitor with OPS_REQUIRE_DIRECT_DATABASE=true.");
  }
  const scanQueueStaleMinutes = getNumberEnv("OPS_SCAN_QUEUE_STALE_MINUTES", DEFAULT_SCAN_QUEUE_STALE_MINUTES);
  const staleRunningScanMinutes = getNumberEnv("OPS_STALE_RUNNING_SCAN_MINUTES", DEFAULT_STALE_RUNNING_SCAN_MINUTES);
  const staleRunningScanEventMinutes = getNumberEnv(
    "OPS_STALE_RUNNING_SCAN_EVENT_MINUTES",
    DEFAULT_STALE_RUNNING_SCAN_EVENT_MINUTES
  );
  const staleRunningScanRepairLimit = getNumberEnv("OPS_STALE_RUNNING_SCAN_REPAIR_LIMIT", DEFAULT_STALE_RUNNING_SCAN_REPAIR_LIMIT);
  const staleRunningScanRepairEnabled = getBooleanEnv("OPS_REPAIR_STALE_RUNNING_SCANS", true);
  const syntheticScanEnabled = getBooleanEnv("OPS_SYNTHETIC_SCAN_ENABLED", false);
  const syntheticScanDomain = process.env.OPS_SYNTHETIC_SCAN_DOMAIN?.trim() || DEFAULT_SYNTHETIC_SCAN_DOMAIN;
  const syntheticScanTimeoutMinutes = getNumberEnv("OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES", DEFAULT_SYNTHETIC_SCAN_TIMEOUT_MINUTES);
  const staleThresholdMs = staleMinutes * 60_000;
  const findings: string[] = [];
  const sections = createSections();
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  await checkHttpEndpoint({
    findings,
    label: "Web health",
    section: sections.publicWeb,
    url: new URL("/api/health", baseUrl).toString(),
    validateJson: (value) => {
      const status = (value as { status?: unknown } | null)?.status;
      return status === "ok" ? null : `expected status ok, got ${String(status)}`;
    }
  });

  await checkHttpEndpoint({
    findings,
    label: "Database health",
    section: sections.publicWeb,
    url: new URL("/api/health/database", baseUrl).toString(),
    validateJson: (value) => {
      const ok = (value as { ok?: unknown } | null)?.ok;
      return ok === true ? null : `expected ok true, got ${String(ok)}`;
    }
  });

  let validationSettings: ValidationSettingsRow | null = null;
  let scanBacklog: QueuedScanBacklogRow | null = null;
  let repairedStaleRunningScans: number | null = null;

  await checkEcsServices({
    findings,
    section: sections.ecsServices
  });

  if (requireDirectDatabase) {
    markSection(sections.databaseAndBacklog, "ok", "Direct database checks are enabled.");
    markSection(sections.workerHeartbeats, "ok", "Worker heartbeat checks are enabled.");
    markSection(sections.scannerQueueCanary, "ok", "Scanner queue checks are enabled.");

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
      addFinding({
        findings,
        section: sections.workerHeartbeats,
        message: `Validation settings query failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    if (!validationSettings) {
      addFinding({
        findings,
        section: sections.workerHeartbeats,
        message: "Validation settings row is missing."
      });
    } else if (validationSettings.pipeline_enabled && requireValidationHeartbeat) {
      if (!validationSettings.last_worker_heartbeat_at) {
        addFinding({
          findings,
          section: sections.workerHeartbeats,
          message: "Validation worker heartbeat is missing."
        });
      } else {
        const heartbeatAgeMs = Date.now() - new Date(validationSettings.last_worker_heartbeat_at).getTime();
        if (heartbeatAgeMs > staleThresholdMs) {
          addFinding({
            findings,
            section: sections.workerHeartbeats,
            message: `Validation worker heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${validationSettings.last_worker_host ?? "unknown"}).`
          });
        } else {
          markSection(
            sections.workerHeartbeats,
            "ok",
            `Validation worker heartbeat is fresh (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${validationSettings.last_worker_host ?? "unknown"}).`
          );
        }
      }
    } else if (!requireValidationHeartbeat) {
      markSection(sections.workerHeartbeats, "skipped", "Validation heartbeat freshness is disabled.");
    } else {
      markSection(sections.workerHeartbeats, "skipped", "Validation pipeline is disabled.");
    }

    if (requireScannerHeartbeat) {
      const scannerHeartbeat = await getLastScannerServiceHeartbeat();

      if (scannerHeartbeat.errorMessage) {
        addFinding({
          findings,
          section: sections.workerHeartbeats,
          message: scannerHeartbeat.errorMessage
        });
      } else if (!scannerHeartbeat.lastHeartbeatAt) {
        addFinding({
          findings,
          section: sections.workerHeartbeats,
          message: "Scanner service heartbeat is missing."
        });
      } else {
        const heartbeatAgeMs = Date.now() - new Date(scannerHeartbeat.lastHeartbeatAt).getTime();
        if (heartbeatAgeMs > staleThresholdMs) {
          addFinding({
            findings,
            section: sections.workerHeartbeats,
            message: `Scanner service heartbeat is stale (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${scannerHeartbeat.host ?? "unknown"}).`
          });
        } else {
          markSection(
            sections.workerHeartbeats,
            "ok",
            `Scanner service heartbeat is fresh (${Math.round(heartbeatAgeMs / 60_000)}m old, host ${scannerHeartbeat.host ?? "unknown"}).`
          );
        }
      }
    } else {
      markSection(sections.workerHeartbeats, "skipped", "Scanner heartbeat freshness is disabled.");
    }

    scanBacklog = await checkQueuedScanBacklog({
      findings,
      section: sections.scannerQueueCanary,
      staleMinutes: scanQueueStaleMinutes
    }).catch((error) => {
      addFinding({
        findings,
        section: sections.scannerQueueCanary,
        message: `Queued full-scan backlog query failed: ${error instanceof Error ? error.message : String(error)}`
      });
      return null;
    });

    const staleRunningResult = await repairStaleRunningScans({
      eventStaleMinutes: staleRunningScanEventMinutes,
      findings,
      limit: staleRunningScanRepairLimit,
      repairEnabled: staleRunningScanRepairEnabled,
      runAgeMinutes: staleRunningScanMinutes,
      section: sections.scannerQueueCanary
    }).catch((error) => {
      addFinding({
        findings,
        section: sections.scannerQueueCanary,
        message: `Stale running full-scan repair failed: ${error instanceof Error ? error.message : String(error)}`
      });
      return null;
    });
    repairedStaleRunningScans = staleRunningResult?.repairedCount ?? null;
  } else if (syntheticScanEnabled) {
    markSection(sections.databaseAndBacklog, "skipped", "Direct database checks are disabled.");
    markSection(sections.workerHeartbeats, "skipped", "Direct database checks are disabled.");
    addFinding({
      findings,
      section: sections.scannerQueueCanary,
      message: "Synthetic scan canary requires OPS_REQUIRE_DIRECT_DATABASE=true so the monitor can wait for scan completion."
    });
  } else {
    markSection(sections.databaseAndBacklog, "skipped", "Direct database checks are disabled.");
    markSection(sections.workerHeartbeats, "skipped", "Direct database checks are disabled.");
    markSection(sections.scannerQueueCanary, "skipped", "Direct database checks are disabled.");
  }

  if (syntheticScanEnabled && requireDirectDatabase) {
    await runSyntheticScanCheck({
      baseUrl,
      domain: syntheticScanDomain,
      findings,
      section: sections.scannerQueueCanary,
      timeoutMinutes: syntheticScanTimeoutMinutes
    });
    if (!findings.some((finding) => finding.startsWith("Synthetic homepage scan failed"))) {
      markSection(sections.scannerQueueCanary, "ok", `Synthetic homepage scan completed for ${syntheticScanDomain}.`);
    }
  }

  const status: SectionState = findings.length === 0 ? "ok" : "failing";
  const summary = summarizeForHumans({
    baseUrl,
    directDatabaseChecksEnabled: requireDirectDatabase,
    environment,
    queuedFullScans: scanBacklog?.queued_count ?? null,
    repairedStaleRunningScans,
    sections,
    status,
    syntheticScanEnabled,
    validationHeartbeatAt: validationSettings?.last_worker_heartbeat_at ?? null
  });

  if (findings.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
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
  console.error(JSON.stringify(summary, null, 2));
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
