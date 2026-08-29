# CertScore.ai MCP Light for Claude Code

CertScore.ai MCP Light is a free website privacy scanner and cookie checker for public websites. It detects pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. On eligible scans, Reject Path reports only confirmed post-refusal evidence after a confirmed Reject action. Results are automated public-web observations for review, not legal advice, certification, or a compliance determination.

This plugin connects Claude Code to the existing no-auth CertScore.ai MCP Light endpoint and adds the `/certscore-mcp-light:privacy-scan` workflow. It contains no hooks, autonomous actions, local executables, credentials, or write tools.

Plugin package version: `0.2.16`. The hosted MCP runtime is also `0.2.16`.

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
