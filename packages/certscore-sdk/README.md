# CertScore TypeScript SDK

Official TypeScript/JavaScript SDK for the CertScore public API, Pulse API, and website risk-signal workflows.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination. Always review the underlying evidence and consult qualified experts where appropriate.

## Install

```bash
npm install @certscore/sdk
```

## Quick Start

```ts
import { CertScore } from "@certscore/sdk";

const certscore = new CertScore({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

console.log("Queued scan:", created.scanId, created.status);

const completed = await certscore.scans.wait(created);
const findings = await certscore.findings.list(completed.scanId);

console.log(completed.status, findings.findings.length);
```

`CertScoreClient` is the canonical class name; `CertScore` is a friendly alias for shorter examples.
`certscore.scan()` remains available as a Pulse v1 compatibility helper when you want one call to wait for and return a concise Pulse projection. Bot and dashboard-style integrations should prefer `certscore.scans.create()` so scan submission returns quickly and polling is tracked separately.

## Authentication and scopes

The SDK sends `Authorization: Bearer <token>` when `apiKey` is configured.

- Read-only workflows need `scan:read`.
- Creating scans needs `scan:create`.
- MCP clients also use the `mcp` scope, but SDK calls do not require it.
- Self-serve read-only keys are prefixed `cs_ro_`.
- Self-serve scan-creation keys are prefixed `cs_rw_`, expire after 90 days, and are conservatively capped for launch.
- Create keys from CertScore Settings > Developer API keys, or by posting to `/api/v2/keys/request` from a signed-in browser session.
- Higher-volume scan creation is available through support at `support@certscore.ai`.

| Key | Default scopes | Use |
| --- | --- | --- |
| `cs_ro_` | `scan:read`, `mcp` | Read existing scans, findings, reports, latest-domain resources, and MCP read tools. |
| `cs_rw_` | `scan:read`, `scan:create`, `mcp` | Everything in `cs_ro_`, plus 5 fresh scan creations/day for SDK and REST trials. |

## Doctor

Check your install and key without creating a scan:

```bash
CERTSCORE_API_KEY="cs_ro_or_cs_rw_..." npx -y @certscore/sdk@latest certscore-sdk-doctor
CERTSCORE_API_KEY="cs_ro_or_cs_rw_..." npx -y @certscore/sdk@latest certscore-sdk-doctor --json
```

The doctor checks API v2 health and a read request. It intentionally does not create scans or consume `scan:create` quota.

## Resource Clients

New integrations should prefer the resource-oriented API v2 clients for scan, status, finding, pre-consent cookie/tracker table, domain latest, and Pulse projection workflows.

```ts
import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const firstFinding = findings.findings[0]
  ? await certscore.findings.get(scanId, findings.findings[0].id)
  : null;
const explanation = firstFinding
  ? await certscore.findings.explain(scanId, firstFinding.id)
  : null;
const pulseProjection = await certscore.pulse.get(scanId);
const pulseEvidence = await certscore.pulse.evidence(scanId);
const latestDomainScan = await certscore.domains.latest("example.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");

console.log(status.status, preConsentTable.summary.rowCount, explanation?.title, pulseProjection.disclaimer, pulseEvidence.type, latestDomainScan.scan?.id, latestPreConsentTable.rows.length);
```

## Browser-style Bot Workflow

For bots, batch jobs, and dashboards, treat scan submission, scan lifecycle, and result fetching as separate steps. This matches the browser flow: create the scan quickly, persist the durable `scanId`, poll status in the background, then fetch findings and report projections after completion.

