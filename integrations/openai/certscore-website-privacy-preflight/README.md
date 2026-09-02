# Website Privacy Preflight for ChatGPT and Codex

This package contains the provider-neutral skill and remote MCP wiring for an OpenAI **With MCP** plugin submission. It covers fast preliminary cookie/tracker evidence from active scans, persisted public-website privacy evidence, and eligible bounded post-refusal observation of non-essential cookie or tracker activity after a confirmed Reject action.

## Included components

- OpenAI plugin manifest: `.codex-plugin/plugin.json`
- Repository-test MCP configuration: `.mcp.json`
- Provider-neutral skill: `skills/website-privacy-preflight/SKILL.md`
- OpenAI skill metadata and MCP dependency: `skills/website-privacy-preflight/agents/openai.yaml`

## Release identities

- OpenAI plugin version: `2.0.0`
- Hosted MCP version: `0.2.17`
- Production Streamable HTTP endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

The package version and hosted MCP version are intentionally independent. A hosted MCP deployment updates direct MCP users at the stable URL; publishing this plugin separately distributes the bundled workflow instructions through ChatGPT and Codex.

For a newly accepted scan, `certscore_scan_site` returns the stable `scanId` and may include a bounded `preConsentPreview` as soon as the runtime lane completes or reaches its six-second checkpoint. ChatGPT and Codex should surface this preview promptly as preliminary evidence rather than withholding it until the scan completes. Captured counts and returned identity counts are separate because returned lists are bounded. `trackingVendorCount` excludes infrastructure, security, and consent-management vendors, which appear separately in `operationalVendors`; the compatibility preview `trackerCount` must not be compared directly with the completed inventory's broader `trackerCount`. The workflow must continue with `certscore_get_scan_status`, then retrieve `certscore_get_scan_bundle` after completed or completed_limited before reporting the full scan results and final returned tally.

Submission prompts and review cases use multiple owned ErgoVeritas canary pages rather than only the domain root. The selected internal URLs cover broad baseline evidence, runtime storage, shadow-DOM consent controls, policy transparency, and deterministic post-refusal behavior.

## Public submission

In OpenAI's plugin submission portal, create a **With MCP** draft, submit the production endpoint above, and add the bundled skill from this package to the same draft. Complete domain verification, listing metadata, safety review, and publisher identity requirements in the portal before submission.

The direct `.mcp.json` mapping supports repository validation and compatible local plugin hosts. If ChatGPT developer mode creates a registered connection with a technical ID beginning `plugin_asdk_app`, a local test package may instead reference that registered connection through `.app.json`; do not invent or commit a placeholder connection ID.

Documentation: https://certscore.ai/developers/mcp

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms
