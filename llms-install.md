# Install CertScore.ai MCP Light

CertScore.ai MCP Light is a hosted Streamable HTTP MCP server for scanning public websites. It requires no account, API key, OAuth flow, local executable, package installation, or environment variable.

## Canonical connection

- Name: `CertScore.ai MCP Light`
- Registry name: `ai.certscore/mcp-light`
- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Transport: Streamable HTTP
- Authentication: none
- Version: `0.2.19`
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

Do not substitute `https://mcp.certscore.ai/mcp`, which is the authenticated CertScore MCP service.

## Cline

Add this entry under `mcpServers` in Cline's MCP settings. The explicit camel-case `streamableHttp` type is required for Cline's modern HTTP transport.

```json
{
  "mcpServers": {
    "certscore-light": {
      "type": "streamableHttp",
      "url": "https://mcp.certscore.ai/mcp/light",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

No headers or credentials are required. Keep `autoApprove` empty so the user retains control over scan creation.

## Cursor

```json
{
  "mcpServers": {
    "certscore-light": {
      "url": "https://mcp.certscore.ai/mcp/light"
    }
  }
}
```

## Kilo Code or Kilo CLI

Add this entry under the top-level `mcp` key in Kilo configuration:

```json
{
  "mcp": {
    "certscore-light": {
      "type": "remote",
      "url": "https://mcp.certscore.ai/mcp/light",
      "enabled": true
    }
  }
}
```

## Claude Code

The repository includes a validated plugin at `integrations/claude-code/certscore-mcp-light`. After the repository changes are publicly available:

```text
/plugin marketplace add ergoveritas1-alt/certscore.ai
/plugin install certscore-mcp-light@certscore-ai
```

## Verify the connection

The connected server must expose exactly these three tools:

1. `certscore_scan_site`
2. `certscore_get_scan_status`
3. `certscore_get_scan_bundle`

Known-good prompt:

> Use CertScore.ai MCP Light to check https://example.com. Prefer a recent reusable result, follow returned retry guidance until terminal, then summarize the evidence-backed privacy findings and limitations. Do not present the result as legal advice, certification, or a compliance determination.

Light permits 50 genuinely new scans per UTC day across requester and shared public-Light scopes, subject to a 5-new-scan rolling 10-minute limit. An eligible completed scan from the prior 24 hours may be reused; reuse does not consume the new-scan allowance.

Results are automated public-web observations for human and agentic review; they are not legal advice, certification, or a compliance determination.

For lifecycle states, result retrieval, troubleshooting, and evidence boundaries, see `docs/mcp-light-install.md`.
