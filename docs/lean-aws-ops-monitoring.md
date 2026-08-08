# Lean AWS Ops Monitoring

This runbook describes the lower-cost AWS shape for CertScore while preserving the public promise that `certscore.ai` is reachable and can accept homepage scan requests 24/7.

## Always-on services

- `certscore-web-certscore`
- `certscore-web-mcp` (one task while MCP sessions remain process-resident)
- `certscore-web-alb`
- `wc01-postgres-enc`
- S3 report/artifact storage
- a minimal `ws01-consentcheck-site` service only if that host still needs to answer continuously

## Cold or on-demand services

- `certscore-validation-worker`

These services can be scaled down only when a wake-up path exists. Full scans may be accepted while scanner capacity is cold only when:

```bash
FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT=true
```

That flag changes the web app from "reject scans when scanner heartbeat is stale" to "queue scans and rely on worker wake-up monitoring."

## Required pulse checks

Run the production ops monitor on a schedule, for example every 5 minutes:

```bash
pnpm ops:monitor:prod
```

The checked-in GitHub Actions workflow `.github/workflows/prod-ops-monitor.yml` runs this every 5 minutes. It runs the public web/ECS monitor from GitHub, and can run the private database, worker-heartbeat, backlog, and synthetic-canary probe as a one-off ECS Fargate task inside the validation cluster network when `OPS_AWS_DB_PROBE_ENABLED=true`.

Required environment:

```bash
OPS_BASE_URL=https://certscore.ai
OPS_ALERT_TO_EMAIL=ops@example.com
GMAIL_SMTP_USER=...
GMAIL_SMTP_APP_PASSWORD=...
```

Recommended lean-mode environment:

```bash
OPS_REQUIRE_SCANNER_HEARTBEAT=false
OPS_REQUIRE_VALIDATION_HEARTBEAT=false
OPS_REQUIRE_DIRECT_DATABASE=false
OPS_SCAN_QUEUE_STALE_MINUTES=10
AWS_REGION=us-west-1
OPS_AWS_DB_PROBE_ENABLED=true
OPS_AWS_MONITOR_ECS_CLUSTER=certscore-validation-cluster
OPS_AWS_MONITOR_ECS_SERVICE=certscore-validation-worker
```

`OPS_REQUIRE_DIRECT_DATABASE=false` is the default for the GitHub-hosted monitor because the production Postgres instance is private to AWS networking. In that mode, `pnpm ops:monitor:prod` still checks the public web process, public database health endpoint, and configured ECS services. With `OPS_AWS_DB_PROBE_ENABLED=true`, the workflow then runs `pnpm ops:monitor:prod:aws`, which launches `apps/validation-worker/scripts/prod-ops-db-probe.ts` in Fargate using the validation worker task definition, subnets, security groups, and production secrets. Set `OPS_REQUIRE_DIRECT_DATABASE=true` only from an environment that can reach the production database directly, such as the ECS-hosted probe or a trusted operator shell inside the VPC.

For scoped investigation work, use the reusable production DB audit runner rather
than laptop DB access or ECS Exec into app containers:

```bash
pnpm ops:prod-db:audit -- --audit rtb-cookie-sync --input ./tmp/audit-input.json
```

See `docs/prod-db-audit-runner.md` for the input contract, access model, and
sanitization rules.

The monitor checks:

- `/api/health`
- `/api/health/database`
- configured ECS services from `OPS_ECS_SERVICE_TARGETS` or the active `AWS_WEB_*`, validation worker, and `AWS_SCANNER_*` variables
- validation worker heartbeat when direct database checks are enabled and validation heartbeat checks are not disabled
- scanner heartbeat when direct database checks are enabled and scanner heartbeat checks are not disabled
- queued full scans older than `OPS_SCAN_QUEUE_STALE_MINUTES` when direct database checks are enabled
- relies on the production v2 DAG Lambda scanner for queued scans; no scanner ECS wake path exists

The JSON output is intentionally sectioned so the first screen answers the operational questions directly:

- can users use the app?
- are scans being picked up?
- are workers alive?
- is anything stale?

## Synthetic homepage scan canary

After worker wake-up automation is in place, enable a synthetic scan canary on a slower schedule, such as every 30 minutes:

```bash
OPS_SYNTHETIC_SCAN_ENABLED=true
OPS_SYNTHETIC_SCAN_DOMAIN=ergoveritas.com
OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES=15
pnpm ops:monitor:prod
```

The canary posts to `/api/full-scan`, waits for the scan to complete in the database, and alerts if the queue or worker path fails.

Do not enable this on a one-minute schedule. It creates real scan rows and real scanner work.

For a manual canary from GitHub Actions, run the **Production Ops Monitor** workflow with `synthetic_scan=true`.

## AWS alarms

The web ECS Terraform stack defines ALB target health alarms:

- `${project_name}-certscore-no-healthy-targets`
- `${project_name}-certscore-unhealthy-targets`

Set the web stack's `alarm_actions` to SNS topic ARNs to receive those
notifications.

The regional scanner stack uses `alarm_actions_by_region`. CloudWatch alarms
and their SNS notification topics are regional, so configure a same-region
topic separately for `eu-central-1`, `eu-west-1`, and `us-west-2`.

## Scale-down order

1. Keep `certscore-web-certscore` at desired count `1`.
2. Enable monitor checks with worker heartbeats still required.
3. Add worker wake-up automation.
4. Set `FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT=true`.
5. Set `OPS_REQUIRE_SCANNER_HEARTBEAT=false` and `OPS_REQUIRE_VALIDATION_HEARTBEAT=false`.
6. Confirm the three approved v2 DAG Lambda scanner regions are healthy.
7. Scale workers/scheduler/ops web down one service at a time.
8. Enable the synthetic scan canary.

If queued full scans exceed the stale threshold, restore scanner worker desired count to `1` first, then investigate wake-up automation.
