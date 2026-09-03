# CertScore TypeScript SDK

Official TypeScript/JavaScript SDK for the CertScore public API, Pulse API, and website risk-signal workflows.

CertScore outputs are automated public-web observations for human and agentic review. They are not legal advice, certification, or a compliance determination. Always review the underlying evidence and consult qualified experts where appropriate.

## Status

The SDK is published as `@certscore/sdk` on npm. Use version `0.2.10` or newer for typed GPC, Accept Path, and Reject Path results on both Pulse and API v2 scan resources, plus API v2 scan creation in EU-Germany, EU-Ireland, and California. See the [npm package](https://www.npmjs.com/package/@certscore/sdk) and [SDK source](https://github.com/ergoveritas1-alt/certscore.ai/tree/main/packages/certscore-sdk).

```bash
npm install @certscore/sdk
```

By default the SDK identifies its requests with `X-CertScore-Client: sdk`. The optional `clientName` setting is intended for trusted integrations that share the SDK runtime with MCP; regular SDK consumers should keep the default.

Completed no-go scans resolve normally with `status: "completed_limited"`, `resultDisposition: "no_go"`, and a typed `noGo` object. The object carries a stable reason, customer-safe explanation, target-site or scanner-limitation attribution through `limitationKind`, retry guidance, and a bounded `evidenceExcerpt` when available.

## Quick Start

```ts
import { CertScoreClient } from "@certscore/sdk";

const client = new CertScoreClient();
const pulse = await client.scan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html");
console.log(
  pulse.summary?.score,
  pulse.gpcResponse?.status,
  pulse.postAcceptObservation?.status,
  pulse.postRefusalObservation?.status,
  pulse.links?.fullReportUrl,
);
```

## Resource Clients

New integrations should prefer the resource-oriented API v2 clients for scan, status, finding, pre-consent cookie/tracker table, domain latest, and Pulse projection workflows.

```ts
import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

console.log(
  completed.gpcResponse?.status,
  completed.postAcceptObservation?.verdict,
  completed.postRefusalObservation?.verdict,
);

const status = await certscore.scans.status(scanId);
const diagnostics = await certscore.scans.diagnostics(scanId);
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
const latestDomainScan = await certscore.domains.latest("ergoveritas.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("ergoveritas.com");

console.log(status.status, diagnostics.totalWallMs, diagnostics.policyDiscovery.phaseWallMs, preConsentTable.summary.rowCount, explanation?.title, pulseProjection.disclaimer, pulseEvidence.type, latestDomainScan.scan?.scanId, latestPreConsentTable.rows.length);
```

Read choice-path coverage before reading the outcome:

```ts
const reject = completed.postRefusalObservation;
const accept = completed.postAcceptObservation; // score-neutral baseline
const confirmed = ["confirmed_observation", "confirmed_clean"];

if (!reject || !confirmed.includes(reject.status)) {
  review.unknown(reject?.coverageLimitations ?? ["not_available"]); // not a pass
} else {
  review.fromVerdict(reject.verdict, reject.interpretation);
}

if (accept && confirmed.includes(accept.status)) {
  review.baseline(accept.interpretation); // never a negative finding
}
```

`certscore.scans.get()`, `certscore.scans.status()`, and `certscore.scans.wait()` expose scan timing where the API has enough evidence:

- `startedAt`
- `completedAt`
- `scanTimeSeconds`

`scanTimeSeconds` is `null` when timing is unavailable or incomplete. Client code should not coerce that value to `0`; reserve `0` only for an explicit numeric API value.

Available resource clients:

- `certscore.scans.create()`
- `certscore.scans.diagnostics()`
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

const latestTable = await certscore.domains.latestPreConsentCookiesTrackers("ergoveritas.com");
console.log(grouped.size, latestTable.summary.rowCount);
```

The response is a public-safe report projection. It does not include cookie values, raw request bodies, full request URLs, sensitive query strings, or internal scanner artifacts.
Server-side filters are intentionally deferred in the initial version; group or filter the returned table client-side by `kind`, `priority`, `party`, `vendor`, `purpose`, or `host`.

## Async Lifecycle

`scan()` calls `/api/v1/pulse` with `wait=60`. If CertScore returns HTTP 202, the SDK polls the returned `statusUrl` or `nextCheckUrl`. It honors `Retry-After` on pending or throttled responses.

```ts
import { CertScoreClient, CertScoreTimeoutError } from "@certscore/sdk";

const client = new CertScoreClient();

try {
  const pulse = await client.scan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
    detail: "standard",
    maxWaitMs: 300_000,
    // Omit for adaptive 1s → 2s → 5s polling; set explicitly for a fixed interval.
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
const pulse = await client.scan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html");
const scanId = pulse.scanId;

await appDb.pulseScans.upsert({
  domain: "ergoveritas.com",
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

const client = new CertScoreClient();

try {
  await client.scan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", { freshness: "refresh" });
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
const markdown = await client.scan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
  format: "markdown",
  detail: "standard"
});

console.log(markdown);
```

## Submit Without Polling

```ts
const job = await client.submitScan("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
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
          TARGET_URL: https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html
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

This CI example fails only on critical automated review signals surfaced by CertScore. It does not make a legal or compliance conclusion. CertScore provides automated public-web observations for human and agentic review, not legal advice, certification, or a compliance determination.

## API Notes

- `detail` supports `tiny`, `quick`, `standard`, and `full`; `quick` is an alias for `tiny`.
- `format` supports `json` and `markdown`.
- `freshness` supports `latest` and `refresh`.
- `wait` accepts `0` to `80` seconds and only controls the current HTTP request hold window.
- HTTP 202 and 429 may include `Retry-After`; the SDK uses it for polling/retry timing.
- Terminal usable statuses are `completed` and `completed_limited`.
- Terminal edge statuses include `failed`, `expired`, and `rate_limited`.
