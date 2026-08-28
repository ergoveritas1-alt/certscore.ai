# CertScore MCP

CertScore MCP exposes a focused Model Context Protocol server for CertScore Pulse workflows.

Status: public developer preview. Version 0.2.16 makes confirmed Reject Path outcomes explicit through typed verdict and intentional-termination metadata, direct MCP TextContent, and separately scoped coverage limitations. Local WC01 development uses `pnpm mcp:certscore`.

Public docs:

- https://certscore.ai/developers/mcp
- https://certscore.ai/developers/quickstart
- https://certscore.ai/developers/reference
- https://certscore.ai/api-pulse
- [MCP Light installation and agent reference](../../docs/mcp-light-install.md)
- [MCP Light marketplace workflow assets](../../docs/mcp-light-marketplace-assets.md)

## Light MCP — no authentication: start here

Light is the anonymous, no-auth Streamable HTTP endpoint for first-time and low-volume agent workflows:

```text
Light:
https://mcp.certscore.ai/mcp/light

Authentication: None
Tools: certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle
```

No signup, API key, bearer token, browser login, or OAuth is required. Light allows up to 50 genuinely new scans per UTC day across the public Light surface and up to 5 per rolling 10 minutes, with additional IP/provider safeguards. Reused eligible results do not consume quota.

Light is a free website privacy scanner and cookie checker for public websites. It can return canonical evidence and findings for pre-consent cookies and storage, trackers and vendors, cookie banners, CMP and consent controls, privacy-policy and transparency surfaces, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. Typical uses include release privacy preflight, public vendor-domain review, landing-page tracker inspection, audit triage, and evidence collection before human privacy review.

Codex setup:

```bash
codex mcp add certscore --url https://mcp.certscore.ai/mcp/light
```

First-run Codex prompt:

> Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. If certscore_scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll certscore_get_scan_status using scanId only. If certscore_scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry certscore_scan_site; do not call certscore_get_scan_status until a scanId exists. Once the scan reaches a terminal status, call certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.

ErgoVeritas is a stable, owned canary site suited to demonstrating the complete scan, status, and bundle flow. Its pages intentionally contain test signals; users may substitute their own public HTTP or HTTPS URL for production-like testing.

Canonical Light workflow:

1. Call `certscore_scan_site` with a public URL.
2. If a retryable error has no `scanId`, wait `retryAfterSeconds` and retry `certscore_scan_site`.
3. If the result is queued, running, or finalizing, retain `scanId`.
4. Poll `certscore_get_scan_status` using `scanId` only. Never poll until `scanId` exists.
5. Stop polling at a terminal status, then call `certscore_get_scan_bundle`.
6. Use `detail=findings` for a compact finding review.
7. Use `detail=evidence` for evidence digests and references.
8. If truncated, follow `recommendedNextAction` or increase `maxBytes`.
9. Summarize findings together with coverage limitations and the report URL.

Recommended bundle budgets are `maxBytes=5000` for `summary`, `maxBytes=8000` for `findings`, `maxBytes=8000` for `evidence`, and `maxBytes=12000` to `25000` for `full`. MCP Light applies a 25,000-byte response ceiling so results remain within practical client limits; larger requested budgets are reported but clamped. At the 5,000-byte floor, compact core finding rows take priority over optional inventory and duplicate envelope fields. When repeated per-finding URLs are omitted, `evidenceUrlTemplate` points to `contentUrls.findings` and the returned finding ID so the same canonical evidence endpoint remains derivable. Inspect `canonicalFindingsComplete`, `requestedMaxBytes`, `effectiveMaxBytes`, `responseCeilingBytes`, `actualBytes`, `fullPayloadBytes`, `truncated`, `omittedSections`, `nextRecommendedMaxBytes`, and returned report or evidence content URLs. When `canonicalFindingsComplete` is true, retry only if omitted envelope detail is needed.

Verification prompt:

> List the available CertScore tools and confirm that certscore_scan_site, certscore_get_scan_status, and certscore_get_scan_bundle are available. Then scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html and report whether the result was new or reused.

Success means the tool list contains exactly the three Light tools, no authorization page appears, and `certscore_scan_site` returns a stable `scanId` plus an explicit new-or-reused decision. An eligible reused result reports that quota was not consumed.

CertScore results are automated observations from a public-web scan. No-go, not-observed, and limited-coverage results are not proof of compliance, absence of risk, or legal status. Review the retained evidence and applicable context before relying on a finding.

