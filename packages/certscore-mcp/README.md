# CertScore MCP

CertScore MCP exposes a focused Model Context Protocol server for CertScore Pulse workflows.

Status: public developer preview. Version 0.2.8 is prepared as a Homebrew/npm stdio server and hosted OAuth-protected Streamable HTTP service. Local WC01 development uses `pnpm mcp:certscore`.

Public docs:

- https://certscore.ai/developers/mcp
- https://certscore.ai/developers/quickstart
- https://certscore.ai/developers/reference
- https://certscore.ai/api-pulse

## Tools

- `create_scan` - Deprecated compatibility alias of scan_site. Use scan_site for new integrations. Returns completed-limited no-go disposition and reason-specific guidance when applicable.
- `scan_site` - Start or reuse a CertScore public-web scan. Completed no-go scans return completed_limited status, structured reason-specific guidance, and timing when available.
- `get_scan` - Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available.
- `get_scan_status` - Retrieve terminal status, including completed_limited no-go disposition and reason-specific guidance. Pass jobId only before a stable scanId is available.
- `get_report` - Retrieve a summary Pulse report, including customer-safe no-go messaging when coverage is completed-limited. Use get_evidence for the larger bounded packet.
- `get_evidence` - Retrieve the bounded structured Evidence JSON packet for a stable scan ID. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values.
- `export_findings` - Return structured findings plus completed-limited no-go disposition and guidance for downstream review or ticketing workflows.
- `list_findings` - List API v2 public-safe findings already projected for a scan.
- `get_pre_consent_cookies_trackers` - Retrieve the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON for a scan.
- `explain_finding` - Explain one projected finding with public evidence, caveats, reviewer next steps, and reason-specific no-go context when applicable.
- `get_latest_domain_scan` - Retrieve the latest eligible API v2 public-safe scan for a domain.
- `get_latest_domain_pre_consent_cookies_trackers` - Retrieve the public-safe Cookies & Trackers (Pre-consent) table from the latest eligible scan for a domain.

The initial MCP surface intentionally does not include account scan browsing or scan comparison tools.

## Scan Timing Fields

MCP tools backed by API v2 scan resources return scan timing when CertScore has enough timing evidence:

- `startedAt`
- `completedAt`
- `scanTimeSeconds`

This applies to `scan_site` when it returns an API v2 scan resource or job, `get_scan`, and `get_scan_status` when called with a `scanId`. `scanTimeSeconds: null` means timing is unavailable or incomplete and should not be displayed as `0`.

## Completed-Limited No-Go Results

No-go scans are usable terminal results, not transport failures. Relevant tools retain `status: "completed_limited"`, `resultDisposition: "no_go"`, the stable reason code, customer-safe title and explanation, `limitationKind` attribution, retry guidance, and a bounded `evidenceExcerpt` when retained. Unknown future reasons use generic customer copy while remaining structured as `reasonCode: "unknown"`.

## Hosted Streamable HTTP

OAuth-capable MCP clients can connect to:

```text
https://mcp.certscore.ai/mcp
```

Discovery endpoints:

```text
https://mcp.certscore.ai/.well-known/oauth-protected-resource
https://certscore.ai/.well-known/oauth-authorization-server
```

The hosted service uses OAuth authorization code with PKCE. Default read access requests `scan:read mcp`; support-gated scan creation additionally requests `scan:create`. The same tool implementation and output contracts power stdio and hosted transports.

## Configuration

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

## API Key Access

Stdio API keys use `pulse:read` and `mcp`; creating scans additionally requires `pulse:scan`. Hosted OAuth uses `scan:read` and `mcp`, with support-gated `scan:create`. Request scan-creation access by emailing `support@certscore.ai` with your organization, MCP client, expected workflow, expected request volume, and contact email.

## Verify Install

```bash
certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=... certscore-mcp doctor
```

The doctor command checks binary startup, version output, Node.js runtime compatibility, the configured CertScore base URL, API v2 health, and API key presence. It does not print secrets, create scans, or inspect raw scanner artifacts. There is no dedicated public auth-check endpoint; verify credentials with a real MCP tool call such as `scan_site` after the client is connected.

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

1. Call `scan_site` with a public URL.
2. If it returns a `jobId`, call `get_scan_status` until the scan completes.
3. Call `get_scan` with the stable `scanId`.
4. Call `list_findings` to route structured findings into review workflows.
5. Call `get_evidence` when a reviewer or agent needs the larger bounded evidence packet.
6. Call `get_pre_consent_cookies_trackers` when the user asks for Cookies & Trackers (Pre-consent) table data as JSON.
7. Call `explain_finding` when a reviewer needs evidence and caveats for a specific finding.
8. Call `get_latest_domain_scan` or `get_latest_domain_pre_consent_cookies_trackers` when the user asks for latest eligible public data for a domain.

```json
{
  "tool": "get_pre_consent_cookies_trackers",
  "arguments": {
    "scanId": "00000000-0000-4000-8000-000000000123"
  }
}
```

```json
{
  "tool": "get_latest_domain_pre_consent_cookies_trackers",
  "arguments": {
    "domain": "example.com",
    "scanFrom": "eu_ie"
  }
}
```

When summarizing table data, group rows by `vendor`, `purpose`, and `host` unless the user asks for row-level JSON.
Treat MCP outputs as automated public-web observations for review. They are not legal advice, certification, or a compliance determination. MCP tools must not infer findings from raw labels, raw network events, missing data, or display-only context.

## Live Smoke

```bash
CERTSCORE_API_KEY=... pnpm mcp:certscore:smoke
```

Optional:

```bash
CERTSCORE_MCP_SMOKE_URL=https://example.com
```

Without `CERTSCORE_API_KEY`, the smoke script exits successfully with a skip message.

For the full production operator smoke, run from the WC01 repo:

```bash
pnpm ops:smoke:mcp-production
```

This verifies the Homebrew-installed `certscore-mcp` command against live `https://certscore.ai`. It creates a short-lived preview key, stores only the hash in production through the approved ECS/Fargate path, checks required tools, requests a fresh EU-IR scan with `freshness: "refresh"` and `scanFrom: "eu_ie"`, requires non-empty findings and pre-consent cookies/trackers rows, runs `explain_finding`, and revokes the temporary key afterward. It exercises existing public-safe API/MCP projections only.

## Troubleshooting

- Command not found: run the Homebrew install again and confirm Homebrew's bin directory is on `PATH`.
- Missing API key: set `CERTSCORE_API_KEY` in the MCP client environment and rerun `certscore-mcp doctor`.
- Bad token: rotate the key or request a scoped API/MCP key from `support@certscore.ai`.
- API unreachable: check `CERTSCORE_BASE_URL` and verify `https://certscore.ai/api/v2/health`.
- Homebrew tap stale: run `brew update` and reinstall `certscore-mcp`.
- Old cached release: run `brew reinstall --cask certscore-mcp` after updating the tap.

## Runbook

See `docs/certscore-mcp-homebrew-release.md` for Homebrew release steps and `docs/certscore-mcp-preview-runbook.md` for key issuance, smoke testing, deploy verification, and scan-to-report guardrails.
