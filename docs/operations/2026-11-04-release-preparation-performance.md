# CertScore.ai release preparation performance

Scope: local release-tooling implementation and a feature-branch PR. No production
deployment, package publication, public-site scan, live flag/capacity change or
schedule change is authorized by this work.

The starting remote `main` and live `https://certscore.ai/api/version` were both
`f10f4f873bcac5819ec8dca7d678d670b85d673a`; the live runtime was `ecs-fargate`.
Implementation uses an isolated checkout under `/private/tmp`, preserving the
original WC01 working files and index. The previous release evidence remains
unchanged in its original directory.

The previous retained release took approximately 32 minutes preparing and 17m27s
orchestrating deployment. Web (13m39s) and validation (10m49s) overlapped; scanner
work (3m42s) followed them. Those lane totals must not be added to wall time.
The late verification import failure is preserved as a historical failure; the
new release entry point fixes its configuration rather than altering that receipt.

Implemented behavior and operator commands are in the release-preparation section
of `docs/aws-ecs-deployment-runbook.md`. In particular, prerequisite checks precede
dependent work, package exports compile once in dependency order, reviewed unit
groups have bounded concurrency, browser/build/unknown groups remain exclusive,
and local verification receipts cannot replace required CI or be relabeled for
another commit. Bootstrap reuse additionally checks actual generated outputs.
Scanner ECR preparation overlaps consumer deployment while every Lambda mutation
remains behind consumer success and artifact identity/parity verification.

The web workflow separates compatibility/typecheck from owned browser checks;
both gate image promotion. It restores only bounded webpack/SWC compiler caches
into fresh release output. Native ARM64, exact-SHA CI typecheck binding, exact-image
migrations, ECS stabilization and existing runtime-base rules remain mandatory.
Deployment skipping requires emitted runtime/dependency equivalence and installed
revision proof; unknown inputs and unsettled services conservatively deploy.

## Local measurements

| Measurement | Before | After | Scope |
| --- | ---: | ---: | --- |
| Package bootstrap | 41.344s | 18.055s | Same isolated source; every package `dist` removed before each run; Turbo reuse disabled; no incremental TypeScript configuration |
| Minimal Next.js fixture | 4.486s | 2.806s | Owned fixture; entire `.next` removed between builds; cache-only restoration; distinct verified build IDs |
| Fixture cache restoration | — | 0.082s | Separate filesystem copy, excluded from the second build wall time above |

The package comparison saves 23.289s in this local run. Fixture build plus restore
saves 1.598s; it is not a production-web benchmark. Results vary with filesystem
and compiler warmth. The benchmark script emits exact source/toolchain/input
metadata and fresh build IDs for repeatable follow-up measurements.

Theoretical deployment savings are limited by the part of scanner preparation
that can overlap the slowest consumer and by the new CI critical path. Production
warm-build cache hits, export overhead, runner queue time, preparation wall time
and total deployment savings are unmeasured until a separately authorized warm
release. The 15–20 minute preparation and 12–15 minute deployment goals remain
unverified.

## Validation and costs

Focused validation before the complete gate: 88 deployment/release regression
assertions and 26 AWS infrastructure contracts passed; the release-tools
TypeScript check passed. Workflow YAML parsing and `git diff --check` passed.
The PR and immutable final-gate receipts record the final exact-SHA results;
this document does not predeclare completion of a later gate.

Read-only prerequisite verification passed with Node 22.22.1, pnpm 10.6.3,
Docker Linux/aarch64 and current country/ASN databases built October 7, 2026.
No legacy live-smoke prerequisite secrets are configured in the repository, so
opening the PR does not activate that live-validation job. No values were read.

Recurring AWS increment: $0. Extra existing standard-hosted-runner setup is
estimated below $0.50/month at 20 releases/month. Compiler snapshots are capped
at 512 MiB and use the existing GitHub cache quota/eviction rather than added paid
storage. Higher release volume can increase CI spend. Resource reservations may
delay local checks on a busy machine; cold/cache-miss builds retain all gates.
No larger heap, paid persistent runner or infrastructure capacity is introduced.
