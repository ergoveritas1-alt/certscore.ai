# Hosted MCP telemetry

## Purpose

The internal MCP telemetry layer measures tool invocations that reach CertScore's hosted MCP infrastructure. It covers and differentiates all hosted entrypoints:

- `https://mcp.certscore.ai/mcp/light` (`mcp_light`)
- `https://mcp.certscore.ai/mcp/anonymous` (`mcp_anonymous`)
- `https://mcp.certscore.ai/mcp` (`mcp_authenticated`)

It is observational only. It does not alter MCP tool registration, annotations, schemas, scan freshness, scan reuse, regional execution, quotas, authentication, sessions, or tool responses.

## Event schema

Each completed hosted tool invocation produces one best-effort event with:

- event and request UUIDs
- occurrence timestamp
- hosted surface and exact endpoint
- tool name
- provider source classification and attribution basis
- bounded client-family classification
- bounded self-declared client name from the MCP initializer
- anonymous/authenticated classification
- trusted requester IP, HMAC-SHA256 IP attribution, and requester-network class from the specific tool-call request (with session initialization only as a fallback)
- HMAC-derived opaque session and actor IDs, when safely measurable
- normalized target hostname for scan creation and full-profile domain lookup tools
- requested freshness and scan region when supplied
- scan ID and returned scan status when available
- reused, new, unavailable, or not-applicable scan decision
- success, error, or rate-limited outcome
- MCP/HTTP transport outcome
- duration in milliseconds
- allowed, rate-limited, or not-applicable quota outcome
- bounded error code
- bounded requested resource: scan/job ID, normalized domain, or HTTP(S) origin

The canonical event schema is `packages/shared/src/mcp-telemetry.ts`. Events are stored in `mcp_tool_invocation_events` with a 90-day retention target. The ingestion query deletes up to 500 expired rows on each accepted write, avoiding a separate scheduler or paid retention service. If traffic stops entirely, expired rows remain until the next accepted event triggers pruning.

## Source attribution

Provider attribution is deliberately conservative:

- recognized provider egress is labeled `verified_network`
- OpenAI-specific opaque headers are labeled `self_declared_header`
- recognized bounded MCP client-family names are labeled `self_declared_client`
- all other traffic remains `unknown`

Self-declared signals are not proof of provider identity because a public client can reproduce them. OpenAI/ChatGPT traffic is therefore not silently inferred from use of `/mcp/light` or another public endpoint.

## Data minimization

Telemetry does not persist:

- prompts or ChatGPT memories
- tool argument payloads or MCP response bodies
- authentication tokens
- raw headers
- raw OpenAI conversation or ephemeral-user IDs
- email addresses or account claims
- raw user agents, client versions, or MCP initializer payloads

Existing opaque provider identifiers, MCP session IDs, and authenticated caller bindings are HMAC-derived into 24-character internal correlation IDs before leaving the MCP process. Provider-wide network bindings are not counted as unique actors.

Trusted requester IPs and their HMAC-SHA256 counterparts are retained under the same 90-day operational policy so failed calls that never produce a scan remain attributable. Client names are lowercased, character-bounded, and limited to the self-declared initializer name; versions and the rest of the initializer are discarded.

Normalized requested hostnames and safe request resources are retained because requested-site frequency and failure diagnosis are explicit operational metrics. For URL inputs, telemetry stores only the HTTP(S) origin. Full requested URLs, paths, credentials, queries, and fragments are not stored in this telemetry table.

## Delivery and failure behavior

The MCP service signs each event with the existing internal JWT signing secret and sends it to `/api/internal/mcp-telemetry`. The web route validates the signature, timestamp, strict event schema, and occurrence time before writing to PostgreSQL.

Delivery is asynchronous and uses a 10-second acknowledgement timeout. The MCP service retries the same event ID once before reporting `mcp.telemetry_write_failed`; database uniqueness makes that retry idempotent when the first request committed but its acknowledgement was delayed. A delivery or database failure never changes or fails the MCP tool result. This is intentional: counts are best-effort operational telemetry, not a billing ledger.

