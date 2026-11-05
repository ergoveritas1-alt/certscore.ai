# AWS ECS production deployment runbook

This runbook governs production deployments for the CertScore public web and
hosted MCP services. Root `AGENTS.md` requires agents to read this document
before starting or monitoring either deployment.

## Deployment paths

- Public web: `.github/workflows/web-aws-ecs-deploy.yml`
- Hosted MCP: `.github/workflows/mcp-aws-ecs-deploy.yml`
- Runtime: AWS ECS/Fargate
- Images: immutable Git-SHA images in Amazon ECR

Do not use Vercel or an ad hoc local container as a production deployment path.

## Before dispatch

1. Require a clean, committed worktree and a pushed branch.
2. Verify the live web revision at `https://certscore.ai/api/version`.
3. Run the change-aware deploy plan and relevant readiness checks.
4. Confirm that the target commit is a forward deployment unless an intentional
   emergency rollback has been explicitly approved.
5. Deploy only the affected services. Scanner deployment is separate from the
   web and MCP workflows.

Coupled deploy-all releases wait for successful web and affected validation
consumer promotions before deploying scanner producers. New evidence vocabulary
must not reach readers from an earlier release. Failed, rejected or unresolved
consumer outcomes preserve the current scanner image. Verify the installed,
current IP-country and ASN databases locally before starting any deploy-all or
scanner mutation; the canonical installer may reuse verified existing files.

After pushing a new `main` revision, the canonical helper gives GitHub up to
20 seconds to expose the push-triggered web/validation runs before dispatching
a fallback. Reuse only an exact-SHA active or successful run; canceled and
failed runs are not reusable. Prefer a running job over a queued duplicate.
If discovery fails, stop rather than dispatching blindly. Intentional forced
runtime-base or database dispatches must bind to the new manual run.

If duplicate runs are discovered, preserve the active image build and cancel
only the redundant queued run. An unrelated workflow may be canceled before
its image build begins. Keep the cancellation rule below for image builds.
Release success also requires `/api/version` to report the exact target SHA
and `ecs-fargate`; a general deployment audit warning is not sufficient.

## Monitoring ARM64 builds

The public web workflow builds its Linux ARM64 image on GitHub's native ARM64
runner. Registry-backed BuildKit layers are restored across runs. A manually
dispatched deployment may set `use_x64_fallback` only when the native runner is
unavailable; that path builds through emulation and can take 45–60 minutes
after a cold invalidation.

A step that remains `in_progress` is not, by itself, stuck. The following are
positive progress and must not trigger cancellation:

- package installation or TypeScript package builds;
- Next.js compilation or type validation;
- static-page generation;
- `Collecting build traces` or final page optimization;
- runner-stage construction;
- image or registry-cache export;
- image push to ECR.

Workflow heartbeat messages are liveness diagnostics, not proof that the child
build is advancing. Use the underlying build output and cache/export state as
the authoritative evidence.

## Cancellation rule

Do not manually cancel a web or MCP image build unless all of these are true:

1. the workflow has exceeded its normal cold-build range;
2. no new underlying build, export, or push output has appeared for at least 15
   minutes;
3. no image/cache progress is observable; and
4. the workflow's own timeout is not close enough to make manual intervention
   unnecessary.

Never cancel solely because the workflow has not transitioned to the next
step. In particular, do not cancel after successful compilation or static-page
generation while build traces, image export, cache export, or push may still be
running. Cancellation before cache publication can make the retry repeat the
entire cold build.

If cancellation is genuinely required, record the last meaningful build line,
the last-output timestamp, total elapsed time, and the reason the automated
timeout was insufficient.

## Workflow safeguards

The ECS workflows should provide:

- explicit job and image-build timeouts;
- plain build output and periodic heartbeat messages;
- registry-cache presence diagnostics;
- immutable Git-SHA image tags;
- database migrations from the exact target web image before ECS promotion;
- ECS service-stability waits before success is reported.

The heartbeat process must be stopped when the build exits and must not hide or
replace the Docker build's exit status.

## Native ARM64 fallback policy

The normal path uses `ubuntu-24.04-arm`. Preserve the manual x64 fallback until
native builds have demonstrated repeated digest and runtime parity. Use the
fallback only for native-runner availability or compatibility incidents, and
record the reason when dispatching it. Both paths must retain AWS OIDC, Docker
Buildx, ECR access, immutable Git-SHA tagging, and the exact-image migration
step.

## Reusing verified build work

