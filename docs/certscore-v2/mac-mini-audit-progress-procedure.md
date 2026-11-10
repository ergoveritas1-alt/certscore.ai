# CertScore.ai Mac mini audit progress

Procedure version: 2026-11-06.v15. Module: `certscore.mac-mini-daily-progress.v5`. Acquisition: `certscore.mac-mini-direct-delta.v1`.

This audit-only supplement is owner-authorized for the existing daily audit. It
uses the preceding calendar month, grouped by America/Los_Angeles date. Partial
days and retained-export samples are allowed. It does not change the audit
schedule, model, checkpoint, backlog, release watch, scoring or production data.

## Evidence and cohort

The default daily job is the focused data/dashboard refresh described in the
audit-state audit-prompt.md. Reuse already sealed audit inputs; do not initiate
a new full audit or deep review just to refresh the table. The dashboard
summarizes returned canonical assessments/findings and cannot create a finding
or close an issue. During an explicitly requested full audit, retain its
source-first Pass A before generated-output comparison.

Use the Mac mini's `/Volumes/miniben/CertScore/evidence` archive as the historical
source, copying bounded JSON files locally. Preserve originals. Do not copy or
query the live multi-gigabyte SQLite database, open target sites, launch scans,
request another model review or fetch missing historical report exports.

Create a fresh cache manifest for each frozen interval. Reuse the preceding local
cache with `--reuse` to hard-link unchanged files and avoid duplicate local bytes.
The copier validates embedded creation dates, identities, byte bounds and hashes;
mtime with a two-day cushion is discovery only, not proof of complete inventory.
Missing timestamps, unavailable files and discovery limitations stay explicit.
Never overwrite a sealed manifest. A stale reused export is historical evidence;
a generation mismatch must remain unverified rather than replacing the original.

Exclude canaries, synthetic/internal traffic, known owned test targets and other
verified origins before denominators. All owned ergoveritas.com archive exports
are excluded. Original creator credentials, not the API client that later reads a
report, identify the independently verified Mac mini subset. Use the canonical
original-request SQL and key-name registry in `scripts/lib/audit-bot-origin.ts`.
Historical archive-folder provenance and original-credential proof remain separate
and filterable. Do not claim independently verified original ownership for an old
folder export. Never treat unknown origins as verified bot attempts.

Recent sealed audit inventories add failed, no-go and missing-export attempts.
Verify the Pass A seal, original receipt hashes/sizes/event pointers, scan identity,
persisted report checksum and exported projection generation. Deduplicate scan IDs
across overlapping audits and archive files. A complete calendar day requires a
complete inventory interval and original-request export for that inventory. Other
days are samples; no retained export does not mean zero scans or failures.

## Measures and interpretation

Report exclusive complete/limited/no-go/failed/publication/in-progress outcomes;
Accept/Reject/Options/opt-out observed, not observed, unknown and not checked;
click completion, verified execution and choice registration separately; privacy
link, original fetch, verified full-text bytes and producer-declared owner/role;
each of the ten returned GDPR transparency topics; GPC observation, delivery and
explicit canonical findings; accessibility coverage and each accessibility finding;
CMP recognition, optional dispatch and returned individual checks; publication and
export integrity; and every other returned canonical finding ID separately.

Keep intentionally omitted CMP work separate from failure. Do not infer GPC
honoring, successful choice registration or substantive governing-policy capture
from a link, provider name, click or missing finding. Missing historical fields
are unavailable; only an explicit not-checked state is called not checked. Preserve historical policy versions and returned finding IDs.
Historical top/headline selection is unavailable, not zero. Truncated finding
inventories cannot supply a no-finding denominator.

Show every state as count/eligible denominator and percent, with change from the
immediately preceding calendar day in percentage points. Partial samples also
show changes, explicitly descriptive. Empty denominators produce null, never zero
percent. Report sample counts, sites, regions, inventoried hours and available
producer/profile/assessment/projection versions. Preserve gaps. Changes in sites,
capabilities, schema or versions can explain changes; these are not adjudicated
accuracy, legal compliance or causal repair measurements.

Fix verification comes only from the existing issue ledger and release watch.
Keep replay, deployment and eligible ordinary production exposure distinct. In
particular preserve October 23 fix gates and the separate C2 diagnostic/protocol
coverage boundaries. Do not close issues based on chart direction or deployment.

## Inputs, command and outputs

Prepare `run-inputs.json` as an array of `{path, runId}` for compatible retained
audits overlapping the month. Each run requires `begin.json`, `pass-a-seal.json`,
`work-inventory-v2.json`, original retrieval receipts and already-local artifacts.
Use the actual begin `auditEndUtc` when no `windowEndUtc` exists. Do not substitute
the start time or advance another inventory cursor.

The origin file is `certscore.audit-bot-origin.v1`, with `readOnly: true` and one
row per exported scan ID: originalRequestId, originalRequestedAt, isMacMini,
isCanary and publicationRequestStatus. Reuse retained origin rows. Include new
origin facts in the already-budgeted primary read-only export when available;
the helper SQL can run in that same connection/task. Do not automatically launch
the standalone origin exporter or another cloud task for this dashboard. Missing
origin proof remains excluded/unverified and makes interval coverage partial.

Example, from `/Users/benmasek/WC01`, using explicit frozen times and fresh paths:

