# CertScore.ai MCP Light installation and agent reference

CertScore.ai MCP Light is the no-account, low-friction remote MCP for evidence-backed observation of public websites. Its canonical registry identity is `ai.certscore/mcp-light`.

## Connection

| Field | Value |
| --- | --- |
| Endpoint | `https://mcp.certscore.ai/mcp/light` |
| Transport | Streamable HTTP |
| Authentication | None; do not send an API key, bearer token, or OAuth configuration |
| Repository MCP version | `0.2.34` |

The repository version comes from `packages/certscore-mcp/server-light.json`; it does not verify the currently serving runtime or a directory publication.

Configure an MCP client as a remote HTTP server with the endpoint above. Product configuration formats differ, so use the client's current remote-MCP UI or documentation rather than adapting a local stdio example.

Known command-line setup examples:

```bash
codex mcp add certscore --url https://mcp.certscore.ai/mcp/light
claude mcp add --transport http certscore https://mcp.certscore.ai/mcp/light
```

This repository also contains separately versioned integration packages for Claude Code at `integrations/claude-code/certscore-mcp-light`, Cursor at `integrations/cursor/certscore-website-privacy-preflight`, and OpenAI/ChatGPT/Codex at `integrations/openai/certscore-website-privacy-preflight`. The Claude repository marketplace catalog is at `.claude-plugin/marketplace.json`. External marketplace submission or public plugin publication is intentionally not performed here.

For Cursor, Cline, Kilo, GitHub, and other MCP clients, select Streamable HTTP (sometimes labeled HTTP or remote MCP), enter the endpoint, and leave authentication and headers empty.

## Tools

Light exposes the three-step scan/status/bundle workflow plus paginated report evidence:

- `certscore_scan_site`: request a scan of a public URL or reuse an eligible recent completed scan. Retain the returned `scanId`. A new scan may also return `preConsentPreview`, a bounded partial preview of checkpoint cookie/tracker observations. Its counts are partial, not the full scan tally, and must never be reported as final totals. Prefer the default `freshness=latest`; use `refresh` only when the user explicitly asks for a fresh or repeated scan.
- `certscore_get_scan_status`: poll an active scan using only its stable `scanId`. Honor the returned retry delay and stop at a terminal state. A preview may also appear here, but it does not stop polling.
- `certscore_get_scan_bundle`: after a usable terminal completion, retrieve a bounded, public-safe bundle of canonical findings, evidence summaries and references, coverage, limitations, score metadata, and report links.

MCP Light applies a 25,000-byte response ceiling. Larger requested bundle budgets are explicitly clamped in response metadata; when the complete tier exceeds the ceiling, use the returned canonical report or evidence URL rather than repeatedly increasing `maxBytes`.

The bundle can include observations about pre-consent cookies and browser storage, trackers and resolved vendors, CMP and consent-control signals, privacy-policy and disclosure surfaces, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport. It returns only evidence and findings present in the canonical scan projection.

- `certscore_get_report_evidence_page`: retrieve the persisted public report in pages; follow `pagination.nextCursor` to completion and preserve coverage limitations. Current setup and catalog: https://certscore.ai/developers/mcp.

## Scan lifecycle

