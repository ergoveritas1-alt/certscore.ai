# Hosted MCP telemetry

## Purpose

The internal MCP telemetry layer measures tool invocations that reach CertScore's hosted MCP infrastructure. It covers and differentiates all hosted entrypoints:

- `https://mcp.certscore.ai/mcp/light` (`mcp_light`)
- `https://mcp.certscore.ai/mcp/anonymous` (`mcp_anonymous`)
- `https://mcp.certscore.ai/mcp` (`mcp_authenticated`)

Telemetry is observational. The optional `taskContext` input described below supplies research context without changing scan freshness, scan reuse, regional execution, quotas, authentication, or tool responses.

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

The canonical event schema is `packages/shared/src/mcp-telemetry.ts`. Tool events are stored in `mcp_tool_invocation_events`; initialization and tool-discovery stages are stored separately in `mcp_activation_events`. Both use a 90-day retention target. Each ingestion path deletes up to 500 expired rows on an accepted write, avoiding a separate scheduler or paid retention service. If traffic stops entirely, expired rows remain until the next accepted event of the same class triggers pruning.

## Source attribution

Provider attribution is deliberately conservative:

- recognized provider egress is labeled `verified_network`
- OpenAI-specific opaque headers are labeled `self_declared_header`
- recognized bounded MCP client-family names are labeled `self_declared_client`
- all other traffic remains `unknown`

Self-declared signals are not proof of provider identity because a public client can reproduce them. OpenAI/ChatGPT traffic is therefore not silently inferred from use of `/mcp/light` or another public endpoint.

## Data minimization

Telemetry does not persist:

- original conversation prompts, transcripts, hidden reasoning, or ChatGPT memories (an explicitly shared short question summary is separately described below)
- raw tool argument payloads or MCP response bodies (only the allowlisted operational fields described below are retained)
- authentication tokens
- raw headers
- raw OpenAI conversation or ephemeral-user IDs
- email addresses or account claims
- raw user agents or MCP initializer payloads; only bounded client-name/version tokens are allowlisted

Existing opaque provider identifiers, MCP session IDs, and authenticated caller bindings are HMAC-derived into 24-character internal correlation IDs before leaving the MCP process. Provider-wide network bindings are not counted as unique actors.

Trusted requester IPs and their HMAC-SHA256 counterparts are retained under the same 90-day operational policy so failed calls that never produce a scan remain attributable. Client names are lowercased, character-bounded, and limited to the self-declared initializer name; bounded client-version tokens may be retained; the rest of the initializer is discarded.

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

## Discovery and probes tab

`/app/admin/mcp?tab=discovery` reads existing activation and invocation telemetry.
Usage remains the default tab and continues to count tool calls. Discovery groups
retained events by exact declared client name, entrypoint, and attributed provider;
it preserves all observed attribution-confidence labels rather than upgrading an
entire client group to its strongest signal.

The discovery view supports one-hour, six-hour, 24-hour, seven-day, and 30-day windows,
client-name search, entrypoint selection, existing traffic visibility controls,
and pagination. First/last seen, behavior, and counts apply only to the selected
window. Initialization frequency divides the count by the full window duration.
Catalogue-only, handshake-only, and tool-use labels describe observed behavior,
not verified identity, intent, installations, or lifetime adoption. Successful
bundle counts are successful retrieval calls, not unique users or scans.

Only `mcp_initialized` and `mcp_tools_listed` activation stages contribute to the
session activation counts. `Sessions listing tools` counts at most one activation per session, not every `tools/list` request. Actual invocation rows supply tool calls, scan requests, successful
bundles, and tool errors (including rate limits). First-tool and scan-request
activation stages are omitted to avoid double-counting invocations. Other HTTP
methods, malformed-session requests, and HTTP-boundary failures remain in
CloudWatch and are not presented as measured by this database view.

Traffic exclusions reuse the invocation ledger's existing QA and Mac mini rules.
Discovery stages linked by exact session within the same entrypoint, provider and window
to excluded calls are omitted. Sessionless stages may fall back only to a matching authenticated actor on both records; anonymous shared-IP bindings never exclude another session. Unlinked discovery stages can only exclude known
QA client names; the view discloses this attribution limitation. Names and opaque
sessions must not be interpreted as verified people or marketplace referrals.

