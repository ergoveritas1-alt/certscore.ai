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

## After deployment

1. Require a successful workflow conclusion.
2. Confirm ECS service stabilization.
3. Confirm the live Git SHA and `ecs-fargate` runtime target.
4. Verify the affected health, documentation, API, or MCP behavior.
5. For a migration release, confirm that the migration step succeeded before
   claiming the feature is live.
6. Report workflow URLs and any warnings or skipped checks.
