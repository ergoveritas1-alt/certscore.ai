# CertScore MCP Preview Runbook

This runbook covers the WC01 developer-preview MCP server for CertScore Pulse.

## Scope

The MCP server is a control-plane integration surface over existing Pulse API behavior. It must not add scan-to-report logic.

Any scan/report behavior must continue to flow through:

1. WS01 observed runtime signal identification, evidence capture, and logging
2. WC01 normalized concern mapping
3. WC01 concern policy
4. WC01 unified finding projection
5. WC01 executive/regulatory projection

Do not add synthetic evidence, display-layer promotion, repair-based findings, raw signal shortcuts, or one-off surfacing paths in MCP code.

## Local Or Staging Prerequisites

- A reachable PostgreSQL database through `DATABASE_URL`
- WC01 migrations applied
- Node and pnpm matching repo engines

Local `.env.local` example:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/certscore
DATABASE_SSL_MODE=disable
```

For the fully local sharded Lambda simulator, also use:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
CERTSCORE_V2_DAG_LAMBDA_ENABLED=true
CERTSCORE_V2_DAG_LAMBDA_SIMULATED=true
CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE=sharded
CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local
```

## Run The MCP Light Preview Workflow Locally

Start the local scan stack:

```bash
pnpm local:scan:ready
```

Start MCP Light in another terminal:

```bash
CERTSCORE_BASE_URL=http://127.0.0.1:3000 \
MCP_PUBLIC_URL=http://127.0.0.1:3004 \
OAUTH_ISSUER=http://127.0.0.1:3004 \
CERTSCORE_OAUTH_JWT_SECRET=local-test-secret-at-least-16 \
CERTSCORE_MCP_INITIAL_PRECONSENT_PREVIEW_WAIT_MS=10000 \
pnpm dev:mcp
```

Run one fresh owned-canary case:

```bash
pnpm mcp:light:benchmark -- \
  --endpoint http://127.0.0.1:3004/mcp/light \
  --case-ids owned-canary-1 \
  --concurrency 1 \
  --timeout-seconds 180 \
  --run-id localhost-preview-6s
```

The initial `certscore_scan_site` result must retain one stable `scanId`. When
the bounded runtime handoff arrives in time, it must also report
`initialPreConsentPreviewReturned=true`, preliminary cookie/tracker counts, and
an active status. The benchmark must then poll sequentially, reach a usable
terminal status, and retrieve a scan-bound bundle without submitting another
scan. A one-case run still reports the full-suite reuse and legacy-case gates as
unexercised; evaluate the individual case result for this focused smoke.

The localhost simulator writes its streamed fake-SQS messages to
`artifacts/local-v2-dag-lambda-simulated/<scanId>/sqs-messages.ndjson`. This
bridge is local-only. It verifies the preview message, artifact checksum,
packet source hash, scan identity, and normalized target before retaining the
same `v2_runtime_preview.received` event consumed by status projection. It does
not alter AWS dispatch or production result ingestion.

## Apply Migration

```bash
pnpm db:migrate
```

This applies `packages/db/migrations/0120_integration_api_keys.sql`, which creates `integration_api_keys`.

## Generate Preview Key

```bash
pnpm mcp:certscore:generate-key -- --name "CertScore MCP preview"
```

Optional:

```bash
pnpm mcp:certscore:generate-key -- \
  --name "CertScore MCP preview" \
  --scopes pulse:read,pulse:scan,mcp \
  --expires-at 2026-12-31T23:59:59Z
```

The raw token is printed once. Store it securely. WC01 stores only the token hash.

## Run Authenticated MCP Smoke

```bash
CERTSCORE_API_KEY=<generated-token> pnpm mcp:certscore:smoke
```

Optional target URL:

```bash
CERTSCORE_API_KEY=<generated-token> \
CERTSCORE_MCP_SMOKE_URL=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html \
pnpm mcp:certscore:smoke
```

Expected behavior:

- MCP client lists the scoped tools.
- `certscore_scan_site` returns either a completed scan or an async `jobId`/`scanId`.
- `certscore_get_report` runs when a stable `scanId` is available.
- If the scan is still async, `certscore_get_scan_status` returns the public-safe job status.

## Hosted OAuth Session Refresh

