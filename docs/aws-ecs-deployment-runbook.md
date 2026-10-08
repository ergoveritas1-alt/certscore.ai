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
