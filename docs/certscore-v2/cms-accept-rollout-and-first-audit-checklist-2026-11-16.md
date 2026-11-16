# CertScore.ai CMS and Accept rollout checklist

Prepared November 16, 2026. The deployment hold is active. The release and acquisition commands below are for the authorized rollout and subsequent scheduled audit. Local preparation passed 76 focused tests, strict tooling types and independent retained-evidence parity. The historical snapshot remains sealed. [Local preparation receipt](../../artifacts/daily-scan-audit/runs/20261116-local-cms-accept-rollout-prep/verification.json) · [Astra High review](../../artifacts/daily-scan-audit/runs/20261116-local-astra-cms-accept-review/verification.json) · [Retained replay](../../artifacts/daily-scan-audit/runs/20261116-local-cms-accept-end-to-end-replay/verification.json)

## 1. Before releasing

- [ ] After the owner lifts the hold, use a clean, isolated checkout of the exact reviewed release commit. Record its full `RELEASE_SHA`, the read-back live web `LIVE_SHA`, the classified deployment targets and the preflight receipt directory. Review the full diff against the deployed base and account for any other pending workspace changes. The current workspace preparation receipt is local source evidence. The immutable release SHA and running image digests come from the authorized release.
- [ ] Confirm the release includes the scanner runtime CMS companion, the web materializer CMS and Accept projections and their source-binding guards. Verify the local audit source hashes against the reviewed activation, including `audit-prompt.md` v10 and the Mac mini procedure v15. Reuse existing verified IP-country/ASN datasets and runtime bases per the deploy runbook. Use the change-aware plan to identify affected validation consumers and migrations.
- [ ] Repeat the focused producer tests on the exact release source. Require same URL, loader, pre-consent state, runtime digest and terminal anchor for earlier CMS metadata. Confirm invalid ancestry, competing snapshots and oversized metadata fail closed. For Accept, require exact parent and original digest, preserve explicit worker stop reasons and verify that completed clicks and mismatched packets contribute no stop reason. Confirm dispatch, action eligibility, flags and budgets match the approved scope. Save test logs and exit codes. [CMS coordinator tests](../../apps/v2-dag-lambda/src/handler.test.ts) · [CMS projector tests](../../apps/web/server/scans/cms-security-projection.test.ts) · [Accept binding test](../../apps/web/server/scans/local-v2-dag-report.test.ts)

## 2. Authorized AWS rollout

- [ ] Use the canonical coupled `deploy:all` path with the scanner operational settings preservation guard. Coordinate the approved forward source promotion with the AWS runbook so an automatic push trigger cannot create a duplicate release. Keep all existing receipt and action settings in preserve mode for this change. Use the staged path only when the repository already meets its staged-release prerequisites and staging is in the approved scope. [AWS deployment runbook](../aws-ecs-deployment-runbook.md#staged-web-and-scanner-promotion) · [Canonical deploy helper](../../scripts/deploy-fast.ts)

For the ordinary coupled path, set `LIVE_SHA`, `RELEASE_SHA` and `PREFLIGHT_RECEIPTS` to the reviewed values. The deploy command assumes the exact source is already pushed on the approved ref and the checkout matches it. Leave `CERTSCORE_DEPLOY_AUDIT_RECEIPTS`, `CERTSCORE_DEPLOY_AUDIT_POLICY_RECEIPTS` and `CERTSCORE_DEPLOY_REVIEWED_OPT_OUT` unset for this rollout so the helper preserves the live settings.

```sh
pnpm preflight:all -- --base "$LIVE_SHA" --receipt-dir "$PREFLIGHT_RECEIPTS"
pnpm deploy:all -- --ref "$RELEASE_SHA" --base "$LIVE_SHA" --no-push \
  --no-predeploy --preflight-receipts "$PREFLIGHT_RECEIPTS" \
  --preserve-scanner-operational-settings
```

- [ ] Verify the web workflow and every affected validation consumer first. Require successful workflow runs for the exact release SHA, the exact-image migration gate where applicable and converged ECS services. Require the first-party version endpoint to report the target SHA and `ecs-fargate`. Record the web and materializer task-definition ARNs and running image digests. For the materializer, require the expected primary task definition, desired running count, zero pending tasks and the exact successful attempt’s `audit-receipt-release.json`. Check its privacy/form and policy receipt configuration against the pre-release baseline. A failed or unresolved consumer blocks scanner promotion. [Web ECS workflow](../../.github/workflows/web-aws-ecs-deploy.yml) · [Receipt configuration verifier](../../scripts/verify-audit-receipt-release.ts)
- [ ] Verify scanner promotion in `eu-central-1`, `eu-west-1` and `us-west-1`. In each region verify `certscore-v2-dag-local-lambda` and `certscore-v2-dag-local-lambda-inventory` against the candidate ECR digest for that region. Record `Code.ResolvedImageUri`, `SCANNER_IMAGE_DIGEST`, release image build SHA, `State=Active`, `LastUpdateStatus=Successful` and the operational-settings preservation and regional parity checks. Keep the existing 3,008 MB memory and timeout, routing, capacity and capture budgets. Use targeted settings readbacks and redact secrets from retained proof. [Scanner promotion and parity](../../scripts/deploy-fast.ts)
- [ ] Keep the workflow and AWS readbacks as hash-verified local release evidence. Record the convergence times for web, materializer, affected validation and all six scanner functions. Use the latest of those times as the first audit’s post-rollout boundary. A missing, mixed or failed target leaves the new audit option off. The November 6 acquisition receipt and the materializer’s configuration receipt each cover their original scope. Record CMS and Accept delivery separately after the first audit. If a rollout regresses, preserve the prior digests and use the canonical AWS recovery path for any approved rollback.

## 3. Before the first scheduled query

- [ ] Use the first existing **05:00 America/Los_Angeles** slot after verified convergence. Keep the same WC01 project, gpt-6.1-sol/xhigh and one scheduled invocation. Read the pinned v10/v15 procedures, activation, latest dashboard/cache/control receipts and automation memory. Verify exact local hashes, the prior seal and both latest pointers. Keep the prior snapshot and protected checkpoint, issue, release-watch and model-transition history. [Audit prompt](../../artifacts/daily-scan-audit/audit-prompt.md) · [Mac mini procedure](mac-mini-audit-progress-procedure.md)
- [ ] Require the actual November 6 `production-verification.json` with `status=passed`, `receiptsEnabled=true` and `auditSourceReady=true`. Verify its referenced proof hashes. An absent or failed gate means zero AWS tasks and preserved latest/queue. If only the newer CMS/Accept release proof is missing, keep the diagnostic option off and follow the existing audit gates.
- [ ] Recalculate the month's estimated AWS spend from the approved ledger and November 6 transport review, including the $1 per 31-day receipt reserve. Count the scheduled invocation once, including failures. Recovery adds zero invocations. Block paid work above **$5/month**. The last retained forecast was **$3.52**, a planning estimate. [Transport cost review](../../artifacts/production-rollout-20261106/audit-query-cost-preflight.json)
- [ ] Verify the exact SMB mount and `/Volumes/miniben/CertScore/evidence` without listing the archive. Reuse an existing mount. If absent, probe only `minibens-Mac-mini.local:445` in the macOS host context with `/usr/bin/nc -z -G 3` and a five-second wall deadline. Select `smb://minibens-Mac-mini.local/miniben` on success or the saved `smb://100.84.228.93/miniben` fallback on host resolution/reachability failure. Allow one Finder reconnect with the selected URL and up to 20 seconds to verify the mount and exact directory. If the host check cannot run unattended or access needs login, preserve latest and leave the query unused. Record route and outcomes.
- [ ] Freeze the actual cutoff, the preceding calendar month in Los Angeles, and the overlap from prior cutoff minus 48 hours. Enforce the eight-day maximum. Use `RUN` for a fresh absolute run directory. Read `PRIOR_CACHE`, `PRIOR_CONTINUITY` and `PRIOR_DASHBOARD_JSON` from the verified prior receipts. Set `MONTH_START_UTC` and `CUTOFF_UTC` to the frozen bounds. The local planner normally starts with at most 56 IDs and has a hard ceiling of 100. Copy its exact ordered `pendingRefreshIds` into `begin.json`. Retain the original plan and all deferred IDs with their ancestry. Reconcile all 108 baseline IDs and every later pending entry. In the last retained queue, 106 baseline IDs were pending and two had verified recoveries.

```sh
python3 scripts/cache-mac-mini-delta.py --plan-pending \
  --reuse "$PRIOR_CACHE" --start "$MONTH_START_UTC" --end "$CUTOFF_UTC" \
  --continuity "$PRIOR_CONTINUITY" > "$RUN/pending-plan.json"
```

- [ ] In `begin.json` set `includePrivacyFormReceipts: true` and, after both producer checks pass, `includeForwardCoverageDiagnostics: true`. Record the actual ECS container name, the new release proof and the prior snapshot/cache references. Plan offline and require the expected container, both diagnostics, all existing required columns and a maximum of **8,000 bytes** in the measured launch override. Save the SQL hash, effective ordered prefix and additionally deferred tail. Block the launch if the required query cannot fit with zero targets. Also block if bounds, cost, mount or source integrity fail. The last real-window replay fit **13/13 at 7,146 bytes**. The next-slot preview fit **47/56 at 7,998 bytes** and carried the nine sizing deferrals forward. Re-plan actual dates and IDs on the day. [Offline sizing proof](../../artifacts/daily-scan-audit/runs/20261116-local-cms-accept-rollout-prep/sizing-verification.json)

```sh
export TSX_TSCONFIG_PATH=apps/web/tsconfig.test.json
node --import tsx scripts/export-mac-mini-delta.ts "$RUN" --plan > "$RUN/local-sizing.json"
jq -e '.planningOnly and .forwardCoverageDiagnosticsProjected and .override.fits
  and .override.bytes <= .override.planningLimitBytes' "$RUN/local-sizing.json"
```

## 4. Run once and verify delivery

- [ ] After preflight passes, start the daily export once from the authorized Mac host context. Save the task and transport receipts, frozen SQL, logs and real `delta-inventory.json`. Require a read-only transaction, 45-second statement timeout, 5,000-row accepted cap, exact pending targets, typed controls and choice v2 summaries, the seven privacy/form fields, and existing policy, comparison, accessibility, California Reject, tracking and technical slots. For an interrupted started task, recover that same task with `--recover` and the frozen settings. Reuse a saved inventory. A missing field never justifies another query.

```sh
node --import tsx scripts/export-mac-mini-delta.ts "$RUN"
```

- [ ] Use the inventory for exact-path cache refresh, then prepare the opt-out manifest. Reuse verified cache bytes. Carry every eligible rolling-month extract, including the November 1 recovery source, and entire retained report objects with nested ancestry. Use the exact local `privacy-form-inputs.json`. Append the current inventory and retain unmatched arrivals explicitly. Pass the manifest as the seventh argument. Use `RUN_INPUTS` and `ORIGINS` from the compatible prior dashboard source receipts. Use `AUDIT_ROOT=/Users/benmasek/WC01/artifacts/daily-scan-audit`.

```sh
python3 scripts/cache-mac-mini-delta.py --source /Volumes/miniben/CertScore \
  --out "$RUN/cache" --start "$MONTH_START_UTC" --end "$CUTOFF_UTC" \
  --reuse "$PRIOR_CACHE" --inventory "$RUN/delta-inventory.json" --continuity "$PRIOR_CONTINUITY"
node --import tsx scripts/prepare-audit-opt-out-inputs.ts \
  "$PRIOR_DASHBOARD_JSON" "$RUN/delta-inventory.json" "$RUN/opt-out-inputs.json"
node --max-old-space-size=8192 --import tsx scripts/audit-progress-month.ts \
  "$RUN_INPUTS" "$ORIGINS" "$RUN/cache" "$RUN/dashboard" \
  "$AUDIT_ROOT/issues.json" "$AUDIT_ROOT/release-watch.json" "$RUN/opt-out-inputs.json"
```

- [ ] Check the new reportable production cohort from the convergence boundary. Separate earlier overlap rows, pending rechecks, partial coverage, ID-only rows and excluded canary/test/internal traffic. Use the retained comparison producer revision when present and count unknown revision coverage separately. Group by Los Angeles date and report projection version with source-qualified series. Join scan/time, original creator, ready generation, source digest and frozen payload digest. Require the original verified result-event bundle digest for diagnostic evidence and reject conflicts or changed bytes.

| Check | Expected first-audit evidence |
| --- | --- |
| CMS | Reconcile measured, positive, zero and unavailable scans for `technology.detections` and `technology.matches`. Keep Hidden links separate. Match dashboard/CSV values and unavailable reasons to `technicalCounts`. A bound typed reason such as `cms_document_mismatch` explains unavailable evidence. `source_missing` stays missing. Report zero measured results for an eligible sample as a delivery gap. |
| Accept | Reconcile public click states independently of the private reason. The bounded v2 `priorityEvidence.acceptPath` carries a source-bound enumerated reason only for eligible retained evidence. A valid lane-only reason may accompany `source_missing`. A joined stop may accompany `no_completed_click`. Separate null/missing and size-bound coverage, preserve completed/no-reason rows, and confirm no finished click gained a stop reason. Use the “Accept non-completion reason” series for the typed distribution. |
| Delivery outcome | Keep **pending** when there are no post-rollout reportable scans or no natural qualifying example for a specific diagnostic. A source-bound row or a measured CMS row can establish observed delivery for that item. A measured row alone provides no evidence that the earlier-snapshot CMS path was exercised. Explicit unavailable reasons stay limitations. Missing required columns or summaries, a bad source/generation join or conflicting receipts are actionable. |

The November 16 replay is a comparison baseline. Daily Mail, DNSPod and FeedBurner have unavailable historical CMS evidence. Onet, Snapfish and Hard Rock have historical Accept non-attempts with unavailable reasons. The first audit preserves those evidence limits. Trace a material new gap from capture to materialization to transport to audit intake using retained evidence. No historical backfill, new scans or actions, live target visits, raw S3/full-report recovery or export regeneration.

## 5. Validate, publish and record

- [ ] Run the focused audit commands below alongside the other checks required by v10/v15. Prepare `$RUN/strict-tools-tsconfig.json` using the last verified strict tooling configuration and include any reviewed changes in tooling coverage. The local PostgreSQL fixture uses a Unix socket. Save `test-receipt.json` with status and each check’s log file, SHA-256 and exit code. [Last verified tooling configuration](../../artifacts/daily-scan-audit/runs/20261116T130124Z-scheduled-v10/strict-tools-tsconfig.json)

```sh
node --import tsx --test \
  scripts/lib/audit-progress-opt-out.test.ts \
  scripts/lib/audit-progress-choice.test.ts \
  scripts/lib/audit-progress-choice-verification.test.ts \
  scripts/lib/audit-progress-gpc.test.ts \
  scripts/lib/audit-privacy-form-receipt.test.ts \
  scripts/prepare-audit-opt-out-inputs.test.ts \
  scripts/lib/audit-technical-reasons-query.test.ts \
  scripts/lib/audit-progress-delta-recovery.test.ts
pnpm exec tsc --noEmit --incremental false -p "$RUN/strict-tools-tsconfig.json"
```

- [ ] Run the browser and dashboard validators shown below. Require zero external requests, desktop/mobile/filter/chart/CSV checks, matching manifest and output hashes, independent `choiceEvidence` reconstruction with zero source mismatches and master value parity with zero mismatches. Block publication on failed integrity, tests, source/schema pins or parity.

```sh
node scripts/validate-audit-progress-browser.mjs "$RUN/dashboard"
node --max-old-space-size=8192 --import tsx scripts/validate-audit-progress-dashboard.ts \
  "$RUN/dashboard" "$RUN/test-receipt.json"
node --max-old-space-size=8192 --import tsx scripts/verify-audit-receipt-delivery.ts \
  "$RUN/audit-receipt-release.json" "$RUN/dashboard" "$RUN/receipt-delivery.json"
```

- [ ] Retain the existing policy/comparison delivery result and record CMS/Accept delivery separately. For the existing checker, exit 1 is failed and exit 2 is degraded. Keep the result and investigate integrity errors from sealed sources. Preserve a valid snapshot when coverage alone is pending or limited. Neither outcome authorizes another task. Compare prior pointers and protected state before publication.
- [ ] Publish only the validated fresh snapshot through the publisher below. Verify the `latest` symlink, `progress-dashboard-latest.json`, the new publication and validation receipts, and every sealed file hash. Recheck the prior snapshot’s recorded hashes.

```sh
python3 scripts/publish-audit-progress-dashboard.py --run "$RUN/dashboard"
```

- [ ] Save post-run verification with release proof hashes, actual cutoff and cohort boundary, source pins, one query/task or zero with a blocker, selected/rechecked/recovered/deferred/remaining pending counts and ancestry, export additions/updates/cache reuse, controls and all seven receipt fields by date/version, CMS and Accept delivery states, exclusions, missing files, cost estimate, and both dashboard paths. Report material unavailability and the first missing stage where the retained evidence identifies it. Delivery and dashboard movement support coverage observations only. Retain the action, effectiveness and compliance proof boundaries.
