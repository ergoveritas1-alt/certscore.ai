# CertScore production private-target validation proposal — 2026-08-29

Status: historical pre-implementation proposal. The implementation is now present in the working tree; see `private-target-validation-implementation-2026-08-29.md`. Nothing in this change has been deployed to production.

## A. Root cause

`packages/shared/src/utils/url.ts` validates hostname syntax and rejects a few name suffixes, but it does not classify IP addresses. The condition `url.hostname.includes(".")` lets canonical IPv4 literals through, and every numeric label in `127.0.0.1` passes the DNS-label regular expression. WHATWG URL parsing also canonicalizes alternate IPv4 spellings before this check, so string deny lists would be insufficient.

The existing DNS preflight in `apps/web/server/domains/domain-dns-core.ts` is an existence check, not a public-destination check. It discards returned addresses and accepts when any A, AAAA, or platform lookup result exists. It therefore accepts private-only, mixed public/private, link-local, and loopback results.

Current focused reproduction:

| Input | Current result |
| --- | --- |
| `http://127.0.0.1` | accepted and normalized to `http://127.0.0.1/` |
| `https://127.0.0.1` | accepted |
| `http://localhost` | rejected |
| `http://localhost.localdomain` | accepted |
| `http://0.0.0.0` | accepted |
| `http://[::1]` | rejected incidentally by hostname syntax, not IP policy |
| `http://169.254.169.254` | accepted |
| hostname resolving only to `127.0.0.1` | accepted by DNS preflight |
| hostname resolving to public and private addresses | accepted by DNS preflight |

The scanner has no corresponding destination policy. The Lambda handler accepts the target URL from its dispatch payload without network classification. Chromium may follow HTTP, meta-refresh, and JavaScript top-level navigations. Node policy and transport probes follow redirects or select DNS answers without public-address checks.

## B. Affected scan-entry surfaces

### Direct public or authenticated creation surfaces

- MCP Light `certscore_scan_site` calls the CertScore SDK and `POST /api/v2/scans`.
- Authenticated/stdio MCP uses the same SDK/API v2 creation path.
- API v2 `POST /api/v2/scans` wraps Pulse v1.
- Pulse v1 URL mode and the GPT action route share `apps/web/app/api/v1/pulse/route.ts`.
- `POST /api/full-scan` handles anonymous, authenticated, and batch full-scan intake.
- `POST /api/preview-scan` and its `/api/preview-scans` alias create previews.
- Authenticated domain creation and immediate scan use `createOrQueueDomainScan`.

### Persisted/retry surfaces

- Manual rescan and dashboard full-scan actions call `queueFullScanForDomain`.
- Scheduled monitoring calls `queueFullScanForDomain`.
- Pulse alternate-region recovery calls `createAnonymousFullScan` using an already persisted target.
- Monitor-site setup can persist a target that later enters scheduled or manual scanning.
- Internal cohort/rerun scripts use the same insufficient DNS existence helper.

### Scanner and follow-up network surfaces

- `apps/v2-dag-lambda` dispatch parsing and every sharded lane.
- Chromium initial navigation, redirects, meta refresh, JavaScript navigation, frames, and subresources in `packages/certscore-scan-core`.
- Direct policy fetches and manual redirects in `policy-surface-scanner.ts`.
- HTTP redirect and TLS probes in `pre-consent-runtime-scanner.ts`.
- Target-derived rendered/fetch fallbacks and the accessibility follow-up job in the validation worker.

### Separate browser-extension surface

`POST /api/browser-scans/start` records evidence observed in the user's own browser; CertScore does not navigate the submitted URL server-side. It is not the demonstrated SSRF path. It should share literal/name eligibility rules for product consistency, but server-side DNS enforcement should be documented separately because the user's resolver and network may differ from CertScore's.

## C. Current validation architecture

```text
surface-specific schema
-> shared synchronous normalizeUrl (syntax and a few hostname suffixes)
-> some surfaces call WC01 checkDomainDns (record existence only)
-> scan/domain persistence
-> Lambda dispatch accepts targetUrl
-> scan-core/browser and Node transports connect without destination policy
```

Validation is duplicated in the admin scan lab and browser-extension repository. Several public paths share the main schema, but the asynchronous DNS check is repeated at call sites. Pulse checks recent-result reuse before DNS, so an unsafe target can bypass DNS when a reusable scan exists.

## D. Proposed canonical architecture

```text
shared public-target policy
-> WC01 admission resolver checks every A/AAAA/lookup address
-> reuse/admission/quota/persistence only after eligibility succeeds
-> typed resolution attestation in scan configuration
-> Lambda coordinator and every worker re-resolve before browser work
-> scan-core guards every target-derived HTTP(S) request and redirect
-> regional proxy + host firewall reject non-public actual destinations
-> narrowed Lambda security-group egress permits proxy/AWS endpoints only
```

