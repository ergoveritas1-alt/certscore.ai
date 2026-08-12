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

## Monitoring cold ARM64 builds

The public web workflow currently builds a Linux ARM64 image on an x64
GitHub-hosted runner. A warm cached image commonly finishes quickly, but a cold
build after shared-package, lockfile, Dockerfile, or broad web changes may take
45–60 minutes under emulation.

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

## Native ARM64 improvement

Moving ARM64 image construction to a provisioned native ARM64 runner or managed
remote builder is the preferred performance improvement. Do not change
`runs-on` to an ARM64 label until the runner is provisioned, protected for
production use, and verified to support AWS OIDC, Docker Buildx, ECR access,
and the repository's required actions. Preserve the x64 workflow as a fallback
until native builds have demonstrated digest and runtime parity.

## After deployment

1. Require a successful workflow conclusion.
2. Confirm ECS service stabilization.
3. Confirm the live Git SHA and `ecs-fargate` runtime target.
4. Verify the affected health, documentation, API, or MCP behavior.
5. For a migration release, confirm that the migration step succeeded before
   claiming the feature is live.
6. Report workflow URLs and any warnings or skipped checks.
