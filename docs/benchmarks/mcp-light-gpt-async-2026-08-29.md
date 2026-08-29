# CertScore MCP Light GPT async benchmark — 2026-08-29

## A. Executive summary

The async-first MCP architecture passed. Across 25 sequential production cases, `certscore_scan_site` returned with a p95 of 4.896 seconds and a maximum of 4.897 seconds. Eight newly accepted scans returned stable scan IDs while still pending; their initial-call p95 was 4.897 seconds. The prior roughly 40–44 second initial MCP hold did not recur.

All 21 ordinary valid cases completed with a bundle that matched the original scan ID and target. Three intentionally invalid inputs were rejected. One problematic input, `http://127.0.0.1`, was accepted, scanned, and eventually returned `completed_limited` with a target-site 503 no-go. That is an input-validation concern independent of the async workflow.

## B. Pass/fail assessment

| Assessment | Result |
| --- | --- |
| Async architecture | **PASS** |
| Long initial MCP hold eliminated | **PASS** |
| Stable scan ID for new pending scans | **PASS** |
| Sequential retry-guided polling | **PASS** |
| Completed-result reuse | **PASS** |
| Legacy wait fields remain async | **PASS** |
| Bundle identity/target binding | **PASS** |
| Endpoint ready for unrestricted broader traffic | **HOLD pending private-target validation** |

## C. Benchmark cases

| Case | Category | Initial result | Initial ms | Polls | Completion ms | Bundle ms | Final |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| owned-canary-1 | owned canary, forced refresh | new pending | 679 | 14 | 18,741 | 1,711 | success |
| owned-canary-reuse | expected reuse | completed reuse | 862 | 0 | 862 | 2,085 | success |
| owned-canary-legacy | legacy wait inputs | completed reuse | 1,620 | 0 | 1,620 | 1,494 | success |
| certscore-1 | owned public site | completed reuse | 912 | 0 | 912 | 1,320 | success |
| certscore-reuse-1 | expected reuse | completed reuse | 969 | 0 | 969 | 1,196 | success |
| certscore-reuse-2 | expected reuse | completed reuse | 1,030 | 0 | 1,030 | 1,229 | success |
| w3c-1 | likely fast public site | new pending | 3,087 | 17 | 28,465 | 1,606 | success |
| w3c-reuse-1 | expected reuse | completed reuse | 759 | 0 | 759 | 1,134 | success |
| w3c-legacy | legacy wait inputs | completed reuse | 623 | 0 | 623 | 784 | success |
| iana-1 | likely fast public site | new pending | 1,991 | 15 | 21,393 | 1,447 | success |
| iana-reuse | expected reuse | completed reuse | 781 | 0 | 781 | 1,183 | success |
| github-1 | normal public site | new pending | 4,897 | 18 | 35,352 | 2,333 | success |
| github-reuse | expected reuse | completed reuse | 1,472 | 0 | 1,472 | 2,685 | success |
| cloudflare-1 | normal public site | new pending | 352 | 23 | 37,276 | 3,432 | success |
| cloudflare-reuse | expected reuse | completed reuse | 1,986 | 0 | 1,986 | 2,450 | success |
| nytimes-1 | likely slower public site | new pending | 1,541 | 24 | 39,299 | 4,454 | success |
| nytimes-reuse | expected reuse | completed reuse | 1,947 | 0 | 1,947 | 3,625 | success |
| openai-1 | normal public site | new pending | 4,896 | 19 | 33,412 | 3,375 | success |
| openai-reuse | expected reuse | completed reuse | 1,726 | 0 | 1,726 | 3,043 | success |
| example-demo-1 | controlled demo substitution | completed reuse | 1,286 | 0 | 1,286 | 1,756 | success |
| example-demo-reuse | expected reuse | completed reuse | 959 | 0 | 959 | 1,607 | success |
| invalid-malformed | invalid input | rejected | 127 | 0 | — | — | expected error |
| invalid-localhost | problematic loopback input | new pending | 328 | 17 | 24,448 | 366 | completed-limited no-go |
| invalid-file-scheme | invalid input | rejected | 1,009 | 0 | — | — | expected error |
| invalid-missing-url | invalid input | rejected | 103 | 0 | — | — | expected error |

## D. Latency percentiles

All values are milliseconds and use deterministic nearest-rank percentiles.

| Metric | N | Min | P50 | P90 | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial `certscore_scan_site` | 25 | 103 | 1,009 | 3,087 | 4,896 | 4,897 | 4,897 |
| Initial call, new pending scans only | 8 | 328 | 1,541 | 4,897 | 4,897 | 4,897 | 4,897 |
| Initial call, completed reuse only | 14 | 623 | 969 | 1,947 | 1,986 | 1,986 | 1,986 |
| Status calls | 147 | 124 | 152 | 257 | 329 | 1,183 | 1,303 |
| Bundle calls | 22 | 366 | 1,607 | 3,432 | 3,625 | 4,454 | 4,454 |
| Accepted-case terminal time | 22 | 623 | 1,620 | 35,352 | 37,276 | 39,299 | 39,299 |
| New pending scan terminal time | 8 | 18,741 | 28,465 | 39,299 | 39,299 | 39,299 | 39,299 |
| End to end, all cases | 25 | 582 | 3,533 | 38,141 | 41,319 | 44,353 | 44,353 |

The new architecture reduced the important initial-call p95 from roughly 40 seconds to 4.896 seconds, approximately an 88% reduction. Full scan completion still takes up to about 39 seconds, but it now occurs after the initial MCP tool call returns.

## E. Reliability and errors

