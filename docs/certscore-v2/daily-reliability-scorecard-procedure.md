# CertScore.ai daily reliability scorecard

Module version: `certscore.daily-reliability.v1`.

This mandatory audit module uses ordinarily occurring production evidence already
retrieved for the daily audit. It performs no network access, scan, browser visit,
model call, deployment, flag change, product write or historical report rewrite.
Incremental AWS and paid-service usage is $0. Small sanitized local JSON/CSV files
use the existing audit artifact storage policy; no paid retention is extended.

## Priorities and populations

1. Accept/Reject identification unknowns, preserving Options and privacy-opt-out
   separately. Rank source reasons such as incomplete inventory, unresolved visible
   decisions, frame/language limitations and document identity. Reasons overlap;
   their totals are not an additive population count.
2. GPC observation, delivered header and navigator proof, paired comparison,
   semantic readback, sale/sharing state, request proof and body-format gaps.
3. CMP recognition, optional worker profile/dispatch, retained passive inventory
   and per-check Not assessed/Incomplete outcomes. An intentionally omitted worker
   is not an execution failure and supplies no denominator for worker success.

The full area inventory also includes separate Accept/Reject execution,
post-choice activity, explicit sale/sharing opt-out, privacy links and hidden
controls/frames, policy capture/disclosure, vendor classification, runtime
representativeness and publication/evidence continuity. Unimplemented semantic
checks remain explicitly not checked. Use the existing primary mechanical and
policy modules for canonical interpretation and source-verified finding review;
this module does not implement a second scoring or finding engine.

Keep all inventoried attempts in the source accounting. The headline scorecard
uses ordinary production traffic only. Routine canaries, explicitly internal/test traffic, local diagnostics,
and unclassifiable traffic are counted separately. The v1 classifier requires a
production dispatch, a supported production source and an actual retained URL;
the exact routine canary path and explicit traffic labels are excluded. Missing
or invalid original evidence stays unclassified unless independently classified
by a future explicitly versioned adapter. Never silently call it ordinary or
discard it from inventory completeness. A new source/profile/format needs an
explicit adapter, not an empty-cohort fallback.

Report distinct denominators for attempts, completed captures, canonical readable
reportable scans, no-go scans, verified action packets, completed clicks, and
optional dispatched CMP workers. Reportable control unknown rates use the
persisted internal assessment, not the binary customer display. Missing control
fields are Not checked, not verified absence. Failed/unreadable projections stay
in the reportability-unknown/accounting bucket; they cannot improve known rates.
GPC gap rates require explicitly enabled dispatch and separate reportable/no-go
and runtime-coverage groups. Missing or disabled dispatch is not an enabled-path
failure. Most gaps on unavailable sites must not be presented as missed findings
on otherwise usable captures.

Control discovery and action lanes have independent sessions. Their counts are
not a strict conversion funnel. A completed click does not establish registration,
and confirmed registration does not establish effective enforcement. Unknown
registration must not veto independently supported EU Reject presence or other
approved post-choice findings. GPC completeness never means GPC honoring. Hidden
source links are not visible/actionable controls; finding a link is not proving
its destination or operation. CMP identity is not action/recipe support.

## Run within the existing evidence-first audit

Work in `/Users/benmasek/WC01` with Node 22–24 and pnpm 10.6.3. Read
`artifacts/daily-scan-audit/reliability-scorecard-activation.json` and verify its
pinned tool hashes before invoking the module. Do not switch checkout, install
dependencies, retrieve extra evidence or patch product code during a scheduled
audit to make the module run. If unavailable, save that component as blocked and
carry its work without claiming a completed scorecard.

The v1 input adapter consumes the existing primary run's:

- `work-inventory-v2.json`: unique new-interval attempts with original retained
  event pointers/hashes, dispatch configuration, source, status and timestamps.
- `evidence-retrieval-receipts.json`: original bundle, manifest and A/R packet
  receipts. URI/hash/size must join the original event, not a self-hash alone.
- `support-retrieval-receipts.json`: available original shard-summary receipts.
- `gpc-retrieval-receipts.json`, when present: worker files rechecked against the
  original canonical comparison's hash/size/source binding, not self-fingerprints.
- Existing `scans/<id>/persisted/snapshot.json`, read only after both source seals.

