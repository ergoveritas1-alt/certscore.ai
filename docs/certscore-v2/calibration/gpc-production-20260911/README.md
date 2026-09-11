# Production GPC observation calibration — September 11, 2026

This release integrates the bounded GPC observation into the canonical production
assessment, persistence, concern, report, API and hosted MCP paths. It preserves
historical v1/v2 records and the existing paired comparison/scoring eligibility.
See [the approved policy](../../gpc-production-observation-policy.md).

## Final frozen cohort

| View | Complete / denominator | Rate |
| --- | ---: | ---: |
| Representative or unknown access | 225 / 230 | 97.83% |
| All submitted targets | 225 / 260 | 86.54% |
| Full-context delivery verified, separate facet | 128 / 230 | 55.65% |

The 95% Wilson interval for bounded observation completion is **95.0128–99.0680%**.
It narrowly passes the preregistered lower-bound requirement above 95%, with at
least 200 observations. This is a sample estimate, not a production guarantee.
Thirty originally retained canonical nonrepresentative outcomes are excluded only
from the representative-page denominator. All three unknown-access outcomes remain
failures. No target was retried, replaced, or dropped based on its GPC result.

Completion means a verified main-document GPC request and navigator readback,
source/session/document binding, terminal semantic probe, and complete bounded
request proof. Unsupported or absent GPP remains an honestly completed probe with
unknown state. It does not mean GPC was honored, that sale/sharing stopped, or that
all frames/workers were verified. The independent paired assessment can remain
indeterminate and score-neutral. No independent false-positive/negative rate or
legal compliance rate is established by this benchmark.

## Sampling and failures

The historical source pool has 837 eligible candidates, 183 historically
CMP-observed and 654 not-observed. Fresh central contact history was exported in
three disjoint 279-domain batches and merged with the manual ledger. The canonical
selector froze 57 historically CMP-observed and 203 not-observed targets before
contact. Historical GPC outcomes were not selection features. Previously contacted
domains may recur under the owner's explicit cooldown waiver; hard holds remain.
This is a fresh observation cohort, not a domain-disjoint holdout.

- index.hu: invalid GPP state; semantic probe remains limited.
- kv.no: one request lacks its own retained Sec-GPC header. Its capture window
  completed; the generic gate reason does not mean a short observation window.
- swatch.com, kettledroopingcontinuation.com and g.page: no verifiable terminal
  session/access evidence. All remain denominator failures.

ErgoVeritas is excluded from every public statistic. One separately recorded owned
canary completed. The ten-domain latency sample is disjoint from acceptance and
never pooled into its completion result.

## Evidence audit and source provenance

Original canonical bundle and session bytes, original pointers, selection, egress
proof and implementation hashes are retained under
`artifacts/gpc-production-20260911`. The committed manifest binds those files.
Luna performs a deterministic retained-byte replay and model-assisted engineering
review; this is not independent human adjudication.

Post-freeze production-assessor integrity checks require an actual producer
session binding and representative homepage access from the GPC lane's own
verified bundle. A challenge page cannot borrow access from the baseline lane.
The runner's parity assertion now compares usable completion rather than raw
window completion. These changes affect no capture code, deadline or original
artifact. The final audit replays all original bytes and records the exact helper
and runner hash differences, preserving the original stored assessments. The 21
raw completed windows on nonrepresentative pages become explicitly limited in
the final production projection; the usable 225/230 gate is unchanged.

The preregistration is preserved as written. Its bottom pending-input note is
historical: selection actually used the three successful fresh central exports
and `acceptance-prep/central-combined.json`, as recorded in the manifest and audit.
Its diagnostic-only gate is an evidence acceptance result. Production integration
is separately authorized by the owner and governed by the production policy.

## Latency and cost

Ten alternating live pairs through the existing California AWS proxy measured
median delta **−12.44 ms**, mean **+127.48 ms**, and sample p95 **+1409.89 ms**.
Ten static localhost pairs after a local warmup measured median **+2.81 ms** and
sample p95 **+46.40 ms**. Acceptance also ran on the same host, and network/host
variance affects these small samples. These measurements do not establish the
full six-lane production scan's tail latency or prove zero latency impact.

Mean retained inline session size is **22,979 bytes**, p95 **67,348 bytes**, maximum
**121,740 bytes**. At 100,000 scans/month, raw added session retention is about
2.30 GB for a 30-day window. The observed live mean implies roughly $0.62/month
of Lambda compute using the planning rate and 3008 MB allocation. The conservative
compute/metadata planning envelope is **$1–$3/month**, within the owner's approved
**$5/month** cap. This is an estimate, not a billing guarantee. There are no new
lanes, S3 objects, model calls, retries, longer timeouts or tail waits.

## Operational record

The canonical registry check passed. All 260 acceptance contacts, 20 latency
contacts and one owned-canary contact are recorded using distinct idempotent run
keys through the approved ECS database one-off. Reviewed manual ledger candidates
are committed here as one-off audit inventories; they do not expand the recurring
51-target calibration registry. Scanner-contact `completed` does not assert GPC
observation completion.

The temporary SSH rule was revoked and verified absent, local port 18129 was
confirmed closed, and the task's ephemeral SSH keys were removed. No proxy
configuration or capacity changed.

Release checks cover actual browser CSP/mixed-content non-transmission, malformed
or missing proof, original-byte integrity, version preservation, canonical
persistence/projection, California score neutrality, report/API and MCP output.
Deploy compatible web/materializer, validation and hosted MCP consumers first,
then the scanner image to all three approved Lambda regions. Require live commit
and image checks plus retained evidence from newly produced production scans.

The final strict audit independently verified all 260 original canonical pointers
and 249 original session pointers, reproduced every sidecar assessment and access
classification, recomputed the full gate, and compared every field of each final
production projection with its exact expected transition. It found zero unexpected
differences. All frozen capture hashes match; only the documented helper and runner
hashes differ. The 33 expected projection transitions consist of 21 completed no-go
windows becoming limited and 12 already-unavailable outcomes receiving the explicit
access limitation. Original results remain unchanged. Luna approved the own-lane
guard from an evidence-integrity standpoint. See `StrictAudit.json` and `LunaAudit.json`.