The authenticated `/mcp` transport validates the bearer token on every request.
A refreshed token may reuse the existing `Mcp-Session-Id` when issuer, audience,
subject, OAuth client, organization, user, and both OAuth and integration scope
sets are unchanged. Scope ordering and duplicate scope entries do not matter.
Token-instance fields (`jti`, `iat`, `exp`) do not bind the session; expired or
invalid tokens are still rejected. Identity or scope changes require a new
session. Sessions cannot move between OAuth, anonymous, Light, and Microsoft
endpoints.

Every tool uses its request's validated credential for upstream API calls,
including concurrent bundle requests and retries. A missing request credential
fails closed instead of falling back to the initialization token. Rejected
requests do not renew the session's idle timeout.

`mcp_http.auth_failed` retains the `session_token_mismatch` reason for binding
failures and adds a bounded `bindingMismatch` field name and allowlisted
`rpcMethod`. It contains no token or identity values. Additional log storage is
estimated below $0.01/month at 100,000 rejected requests; this change introduces
no new scan, model call, or infrastructure resource.

Local verification uses a loopback mock API and creates no real scans:

```bash
pnpm --filter @certscore/mcp-http run build:deps
pnpm --filter @certscore/mcp-http test
pnpm --filter @certscore/mcp test
pnpm exec tsc --noEmit -p apps/mcp/tsconfig.json
pnpm --filter @certscore/mcp typecheck
pnpm exec tsc -p apps/mcp/tsconfig.json
MCP_TEST_COMPILED_RUNTIME=1 node --import tsx --test apps/mcp/src/token-refresh.test.ts
```

The September 12, 2026 local verification passed 39 HTTP tests and 113 package
tests, including replacement-token forwarding through all 12 tools, expired
original tokens, concurrent bundle isolation, GET/DELETE, identity/scope and
endpoint rejection, and idle-timeout behavior. Both type checks passed. These
results describe local changes; they do not establish production rollout.

Release verification repeated the HTTP suite from an isolated worktree and also
passed all 47 API-contract, SDK, and OAuth-auth tests (199 tests total). The
refresh regression separately passed against the compiled `dist/index.js`
runtime used by the production image.

## Deploy Verification

After the web deploy completes, verify:

```bash
BASE_URL=https://certscore.ai pnpm exec tsx ./scripts/smoke-pulse-endpoints.ts
CERTSCORE_API_KEY=<target-env-token> CERTSCORE_BASE_URL=https://certscore.ai pnpm mcp:certscore:smoke
```

For the hosted production canary, use a retained scan and a short-lived `scan:read mcp` token:

```bash
CERTSCORE_MCP_CANARY_SCAN_ID=<retained-scan-id> \
CERTSCORE_MCP_ACCESS_TOKEN=<short-lived-token> \
pnpm ops:smoke:mcp-production
```

This command verifies `/mcp/light`, `/mcp/anonymous`, and `/mcp` directly at `https://mcp.certscore.ai`. It checks exact tool surfaces and bounded reads only; it does not create a scan, issue an API key, or start a one-off task.

The separately packaged CLI smoke is intentionally distinct and cost-gated:

```bash
CERTSCORE_ALLOW_PAID_ECS_SMOKE=1 pnpm ops:smoke:mcp-cli-production
```

Run that command only after cost approval because its temporary-key lifecycle uses one-off Fargate tasks. It also fails before creating resources when the installed CLI version differs from the workspace version.

Also inspect:

- `https://certscore.ai/api-pulse#mcp`
- `https://certscore.ai/llms.txt`
- `https://certscore.ai/api-pulse-agent-guide.txt`

## Troubleshooting

`connect ECONNREFUSED 127.0.0.1:5432`

The configured local Postgres database is not running or not reachable. Start Postgres or point `DATABASE_URL` at a reachable target.

`This CertScore API key is invalid, expired, or revoked.`

Confirm the token was generated in the same database backing the target host. Confirm the token was copied exactly.

`This CertScore API key does not include the required Pulse scope.`

URL scan requests require `pulse:scan` and `mcp`. Existing scan/job reads require `pulse:read` and `mcp`.

## Release Checklist

- Run MCP package tests.
- Run web typecheck.
- Apply migration in target environment.
- Generate a scoped preview key in target environment.
- Run authenticated MCP smoke against target host.
- Run the bounded hosted canary with an existing scan ID and short-lived MCP token.
- Run the separate CLI/Fargate smoke only when its additional cost has been approved.
- Verify public docs after deploy.