### Canonical shared policy

Add `packages/shared/src/network/public-target-policy.ts` and export it from the shared package. It should:

- parse only HTTP/HTTPS URLs without credentials;
- operate on the URL parser's canonical hostname, catching abbreviated, integer, octal, and hexadecimal IPv4 representations;
- reject `localhost` and its subdomains, `.localhost`, `.local`, `.localdomain`, `.internal`, `.home.arpa`, and other explicitly registered/local-only names;
- classify IPv4 and IPv6 by CIDR, not strings;
- recursively classify IPv4-mapped IPv6 by its mapped IPv4 value;
- default-deny IANA special-purpose, non-destination, non-forwardable, multicast, unspecified, documentation, benchmarking, link-local, private, shared/CGNAT, loopback, and reserved ranges;
- permit ordinary globally reachable IPv4 and IPv6 addresses returned for public hostnames;
- preserve currently accepted globally routable direct IPv4 targets;
- keep direct IPv6 URL literals unsupported in the first patch because the current shared hostname contract rejects them. Adding them should be a separate compatibility change.

The range table should be versioned and linked in comments to the IANA IPv4 and IPv6 special-purpose registries. The policy should be application-owned and tested; it must not fetch a registry at request time.

### Canonical WC01 resolver

Replace `checkDomainDns` with `validatePublicScanTarget` in `apps/web/server/domains/public-target-validation.ts`. Inject resolvers for deterministic tests. Query A and AAAA records and `dns.lookup(..., { all: true })`, retain the union, and reject if any possible connection address is non-public. If one resolver class is transiently unavailable, fail closed with a retryable DNS-unavailable result rather than assuming the unobserved family is safe.

Resolve CNAMEs for bounded diagnostic provenance, but determine eligibility from every terminal A/AAAA/lookup address. A CNAME ending at a private address is rejected. Do not return or log the addresses to public clients.

Run this validation before recent-result reuse, quota reservation, scan/domain persistence, and client-request-id reuse. A prior request identifier must not return an unsafe scan before current target eligibility is established.

Persist only a bounded resolution attestation: policy version, checked-at time, address-family counts, outcome, and a keyed/hash digest of the normalized address set. Do not persist raw internal addresses.

## E. DNS, redirect, and rebinding threat analysis

An admission-only lookup is insufficient. The current queue separates WC01 validation from later Lambda execution, and both the Lambda runtime and regional proxy resolve independently. A hostname can therefore change from public at admission to private at execution.

The safest practical design for this architecture is:

1. Validate all addresses at WC01 admission.
2. Re-resolve and validate in the Lambda coordinator before fan-out.
3. Re-resolve in each worker lane immediately before network work; reject public-to-private changes and record only a safe reason category.
4. For direct Node transports, connect to the exact address selected from the validated resolution while retaining the original Host header and TLS SNI. Revalidate every manual redirect before following it.
5. Install a composable Playwright context route before navigation. It validates every HTTP(S) request, including document redirects, frames, and subresources. Top-level/document requests are never served from the per-scan DNS cache. Positive subresource decisions may be cached only up to the smallest observed DNS TTL capped at 30 seconds.
6. Treat the regional proxy and its host firewall as the definitive check on the actual destination selected at connection time. This closes the remaining gap between application lookup and proxy lookup.

HTTP redirects, meta refresh, and JavaScript navigation all result in another browser request and must pass the same route/proxy policy. Manual Node redirect loops must call the policy before opening the next connection.

All HTTP(S) subrequests resolving to non-public destinations should be blocked. A blocked third-party subresource should become a bounded coverage/runtime diagnostic, never evidence of a privacy gap. A blocked top-level navigation should terminate the scan as a security rejection without report evidence.

## F. Exact proposed code changes

### Shared and WC01

1. Add `packages/shared/src/network/public-target-policy.ts` with `classifyIpAddress`, `parsePublicTargetUrl`, `isLocalOnlyHostname`, `assertPublicAddress`, and policy-version exports.
2. Change `packages/shared/src/utils/url.ts` to call the canonical synchronous policy after WHATWG parsing. This closes unsafe literals and aliases before asynchronous work.
3. Add `apps/web/server/domains/public-target-validation.ts` with resolver injection, A/AAAA/lookup unioning, fail-closed transient handling, and bounded CNAME diagnostics.
4. Replace DNS existence calls in Pulse, full scan, preview scan, domain creation, monitor-site connection/setup, persisted rescans, scheduled scans, alternate-region recovery, and internal queue scripts.
5. Move Pulse validation before reusable-result lookup and before quota/request ledger writes.
6. Add a final `requirePublicScanTarget` invariant inside both `createAnonymousFullScan` and `queueFullScanForDomain`; surface checks remain useful for good errors, while these helpers prevent a future route from bypassing policy.
7. Validate `normalizedUrl` again when building the Lambda dispatch payload, and require its canonical hostname to equal the payload hostname.

