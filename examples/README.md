# CertScore Integration Examples

These examples show the preferred public integration paths for CertScore Pulse, the REST API, the TypeScript SDK, and the MCP server.

CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.

## Examples

- `github-actions/certscore-pulse.yml`: run the Marketplace-ready CertScore Pulse action after a deployment.
- `node/pulse-review-handoff.mjs`: create or reuse a scan with `@certscore/sdk`, then print a compact review handoff.
- `mcp/codex-config.json`: example MCP client configuration for the published `@certscore/mcp` server.

## Required Secret

Set `CERTSCORE_API_KEY` to a scoped key with `scan:read` and `scan:create`. MCP clients also need the `mcp` scope.
