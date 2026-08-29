# Private-target validation implementation — 2026-08-29

Status: implemented and verified in the working tree. Not deployed to production.

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

## Production benchmark and rollout hold

The 25-case live benchmark has not been rerun because the implementation has not been deployed, in accordance with the instruction not to modify production before review. The rollout hold should remain in place until a controlled AWS scanner/web/MCP deployment applies both code and proxy/network changes, followed by the exact 25-case benchmark and regional private-target canaries.

Acceptance after deployment remains:

- unsafe targets fail with no scan ID and no scan quota consumption;
- all 21 intended valid cases complete;
- initial `certscore_scan_site` p95 does not materially regress from 4.896 seconds and remains below 20 seconds;
- no HTTP failures, disconnects, duplicate scans, parallel polling, delay violations, or bundle-binding failures;
- regional checks confirm the proxy deny policy and narrow Lambda egress in all three regions.

## Compatibility and cost

Globally routable direct IPv4 targets remain supported. Direct IPv6 literals remain unsupported, matching the prior shared URL contract, while public AAAA answers for ordinary domains are supported. Split-horizon or mixed-address targets now fail closed by design. Transient failure in either address family produces a retryable DNS-unavailable response.

Expected incremental recurring cost: **$0/month**. No paid firewall or DNS-firewall service was introduced.
