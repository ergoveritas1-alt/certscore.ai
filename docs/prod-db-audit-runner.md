# Production DB Audit Runner

Use the reusable production DB audit runner when an investigation needs scoped,
read-only database evidence from the production VPC. This avoids ad hoc laptop
Postgres access and avoids adding DB clients to live app containers.

## Command

```bash
AWS_REGION=us-west-1 \
OPS_PROD_DB_AUDIT_ECS_CLUSTER=certscore-validation-cluster \
OPS_PROD_DB_AUDIT_ECS_SERVICE=certscore-validation-worker \
pnpm ops:prod-db:audit \
  -- --audit rtb-cookie-sync \
  --input ./tmp/rtb-audit-input.json \
  --output ./tmp/rtb-audit-output.log
```

The launcher:

- resolves the task definition, subnets, security groups, container name, and
  CloudWatch log stream from the configured ECS service
- starts a one-off Fargate task with the same production network and secrets
- passes the audit input as base64 environment data
- waits for completion and prints/fetches the sanitized CloudWatch output

## Input Contract

Inputs must scope the read. The runner rejects empty scan lists, invalid scan IDs,
and inputs over 250 scans.

```json
{
  "notes": "RTB anomaly sample audit",
  "scans": [
    {
      "batch": "1301-1700",
      "manifestRow": 1301,
      "trancoRank": 1301,
      "domain": "example.com",
      "scanId": "00000000-0000-4000-8000-000000000000",
      "endpointFindingCounts": {
        "rtb_cookie_sync_observed": 0
      },
      "endpointTopFindingIds": ["pre_consent_tracking_detected"]
    }
  ]
}
```

## Supported Audits

### `rtb-cookie-sync`

Reads only the supplied scan IDs from:

- `scan_runtime_artifacts`
- `scan_snapshots`
- `scan_events`
- `validation_runs`
- `validation_run_findings`

Output is sanitized aggregate JSON between these markers:

```text
__PROD_DB_AUDIT_JSON_START__
...
__PROD_DB_AUDIT_JSON_END__
```

It does not print database URLs, cookies, raw HTML, streamed RSC, credentials, or
full response bodies.

## Required Access

The operator or CI role running the launcher needs:

- `ecs:RunTask`
- `ecs:DescribeServices`
- `ecs:DescribeTaskDefinition`
- `ecs:DescribeTasks`
- `iam:PassRole` for the selected task definition roles
- `logs:GetLogEvents`

The ECS task must already have production database credentials injected. Prefer
`DATABASE_READ_URL` backed by a read-only database user. If only `DATABASE_URL`
is present, the audit code still uses read-only query calls and performs no
mutations, but the credential itself is not least-privilege.

## Safety Rules

- Use explicit scan IDs, batch IDs, or narrow time windows.
- Keep audit outputs sanitized and aggregate-oriented.
- Do not use this runner to execute arbitrary SQL.
- Add new audits as named allowlisted handlers in
  `apps/validation-worker/scripts/prod-db-audit.ts`.
- Keep scan-to-report investigations on the canonical path: observed runtime
  evidence -> normalized concern -> concern policy -> unified finding ->
  executive/regulatory projection.
