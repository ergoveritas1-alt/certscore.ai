# Local overhead and evidence comparison

Measured 2026-09-07/08 on the local macOS machine. Production unchanged.
Two fixture sizes, each with one warmup per mode followed by six baseline and
six instrumented runs, alternating order. All traffic remained local to Docker
and the fixture. Baseline: Chromium -> Squid. Instrumented: Chromium -> local
bridge with tunnel IDs -> Squid, plus Chrome NetLog and post-close parsing.
Both modes used identical CDP collection and the same local self-signed TLS
fixture exemption. No paid API, AWS invocation or production scan was used.

| Median metric | 26 responses: baseline / instrumented | 242 responses: baseline / instrumented |
|---|---|---|
| Capture | 59.4 / 73.3 ms | 177.1 / 211.8 ms |
| Browser lifecycle + bridge | 316.7 / 311.7 ms | 458.0 / 536.4 ms |
| CPU reported by macOS time | 0.52 / 0.56 s | 0.785 / 1.025 s |
| Peak RSS reported by macOS time | 106.7 / 110.6 MiB | 117.0 / 135.6 MiB |
| Additional NetLog parsing | 2.6 ms | 17.0 ms |
| Ephemeral raw NetLog | 0.81 MB | 4.80 MB |
| Selected socket metadata | approximately 1 KB | approximately 1 KB |

Small negative lifecycle delta is noise, not an acceleration claim. Lifecycle
excludes post-close parsing; account for that separately. CPU/RSS are as reported
by macOS time, not aggregate concurrent Lambda memory or proxy CPU. Container
resource usage and secure record retrieval are not measured here. Six runs per
arm establish a local signal, not a production p95 or upper bound.

## Evidence check

Every measured run had an identical canonicalized fixture evidence hash within
its size: HTTP response URL/status/type inventory, cookie attributes, local
storage, form and iframe counts, and 24/240 fetch results. All instrumented
responses bound to exactly one observed socket/bridge tuple. The earlier public
HTTPS proof additionally verified unique Squid upstream-IP records.

This does NOT verify the entire production scanner pipeline, consent timing,
real-site races, cross-origin redirects, HTTP/2 coalescing, cancellation,
service-worker/cache behavior, or final packet/scoring parity. Additional load
could alter timing-sensitive evidence. Those remain integration acceptance gates.
Private local-fixture destination IPs must never become production destinations.

## Cost sensitivity, not a production bill forecast

Repository scanner configuration defaults to 3008 MB (2.9375 GiB). At the
illustrative ARM first-tier rate $0.0000133334/GB-second, an extra 0.1 seconds
would cost approximately $0.392 per 100,000 instrumented sessions; 0.25 seconds
would cost approximately $0.979. Four such sessions per scan gives approximately
$1.57-$3.92 per 100,000 scans. Full-site page sessions multiply this further.
Use actual regional rates, billed-duration deltas and volume before approval.
These 100-250 ms scenarios are planning assumptions, not a measured AWS bound.

No additional invocation or capacity purchase is inherent in the design.
Metadata delivery/storage and proxy headroom still need sizing. Do not retain raw
NetLog or send it to CloudWatch/S3; that would add avoidable cost and data exposure.
Existing fixed memory allocation does not increase billing just because a few
more bytes are used, unless duration/capacity changes. Monthly increases of $1
or more still require owner approval before production implementation/deployment.

AWS pricing reference: https://aws.amazon.com/lambda/pricing/

## Decision

Do not promote this prototype as-is. First replace whole-file logging/parsing
with bounded socket-only extraction, retain only minimal proven connection
metadata, and deliver proxy records within the existing deadline with fail-closed
missing evidence. No new wait/retry or report reopening. Then verify production
scanner evidence and timing parity in an isolated integration fixture.

Reproduce using benchmark.cjs with a local TLS fixture on port 44553 and Squid on
43128 as configured in /tmp/certscore-proxy-bench. FIXTURE_REQUEST_COUNT=240 runs
the larger case. Detailed reproducible harness is checked in; private raw NetLog
is deleted after parsing. Machine-readable medians: benchmark-summary.json.
