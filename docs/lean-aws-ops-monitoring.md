# Lean AWS Ops Monitoring

This runbook describes the lower-cost AWS shape for CertScore while preserving the public promise that `certscore.ai` is reachable and can accept homepage scan requests 24/7.

## Always-on services

- `certscore-web-certscore`
- `certscore-web-alb`
- `wc01-postgres-enc`
- S3 report/artifact storage
- a minimal `ws01-consentcheck-site` service only if that host still needs to answer continuously

## Cold or on-demand services

- `certscore-validation-ops-web`
- `certscore-validation-scheduler`
- `certscore-validation-worker`
- `ws01-scanner-worker`

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

The checked-in GitHub Actions workflow `.github/workflows/prod-ops-monitor.yml` runs this every 5 minutes using production secrets.

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
OPS_WAKE_SCANNER_ON_QUEUE=true
AWS_REGION=us-west-1
AWS_SCANNER_ECS_CLUSTER=certscore-validation-cluster
AWS_SCANNER_ECS_SERVICE=ws01-scanner-worker
```

`OPS_REQUIRE_DIRECT_DATABASE=false` is the default for the checked-in GitHub Actions monitor because the production Postgres instance is private to AWS networking. In that mode, the monitor still checks the public web process and public database health endpoint, but it skips direct database-only checks such as worker heartbeat rows, full-scan queue backlog, and synthetic scan completion polling. Set `OPS_REQUIRE_DIRECT_DATABASE=true` only from an environment that can reach the production database, such as an ECS-hosted monitor task or a trusted operator shell inside the VPC.

The monitor checks:

- `/api/health`
- `/api/health/database`
- validation worker heartbeat when direct database checks are enabled and validation heartbeat checks are not disabled
- scanner heartbeat when direct database checks are enabled and scanner heartbeat checks are not disabled
- queued full scans older than `OPS_SCAN_QUEUE_STALE_MINUTES` when direct database checks are enabled
- wakes the scanner ECS service to desired count `1` when direct database checks are enabled, queued scans exist, and `OPS_WAKE_SCANNER_ON_QUEUE=true`

## Synthetic homepage scan canary

After worker wake-up automation is in place, enable a synthetic scan canary on a slower schedule, such as every 30 minutes:

```bash
OPS_SYNTHETIC_SCAN_ENABLED=true
OPS_SYNTHETIC_SCAN_DOMAIN=example.com
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

Set `alarm_actions` to SNS topic ARNs to receive notifications.

## Scale-down order

1. Keep `certscore-web-certscore` at desired count `1`.
2. Enable monitor checks with worker heartbeats still required.
3. Add worker wake-up automation.
4. Set `FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT=true`.
5. Set `OPS_REQUIRE_SCANNER_HEARTBEAT=false` and `OPS_REQUIRE_VALIDATION_HEARTBEAT=false`.
6. Set `OPS_WAKE_SCANNER_ON_QUEUE=true` with scanner ECS cluster/service variables.
7. Scale workers/scheduler/ops web down one service at a time.
8. Enable the synthetic scan canary.

If queued full scans exceed the stale threshold, restore scanner worker desired count to `1` first, then investigate wake-up automation.
