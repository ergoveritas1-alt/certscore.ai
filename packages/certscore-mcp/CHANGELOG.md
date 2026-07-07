# certscore-mcp

## 0.2.3

- Adds human-readable MCP tool titles for all 11 tools so connector directory review does not fall back to raw tool names.
- References the API v2 OpenAPI document from the `scan_site` description.

## 0.2.2

- Marks `scan_site` as destructive in MCP tool annotations because it can create persistent scans and enqueue background work.

## 0.2.1

- Aligns the local package with the published scoped npm package name `@certscore/mcp`.
- Includes `server.json` in the npm package for MCP registry submission.
- Keeps the 0.2.x tool surface at 11 tools; `create_scan` remains removed.

## 0.2.0

- Removed the deprecated `create_scan` compatibility alias. Use `scan_site` for scan creation.

## 0.1.5

- Moves Homebrew release artifacts to a Linux-built, deterministic GitHub Actions pipeline.
- Publishes SHA256SUMS alongside the release tarball and verifies GNU tar extraction metadata before upload.

## 0.1.4

- Added a checked-in MCP tool manifest and release guards for server/docs/tool-surface drift.
- Added `get_evidence` transport bounding metadata for oversized Evidence JSON packets.
- Documented the MCP tool surface consistently across package and developer docs.
- Added clean-env npx smoke coverage for install, doctor, tools/list annotations, bounded evidence, and tool-error shape.

## 0.1.3

- Registered MCP tools from the shared CertScore MCP contract definitions to prevent server/contract metadata drift.
- Added package-level Node.js engine metadata aligned with the runtime doctor check.
- Fixed root-level MCP smoke dependency resolution for operator release checks.

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
