# certscore-mcp

## 0.2.9

- Add an unauthenticated hosted Streamable HTTP endpoint at `/mcp/anonymous` for low-volume agent discovery without account or OAuth setup.
- Preserve the existing 10-new-scans-per-requester-IP-per-UTC-day anonymous quota through the MCP gateway.
- Authenticate the forwarded requester identity so anonymous MCP quota accounting remains per agent rather than per gateway.
- Keep the OAuth-protected `/mcp` endpoint and authenticated tool behavior unchanged.

## 0.2.8

- Rebuild the distributed MCP binary against the SDK client-attribution header so stdio scan requests persist as MCP activity instead of generic Pulse activity.
- Add `certscore-mcp doctor --check-auth` and a side-effect-free API credential check endpoint.
- Keep `create_scan` as a compatibility alias while directing new integrations to `scan_site`.

## 0.2.7

- Return bounded MCP errors as text-only `isError` results so success output schemas cannot reject valid in-progress or API error responses.
- Make the production smoke wait for a terminal scan resource before exercising report tools.

## 0.2.6

- Preserve structured no-go disposition, reason-specific messaging, and retry guidance in scan, status, report, export, and explanation tools.
- Add the reproducible Streamable HTTP runtime, OAuth PKCE authorization flow, consolidated ECS deployment path, and authenticated transport parity smoke coverage.
- Preserve completed-limited status, result attribution, and bounded no-go evidence excerpts across stdio and hosted transports.

## 0.2.5

- Rebuilt the MCP server against `@certscore/sdk@0.2.3`.
- Documented API v2 scan timing fields returned by `scan_site`, `get_scan`, and `get_scan_status`: `startedAt`, `completedAt`, and `scanTimeSeconds`.
- Clarified that `scanTimeSeconds: null` means timing is unavailable and should not be displayed as `0`.

## 0.1.5

- Moves Homebrew release artifacts to a Linux-built, deterministic GitHub Actions pipeline.
- Publishes SHA256SUMS alongside the release tarball and verifies GNU tar extraction metadata before upload.

## 0.1.4

- Added a checked-in MCP tool manifest and release guards for server/docs/tool-surface drift.
- Added `get_evidence` transport bounding metadata for oversized Evidence JSON packets.
- Documented all 12 MCP tools consistently across package and developer docs.
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