```ts
import { CertScoreClient, type ScanJob } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const timings = {
  submittedAtMs: Date.now(),
  submitLatencyMs: 0,
  queuedSeconds: null as number | null,
  scannerRuntimeSeconds: null as number | null,
  sdkWallSeconds: null as number | null
};

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie",
  metadata: { source: "bot" }
});
timings.submitLatencyMs = Date.now() - timings.submittedAtMs;

await saveScanRow({
  scanId: created.scanId,
  status: created.status,
  submitLatencyMs: timings.submitLatencyMs
});

const completed = await certscore.scans.wait(created, {
  pollIntervalMs: 5_000,
  onStatusUpdate(status: ScanJob) {
    void updateScanRow(status.scanId ?? created.scanId, { status: status.status, phase: status.phase });
  }
});

timings.sdkWallSeconds = (Date.now() - timings.submittedAtMs) / 1000;
timings.queuedSeconds = secondsBetween(completed.createdAt, completed.startedAt);
timings.scannerRuntimeSeconds = secondsBetween(completed.startedAt, completed.completedAt);

const [findings, preConsentTable, pulse] = await Promise.all([
  certscore.findings.list(completed.scanId),
  certscore.scans.preConsentCookiesTrackers(completed.scanId),
  certscore.pulse.get(completed.scanId)
]);

await updateScanRow(completed.scanId, {
  status: completed.status,
  score: completed.score,
  findingCount: findings.findings.length,
  trackerCount: preConsentTable.summary.trackerCount,
  cookieCount: preConsentTable.summary.cookieCount,
  requestCount: preConsentTable.summary.requestCount,
  reportUrl: completed.links?.report ?? pulse.pulse.links?.fullReportUrl,
  timings
});

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, (endMs - startMs) / 1000) : null;
}

declare function saveScanRow(row: Record<string, unknown>): Promise<void>;
declare function updateScanRow(scanId: string | null | undefined, row: Record<string, unknown>): Promise<void>;
```

Use `sdkWallSeconds` for bot throughput and timeout tuning. Use `queuedSeconds` and `scannerRuntimeSeconds` for scanner-performance triage. Avoid treating the full `await certscore.scan(...)` duration as scanner runtime.

Available resource clients:

- `certscore.scans.create()`
- `certscore.scans.get()`
- `certscore.scans.preConsentCookiesTrackers()`
- `certscore.scans.status()`
- `certscore.scans.wait()`
- `certscore.findings.list()`
- `certscore.findings.get()`
- `certscore.findings.explain()`
- `certscore.pulse.get()`
- `certscore.pulse.evidence()`
- `certscore.domains.latest()`
- `certscore.domains.latestPreConsentCookiesTrackers()`
- `certscore.scan()`

## Cookies & Trackers (Pre-consent)

Use the API v2 resource client when you need the public report table as JSON instead of parsing report HTML or Pulse prose.

```ts
const table = await certscore.scans.preConsentCookiesTrackers(scanId);

const grouped = new Map<string, typeof table.rows>();
for (const row of table.rows) {
  const key = [row.vendor, row.purpose, row.host].join("|");
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const latestTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");
console.log(grouped.size, latestTable.summary.rowCount);
```

The response is a public-safe report projection. It does not include cookie values, raw request bodies, full request URLs, sensitive query strings, or internal scanner artifacts.
Server-side filters are intentionally deferred in the initial version; group or filter the returned table client-side by `kind`, `priority`, `party`, `vendor`, `purpose`, or `host`.

## Async Lifecycle

`scan()` calls `/api/v1/pulse` with `wait=60`. It is a blocking Pulse v1 compatibility helper for simple scripts: if CertScore returns HTTP 202, the SDK polls the returned `statusUrl` or `nextCheckUrl`, then fetches the completed Pulse projection. It honors `Retry-After` on pending or throttled responses.

For production bots that need browser-like behavior or accurate timing metrics, prefer the Browser-style Bot Workflow above instead of measuring the wall time of `scan()`.

```ts
import { CertScoreClient, CertScoreTimeoutError } from "@certscore/sdk";

const client = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

try {
  const pulse = await client.scan("https://example.com", {
    detail: "standard",
    maxWaitMs: 300_000,
    pollIntervalMs: 5_000,
    onStatusUpdate(status) {
      console.log("Pulse status:", status.status, status.phase);
    }
  });

  if (pulse.scanStatus === "completed" || pulse.scanStatus === "completed_limited") {
    console.log("Result:", pulse.summary?.headline);
  }
} catch (error) {
  if (error instanceof CertScoreTimeoutError) {
    console.log("Resume later with:", error.jobId, error.scanId);
  } else {
    throw error;
  }
}
```

