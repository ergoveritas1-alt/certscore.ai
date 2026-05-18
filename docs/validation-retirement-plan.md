# Validation Surface Retirement Plan

## Current Decision

The product-facing validation admin surface is retired from `apps/web`. The validation scheduler and validation ops web service have been scaled to zero. The validation ECS worker is not safe to shut down yet because production ops monitoring currently uses it as a private AWS execution lane for database probes and scheduled monitoring sweeps.

## Keep Running Until Migrated

- `certscore-validation-worker`
- Any task definition or service used by `pnpm ops:monitor:prod:aws`
- Any GitHub Actions variables that route production DB probes through the validation worker task definition

Recent production monitor runs have used the validation worker lane for:

- `OPS_AWS_DB_PROBE_COMMAND=pnpm --filter @website-signal-risk-scanner/web monitoring:sweep -- --limit=2`
- `@website-signal-risk-scanner/validation-worker ops:prod-db-probe`

Do not scale the validation worker to zero while `OPS_AWS_DB_PROBE_ENABLED=true` or `OPS_REQUIRE_VALIDATION_HEARTBEAT=true` still depends on that worker heartbeat.

## Migration Target

Create or repoint production ops monitoring to a neutral private ECS runner, for example `certscore-ops-runner`, with the smallest runtime needed to:

- Run `pnpm ops:monitor:prod:aws` commands inside the private AWS network.
- Reach the production database using existing secret injection patterns.
- Run the scheduled monitoring sweep command.
- Run the production DB probe without requiring validation-specific worker heartbeat semantics.

The scanner service and WS01 runtime must remain untouched. The current `certscore-validation-cluster` name is overloaded and may contain non-validation scanner services.

## Shutdown Gates

Before scaling down or deleting validation services:

1. Retarget `OPS_AWS_MONITOR_ECS_CLUSTER` and `OPS_AWS_MONITOR_ECS_SERVICE` to the neutral ops runner.
2. Set `OPS_RUNNER_ECS_CLUSTER` and `OPS_RUNNER_ECS_SERVICE` so manual prod DB audit, preconsent rerun, nano backfill, and monitor launchers prefer the neutral runner over validation fallbacks.
3. Disable or replace `OPS_REQUIRE_VALIDATION_HEARTBEAT`.
4. Confirm `OPS_AWS_DB_PROBE_ENABLED=true` succeeds through the new runner.
5. Confirm scheduled monitoring sweep succeeds through the new runner.
6. Confirm scanner heartbeat and full-scan backlog checks still pass.
7. Confirm at least one full `prod-ops-monitor` scheduled run passes after migration.
8. Record before/after ECS desired counts and GitHub Actions variable values.

## Decommission Order

1. Remove product web validation routes and navigation.
2. Migrate production ops monitor/probe execution off the validation worker.
3. Keep `certscore-validation-scheduler` and `certscore-validation-ops-web` at desired count zero.
4. Scale `certscore-validation-worker` to zero.
5. Disable validation worker deploy workflows.
6. Delete validation-specific Terraform/service definitions after a quiet period.
7. Remove validation worker packages, root scripts, and unused validation-shared code only after confirming no calibration or reporting paths still import them.

## Explicit Non-Goals

- Do not delete scanner services.
- Do not delete the shared ECS cluster solely because its name contains `validation`.
- Do not remove `packages/validation-shared` until the finding calibration and reporting imports are migrated or explicitly abandoned.
