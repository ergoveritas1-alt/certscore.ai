# @certscore/mcp

## 0.1.1

- Added `certscore-mcp doctor` for Homebrew install verification.
- Documented Homebrew troubleshooting for external MCP clients.

## 0.1.0

- Added developer-preview stdio MCP server for CertScore Pulse.
- Added scoped v1 tools: `create_scan`, `get_scan_status`, `get_report`, `export_findings`, and `explain_finding`.
- Added structured finding export and finding explanation helpers.
- Added MCP protocol and tool-call tests using mocked Pulse API responses.
- Added live smoke command support through `pnpm mcp:certscore:smoke`.
