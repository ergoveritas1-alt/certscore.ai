# Report publication ownership release — October 8, 2026

Status: deployed and production-verified. Runtime revision: `9b7c9a81630abe51c1608c88e7f0ed3f7bce8386`. The production verification completed October 8 Pacific / October 9 UTC.

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

## Cost and verification scope

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

The production measurements below verify this fix on three owned runs. They
do not establish a production percentile or fleet-wide latency saving. The previous 12.897-second production outcome remains historical
evidence; this localhost reproduction establishes its race mechanism, not its
exact elapsed time or a production percentile.

`AGENTS.md` now requires local concurrency, bounded recovery and report-parity
verification before deploying scan/report latency changes. Focused publication
regressions are included in both the local release gate and web deployment CI.

The production behavior change is in public web/materializer. Existing worker
images remain compatible: the authorization token, payload and 150-second
deadline are unchanged. The worker source only aliases that existing deadline
to the shared constant. Actual runtime consumers were checked for the targeted AWS release; no scanner
runtime or regional image change was required.


## Exact release gate and AWS promotion

The exact clean runtime commit `9b7c9a81` passed `pnpm preflight:full` with
**exit code 0** in `/tmp/certscore-publication-release-7C7e2Y` before promotion.
All 19 workspace typechecks and 19 workspace builds passed at the unchanged
memory limit; the final 50 projection/result/selection tests passed. The
source fingerprints matched the development checkout, and both checkouts were
clean. `release-exact-gate.json` binds the SHA, source hashes and full log hash.
This supersedes the incomplete whole-gate receipt described historically above.

The fast-forward merge into main was released using the canonical
`pnpm deploy:web` helper. The duplicate local preflight was omitted only after
this exact successful full gate; required workflow guards, tests, typechecks,
migrations and health checks remained enabled. The helper reused the exact-SHA
push-triggered [web workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37869181576).
It succeeded, verified `/api/version` at the exact SHA with `ecs-fargate`, and
verified both ECS services stabilized:

- public web: task definition `certscore-web-certscore:703`, 2/2 running;
- dedicated materializer: `certscore-web-certscore-materializer:266`, 1/1 running.

Both services use the same immutable target image and digest. The helper took
10m 18s; the workflow job took 601s. Image build/push took 213s versus 241s on
the preceding release; migrations took 50s. The unchanged runtime base was
reused. These are whole-run/stage comparisons, not isolated causal benchmarks.

[Required validation CI](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37869181623)
passed its web contract, worker pipeline and live smoke jobs. Broad path filters
also triggered validation and MCP deployment runs `37869181700` and
`37869181573`; both were cancelled before image builds. The only changed
worker runtime expression aliases the same existing 150,000-ms deadline; the
shared artifact-transfer module is not exported to or consumed by MCP. No
worker behavior, scanner image, runtime base or capacity change was required.
The live-deployment audit's sole warning is the already-unconfigured secondary
host; the primary host and affected services passed.

## Fresh owned production verification

The registry check and read-only central contact-history check passed before
fresh verification on the authorized owned `https://ergoveritas.com/testar1.html`
page in EU-DE. No SITS or rotating public target was contacted. Scans were
sequential, used the ordinary existing six-lane production path, and submitted
no forms. Estimated one-time verification compute, scan and artifact-read cost
is below $0.10 total; no recurring diagnostic service was added.

| Owned run | Scanner completion → persisted report | Request → report visible in browser |
| --- | ---: | ---: |
| [First](https://certscore.ai/scan/07139777-7553-4a65-a3f9-84b4b5e456a3) | 5.415s | 25.583s |
| [Second](https://certscore.ai/scan/e731bf86-d330-459d-9a64-c29c9320d9b7) | 5.097s | 20.263s |
| [Explicit status polling](https://certscore.ai/scan/ce4bf3d3-5015-44f3-817a-1512720b2201) | 4.143s | 18.712s |

The public report route did not emit status-endpoint calls during the first two
browser runs. A late API v2 status-read check on the second scan happened after
readiness and is not race evidence. The third scan therefore explicitly polled
the affected `/api/scan-status/{id}?includeFindings=0` endpoint from dispatch
through readiness alongside the report browser. All 17 polls returned 200,
including three with a completed scan and a finalizing report followed by ready.

For every scan, CloudWatch logs verify exactly one worker `publish_report`
request, its first response 200, exactly one canonical materialization on the
dedicated materializer, and two verified transferred original artifacts. No
public web task materialized a competing report. Database inspection verifies
one terminal Lambda result and one unified derivation, a ready persisted report
and a completed durable materialization request. All retained bundle, manifest,
Accept and Reject artifact sizes and hashes match their terminal metadata.
Typed schemas and all six joined, completed lanes passed verification. Existing
fixture expectations remained intact: score 84, A/R/O observed, confirmed
Accept with four observations, confirmed clean Reject with the complete
8-second window, zero forms, and no browser errors. The zero-form result is an
expectation of this owned fixture, not evidence about SITS.

The prior 12.897-second polling/publication contention was not reproduced. These
three samples confirm the mechanism and preserve the report; they do not prove
that all production scans are faster or establish a tail percentile. The
remaining measured 4.1–5.4 seconds includes result delivery, canonical input
preparation, verification, projection and persistence. Those stages were not
removed to shorten latency.

Production receipts in the same ignored artifact directory include
`web-workflow-final.json`, `required-ci-final.json`, `production-ecs-verification.json`,
`owned-pair-verification.json`, `production-publication-mechanism-verification.json`
and `owned-after-3-active-status-polls.json`. The merged branch and temporary
clean verification checkout were removed after source preservation; the archived
SITS worktree snapshot and all retained diagnostic evidence remain preserved.
Git's pre-existing unreachable-object/GC warning was left untouched: no object
pruning or forced garbage collection was performed.
