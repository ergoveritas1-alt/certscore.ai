# Website Privacy Preflight

Website Privacy Preflight connects Cursor to the existing no-auth CertScore.ai MCP Light service and adds a bounded public-site privacy-review workflow.

## Included components

- Agent Plugin manifest: `plugin.json`
- Streamable HTTP MCP configuration: `mcp.json`
- Agent skill: `skills/website-privacy-preflight/SKILL.md`
- Monorepo marketplace catalog: `../../../.cursor-plugin/marketplace.json`

## Connection

- Cursor plugin version: `1.0.1`
- Canonical MCP identity: `ai.certscore/mcp-light`
- Hosted MCP version: `0.2.16`
- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

MCP Light allows up to 50 new scans per day. The separate anonymous REST API allows 20 new scans per day. With the default `freshness=latest`, an eligible recent completed scan may be reused without consuming the MCP Light new-scan allowance.

Ask Cursor to run a Website Privacy Preflight for a public URL. The skill retains the scan ID, polls only while the scan is active, stops at a documented terminal state, retrieves a bounded findings bundle when usable, and reports evidence as observations rather than legal conclusions.

Documentation: https://certscore.ai/developers/mcp

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms

## License scope

This Cursor integration package is licensed under the Apache License 2.0. That license applies only to the files in `integrations/cursor/certscore-website-privacy-preflight`.

CertScore services, APIs, scanner implementations, trademarks, and other repository components remain governed by their respective licenses and terms. The Apache License 2.0 does not grant permission to use CertScore.ai, LLC trade names, trademarks, service marks, or product names except as the license permits for describing the origin of this integration.