These are the same local inputs used by the primary/policy audit; their absence
does not authorize extra cloud requests. Missing support/worker receipts leave
those measurements unavailable. Corrupt receipts, ambiguous sources or source
drift are integrity limitations/audit failures for triage, never clean passes.
The adapter rejects duplicate IDs and records outside the explicit frozen new
interval. Prepare an explicit new-only input view when a future export includes
overlap/carried verification work; preserve its mapping and original receipts.
Do not modify a completed source run to adapt its format.

Choose a fresh sibling output directory under the same absolute `runs/` directory.
Observe source coverage after existing retrieval and before reading generated
findings/scores. Preserve the main independent semantic Pass A and its selection.
The mechanical source seal does not replace independent review; bundles already
expose derived coverage fields, so full blinding is not claimed.

```sh
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json scripts/daily-reliability-scorecard.ts observe \
  --run "$RUN" --out "$RELIABILITY_OUT" --invocation scheduled \
  --primary-run-id "$PRIMARY_RUN_ID" --window-start "$START_UTC" --window-end "$END_UTC"

# After the main independent Pass A has been saved and sealed:
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json scripts/daily-reliability-scorecard.ts score \
  --out "$RELIABILITY_OUT" --primary-pass-a-seal "$RUN/pass-a-seal.json"
```

The primary seal contract is `{file, sha256}` referencing a retained observation
file inside the source run. Score uses the existing canonical persisted reader
after verifying the seal. It does not repair missing fields or rewrite snapshots.
For local/manual validation use `--invocation manual_validation`; it counts as
zero scheduled invocations and cannot establish a daily trend.

Outputs are immutable `reliability-pass-a.json`, its seal, per-scan JSON/CSV,
`reliability-scorecard.json`, product-source fingerprints, review candidates and
final seal. The summary includes explicit numerator/denominator definitions,
null zero-denominator rates, row counts by CMP check, reason counts and strata.
Available lane latency p50/p95 use coordinator-observed elapsed milliseconds;
publication latency uses actual completion-to-projection timestamps. Missing or
nonmonotonic timestamps are unmeasured, never zero. Worker-reported durations
remain distinct. These distributions are descriptive and not a speedup claim.
Keep the complete files locally even if the user-facing result is quiet.
Never overwrite a completed output. Preserve interrupted partial output and use
a fresh recovery directory, retaining its relationship to the original attempt.

## Comparisons, review and notifications

Pass `--previous <prior-output-directory>` only for a sealed earlier module with
the same methodology. The comparator rejects manual/same-invocation or overlapping
windows, excludes repeated scan IDs, and compares only known matching producer,
region, profile, provider, source, assessment and projection strata. It reports
descriptive rate differences and unique-site denominators, never causal accuracy.
A new revision or absent comparator is a baseline, not an improvement. Preserve
zero-exposure/null comparisons. Use up to seven compatible scheduled summaries
in the narrative; do not pool unlike populations into a fleet accuracy number.

Supplement these coverage counts with the primary sealed review's already
available expected/actual finding dispositions and release-watch trigger/control
results. Precision/recall remains null without a separately adjudicated reference
set. A fall in Unknown or Not assessed counts is a resolved measurement only when
source evidence explains it; movement to Incomplete or an omitted worker is not
recovered coverage. Never relabel unknowns, suppress limited scans or change the
sample to make the scorecard improve.

Use ranked candidates to prioritize the existing anomaly/targeted review work:
Accept/Reject unknowns first, GPC gaps second, dispatched-but-limited CMP details
third. Preserve the independent random sample and the policy module allocation.
Group recurring candidates by first broken stage/root and evidence reason;
do not automatically create one defect or deep-review backlog item per unknown.
Keep candidate counts and actually reviewed cases separate. An actionable
unreviewed anomaly belongs in the existing outstanding work queue under the
primary scheduled transaction, with stable scan/source references. No new
mutable checkpoint, invocation counter or competing root-cause backlog is added.

Include the three priority summaries, denominators, major reason groups,
eligible deployed-version trigger results and module path in every saved daily
report. Alert only meaningful confirmed defects/regressions, material impact
changes, verified fixes, audit failures or required action. Unchanged coverage
gaps remain quiet. ReadCube/Gimbal holds, passive CMP boundaries, ordinary-only
verification and all existing costs/permissions remain unchanged.
