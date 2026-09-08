# Regional proxy destination capture

The optional `CERTSCORE_PROXY_DESTINATION_ENABLED=1` path preserves the existing
regional Squid egress and TLS validation. It does not resolve a hostname later
and call that an observed destination. Exact response identity comes from the
pinned Playwright patch, which exposes Chromium's connection ID on that response.
A bounded, ephemeral NetLog maps that ID to the local CONNECT bridge socket. The
bridge's opaque tunnel UUID joins a signed Squid record of the upstream IP.
The canonical destination contract retains the connection ID, tunnel UUID,
authority and record hash. Offline IPLocate enrichment preserves this source.

Cached and service-worker responses do not acquire proxy provenance. Missing,
ambiguous, failed, over-budget or unverified records yield no destination. Normal
HTTP traffic still passes through the existing proxy, without CONNECT attribution.
No TLS interception, lookup API, extra browser navigation or DNS approximation is
introduced. Existing evidence, classifications and scoring remain authoritative.

## Limits and lifecycle

NetLog stays local, is at most 16 MiB and is removed on cleanup. Only loopback
socket tuples are extracted; raw NetLog is never published. There are at most 512
tunnel records and 30,000 request bindings per capture. Collection runs once after
normal browser close, before publication, within the owning deadline and a 300 ms
cap. There is no retry or late report update. Externally owned browser sessions and
sessions retained for policy recovery do not use this path.

The proxy collector uses four workers, a bounded 16-request queue, 2-second socket
timeouts, 16,384 records and a 120-second TTL. Records are memory-only. Requests
and nonce-bound responses use HMAC-SHA256; only requested UUIDs are returned.
Duplicate records are ambiguous. Systemd limits memory to 64 MiB and tasks to 12.

## Rollout

Use the existing regional proxy instances; do not replace or resize them. Copy the
committed `scripts/local-v2-dag-lambda/proxy-records/collector.py` and `install.sh`,
plus a region-specific random key file (0600), to a private temporary directory.
Use `manage.py inspect/install --region <region>`. The helper uses a temporary
EC2 Instance Connect key, verifies the SSH host key against AWS console output,
and removes its operator-only /32 maintenance rule in a finally block. It preserves existing Squid
ACLs and adds only loopback UDP 43129 through the Squid UID firewall guard.
Allow TCP 43130 only between the existing Lambda security group and proxy group.
Never expose this port to the internet.

The Lambda environment needs the enabled flag, `CERTSCORE_PROXY_RECORDS_URL`
(`http://<same-private-proxy-host>:43130/records`) and `CERTSCORE_PROXY_RECORDS_KEY`.
Deploy web/contract consumers before enabling scanner output. The canonical Lambda
setup helper preserves these keys. Require authenticated collector readiness and
successful scanner verification before enabling each region. To disable, set the
flag to `0`; ordinary proxy scanning continues. Do not remove the existing proxy.

## Verification and cost

Local scanner test: 21 captured requests, all 21 had `proxy_connect_iplocate`.
Local full-site scan `be9dd6c6-679c-41d8-814d-3f7b6caa3147`: three completed pages;
29 proxy-derived records on the two follow-on pages accepted and retained by WC01.
The homepage used the separate direct local path and is not proxy validation.
Focused tests cover extraction budgets/ambiguity/abort, contract provenance,
enrichment-cache provenance and authenticated collector isolation/duplicates.

Estimated incremental cost at the owner's 1,000 pages/month: less than $0.25/month
for bounded compute and small retained metadata, with existing proxy capacity and
no paid per-IP calls. No additional instances, provisioned capacity or retention
period are part of this change. Regional headroom must be checked before enablement;
any capacity increase estimated at $1/month or more requires separate approval.