Named clients link to exact-name Usage filters and back to Discovery. A one-hour
discovery link explicitly opens four hours of Usage because that table's minimum
window is four hours. No scan is started by these links.

The admin-gated query is read-only, cached for 30 seconds, and bounded to 30 days
with at most 100 returned groups per page. It adds no telemetry collection,
retention, migrations, scheduled tasks, model calls, or provisioned services.
Estimated incremental query cost is below $1/month at normal admin usage.

Focused verification:

```bash
MCP_DISCOVERY_TEST_DATABASE_URL=postgresql://localhost/postgres \
  node --import tsx --test apps/web/lib/admin/mcp-discovery.test.ts
```

The integration fixture requires an explicitly selected local PostgreSQL database
and uses only connection-local temporary tables.

## Request details and caller correlation

The Usage table has an expandable **Request details** control. New events retain
`request_details` v1 with allowlisted tool arguments: URL origin or normalized
domain, scan/job/finding ID, freshness, scan region, detail/format, wait options,
and bounded result/pagination limits. These are tool inputs, not the user's
natural-language prompt. No new request argument is required from clients.
URL paths, credentials, query values and fragments remain omitted. The canonical
Page column may resolve a full page URL from its linked scan; it is not proof of
the exact historical tool input. An explicit omission flag identifies normalized
or omitted input. Old events have null details, not reconstructed arguments.

Caller correlation now records its basis separately: authenticated binding,
provider-declared ephemeral identifier, requester binding (potentially a shared
IP), or unavailable. Session basis distinguishes a provider conversation claim
from an MCP transport session. Identifiers remain HMAC-derived and the new fields
do not change authentication or quota identity. Raw provider identifiers remain
excluded. Historical actor IDs have no recorded basis and must not be silently
promoted to stable caller identities.

Discovery shows sessions, caller IPs, bindings, declared/authenticated caller
coverage, quota-hit counts, and HTTP 429 counts separately. A caller count covers
only events with recorded authenticated/provider-ephemeral provenance; it is not
a count of unique agents or people. One session per call yields no useful
longitudinal session signal. Existing scan IDs can correlate calls for one scan
without proving that the same person submitted them.

Transport read throttles retain the enforced scope, window, policy version,
unit limit, units used/requested, and retry delay. Creation quota errors retain
available scope, limit, usage and retry delay. Other upstream throttles retain
only details actually supplied to the MCP result; missing details remain unknown.
Target-site `rate_limited_429` errors remain distinct from CertScore-enforced
`rate_limited` quota hits. Well-formed `tools/call` requests rejected by SDK argument validation or unknown-tool lookup now enter the tool ledger once. Malformed protocol envelopes and failures before tool dispatch remain CloudWatch-only.

Deployment order: apply migration `0196_mcp_request_details.sql` and update the
web ingestion/admin application before updating the MCP service. Old MCP events
remain accepted; old rows retain null details. The new admin read tolerates a
missing column, but ingestion requires the migration before new web writes.
No historical backfill, retention extension, scan, retry, scheduler, model call,
new provisioned resource, or quota change is part of this work.

Incremental cost estimate: under $1/month at 100,000 tool calls/month. Typical
metadata adds roughly 0.3–0.8 KB to the existing event and delivery, about
30–80 MB/month of ingress and 90–240 MB at the existing 90-day retention target,
before database overhead. Reuse the existing write and cached admin queries.
Reassess if volume increases materially. Read-only investigation used two small
ECS psql tasks, estimated at a few cents total, and filtered CloudWatch reads.

## Per-request caller activity in Usage

Each Usage row displays a shortened existing opaque caller/session identifier,
its correlation basis, and retained call counts for the preceding 5, 10, and
60 minutes **as of that row's recorded event timestamp**, including the event.
The full identifier is available on hover and links to matching Usage records.
Authenticated or provider-declared actors take priority, then provider
conversations, then requester bindings, then MCP sessions. Legacy actor records
are explicitly unverified; shared-IP bindings may combine callers, and rotating
IDs may split them. None of these counts establishes a unique agent or person.

Counts match the full identifier within the same provider and entrypoint and
respect the selected internal-QA/Mac-mini traffic visibility. They include every
retained tool and outcome, including failures and rate limits, independently of
the page's tool, search, outcome, time-range and pagination filters. A separate
60-minute count highlights enforced quota denials or HTTP 429 responses (counted
once per event). Missing identity/activity is unknown rather than zero. These
are retained telemetry counts, not live in-flight request or handshake counts.