Scans describe observable behavior at a point in time. Public sites may behave differently on later visits or in another execution context. CertScore findings and the CertScore score support human and agentic review; they are not legal advice, certification, or a compliance determination.

## Which MCP route should I use?

| Route | Access | Best for |
| --- | --- | --- |
| Light MCP — no authentication | No account, API key, bearer token, browser login, or OAuth; three tools; up to 50 new scans per UTC day across Light and 5 per rolling 10 minutes; eligible reuse is free | First-time users, testing, and discovery |
| Hosted MCP — OAuth | Hosted Streamable HTTP with OAuth scopes, higher volume, history, and approved advanced tools | Production, team, and managed remote clients |
| Local MCP — scoped API key | Local stdio with a scoped key and tools allowed by its scopes | Backend, local, and controlled automation workflows |

The full/authenticated Streamable HTTP endpoint is `https://mcp.certscore.ai/mcp`. Use it after Light when the workflow requires authentication, higher volume, history, or advanced tools. Core identifiers and canonical response fields remain compatible when moving from Light to authenticated access.

## Weighted read limits

MCP scan-resource reads use the same weighted, rolling policy as the direct CertScore API. Hosted MCP rejects an over-limit composite call before internal fan-out; local MCP receives the same protection from the underlying API. Poll only active status resources, stop at a terminal status, do not repeatedly retrieve terminal scan resources, and honor `Retry-After` before retrying. The current limits and weights are published at https://certscore.ai/developers/reference#read-rate-limits and in the `x-certscore-read-rate-policy` extension of the public OpenAPI documents.

## Tools

- `certscore_scan_site` - Use CertScore.ai to scan a public website for observable privacy and consent signals, including pre-consent cookies and browser storage, third-party trackers, consent-banner and CMP behavior, TLS/transport security, privacy-policy disclosures, GDPR/ePrivacy transparency findings, and applicable CCPA/CPRA review signals. Starts or reuses a public-web scan with a 25-second total tool-call budget by default; scan creation time is deducted from completion waiting. If status is queued, running, or finalizing, retain scanId and poll certscore_get_scan_status using only that scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For usable completion, call certscore_get_scan_bundle. No-go and limited coverage are observations, never proof of compliance.
- `certscore_get_scan` - Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available.
- `certscore_get_scan_status` - Poll with only the stable scanId returned by certscore_scan_site. Active responses include phase, heartbeat, estimated progress, stalled state, retry delay, and canonical scan provenance when available. Terminal responses include the CertScore score, risk, coverage, execution region (scanFrom), timestamps, report URL, and an explicit next action. For a reused or retrieved existing scan, use only persisted scanFrom and timestamps; never infer its original region from the current request, the user's location, or a default. Report unavailable provenance as unavailable. Stop polling at any terminal status.
- `certscore_get_report` - Focused follow-up: retrieve a bounded Pulse report with high-signal TextContent and typed structuredContent, including customer-safe no-go messaging. For broad privacy questions, use certscore_get_scan_bundle first because it combines canonical findings, limitations, and pre-consent rows without redundant calls.
- `certscore_get_evidence` - Focused follow-up: retrieve a bounded public-safe evidence packet with a concise TextContent digest and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.
- `certscore_get_scan_bundle` - Call after completed or completed_limited status. Every usable completed bundle returns a self-contained concise TextContent digest plus matching structuredContent, including canonical execution region (scanFrom) and timestamps when available. For a reused or retrieved existing scan, use only persisted scanFrom and timestamps; never infer its original region from the current request, the user's location, or a default, and report unavailable provenance as unavailable. The default summary includes the canonical report overview, up to five compact public-safe projected findings across the scan's observed domains, and bounded row-level pre-consent cookie/tracker evidence; detail=findings increases the default finding allowance, evidence adds bounded evidence digests and references, and full adds all available bounded sections. MCP Light applies a 25000-byte response ceiling so full results remain transport-safe; use returned content URLs when the complete requested tier exceeds it. At the 5000-byte floor, core finding rows take priority over optional inventory and duplicate envelope fields; evidenceUrlTemplate may replace repeated per-finding URLs while preserving their canonical derivation from contentUrls.findings and findingId. Every response declares finding and evidence total/returned/truncated counts, canonicalFindingsComplete, requested and effective byte budgets, the response ceiling, omittedSections, retrieval URLs, and nextRecommendedMaxBytes when the complete tier fits the ceiling. When canonicalFindingsComplete is true, retry only if omitted envelope detail is needed. Enumerate only returned observations and projected findings. Post-refusal observation may intentionally stop as soon as qualifying non-essential activity or a retained consent-signal contradiction is observed. A confirmed observation with termination.kind=evidence_satisfied is positive evidence for the returned observation, not an inconclusive Reject Path result; keep any coverageLimitations scoped to additional behavior or persistence that was not measured. Treat criticality, priority, and confidence as CertScore metadata; regulatory review lenses are non-determinative CertScore review context, not legal severity, legal exposure, or a compliance determination. Missing consent-action evidence does not establish Accept, Reject, or Decline behavior. Do not extrapolate observed embeds, vendors, or requests into unobserved cookies, fingerprinting, tracking, or processing. The CertScore score covers observable scan signals only; do not infer unobserved technologies or legal compliance status, and never interpret no-go, not-observed, or limited coverage as proof of compliance.

  Post-refusal observation may intentionally stop after the first qualifying non-essential activity or retained consent-signal contradiction. A confirmed observation with `termination.kind=evidence_satisfied` is positive evidence for the returned observation, not an inconclusive Reject Path result. `coverageLimitations` describe only additional behavior or persistence that was not measured.