Web and validation builds use `scripts/docker-source-policy.json` to resolve the
existing Node 22 build input from its digest-pinned Docker Official Image mirror
in public ECR. The web CI PostgreSQL service uses the same official mirror.
This avoids shared-runner Docker Hub anonymous pull limits without changing
Dockerfiles or rebuilding runtime bases. When updating these pins, verify the
original Docker Hub and public ECR manifest digests match, retain both ARM64 and
AMD64 support, and run a local BuildKit conversion smoke test plus deployment
contract checks. Keep required CI checks and exact-image promotion unchanged.

Validation builds may recover once from an exact public Node mirror manifest
`429` using `scripts/build-with-pinned-node-fallback.mjs`. The helper verifies the
same approved digest at its original Docker Official Image source before making
a temporary source policy for that build. It preserves all build arguments and
the checked-in policy, and fails closed on mismatched or unavailable proof,
cancellation, unrelated errors, or a failed second build. This does not change
Node/Chromium versions, runtime-base approval, image provenance or deployment
health checks. Successful primary builds add no registry call.

The required web CI typecheck runs route type generation and the complete web
TypeScript check before the image build. Only its successful output supplies
`WEB_TYPECHECK_VERIFIED_SHA`; Next.js reuses that check only when it exactly
matches the image's full `BUILD_GIT_SHA`. Unverified local/manual builds and
mismatched receipts retain Next.js type validation. Lint, compilation, runtime
contracts, migration ordering and ECS health gates remain enabled.

Runtime-base changes are compared through `scripts/runtime-base-changes.mjs`.
Dependency manifests, lockfiles, patches, dependency-install inputs, Node/OS
images and runtime stages remain rebuild inputs. App source, build SHA metadata
and package-script-only edits do not require a new runtime base. Missing or
unrecognized inputs request a rebuild. Web bootstraps a missing base and permits
an intentional `push_runtime_base` dispatch; validation retains its explicit
runtime-base rebuild gate.
Web reuse additionally requires the published base's runtime-input fingerprint
to match the current source. A missing or mismatched fingerprint rebuilds it,
including after a failed dependency-changing deployment. This first release
labels the existing cached base; subsequent matching releases reuse it.

Validation publishes the registry cache it imports on the next run. Its image
metadata belongs only to the runtime stage; dependency compilation is independent
of the release SHA and precedes app/server source. Workspace runtime packages
are still replaced from the current application build. Keep cache/base tags
during cleanup, and inspect cache export logs before judging a build stalled.
The web/validation Terraform lifecycle policies give the bounded mutable
cache/base tags priority over release-image cleanup. Preview those policies
against their actual ECR repositories before applying them; do not apply
Terraform merely to publish an application release. Untagged cleanup and the
release-image count limit remain in place. Estimated incremental cache/base
storage is under $0.90/month; no paid capacity or runtime settings change.

## Optimization rollout status — October 8, 2026

The clean-source workspace build passed all 19 packages at the existing 8 GB
heap limit, including Next compilation, lint and type validation. The earlier
8 GB/12 GB failures occurred in the long-lived development checkout; a passing
container alone was not used to waive the failed gate. For local readiness,
use a clean checkout of the exact source, install with the frozen lockfile and
build workspace dependencies before running the full and change-aware gates.
Keep ignored scan artifacts and local environment files out of that checkout.
Record source hashes and gate results; do not increase the heap or fabricate a
CI typecheck receipt to bypass an unresolved failure.

Cache/base protection was previewed against all three affected ECR repositories
and applied as a separate scoped lifecycle-policy update. Every preview expired
zero current images. Public web retains its 14-day untagged cleanup and 20-image
limit; validation retains its existing one-day untagged cleanup and 15 tagged
images. Terraform now reflects those validation limits. No broader Terraform
apply or capacity change was performed. Estimated incremental cache/base storage
remains under $0.90/month.

Release `20d17e61` bootstrapped the web runtime base, published its input
fingerprint and both web/validation caches, and completed web, validation and
MCP deployments. The web workflow completed in 10m 26s versus the previous 11m 26s; its image
stage took 237s versus 290s. These are whole-run comparisons, not isolated causal
benchmarks. Compare a later warm release before claiming cache-reuse savings.

The scanner verification failed before navigation in all three regions. A
missing runtime-base tag in a replication destination incorrectly selected a
full build, installing Chromium 154 instead of the previously verified 151.
Restore the working scanner image before diagnosis. Routine selection now checks
only the build region and stops if its base is unavailable; destination tags are
irrelevant because the application image is built once and replicated. Do not
silently rebuild Chromium or repeat successful ECS deployments to repair this.
Retain the failed smoke evidence and verify browser navigation after recovery.
The targeted scanner correction (`75190099`) completed in 2m 45s, reused the
existing base, and passed HTTP 200 bot-auth navigation in all three regions.
Both primary and inventory functions retain the same verified image digest.