Submitted tool arguments appear beside the requested target and expand into
the existing bounded request-details view. Historical events without captured
arguments remain explicitly unavailable; canonical scan configuration is never
substituted for what that call actually supplied. Original chat prompts are not
received by this service.

Implementation adds one read-only query for at most 100 visible event anchors,
with each lookup bounded to one hour using existing timestamp indexes. There
is no added storage, migration, service, retention or background polling for
these counters. Estimated incremental cost is below $1/month at normal admin
usage; reassess with materially higher ledger volume or admin request frequency.

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

## MCP Light growth funnel

For growth analysis, keep discovery and product activation as two privacy-separated funnels:

- consented first-party product analytics measures `/mcp/light` page views, stable install/setup action identifiers, campaign attribution, and the separate webpage demo
- essential hosted MCP telemetry measures initialization, tools listing, tool invocations, scan decisions/status, completed bundle retrieval, and repeat opaque sessions or actors

Do not add a cross-site install token, target URL, prompt, raw client identifier, or marketplace user identifier to join these funnels. Compare aggregate cohorts by day, declared client family, and campaign instead. Marketplace impressions and installations remain unobservable unless the provider supplies aggregate analytics.

The weekly growth view should exclude internal QA, canaries, and the Mac mini scan bot, then report:

- Light initialized sessions or actors
- successful `certscore_scan_site` calls and new/reused decisions
- scans that reached `completed` or `completed_limited`
- successful `certscore_get_scan_bundle` calls
- bundle-per-scan and status-polls-per-scan ratios
- seven-day and 30-day repeat opaque actors when safely measurable
- error, rate-limit, and p50/p95 duration rates

A completed or limited scan is not the same as a successful user outcome; completed-bundle retrieval is the stronger activation signal. Request counts must not be described as installs or marketplace conversion.

An opaque repeat actor is counted only when the same HMAC-derived actor is active on at least two distinct UTC days inside the stated window. Provider-wide network identities are not converted into actors. Initialization, tool discovery, and tool use may still be counted by an opaque MCP session when no safe actor binding exists.

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


## Task intent and workflow view (September 8, 2026)

`/app/admin/mcp?tab=workflows` relates calls using the same retained MCP session,
scan ID, declared client name, provider, and entrypoint. Calls without a scan or
session remain separate attempts; shared IPs and public scan IDs alone do not
establish a caller journey. Purpose and question text are never backfilled.

The view shows declared purpose and shared question, client/integration/skill
versions, server and schema versions, new/reused scan requests, status and bundle
calls, errors and quota denials, response truncation, and the current canonical
scan outcome. A delivered bundle does not upgrade a partial scan to a fully
successful scan. Missing retrieval is labeled “no bundle observed,” not assumed
abandonment. The scan-response-to-first-bundle interval measures the gap between
recorded tool completions, not scan execution time or user satisfaction.

Admin authorization and existing traffic exclusions apply before the read-only
query. The selected window is bounded to 30 days and the latest 5,000 calls;
when truncated, the UI discloses the sample and incomplete workflow coverage.
Purpose and text filters apply to that sample, and the timeline displays at most
50 calls per group. No polling, model categorization, or background job is added.

### Optional task context

`certscore_scan_site` advertises optional `taskContext` with:

- `purpose`: prelaunch_review, vendor_review, tracking_check, consent_gpc_check,
  policy_review, recheck, other, or unknown.
- `integrationId`, `integrationVersion`, `skillVersion`: bounded self-declared
  tokens, distinct from the initializer's client version and the server version.
- `questionSummary`: at most 300 characters, accepted only with
  `questionSource` (user_wording or agent_paraphrase) and
  `shareForImprovement: true`. This flag is a caller attestation, not independently
  verified consent. Owned skills require the user's knowing agreement and omit
  questions otherwise; purpose/version hints can still be provided.

Questions must omit personal/account information, URLs, credentials, conversation
history and hidden reasoning. A deterministic minimizer withholds likely sensitive
summaries while preserving safe context fields; this pattern filter is not a
complete personal-data detector. Ingestion rejects unsanitized context. Original
chat prompts are not available through MCP. All text remains escaped, admin-only,
and within the existing 90-day retention target.

OpenAI, Claude Code and Cursor skill sources now send context only when the
server advertises support. The instruction revision is `2026-09-08.1`; package
versions are unchanged and these local edits are not a published release.

