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

## Deploy Verification

After the web deploy completes, verify:

```bash
BASE_URL=https://certscore.ai pnpm exec tsx ./scripts/smoke-pulse-endpoints.ts
CERTSCORE_API_KEY=<target-env-token> CERTSCORE_BASE_URL=https://certscore.ai pnpm mcp:certscore:smoke
```

For the full operator production smoke, prefer:

```bash
pnpm ops:smoke:mcp-production
```

This command verifies the Homebrew-installed `certscore-mcp` command against live `https://certscore.ai`. It creates a short-lived preview token locally, inserts only the token hash into the production `integration_api_keys` table through the approved ECS/Fargate one-off task pattern, runs authenticated MCP protocol calls, and revokes the temporary key afterward.

The production smoke expects:

- the installed `certscore-mcp` command to report a version and reach `/api/v2/health`
- required MCP tools to be listed
- `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan` to work for the smoke URL
- `certscore_list_findings` to return at least one already-projected finding
- `certscore_get_pre_consent_cookies_trackers` to return at least one public-safe table row
- `certscore_explain_finding` to work for the first returned finding
- latest-domain scan and latest-domain pre-consent cookies/trackers tools to work

This is an operator confidence check over public API/MCP surfaces. It does not add scanner/report logic, create findings, infer policy conclusions, or inspect raw scanner artifacts.

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
- Run `pnpm ops:smoke:mcp-production` when AWS operator credentials are available.
- Verify public docs after deploy.
