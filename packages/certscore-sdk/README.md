# CertScore TypeScript SDK

Official TypeScript/JavaScript SDK for CertScore Pulse, an evidence-backed public-web privacy and consent review-signal API.

CertScore provides automated public-web observations for review. Results may be incomplete or contain errors. CertScore does not provide legal advice, certify compliance, or determine whether a website violates law. Always review the underlying evidence and consult qualified counsel or subject-matter experts where appropriate.

## Installation

```bash
npm install @certscore/sdk
```

## Quick Start

```ts
import { CertScoreClient } from "@certscore/sdk";

const client = new CertScoreClient();
const pulse = await client.scan("https://example.com");
console.log(pulse.summary?.score, pulse.links?.fullReportUrl);
```

## Async Lifecycle

`scan()` calls `/api/v1/pulse` with `wait=60`. If CertScore returns HTTP 202, the SDK polls the returned `statusUrl` or `nextCheckUrl`. It honors `Retry-After` on pending or throttled responses.

```ts
import { CertScoreClient, ScanTimeoutError } from "@certscore/sdk";

const client = new CertScoreClient();

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
  if (error instanceof ScanTimeoutError) {
    console.log("Resume later with:", error.jobId, error.scanId);
  } else {
    throw error;
  }
}
```

## Durable scanId Pattern

`scanId` is the durable audit/cache handle. `scan_id` may appear in API responses as a compatibility alias, but new integrations should store `scanId`.

```ts
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
  InvalidUrlError,
  ScanFailedError,
  ScanTimeoutError,
  ThrottledError
} from "@certscore/sdk";

const client = new CertScoreClient();

try {
  await client.scan("https://example.com", { freshness: "refresh" });
} catch (error) {
  if (error instanceof InvalidUrlError) {
    console.error("Invalid URL:", error.message);
  } else if (error instanceof ThrottledError) {
    console.error("Retry after seconds:", error.retryAfterSeconds);
  } else if (error instanceof ScanTimeoutError) {
    console.error("Timed out; resume with:", error.jobId, error.scanId);
  } else if (error instanceof ScanFailedError) {
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
      - run: npm install @certscore/sdk
      - run: node scripts/certscore-pulse-check.mjs
        env:
          TARGET_URL: https://example.com
```

Example `scripts/certscore-pulse-check.mjs`:

```js
import { CertScoreClient } from "@certscore/sdk";

const client = new CertScoreClient();
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
- `wait` accepts `0` to `80` seconds and only controls the current HTTP request hold window.
- HTTP 202 and 429 may include `Retry-After`; the SDK uses it for polling/retry timing.
- Terminal usable statuses are `completed` and `completed_limited`.
- Terminal edge statuses include `failed`, `expired`, and `rate_limited`.
