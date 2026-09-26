# CertScore.ai MCP Light for Claude Code

CertScore.ai MCP Light is a free website privacy scanner and cookie checker for public websites. It detects pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. Eligible scans retain Accept/Reject execution and after-click facts independently of consent confirmation. Results are automated public-web observations for review, not legal advice, certification, or a compliance determination.

This plugin connects Claude Code to the existing no-auth CertScore.ai MCP Light endpoint and adds the `/certscore-mcp-light:privacy-scan` workflow. It contains no hooks, autonomous actions, local executables, credentials, or write tools.

Plugin package version: `0.2.25`. The hosted MCP runtime is also `0.2.25`.

Connection:

- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Transport: HTTP (Streamable HTTP)
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`, `certscore_get_report_evidence_page`

Validate the package from the repository root with:

```bash
claude plugin validate ./integrations/claude-code/certscore-mcp-light
```

For the scan lifecycle, quota, reuse behavior, troubleshooting, and boundaries, see [the MCP Light installation reference](../../../docs/mcp-light-install.md).

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms

## Retained audit workpapers

For inventory, CCPA/CPRA workpapers or export requests, use the existing `scanId` with `certscore_get_report_evidence_page` and `workpaper="tracking"` when advertised by the server. Ordinary summaries use `privacyAuditSummary` and the returned GPC facts without an automatic extra read. The workpaper provides retained starting-page inventory, privacy-choice controls, notice passages, and GPC evidence. Preserve `workpaper="tracking"` with every `pagination.nextCursor`; use `download.url` for JSON and `download.csvUrl` for CSV. Keep private download links confidential; request a fresh link after expiry. Missing evidence in a bounded bundle is not evidence of absence: inspect `mcpMetadata.omittedSections` and retrieve the workpaper when needed. If the tool or selector is missing, refresh the existing connection's tool list or update the local MCP package; do not start a replacement scan.

Report observed Do Not Sell/Share controls and notice passages as evidence. Control presence does not establish opt-out effectiveness, and notice passages do not assess adequacy. Preserve the actual scan origin and existing CertScore score; the regulatory focus does not change the evidence or produce a separate CCPA score.