- `certscore_export_findings` - Return structured findings plus completed-limited no-go disposition and guidance for downstream review or ticketing workflows.
- `certscore_list_findings` - Focused follow-up: list bounded API v2 public-safe findings already projected by the canonical pipeline, with matching high-signal TextContent and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first.
- `certscore_get_pre_consent_cookies_trackers` - Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence with matching TextContent and typed structuredContent. For a new broad request such as checking a site for pre-consent tracking, use certscore_scan_site then certscore_get_scan_bundle first.
- `certscore_explain_finding` - Explain one projected finding with public evidence, caveats, reviewer next steps, and reason-specific no-go context when applicable.
- `certscore_get_latest_domain_scan` - Retrieve the latest eligible API v2 public-safe scan for a domain.

Status provenance fields remain distinct: `provenance.retrievalMode` describes the current read, `provenance.creationDecision` reports the retained original new/reused decision or `unknown`, and `provenance.scanAgeSeconds` reports numeric age when available. A scan-ID lookup alone never proves reuse.

At tight bundle budgets, short canonical `nextStep` actions remain only when they fit without displacing a finding. Longer actions and evidence detail remain available through the returned canonical URLs or a larger complete tier.
- `certscore_get_latest_domain_pre_consent_cookies_trackers` - Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence from the latest eligible scan for a domain, with matching TextContent and typed structuredContent. For a broad current-site review, use certscore_scan_site then certscore_get_scan_bundle first.

The initial MCP surface intentionally does not include account scan browsing or scan comparison tools.

## Scan Timing Fields

MCP tools backed by API v2 scan resources return scan timing when CertScore has enough timing evidence:

- `startedAt`
- `completedAt`
- `scanTimeSeconds`

This applies to `certscore_scan_site` when it returns an API v2 scan resource or job, `certscore_get_scan`, and `certscore_get_scan_status` when called with a `scanId`. `scanTimeSeconds: null` means timing is unavailable or incomplete and should not be displayed as `0`.

Completed Light results are canonical. `certscore_scan_site`, terminal `certscore_get_scan_status`, and `certscore_get_scan_bundle` return the same score, risk level, coverage, and timing fields. Scores include `scoreStatus`, `scoreVersion`, and `scoreUpdatedAt`; a scan remains `finalizing` until the persisted canonical report projection is ready, so a completed response always carries `scoreStatus: "final"`.

The value is labeled `CertScore score`, never a compliance score. It covers observable public-web scan signals only. Clients must not infer technologies absent from the returned evidence, compare the value with a hypothetical compliant baseline, or infer legal compliance status.

Every `failed`, `expired`, or `rate_limited` status includes a bounded `error` object with `code`, `message`, `retryable`, `retryAfterSeconds`, and `recommendedNextAction`.

## Light Bundle Detail and Byte Budgets

