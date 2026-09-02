# CertScore.ai MCP Light

**No-auth website privacy scans for MCP clients.** Give an agent a public URL and retrieve evidence-backed observations about cookies and storage, trackers and vendors, consent controls, privacy-policy surfaces, and HTTPS/TLS signals.

CertScore.ai MCP Light is live in the [GitHub MCP Registry](https://github.com/mcp/ai.certscore/mcp-light) as `ai.certscore/mcp-light`. It exposes exactly three tools and requires no signup, API key, bearer token, browser login, or OAuth.

| | |
| --- | --- |
| Endpoint | `https://mcp.certscore.ai/mcp/light` |
| Transport | Streamable HTTP |
| Authentication | None |
| Tools | `certscore_scan_site` → `certscore_get_scan_status` → `certscore_get_scan_bundle` |
| Current hosted version | `0.2.17` |

[Start with MCP Light](https://certscore.ai/mcp/light?utm_source=github&utm_medium=mcp_registry&utm_campaign=github_mcp_registry_launch) · [Install in Cursor](https://cursor.com/link/mcp/install?name=CertScore.ai&config=eyJ1cmwiOiJodHRwczovL21jcC5jZXJ0c2NvcmUuYWkvbWNwL2xpZ2h0In0%3D) · [Read the installation reference](../../docs/mcp-light-install.md)

## Try it in about a minute

Add the public endpoint to Codex:

```bash
codex mcp add certscore --url https://mcp.certscore.ai/mcp/light
```

Then ask:

> Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. Continue through the returned scan lifecycle, retrieve the completed findings bundle, and summarize the score, risk level, findings, evidence links, coverage limitations, and report URL. State whether the result was new or reused. Treat the results as automated public-web observations, not legal advice or certification.

ErgoVeritas is a stable, owned canary with intentional test signals. For an ordinary review, substitute any public HTTP or HTTPS URL you are authorized to assess.

## Light MCP — no authentication: start here

Light is the anonymous Streamable HTTP endpoint for first-time and low-volume agent workflows:

```text
Light:
https://mcp.certscore.ai/mcp/light

Authentication: None
Tools: certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle
```

Light allows up to 50 genuinely new scans per UTC day across the public Light surface and up to 5 per rolling 10 minutes, with additional IP/provider safeguards. Reused eligible results do not consume quota.

Light is a free website privacy scanner and cookie checker for public websites. It can return canonical evidence and findings for pre-consent cookies and storage, trackers and vendors, cookie banners, CMP and consent controls, the jurisdiction-neutral GPC comparison, Accept and Reject Path post-action observations or explicit limitations, privacy-policy and transparency surfaces, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. Typical uses include release privacy preflight, public vendor-domain review, landing-page tracker inspection, audit triage, and evidence collection before human privacy review.

Detailed first-run prompt:

> Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. If certscore_scan_site includes preConsentPreview, treat it as a partial preview and continue the workflow. Distinguish captured totals from bounded returned identities; use trackingVendorCount for non-operational tracking vendors and keep operationalVendors separate. Do not compare the compatibility preview trackerCount with the completed inventory's broader trackerCount. Never report preview counts as final totals. If certscore_scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll certscore_get_scan_status using scanId only. If certscore_scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry certscore_scan_site; do not call certscore_get_scan_status until a scanId exists. Once the scan reaches a terminal status, call certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.

Canonical Light workflow:

1. Call `certscore_scan_site` with a public URL.
2. If a retryable error has no `scanId`, wait `retryAfterSeconds` and retry `certscore_scan_site`.
3. If `preConsentPreview` is present, it is a partial preview of checkpoint passive observations. Its counts are partial, not the full scan tally; never report them as final totals. It contains no canonical findings or score and does not replace the completed bundle.
4. If the result is queued, running, or finalizing, retain `scanId`.
5. Poll `certscore_get_scan_status` using `scanId` only. Never poll until `scanId` exists.
6. Stop polling at any terminal status. At `completed` or `completed_limited`, call `certscore_get_scan_bundle` before reporting full scan results, and use its final returned tally, canonical findings, and limitations; for other terminal states, follow the returned error guidance.
7. Use `detail=findings` for a compact finding review.
8. Use `detail=evidence` for evidence digests and references.
9. If truncated, follow `recommendedNextAction` or increase `maxBytes`.
10. Summarize findings together with coverage limitations and the report URL.

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

## Authenticated and local MCP tool reference

The sections below document the broader authenticated and local package surfaces. They do not change the GitHub-listed Light contract, which exposes only `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle`.

- `certscore_scan_site` - Creates a public-website privacy scan or reuses an eligible recent completed scan. Coverage includes pre-consent storage, trackers, consent and CMP signals, privacy-policy disclosures, transport security, and GDPR/ePrivacy or CCPA/CPRA review signals. The response contains a stable scanId, lifecycle status, retry timing, and sometimes a bounded preliminary preConsentPreview; preliminary data contains no final findings or score. Results are automated public-web observations, not legal advice, certification, or a compliance determination. Tool and workflow documentation: https://certscore.ai/developers/mcp.

  Workflow note: a new scan may include `preConsentPreview` when the runtime lane completes or reaches its six-second checkpoint. The preview separates captured totals from bounded returned identities. `trackingVendorCount` excludes infrastructure, security, and consent-management vendors, which appear in `operationalVendors`; the compatibility preview count is not comparable to the completed inventory's broader `trackerCount`. Continue with `certscore_get_scan_status`, never poll in parallel, and never resubmit `certscore_scan_site` while the scan is active. Then call `certscore_get_scan_bundle` at completed or completed_limited.
- `certscore_get_scan` - Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available.
- `certscore_get_scan_status` - Returns lifecycle status for a stable CertScore scanId. Active responses include phase, heartbeat, estimated progress, retryAfterSeconds, and sometimes a bounded preliminary preConsentPreview. Terminal responses include completion status, CertScore score and risk metadata when available, coverage, persisted execution region and timestamps, report URL, and a next-action field. Preliminary observations are distinct from completed findings.
- `certscore_get_report` - Focused follow-up: retrieve a bounded Pulse report with high-signal TextContent and typed structuredContent, including customer-safe no-go messaging. For broad privacy questions, use certscore_get_scan_bundle first because it combines canonical findings, limitations, and pre-consent rows without redundant calls.
- `certscore_get_evidence` - Focused follow-up: retrieve a bounded public-safe evidence packet with a concise TextContent digest and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.
- `certscore_get_scan_bundle` - Returns the completed or completed-limited CertScore evidence bundle for a stable scanId as concise TextContent and matching structuredContent. Available sections include the canonical report overview, bounded projected findings, pre-consent cookie and tracker evidence, the typed GPC response, typed Accept and Reject Path outcomes, coverage limitations, persisted execution provenance, and retrieval URLs. Confirmed action evidence and unsupported or inconclusive outcomes remain distinguishable; limitations never become inferred action results. Detail tiers and byte budgets control the bounded response, with explicit returned, total, truncated, and omitted-section metadata. Results are automated public-web observations, not legal advice, certification, or a compliance determination.

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

1. Call `certscore_scan_site` with a public URL. A reused eligible result may be completed immediately; a new scan returns its stable `scanId` and may return a partial preview when the runtime lane completes or reaches its six-second checkpoint.
2. If `preConsentPreview` is present, distinguish captured totals from bounded returned identities. Use `trackingVendorCount` for non-operational tracking vendors and keep `operationalVendors` separate; do not compare the compatibility preview `trackerCount` with the completed inventory's broader `trackerCount`. It is not a finding, score, or terminal result.
3. If status is `queued`, `running`, or `finalizing`, retain the returned `scanId` and poll `certscore_get_scan_status` using only that ID. Stop polling at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
4. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with its default `detail: "summary"` before reporting full scan results. Use its final returned tally, canonical findings, and limitations. Use `findings`, `evidence`, or `full` only when progressively deeper bounded context is required.
5. Summarize the canonical score, risk, findings, coverage, limitations, report URL, and next action. Never treat the preview, no-go, not-observed, or limited coverage as proof of compliance.

Canonical first-run prompt:

> Scan these public URLs. For each one, call certscore_scan_site. If preConsentPreview is present, treat it as a partial preview whose counts are checkpoint-only and partial, not the full scan tally; never report them as final totals, and continue the workflow. If status is queued, running, or finalizing, retain scanId and poll certscore_get_scan_status using only scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For completed or completed_limited scans, call certscore_get_scan_bundle with detail=findings before reporting full scan results. Use the bundle for the final returned tally, canonical findings, and limitations. If truncated, follow recommendedNextAction or increase maxBytes. Report the canonical score, risk level, coverage, findings, limitations, report URL, and next action. Never treat preConsentPreview, no-go, not-observed, or limited coverage as proof of compliance.
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