```sh
python3 scripts/cache-mac-mini-evidence.py --exports-only \
  --source /Volumes/miniben/CertScore --out "$NEW_CACHE" \
  --start "$MONTH_START_WITH_OFFSET" --end "$FROZEN_END_WITH_OFFSET" \
  --reuse "$PRIOR_CACHE"
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json scripts/audit-progress-month.ts \
  "$RUN_INPUTS" "$ORIGINS" "$NEW_CACHE" "$FRESH_RUN_OUTPUT" \
  /Users/benmasek/WC01/artifacts/daily-scan-audit/issues.json \
  /Users/benmasek/WC01/artifacts/daily-scan-audit/release-watch.json
```

Clamp the start to one calendar month before the frozen end (not all available
history). Never claim refreshed Mac mini coverage when the mounted source is
unavailable. Preserve the prior output and record the new component as partial or
blocked with the reason; do not interfere with the primary audit transaction.

Save immutable `dashboard.html`, `dashboard.json`, `daily-metrics.csv`, exclusions,
source/ output hashes and a summary under the existing audit `runs/` directory.
The self-contained dashboard performs no network requests. Its nested sealed
audit view remains available separately. Verify generated counts, nulls, state
deltas and filters; link the dashboard from the daily summary. Keep unchanged,
non-actionable results quiet under the existing notification rule.

Local copying/charting adds $0 in paid cloud or model usage. A one-time bounded
origin lookup for initial validation reserved $0.02 from the existing $5/month
audit envelope. Future origin facts must reuse/batch the existing primary export;
reserve at most $0.01/month for its marginal query work and recalculate the whole
audit forecast before paid work. No new task, service, paid retention or scheduled
model calls are authorized by this supplement.

## Validation

Use the focused Node tests in `scripts/lib/audit-progress.test.ts`, the cache tests
in `scripts/cache-mac-mini-evidence.test.py`, a focused strict TypeScript check and
an offline browser check of desktop/mobile rendering, state/region/origin filters,
evidence drill-down and CSV download. Production access is unnecessary.

## V2 correction and retained review

The v2 mixed-source control precedence is superseded by v6 below. Preserve
old outputs as historical artifacts. Public first-layer observations, public
checklist evidence/verdicts and sealed assessments now have separate metrics.
Never supplement a public metric from a sealed assessment, including missing fields. Accessibility result availability,
manual-review items and omitted bounded examples are separate metrics. Null rule
counts never become measured zero. Empty-day CSV percentages remain null.

After the source seal, the audit-only `scripts/audit-retained-priorities.ts` may
consume the same run-input/origin files and already-local original action/GPC
receipts into a fresh retained-review output. It ranks confirmation reasons and
unsupported exact protocol endpoints without new findings, decoder assumptions,
raw-body retention, cloud reads or calls. Original canonical comparison URI/hash/
size and worker/parent identities must join before including worker metadata.
A body hash or field-name list cannot recover a production payload. Keep C2
diagnostics verified separately from unresolved decoder/qualification coverage.


## V3 detailed-evidence coverage

Preserve all prior outputs and the corrected v2 measures. V3 adds every returned
canonical checklist ID not already mapped to an existing measure, retaining its
returned status. In particular, a connection-security row may have observed
supporting evidence but a `Gap observed` status; do not turn that into a positive
check. Include returned negative, concern, unknown, unavailable and not-checked
states separately. New or missing historical checks remain explicit rather than
being treated as passes or failures.

Include A/R verdicts, projectability, stop and indeterminate reasons; GPC response,
semantic probe, acknowledgment and recorded sale/sharing states; forms count and
capture coverage; storage classification; inventory caps; and final-host changes.
These remain descriptive returned assessments, not new findings or legal
conclusions. Count variables require explicit nonnegative integers; null is not
zero. Show daily medians with measured/eligible denominators, totals in a separate
`daily-volumes.csv`, and changes in medians as counts rather than percentage
points. No reportable evidence measures may include failed/no-go attempts.

Recent detailed projections may supplement archive-only exports after supported
typed-schema, scan identity and original canonical-bundle hash checks: site
integrity, technology, form-destination trace, and relationship-graph reference
metadata. The metadata's node/edge counts do not verify deferred graph bytes.
Never request a graph endpoint or fetch missing artifacts for this supplement.
Older missing projections remain unavailable. Keep independent source review
separate from producer-declared ownership, including unresolved DPO attribution.

Save a coverage map for all main detailed-evidence boxes, including fields that
cannot yet be tabulated from the retained exports. California qualification and
protocol support, full opt-out execution, entity attribution and complete
historical inventories remain distinct gaps. No chart can close an issue.

The viewer uses compact lossless state encoding and one master table containing
all state measures, numeric measures and distinct canonical findings, in contiguous
measure groups, with calendar days as columns. Open all groups by default; retain
an optional table group filter. Show state counts/rates directly, count medians
with their own units, and finding rates with complete-inventory denominators.
Use one text block per state breakdown to keep the large table economical. Preserve full machine-readable
JSON and CSV outputs. Check state-specific charts, group/origin filters, lazy
finding tables, CSV parity and mobile overflow. This expansion adds no cloud
queries, model/API calls or incremental paid/recurring infrastructure usage.


## Daily table refresh and stable latest view

Every scheduled dashboard refresh rebuilds the grouped table using already
sealed local audit inputs and the newest eligible Mac mini exports available at
that run's frozen cutoff, a rolling calendar-month window, the current run's
compatible retained inventory and previously sealed audits. Reconcile repeated
scan IDs and changed export generations. Refresh data even when there is no
new actionable defect; the notification rule may stay quiet while the local
snapshot advances. This is not a second scan/audit schedule.