### Observation correctness and deployment

The server observes the public SDK `tools/call` registration boundary before
lookup, validation and normalization. A call produces one event, including
invalid arguments and unknown tools. The existing SDK still validates and invokes
handlers. Argument values remain allowlisted and minimized; `captureBasis`
distinguishes new protocol-input capture from legacy validated-argument capture.
Historical omission flags are not treated as proof of original payload completeness.
Response telemetry stores bounded byte count and available truncation/budget
metadata, never response bodies. Telemetry failures cannot replace tool results.

The new fields are optional within existing `request_details` version 1 and its
4 KB database limit. Migration 0196 remains the prerequisite; no further migration
is added here. Deploy web ingestion/admin support before the hosted MCP update,
then release the owned integration instructions. Keep the advertised schema
version separate from package version when analyzing rollout. This work was
implemented and tested locally; production deployment is a separate step.

Incremental estimate for this extension: below $1/month at 100,000 calls/month
and ordinary admin usage. Typically 0.2–0.8 KB is added per detailed call,
approximately 20–80 MB/month ingress and 60–240 MB at 90 days before database
overhead, using the existing event write. Rejected calls newly captured also use
the existing ledger; reassess the estimate if invalid traffic becomes a material
volume. No added scan, model call, infrastructure capacity or retention extension.

## Session cohort funnel

The workflow tab now includes a **Session funnel** using retained initialization
and invocation events. The cohort consists of the first retained initialization
of each exact session/client/provider/entrypoint combination within the selected
1-hour to 30-day connection window. A prior retained initialization excludes that
session from a newer connection cohort; this does not establish lifetime first use.
Duplicate initialization events in the window count once.

Choose a 10-, 30-, or 60-minute follow-up period (default 30). Calls count only
between initialization and that fixed deadline. Every conversion rate excludes
sessions whose entire follow-up period has not elapsed; pending counts are shown
separately. Rates are connected → called a tool → attempted scan → admitted scan
→ result retrieved after admission. Each step displays its actual numerator and
denominator; an empty denominator is unavailable, never 0%.

Admission requires a successful scan request classified as new or reused with a
retained scan identity. Retrieval requires a successful supported bundle, report,
evidence, findings, export or domain-result call with the same session/client/
provider/entrypoint and scan ID, strictly later than a retained admission. Status
polls alone are not result delivery. Catalogue listing is optional. Result-only
visits, new-scan sessions and reuse sessions appear separately. A session can
admit several scans and converts after at least one matching retrieval; it does
not promise all scans completed. New/reused categories can overlap.

The card also shows sessions with tool errors, CertScore quota denials, status
calls after admission per admitted scan/session, truncation among calls whose
truncation metadata is known, and purpose/integration-version coverage among
scan-attempt sessions. Current canonical partial/no-go snapshot outcomes remain
separate from delivery and are explicitly not historical outcomes at the
follow-up deadline. Target-site 429 no-go results do not become CertScore quota
hits. Result delivery does not prove useful evidence or user satisfaction.

Expandable comparison rows group mature sessions by client, provider, entrypoint,
declared purpose and declared integration/version/skill tuple. Missing context is
unknown and conflicting declarations are multiple; claims do not become verified
identity or proof of causation. Workflow free-text and purpose filters apply only
to the detailed workflow table, not the funnel; the card discloses that scope.
The connection period and traffic/client/provider/entrypoint filters apply to both.

Queries require platform-admin authorization before cache access and reuse the
existing QA/Mac-mini rules. Known QA names and sessions linked to excluded calls
are excluded; unlinked activations have only declared-client filtering. Calls
without matching cohort initialization (including missing-session calls) are
counted as excluded coverage, not silently attributed. Cross-session and shared-IP
joins never manufacture a journey.

The read-only query caches for 30 seconds, uses existing time/session indexes,
aggregates admissions once before joining retrievals, and returns at most the
latest 5,000 session summaries. If capped, all rates are explicitly labeled as
sample rates. Comparison details display the largest 50 groups with a limit
notice; totals retain every sampled session. No new telemetry, migration,
retention, model, scheduler, scanner invocation, or provisioned service is added.
Estimated incremental query cost is below $1/month at normal admin usage; revisit
at materially higher event volume or admin frequency. This feature is local until
released through the normal AWS web deployment.
