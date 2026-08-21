# CertScore.ai MCP Light directory submission copy

Use one Light identity in community directories: `CertScore.ai MCP Light`, registry name `ai.certscore/mcp-light`. Do not list the authenticated MCP as a second name for this product. Mention it only as an optional higher-volume CertScore service where a directory permits upgrade information.

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
- Version: `0.2.15`
- Transport: Streamable HTTP
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`
- Manifest: `packages/certscore-mcp/server-light.json`

The separate `ai.certscore/mcp` manifest and `https://mcp.certscore.ai/mcp` endpoint describe the full authenticated/local CertScore MCP. Do not substitute those values into a Light listing.

## Submission notes

- GitHub MCP Registry: publish `packages/certscore-mcp/server-light.json` only after domain-namespace authentication and a final live validation.
- Claude Code: the validated plugin package is in `integrations/claude-code/certscore-mcp-light`, with the repository marketplace catalog at `.claude-plugin/marketplace.json`.
- Cursor, Cline, and Kilo: reuse the platform-neutral workflow and instruction copy in `docs/mcp-light-marketplace-assets.md`; create platform-owned manifests only in the official submission repository or UI.
- Docker MCP Catalog: do not submit the current remote-only Light distribution. Catalog work remains blocked unless a separate container distribution is approved and implemented; never imply that the hosted Light service is a downloadable Docker image.
- Copy-ready, platform-specific fields and remaining external actions are in `docs/mcp-light-submission-packets.md`.