1. Call `certscore_scan_site` with the public URL.
2. Retain `scanId` whenever one is returned.
3. If `preConsentPreview` is present, treat it only as a partial preview of checkpoint observations. Its counts are partial, not the full scan tally. It contains no canonical findings or score, is not completion, and must not be reported as final totals.
4. If the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` with that ID only.
5. Stop at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
6. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with `detail=findings` before reporting full scan results. Complete the retained-report check below before the first answer.

If a retryable error is returned without a `scanId`, wait for `retryAfterSeconds` and retry `certscore_scan_site`; there is no scan to poll yet. A `completed_limited` result is usable but explicitly limited. Do not request a bundle after `failed`, `expired`, or `rate_limited` unless a later tool response directs otherwise.

## Complete the first review

Before the first completed review, compare findingsMetadata.returned with findingsMetadata.total and check findingsMetadata.truncated, mcpMetadata.canonicalFindingsComplete, mcpMetadata.truncated and mcpMetadata.omittedSections. Envelope omissions alone do not mean findings are missing. If findings or evidence needed for the answer are missing, use the same scanId for retained reads: retry the bundle at most once using a larger returned nextRecommendedMaxBytes only within responseCeilingBytes and the advertised schema. If still needed, call certscore_get_report_evidence_page with scanId and no section or workpaper filter to recover canonical findings. Continue only with pagination.nextCursor, keeping one snapshot and any selected reviewFocus; use no invented page-size or offset arguments. Read at most five evidence pages for this review, stopping earlier when the missing findings and needed evidence are recovered, pagination.complete is true, a cursor repeats or is missing, the snapshot changes, or a read fails or is rate-limited. Honor returned retry guidance without looping. Reconstruct entries using their JSON Pointer paths and stringPart/stringParts when present; deduplicate canonical findings by ID. Page entry totals are not finding counts. State how many canonical findings were recovered out of the reported total and identify anything still unavailable. Never start a new scan to recover missing report information.

Group overlapping canonical findings without dropping their distinct evidence or IDs. Provide three distinct, useful next actions when the retained evidence supports them; give fewer and explain the limitation rather than inventing actions. Link each action to its returned finding/evidence reference or report URL, and separate proposed remediation and manual verification from observed facts. Keep network requests and their timing, cookie snapshot presence, newly observed cookie writes and their timing, completed consent clicks, and confirmed consent decisions separate. Request timing does not establish cookie-write timing; snapshots do not prove new writes, and a click does not prove registration. State fresh versus reused using the creation response or retained creationDecision; scan_id_lookup alone does not prove reuse. If unknown, say so. Include the original scan time, target, execution region, scope, material coverage limitations and report link. Be concise without dropping evidence or limitations to meet a word target. Report factual findings and resulting scores without deduction explanations or legal conclusions.

## Quota and reuse

Light applies session, requester-IP and shared new-scan limits. See the current policy at https://certscore.ai/developers/mcp#light-usage-limits. Eligible reuse does not consume the new-scan allowance.

With the default `freshness=latest`, an eligible completed scan from the prior 24 hours may be reused. Reuse is reported in the scan response and does not consume the new-scan allowance. `freshness=refresh` bypasses recent-result reuse, but it does not bypass validation, quota, or throttling.

Provenance separates the current retrieval from the original creation decision. `retrievalMode=creation_response` means the result came directly from `certscore_scan_site`; `retrievalMode=scan_id_lookup` means a later status or bundle call fetched the scan by ID. `creationDecision` reports `new_scan` or `reused_scan` only when that fact was retained and otherwise stays `unknown`. Do not treat a scan-ID lookup as proof that the original scan was reused. `scanAgeSeconds` is numeric when a retained age or completion timestamp is available.

The webpage and anonymous REST API use a separate 20-new-scans-per-requester-IP-per-UTC-day allowance. That API allowance is not the Light MCP allowance.

## Known-good first prompt

> Review this public URL with CertScore.ai, allowing eligible recent-result reuse; request fresh observations only if I explicitly ask. Retain the scanId and poll only while active. Retrieve the completed findings bundle, check returned versus total findings and truncation, and recover missing findings through bounded reads of the same retained report. Never rescan to fill gaps. Group overlapping findings, give three distinct evidence-linked next actions when supported (fewer if not), and state remaining gaps, original scan time, region, scope, fresh/reused provenance and report URL. Keep request timing, cookie snapshots, new writes and confirmed consent decisions separate; do not infer legal conclusions.

Supply the public URL under review. For a connection check, list tools and read `certscore://example-report`; preserve its original date and coverage and do not create a replacement scan if unavailable. Claude account, plan and organization requirements are separate from account-free CertScore.ai Light access.

## Example agent uses

- Run a privacy preflight before a website release.
- Review observable behavior on a public vendor domain.
- Inspect pre-consent cookies, storage, trackers, and consent signals on a landing page.
- Compare retained evidence before escalating questions to human privacy review.

## Boundaries

Scans represent observable public-web behavior at a point in time, and a site may behave differently across visits, regions, or states. Results are diagnostic observations and persisted CertScore classifications, not legal advice, certification, or a compliance determination. Missing, not-observed, no-go, or limited evidence is not proof of compliance or absence of risk.

## Troubleshooting

- Authorization or browser login appears: verify the endpoint ends in `/mcp/light`, remove auth headers, and reconnect. `/mcp` is the separate authenticated endpoint.
- No `scanId` is present: honor `retryAfterSeconds` and retry `certscore_scan_site`; do not poll status yet.
- A scan stays active: honor the status response's retry guidance rather than polling tightly.
- The bundle is truncated: inspect `omittedSections`, `fullPayloadBytes`, and `nextRecommendedMaxBytes`, then retry once with the returned complete-tier limit or follow a returned content URL. Compact core findings retain their public evidence anchors before optional inventory detail is removed. A short canonical `nextStep` is retained only when it fits without displacing a finding; use the finding URL or complete tier for longer actions.
- A quota response is returned: reuse an eligible result or wait for `Retry-After` or the UTC reset. Contact support for higher-volume needs.

Support: https://certscore.ai/contact or `support@certscore.ai`

Documentation: https://certscore.ai/developers/mcp

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms

Changelog: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/packages/certscore-mcp/CHANGELOG.md