### Lambda and scan-core

8. Add `packages/certscore-scan-core/src/public-network-guard.ts`, using the shared classifier and injected Node resolvers.
9. Revalidate the dispatch target in `apps/v2-dag-lambda/src/handler.ts` before coordinator fan-out and in every worker invocation before `runScan`.
10. Install the request guard on every production browser context. Use `route.fallback()` after validation so existing fixture/heavy-resource handlers remain composable; abort rejected requests with a bounded internal reason.
11. Wrap `proxyFetch`, policy fetches, TLS probes, rendered fallbacks, and every manual redirect with the guard. Direct Node HTTP(S) requests receive a pinned validated `lookup` result.
12. Protect validation-worker target-derived browser/fetch paths, especially accessibility `final_url`, Nano document discovery, and rendered policy fallback. Fixed OpenAI/AWS/Tranco service calls remain separately allowlisted service egress.
13. Provide an explicit test-only fixture policy that allowlists an exact local fixture origin. It must be injectable, unavailable from Lambda dispatch input, and impossible to enable in production. Existing local fixture tests must not create a production bypass.

### Error contract

Keep the stable external code `invalid_url` for backward compatibility and add typed `reasonCode: "non_public_target"`.

- HTTP: `400`, no `Retry-After`, no scan ID, and no quota/request-ledger consumption.
- Message: `This target is not eligible for public website scanning. Enter a publicly reachable HTTP or HTTPS website.`
- Recommended action: `Correct the public target before retrying.`
- MCP: normal MCP tool error result (`isError: true`) with the same structured error; do not convert it into a JSON-RPC transport failure.
- Telemetry: `scan_target_rejected`, stage `admission` or `runtime`, reason `non_public_target`, policy version, address-family counts, and whether multiple answers were present. Do not log the URL, target hostname, resolved addresses, or bearer/session data.
- Runtime rebinding/redirect rejection after a scan exists: terminal `failed` with internal code `unsafe_target_blocked`; public text remains generic and no scan evidence is published.

Update the Pulse/API v2 schemas, OpenAPI enums/examples, SDK error parsing, MCP tests, and discovery documents for the new `reasonCode` while keeping `invalid_url` as the primary code.

### Proxy and AWS network controls

14. Update `canonical-regional-proxy-user-data.sh` so Squid denies destination ACLs for all canonical non-public IPv4/IPv6 ranges, `to_localhost`, link-local, VPC ranges, and metadata before the `allow vpcsrc` rule. Add normal safe-port/CONNECT-port restrictions.
15. Add persistent host-firewall OUTPUT rejects for the Squid user covering the same ranges, including `169.254.169.254` and `fd00:ec2::254`. This enforces the actual selected destination even if DNS changes after an ACL lookup.
16. After cloud-init/user-data completes, disable proxy EC2 IMDS if operationally possible. At minimum reduce hop limit to 1 and retain the Squid-user metadata firewall deny. The current three proxy instances have IMDS enabled, tokens required, hop limit 2.
17. Replace each Lambda security group's all-egress rule with only proxy SG TCP/3128, required VPC endpoint SG TCP/443, and the regional S3 prefix list TCP/443. Current Lambda subnets have no direct internet route, so this cheaply removes access to unrelated VPC services without changing public browser egress.
18. Add Terraform and live-readiness assertions that fail deployment if production lacks a configured proxy, proxy destination policy, worker target guard, or narrow Lambda egress.

## G. Exact proposed tests

### Shared classifier

- Every required IPv4 class: `0/8`, RFC1918, `100.64/10`, `127/8`, `169.254/16`, IANA protocol blocks, documentation, benchmarking, multicast, reserved, and broadcast.
- Every required IPv6 class: unspecified, loopback, mapped IPv4, unique-local, link-local, documentation, discard, multicast, and reserved/non-global space.
- Alternate IPv4 representations canonicalized by URL parsing.
- `localhost`, subdomains, `.local`, `.localdomain`, `.internal`, and `home.arpa`.
- Valid ordinary domains, globally routable IPv4, and public AAAA controls.

### DNS resolver

- private-only A;
- private-only AAAA;
- mixed public/private A;
- mixed A/AAAA;
- CNAME ending in private A/AAAA;
- duplicate answers and deterministic unioning;
- transient failure in one address family fails closed;
- simulated public-at-admission/private-at-worker rebinding;
- address-set digest changes without raw-address telemetry.