No additional environment variable, database credential in the MCP task, third-party analytics SDK, model call, service, or provisioned capacity is introduced.

## Admin dashboard

Platform admins can open `/app/admin/mcp`. The page reports:

- today, 7-day, and 30-day invocation counts
- measurable unique opaque sessions and actors
- entrypoint distribution
- per-tool call counts, errors, median latency, and p95 latency
- scan reuse, error, and quota-hit rates
- bundle-per-scan and status-polls-per-scan ratios
- 30-day daily trends
- provider/access signal breakdowns with attribution labels
- bounded frequently requested hostnames
- recent bounded invocation rows, including retained requester and client attribution

No historical telemetry is invented. The dashboard starts accumulating data only after migration and deployment. Existing logs and API Activity records are not automatically backfilled because they cannot reliably reconstruct one event per MCP tool invocation with exact duration and session attribution.

## Metrics CertScore cannot observe

This telemetry cannot measure:

- ChatGPT directory impressions
- ChatGPT search impressions
- pre-install plugin suggestions
- plugin consideration without invocation
- install conversion rate unless OpenAI exposes install data separately
- Skill-routing opportunities where CertScore was not invoked
- provider-side retries or decisions that never reach CertScore infrastructure

The dashboard repeats this limitation so infrastructure request counts are not presented as discovery or marketplace analytics.

## Production canary and operational checks

The hosted production canary exercises all three entrypoints without creating a scan. It requires an existing retained scan ID and a short-lived authenticated MCP token supplied only through the environment:

```bash
CERTSCORE_MCP_CANARY_SCAN_ID=<retained-scan-id> \
CERTSCORE_MCP_ACCESS_TOKEN=<short-lived-scan-read-mcp-token> \
pnpm ops:smoke:mcp-production
```

The canary verifies the exact three-tool Light contract, the exact twelve-tool anonymous and authenticated contracts, one status read on each entrypoint, and one summary bundle read on Light. It never calls `certscore_scan_site`, requests `freshness=refresh`, creates an API key, or starts a one-off compute task. Set `CERTSCORE_MCP_CANARY_VERIFY_TELEMETRY=1` only from an approved environment that already has `DATABASE_URL`; this additionally verifies that all four expected privacy-minimized event rows were persisted.

The separately packaged stdio/Homebrew CLI has its own explicit check:

```bash
CERTSCORE_ALLOW_PAID_ECS_SMOKE=1 pnpm ops:smoke:mcp-cli-production
```

That legacy check first requires the installed CLI version to match the workspace package. It creates one-off Fargate tasks, so the cost opt-in must be set only after explicit owner approval.

Telemetry write and persistence failures remain visible through the structured `mcp.telemetry_write_failed`, `mcp.telemetry_event_rejected`, and `mcp.telemetry_persistence_failed` log events. `mcp.telemetry_write_failed` is emitted only after both idempotent delivery attempts fail. Successful writes taking at least one second emit `mcp.telemetry_persistence_slow` with the bounded event ID and duration for correlation, but that latency diagnostic does not increment the failure metric. The web ECS stack combines confirmed failures from the MCP and web log groups into the sparse `CertScore/MCP` `TelemetryPipelineFailures` metric and alarms on the first failure. Missing metric data is treated as healthy, so the custom metric emits only when a matching failure is logged. The dedicated regional SNS topic sends alarm and recovery notifications to the configured operations email endpoint.

The telemetry alarm was cost-approved by the product owner on August 19, 2026. Scheduled canaries, provisioned concurrency, or another paid monitoring service still require separate cost approval. The admin dashboard shows the canonical retention target, oldest and newest retained events, total retained rows, and rows awaiting write-triggered pruning so retention can be audited without a scheduler.