The cache copier records source size, mtime and ctime. Reuse prior bytes only
when the source metadata is unchanged and cached bytes match the prior receipt,
or after newly read source bytes verify the same digest. Otherwise retain the
changed source in a fresh cache file. Legacy caches without source signatures
require one source read before reuse. Use at most eight metadata readers and
eight copy readers, preserving all file/window bounds and read-only access.
Never overwrite an earlier cache or report. Metadata reuse is labelled separately
from a fresh source-byte read. A changed-during-read source stays unavailable.

After source/output validation, publish the new immutable run using:

```sh
python3 scripts/publish-audit-progress-dashboard.py --run "$FRESH_RUN_OUTPUT"
```

This verifies output seals, cohort, cache freshness and a non-regressing cutoff,
then atomically updates the local `artifacts/daily-scan-audit/latest` symlink and
`progress-dashboard-latest.json`. It records a publication receipt in that run.
This pointer is a viewer location, not an inventory checkpoint or issue ledger.
Keep old runs immutable. If refresh/validation fails, preserve the previous latest
view and save the partial/blocked component with its actual available cutoff.
Never call missing data zero, fetch missing detail endpoints or launch another
cloud query for this supplement.

The existing local HTTP preview should serve the `latest` path so that reloading
the same dashboard URL opens the newest published table. A page already open is
its loaded snapshot until reloaded. No daemon, extra cron, new automation, paid
service, deployment or production mutation is introduced. Link the stable view
and immutable run from each daily summary. Preserve the 5:00 a.m. Los Angeles
schedule, actual model/reasoning, checkpoint, backlog and model-transition ledger.


## Focused incremental policy — owner direction

The default schedule now performs data acquisition and dashboard maintenance
only. Preserve cached prior-day history. For terminal exports older than the
prior cutoff minus 48 hours, verify/reuse the local cached bytes without remote
metadata or content reads. Recheck metadata only for recent entries and explicit
pending IDs; fetch bytes only for new/missing/changed files. Use --refresh-ids
with a bounded JSON list of retained pending scan IDs when needed. Historical
reuse is labelled historical_cache_verified and is not a claim of a current
source reread. Preserve those historical versions rather than refreshing them
through today's report code.

A lightweight filename listing discovers new files. Persist known-old names and
outside-window creation dates so later runs skip repeat metadata work for them.
A legacy cache may need one metadata catalogue bootstrap; disclose it, do not
silently recopy the historical exports. Duplicate filenames from a live mounted
listing must be counted once; conflicting source receipts fail validation.

Routine extra work is limited to integrity, freshness, exclusions and table
consistency. Broad production audits, deep policy review, reliability/root-cause
investigations, release/fix verification and product tests are opt-in work.
List proposed extra activities for the owner instead of starting them. The
previous full procedure is retained separately and is not run automatically.


## V4 registration semantics and PDF source coverage

Registration uses the retained initial semantic status, including aborted. Legacy
confirmed_clean/confirmed_observation results map to confirmed. The operational
execution.consentConfirmed flag cannot establish initial registration. Public and persisted registration are now separate series under v6; neither
overrides the other. Missing historical semantic evidence remains unavailable.

Terminal decision verification is a separate measure. Require the retained typed
witness, authorized target/action binding and completed after-action window;
missing witnesses stay unavailable. Later confirmation never backdates initial
registration or promotes evidence into the post-registration interval.

New PDF captures retain policy_pdf_source_coverage.v1: total/extracted pages, the
unchanged 12-page/500,000-character limits, truncation and complete/partial/unknown
source coverage. Complete retention of the extracted string does not establish
whole-PDF coverage. Unobserved topics require complete source coverage before
absence review; positively bound complete sections remain usable. Legacy records
keep their original metadata and semantics. No source PDF is fetched to fill a
historical gap. These local product changes require separate deployment.

The correction rebuilds only the local aggregate dashboard from already sealed
inputs. It does not rewrite customer reports, advance inventory or close issues.


## V5 direct ID delta acquisition — October 28 owner direction

This section supersedes filename enumeration/catalogue acquisition for the daily
refresh. The existing grouped metrics, evidence semantics and publisher remain.
Use one bounded read-only production original-creator ID inventory, then exact
archive filenames. Do not enumerate the evidence directory or bootstrap a full
metadata catalogue. This was owner-authorized after the SMB catalogue was stopped.

The run's begin.json supplies windowStartUtc/windowEndUtc, overlapStartUtc (prior
cache end minus 48h), newScanStartUtc (prior cache end), priorCache and priorSnapshot.
Run `pnpm exec tsx --tsconfig apps/web/tsconfig.test.json scripts/export-mac-mini-delta.ts RUN`.
It uses the existing AWS psql one-off topology, a read-only transaction, canonical
original-creator/key-name logic, max eight days/5,000 rows and 45-second statements.
Save query hashes, transport/task receipts and delta-inventory.json. The daily
export retries transient status reads for the exact recorded task for up to
three minutes. After a process interruption, reuse an existing inventory or
run the same command with `RUN --recover` if the run contains its started-task
receipt. Recovery reads the existing task and verifies its output checksum.

The same daily query projects a private California Reject qualification receipt
from the ready report's existing typed assessment. It carries the policy,
status, scope, truncation flag and distinct request reason codes. The receipt
requires a completed click, scan identity and matching packet and target hashes.
The audit reader also requires the original creator selection and matching report
generation. Missing or unbound evidence stays unavailable. Keep this field in
every launch variant. The planner may omit optional operations and control
accessibility to fit the existing 100-ID budget, and records those omissions.
The receipt adds no capture, request, or separate query.

