# CertScore.ai verification sharding and cost review

Targets: preparation within 30 seconds after successful exact-source verification,
and fresh verification in 3–5 minutes with warm dependencies/build caches. No
production deployment or wider hosted-runner activation is included in this PR.

## What preparation means

`pnpm release:prepare --receipts <full-receipts> --out <new-directory>` verifies
every canonical full-gate receipt, actual generated package exports, safe workspace
imports and live GitHub status for six required CI workflows. It binds the clean
source, installed inputs, environment and toolchain, accepts only successes within
24 hours, and rejects a new failed/pending rerun. It performs no tests, build,
dependency installation, scanner visit or AWS mutation. A readiness snapshot is
issued only after all checks finish within 30 seconds. The snapshot grants no
deployment authority and cannot replace the deploy helper's preflight receipts,
required CI typecheck, exact-image migrations or stabilization.
Optional `--preview-mode all --preview-base <verified-live-sha>` adds the canonical
read-only deployment plan plus GitHub/AWS identity, Docker and current IP database
prerequisites. It uses fixed `--plan --no-push` arguments and cannot dispatch.

Commit-to-verified time and preparation time must be reported separately. A new
commit, changed configuration, failed gate, missing CI or stale proof requires
verification; it does not become a preparation success. The six-workflow list is
intentionally strict: a missing workflow blocks readiness, including when its
path filter did not trigger. Do not assume a skipped workflow passed.

## Partition coverage and isolation

`pnpm release:verification plan --workers 8 --out <new-plan.json>` inventories all
38 canonical full-gate parents. Only reviewed direct `pnpm exec tsx --test` commands
with literal final file lists can be partitioned. Every original option, filter
and internal test-concurrency setting remains. Package aliases, shell scripts,
globs and unknown commands execute intact. Identical filenames in different
parents are retained. No browser clock, assertion or production deadline changes.

Workers require separate clean checkouts with matching source/configuration,
toolchain, platform and architecture. Each compiles shared exports once before
its assigned checks. Worker/step transport metadata and workspace location are
normalized in a separate execution fingerprint; feature flags, NODE_OPTIONS and
unknown execution configuration remain bound. Portable dependency metadata only
normalizes pnpm's install timestamp/store location. Original local receipt rules
remain unchanged.

`worker --plan <plan> --worker <zero-based-index> --out <new-results-directory>`
writes immutable actual-attempt records. `aggregate --plan <plan> --results <all-results>
--out <new-proof.json>` rejects missing/duplicate files, missing parents, changed
commands, incompatible workers, failures, dirty/stale inputs and checks started
before bootstrap. Its partition proof is a distinct artifact; it never fabricates
whole-command receipts. It is not yet an accepted replacement for the canonical
deployment gate. Local preparation continues consuming original full receipts.
For readiness validation in a compatible environment, preparation also accepts
`--partition-plan <file> --partition-results <directory>`. It re-aggregates all
actual attempts and rechecks the exact source, execution environment, toolchain,
generated exports and live required CI. A standalone aggregate summary is not
sufficient. The new readiness snapshot cannot be passed to the deployment gate.

The hosted workflow is a **disabled template** under `.github/workflow-templates/`.
It is not registered with GitHub Actions. Even after reviewed installation, its
approval cap defaults to one worker. No repository variable, existing workflow,
schedule or runner capacity is changed here. Keep it disabled until cost review
and explicit activation approval. The template has no AWS credentials, deployment
job or live-smoke invocation. Queueing and runner concurrency availability must
be measured before choosing a production verification configuration.

## Benchmarks and interpretation

The retained baseline is exact SHA `aa4ec070f0dda6c4e84ec3a0d1dda348fe0b52cc`:
22m06s full-gate wall time, including fresh tests but warm Turbo build/typecheck
caches. `scripts/release-verification-timings.json` is explicitly scheduling data,
not a reusable success receipt. File-level durations initially use equal shares
of parent wall time; long files and internal concurrency can make that estimate
wrong. Six/eight-worker projections are models, not measured hosted results.
The default model adds 60 seconds of worker setup and another 60 seconds for
plan/aggregation jobs. `--setup-ms` and `--control-ms` expose these allowances;
they must not be silently excluded from end-to-end results. Queue delays remain
additional. Optional `--file-timings <json>` accepts measured `parent:file` timings.
Parent elapsed time includes its original internal parallelism, so equal-share
estimates can underestimate individual file cost. Calibrate against hosted runs.

`pnpm release:benchmark-shards --out <new-directory>` measures four reviewed owned
fixture files sequentially and with two process lanes on one host, retaining
real clocks, original command options and identical observed assertion names.
It requires 8 GiB plus reserve, uses no new runner and retains attempt logs. The
two-lane queue starts longest files first using the measured serial durations,
and immediately assigns the next file when a lane finishes.
These results establish only local 1→2 concurrency behavior. They do not establish
full-gate 3–5-minute performance or cold-install performance. Failed attempts must
remain failed. Do not apply retry-based or relaxed-assertion "repairs".

The first same-source owned-fixture comparison passed: serial 72.796 seconds,
two lanes 58.905 seconds (13.891 seconds / 19.1% saved), with identical observed
assertion inventories. This shows why worker balance must be measured rather
than assuming ideal scaling. Historical benchmark bytes retain their original
source fingerprint; they are not verification receipts for this document's commit.

Duration balancing improved the same 51 observed assertions from **71.447 seconds
serial to 38.700 seconds in two lanes** (32.747 seconds / 45.8% saved). These are
real local process measurements; the two-lane command total was 71.048 seconds.

Final exact-SHA measurements and limitations belong in the PR and immutable task
evidence, so a later result is never predeclared by this document.

## Costs before activation

Repository visibility was verified as **public** on November 5, 2026. GitHub's
[billing rules](https://docs.github.com/en/actions/concepts/billing-and-usage)
make standard GitHub-hosted runner compute free for public repositories. Thus
six/eight **standard** Linux workers would add **$0 compute charges** while this
repository remains public. Larger runners are excluded. Current local-only work
adds $0 recurring AWS or hosted-runner cost. No paid capacity is provisioned.

The disabled template retains small plan/result metadata for one day. A
conservative 40 MiB/run at 20 runs/month is about 0.0261 GiB-month. Even if entirely
above the included allowance, at GitHub's current
[$0.25/GiB-month artifact rate](https://docs.github.com/en/billing/concepts/product-billing/github-actions#storage-pricing)
that is about **$0.0066/month**, below $0.01. Dependencies use the existing pnpm
cache configuration plus a pinned browser-binary cache; no cache quota or paid storage limit is increased. The browser cache can evict other existing cache entries. Actual
account allowance/other artifact consumption has not been audited.

If visibility changes to private, a planning allowance of 35–50 total rounded
runner-minutes per verification would be roughly **$0.21–$0.30/run**, or
**$4.20–$6.00/month at 20 runs**, before included usage, at the current
[standard Linux x64 rate of $0.006/minute](https://docs.github.com/en/billing/reference/actions-runner-pricing).
This is a scenario estimate, not this public repository's bill or a benchmark.
Runner hardware and queueing may differ. Re-review cost and performance before
any visibility/runner-class change.

Lower-cost operational choices are the existing serial gate, a smaller matrix,
and reuse of eligible completed exact-source verification. They trade latency
for setup work and concurrency availability. Review measured wall time, total
runner-minutes, failure rate and artifact bytes before enabling six/eight workers.
