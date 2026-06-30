# @certscore/mcp

## 0.1.2

- Added Homebrew cask distribution for the prebuilt `certscore-mcp` command.
- Updated install docs to use `brew install --cask certscore-mcp` so users do not need local Xcode build tooling for the CertScore package.
- Made the Homebrew wrapper resolve symlinks before launching the bundled MCP server.

## 0.1.1

- Added `certscore-mcp doctor` for Homebrew install verification.
- Documented Homebrew troubleshooting for external MCP clients.

## 0.1.0

- Added developer-preview stdio MCP server for CertScore Pulse.
- Added scoped v1 tools: `create_scan`, `get_scan_status`, `get_report`, `export_findings`, and `explain_finding`.
- Added structured finding export and finding explanation helpers.
- Added MCP protocol and tool-call tests using mocked Pulse API responses.
- Added live smoke command support through `pnpm mcp:certscore:smoke`.
