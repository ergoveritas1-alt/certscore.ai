# CertScore.ai MCP Light installation and agent reference

CertScore.ai MCP Light is the no-account, low-friction remote MCP for evidence-backed observation of public websites. Its canonical registry identity is `ai.certscore/mcp-light`.

## Connection

| Field | Value |
| --- | --- |
| Endpoint | `https://mcp.certscore.ai/mcp/light` |
| Transport | Streamable HTTP |
| Authentication | None; do not send an API key, bearer token, or OAuth configuration |
| Version | `0.2.16` |

Configure an MCP client as a remote HTTP server with the endpoint above. Product configuration formats differ, so use the client's current remote-MCP UI or documentation rather than adapting a local stdio example.

Known command-line setup examples:

```bash
codex mcp add certscore --url https://mcp.certscore.ai/mcp/light
claude mcp add --transport http certscore https://mcp.certscore.ai/mcp/light
```

This repository also contains separately versioned integration packages for Claude Code at `integrations/claude-code/certscore-mcp-light`, Cursor at `integrations/cursor/certscore-website-privacy-preflight`, and OpenAI/ChatGPT/Codex at `integrations/openai/certscore-website-privacy-preflight`. The Claude repository marketplace catalog is at `.claude-plugin/marketplace.json`. External marketplace submission or public plugin publication is intentionally not performed here.

For Cursor, Cline, Kilo, GitHub, and other MCP clients, select Streamable HTTP (sometimes labeled HTTP or remote MCP), enter the endpoint, and leave authentication and headers empty.

## Tools

Light intentionally exposes exactly three tools:

- `certscore_scan_site`: request a scan of a public URL or reuse an eligible recent completed scan. Retain the returned `scanId`. Prefer the default `freshness=latest`; use `refresh` only when the user explicitly asks for a fresh or repeated scan.
- `certscore_get_scan_status`: poll an active scan using only its stable `scanId`. Honor the returned retry delay and stop at a terminal state.
- `certscore_get_scan_bundle`: after a usable terminal completion, retrieve a bounded, public-safe bundle of canonical findings, evidence summaries and references, coverage, limitations, score metadata, and report links.

MCP Light applies a 25,000-byte response ceiling. Larger requested bundle budgets are explicitly clamped in response metadata; when the complete tier exceeds the ceiling, use the returned canonical report or evidence URL rather than repeatedly increasing `maxBytes`.

The bundle can include observations about pre-consent cookies and browser storage, trackers and resolved vendors, CMP and consent-control signals, privacy-policy and disclosure surfaces, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport. It returns only evidence and findings present in the canonical scan projection.

## Scan lifecycle

1. Call `certscore_scan_site` with the public URL.
2. Retain `scanId` whenever one is returned.
3. If the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` with that ID only.
4. Stop at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
5. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` and interpret the returned evidence and limitations.

If a retryable error is returned without a `scanId`, wait for `retryAfterSeconds` and retry `certscore_scan_site`; there is no scan to poll yet. A `completed_limited` result is usable but explicitly limited. Do not request a bundle after `failed`, `expired`, or `rate_limited` unless a later tool response directs otherwise.

## Quota and reuse

Light permits up to 50 genuinely new scans per UTC day across both the requester and the shared public Light surface. It also applies a 5-new-scan rolling 10-minute limit across both scopes, with additional abuse safeguards.

With the default `freshness=latest`, an eligible completed scan from the prior 24 hours may be reused. Reuse is reported in the scan response and does not consume the new-scan allowance. `freshness=refresh` bypasses recent-result reuse, but it does not bypass validation, quota, or throttling.

Provenance separates the current retrieval from the original creation decision. `retrievalMode=creation_response` means the result came directly from `certscore_scan_site`; `retrievalMode=scan_id_lookup` means a later status or bundle call fetched the scan by ID. `creationDecision` reports `new_scan` or `reused_scan` only when that fact was retained and otherwise stays `unknown`. Do not treat a scan-ID lookup as proof that the original scan was reused. `scanAgeSeconds` is numeric when a retained age or completion timestamp is available.

The webpage and anonymous REST API use a separate 20-new-scans-per-requester-IP-per-UTC-day allowance. That API allowance is not the Light MCP allowance.

## Known-good first prompt

> Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. Retain the scanId, poll status only while the scan is active, then retrieve the scan bundle with detail=findings and maxBytes=8000. Report whether the scan was new or reused, summarize the highest-value findings and evidence references, include coverage limitations and the report URL, and distinguish CertScore observations from legal conclusions.

The ErgoVeritas page is an owned test canary with intentional signals. Replace it with the public URL under review for normal use.

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