Run `python3 scripts/cache-mac-mini-delta.py --source /Volumes/miniben/CertScore
--out FRESH_CACHE --start MONTH_START --end CUTOFF --reuse PRIOR_CACHE
--inventory RUN/delta-inventory.json` (one shell line). Only new/missing or
potentially changed UUID files are checked remotely. Stable retained canonical
generation plus an unchanged production update time may reuse recent local bytes;
older history is also locally hash/size verified. The receipt distinguishes these
from fresh source metadata/byte reads. Production microsecond timestamps join
public-export timestamps at their documented millisecond precision, with exact
scan identity and hashes retained. A different millisecond still fails binding.

The ID inventory proves source selection, not complete historical coverage or
independent review of raw evidence. Keep its original-creator receipt separate
from archive provenance; do not promote new detailed evidence or findings from
this metadata. Continue using compatible prior sealed audits for the detailed
original-credential-verified dashboard subset. Missing exact exports remain
explicitly unavailable; never use API regeneration, raw S3 bulk retrieval or new
scans to fill them. Preserve partial days and all unknown states.

The owner also authorized adopting this route for subsequent daily refreshes
after successful validation. Estimate $0.02/run, $0.62/31 days, within the existing
$5 monthly envelope and below the $1 incremental recurring approval threshold.
Record actual run estimates; no other cloud work, model calls, public visits,
actions, production writes, deployments, retention or capacity changes.


## V6 metric contracts and publication gate — October 28

This section supersedes earlier source precedence, missing-field and trend rules.
The audit-only contract is `certscore.audit-metrics.v1` in
`scripts/lib/audit-progress-contracts.ts`; each snapshot includes
`metric-contracts.json`. It specifies each metric's meaning, eligible population,
numerator, denominator, source field, mapping and supported versions. It covers
all state measures, counts/medians and exact canonical finding IDs.

- `control.accept/reject/options` means captured pre-interaction first-layer
  presence. Its numerator is **observed only**. A complete negative inventory
  supports not_observed; incomplete negative or null remains unknown. It does not
  measure rejection success. Public opt-out presence is unavailable where not exported.
- `checklist.*`, privacy-notice and GDPR topics preserve evidenceState/evidenceLabel,
  including partial_concern, potential_gap, not_confirmed and not_testable.
  `verdict.*` preserves status separately. Neither field falls back to the other.
- `sealed.*` metrics preserve independently source-bound assessments. They never
  overwrite public values, even unavailable ones. Public and sealed execution,
  initial registration and terminal verification stay separate. Public GPC uses
  readable reportable scans including unavailable fields; sealed GPC retains its
  explicit-enable population. Provider recognition is not action confirmation.
- Missing fields/files are unavailable; explicit null is unknown. Explicit
  not_checked remains distinct. Quantities require nonnegative integers, retain
  measured zero, show missing/eligible totals and calculate medians only among
  measured eligible rows. Explicit nonrequired accessibility stays excluded.
  Deferred graph metadata and inline graph counts have different series.
- Exact canonical findings keep returned IDs. Only coherent complete inventories
  enter prevalence denominators. Positive findings in incomplete inventories
  remain separately visible. Missing top-selection data is unknown, including
  days with zero returned findings. No new findings, policies or scores are made.
- All rates, medians and deltas are source/schema qualified. Known public v4/v5
  and projection v26/v27 remain separate; new versions fail closed for review.
  Engine/scope and action schema differences remain separate. Mixed aggregate
  rates/deltas are null, with per-source detail. Unknown/unversioned series have
  isolated points and no deltas. Empty dates break lines. Partial samples remain
  labelled and same-source partial-day deltas are descriptive only.
- Missing exact UUID files represented in the retained production ID receipt stay
  visible as ID-selection-only attempts, without detailed-evidence verification
  or reportability. No new query, archive enumeration or report regeneration is
  permitted to fill these gaps. Existing detailed-origin proof stays separate.

The shared pure `audit-progress-engine.ts` powers saved aggregates, the viewer,
filters and all three CSVs (states, volumes, canonical findings). Do not add a
separate browser formula or an unreviewed source fallback.

Before each build, `audit-progress-pins.ts` verifies activation source hashes and
contract/module versions. Preserve prior pins/activation receipts when making an
owner-authorized change; do not silently repin changed tools during a refresh.
For a daily refresh run the focused audit-tool tests (progress, contracts, table,
evidence, publisher and direct-delta acquisition), never broad product suites.
Record successful exit codes and log hashes in a local test receipt.

Build a fresh snapshot with `audit-progress-month.ts` using the retained inputs.
Run the file-only browser check:

```sh
node scripts/validate-audit-progress-browser.mjs FRESH_DASHBOARD
node --import tsx scripts/validate-audit-progress-dashboard.ts FRESH_DASHBOARD TEST_RECEIPT_JSON
python3 scripts/publish-audit-progress-dashboard.py --run FRESH_DASHBOARD
```

Browser validation checks desktop/mobile, chart tooltips/source boundaries,
popovers, filters and byte-identical CSV downloads with external traffic blocked.
The data gate recomputes all aggregates/CSVs, checks contracts, denominator
conservation, unique IDs and ID-only evidence boundaries. Its receipt binds the
sealed snapshot. The publisher requires both this receipt and unchanged source
pins before replacing latest. Never publish a failed or unvalidated snapshot.
Retain immutable reconciliation by day/source whenever semantics change; routine
refreshes compare under the same contract and report unexpected cohort/source
changes without pretending they are verified production improvements.