Fresh SITS diagnostic timing verification requires an explicit one-run exception
to its repository testing hold and central contact cooldown. Release checks and
read-only production verification do not authorize that contact. Retained replay
savings cannot be added across parallel lanes or reported as measured fresh-scan
improvement. Record the deployed revision, workflow evidence, scan-to-report
measurements and any remaining limitations in the release work summary.

## After deployment

1. Require a successful workflow conclusion.
2. Confirm ECS service stabilization.
3. Confirm the live Git SHA and `ecs-fargate` runtime target.
4. Verify the affected health, documentation, API, or MCP behavior.
5. For a migration release, confirm that the migration step succeeded before
   claiming the feature is live.
6. Report workflow URLs and any warnings or skipped checks.

## Release preparation and artifact overlap

For CertScore.ai release work, use an isolated checkout outside synced Documents,
install the frozen lockfile, and use `pnpm preflight:full` for shared build changes.
The release entry point supplies the repository TypeScript configuration before
loading tsx. `node scripts/release-node.mjs scripts/check-regional-web-bot-auth.ts
--check-imports` verifies imports without any AWS request or canary invocation.
The canonical deploy helper checks Node/pnpm, GitHub/AWS authentication, Docker
and the existing country/ASN database freshness before expensive work.

Preflight builds package exports first, expanding reviewed package build wrappers
so each compiler/export command runs once in dependency order. Unknown lifecycle
commands fail before any build. Remaining work has at most two bounded lanes;
browser, database, build, type generation and unknown groups run exclusively.
`pnpm preflight:full -- --inventory` lists exact commands, package scripts,
configurations, test files/globs, filters, dependencies and resource reservations.
No browser timing coverage or production deadline is shortened.

Each executed check writes an immutable attempt receipt in the directory printed
by preflight. Receipts contain the exact source SHA, tracked tree/worktree and
untracked input fingerprint, hashed environment/configuration, toolchain,
command, timestamps, duration and exit status. Failed receipts are retained.
Bootstrap reuse additionally verifies actual generated export bytes and imports.
Only successful receipts for the same clean commit, inputs and configuration,
completed within 24 hours, can be reused:

```sh
pnpm preflight:full -- --receipt-dir /tmp/certscore-release-receipts
pnpm preflight:full -- --reuse-receipts /tmp/certscore-release-receipts
pnpm deploy:all -- --base <live-sha> --no-predeploy --preflight-receipts /tmp/certscore-release-receipts
```

The last command validates every required receipt; it is not an unchecked bypass.
Local receipts never set `WEB_TYPECHECK_VERIFIED_SHA` and never replace CI.
Do not edit a receipt to bind old results to a new commit. Start a new gate after
source changes. Preserve historical and failed attempt files.

After required checks, coupled releases prepare the single scanner image and
regional replicas concurrently with web and affected validation consumers.
Preparation has no Lambda writer. Complete regional digest parity and embedded
SHA/tag checks precede promotion. All code, settings and provenance environment
writes stay behind both consumer outcomes. Failed/unresolved consumers or failed
preparation prevent every scanner runtime mutation. Existing runtime-base reuse,
regions, budgets, worker bounds and optimistic revision checks remain mandatory.
Concurrent artifact operations drain before temporary credentials are removed.

Web CI runs compatibility/typecheck and the owned form/browser gate independently;
both must succeed before the native ARM64 image job starts. Only the successful
exact-SHA CI typecheck supplies its receipt. Compiler restoration is off by default; manual `use_compiler_cache` is reserved
for a separately authorized deployment benchmark. Local actual-app timings did
not demonstrate a material wall-time gain. When enabled, restoration copies only
webpack/SWC caches into a freshly cleared `.next`; it never restores release
output, route types, build identity or a typecheck receipt. Cache snapshots are
bounded to 512 MiB within the existing GitHub cache quota. Opt-in production Webpack
filesystem caches use its native gzip format so the actual web cache fits that
bound; development and non-filesystem caches are unchanged. Optional cache export overlaps ECS stabilization. Cache export failure is
an optimization miss; exact-image migrations and ECS stabilization still gate
release success. Benchmark locally with
`node scripts/benchmark-web-compiler-cache.mjs /tmp/compiler-cache-benchmark.json`;
its owned minimal fixture is not a production-build benchmark.