## Durable scanId Pattern

`scanId` is the durable audit/cache handle. `scan_id` may appear in API responses as a compatibility alias, but new integrations should store `scanId`.

```ts
const client = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await client.scans.create("https://example.com");
const completed = await client.scans.wait(created);
const scanId = completed.scanId;

await appDb.pulseScans.upsert({
  domain: "example.com",
  scanId,
  reportUrl: completed.links?.report
});

// Later:
const cachedPulse = await client.pulse.get(scanId);
```

Use the full report URL for human review:

```ts
console.log(`https://certscore.ai/scan/${scanId}`);
```

## Error Handling

```ts
import {
  CertScoreApiError,
  CertScoreClient,
  CertScoreScanFailedError,
  CertScoreTimeoutError,
  InvalidUrlError,
  ThrottledError
} from "@certscore/sdk";

const client = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

try {
  await client.scan("https://example.com", { freshness: "refresh" });
} catch (error) {
  if (error instanceof InvalidUrlError) {
    console.error("Invalid URL:", error.message);
  } else if (error instanceof ThrottledError) {
    console.error("Retry after seconds:", error.retryAfterSeconds);
  } else if (error instanceof CertScoreTimeoutError) {
    console.error("Timed out; resume with:", error.jobId, error.scanId);
  } else if (error instanceof CertScoreScanFailedError) {
    console.error("Scan ended before completion:", error.jobId, error.scanId);
  } else if (error instanceof CertScoreApiError) {
    console.error("API error:", error.status, error.code, error.responseBody);
  } else {
    throw error;
  }
}
```

## Markdown Output

Markdown is useful for agent or human-facing summaries.

```ts
const markdown = await client.scan("https://example.com", {
  format: "markdown",
  detail: "standard"
});

console.log(markdown);
```

## Submit Without Polling

```ts
const job = await client.submitScan("https://example.com", {
  detail: "tiny"
});

console.log(job.status, job.jobId, job.scanId, job.statusUrl);
```

## CI/CD Example

Example GitHub Actions workflow:

```yaml
name: CertScore Pulse

on:
  deployment_status:

jobs:
  pulse:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/certscore-pulse-check.mjs
        env:
          TARGET_URL: https://example.com
          CERTSCORE_API_KEY: ${{ secrets.CERTSCORE_API_KEY }}
```

Example `scripts/certscore-pulse-check.mjs`:

```js
import { CertScoreClient } from "@certscore/sdk";

const client = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});
const created = await client.scans.create(process.env.TARGET_URL, {
  freshness: "latest"
});
const completed = await client.scans.wait(created);
const pulse = await client.pulse.get(completed.scanId);

const criticalFindings = (pulse.pulse.topFindings ?? []).filter(
  (finding) => finding.criticality === "critical"
);

if (criticalFindings.length > 0) {
  console.error("CertScore surfaced critical automated review signals:");
  for (const finding of criticalFindings) {
    console.error(`- ${finding.label ?? finding.id}`);
  }
  process.exit(1);
}

console.log("No critical automated review signals were surfaced in this Pulse.");
```

This CI example fails only on critical automated review signals surfaced by CertScore. It does not make a legal or compliance conclusion. CertScore provides automated public-web observations for review, not legal advice, certification, or a compliance determination.

## API Notes

- `detail` supports `tiny`, `quick`, `standard`, and `full`; `quick` is an alias for `tiny`.
- `format` supports `json` and `markdown`.
- `freshness` supports `latest` and `refresh`.
- `scanFrom` supports `eu_ie`, `eu_de`, and `california` for newly queued public scans.
- `wait` accepts `0` to `80` seconds and only controls the current HTTP request hold window.
- HTTP 202 and 429 may include `Retry-After`; the SDK uses it for polling/retry timing.
- Terminal usable statuses are `completed` and `completed_limited`.
- Terminal edge statuses include `failed`, `expired`, and `rate_limited`.