Acquisition remains v5: one bounded read-only ID query, exact UUID paths, verified
local reuse, no full archive enumeration. Schedule/model/reasoning/project/cost
limits and unique invocation accounting are unchanged. This local correction and
validation add $0 recurring cloud cost; the approved daily ID-query estimate
remains $0.62 per 31 days within the existing $5 envelope.

## Opt-out export coverage — November 1

The Controls group places `control.privacyOptOut` (public export) beside
`sealed.control.privacyOptOut` (retained assessment). Older public v4/v5/v10
exports display **Not exported** when every eligible value is unavailable;
the underlying states, denominators and CSVs remain unchanged. Missing modern
evidence and measured zero retain their own meanings. The retained assessment
is never a public fallback.

The locally reviewed `pulse-public-v11/scan-report-projection-v27` pair adds
canonical `privacyOptOutControlObserved` and opt-out-specific
`privacyOptOutControlInventoryComplete` under firstLayerConsentChoices. Consume
only captured pre-interaction first-layer facts. True supports observed; false
requires its independent complete inspection; null/incomplete facts stay unknown;
missing stays unavailable. Legacy exports keep their historical interpretation.
No raw-label classification, policy-instruction promotion or action-success
inference is added. Control presence, broader routes/instructions and execution
outcomes are separate measures. Deployment remains separate from this local
implementation and retained-only dashboard refresh.

Preserve prior activation pins and record the reviewed changed pins explicitly.
Reuse the saved cache, acquisition cutoff and original sealed audit inputs;
validate data, file-only browser behavior and CSV parity before publishing a
fresh local snapshot. Do not acquire new data or rewrite historical reports.
See `opt-out-export-audit-coverage-2026-11-01.md` for source and cost review.


## Historical opt-out recovery and forward collection — November 1

The owner requested filling the historical opt-out coverage gap and keeping new
results visible. One bounded SELECT-only AWS task may retrieve the small existing
canonical control projection for the frozen preceding-month cohort. It must use
original creator credentials, the canonical bot-key registry, canary/test
exclusions, a maximum 32-day window, 5,000 rows and a 45-second statement limit.
No source site visit, raw bundle download, report regeneration, historical report
rewrite or production mutation is authorized. Recover started task output rather
than submitting it again.

The immutable `certscore.audit-opt-out-extract.v1` contains only canonical
assessment identity, version, scan/document binding, control results, coverage,
provenance and persisted report generation metadata. It is a small returned
projection, not a full retained evidence packet or a new assessment. Verify the
transport hash/size, canonical field schema, original scan identity/timestamp,
original creator, usable document, report readiness, and exact public-export
projection version/source hash. Unknown remains unknown. Malformed, no-go,
changed-generation and unavailable records stay unavailable. No labels, policy
text, cookies or requests supply a control result.

The extract may supplement only `sealed.control.privacyOptOut`. Its comparison
source is `persisted_control_extract/<projector>/<projection>/certscore.audit-opt-out-extract.v1`;
existing original sealed results retain their source. Never overwrite a public
state, finding, score, origin-proof eligibility or completed-action measure.
Authenticated database projection transport is distinct from full source-bundle
verification and must not be labeled as the latter.

Future acquisition keeps ONE existing daily ECS query, adding the same bounded
`control_assessment` projection to its original ID metadata. No extra cloud task
is needed. After the current query succeeds, run:

```sh
node --import tsx scripts/prepare-audit-opt-out-inputs.ts PRIOR_DASHBOARD_JSON RUN/delta-inventory.json RUN/opt-out-inputs.json
```

The manifest carries prior `optOutExtracts` receipts and the current query into
the new rolling-month dashboard. Pass its path as the seventh positional argument
to `audit-progress-month.ts`. The build must reject a missing manifest; validation
rechecks immutable source receipts and exact-generation control joins. Preserve
all sources still needed for the month, rather than reducing coverage to the
48-hour query overlap. Include the preparation/helper/export code and tests in
reviewed source pins and focused audit checks.

Every daily summary must state opt-out assessment availability and unresolved
coverage for new reportable scans. Material new missing coverage is actionable;
it must not be silently shown as a measured zero. No promise of a positive
control or successful opt-out is made. The local public-export v11 fix remains
separate; direct retained projection collection keeps this dashboard current
without requiring that product deployment.

Conservative costs are $0.03 for the one-time recovery and $0.03/daily query,
$0.93 per 31 days. The $0.31/month increment is below the $1 approval threshold
and inside the existing $5 allowance. Record the one-time cost once and preserve
scheduled invocation counts, schedule, model/reasoning, project, checkpoint,
issue/release ledgers and model-transition history.


## Latest-version daily headline — November 1 owner direction

For a day with multiple comparable public-export versions, show the actual
latest-version sample as the cell headline, with its numerator, denominator and
share of the day's eligible sample. Select versions numerically, never by sample
size or best result. Keep unknown/unavailable values inside that version's
population; do not fall back to an older positive value. Preserve all older
versions under source details, original CSVs and separate chart series. Mixed
aggregate rates and cross-version deltas remain null. Different engine/action
qualifiers or incomparable source families cannot be selected by a version guess.
This is the owner's requested latest-version view, with no extrapolation and no
change to observed records, findings, scores or paid acquisition.

### November 1 owner-requested week recovery

Carry the complete `retainedReports` receipt objects, including optional `artifacts` receipt references, into every subsequent build. Do not strip nested original-artifact ancestry when preparing opt-out inputs. The importer verifies result-event bundle/manifest hashes, exact manifest auxiliary objects and policy text before using source-bound counts. Recovered original-byte states use the same canonical sealed assessment source/version as the independently acquired earlier audit, while full persisted reports without original bytes remain a separate source. See `dashboard-week-recovery-2026-11-01.md`. No recurring full-report or original-S3 acquisition is enabled by this one-time recovery.

