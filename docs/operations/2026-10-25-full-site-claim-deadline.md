# CertScore.ai worker-start deadline investigation

Local repair only, October 25, 2026. No deployment, production configuration
change, new public visit, scan, or historical rewrite was performed.

## Retained incident

Scan `6a7ed616-fdea-49ba-b4b6-115f16172228`, EU-DE, retained one failed page:
`https://certscore.ai/monitor-site`, page
`e3b7537a-a640-4ca0-9753-a6520869eafa`. Both attempts ended with
`worker_lease_expired`, with no observation or artifact.

| Event (UTC) | First attempt | Second attempt |
| --- | --- | --- |
| Lambda invocation start | 20:54:49.830 | 20:55:55.822 |
| Request reached public ALB | 20:54:49.932 | 20:55:55.972 |
| Worker claim timed out | 20:54:52.835 | 20:55:58.829 |
| ALB recorded client disconnect (460) | 20:54:52.911 | 20:55:58.909 |
| Database attempt start | 20:54:53.457 | 20:56:00.263 |

The requests reached the ALB in 102/150 ms. Both targeted web task
`770be05aa011403a85e79e590368e0fd`. The server began its recorded admission
transactions after the workers had exited. A timeout did not cancel server-side
admission, so the server created active attempts that could only expire later.

The same web task was serving report work. The second claim overlapped an API
findings response from 20:55:55.726 to 20:56:00.251, immediately before admission
began. Full-site report assembly also overlapped the first claim. This establishes
server-side acknowledgment delay; historical logs do not separately measure
event-loop scheduling, pool admission, or individual transaction lock waits.
There is no historical per-request CPU profile proving one exclusive cause.

## Reproduced CPU bottleneck

Replayed the checksum-verified retained report for
`d60cc36d-040c-4be0-befe-e7946631476c`, the API response overlapping the second
failure. A local Node CPU profile identified repeated hostname normalization in
`detectKnownCmps`, reached through CMP load-order and finding projections. Each
registry comparison reparsed the same strings, including throwing URL-constructor
exceptions for ordinary bare hostnames. This blocks the shared Node event loop.

The repair normalizes each distinct value once per detection and uses
`URL.canParse` to select the existing bare-host fallback without exceptions.
There is no shared customer-URL cache or recognition-policy change.

Warm local API projection builds measured 235/254 ms before and 131/121 ms after
(approximately 48% lower mean projection time in this small replay). Cold builds measured
318 ms before and 225 ms after. These are local measurements, not production
latency guarantees. The complete API projection was identical at a fixed clock.
An additional 2,652 retained and registry-boundary inputs produced identical CMP
detections.

## Admission repair within unchanged budgets

- Keep the three-second claim cutoff, original absolute 24-second invocation
  window, 25-second Lambda timeout, existing capture/cleanup budgets, and retry
  count unchanged. The owner explicitly declined extra startup waiting.
- Carry the original claim deadline in an internal header, unchanged on transport
  retry. Legacy workers without the header retain their existing behavior.
- Recheck the deadline after pool/lock admission, after authorization and pacing
  checks, and after activation writes. An authenticated expired claim records a
  failed start against the existing retry allowance, clears credentials/leases,
  and uses the existing 30-second retry schedule. It cannot become a browser
  observation or a finding.
- Avoid the first unnecessary full crawl-row read and load finish-only graph
  projection code only on the finish path.
- Record bounded slow-claim timings for transaction readiness, site-lock wait,
  handler duration, and deadline remaining at handler entry. Do not log tokens,
  target URLs, bodies, or identifiers from captured requests.

This closes the reproduced late-admission cases. A distributed acknowledgment
can still be lost after a committed, timely grant; the existing bounded lease
remains the recovery mechanism for that case. The change does not promise that
every loaded web server can answer within three seconds.

## Verification and cost

Real loopback HTTP and PostgreSQL regression tests exercise 3.3-second site-lock
contention, the unchanged worker timeout, both bounded attempts, pool exhaustion,
expiry during activation writes, timely admission, and credential replay. Route
tests cover deadline propagation, malformed headers, legacy compatibility, and
lazy graph loading. Existing CMP recognition, API/Pulse projection, completion
receipt, scheduler, and failure-description tests remain applicable.

All 157 focused tests passed, including the real PostgreSQL scheduler suite and
the new contention test. Typechecks passed for shared, database, Lambda, web,
and validation-worker packages. `git diff --check` passed.

The CPU optimization and admission cleanup add no provisioned infrastructure,
browser work, model calls, or waiting budget. Estimated additional bounded
slow-claim log ingestion/retention is below $0.50/month at 100,000 comparable
site scans; this is the only expected recurring increase. Production effectiveness
requires a separately authorized AWS deployment and subsequent retained-result
review. A public scan is not authorized by this investigation.
