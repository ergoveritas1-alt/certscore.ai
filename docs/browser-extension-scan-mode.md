# BX01 Browser Extension Scan Mode

BX01 is the CertScore browser-extension-assisted scan mode. It is user-initiated, single-page, and bounded: the extension opens or reloads a target tab, observes a short scan window, and sends browser-observed evidence to WC01 for provenance-preserving storage.

## Evidence Boundary

BX01 evidence is marked as `sourceType: "browser_extension"` and `sourceId: "BX01"`.

It is distinct from WS01/server-side Chromium evidence. Reports should preserve that provenance because browser observations can reflect the reviewer browser profile, location, cache, extensions, prior consent state, login state, and network path.

WC01 must not create findings directly from raw BX01 events. Report-driving findings require WS01 to identify observed runtime signals and WC01 to route those signals through normalized concern -> concern policy -> unified finding -> executive/regulatory projection.

The MVP captures:

- network request URLs and hostnames, without request bodies
- cookie names, domains, paths, and attributes, without cookie values
- consent UI/banner text snippets and controls
- consent interaction observations
- visible-tab screenshot artifacts when small enough, otherwise a bounded skip note
- raw third-party request/cookie counts and host/name summaries inside `hybrid_runtime_evidence.browserExtension.rawEvidenceSummary`
- canonical scan/session records for report-shell routing, with report-driving snapshot/runtime signal fields left empty until WS01 supplies observed signals

The MVP intentionally does not implement passive monitoring, broad crawling, request body capture, multi-browser support, or full DOM archival.

## Local Setup

Apply the BX01 migrations:

```bash
set -a
source apps/web/.env.local
set +a
pnpm tsx scripts/apply-db-migrations.ts
```

Start the web app:

```bash
set -a
source apps/web/.env.local
set +a
pnpm --filter @website-signal-risk-scanner/web exec next dev --turbo --port 3001
```

Build-check the extension:

```bash
pnpm --filter @website-signal-risk-scanner/browser-extension typecheck
```

For manual Chrome testing, load `apps/browser-extension` as an unpacked extension and set the extension API base URL to the local web app, for example `http://localhost:3001`.

## Manual QA

1. Open `http://localhost:3001/app/browser-scans/setup?bx01TargetUrl=https%3A%2F%2Fergoveritas.com%2F.well-known%2Fcertscore-canary%2Fsentinels%2Fbroad-baseline.html`.
2. Sign in if redirected.
3. Open the CertScore extension from that page.
4. Run a browser pre-consent scan.
5. Confirm the extension opens the target tab, optionally clears site data for a fresh visit, reloads, observes, and completes.
6. Open the returned canonical report URL.

Expected database checks:

```sql
select id, status, canonical_scan_id, event_count, artifact_count
from browser_scan_sessions
order by created_at desc
limit 5;

select id, scan_type, status, scan_config_json
from scans
where id = '<canonical_scan_id>';

select
  third_party_request_count,
  consent_preconsent_violation_count,
  consent_baseline_tracker_vendor_names,
  hybrid_runtime_evidence->'browserExtension' as browser_extension_evidence
from scan_runtime_artifacts
where scan_id = '<canonical_scan_id>';

select crawl_source, render_mode_used, total_signals, preconsent_tracking_detected, cookie_banner_present
from scan_snapshots
where scan_id = '<canonical_scan_id>';
```

Expected report checks:

- report URL returns HTTP 200
- report includes the browser-extension evidence provenance notice
- browser-extension scans retain `scan_type = 'browser_extension'`
- runtime artifacts retain `hybrid_runtime_evidence.browserExtension`
- report-driving fields remain empty/false until a WS01 observed signal package is ingested

Expected canonical checks:

- `scan_runtime_artifacts.third_party_request_count = 0`
- `scan_runtime_artifacts.consent_preconsent_violation_count = 0`
- `scan_runtime_artifacts.consent_baseline_tracker_vendor_names = '{}'`
- `scan_snapshots.total_signals = 0`
- `scan_snapshots.preconsent_tracking_detected = false`
- `hybrid_runtime_evidence.browserExtension.reportDriving = false`

## WS01 Signal Ingestion

WS01 normalizes BX01 raw events with `normalizeBx01EvidenceToObservedSignals` in `WS01/packages/scan-core`.

After WC01 completion returns a `canonicalScanId`, WS01 can fetch raw evidence from:

```text
GET /api/browser-scans/:browserScanId/raw-evidence
x-certscore-bx01-observed-signal-token: <BX01_OBSERVED_SIGNAL_INGEST_TOKEN>
```

Then WS01 can POST the normalized package to:

```text
POST /api/browser-scans/:browserScanId/observed-signals
x-certscore-bx01-observed-signal-token: <BX01_OBSERVED_SIGNAL_INGEST_TOKEN>
```

The payload must contain only `populationSource: "browser_extension_bx01"` signals with `sourceType: "browser_extension"` and `sourceId: "BX01"` provenance. WC01 stores those rows in `scan_signals`, and report projection then uses the existing merged-signal -> normalized concern -> concern policy -> unified finding path.

For a one-off local WS01 handoff:

```bash
BX01_WC01_API_BASE_URL=http://localhost:3001 \
BX01_OBSERVED_SIGNAL_INGEST_TOKEN=<shared-token> \
BX01_BROWSER_SCAN_ID=<browser-scan-id> \
pnpm --filter @signal-scanner/scanner bx01-normalize-once
```

From WC01, the same handoff can be checked with a smoke runner after a real extension-created scan has completed:

```bash
BX01_WC01_API_BASE_URL=http://localhost:3001 \
BX01_OBSERVED_SIGNAL_INGEST_TOKEN=<shared-token> \
BX01_BROWSER_SCAN_ID=<browser-scan-id> \
pnpm ops:smoke:bx01-handoff
```

The smoke fetches raw BX01 evidence from WC01, runs the WS01 normalizer in `../WS01`, and verifies WC01 reports WS01-normalized observed signals ingested. Set `BX01_WS01_DIR=/path/to/WS01` if the repos are not siblings.

## Automated Runtime Smoke

The local runtime smoke can launch the unpacked extension in a temporary Chromium profile with `--load-extension`, run against a local fixture page, and verify canonical report output.

Keep this smoke out of normal unit tests unless the environment has a compatible local browser installed. It is best used as a pre-ship manual/ops check because Chrome extension behavior is environment-sensitive.