Forms after Accept uses definition `certscore.audit.forms-after-retained.v2`: only `retained` contributes to its headline. `limited` and `unavailable` remain distinct. Old published files are immutable. Zero eligible records display “No eligible data”; all unavailable measurements display “Unavailable” or “Not exported”; unassessed CMP checks and profile-omitted workers are explicitly labeled. Zero inventory hours means no complete attempt inventory, so the header says “Attempt inventory incomplete”. It does not mean no scans occurred.

The recovered month JSON may exceed the former 80 MB local-file cap. The preparer and publisher permit at most 160 MB for `dashboard.json`; original artifact/object, query, archive-export and other output limits remain unchanged. This changes only bounded local-file handling, with no recurring infrastructure increment.


## Paired GPC evidence statistics — November 2

Owner-approved additive definition `certscore.audit.gpc-paired.v1` consumes only
already-returned, hash-verified public exports. Validate the activity schema,
scan ID and both original source references. Count independently bound CMP-state
packet availability without requiring CMP readiness for behavioral facts. Add behavioral-pair availability, verified
window-duration buckets, classified advertising/analytics request counts on
both sides, and optional retained successful-collection/identifier samples,
identifier scope and cap state. Validate the optional collection packet against
the original pair and authoritative bounded GPC rows. A bad optional collection
packet must not erase an independently valid request comparison.

Missing legacy packets stay unavailable. Preserve unknown/unbound records in
denominators; never fetch raw worker bundles or reconstruct historical packets.
Request quantities use separate policy/window series. Collection quantities are
bounded samples, never complete collection inventories; zero is not absence.
Independently record full-visit GPC advertising collection, classified requests,
request coverage and the retained horizon relative to its own document commit.
These facts survive a missing pair; early-window zero must not hide later
positive collection. Keep qualification/coverage series separate. CMP readability
is supporting context and does not gate behavioral statistics.
Different independent visits do not establish causation, honoring or legal
compliance. The same query, schedule, model, project, budget and audit window
remain unchanged. Run the new audit-progress-gpc tests with existing audit tests,
review source pins, and activate the reviewed candidate only after local checks.
No audit checkpoint, latest snapshot or historical output is rewritten here.


## GPC and opt-out measurement correction — November 5

The owner authorized missing dashboard measures, clearer labels and future daily
collection without changing capture budgets. This section supersedes the
control-only daily extract restriction. On November 6 the owner approved
`certscore.audit-choice-summary.v2` for new daily exports and intake.
The fixed projection adds execution and confirmation evidence, the bound
packet hash, and conditional dispatch from the same persisted generation.
Historical v1 receipts retain their original source and coverage. Check the
active source pins before submitting the ECS task.
Use the exact-ID cache tool's `--plan-pending` mode against the prior verified
manifest and the new month window. Copy its `pendingRefreshIds` into
`begin.json`. It prioritizes least recently checked entries and targets up to
100 in the existing SELECT. Deferred in-window entries keep their original
selection receipts and last check date, even when the recent overlap returns
the ID. They receive no archive lookup and remain ID-only gaps. The cache
records the targeted, actually rechecked, deferred and aged-out counts.
The existing one bounded SELECT now also returns at most 8,192 bytes per row of
persisted broader opt-out assessment, scope, configured enablement, returned
opt-out action summary and exact canonical GPC/opt-out IDs with surfaced state.
No policy excerpts, request payloads, cookies, raw worker packets or new findings
are collected. Preserve the existing eight-day/5,000-row/45-second query limits,
32 MB extract cap and 64-receipt history cap. Oversized summaries stay unavailable.

The optional `priorityEvidence` section in v2 carries compact terminal
Accept/Reject and paired GPC/CMP facts from the same ready report generation.
Terminal rows require a completed click and recheck the authorized control,
decision and capture times. Paired snapshots recheck independent source hashes,
scope and section version before displaying sale and sharing transitions.
These rows use separate audit IDs and preserve public evidence. If the combined
summary exceeds 8,192 bytes, the query retains the existing v2 summary and
omits the optional section. Missing original facts remain unavailable.

Historical `operationsEvidence` uses compact states retained in its original
choice summary. Current queries carry the persisted producer provenance in a
separate required `policyReceipt` column capped at 512 bytes. This keeps it
available when the choice summary exceeds its own cap. The producer matches the policy projection's scan and
original bundle SHA-256/size to the unique verified result event. Candidate
fetch states cover only the returned, target-relevant candidates. Ownership and
document role are producer declarations; they do not establish independent
governing-policy attribution. Text receipt states preserve complete and limited
producer verification separately from `sealed.policy_full_text`, which still
requires the original text bytes and their verified ancestry. The query never
returns policy text, URLs, entity names or worker packets. The CMP coordinator
series distinguishes an explicit joined result from a limited attempt. A flag,
missing receipt, or recognized CMP does not establish worker dispatch; original
profile omissions keep their existing sealed series. Report missing receipt
coverage by date and source version. Under the choice summary's 8,192-byte cap,
keep the v2 core first, then the Accept/Reject and paired GPC/CMP section.
The importer checks the private receipt schema, scan/time, original creator and
ready generation/source binding before reading the producer states. The optional
transfer-framework code in that same receipt records the existing bounded matcher
on verified target-controller policy text. A completed check covers the retained
supported policy scope. Keep qualifying partial-coverage signals, matcher bounds,
inconclusive scope, explicit not assessed and historical unknown separate from
the conditional report finding. The assessment does not enter scoring. Historical gaps stay
unavailable. No extra task, archive read or cloud retention is needed.