Every bundle declares its selected `detail` mode. `summary` returns the overview, canonical result, up to five compact projected finding objects, compact row-level pre-consent cookie/tracker evidence, coverage, limitations, counts, and report URL. This lets conversational MCP clients enumerate projected consent-control, CMP-context, transport, GDPR/ePrivacy transparency, social/media embed, accessibility, disclosure, and other returned review signals without needing a second tool; only categories actually present in canonical projections are returned. Findings and inventory sections each declare `total`, `returned`, and `truncated`. Each compact finding retains its public API v2 evidence anchor. Each inventory row includes cookie/tracker identity, cookie names where present, vendor, purpose, category, first-observed time, domains, evidence classification, and confidence. `findings` raises the default finding allowance to 20. `evidence` adds bounded evidence digests and references. `full` adds every available non-duplicated section subject to the effective byte budget; findings, top findings, and transport security are returned once in their canonical top-level bundle sections. When `fullPayloadBytes` exceeds the Light response ceiling, use the canonical content URLs instead of retrying above the ceiling.

`TextContent` is capped at 8,000 characters and uses short plain-text lines instead of large tables or nested JSON. It presents canonical overview facts and projected findings before the row inventory so one evidence family cannot crowd out the rest. The full profile's structured bundle defaults to 50,000 bytes and accepts a caller-selected 5,000-200,000-byte bound. Light defaults to and applies a 25,000-byte response ceiling. If either representation must omit returned items, it states that explicitly and preserves totals and truncation metadata.

`mcpMetadata` always includes `requestedMaxBytes`, `effectiveMaxBytes`, `responseCeilingBytes`, `responseBudgetClamped`, `actualBytes`, `fullPayloadBytes`, `truncated`, `canonicalFindingsComplete`, `truncationReason`, `omittedSections`, `deduplicatedSections`, `nextRecommendedMaxBytes`, `omittedContentAvailableViaUrl`, and `contentUrls`. Under byte pressure, optional detail and inventory rows are reduced before compact core finding rows. `canonicalFindingsComplete` separates complete projected findings from a partially omitted envelope. `nextRecommendedMaxBytes` is the rounded size needed for the complete requested tier rather than an incremental retry step; when the complete tier exceeds the MCP ceiling, the response directs the agent to an available report/evidence URL.

Input-validation errors remain MCP `-32602` errors and also include structured `invalid_arguments` details with the affected field and a safe next action. Error results use concise text plus machine-readable details. Successful results put the typed result in `structuredContent`; scan bundles also render a bounded row-level evidence summary in `TextContent` for client compatibility.

The Light workflow is:

1. Call `certscore_scan_site` with a public URL.
2. If a retryable error has no `scanId`, wait `retryAfterSeconds` and retry `certscore_scan_site`; do not poll.
3. If the result is queued, running, or finalizing, retain `scanId` and poll `certscore_get_scan_status` with only that ID.
4. Stop polling at any terminal status. For `completed` or `completed_limited`, call `certscore_get_scan_bundle`.
5. If the bundle is truncated, follow `recommendedNextAction`, increase `maxBytes`, or open a listed content URL.
6. Summarize the CertScore score, risk, pre-consent rows, findings, coverage, limitations, and report URL without treating no-go, not-observed, or limited coverage as proof of compliance.

## Completed-Limited No-Go Results

No-go scans are usable terminal results, not transport failures. Relevant tools retain `status: "completed_limited"`, `resultDisposition: "no_go"`, the stable reason code, customer-safe title and explanation, `limitationKind` attribution, retry guidance, and a bounded `evidenceExcerpt` when retained. Unknown future reasons use generic customer copy while remaining structured as `reasonCode: "unknown"`.

## Hosted MCP — OAuth

OAuth-capable MCP clients can connect to:

```text
https://mcp.certscore.ai/mcp
```

Discovery endpoints:

```text
https://mcp.certscore.ai/.well-known/oauth-protected-resource/mcp
https://certscore.ai/.well-known/oauth-authorization-server
```

The full hosted service uses OAuth authorization code with PKCE. Default read access requests `scan:read mcp`. Active Trial workspaces connecting through Claude receive `scan:create` automatically, bounded to 20 genuinely new scans per hour and 100 per day per workspace; eligible recent-result reuse does not consume that allowance. Other clients continue to require an explicit scan-creation grant. The same tool implementation and output contracts power stdio and hosted transports.

For low-volume agent discovery without account or OAuth setup, use the unauthenticated endpoint:

```text
https://mcp.certscore.ai/mcp/anonymous
```

For the simplest no-account workflow, use the Light quickstart at the top of this document. OAuth metadata applies only to `https://mcp.certscore.ai/mcp`.

## Local MCP — scoped API key configuration

Install with Homebrew on macOS:

