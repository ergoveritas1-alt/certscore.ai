# Next scan-speed release: production verification, October 8, 2026

Application revision `90e6f90a8da93b0051eae3dabb4a476ba8c1299a` is deployed
to public web, validation and all six scanner Lambda functions in the three
approved regions. Production evidence and report behavior passed verification.
The first measured before/after pair **did not demonstrate a whole-scan speedup**.

The separately committed deployment-helper correction `902389e8` is operational
tooling, not an application image change. Documentation and contact-ledger
updates likewise do not require another application deployment.

## Readiness and retained evidence

- Clean exact-revision full preflight passed: 2,465 tests, zero failures,
  workspace builds/typechecks and canonical evidence/projection gates.
- The clean-checkout startup regression test was corrected before the passing
  gate; the earlier failed gate was not waived.
- Retained consent replay passed. Eight selected public calibration targets
  completed with passing verification. Central contacts were recorded using the
  canonical idempotent persistence path; the repository ledger preserves prior
  contacts and adds those eight visits.
- Adobe's 403 was retained as blocked, without a retry. Chase's bounded policy
  packet and partial consent coverage on AT&T/Healthline were not relabeled as
  complete. Calibration did not contact SITS.
- Sixteen focused deployment-helper tests passed. The corrected helper was then
  exercised against the actual successful web and validation workflow runs.

Local initialization, form fixtures and policy/cache tests are recorded in
[local readiness](2026-10-08-next-scan-speed-local-readiness.md). Local bundle
initialization improved by 123.8 ms; this is not a measured Lambda cold-start or
whole-scan saving.

## Production scan comparison

Both fresh runs used the owned `https://ergoveritas.com/testar1.html` canary,
EU-DE, standard profile and forced new scan. The same browser measurement driver
recorded submission through visible Executive overview.

- Before: [scan 0c8bc635](https://certscore.ai/scan/0c8bc635-1043-42ff-893b-d9d685564e55),
  web `20d17e61`, scanner `75190099`.
- After: [scan 6b5add38](https://certscore.ai/scan/6b5add38-dac1-4e03-a154-6f83706406bd),
  web/scanner `90e6f90a`.

| Measured phase | Before | After |
| --- | ---: | ---: |
| Coordinator handler | 14.153 s | 14.380 s |
| Scanner completion to recorded result | 0.995 s | 0.981 s |
| Recorded result to persisted report | 3.516 s | 4.598 s |
| Scanner completion to persisted report | 4.511 s | 5.579 s |
| Submission to persisted report | 21.746 s | 22.850 s |
| Submission to visible browser report | 23.515 s | 25.374 s |

One pair is not a latency distribution or an isolated causal benchmark. It
provides no evidence of a speedup and must not be presented as one. The final
report's displayed scan-duration label measures a different interval from
submission-to-visible-report time.

Both reports scored 84 with the same two pre-consent issues, observed A/R/O,
OneTrust, one policy surface, four of five transport checks and no browser
errors. Original retained manifest, canonical bundle, Accept packet and Reject
packet bytes were verified against their size/hash references. All six lanes
completed and joined; each scan produced one canonical result event. Accept
retained four observations. Reject completed its existing eight-second window
without an eligible finding. EU GPC comparison stayed score-neutral.

This canary has no forms, so it does not verify fresh SITS form capture. Local
form regression fixtures passed; fresh SITS timing/forms remain unverified under
the diagnostic-contact hold. No new SITS exception was assumed.

## Deployment verification and measured duration

- [Web workflow 37839713522](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37839713522)
  succeeded in 10m 47s; checks included the required typecheck, image build,
  exact-image migrations and ECS stabilization. Build/cache/push: 240s;
  migrations: 51s; stabilization: 185s.
- [Validation workflow 37839713564](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37839713564)
  succeeded in 8m 13s. Build/cache/push: 143s; stabilization: 230s.
- Scanner build and regional replication completed in 3m 22s. The existing
  Chromium 151 runtime base was reused, the application image was built once,
  and all regions matched digest
  `sha256:7e5abce3c026f0994dd34e41f4b355127502b5a794f9ad7685dc574a5256dd50`.
  All coordinator/inventory functions were Active/Successful with verified
  bot identity and Web Bot Auth.
- Web and validation registry caches were restored/published. Matching runtime
  bases were reused. No capacity, migration source, browser version, deadline,
  lane or retention policy was changed.
- Live `/api/version` reported the exact application SHA and `ecs-fargate`.
  Web task definition 700, materializer 263 and validation worker 527 reached
  completed ECS deployments with expected running counts and no pending tasks.

The preceding web release took 10m 26s and scanner correction took 2m 45s.
This release does not demonstrate a deployment-duration reduction either.

The original helper discovered GitHub workflows before the push runs were
visible and dispatched queued duplicates. Only the redundant queued web and
validation runs were canceled; active image builds were preserved. An unrelated
MCP run caused by the broad shared-config trigger was canceled before its image
build. The helper correction gives newly pushed runs a bounded registration
grace, reuses exact-SHA active/successful runs, fails closed on discovery failure,
and requires exact live web revision verification. Recovery reused the original
successful push runs without another build. These steps are documented in the
[AWS deployment runbook](../../aws-ecs-deployment-runbook.md).

## Unresolved work and next target

1. The first after-release run spent approximately four seconds between result
   recording and policy-text projection logging, before the roughly 0.64 seconds
   of final projection phases. Input loading and publication scheduling need
   separate timing before choosing the next optimization; the logs do not
   establish which is responsible. No fresh terminal model call was observed.
2. The validation result parser still expects four or five timing lanes and
   drops the six-lane operational timing summary. The original verified
   manifests retain every lane's timings, so the measurements above remain
   valid. Findings, scoring and retained evidence are unaffected. A focused
   compatibility fix for historical four/five and current six-lane records is
   pending; it was not slipped into this verified application release.
3. Fresh SITS-specific scan-to-report timing and post-Accept forms were not
   retested because its diagnostic hold remains in effect.

## Cost and local receipts

The disclosed recurring SQS request increase remains approximately $0.11/month
for six continuously idle pollers. One-time readiness/calibration/owned-canary
verification and bounded production inspection were estimated below $0.50.
No provisioned capacity, paid model usage or new retention was introduced.

Local receipts are preserved under `artifacts/scan-speed-release-20261008/`:
`readiness-receipt.json`, `preflight-full-final.log`, calibration verification,
retained replay, original before/after manifests/packets, browser screenshots,
`owned-pair-verification.json`, `owned-server-timings.json`, workflow logs and
helper recovery/test logs. These ignored diagnostic files are preserved locally
and are not committed as production customer artifacts.