The ECS launch override has a separate 8,192-byte limit. Pack each pending UUID
as its exact 16 bytes, resolve origin once for the union of overlap and pending
IDs, and transport the priority facts as fixed scalar tuples. Keep support for
older structured priority receipts. Record the exact launch sizes and policy
receipt transport in delta-query-transport.json. The November 9 owner-authorized
same-document control assessment requires the exact control-accessibility row
and its optional generation-bound compact coverage receipt alongside policy,
privacy/form and required v2 fields and every planned UUID. Only existing
optional operations evidence may be omitted. The daily pending planner selects
at most 60 IDs and preserves all deferred IDs and ancestry. A detailed receipt
records status, reason mask and counts for retained/completed/issue/review controls.
Group its version and coverage reasons separately; missing historical receipts
remain unknown. No keyboard, child-frame, closed-shadow or unopened-panel
coverage is inferred from a completed main-document automated assessment.
Fail before the AWS task if the required payload does not fit. Apply existing
verified local policy receipts under their original source bindings.

`sealed.opt_out.*` distinguishes summary coverage, broad presence/basis/scope,
signal kind/scope, policy methods, configured enablement, retained worker outcome,
evidence availability, recipe, action, submission, registration, observation,
effectiveness and limitations. Configuration is not dispatch proof. No packet is
not failure. Broader presence is not first-layer control presence. Unretained
worker outcomes remain unavailable; no runtime instrumentation is introduced.

The effective opt-out dispatch row reads the existing verified original
manifest and bundle, or the compact result verification receipt carried by the
same persisted projection. A presence-only profile establishes exclusion. A
valid opt-out lane outcome records dispatch; simultaneous exclusion and lane
proof are a conflict. Missing proof stays unavailable, even if enablement is
configured. The validation worker derives the receipt from bytes it already
checks. The daily SELECT returns the dispatch enum and bounded conditional
decision from one result event, within the same summary cap. Keep old summaries
readable and never backfill dispatch from
the currently deployed profile. The browser and source gates verify this row.
Incremental processing and metadata are estimated below $0.05/month at
100,000 scans; no extra queries, object reads, or browser capture are added.
For the daily v2 projection, reserve up to another $0.10/month for processing
and log volume inside the existing $5/month audit allowance. The same single
query and byte, row, and time limits apply.
`sealed.choice_finding.*` counts exact persisted canonical records separately
from public finding lists. A neutral GPC result is not a risk/failure count.
Only a complete retained canonical subset supports not_returned for an exact ID.
Keep full-report and compact-extract provenance in separate comparison series.

GPC public evidence additionally records CMP receipt, semantic-readiness reason
and checkpoint, independently bound paired sale/sharing settings, baseline
advertising opportunity, both-zero pairs, early-zero/full-visit positives,
request sample cap, supported/unresolved activity-role counts, processing-context
counts and distinct retained recipients. Processing counts may overlap role
counts and are not new legal qualification. Quantities preserve request-window,
qualification, resolver and coverage boundaries. Mixed measured totals display
**Separate measurement groups**, with source values available below, rather than
Unavailable. The returned CMP-provider filter applies to tables, charts and CSVs.

`prepare-audit-opt-out-inputs.ts` rejects a current inventory without the summary
version or a completed row without its summary. Legacy sources remain readable
and are carried forward. Local full retained reports can supply the same summary;
missing historical fields are never reconstructed or retrieved through new scans.
Every daily summary reports per-date new-summary coverage, latest original
retained-report date, missing data and source limits.

Run the focused GPC, choice, opt-out, extraction, table, contract and acquisition
tests, strict tooling types, and file-only browser checks. The data gate re-reads
hash-verified original exports and generation-matched persisted summaries,
recomputes GPC/choice rows and reconciles every aggregate/CSV. Its `choiceEvidence`
check is mandatory at publication. Do not silently update pins during daily runs.

Current local implementation/replay adds $0 AWS spend. Extra bounded processing
and compressed transport in the existing daily query is conservatively estimated
below $0.10/month, pre-approved below $1 and inside the existing $5 allowance;
the existing v2 reserve covers the compact operations fields; the current
planning total remains $1.13 per 31 days. No extra recurring query, capture, model/API call,
paid retention, service or capacity is added. Schedule/model/project, production
configuration and protected checkpoint/issue/release/model ledgers stay unchanged.

The local builder, reader and publisher share limits of 320,000,000 bytes for
dashboard.json and 100,000,000 bytes for dashboard.html. The November 8 snapshot
used 199,343,667 bytes under the previous 200,000,000-byte JSON cap. The new JSON
limit provides bounded local headroom for the same rolling window and complete
evidence lineage. Incremental recurring infrastructure cost is $0.

## Scoped paired CMP states — November 5

New `certscore.gpc-cmp-state-comparison.v2` packets explicitly describe
`main_document` snapshots. Historical v1 retains its full-context requirements.
Record `detail.gpc.paired_cmp_scope` independently of availability. Separate v2
availability and sale/sharing transition series by contract and scope; never
merge their trend rates into historical full-context series. Missing or invalid
packets stay unavailable or invalid, never a pass. A ready current state is not
proof of persistence, downstream enforcement, GPC causation or compliance.