| Metric | Result |
| --- | ---: |
| Cases | 25 |
| MCP initialization | 25/25 (100%) |
| Tool discovery | 25/25 (100%) |
| Intended valid cases with verified bundles | 21/21 (100%) |
| Accepted scans reaching terminal state | 22/22 (100%) |
| Bundle retrieval after usable completion | 22/22 (100%) |
| HTTP failures | 0 |
| Unexpected MCP failures | 0 |
| Expected validation MCP errors | 3 |
| Admission/quota rejections | 0 |
| Timeouts | 0 |
| Unexpected disconnects | 0 |
| Accidental duplicate scans | 0 |
| Parallel polls | 0 |
| Poll-delay violations | 0 |

## F. Reuse behavior

Fourteen cases returned an eligible completed result immediately. Every intentional repeat reused the same scan ID produced or retrieved by the preceding request. Reuse required zero status polls and did not create a second scan. Reuse initial latency had a p50 of 969 ms and p95 of 1,986 ms.

The two legacy compatibility cases sent `waitForCompletion=true` and `maxWaitSeconds=45`. They returned completed reuse results in 623 ms and 1,620 ms; the legacy fields did not restore synchronous waiting.

## G. Polling behavior

The eight pending cases made 147 sequential status calls, an average of 18.4 polls per pending scan. Returned and scheduled delays were primarily one or two seconds. Every wait met or exceeded the instructed delay; timer drift was 0–4 ms. The minimum start-to-start spacing between status calls was 1,125 ms. There were no overlapping calls.

Polling was reliable but chatty. The async design shifts one long call into roughly 14–24 short status calls for a typical new scan. A modest unchanged-progress backoff would materially reduce MCP call volume without increasing initial response latency.

## H. Telemetry correlation

Client-side output retained a unique MCP client name, session ID, exact time window, HTTP observations, and any returned trace header for every case.

Server-side CloudWatch correlation for the benchmark window found:

- all 25 unique benchmark client names;
- 25 distinct server session correlation IDs;
- 319 expected MCP HTTP lifecycle events;
- 294 HTTP 200 responses and 25 HTTP 202 initialization notifications;
- 193 accepted tool telemetry deliveries: 24 scan-site, 147 status, and 22 bundle events;
- zero `mcp.telemetry_write_failed` events.

The missing twenty-fifth scan-site tool telemetry event was the missing-URL case. MCP schema validation rejected it before the registered tool handler and tool observer ran. HTTP request observability still captured that request.

## I. Issues and edge cases

1. **Private/loopback literal accepted.** `http://127.0.0.1` received a scan ID and ran to `completed_limited`. The no-go reported an HTTP 503 from the target. The shared validator rejects `localhost` hostnames but accepts dotted numeric loopback addresses because they satisfy its hostname syntax check.
2. **Status polling volume is high.** Eight new scans required 147 status calls. This did not cause errors or throttling in the benchmark, but broader agent traffic could amplify read volume.
3. **Schema-invalid calls lack tool-level telemetry.** Transport telemetry is complete, but the missing-URL request does not produce a tool-delivery event because validation precedes the observer.
4. **No client-visible server correlation ID.** Correlation succeeded using privileged CloudWatch access and unique client names. Ordinary MCP clients cannot independently confirm telemetry delivery.

## J. Recommended changes

### P0 — reject non-public targets before scan admission

In WC01 URL validation, reject IP literals and resolved addresses in loopback, RFC1918/private, link-local, carrier-grade NAT, unspecified, multicast, reserved, and IPv6 unique-local/link-local ranges. Return a typed non-retryable `private_target` or `invalid_url` error without creating a scan ID or quota event.

Defense in depth belongs in WS01: re-resolve and re-check the initial target and every redirect immediately before navigation, and deny private/non-public destinations at the browser/network boundary. Add focused IPv4, IPv6, mapped-IPv6, redirect, and DNS-rebinding fixtures.

### P1 — reduce unchanged-progress polling volume

Keep `retryAfterSeconds` authoritative, but add this exact result guidance:

> Wait at least retryAfterSeconds before each status call. Poll once at a time. If two consecutive responses have the same phase and progressPercent, wait at least 5 seconds for subsequent polls until progress changes. Never resubmit certscore_scan_site for the active scan.

Validate any server-side retry-delay changes through the canonical API read-rate policy and status-polling profile rather than introducing MCP-local numeric limits.

### P2 — expose a privacy-safe correlation token

Return a bounded opaque `requestCorrelationId` in MCP result metadata and the HTTP response header. It should correlate to server request/telemetry logs without revealing IP, URL, user, raw session ID, or bearer data.

### P3 — record pre-handler validation outcomes in tool telemetry

At the hosted MCP boundary, emit a bounded attempted-tool event for schema-invalid `tools/call` requests with tool name, `invalid_arguments` outcome, and correlation ID. Do not retain invalid field contents.

## K. Broader GPT/ChatGPT/Codex readiness

The async MCP workflow itself is ready: it is fast, deterministic, unambiguous to an LLM, backward compatible, and reliable under the tested sequential load. The previous long initial tool hold is eliminated.

Broader traffic expansion should remain on hold until the private/loopback target admission gap is fixed or explicitly risk-accepted. After that P0 change, rerun this same 25-case benchmark and require zero problematic-target admissions, zero unexpected failures, at least one pending scan, at least one completed reuse, and pending initial-call p95 below 20 seconds.

## Repeat command

```bash
pnpm mcp:light:benchmark -- \
  --targets scripts/fixtures/mcp-light-gpt-benchmark-targets.json \
  --count 25 \
  --concurrency 1 \
  --timeout-seconds 600 \
  --output-json artifacts/mcp-light-gpt-benchmark/latest.json \
  --output-markdown artifacts/mcp-light-gpt-benchmark/latest.md
```
