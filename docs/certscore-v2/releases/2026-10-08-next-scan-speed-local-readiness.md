# Next scan-speed changes: local readiness, October 8, 2026

Status: implemented and verified locally; not deployed. Baseline: `fc648684`.

## Implemented scope

| Target | Change | Applies when |
| --- | --- | --- |
| Policy lane tail | Prepare deterministic sections/facts from already-fetched text while rendered discovery runs. Reuse only an exact content/URL/analysis-mode key; clone mutable facts. | Static warmup has a usable policy document. |
| Consent lane startup | Start the existing rapid inventory at navigation commit, overlapping parser readiness. Reuse only complete positive A/R/O from the same URL and loader. Inspect empty/partial results normally after readiness. | Consent evidence capture; screenshots still wait for document readiness. |
| Lambda initialization | Move pure policy/lane helpers out of the scanner barrel and defer browser, passive scanner, action observers and full-site dispatch imports until required. | All Lambda invocations; coordinator avoids browser/image initialization entirely. |
| Repeated publication | Check the current generation before materialization and again before projection. Preserve bounded retry and the atomic final persistence guard. | Inputs change while a report is loading or materializing. |
| Result delivery | Re-arm a successful empty ten-second SQS long poll immediately. Retain configured error backoff and existing concurrency. | An arrival previously landed during the extra two-second idle interval. |
| Report hydration | Reuse the caller's verified persisted projection; cache verified policy text by URI/hash/size, bounded to 32 entries and 8 MiB of UTF-8 text. Read independent documents with concurrency four, preserving order and verification. | Report views/exports reread retained policy artifacts. |
| Accept/form tail | Exercise existing stage telemetry with deterministic delayed two-form, late-form, masking, safety-review and timeout fixtures. | Diagnostic measurement only; capture windows and review are unchanged. |

No new lane, public-site request, model call, observation window, retained artifact,
timeout extension, finding rule or scoring change was introduced. Warmup does not
select a governing policy or produce evidence: selected-document processing still
performs the canonical ownership, coverage and projection checks. Missing or
changed warmup inputs cause ordinary analysis. Failed artifact reads stay retryable
and unverifiable bytes remain unavailable.

## Local measurements

Seven fresh Node processes per version, using the production-style minified CJS
bundle and the previous handler versus the changed handler with the same dependency
tree:

| Measurement | Before | After |
| --- | ---: | ---: |
| Median module initialization | 273.1 ms | 149.3 ms |
| Eager browser/image runtimes | Playwright, Sharp | None |

This is a 123.8 ms / 45% reduction in local module initialization, not a measured
whole Lambda cold start or scan-to-report saving. Browser workers still load the
runtimes they require when execution begins.

The local two-form fixture retained both masked images with 89 ms total image
work after the forms appeared. The simulated slow-review fixtures confirm that
the second crop can proceed while the first review remains pending, and that
existing late windows, image withholding and document binding remain enforced.
These fixtures use deterministic local reviewers; their timings do not estimate
production model latency. Their traces distinguish form-mount waiting, pixels,
processing, review and validation instead of attributing the entire tail to
screenshots.

The warmed late-budget policy fixture recorded reuse of both section and fact
preparation. Loader tests confirm six policy documents read with peak concurrency
four, correct output order, no repeat database lookup and no repeat verified-text
read on cache hits. Publication tests confirm a stale load skips materialization,
a stale materialization skips projection, and only the latest generation reaches
the final persistence guard.

## Verification

- Four typechecks passed: scan-core, v2 DAG Lambda, validation-worker and web.
- 381 focused tests passed: Lambda 154; worker 28; policy 14; consent integration
  5; loading-inventory unit/browser 2; form capture/review 6; web cache/publication
  15; materialization/projection contract 157.
- Consent fixtures cover controls present during loading and controls mounted
  after a delayed parser-blocking script. Screenshot timestamps follow parser
  completion. Incomplete, changed-URL and changed-loader inventories cannot reuse
  loading-time negatives or positives from a different document.
- `git diff --check` passed.
- Local logs and benchmark source/results: `artifacts/scan-speed-next-20261008/`.

## Cost and next release verification

Removing the empty-poll idle interval adds approximately 259,200 SQS requests per
30-day month with six continuously idle pollers: approximately **$0.11/month** at
$0.40 per million requests. This below-$1 increase was disclosed before proceeding.
The changes add no provisioned capacity, paid model call or persistent storage;
other work reuses existing scan deadlines and process capacity.

Affected deployments are scanner Lambda, web and validation. No migration or MCP
service source change is needed. Reuse the existing scanner runtime base: package
subpath exports change application module resolution, not browser/dependency
versions. Follow the canonical change-aware preflight, live-SHA comparison,
single-build/replication and digest/health verification before promotion.

A controlled fresh production request-to-scanner-to-report-to-browser comparison
remains outstanding. Do not sum independent lane savings or present replay/local
initialization results as whole-scan gains. Use an owned canary first; SITS remains
subject to its diagnostic contact hold and needs a new per-run exception for a
fresh diagnostic contact. No AWS canary or public-site contact was made for this
implementation.
