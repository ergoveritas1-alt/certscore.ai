# certscore-mcp

## 0.2.15

- Reserve the first compact finding in both `findings` and `evidence` modes before optional summary, link, coverage, and evidence detail.
- Preserve the first evidence digest or reference while compacting oversized 5,000-byte responses.
- Add a live-shaped regression fixture with production-scale link metadata to prevent all findings from being omitted at the minimum byte budget.

## 0.2.14

- Reserve a compact finding in `findings` mode and a bounded evidence digest/reference in `evidence` mode when the requested byte budget permits.
- Add selected detail, omitted sections, next recommended byte limit, and report/evidence retrieval URLs to bundle metadata.
- Return machine-readable `invalid_arguments` details alongside MCP `-32602` validation errors.
- Keep typed `certscore_scan_site` validation envelopes compatible with client-side output-schema validation after `tools/list` discovery.
- Require complete actionable error objects for failed, expired, rate-limited, and completed-limited no-go results.
- Add top-level canonical timing fields and contract coverage proving all three Light result tools remain immutable and consistent.

## 0.2.13

- Gate Light completion on one persisted canonical result and expose matching score, risk, coverage, timestamps, version metadata, and report links across all three Light tools.
- Add actionable terminal errors, event-backed heartbeat/stalled state, explicitly estimated progress, and deterministic scanId-only polling guidance.
- Implement distinct summary, findings, evidence, and full bundle modes with a 5,000-byte minimum budget and explicit requested/actual/truncation metadata.
- Remove full text/structured-content duplication, prevent Light from recommending unavailable tools, and stop advertising OAuth metadata to anonymous Light clients.
- Add machine-readable source, evidence link, and truncation metadata to projected evidence excerpts.

## 0.2.12

- Add the no-account `https://mcp.certscore.ai/mcp/light` endpoint with the focused `certscore_scan_site`, `certscore_get_scan_status`, and `certscore_get_scan_bundle` workflow.
- Raise the no-account allowance to 20 new scans per requester per UTC day; eligible recent-result reuse remains free.
- Give quota-limited agents a direct `support@certscore.ai` path for higher-volume access.
- Advertise the hosted Streamable HTTP endpoint in MCP Registry metadata while retaining the npm stdio package.

## 0.2.11

- Add `certscore_get_scan_bundle` as the compact second call after `certscore_scan_site`, retrieving the canonical scan, report summary, projected findings, bounded evidence, and pre-consent inventory in parallel.
- Report scan reuse, freshness decisions, anonymous quota consumption and remaining allowance, UTC reset time, and the recommended next tool from `certscore_scan_site`.
- Normalize terminal status to the canonical `completed` or `completed_limited` scan resource and direct agents to the bundle.
- Mark `create_scan` as a deprecated compatibility alias in the public tool surface and document the two-call default workflow.

## 0.2.10

- Hydrate terminal API v2 MCP status responses with the canonical scan resource so completed-limited no-go status and reason are available in one call.

## 0.2.9

- Add an unauthenticated hosted Streamable HTTP endpoint at `/mcp/anonymous` for low-volume agent discovery without account or OAuth setup.
- Preserve the existing 10-new-scans-per-requester-IP-per-UTC-day anonymous quota through the MCP gateway.
- Authenticate the forwarded requester identity so anonymous MCP quota accounting remains per agent rather than per gateway.
- Keep the OAuth-protected `/mcp` endpoint and authenticated tool behavior unchanged.

## 0.2.8

- Rebuild the distributed MCP binary against the SDK client-attribution header so stdio scan requests persist as MCP activity instead of generic Pulse activity.
- Add `certscore-mcp doctor --check-auth` and a side-effect-free API credential check endpoint.
- Keep `create_scan` as a compatibility alias while directing new integrations to `certscore_scan_site`.

## 0.2.7

- Return bounded MCP errors as text-only `isError` results so success output schemas cannot reject valid in-progress or API error responses.
- Make the production smoke wait for a terminal scan resource before exercising report tools.

## 0.2.6

- Preserve structured no-go disposition, reason-specific messaging, and retry guidance in scan, status, report, export, and explanation tools.
- Add the reproducible Streamable HTTP runtime, OAuth PKCE authorization flow, consolidated ECS deployment path, and authenticated transport parity smoke coverage.
- Preserve completed-limited status, result attribution, and bounded no-go evidence excerpts across stdio and hosted transports.

## 0.2.5

- Rebuilt the MCP server against `@certscore/sdk@0.2.3`.
- Documented API v2 scan timing fields returned by `certscore_scan_site`, `certscore_get_scan`, and `certscore_get_scan_status`: `startedAt`, `completedAt`, and `scanTimeSeconds`.
- Clarified that `scanTimeSeconds: null` means timing is unavailable and should not be displayed as `0`.

## 0.1.5

- Moves Homebrew release artifacts to a Linux-built, deterministic GitHub Actions pipeline.
- Publishes SHA256SUMS alongside the release tarball and verifies GNU tar extraction metadata before upload.

## 0.1.4

- Added a checked-in MCP tool manifest and release guards for server/docs/tool-surface drift.
- Added `certscore_get_evidence` transport bounding metadata for oversized Evidence JSON packets.
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
- Added scoped v1 tools: `create_scan`, `certscore_get_scan_status`, `certscore_get_report`, `certscore_export_findings`, and `certscore_explain_finding`.
- Added structured finding export and finding explanation helpers.
- Added MCP protocol and tool-call tests using mocked Pulse API responses.
- Added live smoke command support through `pnpm mcp:certscore:smoke`.