### Routes and persistence

- Pulse, API v2, MCP Light, full scan, preview, authenticated domain creation, manual rescan, scheduled scan, and alternate recovery all reject before scan/quota persistence.
- Recent-result reuse cannot bypass target validation.
- Client-request-id reuse cannot bypass target validation.
- Error envelopes have HTTP 400, `invalid_url`, `non_public_target`, no scan ID, and non-retryable guidance.

### Scanner

- public HTTP redirect to loopback, RFC1918, link-local metadata, and IPv6 unique-local;
- public page meta-refresh and JavaScript top-level navigation to a local destination;
- private iframe, fetch/XHR, image, script, and WebSocket destinations are blocked;
- Node policy redirect and transport redirect reject before connection;
- the direct Node transport pins the validated address;
- deterministic rebinding between guard lookups is caught by proxy/connection policy;
- valid public redirects and public subresources remain available;
- exact fixture-origin test override works only in tests.

### Infrastructure

- Squid deny rules precede allow rules and cover both metadata endpoints;
- host firewall covers the canonical range registry;
- Lambda SG has no `0.0.0.0/0` all-protocol egress;
- production Lambda requires the network guard and configured proxy;
- regional parity test covers all three regions.

## H. Infrastructure recommendation and cost

The live read-only inventory found all three scanner Lambdas VPC-attached with regional EC2 proxies. Lambda route tables expose the VPC-local route and private AWS endpoints, not a direct default internet route. This is a strong base, but Lambda and proxy security groups currently allow all outbound traffic, and proxy IMDS remains enabled.

Implement the code guard, Squid/host firewall, IMDS restriction, and narrower security groups together. These changes should be recurring-cost neutral.

AWS Network Firewall and Route 53 Resolver DNS Firewall are optional additional controls, but they introduce recurring charges likely above $1/month and therefore require separate product-owner approval. They are not required for the proposed proxy-enforced architecture. The lower-cost alternative is the existing dedicated proxy plus OS firewall and application/worker guards.

## I. Regression benchmark status

No post-fix benchmark has been run because this document is the required pre-production proposal and no behavior has been changed. The existing production baseline remains:

- 25 sequential cases;
- initial `certscore_scan_site` p95 4.896 seconds;
- 21/21 intended valid cases completed with verified bundles;
- no HTTP failures, disconnects, duplicates, parallel polls, or delay violations;
- `127.0.0.1` incorrectly admitted.

After review, implement behind a staging/test gate, run deterministic redirect/rebinding fixtures, then run the existing 25-case harness against that environment. Required acceptance:

- every unsafe literal/DNS/redirect case rejected;
- no scan ID or quota consumption for admission rejection;
- all 21 prior valid cases still succeed;
- at least one pending creation and one completed reuse;
- zero duplicate scans, parallel polls, bundle mismatches, or unexpected failures;
- initial-call p95 remains below 20 seconds and does not regress materially from 4.896 seconds;
- server telemetry records bounded rejection classes without target/address disclosure.

Only after those gates should the same benchmark be rerun against production during a controlled rollout.

## J. Backward-compatibility risks

- Split-horizon or misconfigured domains returning any private answer will now be rejected, even if another answer is public. This is intentional fail-closed behavior.
- DNS validation before recent-result reuse adds one bounded lookup to reuse latency. A short resolver cache can limit impact, but cache hits must not be the runtime rebinding defense.
- Transient failure in one address family may produce a retryable 503 where the current code accepts the other family.
- Public pages that attempt local-network subrequests will have those requests blocked. The scan may retain a neutral coverage diagnostic, not a finding.
- Direct globally routable IPv4 targets remain supported. Direct IPv6 literals remain unsupported until a separate URL-contract change.
- Local scanner fixtures require an explicit exact-origin test policy; implicit localhost access will stop working.
- Tightening Lambda security groups must be regionally canaried to ensure S3, SQS, Lambda shard invocation, logs, DNS, and proxy traffic remain available.

Keeping the primary external error code as `invalid_url` avoids breaking SDK/MCP clients that switch on the current enum.

## K. Rollout recommendation

Do not lift the broader GPT/ChatGPT/Codex rollout hold yet.

Approve the layered proposal, implement it without a production bypass, and require the deterministic test suite plus staging benchmark. Then deploy in this order: shared/WC01 admission and contracts, scanner runtime and proxy guards, network narrowing, one regional canary, all-region parity, web/MCP, and the production 25-case benchmark.

The hold can be lifted when the production benchmark rejects the local/private case before scan creation, all previously valid cases remain reliable, and runtime redirect/rebinding fixtures prove the scanner cannot connect to non-public destinations even when admission initially resolved a public address.
