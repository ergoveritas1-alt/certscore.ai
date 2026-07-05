# CertScore Public Integration Discoverability Plan

## Objective

Make certscore.ai the canonical, crawlable, machine-readable, and agent-readable home for CertScore public website risk-signal integrations: the API, Pulse API, TypeScript SDK, and MCP server.

The public integration surface should be easy to discover and use across search engines, generative answer engines, and AI agents including OpenAI/ChatGPT, Anthropic/Claude, Perplexity, Google/Gemini, Microsoft Copilot/Bing, DeepSeek, Kimi, Qwen, Grok/xAI, Mistral, Meta, and future agents.

## Guardrails

All public API, SDK, MCP, docs, and discovery surfaces must preserve the canonical WC01 flow:

```text
WS01 observed evidence
-> WC01 normalized concern
-> WC01 concern policy
-> WC01 unified finding / checklist projection
-> executive/regulatory display
```

These surfaces must not create findings, scores, policy conclusions, evidence shortcuts, display-only findings, or raw-signal inference. They may expose only already-projected, public-safe artifacts.

## Current Surface Audit

Current public Pulse/discovery assets:

- `/api-pulse` crawlable Pulse API beta docs.
- `/api-pulse/agent` browser-readable agent fallback page.
- `/api-pulse-agent-guide.txt` plain text agent guide.
- `/llms.txt` LLM-readable site and Pulse guide.
- `/.well-known/certscore-pulse` Pulse beta discovery JSON.
- `/api/v1/openapi.json` public Pulse OpenAPI.
- `/api/v1/openapi.chatgpt.json` GPT Action-oriented OpenAPI variant.
- `/api/v1/pulse`, `/api/v1/pulse/gpt`, `/api/v1/pulse/status/{jobId}`.
- `/api/v1/pulse-health` and `/api/v1/pulse-self-test` canaries.
- `@certscore/sdk@0.2.0` is published on npm with `latest` pointing to `0.2.0`.
- `@certscore/mcp` is published on npm and active in the Official MCP Registry as `ai.certscore/mcp`.
- Root `action.yml` exposes a Marketplace-ready CertScore Pulse GitHub Action.
- `integrations/postman/certscore-api-v2.postman_collection.json` seeds a Postman Public API Network workspace.
- `integrations/api-directories/` contains APIs.guru, Postman, and RapidAPI submission drafts.
- `/apis.json` exposes API directory discovery metadata.
- `scripts/smoke-pulse-endpoints.ts`, `scripts/verify-pulse-public.sh`, and `scripts/smoke-certscore-mcp.mjs` smoke coverage.

Primary gaps:

- Discovery is Pulse-specific rather than a universal CertScore AI/API integration manifest.
- `llms.txt` is doing too much; a fuller long-form `llms-full.txt` should exist for agents that can ingest more context.
- Sitemap/robots should explicitly expose machine-readable public integration assets.
- Submit the prepared Postman, APIs.guru, RapidAPI, and GitHub Marketplace listings through their account-owned workflows.
- Add public workspace/listing URLs back to `/developers`, `/llms.txt`, `/llms-full.txt`, and `/.well-known/certscore-ai.json` after the external listings are live.

## Target Public Information Architecture

Durable target paths:

- `/api-pulse` remains the v1 Pulse beta docs and compatibility entry point.
- `/api-pulse/agent` remains the agent fallback page.
- `/llms.txt` remains the concise LLM entry point.
- `/llms-full.txt` becomes the detailed LLM/agent integration guide.
- `/.well-known/certscore-pulse` remains the v1 Pulse beta discovery document.
- `/.well-known/certscore-ai.json` becomes the vendor-neutral public AI/API discovery manifest.
- `/api/v1/openapi.json` and `/api/v1/openapi.chatgpt.json` remain v1 specs.

Implemented developer paths:

- `/developers` is the public developer hub.
- `/developers/quickstart`, `/developers/reference`, `/developers/sdk`, `/developers/mcp`, and `/developers/examples` are crawlable server-rendered docs pages.
- `/api/v2/openapi.json` is the API v2 machine-readable contract.
- `/api-pulse` remains the Pulse v1 compatibility docs and now links forward to `/developers`.
- `/apis.json` is the API directory discovery document.

## Phased Plan

### Phase 1: Discovery Foundation

Add universal AI discovery without changing API behavior:

- Add `/.well-known/certscore-ai.json`.
- Add `/llms-full.txt`.
- Update robots and sitemap to expose public integration assets.
- Cross-link `llms.txt`, `llms-full.txt`, OpenAPI, MCP, SDK, and discovery manifests from `/api-pulse`.
- Keep private app/admin/account/customer surfaces blocked or authenticated.

### Phase 2: Canonical Contract Package

Create `packages/certscore-api-contracts` to own public contracts:

- Zod schemas.
- TypeScript types.
- OpenAPI generation.
- Error envelopes.
- Scan/job/finding/evidence summary schemas.
- Stable enums.
- Shared SDK/MCP schema inputs and outputs where practical.

Initial implementation:

