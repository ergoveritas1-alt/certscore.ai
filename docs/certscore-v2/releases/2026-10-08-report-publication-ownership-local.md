# Local verification of report publication ownership — October 8, 2026

Status: local implementation and verification; **not deployed or pushed**.

The deployed artifact-transfer optimization improved one owned run, but another
run took 12.897 seconds from scanner completion to report readiness. Its public
status request began canonical materialization first. The authenticated worker
then encountered the existing advisory lock, received 503, and lost the use of
its deliberately one-use artifact transfer. Repeated contention did not create
extra findings, but it defeated the faster publication path.

## Change

Read-triggered publication now checks the writer database before taking the
publication lock or loading full report inputs. Canonical input readiness and a
due, pending durable worker request with verified production-result provenance
reserve publication for the worker. The request is already atomically queued
with canonical findings completion; no new queue, timer, invocation or lease is
introduced. Reservation ends at the existing 150-second publication deadline,
or when the request is missing, failed/backing off, terminal, or lacks current
verified result provenance. Existing read recovery remains available then.
The reservation uses the latest completed result under the same seven-day
recovery window as the worker; an older verified result cannot mask a newer
unverified result. Local-only and limited scans do not reserve a recovery owner
that the production worker sweep would never select.
Releasing ownership permits the existing recovery attempt; it does not verify
missing evidence or bypass canonical artifact verification.

Only the internal route, after durable-token authorization, identifies an
authorized worker call. Sender-provided fields and artifact presence cannot
bypass ownership. Worker and read-recovery promises are separately keyed so a
pending read query cannot coalesce away the worker's artifact transfer. Both
paths retain the existing PostgreSQL advisory lock, source-generation checks,
canonical materializer and atomic persistence guard.

## Local reproduction

`pnpm exec tsx scripts/verify-local-report-publication-race.ts` uses separate
localhost HTTP processes for the real status and internal publication route
handlers, the real publisher and real PostgreSQL advisory locks. It creates
and drops a disposable database on `127.0.0.1:5432`; it loads no environment
file and contacts no public site, AWS service or production database.

The diagnostic replays the original retained owned bundle/manifest from
`artifacts/report-artifact-transfer-20261008/owned-after-1-{scanArtifactUri,manifestUri}.json`.
Those locally retained files are prerequisites, not checked-in test fixtures.
The baseline publisher comes from deployed source `53ae6fde`. Materializer,
report-load and persistence adapters are controlled fixtures; original-byte
transfer verification and token authorization are real. An artificial 180-ms
materialization delay forces overlap. This is a concurrency test, not a timing
benchmark of the complete production pipeline.

| Local check | Baseline | Changed implementation |
| --- | --- | --- |
| Polling reaches publication first | Takes publication lock | Defers before lock |
| 24 status polls during publication | Worker receives 503 | Worker receives 200 |
| Transferred original artifacts used | 0 | 2 |
| Report publications | 1 | 1 |
| Publication-lock attempts | 2 | 1, by worker |

Additional real-SQL cases verify active-worker deferral, expired reservation
recovery, failed/backoff recovery, missing/terminal request recovery,
unverified/stale result recovery, incomplete canonical-input deferral and
authenticated worker recovery without any transfer. A separate regression
blocks an in-process read query while the authorized worker publishes; injected
artifact hints and forced rebuilds cannot turn reads into worker calls.

The full canonical materializer parity test separately compares entire reports
from transferred bytes and original S3 bytes. It passed. The 271-test worker
pipeline and focused publisher/transport/authentication tests passed.

All full-release-gate stages were verified in the clean checkout: 19 workspace
typechecks and 19 builds, deployment topology, consent/GPC/runtime-graph/no-go
checks, scanner fixtures, policy scanner, Lambda tests, canonical projection
parity and post-refusal release contracts. The full invocation reached the last
stage, where a source-contract assertion still expected the deadline's old
literal declaration. The corrected test verifies the shared binding and exact
unchanged 150,000-ms value. The entire affected post-refusal release suite then
passed, including all 50 final projection/result/selection tests. This is a
full stage checklist plus a successful final-stage rerun, not a fabricated
zero-exit receipt for the earlier full invocation; do not use it to skip the
canonical exact-commit preflight on a future deployment.

The final publication CI command also passed with every built workspace
package removed except the workflow's four prerequisites (contracts, shared,
UI and DB). Source-mapped imports eliminate dependence on leftover local
build files. No runtime code changed while correcting that source assertion.

Receipts: `artifacts/report-publication-ownership-local-20261008/`, especially
`localhost-concurrency-receipt.json`, `focused-tests.log`, `canonical-parity.log`
and `worker-pipeline.log`. Broader receipts are `clean-full-preflight-rerun.log`,
`clean-post-refusal-release-rerun.log` and `minimal-ci-tests.log`.
Diagnostic processes, temporary bundles and database
were removed after the successful run.

The development checkout's full gate hit its existing 8-GB Next.js heap failure.
The clean-checkout verification uses the same memory limit, installs with
`pnpm install --frozen-lockfile --offline`, builds package dependencies first,
and creates empty `tmp` / `artifacts/local-v2-dag-scans` test directories.
Its Git origin is the canonical repository remote. No development environment,
generated caches or retained scan artifacts are copied. This setup avoids
mistaking local cache/environment failures for application release confidence.
The existing localhost report returned 500 after the initial build shared its
development `.next` output. Restarting the development server with a fresh
cache restored HTTP 200 at
`http://localhost:3000/dev-fixtures/sits-local-form-review/production/report`.
Keep full builds isolated while that server is running; this is now recorded
in `AGENTS.md` alongside the package prerequisites and canonical clone origin.

## Cost and remaining verification

Estimated incremental recurring infrastructure cost: **$0/month**. The indexed
ownership check replaces competing full materialization/load work; it uses
existing fixed-capacity database/services. No new browser lane, model call,
publication request, retry, timeout extension, retention or provisioned capacity.
The prior bounded transfer cost allowance is unchanged.

The new CI guard takes about one second locally. Conservatively budgeting one
extra rounded billable minute per web release gives **up to $0.60/month at 100
web releases**: $0.005/minute for the native ARM runner, or $0.006/minute for
the existing emergency x64 fallback. This below-$1 estimate is disclosed under
the repository's pre-approval; included/free minutes are not subtracted.
Source: [GitHub runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing).

No production latency saving is claimed for this fix. After local gates pass
and a separately authorized release, measure scanner completion to persisted
report readiness on fresh owned runs with status polling enabled. Verify the
worker wins publication, retains transfer use when eligible, and publishes
exactly once. The previous 12.897-second production outcome remains historical
evidence; this localhost reproduction establishes its race mechanism, not its
exact elapsed time or a production percentile.

`AGENTS.md` now requires local concurrency, bounded recovery and report-parity
verification before deploying scan/report latency changes. Focused publication
regressions are included in both the local release gate and web deployment CI.

The production behavior change is in public web/materializer. Existing worker
images remain compatible: the authorization token, payload and 150-second
deadline are unchanged. The worker source only aliases that existing deadline
to the shared constant. Inspect actual runtime consumers when planning the
eventual AWS release; no scanner runtime or regional image change is required.
