# October 8, 2026 scan/report latency release

## Released source and verification

- Web, validation and MCP: `20d17e61f2fa1b17c2b67a66b1575586fac45b9f`.
- Scanner deployment correction: `75190099226ea5b8388f81a6ec212e1b303d6bee`.
- Scanner application source is unchanged between these revisions; the correction
  fixes build-base selection and records the deployment policy.
- All three primary and inventory Lambda functions are Active/Successful with
  digest `sha256:35b8905985c8ed384ad600d6f42950db4a5b8718f7ee067aa7641978988de133`;
  their retained digest configuration matches the actual deployed image.
- Browser navigation and Cloudflare bot-auth verification returned HTTP 200 in
  eu-central-1, eu-west-1 and us-west-1.
- The live web endpoint reports `20d17e61` and `ecs-fargate`. All ECS deployment
  workflows completed successfully, including migrations before web promotion.
- The retained SITS report still renders two After Accept form observations and
  the canonical Reject finding. Its historical missing second screenshot was
  not relabeled as newly captured.

Workflow evidence:

- [Web](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37829134745)
- [Validation](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37829134417)
- [MCP](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37829134334)

## Changes and readiness

The release reduces repeated report projection, uses cross-process publication
and early-review locks, reuses exact completed generations, and caches verified
immutable evidence. Existing verified policy review overlaps deterministic work;
terminal report readiness does not start a new model call. Publication capacity
remains separate from trailing work. Policy normalization and excerpt lookup are
bounded and faster. Policy discovery reveals lazy footers before waiting and
uses registered shadow-root links. After Accept pixel capture is serialized while
safety review overlaps it; responsive capture and existing late-form settlement
remain bounded. No new browser lane, model call or timeout was introduced.

Deployment changes reuse an exact-SHA successful CI typecheck, publish validation
build caches, fingerprint web runtime bases and protect bounded mutable cache
tags. Runtime compilation is independent of release metadata. Required tests,
typechecks, migration ordering, forward promotion and health gates remain enabled.

Readiness passed from a clean source snapshot at the existing 8 GB heap limit:
19 workspace builds, full preflight (2,463 tests) and deploy-all preflight
(2,578 tests). The scanner helper correction passed the change-aware gate and
19 focused deployment/provenance tests. Earlier local heap failures were not
waived on the strength of a container-only result.

## Measured deployment timing

| Stage | Previous release | This release |
| --- | ---: | ---: |
| Web workflow | 11m 26s | 10m 26s |
| Web typecheck | 61s | 66s |
| Web image build/push | 290s | 237s |
| Web migrations | 50s | 54s |
| Web ECS stabilization | 184s | 186s |
| Validation image build/push | 145s | 137s |
| Corrected scanner-only deploy and verification | — | 2m 45s |

These are observed whole-run timings, not isolated causal benchmarks. The first
web release bootstrapped its runtime base; a later warm release is still needed
to measure base/cache reuse. Web and validation cache publication is verified.

## Initial scanner failure and recovery

The first deploy-all attempt took 9m 42s in the canonical helper and failed its
scanner smoke check. All three retained smoke packets stopped at browser launch,
before navigation. A missing base tag in us-west-1 incorrectly selected a full
image build even though eu-central-1, the only build region, had a working base.
That installed Chromium 154 instead of the previously verified Chromium 151.

The working previous image was restored in all three regions. The helper now
checks only the build region and stops before production configuration changes
if its base is missing; it never implicitly installs a new browser. The corrected
application image reused that base, was built once, replicated and verified.
Successful web, worker and MCP deployments were not repeated. Failed smoke
evidence and recovery logs remain in the local release artifact directory.

## Production timing evidence and remaining gaps

An existing owned-canary production run,
`4cf2541a-da96-4a2a-a556-27138ba3a7f6`, reached report projection readiness
1,930 ms after persisted scan completion. Its report renders at:
[Owned consent-stress canary](https://certscore.ai/app/scans/4cf2541a-da96-4a2a-a556-27138ba3a7f6).
Dispatch and readiness log timestamps span approximately 16 seconds. This run
used the restored previous scanner with the released web/materializer; it
verifies the new post-scan publication path, not the new scanner optimizations.
The report's original browser-ready time was not measured by this agent.

A fresh, controlled SITS request-to-scanner-to-report-to-browser comparison is
still unmeasured. The one-run exception to its diagnostic hold/contact cooldown
is pending. Deployment authorization does not override that hold. No SITS
contact was made during this release verification. Replay savings across parallel
lanes must not be added or presented as measured full-scan savings. Fresh SITS
second-form screenshot verification also remains dependent on that exception.

## Cost and cleanup

Bounded cache/base storage is estimated below $0.90/month; operational timing
telemetry was previously estimated below $0.10/month. These are the previously
disclosed increases; the scanner helper correction adds no recurring cost,
capacity, browser lane or scan window. The contact-history lookup used one
one-off task estimated below $0.02. Standard deployment smoke verification used
the existing Lambda functions.

Source hashes, gate logs, workflow logs, ECR policy previews/publication and
scanner state evidence are retained under
`artifacts/release-readiness-20261008/`. The temporary clean-source clone had no
unrecorded files or source drift. The merged local feature branch and that clone
were deleted; unique work and ignored evidence remain preserved. The stale Git
maintenance warning was archived, and no Git objects were pruned.