- Added `@certscore/api-contracts` with Pulse v1 public constants, Zod schemas, and the Pulse v1 OpenAPI builder.
- Updated `/api/v1/openapi.json` to use the shared OpenAPI builder instead of a route-local document.
- Added focused tests for schema acceptance and stable OpenAPI operations.

Follow-up implementation:

- Added the ChatGPT/GPT Action OpenAPI builder to `@certscore/api-contracts`.
- Updated `/api/v1/openapi.chatgpt.json` to use the shared builder.
- Added MCP tool input schemas and current tool metadata to `@certscore/api-contracts`.
- Updated `certscore-mcp` to register tool input schemas from the shared contract package.

### Phase 3: Resource-Oriented API v2

Add v2 beside v1:

- `POST /api/v2/scans`
- `GET /api/v2/scans/{scanId}`
- `GET /api/v2/scans/{scanId}/status`
- `GET /api/v2/scans/{scanId}/findings`
- `GET /api/v2/scans/{scanId}/findings/{findingId}`
- `GET /api/v2/domains/{domain}/latest`
- `GET /api/v2/scans/{scanId}/pulse`
- `GET /api/v2/openapi.json`
- `GET /api/v2/health`

Pulse should become an agent-friendly projection over scan resources, not the full API design.

Initial contract implementation:

- Added draft API v2 resource schemas to `@certscore/api-contracts` for scan creation, jobs/status, scan resources, finding lists/details, public-safe evidence summaries, latest domain scan lookup, Pulse projection, and error envelopes.
- Added a draft API v2 OpenAPI builder to lock the intended resource-oriented path and operation IDs before route implementation.

Initial route implementation:

- Added read-only `/api/v2/health` and `/api/v2/openapi.json` routes.
- Exposed the draft v2 health/OpenAPI URLs from robots, sitemap, llms guides, and the universal AI/API discovery manifest.

First resource route:

- Added read-only `GET /api/v2/scans/{scanId}` for completed anonymous public scans.
- The route projects an existing scan detail record into the v2 scan resource shape and does not expose findings or raw evidence.
- Added read-only `GET /api/v2/scans/{scanId}/pulse` as a v2 wrapper around the existing public Pulse projection for completed anonymous public scans.

Expanded API v2 implementation:

- Added `POST /api/v2/scans` as a compatibility wrapper over the existing Pulse scan creation, reuse, validation, and throttling path.
- Added `GET /api/v2/scans/{scanId}/status` for public-safe scan status.
- Added `GET /api/v2/scans/{scanId}/findings` and `GET /api/v2/scans/{scanId}/findings/{findingId}` from existing full Pulse/public report projection only.
- Added `GET /api/v2/domains/{domain}/latest` for latest eligible anonymous completed scan lookup.
- Updated API v2 OpenAPI, robots, llms guides, and the universal AI/API manifest to expose the live v2 read routes.
- Added API v2 OpenAPI success, pending, error, throttling, Retry-After, and temporary service-error examples.
- Added tests that lock API v2 operation IDs, examples, Retry-After headers, legal posture, and raw/internal leakage guards.

### Phase 4: SDK and MCP Migration

Move the SDK toward resource clients:

- `certscore.scans.create()`
- `certscore.scans.get()`
- `certscore.scans.status()`
- `certscore.scans.wait()`
- `certscore.findings.list()`
- `certscore.findings.explain()`
- `certscore.pulse.get()`
- `certscore.domains.latest()`

Move MCP toward a CertScore agent interface:

- `scan_site`
- `get_scan`
- `get_scan_status`
- `list_findings`
- `explain_finding`
- `get_evidence_summary`
- `get_latest_domain_scan`

Current implementation:

- Added SDK resource clients while preserving existing `scan`, `submitScan`, `getScan`, and `getJobStatus` compatibility methods.
- Added MCP tools `scan_site`, `get_scan`, `list_findings`, and `get_latest_domain_scan`.
- `get_scan_status` now accepts either a Pulse `jobId` or API v2 `scanId`.
- `explain_finding` now retrieves the API v2 finding detail shape.
- Updated SDK and MCP README files to match the current resource client/tool surface.
- Added README drift tests for SDK resource clients and MCP tools/public docs.
- Published `@certscore/sdk@0.2.0` to npm with public package metadata and install-first docs.
- Added the CertScore Pulse GitHub Action metadata and zero-dependency action runner.
- Added reusable examples for GitHub Actions, Node SDK review handoff, and MCP client config.

### Phase 4.6: External Distribution Assets

Implemented:

- Added `integrations/postman/certscore-api-v2.postman_collection.json`.
- Added APIs.guru, Postman Public API Network, and RapidAPI listing drafts under `integrations/api-directories/`.
- Added `/apis.json` and linked it from robots, sitemap, the developer hub, and agent-readable docs.
- Updated the AI discovery manifest with SDK package metadata, GitHub Action metadata, and MCP published status.

Remaining account-owned actions:

- Publish the GitHub Action through GitHub Marketplace after creating a release/tag.
- Publish the Postman public workspace and add the final workspace URL to docs.
- Submit the APIs.guru issue/PR.
- Create the RapidAPI listing once pricing and account routing are finalized.

