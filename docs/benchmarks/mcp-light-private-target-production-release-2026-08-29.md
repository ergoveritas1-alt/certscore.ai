# MCP Light private-target production release — 2026-08-29

## Decision

**PASS — rollout hold lifted.**

The private-target hardening and async MCP workflow passed the controlled production gate. This closes the safe-and-fast MCP engineering phase; further MCP infrastructure changes should be driven by telemetry rather than continued speculative tuning.

## Deployed state

- Web admission and typed literal-rejection follow-up: `bc6b9da56c22195fb8efeb4f1f9a1c8ad53780d0`
- Scanner, validation, and hosted MCP security implementation: `d9a3331e36df56062c5220ba8d70136b627e8392`
- Scanner image digest in EU-DE, EU-IE, and California: `sha256:e5c72062f9d856e2bc3ced891ecc12ba530214d26fc203fced1073f492c99b1a`
- Web workflow: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/33230090391
- Validation workflow: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/33229178849
- Hosted MCP workflow: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/33229610898

## Security gate

| Check | Result |
| --- | --- |
| Loopback and other non-public literal classes rejected before creation | PASS |
| Private-only and owned mixed public/private DNS rejected before creation | PASS |
| Stable `invalid_url` + `non_public_target`, non-retryable, no scan ID | PASS |
| Redirect to metadata blocked by the production regional proxy | PASS |
| Direct production Lambda metadata target rejected in all three regions | PASS |
| Lambda egress limited to proxy, DNS, private AWS endpoints, and S3 endpoint | PASS |
| Proxy ingress limited to the Lambda security group | PASS |
| IMDSv2 tokens required; hop limit 1; IPv6 metadata disabled | PASS |
| Runtime DNS-rebinding and redirect guards | PASS |

The owned redirect canary retained a public 301 followed by a Squid-generated 403 for the metadata destination. It did not retain a metadata response. The temporary S3 website bucket and temporary mixed-DNS record were deleted after verification.

## Exact benchmark

- Run: `2026-08-29T03-08-09-568Z`
- Window: 2026-08-29T03:08:09.569Z–2026-08-29T03:10:44.606Z
- Fixture: `scripts/fixtures/mcp-light-gpt-benchmark-targets.json`
- Fixture SHA-256: `393ae6fe1a55a180df2575539ab1105f395c0b77815a5d84fd45c4eafe94236e`
- Cases: 25, concurrency 1

| MCP gate | Result |
| --- | ---: |
| Legitimate cases with verified bundle | 21/21 |
| Invalid/problematic inputs rejected | 4/4 |
| Pending scans exercised | 1 |
| Completed reuses | 20 |
| Status polls | 13, sequential |
| Duplicate scans | 0 |
| Parallel polls | 0 |
| Poll-delay violations | 0 |
| HTTP failures | 0 |
| Unexpected MCP failures | 0 |
| Disconnects/timeouts | 0/0 |
| Bundle scan/target mismatches | 0 |

`certscore_scan_site` latency was 99 ms minimum, 1.003 seconds p50, 2.145 seconds p95, and 2.327 seconds maximum. The p95 improved by 56.2% from the 4.896-second comparison point.

## Observability gate

- 25 unique benchmark client identifiers correlated to 25 unique server session IDs.
- 184 benchmark HTTP lifecycle events were present: 159 HTTP 200 and 25 initialization HTTP 202 responses.
- 59 tool calls correlated to the client run: 25 scan, 13 status, and 21 bundle calls.
- 58 handler-level telemetry deliveries were accepted: 24 scan, 13 status, and 21 bundle deliveries. The missing-URL case was rejected by schema before the scan handler.
- Telemetry delivery failures: 0.
- Session identity mismatches: 0.
- Rejection-log raw URL, hostname, and IPv4 leakage: 0.

## Cleanup and cost

The temporary DNS and S3 canaries were removed. Three superseded blue/green proxy instances were terminated after regional parity reconfirmed the new instances. A pre-existing California legacy proxy was preserved because a legacy fallback variable still references it.

Expected incremental recurring cost: **$0/month**. Temporary DNS, Lambda, S3, and proxy-overlap verification cost is estimated below **$0.12 total**.