```bash
brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install --cask certscore-mcp
```

The cask installs the prebuilt MCP command for users who prefer a persistent local binary.

Use the installed command from an MCP client:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

Run from this monorepo for local development:

```bash
CERTSCORE_API_KEY=... pnpm mcp:certscore
```

Generate a scoped preview key after applying DB migrations:

```bash
pnpm db:migrate
pnpm mcp:certscore:generate-key -- --name "CertScore MCP preview"
```

Run the built package directly after local build:

```bash
CERTSCORE_API_KEY=... certscore-mcp
```

Optional:

```bash
CERTSCORE_BASE_URL=https://certscore.ai
CERTSCORE_REQUEST_TIMEOUT_MS=300000
```

`CERTSCORE_API_KEY` should be a scoped CertScore API token for the workspace or preview user. The MCP server passes it to Pulse as a bearer token and does not persist it.

## Local MCP — scoped API key access

Stdio API keys use `pulse:read` and `mcp`; creating scans additionally requires `pulse:scan`. Hosted OAuth uses `scan:read` and `mcp`. Active Trial workspaces connecting through Claude receive bounded `scan:create` automatically; other clients can request scan-creation access by emailing `support@certscore.ai` with the organization, MCP client, expected workflow, expected request volume, and contact email.

## Verify Install

```bash
certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=... certscore-mcp doctor
CERTSCORE_API_KEY=... certscore-mcp doctor --check-auth
```

The doctor command checks binary startup, version output, Node.js runtime compatibility, the configured CertScore base URL, API v2 health, and API key presence. Add `--check-auth` to validate the credential against `/api/v2/auth/check` without creating a scan. It does not print secrets or inspect raw scanner artifacts.

## No-account agent scan path

Agents that cannot create an account or configure OAuth can use the public API v2 scan path without an `Authorization` header:

```bash
curl -X POST https://certscore.ai/api/v2/scans \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html","freshness":"latest","scanFrom":"eu_ie"}'
```

New anonymous scans are limited to 20 per requester IP per UTC day. Reusing an eligible recent result does not consume the quota. Poll the returned status resource, then retrieve findings or evidence. Contact `support@certscore.ai` for a higher-volume allowance, including when reuse serves the current request.

## MCP Client Examples

Claude Desktop-style config:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

Cursor config:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

Windsurf or generic stdio MCP client config:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

Local repo config for contributors:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "pnpm",
      "args": ["mcp:certscore"],
      "cwd": "/path/to/WC01",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}
