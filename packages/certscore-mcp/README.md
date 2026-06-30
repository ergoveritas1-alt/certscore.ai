# CertScore MCP

CertScore MCP exposes a focused Model Context Protocol server for CertScore Pulse workflows.

Status: public developer preview. The server is distributed for external MCP clients through Homebrew as `certscore-mcp` and for local WC01 development through `pnpm mcp:certscore`.

Public docs:

- https://certscore.ai/developers/mcp
- https://certscore.ai/developers/quickstart
- https://certscore.ai/developers/reference
- https://certscore.ai/api-pulse

## Tools

- `scan_site` starts or reuses a CertScore scan for a public URL.
- `create_scan` remains as a compatibility alias for scan creation.
- `get_scan` retrieves the API v2 public-safe scan resource by stable scan ID.
- `get_scan_status` checks a Pulse `jobId` or API v2 `scanId`.
- `get_report` retrieves a Pulse report by stable scan ID as JSON or markdown.
- `export_findings` returns structured findings for ticketing, review, or compliance workflows.
- `list_findings` returns API v2 public-safe findings for a scan.
- `get_pre_consent_cookies_trackers` returns the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON.
- `explain_finding` retrieves one API v2 public-safe finding with evidence summary, caveats, and next steps.
- `get_latest_domain_scan` retrieves the latest eligible API v2 scan for a domain.
- `get_latest_domain_pre_consent_cookies_trackers` retrieves the latest-domain Cookies & Trackers (Pre-consent) table projection.

The initial MCP surface intentionally does not include account scan browsing or scan comparison tools.

## Configuration

Install with Homebrew:

```bash
brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install certscore-mcp
```

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

## Verify Install

```bash
certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=... certscore-mcp doctor
```

The doctor command checks binary startup, version output, Node.js runtime compatibility, the configured CertScore base URL, API v2 health, and API key presence. It does not print secrets, create scans, or inspect raw scanner artifacts. There is no dedicated public auth-check endpoint; verify credentials with a real MCP tool call such as `scan_site` after the client is connected.

## MCP Client Examples

Claude Desktop-style config with the Homebrew command:

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

Cursor config with the Homebrew command:

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
5. Call `get_pre_consent_cookies_trackers` when the user asks for Cookies & Trackers (Pre-consent) table data as JSON.
6. Call `explain_finding` when a reviewer needs evidence and caveats for a specific finding.
7. Call `get_latest_domain_scan` or `get_latest_domain_pre_consent_cookies_trackers` when the user asks for latest eligible public data for a domain.

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

## Troubleshooting

- Command not found: run the Homebrew install again and confirm Homebrew's bin directory is on `PATH`.
- Missing API key: set `CERTSCORE_API_KEY` in the MCP client environment and rerun `certscore-mcp doctor`.
- Bad token: rotate the key or request a scoped API/MCP key from `support@certscore.ai`.
- API unreachable: check `CERTSCORE_BASE_URL` and verify `https://certscore.ai/api/v2/health`.
- Homebrew tap stale: run `brew update` and reinstall `certscore-mcp`.
- Old cached release: run `brew reinstall certscore-mcp` after updating the tap.

## Runbook

See `docs/certscore-mcp-homebrew-release.md` for Homebrew release steps and `docs/certscore-mcp-preview-runbook.md` for key issuance, smoke testing, deploy verification, and scan-to-report guardrails.
