# CertScore.ai MCP Light directory submission copy

Use one Light identity in community directories: `CertScore.ai MCP Light`, registry name `ai.certscore/mcp-light`. Do not list the authenticated MCP as a second name for this product. Mention it only as an optional higher-volume CertScore service where a directory permits upgrade information.

The legal owner and publisher name is `CertScore.ai, LLC` on every platform.

## Title

CertScore.ai MCP Light

## Short description

Free website privacy scanner to detect pre-consent cookies and trackers, CMP and consent controls, privacy policy, GDPR/ePrivacy and CCPA, and HTTPS/TLS signals.

## Full description

Free website privacy scanner and cookie checker for public websites. Detect pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations.

Give CertScore.ai a public website to collect structured, evidence-backed privacy findings for launch review, vendor review, audit triage, or human compliance review. Results include a CertScore score and supporting evidence for human and agentic review; they are not legal advice, certification, or a compliance determination.

No account, API key, bearer token, browser login, or OAuth is required. Light permits up to 50 genuinely new scans per UTC day across both the requester and the shared public Light surface, subject to a 5-new-scan rolling 10-minute requester and shared-surface limit. An eligible completed scan from the prior 24 hours may be reused; reuse does not consume the new-scan allowance.

## Links

- Landing page: https://certscore.ai/mcp/light
- Light endpoint: https://mcp.certscore.ai/mcp/light
- Installation and lifecycle reference: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/docs/mcp-light-install.md
- Documentation: https://certscore.ai/developers/mcp
- Repository: https://github.com/ergoveritas1-alt/certscore.ai
- Support: https://certscore.ai/contact and support@certscore.ai
- Privacy: https://certscore.ai/privacy
- Terms: https://certscore.ai/terms
- Icons: https://certscore.ai/certscore-mark-dark.png for light backgrounds and https://certscore.ai/certscore-mark-light.png for dark backgrounds (PNG, 512 × 512)
- Cline marketplace icon: https://certscore.ai/images/mcp-directory/certscore-mcp-light-cline-400.png (PNG, 400 × 400)
- Changelog: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/packages/certscore-mcp/CHANGELOG.md

## Categories

Privacy; Developer Tools; Website Analysis; Security; Compliance Review; Agent Tools

## Canonical technical fields

- Registry name: `ai.certscore/mcp-light`
- Version: `0.2.16`
- Transport: Streamable HTTP
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`
- Manifest: `packages/certscore-mcp/server-light.json`

The separate `ai.certscore/mcp` manifest and `https://mcp.certscore.ai/mcp` endpoint describe the full authenticated/local CertScore MCP. Do not substitute those values into a Light listing.

## Submission notes

- GitHub MCP Registry: publication is complete. Version `0.2.16` was published to the Official MCP Registry on August 28, 2026 and is the active latest version of `ai.certscore/mcp-light`; verify it at https://registry.modelcontextprotocol.io/?q=ai.certscore%2Fmcp-light and use `packages/certscore-mcp/server-light.json` for future releases after validation and existing namespace authentication.
- Claude Code: the validated plugin package is in `integrations/claude-code/certscore-mcp-light`, with the repository marketplace catalog at `.claude-plugin/marketplace.json`.
- Cursor: the marketplace-ready Agent Plugin package is in `integrations/cursor/certscore-website-privacy-preflight` at integration version `1.0.1`.
- OpenAI: the provider-neutral **With MCP** package is in `integrations/openai/certscore-website-privacy-preflight` at plugin version `2.0.0`; its production endpoint and bundled preview-aware skill must be scanned and submitted together through OpenAI's portal.
- Cline: PR-ready catalog metadata is retained at `integrations/cline/certscore-mcp-light/entry.json`; submission is in review at https://github.com/cline/marketplace/pull/75.
- Kilo: the PR-ready manifest is retained at `integrations/kilo-code/certscore-mcp-light/MCP.yaml`; submission is in review at https://github.com/Kilo-Org/kilo-marketplace/pull/250.
- Docker MCP Catalog: do not submit the current remote-only Light distribution. Catalog work remains blocked unless a separate container distribution is approved and implemented; never imply that the hosted Light service is a downloadable Docker image.
- Copy-ready, platform-specific fields and remaining external actions are in `docs/mcp-light-submission-packets.md`.
