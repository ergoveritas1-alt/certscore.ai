# CertScore.ai integrated production rollout — November 6, 2026

The owner authorized moving the reconciled release to production with private seven-field receipts enabled. The owner then expressly authorized broader opt-out activation and removing the Red Hat single-scan grant requirement and ReadCube/Gimbal rollout holds. This supersedes those administrative holds for the reviewed recipes. It does not expand scan budgets, privacy targets, arbitrary routes, external forms, capture work, scoring policies, retention or capacity.

## Authorization and execution

- Preserve the materializer receipt setting on ordinary future deployments; explicit true/false overrides remain available.
- Publish SDK 0.2.27 and MCP npm 0.2.35 because their source differs from the already-published versions. Keep the existing 0.2.34 Homebrew artifact and Claude submission pin unchanged.
- Enable conditional sale/sharing execution for eligible ordinary sharded scans. Preserve independent Accept/Reject/GPC lanes and the existing join barrier, five-second worker cap and three-second action capture.
- Red Hat production authorization uses its exact source-bound v4 dispatch with durable coordinator and worker claims. Its legacy single-scan canary remains available when production rollout is disabled.
- Reviewed v2 apex/www and v3 exact-route grants require a same-scan hash-verified consent source with a joined visible reviewed control and exact document binding. ReadCube/Gimbal Settings are restricted to their checked-in source/route/locator/label recipes. The worker independently retains native-TLS redirect ancestry and rechecks readiness before any action.
- Production claims bind scan, original source, parent dispatch, region, function/version and image build. Conditional create prevents reuse. Missing or changed proof fails closed. No production campaign slot, arbitrary target or expired historical grant supplies new authority.
- Use `CERTSCORE_DEPLOY_AUDIT_RECEIPTS=1` and `CERTSCORE_DEPLOY_REVIEWED_OPT_OUT=1` with the canonical deployment helper. They request explicit workflow settings. Deploy reader code with conditional dispatch disabled, promote and verify all regional scanner code, then enable consumer dispatch through the canonical workflows. This avoids emitting a new profile before older scanners understand it. Existing sources default off without configuration.

## Cost and rollback

The existing owner-approved extra-lane policy contains 100,000-scan scenarios of approximately $1.48/month at 6.1% triggers and $4.75/month at 19.4% triggers for five seconds at 3,008 MB, before startup, storage, requests and networking. These are illustrative scenarios, not measured forecasts. Reuse the existing shared $10/month within $50 allowance; no additional capacity or retention is introduced. Claim objects add bounded small writes within the existing bucket and retention. Production trigger rate and actual billed duration must be monitored; 100% triggering can exceed that envelope and would require a revised cost decision. Lower-cost rollback is disabling conditional execution, keeping all six core lanes and receipts.

Official reference: https://aws.amazon.com/lambda/pricing/. Current public list-price reference is $0.20 per million invocations; architecture, regional duration tiers and initialization affect billed totals. Receipts remain within the previously disclosed sub-$1 metadata allowance. Do not claim that one-time build costs or forecasts are measured production costs.

Disable consumers with `reviewed_opt_out_rollout=disable` in their canonical workflows and disable the production recipe flags on scanner configuration if a safety/integrity regression appears. Preserve retained evidence and unknown outcomes. A runtime limitation or unready CMP is reported explicitly and does not count as a successful privacy action.

## Promotion checks

Reconcile current main and live production ancestry; run exact-source full release gates; preserve CI typechecks, PostgreSQL contention checks, exact-image migrations and service stability waits. Deploy affected web/materializer, validation and other affected readers before the three-region Lambda producers. Keep the Claude review pin and external submissions unchanged. Verify live revisions, flags, digest parity and source-bound evidence flow; report any remaining unverified production coverage.

Original worktrees and sealed history remain preserved until the authorized release is verified and branch cleanup is reconciled.
