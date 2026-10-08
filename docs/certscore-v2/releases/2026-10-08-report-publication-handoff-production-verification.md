# Report publication handoff: production verification, October 8, 2026

Validation-worker revision: `b3f115b7a9db0c0ed7e96fa96df6a9aff2e3bcd0`.
Web and regional scanners remain at `d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3`.
See [implementation readiness](2026-10-08-report-publication-handoff-readiness.md).

## Confirmed behavior

The production baseline reproduced the validation-slot bottleneck. Its second
owned scan waited **2,895 ms** between result ingestion and dispatcher claim
while the first scan's report HTTP request occupied the only validation slot.

All five new production scans released their validation slots before their own
publication HTTP requests finished. Result-to-claim waits were **0–20 ms**.
The additional three-scan concurrent batch confirmed a later scan was claimed
while a preceding report was still publishing, with exactly two overlapping
owned publication requests. The existing two-request publication limit remains.

| Run | Result → dispatcher claim | Scanner finished → report persisted | Request → browser ready |
| --- | ---: | ---: | ---: |
| Before 1 | 0 ms | 4.483 s | 23.812 s |
| Before 2 | 2,895 ms | 5.590 s | 25.306 s |
| After 1 | 0 ms | 4.471 s | 18.883 s |
| After 2 | 1 ms | 1.685 s | 19.731 s |
| After 3 | 1 ms | 1.413 s | 20.932 s |
| After 4 | 0 ms | 2.673 s | 17.066 s |
| After 5 | 20 ms | 2.274 s | 16.080 s |

The first after-release pair's scanner results arrived too far apart to prove
cross-scan overlap, so the supplementary concurrent batch exercised that case.
This is a small owned-fixture cohort. Scanner duration varied, and the first
after-release publication still took 4.471 seconds after scanner completion.
Do not attribute all total-time differences to the handoff or claim a universal
per-scan saving. The confirmed change removes publication HTTP from the validation
slot and therefore prevents that source of blocking for durably recoverable scans.

[Concurrent production report](https://certscore.ai/scan/40e8fedd-14e2-4fb7-abe7-c5ce0e72c9ee).

## Evidence and checks

All seven scans used the fresh, owned `https://ergoveritas.com/testar1.html` EU-DE
standard fixture. SITS was not contacted. Every scan passed original manifest,
bundle and Accept/Reject packet SHA-256, byte-length, identity and schema checks.
All six lane outcomes were completed and joined, A/R/O were observed, Accept
retained four observations, and Reject completed its unchanged 8-second window
with zero qualifying observations. The fixture has zero forms.

Every scan had one canonical unified-derivation completion, one retained terminal
Lambda result and one completed materialization request with attempt count 1.
All reports and public API status responses were ready with unchanged score 84,
confirmed Accept and confirmed-clean Reject. Browser errors were empty. No
evidence, scoring, model, observation-window or authorization policy changed.

The exact worker source passed frozen installation, dependency/worker build and
`pnpm preflight:fast -- --base d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3` in a clean
checkout. Focused tests passed 47/47; worker pipeline passed 264/264; canonical
parity passed 529/529; post-refusal release checks passed. Required CI typecheck
and pipeline checks remained enabled. Local tests exercised blocked publication,
bounded admission, duplicate coalescing, failure/restart recovery, detached
rejection handling, durable ownership and awaited local/preview fallback.

## Deployment

Command: `pnpm deploy:validation -- --base d2848c0c8bc9cddd877c091a0f8cf6ae257fa4a3 --no-preflight`.
The exact-source gate allowed skipping only the duplicate local gate. The helper
reused the push-triggered run, existing runtime base and registry cache. No web,
scanner, database migration or infrastructure deployment was required.

[Validation workflow 37851000668](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37851000668)
succeeded. Workflow job duration was **7 minutes**; helper wall time was
**7 minutes 10 seconds**, including push/registration. Image build/upload took
**114 seconds**, and ECS stabilization took **213 seconds**. The previous worker
job took 8 minutes 40 seconds, with 156 seconds build/upload and 245 seconds
stabilization. These are release measurements, not a controlled cache experiment.

Stable task definition 529 had desired/running count 1, pending count 0 and a
completed rollout. The running image tag and ECR digest matched the exact worker
revision. Build metadata is baked into the image rather than ECS environment
overrides. Live web and deployment-topology checks confirmed the intentionally
unchanged web revision and AWS runtime.

## Remaining targets and cost

- Web remote evidence loading and report materialization remain independent
  latency targets. This release does not eliminate those cross-process reads.
- The prior web deployment's 990-second ECR layer upload remains unexplained;
  this worker-only release did not repeat that web deployment.
- Continue comparable cohort measurement before making general latency claims.

Additional bounded handoff logging is estimated below $0.05/month at 100,000
scans, within existing capacity. The seven owned canaries and bounded production
reads are estimated below $0.50 once. These estimates were disclosed. No paid
request service, reserved capacity or retention increase was introduced.

Ignored receipts remain in `artifacts/report-publication-handoff-20261008/`,
including source/gate receipts, workflow and health logs, original-byte
verification, database timestamps and the asserted publication-overlap trace.
The merged implementation branch and clean temporary release checkout can be
removed; previously archived unique work remains recoverable.
