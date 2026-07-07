# CertScore TypeScript SDK

Official TypeScript/JavaScript SDK for the CertScore public API, Pulse API, and website risk-signal workflows.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination. Always review the underlying evidence and consult qualified experts where appropriate.

## Status

The SDK is currently a source preview in this monorepo. Public package distribution is not enabled yet; production integrations should use the REST API directly until a package channel is announced.

## Quick Start

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
const findings = await certscore.findings.list(completed.scanId);

console.log(completed.status, findings.findings.length);
```

`certscore.scan()` remains available as a Pulse v1 compatibility helper when you want one call to return a concise Pulse projection.

## Authentication and scopes

The SDK sends `Authorization: Bearer <token>` when `apiKey` is configured.

- Read-only workflows need `scan:read`.
- Creating scans needs `scan:create`.
- MCP clients also use the `mcp` scope, but SDK calls do not require it.
- Self-serve read-only keys are issued through the CertScore dashboard/API. `scan:create` is support-gated for launch.

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

`scan()` calls `/api/v1/pulse` with `wait=60`. If CertScore returns HTTP 202, the SDK polls the returned `statusUrl` or `nextCheckUrl`. It honors `Retry-After` on pending or throttled responses.

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

const pulse = await client.scan("https://example.com");
const scanId = pulse.scanId;

await appDb.pulseScans.upsert({
  domain: "example.com",
  scanId,
  reportUrl: pulse.links?.fullReportUrl
});

// Later:
const cachedPulse = await client.getScan(scanId!, { detail: "full" });
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
const pulse = await client.scan(process.env.TARGET_URL, {
  detail: "standard"
});

const criticalFindings = (pulse.topFindings ?? []).filter(
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
