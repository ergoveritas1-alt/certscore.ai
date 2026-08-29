# Private-target validation implementation — 2026-08-29

Status: deployed to AWS, verified in production, and released. The MCP rollout hold was lifted on 2026-08-29.

## Outcome

The `127.0.0.1` admission defect is closed by a versioned shared public-target policy rather than a literal deny list. Enforcement is layered:

1. Shared URL normalization rejects unsafe literals and local-only names.
2. WC01 admission resolves A, AAAA, and platform lookup answers and rejects private-only or mixed public/private results before reuse, idempotency, quota, or persistence work.
3. Lambda and scan-core revalidate before execution and guard browser requests, redirects, subresources, direct fetches, and proxy CONNECT targets.
4. Validation-worker accessibility and target-derived policy retrieval use the same runtime guard.
5. Regional Squid, host firewall, IMDS settings, and Lambda security-group scripts enforce the policy at the network layer.

The stable public error remains `invalid_url`; `reasonCode: "non_public_target"` is added through Pulse, API v2, OpenAPI, and MCP tool errors. Public errors and telemetry do not include the target or resolved addresses.

## Root cause

The old URL validator treated an IPv4 literal as ordinary dot-separated DNS labels. Each label in `127.0.0.1` passed the hostname regular expression. The DNS preflight checked only whether records existed and discarded returned addresses, so it could not reject loopback, private, link-local, metadata, reserved, or mixed answers.

## Implemented boundaries

- MCP Light and authenticated MCP through API v2/Pulse
- GPT Action and Pulse URL creation
- anonymous/authenticated/batch full scans and previews
- recent-result and client-request-id reuse
- domain creation, manual/scheduled rescans, alternate-region recovery, and monitor setup
- browser-scan target normalization
- Lambda dispatch construction, coordinator entry, and worker scan-core entry
- Chromium navigation, redirect, frame, and subresource paths
- scan-core Node fetch and TLS proxy paths
- validation-worker accessibility and policy-document browser/fetch fallbacks
- regional proxy replacement/provisioning for EU-DE, EU-IE, and California

## Deterministic coverage

Tests cover the required literal classes, alternate IPv4 spellings, IPv4-mapped IPv6, local aliases, public controls, private-only DNS, mixed answers, CNAME terminal answers, transient-family failure, simulated rebinding, and redirect destinations including the AWS metadata address. Infrastructure source tests verify Squid deny ordering, IPv4/IPv6 firewall rules, narrow Lambda egress, and IMDS hop limit 1.

## Verification completed

- Full 19-package workspace typecheck: passed.
- Shared classifier and URL tests: passed.
- DNS resolver tests: passed.
- Runtime/rebinding/redirect guard tests: passed.
- scan-core proxy tests: passed.
- Pulse/API v2/OpenAPI/MCP contract tests: passed.
- full-scan, preview, Lambda dispatch, and infrastructure script tests: passed.
- Shell syntax checks for all modified AWS scripts: passed.
- MCP benchmark harness unit tests: passed.

## Production release verification

The controlled AWS rollout completed on 2026-08-29. Web admission, hosted MCP, validation, three regional scanner Lambdas, and the three canonical regional proxies were verified before the unchanged benchmark ran.

- The exact fixture SHA-256 remained `393ae6fe1a55a180df2575539ab1105f395c0b77815a5d84fd45c4eafe94236e`.
- Loopback, RFC1918, link-local metadata, carrier-grade NAT, unspecified, alternate IPv4 spellings, mapped IPv6, local aliases, private-only DNS, and an owned mixed public/private DNS name all returned no scan ID.
- Public errors use stable code `invalid_url`, reason `non_public_target`, and `retryable: false`.
- A temporary owned S3 website redirect to AWS metadata was followed only as far as the regional proxy. Retained evidence recorded the public 301 and a Squid-generated 403 for the metadata destination; no metadata response was retrieved. The temporary bucket was deleted immediately afterward.
- Direct synthetic invocations of the deployed Lambda in EU-DE, EU-IE, and California each rejected the metadata target before browser work.
- CloudWatch recorded sanitized `scan_target_rejected` events with no raw URL, hostname, or IP leakage.
- Regional parity passed after deployment and again after superseded proxy cleanup.

The unchanged 25-case MCP Light benchmark passed:

- 21/21 legitimate cases completed with correctly bound bundles;
- all four invalid/problematic cases were rejected;
- one forced-refresh case exercised pending scan creation and sequential polling;
- zero HTTP failures, unexpected MCP failures, disconnects, timeouts, duplicate scans, parallel polls, or early polls;
- `certscore_scan_site` p95 was 2.145 seconds, versus the prior 4.896-second comparison point;
- all 25 benchmark client identifiers correlated to 25 unique server sessions;
- all 58 handler-level telemetry deliveries were accepted with zero delivery failures.

All release gates passed. The MCP rollout hold is lifted.

## Compatibility and cost

Globally routable direct IPv4 targets remain supported. Direct IPv6 literals remain unsupported, matching the prior shared URL contract, while public AAAA answers for ordinary domains are supported. Split-horizon or mixed-address targets now fail closed by design. Transient failure in either address family produces a retryable DNS-unavailable response.

Expected incremental recurring cost: **$0/month**. No paid firewall or DNS-firewall service was introduced.
