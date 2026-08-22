# CertScore.ai MCP Light for Claude Code

This plugin connects Claude Code to the existing no-auth CertScore.ai MCP Light endpoint and adds the `/certscore-mcp-light:privacy-scan` workflow. It contains no hooks, autonomous actions, local executables, credentials, or write tools.

Plugin package version: `0.2.15`. The hosted MCP runtime is also `0.2.15`.

Connection:

- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Transport: HTTP (Streamable HTTP)
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

Validate the package from the repository root with:

```bash
claude plugin validate ./integrations/claude-code/certscore-mcp-light
```

For the scan lifecycle, quota, reuse behavior, troubleshooting, and boundaries, see [the MCP Light installation reference](../../../docs/mcp-light-install.md).

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms
