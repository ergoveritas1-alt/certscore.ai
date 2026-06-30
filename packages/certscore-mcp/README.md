# CertScore MCP

CertScore MCP exposes a focused Model Context Protocol server for CertScore Pulse workflows.

Status: developer preview. This package is private to the WC01 workspace while preview token, rate-limit, and distribution details are finalized.

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
- `explain_finding` retrieves one API v2 public-safe finding with evidence summary, caveats, and next steps.
- `get_latest_domain_scan` retrieves the latest eligible API v2 scan for a domain.

The initial MCP surface intentionally does not include account scan browsing or scan comparison tools.

## Configuration

Run from this monorepo:

```bash
CERTSCORE_API_KEY=... pnpm mcp:certscore
```

Generate a scoped preview key after applying DB migrations:

```bash
pnpm db:migrate
pnpm mcp:certscore:generate-key -- --name "CertScore MCP preview"
```

Run the built package directly:

```bash
CERTSCORE_API_KEY=... certscore-mcp
```

Optional:

```bash
CERTSCORE_BASE_URL=https://certscore.ai
CERTSCORE_REQUEST_TIMEOUT_MS=300000
```

`CERTSCORE_API_KEY` should be a scoped CertScore API token for the workspace or preview user. The MCP server passes it to Pulse as a bearer token and does not persist it.

## MCP Client Examples

Claude Desktop-style config:

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

Local package/binary config:

```json
{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN"
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
5. Call `explain_finding` when a reviewer needs evidence and caveats for a specific finding.
6. Call `get_latest_domain_scan` when the user asks for the latest eligible public scan for a domain.

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

## Runbook

See `docs/certscore-mcp-preview-runbook.md` for migration, key issuance, smoke testing, deploy verification, and scan-to-report guardrails.