The scanner now takes its sole paired signal read after already-required page
inventory and before the existing cookie read; both semantic snapshots use the
terminal passive checkpoint. Fixed request horizons remain 250/500/1000/3000/5000
ms. Show the verified shared horizon and each semantic timestamp separately.
Do not imply that all scans now observe five seconds. Existing caps, scoring,
source verification and historical evidence remain unchanged. This is a local
implementation; audit actual producer artifacts, not assumed deployment state.

Verification and authorization receipt:
`outputs/gpc-timing-cmp-2026-11-05/README.md`.


## Forward-looking gap triage — November 6 owner direction

Review new eligible scans only; historical backfill is not requested. For every
potential gap, answer these questions in order:

1. **Utility:** Which concrete audit question or decision does this item support?
   Link its v2 canonical record/field, scope, applicable population and consumer.
   Distinguish independent information from a duplicate label, receipt or display
   variant. Missing values do not themselves make a useful item unnecessary.
2. **Disposition:** Keep a distinct useful item; normalize genuinely equivalent
   representations under one canonical item; or remove an obsolete/no-utility
   row from the current audit. Do not add a hidden-row toggle. Do not destroy
   historical evidence or merge different windows, sources or denominators.
3. **Resolution for future scans:** Trace capture, persistence, bounded summary
   or export, audit mapping and display. Identify the failing stage using exact
   source/schema/generation bindings. Prefer wiring already-retained evidence or
   fixing a local mapping over new capture. Define an offline test and a measurable
   acceptance criterion for new eligible scans, with explicit non-applicability.
4. **Action and limits:** Complete authorized local fixes and tests. Record the
   remaining producer/release/acquisition dependency, cost and expected benefit.
   Deployment, new acquisition, extra queries and capture/budget expansion remain
   on hold. Ask for guidance only for a real unresolved product choice or an action
   outside existing authorization; never invent evidence to close a badge.

Required review outcomes: keep / normalize / remove, utility statement, canonical
binding, eligibility, missing stage (or unresolved cause), proposed fix, validation,
forward coverage by date/source/version, and remaining authorization dependencies.
A useful observation may legitimately be unavailable; the acceptance condition is
truthful supported evidence or an explicit reason, not 100% successful outcomes.

Current priorities and utility:

- Accept/Reject terminal verification: **keep**. It answers whether the matching
  choice was still verified at the terminal checkpoint, independently of click
  completion and initial registration. Use only the authorized completed-action
  population and exact control/action/time/source witness. Preserve unavailable,
  unverified and verified separately.
- Paired GPC/CMP snapshots and transitions: **keep**. They show the independently
  observed settings in each arm and any descriptive difference. Preserve both
  checkpoint times, scopes, delivery and source bindings. They do not establish
  GPC causation or downstream effectiveness. Do not infer a transition from one
  snapshot or equate inapplicability with failed capture.
- Exact CMP banner/Reject/privacy-link display criteria: **normalize** into the
  already-existing consent-surface, first-layer Reject and privacy-notice evidence.
  Source review of cmp-audit-projection.ts confirms these report rows are derived
  presentation. They are no longer standalone audit acquisition gaps. Keep report
  fields and original scopes; no exact display-value parity is asserted.
- California review plus coverage, three distinct disclosure families, passive
  field semantic categories and destination relationships: **keep**, grouped under
  their canonical records. Existing receipt readers are validated locally; their
  ongoing future delivery still needs compatible source receipts. No extra full-file
  download or broader query is authorized to close that delivery dependency.
- Field input type, required and disabled/readOnly: **record context**, with existing
  values preserved. Remove independent daily gap-closure priorities, without
  merging the flags or treating inferred categories as HTML input types.

Local forward hardening now shares one compact scalar projection between full
persisted-report replay and the existing v2 query. Priority delivery diagnostics
separate source_missing, no_completed_click, eligibility_unknown, included,
summary_size_bound and invalid/unbound evidence. These are not action outcomes.
Historical summaries lacking coverage metadata stay unavailable. Local full-report
replay does not produce query-delivery counts. Current completed query rows must
include valid diagnostic metadata, a compact size-bound hint, or core size_bound.
If even the hint cannot fit, preserve the core unchanged and leave diagnostics
unavailable; the current-query guard checks this exact near-cap exception.
Optional metadata must never evict otherwise fitting core evidence.

Priority content is retained before optional operations under the unchanged
8,192-byte row cap. The query builder compacts only whitespace outside SQL quoted
literals/identifiers. The 100-ID high-entropy envelope test remains below 8,192
bytes; runtime preflight still fails closed if actual configuration cannot fit.
Eight days, 5,000 rows, 45 seconds, one task and all pending-export continuity
remain unchanged. No production/AWS query is run by the offline builder or tests.

Report/full source receipts must match the current row's scan, timestamp,
original creator, generation and source hash before supplying audit values.
Changed binding is an integrity error, not a comparable or recovered value.

Offline producer-fixture flow, adversarial binding, missing-eligibility and
size-bound cases verify the local path. Production new-scan verification is still
pending authorization to acquire the next data. No deployment, new acquisition,
raw bundle download, scan, action or historical report rewrite is authorized.
Added bounded diagnostic transport is estimated below $0.01/month inside the
existing v2 reserve and unchanged $1.13/31-day planning total. Current work costs $0.

The four baseline/GPC sale/sharing scalar audit rows now use the same strict paired
packet reader as transitions. Public export and persisted-summary series stay
separate, with unavailable values for missing/unbound pairs. No new query fields,
capture or acquisition are needed for these mappings. Verify with audit-forward-gap.test.ts.
