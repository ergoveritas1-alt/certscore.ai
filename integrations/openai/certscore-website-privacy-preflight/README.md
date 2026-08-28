# Website Privacy Preflight for ChatGPT and Codex

This package contains the provider-neutral skill and remote MCP wiring for an OpenAI **With MCP** plugin submission.

## Included components

- OpenAI plugin manifest: `.codex-plugin/plugin.json`
- Repository-test MCP configuration: `.mcp.json`
- Provider-neutral skill: `skills/website-privacy-preflight/SKILL.md`
- OpenAI skill metadata and MCP dependency: `skills/website-privacy-preflight/agents/openai.yaml`

## Release identities

- OpenAI plugin version: `1.0.0`
- Hosted MCP version: `0.2.16`
- Production Streamable HTTP endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

The package version and hosted MCP version are intentionally independent. A hosted MCP deployment updates direct MCP users at the stable URL; publishing this plugin separately distributes the bundled workflow instructions through ChatGPT and Codex.

## Public submission

In OpenAI's plugin submission portal, create a **With MCP** draft, submit the production endpoint above, and add the bundled skill from this package to the same draft. Complete domain verification, listing metadata, safety review, and publisher identity requirements in the portal before submission.

The direct `.mcp.json` mapping supports repository validation and compatible local plugin hosts. If ChatGPT developer mode creates a registered connection with a technical ID beginning `plugin_asdk_app`, a local test package may instead reference that registered connection through `.app.json`; do not invent or commit a placeholder connection ID.

Documentation: https://certscore.ai/developers/mcp

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms
