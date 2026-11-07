# CertScore.ai seven-field receipt rollout checklist

Prepared November 6, 2026. Deployment and new data acquisition are on hold. Use this checklist after the owner separately authorizes the producer rollout and the first production audit. The daily 5:00 a.m. America/Los_Angeles audit is currently retained-only.

The [local verification](../../artifacts/daily-scan-audit/runs/20261106-v2-query-headroom/result.json) exercised the production-shaped report writer, a read-only PostgreSQL query with all 100 pending IDs, and the normal dashboard builder. All seven fields appeared. The largest launch request across 256 local cases was 7,914 of 8,192 bytes with optional operations evidence omitted. Production delivery, runtime and cost remain to be measured.

## Next release deployment timing

Deployment is on hold pending owner authorization. This section applies to the next deployment. The sections below retain the earlier rollout record.

- [x] Add `10292fd1530ae3d0db5d99ead4b7b2a8ae0f68df` to the next release. It includes coordinated push deferral and automatic reuse of matching local preflight receipts. The local dry run verified the workflow ordering, and a targeted gate took 34.8 seconds fresh and 1.6 seconds on replay. [Release bundle](../../artifacts/release-latency-10292fd1/release-candidate.bundle) · [Local replay log](../../artifacts/release-latency-10292fd1/receipt-reuse.log)
- [ ] Before the authorized release, confirm the final commit includes `10292fd15` and carries the `CertScore-Deploy: coordinated` trailer. Record the final SHA, live base, and canonical command. Keep the same clean checkout, toolchain, test environment, and receipt directory between preflight and deployment. Use the [AWS deploy runbook](../aws-ecs-deployment-runbook.md).
- [ ] **Measure initial deployment queueing.** Record the push, workflow creation, first job start, and successful completion timestamps for web and validation. Keep run IDs and confirm both push records started zero jobs in the production queues, and exactly one initial deployment ran per service. Compute queue time as creation to first job start. Compare web and validation separately against the previous explicit runs, which queued for **12m 59s** and **8m 24s** respectively. Track build, migration, and ECS stability separately. [Previous web run](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/42389211024) · [Previous validation run](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/42389210028)
- [ ] **Measure receipt reuse.** Record the required fresh gate's check count and wall time, and the deploy command's preflight wall time and counts of reused, rerun, and failed checks. Record why any receipts missed and retain both logs. Compare matching checks in the same checkout and environment. The previous 43-check gate took **27m 48s** when it had to rerun. Use the ordinary required gate and its deployment-time replay for this measurement. [Previous deploy log](../../artifacts/deploy-settings-release-52187d34/deploy.log)
- [ ] Save one timing receipt with the final SHA, workflow links, initial and final running image digests, both speedup measurements, and command-to-verified wall time. Verify that the initial ECS images were stable before settings-only dispatch and that the settings phase reused those digests. Note overlap between parallel lanes and any differences in cache or test conditions before attributing savings.

## Remaining-path reconciliation

- [x] Review all 247 differing source, tooling and documentation paths on `codex/reconcile-remaining-release-20261106`. Preserve 22 newer candidate versions and integrate the local additions and complementary changes from the common source. Every path has an explicit decision and source hashes. [Path review](../../artifacts/release-reconciliation-20261106/path-review.json)
- [x] Preserve the full-evidence v2 superset, customer-safe persisted control projection, Web/PDF/DOCX parity and generation-bound screenshot links. Keep the later form lifecycle, runtime clock, resource inventories and CI release checks. Reconcile runtime capture limitations and paired GPC/CMP document/window binding without additional capture work.
- [x] Reconcile the v15 retained-only audit, canonical catalog, source/version-separated measures, mandatory opt-out manifest, prior control-extract continuity, pending-ID limits and choice/master-parity publication gates. The activation proposal and master source review record the candidate's changed hashes. [Activation proposal](../../artifacts/release-reconciliation-20261106/audit-activation-proposal.json) · [Master source review](../../artifacts/release-reconciliation-20261106/master-source-pin-review.json)
- [ ] Before any authorized rollout, decide activation scope for the seven-field materializer receipt switch, the conditional seventh opt-out worker and the Red Hat recipe. The source defaults require explicit enablement. Red Hat's earlier grant is consumed and revoked, so any new run or production activation requires fresh authorization. Preserve the existing ReadCube/Gimbal holds.
- [ ] Coordinate public SDK/MCP package versions and publication with the AWS consumer release. Recheck actual deployed revisions and registry metadata when release access is authorized. Preserve the Claude plugin review pin and treat Anthropic's listing and connector reviews separately.
- [ ] After source promotion, review and apply the proposed audit activation hashes to the same local project. Preserve the retained-only schedule, immutable historical receipts, pending-export queue and prior snapshots.

## Integrated release candidate

- [x] Combine the validated homepage and Claude Light source, the reviewed report and scanner readiness commits, and the calibration ledger in `fbfabdc38b1b695aa5c1de502e5554e720922c63`. The ledger merge preserves both histories and uses the newer recorded update timestamp. Include the Sentinel credential isolation patch with the fallback aligned to the checked-in accessibility corpus. All 43 Sentinel tests passed locally. [Integrated source bundle](../../artifacts/integrated-release-candidate-20261106/candidate.bundle)
- [x] Rebuild the integrated web candidate and repeat the local homepage browser matrix. Full web typecheck, optimized build, all four geolocation profiles and all 12 sample-button combinations passed. Hosted MCP compilation and fixture checks passed. The release asset guard used the retained November 3 metadata receipt for local verification. [Integrated verification](../../artifacts/integrated-release-candidate-20261106/verification.json)
- [x] Run all 38 selected local preflight checks on the integrated revision. All passed after building the committed review-engine dependency and supplying a fixed example.com DNS fixture for offline Lambda tests. The optional PostgreSQL contention case was skipped. The release asset guard used retained metadata. [Check results and limitations](../../artifacts/integrated-release-candidate-20261106/verification.json)
- [ ] Confirm the live revision of each service before planning dispatch. The prior AWS receipt records the Claude Light web and hosted MCP rollout at `9f53f2bb3`. The local plan compared against that revision and identified web, validation, and three regional scanner targets with no new database migration. Hosted MCP, Sentinel, and SDK publication have separate workflows. Check the deployed or published revision for each before deciding which workflows to run. [Prior AWS receipt](../../outputs/claude-light-publication-2026-11-03/aws-release.json) · [Local deployment plan](../../artifacts/integrated-release-candidate-20261106/deploy-plan.log)
- [ ] Sequence web/materializer and affected validation consumers before scanner producers. Scanner promotion requires approval for the image and provenance writes, including `SCANNER_IMAGE_DIGEST`. Use the operational settings preservation guard for an approved promotion. Keep the receipt switch under its separate producer approval. [GPC release handoff](gpc-release-handoff-2026-11-03.md)
- [ ] Review the Sentinel workflow separately before any push to `main`. Changes under the Sentinel monitor can trigger a Lambda promotion and schedule application. Check the credential and schedule scope, and account for this workflow in the release dispatch plan.
- [x] Reconcile the remaining local product, tooling, and audit changes through the path review above. The earlier inventory remains the comparison against the integrated revision. A differing path can contain both included and outstanding changes. [Original working tree inventory](../../artifacts/integrated-release-candidate-20261106/worktree-inventory.json)

## Previously validated web and hosted MCP subset

- [x] Isolate and validate candidate `71770b3fdce52c47ddcd1e91e6b32a5d1155c9c5` on top of the reviewed Claude Light merge `9f53f2bb3`. The candidate includes both homepage fixes, the default-off materializer receipt code and switch, Claude Light setup pages, and hosted MCP review guidance. Full web typecheck, optimized Next.js build, hosted MCP compilation, distribution validation, and 41 homepage and 196 MCP-focused tests passed. The plugin directory matches the reviewed merge byte for byte. [Verification receipt](../../artifacts/homepage-claude-release-candidate-20261106/verification.json) · [Source bundle](../../artifacts/homepage-claude-release-candidate-20261106/candidate.bundle)
- [ ] After authorization, verify live ancestry and prepare the exact web and hosted MCP AWS release lanes. The production image and live checks remain open. Preserve the existing Marketplace Light setting and keep receipt enablement subject to the separate producer approval below.
- [ ] Track the Claude plugin v0.2.26, replacement listing icon, and connector move to `/mcp/light` through Anthropic's separate reviews. The AWS rollout covers CertScore.ai's web and hosted MCP code. Preserve the review pin and submissions.
- [ ] After promotion is verified, reconcile the working branches before archiving any of them. The GPC worktree is clean. The integrated revision includes the Claude publication source and retains its review pin. The report readiness and Sentinel branch tips and calibration commit are included. The original Sentinel and main worktrees retain their local edits pending reconciliation.

## Before enabling the producer

- [x] Package the shared encoder and verify it in a local ARM64 image. The [web source tree](../../apps/web/server/scans/privacy-form-audit-receipt.ts) now supplies the codec to both the materializer and the audit tools. The local image built after the full web typecheck passed on the exact isolated revision. The compiled encoder reproduced the private projection and receipt hash in a read-only container with networking disabled. A bare Docker build without the matching typecheck result still encounters scanner fixture imports outside the builder's source set. [Image verification](../../artifacts/daily-scan-audit/runs/20261106-seven-field-web-image/result.json)
- [ ] Review the [AWS ECS runbook](../aws-ecs-deployment-runbook.md), verify the live web revision after authorization, and run the targeted web deploy plan against the validated candidate SHA. The [materialization route](../../apps/web/app/api/internal/scan-score-materialization/route.ts) uses the canonical publisher. Preserve the approved task resources and unrelated feature flags.
- [x] Add and locally verify the default-off switch in the [canonical ECS workflow](../../.github/workflows/web-aws-ecs-deploy.yml). Manual input `audit_privacy_form_receipts=true` sets `CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED=1` on the dedicated materializer. Push deploys and manual deploys with the input omitted or false set it to `0`, including when the prior task definition enabled it. The public web task sets it to `0` in every mode.
- [x] Correct the [v10 prompt](../../artifacts/daily-scan-audit/audit-prompt.md) to reference [procedure v15](mac-mini-audit-progress-procedure.md) and review its changed source hash locally.
- [ ] Recheck the active source hashes against the exact candidate and preserve the review receipt before authorizing acquisition. Keep the retained-only schedule in place during preflight.
- [ ] Recalculate the incremental persistence, task time and compressed log volume using expected eligible reports and current usage. The prior audit plan is $1.13 per 31 days against a $5/month envelope. Add the receipt estimate, record it before paid work, and obtain explicit owner approval if the incremental estimate reaches $1/month. Escalate a total beyond the existing envelope before proceeding.
- [ ] After producer approval, set `audit_privacy_form_receipts=true` on the manual workflow dispatch. Verify the active materializer task definition, image digest and flag, then record the UTC time the enabled writer fleet is healthy. Define the forward verification cohort using scans created at or after that time. Wait for ordinary scan-bot traffic to produce ready reports under the existing schedule.

## Homepage geolocation fix

- [x] Include the homepage geolocation fix in the web release candidate. The defaults endpoint now returns `homepageLocation` independently of `scanFrom`, so session cookies can suppress a scan suggestion while the homepage still uses the visitor's region for its copy. [Defaults endpoint](../../apps/web/app/api/public/scan-defaults/route.ts) · [Homepage preferences](../../apps/web/components/marketing/homepage-scan-preferences.tsx)
- [x] Verified all four cases in local Chromium against the current source with no `loc` override. The browser fixture ran the homepage preferences component and the actual defaults handler with controlled country headers and synthetic session cookies. Each case checked the rendered audience line, the endpoint response, and the selected scan region. The fixture fulfilled requests locally and submitted zero scans.

  | Visitor | Rendered homepage copy | Endpoint scan suggestion | Local result |
  | --- | --- | --- | --- |
  | US, signed out | CCPA first | California | Pass. California selected. |
  | US, signed in | CCPA first | `null` | Pass. Fixture's existing Ireland selection preserved. |
  | Outside the US (GB), signed out | GDPR/ePrivacy first | Ireland | Pass. Ireland selected. |
  | Outside the US (GB), signed in | GDPR/ePrivacy first | `null` | Pass. Fixture's existing Ireland selection preserved. |

- [x] Repeated the four cases on the exact optimized Next.js build, including both URL overrides, manual choice with a late defaults response, and the missing-country fallback. [Browser log](../../artifacts/homepage-claude-release-candidate-20261106/homepage-browser.log)
- [ ] After deployment is separately authorized, repeat with representative US and non-US connections and signed-in and signed-out browser profiles. Inspect the defaults response and rendered audience line without submitting a scan.

## Homepage sample report freshness

- [x] Include the homepage sample report fix in the web release candidate. The hero, Findings overview and lower-page sample buttons all use the same regional lookup for signed-in and signed-out visitors. Links attached to specific carousel evidence still point to the scans that produced it. [Sample button](../../apps/web/components/marketing/sample-report-button.tsx) · [Sample request handler](../../apps/web/server/scans/sample-report-request.ts)
- [x] Verified locally with controlled requests and a stubbed scan service. A completed report within 24 hours reuses its scan ID, including at the exact boundary. An older report triggers one fixture refresh. Repeat clicks join in-flight work, and an unsuccessful attempt keeps its existing cooldown. Tests submitted zero live scans.
- [x] Verified all three placements in local Chromium for signed-in and signed-out browser fixtures with US and GB country headers. The fixture ran the actual homepage, request route and resolver with synthetic session cookies, scan records, and a stubbed database lock and scan launcher. All 12 combinations reused their 23-hour-old report. After aging those reports to 25 hours, six concurrent clicks per region yielded one refresh and five joins, including a successful retry after lock contention in each region. All 12 combinations reused the new report after simulated completion. Report and progress destinations were served locally with zero external requests or live scans.
- [x] Repeated all 12 combinations on the exact optimized Next.js build. Each region reused its recent sample, queued one fixture refresh after staleness, and joined that refresh on the other five clicks. All 12 combinations reused the simulated completed result. The compiled route and resolver ran with fixture database transport, scan launcher and report destinations. [Browser log](../../artifacts/homepage-claude-release-candidate-20261106/homepage-browser.log)
- [ ] After deployment and live verification are separately authorized, record the web revision, returned scan IDs and completion timestamps. Preserve the existing regional refresh and anonymous quota limits.

## First authorized production audit

- [ ] Confirm the owner-approved run and its cutoff. Verify the existing Mac mini archive share before paid work. Freeze the preceding-calendar-month window, actual cutoff, prior snapshot and cache receipts. Run the local pending planner in v15 and record every starting queue ID and its ancestry. The reviewed baseline is 108 pending exports. Reconcile the actual queue at run time, target at most 100 in the same query, and carry the rest with their receipts. With 108 in-window IDs and 100 selected, 8 defer.
- [ ] In the fresh run's `begin.json`, set `includePrivacyFormReceipts` to JSON boolean `true` and use the exact `pendingRefreshIds` from the plan. Before calling the exporter, use the local sizing check below with the actual dates, ID list and configured ECS container name. Require a fitting variant that includes the receipts and all planned IDs. Optional operations evidence may be omitted. If the receipt variant cannot fit or the window exceeds eight days, stop and record the reason.
- [ ] Run [the exporter](../../scripts/export-mac-mini-delta.ts) once through the authorized audit. Keep the existing SELECT-only transaction, 5,000-row limit and 45-second timeout. Save the transport receipt, task and query hashes, and `delta-inventory.json`. Check `privacyFormRequested=true`, `privacyFormProjected=true`, and absence of a receipt transport omission. Recover output from the same task if interrupted. Use exact UUID archive paths and verified cache reuse, then reconcile targeted, deferred, rechecked, recovered and remaining IDs.
- [ ] Run [the manifest preparer](../../scripts/prepare-audit-opt-out-inputs.ts) with the prior dashboard, current inventory and fresh `opt-out-inputs.json`. Carry prior hash/size receipts and complete `retainedReports` ancestry, including the November 1 recovery source. Pass this manifest as argument seven to `audit-progress-month.ts`. Build the immutable candidate using the shared engine.

### Local launch sizing

From the repository root, set `RUN` to the fresh run directory. This check builds and sizes the SQL locally.

```sh
TSX_TSCONFIG_PATH=apps/web/tsconfig.test.json node --import tsx - "$RUN/begin.json" <<'NODE'
const { readFileSync } = require('node:fs');
const { buildAuditDeltaQuery } = require('./scripts/lib/audit-delta-query.ts');
const { auditSqlOverrideFits } = require('./scripts/lib/audit-prod-db-bounded.ts');
const { verifyProgressPins } = require('./scripts/lib/audit-progress-pins.ts');
verifyProgressPins();
const begin = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (begin.includePrivacyFormReceipts !== true || !Array.isArray(begin.pendingRefreshIds)) {
  throw Error('Receipt opt-in and planned pending IDs are required');
}
const results = [true, false].map(includeOperations => ({
  includeOperations,
  ...auditSqlOverrideFits({
    marker: 'MACMINI_DELTA_IDS',
    readOnly: true,
    sql: buildAuditDeltaQuery(begin, includeOperations, true),
  }),
}));
console.log(JSON.stringify({ pendingIds: begin.pendingRefreshIds.length, results }));
if (!results.some(result => result.fits)) process.exitCode = 1;
NODE
```

## Acceptance, publication and rollback

- [ ] Reconcile the forward cohort by Los Angeles date and report generation. Track original-creator scan-bot IDs, ready reports, reportable exact exports, delivered projections, `delivery: delta_inventory` receipts and matches in the dashboard. Exclude canaries, tests, internal traffic and terminal publication failures. Keep pending exports, source absence, size bounds, and per-field unavailable reasons visible. Report retained-history and local-list receipts separately from this run's delivery.
- [ ] Trace the same IDs through the inventory, materialized receipt and dashboard. Check scan time, original creator, ready generation, report source and payload hashes, original bundle and manifest hashes, and receipt hash/size. Require at least one source-backed forward example for each field across eligible scans. Record field coverage individually.

  | Assessment or inventory | Fields to verify |
  | --- | --- |
  | California privacy review | Assessment and coverage |
  | Privacy disclosures | Rights, notice at collection, and sale/sharing assessments |
  | Initial passive form inventory | Field semantic category and form destination relationship |

- [ ] Preserve observed, unknown, unavailable, and verified empty inventories as distinct states. A verified empty inventory can show the form feed works, while a scan with retained form records is needed to verify category and destination values. If the cohort is empty or a field lacks a qualifying example, record that field as production verification pending. Report `ecs_launch_override_limit`, `inventory_size_bound`, and per-row `size_bound` separately.
- [ ] Require passing focused tests and strict types with log hashes and exit codes, file-only desktop/mobile/filter/chart/CSV checks, and the independent `choiceEvidence` and master value parity gates. Check that the existing customer export contains no private receipt. Use only the validated publisher and verify both latest pointers. Save the prior snapshot, actual cutoff, counts, omissions and actual task/cost receipt.
- [ ] If integrity or validation fails, preserve prior latest and the failed run's evidence. If delivery is missing or materially incomplete, leave production verification open and keep further acquisition under the approved schedule and scope. On a confirmed producer regression, use the reviewed disable setting through the canonical ECS workflow and suspend the query opt-in. Keep existing receipts and ledgers intact. Any ongoing acquisition schedule needs explicit authorization.