### Phase 4.5: Pre-Deploy Discoverability Hardening

Implemented before deploy:

- Added public `Developers` navigation from the shared header Resources menu.
- Added footer links to `/developers`, `/developers/reference`, `/developers/sdk`, and `/developers/mcp`.
- Cross-linked `/api-pulse` to `/developers`, `/developers/reference`, and `/developers/mcp`.
- Added authentication, scopes, rate-limit, support, terms, and privacy links to `llms.txt`, `llms-full.txt`, and the well-known manifests.
- Added tests that verify developer docs are present in sitemap, robots, llms files, manifests, header, and footer.
- Added tests that confirm API v2 routes remain beside the public projection layer and do not import finding-pipeline, scanner-runtime, raw-artifact, repair, or backfill modules.

### Phase 5: Verification and Migration

Add verification for:

- OpenAPI validity and examples.
- SDK tests.
- MCP tests.
- `llms.txt` and `llms-full.txt` canonical links.
- Sitemap and robots exposure.
- Existing v1 Pulse smoke compatibility.
- No endpoint creating findings outside the canonical pipeline.

Document compatibility commitments and deprecation timing before any v1 removal.

## Migration and Launch Note

Status: implementation in progress. Do not deploy yet.

Current v1 behavior:

- Pulse v1 remains the production scan creation and compatibility entry point.
- `/api/v1/pulse` supports URL scan/reuse, `scanId` lookup, JSON/markdown formats, detail levels, status polling, GPT Action behavior, throttling, and recent-scan reuse.
- `@certscore/sdk` keeps `scan`, `submitScan`, `getScan`, and `getJobStatus`.
- MCP keeps `scan_site`, `get_report`, and `export_findings` workflows.

Target v2 behavior:

- API v2 is resource-oriented: scans, scan status, findings, finding detail, domain latest, and Pulse projection.
- `POST /api/v2/scans` is implemented as a compatibility wrapper over the existing Pulse scan creation path and returns v2 `Scan` or `ScanJob` resources.
- V2 read routes expose eligible public anonymous scan records and existing public report/Pulse projections.

Compatibility commitments:

- Do not remove or break Pulse v1 routes during the v2 rollout.
- Keep existing SDK method names working while adding resource clients.
- Keep existing MCP tool names available where they are already documented.
- Public API/MCP outputs must not expose raw scanner artifacts or create findings outside the canonical pipeline.

SDK migration:

- New resource clients are available as `certscore.scans`, `certscore.findings`, `certscore.pulse`, and `certscore.domains`.
- Recommended new read workflow: `certscore.scans.get(scanId)`, `certscore.scans.status(scanId)`, `certscore.findings.list(scanId)`, `certscore.findings.explain(scanId, findingId)`, `certscore.pulse.get(scanId)`.
- Existing `certscore.scan(url)` remains the simple convenience method.

MCP migration:

- Prefer `scan_site`, `get_scan`, `get_scan_status`, `list_findings`, `explain_finding`, and `get_latest_domain_scan`.
- `scan_site`, `get_report`, and `export_findings` remain for Pulse-specific workflows.
- `get_scan_status` accepts either a Pulse `jobId` or API v2 `scanId`.

Docs and redirects:

- Keep `/api-pulse` as the public v1 compatibility docs.
- Continue exposing `/developers`, `/developers/quickstart`, `/developers/reference`, `/developers/sdk`, `/developers/mcp`, `/developers/examples`, `/llms.txt`, `/llms-full.txt`, `/.well-known/certscore-ai.json`, `/.well-known/certscore-pulse`, `/api/v1/openapi.json`, `/api/v1/openapi.chatgpt.json`, and `/api/v2/openapi.json`.
- Do not add `/api` as a docs page inside the Next.js API namespace; use `/developers` as the human-facing hub.

Launch checklist:

- Verify v1 Pulse smoke remains green.
- Verify API v2 create/read routes return public-safe schemas.
- Verify SDK and MCP tests pass after building `@certscore/api-contracts` and `@certscore/sdk`.
- Verify robots and sitemap expose public docs and machine-readable files while private app/admin/account/customer surfaces remain blocked or authenticated.
- Verify `llms.txt`, `llms-full.txt`, and `/.well-known/certscore-ai.json` include canonical API, SDK, MCP, OpenAPI, support, and legal-posture links.
- Verify the shared header/footer expose the developer hub and resource docs.
- Verify API v2 OpenAPI includes success, pending, error, throttling, Retry-After, and 500 examples.
- Verify no API v2 route creates findings or imports scanner/finding-pipeline internals outside the existing public projection path.
- Do not deploy until the user explicitly requests deployment and the pre-ship gate passes.

Known risks before deploy:

- API v2 create still intentionally wraps the Pulse v1 scan creation path for compatibility; do not present v2 as a fully independent scanner pipeline.
- Pulse v1 remains the broadest compatibility surface; docs must continue to describe v1 and v2 clearly.
- The worktree includes unrelated dirty files outside this integration refactor; review the final diff carefully before staging or committing.

Pre-deploy status: do not deploy yet.
