# Destination IP capture: local proof, not production integration

Verified locally with Chromium and Amazon Linux Squid 6.13 on 2026-09-07.
Two concurrent HTTPS document responses returned 200 with normal TLS verification.
Each response was bound through:

`CDP response.connectionId -> NetLog TCP_CONNECT source.id/local socket -> loopback bridge socket -> opaque CONNECT header ID -> Squid upstream IP`

The browser only exposed 127.0.0.1; the verified upstream was 3.168.132.118.
The diagnostic parser rejects absent/duplicate tunnel records, socket ambiguity,
authority mismatch, failed CONNECTs and private addresses. Unit tests also cover
concurrent same-host tunnels with different IPs. This is a prototype, not a new
production evidence contract. A successful CONNECT alone does not establish
an HTTP response or downstream data storage location.

## Reproduce locally

Run from the repository root, with Docker and installed Playwright Chromium.
The container port is loopback-only. Its permissive test ACL must never be used
in production. The browser bridge permits only ergoveritas.com:443.

```sh
mkdir -p /tmp/certscore-proxy-proof
cp scripts/diagnostics/proxy-tunnel-proof/{Dockerfile,squid.conf} /tmp/certscore-proxy-proof/
docker build -t certscore-proxy-proof /tmp/certscore-proxy-proof
docker run -d --name certscore-proxy-proof-debug -p 127.0.0.1:43128:3128 -v /tmp/certscore-proxy-proof:/proof:ro certscore-proxy-proof
node scripts/diagnostics/proxy-tunnel-proof/browser.cjs
docker exec certscore-proxy-proof-debug cat /tmp/tunnels.log > /tmp/certscore-proxy-proof/tunnels.log
node --import tsx scripts/diagnostics/proxy-tunnel-proof/verify.cjs
node --import tsx --test scripts/diagnostics/proxy-tunnel-evidence.test.ts
docker rm -f certscore-proxy-proof-debug
```

Squid emits its record when the tunnel closes. Log flushing can delay visibility;
this proof does not authorize a production tail wait to retrieve it.
Raw NetLog stays local in /tmp; do not upload it to production retained evidence.

## Remaining production engineering gates

- A bounded, authenticated channel for returning scan-owned tunnel records from
  the existing regional proxy. Do not expose logs or trust target-supplied headers.
- Streaming/bounded extraction of socket metadata; discard raw NetLog (URLs and
  other unnecessary browser metadata). Measure CPU, memory and bytes before
  adopting capture across lanes. The diagnostic now extracts incrementally with explicit byte, line and socket limits; production integration remains disabled.
- Capture/version the CDP/NetLog binding for the deployed Chromium version; test
  redirects, HTTP/2 reuse/coalescing, reconnects, cancellation and port reuse.
  Missing or ambiguous proof must remain unavailable. Exclude cached and
  service-worker responses without their own observed network connection.
- Respect the existing lane/report deadline: no extra browser run, retry or tail
  wait. Late logs cannot reopen a terminal result.
- Add an explicit proxy-connection provenance source in the retained contract,
  then use existing local MMDB enrichment. Never call it response_server_addr.
- Preserve production Squid access controls, destination network guards and TLS.
- Estimate steady-state cost before implementation; $1/month or more requires
  owner approval. No production configuration, infrastructure or deployment was
  changed by this diagnostic. Local tests introduce no recurring AWS cost.

Squid reply_header_add explicitly excludes successful CONNECT responses, so a
custom response header alone is not a solution:
https://www.squid-cache.org/Doc/config/reply_header_add/

## Bounded extraction implemented locally

`../bounded-netlog-sockets.cjs` uses 16 KiB stream chunks, a 16 MiB read budget,
a 128 KiB line budget and at most 512 socket tuples. Unsupported/truncated input,
abort, malformed candidate sockets, duplicate IDs and budget exhaustion return
no tuples. Chromium receives `--net-log-max-size-mb=16`; its bounded log may omit
older events, so extraction never asserts exhaustive connection coverage.
Only connection ID and loopback client/bridge ports are returned. No URLs,
headers or bodies enter the result. The benchmark owns a temporary capture
directory and removes it in finally, including ordinary failure paths.
Abrupt process termination still requires the host's ephemeral-directory cleanup.

A repeated 242-response benchmark (six measured runs per mode after warmup) kept
all fixture evidence identical and bound all 242 responses. Median extra reported
peak RSS was 6.0 MiB, versus 18.7 MiB with the previous whole-file parser.
Capture medians: 174.8/210.0 ms; lifecycle medians: 442.8/485.0 ms; extraction:
14.4 ms. These are local measurements, not AWS guarantees. Browser logging and
proxy-record delivery costs are not eliminated. The raw temporary byte volume
is capped, not reduced to socket-only production at source.

No production runtime imports this diagnostic, no collector was deployed, and no
new retained evidence source is enabled. Remaining integration gates above apply.

## September 8 local channel acceptance

`check-local.cjs` now runs three independent Chromium sessions with two concurrent
HTTPS document responses each, collects proxy records exactly once after normal
browser completion, binds each response to its exact socket/tunnel, and resolves
country/operator through the existing local MMDB files. No polling or extra tail
wait is used. The local collector requires a random per-run bearer token, exposes
only run-owned tunnel IDs, caps read/output size, and returns no-store responses.
It is loopback-only and is not a production proxy endpoint or authentication scheme.

The live acceptance run passed all six responses: observed public Amazon endpoints
resolved to US / Amazon.com, Inc. / ASN 16509. Single-read plus socket extraction
measurements were 137.1, 66.5 and 71.2 milliseconds (local Docker exec overhead is
included; these are not Lambda billed-duration measurements). Raw NetLog is deleted
in finally. Nine focused tests passed, including unauthorized access, scope isolation,
read limits, cached/service-worker responses and cross-authority rejection.

Run with the local container named `certscore-destination-local-check` on port 43128:

```sh
node --import tsx scripts/diagnostics/proxy-tunnel-proof/check-local.cjs
node --import tsx --test scripts/diagnostics/proxy-tunnel-evidence.test.ts scripts/diagnostics/bounded-netlog-sockets.test.cjs scripts/diagnostics/proxy-tunnel-proof/local-record-channel.test.cjs
```

**Not yet full scanner/report acceptance.** The live runtime finishes its graph
before browser cleanup; the prototype gets NetLog and tunnel records after cleanup.
Do not mutate a published graph or reopen a report to bridge this gap. Integration
must finalize and verify the typed proxy provenance within the existing owning
lane deadline, then persist/project it through the normal pipeline. No production
source enum, capture hook, remote collector, configuration or deployment was enabled.
The localhost app has not yet been proven to render these prototype observations.
The channel uses local Docker to read the log; production transport, authentication,
cleanup/retention and overhead need separate sizing and approval where required.
