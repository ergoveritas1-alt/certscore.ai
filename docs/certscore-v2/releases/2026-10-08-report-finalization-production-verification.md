# Report finalization: production verification, October 8, 2026

Deployed application: `d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3`.
Previous application: `90e6f90a8da93b0051eae3dabb4a476ba8c1299a`.
Implementation and cost details are in [local readiness](2026-10-08-report-finalization-local-readiness.md).

## Verified outcome

The terminal retained-policy join reused ingestion's original verified bundle
bytes in both new production canaries. Its measured duration fell from
1,688/1,392 ms before release to 106/123 ms after release. This removes about
1.3–1.6 seconds from that phase without changing evidence or scoring gates.
There is no fresh terminal model call and no fixed four-second sleep.

Four fresh, owned `https://ergoveritas.com/testar1.html` EU-DE standard scans
were compared. SITS was not contacted. Times below come from persisted server
timestamps and independent browser observations; they are not overlapping
phase durations added together.

| Run | Scan | Scanner | Scanner finished → report persisted | Request → report persisted | Request → browser ready |
| --- | --- | ---: | ---: | ---: | ---: |
| Before 1 | `a88fe75c-62c3-4aa2-bd8d-d7a7748c20da` | 14.786 s | 5.130 s | 23.170 s | 25.698 s |
| Before 2 | `e737d4ad-b97f-4a70-9610-4628604f5b03` | 11.471 s | 5.308 s | 17.623 s | 20.133 s |
| After 1 | `a20c827f-1812-4880-bbf8-5df94dfba788` | 14.252 s | 8.683 s | 25.575 s | 27.008 s |
| After 2 | `59d9ca77-b474-4631-bdb6-247374387f91` | 11.081 s | 3.384 s | 15.726 s | 18.247 s |

[Verified production report](https://certscore.ai/scan/59d9ca77-b474-4631-bdb6-247374387f91).

The first after-release scan waited approximately 5.6 seconds for the validation
dispatcher slot while another scan's report-publication HTTP request finished.
Its canonical-input wait was 5,861 ms, versus 373 ms in the second run. The
separate finalization scheduler reported zero queue wait in both runs. The
dispatcher currently awaits publication before releasing its slot. These are
different queues; the slow run must not be attributed to the finalization queue.
Two before/two after canaries do not establish a consistent overall latency
improvement across sites or under contention.

Remaining measured targets:

- Release the validation slot after durable canonical derivation, without
  weakening publication ownership, failure recovery or single-result semantics.
- Web remote artifact loading still takes 1,115–1,123 ms, nested within
  1,254–1,289 ms materialization. The worker cache cannot eliminate reads in a
  separate web process. Result delivery/persistence also takes about 1.1 seconds.
- Collect a larger comparable cohort before claiming a general scan-to-report
  improvement. This release proves the retained-policy phase reduction only.

## Evidence and readiness

The clean checkout at the exact deployed commit passed frozen installation,
`pnpm turbo run build`, and `pnpm preflight:full -- --base 90e6f90a8da93b0051eae3dabb4a476ba8c1299a`
with exit 0 at 21:17:36 UTC. Focused byte-cache, source-generation, historical
and six-lane timing, retained-result replay, typecheck and pipeline checks passed.
Required CI checks remained enabled. No material source change followed the gate.

All four production results had exactly one retained Lambda-result event, a ready
report, score 84, all six verified lane outcomes, and verified original artifact
hashes and byte lengths. A/R/O were observed, Accept retained four observations,
and Reject retained zero qualifying observations after its full 8,000–8,001 ms
window. The owned fixture has no forms. After-release terminal events preserved
all six lane timing rows, which the previous parser dropped. No evidence,
finding, scoring, observation-window, deadline or lane policy changed.

Production `/api/version`, ECS stability, all six regional Lambda functions,
regional scanner digest parity and Cloudflare Web Bot Auth checks passed.
The live and topology checks used `EXPECTED_LIVE_GIT_SHA=d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3`.

## Deployment measurements

Canonical release command: `pnpm deploy:all -- --base 90e6f90a8da93b0051eae3dabb4a476ba8c1299a --no-preflight`.
The completed exact-source gate justified avoiding a duplicate local preflight.
The helper reused push-triggered workflows and existing runtime bases. Scanner
build ran once and replicated to the three approved regions without cache export.

| Target | Measured workflow duration | Major stages |
| --- | ---: | --- |
| Regional scanner deployment | 3 m 7 s | One build, replication, regional parity and health |
| Validation worker | 8 m 40 s | Build/push 156 s; ECS stabilization 245 s |
| Public web | 27 m | Build/push 1,193 s; migrations 54 s; ECS stabilization 185 s |

[Web workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37845753430)
and [validation workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37845753409)
both succeeded. Web task definition was 701, materializer 264, and validation 528.

The web build's ECR image-layer upload consumed **990.4 seconds**. The Next.js
container build took 140.9 seconds, image export 4.5 seconds, and cache export
41.4 seconds. Runtime-base and cache reuse worked. The prolonged upload is a
separate unresolved deployment bottleneck; the underlying network/registry cause
was not established. No deployment-time improvement is claimed for this release.

Local helper monitoring briefly failed on network errors while the existing
GitHub jobs continued. Monitoring resumed against those same runs; no rebuild,
redispatch or rollback occurred. Successful workflows and independent live checks
are the final deployment evidence, rather than the interrupted helper exit code.

Estimated incremental bounded timing metadata/logging remains below $0.25/month
at 100,000 scans, with no capacity or retention increase. Owned canaries and
bounded production reads are estimated below $0.50 once. Both were disclosed.

Detailed local receipts are preserved in ignored
`artifacts/scan-projection-next-20261008/`, including the exact-source gate,
workflow logs, live checks, original-byte verification, DB timings and correlated
phase comparison. The merged implementation branch and clean temporary release
checkout can be removed; archived unique SITS work remains recoverable.