```

## Agent Workflow

1. Call `certscore_scan_site` with a public URL. It normally returns the completed scan resource in the same tool call.
2. Only if it returns a non-terminal job, call `certscore_get_scan_status` using the stable `scanId` until completion.
3. If status is `queued`, `running`, or `finalizing`, retain the returned `scanId` and poll `certscore_get_scan_status` using only that ID. Stop polling at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
4. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with its default `detail: "summary"`. Use `findings`, `evidence`, or `full` only when progressively deeper bounded context is required.
5. Summarize the canonical score, risk, findings, coverage, limitations, report URL, and next action. Never treat no-go, not-observed, or limited coverage as proof of compliance.

Canonical first-run prompt:

> Scan these public URLs. For each one, call certscore_scan_site. If status is queued, running, or finalizing, retain scanId and poll certscore_get_scan_status using only scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For completed or completed_limited scans, call certscore_get_scan_bundle with detail=findings. If truncated, follow recommendedNextAction or increase maxBytes. Report the canonical score, risk level, coverage, findings, limitations, report URL, and next action. Never treat no-go, not-observed, or limited coverage as proof of compliance.
4. Call `certscore_get_report`, `certscore_get_evidence`, `certscore_list_findings`, or `certscore_get_pre_consent_cookies_trackers` only when the task needs a dedicated view.
5. Call `certscore_explain_finding` when a reviewer needs evidence and caveats for a specific finding.
6. Call `certscore_get_latest_domain_scan` or `certscore_get_latest_domain_pre_consent_cookies_trackers` when the user asks for latest eligible public data for a domain.

`certscore_scan_site` reports whether the result was reused, why the freshness decision was made, whether anonymous quota was consumed, the remaining daily allowance, the UTC reset time, and the recommended next tool.

With `freshness: "latest"`, CertScore reuses an eligible scan completed within the last 24 hours for the same normalized target and scan region. A reusable result must have completed usable page coverage and must not be an early-loss, no-page, or otherwise non-reusable limited result. Reuse does not consume anonymous quota. `freshnessDecision` states whether a recent result was reused or a new scan was queued; `reusedScanAgeSeconds` reports the reused result's age.

Provenance keeps the current retrieval separate from the original creation decision. `retrievalMode=creation_response` means the result came from `certscore_scan_site`; `retrievalMode=scan_id_lookup` means a later tool fetched the retained scan by ID. `creationDecision` is `new_scan` or `reused_scan` only when the response retains that fact, and otherwise is `unknown`. Do not translate `scan_id_lookup` into a reused-scan claim. `scanAgeSeconds` reports a nonnegative age when a retained age or completion timestamp is available.

```json
{
  "tool": "certscore_get_pre_consent_cookies_trackers",
  "arguments": {
    "scanId": "00000000-0000-4000-8000-000000000123"
  }
}
```

```json
{
  "tool": "certscore_get_latest_domain_pre_consent_cookies_trackers",
  "arguments": {
    "domain": "ergoveritas.com",
    "scanFrom": "eu_ie"
  }
}
```

When summarizing table data, group rows by `vendor`, `purpose`, and `host` unless the user asks for row-level JSON.
Treat MCP outputs as automated public-web observations for human and agentic review. They are not legal advice, certification, or a compliance determination. MCP tools must not infer findings from raw labels, raw network events, missing data, or display-only context.

## Live Smoke

```bash
CERTSCORE_API_KEY=... pnpm mcp:certscore:smoke
```

Optional:

```bash
CERTSCORE_MCP_SMOKE_URL=https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html
```

Without `CERTSCORE_API_KEY`, the smoke script exits successfully with a skip message.

For the full production operator smoke, run from the WC01 repo:

```bash
CERTSCORE_ALLOW_PAID_ECS_SMOKE=1 pnpm ops:smoke:mcp-cli-production
```

This verifies the Homebrew-installed `certscore-mcp` command against live `https://certscore.ai`. It first requires the installed CLI version to match the workspace version, then creates a short-lived preview key, stores only the hash in production through the approved ECS/Fargate path, checks required tools, requires non-empty findings and pre-consent cookies/trackers rows, and revokes the temporary key afterward. The explicit cost opt-in is required because this separate CLI check starts one-off Fargate tasks. Use `pnpm ops:smoke:mcp-production` for the hosted, retained-scan, read-only canary.

## Troubleshooting

- Unexpected OAuth in Codex: remove the server and add it again with the exact Light URL `https://mcp.certscore.ai/mcp/light`. Do not configure a bearer token.
- Successful Light connection: Streamable HTTP initialization completes, no authorization page opens, and `tools/list` returns exactly `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle`.
- Missing scan ID: retry `certscore_scan_site` only when the error is retryable. Never call `certscore_get_scan_status` until `scanId` exists.
- Rate limited: follow `retryAfterSeconds` and `recommendedNextAction`, wait for the returned UTC reset, or reuse an eligible result.
- Reused result: report that the eligible prior scan was reused and quota was not consumed.
- Truncated bundle: first inspect `canonicalFindingsComplete`; when true, retry only for omitted envelope detail. Otherwise follow `nextRecommendedMaxBytes`, raise `maxBytes`, or open a returned report or evidence content URL.
- Invalid URL: correct the field named by the structured `invalid_arguments` response and retry with a public HTTP or HTTPS URL.
- Limited result versus failure: `completed_limited`, no-go, not-observed, and limited coverage are observations only, never proof of compliance. `failed`, `expired`, and connection errors are failures with retry guidance.
- Command not found: run the Homebrew install again and confirm Homebrew's bin directory is on `PATH`.
- Missing API key: set `CERTSCORE_API_KEY` in the MCP client environment and rerun `certscore-mcp doctor`.
- Bad token: rotate the key or request a scoped API/MCP key from `support@certscore.ai`.
- API unreachable: check `CERTSCORE_BASE_URL` and verify `https://certscore.ai/api/v2/health`.
- Homebrew tap stale: run `brew update` and reinstall `certscore-mcp`.
- Old cached release: run `brew reinstall --cask certscore-mcp` after updating the tap.

## Runbook

See `docs/certscore-mcp-homebrew-release.md` for Homebrew release steps and `docs/certscore-mcp-preview-runbook.md` for key issuance, smoke testing, deploy verification, and scan-to-report guardrails.