Deployment skipping requires positive runtime-input equivalence against the
installed service revision. Web reads `/api/version`; hosted MCP reads the stable
isolated ECS task image. Canonical validation/scanner selection verifies their
own installed images before skipping. Documentation and erased type-only edits
retain compatibility checks. Missing revisions, dependency/build changes,
unsettled services and unknown inputs conservatively require deployment. Existing
exact-SHA workflow discovery, duplicate-dispatch safeguards and production
concurrency groups remain in place.

This change adds no AWS capacity, schedules or recurring AWS cost. Extra standard
hosted-runner setup is estimated below $0.50/month at 20 releases/month; caches use
the existing quota without increasing paid storage. The extra local memory
reservation can delay a gate on a busy machine. Production wall-time savings
require a future separately authorized comparable warm release; do not add
parallel task totals or fixture savings to production deployment savings.

### Preparation and isolated verification benchmark

The follow-up verification-only path and costs are documented in
`docs/operations/2026-11-05-verification-sharding-cost-review.md`. Use
`pnpm release:prepare --receipts <full-receipts> --out <new-directory>` after the
exact clean source has passed the full gate and required CI. Its 30-second target
measures readiness validation; fresh verification is measured separately.
The snapshot does not replace deploy preflight or required CI and does not
authorize deployment. Partitioned verification is a disabled benchmark template;
review costs before activating additional runners. Existing canonical full/fast
commands, browser timing coverage, migrations and stability gates remain intact.

### Staged web and scanner promotion

Staged promotion is an opt-in path for a warm coupled release on the exact
current remote `main` commit. Enabling the repository variable
`AWS_STAGED_COUPLED_RELEASES=true` defers the web push run to the explicit
staging dispatch and makes validation push runs verification only. The deferred
web run starts no runners and shares no concurrency group with staging. Keep the
flag enabled from before merge through promotion. Review that switch separately
before adopting it. Existing explicit manual deployments remain available.

From a clean isolated checkout with the canonical HTTPS GitHub origin, record the
current production web SHA and run
`pnpm preflight:all -- --staged --base "$LIVE_SHA" --receipt-dir "$PREFLIGHT_RECEIPTS"`.
This checks local tools, auth, origin, the live base, candidate ancestry, affected
services and warm runtime requirements before starting the test suite. After
workspace bootstrap, the web source contract group runs first. A pre-merge
candidate can pass while the staging flag is still unset. For a prerequisite-only
check use `pnpm deploy:all -- --check-staging --base "$LIVE_SHA"`.
Keep the receipt directories outside the checkout. Once the gate passes, stage
the web, scanner, and any affected validation artifacts.

```sh
pnpm deploy:all -- --ref "$RELEASE_SHA" --base "$LIVE_SHA" --no-push \
  --no-predeploy --preflight-receipts "$PREFLIGHT_RECEIPTS" \
  --preserve-scanner-operational-settings --stage-release "$STAGED_RELEASE_JSON"
```

Staging runs both existing web CI jobs, pushes the SHA-tagged web image with an
ECR-only session, and builds and replicates one scanner digest. It writes a
private receipt with the exact successful GitHub attempt, the web digest, the
three scanner image references, and hashes of the existing scanner settings.
When validation is affected, its workflow also completes the form check,
typecheck, and pipeline tests before building and recording the worker digest.
The web and validation stage receipts expire after one day. Use a fresh stage
after a source, image, settings, or workflow-attempt mismatch.

After production approval, use the same command with
`--promote-release "$STAGED_RELEASE_JSON"` in place of `--stage-release`.
The workflow checks the stored ECR digest and the live base, then runs the
migration task from that digest, waits for ECS stability, and verifies the
expected task definitions. The orchestrator verifies the live web revision.
Affected validation promotes its staged digest in parallel with web and retains
its ECS boot check. Missing staged validation proof stops a coupled release
when validation is affected. All scanner writes wait for both affected
consumers to succeed. The six Lambda functions
can then converge concurrently, with the existing revision, provenance,
health, and settings checks per function. A retry of the same approved receipt
can reuse a successful matching web promotion while the release is current.

Measure command-to-verified wall time, the web queue and rollout, the affected
validation lane, all six scanner handoffs, and final verification. Staged ECS
promotion polls every three seconds for the exact completed task definition,
desired running count, and removal of prior deployments. It records when new
tasks were seen running and the available ECS registration, drain, and stop
events. The migration task reports its pull and run timestamps. Scanner
parity reports each region separately after concurrent readbacks. The staged
path uses existing runners, ECR repositories and retention policies.
Normal stage-and-promote publishes the same release images once. Abandoned
stages use storage under the existing retention policy and should be included
when reviewing activation cost.
